import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { monthLabel } from '@/lib/payroll/core'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'

/**
 * The salary register for one run.
 *
 * Columns are built from the components that actually appear in the run, so
 * a month where nobody had an allowance does not carry an empty column, and
 * a month where PF applied does.
 */
interface RegisterRow {
  code: string
  name: string
  designation: string
  department: string
  workingDays: number
  lopDays: number
  paidDays: number
  amounts: Record<string, number>
  grossPaise: number
  deductionsPaise: number
  netPaise: number
  employerPaise: number
}

const rupees = (paise: number) => (paise / 100).toFixed(2)

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // A salary register is every colleague's pay in one file.
  if (!can(user, 'people.payroll', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const runId = request.nextUrl.searchParams.get('runId') ?? ''
  const run = await db.payrollRun.findFirst({
    where: { id: runId, ...branchScope(user) },
    include: {
      branch: { select: { name: true } },
      payslips: {
        where: { excluded: false },
        orderBy: { employee: { employeeCode: 'asc' } },
        include: {
          employee: {
            select: {
              employeeCode: true,
              firstName: true,
              lastName: true,
              designation: true,
              department: { select: { name: true } },
            },
          },
          lines: true,
        },
      },
    },
  })

  if (!run) return new NextResponse('Not found', { status: 404 })

  const earningLabels: string[] = []
  const deductionLabels: string[] = []
  for (const slip of run.payslips) {
    for (const line of slip.lines) {
      const bucket =
        line.kind === 'EARNING'
          ? earningLabels
          : line.kind === 'DEDUCTION'
            ? deductionLabels
            : null
      if (bucket && !bucket.includes(line.label)) bucket.push(line.label)
    }
  }

  const rows: RegisterRow[] = run.payslips.map((p) => {
    const amounts: Record<string, number> = {}
    for (const line of p.lines) amounts[line.label] = line.amountPaise
    return {
      code: p.employee.employeeCode,
      name: [p.employee.firstName, p.employee.lastName].filter(Boolean).join(' '),
      designation: p.employee.designation ?? '',
      department: p.employee.department?.name ?? '',
      workingDays: p.workingDays,
      lopDays: Number(p.lopDays),
      paidDays: Number(p.paidDays),
      amounts,
      grossPaise: p.grossPaise,
      deductionsPaise: p.deductionsPaise,
      netPaise: p.netPaise,
      employerPaise: p.employerContributionPaise,
    }
  })

  const columns: ExportColumn<RegisterRow>[] = [
    { header: 'Employee Code', value: (r) => r.code },
    { header: 'Name', value: (r) => r.name },
    { header: 'Designation', value: (r) => r.designation },
    { header: 'Department', value: (r) => r.department },
    { header: 'Working Days', value: (r) => r.workingDays },
    { header: 'Unpaid Days', value: (r) => r.lopDays },
    { header: 'Paid Days', value: (r) => r.paidDays },
    ...earningLabels.map((label) => ({
      header: label,
      value: (r: RegisterRow) => rupees(r.amounts[label] ?? 0),
    })),
    { header: 'Gross', value: (r) => rupees(r.grossPaise) },
    ...deductionLabels.map((label) => ({
      header: label,
      value: (r: RegisterRow) => rupees(r.amounts[label] ?? 0),
    })),
    { header: 'Total Deductions', value: (r) => rupees(r.deductionsPaise) },
    { header: 'Net Pay', value: (r) => rupees(r.netPaise) },
    { header: 'Employer Contribution', value: (r) => rupees(r.employerPaise) },
  ]

  const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const period = monthLabel(run.month, run.year)

  await recordAudit({
    userId: user.id,
    branchId: run.branchId,
    action: 'EXPORT',
    entityType: 'PayrollRun',
    entityId: run.id,
    summary: `Exported the salary register for ${period} (${rows.length} staff) as ${format.toUpperCase()}`,
  })

  const filename = exportFilename(
    `salary-register-${run.year}-${String(run.month).padStart(2, '0')}`,
    format,
  )

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, `Salary ${period}`)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
