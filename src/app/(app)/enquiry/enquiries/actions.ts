'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { EnquiryStage } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = orNull(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Log a call against an enquiry and move it along the funnel.
 *
 * Stage, counselling timestamps and the follow-up row are written in one
 * transaction, so the funnel counts on the dashboard can never disagree with
 * the call history.
 */
export async function logEnquiryCallAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.enquiry', 'update')

  const enquiryId = String(formData.get('enquiryId') ?? '')
  const enquiry = await db.enquiry.findFirst({
    where: { id: enquiryId, ...branchScope(user) },
  })
  if (!enquiry) return

  const callStatusId = orNull(formData.get('callStatusId'))
  const remarks = orNull(formData.get('remarks'))
  const nextCallAt = parseDate(formData.get('nextCallAt'))
  const stageRaw = orNull(formData.get('stage'))
  const stage = (stageRaw ?? enquiry.stage) as EnquiryStage

  const now = new Date()
  const counsellingScheduledAt =
    stage === 'COUNSELLING_SCHEDULED' && !enquiry.counsellingScheduledAt
      ? (nextCallAt ?? now)
      : enquiry.counsellingScheduledAt
  const counsellingCompletedAt =
    stage === 'COUNSELLING_COMPLETED' && !enquiry.counsellingCompletedAt
      ? now
      : enquiry.counsellingCompletedAt

  await db.$transaction([
    db.enquiryFollowUp.create({
      data: {
        enquiryId: enquiry.id,
        callStatusId,
        calledById: user.id,
        remarks,
        nextCallAt,
        stageAfter: stage,
      },
    }),
    db.enquiry.update({
      where: { id: enquiry.id },
      data: {
        stage,
        callStatusId: callStatusId ?? enquiry.callStatusId,
        lastCalledAt: now,
        callCount: { increment: 1 },
        // A closed enquiry carries no next call.
        nextCallAt: stage === 'CONVERTED' || stage === 'LOST' ? null : nextCallAt,
        counsellingScheduledAt,
        counsellingCompletedAt,
        counsellingRemarks:
          stage === 'COUNSELLING_COMPLETED'
            ? (remarks ?? enquiry.counsellingRemarks)
            : enquiry.counsellingRemarks,
        lostReason:
          stage === 'LOST' ? (remarks ?? enquiry.lostReason) : enquiry.lostReason,
      },
    }),
  ])

  await recordAudit({
    userId: user.id,
    branchId: enquiry.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    summary:
      stage === enquiry.stage
        ? `Logged call for enquiry ${enquiry.enquiryNo}`
        : `Enquiry ${enquiry.enquiryNo}: ${enquiry.stage} → ${stage}`,
    before: { stage: enquiry.stage },
    after: { stage },
  })

  revalidatePath('/enquiry/enquiries')
  revalidatePath('/enquiry/call-schedule')
  revalidatePath('/enquiry/counselling')
  revalidatePath('/dashboard')
}

export async function reassignEnquiryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.enquiry', 'update')

  const enquiryId = String(formData.get('enquiryId') ?? '')
  const assignedToId = orNull(formData.get('assignedToId'))

  const enquiry = await db.enquiry.findFirst({
    where: { id: enquiryId, ...branchScope(user) },
  })
  if (!enquiry) return

  await db.enquiry.update({
    where: { id: enquiry.id },
    data: { assignedToId },
  })

  await recordAudit({
    userId: user.id,
    branchId: enquiry.branchId,
    action: 'UPDATE',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    summary: `Reassigned enquiry ${enquiry.enquiryNo}`,
    before: { assignedToId: enquiry.assignedToId },
    after: { assignedToId },
  })

  revalidatePath('/enquiry/enquiries')
}

/**
 * Hand an enquiry over to Admissions.
 *
 * Deliberately does NOT create the Student record here — admission needs
 * personal, fee and education details this screen does not collect. It takes
 * the user to the application form with the enquiry pre-linked, which is the
 * handover point between the two modules.
 */
export async function startAdmissionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.enquiry', 'update')
  assertCan(user, 'admission.application', 'create')

  const enquiryId = String(formData.get('enquiryId') ?? '')
  const enquiry = await db.enquiry.findFirst({
    where: { id: enquiryId, ...branchScope(user) },
  })
  if (!enquiry) return

  redirect(`/admissions/applications/new?enquiryId=${enquiry.id}`)
}
