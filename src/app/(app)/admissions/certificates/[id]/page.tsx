import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { db } from '@/lib/db'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { CustodyActions } from '../CustodyActions'
import { ALLOWED_TRANSITIONS, CUSTODY_LABELS, getCustodyRecord } from '../queries'

export const metadata: Metadata = { title: 'Certificate custody' }

const TONES: Record<string, Tone> = {
  WITH_INSTITUTE: 'caution',
  SENT_FOR_VERIFICATION: 'info',
  RETURNED_FROM_AFFILIATION: 'brand',
  RETURNED_TO_STUDENT: 'positive',
  LOST: 'critical',
}

export default async function CustodyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePageUser('admission.certificateCustody')

  const { id } = await params
  const record = await getCustodyRecord(user, id)
  if (!record) notFound()

  const handlers = await db.user.findMany({
    where: { id: { in: record.events.map((e) => e.handledById ?? '').filter(Boolean) } },
    select: { id: true, fullName: true },
  })
  const nameOf = (uid: string | null) =>
    uid ? (handlers.find((h) => h.id === uid)?.fullName ?? 'Unknown') : 'system'

  const name = `${record.student.firstName} ${record.student.lastName ?? ''}`.trim()

  return (
    <>
      <Link
        href="/admissions/certificates"
        className="no-print mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to certificates
      </Link>

      <PageHeader
        eyebrow="Certificate custody"
        title={record.certificateType.name}
        subtitle={`${name} · ${record.student.admissionNo ?? record.student.applicationNo}`}
        action={
          <div className="no-print flex items-center gap-2">
            <Badge tone={TONES[record.status] ?? 'neutral'}>
              {CUSTODY_LABELS[record.status]}
            </Badge>
            <CustodyActions
              custodyId={record.id}
              studentName={name}
              currentStatus={record.status}
              allowed={ALLOWED_TRANSITIONS[record.status]}
              canUpdate={can(user, 'admission.certificateCustody', 'update')}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-strong">Document</h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Type" value={record.certificateType.name} />
            {record.studentEducation && (
              <Row label="Qualification" value={record.studentEducation.qualification} />
            )}
            <Row label="University" value={record.affiliationBody?.name ?? '—'} />
            <Row label="Student" value={name} />
            <Row
              label="Admission no"
              value={record.student.admissionNo ?? record.student.applicationNo}
              numeric
            />
            <Row label="Course" value={record.student.course.name} />
            <Row label="Branch" value={record.student.branch.name} />
            {record.student.phone && (
              <Row label="Phone" value={record.student.phone} numeric />
            )}
          </dl>

          {record.remarks && (
            <p className="mt-4 rounded-lg bg-[rgb(var(--surface-sunken))] p-3 text-sm text-muted">
              {record.remarks}
            </p>
          )}

          <Link
            href={`/admissions/applications/${record.student.id}?tab=education`}
            className="mt-4 block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400"
          >
            Open student record
          </Link>
        </Card>

        {/* The chain of custody: append-only, newest first. */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-strong">Chain of custody</h2>
            <span className="no-print inline-flex items-center gap-1 text-xs text-faint">
              <Printer className="h-3.5 w-3.5" aria-hidden />
              Print this page as the acknowledgement record
            </span>
          </div>

          {record.events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No movements recorded.</p>
          ) : (
            <ol className="space-y-4">
              {record.events.map((e) => (
                <li
                  key={e.id}
                  className="border-l-2 border-brand-200 pl-4 dark:border-brand-800"
                >
                  <p className="text-xs text-faint">
                    {e.occurredAt.toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {nameOf(e.handledById)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
                    {e.fromStatus && (
                      <>
                        <span className="text-muted">{CUSTODY_LABELS[e.fromStatus]}</span>
                        <span aria-hidden>→</span>
                      </>
                    )}
                    <Badge tone={TONES[e.toStatus] ?? 'neutral'}>
                      {CUSTODY_LABELS[e.toStatus]}
                    </Badge>
                  </p>
                  {e.remarks && <p className="mt-0.5 text-sm text-muted">{e.remarks}</p>}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  )
}

function Row({
  label,
  value,
  numeric,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-strong ${numeric ? 'numeric' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
