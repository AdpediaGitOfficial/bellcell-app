import type { Metadata } from 'next'
import Link from 'next/link'
import { Award } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { IssueCompletion, IssueTc } from './IssueForms'

export const metadata: Metadata = { title: 'Certificates Issued' }

export default async function CertificatesIssuedPage() {
  const user = await requirePageUser('exam.certificate')
  if (!can(user, 'exam.certificate', 'view')) return null

  const scope = branchScope(user)

  const [tcs, completions, tcEligible, ccEligible] = await Promise.all([
    db.transferCertificate.findMany({
      where: { student: { ...scope } },
      orderBy: { issuedAt: 'desc' },
      take: 50,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            applicationNo: true,
            admissionNo: true,
            course: { select: { name: true } },
          },
        },
      },
    }),
    db.courseCompletionCertificate.findMany({
      where: { student: { ...scope } },
      orderBy: { completionDate: 'desc' },
      take: 50,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            applicationNo: true,
            admissionNo: true,
            course: { select: { name: true } },
          },
        },
      },
    }),
    // Anyone still on the books who has not already been given a TC.
    db.student.findMany({
      where: {
        ...scope,
        archivedAt: null,
        status: { notIn: ['TRANSFERRED', 'CANCELLED'] },
        transferCertificates: { none: {} },
      },
      orderBy: [{ firstName: 'asc' }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        applicationNo: true,
        admissionNo: true,
        course: { select: { name: true } },
      },
    }),
    db.student.findMany({
      where: {
        ...scope,
        archivedAt: null,
        status: 'COMPLETED',
        completionCertificates: { none: {} },
      },
      orderBy: [{ firstName: 'asc' }],
      take: 500,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        applicationNo: true,
        admissionNo: true,
        course: { select: { name: true } },
      },
    }),
  ])

  const mayIssue = can(user, 'exam.certificate', 'create')
  const label = (s: {
    firstName: string
    lastName: string | null
    admissionNo: string | null
    applicationNo: string
    course: { name: string }
  }) =>
    `${s.firstName} ${s.lastName ?? ''}`.trim() +
    ` · ${s.admissionNo ?? s.applicationNo} · ${s.course.name}`

  return (
    <>
      <PageHeader
        title="Certificates Issued"
        subtitle="Transfer certificates and course completion certificates."
        action={
          mayIssue ? (
            <div className="flex flex-wrap gap-2">
              <IssueTc students={tcEligible.map((s) => ({ id: s.id, label: label(s) }))} />
              <IssueCompletion
                students={ccEligible.map((s) => ({ id: s.id, label: label(s) }))}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Transfer certificates</h2>
            <span className="numeric text-xs text-muted">{tcs.length}</span>
          </div>
          {tcs.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState title="None issued yet" description="A TC is issued when a student leaves." />
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {tcs.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/exams/certificates/tc/${t.id}`}
                      className="block truncate text-sm font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                    >
                      {t.student.firstName} {t.student.lastName ?? ''}
                    </Link>
                    <p className="numeric truncate text-xs text-muted">
                      {t.tcNumber} ·{' '}
                      {t.issuedAt.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  {t.handedOverAt ? (
                    <Badge tone="positive">Collected</Badge>
                  ) : (
                    <Badge tone="caution">Not collected</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Course completion</h2>
            <span className="numeric text-xs text-muted">{completions.length}</span>
          </div>
          {completions.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={<Award className="h-5 w-5" aria-hidden />}
                title="None issued yet"
                description="Issued once a student reaches the end of their course."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {completions.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/exams/certificates/completion/${c.id}`}
                      className="block truncate text-sm font-medium text-strong hover:text-brand-700 hover:underline dark:hover:text-brand-400"
                    >
                      {c.student.firstName} {c.student.lastName ?? ''}
                    </Link>
                    <p className="numeric truncate text-xs text-muted">
                      {c.certificateNo} · {c.student.course.name}
                    </p>
                  </div>
                  {c.grade && <Badge tone="brand">{c.grade}</Badge>}
                  {c.handedOverAt ? (
                    <Badge tone="positive">Collected</Badge>
                  ) : (
                    <Badge tone="caution">Not collected</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
