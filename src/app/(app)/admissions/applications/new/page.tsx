import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { branchScope, needsBranchChoice } from '@/lib/branch'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { ApplicationForm } from '../ApplicationForm'
import { studentFilterOptions } from '../queries'

export const metadata: Metadata = { title: 'New application' }

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.application', 'create')

  const sp = await searchParams
  const enquiryId = typeof sp.enquiryId === 'string' ? sp.enquiryId : undefined

  const [options, enquiry] = await Promise.all([
    studentFilterOptions(),
    enquiryId
      ? db.enquiry.findFirst({
          where: { id: enquiryId, ...branchScope(user), archivedAt: null },
          select: {
            id: true,
            enquiryNo: true,
            name: true,
            phone: true,
            email: true,
            city: true,
            courseId: true,
            studentId: true,
          },
        })
      : null,
  ])

  // An enquiry already converted must not spawn a second student record.
  if (enquiry?.studentId) notFound()

  // Pre-fill from the enquiry: this is the handover point between the two
  // modules, and re-typing a name the counsellor already captured is where
  // transcription errors come from.
  const [firstName, ...rest] = (enquiry?.name ?? '').trim().split(/\s+/)
  const values = enquiry
    ? {
        firstName: firstName ?? '',
        lastName: rest.join(' ') || null,
        phone: enquiry.phone,
        email: enquiry.email,
        city: enquiry.city,
        courseId: enquiry.courseId,
        status: 'APPLIED',
      }
    : {}

  return (
    <>
      <PageHeader
        eyebrow="Applications"
        title="New application"
        subtitle={
          enquiry
            ? undefined
            : 'For a walk-in admission. To admit a counselled enquiry, start from the enquiry instead.'
        }
        action={
          enquiry ? (
            <Badge tone="brand">
              From enquiry {enquiry.enquiryNo} · {enquiry.name}
            </Badge>
          ) : null
        }
      />

      <Card className="mx-auto max-w-5xl p-5">
        <ApplicationForm
          studentId={null}
          values={values}
          enquiryId={enquiry?.id}
          options={{
            ...options,
            branches: needsBranchChoice(user) ? user.branches : undefined,
          }}
        />
      </Card>
    </>
  )
}
