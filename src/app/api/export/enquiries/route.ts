import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { parseTableParams } from '@/lib/table/params'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import {
  ENQUIRY_FILTER_KEYS,
  ENQUIRY_SORTS,
  STAGE_LABELS,
  listEnquiriesForExport,
  type EnquiryRow,
} from '@/app/(app)/enquiry/enquiries/queries'

const columns: ExportColumn<EnquiryRow>[] = [
  { header: 'Enquiry No', value: (r) => r.enquiryNo },
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'City', value: (r) => r.city },
  { header: 'Course', value: (r) => r.course?.name },
  { header: 'Source', value: (r) => r.source?.name },
  { header: 'Stage', value: (r) => STAGE_LABELS[r.stage] },
  { header: 'Last Outcome', value: (r) => r.callStatus?.name },
  { header: 'Calls', value: (r) => r.callCount },
  { header: 'Next Call', value: (r) => r.nextCallAt?.toISOString().slice(0, 16) ?? '' },
  {
    header: 'Counselling Done',
    value: (r) => r.counsellingCompletedAt?.toISOString().slice(0, 10) ?? '',
  },
  { header: 'Counsellor', value: (r) => r.assignedTo?.fullName },
  { header: 'Branch', value: (r) => r.branch.name },
  { header: 'Raised', value: (r) => r.createdAt.toISOString().slice(0, 10) },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  if (!can(user, 'enquiry.enquiry', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseTableParams(sp, {
    allowedSorts: ENQUIRY_SORTS,
    defaultSort: 'createdAt',
    filterKeys: ENQUIRY_FILTER_KEYS,
  })

  const rows = await listEnquiriesForExport(user, params)
  const format = sp.format === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'Enquiry',
    summary: `Exported ${rows.length} enquiries as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('enquiries', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Enquiries')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
