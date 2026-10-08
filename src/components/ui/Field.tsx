import { cn } from '@/lib/cn'

const CONTROL =
  'h-10 w-full rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-3 text-sm text-strong placeholder:text-faint focus:border-brand-500 focus:outline-none disabled:opacity-60'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-strong"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-critical-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-faint">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-critical-600 dark:text-critical-500">{error}</p>
      )}
    </div>
  )
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL, 'h-auto min-h-[76px] py-2', className)}
      {...props}
    />
  )
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'pr-8', className)} {...props}>
      {children}
    </select>
  )
}
