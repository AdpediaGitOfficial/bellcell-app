import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, Printer } from 'lucide-react'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { publishScheduleAction } from '../../actions'
import { AddPaper, RemovePaper } from './SubjectRow'
import { PrintSchedule } from './PrintSchedule'

export const metadata: Metadata = { title: 'Examination' }

const TERM_LABELS: Record<string, string> = {
  MID_TERM: 'Mid term',
  ANNUAL: 'Annual',
  SUPPLEMENTARY: 'Supplementary',
  AFFILIATION: 'University',
}

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  if (!can(user, 'exam.schedule', 'view')) notFound()

  const { id } = await params

  const schedule = await db.examSchedule.findFirst({
    where: { id, ...branchScope(user), archivedAt: null },
    include: {
      course: true,
      batch: true,
      examCentre: true,
      branch: true,
      subjects: {
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
        include: { subject: { select: { id: true, name: true, code: true, passMarks: true } } },
      },
      _count: { select: { results: true } },
    },
  })
  if (!schedule) notFound()

  // Subjects for this course and year that are not already on the timetable.
  const used = new Set(schedule.subjects.map((s) => s.subjectId))
  const available = (
    await db.subject.findMany({
      where: {
        archivedAt: null,
        courseId: schedule.courseId,
        OR: [{ courseYear: schedule.courseYear }, { courseYear: null }],
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, maxMarks: true },
    })
  ).filter((s) => !used.has(s.id))

  // Which papers already have marks, so they cannot be removed.
  const marked = await db.examResultSubject.groupBy({
    by: ['subjectId'],
    where: { result: { scheduleId: schedule.id } },
    _count: { _all: true },
  })
  const hasMarks = new Set(marked.map((m) => m.subjectId))

  const mayEdit = can(user, 'exam.schedule', 'update')
  const mayEnterResults = can(user, 'exam.result', 'update')

  return (
    <>
      <Link
        href="/exams/schedule"
        className="no-print mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to examinations
      </Link>

      <PageHeader
        eyebrow={TERM_LABELS[schedule.term] ?? schedule.term}
        title={schedule.name}
        subtitle={`${schedule.course.name} · Year ${schedule.courseYear}${schedule.batch ? ` · ${schedule.batch.name}` : ''}`}
        action={
          <div className="no-print flex flex-wrap items-center gap-2">
            {schedule.isPublished ? (
              <Badge tone="positive">Published</Badge>
            ) : (
              <Badge tone="caution">Draft</Badge>
            )}
            <PrintSchedule />
            {mayEnterResults && schedule.subjects.length > 0 && (
              <Link href={`/exams/results/${schedule.id}`}>
                <Button size="sm" variant="secondary">
                  <ClipboardCheck className="h-4 w-4" aria-hidden />
                  Enter results
                </Button>
              </Link>
            )}
            {mayEdit && schedule.subjects.length > 0 && (
              <form action={publishScheduleAction}>
                <input type="hidden" name="scheduleId" value={schedule.id} />
                <Button size="sm" variant={schedule.isPublished ? 'secondary' : 'primary'}>
                  {schedule.isPublished ? 'Unpublish' : 'Publish timetable'}
                </Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold text-strong">Details</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Term" value={TERM_LABELS[schedule.term] ?? schedule.term} />
            <Row label="Course" value={schedule.course.name} />
            <Row label="Year" value={`Year ${schedule.courseYear}`} />
            <Row label="Batch" value={schedule.batch?.name ?? 'All batches'} />
            <Row label="Centre" value={schedule.examCentre?.name ?? 'Not specified'} />
            <Row
              label="Starts"
              value={schedule.startDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            />
            <Row
              label="Ends"
              value={schedule.endDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            />
            <Row label="Papers" value={String(schedule.subjects.length)} />
            <Row label="Results entered" value={String(schedule._count.results)} />
            <Row label="Branch" value={schedule.branch.name} />
          </dl>

          {!schedule.isPublished && schedule.subjects.length === 0 && (
            <p className="mt-4 rounded-lg bg-caution-50 px-3 py-2 text-xs text-caution-700 dark:bg-caution-500/10 dark:text-caution-500">
              Add at least one paper before the timetable can be published.
            </p>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Timetable</h2>
            {mayEdit && !schedule.isPublished && available.length > 0 && (
              <AddPaper
                scheduleId={schedule.id}
                subjects={available}
                defaultDate={schedule.startDate.toISOString().slice(0, 10)}
              />
            )}
            {/* Without this, a draft with nothing left to add renders an
                empty space where the button would be, which reads as a bug. */}
            {mayEdit && !schedule.isPublished && available.length === 0 && (
              <span className="text-xs text-muted">
                {schedule.subjects.length === 0
                  ? 'No subjects are defined for this course and year — add them under Masters.'
                  : 'Every subject for this course and year is already on the timetable.'}
              </span>
            )}
            {schedule.isPublished && (
              <span className="text-xs text-muted">
                Unpublish to change the timetable.
              </span>
            )}
          </div>

          {schedule.subjects.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No papers added yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <Th>Date</Th>
                  <Th>Paper</Th>
                  <Th hide>Time</Th>
                  <Th align="right">Max</Th>
                  <Th align="right">Pass</Th>
                  <Th align="right" noPrint>&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {schedule.subjects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-[rgb(var(--border-base))] last:border-0"
                  >
                    <td className="numeric whitespace-nowrap px-5 py-2.5 text-muted">
                      {p.examDate.toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-strong">{p.subject.name}</span>
                      <span className="numeric ml-2 text-xs text-faint">{p.subject.code}</span>
                    </td>
                    <td className="numeric hidden px-3 py-2.5 text-muted lg:table-cell">
                      {p.startTime && p.endTime
                        ? `${p.startTime} – ${p.endTime}`
                        : (p.startTime ?? '—')}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right">{p.maxMarks}</td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {p.subject.passMarks}
                    </td>
                    <td className="no-print px-5 py-2.5 text-right">
                      {mayEdit && !schedule.isPublished && (
                        <RemovePaper
                          scheduleSubjectId={p.id}
                          subjectName={p.subject.name}
                          hasMarks={hasMarks.has(p.subjectId)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <p className="no-print mt-4 flex items-center gap-1.5 text-xs text-faint">
        <Printer className="h-3.5 w-3.5" aria-hidden />
        Printing this page gives the timetable as a notice. Individual hall
        tickets are not in the agreed scope — see docs/open-questions.md #10.
      </p>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-strong">{value}</dd>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  hide,
  noPrint,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  hide?: boolean
  noPrint?: boolean
}) {
  return (
    <th
      className={
        'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5 ' +
        (align === 'right' ? 'text-right ' : 'text-left ') +
        (hide ? 'hidden lg:table-cell ' : '') +
        (noPrint ? 'no-print' : '')
      }
    >
      {children}
    </th>
  )
}
