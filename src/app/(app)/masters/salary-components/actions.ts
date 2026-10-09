'use server'

import { revalidatePath } from 'next/cache'
import { Prisma, type SalaryCalculation, type SalaryComponentKind } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'

const PATH = '/masters/salary-components'

export interface ComponentState {
  error?: string
  ok?: boolean
  values?: Record<string, string>
}

const KINDS: SalaryComponentKind[] = ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION']
const CALCULATIONS: SalaryCalculation[] = [
  'FIXED',
  'PERCENT_OF_BASIC',
  'PERCENT_OF_GROSS',
]

export async function saveSalaryComponentAction(
  _prev: ComponentState,
  formData: FormData,
): Promise<ComponentState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  assertCan(user, 'masters', id ? 'update' : 'create')

  const values = {
    code: String(formData.get('code') ?? '').trim().toUpperCase(),
    name: String(formData.get('name') ?? '').trim(),
    percentage: String(formData.get('percentage') ?? '').trim(),
  }

  if (!values.name) return { error: 'Give the component a name.', values }
  if (!id && !values.code) return { error: 'Give the component a short code.', values }

  const kindRaw = String(formData.get('kind') ?? '')
  const calcRaw = String(formData.get('calculation') ?? '')
  const kind = KINDS.find((k) => k === kindRaw) ?? 'EARNING'
  const calculation = CALCULATIONS.find((c) => c === calcRaw) ?? 'FIXED'

  let percentage: Prisma.Decimal | null = null
  if (calculation !== 'FIXED') {
    const parsed = Number.parseFloat(values.percentage)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      return {
        error: 'A percentage component needs a percentage between 0 and 100.',
        values,
      }
    }
    percentage = new Prisma.Decimal(parsed.toFixed(3))
  }

  const data = {
    name: values.name,
    kind,
    calculation,
    percentage,
    partOfBasic: formData.get('partOfBasic') === 'on',
    proRated: formData.get('proRated') === 'on',
    sortOrder: Number.parseInt(String(formData.get('sortOrder') ?? '0'), 10) || 0,
  }

  try {
    if (id) {
      // A statutory component is maintained by the engine; letting someone
      // rename PF to something else would make payslips unreadable.
      const existing = await db.salaryComponent.findUnique({ where: { id } })
      if (!existing) return { error: 'Component not found.', values }
      if (existing.isStatutory) {
        return {
          error:
            'Provident fund, ESI and professional tax are calculated by the system from payroll settings, so they cannot be edited here.',
          values,
        }
      }
      await db.salaryComponent.update({ where: { id }, data })
    } else {
      await db.salaryComponent.create({ data: { ...data, code: values.code } })
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'That code is already used by another component.', values }
    }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: 'SalaryComponent',
    entityId: id || undefined,
    summary: `${id ? 'Updated' : 'Added'} salary component "${values.name}"`,
  })

  revalidatePath(PATH)
  return { ok: true }
}

export async function archiveSalaryComponentAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'delete')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const component = await db.salaryComponent.findUnique({
    where: { id },
    select: { name: true, isStatutory: true },
  })
  if (!component || component.isStatutory) return

  await db.salaryComponent.update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'ARCHIVE',
    entityType: 'SalaryComponent',
    entityId: id,
    summary: `Archived salary component "${component.name}"`,
  })

  revalidatePath(PATH)
}

export async function restoreSalaryComponentAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'update')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  await db.salaryComponent.update({ where: { id }, data: { archivedAt: null } })
  revalidatePath(PATH)
}
