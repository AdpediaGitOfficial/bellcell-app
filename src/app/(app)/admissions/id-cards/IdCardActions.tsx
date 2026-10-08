'use client'

import { useState } from 'react'
import type { IdCardStatus } from '@prisma/client'
import { ArrowRight, MoreHorizontal, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { requestIdCardsAction, transitionIdCardsAction } from './actions'

const LABELS: Record<IdCardStatus, string> = {
  REQUESTED: 'Requested',
  SENT_TO_AFFILIATION: 'Sent to university',
  RECEIVED: 'Received',
  STUDENT_NOTIFIED: 'Student informed',
  COLLECTED: 'Collected',
}

const VERBS: Partial<Record<IdCardStatus, string>> = {
  SENT_TO_AFFILIATION: 'Send request to university',
  RECEIVED: 'Mark received from university',
  STUDENT_NOTIFIED: 'Inform the student',
  COLLECTED: 'Mark collected by student',
}

export function IdCardActions({
  cardId,
  studentName,
  currentStatus,
  allowed,
  canUpdate,
}: {
  cardId: string
  studentName: string
  currentStatus: IdCardStatus
  allowed: IdCardStatus[]
  canUpdate: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [target, setTarget] = useState<IdCardStatus | null>(null)

  if (!canUpdate || allowed.length === 0) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Update ID card for ${studentName}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div
              role="menu"
              className="animate-slide-down absolute right-0 z-20 mt-1 w-60 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 text-left shadow-popover"
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
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
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
        <Dialog
          title={VERBS[target] ?? LABELS[target]}
          subtitle={`${studentName} · ${LABELS[currentStatus]} → ${LABELS[target]}`}
          onClose={() => setTarget(null)}
        >
          {target === 'STUDENT_NOTIFIED' && (
            <p className="mb-4 rounded-lg bg-info-50 px-3 py-2 text-sm text-info-700 dark:bg-info-500/10 dark:text-info-500">
              An SMS (and email, where held) will be logged for this student.
              No gateway is configured yet, so the message is recorded rather
              than sent — see Settings once one is wired in.
            </p>
          )}

          <form action={transitionIdCardsAction} className="space-y-4">
            <input type="hidden" name="cardId" value={cardId} />
            <input type="hidden" name="toStatus" value={target} />

            <Field label="Date" htmlFor={`when-${cardId}`} required>
              <Input
                id={`when-${cardId}`}
                name="occurredAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>

            {target === 'RECEIVED' && (
              <Field label="Card number" htmlFor={`num-${cardId}`}>
                <Input id={`num-${cardId}`} name="cardNumber" />
              </Field>
            )}

            <Field label="Remarks" htmlFor={`rem-${cardId}`}>
              <Textarea id={`rem-${cardId}`} name="remarks" rows={2} />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button type="submit">Confirm</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

/** Batch the two steps that genuinely happen in batches. */
export function IdCardBulkActions({
  requestedIds,
  receivedIds,
}: {
  requestedIds: string[]
  receivedIds: string[]
}) {
  const [open, setOpen] = useState<null | 'send' | 'notify'>(null)

  return (
    <>
      {requestedIds.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => setOpen('send')}>
          <Send className="h-4 w-4" aria-hidden />
          Send {requestedIds.length} to university
        </Button>
      )}
      {receivedIds.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => setOpen('notify')}>
          Inform {receivedIds.length} student{receivedIds.length === 1 ? '' : 's'}
        </Button>
      )}

      {open && (
        <Dialog
          title={
            open === 'send'
              ? `Send ${requestedIds.length} request${requestedIds.length === 1 ? '' : 's'} to the university`
              : `Inform ${receivedIds.length} student${receivedIds.length === 1 ? '' : 's'}`
          }
          subtitle={
            open === 'send'
              ? 'Applies to every requested card on this page.'
              : 'Applies to every received card on this page. One message is logged per student.'
          }
          onClose={() => setOpen(null)}
        >
          <form action={transitionIdCardsAction} className="space-y-4">
            {(open === 'send' ? requestedIds : receivedIds).map((id) => (
              <input key={id} type="hidden" name="cardIds" value={id} />
            ))}
            <input
              type="hidden"
              name="toStatus"
              value={open === 'send' ? 'SENT_TO_AFFILIATION' : 'STUDENT_NOTIFIED'}
            />

            <Field label="Date" htmlFor="bulk-when" required>
              <Input
                id="bulk-when"
                name="occurredAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
            <Field label="Remarks" htmlFor="bulk-rem">
              <Input id="bulk-rem" name="remarks" />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(null)}>
                Cancel
              </Button>
              <Button type="submit">Confirm</Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  )
}

/** Raise requests for students who have no card record at all. */
export function RaiseRequests({
  students,
}: {
  students: { id: string; label: string; meta: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  if (students.length === 0) return null

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        Raise requests ({students.length})
      </Button>

      {open && (
        <Dialog
          title="Raise ID card requests"
          subtitle={`${students.length} active student${students.length === 1 ? ' has' : 's have'} no ID card record.`}
          onClose={() => setOpen(false)}
          wide
        >
          <form action={requestIdCardsAction} className="space-y-4">
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

            <ul className="scroll-slim max-h-72 divide-y divide-[rgb(var(--border-base))] overflow-y-auto rounded-lg border border-[rgb(var(--border-base))]">
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
                          cur.includes(s.id)
                            ? cur.filter((x) => x !== s.id)
                            : [...cur, s.id],
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={picked.length === 0}>
                Raise {picked.length || ''} request{picked.length === 1 ? '' : 's'}
              </Button>
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
        {children}
      </div>
    </div>
  )
}
