import bcrypt from 'bcryptjs'

const ROUNDS = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Minimum policy. The vendor scope specified no password rules at all; this
 * is the floor for a system holding student PII and fee money.
 */
export function passwordIssues(plain: string): string[] {
  const issues: string[] = []
  if (plain.length < 10) issues.push('must be at least 10 characters')
  if (!/[a-z]/.test(plain)) issues.push('must contain a lowercase letter')
  if (!/[A-Z]/.test(plain)) issues.push('must contain an uppercase letter')
  if (!/\d/.test(plain)) issues.push('must contain a digit')
  return issues
}
