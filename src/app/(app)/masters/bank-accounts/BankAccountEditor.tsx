'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { saveBankAccountAction } from '@/app/(app)/accounts/actions'

export interface BankAccountValues {
  id: string
  accountName: string
  bankName: string
  branchName: string | null
  accountNumber: string
  ifsc: string | null
}

export function BankAccountEditor({ account }: { account?: BankAccountValues }) {
  const [open, setOpen] = useState(false)
  const editing = Boolean(account)

  return (
    <>
      {editing ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${account!.bankName}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add account
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit bank account' : 'Add bank account'}
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="mb-4 text-base font-semibold text-strong">
              {editing ? 'Edit bank account' : 'Add bank account'}
            </h2>

            <form action={saveBankAccountAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={account!.id} />}

              <Field label="Account name" htmlFor="ba-name" required>
                <Input
                  id="ba-name"
                  name="accountName"
                  defaultValue={account?.accountName ?? ''}
                  required
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank" htmlFor="ba-bank" required>
                  <Input id="ba-bank" name="bankName" defaultValue={account?.bankName ?? ''} required />
                </Field>
                <Field label="Branch" htmlFor="ba-branch">
                  <Input id="ba-branch" name="branchName" defaultValue={account?.branchName ?? ''} />
                </Field>
                <Field label="Account number" htmlFor="ba-no" required>
                  <Input
                    id="ba-no"
                    name="accountNumber"
                    inputMode="numeric"
                    defaultValue={account?.accountNumber ?? ''}
                    required
                  />
                </Field>
                <Field label="IFSC" htmlFor="ba-ifsc">
                  <Input id="ba-ifsc" name="ifsc" defaultValue={account?.ifsc ?? ''} />
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editing ? 'Save changes' : 'Add account'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
