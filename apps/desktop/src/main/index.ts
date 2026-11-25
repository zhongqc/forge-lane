import { app, BrowserWindow, ipcMain, dialog, type IpcMainInvokeEvent } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpath } from 'node:fs/promises';
import { canonicalRendererURL, authorizeToolPaths } from './policy';
import { CoreHost } from './core-host';
import {
  errorReply,
  ForgeError,
  commandSchema,
  type Snapshot,
} from '../../../../packages/contracts/src/index';

app.setName('Forge Desktop');
const override = process.argv
  .find((arg) => arg.startsWith('--forge-data-dir='))
  ?.slice('--forge-data-dir='.length);
if (override) app.setPath('userData', resolve(override));
const dataDirectory = override ? resolve(override) : join(app.getPath('userData'), 'desktop-v1');
let window: BrowserWindow | null = null;
let core: CoreHost;
let quitting = false;
let quitRequested = false;
const selectedTools = new Set<string>();
function finishQuit() {
  if (quitting) return;
  quitting = true;
  void core.stop().finally(() => app.quit());
}
const rendererFile = join(__dirname, '../renderer/index.html');
const devURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererURL = canonicalRendererURL(devURL ?? pathToFileURL(rendererFile).href);
function trusted(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== rendererURL
  )
    throw new ForgeError('FORBIDDEN', '请求来源不受信任');
}
function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 580,
    title: 'Forge Desktop',
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on('will-prevent-unload', (event) => {
    const response = dialog.showMessageBoxSync(window!, {
      type: 'question',
      message: '有未保存内容，是否放弃并关闭？',
      buttons: ['返回编辑', '放弃并关闭'],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) event.preventDefault();
    else quitRequested = false;
  });
  window.on('closed', () => {
    window = null;
    if (quitRequested) finishQuit();
  });
  if (devURL) void window.loadURL(devURL);
  else void window.loadFile(rendererFile);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      window.restore();
      window.focus();
    } else if (app.isReady()) createWindow();
  });
  app
    .whenReady()
    .then(() => {
      core = new CoreHost(dataDirectory, app.getAppPath(), __dirname);
      void core.start().catch(() => undefined);
      for (const [channel, method] of Object.entries({
        snapshot: 'snapshot',
        saveSettings: 'settings.save',
        importProject: 'project.import',
        checkEnvironment: 'environment.check',
      })) {
        ipcMain.handle(`forge:${channel}`, async (event, input: unknown) => {
          try {
            trusted(event);
            const fields = input && typeof input === 'object' ? input : {};
            const command = commandSchema.parse({ ...fields, method });
            if (command.method === 'settings.save') {
              const saved = await core.request({ method: 'snapshot' });
              if (!saved.ok) return saved;
              for (const key of ['gitPath', 'ghPath', 'codexPath'] as const)
                if (command.values[key]) command.values[key] = await realpath(command.values[key]);
              const permitted = await authorizeToolPaths(
                (saved.data as Snapshot).settings.values,
                command.values,
                selectedTools,
                async (paths) => {
                  const choice = await dialog.showMessageBox(window!, {
                    type: 'warning',
                    message: '允许 Forge 使用这些本地工具？',
                    detail: paths.join('\n') + '\n后续检测会运行所选文件。请仅允许你信任的可执行文件。',
                    buttons: ['取消', '允许并保存'],
                    defaultId: 0,
                    cancelId: 0,
                  });
                  return choice.response === 1;
                },
              );
              if (!permitted) throw new ForgeError('TOOL_PATH_DENIED', '未授权新的工具路径，原设置已保留');
            }
            return await core.request(command);
          } catch (error) {
            return errorReply(error);
          }
        });
      }
      for (const [channel, directory] of [
        ['chooseRepository', true],
        ['chooseExecutable', false],
      ] as const) {
        ipcMain.handle(`forge:${channel}`, async (event) => {
          trusted(event);
          const result = await dialog.showOpenDialog(window!, {
            properties: directory ? ['openDirectory'] : ['openFile'],
          });
          if (result.canceled || !result.filePaths[0]) return null;
          const selected = await realpath(result.filePaths[0]);
          if (!directory) selectedTools.add(selected);
          return selected;
        });
      }
      createWindow();
    })
    .catch(() => app.quit());
  app.on('activate', () => {
    if (!window) createWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', (event) => {
    if (quitting || !core) return;
    event.preventDefault();
    quitRequested = true;
    if (window) window.close();
    else finishQuit();
  });
}
