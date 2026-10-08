import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import { BulkSendToUniversity, CustodyActions } from './CustodyActions'
import {
  ALLOWED_TRANSITIONS,
  CUSTODY_FILTER_KEYS,
  CUSTODY_LABELS,
  CUSTODY_SORTS,
  custodyFilterOptions,
  custodySummary,
  listCustody,
  type CustodyRow,
} from './queries'

export const metadata: Metadata = { title: 'Certificates' }

const BASE = '/admissions/certificates'

const TONES: Record<string, Tone> = {
  WITH_INSTITUTE: 'caution',
  SENT_FOR_VERIFICATION: 'info',
  RETURNED_FROM_AFFILIATION: 'brand',
  RETURNED_TO_STUDENT: 'positive',
  LOST: 'critical',
}

/**
 * "Return Certificate" in the vendor scope — four lines there, because it is
 * easy to underestimate. This screen is the institute's answer to "where is
 * my SSLC original?", and every move is logged. See ADR-016.
 */
export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: CUSTODY_SORTS,
    defaultSort: 'collectedAt',
    defaultDir: 'desc',
    filterKeys: CUSTODY_FILTER_KEYS,
  })

  const [{ rows, total }, options, summary, density] = await Promise.all([
    listCustody(user, params),
    custodyFilterOptions(),
    custodySummary(user),
    getDensity(),
  ])

  const mayUpdate = can(user, 'admission.certificateCustody', 'update')
  const mayExport = can(user, 'admission.certificateCustody', 'export')

  // The one genuinely batched action: dispatch everything currently held.
  const heldOnThisPage = rows
    .filter((r) => r.status === 'WITH_INSTITUTE')
    .map((r) => r.id)

  const columns: Column<CustodyRow>[] = [
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
      key: 'document',
      header: 'Document',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-strong">{r.certificateType.name}</p>
          {r.studentEducation?.qualification && (
            <p className="truncate text-xs text-muted">
              {r.studentEducation.qualification}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      hideBelow: 'xl',
      cell: (r) => r.student.course.name,
    },
    {
      key: 'affiliation',
      header: 'University',
      hideBelow: 'lg',
      cell: (r) => r.affiliationBody?.name ?? <span className="text-faint">—</span>,
    },
    {
      key: 'status',
      header: 'Where is it',
      sortable: true,
      cell: (r) => <Badge tone={TONES[r.status] ?? 'neutral'}>{CUSTODY_LABELS[r.status]}</Badge>,
    },
    {
      key: 'since',
      header: 'Since',
      align: 'right',
      width: 'w-28',
      hideBelow: 'md',
      cell: (r) => {
        const d = r.handedBackAt ?? r.returnedAt ?? r.sentAt ?? r.collectedAt
        return d ? (
          <span className="numeric text-muted">
            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        ) : (
          <span className="text-faint">—</span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-10',
      cell: (r) => (
        <CustodyActions
          custodyId={r.id}
          studentName={`${r.student.firstName} ${r.student.lastName ?? ''}`.trim()}
          currentStatus={r.status}
          allowed={ALLOWED_TRANSITIONS[r.status]}
          canUpdate={mayUpdate}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Certificate custody"
        subtitle="Students' original documents held by the institute. Every movement is logged and attributable."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile
          label="In our hands"
          value={summary.inOurHands}
          tone="caution"
          href={BASE}
          emphasis
        />
        <Tile label="Held here" value={summary.held} href={`${BASE}?status=WITH_INSTITUTE`} />
        <Tile label="At university" value={summary.sent} href={`${BASE}?status=SENT_FOR_VERIFICATION`} />
        <Tile
          label="Returned to student"
          value={summary.returned}
          href={`${BASE}?status=RETURNED_TO_STUDENT`}
        />
        <Tile label="Lost" value={summary.lost} tone="critical" href={`${BASE}?status=LOST`} />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search student name or admission no…"
          filters={[
            {
              key: 'status',
              label: 'Status',
              options: Object.entries(CUSTODY_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: 'certificateTypeId',
              label: 'Document',
              options: options.types.map((t) => ({ value: t.id, label: t.name })),
            },
            {
              key: 'affiliationBodyId',
              label: 'University',
              options: options.bodies.map((b) => ({ value: b.id, label: b.name })),
            },
            {
              key: 'courseId',
              label: 'Course',
              options: options.courses.map((c) => ({ value: c.id, label: c.name })),
            },
          ]}
        >
          {mayUpdate && <BulkSendToUniversity ids={heldOnThisPage} />}
          <DensityToggle density={density} />
          {mayExport && <ExportMenu exportPath="/api/export/certificate-custody" />}
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
              icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
              title={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'No originals held'
                  : 'Nothing matches these filters'
              }
              description={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'Custody records are created when an original certificate is ticked as collected on a student’s Education tab.'
                  : 'Try clearing the search or filters above.'
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
  emphasis,
}: {
  label: string
  value: number
  tone?: 'caution' | 'critical'
  href: string
  emphasis?: boolean
}) {
  const colour =
    tone === 'critical'
      ? 'text-critical-600 dark:text-critical-500'
      : tone === 'caution'
        ? 'text-caution-600 dark:text-caution-500'
        : 'text-strong'
  return (
    <Link
      href={href}
      className={
        'surface-card rounded-card px-4 py-3 shadow-card transition-shadow hover:shadow-card-hover ' +
        (emphasis ? 'ring-1 ring-caution-500/30' : '')
      }
    >
      <p className="text-xs text-muted">{label}</p>
      <p className={`numeric mt-0.5 text-xl font-semibold ${colour}`}>
        {value.toLocaleString('en-IN')}
      </p>
    </Link>
  )
}
