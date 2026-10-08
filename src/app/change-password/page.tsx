import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/current-user'
import { Logo } from '@/components/shell/Logo'
import { ChangePasswordForm } from './ChangePasswordForm'

export const metadata: Metadata = { title: 'Change password' }

/**
 * Deliberately outside the (app) route group: that layout redirects here
 * whenever `mustChangePassword` is set, so rendering this page inside it
 * would loop.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser()

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mx-auto mb-8 h-12 w-auto" />

        <div className="surface-card rounded-card p-6 shadow-card">
          <h1 className="mb-1 text-xl font-semibold text-strong">
            {user.mustChangePassword ? 'Choose your password' : 'Change password'}
          </h1>
          <p className="mb-5 text-sm text-muted">
            {user.mustChangePassword
              ? 'You signed in with a one-time password issued by an administrator. Choose your own before continuing.'
              : `Signed in as ${user.email}.`}
          </p>
          <ChangePasswordForm />
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Bell Cell EduSuite · Authorised users only
        </p>
      </div>
    </main>
  )
}
