import { useEffect, useRef } from 'react';
import Button from './Button';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', danger, onConfirm, onCancel, isLoading }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" tabIndex={-1} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h3 id="confirm-dialog-title" className="text-sm font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-2 whitespace-pre-line text-sm text-gray-500">{description}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" size="sm" disabled={isLoading} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" isLoading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
