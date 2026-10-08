import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

/**
 * NOTE: there is deliberately NO variant that puts white text on brand-500
 * (#00A59F). That combination measures 3.05:1 and fails WCAG AA. The filled
 * variant uses brand-700 (#007C77, 5.07:1). See docs/design-system.md §3.1.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50',
  secondary:
    'surface-card text-strong hover:bg-[rgb(var(--surface-hover))] border-[rgb(var(--border-strong))]',
  ghost:
    'text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong border-transparent',
  danger: 'bg-critical-600 text-white hover:bg-critical-700',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = 'primary', size = 'md', ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg border border-transparent font-medium',
          'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      />
    )
  },
)
