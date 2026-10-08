'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  ShieldAlert,
} from 'lucide-react'
import type { UserRole } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { ROLE_LABELS } from '@/lib/rbac/roles'
import {
  changeRoleAction,
  createLoginAction,
  resetPasswordAction,
  setAccountActiveAction,
  type AccessState,
} from '../access-actions'

export interface AccessAccount {
  email: string
  role: UserRole
  isActive: boolean
  lastLoginAt: Date | null
  mustChangePassword: boolean
  lockedUntil: Date | null
  failedLoginCount: number
  branches: string[]
}

function Submit({
  label,
  variant = 'primary',
}: {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? 'Working…' : label}
    </Button>
  )
}

function Outcome({ state }: { state: AccessState }) {
  if (!state.error && !state.notice) return null
  return (
    <div className="mb-4 space-y-3">
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.notice}
        </p>
      )}
      {state.temporaryPassword && (
        <OneTimePassword value={state.temporaryPassword} />
      )}
    </div>
  )
}

/**
 * The one-time password is rendered once, from the action's return value.
 * It is never stored in the database in clear, never put in a URL (where it
 * would land in server logs and browser history), and never emailed — the
 * institute has no mail gateway configured (open question #7).
 */
function OneTimePassword({ value }: { value: string }) {
  return (
    <div className="rounded-lg border border-caution-500/40 bg-caution-50 px-4 py-3 dark:bg-caution-500/10">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-caution-700 dark:text-caution-500">
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        One-time password
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="numeric select-all rounded-md bg-[rgb(var(--surface-card))] px-3 py-1.5 text-base font-semibold tracking-wider text-strong">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(value)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy
        </button>
      </div>
      <p className="mt-2 text-xs text-caution-700 dark:text-caution-500">
        Write it down or hand it over now. Leaving this page loses it, and the
        only way back is another reset.
      </p>
    </div>
  )
}

export function AccessTab({
  employeeId,
  employeeName,
  branchName,
  account,
  assignable,
  blockedReason,
  deactivationReason,
  canCreate,
}: {
  employeeId: string
  employeeName: string
  branchName: string
  account: AccessAccount | null
  /** Roles this actor may grant — the server enforces the same list. */
  assignable: UserRole[]
  /** Why this account cannot be changed by this actor, if so. */
  blockedReason: string | null
  /** Why deactivation specifically is refused, if so. */
  deactivationReason: string | null
  canCreate: boolean
}) {
  const [createState, create] = useActionState<AccessState, FormData>(
    createLoginAction.bind(null, employeeId),
    {},
  )
  const [roleState, changeRole] = useActionState<AccessState, FormData>(
    changeRoleAction.bind(null, employeeId),
    {},
  )
  const [resetState, reset] = useActionState<AccessState, FormData>(
    resetPasswordAction.bind(null, employeeId),
    {},
  )
  const [activeState, setActive] = useActionState<AccessState, FormData>(
    setAccountActiveAction.bind(null, employeeId),
    {},
  )

  /**
   * The create outcome is rendered ABOVE the branch, not inside it.
   *
   * Creating a login revalidates this page, so `account` flips from null to
   * an object and the "no login yet" branch unmounts. Rendering the one-time
   * password inside that branch loses it at exactly the moment it matters:
   * the account exists and nobody knows its password. Found by a browser
   * pass, not by reading the code.
   */
  const createOutcome = <Outcome state={createState} />

  if (!account) {
    return (
      <div className="rounded-card surface-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-strong">No login yet</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {employeeName} has a personnel record but cannot sign in. Issuing a
          login grants access to this system under one role, scoped to{' '}
          <span className="font-medium text-strong">{branchName}</span>.
        </p>

        {!canCreate ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-[rgb(var(--surface-sunken))] px-3 py-2 text-sm text-muted">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            You do not have permission to create logins. Ask an administrator.
          </p>
        ) : (
          <>
            <div className="mt-4">{createOutcome}</div>

            <form action={create} className="grid max-w-xl gap-4 sm:grid-cols-2">
              <Field
                label="Sign-in email"
                htmlFor="login-email"
                required
                hint="Must be unique across the whole system."
              >
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                />
              </Field>
              <Field
                label="Role"
                htmlFor="login-role"
                required
                hint="You can only grant roles below your own."
              >
                <Select id="login-role" name="role" defaultValue="" required>
                  <option value="">Select a role…</option>
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Submit label="Create login" />
              </div>
            </form>

            <p className="mt-4 max-w-prose text-xs text-faint">
              A one-time password is generated and shown to you once. It is never
              emailed and never stored in readable form, and the account must
              change it at first sign-in.
            </p>
          </>
        )}
      </div>
    )
  }

  const locked = account.lockedUntil !== null && account.lockedUntil > new Date()

  return (
    <div className="space-y-4">
      {createOutcome}

      <div className="rounded-card surface-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-strong">Login</h2>
            <p className="numeric mt-0.5 truncate text-sm text-muted">
              {account.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={account.isActive ? 'positive' : 'neutral'}>
              {account.isActive ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge tone="brand">{ROLE_LABELS[account.role]}</Badge>
            {locked && (
              <Badge tone="critical" icon={<Lock className="h-3 w-3" />}>
                Locked out
              </Badge>
            )}
            {account.mustChangePassword && (
              <Badge tone="caution">Must change password</Badge>
            )}
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-[rgb(var(--border-base))] pt-4 sm:grid-cols-3">
          <Detail
            label="Last signed in"
            value={
              account.lastLoginAt
                ? account.lastLoginAt.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'
            }
          />
          <Detail
            label="Branches"
            value={account.branches.join(', ') || 'None assigned'}
          />
          <Detail
            label="Failed attempts"
            value={
              account.failedLoginCount > 0
                ? `${account.failedLoginCount} since last success`
                : 'None'
            }
          />
        </dl>
      </div>

      {blockedReason ? (
        <p className="flex items-start gap-2 rounded-card surface-card px-4 py-3 text-sm text-muted shadow-card">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-caution-600 dark:text-caution-500"
            aria-hidden
          />
          {blockedReason}
        </p>
      ) : (
        <>
          <div className="rounded-card surface-card p-5 shadow-card">
            <h2 className="text-sm font-semibold text-strong">Role</h2>
            <p className="mt-1 max-w-prose text-xs text-muted">
              Changing a role ends their current sessions, so the new permissions
              apply immediately rather than whenever their session happens to
              expire.
            </p>
            <Outcome state={roleState} />
            <form action={changeRole} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Role" htmlFor="role" className="min-w-[12rem]">
                <Select id="role" name="role" defaultValue={account.role}>
                  {/* The current role is listed even when it is above what this
                      actor could grant, so the select is never misleading. */}
                  {Array.from(new Set([account.role, ...assignable])).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Submit label="Change role" variant="secondary" />
            </form>
          </div>

          <div className="rounded-card surface-card p-5 shadow-card">
            <h2 className="text-sm font-semibold text-strong">Password</h2>
            <p className="mt-1 max-w-prose text-xs text-muted">
              Issues a new one-time password, clears any lockout, and ends their
              sessions. Use this when someone forgets their password or is locked
              out — you cannot read their existing one.
            </p>
            <Outcome state={resetState} />
            <form action={reset} className="mt-3">
              <Submit label="Reset password" variant="secondary" />
            </form>
          </div>

          <div className="rounded-card surface-card p-5 shadow-card">
            <h2 className="text-sm font-semibold text-strong">
              {account.isActive ? 'Disable login' : 'Re-enable login'}
            </h2>
            <p className="mt-1 max-w-prose text-xs text-muted">
              {account.isActive
                ? 'Ends every session immediately and refuses further sign-ins. The personnel record, and everything they recorded, is kept.'
                : 'Lets them sign in again with their existing password.'}
            </p>
            <Outcome state={activeState} />
            {!account.isActive || !deactivationReason ? (
              <form action={setActive} className="mt-3">
                <input
                  type="hidden"
                  name="activate"
                  value={account.isActive ? 'no' : 'yes'}
                />
                <Submit
                  label={account.isActive ? 'Disable login' : 'Re-enable login'}
                  variant={account.isActive ? 'danger' : 'secondary'}
                />
              </form>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-caution-50 px-3 py-2 text-sm text-caution-700 dark:bg-caution-500/10 dark:text-caution-500">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {deactivationReason}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-strong">{value}</dd>
    </div>
  )
}
