import Link from 'next/link'
import { CalendarRange, Infinity as InfinityIcon } from 'lucide-react'
import { Badge, type Tone } from '@/components/ui/Badge'
import { PORTION_LABELS, STATUS_LABELS } from '@/lib/leave/core'
import type { BalanceView } from '@/lib/leave/service'

export interface LeaveHistoryRow {
  id: string
  typeName: string
  isPaid: boolean
  fromDate: Date
  toDate: Date
  fromPortion: 'FULL' | 'FIRST_HALF' | 'SECOND_HALF'
  toPortion: 'FULL' | 'FIRST_HALF' | 'SECOND_HALF'
  days: number
  status: keyof typeof STATUS_LABELS
  decisionNote: string | null
  decidedBy: string | null
}

const STATUS_TONES: Record<string, Tone> = {
  PENDING: 'caution',
  APPROVED: 'positive',
  REJECTED: 'neutral',
  CANCELLED: 'neutral',
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function LeaveTab({
  year,
  balances,
  history,
}: {
  year: number
  balances: BalanceView[]
  history: LeaveHistoryRow[]
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Balances for {year}
        </h2>

        {balances.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No leave types are defined.{' '}
            <Link
              href="/masters/leave-types"
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              Set them up
            </Link>{' '}
            first.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Type
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Entitled
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Carried
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Used
                </th>
                <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Left
                </th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr
                  key={b.leaveTypeId}
                  className="border-b border-[rgb(var(--border-base))] last:border-0"
                >
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-strong">{b.name}</span>
                    {!b.isPaid && (
                      <Badge tone="critical" className="ml-2">
                        Costs pay
                      </Badge>
                    )}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {b.uncapped ? '—' : b.entitledDays}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {b.carriedForwardDays || '—'}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {b.usedDays || '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {b.uncapped ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-muted"
                        title="No annual limit — the cost is the deduction itself"
                      >
                        <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
                        Uncapped
                      </span>
                    ) : (
                      <span
                        className={
                          'numeric font-medium ' +
                          (b.availableDays <= 0
                            ? 'text-critical-600 dark:text-critical-500'
                            : b.availableDays <= 2
                              ? 'text-caution-700 dark:text-caution-500'
                              : 'text-strong')
                        }
                      >
                        {b.availableDays}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="flex items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          <CalendarRange className="h-4 w-4 text-faint" aria-hidden />
          Leave taken
        </h2>
        {history.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No leave recorded for this employee.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-2.5">
                <p className="flex flex-wrap items-center gap-2 text-sm text-strong">
                  <span className="font-medium">{h.typeName}</span>
                  <Badge tone={STATUS_TONES[h.status] ?? 'neutral'}>
                    {STATUS_LABELS[h.status]}
                  </Badge>
                  {!h.isPaid && h.status === 'APPROVED' && (
                    <Badge tone="caution">Cost pay</Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {fmt(h.fromDate)} to {fmt(h.toDate)} · {h.days} day
                  {h.days === 1 ? '' : 's'}
                  {h.fromPortion !== 'FULL' &&
                    ` · from ${PORTION_LABELS[h.fromPortion].toLowerCase()}`}
                  {h.toPortion !== 'FULL' &&
                    ` · to ${PORTION_LABELS[h.toPortion].toLowerCase()}`}
                  {h.decidedBy ? ` · by ${h.decidedBy}` : ''}
                </p>
                {h.decisionNote && (
                  <p className="mt-0.5 text-xs text-muted">{h.decisionNote}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="max-w-prose text-xs text-faint">
        Approving leave writes paid or unpaid days onto the staff attendance
        register, and payroll reads the register — so a day here and a day on
        the payslip can never disagree. Record new leave from{' '}
        <Link
          href="/people/leave"
          className="font-medium text-brand-700 underline dark:text-brand-400"
        >
          People → Leave
        </Link>
        .
      </p>
    </div>
  )
}
