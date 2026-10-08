import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { parseTableParams } from '@/lib/table/params'
import { ROLE_LABELS } from '@/lib/rbac/roles'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import {
  EMPLOYEE_FILTER_KEYS,
  EMPLOYEE_SORTS,
  EMPLOYMENT_LABELS,
  listEmployeesForExport,
  type EmployeeRow,
} from '@/app/(app)/people/employees/queries'

const columns: ExportColumn<EmployeeRow>[] = [
  { header: 'Employee Code', value: (r) => r.employeeCode },
  { header: 'First Name', value: (r) => r.firstName },
  { header: 'Last Name', value: (r) => r.lastName },
  { header: 'Designation', value: (r) => r.designation },
  { header: 'Department', value: (r) => r.department?.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'Status', value: (r) => EMPLOYMENT_LABELS[r.status] },
  {
    header: 'Date of Joining',
    value: (r) => r.dateOfJoining?.toISOString().slice(0, 10) ?? '',
  },
  // Deliberately the role and whether the login works, not a sign-in address
  // or anything password-shaped: an exported spreadsheet gets emailed around.
  { header: 'System Role', value: (r) => (r.user ? ROLE_LABELS[r.user.role] : '') },
  {
    header: 'Login Active',
    value: (r) => (r.user ? (r.user.isActive ? 'Yes' : 'No') : ''),
  },
  { header: 'Branch', value: (r) => r.branch.name },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  if (!can(user, 'people.employee', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseTableParams(sp, {
    allowedSorts: EMPLOYEE_SORTS,
    defaultSort: 'name',
    defaultDir: 'asc',
    filterKeys: EMPLOYEE_FILTER_KEYS,
  })

  const rows = await listEmployeesForExport(user, params)
  const format = sp.format === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'Employee',
    summary: `Exported ${rows.length} employees as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('employees', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Employees')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
