import 'server-only'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'bellcell_session'

function ttlHours(): number {
  const raw = Number.parseInt(process.env.SESSION_TTL_HOURS ?? '12', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 12
}

/**
 * Sessions are stored server-side and the cookie carries only an opaque
 * token. The DB keeps a SHA-256 of that token, so a database leak does not
 * hand over live sessions.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(input: {
  userId: string
  branchId: string | null
  userAgent?: string | null
  ipAddress?: string | null
}): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlHours() * 60 * 60 * 1000)

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: input.userId,
      branchId: input.branchId,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
    },
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  store.delete(SESSION_COOKIE)
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

/**
 * `null` means "all branches" (a SUPER_ADMIN-only view). It is stored as SQL
 * NULL rather than an empty string, so that `branchScope()` can tell an
 * explicit all-branches choice apart from "no branch selected yet".
 */
export async function setActiveBranch(branchId: string | null): Promise<void> {
  const token = await readSessionToken()
  if (!token) return
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { branchId },
  })
}

export { hashToken }
