'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import {
  saveSalaryComponentAction,
  type ComponentState,
} from './actions'

export interface ComponentRow {
  id: string
  code: string
  name: string
  kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION'
  calculation: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS'
  percentage: string | null
  partOfBasic: boolean
  proRated: boolean
  sortOrder: number
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function ComponentEditor({ component }: { component?: ComponentRow }) {
  const [open, setOpen] = useState(false)
  const editing = Boolean(component)

  return (
    <>
      {editing ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${component!.name}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add component
        </Button>
      )}

      {open && (
        <ComponentDialog component={component} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function ComponentDialog({
  component,
  onClose,
}: {
  component?: ComponentRow
  onClose: () => void
}) {
  const [state, formAction] = useActionState<ComponentState, FormData>(
    saveSalaryComponentAction,
    {},
  )
  const [calculation, setCalculation] = useState(component?.calculation ?? 'FIXED')
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.ok) {
      onClose()
      return
    }
    // React clears an uncontrolled form once the action settles, refusal
    // included, so put back what was typed.
    if (state.values?.name !== undefined && nameRef.current) {
      nameRef.current.value = state.values.name
    }
    if (state.values?.code !== undefined && codeRef.current) {
      codeRef.current.value = state.values.code
    }
  }, [state, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={component ? 'Edit salary component' : 'Add salary component'}
    >
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="animate-fade-in surface-card relative z-10 w-full max-w-lg rounded-card p-5 shadow-popover">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-strong">
            {component ? 'Edit salary component' : 'Add salary component'}
          </h2>
          <button
            type="button"
            onClick={onClose}
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

          <input type="hidden" name="id" value={component?.id ?? ''} />

          <div className="grid gap-4 sm:grid-cols-2">
            {!component && (
              <Field label="Code" htmlFor="sc-code" required hint="Short, e.g. HRA.">
                <Input ref={codeRef} id="sc-code" name="code" required maxLength={20} />
              </Field>
            )}

            <Field label="Name" htmlFor="sc-name" required>
              <Input
                ref={nameRef}
                id="sc-name"
                name="name"
                defaultValue={component?.name ?? ''}
                required
                autoFocus
              />
            </Field>

            <Field label="Type" htmlFor="sc-kind" required>
              <Select id="sc-kind" name="kind" defaultValue={component?.kind ?? 'EARNING'}>
                <option value="EARNING">Earning</option>
                <option value="DEDUCTION">Deduction</option>
                <option value="EMPLOYER_CONTRIBUTION">Employer contribution</option>
              </Select>
            </Field>

            <Field
              label="How it is worked out"
              htmlFor="sc-calculation"
              required
              hint="A percentage is of the full-month figure, then pro-rated once."
            >
              <Select
                id="sc-calculation"
                name="calculation"
                value={calculation}
                onChange={(e) =>
                  setCalculation(e.target.value as ComponentRow['calculation'])
                }
              >
                <option value="FIXED">A fixed amount per employee</option>
                <option value="PERCENT_OF_BASIC">A percentage of basic + DA</option>
                <option value="PERCENT_OF_GROSS">A percentage of gross</option>
              </Select>
            </Field>

            {calculation !== 'FIXED' && (
              <Field label="Percentage" htmlFor="sc-percentage" required>
                <Input
                  id="sc-percentage"
                  name="percentage"
                  type="number"
                  step="0.001"
                  min={0}
                  max={100}
                  defaultValue={component?.percentage ?? ''}
                  required
                />
              </Field>
            )}

            <Field label="Sort order" htmlFor="sc-sort">
              <Input
                id="sc-sort"
                name="sortOrder"
                type="number"
                defaultValue={component?.sortOrder ?? 0}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-sm text-base">
            <input
              type="checkbox"
              name="partOfBasic"
              defaultChecked={component?.partOfBasic ?? false}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
            />
            <span>
              Counts towards the PF wage base
              <span className="block text-xs text-muted">
                Basic and dearness allowance normally do; house rent allowance
                does not.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-base">
            <input
              type="checkbox"
              name="proRated"
              defaultChecked={component?.proRated ?? true}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
            />
            <span>
              Reduced by unpaid days
              <span className="block text-xs text-muted">
                Leave off for a flat reimbursement that is paid in full
                whatever the attendance.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Submit label={component ? 'Save changes' : 'Add component'} />
          </div>
        </form>
      </div>
    </div>
  )
}
