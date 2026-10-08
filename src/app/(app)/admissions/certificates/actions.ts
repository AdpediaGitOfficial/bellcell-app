'use server'

import { revalidatePath } from 'next/cache'
import type { CustodyStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { ALLOWED_TRANSITIONS, CUSTODY_LABELS } from './queries'

const BASE = '/admissions/certificates'

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/**
 * Move one or more original documents along the chain of custody.
 *
 * Every transition writes an append-only CertificateCustodyEvent AND an audit
 * entry. This is the highest legal-risk area in the system: the institute is
 * holding students' original certificates, and must be able to say at any
 * moment where each one is and who moved it.
 */
export async function transitionCustodyAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.certificateCustody', 'update')

  const ids = formData.getAll('custodyIds').map(String).filter(Boolean)
  const single = orNull(formData.get('custodyId'))
  if (single) ids.push(single)
  if (ids.length === 0) return

  const toStatus = String(formData.get('toStatus') ?? '') as CustodyStatus
  if (!(toStatus in CUSTODY_LABELS)) return

  const remarks = orNull(formData.get('remarks'))
  const receivedBy = orNull(formData.get('receivedBy'))
  const occurredRaw = orNull(formData.get('occurredAt'))
  const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date()
  if (Number.isNaN(occurredAt.getTime())) return

  const records = await db.certificateCustody.findMany({
    where: { id: { in: ids }, student: { ...branchScope(user), archivedAt: null } },
    include: {
      certificateType: { select: { name: true } },
      student: { select: { id: true, branchId: true, applicationNo: true, firstName: true, lastName: true } },
    },
  })

  for (const record of records) {
    // Refuse an illegal jump, however the request was crafted.
    if (!ALLOWED_TRANSITIONS[record.status].includes(toStatus)) continue

    const data: Prisma.CertificateCustodyUpdateInput = { status: toStatus }
    if (toStatus === 'SENT_FOR_VERIFICATION') data.sentAt = occurredAt
    if (toStatus === 'RETURNED_FROM_AFFILIATION') data.returnedAt = occurredAt
    if (toStatus === 'RETURNED_TO_STUDENT') data.handedBackAt = occurredAt
    if (remarks) data.remarks = remarks

    await db.$transaction([
      db.certificateCustody.update({ where: { id: record.id }, data }),
      db.certificateCustodyEvent.create({
        data: {
          custodyId: record.id,
          fromStatus: record.status,
          toStatus,
          occurredAt,
          handledById: user.id,
          remarks:
            toStatus === 'RETURNED_TO_STUDENT' && receivedBy
              ? `Received by ${receivedBy}${remarks ? ` — ${remarks}` : ''}`
              : remarks,
        },
      }),
    ])

    await recordAudit({
      userId: user.id,
      branchId: record.student.branchId,
      action: 'STATUS_CHANGE',
      entityType: 'CertificateCustody',
      entityId: record.id,
      summary: `${record.certificateType.name} for ${record.student.applicationNo}: ${CUSTODY_LABELS[record.status]} → ${CUSTODY_LABELS[toStatus]}`,
      before: { status: record.status },
      after: { status: toStatus },
    })

    revalidatePath(`/admissions/applications/${record.student.id}`)
    revalidatePath(`${BASE}/${record.id}`)
  }

  revalidatePath(BASE)
}

/**
 * Open a custody record for a document collected outside the admission form
 * (a certificate handed in later, or one the office forgot to record).
 */
export async function openCustodyAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.certificateCustody', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const certificateTypeId = String(formData.get('certificateTypeId') ?? '')
  if (!studentId || !certificateTypeId) return

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, applicationNo: true, affiliationBodyId: true },
  })
  if (!student) return

  const certificateType = await db.certificateType.findUnique({
    where: { id: certificateTypeId },
    select: { name: true },
  })
  if (!certificateType) return

  const custody = await db.certificateCustody.create({
    data: {
      studentId,
      certificateTypeId,
      affiliationBodyId: student.affiliationBodyId,
      status: 'WITH_INSTITUTE',
      collectedAt: new Date(),
      remarks: orNull(formData.get('remarks')),
      events: {
        create: {
          toStatus: 'WITH_INSTITUTE',
          handledById: user.id,
          remarks: 'Original collected',
        },
      },
    },
  })

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'CREATE',
    entityType: 'CertificateCustody',
    entityId: custody.id,
    summary: `Took custody of ${certificateType.name} for ${student.applicationNo}`,
  })

  revalidatePath(BASE)
  revalidatePath(`/admissions/applications/${studentId}`)
}
