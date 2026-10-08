import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { LeadForm } from '../LeadForm'
import { leadFilterOptions } from '../queries'

export const metadata: Metadata = { title: 'Edit lead' }

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  if (!can(user, 'enquiry.lead', 'update')) notFound()

  const { id } = await params

  const [lead, options] = await Promise.all([
    db.enquiryLead.findFirst({
      // Branch-scoped, so a direct URL cannot reach another centre's lead.
      where: { id, ...branchScope(user), archivedAt: null },
      include: {
        followUps: {
          orderBy: { calledAt: 'desc' },
          take: 10,
          include: {
            callStatus: { select: { name: true } },
            calledBy: { select: { fullName: true } },
          },
        },
      },
    }),
    leadFilterOptions(user),
  ])

  if (!lead) notFound()

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title={lead.name}
        subtitle={`${lead.phone} · ${lead.callCount} call${lead.callCount === 1 ? '' : 's'} logged`}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <LeadForm leadId={lead.id} values={lead} options={options} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-strong">Call history</h2>
          {lead.followUps.length === 0 ? (
            <p className="text-sm text-muted">No calls logged yet.</p>
          ) : (
            <ol className="space-y-3">
              {lead.followUps.map((f) => (
                <li key={f.id} className="border-l-2 border-brand-200 pl-3 dark:border-brand-800">
                  <p className="text-xs text-faint">
                    {f.calledAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {f.calledBy ? ` · ${f.calledBy.fullName}` : ''}
                  </p>
                  <p className="text-sm font-medium text-strong">
                    {f.callStatus?.name ?? 'Call logged'}
                  </p>
                  {f.remarks && <p className="text-sm text-muted">{f.remarks}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  )
}
