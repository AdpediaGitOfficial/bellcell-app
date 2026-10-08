import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { GroupControls } from '../GroupControls'
import { parseRange } from '../queries'
import { CUSTODY_LABELS } from '@/app/(app)/admissions/certificates/queries'

export const metadata: Metadata = { title: 'Student Certificate Summary' }

const BASE = '/reports/certificate-summary'

/**
 * Both halves of the scope's certificate reporting in one place: documents
 * the institute ISSUED, and originals it is HOLDING. The second is the one
 * with legal weight.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('reports')

  const sp = await searchParams
  const range = parseRange(sp)
  const scope = branchScope(user)

  const [tcs, completions, custodyByStatus, overdueCustody] = await Promise.all([
    db.transferCertificate.count({
      where: { student: { ...scope }, issuedAt: { gte: range.from, lte: range.to } },
    }),
    db.courseCompletionCertificate.count({
      where: {
        student: { ...scope },
        completionDate: { gte: range.from, lte: range.to },
      },
    }),
    db.certificateCustody.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { student: { ...scope, archivedAt: null } },
    }),
    // Sent to the university more than 60 days ago and still not back.
    db.certificateCustody.findMany({
      where: {
        student: { ...scope, archivedAt: null },
        status: 'SENT_FOR_VERIFICATION',
        sentAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { sentAt: 'asc' },
      take: 25,
      include: {
        certificateType: { select: { name: true } },
        affiliationBody: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            applicationNo: true,
            admissionNo: true,
          },
        },
      },
    }),
  ])

  const countOf = (status: string) =>
    custodyByStatus.find((c) => c.status === status)?._count._all ?? 0

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Student Certificate Summary"
        subtitle="Documents issued in the period, and originals the institute is currently holding."
      />

      <Card className="mb-4 overflow-hidden">
        <GroupControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy=""
          groups={[]}
        />
        <div className="grid gap-px bg-[rgb(var(--border-base))] sm:grid-cols-2">
          <Figure label="Transfer certificates issued" value={tcs} />
          <Figure label="Completion certificates issued" value={completions} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Originals in custody</h2>
            <p className="mt-0.5 text-xs text-muted">
              Present position, not limited to the date range.
            </p>
          </div>
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {Object.entries(CUSTODY_LABELS).map(([status, label]) => {
              const n = countOf(status)
              const ours = ['WITH_INSTITUTE', 'SENT_FOR_VERIFICATION', 'RETURNED_FROM_AFFILIATION'].includes(status)
              return (
                <li key={status} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <Link
                    href={`/admissions/certificates?status=${status}`}
                    className="text-sm text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                  >
                    {label}
                  </Link>
                  <span
                    className={
                      'numeric text-sm font-medium ' +
                      (status === 'LOST'
                        ? 'text-critical-600 dark:text-critical-500'
                        : ours && n > 0
                          ? 'text-caution-600 dark:text-caution-500'
                          : 'text-strong')
                    }
                  >
                    {n}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">
              At the university over 60 days
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Originals sent for verification and not yet returned.
            </p>
          </div>
          {overdueCustody.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Nothing has been out for longer than 60 days.
            </p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {overdueCustody.map((c) => {
                const days = c.sentAt
                  ? Math.floor((Date.now() - c.sentAt.getTime()) / 86_400_000)
                  : 0
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admissions/certificates/${c.id}`}
                        className="block truncate text-sm font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {c.student.firstName} {c.student.lastName ?? ''}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {c.certificateType.name}
                        {c.affiliationBody ? ` · ${c.affiliationBody.name}` : ''}
                      </p>
                    </div>
                    <Badge tone="critical">{days} days</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[rgb(var(--surface-card))] px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="numeric mt-0.5 text-2xl font-semibold text-strong">
        {value.toLocaleString('en-IN')}
      </p>
    </div>
  )
}
