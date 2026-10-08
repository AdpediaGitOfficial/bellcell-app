import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { MasterTable } from '../MasterTable'

export const metadata: Metadata = { title: 'Departments' }

export default async function DepartmentsPage() {
  const user = await requirePageUser('masters')

  const rows = await db.department.findMany({
    orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { employees: true } } },
  })

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Departments"
        subtitle="What staff and faculty are grouped under — Administration, Commerce, Computer Science."
      />
      <Card className="overflow-hidden pb-2">
        <MasterTable
          kind="department"
          usageLabel="Employees"
          showCode
          canEdit={can(user, 'masters', 'update')}
          canDelete={can(user, 'masters', 'delete')}
          rows={rows.map((r) => ({
            id: r.id,
            name: r.name,
            code: r.code,
            archivedAt: r.archivedAt,
            inUse: r._count.employees,
          }))}
        />
      </Card>

      <p className="mt-4 text-xs text-faint">
        Archiving a department keeps it on the records of everyone already filed
        under it; it just stops appearing in the picker for new ones.
      </p>
    </>
  )
}
