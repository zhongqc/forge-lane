import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../../../../packages/contracts/src/index';
const bridge: DesktopBridge = {
  snapshot: () => ipcRenderer.invoke('forge:snapshot'),
  saveSettings: (input) => ipcRenderer.invoke('forge:saveSettings', input),
  importProject: (input) => ipcRenderer.invoke('forge:importProject', input),
  checkEnvironment: () => ipcRenderer.invoke('forge:checkEnvironment'),
  chooseRepository: () => ipcRenderer.invoke('forge:chooseRepository'),
  chooseExecutable: () => ipcRenderer.invoke('forge:chooseExecutable'),
};
contextBridge.exposeInMainWorld('forge', bridge);
