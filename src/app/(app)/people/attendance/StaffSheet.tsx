'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, CheckCircle2, IndianRupee } from 'lucide-react'
import type { StaffAttendanceStatus } from '@prisma/client'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { STAFF_STATUS_LABELS, reducesPay } from '@/lib/attendance/core'
import { saveStaffDayAction, type StaffAttendanceState } from './actions'

export interface StaffRow {
  id: string
  code: string
  name: string
  designation: string | null
  status: StaffAttendanceStatus | null
  remarks: string | null
}

const ORDER: StaffAttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'PAID_LEAVE',
  'UNPAID_LEAVE',
  'ON_DUTY',
  'HOLIDAY',
]

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save register'}
    </Button>
  )
}

export function StaffSheet({
  date,
  branchId,
  rows,
  canEdit,
}: {
  date: string
  branchId: string | null
  rows: StaffRow[]
  canEdit: boolean
}) {
  const [state, formAction] = useActionState<StaffAttendanceState, FormData>(
    saveStaffDayAction,
    {},
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="date" value={date} />
      {branchId && <input type="hidden" name="branchId" value={branchId} />}

      {(state.error || state.notice) && (
        <div className="mb-4">
          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-500/10 dark:text-positive-500"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {state.notice}
            </p>
          )}
        </div>
      )}

      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <div className="scroll-slim w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Employee
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-muted">
                    No active employees in this branch.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[rgb(var(--border-base))] last:border-0"
                >
                  <td className="px-5 py-2">
                    <span className="font-medium text-strong">{r.name}</span>
                    <span className="numeric ml-2 text-xs text-faint">{r.code}</span>
                    <span className="block text-xs text-muted">
                      {r.designation ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Select
                        name={`status.${r.id}`}
                        defaultValue={r.status ?? ''}
                        aria-label={`Attendance for ${r.name}`}
                        disabled={!canEdit}
                        className="h-9 w-auto min-w-[9.5rem]"
                      >
                        <option value="">Not marked</option>
                        {ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STAFF_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                      {r.status && reducesPay(r.status) && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-caution-700 dark:text-caution-500"
                          title="This status reduces pay in the payroll run for this month"
                        >
                          <IndianRupee className="h-3 w-3" aria-hidden />
                          reduces pay
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-2">
                    <Input
                      name={`remarks.${r.id}`}
                      defaultValue={r.remarks ?? ''}
                      disabled={!canEdit}
                      placeholder="—"
                      className="h-9"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && rows.length > 0 && (
        <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 rounded-card border border-[rgb(var(--border-base))] bg-[rgb(var(--surface-card))] px-4 py-3 shadow-card">
          <p className="text-xs text-muted">
            A day left <span className="font-medium">Not marked</span> costs
            nothing in payroll. Blanking a row that was marked clears it.
          </p>
          <Submit />
        </div>
      )}
    </form>
  )
}
