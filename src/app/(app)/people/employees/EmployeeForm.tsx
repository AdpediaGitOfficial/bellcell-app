'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { saveEmployeeAction, type EmployeeState } from './actions'

export interface EmployeeFormOptions {
  departments: { id: string; name: string }[]
  /** Present only when the user is viewing all branches and must pick one. */
  branches?: { id: string; name: string }[]
}

export interface EmployeeFormValues {
  employeeCode?: string
  firstName?: string
  lastName?: string | null
  dateOfBirth?: Date | null
  gender?: string | null
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  departmentId?: string | null
  designation?: string | null
  dateOfJoining?: Date | null
  dateOfLeaving?: Date | null
  status?: string
}

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function EmployeeForm({
  employeeId,
  values = {},
  options,
  cancelHref,
}: {
  employeeId: string | null
  values?: EmployeeFormValues
  options: EmployeeFormOptions
  cancelHref: string
}) {
  const action = saveEmployeeAction.bind(null, employeeId)
  const [state, formAction] = useActionState<EmployeeState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction}>
      {state.error && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {options.branches && options.branches.length > 0 && (
        <div className="mb-6">
          <Field
            label="Branch"
            htmlFor="branchId"
            required
            error={err.branchId}
            hint="You are viewing all branches, so the branch must be chosen explicitly."
          >
            <Select id="branchId" name="branchId" defaultValue="" required>
              <option value="">Select a branch…</option>
              {options.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <Section title="Identity">
        <Field
          label="Employee code"
          htmlFor="employeeCode"
          required
          error={err.employeeCode}
          hint="Unique within the branch."
        >
          <Input
            id="employeeCode"
            name="employeeCode"
            defaultValue={values.employeeCode ?? ''}
            required
          />
        </Field>
        <Field label="First name" htmlFor="firstName" required error={err.firstName}>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={values.firstName ?? ''}
            required
          />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" defaultValue={values.lastName ?? ''} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth">
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={toDateInput(values.dateOfBirth)}
          />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" name="gender" defaultValue={values.gender ?? ''}>
            <option value="">Not stated</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
      </Section>

      <Section title="Contact">
        <Field
          label="Mobile number"
          htmlFor="phone"
          error={err.phone}
          hint="10 digits. +91 and leading zeros are accepted."
        >
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={values.phone ?? ''}
          />
        </Field>
        <Field label="Alternate number" htmlFor="altPhone">
          <Input
            id="altPhone"
            name="altPhone"
            inputMode="tel"
            defaultValue={values.altPhone ?? ''}
          />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          error={err.email}
          hint="Used for correspondence. A login has its own sign-in address."
        >
          <Input id="email" name="email" type="email" defaultValue={values.email ?? ''} />
        </Field>
        <Field label="Address" htmlFor="addressLine1" className="sm:col-span-2">
          <Input
            id="addressLine1"
            name="addressLine1"
            defaultValue={values.addressLine1 ?? ''}
          />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={values.city ?? ''} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" defaultValue={values.state ?? ''} />
        </Field>
        <Field label="PIN code" htmlFor="pincode">
          <Input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            defaultValue={values.pincode ?? ''}
          />
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Department" htmlFor="departmentId">
          <Select
            id="departmentId"
            name="departmentId"
            defaultValue={values.departmentId ?? ''}
          >
            <option value="">Not assigned</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Designation" htmlFor="designation">
          <Input
            id="designation"
            name="designation"
            placeholder="Lecturer, Office Assistant…"
            defaultValue={values.designation ?? ''}
          />
        </Field>
        <Field label="Status" htmlFor="status" required>
          <Select id="status" name="status" defaultValue={values.status ?? 'ACTIVE'} required>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="RESIGNED">Resigned</option>
            <option value="TERMINATED">Terminated</option>
          </Select>
        </Field>
        <Field label="Date of joining" htmlFor="dateOfJoining">
          <Input
            id="dateOfJoining"
            name="dateOfJoining"
            type="date"
            defaultValue={toDateInput(values.dateOfJoining)}
          />
        </Field>
        <Field
          label="Date of leaving"
          htmlFor="dateOfLeaving"
          error={err.dateOfLeaving}
          hint="Leave blank while the employee is on roll."
        >
          <Input
            id="dateOfLeaving"
            name="dateOfLeaving"
            type="date"
            defaultValue={toDateInput(values.dateOfLeaving)}
          />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-2 border-t border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-5 py-3">
        <Link href={cancelHref}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <SubmitButton label={employeeId ? 'Save changes' : 'Add employee'} />
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
