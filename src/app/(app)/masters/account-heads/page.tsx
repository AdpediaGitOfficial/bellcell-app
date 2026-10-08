import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { formatPaise } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { AccountHeadEditor } from './AccountHeadEditor'

export const metadata: Metadata = { title: 'Account heads' }

export default async function AccountHeadsPage() {
  const user = await requireUser()
  if (!can(user, 'masters', 'view')) notFound()

  const heads = await db.accountHead.findMany({
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { dailyTransactions: true, feeTypes: true } },
      ledgerEntries: { select: { debitPaise: true, creditPaise: true } },
    },
  })

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Account heads"
        subtitle="What money is classified under — Salary, Rent, Donation, Student Fees, and so on."
        action={
          can(user, 'masters', 'create') ? <AccountHeadEditor /> : null
        }
      />

      <Card className="overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border-base))]">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Head</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">Type</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Vouchers</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Movement</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {heads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted">
                  No account heads defined yet.
                </td>
              </tr>
            )}
            {heads.map((h) => {
              const movement = h.ledgerEntries.reduce(
                (s, e) => s + e.debitPaise + e.creditPaise,
                0,
              )
              return (
                <tr
                  key={h.id}
                  className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                >
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-strong">{h.name}</span>
                    <span className="numeric ml-2 text-xs text-faint">{h.code}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={h.kind === 'INCOME' ? 'positive' : 'critical'}>
                      {h.kind === 'INCOME' ? 'Income' : 'Expense'}
                    </Badge>
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {h._count.dailyTransactions.toLocaleString('en-IN')}
                  </td>
                  <td className="numeric px-3 py-2.5 text-right">
                    {movement > 0 ? formatPaise(movement) : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {can(user, 'masters', 'update') && (
                      <AccountHeadEditor
                        head={{ id: h.id, code: h.code, name: h.name, kind: h.kind }}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <p className="mt-4 text-xs text-faint">
        A head&rsquo;s type decides whether a voucher is money in or money out, and
        the server refuses an entry that contradicts it — so a Rent row can never
        be filed as income.
      </p>
    </>
  )
}
