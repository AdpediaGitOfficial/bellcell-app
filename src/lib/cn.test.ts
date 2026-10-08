import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('lets a caller override a base utility in the same group', () => {
    // The bug this guards: base `w-full` beat the caller's `w-auto`, so the
    // filter-bar selects rendered stacked at full width.
    expect(cn('h-10 w-full rounded-lg', 'h-9 w-auto')).toBe('rounded-lg h-9 w-auto')
  })

  it('keeps non-conflicting classes from both sides', () => {
    expect(cn('px-3 text-sm', 'font-medium')).toContain('px-3')
    expect(cn('px-3 text-sm', 'font-medium')).toContain('font-medium')
  })

  it('handles conditional and falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c')
  })
})
