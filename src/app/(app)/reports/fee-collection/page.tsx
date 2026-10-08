import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePageUser } from '@/lib/auth/guard'
import { formatPaise } from '@/lib/money'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { GroupControls } from '../GroupControls'
import { feeCollectionReport, parseRange } from '../queries'

export const metadata: Metadata = { title: 'Fee Collection Summary' }

const BASE = '/reports/fee-collection'
const GROUPS = ['day', 'mode', 'course', 'collector', 'branch'] as const
type Group = (typeof GROUPS)[number]

const LABELS: Record<Group, string> = {
  day: 'Date',
  mode: 'Payment mode',
  course: 'Course',
  collector: 'Collected by',
  branch: 'Branch',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('reports')

  const sp = await searchParams
  const range = parseRange(sp)
  const raw = typeof sp.groupBy === 'string' ? sp.groupBy : ''
  const groupBy: Group = (GROUPS as readonly string[]).includes(raw)
    ? (raw as Group)
    : 'day'

  const rows = await feeCollectionReport(user, range, groupBy)
  const totals = rows.reduce(
    (a, r) => ({ count: a.count + r.count, amountPaise: a.amountPaise + r.amountPaise }),
    { count: 0, amountPaise: 0 },
  )
  const max = Math.max(...rows.map((r) => r.amountPaise), 1)

  return (
    <>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All reports
      </Link>
      <PageHeader
        eyebrow="Reports"
        title="Fee Collection Summary"
        subtitle="Money actually received in the period. Cancelled and bounced receipts are excluded, so this ties to the Day Book."
      />

      <Card className="overflow-hidden">
        <GroupControls
          basePath={BASE}
          fromISO={range.fromISO}
          toISO={range.toISO}
          groupBy={groupBy}
          groups={GROUPS.map((g) => ({ value: g, label: LABELS[g] }))}
        />

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No payments received in this date range.
          </p>
        ) : (
          <div className="scroll-slim w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    {LABELS[groupBy]}
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Receipts</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Amount</th>
                  <th className="w-40 px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-[rgb(var(--border-base))] hover:bg-[rgb(var(--surface-hover))]">
                    <td className="px-5 py-2.5 font-medium capitalize text-strong">{r.label.toLowerCase()}</td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">{r.count.toLocaleString('en-IN')}</td>
                    <td className="numeric px-3 py-2.5 text-right font-medium">{formatPaise(r.amountPaise)}</td>
                    <td className="px-5 py-2.5">
                      {/* Single-hue magnitude bar: ordered data, so a
                          sequential ramp rather than categorical hues. */}
                      <span className="flex items-center gap-2">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--surface-sunken))]">
                          <span
                            className="block h-full rounded-full bg-brand-500"
                            style={{ width: `${Math.max((r.amountPaise / max) * 100, 2)}%` }}
                          />
                        </span>
                        <span className="numeric w-10 shrink-0 text-right text-xs text-faint">
                          {((r.amountPaise / (totals.amountPaise || 1)) * 100).toFixed(0)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
                  <td className="px-5 py-2.5">Total</td>
                  <td className="numeric px-3 py-2.5 text-right">{totals.count.toLocaleString('en-IN')}</td>
                  <td className="numeric px-3 py-2.5 text-right">{formatPaise(totals.amountPaise)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
