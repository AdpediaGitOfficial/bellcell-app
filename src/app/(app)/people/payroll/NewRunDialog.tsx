'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { MONTH_NAMES } from '@/lib/payroll/core'
import { createRunAction, type PayrollState } from './actions'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Opening…' : 'Open run'}
    </Button>
  )
}

export function NewRunDialog({
  branches,
}: {
  /** Present only when the user is viewing all branches. */
  branches?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<PayrollState, FormData>(
    createRunAction,
    {},
  )

  const now = new Date()
  // Payroll is normally run for the month just finished.
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        New payroll run
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Open a payroll run"
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-strong">
                Open a payroll run
              </h2>
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
              {state.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {state.error}
                </p>
              )}

              {branches && branches.length > 0 && (
                <Field label="Branch" htmlFor="run-branch" required>
                  <Select id="run-branch" name="branchId" defaultValue="" required>
                    <option value="">Select a branch…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Month" htmlFor="run-month" required>
                  <Select
                    id="run-month"
                    name="month"
                    defaultValue={String(previous.getMonth() + 1)}
                    required
                  >
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Year" htmlFor="run-year" required>
                  <Input
                    id="run-year"
                    name="year"
                    type="number"
                    min={2000}
                    max={2100}
                    defaultValue={previous.getFullYear()}
                    required
                  />
                </Field>
              </div>

              <Field
                label="Working days"
                htmlFor="run-days"
                hint="Leave blank to use the days in the month, or the standard set in payroll settings."
              >
                <Input id="run-days" name="workingDays" type="number" min={1} max={31} />
              </Field>

              <p className="text-xs text-muted">
                A draft payslip is prepared for every active employee with a
                salary structure in force for that month. Anyone without one is
                listed so you can see who was left out.
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Submit />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
