'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Award, AlertCircle, FileOutput } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { issueCompletionAction, issueTcAction, type CertState } from './actions'

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Issuing…' : label}
    </Button>
  )
}

export function IssueTc({ students }: { students: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<CertState, FormData>(issueTcAction, {})

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <FileOutput className="h-4 w-4" aria-hidden />
        Issue TC
      </Button>

      {open && (
        <Dialog title="Issue a Transfer Certificate" onClose={() => setOpen(false)}>
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

            <Field label="Student" htmlFor="tc-student" required>
              <Select id="tc-student" name="studentId" defaultValue="" required>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="Issue date" htmlFor="tc-date" required>
              <Input
                id="tc-date"
                name="issuedAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>

            <Field label="Reason for leaving" htmlFor="tc-reason">
              <Input id="tc-reason" name="reason" />
            </Field>

            <Field label="Conduct" htmlFor="tc-conduct" hint="As printed on the certificate.">
              <Textarea id="tc-conduct" name="conductRemark" rows={2} defaultValue="Good" />
            </Field>

            <p className="text-xs text-faint">
              A TC cannot be issued while the institute still holds any of the
              student&rsquo;s original documents.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton label="Issue TC" />
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

export function IssueCompletion({
  students,
}: {
  students: { id: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<CertState, FormData>(
    issueCompletionAction,
    {},
  )

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Award className="h-4 w-4" aria-hidden />
        Issue completion certificate
      </Button>

      {open && (
        <Dialog title="Issue a course completion certificate" onClose={() => setOpen(false)}>
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

            <Field label="Student" htmlFor="cc-student" required>
              <Select id="cc-student" name="studentId" defaultValue="" required>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Completion date" htmlFor="cc-date" required>
                <Input
                  id="cc-date"
                  name="completionDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field label="Grade" htmlFor="cc-grade" hint="Optional, as awarded.">
                <Input id="cc-grade" name="grade" />
              </Field>
            </div>

            <p className="text-xs text-faint">
              Only students who have reached the final year of their course can
              be issued one.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton label="Issue certificate" />
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10"
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
