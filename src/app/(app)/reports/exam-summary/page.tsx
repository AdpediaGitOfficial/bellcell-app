import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { GroupControls } from '../GroupControls'
import { parseRange } from '../queries'

export const metadata: Metadata = { title: 'Examination Schedule & Result Summary' }

const BASE = '/reports/exam-summary'

const TERM_LABELS: Record<string, string> = {
  MID_TERM: 'Mid term',
  ANNUAL: 'Annual',
  SUPPLEMENTARY: 'Supplementary',
  AFFILIATION: 'University',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  if (!can(user, 'reports', 'view')) notFound()

  const sp = await searchParams
  const range = parseRange(sp)

  const schedules = await db.examSchedule.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      startDate: { gte: range.from, lte: range.to },
    },
    orderBy: { startDate: 'desc' },
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      _count: { select: { subjects: true } },
      results: { select: { status: true, percentage: true, publishedAt: true } },
    },
  })

  const totals = schedules.reduce(
    (a, s) => {
      a.exams += 1
      a.students += s.results.length
      a.passed += s.results.filter((r) => r.status === 'PASS').length
      a.failed += s.results.filter((r) => r.status === 'FAIL').length
      return a
    },
    { exams: 0, students: 0, passed: 0, failed: 0 },
  )

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Examination Schedule & Result Summary"
        subtitle="Examinations starting in the period, with their outcome."
      />

      <Card className="overflow-hidden">
        <GroupControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy=""
          groups={[]}
        />

        {schedules.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No examinations start in this date range.
          </p>
        ) : (
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Examination</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Course</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Papers</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Sat</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Passed</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Pass rate</th>
                  <th className="px-5 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">State</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const passed = s.results.filter((r) => r.status === 'PASS').length
                  const failed = s.results.filter((r) => r.status === 'FAIL').length
                  const sat = passed + failed
                  const rate = sat > 0 ? (passed / sat) * 100 : null
                  const published = s.results.some((r) => r.publishedAt !== null)
                  return (
                    <tr key={s.id} className="border-b border-[rgb(var(--border-base))] hover:bg-[rgb(var(--surface-hover))]">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/exams/results/${s.id}`}
                          className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                        >
                          {s.name}
                        </Link>
                        <span className="numeric block text-xs text-muted">
                          {TERM_LABELS[s.term] ?? s.term} ·{' '}
                          {s.startDate.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {s.course.name} · Year {s.courseYear}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right">{s._count.subjects}</td>
                      <td className="numeric px-3 py-2.5 text-right">{sat}</td>
                      <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">
                        {passed}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right">
                        {rate === null ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <Badge tone={rate >= 80 ? 'positive' : rate >= 50 ? 'caution' : 'critical'}>
                            {rate.toFixed(1)}%
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-center">
                        {published ? (
                          <Badge tone="positive">Published</Badge>
                        ) : s.results.length > 0 ? (
                          <Badge tone="caution">In progress</Badge>
                        ) : (
                          <Badge tone="neutral">Not started</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
                  <td className="px-5 py-2.5" colSpan={3}>
                    {totals.exams} examination{totals.exams === 1 ? '' : 's'}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.passed + totals.failed}</td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.passed}</td>
                  <td className="numeric px-3 py-2.5 text-right">
                    {totals.passed + totals.failed > 0
                      ? `${((totals.passed / (totals.passed + totals.failed)) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
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
