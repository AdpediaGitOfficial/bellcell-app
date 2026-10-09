'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Prisma, type PaymentMode } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { parseRupeesToPaise } from '@/lib/money'
import { monthLabel } from '@/lib/payroll/core'
import {
  PayrollError,
  approvePayrollRun,
  cancelPayrollRun,
  createPayrollRun,
  payPayrollRun,
  recalculatePayslip,
} from '@/lib/payroll/service'

const BASE = '/people/payroll'

export interface PayrollState {
  error?: string
  notice?: string
  ok?: boolean
}

/** Every action in this file funnels its refusals through one shape. */
function failure(error: unknown): PayrollState {
  if (error instanceof PayrollError) return { error: error.message }
  if (error instanceof NoBranchSelectedError) {
    return { error: 'Choose which branch this payroll run is for.' }
  }
  throw error
}

async function runInScope(runId: string) {
  const user = await requireUser()
  const run = await db.payrollRun.findFirst({
    where: { id: runId, ...branchScope(user) },
    select: { id: true, branchId: true, status: true, month: true, year: true },
  })
  return { user, run }
}

export async function createRunAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const user = await requireUser()
  assertCan(user, 'people.payroll', 'create')

  const month = Number.parseInt(String(formData.get('month') ?? ''), 10)
  const year = Number.parseInt(String(formData.get('year') ?? ''), 10)
  const workingDaysRaw = String(formData.get('workingDays') ?? '').trim()

  let runId: string
  try {
    const branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
    const result = await createPayrollRun({
      branchId,
      year,
      month,
      createdById: user.id,
      workingDays: workingDaysRaw ? Number.parseInt(workingDaysRaw, 10) : undefined,
    })
    runId = result.runId

    await recordAudit({
      userId: user.id,
      branchId,
      action: 'CREATE',
      entityType: 'PayrollRun',
      entityId: result.runId,
      summary:
        `Opened payroll for ${monthLabel(month, year)} — ${result.included} payslip(s)` +
        (result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''),
    })
  } catch (error) {
    return failure(error)
  }

  revalidatePath(BASE)
  redirect(`${BASE}/${runId}`)
}

export async function updatePayslipAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.payroll', 'update')

  const payslipId = String(formData.get('payslipId') ?? '')
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, run: { ...branchScope(user) } },
    select: { id: true, runId: true, employee: { select: { employeeCode: true } } },
  })
  if (!payslip) return

  const lopRaw = String(formData.get('lopDays') ?? '').trim()
  const tdsRaw = String(formData.get('manualTdsPaise') ?? '').trim()

  try {
    await recalculatePayslip({
      payslipId: payslip.id,
      lopDays: lopRaw === '' ? undefined : Number.parseFloat(lopRaw),
      manualTdsPaise: tdsRaw === '' ? undefined : parseRupeesToPaise(tdsRaw),
      remarks: String(formData.get('remarks') ?? '').trim() || null,
    })
  } catch (error) {
    if (error instanceof PayrollError) {
      // Surfaced on the page through the run's own validation banner rather
      // than thrown, so one bad row does not blank the whole screen.
      await recordAudit({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'Payslip',
        entityId: payslip.id,
        summary: `Rejected a payslip change for ${payslip.employee.employeeCode}: ${error.message}`,
      })
      revalidatePath(`${BASE}/${payslip.runId}`)
      return
    }
    throw error
  }

  revalidatePath(`${BASE}/${payslip.runId}`)
}

export async function togglePayslipAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.payroll', 'update')

  const payslipId = String(formData.get('payslipId') ?? '')
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, run: { ...branchScope(user) } },
    select: { id: true, runId: true, excluded: true },
  })
  if (!payslip) return

  try {
    await recalculatePayslip({ payslipId: payslip.id, excluded: !payslip.excluded })
  } catch (error) {
    if (!(error instanceof PayrollError)) throw error
  }

  revalidatePath(`${BASE}/${payslip.runId}`)
}

export async function approveRunAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const { user, run } = await runInScope(String(formData.get('runId') ?? ''))
  // Deliberately `approve`, not `update`: whoever prepared the run is not
  // automatically the person who may release it.
  assertCan(user, 'people.payroll', 'approve')
  if (!run) return { error: 'Payroll run not found in the current branch.' }

  try {
    await approvePayrollRun({ runId: run.id, approvedById: user.id })
  } catch (error) {
    return failure(error)
  }

  await recordAudit({
    userId: user.id,
    branchId: run.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'PayrollRun',
    entityId: run.id,
    summary: `Approved payroll for ${monthLabel(run.month, run.year)}`,
  })

  revalidatePath(`${BASE}/${run.id}`)
  return { ok: true, notice: 'Payroll approved. The figures are now fixed.' }
}

export async function payRunAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const { user, run } = await runInScope(String(formData.get('runId') ?? ''))
  assertCan(user, 'people.payroll', 'approve')
  if (!run) return { error: 'Payroll run not found in the current branch.' }

  const paidOnRaw = String(formData.get('paidOn') ?? '')
  const paidOn = paidOnRaw ? new Date(paidOnRaw) : new Date()
  if (Number.isNaN(paidOn.getTime())) return { error: 'Enter a valid payment date.' }

  const mode = String(formData.get('mode') ?? 'BANK_TRANSFER') as PaymentMode
  const bankAccountId = String(formData.get('bankAccountId') ?? '') || null

  let result: { voucherNo: string; employerVoucherNo: string | null }
  try {
    result = await payPayrollRun({
      runId: run.id,
      paidOn,
      mode,
      bankAccountId,
      referenceNo: String(formData.get('referenceNo') ?? '').trim() || null,
      enteredById: user.id,
    })
  } catch (error) {
    return failure(error)
  }

  await recordAudit({
    userId: user.id,
    branchId: run.branchId,
    action: 'PAYMENT',
    entityType: 'PayrollRun',
    entityId: run.id,
    summary:
      `Paid payroll for ${monthLabel(run.month, run.year)} — voucher ${result.voucherNo}` +
      (result.employerVoucherNo
        ? `, employer contribution ${result.employerVoucherNo}`
        : ''),
  })

  revalidatePath(`${BASE}/${run.id}`)
  revalidatePath('/accounts/day-book')
  return {
    ok: true,
    notice: `Paid and posted to the books as ${result.voucherNo}${
      result.employerVoucherNo ? ` and ${result.employerVoucherNo}` : ''
    }.`,
  }
}

export async function cancelRunAction(
  _prev: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  const { user, run } = await runInScope(String(formData.get('runId') ?? ''))
  assertCan(user, 'people.payroll', 'delete')
  if (!run) return { error: 'Payroll run not found in the current branch.' }

  const reason = String(formData.get('reason') ?? '')
  try {
    await cancelPayrollRun({ runId: run.id, reason })
  } catch (error) {
    return failure(error)
  }

  await recordAudit({
    userId: user.id,
    branchId: run.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'PayrollRun',
    entityId: run.id,
    summary: `Cancelled payroll for ${monthLabel(run.month, run.year)} — ${reason.trim()}`,
  })

  revalidatePath(`${BASE}/${run.id}`)
  return { ok: true, notice: 'Run cancelled.' }
}

export interface SettingsState {
  error?: string
  notice?: string
}

function rate(formData: FormData, key: string, fallback: string): Prisma.Decimal {
  const raw = String(formData.get(key) ?? '').trim()
  const parsed = Number.parseFloat(raw === '' ? fallback : raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new PayrollError(`"${key}" must be a percentage between 0 and 100.`)
  }
  return new Prisma.Decimal(parsed.toFixed(3))
}

export async function savePayrollSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser()
  // Setting statutory rates is the same level of authority as releasing a
  // payroll run, not the same as preparing one.
  assertCan(user, 'people.payroll', 'approve')

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch {
    return {
      error:
        'Payroll settings are per branch, so choose a branch from the switcher above before editing them.',
    }
  }

  const workingDaysRaw = String(formData.get('standardWorkingDays') ?? '').trim()
  const standardWorkingDays = workingDaysRaw ? Number.parseInt(workingDaysRaw, 10) : null
  if (
    standardWorkingDays !== null &&
    (!Number.isFinite(standardWorkingDays) ||
      standardWorkingDays < 1 ||
      standardWorkingDays > 31)
  ) {
    return { error: 'Standard working days must be between 1 and 31, or left blank.' }
  }

  let data
  try {
    data = {
      pfEnabled: formData.get('pfEnabled') === 'on',
      pfEmployeeRate: rate(formData, 'pfEmployeeRate', '12'),
      pfEmployerRate: rate(formData, 'pfEmployerRate', '12'),
      pfWageCeilingPaise: parseRupeesToPaise(
        String(formData.get('pfWageCeiling') ?? '15000') || '15000',
      ),
      pfNumber: String(formData.get('pfNumber') ?? '').trim() || null,

      esiEnabled: formData.get('esiEnabled') === 'on',
      esiEmployeeRate: rate(formData, 'esiEmployeeRate', '0.75'),
      esiEmployerRate: rate(formData, 'esiEmployerRate', '3.25'),
      esiEligibilityPaise: parseRupeesToPaise(
        String(formData.get('esiEligibility') ?? '21000') || '21000',
      ),
      esiNumber: String(formData.get('esiNumber') ?? '').trim() || null,

      ptEnabled: formData.get('ptEnabled') === 'on',
      standardWorkingDays,
      salaryAccountHeadId: String(formData.get('salaryAccountHeadId') ?? '') || null,
    }
  } catch (error) {
    return failure(error)
  }

  const before = await db.payrollSetting.findUnique({ where: { branchId } })

  await db.payrollSetting.upsert({
    where: { branchId },
    create: { branchId, ...data },
    update: data,
  })

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'UPDATE',
    entityType: 'PayrollSetting',
    summary:
      'Updated payroll settings — ' +
      [
        `PF ${data.pfEnabled ? 'on' : 'off'}`,
        `ESI ${data.esiEnabled ? 'on' : 'off'}`,
        `PT ${data.ptEnabled ? 'on' : 'off'}`,
      ].join(', '),
    before: before ?? undefined,
    after: data,
  })

  revalidatePath(`${BASE}/settings`)
  return { notice: 'Payroll settings saved. They apply to runs created from now on.' }
}

export async function saveTaxSlabAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.payroll', 'approve')

  const settingId = String(formData.get('settingId') ?? '')
  const setting = await db.payrollSetting.findFirst({
    where: { id: settingId, ...branchScope(user) },
    select: { id: true },
  })
  if (!setting) return

  const fromPaise = parseRupeesToPaise(String(formData.get('from') ?? '0') || '0')
  const toRaw = String(formData.get('to') ?? '').trim()
  const amountPaise = parseRupeesToPaise(String(formData.get('amount') ?? '0') || '0')

  await db.payrollTaxSlab.create({
    data: {
      settingId: setting.id,
      fromPaise,
      toPaise: toRaw ? parseRupeesToPaise(toRaw) : null,
      amountPaise,
      sortOrder: fromPaise,
    },
  })

  revalidatePath(`${BASE}/settings`)
}

export async function deleteTaxSlabAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'people.payroll', 'approve')

  const id = String(formData.get('id') ?? '')
  await db.payrollTaxSlab.deleteMany({
    where: { id, setting: { ...branchScope(user) } },
  })

  revalidatePath(`${BASE}/settings`)
}
