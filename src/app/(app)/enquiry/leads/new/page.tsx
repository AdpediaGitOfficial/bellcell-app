import type { Metadata } from 'next'
import { requirePageUser } from '@/lib/auth/guard'
import { needsBranchChoice } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { LeadForm } from '../LeadForm'
import { leadFilterOptions } from '../queries'

export const metadata: Metadata = { title: 'Add lead' }

export default async function NewLeadPage() {
  const user = await requirePageUser('enquiry.lead', 'create')

  const options = await leadFilterOptions(user)
  const branches = needsBranchChoice(user) ? user.branches : undefined

  return (
    <>
      <PageHeader eyebrow="Leads" title="Add lead" />
      <Card className="mx-auto max-w-3xl p-5">
        <LeadForm leadId={null} options={{ ...options, branches }} />
      </Card>
    </>
  )
}
