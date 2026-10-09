import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { formatPaise } from '@/lib/money'
import { monthLabel } from '@/lib/payroll/core'
import { Badge } from '@/components/ui/Badge'
import { PrintButton } from '@/app/(app)/admissions/fees/receipt/[paymentId]/PrintButton'
import { getPayslip } from '../../../queries'

export const metadata: Metadata = { title: 'Payslip' }

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string; payslipId: string }>
}) {
  const user = await requirePageUser('people.payroll')
  const { id, payslipId } = await params

  const payslip = await getPayslip(user, payslipId)
  if (!payslip || payslip.runId !== id) notFound()

  const { employee, run } = payslip
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ')

  const earnings = payslip.lines.filter((l) => l.kind === 'EARNING')
  const deductions = payslip.lines.filter((l) => l.kind === 'DEDUCTION')
  const employerLines = payslip.lines.filter(
    (l) => l.kind === 'EMPLOYER_CONTRIBUTION',
  )
  const rows = Math.max(earnings.length, deductions.length)

  const draft = run.status === 'DRAFT'

  return (
    <>
      <div className="no-print mb-3 flex items-center justify-between">
        <Link
          href={`/people/payroll/${run.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {monthLabel(run.month, run.year)}
        </Link>
        <div className="flex items-center gap-2">
          {draft && <Badge tone="caution">Draft — not yet approved</Badge>}
          <PrintButton />
        </div>
      </div>

      {/* A4-ish sheet. The print stylesheet drops everything marked no-print. */}
      <div className="mx-auto max-w-[760px] bg-white p-8 text-slate-900 shadow-card print:shadow-none">
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">
              {run.branch.name}
            </h1>
            <p className="text-xs text-slate-600">
              {[
                employee.branch.addressLine1,
                employee.branch.city,
                employee.branch.state,
                employee.branch.pincode,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">Payslip</p>
            <p className="numeric text-sm">{monthLabel(run.month, run.year)}</p>
          </div>
        </header>

        {draft && (
          <p className="mt-3 border border-amber-400 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Draft — figures may still change
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
          <Pair label="Employee" value={name} />
          <Pair label="Code" value={employee.employeeCode} numeric />
          <Pair label="Designation" value={employee.designation ?? '—'} />
          <Pair label="Department" value={employee.department?.name ?? '—'} />
          <Pair label="Working days" value={String(payslip.workingDays)} numeric />
          <Pair label="Unpaid days" value={String(Number(payslip.lopDays))} numeric />
          <Pair label="Paid days" value={String(Number(payslip.paidDays))} numeric />
          <Pair
            label="Date of joining"
            value={
              employee.dateOfJoining
                ? employee.dateOfJoining.toLocaleDateString('en-IN')
                : '—'
            }
            numeric
          />
        </dl>

        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50">
              <th className="py-2 pl-2 text-left font-semibold">Earnings</th>
              <th className="py-2 pr-3 text-right font-semibold">Amount</th>
              <th className="py-2 pl-3 text-left font-semibold">Deductions</th>
              <th className="py-2 pr-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="py-1.5 pl-2">{earnings[i]?.label ?? ''}</td>
                <td className="numeric py-1.5 pr-3 text-right">
                  {earnings[i] ? formatPaise(earnings[i]!.amountPaise) : ''}
                </td>
                <td className="py-1.5 pl-3">{deductions[i]?.label ?? ''}</td>
                <td className="numeric py-1.5 pr-2 text-right">
                  {deductions[i] ? formatPaise(deductions[i]!.amountPaise) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-y-2 border-slate-900 font-semibold">
              <td className="py-2 pl-2">Gross earnings</td>
              <td className="numeric py-2 pr-3 text-right">
                {formatPaise(payslip.grossPaise)}
              </td>
              <td className="py-2 pl-3">Total deductions</td>
              <td className="numeric py-2 pr-2 text-right">
                {formatPaise(payslip.deductionsPaise)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4 flex items-center justify-between border-2 border-slate-900 bg-slate-50 px-3 py-2.5">
          <span className="text-sm font-bold uppercase tracking-wide">Net pay</span>
          <span className="numeric text-lg font-bold">
            {formatPaise(payslip.netPaise)}
          </span>
        </div>

        {employerLines.length > 0 && (
          <div className="mt-4 border border-slate-300 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Paid by the institute on top — not deducted from you
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {employerLines.map((l) => (
                <li key={l.id} className="flex justify-between">
                  <span>{l.label}</span>
                  <span className="numeric">{formatPaise(l.amountPaise)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {payslip.remarks && (
          <p className="mt-4 text-xs text-slate-600">{payslip.remarks}</p>
        )}

        <footer className="mt-10 flex items-end justify-between text-xs text-slate-600">
          <p>
            This is a computer-generated payslip.
            {run.paidAt
              ? ` Paid on ${run.paidAt.toLocaleDateString('en-IN')}.`
              : ' Payment not yet recorded.'}
          </p>
          <p className="border-t border-slate-400 pt-1">Authorised signatory</p>
        </footer>
      </div>
    </>
  )
}

function Pair({
  label,
  value,
  numeric,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={'font-medium' + (numeric ? ' numeric' : '')}>{value}</dd>
    </div>
  )
}
