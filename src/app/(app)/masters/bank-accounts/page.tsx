import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { formatPaise } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { BankAccountEditor } from './BankAccountEditor'

export const metadata: Metadata = { title: 'Bank accounts' }

export default async function BankAccountsPage() {
  const user = await requireUser()
  if (!can(user, 'masters', 'view')) notFound()

  const accounts = await db.bankAccount.findMany({
    orderBy: [{ bankName: 'asc' }, { accountNumber: 'asc' }],
    include: {
      ledgerEntries: { select: { debitPaise: true, creditPaise: true } },
      _count: { select: { payments: true, dailyTransactions: true } },
    },
  })

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Bank accounts"
        subtitle="Accounts the institute receives into and pays from."
        action={can(user, 'masters', 'create') ? <BankAccountEditor /> : null}
      />

      {accounts.length === 0 ? (
        <Card className="px-5 py-12 text-center text-sm text-muted">
          No bank accounts defined yet.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((a) => {
            // Balance through this account only — not the institute's total.
            const net = a.ledgerEntries.reduce(
              (s, e) => s + e.debitPaise - e.creditPaise,
              0,
            )
            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-strong">{a.bankName}</p>
                    <p className="numeric truncate text-sm text-muted">
                      ····{a.accountNumber.slice(-4)}
                      {a.ifsc ? ` · ${a.ifsc}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!a.isActive && <Badge tone="neutral">Inactive</Badge>}
                    {can(user, 'masters', 'update') && (
                      <BankAccountEditor
                        account={{
                          id: a.id,
                          accountName: a.accountName,
                          bankName: a.bankName,
                          branchName: a.branchName,
                          accountNumber: a.accountNumber,
                          ifsc: a.ifsc,
                        }}
                      />
                    )}
                  </div>
                </div>

                <dl className="mt-4 space-y-1.5 border-t border-[rgb(var(--border-base))] pt-3 text-sm">
                  <Row label="Account name" value={a.accountName} />
                  {a.branchName && <Row label="Branch" value={a.branchName} />}
                  <Row
                    label="Movement through it"
                    value={formatPaise(net)}
                    numeric
                  />
                  <Row
                    label="Used by"
                    value={`${a._count.payments} receipts · ${a._count.dailyTransactions} vouchers`}
                  />
                </dl>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function Row({
  label,
  value,
  numeric,
}: {
  label: string
  value: string
  numeric?: boolean
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-strong ${numeric ? 'numeric' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
