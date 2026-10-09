import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, Settings, Wallet } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { needsBranchChoice } from '@/lib/branch'
import { formatPaise, formatPaiseShort } from '@/lib/money'
import { monthLabel } from '@/lib/payroll/core'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { NewRunDialog } from './NewRunDialog'
import { listPayrollRuns, payrollSummary } from './queries'

export const metadata: Metadata = { title: 'Payroll' }

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

export default async function PayrollPage() {
  const user = await requirePageUser('people.payroll')

  const [runs, summary] = await Promise.all([
    listPayrollRuns(user),
    payrollSummary(user),
  ])

  const mayCreate = can(user, 'people.payroll', 'create')
  const branches = needsBranchChoice(user) ? user.branches : undefined

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Monthly salary runs, from draft to paid and posted to the books."
        action={
          <div className="flex gap-2">
            <Link href="/people/payroll/settings">
              <Button variant="secondary">
                <Settings className="h-4 w-4" aria-hidden />
                Settings
              </Button>
            </Link>
            {mayCreate && <NewRunDialog branches={branches} />}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Runs recorded" value={summary.runs.toLocaleString('en-IN')} />
        <Tile
          label={`Net paid in ${new Date().getFullYear()}`}
          value={formatPaiseShort(summary.paidThisYearPaise)}
        />
        <Tile label="Open runs" value={summary.open.toLocaleString('en-IN')} />
      </div>

      {/* Nobody notices a missing employee until they complain, so the count
          of people who would be skipped is on the landing screen. */}
      {summary.withoutStructure > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-card bg-caution-50 px-4 py-3 text-sm text-caution-700 shadow-card dark:bg-caution-500/10 dark:text-caution-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {summary.withoutStructure} active{' '}
            {summary.withoutStructure === 1 ? 'employee has' : 'employees have'} no
            salary structure and will be left out of every run until one is set.
            Add it on the Salary tab of their record.
          </span>
        </p>
      )}

      <Card className="overflow-hidden">
        {runs.length === 0 ? (
          <div className="px-5 py-12">
            <EmptyState
              icon={<Wallet className="h-5 w-5" aria-hidden />}
              title="No payroll runs yet"
              description="Open a run for a month and the system drafts a payslip for everyone with a salary structure in force."
              action={mayCreate ? <NewRunDialog branches={branches} /> : null}
            />
          </div>
        ) : (
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <Th className="px-5 text-left">Period</Th>
                  <Th className="text-left">Status</Th>
                  <Th className="text-right">Staff</Th>
                  <Th className="text-right">Gross</Th>
                  <Th className="text-right">Deductions</Th>
                  <Th className="text-right">Net pay</Th>
                  <Th className="px-5 text-right">Employer cost</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/people/payroll/${r.id}`}
                        className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {monthLabel(r.month, r.year)}
                      </Link>
                      <span className="ml-2 text-xs text-faint">{r.branch.name}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STATUS_TONES[r.status] ?? 'neutral'}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {r.headcount}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-strong">
                      {formatPaise(r.grossPaise)}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {r.deductionsPaise > 0 ? formatPaise(r.deductionsPaise) : '—'}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right font-medium text-strong">
                      {formatPaise(r.netPaise)}
                    </td>
                    <td className="numeric px-5 py-2.5 text-right text-muted">
                      {formatPaise(r.netPaise + r.employerContributionPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 max-w-prose text-xs text-faint">
        Attendance is not part of this system, so unpaid days are entered on the
        run rather than counted from a register — see{' '}
        <span className="font-medium">docs/open-questions.md §4</span>. Income
        tax is entered per payslip from the institute&rsquo;s accountant rather
        than computed here.
      </p>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="numeric mt-0.5 text-xl font-semibold text-strong">{value}</p>
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
