import Link from 'next/link'
import type { EnquiryStage } from '@prisma/client'
import { MessagesSquare } from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import type { Resource } from '@/lib/rbac/resources'
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
import { EnquiryRowActions } from './EnquiryRowActions'
import {
  ENQUIRY_FILTER_KEYS,
  ENQUIRY_SORTS,
  STAGE_LABELS,
  listEnquiries,
  type EnquiryRow,
} from './queries'
import { leadFilterOptions } from '../leads/queries'

const STAGE_TONES: Record<EnquiryStage, Tone> = {
  NEW: 'neutral',
  CONTACTED: 'info',
  COUNSELLING_SCHEDULED: 'caution',
  COUNSELLING_COMPLETED: 'brand',
  CONVERTED: 'positive',
  LOST: 'critical',
}

function dueBadge(next: Date | null, stage: EnquiryStage) {
  if (stage === 'CONVERTED' || stage === 'LOST') {
    return <span className="text-faint">—</span>
  }
  if (!next) return <Badge tone="neutral">Not scheduled</Badge>

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (next < today) return <Badge tone="critical">Overdue</Badge>
  if (next < tomorrow)
    return (
      <Badge tone="caution">
        {next.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </Badge>
    )
  return (
    <Badge tone="brand">
      {next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
    </Badge>
  )
}

/**
 * One implementation behind three screens.
 *
 * The vendor scope listed Call Schedule, Counselling Call Schedule and
 * Counselling Completed Call Schedule as separate screens with near-identical
 * descriptions; they differ only by which stages and due window they preset.
 * See docs/decisions.md ADR-004.
 */
export async function EnquiryScreen({
  searchParams,
  basePath,
  title,
  subtitle,
  resource,
  preset,
  exportPath,
  stageFilterOptions,
  emptyTitle,
  emptyDescription,
  summary,
}: {
  searchParams: SearchParams
  basePath: string
  title: string
  subtitle?: string
  resource: Resource
  preset?: { stages?: EnquiryStage[]; dueOnly?: boolean }
  exportPath?: string
  stageFilterOptions?: EnquiryStage[]
  emptyTitle: string
  emptyDescription: string
  summary?: React.ReactNode
}) {
  const user = await requireUser()

  const params = parseTableParams(searchParams, {
    allowedSorts: ENQUIRY_SORTS,
    defaultSort: preset?.dueOnly ? 'nextCallAt' : 'createdAt',
    defaultDir: preset?.dueOnly ? 'asc' : 'desc',
    filterKeys: ENQUIRY_FILTER_KEYS,
  })

  const [{ rows, total }, options, density] = await Promise.all([
    listEnquiries(user, params, preset),
    leadFilterOptions(user),
    getDensity(),
  ])

  const mayUpdate = can(user, resource, 'update')
  const mayExport = can(user, resource, 'export')
  const mayAdmit = can(user, 'admission.application', 'create')

  // Stages a user may move an enquiry to from this screen.
  const stageChoices = (stageFilterOptions ?? (Object.keys(STAGE_LABELS) as EnquiryStage[])).map(
    (s) => ({ value: s, label: STAGE_LABELS[s] }),
  )

  const columns: Column<EnquiryRow>[] = [
    {
      key: 'name',
      header: 'Enquiry',
      sortable: true,
      width: 'w-56',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.name}</p>
          <p className="numeric truncate text-xs font-normal text-muted">
            {r.enquiryNo} · {r.phone}
          </p>
        </div>
      ),
    },
    {
      key: 'course',
      header: 'Course',
      hideBelow: 'md',
      cell: (r) => r.course?.name ?? <span className="text-faint">—</span>,
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      cell: (r) => <Badge tone={STAGE_TONES[r.stage]}>{STAGE_LABELS[r.stage]}</Badge>,
    },
    {
      key: 'status',
      header: 'Last outcome',
      hideBelow: 'lg',
      cell: (r) =>
        r.callStatus ? (
          <span className="text-muted">{r.callStatus.name}</span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: 'callCount',
      header: 'Calls',
      sortable: true,
      align: 'right',
      width: 'w-20',
      hideBelow: 'sm',
      cell: (r) => <span className="numeric">{r.callCount}</span>,
    },
    {
      key: 'nextCallAt',
      header: 'Next call',
      sortable: true,
      width: 'w-32',
      cell: (r) => dueBadge(r.nextCallAt, r.stage),
    },
    {
      key: 'assignedTo',
      header: 'Counsellor',
      hideBelow: 'xl',
      cell: (r) => r.assignedTo?.fullName ?? <span className="text-faint">Unassigned</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-10',
      cell: (r) => (
        <EnquiryRowActions
          enquiryId={r.id}
          enquiryNo={r.enquiryNo}
          name={r.name}
          stage={r.stage}
          statuses={options.statuses}
          stages={stageChoices}
          canUpdate={mayUpdate}
          canAdmit={mayAdmit}
          isClosed={r.stage === 'CONVERTED' || r.stage === 'LOST'}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      {summary}

      <Card className="overflow-hidden">
        <FilterBar
          basePath={basePath}
          searchPlaceholder="Search name, phone or enquiry no…"
          filters={[
            ...(stageFilterOptions && stageFilterOptions.length > 1
              ? [
                  {
                    key: 'stage',
                    label: 'Stage',
                    options: stageFilterOptions.map((s) => ({
                      value: s,
                      label: STAGE_LABELS[s],
                    })),
                  },
                ]
              : []),
            {
              key: 'due',
              label: 'Follow-up',
              options: [
                { value: 'overdue', label: 'Overdue' },
                { value: 'today', label: 'Due today' },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'unscheduled', label: 'Not scheduled' },
              ],
            },
            {
              key: 'courseId',
              label: 'Course',
              options: options.courses.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              key: 'sourceId',
              label: 'Source',
              options: options.sources.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              key: 'assignedToId',
              label: 'Counsellor',
              options: options.counsellors.map((c) => ({
                value: c.id,
                label: c.fullName,
              })),
            },
          ]}
        >
          <DensityToggle density={density} />
          {mayExport && exportPath && <ExportMenu exportPath={exportPath} />}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          params={params}
          basePath={basePath}
          density={density}
          stickyFirstColumn
          rowHref={(r) => `/enquiry/enquiries/${r.id}`}
          empty={
            <EmptyState
              icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
              title={emptyTitle}
              description={emptyDescription}
              action={
                <Link href="/enquiry/leads">
                  <button className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
                    Go to leads
                  </button>
                </Link>
              }
            />
          }
        />

        {rows.length > 0 && (
          <Pagination params={params} basePath={basePath} totalRows={total} />
        )}
      </Card>
    </>
  )
}
