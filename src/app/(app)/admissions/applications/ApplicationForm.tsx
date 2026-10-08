'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { saveApplicationAction, type ApplicationState } from './actions'

export interface ApplicationFormOptions {
  courses: { id: string; name: string; durationYears: number }[]
  batches: { id: string; name: string }[]
  classModes: { id: string; name: string }[]
  religions: { id: string; name: string }[]
  languages: { id: string; name: string; usableAsMedium: boolean; usableAsSecond: boolean }[]
  affiliations: { id: string; name: string }[]
  branches?: { id: string; name: string }[]
}

export interface ApplicationValues {
  firstName?: string
  lastName?: string | null
  dateOfBirth?: Date | null
  gender?: string | null
  phone?: string | null
  altPhone?: string | null
  email?: string | null
  aadhaarLast4?: string | null
  religionId?: string | null
  category?: string | null
  bloodGroup?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  courseId?: string | null
  batchId?: string | null
  classModeId?: string | null
  affiliationBodyId?: string | null
  mediumId?: string | null
  secondLanguageId?: string | null
  courseYear?: number | null
  admissionDate?: Date | null
  admissionNo?: string | null
  enrolmentNumber?: string | null
  examRegistrationNumber?: string | null
  status?: string | null
}

const STATUSES = [
  ['APPLIED', 'Applied'],
  ['ADMITTED', 'Admitted'],
  ['ACTIVE', 'Active'],
  ['COMPLETED', 'Completed'],
  ['DROPPED', 'Dropped'],
  ['CANCELLED', 'Cancelled'],
] as const

function dateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function ApplicationForm({
  studentId,
  values = {},
  options,
  enquiryId,
}: {
  studentId: string | null
  values?: ApplicationValues
  options: ApplicationFormOptions
  enquiryId?: string
}) {
  const action = saveApplicationAction.bind(null, studentId)
  const [state, formAction] = useActionState<ApplicationState, FormData>(action, {})
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction}>
      {enquiryId && <input type="hidden" name="enquiryId" value={enquiryId} />}

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
        <Field
          label="Branch"
          htmlFor="branchId"
          required
          error={err.branchId}
          className="mb-5"
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
      )}

      <Section title="Personal details">
        <Field label="First name" htmlFor="firstName" required error={err.firstName}>
          <Input id="firstName" name="firstName" defaultValue={values.firstName ?? ''} required />
        </Field>
        <Field label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" defaultValue={values.lastName ?? ''} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth">
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={dateInput(values.dateOfBirth)} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" name="gender" defaultValue={values.gender ?? ''}>
            <option value="">Not specified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Mobile number" htmlFor="phone" error={err.phone}>
          <Input id="phone" name="phone" inputMode="tel" defaultValue={values.phone ?? ''} />
        </Field>
        <Field label="Alternate number" htmlFor="altPhone">
          <Input id="altPhone" name="altPhone" inputMode="tel" defaultValue={values.altPhone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email" error={err.email}>
          <Input id="email" name="email" type="email" defaultValue={values.email ?? ''} />
        </Field>
        <Field
          label="Aadhaar (last 4 digits)"
          htmlFor="aadhaarLast4"
          error={err.aadhaarLast4}
          hint="Only the last four digits are stored — never the full number."
        >
          <Input
            id="aadhaarLast4"
            name="aadhaarLast4"
            inputMode="numeric"
            maxLength={4}
            defaultValue={values.aadhaarLast4 ?? ''}
          />
        </Field>
        <Field label="Religion" htmlFor="religionId">
          <Select id="religionId" name="religionId" defaultValue={values.religionId ?? ''}>
            <option value="">Not specified</option>
            {options.religions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="category" hint="General / OBC / SC / ST — required by most universities.">
          <Input id="category" name="category" defaultValue={values.category ?? ''} />
        </Field>
        <Field label="Blood group" htmlFor="bloodGroup">
          <Input id="bloodGroup" name="bloodGroup" defaultValue={values.bloodGroup ?? ''} />
        </Field>
      </Section>

      <Section title="Address">
        <Field label="Address line 1" htmlFor="addressLine1" className="sm:col-span-2">
          <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1 ?? ''} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2" className="sm:col-span-2">
          <Input id="addressLine2" name="addressLine2" defaultValue={values.addressLine2 ?? ''} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={values.city ?? ''} />
        </Field>
        <Field label="State" htmlFor="state">
          <Input id="state" name="state" defaultValue={values.state ?? ''} />
        </Field>
        <Field label="PIN code" htmlFor="pincode">
          <Input id="pincode" name="pincode" inputMode="numeric" defaultValue={values.pincode ?? ''} />
        </Field>
      </Section>

      <Section title="Course & admission">
        <Field label="Course" htmlFor="courseId" required error={err.courseId}>
          <Select id="courseId" name="courseId" defaultValue={values.courseId ?? ''} required>
            <option value="">Select a course…</option>
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Batch" htmlFor="batchId" required error={err.batchId}>
          <Select id="batchId" name="batchId" defaultValue={values.batchId ?? ''} required>
            <option value="">Select a batch…</option>
            {options.batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Course year" htmlFor="courseYear">
          <Input id="courseYear" name="courseYear" type="number" min={1} max={6} defaultValue={values.courseYear ?? 1} />
        </Field>
        <Field label="Class mode" htmlFor="classModeId">
          <Select id="classModeId" name="classModeId" defaultValue={values.classModeId ?? ''}>
            <option value="">Not specified</option>
            {options.classModes.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Affiliation / tie-up" htmlFor="affiliationBodyId">
          <Select id="affiliationBodyId" name="affiliationBodyId" defaultValue={values.affiliationBodyId ?? ''}>
            <option value="">Not specified</option>
            {options.affiliations.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Medium" htmlFor="mediumId">
          <Select id="mediumId" name="mediumId" defaultValue={values.mediumId ?? ''}>
            <option value="">Not specified</option>
            {options.languages.filter((l) => l.usableAsMedium).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Second language" htmlFor="secondLanguageId">
          <Select id="secondLanguageId" name="secondLanguageId" defaultValue={values.secondLanguageId ?? ''}>
            <option value="">Not specified</option>
            {options.languages.filter((l) => l.usableAsSecond).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Admission date" htmlFor="admissionDate">
          <Input id="admissionDate" name="admissionDate" type="date" defaultValue={dateInput(values.admissionDate)} />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={values.status ?? 'APPLIED'}>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section
        title="University identifiers"
        note="Issued by the affiliating university after admission — leave blank until received."
      >
        <Field label="Admission number" htmlFor="admissionNo" error={err.admissionNo}>
          <Input id="admissionNo" name="admissionNo" defaultValue={values.admissionNo ?? ''} />
        </Field>
        <Field label="Enrolment number" htmlFor="enrolmentNumber">
          <Input id="enrolmentNumber" name="enrolmentNumber" defaultValue={values.enrolmentNumber ?? ''} />
        </Field>
        <Field label="Exam registration number" htmlFor="examRegistrationNumber">
          <Input
            id="examRegistrationNumber"
            name="examRegistrationNumber"
            defaultValue={values.examRegistrationNumber ?? ''}
          />
        </Field>
      </Section>

      {/* The record is long, so Save must not scroll away. */}
      <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-2 border-t border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-5 py-3">
        <Link href="/admissions/applications">
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <SubmitButton label={studentId ? 'Save changes' : 'Create application'} />
      </div>
    </form>
  )
}

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="mb-6 border-t border-[rgb(var(--border-base))] pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h2 className="mb-1 text-sm font-semibold text-strong">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}
