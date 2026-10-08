import type { Metadata } from 'next'
import { BookMarked, CheckCircle2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { branchScope } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import {
  SOURCE_LABELS,
  balances,
  dayBookTotals,
  groupByHead,
  type LedgerLine,
} from '@/lib/accounts/core'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { DayBookControls } from './DayBookControls'

export const metadata: Metadata = { title: 'Day Book' }

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Every rupee that moves, whatever module caused it, in one place.
 *
 * Opening balance is computed from the ledger rather than stored, so the book
 * cannot drift and a back-dated correction is reflected everywhere at once
 * (ADR-003, ADR-020).
 */
export default async function DayBookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('accounts.dayBook')

  const sp = await searchParams
  const today = new Date()

  const fromRaw = typeof sp.from === 'string' ? sp.from : ''
  const toRaw = typeof sp.to === 'string' ? sp.to : ''
  const from = fromRaw && !Number.isNaN(Date.parse(fromRaw))
    ? startOfDay(new Date(`${fromRaw}T00:00:00`))
    : startOfDay(today)
  const to = toRaw && !Number.isNaN(Date.parse(toRaw))
    ? endOfDay(new Date(`${toRaw}T00:00:00`))
    : endOfDay(from)

  const scope = branchScope(user)

  const [priorAgg, entries] = await Promise.all([
    db.ledgerEntry.aggregate({
      _sum: { debitPaise: true, creditPaise: true },
      where: { ...scope, entryDate: { lt: from } },
    }),
    db.ledgerEntry.findMany({
      where: { ...scope, entryDate: { gte: from, lte: to } },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        accountHead: { select: { name: true } },
        bankAccount: { select: { bankName: true, accountNumber: true } },
        branch: { select: { name: true } },
      },
    }),
  ])

  const opening =
    (priorAgg._sum.debitPaise ?? 0) - (priorAgg._sum.creditPaise ?? 0)

  const lines: LedgerLine[] = entries.map((e) => ({
    entryDate: e.entryDate,
    debitPaise: e.debitPaise,
    creditPaise: e.creditPaise,
    source: e.source,
    accountHeadName: e.accountHead?.name ?? null,
    bankAccountLabel: e.bankAccount
      ? `${e.bankAccount.bankName} ····${e.bankAccount.accountNumber.slice(-4)}`
      : null,
    narration: e.narration,
  }))

  const totals = dayBookTotals(opening, lines)
  const heads = groupByHead(lines)
  const proves = balances(totals)

  const sameDay = from.toDateString() === new Date(to).toDateString()
  const label = sameDay
    ? from.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <>
      <PageHeader
        title="Day Book"
        subtitle={`All money movement · ${label}`}
      />

      <Card className="mb-4 overflow-hidden">
        <DayBookControls
          fromISO={from.toISOString().slice(0, 10)}
          toISO={to.toISOString().slice(0, 10)}
        />

        <div className="grid gap-px bg-[rgb(var(--border-base))] sm:grid-cols-4">
          <Figure label="Opening balance" value={totals.openingPaise} />
          <Figure label="Receipts" value={totals.receiptsPaise} tone="positive" />
          <Figure label="Payments" value={totals.paymentsPaise} tone="critical" />
          <Figure label="Closing balance" value={totals.closingPaise} emphasis />
        </div>

        {/* The identity made visible, so a mismatch is never silent. */}
        <p
          className={
            'flex items-center gap-1.5 px-5 py-2 text-xs ' +
            (proves
              ? 'text-positive-700 dark:text-positive-500'
              : 'text-critical-600 dark:text-critical-500')
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {proves ? 'Balanced: ' : 'DOES NOT BALANCE: '}
          <span className="numeric">
            {formatPaise(totals.openingPaise)} + {formatPaise(totals.receiptsPaise)} −{' '}
            {formatPaise(totals.paymentsPaise)} = {formatPaise(totals.closingPaise)}
          </span>
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            Entries
          </h2>

          {entries.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState
                icon={<BookMarked className="h-5 w-5" aria-hidden />}
                title="No movement in this period"
                description="Fee receipts, refunds, daily vouchers and university remittances all appear here as they happen."
              />
            </div>
          ) : (
            <div className="scroll-slim w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[rgb(var(--border-base))]">
                    <Th>Date</Th>
                    <Th>Particulars</Th>
                    <Th hide>Head</Th>
                    <Th align="right">Receipt</Th>
                    <Th align="right">Payment</Th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                    >
                      <td className="numeric whitespace-nowrap px-5 py-2.5 text-muted">
                        {e.entryDate.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-strong">{e.narration ?? '—'}</p>
                        <Badge tone="neutral" className="mt-0.5">
                          {SOURCE_LABELS[e.source] ?? e.source}
                        </Badge>
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted lg:table-cell">
                        {e.accountHead?.name ?? <span className="text-faint">—</span>}
                      </td>
                      <td className="numeric px-3 py-2.5 text-right text-positive-700 dark:text-positive-500">
                        {e.debitPaise > 0 ? formatPaise(e.debitPaise) : '—'}
                      </td>
                      <td className="numeric px-5 py-2.5 text-right text-critical-600 dark:text-critical-500">
                        {e.creditPaise > 0 ? formatPaise(e.creditPaise) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[rgb(var(--border-strong))] font-semibold text-strong">
                    <td className="px-5 py-2.5" colSpan={3}>
                      Total ({entries.length} entries)
                    </td>
                    <td className="numeric px-3 py-2.5 text-right">
                      {formatPaise(totals.receiptsPaise)}
                    </td>
                    <td className="numeric px-5 py-2.5 text-right">
                      {formatPaise(totals.paymentsPaise)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Card className="h-fit overflow-hidden">
          <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            By account head
          </h2>
          {heads.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nothing to group.</p>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {heads.map((h) => (
                <li key={h.key} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-strong">{h.label}</span>
                    <span className="numeric shrink-0 text-xs text-faint">{h.count}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs">
                    {h.receiptsPaise > 0 && (
                      <span className="numeric text-positive-700 dark:text-positive-500">
                        +{formatPaise(h.receiptsPaise)}
                      </span>
                    )}
                    {h.paymentsPaise > 0 && (
                      <span className="numeric ml-auto text-critical-600 dark:text-critical-500">
                        −{formatPaise(h.paymentsPaise)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Figure({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string
  value: number
  tone?: 'positive' | 'critical'
  emphasis?: boolean
}) {
  const colour =
    tone === 'positive'
      ? 'text-positive-700 dark:text-positive-500'
      : tone === 'critical'
        ? 'text-critical-600 dark:text-critical-500'
        : value < 0
          ? 'text-critical-600 dark:text-critical-500'
          : 'text-strong'
  return (
    <div className="bg-[rgb(var(--surface-card))] px-5 py-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`numeric mt-0.5 font-semibold ${colour} ${emphasis ? 'text-2xl' : 'text-xl'}`}
      >
        {formatPaise(value)}
      </p>
    </div>
  )
}

function Th({
  children,
  align = 'left',
  hide,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  hide?: boolean
}) {
  return (
    <th
      className={
        'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted first:pl-5 last:pr-5 ' +
        (align === 'right' ? 'text-right ' : 'text-left ') +
        (hide ? 'hidden lg:table-cell' : '')
      }
    >
      {children}
    </th>
  )
}
