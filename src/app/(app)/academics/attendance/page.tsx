import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, History, Lock, LockOpen, Table2 } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { ClassPicker } from './ClassPicker'
import { MarkSheet } from './MarkSheet'
import { lockSessionAction } from './actions'
import {
  classOptions,
  findSession,
  recentSessions,
  studentsForClass,
} from './queries'

export const metadata: Metadata = { title: 'Student attendance' }

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('academics.attendance')
  const sp = await searchParams

  const today = new Date().toISOString().slice(0, 10)
  const dateRaw = str(sp.date) || today
  const picked = {
    courseId: str(sp.courseId),
    batchId: str(sp.batchId),
    courseYear: str(sp.courseYear) || '1',
    sectionId: str(sp.sectionId),
    subjectId: str(sp.subjectId),
    period: str(sp.period),
    date: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : today,
  }

  const scope = branchScope(user)
  const [options, recent] = await Promise.all([
    classOptions(user),
    recentSessions(user),
  ])

  const ready = Boolean(picked.courseId && picked.batchId && scope.branchId)
  const canEdit = can(user, 'academics.attendance', 'create')
  const canUnlock = can(user, 'academics.attendance', 'update')

  const key = ready
    ? {
        courseId: picked.courseId,
        batchId: picked.batchId,
        courseYear: Number.parseInt(picked.courseYear, 10),
        sectionId: picked.sectionId || null,
        subjectId: picked.subjectId || null,
        period: picked.period ? Number.parseInt(picked.period, 10) : null,
      }
    : null

  const date = new Date(`${picked.date}T00:00:00.000Z`)
  const [students, session] = key
    ? await Promise.all([
        studentsForClass(user, key),
        findSession(user, key, date),
      ])
    : [[], null]

  const existingByStudent = new Map(
    (session?.entries ?? []).map((e) => [e.studentId, e.status]),
  )

  return (
    <>
      <PageHeader
        title="Student attendance"
        subtitle="Take the register for a class. Excused absences leave the percentage alone; everything else counts."
        action={
          <Link href="/academics/attendance/register">
            <Button variant="secondary">
              <Table2 className="h-4 w-4" aria-hidden />
              Register & shortage
            </Button>
          </Link>
        }
      />

      {!scope.branchId ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Attendance is kept per branch. Choose a branch from the switcher at
            the top of the page.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <ClassPicker options={options} basePath="/academics/attendance" current={picked} />

          {!ready ? (
            <Card className="p-8 text-center">
              <ClipboardList className="mx-auto h-5 w-5 text-faint" aria-hidden />
              <p className="mt-2 text-sm text-muted">
                Choose a course and batch to open the register.
              </p>
            </Card>
          ) : (
            <>
              {session && (
                <div className="flex flex-wrap items-center gap-2 rounded-card surface-card px-4 py-3 shadow-card">
                  <Badge tone={session.lockedAt ? 'neutral' : 'info'}>
                    {session.lockedAt ? 'Locked' : 'Already taken'}
                  </Badge>
                  <span className="text-sm text-muted">
                    Marked by {session.takenBy?.fullName ?? 'someone'}
                    {session.lockedAt
                      ? ` and locked on ${session.lockedAt.toLocaleDateString('en-IN')}`
                      : ''}
                    . Saving again replaces it.
                  </span>
                  {canUnlock && (
                    <form action={lockSessionAction} className="ml-auto">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        {session.lockedAt ? (
                          <>
                            <LockOpen className="h-4 w-4" aria-hidden />
                            Unlock
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4" aria-hidden />
                            Lock
                          </>
                        )}
                      </Button>
                    </form>
                  )}
                </div>
              )}

              <MarkSheet
                existing={Boolean(session)}
                locked={Boolean(session?.lockedAt)}
                canEdit={canEdit}
                keyFields={{
                  branchId: scope.branchId,
                  courseId: picked.courseId,
                  batchId: picked.batchId,
                  courseYear: Number.parseInt(picked.courseYear, 10),
                  sectionId: picked.sectionId,
                  subjectId: picked.subjectId,
                  period: picked.period,
                  date: picked.date,
                }}
                rows={students.map((s) => ({
                  id: s.id,
                  name: [s.firstName, s.lastName].filter(Boolean).join(' '),
                  admissionNo: s.admissionNo ?? s.applicationNo,
                  rollNo: s.rollNumbers[0]?.rollNo ?? null,
                  status: existingByStudent.get(s.id) ?? 'PRESENT',
                }))}
              />
            </>
          )}

          {recent.length > 0 && (
            <Card className="overflow-hidden">
              <h2 className="flex items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
                <History className="h-4 w-4 text-faint" aria-hidden />
                Recently taken
              </h2>
              <ul className="divide-y divide-[rgb(var(--border-base))]">
                {recent.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                    <span className="numeric w-24 shrink-0 text-xs text-muted">
                      {s.date.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-strong">
                      {s.course.name} · Year {s.courseYear}
                      {s.section ? ` · Section ${s.section.name}` : ''}
                      {s.subject ? ` · ${s.subject.name}` : ''}
                      {s.period ? ` · period ${s.period}` : ''}
                    </span>
                    <span className="numeric text-xs text-muted">
                      {s._count.entries} marked
                    </span>
                    {s.lockedAt && (
                      <Badge tone="neutral" icon={<Lock className="h-3 w-3" />}>
                        Locked
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
