import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  IndianRupee,
  PhoneCall,
  UserPlus,
  Users,
} from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { formatPaiseShort } from '@/lib/money'
import { Card, CardHeader } from '@/components/ui/Card'
import { StatTile } from '@/components/ui/StatTile'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { FunnelChart } from '@/components/charts/FunnelChart'
import { CollectionChart } from '@/components/charts/CollectionChart'
import { getDashboardData } from './queries'

export const metadata: Metadata = { title: 'Dashboard' }

function greeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const user = await requireUser()
  const data = await getDashboardData(user)
  const now = new Date()

  const branchLabel =
    user.activeBranchId === null
      ? 'All branches'
      : (user.branches.find((b) => b.id === user.activeBranchId)?.name ??
        'Bell Cell Group of Institutions')

  return (
    <>
      <PageHeader
        eyebrow={now.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        title={`${greeting(now)}, ${user.fullName.split(' ')[0]}`}
        subtitle={branchLabel}
      />

      {/* Row 1 - KPIs. Every delta names its comparison window. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active students"
          value={data.activeStudents.toLocaleString('en-IN')}
          icon={<Users className="h-5 w-5" />}
          tint="brand"
        />
        <StatTile
          label="Admissions this month"
          value={data.admissionsThisMonth.toLocaleString('en-IN')}
          deltaPct={data.admissionsDelta}
          comparison="vs last month"
          icon={<GraduationCap className="h-5 w-5" />}
          tint="violet"
        />
        <StatTile
          label="Fee collected (MTD)"
          value={formatPaiseShort(data.collectedThisMonthPaise)}
          deltaPct={data.collectedDelta}
          comparison="vs last month"
          icon={<IndianRupee className="h-5 w-5" />}
          tint="amber"
        />
        {/* The number that actually runs an institute, and the one the
            supplied reference dashboard had no equivalent for. */}
        <StatTile
          label="Fee overdue"
          value={formatPaiseShort(data.overduePaise)}
          inverse
          icon={<AlertTriangle className="h-5 w-5" />}
          tint="rose"
        />
      </div>

      {/* Row 2 - the funnel is the highest-value chart here. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Enquiry funnel"
            action={
              <Link
                href="/enquiry/enquiries"
                className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                View all
              </Link>
            }
          />
          <FunnelChart stages={data.funnel} />
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Fee collection"
            action={<span className="text-xs text-faint">Last 30 days</span>}
          />
          <CollectionChart points={data.collection} />
        </Card>
      </div>

      {/* Row 3 - today's work. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today's follow-up calls"
            action={
              <Link
                href="/enquiry/call-schedule"
                className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-[rgb(var(--border-base))] px-5 pb-4">
            {data.todaysCalls.length === 0 && (
              <li className="py-6 text-center text-sm text-muted">
                No calls scheduled for today.
              </li>
            )}
            {data.todaysCalls.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  <PhoneCall className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-strong">{c.name}</p>
                  <p className="truncate text-xs text-muted">
                    {c.phone}
                    {c.course?.name ? ` · ${c.course.name}` : ''}
                  </p>
                </div>
                <span className="numeric shrink-0 text-xs text-faint">
                  {c.nextCallAt?.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Recent admissions"
            action={
              <Link
                href="/admissions/applications"
                className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
              >
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-[rgb(var(--border-base))] px-5 pb-4">
            {data.recentAdmissions.length === 0 && (
              <li className="py-6 text-center text-sm text-muted">
                No admissions recorded yet.
              </li>
            )}
            {data.recentAdmissions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  <UserPlus className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-strong">
                    {s.firstName} {s.lastName ?? ''}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {s.admissionNo ?? '—'}
                    {s.course?.name ? ` · ${s.course.name}` : ''}
                  </p>
                </div>
                <Badge tone="brand">
                  {s.admissionDate?.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-faint">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        Figures are scoped to {branchLabel.toLowerCase()}.
      </p>
    </>
  )
}
