export default function Spinner({ className = '', label }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`} role={label ? 'status' : undefined} aria-label={label}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
