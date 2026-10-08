'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, Save } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { saveMarksAction, type ResultState } from '../actions'

export interface Paper {
  subjectId: string
  name: string
  code: string
  maxMarks: number
  passMarks: number
}

export interface StudentRow {
  id: string
  name: string
  admissionNo: string
  /** Outstanding fee in paise — surfaced, not auto-acted on. */
  outstandingPaise: number
  withheld: boolean
  marks: Record<string, { marks: number | null; isAbsent: boolean }>
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <Save className="h-4 w-4" aria-hidden />
      {pending ? 'Saving…' : 'Save marks'}
    </Button>
  )
}

/**
 * Mark entry for a whole cohort.
 *
 * Absent is a checkbox rather than a blank or a zero, because "absent" and
 * "scored nothing" are different facts and the mark sheet must say which.
 */
export function MarkGrid({
  scheduleId,
  papers,
  students,
  canEdit,
}: {
  scheduleId: string
  papers: Paper[]
  students: StudentRow[]
  canEdit: boolean
}) {
  const action = saveMarksAction.bind(null, scheduleId)
  const [state, formAction] = useActionState<ResultState, FormData>(action, {})
  const [absent, setAbsent] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of students) {
      for (const p of papers) {
        if (s.marks[p.subjectId]?.isAbsent) init[`${s.id}:${p.subjectId}`] = true
      }
    }
    return init
  })

  const cellError = (studentId: string, subjectId: string) =>
    state.cellErrors?.[`${studentId}:${subjectId}`]

  return (
    <form action={formAction}>
      {state.error && (
        <p
          role="alert"
          className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.ok}
        </p>
      )}

      <div className="scroll-slim mt-4 w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border-base))]">
              <th className="sticky left-0 z-10 bg-[rgb(var(--surface-card))] px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                Student
              </th>
              {papers.map((p) => (
                <th
                  key={p.subjectId}
                  className="whitespace-nowrap px-2 py-2.5 text-center text-xs font-semibold text-muted"
                >
                  <span className="block truncate text-strong" title={p.name}>
                    {p.code}
                  </span>
                  <span className="numeric block font-normal text-faint">
                    /{p.maxMarks} · pass {p.passMarks}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                Withhold
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr
                key={s.id}
                className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
              >
                <td className="sticky left-0 z-10 bg-[rgb(var(--surface-card))] px-5 py-2">
                  <span className="block truncate font-medium text-strong">{s.name}</span>
                  <span className="numeric block truncate text-xs text-muted">
                    {s.admissionNo}
                    {s.outstandingPaise > 0 && (
                      <Badge tone="caution" className="ml-1.5">
                        Fees due
                      </Badge>
                    )}
                  </span>
                </td>

                {papers.map((p) => {
                  const key = `${s.id}:${p.subjectId}`
                  const isAbsent = absent[key] ?? false
                  const error = cellError(s.id, p.subjectId)
                  return (
                    <td key={p.subjectId} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        name={`mark:${key}`}
                        aria-label={`${p.name} marks for ${s.name}`}
                        defaultValue={s.marks[p.subjectId]?.marks ?? ''}
                        min={0}
                        max={p.maxMarks}
                        step="0.5"
                        disabled={!canEdit || isAbsent}
                        className={cn(
                          'numeric h-9 w-16 rounded-md border bg-[rgb(var(--surface-card))] text-center text-sm text-strong focus:outline-none disabled:bg-[rgb(var(--surface-sunken))] disabled:text-faint',
                          error
                            ? 'border-critical-500 focus:border-critical-600'
                            : 'border-[rgb(var(--border-base))] focus:border-brand-500',
                        )}
                      />
                      <label className="mt-1 flex items-center justify-center gap-1 text-[11px] text-faint">
                        <input
                          type="checkbox"
                          name={`absent:${key}`}
                          checked={isAbsent}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setAbsent((cur) => ({ ...cur, [key]: e.target.checked }))
                          }
                          className="h-3 w-3 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                        />
                        Abs
                      </label>
                      {error && (
                        <span className="mt-0.5 block text-[10px] text-critical-600 dark:text-critical-500">
                          {error}
                        </span>
                      )}
                    </td>
                  )
                })}

                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    name="withhold"
                    value={s.id}
                    defaultChecked={s.withheld}
                    disabled={!canEdit}
                    aria-label={`Withhold result for ${s.name}`}
                    className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-5 py-3">
          <p className="text-xs text-muted">
            Marks are totalled and graded on save. A student must pass every
            paper to pass overall.
          </p>
          <SaveButton />
        </div>
      )}
    </form>
  )
}
