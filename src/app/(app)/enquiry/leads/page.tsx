import type { Metadata } from 'next'
import Link from 'next/link'
import { Inbox, Plus, Upload } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { parseTableParams, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { ExportMenu } from '@/components/ui/ExportMenu'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import { LeadRowActions } from './LeadRowActions'
import {
  LEAD_FILTER_KEYS,
  LEAD_SORTS,
  leadFilterOptions,
  leadSummary,
  listLeads,
  type LeadRow,
} from './queries'

export const metadata: Metadata = { title: 'Leads' }

const BASE = '/enquiry/leads'

function dueTone(next: Date | null): {
  tone: 'critical' | 'caution' | 'neutral' | 'brand'
  label: string
} {
  if (!next) return { tone: 'neutral', label: 'Not scheduled' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (next < today) return { tone: 'critical', label: 'Overdue' }
  if (next < tomorrow) return { tone: 'caution', label: 'Today' }
  return { tone: 'brand', label: next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('enquiry.lead')
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: LEAD_SORTS,
    defaultSort: 'createdAt',
    defaultDir: 'desc',
    filterKeys: LEAD_FILTER_KEYS,
  })

  const [{ rows, total }, options, summary, density] = await Promise.all([
    listLeads(user, params),
    leadFilterOptions(user),
    leadSummary(user),
    getDensity(),
  ])

  const mayCreate = can(user, 'enquiry.lead', 'create')
  const mayExport = can(user, 'enquiry.lead', 'export')
  const mayUpdate = can(user, 'enquiry.lead', 'update')
  const mayDelete = can(user, 'enquiry.lead', 'delete')
  const mayConvert = mayUpdate && can(user, 'enquiry.enquiry', 'create')

  const columns: Column<LeadRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      width: 'w-56',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate">{r.name}</p>
          <p className="numeric truncate text-xs font-normal text-muted">{r.phone}</p>
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
      key: 'source',
      header: 'Source',
      hideBelow: 'lg',
      cell: (r) => r.source?.name ?? <span className="text-faint">—</span>,
    },
    {
      key: 'status',
      header: 'Call status',
      cell: (r) =>
        r.callStatus ? (
          <Badge tone={r.callStatus.isTerminal ? 'neutral' : 'info'}>
            {r.callStatus.name}
          </Badge>
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
      cell: (r) => {
        const { tone, label } = dueTone(r.nextCallAt)
        return <Badge tone={tone}>{label}</Badge>
      },
    },
    {
      key: 'assignedTo',
      header: 'Assigned to',
      hideBelow: 'xl',
      cell: (r) => r.assignedTo?.fullName ?? <span className="text-faint">Unassigned</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-10',
      cell: (r) => (
        <LeadRowActions
          leadId={r.id}
          leadName={r.name}
          statuses={options.statuses}
          canUpdate={mayUpdate}
          canConvert={mayConvert}
          canDelete={mayDelete}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Raw enquiries from campaigns, listings and walk-ins. Qualify them into enquiries."
        action={
          mayCreate ? (
            <div className="flex gap-2">
              <Link href={`${BASE}/import`}>
                <Button variant="secondary">
                  <Upload className="h-4 w-4" aria-hidden />
                  Import
                </Button>
              </Link>
              <Link href={`${BASE}/new`}>
                <Button>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add lead
                </Button>
              </Link>
            </div>
          ) : null
        }
      />

      {/* Summary strip — the counts a counsellor acts on first. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Total leads" value={summary.total} href={BASE} />
        <SummaryTile
          label="Overdue"
          value={summary.overdue}
          tone="critical"
          href={`${BASE}?due=overdue`}
        />
        <SummaryTile
          label="Due today"
          value={summary.dueToday}
          tone="caution"
          href={`${BASE}?due=today`}
        />
        <SummaryTile
          label="Not scheduled"
          value={summary.unscheduled}
          href={`${BASE}?due=unscheduled`}
        />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search name, phone or email…"
          filters={[
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
              key: 'callStatusId',
              label: 'Status',
              options: options.statuses.map((s) => ({ value: s.id, label: s.name })),
            },
            {
              key: 'assignedToId',
              label: 'Assigned',
              options: options.counsellors.map((c) => ({
                value: c.id,
                label: c.fullName,
              })),
            },
          ]}
        >
          <DensityToggle density={density} />
          {mayExport && <ExportMenu exportPath="/api/export/enquiry-leads" />}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          params={params}
          basePath={BASE}
          density={density}
          stickyFirstColumn
          rowHref={mayUpdate ? (r) => `${BASE}/${r.id}` : undefined}
          empty={
            <EmptyState
              icon={<Inbox className="h-5 w-5" aria-hidden />}
              title={
                total === 0 && !params.q && Object.keys(params.filters).length === 0
                  ? 'No leads yet'
                  : 'No leads match these filters'
              }
              description={
                total === 0 && !params.q && Object.keys(params.filters).length === 0
                  ? 'Import a CSV from a campaign or listing site, or add a lead by hand.'
                  : 'Try clearing the search or filters above.'
              }
              action={
                mayCreate ? (
                  <>
                    <Link href={`${BASE}/import`}>
                      <Button variant="secondary" size="sm">
                        Import leads
                      </Button>
                    </Link>
                    <Link href={`${BASE}/new`}>
                      <Button size="sm">Add lead</Button>
                    </Link>
                  </>
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

function SummaryTile({
  label,
  value,
  tone,
  href,
}: {
  label: string
  value: number
  tone?: 'critical' | 'caution'
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
            : tone === 'caution'
              ? 'text-caution-600 dark:text-caution-500'
              : 'text-strong')
        }
      >
        {value.toLocaleString('en-IN')}
      </p>
    </Link>
  )
}
