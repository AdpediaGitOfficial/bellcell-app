'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import {
  AlertCircle,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { PORTION_LABELS, STATUS_LABELS } from '@/lib/leave/core'
import {
  applyLeaveAction,
  cancelLeaveAction,
  carryForwardAction,
  decideLeaveAction,
  type LeaveState,
} from './actions'

export interface EmployeeChoice {
  id: string
  label: string
}

export interface TypeChoice {
  id: string
  name: string
  isPaid: boolean
  uncapped: boolean
}

function Submit({
  label,
  variant = 'primary',
  size = 'md',
}: {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? 'Working…' : label}
    </Button>
  )
}

function Banner({ state }: { state: LeaveState }) {
  if (!state.error && !state.notice) return null
  return state.error ? (
    <p
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {state.error}
    </p>
  ) : (
    <p
      role="status"
      className="mb-3 flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {state.notice}
    </p>
  )
}

export function ApplyLeaveDialog({
  employees,
  types,
  branchId,
  mayApprove,
}: {
  employees: EmployeeChoice[]
  types: TypeChoice[]
  branchId: string | null
  mayApprove: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<LeaveState, FormData>(applyLeaveAction, {})
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const type = types.find((t) => t.id === typeId)

  const employeeRef = useRef<HTMLSelectElement>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // React clears an uncontrolled form once its action settles — a refusal
  // included — so put back what was entered. Without this, a request
  // refused for one reason comes back refused for a different one, because
  // the employee has silently been deselected.
  useEffect(() => {
    if (!state.values) return
    if (employeeRef.current && state.values.employeeId !== undefined) {
      employeeRef.current.value = state.values.employeeId
    }
    if (fromRef.current && state.values.from !== undefined) {
      fromRef.current.value = state.values.from
    }
    if (toRef.current && state.values.to !== undefined) {
      toRef.current.value = state.values.to
    }
    if (reasonRef.current && state.values.reason !== undefined) {
      reasonRef.current.value = state.values.reason
    }
  }, [state])

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record leave
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record a leave request"
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="animate-fade-in surface-card relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card p-5 shadow-popover">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-strong">Record leave</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cancel"
                className="rounded p-1 text-faint hover:text-strong"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <form action={formAction} className="space-y-4">
              <Banner state={state} />
              {branchId && <input type="hidden" name="branchId" value={branchId} />}

              <Field label="Employee" htmlFor="l-employee" required>
                <Select ref={employeeRef} id="l-employee" name="employeeId" required>
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Leave type"
                htmlFor="l-type"
                required
                hint={
                  type
                    ? type.isPaid
                      ? 'Paid — approved days cost the employee nothing.'
                      : 'Unpaid — every approved day is a salary deduction.'
                    : undefined
                }
              >
                <Select
                  id="l-type"
                  name="leaveTypeId"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  required
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isPaid ? '' : ' (unpaid)'}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" htmlFor="l-from" required>
                  <Input ref={fromRef} id="l-from" name="from" type="date" required />
                </Field>
                <Field label="First day" htmlFor="l-fromPortion">
                  <Select id="l-fromPortion" name="fromPortion" defaultValue="FULL">
                    {Object.entries(PORTION_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="To" htmlFor="l-to" required>
                  <Input ref={toRef} id="l-to" name="to" type="date" required />
                </Field>
                <Field label="Last day" htmlFor="l-toPortion">
                  <Select id="l-toPortion" name="toPortion" defaultValue="FULL">
                    {Object.entries(PORTION_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Reason" htmlFor="l-reason">
                <Textarea ref={reasonRef} id="l-reason" name="reason" rows={2} />
              </Field>

              {mayApprove && (
                <label className="flex items-start gap-2 text-sm text-base">
                  <input
                    type="checkbox"
                    name="approveNow"
                    className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                  />
                  <span>
                    Approve it now
                    <span className="block text-xs text-muted">
                      Writes the attendance register straight away, which is what
                      payroll reads.
                    </span>
                  </span>
                </label>
              )}

              <p className="text-xs text-muted">
                Declared holidays inside the dates are not counted, so leave over
                a closed weekend costs only the working days.
              </p>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Submit label="Record leave" />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export interface RequestRow {
  id: string
  employeeId: string
  employeeName: string
  employeeCode: string
  typeName: string
  isPaid: boolean
  fromLabel: string
  toLabel: string
  days: number
  fromPortion: string
  toPortion: string
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  decisionNote: string | null
  decidedBy: string | null
}

/**
 * Both lists live in ONE client component, and the outcome banners sit
 * above them.
 *
 * Deciding a request revalidates the page, which moves the row from the
 * pending list to the decided one — unmounting whatever rendered the
 * buttons. A banner inside the row would vanish with it, and the operator
 * would never learn whether the register was written. The same mistake has
 * now cost a one-time password and a payroll voucher number, so the
 * outcome lives somewhere that outlives the row.
 */
export function LeaveLists({
  pending,
  decided,
  year,
  mayApprove,
  mayUpdate,
}: {
  pending: RequestRow[]
  decided: RequestRow[]
  year: number
  mayApprove: boolean
  mayUpdate: boolean
}) {
  const [decideState, decide] = useActionState<LeaveState, FormData>(
    decideLeaveAction,
    {},
  )
  const [cancelState, cancel] = useActionState<LeaveState, FormData>(
    cancelLeaveAction,
    {},
  )
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <Banner state={decideState} />
      <Banner state={cancelState} />

      {pending.length > 0 && (
        <div className="rounded-card surface-card overflow-hidden shadow-card">
          <h2 className="flex items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            <CalendarCheck
              className="h-4 w-4 text-caution-600 dark:text-caution-500"
              aria-hidden
            />
            Awaiting a decision
          </h2>
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-3">
                <Summary row={r} />
                {mayApprove ? (
                  rejecting === r.id ? (
                    <form action={decide} className="min-w-[14rem] space-y-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Input
                        name="note"
                        placeholder="Reason for rejecting"
                        required
                        autoFocus
                        className="h-9"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setRejecting(null)}
                        >
                          Back
                        </Button>
                        <Submit label="Reject" variant="danger" size="sm" />
                      </div>
                    </form>
                  ) : (
                    <div className="flex gap-2">
                      <form action={decide}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="decision" value="approve" />
                        <Submit label="Approve" size="sm" />
                      </form>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRejecting(r.id)}
                      >
                        Reject…
                      </Button>
                    </div>
                  )
                ) : (
                  <span className="text-xs text-muted">
                    Someone senior has to decide this.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3">
          <h2 className="text-sm font-semibold text-strong">Decided in {year}</h2>
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="year" className="text-xs text-muted">
              Year
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              defaultValue={year}
              className="h-8 w-24 rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-2 text-sm text-strong"
            />
          </form>
        </div>

        {decided.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CalendarX className="mx-auto h-5 w-5 text-faint" aria-hidden />
            <p className="mt-2 text-sm text-muted">Nothing decided in {year} yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-3">
                <Summary row={r} showStatus />
                {mayUpdate && r.status === 'APPROVED' && (
                  cancelling === r.id ? (
                    <form action={cancel} className="min-w-[14rem] space-y-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <Input
                        name="reason"
                        placeholder="Reason"
                        required
                        autoFocus
                        className="h-9"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setCancelling(null)}
                        >
                          Keep it
                        </Button>
                        <Submit label="Cancel leave" variant="danger" size="sm" />
                      </div>
                    </form>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCancelling(r.id)}
                    >
                      Cancel leave…
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const STATUS_TONES: Record<string, 'caution' | 'positive' | 'neutral'> = {
  PENDING: 'caution',
  APPROVED: 'positive',
  REJECTED: 'neutral',
  CANCELLED: 'neutral',
}

function Summary({ row, showStatus }: { row: RequestRow; showStatus?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
        <Link
          href={`/people/employees/${row.employeeId}?tab=leave`}
          className="hover:text-brand-700 hover:underline dark:hover:text-brand-400"
        >
          {row.employeeName}
        </Link>
        <span className="numeric text-xs font-normal text-faint">
          {row.employeeCode}
        </span>
        {showStatus && (
          <Badge tone={STATUS_TONES[row.status] ?? 'neutral'}>
            {STATUS_LABELS[row.status]}
          </Badge>
        )}
        {!row.isPaid && row.status === 'APPROVED' && (
          <Badge tone="caution">Cost pay</Badge>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        {row.typeName}
        {row.isPaid ? '' : ' (unpaid)'} · {row.fromLabel} to {row.toLabel} ·{' '}
        {row.days} day{row.days === 1 ? '' : 's'}
        {row.fromPortion !== 'FULL' && ` · from ${row.fromPortion.replace('_', ' ').toLowerCase()}`}
        {row.toPortion !== 'FULL' && ` · to ${row.toPortion.replace('_', ' ').toLowerCase()}`}
        {row.decidedBy ? ` · by ${row.decidedBy}` : ''}
      </p>
      {row.reason && <p className="mt-1 text-xs text-muted">{row.reason}</p>}
      {row.decisionNote && <p className="mt-1 text-xs text-muted">{row.decisionNote}</p>}
    </div>
  )
}

export function CarryForwardForm({ defaultYear }: { defaultYear: number }) {
  const [state, formAction] = useActionState<LeaveState, FormData>(carryForwardAction, {})

  return (
    <form action={formAction} className="rounded-card surface-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-strong">Carry forward</h2>
      <p className="mb-3 mt-1 max-w-prose text-xs text-muted">
        Moves unused days into the next year for every type that allows it,
        capped per type. Deliberately a button somebody presses rather than
        something that happens by itself in January — a balance that changed on
        its own is one nobody can explain to the person whose leave it is.
      </p>
      <Banner state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Carry forward from" htmlFor="cf-year" className="w-40">
          <Input
            id="cf-year"
            name="fromYear"
            type="number"
            min={2000}
            max={2100}
            defaultValue={defaultYear}
          />
        </Field>
        <Submit label="Run carry forward" variant="secondary" size="sm" />
      </div>
    </form>
  )
}
