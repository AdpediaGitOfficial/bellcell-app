'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { formatPaise } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { collectPaymentAction, type FeeState } from '../actions'

export interface DueRow {
  id: string
  label: string
  dueDate: string
  balancePaise: number
  overdue: boolean
}

const MODES = [
  ['CASH', 'Cash'],
  ['UPI', 'UPI'],
  ['CARD', 'Card'],
  ['NET_BANKING', 'Net banking'],
  ['CHEQUE', 'Cheque'],
  ['DD', 'Demand draft'],
  ['BANK_TRANSFER', 'Bank transfer'],
] as const

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Recording…' : 'Record payment'}
    </Button>
  )
}

export function CollectForm({
  studentId,
  dues,
  banks,
  totalOutstandingPaise,
}: {
  studentId: string
  dues: DueRow[]
  banks: { id: string; label: string }[]
  totalOutstandingPaise: number
}) {
  const action = collectPaymentAction.bind(null, studentId)
  const [state, formAction] = useActionState<FeeState, FormData>(action, {})

  const [selected, setSelected] = useState<string[]>([])
  const [amount, setAmount] = useState('')

  const selectedTotal = dues
    .filter((d) => selected.includes(d.id))
    .reduce((s, d) => s + d.balancePaise, 0)

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    )

  const cap = selected.length > 0 ? selectedTotal : totalOutstandingPaise

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-strong">
          Which instalments is this against?
        </p>
        <p className="mb-3 text-xs text-muted">
          Leave all unticked to settle the oldest dues first. Tick specific
          instalments when the student is paying a particular fee.
        </p>

        <ul className="divide-y divide-[rgb(var(--border-base))] rounded-lg border border-[rgb(var(--border-base))]">
          {dues.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[rgb(var(--surface-hover))]">
                <input
                  type="checkbox"
                  name="installmentIds"
                  value={d.id}
                  checked={selected.includes(d.id)}
                  onChange={() => toggle(d.id)}
                  className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-strong">{d.label}</span>
                  <span
                    className={
                      'block text-xs ' +
                      (d.overdue
                        ? 'text-critical-600 dark:text-critical-500'
                        : 'text-muted')
                    }
                  >
                    Due {d.dueDate}
                    {d.overdue ? ' · overdue' : ''}
                  </span>
                </span>
                <span className="numeric shrink-0 text-sm font-medium text-strong">
                  {formatPaise(d.balancePaise)}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setSelected([])
              setAmount('')
            }}
            className="text-xs font-medium text-muted hover:text-strong"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => setAmount((cap / 100).toFixed(2))}
            className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            Pay {formatPaise(cap)} in full
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount"
          htmlFor="amount"
          required
          hint={`Maximum ${formatPaise(cap)} — overpayments are rejected.`}
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </Field>

        <Field label="Receipt date" htmlFor="receiptDate" required>
          <Input
            id="receiptDate"
            name="receiptDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>

        <Field label="Mode" htmlFor="mode" required>
          <Select id="mode" name="mode" defaultValue="CASH">
            {MODES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reference"
          htmlFor="referenceNo"
          hint="UPI reference, cheque or DD number."
        >
          <Input id="referenceNo" name="referenceNo" />
        </Field>

        {banks.length > 0 && (
          <Field label="Deposited to" htmlFor="bankAccountId">
            <Select id="bankAccountId" name="bankAccountId" defaultValue="">
              <option value="">Cash in hand</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2">
          <Textarea id="remarks" name="remarks" rows={2} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-[rgb(var(--border-base))] pt-4">
        <Link href={`/admissions/applications/${studentId}?tab=fees`}>
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <SubmitButton />
      </div>
    </form>
  )
}
