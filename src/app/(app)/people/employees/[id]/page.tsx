import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Archive, Briefcase, KeyRound, Mail, Phone } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import type { SearchParams } from '@/lib/table/params'
import {
  ROLE_LABELS,
  accountChangeBlockedReason,
  assignableRoles,
  deactivationBlockedReason,
} from '@/lib/rbac/roles'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { EmployeeForm } from '../EmployeeForm'
import { archiveEmployeeAction } from '../actions'
import {
  EMPLOYMENT_LABELS,
  employeeFilterOptions,
  getEmployeeRecord,
  type EmployeeRecord,
} from '../queries'
import { computeEarnings, structureInForce } from '@/lib/payroll/core'
import { RecordTabs, isTab, type TabKey } from './tabs'
import { EducationTab } from './EducationTab'
import { SalaryTab } from './SalaryTab'
import { LeaveTab } from './LeaveTab'
import { balancesFor } from '@/lib/leave/service'
import { ExperienceTab } from './ExperienceTab'
import { LanguagesTab } from './LanguagesTab'
import { AccessTab } from './AccessTab'

export const metadata: Metadata = { title: 'Employee' }

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'positive',
  ON_LEAVE: 'caution',
  RESIGNED: 'neutral',
  TERMINATED: 'critical',
}

export default async function EmployeeRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('people.employee')

  const { id } = await params
  const sp = await searchParams
  const rawTab = typeof sp.tab === 'string' ? sp.tab : undefined

  const employee = await getEmployeeRecord(user, id)
  if (!employee) notFound()

  const canEdit = can(user, 'people.employee', 'update')
  const canArchive = can(user, 'people.employee', 'delete')
  // Administering logins is a separate permission from editing a personnel
  // record: granting someone access to the till is not the same act as
  // recording their degree.
  const canAdminAccess = can(user, 'settings.user', 'update')
  const canCreateAccess = can(user, 'settings.user', 'create')
  // What someone is paid is gated separately from their personnel record.
  const canViewSalary = can(user, 'people.payroll', 'view')
  const canEditSalary = can(user, 'people.payroll', 'update')
  const canViewLeave = can(user, 'people.leave', 'view')

  const hidden: TabKey[] = []
  if (!canAdminAccess && !canCreateAccess) hidden.push('access')
  if (!canViewSalary) hidden.push('salary')
  if (!canViewLeave) hidden.push('leave')
  const requested: TabKey = isTab(rawTab) ? rawTab : 'personal'
  const tab: TabKey = hidden.includes(requested) ? 'personal' : requested

  const leaveYear = new Date().getFullYear()
  const [{ departments, languages }, superAdminCount, salary, leave] = await Promise.all([
    employeeFilterOptions(),
    tab === 'access'
      ? db.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } })
      : Promise.resolve(0),
    tab === 'salary' ? loadSalary(employee.id) : Promise.resolve(null),
    tab === 'leave' ? loadLeave(employee.id, leaveYear) : Promise.resolve(null),
  ])

  const basePath = `/people/employees/${employee.id}`
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ')

  const guard = employee.user
    ? {
        actorId: user.id,
        actorRole: user.role,
        targetUserId: employee.user.id,
        targetRole: employee.user.role,
        activeSuperAdminCount: superAdminCount,
      }
    : null

  return (
    <>
      <Link
        href="/people/employees"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to employees
      </Link>

      <PageHeader
        eyebrow={`Employee ${employee.employeeCode}`}
        title={name}
        subtitle={
          [employee.designation, employee.department?.name, employee.branch.name]
            .filter(Boolean)
            .join(' · ') || employee.branch.name
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <IdentityRail employee={employee} />

        <div className="min-w-0">
          <RecordTabs
            basePath={basePath}
            active={tab}
            hidden={hidden}
            counts={{
              education: employee.educations.length,
              experience: employee.experiences.length,
              languages: employee.languages.length,
            }}
          />

          {tab === 'personal' && (
            <div className="space-y-4">
              <Card className="p-5">
                {canEdit ? (
                  <EmployeeForm
                    employeeId={employee.id}
                    values={employee}
                    options={{ departments }}
                    cancelHref="/people/employees"
                  />
                ) : (
                  <ReadOnlyPersonal employee={employee} />
                )}
              </Card>

              {canArchive && (
                <Card className="p-5">
                  <h2 className="text-sm font-semibold text-strong">
                    Archive this record
                  </h2>
                  <p className="mt-1 max-w-prose text-xs text-muted">
                    The record is hidden from lists but kept, because it is
                    referenced by everything this person recorded. If they hold a
                    login, it is disabled and their sessions ended in the same
                    step — an archived employee with a live account is exactly the
                    gap nobody notices.
                  </p>
                  <form action={archiveEmployeeAction} className="mt-3">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <Button type="submit" variant="danger" size="sm">
                      <Archive className="h-4 w-4" aria-hidden />
                      Archive {name}
                    </Button>
                  </form>
                </Card>
              )}
            </div>
          )}

          {tab === 'education' && (
            <EducationTab employee={employee} canEdit={canEdit} />
          )}

          {tab === 'experience' && (
            <ExperienceTab employee={employee} canEdit={canEdit} />
          )}

          {tab === 'languages' && (
            <LanguagesTab
              employee={employee}
              languages={languages}
              canEdit={canEdit}
            />
          )}

          {tab === 'salary' && salary && (
            <SalaryTab
              employeeId={employee.id}
              employeeName={name}
              structures={salary.structures}
              preview={salary.preview}
              components={salary.components}
              canEdit={canEditSalary}
              payslipCount={salary.payslipCount}
            />
          )}

          {tab === 'leave' && leave && (
            <LeaveTab year={leaveYear} balances={leave.balances} history={leave.history} />
          )}

          {tab === 'access' && (
            <AccessTab
              employeeId={employee.id}
              employeeName={name}
              branchName={employee.branch.name}
              canCreate={canCreateAccess}
              assignable={assignableRoles(user.role)}
              account={
                employee.user
                  ? {
                      email: employee.user.email,
                      role: employee.user.role,
                      isActive: employee.user.isActive,
                      lastLoginAt: employee.user.lastLoginAt,
                      mustChangePassword: employee.user.mustChangePassword,
                      lockedUntil: employee.user.lockedUntil,
                      failedLoginCount: employee.user.failedLoginCount,
                      branches: employee.user.branches.map((b) => b.branch.name),
                    }
                  : null
              }
              blockedReason={
                !canAdminAccess
                  ? 'You do not have permission to change this account.'
                  : guard
                    ? accountChangeBlockedReason(guard)
                    : null
              }
              deactivationReason={guard ? deactivationBlockedReason(guard) : null}
            />
          )}
        </div>
      </div>
    </>
  )
}

/** Balances for the current year, plus the whole leave history. */
async function loadLeave(employeeId: string, year: number) {
  const [balances, requests] = await Promise.all([
    balancesFor(employeeId, year),
    db.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { fromDate: 'desc' },
      take: 50,
      include: {
        leaveType: { select: { name: true, isPaid: true } },
        decidedBy: { select: { fullName: true } },
      },
    }),
  ])

  return {
    balances,
    history: requests.map((r) => ({
      id: r.id,
      typeName: r.leaveType.name,
      isPaid: r.leaveType.isPaid,
      fromDate: r.fromDate,
      toDate: r.toDate,
      fromPortion: r.fromPortion,
      toPortion: r.toPortion,
      days: Number(r.days),
      status: r.status,
      decisionNote: r.decisionNote,
      decidedBy: r.decidedBy?.fullName ?? null,
    })),
  }
}

/**
 * Everything the Salary tab needs, including a full-month preview run
 * through the REAL payroll engine rather than a second sum that could
 * disagree with what payroll actually pays.
 */
async function loadSalary(employeeId: string) {
  const [structures, components, payslipCount] = await Promise.all([
    db.salaryStructure.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        lines: {
          include: { component: true },
          orderBy: { component: { sortOrder: 'asc' } },
        },
      },
    }),
    db.salaryComponent.findMany({
      where: { archivedAt: null, isStatutory: false },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
    }),
    db.payslip.count({ where: { employeeId } }),
  ])

  const current = structureInForce(structures, new Date())
  const preview = current
    ? computeEarnings(
        current.lines
          .filter((l) => l.component.archivedAt === null)
          .map((l) => ({
            component: {
              id: l.component.id,
              code: l.component.code,
              name: l.component.name,
              kind: l.component.kind,
              calculation: l.component.calculation,
              percentage:
                l.component.percentage === null
                  ? null
                  : Number(l.component.percentage),
              partOfBasic: l.component.partOfBasic,
              proRated: l.component.proRated,
              isStatutory: l.component.isStatutory,
              sortOrder: l.component.sortOrder,
            },
            amountPaise: l.amountPaise,
          })),
        30,
        30,
      ).lines.map((l) => ({ label: l.label, amountPaise: l.amountPaise }))
    : null

  const serialise = (c: (typeof components)[number]) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as string,
    calculation: c.calculation as string,
    percentage: c.percentage?.toString() ?? null,
  })

  return {
    structures: structures.map((s) => ({
      id: s.id,
      effectiveFrom: s.effectiveFrom,
      effectiveTo: s.effectiveTo,
      notes: s.notes,
      lines: s.lines.map((l) => ({
        id: l.id,
        amountPaise: l.amountPaise,
        component: serialise(l.component),
      })),
    })),
    preview,
    components: components.map(serialise),
    payslipCount,
  }
}

/** Sticky identity rail — the name and code must not scroll away. */
function IdentityRail({ employee }: { employee: EmployeeRecord }) {
  const name = [employee.firstName, employee.lastName].filter(Boolean).join(' ')
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Card className="p-5 lg:sticky lg:top-20">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-strong">{name}</p>
          <p className="numeric truncate text-xs text-muted">
            {employee.employeeCode}
          </p>
          <Badge tone={STATUS_TONES[employee.status] ?? 'neutral'} className="mt-1.5">
            {EMPLOYMENT_LABELS[employee.status]}
          </Badge>
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-[rgb(var(--border-base))] pt-4 text-sm">
        <RailRow
          icon={<Briefcase className="h-4 w-4" aria-hidden />}
          label="Designation"
          value={employee.designation ?? '—'}
        />
        <RailRow
          icon={<Phone className="h-4 w-4" aria-hidden />}
          label="Phone"
          value={employee.phone ?? '—'}
          numeric
        />
        <RailRow
          icon={<Mail className="h-4 w-4" aria-hidden />}
          label="Email"
          value={employee.email ?? '—'}
        />
        <RailRow
          icon={<KeyRound className="h-4 w-4" aria-hidden />}
          label="Login"
          value={
            employee.user
              ? `${ROLE_LABELS[employee.user.role]}${employee.user.isActive ? '' : ' (disabled)'}`
              : 'None'
          }
        />
      </dl>

      {employee.dateOfJoining && (
        <p className="mt-4 border-t border-[rgb(var(--border-base))] pt-3 text-xs text-faint">
          Joined{' '}
          {employee.dateOfJoining.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {employee.dateOfLeaving &&
            ` · left ${employee.dateOfLeaving.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}`}
        </p>
      )}
    </Card>
  )
}

function RailRow({
  icon,
  label,
  value,
  numeric,
}: {
  icon: React.ReactNode
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-faint">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className={'truncate text-sm text-strong' + (numeric ? ' numeric' : '')}>
          {value}
        </dd>
      </div>
    </div>
  )
}

function ReadOnlyPersonal({ employee }: { employee: EmployeeRecord }) {
  const rows: [string, string][] = [
    ['Employee code', employee.employeeCode],
    ['Date of birth', employee.dateOfBirth?.toLocaleDateString('en-IN') ?? '—'],
    ['Gender', employee.gender ?? '—'],
    ['Phone', employee.phone ?? '—'],
    ['Alternate number', employee.altPhone ?? '—'],
    ['Email', employee.email ?? '—'],
    ['Department', employee.department?.name ?? '—'],
    ['Designation', employee.designation ?? '—'],
    [
      'Address',
      [employee.addressLine1, employee.city, employee.state, employee.pincode]
        .filter(Boolean)
        .join(', ') || '—',
    ],
  ]
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-sm text-strong">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
