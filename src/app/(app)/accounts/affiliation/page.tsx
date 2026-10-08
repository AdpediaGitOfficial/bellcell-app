import type { Metadata } from 'next'
import { Landmark } from 'lucide-react'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { can } from '@/lib/rbac/can'
import { branchScope, needsBranchChoice } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import { reconcile } from '@/lib/accounts/core'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'
import { AddRemittance } from './AffiliationForm'

export const metadata: Metadata = { title: 'Affiliation Payments' }

/**
 * The vendor scope had "Affiliation & Tie-Up Payment" as a bare entry screen
 * and never connected it to what students had paid, so nobody could answer
 * "do we still owe the university money?". The reconciliation panel is that
 * answer: collected under a payable fee type, against remitted.
 */
export default async function AffiliationPage() {
  const user = await requireUser()
  const scope = branchScope(user)

  const [payments, bodies, payableFeeTypes, banks] = await Promise.all([
    db.affiliationPayment.findMany({
      where: scope,
      orderBy: { paidOn: 'desc' },
      take: 100,
      include: {
        affiliationBody: { select: { name: true } },
        feeType: { select: { name: true } },
        bankAccount: { select: { bankName: true, accountNumber: true } },
      },
    }),
    db.affiliationBody.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.feeType.findMany({
      where: { archivedAt: null, isPayableToAffiliation: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.bankAccount.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { bankName: 'asc' },
      select: { id: true, bankName: true, accountNumber: true },
    }),
  ])

  // What students actually paid against fee types that are owed onward.
  const payableIds = payableFeeTypes.map((f) => f.id)
  const collectedRows =
    payableIds.length > 0
      ? await db.paymentAllocation.findMany({
          where: {
            payment: { ...scope, status: 'COMPLETED' },
            installment: { feeTypeId: { in: payableIds } },
          },
          select: {
            amountPaise: true,
            installment: { select: { feeTypeId: true } },
          },
        })
      : []

  const collected = collectedRows.map((r) => ({
    key: r.installment.feeTypeId,
    label: payableFeeTypes.find((f) => f.id === r.installment.feeTypeId)?.name ?? 'Other',
    amountPaise: r.amountPaise,
  }))

  const remitted = payments
    .filter((p) => p.feeTypeId)
    .map((p) => ({ key: p.feeTypeId!, amountPaise: p.amountPaise }))

  const reconciliation = reconcile(collected, remitted).map((r) => ({
    ...r,
    label: payableFeeTypes.find((f) => f.id === r.key)?.name ?? r.label,
  }))

  const totalOwed = reconciliation.reduce(
    (s, r) => s + Math.max(0, r.outstandingPaise),
    0,
  )
  const totalRemitted = payments.reduce((s, p) => s + p.amountPaise, 0)
  const unallocated = payments
    .filter((p) => !p.feeTypeId)
    .reduce((s, p) => s + p.amountPaise, 0)

  const mayCreate = can(user, 'accounts.affiliationPayment', 'create')

  return (
    <>
      <PageHeader
        title="Affiliation Payments"
        subtitle="What the institute owes the university, and what has been sent."
        action={
          mayCreate ? (
            <AddRemittance
              bodies={bodies}
              feeTypes={payableFeeTypes}
              banks={banks.map((b) => ({
                id: b.id,
                label: `${b.bankName} ····${b.accountNumber.slice(-4)}`,
              }))}
              branches={needsBranchChoice(user) ? user.branches : undefined}
            />
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Still owed to universities" value={formatPaise(totalOwed)} tone="critical" />
        <Tile label="Remitted to date" value={formatPaise(totalRemitted)} />
        <Tile
          label="Remitted without a fee type"
          value={formatPaise(unallocated)}
          hint={unallocated > 0 ? 'Not counted in the reconciliation' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-[rgb(var(--border-base))] px-5 py-3">
            <h2 className="text-sm font-semibold text-strong">Reconciliation</h2>
            <p className="mt-0.5 text-xs text-muted">
              Collected from students against remitted onward.
            </p>
          </div>

          {reconciliation.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No fee types are marked payable to an affiliating body yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border-base))]">
                  <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    Fee type
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                    Collected
                  </th>
                  <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                    Remitted
                  </th>
                  <th className="px-5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                    Owed
                  </th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.map((r) => (
                  <tr key={r.key} className="border-b border-[rgb(var(--border-base))] last:border-0">
                    <td className="px-5 py-2.5 font-medium text-strong">{r.label}</td>
                    <td className="numeric px-2 py-2.5 text-right">
                      {formatPaise(r.collectedPaise)}
                    </td>
                    <td className="numeric px-2 py-2.5 text-right text-muted">
                      {formatPaise(r.remittedPaise)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span
                        className={
                          'numeric font-medium ' +
                          (r.outstandingPaise > 0
                            ? 'text-critical-600 dark:text-critical-500'
                            : r.outstandingPaise < 0
                              ? 'text-caution-600 dark:text-caution-500'
                              : 'text-positive-700 dark:text-positive-500')
                        }
                      >
                        {formatPaise(r.outstandingPaise)}
                      </span>
                      {r.outstandingPaise < 0 && (
                        <span className="block text-[11px] text-caution-600 dark:text-caution-500">
                          over-remitted
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
            Remittances
          </h2>

          {payments.length === 0 ? (
            <div className="px-5 py-12">
              <EmptyState
                icon={<Landmark className="h-5 w-5" aria-hidden />}
                title="No remittances recorded"
                description="Record what the institute sends to the university, so it can be reconciled against what students paid."
              />
            </div>
          ) : (
            <ul className="divide-y divide-[rgb(var(--border-base))]">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-strong">
                      {p.affiliationBody.name}
                      {p.feeType && (
                        <Badge tone="brand" className="ml-2">{p.feeType.name}</Badge>
                      )}
                      {!p.feeType && (
                        <Badge tone="neutral" className="ml-2">No fee type</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {p.paidOn.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      <span className="capitalize">{p.mode.replace('_', ' ').toLowerCase()}</span>
                      {p.referenceNo ? ` · ${p.referenceNo}` : ''}
                      {p.studentCount ? ` · ${p.studentCount} students` : ''}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-medium text-strong">
                    {formatPaise(p.amountPaise)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'critical'
  hint?: string
}) {
  return (
    <div className="surface-card rounded-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          'numeric mt-0.5 text-xl font-semibold ' +
          (tone === 'critical' ? 'text-critical-600 dark:text-critical-500' : 'text-strong')
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-caution-600 dark:text-caution-500">{hint}</p>}
    </div>
  )
}
