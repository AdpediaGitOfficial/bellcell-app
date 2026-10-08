import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'

export const metadata: Metadata = { title: 'Results' }

export default async function ResultsPage() {
  const user = await requirePageUser('exam.result')
  if (!can(user, 'exam.result', 'view')) return null

  const schedules = await db.examSchedule.findMany({
    where: { ...branchScope(user), archivedAt: null },
    orderBy: { startDate: 'desc' },
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      _count: { select: { subjects: true } },
      results: { select: { status: true, publishedAt: true } },
    },
  })

  return (
    <>
      <PageHeader
        title="Results"
        subtitle="Enter marks against an examination, then publish."
      />

      {schedules.length === 0 ? (
        <Card className="px-5 py-16">
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" aria-hidden />}
            title="No examinations yet"
            description="Create an examination and its timetable before entering results."
            action={
              <Link href="/exams/schedule">
                <Button size="sm" variant="secondary">Go to Exam Schedule</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Examination</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Course</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Papers</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Entered</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">State</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const published = s.results.some((r) => r.publishedAt !== null)
                return (
                  <tr
                    key={s.id}
                    className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                  >
                    <td className="px-5 py-2.5">
                      <span className="font-medium text-strong">{s.name}</span>
                      <span className="numeric block text-xs text-muted">
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
                    <td className="numeric px-3 py-2.5 text-right">{s.results.length}</td>
                    <td className="px-3 py-2.5 text-center">
                      {published ? (
                        <Badge tone="positive">Published</Badge>
                      ) : s.results.length > 0 ? (
                        <Badge tone="caution">In progress</Badge>
                      ) : (
                        <Badge tone="neutral">Not started</Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/exams/results/${s.id}`}>
                        <Button size="sm" variant="secondary">
                          {published ? 'View' : 'Enter marks'}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
