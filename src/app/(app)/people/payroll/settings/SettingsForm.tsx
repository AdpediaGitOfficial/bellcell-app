'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { savePayrollSettingsAction, type SettingsState } from '../actions'

export interface SettingsValues {
  pfEnabled: boolean
  pfEmployeeRate: string
  pfEmployerRate: string
  pfWageCeiling: string
  pfNumber: string
  esiEnabled: boolean
  esiEmployeeRate: string
  esiEmployerRate: string
  esiEligibility: string
  esiNumber: string
  ptEnabled: boolean
  standardWorkingDays: string
  salaryAccountHeadId: string
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save settings'}
    </Button>
  )
}

export function SettingsForm({
  values,
  heads,
  branches,
}: {
  values: SettingsValues
  heads: { id: string; name: string }[]
  /** Present only when the user is viewing all branches. */
  branches?: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    savePayrollSettingsAction,
    {},
  )
  const [pf, setPf] = useState(values.pfEnabled)
  const [esi, setEsi] = useState(values.esiEnabled)

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
      {state.notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.notice}
        </p>
      )}

      {branches && branches.length > 0 && (
        <section className="rounded-card surface-card p-5 shadow-card">
          <Field
            label="Branch"
            htmlFor="branchId"
            required
            hint="Payroll settings are per branch, because registrations are."
          >
            <Select id="branchId" name="branchId" defaultValue="" required>
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </section>
      )}

      <section className="rounded-card surface-card p-5 shadow-card">
        <Toggle
          name="pfEnabled"
          checked={pf}
          onChange={setPf}
          title="Provident fund (EPF)"
          description="Switch on only if the institute is registered with the EPFO. Nothing is deducted while this is off."
        />

        {pf && (
          <div className="mt-4 grid gap-4 border-t border-[rgb(var(--border-base))] pt-4 sm:grid-cols-2">
            <Field
              label="Employee share (%)"
              htmlFor="pfEmployeeRate"
              hint="Statutory rate at the time of writing: 12%."
            >
              <Input
                id="pfEmployeeRate"
                name="pfEmployeeRate"
                type="number"
                step="0.001"
                min={0}
                max={100}
                defaultValue={values.pfEmployeeRate}
              />
            </Field>
            <Field label="Employer share (%)" htmlFor="pfEmployerRate">
              <Input
                id="pfEmployerRate"
                name="pfEmployerRate"
                type="number"
                step="0.001"
                min={0}
                max={100}
                defaultValue={values.pfEmployerRate}
              />
            </Field>
            <Field
              label="Wage ceiling (₹)"
              htmlFor="pfWageCeiling"
              hint="PF is computed on basic + DA up to this. Raise it well above any salary to contribute on full wages."
            >
              <Input
                id="pfWageCeiling"
                name="pfWageCeiling"
                inputMode="decimal"
                defaultValue={values.pfWageCeiling}
              />
            </Field>
            <Field label="PF establishment code" htmlFor="pfNumber">
              <Input id="pfNumber" name="pfNumber" defaultValue={values.pfNumber} />
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-card surface-card p-5 shadow-card">
        <Toggle
          name="esiEnabled"
          checked={esi}
          onChange={setEsi}
          title="Employees' State Insurance (ESI)"
          description="Switch on only if the institute is covered by ESIC. Employees earning above the eligibility limit are not covered at all."
        />

        {esi && (
          <div className="mt-4 grid gap-4 border-t border-[rgb(var(--border-base))] pt-4 sm:grid-cols-2">
            <Field
              label="Employee share (%)"
              htmlFor="esiEmployeeRate"
              hint="Statutory rate at the time of writing: 0.75%."
            >
              <Input
                id="esiEmployeeRate"
                name="esiEmployeeRate"
                type="number"
                step="0.001"
                min={0}
                max={100}
                defaultValue={values.esiEmployeeRate}
              />
            </Field>
            <Field label="Employer share (%)" htmlFor="esiEmployerRate">
              <Input
                id="esiEmployerRate"
                name="esiEmployerRate"
                type="number"
                step="0.001"
                min={0}
                max={100}
                defaultValue={values.esiEmployerRate}
              />
            </Field>
            <Field
              label="Eligibility limit (₹ gross per month)"
              htmlFor="esiEligibility"
              hint="Above this, no ESI at all — it is a cut-off, not a cap."
            >
              <Input
                id="esiEligibility"
                name="esiEligibility"
                inputMode="decimal"
                defaultValue={values.esiEligibility}
              />
            </Field>
            <Field label="ESI code" htmlFor="esiNumber">
              <Input id="esiNumber" name="esiNumber" defaultValue={values.esiNumber} />
            </Field>
          </div>
        )}
      </section>

      <section className="rounded-card surface-card p-5 shadow-card">
        <Toggle
          name="ptEnabled"
          checked={values.ptEnabled}
          title="Professional tax"
          description="A state levy. Slabs are set below, and the levy is deducted in September and March."
        />
      </section>

      <section className="rounded-card surface-card p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold text-strong">Pay period and posting</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Standard working days"
            htmlFor="standardWorkingDays"
            hint="Leave blank to use the actual days in each month. Set 26 if Sundays are unpaid."
          >
            <Input
              id="standardWorkingDays"
              name="standardWorkingDays"
              type="number"
              min={1}
              max={31}
              defaultValue={values.standardWorkingDays}
            />
          </Field>
          <Field
            label="Salary expense head"
            htmlFor="salaryAccountHeadId"
            hint="Where a paid run lands in the Day Book."
          >
            <Select
              id="salaryAccountHeadId"
              name="salaryAccountHeadId"
              defaultValue={values.salaryAccountHeadId}
            >
              <option value="">Use the default Salary head</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  )
}

function Toggle({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string
  checked: boolean
  onChange?: (v: boolean) => void
  title: string
  description: string
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-semibold text-strong">{title}</span>
        <span className="mt-0.5 block max-w-prose text-xs text-muted">
          {description}
        </span>
      </span>
    </label>
  )
}
