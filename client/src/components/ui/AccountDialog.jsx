import { useEffect, useId, useRef } from 'react';
import Button from './Button';
// Native modal dialog supplies focus containment, inert background and Escape.
export default function AccountDialog({ title, onClose, busy = false, children }) {
  const ref = useRef(null); const label = useId();
  useEffect(() => { const prior = document.activeElement; ref.current?.showModal?.(); return () => { ref.current?.close?.(); if (prior?.isConnected) prior.focus?.(); }; }, []);
  return <dialog ref={ref} open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined} aria-labelledby={label} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} className="account-dialog m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id={label} className="text-lg font-semibold">{title}</h2><Button variant="secondary" size="sm" disabled={busy} onClick={onClose} aria-label={`Close ${title}`}>Close</Button></div>{children}
  </dialog>;
}
