import Link from 'next/link'
import { AlertTriangle, GraduationCap, Phone } from 'lucide-react'
import { formatPaise } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { STATUS_LABELS } from '../queries'
import type { StudentRecord } from './queries'

const STATUS_TONES: Record<string, Tone> = {
  APPLIED: 'info',
  ADMITTED: 'brand',
  ACTIVE: 'positive',
  PROMOTED: 'positive',
  COMPLETED: 'neutral',
  TRANSFERRED: 'neutral',
  DROPPED: 'critical',
  CANCELLED: 'critical',
}

/**
 * Sticky identity rail. The student's name, number and dues must never
 * scroll away while someone works through the tabs — it is the context for
 * every decision made on this page.
 */
export function StudentSummaryRail({
  student,
  outstandingPaise,
  overduePaise,
  canViewFees,
}: {
  student: StudentRecord
  outstandingPaise: number
  overduePaise: number
  canViewFees: boolean
}) {
  const name = `${student.firstName} ${student.lastName ?? ''}`.trim()
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <Card className="lg:sticky lg:top-20 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-strong">{name}</p>
          <p className="numeric truncate text-xs text-muted">
            {student.admissionNo ?? student.applicationNo}
          </p>
          <Badge tone={STATUS_TONES[student.status] ?? 'neutral'} className="mt-1.5">
            {STATUS_LABELS[student.status]}
          </Badge>
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-[rgb(var(--border-base))] pt-4 text-sm">
        <Row label="Course" value={student.course.name} />
        <Row label="Year" value={`Year ${student.courseYear}`} />
        <Row label="Batch" value={student.batch.name} />
        {student.classMode && <Row label="Mode" value={student.classMode.name} />}
        <Row label="Branch" value={student.branch.name} />
        {student.affiliationBody && (
          <Row label="Affiliation" value={student.affiliationBody.name} />
        )}
        {student.enrolmentNumber && (
          <Row label="Enrolment" value={student.enrolmentNumber} numeric />
        )}
      </dl>

      {student.phone && (
        <a
          href={`tel:${student.phone}`}
          className="mt-4 flex items-center gap-2 rounded-lg border border-[rgb(var(--border-base))] px-3 py-2 text-sm text-strong hover:bg-[rgb(var(--surface-hover))]"
        >
          <Phone className="h-4 w-4 text-brand-600" aria-hidden />
          <span className="numeric">{student.phone}</span>
        </a>
      )}

      {canViewFees && (
        <div className="mt-4 rounded-lg border border-[rgb(var(--border-base))] p-3">
          <p className="text-xs text-muted">Outstanding</p>
          <p
            className={
              'numeric text-lg font-semibold ' +
              (overduePaise > 0
                ? 'text-critical-600 dark:text-critical-500'
                : 'text-strong')
            }
          >
            {formatPaise(outstandingPaise)}
          </p>
          {overduePaise > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-critical-600 dark:text-critical-500">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {formatPaise(overduePaise)} overdue
            </p>
          )}
        </div>
      )}

      {student.enquiry && (
        <Link
          href={`/enquiry/enquiries/${student.enquiry.id}`}
          className="mt-3 flex items-center gap-1.5 text-xs text-brand-700 hover:underline dark:text-brand-400"
        >
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          From enquiry {student.enquiry.enquiryNo}
        </Link>
      )}
    </Card>
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
