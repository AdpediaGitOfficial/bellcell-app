import { describe, expect, it } from 'vitest'
import { assertCan, can, canView, ForbiddenError } from './can'

describe('can', () => {
  it('lets a SUPER_ADMIN do anything', () => {
    const p = { role: 'SUPER_ADMIN' as const }
    expect(can(p, 'accounts.dayBook', 'export')).toBe(true)
    expect(can(p, 'settings.user', 'delete')).toBe(true)
  })

  it('separates duties: a counsellor cannot touch money', () => {
    const p = { role: 'COUNSELLOR' as const }
    expect(can(p, 'enquiry.lead', 'create')).toBe(true)
    expect(can(p, 'admission.fee', 'view')).toBe(true)
    // can see dues, cannot collect or alter them
    expect(can(p, 'admission.fee', 'create')).toBe(false)
    expect(can(p, 'accounts.dailyTransaction', 'view')).toBe(false)
  })

  it('separates duties: an accountant cannot edit academic records', () => {
    const p = { role: 'ACCOUNTANT' as const }
    expect(can(p, 'admission.fee', 'create')).toBe(true)
    expect(can(p, 'admission.application', 'view')).toBe(true)
    expect(can(p, 'admission.application', 'update')).toBe(false)
    expect(can(p, 'exam.result', 'update')).toBe(false)
  })

  it('reserves concession approval to admins', () => {
    expect(can({ role: 'ACCOUNTANT' }, 'admission.concession', 'create')).toBe(true)
    expect(can({ role: 'ACCOUNTANT' }, 'admission.concession', 'approve')).toBe(false)
    expect(can({ role: 'ADMIN' }, 'admission.concession', 'approve')).toBe(true)
  })

  it('denies anything not granted, rather than defaulting open', () => {
    expect(can({ role: 'STAFF' }, 'accounts.dayBook', 'view')).toBe(false)
    expect(can({ role: 'FACULTY' }, 'settings.user', 'view')).toBe(false)
  })

  it('treats export as a distinct action from view', () => {
    expect(can({ role: 'STAFF' }, 'reports', 'view')).toBe(true)
    expect(can({ role: 'STAFF' }, 'reports', 'export')).toBe(false)
  })
})

describe('overrides', () => {
  it('grants an explicit exception', () => {
    const p = {
      role: 'STAFF' as const,
      overrides: { 'accounts.dayBook:view': true },
    }
    expect(can(p, 'accounts.dayBook', 'view')).toBe(true)
  })

  it('lets an explicit deny beat even SUPER_ADMIN', () => {
    const p = {
      role: 'SUPER_ADMIN' as const,
      overrides: { 'settings.user:delete': false },
    }
    expect(can(p, 'settings.user', 'delete')).toBe(false)
    expect(can(p, 'settings.user', 'update')).toBe(true)
  })
})

describe('canView / assertCan', () => {
  it('canView drives nav filtering', () => {
    expect(canView({ role: 'COUNSELLOR' }, 'enquiry.lead')).toBe(true)
    expect(canView({ role: 'COUNSELLOR' }, 'accounts.dayBook')).toBe(false)
  })

  it('assertCan throws ForbiddenError for a denied action', () => {
    expect(() => assertCan({ role: 'STAFF' }, 'accounts.dayBook', 'view')).toThrow(
      ForbiddenError,
    )
    expect(() => assertCan({ role: 'ADMIN' }, 'accounts.dayBook', 'view')).not.toThrow()
  })
})

describe('payroll separation of duties', () => {
  const accountant = { role: 'ACCOUNTANT' as const }
  const admin = { role: 'ADMIN' as const }
  const faculty = { role: 'FACULTY' as const }

  it('lets an accountant prepare a payroll run', () => {
    expect(can(accountant, 'people.payroll', 'create')).toBe(true)
    expect(can(accountant, 'people.payroll', 'update')).toBe(true)
  })

  it('does NOT let the same accountant approve it', () => {
    // Whoever works out what everyone is owed must not also release it.
    expect(can(accountant, 'people.payroll', 'approve')).toBe(false)
  })

  it('lets an administrator approve', () => {
    expect(can(admin, 'people.payroll', 'approve')).toBe(true)
  })

  it('keeps payroll away from teaching staff entirely', () => {
    expect(can(faculty, 'people.payroll', 'view')).toBe(false)
  })
})
