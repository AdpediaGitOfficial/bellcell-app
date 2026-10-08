import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { aggregate, cohortStats, type SubjectMark } from '@/lib/exams/core'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { publishResultsAction } from '../actions'
import { MarkGrid, type Paper, type StudentRow } from './MarkGrid'

export const metadata: Metadata = { title: 'Enter results' }

export default async function MarkEntryPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>
}) {
  const user = await requirePageUser('exam.result')

  const { scheduleId } = await params

  const schedule = await db.examSchedule.findFirst({
    where: { id: scheduleId, ...branchScope(user), archivedAt: null },
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      subjects: {
        orderBy: { examDate: 'asc' },
        include: { subject: { select: { id: true, name: true, code: true, passMarks: true } } },
      },
      results: {
        include: { subjects: true },
      },
    },
  })
  if (!schedule) notFound()

  const papers: Paper[] = schedule.subjects.map((p) => ({
    subjectId: p.subjectId,
    name: p.subject.name,
    code: p.subject.code,
    maxMarks: p.maxMarks,
    passMarks: p.subject.passMarks,
  }))

  // The cohort: everyone on this course, year and (if set) batch.
  const students = await db.student.findMany({
    where: {
      ...branchScope(user),
      archivedAt: null,
      courseId: schedule.courseId,
      courseYear: schedule.courseYear,
      ...(schedule.batchId ? { batchId: schedule.batchId } : {}),
      status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED', 'COMPLETED'] },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      applicationNo: true,
      admissionNo: true,
      installments: {
        select: {
          duePaise: true,
          concessionPaise: true,
          lateFeePaise: true,
          paidPaise: true,
        },
      },
    },
  })

  const resultByStudent = new Map(schedule.results.map((r) => [r.studentId, r]))

  const rows: StudentRow[] = students.map((s) => {
    const result = resultByStudent.get(s.id)
    const marks: StudentRow['marks'] = {}
    for (const rs of result?.subjects ?? []) {
      marks[rs.subjectId] = { marks: rs.marks, isAbsent: rs.isAbsent }
    }
    const outstandingPaise = s.installments.reduce(
      (sum, i) =>
        sum +
        Math.max(0, i.duePaise + i.lateFeePaise - i.concessionPaise - i.paidPaise),
      0,
    )
    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName ?? ''}`.trim(),
      admissionNo: s.admissionNo ?? s.applicationNo,
      outstandingPaise,
      withheld: result?.status === 'WITHHELD',
      marks,
    }
  })

  // Live cohort statistics from what is entered so far.
  const stats = cohortStats(
    rows
      .filter((r) => resultByStudent.has(r.id))
      .map((r) => {
        const marks: SubjectMark[] = papers.map((p) => ({
          subjectId: p.subjectId,
          marks: r.marks[p.subjectId]?.marks ?? null,
          maxMarks: p.maxMarks,
          passMarks: p.passMarks,
          isAbsent: r.marks[p.subjectId]?.isAbsent ?? false,
        }))
        return aggregate(marks, { withheld: r.withheld })
      }),
  )

  const published = schedule.results.some((r) => r.publishedAt !== null)
  const complete =
    schedule.results.length > 0 &&
    schedule.results.every(
      (r) =>
        r.subjects.length === papers.length &&
        r.subjects.every((s) => s.marks !== null || s.isAbsent),
    )

  const mayEdit = can(user, 'exam.result', 'update') && !published
  const mayPublish = can(user, 'exam.result', 'approve')

  return (
    <>
      <Link
        href={`/exams/schedule/${schedule.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to the examination
      </Link>

      <PageHeader
        eyebrow="Results"
        title={schedule.name}
        subtitle={`${schedule.course.name} · Year ${schedule.courseYear}${schedule.batch ? ` · ${schedule.batch.name}` : ''} · ${papers.length} papers`}
        action={
          <div className="flex items-center gap-2">
            {published ? <Badge tone="positive">Published</Badge> : <Badge tone="caution">Draft</Badge>}
            {mayPublish && schedule.results.length > 0 && (
              <form action={publishResultsAction}>
                <input type="hidden" name="scheduleId" value={schedule.id} />
                <Button
                  size="sm"
                  variant={published ? 'secondary' : 'primary'}
                  disabled={!published && !complete}
                  title={
                    !published && !complete
                      ? 'Every mark must be entered before results can be published'
                      : undefined
                  }
                >
                  {published ? 'Unpublish results' : 'Publish results'}
                </Button>
              </form>
            )}
          </div>
        }
      />

      {schedule.results.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Entered" value={String(stats.entered)} />
          <Tile label="Passed" value={String(stats.passed)} tone="positive" />
          <Tile label="Failed" value={String(stats.failed)} tone="critical" />
          <Tile label="Absent" value={String(stats.absent)} />
          <Tile label="Withheld" value={String(stats.withheld)} tone="caution" />
          <Tile label="Pass rate" value={`${stats.passRate}%`} />
        </div>
      )}

      {papers.length === 0 ? (
        <Card className="px-5 py-16">
          <EmptyState
            title="No papers on this examination"
            description="Add papers to the timetable before entering marks."
            action={
              <Link href={`/exams/schedule/${schedule.id}`}>
                <Button size="sm" variant="secondary">Open the timetable</Button>
              </Link>
            }
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="px-5 py-16">
          <EmptyState
            title="No students in this cohort"
            description={`No active students are on ${schedule.course.name} year ${schedule.courseYear}${schedule.batch ? ` in ${schedule.batch.name}` : ''}.`}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {published && (
            <p className="border-b border-[rgb(var(--border-base))] bg-positive-50 px-5 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
              These results are published and locked. Unpublish to make changes.
            </p>
          )}
          {!published && !complete && schedule.results.length > 0 && (
            <p className="border-b border-[rgb(var(--border-base))] bg-caution-50 px-5 py-2 text-sm text-caution-700 dark:bg-caution-500/10 dark:text-caution-500">
              Some marks are still unentered, so results cannot be published yet.
            </p>
          )}

          <MarkGrid
            scheduleId={schedule.id}
            papers={papers}
            students={rows}
            canEdit={mayEdit}
          />
        </Card>
      )}

      <p className="mt-4 text-xs text-faint">
        A &ldquo;fees due&rdquo; flag is shown for information only — nothing is
        withheld automatically. Whether unpaid fees should block a result is the
        institute&rsquo;s policy to set.
      </p>
    </>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'critical' | 'caution'
}) {
  const colour =
    tone === 'positive'
      ? 'text-positive-700 dark:text-positive-500'
      : tone === 'critical'
        ? 'text-critical-600 dark:text-critical-500'
        : tone === 'caution'
          ? 'text-caution-600 dark:text-caution-500'
          : 'text-strong'
  return (
    <div className="surface-card rounded-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`numeric mt-0.5 text-xl font-semibold ${colour}`}>{value}</p>
    </div>
  )
}
