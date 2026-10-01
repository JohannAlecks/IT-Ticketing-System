import { useId } from 'react';

export default function Select({ label, error, helperText, className = '', id, children, 'aria-describedby': describedBy, ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex gap-1 text-sm font-medium text-gray-700"><label htmlFor={controlId}>{label}</label>{props.required && <span aria-hidden="true">*</span>}</div>
      )}
      <select id={controlId} aria-invalid={error ? true : undefined} aria-describedby={[describedBy, helperText && `${controlId}-help`, error && `${controlId}-error`].filter(Boolean).join(' ') || undefined} className={`input bg-white ${className}`} {...props}>
        {children}
      </select>
      {helperText && <p id={`${controlId}-help`} className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {error && <p id={`${controlId}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
