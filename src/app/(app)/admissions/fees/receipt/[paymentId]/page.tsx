import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import type { SearchParams } from '@/lib/table/params'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { CancelReceipt } from './CancelReceipt'
import { PrintButton } from './PrintButton'

export const metadata: Metadata = { title: 'Receipt' }

const MODE_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NET_BANKING: 'Net banking',
  CHEQUE: 'Cheque',
  DD: 'Demand draft',
  BANK_TRANSFER: 'Bank transfer',
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>
  searchParams: Promise<SearchParams>
}) {
  const user = await requirePageUser('admission.fee')

  const { paymentId } = await params
  const sp = await searchParams
  const justCreated = sp.new === '1'

  const payment = await db.payment.findFirst({
    where: { id: paymentId, ...branchScope(user) },
    include: {
      branch: true,
      collectedBy: { select: { fullName: true } },
      bankAccount: { select: { bankName: true, accountNumber: true } },
      student: {
        include: {
          course: { select: { name: true } },
          batch: { select: { name: true } },
        },
      },
      allocations: {
        include: { installment: { select: { label: true, dueDate: true } } },
      },
    },
  })
  if (!payment) notFound()

  const cancelled = payment.status !== 'COMPLETED'
  const name = `${payment.student.firstName} ${payment.student.lastName ?? ''}`.trim()
  const instituteName = process.env.INSTITUTE_NAME ?? 'Bell Cell'

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admissions/applications/${payment.student.id}?tab=fees`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {name}
        </Link>

        <div className="flex items-center gap-2">
          <PrintButton />
          {!cancelled && can(user, 'admission.fee', 'update') && (
            <CancelReceipt paymentId={payment.id} receiptNo={payment.receiptNo} />
          )}
        </div>
      </div>

      {justCreated && !cancelled && (
        <p className="no-print mb-4 flex items-center gap-2 rounded-lg bg-positive-50 px-3 py-2 text-sm text-positive-700 dark:bg-positive-700/15 dark:text-positive-500">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Payment recorded. Receipt {payment.receiptNo} has been issued and posted
          to the Day Book.
        </p>
      )}

      {/* The printed artefact. Sized for A5, prints cleanly on A4. */}
      <Card className="mx-auto max-w-2xl p-8 print:border-0 print:shadow-none">
        <header className="mb-6 border-b border-[rgb(var(--border-base))] pb-4 text-center">
          <h1 className="text-xl font-bold text-strong">{instituteName}</h1>
          <p className="text-sm text-muted">{payment.branch.name}</p>
          {payment.branch.addressLine1 && (
            <p className="text-xs text-muted">
              {[payment.branch.addressLine1, payment.branch.city, payment.branch.state]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          <p className="mt-3 inline-block border-y border-[rgb(var(--border-strong))] px-4 py-1 text-sm font-semibold uppercase tracking-wide text-strong">
            Fee Receipt
          </p>
        </header>

        {cancelled && (
          <p className="mb-4 text-center">
            <Badge tone="critical">
              {payment.status === 'BOUNCED' ? 'BOUNCED' : 'CANCELLED'}
              {payment.cancelReason ? ` — ${payment.cancelReason}` : ''}
            </Badge>
          </p>
        )}

        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Receipt no" value={payment.receiptNo} numeric />
          <Row
            label="Date"
            value={payment.receiptDate.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            numeric
          />
          <Row label="Student" value={name} />
          <Row
            label="Admission no"
            value={payment.student.admissionNo ?? payment.student.applicationNo}
            numeric
          />
          <Row label="Course" value={payment.student.course.name} />
          <Row label="Batch" value={payment.student.batch.name} />
        </dl>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[rgb(var(--border-strong))]">
              <th className="py-2 text-left font-semibold text-strong">Towards</th>
              <th className="py-2 text-right font-semibold text-strong">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.installmentId} className="border-b border-[rgb(var(--border-base))]">
                <td className="py-2 text-base">{a.installment.label}</td>
                <td className="numeric py-2 text-right">{formatPaise(a.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-[rgb(var(--border-strong))]">
              <td className="py-2 font-semibold text-strong">Total</td>
              <td className="numeric py-2 text-right font-semibold text-strong">
                {formatPaise(payment.amountPaise)}
              </td>
            </tr>
          </tfoot>
        </table>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Mode" value={MODE_LABELS[payment.mode] ?? payment.mode} />
          {payment.referenceNo && <Row label="Reference" value={payment.referenceNo} numeric />}
          {payment.bankAccount && (
            <Row
              label="Deposited to"
              value={`${payment.bankAccount.bankName} ····${payment.bankAccount.accountNumber.slice(-4)}`}
            />
          )}
          {payment.collectedBy && <Row label="Received by" value={payment.collectedBy.fullName} />}
        </dl>

        {payment.remarks && (
          <p className="mt-4 text-sm text-muted">{payment.remarks}</p>
        )}

        <footer className="mt-10 flex items-end justify-between border-t border-[rgb(var(--border-base))] pt-4 text-xs text-muted">
          <span>This is a computer-generated receipt.</span>
          <span className="text-right">
            <span className="block h-10" />
            Authorised signatory
          </span>
        </footer>
      </Card>
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
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className={`min-w-0 font-medium text-strong ${numeric ? 'numeric' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
