'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Hash, Plus, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import {
  allocateRollNumbersAction,
  createSectionAction,
  reallocateNumberAction,
  releaseRollNumberAction,
} from './actions'

export function ScopePicker({
  courses,
  batches,
  courseId,
  batchId,
  courseYear,
}: {
  courses: { id: string; name: string; durationYears: number }[]
  batches: { id: string; name: string }[]
  courseId: string | null
  batchId: string | null
  courseYear: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const push = (key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(key, value)
    else sp.delete(key)
    startTransition(() => router.push(`/admissions/roll-numbers?${sp.toString()}`))
  }

  const years = courses.find((c) => c.id === courseId)?.durationYears ?? 3

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[rgb(var(--border-base))] px-5 py-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Course</span>
        <Select
          value={courseId ?? ''}
          onChange={(e) => push('courseId', e.target.value)}
          className="h-9 w-auto min-w-[160px] text-[13px]"
        >
          <option value="">Select a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Batch</span>
        <Select
          value={batchId ?? ''}
          onChange={(e) => push('batchId', e.target.value)}
          className="h-9 w-auto min-w-[140px] text-[13px]"
        >
          <option value="">Select a batch…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Year</span>
        <Select
          value={String(courseYear)}
          onChange={(e) => push('courseYear', e.target.value)}
          className="h-9 w-auto min-w-[90px] text-[13px]"
        >
          {Array.from({ length: years }, (_, i) => i + 1).map((y) => (
            <option key={y} value={y}>Year {y}</option>
          ))}
        </Select>
      </label>
    </div>
  )
}

export function AddSection({
  courseId,
  batchId,
  courseYear,
  branches,
}: {
  courseId: string
  batchId: string
  courseYear: number
  branches?: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Add section
      </Button>

      {open && (
        <Dialog title="Add a section" onClose={() => setOpen(false)}>
          <form action={createSectionAction} className="space-y-4">
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="courseYear" value={courseYear} />

            {branches && branches.length > 0 && (
              <Field label="Branch" htmlFor="sec-branch" required>
                <Select id="sec-branch" name="branchId" defaultValue="" required>
                  <option value="">Select a branch…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Section name" htmlFor="sec-name" required hint="A, B, C…">
              <Input id="sec-name" name="name" maxLength={4} required autoFocus />
            </Field>
            <Field label="Capacity" htmlFor="sec-cap" hint="Optional.">
              <Input id="sec-cap" name="capacity" type="number" min={1} />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add section</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function AllocateNumbers({
  sections,
  students,
}: {
  sections: { id: string; name: string; nextNumber: number }[]
  students: { id: string; label: string; meta: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '')

  if (sections.length === 0 || students.length === 0) return null
  const next = sections.find((s) => s.id === sectionId)?.nextNumber ?? 1

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Hash className="h-4 w-4" aria-hidden />
        Allocate ({students.length})
      </Button>

      {open && (
        <Dialog
          title="Allocate roll numbers"
          subtitle={`${students.length} student${students.length === 1 ? ' has' : 's have'} no roll number for this year.`}
          onClose={() => setOpen(false)}
          wide
        >
          <form action={allocateRollNumbersAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section" htmlFor="alloc-section" required>
                <Select
                  id="alloc-section"
                  name="sectionId"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  required
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>Section {s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Start from"
                htmlFor="alloc-start"
                hint={`Leave blank to continue from ${next}.`}
              >
                <Input id="alloc-start" name="startFrom" type="number" min={1} placeholder={String(next)} />
              </Field>
            </div>

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

            <ul className="scroll-slim max-h-64 divide-y divide-[rgb(var(--border-base))] overflow-y-auto rounded-lg border border-[rgb(var(--border-base))]">
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
                  </label>
                </li>
              ))}
            </ul>

            <p className="text-xs text-faint">
              Numbers are given in name order, skipping any already taken.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={picked.length === 0}>
                Allocate {picked.length || ''}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function ReleaseButton({
  rollNumberId,
  studentName,
  rollNo,
}: {
  rollNumberId: string
  studentName: string
  rollNo: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Free roll number ${rollNo}`}
        className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
      >
        <UserMinus className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <Dialog title={`Free roll number ${rollNo}?`} onClose={() => setOpen(false)}>
          <p className="text-sm text-muted">
            <strong className="text-strong">{studentName}</strong> will be dropped
            from this section and number {rollNo} becomes available to
            reallocate. The record of who held it is kept.
          </p>
          <form action={releaseRollNumberAction} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="rollNumberId" value={rollNumberId} />
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">Free the number</Button>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function ReallocateButton({
  rollNumberId,
  rollNo,
  sectionName,
  students,
}: {
  rollNumberId: string
  rollNo: number
  sectionName: string
  students: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  if (students.length === 0) return null

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Reallocate
      </Button>

      {open && (
        <Dialog
          title={`Give roll number ${rollNo} to another student`}
          subtitle={`Section ${sectionName}`}
          onClose={() => setOpen(false)}
        >
          <form action={reallocateNumberAction} className="space-y-4">
            <input type="hidden" name="rollNumberId" value={rollNumberId} />
            <Field label="Student" htmlFor={`re-${rollNumberId}`} required>
              <Select id={`re-${rollNumberId}`} name="studentId" defaultValue="" required>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Reallocate</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

function Dialog({
  title,
  subtitle,
  onClose,
  wide,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        className={
          'animate-fade-in surface-card relative z-10 w-full rounded-card p-5 shadow-popover ' +
          (wide ? 'max-w-lg' : 'max-w-md')
        }
      >
        <h2 className="text-base font-semibold text-strong">{title}</h2>
        {subtitle && <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>}
        {!subtitle && <div className="mb-4" />}
        {children}
      </div>
    </div>
  )
}
