import type { Metadata } from 'next'
import Link from 'next/link'
import { IndianRupee } from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { formatPaise, formatPaiseShort } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import {
  STUDENT_FILTER_KEYS,
  STUDENT_SORTS,
  duesFor,
  listStudents,
  studentFilterOptions,
  type StudentRow,
} from '../applications/queries'

export const metadata: Metadata = { title: 'Fee Collection' }

const BASE = '/admissions/fees'

/**
 * The collections worklist: who owes what, ordered so the office can work
 * down it. Defaults to students with something outstanding.
 */
export default async function FeeCollectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const sp = await searchParams

  // Default the list to people who actually owe money.
  const effective: SearchParams = { dues: 'outstanding', ...sp }

  const params = parseTableParams(effective, {
    allowedSorts: STUDENT_SORTS,
    defaultSort: 'name',
    defaultDir: 'asc',
    filterKeys: STUDENT_FILTER_KEYS,
  })

  const [{ rows, total }, options, density] = await Promise.all([
    listStudents(user, params),
    studentFilterOptions(),
    getDensity(),
  ])

  const mayCollect = can(user, 'admission.fee', 'create')

  const pageTotals = rows.reduce(
    (acc, r) => {
      const { outstandingPaise, hasOverdue } = duesFor(r)
      acc.outstanding += outstandingPaise
      if (hasOverdue) acc.overdueStudents += 1
      return acc
    },
    { outstanding: 0, overdueStudents: 0 },
  )

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
      cell: (r) => `${r.course.name} · Year ${r.courseYear}`,
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'xl',
      cell: (r) => r.batch.name,
    },
    {
      key: 'state',
      header: 'Fee state',
      cell: (r) => {
        if (r.installments.length === 0) {
          return <Badge tone="neutral">No structure</Badge>
        }
        const { outstandingPaise, hasOverdue } = duesFor(r)
        if (outstandingPaise === 0) return <Badge tone="positive">Clear</Badge>
        return hasOverdue ? (
          <Badge tone="critical">Overdue</Badge>
        ) : (
          <Badge tone="caution">Outstanding</Badge>
        )
      },
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      width: 'w-32',
      cell: (r) => {
        const { outstandingPaise, hasOverdue } = duesFor(r)
        return (
          <span
            className={
              'numeric font-medium ' +
              (hasOverdue ? 'text-critical-600 dark:text-critical-500' : 'text-strong')
            }
          >
            {formatPaise(outstandingPaise)}
          </span>
        )
      },
    },
    ...(mayCollect
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: 'w-28',
            cell: (r: StudentRow) =>
              duesFor(r).outstandingPaise > 0 ? (
                <Link href={`${BASE}/${r.id}`}>
                  <Button size="sm" variant="secondary">
                    Collect
                  </Button>
                </Link>
              ) : null,
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Fee Collection"
        subtitle="Students with money owing. Collecting here issues a receipt and posts to the Day Book."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Students listed" value={total.toLocaleString('en-IN')} />
        <Tile
          label="Outstanding on this page"
          value={formatPaiseShort(pageTotals.outstanding)}
        />
        <Tile
          label="With overdue instalments"
          value={pageTotals.overdueStudents.toLocaleString('en-IN')}
          tone="critical"
        />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search name, admission no or phone…"
          filters={[
            {
              key: 'dues',
              label: 'Fees',
              options: [
                { value: 'outstanding', label: 'Has outstanding' },
                { value: 'overdue', label: 'Has overdue' },
                { value: 'clear', label: 'Fully paid' },
              ],
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
          ]}
        >
          <DensityToggle density={density} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          params={params}
          basePath={BASE}
          density={density}
          stickyFirstColumn
          rowHref={(r) => `/admissions/applications/${r.id}?tab=fees`}
          empty={
            <EmptyState
              icon={<IndianRupee className="h-5 w-5" aria-hidden />}
              title="Nothing to collect"
              description="No student matches these filters with money outstanding."
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
}: {
  label: string
  value: string
  tone?: 'critical'
}) {
  return (
    <div className="surface-card rounded-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          'numeric mt-0.5 text-xl font-semibold ' +
          (tone === 'critical'
            ? 'text-critical-600 dark:text-critical-500'
            : 'text-strong')
        }
      >
        {value}
      </p>
    </div>
  )
}
