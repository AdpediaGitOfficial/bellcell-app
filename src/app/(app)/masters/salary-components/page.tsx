import type { Metadata } from 'next'
import { Archive, Lock, RotateCcw } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { Badge, type Tone } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { ComponentEditor } from './ComponentEditor'
import {
  archiveSalaryComponentAction,
  restoreSalaryComponentAction,
} from './actions'

export const metadata: Metadata = { title: 'Salary components' }

const KIND_LABELS = {
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
  EMPLOYER_CONTRIBUTION: 'Employer contribution',
} as const

const KIND_TONES: Record<string, Tone> = {
  EARNING: 'positive',
  DEDUCTION: 'critical',
  EMPLOYER_CONTRIBUTION: 'info',
}

export default async function SalaryComponentsPage() {
  const user = await requirePageUser('masters')

  const components = await db.salaryComponent.findMany({
    orderBy: [{ archivedAt: 'asc' }, { kind: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { structureLines: true } } },
  })

  const canEdit = can(user, 'masters', 'update')
  const canDelete = can(user, 'masters', 'delete')

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Salary components"
        subtitle="The lines a payslip can be made of — Basic, DA, HRA, allowances and recoveries."
        action={can(user, 'masters', 'create') ? <ComponentEditor /> : null}
      />

      <Card className="overflow-hidden">
        <div className="scroll-slim w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <Th className="px-5 text-left">Component</Th>
                <Th className="text-left">Type</Th>
                <Th className="text-left">Worked out as</Th>
                <Th className="text-left">Flags</Th>
                <Th className="text-right">In use</Th>
                <Th className="px-5 text-right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {components.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">
                    No salary components yet.
                  </td>
                </tr>
              )}
              {components.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                >
                  <td className="px-5 py-2.5">
                    <span
                      className={
                        'font-medium text-strong ' +
                        (c.archivedAt ? 'line-through opacity-60' : '')
                      }
                    >
                      {c.name}
                    </span>
                    <span className="numeric ml-2 text-xs text-faint">{c.code}</span>
                    {c.archivedAt && (
                      <Badge tone="neutral" className="ml-2">
                        Archived
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={KIND_TONES[c.kind] ?? 'neutral'}>
                      {KIND_LABELS[c.kind]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {c.calculation === 'FIXED'
                      ? 'Fixed amount'
                      : `${c.percentage?.toString()}% of ${
                          c.calculation === 'PERCENT_OF_BASIC' ? 'basic + DA' : 'gross'
                        }`}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {c.partOfBasic && <Badge tone="brand">PF wage base</Badge>}
                      {!c.proRated && <Badge tone="neutral">Not pro-rated</Badge>}
                      {c.isStatutory && (
                        <Badge tone="caution" icon={<Lock className="h-3 w-3" />}>
                          System
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="numeric px-3 py-2.5 text-right text-muted">
                    {c._count.structureLines.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <span className="inline-flex gap-1">
                      {canEdit && !c.archivedAt && !c.isStatutory && (
                        <ComponentEditor
                          component={{
                            id: c.id,
                            code: c.code,
                            name: c.name,
                            kind: c.kind,
                            calculation: c.calculation,
                            percentage: c.percentage?.toString() ?? null,
                            partOfBasic: c.partOfBasic,
                            proRated: c.proRated,
                            sortOrder: c.sortOrder,
                          }}
                        />
                      )}
                      {canDelete && !c.archivedAt && !c.isStatutory && (
                        <form action={archiveSalaryComponentAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            aria-label={`Archive ${c.name}`}
                            className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                          >
                            <Archive className="h-4 w-4" aria-hidden />
                          </button>
                        </form>
                      )}
                      {canEdit && c.archivedAt && (
                        <form action={restoreSalaryComponentAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button
                            type="submit"
                            aria-label={`Restore ${c.name}`}
                            className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          </button>
                        </form>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 max-w-prose text-xs text-faint">
        Provident fund, ESI and professional tax are not listed here. They are
        worked out by the system from the rates in{' '}
        <span className="font-medium">payroll settings</span>, so a payslip
        cannot disagree with the challan because someone edited a component.
      </p>
    </>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  )
}
