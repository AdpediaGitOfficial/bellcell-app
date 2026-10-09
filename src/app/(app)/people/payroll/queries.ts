import 'server-only'
import { db } from '@/lib/db'
import { branchScope } from '@/lib/branch'
import type { CurrentUser } from '@/lib/auth/current-user'

export async function listPayrollRuns(user: CurrentUser) {
  return db.payrollRun.findMany({
    where: branchScope(user),
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 60,
    include: { branch: { select: { name: true } } },
  })
}

export async function payrollSummary(user: CurrentUser) {
  const scope = branchScope(user)
  const [runs, paidThisYear, drafts, withoutStructure] = await Promise.all([
    db.payrollRun.count({ where: scope }),
    db.payrollRun.aggregate({
      where: { ...scope, status: 'PAID', year: new Date().getFullYear() },
      _sum: { netPaise: true },
    }),
    db.payrollRun.count({ where: { ...scope, status: { in: ['DRAFT', 'APPROVED'] } } }),
    // Who would be left out of the next run, and therefore unpaid.
    db.employee.count({
      where: {
        ...scope,
        archivedAt: null,
        status: { in: ['ACTIVE', 'ON_LEAVE'] },
        salaryStructures: { none: {} },
      },
    }),
  ])

  return {
    runs,
    paidThisYearPaise: paidThisYear._sum.netPaise ?? 0,
    open: drafts,
    withoutStructure,
  }
}

export async function getPayrollRun(user: CurrentUser, id: string) {
  return db.payrollRun.findFirst({
    where: { id, ...branchScope(user) },
    include: {
      branch: { select: { id: true, name: true } },
      payslips: {
        orderBy: { employee: { employeeCode: 'asc' } },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              designation: true,
              department: { select: { name: true } },
            },
          },
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  })
}

export type PayrollRunRecord = NonNullable<
  Awaited<ReturnType<typeof getPayrollRun>>
>

/**
 * Employees who would be left out of this run, and why.
 *
 * "Who was not paid, and why" has to be answerable on the screen — an
 * employee missing from a payroll run is the kind of error nobody notices
 * until the person complains.
 */
export async function employeesMissingFromRun(
  branchId: string,
  runId: string,
) {
  const paid = await db.payslip.findMany({
    where: { runId },
    select: { employeeId: true },
  })
  const paidIds = paid.map((p) => p.employeeId)

  return db.employee.findMany({
    where: {
      branchId,
      archivedAt: null,
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
      id: { notIn: paidIds.length > 0 ? paidIds : ['__none__'] },
    },
    orderBy: { employeeCode: 'asc' },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      _count: { select: { salaryStructures: true } },
    },
  })
}

export async function getPayslip(user: CurrentUser, payslipId: string) {
  return db.payslip.findFirst({
    where: { id: payslipId, run: { ...branchScope(user) } },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      employee: {
        include: {
          department: { select: { name: true } },
          branch: true,
        },
      },
      run: { include: { branch: true } },
    },
  })
}
