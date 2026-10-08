'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { saveScheduleAction, type ExamState } from '../actions'

const TERMS = [
  ['MID_TERM', 'Mid term'],
  ['ANNUAL', 'Annual'],
  ['SUPPLEMENTARY', 'Supplementary'],
  ['AFFILIATION', 'University / affiliation'],
] as const

export interface ScheduleValues {
  name?: string
  courseId?: string | null
  batchId?: string | null
  courseYear?: number | null
  term?: string | null
  examCentreId?: string | null
  startDate?: Date | null
  endDate?: Date | null
}

function iso(d: Date | null | undefined) {
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

export function ScheduleForm({
  scheduleId,
  values = {},
  courses,
  batches,
  centres,
  branches,
}: {
  scheduleId: string | null
  values?: ScheduleValues
  courses: { id: string; name: string; durationYears: number }[]
  batches: { id: string; name: string }[]
  centres: { id: string; name: string }[]
  branches?: { id: string; name: string }[]
}) {
  const action = saveScheduleAction.bind(null, scheduleId)
  const [state, formAction] = useActionState<ExamState, FormData>(action, {})

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

      {branches && branches.length > 0 && (
        <Field label="Branch" htmlFor="ex-branch" required>
          <Select id="ex-branch" name="branchId" defaultValue="" required>
            <option value="">Select a branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Examination name"
        htmlFor="ex-name"
        required
        hint="How staff and students will refer to it, e.g. “B.Com Year 1 Annual 2026”."
      >
        <Input id="ex-name" name="name" defaultValue={values.name ?? ''} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course" htmlFor="ex-course" required>
          <Select id="ex-course" name="courseId" defaultValue={values.courseId ?? ''} required>
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Course year" htmlFor="ex-year" required>
          <Input
            id="ex-year"
            name="courseYear"
            type="number"
            min={1}
            max={6}
            defaultValue={values.courseYear ?? 1}
            required
          />
        </Field>

        <Field label="Batch" htmlFor="ex-batch" hint="Optional — leave blank to cover every batch.">
          <Select id="ex-batch" name="batchId" defaultValue={values.batchId ?? ''}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Term" htmlFor="ex-term" required>
          <Select id="ex-term" name="term" defaultValue={values.term ?? 'ANNUAL'} required>
            {TERMS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>

        <Field label="Examination centre" htmlFor="ex-centre">
          <Select id="ex-centre" name="examCentreId" defaultValue={values.examCentreId ?? ''}>
            <option value="">Not specified</option>
            {centres.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <div />

        <Field label="Starts" htmlFor="ex-start" required>
          <Input id="ex-start" name="startDate" type="date" defaultValue={iso(values.startDate)} required />
        </Field>

        <Field label="Ends" htmlFor="ex-end" required>
          <Input id="ex-end" name="endDate" type="date" defaultValue={iso(values.endDate)} required />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-[rgb(var(--border-base))] pt-4">
        <Link href="/exams/schedule">
          <Button type="button" variant="secondary">Cancel</Button>
        </Link>
        <SubmitButton label={scheduleId ? 'Save changes' : 'Create examination'} />
      </div>
    </form>
  )
}
