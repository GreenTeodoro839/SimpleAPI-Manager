import { X } from 'lucide-react';

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info';

interface NoticeProps {
  tone?: NoticeTone;
  message: string;
  onClose?: () => void;
}

export function Notice({ tone = 'info', message, onClose }: NoticeProps) {
  if (!message) return null;
  return (
    <div className={`notice notice-${tone}`} role="status">
      <span>{message}</span>
      {onClose && (
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
