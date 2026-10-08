import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { parseTableParams } from '@/lib/table/params'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import {
  STATUS_LABELS,
  STUDENT_FILTER_KEYS,
  STUDENT_SORTS,
  duesFor,
  listStudentsForExport,
  type StudentRow,
} from '@/app/(app)/admissions/applications/queries'

const rupees = (paise: number) => (paise / 100).toFixed(2)

const columns: ExportColumn<StudentRow>[] = [
  { header: 'Application No', value: (r) => r.applicationNo },
  { header: 'Admission No', value: (r) => r.admissionNo },
  { header: 'Name', value: (r) => `${r.firstName} ${r.lastName ?? ''}`.trim() },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'Course', value: (r) => r.course.name },
  { header: 'Year', value: (r) => r.courseYear },
  { header: 'Batch', value: (r) => r.batch.name },
  { header: 'Mode', value: (r) => r.classMode?.name },
  { header: 'Status', value: (r) => STATUS_LABELS[r.status] },
  { header: 'Enrolment No', value: (r) => r.enrolmentNumber },
  {
    header: 'Admission Date',
    value: (r) => r.admissionDate?.toISOString().slice(0, 10) ?? '',
  },
  { header: 'Outstanding (Rs)', value: (r) => rupees(duesFor(r).outstandingPaise) },
  { header: 'Has Overdue', value: (r) => (duesFor(r).hasOverdue ? 'Yes' : 'No') },
  { header: 'Branch', value: (r) => r.branch.name },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!can(user, 'admission.application', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseTableParams(sp, {
    allowedSorts: STUDENT_SORTS,
    defaultSort: 'createdAt',
    filterKeys: STUDENT_FILTER_KEYS,
  })

  const rows = await listStudentsForExport(user, params)
  const format = sp.format === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'Student',
    summary: `Exported ${rows.length} student records as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('students', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Students')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
