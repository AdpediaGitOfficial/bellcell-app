'use server'

import { revalidatePath } from 'next/cache'
import type { IdCardStatus, Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { queueNotification } from '@/lib/notify'
import { IDCARD_LABELS, IDCARD_NEXT } from './queries'

const BASE = '/admissions/id-cards'

function orNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/** Raise ID card requests for students who have none. */
export async function requestIdCardsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.idCard', 'create')

  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean)
  if (studentIds.length === 0) return

  const students = await db.student.findMany({
    where: { id: { in: studentIds }, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, applicationNo: true },
  })
  if (students.length === 0) return

  await db.studentIdCard.createMany({
    data: students.map((s) => ({ studentId: s.id, status: 'REQUESTED' as const })),
  })

  await recordAudit({
    userId: user.id,
    branchId: students[0]!.branchId,
    action: 'CREATE',
    entityType: 'StudentIdCard',
    summary: `Raised ${students.length} ID card request${students.length === 1 ? '' : 's'}`,
  })

  revalidatePath(BASE)
}

/**
 * Move cards along the workflow.
 *
 * Reaching "student informed" queues the SMS/Email the scope promises; see
 * src/lib/notify.ts for why it is recorded rather than sent today.
 */
export async function transitionIdCardsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.idCard', 'update')

  const ids = formData.getAll('cardIds').map(String).filter(Boolean)
  const single = orNull(formData.get('cardId'))
  if (single) ids.push(single)
  if (ids.length === 0) return

  const toStatus = String(formData.get('toStatus') ?? '') as IdCardStatus
  if (!(toStatus in IDCARD_LABELS)) return

  const cardNumber = orNull(formData.get('cardNumber'))
  const remarks = orNull(formData.get('remarks'))
  const whenRaw = orNull(formData.get('occurredAt'))
  const when = whenRaw ? new Date(whenRaw) : new Date()
  if (Number.isNaN(when.getTime())) return

  const cards = await db.studentIdCard.findMany({
    where: { id: { in: ids }, student: { ...branchScope(user), archivedAt: null } },
    include: {
      student: {
        select: {
          id: true,
          branchId: true,
          applicationNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
  })

  for (const card of cards) {
    if (!IDCARD_NEXT[card.status].includes(toStatus)) continue

    const data: Prisma.StudentIdCardUpdateInput = { status: toStatus }
    if (toStatus === 'RECEIVED') data.receivedAt = when
    if (toStatus === 'STUDENT_NOTIFIED') data.notifiedAt = when
    if (toStatus === 'COLLECTED') data.collectedAt = when
    if (cardNumber && ids.length === 1) data.cardNumber = cardNumber
    if (remarks) data.remarks = remarks

    await db.studentIdCard.update({ where: { id: card.id }, data })

    if (toStatus === 'STUDENT_NOTIFIED') {
      const name = `${card.student.firstName} ${card.student.lastName ?? ''}`.trim()
      const body = `Dear ${name}, your student ID card has arrived and is ready for collection at the office. — Bell Cell`

      await queueNotification({
        channel: 'SMS',
        template: 'idcard.ready',
        recipient: card.student.phone,
        body,
        studentId: card.student.id,
        relatedType: 'StudentIdCard',
        relatedId: card.id,
      })
      if (card.student.email) {
        await queueNotification({
          channel: 'EMAIL',
          template: 'idcard.ready',
          recipient: card.student.email,
          subject: 'Your student ID card is ready',
          body,
          studentId: card.student.id,
          relatedType: 'StudentIdCard',
          relatedId: card.id,
        })
      }
    }

    await recordAudit({
      userId: user.id,
      branchId: card.student.branchId,
      action: 'STATUS_CHANGE',
      entityType: 'StudentIdCard',
      entityId: card.id,
      summary: `ID card for ${card.student.applicationNo}: ${IDCARD_LABELS[card.status]} → ${IDCARD_LABELS[toStatus]}`,
      before: { status: card.status },
      after: { status: toStatus },
    })

    revalidatePath(`/admissions/applications/${card.student.id}`)
  }

  revalidatePath(BASE)
}
