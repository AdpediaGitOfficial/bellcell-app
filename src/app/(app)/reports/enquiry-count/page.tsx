import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { ReportControls } from '../ReportControls'
import { CountReportTable } from '../CountReportTable'
import { enquiryCountReport, parseRange } from '../queries'

export const metadata: Metadata = { title: 'Enquiry Count' }

const BASE = '/reports/enquiry-count'
const GROUPS = ['counsellor', 'source', 'course', 'branch'] as const
type Group = (typeof GROUPS)[number]

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('reports')

  const sp = await searchParams
  const range = parseRange(sp)
  const raw = typeof sp.groupBy === 'string' ? sp.groupBy : ''
  const groupBy: Group = (GROUPS as readonly string[]).includes(raw)
    ? (raw as Group)
    : 'counsellor'

  const rows = await enquiryCountReport(user, range, groupBy)

  const label =
    groupBy === 'counsellor'
      ? 'Counsellor'
      : groupBy === 'source'
        ? 'Source'
        : groupBy === 'course'
          ? 'Course'
          : 'Branch'

  return (
    <>
      <Link
        href="/reports"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>

      <PageHeader
        eyebrow="Reports"
        title="Enquiry Count"
        subtitle="Total enquiries raised in the period, by the dimension you choose."
      />

      <Card className="overflow-hidden">
        <ReportControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy={groupBy}
        />
        <CountReportTable rows={rows} dimensionLabel={label} showStages={true} />
      </Card>
    </>
  )
}
