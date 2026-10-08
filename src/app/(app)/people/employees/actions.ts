'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  Prisma,
  type EmploymentStatus,
  type Gender,
  type LanguageProficiency,
} from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { normalisePhone } from '@/lib/csv'

const BASE = '/people/employees'

export interface EmployeeState {
  error?: string
  fieldErrors?: Record<string, string>
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

export async function saveEmployeeAction(
  employeeId: string | null,
  _prev: EmployeeState,
  formData: FormData,
): Promise<EmployeeState> {
  const user = await requireUser()
  assertCan(user, 'people.employee', employeeId ? 'update' : 'create')

  const firstName = String(formData.get('firstName') ?? '').trim()
  const employeeCode = String(formData.get('employeeCode') ?? '').trim()
  if (!firstName) {
    return { error: 'Enter a first name.', fieldErrors: { firstName: 'Required' } }
  }
  if (!employeeCode) {
    return { error: 'Enter an employee code.', fieldErrors: { employeeCode: 'Required' } }
  }

  const rawPhone = orNull(formData.get('phone'))
  const phone = rawPhone ? normalisePhone(rawPhone) : null
  if (rawPhone && !phone) {
    return {
      error: 'Please correct the highlighted fields.',
      fieldErrors: { phone: 'Enter a valid 10-digit mobile number' },
    }
  }

  const genderRaw = orNull(formData.get('gender'))

  const data = {
    employeeCode,
    firstName,
    lastName: orNull(formData.get('lastName')),
    dateOfBirth: parseDate(formData.get('dateOfBirth')),
    gender: (genderRaw as Gender | null) ?? null,
    phone,
    altPhone: orNull(formData.get('altPhone')),
    email: orNull(formData.get('email')),
    addressLine1: orNull(formData.get('addressLine1')),
    city: orNull(formData.get('city')),
    state: orNull(formData.get('state')),
    pincode: orNull(formData.get('pincode')),
    departmentId: orNull(formData.get('departmentId')),
    designation: orNull(formData.get('designation')),
    dateOfJoining: parseDate(formData.get('dateOfJoining')),
    dateOfLeaving: parseDate(formData.get('dateOfLeaving')),
    status: (String(formData.get('status') ?? 'ACTIVE') || 'ACTIVE') as EmploymentStatus,
  }

  let targetId = employeeId

  try {
    if (employeeId) {
      const existing = await db.employee.findFirst({
        where: { id: employeeId, ...branchScope(user), archivedAt: null },
      })
      if (!existing) return { error: 'Employee not found in the current branch.' }

      const updated = await db.employee.update({ where: { id: employeeId }, data })
      await recordAudit({
        userId: user.id,
        branchId: existing.branchId,
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: employeeId,
        summary: `Updated employee ${updated.employeeCode} — ${updated.firstName} ${updated.lastName ?? ''}`.trim(),
        before: existing,
        after: updated,
      })
    } else {
      const branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
      const created = await db.employee.create({ data: { ...data, branchId } })
      targetId = created.id

      await recordAudit({
        userId: user.id,
        branchId,
        action: 'CREATE',
        entityType: 'Employee',
        entityId: created.id,
        summary: `Added employee ${created.employeeCode} — ${created.firstName} ${created.lastName ?? ''}`.trim(),
      })
    }
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return {
        error: 'Choose which branch this employee belongs to.',
        fieldErrors: { branchId: 'Required while viewing all branches' },
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        error: 'That employee code is already used in this branch.',
        fieldErrors: { employeeCode: 'Already used in this branch' },
      }
    }
    throw error
  }

  revalidatePath(BASE)
  redirect(`${BASE}/${targetId}`)
}

export async function addEducationAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.employee', 'update')

  const employeeId = String(formData.get('employeeId') ?? '')
  const qualification = String(formData.get('qualification') ?? '').trim()
  if (!qualification) return

  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, employeeCode: true },
  })
  if (!employee) return

  const yearRaw = orNull(formData.get('yearOfPassing'))
  const marksRaw = orNull(formData.get('marksPercentage'))

  await db.employeeEducation.create({
    data: {
      employeeId,
      qualification,
      institution: orNull(formData.get('institution')),
      boardOrUniversity: orNull(formData.get('boardOrUniversity')),
      yearOfPassing: yearRaw ? Number.parseInt(yearRaw, 10) : null,
      marksPercentage: marksRaw ? new Prisma.Decimal(marksRaw) : null,
    },
  })

  await recordAudit({
    userId: user.id,
    branchId: employee.branchId,
    action: 'CREATE',
    entityType: 'EmployeeEducation',
    summary: `Added ${qualification} for ${employee.employeeCode}`,
  })

  revalidatePath(`${BASE}/${employeeId}`)
}

export async function addExperienceAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.employee', 'update')

  const employeeId = String(formData.get('employeeId') ?? '')
  const organisation = String(formData.get('organisation') ?? '').trim()
  if (!organisation) return

  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, employeeCode: true },
  })
  if (!employee) return

  await db.employeeExperience.create({
    data: {
      employeeId,
      organisation,
      designation: orNull(formData.get('designation')),
      fromDate: parseDate(formData.get('fromDate')),
      toDate: parseDate(formData.get('toDate')),
      remarks: orNull(formData.get('remarks')),
    },
  })

  await recordAudit({
    userId: user.id,
    branchId: employee.branchId,
    action: 'CREATE',
    entityType: 'EmployeeExperience',
    summary: `Added experience at ${organisation} for ${employee.employeeCode}`,
  })

  revalidatePath(`${BASE}/${employeeId}`)
}

const PROFICIENCIES: LanguageProficiency[] = ['BASIC', 'INTERMEDIATE', 'FLUENT', 'NATIVE']

/** A select is a suggestion; the enum is the rule. */
function parseProficiency(value: FormDataEntryValue | null): LanguageProficiency {
  const raw = typeof value === 'string' ? value : ''
  return PROFICIENCIES.find((p) => p === raw) ?? 'INTERMEDIATE'
}

export async function saveLanguageSkillAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.employee', 'update')

  const employeeId = String(formData.get('employeeId') ?? '')
  const languageId = String(formData.get('languageId') ?? '')
  if (!employeeId || !languageId) return

  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    select: { id: true, branchId: true, employeeCode: true },
  })
  if (!employee) return

  const data = {
    canRead: formData.get('canRead') === 'on',
    canWrite: formData.get('canWrite') === 'on',
    canSpeak: formData.get('canSpeak') === 'on',
    proficiency: parseProficiency(formData.get('proficiency')),
  }

  await db.employeeLanguageSkill.upsert({
    where: { employeeId_languageId: { employeeId, languageId } },
    create: { employeeId, languageId, ...data },
    update: data,
  })

  revalidatePath(`${BASE}/${employeeId}`)
}

export async function removeChildAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.employee', 'update')

  const employeeId = String(formData.get('employeeId') ?? '')
  const kind = String(formData.get('kind') ?? '')
  const id = String(formData.get('id') ?? '')

  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    select: { id: true },
  })
  if (!employee) return

  if (kind === 'education') {
    await db.employeeEducation.deleteMany({ where: { id, employeeId } })
  } else if (kind === 'experience') {
    await db.employeeExperience.deleteMany({ where: { id, employeeId } })
  } else if (kind === 'language') {
    await db.employeeLanguageSkill.deleteMany({ where: { id, employeeId } })
  }

  revalidatePath(`${BASE}/${employeeId}`)
}

export async function archiveEmployeeAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.employee', 'delete')

  const employeeId = String(formData.get('employeeId') ?? '')
  const employee = await db.employee.findFirst({
    where: { id: employeeId, ...branchScope(user), archivedAt: null },
    include: { user: { select: { id: true, isActive: true } } },
  })
  if (!employee) return

  // Archiving someone who still holds a live login would leave an account
  // nobody is reviewing. Deactivate it in the same breath.
  await db.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: { archivedAt: new Date(), status: 'RESIGNED' },
    })
    if (employee.user?.isActive) {
      await tx.user.update({
        where: { id: employee.user.id },
        data: { isActive: false },
      })
      await tx.session.updateMany({
        where: { userId: employee.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
  })

  await recordAudit({
    userId: user.id,
    branchId: employee.branchId,
    action: 'ARCHIVE',
    entityType: 'Employee',
    entityId: employeeId,
    summary:
      `Archived employee ${employee.employeeCode}` +
      (employee.user?.isActive ? ' and deactivated their login' : ''),
  })

  revalidatePath(BASE)
  redirect(BASE)
}
