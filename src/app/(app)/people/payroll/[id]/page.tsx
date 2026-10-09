import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Download,
  FileText,
  UserX,
} from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { formatPaise } from '@/lib/money'
import { monthLabel } from '@/lib/payroll/core'
import { statutoryConfigFor } from '@/lib/payroll/service'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { PageHeader } from '@/components/shell/PageHeader'
import { RunWorkflow } from './RunActions'
import { togglePayslipAction, updatePayslipAction } from '../actions'
import { employeesMissingFromRun, getPayrollRun } from '../queries'

export const metadata: Metadata = { title: 'Payroll run' }

const STATUS_TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  APPROVED: 'info',
  PAID: 'positive',
  CANCELLED: 'critical',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
}

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePageUser('people.payroll')
  const { id } = await params

  const run = await getPayrollRun(user, id)
  if (!run) notFound()

  const [missing, config, bankAccounts] = await Promise.all([
    employeesMissingFromRun(run.branchId, run.id),
    statutoryConfigFor(run.branchId),
    db.bankAccount.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { accountName: 'asc' },
      select: { id: true, accountName: true, bankName: true },
    }),
  ])

  const isDraft = run.status === 'DRAFT'
  const mayEdit = isDraft && can(user, 'people.payroll', 'update')
  const mayApprove = can(user, 'people.payroll', 'approve')
  const mayCancel = can(user, 'people.payroll', 'delete')
  const mayExport = can(user, 'people.payroll', 'export')

  const included = run.payslips.filter((p) => !p.excluded)
  const employerTotal = run.netPaise + run.employerContributionPaise
  const fromRegister = run.payslips.filter((p) => p.attendanceMarkedDays > 0)

  return (
    <>
      <Link
        href="/people/payroll"
        className="no-print mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to payroll
      </Link>

      <PageHeader
        eyebrow={`Payroll · ${run.branch.name}`}
        title={monthLabel(run.month, run.year)}
        subtitle={`${run.workingDays} working days · ${run.headcount} staff${
          run.paidAt
            ? ` · paid ${run.paidAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : ''
        }`}
        action={
          <div className="no-print flex items-center gap-2">
            <Badge tone={STATUS_TONES[run.status] ?? 'neutral'}>
              {STATUS_LABELS[run.status] ?? run.status}
            </Badge>
            {mayExport && (
              <a href={`/api/export/payroll?runId=${run.id}&format=xlsx`}>
                <Button variant="secondary" size="sm">
                  <Download className="h-4 w-4" aria-hidden />
                  Salary register
                </Button>
              </a>
            )}
          </div>
        }
      />

      {run.status === 'CANCELLED' && run.cancelReason && (
        <p className="mb-4 rounded-card bg-critical-50 px-4 py-3 text-sm text-critical-700 shadow-card dark:bg-critical-500/10 dark:text-critical-500">
          Cancelled — {run.cancelReason}
        </p>
      )}

      {/* What the statutory position was when this run was drafted. Figures
          are written down, so a later settings change does not restate it. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Tile label="Gross" value={formatPaise(run.grossPaise)} />
        <Tile label="Deductions" value={formatPaise(run.deductionsPaise)} />
        <Tile label="Net payable" value={formatPaise(run.netPaise)} strong />
        <Tile
          label="Cost to institute"
          value={formatPaise(employerTotal)}
          hint={
            run.employerContributionPaise > 0
              ? `includes ${formatPaise(run.employerContributionPaise)} employer PF/ESI`
              : undefined
          }
        />
      </div>

      {/* Where the unpaid days came from. Without this the figure looks
          typed, and nobody knows whether a zero means "present all month" or
          "nobody opened the register". */}
      <p className="no-print mb-4 flex items-start gap-2 rounded-card bg-[rgb(var(--surface-sunken))] px-4 py-3 text-xs text-muted">
        <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {fromRegister.length > 0 ? (
          <span>
            Unpaid days came <span className="font-medium">from the register</span>{' '}
            for {fromRegister.length} of {run.payslips.length} staff.{' '}
            {isDraft
              ? 'They stay editable until the run is approved — attendance is the starting point, not the last word.'
              : 'They were frozen on approval, so correcting attendance now does not change these payslips.'}{' '}
            <Link
              href={`/people/attendance?date=${String(run.year)}-${String(run.month).padStart(2, '0')}-01`}
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              Open the staff register
            </Link>
          </span>
        ) : (
          <span>
            No staff attendance was marked for this month, so every unpaid-day
            figure starts at zero.{' '}
            <Link
              href={`/people/attendance?date=${String(run.year)}-${String(run.month).padStart(2, '0')}-01`}
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              Mark the register
            </Link>{' '}
            and open the run again, or enter the days by hand below.
          </span>
        )}
      </p>

      {!config.pfEnabled && !config.esiEnabled && !config.ptEnabled && (
        <p className="no-print mb-4 flex items-start gap-2 rounded-card bg-[rgb(var(--surface-sunken))] px-4 py-3 text-xs text-muted">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            No statutory deductions are configured for this branch, so this run
            deducts nothing. If the institute is registered for PF or ESI, set
            the rates in{' '}
            <Link
              href="/people/payroll/settings"
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              payroll settings
            </Link>{' '}
            before approving.
          </span>
        </p>
      )}

      {missing.length > 0 && (
        <Card className="no-print mb-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-strong">
            <UserX className="h-4 w-4 text-caution-600 dark:text-caution-500" aria-hidden />
            Not in this run ({missing.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {missing.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/people/employees/${m.id}?tab=salary`}
                  className="text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                >
                  {[m.firstName, m.lastName].filter(Boolean).join(' ')}
                </Link>{' '}
                <span className="numeric text-xs text-faint">{m.employeeCode}</span>
                {' — '}
                {m._count.salaryStructures === 0
                  ? 'no salary structure'
                  : 'no structure in force for this month'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4 overflow-hidden">
        <div className="scroll-slim w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <Th className="px-5 text-left">Employee</Th>
                <Th className="text-right">Unpaid days</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">Deductions</Th>
                <Th className="text-right">Net</Th>
                <Th className="px-5 text-right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {run.payslips.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">
                    Nobody in this run. Set salary structures and open a new one.
                  </td>
                </tr>
              )}
              {run.payslips.map((p) => {
                const name = [p.employee.firstName, p.employee.lastName]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr
                    key={p.id}
                    className={
                      'border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))] ' +
                      (p.excluded ? 'opacity-50' : '')
                    }
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/people/payroll/${run.id}/payslip/${p.id}`}
                        className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {name}
                      </Link>
                      <span className="numeric ml-2 text-xs text-faint">
                        {p.employee.employeeCode}
                      </span>
                      {p.excluded && (
                        <Badge tone="neutral" className="ml-2">
                          Left out
                        </Badge>
                      )}
                      <span className="block text-xs text-muted">
                        {p.employee.designation ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {mayEdit && !p.excluded ? (
                        <form
                          action={updatePayslipAction}
                          className="flex items-center justify-end gap-1"
                        >
                          <input type="hidden" name="payslipId" value={p.id} />
                          <Input
                            name="lopDays"
                            type="number"
                            step="0.5"
                            min={0}
                            max={p.workingDays}
                            defaultValue={Number(p.lopDays)}
                            aria-label={`Unpaid days for ${name}`}
                            className="h-8 w-20 text-right"
                          />
                          <Button type="submit" variant="ghost" size="sm">
                            Apply
                          </Button>
                        </form>
                      ) : (
                        <span className="numeric text-muted">
                          {Number(p.lopDays) || '—'}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-faint">
                        {p.attendanceMarkedDays > 0
                          ? `${p.attendanceMarkedDays} days marked`
                          : 'not in the register'}
                      </span>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-strong">
                      {formatPaise(p.grossPaise)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {p.deductionsPaise > 0 ? formatPaise(p.deductionsPaise) : '—'}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right font-medium text-strong">
                      {formatPaise(p.netPaise)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Link
                          href={`/people/payroll/${run.id}/payslip/${p.id}`}
                          aria-label={`Payslip for ${name}`}
                          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                        >
                          <FileText className="h-4 w-4" aria-hidden />
                        </Link>
                        {mayEdit && (
                          <form action={togglePayslipAction}>
                            <input type="hidden" name="payslipId" value={p.id} />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                            >
                              {p.excluded ? 'Put back' : 'Leave out'}
                            </button>
                          </form>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {included.length > 0 && (
              <tfoot>
                <tr className="bg-[rgb(var(--surface-sunken))] font-semibold">
                  <td className="px-5 py-2.5 text-strong">
                    {included.length} payslip{included.length === 1 ? '' : 's'}
                  </td>
                  <td />
                  <td className="numeric px-3 py-2.5 text-right text-strong">
                    {formatPaise(run.grossPaise)}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-strong">
                    {formatPaise(run.deductionsPaise)}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-strong">
                    {formatPaise(run.netPaise)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="no-print">
        <RunWorkflow
          runId={run.id}
          status={run.status}
          headcount={run.headcount}
          mayApprove={mayApprove}
          mayCancel={mayCancel}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            label: `${b.accountName} · ${b.bankName}`,
          }))}
        />
      </div>
    </>
  )
}

function Tile({
  label,
  value,
  hint,
  strong,
}: {
  label: string
  value: string
  hint?: string
  strong?: boolean
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          'numeric mt-0.5 font-semibold ' +
          (strong ? 'text-xl text-brand-700 dark:text-brand-400' : 'text-xl text-strong')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
    </Card>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  )
}
