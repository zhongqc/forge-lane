import { useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { ErrorNotice, Modal } from './ui';

async function croppedFile(source: string, area: Area): Promise<File> {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法处理图片，请更换浏览器重试');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 256, 256);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('裁切失败，请重试'))),
      'image/webp',
      0.9,
    );
  });
  return new File([blob], 'avatar.webp', { type: blob.type });
}

export function AvatarCropDialog({
  source,
  onClose,
  onSave,
  onReselect,
  selectionError,
}: {
  source: string;
  selectionError?: unknown;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
  onReselect: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [percent, setPercent] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function save() {
    if (!area || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSave(await croppedFile(source, area));
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="调整头像"
    >
      <p className="avatar-crop-help">拖动图片调整位置，滚轮或滑杆缩放。</p>
      <div className="avatar-crop-stage" inert={busy}>
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropAreaChange={(percentage, pixels) => {
            setPercent(percentage);
            setArea(pixels);
          }}
          cropperProps={{ 'aria-label': '拖动调整头像位置' }}
          mediaProps={{
            onError: () => {
              setArea(null);
              setError(new Error('无法读取图片，请重新选择'));
            },
          }}
        />
      </div>
      <label className="avatar-crop-zoom">
        缩放
        <input
          aria-label="头像缩放"
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          disabled={busy}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
        <span>{Math.round(zoom * 100)}%</span>
      </label>
      <div className="avatar-crop-preview-row">
        <span>预览</span>
        {[64, 32].map((size) => (
          <span className="avatar-crop-preview" key={size} style={{ width: size, height: size }}>
            {percent && (
              <img
                src={source}
                alt={`${size}像素头像预览`}
                style={{
                  width: `${10000 / percent.width}%`,
                  height: `${10000 / percent.height}%`,
                  left: `${(-100 * percent.x) / percent.width}%`,
                  top: `${(-100 * percent.y) / percent.height}%`,
                }}
              />
            )}
          </span>
        ))}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setCrop({ x: 0, y: 0 });
            setZoom(1);
          }}
        >
          重置位置
        </button>
      </div>
      <ErrorNotice error={error || selectionError} />
      <footer className="modal-footer avatar-crop-footer">
        <button className="text-button" disabled={busy} onClick={onReselect}>
          重新选图
        </button>
        <button className="secondary" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button className="primary" disabled={busy || !area} onClick={() => void save()}>
          {busy ? '正在上传…' : '确认并上传'}
        </button>
      </footer>
    </Modal>
  );
}
