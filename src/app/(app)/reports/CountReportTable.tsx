import { Badge } from '@/components/ui/Badge'
import type { CountRow } from './queries'

/**
 * Shared table for the two count reports.
 *
 * A conversion-rate column is included because a raw count without it does
 * not answer the question a principal is actually asking ("which source is
 * worth the money?").
 */
export function CountReportTable({
  rows,
  dimensionLabel,
  showStages,
}: {
  rows: CountRow[]
  dimensionLabel: string
  showStages: boolean
}) {
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      converted: acc.converted + (r.converted ?? 0),
      lost: acc.lost + (r.lost ?? 0),
      open: acc.open + (r.open ?? 0),
    }),
    { total: 0, converted: 0, lost: 0, open: 0 },
  )

  if (rows.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-muted">
        Nothing recorded in this date range.
      </p>
    )
  }

  const rate = (converted: number, total: number) =>
    total === 0 ? '—' : `${((converted / total) * 100).toFixed(1)}%`

  return (
    <div className="scroll-slim w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--border-base))]">
            <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
              {dimensionLabel}
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
              Total
            </th>
            {showStages && (
              <>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Open
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                  Lost
                </th>
              </>
            )}
            <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
              Admitted
            </th>
            <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
              Conversion
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-b border-[rgb(var(--border-base))] hover:bg-[rgb(var(--surface-hover))]"
            >
              <td className="px-5 py-2.5 font-medium text-strong">{r.label}</td>
              <td className="numeric px-3 py-2.5 text-right">{r.total.toLocaleString('en-IN')}</td>
              {showStages && (
                <>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {(r.open ?? 0).toLocaleString('en-IN')}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {(r.lost ?? 0).toLocaleString('en-IN')}
                  </td>
                </>
              )}
              <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">
                {(r.converted ?? 0).toLocaleString('en-IN')}
              </td>
              <td className="px-5 py-2.5 text-right">
                <Badge
                  tone={
                    r.total === 0
                      ? 'neutral'
                      : (r.converted ?? 0) / r.total >= 0.2
                        ? 'positive'
                        : (r.converted ?? 0) / r.total >= 0.1
                          ? 'caution'
                          : 'neutral'
                  }
                >
                  {rate(r.converted ?? 0, r.total)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
            <td className="px-5 py-2.5">Total</td>
            <td className="numeric px-3 py-2.5 text-right">
              {totals.total.toLocaleString('en-IN')}
            </td>
            {showStages && (
              <>
                <td className="numeric px-3 py-2.5 text-right">
                  {totals.open.toLocaleString('en-IN')}
                </td>
                <td className="numeric px-3 py-2.5 text-right">
                  {totals.lost.toLocaleString('en-IN')}
                </td>
              </>
            )}
            <td className="numeric px-3 py-2.5 text-right">
              {totals.converted.toLocaleString('en-IN')}
            </td>
            <td className="numeric px-5 py-2.5 text-right">
              {rate(totals.converted, totals.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
