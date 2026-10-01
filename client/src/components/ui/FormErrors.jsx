import { useEffect, useRef } from 'react';
// Render within the submitting form. Field errors remain descriptions, while
// this one summary receives focus only when a submit attempt yields errors.
export default function FormErrors({ errors = {}, fields = {} }) {
  const ref = useRef(null); const entries = Object.entries(errors).filter(([, value]) => typeof value === 'string' && value);
  useEffect(() => { if (entries.length) ref.current?.focus(); }, [errors]);
  if (!entries.length) return null;
  return <div ref={ref} role="region" tabIndex={-1} className="rounded-xl border border-red-600 p-3 text-sm text-red-700" aria-label="Please correct the form errors">
    <p className="font-semibold">Please correct the following:</p><ul className="list-disc pl-5">{entries.map(([field, message]) => <li key={field}>{fields[field] ? <a className="underline" href={`#${fields[field]}`} onClick={(e) => { e.preventDefault(); document.getElementById(fields[field])?.focus(); }}>{message}</a> : message}</li>)}</ul>
  </div>;
}
