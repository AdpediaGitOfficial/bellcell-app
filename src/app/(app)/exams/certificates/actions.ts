'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { nextDocumentNo, withNumberRetry } from '@/lib/numbering'

export interface CertState {
  error?: string
}

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
 * Issue a Transfer Certificate.
 *
 * The number is allocated inside the same transaction as the certificate,
 * like receipts and vouchers, so a failure never leaves a gap in the series.
 */
export async function issueTcAction(
  _prev: CertState,
  formData: FormData,
): Promise<CertState> {
  const user = await requireUser()
  assertCan(user, 'exam.certificate', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const reason = orNull(formData.get('reason'))
  const issuedAt = parseDate(formData.get('issuedAt')) ?? new Date()

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, applicationNo: true, firstName: true, lastName: true },
  })
  if (!student) return { error: 'Student not found in the current branch.' }

  // The institute must not be holding the student's originals when it hands
  // them a TC — that is the moment those documents should go back.
  const held = await db.certificateCustody.count({
    where: {
      studentId,
      status: { in: ['WITH_INSTITUTE', 'SENT_FOR_VERIFICATION', 'RETURNED_FROM_AFFILIATION'] },
    },
  })
  if (held > 0) {
    return {
      error: `The institute still holds ${held} original document${held === 1 ? '' : 's'} for this student. Return them before issuing a TC.`,
    }
  }

  const created = await withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const tcNumber = await nextDocumentNo(tx, student.branchId, issuedAt, 'TC')
      return tx.transferCertificate.create({
        data: {
          studentId,
          tcNumber,
          issuedAt,
          reason,
          conductRemark: orNull(formData.get('conductRemark')),
          issuedById: user.id,
        },
      })
    }),
  )

  await db.student.update({
    where: { id: studentId },
    data: { status: 'TRANSFERRED' },
  })

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'CREATE',
    entityType: 'TransferCertificate',
    entityId: created.id,
    summary: `Issued TC ${created.tcNumber} to ${student.applicationNo}`,
  })

  revalidatePath('/exams/certificates')
  revalidatePath(`/admissions/applications/${studentId}`)
  redirect(`/exams/certificates/tc/${created.id}?new=1`)
}

/** Issue a course completion certificate. */
export async function issueCompletionAction(
  _prev: CertState,
  formData: FormData,
): Promise<CertState> {
  const user = await requireUser()
  assertCan(user, 'exam.certificate', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const completionDate = parseDate(formData.get('completionDate')) ?? new Date()

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    select: {
      id: true,
      branchId: true,
      applicationNo: true,
      courseId: true,
      course: { select: { durationYears: true, name: true } },
      courseYear: true,
      status: true,
    },
  })
  if (!student) return { error: 'Student not found in the current branch.' }

  // Only a student who has actually reached the end of the course.
  if (student.status !== 'COMPLETED' && student.courseYear < student.course.durationYears) {
    return {
      error: `${student.applicationNo} is in year ${student.courseYear} of ${student.course.durationYears}. Promote them to completion first.`,
    }
  }

  const created = await withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const certificateNo = await nextDocumentNo(
        tx,
        student.branchId,
        completionDate,
        'COMPLETION',
      )
      return tx.courseCompletionCertificate.create({
        data: {
          studentId,
          certificateNo,
          completionDate,
          grade: orNull(formData.get('grade')),
          issuedAt: new Date(),
        },
      })
    }),
  )

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'CREATE',
    entityType: 'CourseCompletionCertificate',
    entityId: created.id,
    summary: `Issued completion certificate ${created.certificateNo} to ${student.applicationNo}`,
  })

  revalidatePath('/exams/certificates')
  revalidatePath(`/admissions/applications/${studentId}`)
  redirect(`/exams/certificates/completion/${created.id}?new=1`)
}

/** Record that the student physically collected the document. */
export async function handOverCertificateAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'exam.certificate', 'update')

  const kind = String(formData.get('kind') ?? '')
  const id = String(formData.get('id') ?? '')
  const receivedBy = orNull(formData.get('receivedBy'))
  if (!id || !receivedBy) return

  if (kind === 'tc') {
    const tc = await db.transferCertificate.findFirst({
      where: { id, student: { ...branchScope(user) } },
      include: { student: { select: { id: true, branchId: true, applicationNo: true } } },
    })
    if (!tc || tc.handedOverAt) return

    await db.transferCertificate.update({
      where: { id },
      data: { handedOverAt: new Date(), receivedBy },
    })
    await recordAudit({
      userId: user.id,
      branchId: tc.student.branchId,
      action: 'STATUS_CHANGE',
      entityType: 'TransferCertificate',
      entityId: id,
      summary: `TC ${tc.tcNumber} handed to ${receivedBy}`,
    })
    revalidatePath(`/exams/certificates/tc/${id}`)
  } else {
    const cc = await db.courseCompletionCertificate.findFirst({
      where: { id, student: { ...branchScope(user) } },
      include: { student: { select: { branchId: true } } },
    })
    if (!cc || cc.handedOverAt) return

    await db.courseCompletionCertificate.update({
      where: { id },
      data: { handedOverAt: new Date() },
    })
    await recordAudit({
      userId: user.id,
      branchId: cc.student.branchId,
      action: 'STATUS_CHANGE',
      entityType: 'CourseCompletionCertificate',
      entityId: id,
      summary: `Completion certificate ${cc.certificateNo} handed to ${receivedBy}`,
    })
    revalidatePath(`/exams/certificates/completion/${id}`)
  }

  revalidatePath('/exams/certificates')
}
