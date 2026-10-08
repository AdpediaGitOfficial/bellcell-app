import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { parseTableParams } from '@/lib/table/params'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import {
  CUSTODY_FILTER_KEYS,
  CUSTODY_LABELS,
  CUSTODY_SORTS,
  listCustodyForExport,
  type CustodyRow,
} from '@/app/(app)/admissions/certificates/queries'

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? ''

const columns: ExportColumn<CustodyRow>[] = [
  {
    header: 'Student',
    value: (r) => `${r.student.firstName} ${r.student.lastName ?? ''}`.trim(),
  },
  { header: 'Admission No', value: (r) => r.student.admissionNo ?? r.student.applicationNo },
  { header: 'Course', value: (r) => r.student.course.name },
  { header: 'Document', value: (r) => r.certificateType.name },
  { header: 'Qualification', value: (r) => r.studentEducation?.qualification },
  { header: 'University', value: (r) => r.affiliationBody?.name },
  { header: 'Status', value: (r) => CUSTODY_LABELS[r.status] },
  { header: 'Collected On', value: (r) => iso(r.collectedAt) },
  { header: 'Sent On', value: (r) => iso(r.sentAt) },
  { header: 'Back From University', value: (r) => iso(r.returnedAt) },
  { header: 'Returned To Student', value: (r) => iso(r.handedBackAt) },
  { header: 'Branch', value: (r) => r.student.branch.name },
  { header: 'Remarks', value: (r) => r.remarks },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!can(user, 'admission.certificateCustody', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseTableParams(sp, {
    allowedSorts: CUSTODY_SORTS,
    defaultSort: 'collectedAt',
    filterKeys: CUSTODY_FILTER_KEYS,
  })

  const rows = await listCustodyForExport(user, params)
  const format = sp.format === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'CertificateCustody',
    summary: `Exported ${rows.length} certificate custody records as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('certificate-custody', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Certificate Custody')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
