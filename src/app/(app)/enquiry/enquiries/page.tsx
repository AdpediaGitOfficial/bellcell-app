import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/current-user'
import type { SearchParams } from '@/lib/table/params'
import { EnquiryScreen } from './EnquiryScreen'
import { enquirySummary } from './queries'

export const metadata: Metadata = { title: 'Enquiries' }

const BASE = '/enquiry/enquiries'

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  const sp = await searchParams
  const s = await enquirySummary(user)

  return (
    <EnquiryScreen
      searchParams={sp}
      basePath={BASE}
      resource="enquiry.enquiry"
      title="Enquiries"
      subtitle="Qualified enquiries followed through counselling to admission."
      exportPath="/api/export/enquiries"
      stageFilterOptions={[
        'NEW',
        'CONTACTED',
        'COUNSELLING_SCHEDULED',
        'COUNSELLING_COMPLETED',
        'CONVERTED',
        'LOST',
      ]}
      emptyTitle="No enquiries match these filters"
      emptyDescription="Qualified leads appear here once converted. Try clearing the filters."
      summary={
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Tile label="Open" value={s.open} href={BASE} />
          <Tile label="Overdue" value={s.overdue} tone="critical" href={`${BASE}?due=overdue`} />
          <Tile label="Due today" value={s.dueToday} tone="caution" href={`${BASE}?due=today`} />
          <Tile
            label="Admitted"
            value={s.converted}
            tone="positive"
            href={`${BASE}?stage=CONVERTED`}
          />
          <Tile label="Lost" value={s.lost} href={`${BASE}?stage=LOST`} />
        </div>
      }
    />
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
  tone?: 'critical' | 'caution' | 'positive'
  href: string
}) {
  const colour =
    tone === 'critical'
      ? 'text-critical-600 dark:text-critical-500'
      : tone === 'caution'
        ? 'text-caution-600 dark:text-caution-500'
        : tone === 'positive'
          ? 'text-positive-600 dark:text-positive-500'
          : 'text-strong'

  return (
    <Link
      href={href}
      className="surface-card rounded-card px-4 py-3 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <p className="text-xs text-muted">{label}</p>
      <p className={`numeric mt-0.5 text-xl font-semibold ${colour}`}>
        {value.toLocaleString('en-IN')}
      </p>
    </Link>
  )
}
