import { describe, expect, it } from 'vitest'
import {
  accountChangeBlockedReason,
  assignableRoles,
  canAssignRole,
  deactivationBlockedReason,
  generateTemporaryPassword,
  rankOf,
} from './roles'
import { passwordIssues } from '@/lib/auth/password'

describe('assignableRoles', () => {
  it('lets a SUPER_ADMIN grant anything, including another SUPER_ADMIN', () => {
    expect(assignableRoles('SUPER_ADMIN')).toContain('SUPER_ADMIN')
    expect(assignableRoles('SUPER_ADMIN')).toHaveLength(6)
  })

  it('stops an ADMIN minting a SUPER_ADMIN or another ADMIN', () => {
    // Otherwise an admin escalates past the matrix via a second account.
    const roles = assignableRoles('ADMIN')
    expect(roles).not.toContain('SUPER_ADMIN')
    expect(roles).not.toContain('ADMIN')
    expect(roles).toEqual(['ACCOUNTANT', 'COUNSELLOR', 'FACULTY', 'STAFF'])
  })

  it('gives a STAFF member nothing to grant', () => {
    expect(assignableRoles('STAFF')).toEqual([])
  })

  it('never lets anyone grant their own level', () => {
    for (const role of ['ADMIN', 'ACCOUNTANT', 'COUNSELLOR', 'FACULTY', 'STAFF'] as const) {
      expect(canAssignRole(role, role)).toBe(false)
    }
  })

  it('ranks SUPER_ADMIN highest', () => {
    expect(rankOf('SUPER_ADMIN')).toBeLessThan(rankOf('ADMIN'))
    expect(rankOf('ADMIN')).toBeLessThan(rankOf('STAFF'))
  })
})

describe('accountChangeBlockedReason', () => {
  const base = {
    actorId: 'a',
    actorRole: 'ADMIN' as const,
    targetUserId: 'b',
    targetRole: 'STAFF' as const,
    activeSuperAdminCount: 2,
  }

  it('allows an admin to manage a junior account', () => {
    expect(accountChangeBlockedReason(base)).toBeNull()
  })

  it('refuses self-modification', () => {
    // Otherwise someone locks themselves out, or quietly promotes themselves.
    expect(
      accountChangeBlockedReason({ ...base, targetUserId: 'a' }),
    ).toMatch(/your own access/)
  })

  it('refuses an admin touching a peer or a super admin', () => {
    expect(
      accountChangeBlockedReason({ ...base, targetRole: 'ADMIN' }),
    ).toMatch(/Only a Super Admin/)
    expect(
      accountChangeBlockedReason({ ...base, targetRole: 'SUPER_ADMIN' }),
    ).toMatch(/Only a Super Admin/)
  })

  it('lets a super admin manage anyone but themselves', () => {
    const sa = { ...base, actorRole: 'SUPER_ADMIN' as const }
    expect(accountChangeBlockedReason({ ...sa, targetRole: 'ADMIN' })).toBeNull()
    expect(accountChangeBlockedReason({ ...sa, targetRole: 'SUPER_ADMIN' })).toBeNull()
    expect(accountChangeBlockedReason({ ...sa, targetUserId: 'a' })).toMatch(/your own access/)
  })
})

describe('deactivationBlockedReason', () => {
  const sa = {
    actorId: 'a',
    actorRole: 'SUPER_ADMIN' as const,
    targetUserId: 'b',
    targetRole: 'SUPER_ADMIN' as const,
    activeSuperAdminCount: 2,
  }

  it('allows deactivating a super admin while another remains', () => {
    expect(deactivationBlockedReason(sa)).toBeNull()
  })

  it('refuses deactivating the LAST super admin', () => {
    // This would lock everyone out of user administration for good.
    expect(
      deactivationBlockedReason({ ...sa, activeSuperAdminCount: 1 }),
    ).toMatch(/last active Super Admin/)
  })

  it('still applies the ordinary change guards first', () => {
    expect(
      deactivationBlockedReason({ ...sa, targetUserId: 'a', activeSuperAdminCount: 5 }),
    ).toMatch(/your own access/)
  })

  it('does not block deactivating a non-super account when only one super exists', () => {
    expect(
      deactivationBlockedReason({ ...sa, targetRole: 'STAFF', activeSuperAdminCount: 1 }),
    ).toBeNull()
  })
})

describe('generateTemporaryPassword', () => {
  /** Deterministic bytes, so the test does not depend on randomness. */
  const bytesFrom = (seed: number) => (n: number) =>
    Uint8Array.from({ length: n }, (_, i) => (seed + i * 37) % 256)

  it('always satisfies the password policy', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const pw = generateTemporaryPassword(bytesFrom(seed))
      expect(passwordIssues(pw)).toEqual([])
    }
  })

  it('is twelve characters', () => {
    expect(generateTemporaryPassword(bytesFrom(7))).toHaveLength(12)
  })

  it('avoids characters misread on paper', () => {
    // These passwords get written down and handed over.
    for (let seed = 0; seed < 50; seed += 1) {
      const pw = generateTemporaryPassword(bytesFrom(seed))
      expect(pw).not.toMatch(/[IOl01]/)
    }
  })

  it('varies with the random source', () => {
    expect(generateTemporaryPassword(bytesFrom(1))).not.toBe(
      generateTemporaryPassword(bytesFrom(2)),
    )
  })
})
