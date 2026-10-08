'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'

const BASE = '/admissions/study-materials'

export interface IssueState {
  error?: string
  ok?: string
}

/**
 * Issue material to a student.
 *
 * Stock is decremented inside the transaction and the issue is refused if it
 * would go negative — otherwise the register drifts from the shelf and the
 * "study material issue summary" report becomes fiction.
 */
export async function issueMaterialAction(
  _prev: IssueState,
  formData: FormData,
): Promise<IssueState> {
  const user = await requireUser()
  assertCan(user, 'admission.studyMaterial', 'create')

  const studentId = String(formData.get('studentId') ?? '')
  const materialId = String(formData.get('materialId') ?? '')
  const quantity = Math.max(
    1,
    Number.parseInt(String(formData.get('quantity') ?? '1'), 10) || 1,
  )
  if (!studentId || !materialId) return { error: 'Choose a student and a material.' }

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, applicationNo: true },
  })
  if (!student) return { error: 'Student not found in the current branch.' }

  try {
    const material = await db.$transaction(async (tx) => {
      const m = await tx.studyMaterial.findUnique({ where: { id: materialId } })
      if (!m) throw new Error('Material not found.')

      const available = m.stockTotal - m.stockIssued
      if (m.stockTotal > 0 && quantity > available) {
        throw new Error(
          `Only ${available} of "${m.title}" ${available === 1 ? 'is' : 'are'} available.`,
        )
      }

      await tx.studyMaterialIssue.create({
        data: {
          studentId,
          materialId,
          quantity,
          issuedById: user.id,
          remarks: String(formData.get('remarks') ?? '').trim() || null,
        },
      })

      await tx.studyMaterial.update({
        where: { id: materialId },
        data: { stockIssued: { increment: quantity } },
      })

      return m
    })

    await recordAudit({
      userId: user.id,
      branchId: student.branchId,
      action: 'CREATE',
      entityType: 'StudyMaterialIssue',
      summary: `Issued ${quantity} × "${material.title}" to ${student.applicationNo}`,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not issue.' }
  }

  revalidatePath(BASE)
  revalidatePath(`/admissions/applications/${studentId}`)
  return { ok: 'Issued.' }
}

export async function returnMaterialAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.studyMaterial', 'update')

  const issueId = String(formData.get('issueId') ?? '')
  const issue = await db.studyMaterialIssue.findFirst({
    where: { id: issueId, student: { ...branchScope(user) } },
    include: {
      material: { select: { id: true, title: true } },
      student: { select: { id: true, branchId: true, applicationNo: true } },
    },
  })
  if (!issue || issue.returnedAt) return

  await db.$transaction([
    db.studyMaterialIssue.update({
      where: { id: issue.id },
      data: { returnedAt: new Date() },
    }),
    db.studyMaterial.update({
      where: { id: issue.material.id },
      data: { stockIssued: { decrement: issue.quantity } },
    }),
  ])

  await recordAudit({
    userId: user.id,
    branchId: issue.student.branchId,
    action: 'UPDATE',
    entityType: 'StudyMaterialIssue',
    entityId: issue.id,
    summary: `Returned ${issue.quantity} × "${issue.material.title}" from ${issue.student.applicationNo}`,
  })

  revalidatePath(BASE)
  revalidatePath(`/admissions/applications/${issue.student.id}`)
}

/** Add or restock a material. */
export async function saveMaterialAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'admission.studyMaterial', 'create')

  const id = String(formData.get('materialId') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  const stockTotal = Math.max(
    0,
    Number.parseInt(String(formData.get('stockTotal') ?? '0'), 10) || 0,
  )
  const courseId = String(formData.get('courseId') ?? '').trim() || null
  const kind = String(formData.get('kind') ?? 'BOOK') as 'BOOK'
  if (!title) return

  if (id) {
    await db.studyMaterial.update({
      where: { id },
      data: { title, stockTotal, courseId, kind },
    })
  } else {
    if (!code) return
    await db.studyMaterial.create({
      data: { code, title, stockTotal, courseId, kind },
    })
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: 'StudyMaterial',
    entityId: id || undefined,
    summary: `${id ? 'Updated' : 'Added'} study material "${title}" (stock ${stockTotal})`,
  })

  revalidatePath(BASE)
}
