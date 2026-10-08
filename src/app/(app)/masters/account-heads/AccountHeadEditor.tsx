'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { saveAccountHeadAction } from '@/app/(app)/accounts/actions'

export function AccountHeadEditor({
  head,
}: {
  head?: { id: string; code: string; name: string; kind: 'INCOME' | 'EXPENSE' }
}) {
  const [open, setOpen] = useState(false)
  const editing = Boolean(head)

  return (
    <>
      {editing ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${head!.name}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add head
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit account head' : 'Add account head'}
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="mb-4 text-base font-semibold text-strong">
              {editing ? 'Edit account head' : 'Add account head'}
            </h2>

            <form action={saveAccountHeadAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={head!.id} />}

              {!editing && (
                <Field label="Code" htmlFor="ah-code" required>
                  <Input id="ah-code" name="code" required autoFocus />
                </Field>
              )}

              <Field label="Name" htmlFor="ah-name" required>
                <Input id="ah-name" name="name" defaultValue={head?.name ?? ''} required />
              </Field>

              <Field
                label="Type"
                htmlFor="ah-kind"
                required
                hint="Decides whether vouchers under this head are money in or out."
              >
                <Select id="ah-kind" name="kind" defaultValue={head?.kind ?? 'EXPENSE'} required>
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                </Select>
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editing ? 'Save changes' : 'Add head'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
