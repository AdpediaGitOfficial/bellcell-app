'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, UserCheck, UserX } from 'lucide-react'
import type { AttendanceStatus } from '@prisma/client'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { STUDENT_STATUS_LABELS } from '@/lib/attendance/core'
import { saveSessionAction, type SessionState } from './actions'

export interface MarkRow {
  id: string
  name: string
  admissionNo: string
  rollNo: number | null
  status: AttendanceStatus
}

export interface SessionKeyFields {
  branchId: string
  courseId: string
  batchId: string
  courseYear: number
  sectionId: string
  subjectId: string
  period: string
  date: string
}

const CYCLE: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']

const TONE: Record<AttendanceStatus, string> = {
  PRESENT:
    'bg-positive-50 text-positive-700 ring-positive-500/30 dark:bg-positive-700/15 dark:text-positive-500',
  ABSENT:
    'bg-critical-50 text-critical-700 ring-critical-500/30 dark:bg-critical-700/15 dark:text-critical-500',
  LATE: 'bg-caution-50 text-caution-700 ring-caution-500/30 dark:bg-caution-700/15 dark:text-caution-500',
  EXCUSED:
    'bg-info-50 text-info-700 ring-info-500/30 dark:bg-info-700/15 dark:text-info-500',
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

/**
 * The register.
 *
 * Marking is one click per student, cycling present → absent → late →
 * excused, because the realistic alternative (a select per row, forty rows)
 * is what makes staff stop taking attendance.
 */
export function MarkSheet({
  keyFields,
  rows,
  locked,
  canEdit,
  existing,
}: {
  keyFields: SessionKeyFields
  rows: MarkRow[]
  locked: boolean
  canEdit: boolean
  existing: boolean
}) {
  const [state, formAction] = useActionState<SessionState, FormData>(
    saveSessionAction,
    {},
  )
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.status])),
  )

  const setAll = (status: AttendanceStatus) =>
    setStatuses(Object.fromEntries(rows.map((r) => [r.id, status])))

  const cycle = (id: string) =>
    setStatuses((prev) => {
      const current = prev[id] ?? 'PRESENT'
      const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!
      return { ...prev, [id]: next }
    })

  const counts = CYCLE.map((s) => ({
    status: s,
    n: rows.filter((r) => (statuses[r.id] ?? 'PRESENT') === s).length,
  }))

  return (
    <form action={formAction}>
      <input type="hidden" name="branchId" value={keyFields.branchId} />
      <input type="hidden" name="courseId" value={keyFields.courseId} />
      <input type="hidden" name="batchId" value={keyFields.batchId} />
      <input type="hidden" name="courseYear" value={keyFields.courseYear} />
      <input type="hidden" name="sectionId" value={keyFields.sectionId} />
      <input type="hidden" name="subjectId" value={keyFields.subjectId} />
      <input type="hidden" name="period" value={keyFields.period} />
      <input type="hidden" name="date" value={keyFields.date} />

      {(state.error || state.notice) && (
        <div className="mb-4">
          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {state.notice}
            </p>
          )}
        </div>
      )}

      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border-base))] px-5 py-3">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {counts.map((c) => (
              <span
                key={c.status}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                  TONE[c.status],
                )}
              >
                {STUDENT_STATUS_LABELS[c.status]}
                <span className="numeric font-semibold">{c.n}</span>
              </span>
            ))}
          </p>

          {canEdit && !locked && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAll('PRESENT')}
              >
                <UserCheck className="h-4 w-4" aria-hidden />
                All present
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAll('ABSENT')}
              >
                <UserX className="h-4 w-4" aria-hidden />
                All absent
              </Button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No students found for this class. Check the course, batch, year and
            section.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {rows.map((r) => {
              const status = statuses[r.id] ?? 'PRESENT'
              return (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2">
                  <input type="hidden" name="studentId" value={r.id} />
                  <input type="hidden" name={`status.${r.id}`} value={status} />

                  {r.rollNo !== null && (
                    <span className="numeric w-8 shrink-0 text-xs text-faint">
                      {r.rollNo}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-strong">
                      {r.name}
                    </span>
                    <span className="numeric block text-xs text-muted">
                      {r.admissionNo}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => cycle(r.id)}
                    disabled={!canEdit || locked}
                    aria-label={`${r.name}: ${STUDENT_STATUS_LABELS[status]}. Click to change.`}
                    className={cn(
                      'w-24 shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
                      TONE[status],
                      (!canEdit || locked) && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    {STUDENT_STATUS_LABELS[status]}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {canEdit && !locked && rows.length > 0 && (
        <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-4 py-3 shadow-card">
          <p className="text-xs text-muted">
            Tap a student to cycle present → absent → late → excused. Excused
            leaves them out of the percentage entirely.
          </p>
          <Submit label={existing ? 'Update register' : 'Save register'} />
        </div>
      )}

      {locked && (
        <p className="mt-4 rounded-card surface-card px-4 py-3 text-sm text-muted shadow-card">
          This register is locked. Unlock it to make a correction.
        </p>
      )}
    </form>
  )
}
