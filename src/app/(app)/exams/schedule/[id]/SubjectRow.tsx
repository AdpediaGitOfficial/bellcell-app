'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { addScheduleSubjectAction, removeScheduleSubjectAction } from '../../actions'

export function AddPaper({
  scheduleId,
  subjects,
  defaultDate,
}: {
  scheduleId: string
  subjects: { id: string; name: string; code: string; maxMarks: number }[]
  defaultDate: string
}) {
  const [open, setOpen] = useState(false)
  if (subjects.length === 0) return null

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add paper
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add paper"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="mb-4 text-base font-semibold text-strong">Add a paper</h2>

            <form action={addScheduleSubjectAction} className="space-y-4">
              <input type="hidden" name="scheduleId" value={scheduleId} />

              <Field label="Subject" htmlFor="sp-subject" required>
                <Select id="sp-subject" name="subjectId" defaultValue="" required autoFocus>
                  <option value="">Select a subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date" htmlFor="sp-date" required>
                  <Input id="sp-date" name="examDate" type="date" defaultValue={defaultDate} required />
                </Field>
                <Field label="Max marks" htmlFor="sp-max" hint="Defaults to the subject master.">
                  <Input id="sp-max" name="maxMarks" type="number" min={1} />
                </Field>
                <Field label="From" htmlFor="sp-from">
                  <Input id="sp-from" name="startTime" type="time" />
                </Field>
                <Field label="To" htmlFor="sp-to">
                  <Input id="sp-to" name="endTime" type="time" />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add paper</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function RemovePaper({
  scheduleSubjectId,
  subjectName,
  hasMarks,
}: {
  scheduleSubjectId: string
  subjectName: string
  hasMarks: boolean
}) {
  if (hasMarks) {
    return (
      <span
        className="px-1.5 py-1 text-[11px] text-faint"
        title="Marks have been entered against this paper"
      >
        Locked
      </span>
    )
  }
  return (
    <form action={removeScheduleSubjectAction}>
      <input type="hidden" name="scheduleSubjectId" value={scheduleSubjectId} />
      <button
        type="submit"
        aria-label={`Remove ${subjectName}`}
        className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </form>
  )
}
