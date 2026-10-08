'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRightCircle, Archive, MoreHorizontal, PhoneCall, Pencil } from 'lucide-react'
import { archiveLeadAction, convertLeadAction, logLeadCallAction } from './actions'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea, Input } from '@/components/ui/Field'

export interface StatusOption {
  id: string
  name: string
  requiresFollowUp: boolean
}

export function LeadRowActions({
  leadId,
  leadName,
  statuses,
  canUpdate,
  canConvert,
  canDelete,
}: {
  leadId: string
  leadName: string
  statuses: StatusOption[]
  canUpdate: boolean
  canConvert: boolean
  canDelete: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  if (!canUpdate && !canDelete) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${leadName}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div
              role="menu"
              className="animate-slide-down absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 text-left shadow-popover"
            >
              {canUpdate && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setCallOpen(true)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
                  >
                    <PhoneCall className="h-4 w-4" aria-hidden />
                    Log a call
                  </button>
                  <Link
                    role="menuitem"
                    href={`/enquiry/leads/${leadId}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Edit
                  </Link>
                </>
              )}

              {canConvert && (
                <form action={convertLeadAction}>
                  <input type="hidden" name="leadId" value={leadId} />
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                  >
                    <ArrowRightCircle className="h-4 w-4" aria-hidden />
                    Convert to enquiry
                  </button>
                </form>
              )}

              {canDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmArchive(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-critical-600 hover:bg-critical-50 dark:text-critical-500 dark:hover:bg-critical-500/10"
                >
                  <Archive className="h-4 w-4" aria-hidden />
                  Archive
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {callOpen && (
        <Modal title={`Log a call — ${leadName}`} onClose={() => setCallOpen(false)}>
          <form action={logLeadCallAction} className="space-y-4">
            <input type="hidden" name="leadId" value={leadId} />

            <Field label="Call outcome" htmlFor={`status-${leadId}`}>
              <Select id={`status-${leadId}`} name="callStatusId" defaultValue="">
                <option value="">Leave unchanged</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Next call"
              htmlFor={`next-${leadId}`}
              hint="Leave blank if no further follow-up is needed."
            >
              <Input id={`next-${leadId}`} name="nextCallAt" type="datetime-local" />
            </Field>

            <Field label="Remarks" htmlFor={`remarks-${leadId}`}>
              <Textarea id={`remarks-${leadId}`} name="remarks" rows={3} />
            </Field>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCallOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save call</Button>
            </div>
          </form>
        </Modal>
      )}

      {confirmArchive && (
        <Modal title="Archive this lead?" onClose={() => setConfirmArchive(false)}>
          <p className="text-sm text-muted">
            <strong className="text-strong">{leadName}</strong> will be hidden from
            the leads list. The call history is kept and nothing is deleted.
          </p>
          <form action={archiveLeadAction} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="leadId" value={leadId} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmArchive(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Archive lead
            </Button>
          </form>
        </Modal>
      )}
    </>
  )
}

function Modal({
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
