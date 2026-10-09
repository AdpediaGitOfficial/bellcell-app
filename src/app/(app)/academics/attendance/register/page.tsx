import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Download, TriangleAlert } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { DEFAULT_SHORTAGE_RULE, sessionsToReach } from '@/lib/attendance/core'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { ClassPicker } from '../ClassPicker'
import { classOptions, registerFor } from '../queries'

export const metadata: Metadata = { title: 'Attendance register' }

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

const BAND_TONES: Record<string, Tone> = {
  OK: 'positive',
  CONDONATION: 'caution',
  SHORT: 'critical',
  NO_DATA: 'neutral',
}

const BAND_LABELS: Record<string, string> = {
  OK: 'Clear',
  CONDONATION: 'Condonation',
  SHORT: 'Short',
  NO_DATA: 'No classes',
}

export default async function AttendanceRegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('academics.attendance')
  const sp = await searchParams

  const now = new Date()
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)
  const defaultTo = now.toISOString().slice(0, 10)

  const fromRaw = str(sp.from) || defaultFrom
  const toRaw = str(sp.to) || defaultTo
  const picked = {
    courseId: str(sp.courseId),
    batchId: str(sp.batchId),
    courseYear: str(sp.courseYear) || '1',
    sectionId: str(sp.sectionId),
    subjectId: '',
    period: '',
    date: toRaw,
  }

  const scope = branchScope(user)
  const options = await classOptions(user)
  const ready = Boolean(picked.courseId && picked.batchId && scope.branchId)

  const result = ready
    ? await registerFor(
        user,
        {
          courseId: picked.courseId,
          batchId: picked.batchId,
          courseYear: Number.parseInt(picked.courseYear, 10),
          sectionId: picked.sectionId || null,
        },
        new Date(`${fromRaw}T00:00:00.000Z`),
        new Date(`${toRaw}T00:00:00.000Z`),
      )
    : { rows: [], sessionCount: 0 }

  const short = result.rows.filter((r) => r.band === 'SHORT' || r.band === 'CONDONATION')
  const mayExport = can(user, 'academics.attendance', 'export')

  const exportQuery = new URLSearchParams({
    courseId: picked.courseId,
    batchId: picked.batchId,
    courseYear: picked.courseYear,
    from: fromRaw,
    to: toRaw,
    ...(picked.sectionId ? { sectionId: picked.sectionId } : {}),
  })

  return (
    <>
      <Link
        href="/academics/attendance"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to taking attendance
      </Link>

      <PageHeader
        eyebrow="Student attendance"
        title="Register & shortage"
        subtitle={`Percentages over a date range, against the ${DEFAULT_SHORTAGE_RULE.requiredPercentage}% requirement and ${DEFAULT_SHORTAGE_RULE.condonationPercentage}% condonation limit.`}
        action={
          mayExport && ready ? (
            <a href={`/api/export/attendance?${exportQuery.toString()}&format=xlsx`}>
              <Button variant="secondary">
                <Download className="h-4 w-4" aria-hidden />
                Export
              </Button>
            </a>
          ) : null
        }
      />

      {!scope.branchId ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Choose a branch from the switcher at the top of the page.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <ClassPicker
            options={options}
            basePath="/academics/attendance/register"
            current={picked}
            showSubject={false}
          />

          <Card className="px-5 py-4">
            <form method="get" className="flex flex-wrap items-end gap-3">
              {[
                ['courseId', picked.courseId],
                ['batchId', picked.batchId],
                ['courseYear', picked.courseYear],
                ['sectionId', picked.sectionId],
              ].map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-strong">From</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={fromRaw}
                  className="h-10 rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-3 text-sm text-strong"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-strong">To</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={toRaw}
                  className="h-10 rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-3 text-sm text-strong"
                />
              </label>
              <Button type="submit" variant="secondary">
                Apply dates
              </Button>
              <span className="text-xs text-muted">
                {result.sessionCount} session
                {result.sessionCount === 1 ? '' : 's'} in this window
              </span>
            </form>
          </Card>

          {!ready ? (
            <Card className="p-8 text-center text-sm text-muted">
              Choose a course and batch to see the register.
            </Card>
          ) : (
            <>
              {short.length > 0 && (
                <p className="flex items-start gap-2 rounded-card bg-caution-50 px-4 py-3 text-sm text-caution-700 shadow-card dark:bg-caution-500/10 dark:text-caution-500">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {short.length} student{short.length === 1 ? '' : 's'} below the
                    requirement in this window. Whether that bars them from an
                    examination is the university&rsquo;s rule, not this
                    system&rsquo;s — nothing here blocks a hall ticket.
                  </span>
                </p>
              )}

              <Card className="overflow-hidden">
                <div className="scroll-slim w-full overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[rgb(var(--border-base))]">
                        <Th className="px-5 text-left">Student</Th>
                        <Th className="text-right">Held</Th>
                        <Th className="text-right">Present</Th>
                        <Th className="text-right">Absent</Th>
                        <Th className="text-right">Late</Th>
                        <Th className="text-right">Excused</Th>
                        <Th className="text-right">%</Th>
                        <Th className="px-5 text-left">Standing</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted">
                            No students in this class.
                          </td>
                        </tr>
                      )}
                      {result.rows.map((r) => {
                        const need =
                          r.band === 'SHORT' || r.band === 'CONDONATION'
                            ? sessionsToReach(
                                {
                                  present: r.present,
                                  absent: r.absent,
                                  late: r.late,
                                  excused: r.excused,
                                },
                                DEFAULT_SHORTAGE_RULE.requiredPercentage,
                              )
                            : null
                        return (
                          <tr
                            key={r.studentId}
                            className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                          >
                            <td className="px-5 py-2.5">
                              <Link
                                href={`/admissions/applications/${r.studentId}`}
                                className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                              >
                                {r.name}
                              </Link>
                              <span className="numeric ml-2 text-xs text-faint">
                                {r.rollNo !== null ? `Roll ${r.rollNo}` : r.admissionNo}
                              </span>
                            </td>
                            <td className="numeric px-3 py-2.5 text-right text-muted">{r.held}</td>
                            <td className="numeric px-3 py-2.5 text-right text-muted">{r.present}</td>
                            <td className="numeric px-3 py-2.5 text-right text-muted">{r.absent}</td>
                            <td className="numeric px-3 py-2.5 text-right text-muted">{r.late}</td>
                            <td className="numeric px-3 py-2.5 text-right text-muted">{r.excused}</td>
                            <td className="numeric px-3 py-2.5 text-right font-medium text-strong">
                              {r.percentage === null ? '—' : `${r.percentage}%`}
                            </td>
                            <td className="px-5 py-2.5">
                              <span className="flex flex-wrap items-center gap-2">
                                <Badge tone={BAND_TONES[r.band] ?? 'neutral'}>
                                  {BAND_LABELS[r.band] ?? r.band}
                                </Badge>
                                {/* "You are at 68%" helps nobody; "attend the
                                    next 14" is actionable. */}
                                {need !== null && (
                                  <span className="text-xs text-muted">
                                    needs {need} more in a row
                                  </span>
                                )}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          <p className="max-w-prose text-xs text-faint">
            The 75% requirement and 65% condonation limit are set by the
            affiliating university, not by the institute, and differ between
            them. They live in one place (<span className="font-medium">
            src/lib/attendance/core.ts</span>) and are listed for confirmation
            in docs/open-questions.md §4a.
          </p>
        </div>
      )}
    </>
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
