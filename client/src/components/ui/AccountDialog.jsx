import { useEffect, useId, useRef } from 'react';
import Button from './Button';
// Native modal dialog supplies focus containment, inert background and Escape.
export default function AccountDialog({ title, description, onClose, busy = false, children, role = 'dialog' }) {
  const ref = useRef(null); const label = useId();
  const trapTab = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length && !element.closest('[inert], [hidden]'));
    const first = controls[0]; const last = controls.at(-1);
    if (!first) { event.preventDefault(); ref.current.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  useEffect(() => {
    const prior = document.activeElement; const dialog = ref.current; const route = window.location.pathname;
    const identity = document.getElementById('main-content')?.dataset.identity;
    dialog?.showModal?.(); dialog?.querySelector('button')?.focus();
    return () => { dialog?.close?.(); queueMicrotask(() => {
      if (route === window.location.pathname && identity === document.getElementById('main-content')?.dataset.identity && prior?.isConnected && !prior.closest('[inert], [hidden]')) prior.focus?.();
    }); };
  }, []);
  return <dialog ref={ref} role={role} tabIndex={-1} onKeyDown={trapTab} open={typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ? true : undefined} aria-labelledby={label} aria-describedby={description ? `${label}-description` : undefined} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} className="account-dialog m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id={label} className="text-lg font-semibold">{title}</h2><Button variant="secondary" size="sm" disabled={busy} onClick={onClose} aria-label={`Close ${title}`}>Close</Button></div>{description && <p id={`${label}-description`} className="mb-4 whitespace-pre-line text-sm text-slate-600">{description}</p>}{children}
  </dialog>;
}
