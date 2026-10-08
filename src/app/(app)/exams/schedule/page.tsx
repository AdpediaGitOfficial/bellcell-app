import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'

export const metadata: Metadata = { title: 'Exam Schedule' }

const TERM_LABELS: Record<string, string> = {
  MID_TERM: 'Mid term',
  ANNUAL: 'Annual',
  SUPPLEMENTARY: 'Supplementary',
  AFFILIATION: 'University',
}

export default async function ExamSchedulePage() {
  const user = await requireUser()

  const schedules = await db.examSchedule.findMany({
    where: { ...branchScope(user), archivedAt: null },
    orderBy: [{ startDate: 'desc' }],
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      examCentre: { select: { name: true } },
      _count: { select: { subjects: true, results: true } },
    },
  })

  const mayCreate = can(user, 'exam.schedule', 'create')
  const now = new Date()

  return (
    <>
      <PageHeader
        title="Exam Schedule"
        subtitle="Mid-term, annual, supplementary and university examinations."
        action={
          mayCreate ? (
            <Link href="/exams/schedule/new">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                New examination
              </Button>
            </Link>
          ) : null
        }
      />

      {schedules.length === 0 ? (
        <Card className="px-5 py-16">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            title="No examinations scheduled"
            description="Create one, add its papers, then publish the timetable."
            action={
              mayCreate ? (
                <Link href="/exams/schedule/new">
                  <Button size="sm">New examination</Button>
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {schedules.map((s) => {
            const over = s.endDate < now
            const running = s.startDate <= now && s.endDate >= now
            return (
              <Link key={s.id} href={`/exams/schedule/${s.id}`}>
                <Card className="h-full p-5 transition-shadow hover:shadow-card-hover">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{TERM_LABELS[s.term] ?? s.term}</Badge>
                    {s.isPublished ? (
                      <Badge tone="positive">Published</Badge>
                    ) : (
                      <Badge tone="caution">Draft</Badge>
                    )}
                    {running && <Badge tone="brand">In progress</Badge>}
                    {over && !running && <Badge tone="neutral">Completed</Badge>}
                  </div>

                  <p className="font-medium text-strong">{s.name}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {s.course.name} · Year {s.courseYear}
                    {s.batch ? ` · ${s.batch.name}` : ''}
                  </p>

                  <dl className="mt-3 space-y-1 border-t border-[rgb(var(--border-base))] pt-3 text-xs">
                    <Row
                      label="Dates"
                      value={`${s.startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${s.endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    />
                    <Row label="Papers" value={String(s._count.subjects)} />
                    <Row label="Results entered" value={String(s._count.results)} />
                    {s.examCentre && <Row label="Centre" value={s.examCentre.name} />}
                  </dl>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="numeric truncate text-right text-strong">{value}</dd>
    </div>
  )
}
