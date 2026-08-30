const VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700 hover:shadow-md',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  isLoading = false,
  children,
  disabled,
  ...props
}) {
  return (
    <button
      className={`btn ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
