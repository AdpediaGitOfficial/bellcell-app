'use client'

import Link from 'next/link'
import { useState } from 'react'
import { GraduationCap, MoreHorizontal, PhoneCall } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { logEnquiryCallAction, startAdmissionAction } from './actions'

export interface StageOption {
  value: string
  label: string
}

export function EnquiryRowActions({
  enquiryId,
  enquiryNo,
  name,
  stage,
  statuses,
  stages,
  canUpdate,
  canAdmit,
  isClosed,
}: {
  enquiryId: string
  enquiryNo: string
  name: string
  stage: string
  statuses: { id: string; name: string }[]
  stages: StageOption[]
  canUpdate: boolean
  canAdmit: boolean
  isClosed: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [callOpen, setCallOpen] = useState(false)

  if (!canUpdate) return null

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${name}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
            <div
              role="menu"
              className="animate-slide-down absolute right-0 z-20 mt-1 w-52 rounded-lg border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] p-1 text-left shadow-popover"
            >
              {!isClosed && (
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
                  Log call / update stage
                </button>
              )}

              <Link
                role="menuitem"
                href={`/enquiry/enquiries/${enquiryId}`}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-base hover:bg-[rgb(var(--surface-hover))]"
              >
                View history
              </Link>

              {canAdmit && stage !== 'CONVERTED' && (
                <form action={startAdmissionAction}>
                  <input type="hidden" name="enquiryId" value={enquiryId} />
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                  >
                    <GraduationCap className="h-4 w-4" aria-hidden />
                    Start admission
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {callOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Log call for ${name}`}
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setCallOpen(false)}
            aria-hidden
          />
          <div className="animate-fade-in surface-card relative z-10 w-full max-w-md rounded-card p-5 shadow-popover">
            <h2 className="text-base font-semibold text-strong">Log call</h2>
            <p className="mb-4 text-sm text-muted">
              {name} · {enquiryNo}
            </p>

            <form action={logEnquiryCallAction} className="space-y-4">
              <input type="hidden" name="enquiryId" value={enquiryId} />

              <Field
                label="Move to stage"
                htmlFor={`stage-${enquiryId}`}
                hint="Marking Admitted or Lost closes the enquiry and clears its next call."
              >
                <Select id={`stage-${enquiryId}`} name="stage" defaultValue={stage}>
                  {stages.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Call outcome" htmlFor={`status-${enquiryId}`}>
                <Select id={`status-${enquiryId}`} name="callStatusId" defaultValue="">
                  <option value="">Leave unchanged</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Next call / counselling slot" htmlFor={`next-${enquiryId}`}>
                <Input id={`next-${enquiryId}`} name="nextCallAt" type="datetime-local" />
              </Field>

              <Field label="Remarks" htmlFor={`remarks-${enquiryId}`}>
                <Textarea id={`remarks-${enquiryId}`} name="remarks" rows={3} />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCallOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
