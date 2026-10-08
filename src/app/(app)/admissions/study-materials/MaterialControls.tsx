'use client'

import { useActionState, useState } from 'react'
import { BookPlus, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { issueMaterialAction, saveMaterialAction, type IssueState } from './actions'

export function IssueMaterial({
  materials,
  students,
}: {
  materials: { id: string; label: string; available: number }[]
  students: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<IssueState, FormData>(issueMaterialAction, {})

  if (materials.length === 0 || students.length === 0) return null

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <BookPlus className="h-4 w-4" aria-hidden />
        Issue material
      </Button>

      {open && (
        <Dialog title="Issue study material" onClose={() => setOpen(false)}>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <p
                role="alert"
                className="rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
              >
                {state.error}
              </p>
            )}

            <Field label="Student" htmlFor="issue-student" required>
              <Select id="issue-student" name="studentId" defaultValue="" required>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="Material" htmlFor="issue-material" required>
              <Select id="issue-material" name="materialId" defaultValue="" required>
                <option value="">Select a material…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.available <= 0}>
                    {m.label} {m.available > 0 ? `(${m.available} left)` : '(out of stock)'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Quantity" htmlFor="issue-qty" required>
              <Input id="issue-qty" name="quantity" type="number" min={1} defaultValue={1} required />
            </Field>

            <Field label="Remarks" htmlFor="issue-rem">
              <Textarea id="issue-rem" name="remarks" rows={2} />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Issue</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function AddMaterial({
  courses,
}: {
  courses: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PackagePlus className="h-4 w-4" aria-hidden />
        Add material
      </Button>

      {open && (
        <Dialog title="Add study material" onClose={() => setOpen(false)}>
          <form action={saveMaterialAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="mat-code" required>
                <Input id="mat-code" name="code" required autoFocus />
              </Field>
              <Field label="Kind" htmlFor="mat-kind">
                <Select id="mat-kind" name="kind" defaultValue="BOOK">
                  <option value="BOOK">Book</option>
                  <option value="SYLLABUS">Syllabus</option>
                  <option value="NOTES">Notes</option>
                  <option value="KIT">Kit</option>
                  <option value="DIGITAL">Digital</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Title" htmlFor="mat-title" required className="sm:col-span-2">
                <Input id="mat-title" name="title" required />
              </Field>
              <Field label="Course" htmlFor="mat-course">
                <Select id="mat-course" name="courseId" defaultValue="">
                  <option value="">Any course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Stock" htmlFor="mat-stock" hint="0 means stock is not tracked.">
                <Input id="mat-stock" name="stockTotal" type="number" min={0} defaultValue={0} />
              </Field>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Add material</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
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
      <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
        <h2 className="mb-4 text-base font-semibold text-strong">{title}</h2>
        {children}
      </div>
    </div>
  )
}
