import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, CalendarDays, Info, Users } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope, needsBranchChoice } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import {
  STAFF_STATUS_LABELS,
  lopDaysFrom,
  summariseStaffMonth,
} from '@/lib/attendance/core'
import { holidayDatesFor } from '@/lib/attendance/service'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { StaffSheet } from './StaffSheet'
import { markAllPresentAction } from './actions'

export const metadata: Metadata = { title: 'Staff attendance' }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseIso(raw: string | undefined): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso()
}

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('people.staffAttendance')
  const sp = await searchParams

  const dateIso = parseIso(typeof sp.date === 'string' ? sp.date : undefined)
  const date = new Date(`${dateIso}T00:00:00.000Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1

  const canEdit = can(user, 'people.staffAttendance', 'create')
  const scope = branchScope(user)
  const mustPickBranch = needsBranchChoice(user)

  if (mustPickBranch || !scope.branchId) {
    return (
      <>
        <PageHeader
          title="Staff attendance"
          subtitle="The register payroll reads for unpaid days."
        />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Staff attendance is kept per branch. Choose a branch from the
            switcher at the top of the page to mark or review it.
          </p>
        </Card>
      </>
    )
  }

  const branchId = scope.branchId

  const [employees, marks, holidays, monthRows] = await Promise.all([
    db.employee.findMany({
      where: { branchId, archivedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      orderBy: { employeeCode: 'asc' },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, designation: true },
    }),
    db.staffAttendance.findMany({
      where: { branchId, date },
      select: { employeeId: true, status: true, remarks: true },
    }),
    holidayDatesFor(branchId, year, month),
    db.staffAttendance.findMany({
      where: {
        branchId,
        date: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      },
      select: { employeeId: true, status: true },
    }),
  ])

  const byEmployee = new Map(marks.map((m) => [m.employeeId, m]))
  const isHolidayToday = holidays.includes(dateIso)

  const monthByEmployee = new Map<string, typeof monthRows>()
  for (const row of monthRows) {
    const list = monthByEmployee.get(row.employeeId) ?? []
    list.push(row)
    monthByEmployee.set(row.employeeId, list)
  }

  const monthLop = lopDaysFrom(monthRows.map((r) => r.status))
  const monthMarked = monthRows.length

  const prev = new Date(date)
  prev.setUTCDate(prev.getUTCDate() - 1)
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + 1)
  const href = (d: Date) => `/people/attendance?date=${d.toISOString().slice(0, 10)}`

  return (
    <>
      <PageHeader
        title="Staff attendance"
        subtitle="The register payroll reads for unpaid days. A day left unmarked costs nobody anything."
        action={
          <Link href="/masters/holidays">
            <Button variant="secondary" size="sm">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Holidays
            </Button>
          </Link>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link href={href(prev)}>
            <Button variant="secondary" size="sm">
              ‹ Previous
            </Button>
          </Link>
          <form method="get" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={dateIso}
              aria-label="Date"
              className="h-9 rounded-lg border border-[rgb(var(--border-strong))] bg-[rgb(var(--surface-card))] px-3 text-sm text-strong"
            />
            <Button type="submit" variant="secondary" size="sm">
              Go
            </Button>
          </form>
          <Link href={href(next)}>
            <Button variant="secondary" size="sm">
              Next ›
            </Button>
          </Link>
          {isHolidayToday && <Badge tone="info">Declared holiday</Badge>}
        </div>

        {canEdit && (
          <form action={markAllPresentAction}>
            <input type="hidden" name="date" value={dateIso} />
            <Button type="submit" variant="secondary" size="sm">
              <CalendarCheck className="h-4 w-4" aria-hidden />
              Mark everyone present
            </Button>
          </form>
        )}
      </Card>

      {/* The figure payroll will actually read, shown before anyone has to
          discover it on a payslip. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Staff on roll" value={String(employees.length)} />
        <Tile label="Marked today" value={`${marks.length} of ${employees.length}`} />
        <Tile
          label="Unpaid days this month"
          value={monthLop.toLocaleString('en-IN')}
          hint={`${monthMarked} day-records marked in ${date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`}
        />
      </div>

      <StaffSheet
        date={dateIso}
        branchId={branchId}
        canEdit={canEdit}
        rows={employees.map((e) => {
          const mark = byEmployee.get(e.id)
          return {
            id: e.id,
            code: e.employeeCode,
            name: [e.firstName, e.lastName].filter(Boolean).join(' '),
            designation: e.designation,
            status: mark?.status ?? null,
            remarks: mark?.remarks ?? null,
          }
        })}
      />

      {employees.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            <Users className="h-4 w-4 text-faint" aria-hidden />
            This month so far
          </h2>
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Employee
                  </th>
                  {(['present', 'paidLeave', 'unpaidLeave', 'absent', 'halfDays'] as const).map(
                    (k) => (
                      <th
                        key={k}
                        className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted"
                      >
                        {k === 'paidLeave'
                          ? 'Paid leave'
                          : k === 'unpaidLeave'
                            ? 'Unpaid'
                            : k === 'halfDays'
                              ? 'Half days'
                              : k === 'present'
                                ? 'Present'
                                : 'Absent'}
                      </th>
                    ),
                  )}
                  <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                    Unpaid days
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const s = summariseStaffMonth(
                    (monthByEmployee.get(e.id) ?? []).map((r) => r.status),
                  )
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-[rgb(var(--border-base))] last:border-0"
                    >
                      <td className="px-5 py-2 text-strong">
                        {[e.firstName, e.lastName].filter(Boolean).join(' ')}
                      </td>
                      <td className="numeric px-3 py-2 text-right text-muted">{s.present}</td>
                      <td className="numeric px-3 py-2 text-right text-muted">{s.paidLeave}</td>
                      <td className="numeric px-3 py-2 text-right text-muted">{s.unpaidLeave}</td>
                      <td className="numeric px-3 py-2 text-right text-muted">{s.absent}</td>
                      <td className="numeric px-3 py-2 text-right text-muted">{s.halfDays}</td>
                      <td
                        className={
                          'numeric px-5 py-2 text-right font-medium ' +
                          (s.lopDays > 0
                            ? 'text-caution-700 dark:text-caution-500'
                            : 'text-strong')
                        }
                      >
                        {s.lopDays}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 flex max-w-prose items-start gap-2 text-xs text-faint">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Payroll reads this register when a run is opened, and the figure stays
          editable on the draft. Once a run is approved it no longer moves, so
          correcting attendance afterwards does not change a payslip already
          issued. Leave balances and entitlements are not modelled — whether a
          day of leave is paid is a judgement made here, when marking it
          ({Object.values(STAFF_STATUS_LABELS).length} statuses).
        </span>
      </p>
    </>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="numeric mt-0.5 text-xl font-semibold text-strong">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-faint">{hint}</p>}
    </Card>
  )
}
