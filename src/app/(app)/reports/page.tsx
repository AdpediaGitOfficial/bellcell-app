import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Construction } from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'

export const metadata: Metadata = { title: 'Reports' }

/** The 13 reports from the signed scope, as one index. */
const REPORTS: {
  group: string
  items: { label: string; href?: string; description: string }[]
}[] = [
  {
    group: 'Enquiry',
    items: [
      {
        label: 'Enquiry count',
        href: '/reports/enquiry-count',
        description: 'Enquiries raised, by counsellor, source, course or branch.',
      },
      {
        label: 'Enquiry lead count',
        href: '/reports/enquiry-lead-count',
        description: 'Raw leads captured and how many became enquiries.',
      },
    ],
  },
  {
    group: 'Students',
    items: [
      {
        label: 'Students summary',
        href: '/reports/students-summary',
        description: 'Headcount by course, batch, mode or branch, split by status.',
      },
      { label: 'Student ID card summary', description: 'Requested, received, collected.' },
      { label: 'Study material issue summary', description: 'What was issued to whom.' },
      {
        label: 'Student certificate summary',
        href: '/reports/certificate-summary',
        description: 'Certificates issued, and originals held in custody.',
      },
    ],
  },
  {
    group: 'Fees & accounts',
    items: [
      {
        label: 'Fee collection summary',
        href: '/reports/fee-collection',
        description: 'Money received, by day, mode, course or collector.',
      },
      {
        label: 'Students fee summary',
        href: '/reports/student-fees',
        description: 'Per-student dues, concessions and payments.',
      },
      { label: 'Affiliation tie-up payment summary', description: 'Collected vs remitted.' },
      { label: 'Day book', description: 'All money movement for a date.' },
      { label: 'Payment receipt summary', description: 'Receipts issued in a period.' },
    ],
  },
  {
    group: 'Examinations',
    items: [
      {
        label: 'Examination schedule & result summary',
        href: '/reports/exam-summary',
        description: 'Examinations in a period, with pass rates.',
      },
      {
        label: 'Affiliation tie-up certificate summary',
        href: '/reports/certificate-summary',
        description: 'Originals sent to and returned from the university.',
      },
    ],
  },
]

export default async function ReportsPage() {
  const user = await requireUser()
  if (!can(user, 'reports', 'view')) notFound()

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Every report filters by date range and exports to Excel or CSV."
      />

      <div className="space-y-6">
        {REPORTS.map((group) => (
          <section key={group.group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
              {group.group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((r) =>
                r.href ? (
                  <Link key={r.label} href={r.href}>
                    <Card className="h-full p-4 transition-shadow hover:shadow-card-hover">
                      <p className="text-sm font-medium text-strong">{r.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{r.description}</p>
                    </Card>
                  </Link>
                ) : (
                  <Card key={r.label} className="h-full p-4 opacity-60" aria-disabled="true">
                    <p className="flex items-center gap-2 text-sm font-medium text-strong">
                      {r.label}
                      <Badge tone="neutral" icon={<Construction className="h-3 w-3" />}>
                        Planned
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{r.description}</p>
                  </Card>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
