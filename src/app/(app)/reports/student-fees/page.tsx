import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { formatPaise } from '@/lib/money'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { GroupControls } from '../GroupControls'
import { parseRange, studentFeeReport } from '../queries'

export const metadata: Metadata = { title: 'Students Fee Summary' }

const BASE = '/reports/student-fees'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('reports')

  const sp = await searchParams
  const range = parseRange(sp)
  const onlyOutstanding = sp.scope !== 'all'

  const rows = await studentFeeReport(user, onlyOutstanding)
  const totals = rows.reduce(
    (a, r) => ({
      due: a.due + r.duePaise,
      concession: a.concession + r.concessionPaise,
      paid: a.paid + r.paidPaise,
      outstanding: a.outstanding + r.outstandingPaise,
    }),
    { due: 0, concession: 0, paid: 0, outstanding: 0 },
  )

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Students Fee Summary"
        subtitle="Per-student dues. An outstanding balance is a present-tense fact, so this report ignores the date range."
      />

      <Card className="overflow-hidden">
        <GroupControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy=""
          groups={[]}
          showRange={false}
          extra={
            <div className="flex gap-1 rounded-lg border border-[rgb(var(--border-base))] p-0.5">
              {[
                ['outstanding', 'With dues'],
                ['all', 'All students'],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  href={value === 'all' ? `${BASE}?scope=all` : BASE}
                  className={
                    'rounded-md px-2.5 py-1.5 text-[13px] font-medium ' +
                    ((value === 'all') === !onlyOutstanding
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-muted hover:text-strong')
                  }
                >
                  {label}
                </Link>
              ))}
            </div>
          }
        />

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            {onlyOutstanding ? 'No student has anything outstanding.' : 'No students yet.'}
          </p>
        ) : (
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="sticky left-0 bg-[rgb(var(--surface-card))] px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Student</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Course</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Total fee</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Concession</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Paid</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Outstanding</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId} className="border-b border-[rgb(var(--border-base))] hover:bg-[rgb(var(--surface-hover))]">
                    <td className="sticky left-0 bg-[rgb(var(--surface-card))] px-5 py-2.5">
                      <Link
                        href={`/admissions/applications/${r.studentId}?tab=fees`}
                        className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {r.name}
                      </Link>
                      <span className="numeric block text-xs text-muted">{r.admissionNo}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{r.course}</td>
                    <td className="numeric px-3 py-2.5 text-right">{formatPaise(r.duePaise)}</td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {r.concessionPaise > 0 ? `−${formatPaise(r.concessionPaise)}` : '—'}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">{formatPaise(r.paidPaise)}</td>
                    <td className="numeric px-3 py-2.5 text-right font-medium">{formatPaise(r.outstandingPaise)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {r.outstandingPaise === 0 ? (
                        <Badge tone="positive">Clear</Badge>
                      ) : r.overdue ? (
                        <Badge tone="critical">Overdue</Badge>
                      ) : (
                        <Badge tone="caution">Outstanding</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
                  <td className="sticky left-0 bg-[rgb(var(--surface-card))] px-5 py-2.5">
                    Total ({rows.length.toLocaleString('en-IN')})
                  </td>
                  <td />
                  <td className="numeric px-3 py-2.5 text-right">{formatPaise(totals.due)}</td>
                  <td className="numeric px-3 py-2.5 text-right">{formatPaise(totals.concession)}</td>
                  <td className="numeric px-3 py-2.5 text-right">{formatPaise(totals.paid)}</td>
                  <td className="numeric px-3 py-2.5 text-right">{formatPaise(totals.outstanding)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
