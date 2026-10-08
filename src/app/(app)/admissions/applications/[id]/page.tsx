import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { outstandingPaise } from '@/lib/fees/core'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { ApplicationForm } from '../ApplicationForm'
import { studentFilterOptions } from '../queries'
import { StudentSummaryRail } from './StudentSummaryRail'
import { RecordTabs, isTab, type TabKey } from './tabs'
import { FamilyTab } from './FamilyTab'
import { EducationTab } from './EducationTab'
import { FeesTab } from './FeesTab'
import { assignableStructures, getStudentRecord, getStudentTimeline } from './queries'

export const metadata: Metadata = { title: 'Application' }

export default async function ApplicationRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.application')

  const { id } = await params
  const sp = await searchParams
  const rawTab = typeof sp.tab === 'string' ? sp.tab : undefined
  const tab: TabKey = isTab(rawTab) ? rawTab : 'personal'

  const student = await getStudentRecord(user, id)
  if (!student) notFound()

  const canEdit = can(user, 'admission.application', 'update')
  const canViewFees = can(user, 'admission.fee', 'view')
  const canCollect = can(user, 'admission.fee', 'create')
  const canAssign = can(user, 'admission.fee', 'create')

  const dues = student.installments.reduce(
    (acc, i) => {
      const bal = outstandingPaise(i)
      acc.outstanding += bal
      if (bal > 0 && i.status === 'OVERDUE') acc.overdue += bal
      return acc
    },
    { outstanding: 0, overdue: 0 },
  )

  const [options, certificateTypes, structures, timeline] = await Promise.all([
    studentFilterOptions(),
    tab === 'education'
      ? db.certificateType.findMany({
          where: { archivedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    tab === 'fees' ? assignableStructures(student) : Promise.resolve([]),
    tab === 'timeline'
      ? getStudentTimeline(student.id, [
          ...student.guardians.map((g) => g.id),
          ...student.educations.map((e) => e.id),
          ...student.payments.map((p) => p.id),
          ...student.installments.map((i) => i.id),
        ])
      : Promise.resolve([]),
  ])

  const basePath = `/admissions/applications/${student.id}`
  const name = `${student.firstName} ${student.lastName ?? ''}`.trim()

  return (
    <>
      <Link
        href="/admissions/applications"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to applications
      </Link>

      <PageHeader
        eyebrow={`Application ${student.applicationNo}`}
        title={name}
        subtitle={`${student.course.name} · Year ${student.courseYear} · ${student.batch.name}`}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <StudentSummaryRail
          student={student}
          outstandingPaise={dues.outstanding}
          overduePaise={dues.overdue}
          canViewFees={canViewFees}
        />

        <div className="min-w-0">
          <RecordTabs
            basePath={basePath}
            active={tab}
            counts={{
              education: student.educations.length,
              family: student.guardians.length,
              fees: student.installments.length,
            }}
          />

          {tab === 'personal' && (
            <Card className="p-5">
              {canEdit ? (
                <ApplicationForm
                  studentId={student.id}
                  values={student}
                  options={options}
                />
              ) : (
                <ReadOnlyPersonal student={student} />
              )}
            </Card>
          )}

          {tab === 'education' && (
            <EducationTab
              student={student}
              certificateTypes={certificateTypes}
              canEdit={canEdit}
            />
          )}

          {tab === 'family' && <FamilyTab student={student} canEdit={canEdit} />}

          {tab === 'fees' &&
            (canViewFees ? (
              <FeesTab
                student={student}
                structures={structures}
                canCollect={canCollect}
                canAssign={canAssign}
              />
            ) : (
              <Card className="p-8 text-center text-sm text-muted">
                You do not have access to fee details.
              </Card>
            ))}

          {tab === 'timeline' && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-strong">
                Everything that happened to this record
              </h2>
              {timeline.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No activity recorded yet.
                </p>
              ) : (
                <ol className="space-y-3">
                  {timeline.map((t) => (
                    <li
                      key={t.id}
                      className="border-l-2 border-brand-200 pl-4 dark:border-brand-800"
                    >
                      <p className="text-xs text-faint">
                        {t.createdAt.toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {t.user ? ` · ${t.user.fullName}` : ' · system'}
                      </p>
                      <p className="text-sm text-strong">{t.summary}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function ReadOnlyPersonal({
  student,
}: {
  student: Awaited<ReturnType<typeof getStudentRecord>>
}) {
  if (!student) return null
  const rows: [string, string][] = [
    ['Application no', student.applicationNo],
    ['Admission no', student.admissionNo ?? '—'],
    ['Date of birth', student.dateOfBirth?.toLocaleDateString('en-IN') ?? '—'],
    ['Gender', student.gender ?? '—'],
    ['Phone', student.phone ?? '—'],
    ['Email', student.email ?? '—'],
    ['Category', student.category ?? '—'],
    [
      'Address',
      [student.addressLine1, student.city, student.state, student.pincode]
        .filter(Boolean)
        .join(', ') || '—',
    ],
  ]
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-sm text-strong">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
