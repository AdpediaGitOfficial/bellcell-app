'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, BadgeCheck, Banknote, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import {
  approveRunAction,
  cancelRunAction,
  payRunAction,
  type PayrollState,
} from '../actions'

function Submit({ label, variant = 'primary' }: { label: string; variant?: 'primary' | 'danger' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? 'Working…' : label}
    </Button>
  )
}

function Banner({ state }: { state: PayrollState }) {
  if (!state.error && !state.notice) return null
  return state.error ? (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {state.error}
    </p>
  ) : (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {state.notice}
    </p>
  )
}

/**
 * One component owns all three actions and decides which panel to show.
 *
 * It must stay mounted across the status change, because each action's
 * outcome lives in its own `useActionState` — and approving or paying
 * revalidates the page, which flips `status` and would otherwise unmount
 * the very panel holding the confirmation. The payment notice carries the
 * voucher numbers; losing it is losing the thing the accountant writes down.
 * (The same mistake cost a one-time password on the Employee screen.)
 */
export function RunWorkflow({
  runId,
  status,
  headcount,
  bankAccounts,
  mayApprove,
  mayCancel,
}: {
  runId: string
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED'
  headcount: number
  bankAccounts: { id: string; label: string }[]
  mayApprove: boolean
  mayCancel: boolean
}) {
  const [approveState, approve] = useActionState<PayrollState, FormData>(
    approveRunAction,
    {},
  )
  const [payState, pay] = useActionState<PayrollState, FormData>(payRunAction, {})
  const [cancelState, cancel] = useActionState<PayrollState, FormData>(
    cancelRunAction,
    {},
  )

  return (
    <div className="space-y-4">
      {/* Outcomes live here, above the panels, so they survive the status
          change that the action itself causes. */}
      <Banner state={approveState} />
      <Banner state={payState} />
      <Banner state={cancelState} />

      {status === 'DRAFT' &&
        (mayApprove ? (
          <ApprovePanel runId={runId} headcount={headcount} action={approve} />
        ) : (
          <p className="rounded-card surface-card px-4 py-3 text-sm text-muted shadow-card">
            This run is ready for approval. Someone who can approve payroll has
            to release it — the person who prepares a run does not approve it.
          </p>
        ))}

      {status === 'APPROVED' &&
        (mayApprove ? (
          <PayPanel runId={runId} bankAccounts={bankAccounts} action={pay} />
        ) : (
          <ApprovedNotice />
        ))}

      {status !== 'PAID' && status !== 'CANCELLED' && mayCancel && (
        <CancelPanel runId={runId} action={cancel} />
      )}
    </div>
  )
}

function ApprovePanel({
  runId,
  headcount,
  action,
}: {
  runId: string
  headcount: number
  action: (formData: FormData) => void
}) {
  return (
    <div className="rounded-card surface-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-strong">Approve this run</h2>
      <p className="mt-1 max-w-prose text-xs text-muted">
        Freezes the figures for all {headcount} payslips. After this, unpaid days
        and tax cannot be edited — a correction means cancelling the run and
        opening a new one.
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="runId" value={runId} />
        <Submit label="Approve payroll" />
      </form>
    </div>
  )
}

function PayPanel({
  runId,
  bankAccounts,
  action,
}: {
  runId: string
  bankAccounts: { id: string; label: string }[]
  action: (formData: FormData) => void
}) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="rounded-card surface-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Banknote className="h-4 w-4 text-faint" aria-hidden />
        Record the payment
      </h2>
      <p className="mt-1 max-w-prose text-xs text-muted">
        Posts an expense voucher for the net pay, and a second for the
        employer&rsquo;s PF and ESI if there is any. Only the money that actually
        leaves the institute reaches the Day Book — tax and PF withheld from
        staff go out later, when their challan is paid.
      </p>

      <div className="mt-3">
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="runId" value={runId} />
          <Field label="Paid on" htmlFor="paidOn" required>
            <Input id="paidOn" name="paidOn" type="date" defaultValue={today} required />
          </Field>
          <Field label="Mode" htmlFor="mode" required>
            <Select id="mode" name="mode" defaultValue="BANK_TRANSFER">
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
            </Select>
          </Field>
          <Field label="From account" htmlFor="bankAccountId">
            <Select id="bankAccountId" name="bankAccountId" defaultValue="">
              <option value="">Not specified</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="referenceNo" hint="NEFT or cheque number.">
            <Input id="referenceNo" name="referenceNo" />
          </Field>
          <div className="sm:col-span-2">
            <Submit label="Mark paid and post to the books" />
          </div>
        </form>
      </div>
    </div>
  )
}

function CancelPanel({
  runId,
  action,
}: {
  runId: string
  action: (formData: FormData) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-card surface-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-strong">Cancel this run</h2>
      <p className="mt-1 max-w-prose text-xs text-muted">
        The run is kept with its reason, not deleted — a payroll month that
        vanished is unexplainable. A paid run cannot be cancelled here; reverse
        its voucher in Accounts instead.
      </p>

      <div className="mt-3">
        {!open ? (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Cancel run…
          </Button>
        ) : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="runId" value={runId} />
            <Field label="Reason" htmlFor="cancelReason" required>
              <Textarea id="cancelReason" name="reason" rows={2} required autoFocus />
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden />
                Keep it
              </Button>
              <Submit label="Cancel run" variant="danger" />
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ApprovedNotice() {
  return (
    <p className="flex items-start gap-2 rounded-card surface-card px-4 py-3 text-sm text-muted shadow-card">
      <BadgeCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-info-600 dark:text-info-500"
        aria-hidden
      />
      This run is approved, so its figures are fixed. Only someone who can
      approve payroll may record the payment.
    </p>
  )
}
