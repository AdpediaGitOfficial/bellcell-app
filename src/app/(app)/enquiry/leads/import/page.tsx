import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { needsBranchChoice } from '@/lib/branch'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { ImportForm } from './ImportForm'
import { leadFilterOptions } from '../queries'

export const metadata: Metadata = { title: 'Import leads' }

export default async function ImportLeadsPage() {
  const user = await requireUser()
  if (!can(user, 'enquiry.lead', 'create')) notFound()

  const { sources, counsellors } = await leadFilterOptions(user)
  const branches = needsBranchChoice(user) ? user.branches : undefined

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Import leads"
        subtitle="Bulk-load leads from a campaign export, listing site or spreadsheet."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <ImportForm sources={sources} counsellors={counsellors} branches={branches} />
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-strong">File format</h2>
          <p className="text-sm text-muted">
            A header row plus one lead per row. Only the phone column is
            required — everything else is optional.
          </p>

          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-faint">
            Recognised column names
          </h3>
          <dl className="space-y-1.5 text-[13px]">
            {[
              ['Phone', 'Phone, Mobile, Contact No'],
              ['Name', 'Name, Full Name, Student Name'],
              ['Email', 'Email, Email ID'],
              ['City', 'City, Place, Location'],
              ['Course', 'Course, Programme'],
              ['Notes', 'Notes, Remarks, Comments'],
            ].map(([field, aliases]) => (
              <div key={field} className="flex gap-2">
                <dt className="w-14 shrink-0 font-medium text-strong">{field}</dt>
                <dd className="text-muted">{aliases}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-faint">
            What gets skipped
          </h3>
          <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted">
            <li>Rows without a valid 10-digit mobile number</li>
            <li>Numbers already present in this branch</li>
            <li>Duplicates within the same file</li>
          </ul>
          <p className="mt-3 text-[13px] text-muted">
            Skipped rows are listed with their row number so they can be fixed
            and re-imported. Nothing is overwritten.
          </p>
        </Card>
      </div>
    </>
  )
}
