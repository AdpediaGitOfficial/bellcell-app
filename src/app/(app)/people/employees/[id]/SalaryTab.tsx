import { History, Lock } from 'lucide-react'
import { formatPaise } from '@/lib/money'
import { Badge } from '@/components/ui/Badge'
import { SalaryStructureForm } from './SalaryStructureForm'

export interface StructureView {
  id: string
  effectiveFrom: Date
  effectiveTo: Date | null
  notes: string | null
  lines: {
    id: string
    amountPaise: number
    component: {
      id: string
      name: string
      kind: string
      calculation: string
      percentage: string | null
    }
  }[]
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function SalaryTab({
  employeeId,
  employeeName,
  structures,
  preview,
  components,
  canEdit,
  payslipCount,
}: {
  employeeId: string
  employeeName: string
  structures: StructureView[]
  /**
   * The current structure run through the real payroll engine for a full
   * month, so this screen shows what payroll will actually pay rather than a
   * second, slightly different, sum.
   */
  preview: { label: string; amountPaise: number }[] | null
  components: {
    id: string
    name: string
    kind: string
    calculation: string
    percentage: string | null
  }[]
  canEdit: boolean
  payslipCount: number
}) {
  const now = new Date()
  const current = structures.find(
    (s) => s.effectiveFrom <= now && (s.effectiveTo === null || s.effectiveTo >= now),
  )
  const history = structures.filter((s) => s.id !== current?.id)

  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3">
          <h2 className="text-sm font-semibold text-strong">Salary in force</h2>
          {current && (
            <span className="text-xs text-muted">
              From {fmtDate(current.effectiveFrom)}
              {current.effectiveTo ? ` to ${fmtDate(current.effectiveTo)}` : ''}
            </span>
          )}
        </div>

        {!current ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No salary structure set. {employeeName} will be left out of payroll
            runs until one exists, and the run will say so.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {(preview ?? []).map((l) => (
                  <tr
                    key={l.label}
                    className="border-b border-[rgb(var(--border-base))] last:border-0"
                  >
                    <td className="px-5 py-2.5 text-strong">{l.label}</td>
                    <td className="numeric px-5 py-2.5 text-right text-strong">
                      {formatPaise(l.amountPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[rgb(var(--surface-sunken))]">
                  <td className="px-5 py-2.5 text-sm font-semibold text-strong">
                    Gross for a full month
                  </td>
                  <td className="numeric px-5 py-2.5 text-right text-sm font-semibold text-strong">
                    {formatPaise(
                      (preview ?? []).reduce((s, l) => s + l.amountPaise, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
            {current.notes && (
              <p className="border-t border-[rgb(var(--border-base))] px-5 py-2.5 text-xs text-muted">
                {current.notes}
              </p>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <SalaryStructureForm
          employeeId={employeeId}
          components={components}
          current={
            current
              ? current.lines.map((l) => ({
                  componentId: l.component.id,
                  amountPaise: l.amountPaise,
                }))
              : []
          }
        />
      )}

      {history.length > 0 && (
        <div className="rounded-card surface-card overflow-hidden shadow-card">
          <h2 className="flex items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            <History className="h-4 w-4 text-faint" aria-hidden />
            Earlier structures
          </h2>
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {history.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm text-strong">
                  {fmtDate(s.effectiveFrom)} —{' '}
                  {s.effectiveTo ? fmtDate(s.effectiveTo) : 'open'}
                  <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>
                    Closed
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {s.lines
                    .map(
                      (l) =>
                        `${l.component.name} ${
                          l.component.calculation === 'FIXED'
                            ? formatPaise(l.amountPaise)
                            : `${l.component.percentage}%`
                        }`,
                    )
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="max-w-prose text-xs text-faint">
        A revision never overwrites the previous structure — it closes it the day
        before and starts a new one. That is what lets a payslip issued last year
        still be explained.
        {payslipCount > 0 &&
          ` ${payslipCount} payslip${payslipCount === 1 ? ' has' : 's have'} been issued against this record.`}
      </p>
    </div>
  )
}
