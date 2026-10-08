import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { branchScope } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import { outstandingPaise } from '@/lib/fees/core'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/shell/PageHeader'
import { CollectForm, type DueRow } from './CollectForm'

export const metadata: Metadata = { title: 'Collect fee' }

export default async function CollectFeePage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const user = await requirePageUser('admission.fee', 'create')

  const { studentId } = await params

  const student = await db.student.findFirst({
    where: { id: studentId, ...branchScope(user), archivedAt: null },
    include: {
      course: { select: { name: true } },
      batch: { select: { name: true } },
      installments: {
        where: { status: { not: 'WAIVED' } },
        orderBy: [{ dueDate: 'asc' }, { installmentNo: 'asc' }],
        include: { feeType: { select: { name: true } } },
      },
    },
  })
  if (!student) notFound()

  const banks = await db.bankAccount.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: { bankName: 'asc' },
    select: { id: true, bankName: true, accountNumber: true },
  })

  const dues: DueRow[] = student.installments
    .map((i) => ({
      id: i.id,
      label: i.label,
      dueDate: i.dueDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      balancePaise: outstandingPaise(i),
      overdue: i.status === 'OVERDUE',
    }))
    .filter((d) => d.balancePaise > 0)

  const totalOutstanding = dues.reduce((s, d) => s + d.balancePaise, 0)
  const name = `${student.firstName} ${student.lastName ?? ''}`.trim()

  return (
    <>
      <Link
        href={`/admissions/applications/${student.id}?tab=fees`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {name}
      </Link>

      <PageHeader
        eyebrow="Fee collection"
        title={`Collect from ${name}`}
        subtitle={`${student.admissionNo ?? student.applicationNo} · ${student.course.name} · ${student.batch.name}`}
      />

      {dues.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-strong">Nothing outstanding</p>
          <p className="mt-1 text-sm text-muted">
            {student.installments.length === 0
              ? 'No fee structure has been assigned to this student yet.'
              : 'All instalments are settled.'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card className="p-5">
            <CollectForm
              studentId={student.id}
              dues={dues}
              totalOutstandingPaise={totalOutstanding}
              banks={banks.map((b) => ({
                id: b.id,
                label: `${b.bankName} ····${b.accountNumber.slice(-4)}`,
              }))}
            />
          </Card>

          <Card className="h-fit p-5">
            <p className="text-xs text-muted">Total outstanding</p>
            <p className="numeric mt-0.5 text-2xl font-semibold text-strong">
              {formatPaise(totalOutstanding)}
            </p>
            <p className="mt-3 text-xs text-muted">
              {dues.length} unpaid instalment{dues.length === 1 ? '' : 's'}
              {dues.some((d) => d.overdue) && (
                <>
                  {', '}
                  <span className="text-critical-600 dark:text-critical-500">
                    {dues.filter((d) => d.overdue).length} overdue
                  </span>
                </>
              )}
              .
            </p>
            <p className="mt-4 border-t border-[rgb(var(--border-base))] pt-3 text-xs text-faint">
              A receipt number is allocated when the payment is saved, and the
              amount posts to the Day Book automatically.
            </p>
          </Card>
        </div>
      )}
    </>
  )
}
