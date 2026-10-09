'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import {
  addHolidayAction,
  generateWeeklyOffsAction,
  type HolidayState,
} from './actions'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

function Banner({ state }: { state: HolidayState }) {
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

function BranchField({
  branches,
  id,
}: {
  branches: { id: string; name: string }[]
  id: string
}) {
  return (
    <Field
      label="Applies to"
      htmlFor={id}
      hint="Leave as every branch unless only one campus closes."
    >
      <Select id={id} name="branchId" defaultValue="">
        <option value="">Every branch</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

export function AddHolidayForm({
  branches,
}: {
  branches: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<HolidayState, FormData>(
    addHolidayAction,
    {},
  )

  return (
    <form action={formAction} className="rounded-card surface-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold text-strong">Add a holiday</h2>
      <Banner state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Date" htmlFor="h-date" required>
          <Input
            id="h-date"
            name="date"
            type="date"
            defaultValue={state.values?.date ?? ''}
            required
          />
        </Field>
        <Field label="Name" htmlFor="h-name" required>
          <Input
            id="h-name"
            name="name"
            placeholder="Onam, Republic Day…"
            defaultValue={state.values?.name ?? ''}
            required
          />
        </Field>
        <BranchField branches={branches} id="h-branch" />
        <div className="flex items-end">
          <Submit label="Add holiday" />
        </div>
      </div>
    </form>
  )
}

export function WeeklyOffForm({
  branches,
}: {
  branches: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<HolidayState, FormData>(
    generateWeeklyOffsAction,
    {},
  )
  const year = new Date().getFullYear()

  return (
    <form action={formAction} className="rounded-card surface-card p-5 shadow-card">
      <h2 className="text-sm font-semibold text-strong">Generate weekly offs</h2>
      <p className="mb-3 mt-1 max-w-prose text-xs text-muted">
        Writes one row per occurrence rather than storing a rule, so the odd
        working Sunday can simply be deleted. Re-running skips dates already
        marked.
      </p>
      <Banner state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Day" htmlFor="w-weekday" required>
          <Select id="w-weekday" name="weekday" defaultValue="0">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
              (d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Year" htmlFor="w-year" required>
          <Input
            id="w-year"
            name="year"
            type="number"
            min={2000}
            max={2100}
            defaultValue={year}
            required
          />
        </Field>
        <BranchField branches={branches} id="w-branch" />
        <div className="flex items-end">
          <Submit label="Generate" />
        </div>
      </div>
    </form>
  )
}
