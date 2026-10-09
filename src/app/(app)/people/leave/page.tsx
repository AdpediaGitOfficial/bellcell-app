import type { Metadata } from 'next'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import {
  ApplyLeaveDialog,
  CarryForwardForm,
  LeaveLists,
  type RequestRow,
} from './LeaveForms'

export const metadata: Metadata = { title: 'Leave' }

function fmt(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('people.leave')
  const sp = await searchParams
  const year = (() => {
    const raw = typeof sp.year === 'string' ? Number.parseInt(sp.year, 10) : NaN
    return Number.isFinite(raw) && raw > 2000 && raw < 2100 ? raw : new Date().getFullYear()
  })()

  const scope = branchScope(user)
  const mayCreate = can(user, 'people.leave', 'create')
  const mayApprove = can(user, 'people.leave', 'approve')
  const mayUpdate = can(user, 'people.leave', 'update')

  if (!scope.branchId) {
    return (
      <>
        <PageHeader title="Leave" subtitle="Entitlements, requests and approvals." />
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Leave is recorded per branch. Choose a branch from the switcher at the
            top of the page.
          </p>
        </Card>
      </>
    )
  }

  const branchId = scope.branchId

  const [requests, employees, types, pendingCount] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        branchId,
        fromDate: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
      orderBy: [{ status: 'asc' }, { fromDate: 'desc' }],
      take: 200,
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        leaveType: { select: { name: true, isPaid: true } },
        decidedBy: { select: { fullName: true } },
      },
    }),
    db.employee.findMany({
      where: { branchId, archivedAt: null, status: { in: ['ACTIVE', 'ON_LEAVE'] } },
      orderBy: { employeeCode: 'asc' },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    }),
    db.leaveType.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: 'asc' } }),
    db.leaveRequest.count({ where: { branchId, status: 'PENDING' } }),
  ])

  const pending = requests.filter((r) => r.status === 'PENDING')
  const decided = requests.filter((r) => r.status !== 'PENDING')

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle="Entitlements, requests and approvals. An approved request writes the attendance register, which is what payroll charges for."
        action={
          <div className="flex gap-2">
            <Link href="/masters/leave-types">
              <Button variant="secondary">Leave types</Button>
            </Link>
            {mayCreate && types.length > 0 && (
              <ApplyLeaveDialog
                branchId={branchId}
                mayApprove={mayApprove}
                employees={employees.map((e) => ({
                  id: e.id,
                  label: `${[e.firstName, e.lastName].filter(Boolean).join(' ')} · ${e.employeeCode}`,
                }))}
                types={types.map((t) => ({
                  id: t.id,
                  name: t.name,
                  isPaid: t.isPaid,
                  uncapped: Number(t.annualEntitlementDays) <= 0,
                }))}
              />
            )}
          </div>
        }
      />

      {types.length === 0 && (
        <Card className="mb-4 p-5">
          <p className="text-sm text-muted">
            No leave types are defined yet, so nothing can be applied for.{' '}
            <Link
              href="/masters/leave-types"
              className="font-medium text-brand-700 underline dark:text-brand-400"
            >
              Set them up first
            </Link>{' '}
            — each type decides whether its days are paid, which is what makes a
            leave day cost money or not.
          </p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Awaiting a decision" value={String(pendingCount)} />
        <Tile label={`Requests in ${year}`} value={String(requests.length)} />
        <Tile
          label="Leave types"
          value={`${types.length} · ${types.filter((t) => t.isPaid).length} paid`}
        />
      </div>

      <LeaveLists
        year={year}
        mayApprove={mayApprove}
        mayUpdate={mayUpdate}
        pending={pending.map(toRow)}
        decided={decided.map(toRow)}
      />

      {mayApprove && (
        <div className="mt-4">
          <CarryForwardForm defaultYear={year} />
        </div>
      )}

      <p className="mt-4 flex max-w-prose items-start gap-2 text-xs text-faint">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Leave does not talk to payroll directly. Approving a request writes
          paid or unpaid days onto the staff attendance register, and payroll
          reads the register — so there is one path from &ldquo;away from
          work&rdquo; to &ldquo;paid less&rdquo;, whether the absence came
          through here or was marked by hand. Once a payroll run is approved it
          is frozen, so a leave recorded afterwards does not restate it.
        </span>
      </p>
    </>
  )
}

/** Flatten a request for the client component; Dates do not cross well. */
function toRow(r: {
  id: string
  employee: { id: string; employeeCode: string; firstName: string; lastName: string | null }
  leaveType: { name: string; isPaid: boolean }
  fromDate: Date
  toDate: Date
  fromPortion: string
  toPortion: string
  days: unknown
  reason: string | null
  status: string
  decisionNote: string | null
  decidedBy: { fullName: string } | null
}): RequestRow {
  return {
    id: r.id,
    employeeId: r.employee.id,
    employeeName: [r.employee.firstName, r.employee.lastName].filter(Boolean).join(' '),
    employeeCode: r.employee.employeeCode,
    typeName: r.leaveType.name,
    isPaid: r.leaveType.isPaid,
    fromLabel: fmt(r.fromDate),
    toLabel: fmt(r.toDate),
    days: Number(r.days),
    fromPortion: r.fromPortion,
    toPortion: r.toPortion,
    reason: r.reason,
    status: r.status as RequestRow['status'],
    decisionNote: r.decisionNote,
    decidedBy: r.decidedBy?.fullName ?? null,
  }
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="numeric mt-0.5 text-xl font-semibold text-strong">{value}</p>
    </Card>
  )
}
