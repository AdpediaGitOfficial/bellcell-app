import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import type { SearchParams } from '@/lib/table/params'
import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { PromotePanel, TransferPanel } from './PromotionForms'

export const metadata: Metadata = { title: 'Promotion & Transfer' }

/**
 * Scope items 11 ("Course transfer") and 12 ("Student Promotion").
 * Both move a student, so they share one screen with two tabs.
 */
export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  if (!can(user, 'admission.promotion', 'view')) notFound()

  const sp = await searchParams
  const tab = sp.tab === 'transfer' ? 'transfer' : 'promote'
  const scope = branchScope(user)

  const [eligible, batches, courses, recentPromotions, recentTransfers] =
    await Promise.all([
      db.student.findMany({
        where: {
          ...scope,
          archivedAt: null,
          status: { in: ['ADMITTED', 'ACTIVE', 'PROMOTED'] },
        },
        orderBy: [{ courseYear: 'asc' }, { firstName: 'asc' }],
        take: 500,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          applicationNo: true,
          admissionNo: true,
          courseYear: true,
          course: { select: { name: true, durationYears: true } },
        },
      }),
      db.batch.findMany({
        where: { archivedAt: null },
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true },
      }),
      db.course.findMany({
        where: { archivedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      db.studentPromotion.findMany({
        where: { student: { ...scope } },
        orderBy: { promotedAt: 'desc' },
        take: 15,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, applicationNo: true } },
        },
      }),
      db.courseTransfer.findMany({
        where: { student: { ...scope } },
        orderBy: { transferDate: 'desc' },
        take: 15,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, applicationNo: true } },
          fromCourse: { select: { name: true } },
          toCourse: { select: { name: true } },
        },
      }),
    ])

  const mayAct = can(user, 'admission.promotion', 'create')

  return (
    <>
      <PageHeader
        title="Promotion & Transfer"
        subtitle="Move students up a year, or onto a different course."
      />

      <div
        role="tablist"
        className="mb-4 flex gap-1 border-b border-[rgb(var(--border-base))]"
      >
        {[
          ['promote', 'Promote to next year'],
          ['transfer', 'Transfer course'],
        ].map(([key, label]) => (
          <Link
            key={key}
            role="tab"
            aria-selected={tab === key}
            href={`/admissions/promotions?tab=${key}`}
            className={
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ' +
              (tab === key
                ? 'border-brand-600 text-brand-700 dark:text-brand-400'
                : 'border-transparent text-muted hover:border-[rgb(var(--border-strong))] hover:text-strong')
            }
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          {!mayAct ? (
            <p className="py-8 text-center text-sm text-muted">
              You do not have permission to promote or transfer students.
            </p>
          ) : tab === 'promote' ? (
            <PromotePanel
              batches={batches}
              students={eligible.map((s) => ({
                id: s.id,
                label: `${s.firstName} ${s.lastName ?? ''}`.trim(),
                meta: `${s.admissionNo ?? s.applicationNo} · ${s.course.name}`,
                year: s.courseYear,
                finalYear: s.courseYear >= s.course.durationYears,
              }))}
            />
          ) : (
            <TransferPanel
              courses={courses}
              students={eligible.map((s) => ({
                id: s.id,
                label: `${s.firstName} ${s.lastName ?? ''}`.trim() + ` · ${s.admissionNo ?? s.applicationNo}`,
                course: s.course.name,
              }))}
            />
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title={tab === 'promote' ? 'Recent promotions' : 'Recent transfers'} />
          <div className="px-5 pb-5">
            {tab === 'promote' ? (
              recentPromotions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">None yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentPromotions.map((p) => (
                    <li key={p.id} className="text-sm">
                      <Link
                        href={`/admissions/applications/${p.student.id}`}
                        className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                      >
                        {p.student.firstName} {p.student.lastName ?? ''}
                      </Link>
                      <p className="text-xs text-muted">
                        Year {p.fromYear} → {p.toYear} ·{' '}
                        {p.promotedAt.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : recentTransfers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">None yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentTransfers.map((t) => (
                  <li key={t.id} className="text-sm">
                    <Link
                      href={`/admissions/applications/${t.student.id}`}
                      className="font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                    >
                      {t.student.firstName} {t.student.lastName ?? ''}
                    </Link>
                    <p className="text-xs text-muted">
                      {t.fromCourse.name} → {t.toCourse.name}
                    </p>
                    {t.feeAdjustmentPaise !== 0 && (
                      <Badge tone={t.feeAdjustmentPaise > 0 ? 'caution' : 'positive'} className="mt-1">
                        Fee {t.feeAdjustmentPaise > 0 ? '+' : ''}
                        {formatPaise(t.feeAdjustmentPaise)}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
