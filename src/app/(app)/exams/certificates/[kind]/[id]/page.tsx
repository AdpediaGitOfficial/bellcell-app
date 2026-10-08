import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { HandOver, PrintButton } from './HandOver'

export const metadata: Metadata = { title: 'Certificate' }

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const user = await requireUser()
  if (!can(user, 'exam.certificate', 'view')) notFound()

  const { kind, id } = await params
  if (kind !== 'tc' && kind !== 'completion') notFound()
  const sp = await searchParams
  const justIssued = sp.new === '1'

  const studentSelect = {
    id: true,
    firstName: true,
    lastName: true,
    applicationNo: true,
    admissionNo: true,
    dateOfBirth: true,
    admissionDate: true,
    courseYear: true,
    course: { select: { name: true } },
    batch: { select: { name: true } },
    branch: true,
    affiliationBody: { select: { name: true } },
    guardians: { where: { isPrimaryContact: true }, take: 1, select: { name: true, relation: true } },
  } as const

  const tc =
    kind === 'tc'
      ? await db.transferCertificate.findFirst({
          where: { id, student: { ...branchScope(user) } },
          include: { student: { select: studentSelect } },
        })
      : null

  const cc =
    kind === 'completion'
      ? await db.courseCompletionCertificate.findFirst({
          where: { id, student: { ...branchScope(user) } },
          include: { student: { select: studentSelect } },
        })
      : null

  const record = tc ?? cc
  if (!record) notFound()

  const student = record.student
  const name = `${student.firstName} ${student.lastName ?? ''}`.trim()
  const institute = process.env.INSTITUTE_NAME ?? 'Bell Cell'
  const guardian = student.guardians[0]
  const number = tc ? tc.tcNumber : cc!.certificateNo
  const collected = Boolean(record.handedOverAt)

  const title = tc ? 'Transfer Certificate' : 'Course Completion Certificate'

  const rows: [string, string][] = [
    [tc ? 'TC number' : 'Certificate number', number],
    ['Name of student', name],
    ['Admission number', student.admissionNo ?? student.applicationNo],
    guardian ? [`Name of ${guardian.relation.toLowerCase()}`, guardian.name] : ['Guardian', '—'],
    ['Date of birth', student.dateOfBirth?.toLocaleDateString('en-IN') ?? '—'],
    ['Course', student.course.name],
    ['Batch', student.batch.name],
    ['Date of admission', student.admissionDate?.toLocaleDateString('en-IN') ?? '—'],
    ...(tc
      ? ([
          ['Date of leaving', tc.issuedAt.toLocaleDateString('en-IN')],
          ['Reason for leaving', tc.reason ?? '—'],
          ['Conduct', tc.conductRemark ?? '—'],
        ] as [string, string][])
      : ([
          ['Date of completion', cc!.completionDate.toLocaleDateString('en-IN')],
          ['Grade awarded', cc!.grade ?? '—'],
          ['Affiliation', student.affiliationBody?.name ?? '—'],
        ] as [string, string][])),
  ]

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/exams/certificates"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to certificates
        </Link>
        <div className="flex items-center gap-2">
          {collected ? (
            <Badge tone="positive">
              Collected
              {tc?.receivedBy ? ` by ${tc.receivedBy}` : ''}
            </Badge>
          ) : (
            can(user, 'exam.certificate', 'update') && (
              <HandOver kind={kind} id={record.id} />
            )
          )}
          <PrintButton />
        </div>
      </div>

      {justIssued && (
        <p className="no-print mb-4 flex items-center gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          {title} {number} issued. Print it and record collection when the
          student takes it.
        </p>
      )}

      <Card className="mx-auto max-w-2xl p-10 print:border-0 print:shadow-none">
        <header className="mb-8 border-b-2 border-[rgb(var(--border-strong))] pb-4 text-center">
          <h1 className="text-2xl font-bold text-strong">{institute}</h1>
          <p className="text-sm text-muted">{student.branch.name}</p>
          {student.branch.addressLine1 && (
            <p className="text-xs text-muted">
              {[student.branch.addressLine1, student.branch.city, student.branch.state]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          <p className="mt-4 inline-block border-y border-[rgb(var(--border-strong))] px-6 py-1.5 text-base font-semibold uppercase tracking-widest text-strong">
            {title}
          </p>
        </header>

        <dl className="space-y-3 text-sm">
          {rows.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="flex gap-4 border-b border-dotted border-[rgb(var(--border-base))] pb-2">
              <dt className="w-52 shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 font-medium text-strong">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-sm leading-relaxed text-base">
          {tc
            ? `This is to certify that the above particulars are correct as per the records of this institution, and that ${name} has no dues outstanding at the time of leaving.`
            : `This is to certify that ${name} has successfully completed the course of study in ${student.course.name} at this institution.`}
        </p>

        <footer className="mt-16 flex items-end justify-between text-xs text-muted">
          <span>
            Issued on{' '}
            {(tc ? tc.issuedAt : cc!.issuedAt ?? cc!.completionDate).toLocaleDateString(
              'en-IN',
              { day: 'numeric', month: 'long', year: 'numeric' },
            )}
          </span>
          <span className="text-right">
            <span className="block h-12" />
            <span className="border-t border-[rgb(var(--border-strong))] px-6 pt-1">
              Principal
            </span>
          </span>
        </footer>
      </Card>
    </>
  )
}
