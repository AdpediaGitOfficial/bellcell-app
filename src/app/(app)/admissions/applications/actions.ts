'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { normalisePhone } from '@/lib/csv'

const BASE = '/admissions/applications'

const schema = z.object({
  branchId: z.string().optional().or(z.literal('')),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  altPhone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  aadhaarLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter only the last 4 digits')
    .optional()
    .or(z.literal('')),
  religionId: z.string().optional().or(z.literal('')),
  category: z.string().trim().optional().or(z.literal('')),
  bloodGroup: z.string().trim().optional().or(z.literal('')),
  addressLine1: z.string().trim().optional().or(z.literal('')),
  addressLine2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().optional().or(z.literal('')),
  pincode: z.string().trim().optional().or(z.literal('')),
  courseId: z.string().trim().min(1, 'Course is required'),
  batchId: z.string().trim().min(1, 'Batch is required'),
  classModeId: z.string().optional().or(z.literal('')),
  affiliationBodyId: z.string().optional().or(z.literal('')),
  mediumId: z.string().optional().or(z.literal('')),
  secondLanguageId: z.string().optional().or(z.literal('')),
  courseYear: z.string().optional().or(z.literal('')),
  admissionDate: z.string().optional().or(z.literal('')),
  admissionNo: z.string().trim().optional().or(z.literal('')),
  enrolmentNumber: z.string().trim().optional().or(z.literal('')),
  examRegistrationNumber: z.string().trim().optional().or(z.literal('')),
  status: z.string().optional().or(z.literal('')),
  enquiryId: z.string().optional().or(z.literal('')),
})

export interface ApplicationState {
  error?: string
  fieldErrors?: Record<string, string>
}

function orNull(v: string | undefined): string | null {
  return v && v !== '' ? v : null
}
function parseDate(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Application numbers are allocated per branch inside the same transaction
 * as the student row, so two concurrent admissions cannot share one.
 */
async function nextApplicationNo(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `APP${year}`
  const last = await tx.student.findFirst({
    where: { branchId, applicationNo: { startsWith: prefix } },
    orderBy: { applicationNo: 'desc' },
    select: { applicationNo: true },
  })
  const serial = last
    ? Number.parseInt(last.applicationNo.slice(prefix.length), 10) + 1
    : 1
  return `${prefix}${String(serial).padStart(4, '0')}`
}

export async function saveApplicationAction(
  studentId: string | null,
  _prev: ApplicationState,
  formData: FormData,
): Promise<ApplicationState> {
  const user = await requireUser()
  assertCan(user, 'admission.application', studentId ? 'update' : 'create')

  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Please correct the highlighted fields.', fieldErrors }
  }

  const d = parsed.data
  const phone = d.phone ? normalisePhone(d.phone) : null
  if (d.phone && !phone) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: { phone: 'Enter a valid 10-digit mobile number' },
    }
  }

  const core = {
    firstName: d.firstName,
    lastName: orNull(d.lastName),
    dateOfBirth: parseDate(d.dateOfBirth),
    gender: d.gender === '' ? null : (d.gender ?? null),
    phone,
    altPhone: orNull(d.altPhone),
    email: orNull(d.email),
    // Only the last four digits are ever stored — see ADR-006.
    aadhaarLast4: orNull(d.aadhaarLast4),
    religionId: orNull(d.religionId),
    category: orNull(d.category),
    bloodGroup: orNull(d.bloodGroup),
    addressLine1: orNull(d.addressLine1),
    addressLine2: orNull(d.addressLine2),
    city: orNull(d.city),
    state: orNull(d.state),
    pincode: orNull(d.pincode),
    courseId: d.courseId,
    batchId: d.batchId,
    classModeId: orNull(d.classModeId),
    affiliationBodyId: orNull(d.affiliationBodyId),
    mediumId: orNull(d.mediumId),
    secondLanguageId: orNull(d.secondLanguageId),
    courseYear: Number.parseInt(d.courseYear || '1', 10) || 1,
    admissionDate: parseDate(d.admissionDate),
    admissionNo: orNull(d.admissionNo),
    enrolmentNumber: orNull(d.enrolmentNumber),
    examRegistrationNumber: orNull(d.examRegistrationNumber),
  }

  let targetId = studentId

  try {
    if (studentId) {
      const existing = await db.student.findFirst({
        where: { id: studentId, ...branchScope(user) },
      })
      if (!existing) return { error: 'Application not found in the current branch.' }

      const updated = await db.student.update({
        where: { id: studentId },
        data: {
          ...core,
          status: (d.status || existing.status) as typeof existing.status,
        },
      })

      await recordAudit({
        userId: user.id,
        branchId: existing.branchId,
        action: 'UPDATE',
        entityType: 'Student',
        entityId: studentId,
        summary: `Updated application ${updated.applicationNo} — ${updated.firstName} ${updated.lastName ?? ''}`.trim(),
        before: existing,
        after: updated,
      })
    } else {
      const branchId = writeBranchId(user, d.branchId)

      const created = await db.$transaction(async (tx) => {
        const applicationNo = await nextApplicationNo(tx, branchId)
        const student = await tx.student.create({
          data: {
            ...core,
            branchId,
            applicationNo,
            status: (d.status || 'APPLIED') as 'APPLIED',
          },
        })

        // Close the loop back to the enquiry this admission came from.
        if (d.enquiryId) {
          await tx.enquiry.updateMany({
            where: { id: d.enquiryId, branchId },
            data: {
              studentId: student.id,
              stage: 'CONVERTED',
              convertedAt: new Date(),
              nextCallAt: null,
            },
          })
        }

        return student
      })

      targetId = created.id

      await recordAudit({
        userId: user.id,
        branchId,
        action: 'CREATE',
        entityType: 'Student',
        entityId: created.id,
        summary: `Created application ${created.applicationNo} — ${created.firstName} ${created.lastName ?? ''}`.trim(),
        after: created,
      })
    }
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return {
        error: 'Choose which branch this admission belongs to.',
        fieldErrors: { branchId: 'Required while viewing all branches' },
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? ''
      return {
        error: target.includes('admissionNo')
          ? 'That admission number is already used in this branch.'
          : 'A record with these details already exists.',
        fieldErrors: target.includes('admissionNo')
          ? { admissionNo: 'Already used in this branch' }
          : {},
      }
    }
    throw error
  }

  revalidatePath(BASE)
  redirect(`${BASE}/${targetId}`)
}

/** Guardians / family details — 0..n rows rather than fixed parent columns. */
export async function saveGuardianAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.application', 'update')

  const studentId = String(formData.get('studentId') ?? '')
  const guardianId = String(formData.get('guardianId') ?? '')

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return

  const data = {
    relation: String(formData.get('relation') ?? 'Guardian').trim() || 'Guardian',
    name: String(formData.get('name') ?? '').trim(),
    occupation: orNull(String(formData.get('occupation') ?? '').trim()),
    phone: orNull(String(formData.get('phone') ?? '').trim()),
    email: orNull(String(formData.get('email') ?? '').trim()),
    isPrimaryContact: formData.get('isPrimaryContact') === 'on',
  }
  if (!data.name) return

  if (guardianId) {
    await db.studentGuardian.update({ where: { id: guardianId }, data })
  } else {
    await db.studentGuardian.create({ data: { ...data, studentId } })
  }

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: guardianId ? 'UPDATE' : 'CREATE',
    entityType: 'StudentGuardian',
    entityId: guardianId || undefined,
    summary: `${guardianId ? 'Updated' : 'Added'} ${data.relation.toLowerCase()} "${data.name}" for ${student.applicationNo}`,
  })

  revalidatePath(`${BASE}/${studentId}`)
}

export async function deleteGuardianAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.application', 'update')

  const guardianId = String(formData.get('guardianId') ?? '')
  const studentId = String(formData.get('studentId') ?? '')

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return

  await db.studentGuardian.deleteMany({ where: { id: guardianId, studentId } })
  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'DELETE',
    entityType: 'StudentGuardian',
    entityId: guardianId,
    summary: `Removed a guardian from ${student.applicationNo}`,
  })

  revalidatePath(`${BASE}/${studentId}`)
}

/**
 * Prior qualifications. Where an ORIGINAL certificate is collected, a
 * custody record is opened in the same transaction — the institute is now
 * holding a student's original document and must be able to account for it.
 */
export async function saveEducationAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.application', 'update')

  const studentId = String(formData.get('studentId') ?? '')
  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return

  const qualification = String(formData.get('qualification') ?? '').trim()
  if (!qualification) return

  const certificateTypeId = orNull(String(formData.get('certificateTypeId') ?? ''))
  const originalCollected = formData.get('originalCollected') === 'on'
  const yearRaw = String(formData.get('yearOfPassing') ?? '').trim()
  const marksRaw = String(formData.get('marksPercentage') ?? '').trim()

  await db.$transaction(async (tx) => {
    const education = await tx.studentEducation.create({
      data: {
        studentId,
        certificateTypeId,
        qualification,
        boardOrUniversity: orNull(String(formData.get('boardOrUniversity') ?? '').trim()),
        institution: orNull(String(formData.get('institution') ?? '').trim()),
        registerNumber: orNull(String(formData.get('registerNumber') ?? '').trim()),
        yearOfPassing: yearRaw ? Number.parseInt(yearRaw, 10) : null,
        marksPercentage: marksRaw ? new Prisma.Decimal(marksRaw) : null,
        originalCollected,
        originalCollectedAt: originalCollected ? new Date() : null,
      },
    })

    if (originalCollected && certificateTypeId) {
      const custody = await tx.certificateCustody.create({
        data: {
          studentId,
          studentEducationId: education.id,
          certificateTypeId,
          affiliationBodyId: student.affiliationBodyId,
          status: 'WITH_INSTITUTE',
          collectedAt: new Date(),
        },
      })
      await tx.certificateCustodyEvent.create({
        data: {
          custodyId: custody.id,
          toStatus: 'WITH_INSTITUTE',
          handledById: user.id,
          remarks: 'Original collected at admission',
        },
      })
    }
  })

  await recordAudit({
    userId: user.id,
    branchId: student.branchId,
    action: 'CREATE',
    entityType: 'StudentEducation',
    summary: originalCollected
      ? `Added ${qualification} for ${student.applicationNo} and took custody of the original`
      : `Added ${qualification} for ${student.applicationNo}`,
  })

  revalidatePath(`${BASE}/${studentId}`)
}

export async function deleteEducationAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.application', 'update')

  const educationId = String(formData.get('educationId') ?? '')
  const studentId = String(formData.get('studentId') ?? '')

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user) },
  })
  if (!student) return

  // Refuse while the institute still physically holds the original: deleting
  // the row would erase the only record of a document in our custody.
  const held = await db.certificateCustody.count({
    where: {
      studentEducationId: educationId,
      status: { in: ['WITH_INSTITUTE', 'SENT_FOR_VERIFICATION', 'RETURNED_FROM_AFFILIATION'] },
    },
  })
  if (held > 0) return

  await db.studentEducation.deleteMany({ where: { id: educationId, studentId } })
  revalidatePath(`${BASE}/${studentId}`)
}
