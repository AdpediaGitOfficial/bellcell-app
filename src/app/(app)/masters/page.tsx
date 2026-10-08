import type { Metadata } from 'next'
import Link from 'next/link'
import { Construction } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'

export const metadata: Metadata = { title: 'Masters' }

/**
 * One nav entry for 19 masters, as an index of cards.
 *
 * Masters are visited rarely; nineteen sidebar items would drown the six
 * screens staff use daily. See docs/design-system.md §2.
 */
const MASTERS: {
  group: string
  items: { label: string; href?: string; description: string }[]
}[] = [
  {
    group: 'Enquiry',
    items: [
      {
        label: 'Enquiry call status',
        href: '/masters/enquiry-call-status',
        description: 'Call Later, Attended, Not Interested…',
      },
      {
        label: 'Nature of enquiry',
        href: '/masters/enquiry-source',
        description: 'Direct, News Paper, Web Site, C/O…',
      },
    ],
  },
  {
    group: 'Academic',
    items: [
      { label: 'Course type', description: 'Post Graduate, Under Graduate, Diploma' },
      { label: 'Course', description: 'B.Com, BA, MCA, MBA…' },
      { label: 'Batch', description: 'e.g. 2026-2027' },
      { label: 'Subject', description: 'By course type, course and year' },
      { label: 'Syllabus & study material', description: 'Issuable books and kits' },
      { label: 'Class mode', description: 'Regular, Distance, Weekend' },
      { label: 'Medium & second language', description: 'Tamil, English, Malayalam…' },
    ],
  },
  {
    group: 'Affiliation',
    items: [
      { label: 'Affiliation & tie-up', description: 'Calicut University, Bharathiar University' },
      { label: 'Affiliation course', description: 'Map internal courses to university codes' },
      { label: 'Examination centre', description: 'Where exams are conducted' },
      { label: 'Certificate type', description: 'SSLC, Plus Two, TC, Migration' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { label: 'Fee type', description: 'Application Fee, Exam Fee, Tuition Fee…' },
      {
        label: 'Account head',
        href: '/masters/account-heads',
        description: 'Salary, Rent, Donation, Stationery…',
      },
      {
        label: 'Bank account',
        href: '/masters/bank-accounts',
        description: 'Accounts money is received into',
      },
    ],
  },
  {
    group: 'People',
    items: [
      {
        label: 'Department',
        href: '/masters/departments',
        description: 'Administration, Commerce, Computer Science',
      },
      { label: 'Religion', description: 'Used on the admission form' },
    ],
  },
]

export default async function MastersPage() {
  await requirePageUser('masters')

  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="One-time reference data used across the system. Entries are archived rather than deleted, so historical records stay accurate."
      />

      <div className="space-y-6">
        {MASTERS.map((group) => (
          <section key={group.group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
              {group.group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((m) =>
                m.href ? (
                  <Link key={m.label} href={m.href}>
                    <Card className="h-full p-4 transition-shadow hover:shadow-card-hover">
                      <p className="text-sm font-medium text-strong">{m.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{m.description}</p>
                    </Card>
                  </Link>
                ) : (
                  <Card
                    key={m.label}
                    className="h-full p-4 opacity-60"
                    aria-disabled="true"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-strong">
                      {m.label}
                      <Badge tone="neutral" icon={<Construction className="h-3 w-3" />}>
                        Planned
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">{m.description}</p>
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
