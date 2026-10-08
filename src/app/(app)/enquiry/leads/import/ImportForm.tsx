'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { importLeadsAction, type ImportState } from '../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <FileUp className="h-4 w-4" aria-hidden />
      {pending ? 'Importing…' : 'Import leads'}
    </Button>
  )
}

export function ImportForm({
  sources,
  counsellors,
  branches,
}: {
  sources: { id: string; name: string }[]
  counsellors: { id: string; fullName: string }[]
  branches?: { id: string; name: string }[]
}) {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importLeadsAction,
    {},
  )

  return (
    <>
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
          <Field
            label="Import into branch"
            htmlFor="branchId"
            required
            hint="You are viewing all branches, so the destination must be chosen."
          >
            <Select id="branchId" name="branchId" defaultValue="" required>
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="CSV file"
          htmlFor="file"
          required
          hint="Maximum 5 MB / 5,000 rows per import."
        >
          <Input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 dark:file:bg-brand-500/15 dark:file:text-brand-300"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Set source for all rows"
            htmlFor="sourceId"
            hint="Applied to every imported lead."
          >
            <Select id="sourceId" name="sourceId" defaultValue="">
              <option value="">Leave blank</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assign all rows to" htmlFor="assignedToId">
            <Select id="assignedToId" name="assignedToId" defaultValue="">
              <option value="">Unassigned</option>
              {counsellors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/enquiry/leads">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <SubmitButton />
        </div>
      </form>

      {state.result && (
        <div className="mt-6 rounded-lg border border-[rgb(var(--border-base))] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-strong">
            <CheckCircle2
              className="h-4 w-4 text-positive-600 dark:text-positive-500"
              aria-hidden
            />
            Imported {state.result.imported.toLocaleString('en-IN')} of{' '}
            {state.result.total.toLocaleString('en-IN')} rows
          </p>

          {state.result.skipped > 0 && (
            <>
              <p className="mt-2 text-sm text-muted">
                {state.result.skipped.toLocaleString('en-IN')} row
                {state.result.skipped === 1 ? '' : 's'} skipped. The first{' '}
                {Math.min(state.result.problems.length, 50)} are listed below —
                fix them in the file and import again; already-imported rows
                will be detected as duplicates.
              </p>
              <ul className="scroll-slim mt-3 max-h-64 space-y-1 overflow-y-auto text-[13px]">
                {state.result.problems.map((p) => (
                  <li key={p.row} className="flex gap-2">
                    <span className="numeric w-16 shrink-0 text-faint">
                      Row {p.row}
                    </span>
                    <span className="text-muted">{p.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4">
            <Link href="/enquiry/leads">
              <Button size="sm" variant="secondary">
                Back to leads
              </Button>
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
