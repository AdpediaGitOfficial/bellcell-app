import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { MasterTable } from '../MasterTable'

export const metadata: Metadata = { title: 'Enquiry call status' }

export default async function EnquiryCallStatusPage() {
  const user = await requirePageUser('masters')

  const rows = await db.enquiryCallStatus.findMany({
    orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { leads: true, enquiries: true } },
    },
  })

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Enquiry call status"
        subtitle="Outcomes a counsellor can record against a call — e.g. Call Later, Attended, Not Interested."
      />
      <Card className="overflow-hidden pb-2">
        <MasterTable
          kind="enquiryCallStatus"
          showFlags
          usageLabel="Used by"
          canEdit={can(user, 'masters', 'update')}
          canDelete={can(user, 'masters', 'delete')}
          rows={rows.map((r) => ({
            id: r.id,
            name: r.name,
            archivedAt: r.archivedAt,
            requiresFollowUp: r.requiresFollowUp,
            isTerminal: r.isTerminal,
            sortOrder: r.sortOrder,
            inUse: r._count.leads + r._count.enquiries,
          }))}
        />
      </Card>
    </>
  )
}
