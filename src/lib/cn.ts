import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones
 * in the SAME group.
 *
 * Plain clsx concatenates, so a component's base `w-full` and a caller's
 * `w-auto` both survive and the stylesheet's order decides — which is how the
 * filter-bar selects ended up full-width and stacked. twMerge resolves the
 * conflict in favour of the caller, which is what every component here
 * assumes when it accepts a `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
