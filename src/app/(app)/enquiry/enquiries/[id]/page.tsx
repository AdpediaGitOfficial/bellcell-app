import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/shell/PageHeader'
import { EnquiryRowActions } from '../EnquiryRowActions'
import { STAGE_LABELS } from '../queries'
import { leadFilterOptions } from '../../leads/queries'

export const metadata: Metadata = { title: 'Enquiry' }

export default async function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePageUser('enquiry.enquiry')

  const { id } = await params

  const [enquiry, options] = await Promise.all([
    db.enquiry.findFirst({
      where: { id, ...branchScope(user), archivedAt: null },
      include: {
        course: { select: { name: true } },
        source: { select: { name: true } },
        callStatus: { select: { name: true } },
        assignedTo: { select: { fullName: true } },
        branch: { select: { name: true } },
        originLead: { select: { id: true, createdAt: true } },
        followUps: {
          orderBy: { calledAt: 'desc' },
          include: {
            callStatus: { select: { name: true } },
            calledBy: { select: { fullName: true } },
          },
        },
      },
    }),
    leadFilterOptions(user),
  ])

  if (!enquiry) notFound()

  const isClosed = enquiry.stage === 'CONVERTED' || enquiry.stage === 'LOST'

  const facts: [string, React.ReactNode][] = [
    ['Enquiry no', <span key="n" className="numeric">{enquiry.enquiryNo}</span>],
    ['Phone', <span key="p" className="numeric">{enquiry.phone}</span>],
    ['Email', enquiry.email ?? '—'],
    ['City', enquiry.city ?? '—'],
    ['Course', enquiry.course?.name ?? '—'],
    ['Source', enquiry.source?.name ?? '—'],
    ['Counsellor', enquiry.assignedTo?.fullName ?? 'Unassigned'],
    ['Branch', enquiry.branch.name],
    [
      'Raised',
      enquiry.createdAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    ],
    [
      'Counselling',
      enquiry.counsellingCompletedAt
        ? `Completed ${enquiry.counsellingCompletedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
        : enquiry.counsellingScheduledAt
          ? `Scheduled ${enquiry.counsellingScheduledAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
          : 'Not scheduled',
    ],
  ]

  return (
    <>
      <Link
        href="/enquiry/enquiries"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to enquiries
      </Link>

      <PageHeader
        title={enquiry.name}
        subtitle={`${enquiry.enquiryNo} · ${enquiry.callCount} call${enquiry.callCount === 1 ? '' : 's'} logged`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={isClosed ? (enquiry.stage === 'CONVERTED' ? 'positive' : 'critical') : 'info'}>
              {STAGE_LABELS[enquiry.stage]}
            </Badge>
            <EnquiryRowActions
              enquiryId={enquiry.id}
              enquiryNo={enquiry.enquiryNo}
              name={enquiry.name}
              stage={enquiry.stage}
              statuses={options.statuses}
              stages={Object.entries(STAGE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              canUpdate={can(user, 'enquiry.enquiry', 'update')}
              canAdmit={can(user, 'admission.application', 'create')}
              isClosed={isClosed}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-strong">Details</h2>
          <dl className="space-y-2.5">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-sm">
                <dt className="shrink-0 text-muted">{label}</dt>
                <dd className="min-w-0 truncate text-right text-strong">{value}</dd>
              </div>
            ))}
          </dl>

          {enquiry.stage === 'LOST' && enquiry.lostReason && (
            <div className="mt-4 rounded-lg bg-critical-50 p-3 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500">
              <p className="font-medium">Reason lost</p>
              <p className="mt-0.5">{enquiry.lostReason}</p>
            </div>
          )}

          {enquiry.studentId && (
            <Link href={`/admissions/applications/${enquiry.studentId}`} className="mt-4 block">
              <Button variant="secondary" size="sm" className="w-full">
                <GraduationCap className="h-4 w-4" aria-hidden />
                View admission
              </Button>
            </Link>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Call history" />
          <div className="px-5 pb-5">
            {enquiry.followUps.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No calls logged yet.
              </p>
            ) : (
              <ol className="space-y-4">
                {enquiry.followUps.map((f) => (
                  <li
                    key={f.id}
                    className="border-l-2 border-brand-200 pl-4 dark:border-brand-800"
                  >
                    <p className="text-xs text-faint">
                      {f.calledAt.toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {f.calledBy ? ` · ${f.calledBy.fullName}` : ''}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
                      {f.callStatus?.name ?? 'Call logged'}
                      {f.stageAfter && (
                        <Badge tone="neutral">→ {STAGE_LABELS[f.stageAfter]}</Badge>
                      )}
                    </p>
                    {f.remarks && <p className="mt-0.5 text-sm text-muted">{f.remarks}</p>}
                    {f.nextCallAt && (
                      <p className="mt-0.5 text-xs text-muted">
                        Next call:{' '}
                        {f.nextCallAt.toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
