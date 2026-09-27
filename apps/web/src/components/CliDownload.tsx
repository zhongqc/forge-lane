import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from './ui';

interface CliManifest {
  version: string;
  files: { target: string; label: string; name: string; executable: string; size: number; sha256: string }[];
}

export function CliDownload() {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<CliManifest | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}downloads/manifest.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('CLI 尚未发布');
        return (await response.json()) as CliManifest;
      })
      .then((data) => {
        setManifest(data);
        setError(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(true);
      });
    return () => controller.abort();
  }, [open]);
  return (
    <>
      <button className="cli-download-trigger" onClick={() => setOpen(true)}>
        <Download size={15} /> 下载 CLI
      </button>
      <Modal open={open} onOpenChange={setOpen} title="下载 Forge CLI">
        <div className="cli-download-dialog">
          {manifest ? (
            <>
              <p>选择适合系统的压缩包，解压后即可使用，无需安装 Node.js。当前版本：{manifest.version}</p>
              <div className="cli-download-list">
                {manifest.files.map((file) => (
                  <div className="cli-download-file" key={file.name}>
                    <a href={`${import.meta.env.BASE_URL}downloads/${file.name}`} download={file.name}>
                      <Download size={15} /> {file.label}
                    </a>
                    <small>SHA-256：{file.sha256}</small>
                  </div>
                ))}
              </div>
              <p className="muted">解压后赋予执行权限（macOS/Linux），运行可执行文件的 --help 查看命令。</p>
            </>
          ) : error ? (
            <p>CLI 下载文件暂不可用，请稍后再试。</p>
          ) : (
            <p>正在读取可下载版本…</p>
          )}
        </div>
      </Modal>
    </>
  );
}
