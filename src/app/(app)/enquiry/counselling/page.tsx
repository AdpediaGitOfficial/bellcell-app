import type { Metadata } from 'next'
import { requirePageUser } from '@/lib/auth/guard'
import type { SearchParams } from '@/lib/table/params'
import { EnquiryScreen } from '../enquiries/EnquiryScreen'

export const metadata: Metadata = { title: 'Counselling' }

/**
 * The vendor scope had two counselling screens — "Counselling Call Schedule"
 * and "Counselling Completed Call Schedule" — differing only by stage. They
 * are one screen with a stage filter here; see docs/decisions.md ADR-004.
 */
export default async function CounsellingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePageUser('enquiry.counselling')
  const sp = await searchParams

  return (
    <EnquiryScreen
      searchParams={sp}
      basePath="/enquiry/counselling"
      resource="enquiry.counselling"
      title="Counselling"
      subtitle="Enquiries scheduled for counselling and those already counselled."
      preset={{ stages: ['COUNSELLING_SCHEDULED', 'COUNSELLING_COMPLETED'] }}
      stageFilterOptions={['COUNSELLING_SCHEDULED', 'COUNSELLING_COMPLETED']}
      emptyTitle="No counselling sessions"
      emptyDescription="Enquiries appear here once a counselling slot is scheduled from the Call Schedule."
    />
  )
}
