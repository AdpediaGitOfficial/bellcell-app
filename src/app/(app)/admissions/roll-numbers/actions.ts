'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

const BASE = '/admissions/roll-numbers'

export async function createSectionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.rollNumber', 'create')

  const courseId = String(formData.get('courseId') ?? '')
  const batchId = String(formData.get('batchId') ?? '')
  const courseYear = Number.parseInt(String(formData.get('courseYear') ?? '1'), 10) || 1
  const name = String(formData.get('name') ?? '').trim().toUpperCase()
  const capacityRaw = String(formData.get('capacity') ?? '').trim()
  if (!courseId || !batchId || !name) return

  try {
    await db.classSection.create({
      data: {
        branchId: writeBranchId(user, String(formData.get('branchId') ?? '')),
        courseId,
        batchId,
        courseYear,
        name,
        capacity: capacityRaw ? Number.parseInt(capacityRaw, 10) : null,
      },
    })
  } catch (error) {
    // Section already exists for this course/batch/year — nothing to do.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error
    }
    return
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'CREATE',
    entityType: 'ClassSection',
    summary: `Created section ${name} for year ${courseYear}`,
  })

  revalidatePath(BASE)
}

/**
 * Allocate roll numbers to the selected students.
 *
 * Numbers continue from the highest already used in the section (live or
 * released), so a number is never silently reused by this bulk path — reuse
 * is a deliberate act via `reallocateNumberAction`.
 */
export async function allocateRollNumbersAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.rollNumber', 'create')

  const sectionId = String(formData.get('sectionId') ?? '')
  const studentIds = formData.getAll('studentIds').map(String).filter(Boolean)
  const startRaw = String(formData.get('startFrom') ?? '').trim()
  if (!sectionId || studentIds.length === 0) return

  const section = await db.classSection.findFirst({
    where: { id: sectionId, ...branchScope(user), archivedAt: null },
  })
  if (!section) return

  const students = await db.student.findMany({
    where: { id: { in: studentIds }, ...branchScope(user), archivedAt: null },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, applicationNo: true },
  })
  if (students.length === 0) return

  await db.$transaction(async (tx) => {
    const highest = await tx.rollNumber.findFirst({
      where: { sectionId, courseYear: section.courseYear },
      orderBy: { rollNo: 'desc' },
      select: { rollNo: true },
    })

    const explicitStart = startRaw ? Number.parseInt(startRaw, 10) : NaN
    let next = Number.isFinite(explicitStart) && explicitStart > 0
      ? explicitStart
      : (highest?.rollNo ?? 0) + 1

    for (const student of students) {
      // Skip a number already taken, rather than failing the whole batch.
      let taken = await tx.rollNumber.findFirst({
        where: { sectionId, courseYear: section.courseYear, rollNo: next },
        select: { id: true },
      })
      while (taken) {
        next += 1
          taken = await tx.rollNumber.findFirst({
          where: { sectionId, courseYear: section.courseYear, rollNo: next },
          select: { id: true },
        })
      }

      await tx.rollNumber.create({
        data: {
          studentId: student.id,
          sectionId,
          courseYear: section.courseYear,
          rollNo: next,
        },
      })
      next += 1
    }
  })

  await recordAudit({
    userId: user.id,
    branchId: section.branchId,
    action: 'CREATE',
    entityType: 'RollNumber',
    summary: `Allocated ${students.length} roll number${students.length === 1 ? '' : 's'} in section ${section.name}`,
  })

  revalidatePath(BASE)
}

/**
 * Drop a student from a section and free their number.
 *
 * The row is kept with `releasedAt` set rather than deleted, so the history
 * of who held which number survives — the scope's "drop student and
 * reallocate roll number" needs both halves.
 */
export async function releaseRollNumberAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.rollNumber', 'update')

  const rollNumberId = String(formData.get('rollNumberId') ?? '')
  const roll = await db.rollNumber.findFirst({
    where: { id: rollNumberId, section: { ...branchScope(user) } },
    include: {
      section: { select: { name: true, branchId: true } },
      student: { select: { applicationNo: true } },
    },
  })
  if (!roll || roll.releasedAt) return

  await db.rollNumber.update({
    where: { id: roll.id },
    data: { releasedAt: new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: roll.section.branchId,
    action: 'UPDATE',
    entityType: 'RollNumber',
    entityId: roll.id,
    summary: `Freed roll number ${roll.rollNo} in section ${roll.section.name} (was ${roll.student.applicationNo})`,
  })

  revalidatePath(BASE)
}

/** Hand a freed number to another student. */
export async function reallocateNumberAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.rollNumber', 'update')

  const rollNumberId = String(formData.get('rollNumberId') ?? '')
  const studentId = String(formData.get('studentId') ?? '')
  if (!rollNumberId || !studentId) return

  const roll = await db.rollNumber.findFirst({
    where: { id: rollNumberId, section: { ...branchScope(user) } },
    include: { section: { select: { id: true, name: true, branchId: true } } },
  })
  if (!roll || !roll.releasedAt) return

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    select: { id: true, applicationNo: true },
  })
  if (!student) return

  // Delete BEFORE create: @@unique([sectionId, rollNo, courseYear]) does not
  // exempt released rows, so creating first would violate it. The history of
  // who previously held this number lives in the audit log, which already
  // recorded the release.
  await db.$transaction([
    db.rollNumber.delete({ where: { id: roll.id } }),
    db.rollNumber.create({
      data: {
        studentId,
        sectionId: roll.section.id,
        courseYear: roll.courseYear,
        rollNo: roll.rollNo,
      },
    }),
  ])

  await recordAudit({
    userId: user.id,
    branchId: roll.section.branchId,
    action: 'UPDATE',
    entityType: 'RollNumber',
    summary: `Reallocated roll number ${roll.rollNo} in section ${roll.section.name} to ${student.applicationNo}`,
  })

  revalidatePath(BASE)
}
