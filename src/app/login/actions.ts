'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { recordAudit } from '@/lib/audit'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export interface LoginState {
  error?: string
}

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  }

  const { email, password } = parsed.data
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { branches: true },
  })

  // One generic message for every failure path, so this form cannot be used
  // to discover which email addresses exist.
  const generic = { error: 'Email or password is incorrect' }

  if (!user || !user.isActive) {
    await recordAudit({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      summary: `Failed sign-in for ${email}`,
      ipAddress: ip,
    })
    return generic
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      error: `Too many attempts. Try again after ${user.lockedUntil.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
    }
  }

  const ok = await verifyPassword(password, user.passwordHash)

  if (!ok) {
    const attempts = user.failedLoginCount + 1
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: attempts,
        lockedUntil:
          attempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
      },
    })
    await recordAudit({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      summary: `Failed sign-in for ${email} (attempt ${attempts})`,
      ipAddress: ip,
    })
    return generic
  }

  const defaultBranch =
    user.branches.find((b) => b.isDefault)?.branchId ??
    user.branches[0]?.branchId ??
    null

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  })

  await createSession({
    userId: user.id,
    branchId: user.role === 'SUPER_ADMIN' ? null : defaultBranch,
    userAgent: hdrs.get('user-agent'),
    ipAddress: ip,
  })

  await recordAudit({
    userId: user.id,
    branchId: defaultBranch,
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    summary: `${user.fullName} signed in`,
    ipAddress: ip,
  })

  redirect('/dashboard')
}
