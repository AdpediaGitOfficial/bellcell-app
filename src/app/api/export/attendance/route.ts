import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import { registerFor, type RegisterRow } from '@/app/(app)/academics/attendance/queries'

const BAND_LABELS: Record<string, string> = {
  OK: 'Clear',
  CONDONATION: 'Condonation',
  SHORT: 'Short',
  NO_DATA: 'No classes',
}

const columns: ExportColumn<RegisterRow>[] = [
  { header: 'Roll No', value: (r) => r.rollNo ?? '' },
  { header: 'Admission No', value: (r) => r.admissionNo },
  { header: 'Student', value: (r) => r.name },
  { header: 'Sessions Held', value: (r) => r.held },
  { header: 'Present', value: (r) => r.present },
  { header: 'Absent', value: (r) => r.absent },
  { header: 'Late', value: (r) => r.late },
  { header: 'Excused', value: (r) => r.excused },
  { header: 'Percentage', value: (r) => (r.percentage === null ? '' : r.percentage) },
  { header: 'Standing', value: (r) => BAND_LABELS[r.band] ?? r.band },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!can(user, 'academics.attendance', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const courseId = sp.get('courseId') ?? ''
  const batchId = sp.get('batchId') ?? ''
  const courseYear = Number.parseInt(sp.get('courseYear') ?? '', 10)
  if (!courseId || !batchId || !Number.isFinite(courseYear)) {
    return new NextResponse('Choose a course, batch and year first', { status: 400 })
  }

  const from = new Date(`${sp.get('from') ?? ''}T00:00:00.000Z`)
  const to = new Date(`${sp.get('to') ?? ''}T00:00:00.000Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return new NextResponse('Choose a valid date range', { status: 400 })
  }

  const { rows } = await registerFor(
    user,
    { courseId, batchId, courseYear, sectionId: sp.get('sectionId') || null },
    from,
    to,
  )

  const format = sp.get('format') === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'AttendanceSession',
    summary: `Exported an attendance register of ${rows.length} students as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('attendance-register', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Attendance')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
