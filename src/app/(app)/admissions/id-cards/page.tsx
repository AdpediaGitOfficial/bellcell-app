import type { Metadata } from 'next'
import Link from 'next/link'
import { IdCard } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import { studentFilterOptions } from '../applications/queries'
import { IdCardActions, IdCardBulkActions, RaiseRequests } from './IdCardActions'
import {
  IDCARD_FILTER_KEYS,
  IDCARD_LABELS,
  IDCARD_NEXT,
  IDCARD_SORTS,
  idCardSummary,
  listIdCards,
  studentsWithoutCards,
  type IdCardRow,
} from './queries'

export const metadata: Metadata = { title: 'ID Cards' }

const BASE = '/admissions/id-cards'

const TONES: Record<string, Tone> = {
  REQUESTED: 'neutral',
  SENT_TO_AFFILIATION: 'info',
  RECEIVED: 'caution',
  STUDENT_NOTIFIED: 'brand',
  COLLECTED: 'positive',
}

export default async function IdCardsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.idCard')
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: IDCARD_SORTS,
    defaultSort: 'requestedAt',
    defaultDir: 'desc',
    filterKeys: IDCARD_FILTER_KEYS,
  })

  const mayCreate = can(user, 'admission.idCard', 'create')
  const mayUpdate = can(user, 'admission.idCard', 'update')

  const [{ rows, total }, options, summary, pending, density] = await Promise.all([
    listIdCards(user, params),
    studentFilterOptions(),
    idCardSummary(user),
    mayCreate ? studentsWithoutCards(user) : Promise.resolve([]),
    getDensity(),
  ])

  const requestedIds = rows.filter((r) => r.status === 'REQUESTED').map((r) => r.id)
  const receivedIds = rows.filter((r) => r.status === 'RECEIVED').map((r) => r.id)

  const columns: Column<IdCardRow>[] = [
    {
      key: 'student',
      header: 'Student',
      sortable: true,
      width: 'w-56',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">
            {r.student.firstName} {r.student.lastName ?? ''}
          </p>
          <p className="numeric truncate text-xs font-normal text-muted">
            {r.student.admissionNo ?? r.student.applicationNo}
          </p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      hideBelow: 'md',
      cell: (r) => `${r.student.course.name} · ${r.student.batch.name}`,
    },
    {
      key: 'cardNumber',
      header: 'Card no',
      hideBelow: 'xl',
      cell: (r) =>
        r.cardNumber ? (
          <span className="numeric">{r.cardNumber}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Stage',
      sortable: true,
      cell: (r) => <Badge tone={TONES[r.status] ?? 'neutral'}>{IDCARD_LABELS[r.status]}</Badge>,
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'lg',
      cell: (r) =>
        r.student.phone ? (
          <span className="numeric text-muted">{r.student.phone}</span>
        ) : (
          <span className="text-faint">No number</span>
        ),
    },
    {
      key: 'requestedAt',
      header: 'Raised',
      sortable: true,
      align: 'right',
      width: 'w-28',
      hideBelow: 'md',
      cell: (r) => (
        <span className="numeric text-muted">
          {r.requestedAt.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-10',
      cell: (r) => (
        <IdCardActions
          cardId={r.id}
          studentName={`${r.student.firstName} ${r.student.lastName ?? ''}`.trim()}
          currentStatus={r.status}
          allowed={IDCARD_NEXT[r.status]}
          canUpdate={mayUpdate}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="ID Cards"
        subtitle="From request, through the university, to the student's hand."
        action={
          mayCreate ? (
            <RaiseRequests
              students={pending.map((s) => ({
                id: s.id,
                label: `${s.firstName} ${s.lastName ?? ''}`.trim(),
                meta: `${s.admissionNo ?? s.applicationNo} · ${s.course.name}`,
              }))}
            />
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Requested" value={summary.requested} href={`${BASE}?status=REQUESTED`} />
        <Tile label="At university" value={summary.sent} href={`${BASE}?status=SENT_TO_AFFILIATION`} />
        <Tile
          label="Awaiting collection"
          value={summary.awaiting}
          tone="caution"
          href={`${BASE}?status=RECEIVED`}
        />
        <Tile label="Student informed" value={summary.notified} href={`${BASE}?status=STUDENT_NOTIFIED`} />
        <Tile label="Collected" value={summary.collected} href={`${BASE}?status=COLLECTED`} />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search student name or admission no…"
          filters={[
            {
              key: 'status',
              label: 'Stage',
              options: Object.entries(IDCARD_LABELS).map(([value, label]) => ({
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
          ]}
        >
          {mayUpdate && (
            <IdCardBulkActions requestedIds={requestedIds} receivedIds={receivedIds} />
          )}
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
          rowHref={(r) => `/admissions/applications/${r.student.id}`}
          empty={
            <EmptyState
              icon={<IdCard className="h-5 w-5" aria-hidden />}
              title={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'No ID cards requested yet'
                  : 'Nothing matches these filters'
              }
              description={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'Raise requests for admitted students using the button above.'
                  : 'Try clearing the search or filters.'
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
