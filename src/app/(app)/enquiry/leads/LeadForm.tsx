'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { saveLeadAction, type FormState } from './actions'

export interface LeadFormOptions {
  courses: { id: string; name: string }[]
  sources: { id: string; name: string }[]
  statuses: { id: string; name: string }[]
  counsellors: { id: string; fullName: string }[]
  /** Present only when the user is viewing all branches and must pick one. */
  branches?: { id: string; name: string }[]
}

export interface LeadFormValues {
  name?: string
  phone?: string
  altPhone?: string | null
  email?: string | null
  city?: string | null
  courseId?: string | null
  sourceId?: string | null
  callStatusId?: string | null
  assignedToId?: string | null
  notes?: string | null
  nextCallAt?: Date | null
}

/** <input type="datetime-local"> wants a local-time string, not an ISO UTC one. */
function toLocalInput(d: Date | null | undefined): string {
  if (!d) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function LeadForm({
  leadId,
  values = {},
  options,
}: {
  leadId: string | null
  values?: LeadFormValues
  options: LeadFormOptions
}) {
  const action = saveLeadAction.bind(null, leadId)
  const [state, formAction] = useActionState<FormState, FormData>(action, {})
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

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Shown only in all-branches mode: a new record needs one branch. */}
        {options.branches && options.branches.length > 0 && (
          <Field
            label="Branch"
            htmlFor="branchId"
            required
            error={err.branchId}
            className="sm:col-span-2"
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

        <Field label="Name" htmlFor="name" required error={err.name}>
          <Input id="name" name="name" defaultValue={values.name ?? ''} required />
        </Field>

        <Field
          label="Mobile number"
          htmlFor="phone"
          required
          error={err.phone}
          hint="10 digits. +91 and leading zeros are accepted."
        >
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            defaultValue={values.phone ?? ''}
            required
          />
        </Field>

        <Field label="Alternate number" htmlFor="altPhone" error={err.altPhone}>
          <Input id="altPhone" name="altPhone" inputMode="tel" defaultValue={values.altPhone ?? ''} />
        </Field>

        <Field label="Email" htmlFor="email" error={err.email}>
          <Input id="email" name="email" type="email" defaultValue={values.email ?? ''} />
        </Field>

        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={values.city ?? ''} />
        </Field>

        <Field label="Course interested" htmlFor="courseId">
          <Select id="courseId" name="courseId" defaultValue={values.courseId ?? ''}>
            <option value="">Not specified</option>
            {options.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Source" htmlFor="sourceId">
          <Select id="sourceId" name="sourceId" defaultValue={values.sourceId ?? ''}>
            <option value="">Not specified</option>
            {options.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Call status" htmlFor="callStatusId">
          <Select id="callStatusId" name="callStatusId" defaultValue={values.callStatusId ?? ''}>
            <option value="">Not called yet</option>
            {options.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Assigned to" htmlFor="assignedToId">
          <Select id="assignedToId" name="assignedToId" defaultValue={values.assignedToId ?? ''}>
            <option value="">Unassigned</option>
            {options.counsellors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Next call" htmlFor="nextCallAt">
          <Input
            id="nextCallAt"
            name="nextCallAt"
            type="datetime-local"
            defaultValue={toLocalInput(values.nextCallAt)}
          />
        </Field>

        <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes ?? ''} />
        </Field>
      </div>

      {/* Sticky action bar — the record is long enough that Save must not
          scroll away. */}
      <div className="sticky bottom-0 -mx-5 mt-6 flex justify-end gap-2 border-t border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-5 py-3">
        <Link href="/enquiry/leads">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
        <SubmitButton label={leadId ? 'Save changes' : 'Add lead'} />
      </div>
    </form>
  )
}
