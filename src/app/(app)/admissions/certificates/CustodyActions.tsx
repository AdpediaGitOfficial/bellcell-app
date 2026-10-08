'use client'

import { useState } from 'react'
import { ArrowRight, Check, MoreHorizontal } from 'lucide-react'
import type { CustodyStatus } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { transitionCustodyAction } from './actions'

const LABELS: Record<CustodyStatus, string> = {
  WITH_INSTITUTE: 'Held by institute',
  SENT_FOR_VERIFICATION: 'Sent to university',
  RETURNED_FROM_AFFILIATION: 'Back from university',
  RETURNED_TO_STUDENT: 'Returned to student',
  LOST: 'Lost',
}

const VERBS: Partial<Record<CustodyStatus, string>> = {
  SENT_FOR_VERIFICATION: 'Send to university',
  RETURNED_FROM_AFFILIATION: 'Mark returned from university',
  RETURNED_TO_STUDENT: 'Hand back to student',
  LOST: 'Mark lost',
}

export function CustodyActions({
  custodyId,
  studentName,
  currentStatus,
  allowed,
  canUpdate,
}: {
  custodyId: string
  studentName: string
  currentStatus: CustodyStatus
  allowed: CustodyStatus[]
  canUpdate: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [target, setTarget] = useState<CustodyStatus | null>(null)

  if (!canUpdate || allowed.length === 0) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Move certificate for ${studentName}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div
              role="menu"
              className="animate-slide-down absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 text-left shadow-popover"
            >
              {allowed.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setTarget(s)
                  }}
                  className={
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[rgb(var(--surface-hover))] ' +
                    (s === 'LOST'
                      ? 'text-critical-600 dark:text-critical-500'
                      : 'text-base')
                  }
                >
                  <ArrowRight className="h-4 w-4" aria-hidden />
                  {VERBS[s] ?? LABELS[s]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {target && (
        <TransitionDialog
          custodyId={custodyId}
          studentName={studentName}
          from={currentStatus}
          to={target}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  )
}

function TransitionDialog({
  custodyId,
  studentName,
  from,
  to,
  onClose,
}: {
  custodyId: string
  studentName: string
  from: CustodyStatus
  to: CustodyStatus
  onClose: () => void
}) {
  const handingBack = to === 'RETURNED_TO_STUDENT'
  const lost = to === 'LOST'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={VERBS[to] ?? LABELS[to]}
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
        <h2 className="text-base font-semibold text-strong">
          {VERBS[to] ?? LABELS[to]}
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          {studentName} · {LABELS[from]} → {LABELS[to]}
        </p>

        {lost && (
          <p className="mb-4 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500">
            Marking an original lost is permanent and cannot be undone from this
            screen. Record what happened — this is the institute&rsquo;s own
            record of a document it was trusted with.
          </p>
        )}

        <form action={transitionCustodyAction} className="space-y-4">
          <input type="hidden" name="custodyId" value={custodyId} />
          <input type="hidden" name="toStatus" value={to} />

          <Field label="Date" htmlFor={`when-${custodyId}`} required>
            <Input
              id={`when-${custodyId}`}
              name="occurredAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          {handingBack && (
            <Field
              label="Received by"
              htmlFor={`by-${custodyId}`}
              required
              hint="Who physically collected the original — the student, or a named guardian."
            >
              <Input id={`by-${custodyId}`} name="receivedBy" required />
            </Field>
          )}

          <Field
            label={lost ? 'What happened' : 'Remarks'}
            htmlFor={`rem-${custodyId}`}
            required={lost}
          >
            <Textarea id={`rem-${custodyId}`} name="remarks" rows={3} required={lost} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={lost ? 'danger' : 'primary'}>
              <Check className="h-4 w-4" aria-hidden />
              Confirm
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Bulk "send selected to university", the one action done in batches. */
export function BulkSendToUniversity({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false)
  if (ids.length === 0) return null

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Send {ids.length} to university
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send certificates to university"
        >
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="text-base font-semibold text-strong">
              Send {ids.length} original{ids.length === 1 ? '' : 's'} to the university
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              Each document gets its own custody event, so they can be tracked
              back individually.
            </p>

            <form action={transitionCustodyAction} className="space-y-4">
              {ids.map((id) => (
                <input key={id} type="hidden" name="custodyIds" value={id} />
              ))}
              <input type="hidden" name="toStatus" value="SENT_FOR_VERIFICATION" />

              <Field label="Date sent" htmlFor="bulk-when" required>
                <Input
                  id="bulk-when"
                  name="occurredAt"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>
              <Field label="Reference / courier docket" htmlFor="bulk-rem">
                <Input id="bulk-rem" name="remarks" />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Confirm dispatch</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
