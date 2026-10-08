'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { addAffiliationPaymentAction, type AccountsState } from '../actions'

const MODES = [
  ['BANK_TRANSFER', 'Bank transfer'],
  ['DD', 'Demand draft'],
  ['CHEQUE', 'Cheque'],
  ['NET_BANKING', 'Net banking'],
  ['CASH', 'Cash'],
] as const

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Record remittance'}
    </Button>
  )
}

export function AddRemittance({
  bodies,
  feeTypes,
  banks,
  branches,
}: {
  bodies: { id: string; name: string }[]
  feeTypes: { id: string; name: string }[]
  banks: { id: string; label: string }[]
  branches?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<AccountsState, FormData>(
    addAffiliationPaymentAction,
    {},
  )

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Record remittance
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10"
          role="dialog"
          aria-modal="true"
          aria-label="Record remittance"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-xl rounded-card p-5 shadow-popover">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-strong">
                Record a remittance to the university
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted hover:text-strong"
              >
                Close
              </button>
            </div>

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
                <Field label="Paid from branch" htmlFor="af-branch" required>
                  <Select id="af-branch" name="branchId" defaultValue="" required>
                    <option value="">Select a branch…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="University / tie-up" htmlFor="af-body" required>
                  <Select id="af-body" name="affiliationBodyId" defaultValue="" required>
                    <option value="">Select…</option>
                    {bodies.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Against fee type"
                  htmlFor="af-fee"
                  hint="Drives the reconciliation against what students paid."
                >
                  <Select id="af-fee" name="feeTypeId" defaultValue="">
                    <option value="">Not specified</option>
                    {feeTypes.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </Select>
                </Field>

                <Field label="Amount" htmlFor="af-amount" required>
                  <Input id="af-amount" name="amount" inputMode="decimal" placeholder="0.00" required />
                </Field>

                <Field label="Paid on" htmlFor="af-date" required>
                  <Input
                    id="af-date"
                    name="paidOn"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </Field>

                <Field label="Mode" htmlFor="af-mode" required>
                  <Select id="af-mode" name="mode" defaultValue="BANK_TRANSFER">
                    {MODES.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>

                {banks.length > 0 && (
                  <Field label="Paid from account" htmlFor="af-bank">
                    <Select id="af-bank" name="bankAccountId" defaultValue="">
                      <option value="">Cash in hand</option>
                      {banks.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </Select>
                  </Field>
                )}

                <Field label="Reference / UTR" htmlFor="af-ref">
                  <Input id="af-ref" name="referenceNo" />
                </Field>

                <Field label="Students covered" htmlFor="af-count">
                  <Input id="af-count" name="studentCount" type="number" min={0} />
                </Field>

                <Field label="Narration" htmlFor="af-narr" className="sm:col-span-2">
                  <Textarea id="af-narr" name="narration" rows={2} />
                </Field>
              </div>

              <div className="flex justify-end">
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
