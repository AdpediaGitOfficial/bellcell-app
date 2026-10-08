import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { GroupControls } from '../GroupControls'
import { parseRange, studentsSummaryReport } from '../queries'

export const metadata: Metadata = { title: 'Students Summary' }

const BASE = '/reports/students-summary'
const GROUPS = ['course', 'batch', 'classMode', 'branch'] as const
type Group = (typeof GROUPS)[number]

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('reports')

  const sp = await searchParams
  const range = parseRange(sp)
  const raw = typeof sp.groupBy === 'string' ? sp.groupBy : ''
  const groupBy: Group = (GROUPS as readonly string[]).includes(raw)
    ? (raw as Group)
    : 'course'

  const rows = await studentsSummaryReport(user, range, groupBy)
  const totals = rows.reduce(
    (a, r) => ({
      total: a.total + r.total,
      active: a.active + r.active,
      completed: a.completed + r.completed,
      dropped: a.dropped + r.dropped,
    }),
    { total: 0, active: 0, completed: 0, dropped: 0 },
  )

  const label =
    groupBy === 'course' ? 'Course'
      : groupBy === 'batch' ? 'Batch'
      : groupBy === 'classMode' ? 'Class mode'
      : 'Branch'

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Students Summary"
        subtitle="Headcount of students created in the period, split by current status."
      />

      <Card className="overflow-hidden">
        <GroupControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy={groupBy}
          groups={GROUPS.map((g) => ({
            value: g,
            label: g === 'classMode' ? 'Class mode' : g[0]!.toUpperCase() + g.slice(1),
          }))}
        />

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No students created in this date range.
          </p>
        ) : (
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">{label}</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Total</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Active</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Completed</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Dropped</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-[rgb(var(--border-base))] hover:bg-[rgb(var(--surface-hover))]">
                    <td className="px-5 py-2.5 font-medium text-strong">{r.label}</td>
                    <td className="numeric px-3 py-2.5 text-right">{r.total.toLocaleString('en-IN')}</td>
                    <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">{r.active.toLocaleString('en-IN')}</td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">{r.completed.toLocaleString('en-IN')}</td>
                    <td className="numeric px-5 py-2.5 text-right text-critical-600 dark:text-critical-500">{r.dropped.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.total.toLocaleString('en-IN')}</td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.active.toLocaleString('en-IN')}</td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.completed.toLocaleString('en-IN')}</td>
                  <td className="numeric px-5 py-2.5 text-right">{totals.dropped.toLocaleString('en-IN')}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
