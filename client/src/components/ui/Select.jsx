import { useId } from 'react';

export default function Select({ label, className = '', id, children, ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={controlId} className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select id={controlId} className={`input bg-white ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}
