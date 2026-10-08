import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { formatPaiseShort } from '@/lib/money'
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
  STATUS_LABELS,
  STUDENT_FILTER_KEYS,
  STUDENT_SORTS,
  duesFor,
  listStudents,
  studentFilterOptions,
  studentSummary,
  type StudentRow,
} from './queries'

export const metadata: Metadata = { title: 'Applications' }

const BASE = '/admissions/applications'

const STATUS_TONES: Record<string, Tone> = {
  APPLIED: 'info',
  ADMITTED: 'brand',
  ACTIVE: 'positive',
  PROMOTED: 'positive',
  COMPLETED: 'neutral',
  TRANSFERRED: 'neutral',
  DROPPED: 'critical',
  CANCELLED: 'critical',
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.application')
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: STUDENT_SORTS,
    defaultSort: 'createdAt',
    defaultDir: 'desc',
    filterKeys: STUDENT_FILTER_KEYS,
  })

  const [{ rows, total }, options, summary, density] = await Promise.all([
    listStudents(user, params),
    studentFilterOptions(),
    studentSummary(user),
    getDensity(),
  ])

  const mayCreate = can(user, 'admission.application', 'create')
  const mayExport = can(user, 'admission.application', 'export')
  const mayViewFees = can(user, 'admission.fee', 'view')

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      sortable: true,
      width: 'w-60',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">
            {r.firstName} {r.lastName ?? ''}
          </p>
          <p className="numeric truncate text-xs font-normal text-muted">
            {r.admissionNo ?? r.applicationNo}
            {r.phone ? ` · ${r.phone}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      hideBelow: 'md',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.course.name}</p>
          <p className="truncate text-xs text-muted">
            Year {r.courseYear} · {r.batch.name}
          </p>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      hideBelow: 'xl',
      cell: (r) => r.classMode?.name ?? <span className="text-faint">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge tone={STATUS_TONES[r.status] ?? 'neutral'}>
          {STATUS_LABELS[r.status]}
        </Badge>
      ),
    },
    ...(mayViewFees
      ? [
          {
            key: 'dues',
            header: 'Outstanding',
            align: 'right' as const,
            width: 'w-32',
            cell: (r: StudentRow) => {
              const { outstandingPaise, hasOverdue } = duesFor(r)
              if (r.installments.length === 0) {
                return <span className="text-faint">No fees set</span>
              }
              if (outstandingPaise === 0) {
                return <Badge tone="positive">Clear</Badge>
              }
              return (
                <span
                  className={
                    'numeric font-medium ' +
                    (hasOverdue
                      ? 'text-critical-600 dark:text-critical-500'
                      : 'text-strong')
                  }
                >
                  {formatPaiseShort(outstandingPaise)}
                </span>
              )
            },
          },
        ]
      : []),
    {
      key: 'admissionDate',
      header: 'Admitted',
      sortable: true,
      align: 'right',
      width: 'w-28',
      hideBelow: 'lg',
      cell: (r) =>
        r.admissionDate ? (
          <span className="numeric text-muted">
            {r.admissionDate.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: '2-digit',
            })}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle="Student records, from application through admission to completion."
        action={
          mayCreate ? (
            <Link href={`${BASE}/new`}>
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                New application
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Tile label="All students" value={summary.total} href={BASE} />
        <Tile label="Active" value={summary.active} href={`${BASE}?status=ACTIVE`} />
        <Tile label="Admitted this month" value={summary.thisMonth} href={BASE} />
        <Tile
          label="With overdue fees"
          value={summary.withOverdue}
          tone="critical"
          href={`${BASE}?dues=overdue`}
        />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search name, application or admission no…"
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: Object.entries(STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: 'courseId',
              label: 'Course',
              options: options.courses.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              key: 'batchId',
              label: 'Batch',
              options: options.batches.map((b) => ({ value: b.id, label: b.name })),
            },
            {
              key: 'dues',
              label: 'Fees',
              options: [
                { value: 'overdue', label: 'Has overdue' },
                { value: 'outstanding', label: 'Has outstanding' },
                { value: 'clear', label: 'Fully paid' },
              ],
            },
          ]}
        >
          <DensityToggle density={density} />
          {mayExport && <ExportMenu exportPath="/api/export/students" />}
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
              icon={<FileText className="h-5 w-5" aria-hidden />}
              title={
                total === 0 && !params.q && Object.keys(params.filters).length === 0
                  ? 'No applications yet'
                  : 'No applications match these filters'
              }
              description={
                total === 0 && !params.q && Object.keys(params.filters).length === 0
                  ? 'Start one from a counselled enquiry, or create a walk-in application directly.'
                  : 'Try clearing the search or filters above.'
              }
              action={
                mayCreate ? (
                  <Link href={`${BASE}/new`}>
                    <Button size="sm">New application</Button>
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
    </>
  )
}

function Tile({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: number
  tone?: 'critical'
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
          (tone === 'critical'
            ? 'text-critical-600 dark:text-critical-500'
            : 'text-strong')
        }
      >
        {value.toLocaleString('en-IN')}
      </p>
    </Link>
  )
}
