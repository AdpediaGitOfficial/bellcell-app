import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { Logo } from '@/components/shell/Logo'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard')

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mx-auto mb-8 h-12 w-auto" />

        <div className="surface-card rounded-card p-6 shadow-card">
          <h1 className="mb-1 text-xl font-semibold text-strong">Sign in</h1>
          <p className="mb-5 text-sm text-muted">
            Use your Bell Cell EduSuite account.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Bell Cell EduSuite · Authorised users only
        </p>
      </div>
    </main>
  )
}
