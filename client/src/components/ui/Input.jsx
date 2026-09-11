import { useId } from 'react';
export default function Input({ label, error, helperText, className = '', id, ...props }) {
  const generated = useId(); id = id || generated;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={error || helperText ? `${id}-help` : undefined} className={`input ${error ? 'border-red-400 focus:ring-red-400' : ''} ${className}`} {...props} />
      {(error || helperText) && <p id={`${id}-help`} role={error ? 'alert' : undefined} className={`mt-1 text-xs ${error ? 'text-red-600' : 'text-slate-500'}`}>{error || helperText}</p>}
    </div>
  );
}
