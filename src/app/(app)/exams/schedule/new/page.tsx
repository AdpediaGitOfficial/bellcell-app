import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { needsBranchChoice } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { ScheduleForm } from '../ScheduleForm'

export const metadata: Metadata = { title: 'New examination' }

export default async function NewSchedulePage() {
  const user = await requirePageUser('exam.schedule', 'create')

  const [courses, batches, centres] = await Promise.all([
    db.course.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, durationYears: true },
    }),
    db.batch.findMany({
      where: { archivedAt: null },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    }),
    db.examCentre.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return (
    <>
      <PageHeader eyebrow="Examinations" title="New examination" />
      <Card className="mx-auto max-w-3xl p-5">
        <ScheduleForm
          scheduleId={null}
          courses={courses}
          batches={batches}
          centres={centres}
          branches={needsBranchChoice(user) ? user.branches : undefined}
        />
      </Card>
    </>
  )
}
