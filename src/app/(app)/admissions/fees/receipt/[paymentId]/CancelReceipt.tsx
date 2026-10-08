'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Field'
import { cancelPaymentAction } from '../../actions'

/**
 * A receipt is cancelled, never deleted: the allocations are reversed, a
 * contra entry is posted, and the number stays in the series so the auditor
 * does not find a hole.
 */
export function CancelReceipt({
  paymentId,
  receiptNo,
}: {
  paymentId: string
  receiptNo: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4" aria-hidden />
        Cancel receipt
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel receipt"
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="text-base font-semibold text-strong">
              Cancel receipt {receiptNo}?
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              The amount will be taken back off the student&rsquo;s instalments and a
              reversing entry posted to the Day Book. The receipt itself is kept,
              marked cancelled, so the number series stays intact.
            </p>

            <form action={cancelPaymentAction} className="space-y-4">
              <input type="hidden" name="paymentId" value={paymentId} />

              <Field label="Reason" htmlFor="reason" required>
                <Textarea id="reason" name="reason" rows={3} required />
              </Field>

              <label className="flex items-center gap-2 text-sm text-base">
                <input
                  type="checkbox"
                  name="bounced"
                  className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
                />
                The cheque or transfer bounced
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Keep receipt
                </Button>
                <Button type="submit" variant="danger">
                  Cancel receipt
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
