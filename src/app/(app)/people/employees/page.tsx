import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, Plus, Users } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { ROLE_LABELS } from '@/lib/rbac/roles'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import {
  EMPLOYEE_FILTER_KEYS,
  EMPLOYEE_SORTS,
  EMPLOYMENT_LABELS,
  employeeFilterOptions,
  employeeSummary,
  listEmployees,
  type EmployeeRow,
} from './queries'

export const metadata: Metadata = { title: 'Employees' }

const BASE = '/people/employees'

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'positive',
  ON_LEAVE: 'caution',
  RESIGNED: 'neutral',
  TERMINATED: 'critical',
}

function fullName(r: { firstName: string; lastName: string | null }): string {
  return [r.firstName, r.lastName].filter(Boolean).join(' ')
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('people.employee')
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: EMPLOYEE_SORTS,
    defaultSort: 'name',
    defaultDir: 'asc',
    filterKeys: EMPLOYEE_FILTER_KEYS,
  })

  const [{ rows, total }, options, summary, density] = await Promise.all([
    listEmployees(user, params),
    employeeFilterOptions(),
    employeeSummary(user),
    getDensity(),
  ])

  const mayCreate = can(user, 'people.employee', 'create')
  const mayUpdate = can(user, 'people.employee', 'update')
  const mayExport = can(user, 'people.employee', 'export')

  const columns: Column<EmployeeRow>[] = [
    {
      key: 'name',
      header: 'Employee',
      sortable: true,
      width: 'w-60',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{fullName(r)}</p>
          <p className="numeric truncate text-xs font-normal text-muted">
            {r.employeeCode}
          </p>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      cell: (r) => r.designation ?? <span className="text-faint">—</span>,
    },
    {
      key: 'department',
      header: 'Department',
      hideBelow: 'md',
      cell: (r) => r.department?.name ?? <span className="text-faint">—</span>,
    },
    {
      key: 'phone',
      header: 'Contact',
      hideBelow: 'lg',
      cell: (r) =>
        r.phone ? (
          <span className="numeric">{r.phone}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'dateOfJoining',
      header: 'Joined',
      sortable: true,
      width: 'w-28',
      hideBelow: 'xl',
      cell: (r) =>
        r.dateOfJoining ? (
          <span className="numeric">
            {r.dateOfJoining.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      cell: (r) => (
        <Badge tone={STATUS_TONES[r.status] ?? 'neutral'}>
          {EMPLOYMENT_LABELS[r.status]}
        </Badge>
      ),
    },
    {
      // Who can sign in is the question this screen is asked most often, so
      // it is a column rather than something you discover record by record.
      key: 'access',
      header: 'Login',
      width: 'w-36',
      cell: (r) => {
        if (!r.user) return <span className="text-faint">No login</span>
        return (
          <Badge
            tone={r.user.isActive ? 'brand' : 'neutral'}
            icon={<KeyRound className="h-3 w-3" />}
          >
            {r.user.isActive
              ? ROLE_LABELS[r.user.role]
              : `${ROLE_LABELS[r.user.role]} · off`}
          </Badge>
        )
      },
    },
  ]

  const unfiltered = total === 0 && !params.q && Object.keys(params.filters).length === 0

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Staff and faculty records, their qualifications, and who holds a login to this system."
        action={
          mayCreate ? (
            <Link href={`${BASE}/new`}>
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                Add employee
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <SummaryTile label="On roll" value={summary.total} href={BASE} />
        <SummaryTile label="Active" value={summary.active} href={`${BASE}?status=ACTIVE`} />
        <SummaryTile
          label="On leave"
          value={summary.onLeave}
          tone="caution"
          href={`${BASE}?status=ON_LEAVE`}
        />
        <SummaryTile
          label="With a login"
          value={summary.withLogin}
          href={`${BASE}?access=yes`}
        />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search name, code, designation or phone…"
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: 'departmentId',
              label: 'Department',
              options: options.departments.map((d) => ({ value: d.id, label: d.name })),
            },
            {
              key: 'access',
              label: 'Login',
              options: [
                { value: 'yes', label: 'Has a login' },
                { value: 'no', label: 'No login' },
              ],
            },
          ]}
        >
          <DensityToggle density={density} />
          {mayExport && <ExportMenu exportPath="/api/export/employees" />}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          params={params}
          basePath={BASE}
          density={density}
          stickyFirstColumn
          rowHref={(r) => `${BASE}/${r.id}`}
          empty={
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden />}
              title={unfiltered ? 'No employees yet' : 'No employees match these filters'}
              description={
                unfiltered
                  ? 'Add the staff and faculty on roll. A login can be issued from each record once it exists.'
                  : 'Try clearing the search or filters above.'
              }
              action={
                mayCreate && unfiltered ? (
                  <Link href={`${BASE}/new`}>
                    <Button size="sm">Add employee</Button>
                  </Link>
                ) : null
              }
            />
          }
        />

        {rows.length > 0 && (
          <Pagination params={params} basePath={BASE} totalRows={total} />
        )}
      </Card>

      {/* The vendor scope's own intro promised "Salary Details, Work Schedule"
          but listed no screens for either. Saying so here beats staff hunting
          for a payroll tab that was never specified. See open question #4. */}
      <p className="mt-4 text-xs text-faint">
        Payroll and attendance are not built. The source scope named
        &ldquo;salary details&rdquo; and &ldquo;work schedule&rdquo; in passing but
        specified no screens, fields or rules for them — see
        <span className="mx-1 font-medium">docs/open-questions.md §4</span>.
        {mayUpdate && ' Salary paid out is recorded today as a voucher under the Salary account head.'}
      </p>
    </>
  )
}

function SummaryTile({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: number
  tone?: 'caution'
  href: string
}) {
  return (
    <Link
      href={href}
      className="surface-card rounded-card px-4 py-3 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          'numeric mt-0.5 text-xl font-semibold ' +
          (tone === 'caution' ? 'text-caution-600 dark:text-caution-500' : 'text-strong')
        }
      >
        {value.toLocaleString('en-IN')}
      </p>
    </Link>
  )
}
