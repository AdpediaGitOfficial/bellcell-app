import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope, needsBranchChoice } from '@/lib/branch'
import { parseTableParams, skipTake, type SearchParams } from '@/lib/table/params'
import { getDensity } from '@/lib/table/density'
import { formatPaise } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { DensityToggle } from '@/components/ui/DensityToggle'
import { PageHeader } from '@/components/shell/PageHeader'
import { AddTransactionPanel, ReverseButton } from './TransactionForm'

export const metadata: Metadata = { title: 'Daily Transactions' }

const BASE = '/accounts/transactions'
const SORTS = ['transactionDate', 'voucherNo', 'amountPaise'] as const
const FILTERS = ['kind', 'accountHeadId', 'mode'] as const

type Row = Prisma.DailyTransactionGetPayload<{
  include: {
    accountHead: { select: { name: true; kind: true } }
    bankAccount: { select: { bankName: true; accountNumber: true } }
    branch: { select: { name: true } }
    ledgerEntries: { select: { source: true } }
  }
}>

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('accounts.dailyTransaction')
  const sp = await searchParams

  const params = parseTableParams(sp, {
    allowedSorts: SORTS,
    defaultSort: 'transactionDate',
    defaultDir: 'desc',
    filterKeys: FILTERS,
  })

  const where: Prisma.DailyTransactionWhereInput = { ...branchScope(user) }
  if (params.q) {
    where.OR = [
      { voucherNo: { contains: params.q, mode: 'insensitive' } },
      { narration: { contains: params.q, mode: 'insensitive' } },
      { referenceNo: { contains: params.q, mode: 'insensitive' } },
    ]
  }
  if (params.filters.kind) where.kind = params.filters.kind as 'INCOME'
  if (params.filters.accountHeadId) where.accountHeadId = params.filters.accountHeadId
  if (params.filters.mode) where.mode = params.filters.mode as 'CASH'

  const orderBy: Prisma.DailyTransactionOrderByWithRelationInput =
    params.sort === 'voucherNo'
      ? { voucherNo: params.dir }
      : params.sort === 'amountPaise'
        ? { amountPaise: params.dir }
        : { transactionDate: params.dir }

  const { skip, take } = skipTake(params)

  const [rows, total, heads, banks, density, periodTotals] = await Promise.all([
    db.dailyTransaction.findMany({
      where,
      include: {
        accountHead: { select: { name: true, kind: true } },
        bankAccount: { select: { bankName: true, accountNumber: true } },
        branch: { select: { name: true } },
        ledgerEntries: { select: { source: true } },
      },
      orderBy,
      skip,
      take,
    }),
    db.dailyTransaction.count({ where }),
    db.accountHead.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, kind: true },
    }),
    db.bankAccount.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { bankName: 'asc' },
      select: { id: true, bankName: true, accountNumber: true },
    }),
    getDensity(),
    db.dailyTransaction.groupBy({
      by: ['kind'],
      _sum: { amountPaise: true },
      where,
    }),
  ])

  const income = periodTotals.find((t) => t.kind === 'INCOME')?._sum.amountPaise ?? 0
  const expense = periodTotals.find((t) => t.kind === 'EXPENSE')?._sum.amountPaise ?? 0

  const mayCreate = can(user, 'accounts.dailyTransaction', 'create')
  const mayUpdate = can(user, 'accounts.dailyTransaction', 'update')

  const isReversed = (r: Row) => r.ledgerEntries.some((e) => e.source === 'ADJUSTMENT')

  const columns: Column<Row>[] = [
    {
      key: 'voucherNo',
      header: 'Voucher',
      sortable: true,
      width: 'w-44',
      cell: (r) => (
        <div className="min-w-0">
          <p className="numeric truncate">{r.voucherNo}</p>
          <p className="numeric truncate text-xs font-normal text-muted">
            {r.transactionDate.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      ),
    },
    {
      key: 'head',
      header: 'Account head',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-strong">{r.accountHead.name}</p>
          {r.narration && <p className="truncate text-xs text-muted">{r.narration}</p>}
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      hideBelow: 'lg',
      cell: (r) => (
        <span className="capitalize text-muted">
          {r.mode.replace('_', ' ').toLowerCase()}
          {r.bankAccount && (
            <span className="numeric block text-xs text-faint">
              {r.bankAccount.bankName} ····{r.bankAccount.accountNumber.slice(-4)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      align: 'right',
      width: 'w-36',
      cell: (r) => {
        const reversed = isReversed(r)
        return (
          <span
            className={
              'numeric font-medium ' +
              (reversed
                ? 'text-faint line-through'
                : r.kind === 'INCOME'
                  ? 'text-positive-700 dark:text-positive-500'
                  : 'text-critical-600 dark:text-critical-500')
            }
          >
            {r.kind === 'INCOME' ? '+' : '−'}
            {formatPaise(r.amountPaise)}
          </span>
        )
      },
    },
    {
      key: 'state',
      header: '',
      align: 'right',
      width: 'w-24',
      cell: (r) =>
        isReversed(r) ? (
          <Badge tone="neutral">Reversed</Badge>
        ) : mayUpdate ? (
          <ReverseButton transactionId={r.id} voucherNo={r.voucherNo} />
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Daily Transactions"
        subtitle="Day-to-day income and expenses. Every voucher posts straight to the Day Book."
        action={
          mayCreate ? (
            <AddTransactionPanel
              heads={heads}
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
        <Tile label="Income (filtered)" value={formatPaise(income)} tone="positive" />
        <Tile label="Expenses (filtered)" value={formatPaise(expense)} tone="critical" />
        <Tile label="Net" value={formatPaise(income - expense)} />
      </div>

      <Card className="overflow-hidden">
        <FilterBar
          basePath={BASE}
          searchPlaceholder="Search voucher, narration or reference…"
          filters={[
            {
              key: 'kind',
              label: 'Type',
              options: [
                { value: 'INCOME', label: 'Income' },
                { value: 'EXPENSE', label: 'Expense' },
              ],
            },
            {
              key: 'accountHeadId',
              label: 'Head',
              options: heads.map((h) => ({ value: h.id, label: h.name })),
            },
            {
              key: 'mode',
              label: 'Mode',
              options: [
                { value: 'CASH', label: 'Cash' },
                { value: 'UPI', label: 'UPI' },
                { value: 'BANK_TRANSFER', label: 'Bank transfer' },
                { value: 'CHEQUE', label: 'Cheque' },
              ],
            },
          ]}
        >
          <DensityToggle density={density} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          params={params}
          basePath={BASE}
          density={density}
          stickyFirstColumn
          empty={
            <EmptyState
              icon={<ArrowLeftRight className="h-5 w-5" aria-hidden />}
              title={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'No transactions recorded'
                  : 'Nothing matches these filters'
              }
              description={
                total === 0 && Object.keys(params.filters).length === 0
                  ? 'Record rent, salaries, stationery and other day-to-day movement here. Fee receipts arrive automatically.'
                  : 'Try clearing the search or filters.'
              }
            />
          }
        />

        {rows.length > 0 && (
          <Pagination params={params} basePath={BASE} totalRows={total} />
        )}
      </Card>

      <p className="mt-4 text-xs text-faint">
        Fee receipts are not listed here — they are collected in Admissions and
        appear in the{' '}
        <Link href="/accounts/day-book" className="text-brand-700 hover:underline dark:text-brand-400">
          Day Book
        </Link>{' '}
        alongside these vouchers.
      </p>
    </>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'critical'
}) {
  const colour =
    tone === 'positive'
      ? 'text-positive-700 dark:text-positive-500'
      : tone === 'critical'
        ? 'text-critical-600 dark:text-critical-500'
        : 'text-strong'
  return (
    <div className="surface-card rounded-card px-4 py-3 shadow-card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`numeric mt-0.5 text-xl font-semibold ${colour}`}>{value}</p>
    </div>
  )
}
