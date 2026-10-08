'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import {
  addTransactionAction,
  reverseTransactionAction,
  type AccountsState,
} from '../actions'

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
      {pending ? 'Saving…' : 'Save voucher'}
    </Button>
  )
}

export function TransactionForm({
  heads,
  banks,
  branches,
}: {
  heads: { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }[]
  banks: { id: string; label: string }[]
  branches?: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<AccountsState, FormData>(
    addTransactionAction,
    {},
  )
  const [kind, setKind] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')

  // Only heads of the chosen kind are offered; the server enforces the same
  // rule, so a "Rent" row can never be filed as income.
  const available = heads.filter((h) => h.kind === kind)

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      )}

      {branches && branches.length > 0 && (
        <Field label="Branch" htmlFor="tx-branch" required>
          <Select id="tx-branch" name="branchId" defaultValue="" required>
            <option value="">Select a branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <div
        className="inline-flex rounded-lg border border-[rgb(var(--border-base))] p-0.5"
        role="group"
        aria-label="Transaction kind"
      >
        {(
          [
            ['EXPENSE', 'Expense'],
            ['INCOME', 'Income'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={
              'rounded-md px-3 py-1.5 text-sm font-medium ' +
              (kind === value
                ? value === 'INCOME'
                  ? 'bg-positive-50 text-positive-700 dark:bg-positive-700/15 dark:text-positive-500'
                  : 'bg-critical-50 text-critical-700 dark:bg-critical-500/10 dark:text-critical-500'
                : 'text-muted hover:text-strong')
            }
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account head" htmlFor="tx-head" required>
          <Select id="tx-head" name="accountHeadId" defaultValue="" required>
            <option value="">Select a head…</option>
            {available.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Amount" htmlFor="tx-amount" required>
          <Input id="tx-amount" name="amount" inputMode="decimal" placeholder="0.00" required />
        </Field>

        <Field label="Date" htmlFor="tx-date" required>
          <Input
            id="tx-date"
            name="transactionDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </Field>

        <Field label="Mode" htmlFor="tx-mode" required>
          <Select id="tx-mode" name="mode" defaultValue="CASH">
            {MODES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>

        {banks.length > 0 && (
          <Field label="Bank account" htmlFor="tx-bank" hint="Leave blank for cash in hand.">
            <Select id="tx-bank" name="bankAccountId" defaultValue="">
              <option value="">Cash in hand</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Reference" htmlFor="tx-ref">
          <Input id="tx-ref" name="referenceNo" />
        </Field>

        <Field label="Narration" htmlFor="tx-narr" className="sm:col-span-2">
          <Textarea id="tx-narr" name="narration" rows={2} />
        </Field>
      </div>

      <p className="text-xs text-faint">
        A voucher number is allocated on save, and the amount posts to the Day
        Book immediately.
      </p>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  )
}

export function ReverseButton({
  transactionId,
  voucherNo,
}: {
  transactionId: string
  voucherNo: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-muted hover:text-critical-600 dark:hover:text-critical-500"
      >
        Reverse
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reverse voucher"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="text-base font-semibold text-strong">Reverse {voucherNo}?</h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              A mirror entry is posted to the Day Book. The voucher itself stays,
              so the number series keeps its continuity.
            </p>
            <form action={reverseTransactionAction} className="space-y-4">
              <input type="hidden" name="transactionId" value={transactionId} />
              <Field label="Reason" htmlFor={`rv-${transactionId}`} required>
                <Textarea id={`rv-${transactionId}`} name="reason" rows={3} required />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Keep it
                </Button>
                <Button type="submit" variant="danger">Reverse</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function AddTransactionPanel({
  heads,
  banks,
  branches,
}: {
  heads: { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }[]
  banks: { id: string; label: string }[]
  branches?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        New voucher
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10"
          role="dialog"
          aria-modal="true"
          aria-label="New voucher"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-xl rounded-card p-5 shadow-popover">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-strong">New voucher</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted hover:text-strong"
              >
                Close
              </button>
            </div>
            <TransactionForm heads={heads} banks={banks} branches={branches} />
          </div>
        </div>
      )}
    </>
  )
}
