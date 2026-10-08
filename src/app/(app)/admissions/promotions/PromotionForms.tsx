'use client'

import { useActionState, useState } from 'react'
import { ArrowUpRight, CheckCircle2, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { promoteStudentsAction, transferCourseAction, type MoveState } from './actions'

export function PromotePanel({
  students,
  batches,
}: {
  students: { id: string; label: string; meta: string; year: number; finalYear: boolean }[]
  batches: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<MoveState, FormData>(promoteStudentsAction, {})
  const [picked, setPicked] = useState<string[]>([])

  const finishing = students.filter((s) => picked.includes(s.id) && s.finalYear).length

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      )}

      {students.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No active students available to promote in this branch.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{picked.length} selected</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicked(students.map((s) => s.id))}
                className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setPicked([])}
                className="text-xs font-medium text-muted hover:text-strong"
              >
                Clear
              </button>
            </span>
          </div>

          <ul className="scroll-slim max-h-80 divide-y divide-[rgb(var(--border-base))] overflow-y-auto rounded-lg border border-[rgb(var(--border-base))]">
            {students.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[rgb(var(--surface-hover))]">
                  <input
                    type="checkbox"
                    name="studentIds"
                    value={s.id}
                    checked={picked.includes(s.id)}
                    onChange={() =>
                      setPicked((cur) =>
                        cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id],
                      )
                    }
                    className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-strong">{s.label}</span>
                    <span className="numeric block truncate text-xs text-muted">{s.meta}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    Year {s.year}
                    {s.finalYear && (
                      <span className="ml-1 text-positive-700 dark:text-positive-500">
                        → completes
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <Field
            label="Move to batch"
            htmlFor="to-batch"
            hint="Optional. Leave blank to keep students in their current batch."
          >
            <Select id="to-batch" name="toBatchId" defaultValue="">
              <option value="">Keep current batch</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Remarks" htmlFor="promo-rem">
            <Input id="promo-rem" name="remarks" />
          </Field>

          {finishing > 0 && (
            <p className="rounded-lg bg-info-50 px-3 py-2 text-sm text-info-700 dark:bg-info-500/10 dark:text-info-500">
              {finishing} of the selected students {finishing === 1 ? 'is' : 'are'} in
              their final year and will be marked <strong>Completed</strong> rather
              than promoted.
            </p>
          )}

          <p className="text-xs text-faint">
            Roll numbers for the year being left are freed automatically; allocate
            new ones on the Roll Numbers screen.
          </p>

          <div className="flex justify-end">
            <Button type="submit" disabled={picked.length === 0}>
              <ArrowUpRight className="h-4 w-4" aria-hidden />
              Promote {picked.length || ''}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

export function TransferPanel({
  students,
  courses,
}: {
  students: { id: string; label: string; course: string }[]
  courses: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<MoveState, FormData>(transferCourseAction, {})

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      )}

      <Field label="Student" htmlFor="tr-student" required>
        <Select id="tr-student" name="studentId" defaultValue="" required>
          <option value="">Select a student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} — currently {s.course}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Transfer to course" htmlFor="tr-course" required>
        <Select id="tr-course" name="toCourseId" defaultValue="" required>
          <option value="">Select a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>

      <Field
        label="Fee adjustment"
        htmlFor="tr-fee"
        hint="In rupees. Positive if the student owes more, negative if less. Recorded here; apply it on the Fees tab."
      >
        <Input id="tr-fee" name="feeAdjustment" inputMode="decimal" placeholder="0.00" />
      </Field>

      <Field label="Reason" htmlFor="tr-reason" required>
        <Textarea id="tr-reason" name="reason" rows={3} required />
      </Field>

      <p className="text-xs text-faint">
        The student&rsquo;s current roll number is freed, since it belongs to the
        old course.
      </p>

      <div className="flex justify-end">
        <Button type="submit">
          <Repeat className="h-4 w-4" aria-hidden />
          Transfer course
        </Button>
      </div>
    </form>
  )
}
