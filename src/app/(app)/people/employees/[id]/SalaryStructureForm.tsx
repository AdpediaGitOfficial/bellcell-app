'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { formatPaise } from '@/lib/money'
import { saveSalaryStructureAction, type StructureState } from '../actions'

export interface ComponentChoice {
  id: string
  name: string
  kind: string
  calculation: string
  percentage: string | null
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save revision'}
    </Button>
  )
}

function todayInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

export function SalaryStructureForm({
  employeeId,
  components,
  current,
}: {
  employeeId: string
  components: ComponentChoice[]
  current: { componentId: string; amountPaise: number }[]
}) {
  const action = saveSalaryStructureAction.bind(null, employeeId)
  const [state, formAction] = useActionState<StructureState, FormData>(action, {})

  const amountFor = (componentId: string) =>
    current.find((c) => c.componentId === componentId)?.amountPaise

  return (
    <form action={formAction} className="rounded-card surface-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-strong">
        {current.length > 0 ? 'Revise the salary' : 'Set the salary'}
      </h2>
      <p className="mt-1 max-w-prose text-xs text-muted">
        Enter the full-month amount for each fixed component. Percentage
        components are worked out from them. Leave a component blank to leave it
        off this structure.
      </p>

      {state.error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.notice}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="Effective from"
          htmlFor="effectiveFrom"
          required
          hint="The previous structure is closed the day before. Payroll for an earlier month keeps the old figures."
        >
          <Input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={todayInput()}
            required
          />
        </Field>
        <Field
          label="Reason for the revision"
          htmlFor="structureNotes"
          hint="Recorded with the structure, so a later reader knows why it changed."
        >
          <Input
            id="structureNotes"
            name="notes"
            placeholder="Annual revision, promotion…"
          />
        </Field>
      </div>

      <div className="mt-4 space-y-2 border-t border-[rgb(var(--border-base))] pt-4">
        {components.map((c) => {
          const fixed = c.calculation === 'FIXED'
          const existing = amountFor(c.id)
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3">
              <label
                htmlFor={`amt-${c.id}`}
                className="w-56 shrink-0 text-sm text-strong"
              >
                {c.name}
                {!fixed && (
                  <span className="ml-1.5 text-xs text-muted">
                    {c.percentage}% of{' '}
                    {c.calculation === 'PERCENT_OF_BASIC' ? 'basic + DA' : 'gross'}
                  </span>
                )}
                {c.kind === 'DEDUCTION' && (
                  <span className="ml-1.5 text-xs text-critical-600 dark:text-critical-500">
                    deduction
                  </span>
                )}
              </label>
              {fixed ? (
                <Input
                  id={`amt-${c.id}`}
                  name={`component.${c.id}`}
                  inputMode="decimal"
                  placeholder="—"
                  defaultValue={
                    existing === undefined
                      ? ''
                      : formatPaise(existing, { symbol: false, decimals: false })
                  }
                  className="h-9 w-40"
                />
              ) : (
                <label className="flex items-center gap-2 text-sm text-base">
                  <input
                    type="checkbox"
                    name={`include.${c.id}`}
                    defaultChecked={existing !== undefined}
                    className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                  />
                  Include
                </label>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Submit />
      </div>
    </form>
  )
}
