import type { Metadata } from 'next'
import { requirePageUser } from '@/lib/auth/guard'
import type { SearchParams } from '@/lib/table/params'
import { EnquiryScreen } from '../enquiries/EnquiryScreen'
import { OPEN_STAGES } from '../enquiries/queries'

export const metadata: Metadata = { title: 'Call Schedule' }

/**
 * Pending and upcoming follow-ups across every open stage.
 * Same implementation as Enquiries, preset to "due today or earlier".
 */
export default async function CallSchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePageUser('enquiry.callSchedule')
  const sp = await searchParams

  return (
    <EnquiryScreen
      searchParams={sp}
      basePath="/enquiry/call-schedule"
      resource="enquiry.callSchedule"
      title="Call Schedule"
      subtitle="Follow-ups that are due today or overdue, oldest first."
      preset={{ stages: OPEN_STAGES, dueOnly: true }}
      stageFilterOptions={OPEN_STAGES}
      emptyTitle="Nothing due"
      emptyDescription="No follow-up calls are pending or overdue right now. Use the Follow-up filter to look ahead."
    />
  )
}
