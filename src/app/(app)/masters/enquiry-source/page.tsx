import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { MasterTable } from '../MasterTable'

export const metadata: Metadata = { title: 'Nature of enquiry' }

export default async function EnquirySourcePage() {
  const user = await requireUser()
  if (!can(user, 'masters', 'view')) notFound()

  const rows = await db.enquirySource.findMany({
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { leads: true, enquiries: true } } },
  })

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Nature of enquiry"
        subtitle="Where enquiries come from — e.g. Direct, News Paper, Web Site, C/O, Friends."
      />
      <Card className="overflow-hidden pb-2">
        <MasterTable
          kind="enquirySource"
          usageLabel="Used by"
          canEdit={can(user, 'masters', 'update')}
          canDelete={can(user, 'masters', 'delete')}
          rows={rows.map((r) => ({
            id: r.id,
            name: r.name,
            archivedAt: r.archivedAt,
            inUse: r._count.leads + r._count.enquiries,
          }))}
        />
      </Card>
    </>
  )
}
