import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'
import { parseTableParams } from '@/lib/table/params'
import { exportFilename, toCsv, toXlsx, type ExportColumn } from '@/lib/export/serialize'
import {
  LEAD_FILTER_KEYS,
  LEAD_SORTS,
  listLeadsForExport,
  type LeadRow,
} from '@/app/(app)/enquiry/leads/queries'

const columns: ExportColumn<LeadRow>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'City', value: (r) => r.city },
  { header: 'Course', value: (r) => r.course?.name },
  { header: 'Source', value: (r) => r.source?.name },
  { header: 'Call Status', value: (r) => r.callStatus?.name },
  { header: 'Assigned To', value: (r) => r.assignedTo?.fullName },
  { header: 'Calls', value: (r) => r.callCount },
  {
    header: 'Next Call',
    value: (r) => r.nextCallAt?.toISOString().slice(0, 10) ?? '',
  },
  { header: 'Branch', value: (r) => r.branch.name },
  { header: 'Created', value: (r) => r.createdAt.toISOString().slice(0, 10) },
]

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  // Export is a distinct permission from view: downloading the full lead list
  // is a data-protection event, not just a read.
  if (!can(user, 'enquiry.lead', 'export')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseTableParams(sp, {
    allowedSorts: LEAD_SORTS,
    defaultSort: 'createdAt',
    filterKeys: LEAD_FILTER_KEYS,
  })

  const rows = await listLeadsForExport(user, params)
  const format = sp.format === 'csv' ? 'csv' : 'xlsx'

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'EXPORT',
    entityType: 'EnquiryLead',
    summary: `Exported ${rows.length} leads as ${format.toUpperCase()}`,
  })

  const filename = exportFilename('enquiry-leads', format)

  if (format === 'csv') {
    return new NextResponse(toCsv(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  const buffer = await toXlsx(rows, columns, 'Enquiry Leads')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
