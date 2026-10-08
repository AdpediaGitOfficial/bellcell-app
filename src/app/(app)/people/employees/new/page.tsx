import type { Metadata } from 'next'
import { requirePageUser } from '@/lib/auth/guard'
import { needsBranchChoice } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { EmployeeForm } from '../EmployeeForm'
import { employeeFilterOptions } from '../queries'

export const metadata: Metadata = { title: 'Add employee' }

export default async function NewEmployeePage() {
  const user = await requirePageUser('people.employee', 'create')

  const { departments } = await employeeFilterOptions()
  const branches = needsBranchChoice(user) ? user.branches : undefined

  return (
    <>
      <PageHeader
        eyebrow="Employees"
        title="Add employee"
        subtitle="Qualifications, experience and system access are added once the record exists."
      />
      <Card className="mx-auto max-w-3xl p-5">
        <EmployeeForm
          employeeId={null}
          options={{ departments, branches }}
          cancelHref="/people/employees"
        />
      </Card>
    </>
  )
}
