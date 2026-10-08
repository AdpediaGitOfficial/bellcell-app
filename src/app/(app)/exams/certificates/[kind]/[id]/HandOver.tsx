'use client'

import { useState } from 'react'
import { HandCoins, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { handOverCertificateAction } from '../../actions'

export function PrintButton() {
  return (
    <Button size="sm" variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      Print
    </Button>
  )
}

export function HandOver({ kind, id }: { kind: 'tc' | 'completion'; id: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <HandCoins className="h-4 w-4" aria-hidden />
        Record collection
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record collection"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="mb-1 text-base font-semibold text-strong">Record collection</h2>
            <p className="mb-4 text-sm text-muted">
              Who physically collected the certificate — the student, or a named
              guardian.
            </p>
            <form action={handOverCertificateAction} className="space-y-4">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={id} />
              <Field label="Received by" htmlFor="hand-by" required>
                <Input id="hand-by" name="receivedBy" required autoFocus />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Record</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
