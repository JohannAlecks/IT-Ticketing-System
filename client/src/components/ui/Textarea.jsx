import { useId } from 'react';
export default function Textarea({ label, error, helperText, className = '', id, 'aria-describedby': describedBy, ...props }) {
  const generated = useId(); id = id || generated;
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex gap-1 text-sm font-medium text-gray-700"><label htmlFor={id}>{label}</label>{props.required && <span aria-hidden="true">*</span>}</div>
      )}
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={[describedBy, helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} className={`input min-h-[100px] resize-y ${error ? 'border-red-400 focus:ring-red-400' : ''} ${className}`} {...props} />
      {helperText && <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
