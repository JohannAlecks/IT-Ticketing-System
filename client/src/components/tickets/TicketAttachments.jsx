import { useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Upload, FileText } from 'lucide-react';
import {
  useAttachments,
  useUploadAttachment,
  useDeleteAttachment,
  validateFile,
  downloadAttachment,
} from '../../hooks/useAttachments';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../ui/Spinner';
import ErrorState from '../ui/ErrorState';
import Button from '../ui/Button';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatDateTime, formatFileSize } from '../../utils/format';

function canDelete(attachment, ticket, user, role) {
  if (role === 'ADMIN') return true;
  if (attachment.uploadedBy?.id === user?.id) return true;
  if (role === 'AGENT' && ticket.assignedTo?.id === user?.id) return true;
  return false;
}

export default function TicketAttachments({ ticket }) {
  const { user, role } = useAuth();
  const { data: attachments, isLoading, isError } = useAttachments(ticket.id);
  const uploadMutation = useUploadAttachment(ticket.id);
  const deleteMutation = useDeleteAttachment(ticket.id);
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setProgress(0);
    if (!file) {
      setSelectedFile(null);
      setClientError(null);
      return;
    }
    // Validate BEFORE the user can even attempt to submit — never let them
    // discover the error only after an upload round-trip.
    const error = validateFile(file);
    setClientError(error);
    setSelectedFile(file);
  };

  const handleUpload = () => {
    if (!selectedFile || clientError || uploadMutation.isPending) return; // guards against duplicate submits
    uploadMutation.mutate(
      {
        file: selectedFile,
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      },
      {
        onSuccess: () => {
          setSelectedFile(null);
          setProgress(0);
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
        onSettled: () => setProgress(0),
      }
    );
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate(pendingDeleteId, { onSettled: () => setPendingDeleteId(null) });
  };

  return (
    <div className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Paperclip className="h-4 w-4 text-gray-400" />
        Attachments {attachments ? `(${attachments.length})` : ''}
      </h3>

      {isLoading && <Spinner className="py-6" />}
      {isError && <ErrorState message="Couldn't load attachments." />}

      {attachments && attachments.length === 0 && (
        <p className="mb-4 text-sm text-gray-400">No attachments yet.</p>
      )}

      {attachments && attachments.length > 0 && (
        <ul className="mb-4 divide-y divide-gray-100">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100">
                  <FileText className="h-4 w-4 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{a.originalFileName}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(a.fileSize)} · Uploaded by {a.uploadedBy?.name} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-1">
                <button
                  onClick={() => downloadAttachment(ticket.id, a)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                {canDelete(a, ticket, user, role) && (
                  <button
                    onClick={() => setPendingDeleteId(a.id)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-gray-100 pt-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Add attachment</label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="block flex-1 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          <Button
            size="sm"
            disabled={!selectedFile || !!clientError}
            isLoading={uploadMutation.isPending}
            onClick={handleUpload}
          >
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
        </div>

        {selectedFile && !clientError && (
          <p className="mt-1.5 text-xs text-gray-500">
            {selectedFile.name} · {formatFileSize(selectedFile.size)}
          </p>
        )}
        {clientError && <p className="mt-1.5 text-xs text-red-600">{clientError}</p>}

        {uploadMutation.isPending && progress > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <p className="mt-2 text-xs text-gray-400">
          Max 5 MB. Supported: images, PDF, Word, Excel, TXT, CSV, ZIP.
        </p>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this attachment?"
        description="This file will be permanently removed from the ticket."
        confirmLabel="Delete"
        danger
        isLoading={deleteMutation.isPending}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
