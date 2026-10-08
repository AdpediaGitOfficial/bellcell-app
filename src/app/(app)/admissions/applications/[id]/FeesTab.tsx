import Link from 'next/link'
import { IndianRupee, Receipt } from 'lucide-react'
import { formatPaise } from '@/lib/money'
import { outstandingPaise } from '@/lib/fees/core'
import { Button } from '@/components/ui/Button'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Field'
import { assignStructureAction } from '../../fees/actions'
import type { StudentRecord } from './queries'

const STATUS_TONES: Record<string, Tone> = {
  PENDING: 'neutral',
  PARTIALLY_PAID: 'caution',
  OVERDUE: 'critical',
  PAID: 'positive',
  WAIVED: 'info',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PARTIALLY_PAID: 'Part paid',
  OVERDUE: 'Overdue',
  PAID: 'Paid',
  WAIVED: 'Waived',
}

export function FeesTab({
  student,
  structures,
  canCollect,
  canAssign,
}: {
  student: StudentRecord
  structures: { id: string; name: string; courseYear: number }[]
  canCollect: boolean
  canAssign: boolean
}) {
  const totals = student.installments.reduce(
    (acc, i) => {
      acc.due += i.duePaise
      acc.concession += i.concessionPaise
      acc.lateFee += i.lateFeePaise
      acc.paid += i.paidPaise
      acc.outstanding += outstandingPaise(i)
      return acc
    },
    { due: 0, concession: 0, lateFee: 0, paid: 0, outstanding: 0 },
  )

  const unassigned = structures.filter(
    (s) => !student.feeAssignments.some((a) => a.structureId === s.id),
  )

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Total label="Total fee" value={totals.due + totals.lateFee} />
        <Total label="Concessions" value={totals.concession} />
        <Total label="Collected" value={totals.paid} tone="positive" />
        <Total label="Outstanding" value={totals.outstanding} tone="critical" />
      </div>

      {student.installments.length === 0 ? (
        <div className="rounded-card surface-card p-8 text-center shadow-card">
          <p className="text-sm font-medium text-strong">No fee structure assigned</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Assign a fee structure to generate this student&rsquo;s instalments. Nothing
            can be collected until then.
          </p>
          {canAssign && unassigned.length > 0 && (
            <form action={assignStructureAction} className="mx-auto mt-4 flex max-w-sm gap-2">
              <input type="hidden" name="studentId" value={student.id} />
              <Select name="structureId" aria-label="Fee structure" required>
                {unassigned.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="md">Assign</Button>
            </form>
          )}
          {canAssign && unassigned.length === 0 && (
            <p className="mt-3 text-xs text-faint">
              No fee structure exists for this course and batch yet.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-card surface-card overflow-hidden shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3">
              <h2 className="text-sm font-semibold text-strong">Instalments</h2>
              {canCollect && totals.outstanding > 0 && (
                <Link href={`/admissions/fees/${student.id}`}>
                  <Button size="sm">
                    <IndianRupee className="h-4 w-4" aria-hidden />
                    Collect payment
                  </Button>
                </Link>
              )}
            </div>

            <div className="scroll-slim w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border-base))]">
                    <Th>Instalment</Th>
                    <Th align="right">Due</Th>
                    <Th align="right">Concession</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Balance</Th>
                    <Th align="right">Due date</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {student.installments.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-[rgb(var(--border-base))] last:border-0"
                    >
                      <td className="px-5 py-2.5 font-medium text-strong">{i.label}</td>
                      <td className="numeric px-3 py-2.5 text-right">{formatPaise(i.duePaise)}</td>
                      <td className="numeric px-3 py-2.5 text-right text-muted">
                        {i.concessionPaise > 0 ? `−${formatPaise(i.concessionPaise)}` : '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">
                        {i.paidPaise > 0 ? formatPaise(i.paidPaise) : '—'}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right font-medium">
                        {formatPaise(outstandingPaise(i))}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-muted">
                        {i.dueDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Badge tone={STATUS_TONES[i.status] ?? 'neutral'}>
                          {STATUS_LABELS[i.status] ?? i.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-card surface-card overflow-hidden shadow-card">
            <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
              Receipts
            </h2>
            {student.payments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                No payments collected yet.
              </p>
            ) : (
              <ul className="divide-y divide-[rgb(var(--border-base))]">
                {student.payments.map((p) => {
                  const cancelled = p.status !== 'COMPLETED'
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        <Receipt className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="numeric truncate text-sm font-medium text-strong">
                          {p.receiptNo}
                          {cancelled && (
                            <Badge tone="critical" className="ml-2">
                              {p.status === 'BOUNCED' ? 'Bounced' : 'Cancelled'}
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {p.receiptDate.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' · '}
                          {p.mode.replace('_', ' ').toLowerCase()}
                          {p.collectedBy ? ` · ${p.collectedBy.fullName}` : ''}
                        </p>
                      </div>
                      <span
                        className={
                          'numeric shrink-0 text-sm font-medium ' +
                          (cancelled ? 'text-faint line-through' : 'text-strong')
                        }
                      >
                        {formatPaise(p.amountPaise)}
                      </span>
                      <Link
                        href={`/admissions/fees/receipt/${p.id}`}
                        className="shrink-0 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                      >
                        View
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {student.concessions.length > 0 && (
            <div className="rounded-card surface-card overflow-hidden shadow-card">
              <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
                Concessions
              </h2>
              <ul className="divide-y divide-[rgb(var(--border-base))]">
                {student.concessions.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-strong">
                        {c.kind.replace('_', ' ').toLowerCase()}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {c.reason}
                        {c.approvedBy ? ` · approved by ${c.approvedBy.fullName}` : ''}
                      </p>
                    </div>
                    <span className="numeric shrink-0 font-medium text-info-700 dark:text-info-500">
                      −{formatPaise(c.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Total({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'positive' | 'critical'
}) {
  const colour =
    tone === 'positive'
      ? 'text-positive-700 dark:text-positive-500'
      : tone === 'critical' && value > 0
        ? 'text-critical-600 dark:text-critical-500'
        : 'text-strong'
  return (
    <div className="surface-card rounded-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`numeric mt-0.5 text-lg font-semibold ${colour}`}>
        {formatPaise(value)}
      </p>
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}
