import AccountDialog from './AccountDialog';
import Button from './Button';

export default function ConfirmDialog({ open, title, description, error, confirmLabel = 'Confirm', danger, onConfirm, onCancel, isLoading }) {
  if (!open) return null;

  return (
    <AccountDialog title={title} description={description} onClose={onCancel} busy={isLoading}>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="sm" disabled={isLoading} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" isLoading={isLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
    </AccountDialog>
  );
}
