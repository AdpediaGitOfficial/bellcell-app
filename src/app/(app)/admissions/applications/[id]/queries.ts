import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'

/** The full record behind the tabbed application page. */
export async function getStudentRecord(user: CurrentUser, id: string) {
  return db.student.findFirst({
    where: { id, ...branchScope(user), archivedAt: null },
    include: {
      course: true,
      batch: true,
      classMode: true,
      religion: true,
      affiliationBody: true,
      medium: true,
      secondLanguage: true,
      branch: true,
      enquiry: { select: { id: true, enquiryNo: true } },
      guardians: { orderBy: [{ isPrimaryContact: 'desc' }, { createdAt: 'asc' }] },
      educations: {
        orderBy: { yearOfPassing: 'desc' },
        include: {
          certificateType: { select: { id: true, name: true } },
          custody: { select: { id: true, status: true } },
        },
      },
      certificateCustody: {
        include: { certificateType: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      installments: {
        orderBy: [{ dueDate: 'asc' }, { installmentNo: 'asc' }],
        include: { feeType: { select: { name: true } } },
      },
      feeAssignments: {
        include: { structure: { select: { id: true, name: true } } },
      },
      payments: {
        orderBy: { receiptDate: 'desc' },
        include: {
          collectedBy: { select: { fullName: true } },
          allocations: { select: { amountPaise: true, installmentId: true } },
        },
      },
      concessions: {
        orderBy: { createdAt: 'desc' },
        include: { approvedBy: { select: { fullName: true } } },
      },
      idCards: { orderBy: { createdAt: 'desc' } },
      rollNumbers: { include: { section: true } },
      materialIssues: {
        orderBy: { issuedAt: 'desc' },
        include: { material: { select: { title: true } } },
      },
    },
  })
}

export type StudentRecord = NonNullable<Awaited<ReturnType<typeof getStudentRecord>>>

/**
 * The record's Timeline tab is the audit log filtered to this student and
 * its children — the answer to "who marked this fee paid?".
 */
export async function getStudentTimeline(studentId: string, childIds: string[]) {
  return db.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'Student', entityId: studentId },
        { entityType: { in: ['StudentGuardian', 'StudentEducation'] }, entityId: { in: childIds } },
        { entityType: 'Payment', entityId: { in: childIds } },
        { entityType: 'FeeInstallment', entityId: { in: childIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { fullName: true } } },
  })
}

/** Fee structures that could be assigned to this student. */
export async function assignableStructures(student: {
  branchId: string
  courseId: string
  batchId: string
  courseYear: number
}) {
  return db.feeStructure.findMany({
    where: {
      archivedAt: null,
      isActive: true,
      courseId: student.courseId,
      OR: [{ branchId: student.branchId }, { branchId: null }],
      AND: [{ OR: [{ batchId: student.batchId }, { batchId: null }] }],
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, courseYear: true },
  })
}
