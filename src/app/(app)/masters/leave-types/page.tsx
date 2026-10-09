import type { Metadata } from 'next'
import { Archive, RotateCcw } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/shell/PageHeader'
import { LeaveTypeEditor } from './LeaveTypeEditor'
import { archiveLeaveTypeAction, restoreLeaveTypeAction } from './actions'

export const metadata: Metadata = { title: 'Leave types' }

export default async function LeaveTypesPage() {
  const user = await requirePageUser('masters')

  const types = await db.leaveType.findMany({
    orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { requests: true } } },
  })

  const canEdit = can(user, 'masters', 'update')
  const canDelete = can(user, 'masters', 'delete')

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Leave types"
        subtitle="What staff can be away for, and whether it costs them anything."
        action={can(user, 'masters', 'create') ? <LeaveTypeEditor /> : null}
      />

      <Card className="overflow-hidden">
        <div className="scroll-slim w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border-base))]">
                <Th className="px-5 text-left">Type</Th>
                <Th className="text-left">Pay</Th>
                <Th className="text-right">Days / year</Th>
                <Th className="text-left">Carry forward</Th>
                <Th className="text-left">Approval</Th>
                <Th className="text-right">Requests</Th>
                <Th className="px-5 text-right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted">
                    No leave types yet.
                  </td>
                </tr>
              )}
              {types.map((t) => {
                const entitlement = Number(t.annualEntitlementDays)
                const cap = Number(t.carryForwardCapDays)
                return (
                  <tr
                    key={t.id}
                    className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
                  >
                    <td className="px-5 py-2.5">
                      <span
                        className={
                          'font-medium text-strong ' +
                          (t.archivedAt ? 'line-through opacity-60' : '')
                        }
                      >
                        {t.name}
                      </span>
                      <span className="numeric ml-2 text-xs text-faint">{t.code}</span>
                      {t.archivedAt && (
                        <Badge tone="neutral" className="ml-2">
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={t.isPaid ? 'positive' : 'critical'}>
                        {t.isPaid ? 'Paid' : 'Costs pay'}
                      </Badge>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {entitlement > 0 ? entitlement : 'Uncapped'}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {t.allowCarryForward
                        ? cap > 0
                          ? `Up to ${cap} days`
                          : 'All unused'
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {t.requiresApproval ? 'Required' : 'Automatic'}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-muted">
                      {t._count.requests}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="inline-flex gap-1">
                        {canEdit && !t.archivedAt && (
                          <LeaveTypeEditor
                            type={{
                              id: t.id,
                              code: t.code,
                              name: t.name,
                              isPaid: t.isPaid,
                              annualEntitlementDays: t.annualEntitlementDays.toString(),
                              allowCarryForward: t.allowCarryForward,
                              carryForwardCapDays: t.carryForwardCapDays.toString(),
                              requiresApproval: t.requiresApproval,
                              sortOrder: t.sortOrder,
                            }}
                          />
                        )}
                        {canDelete && !t.archivedAt && (
                          <form action={archiveLeaveTypeAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              aria-label={`Archive ${t.name}`}
                              className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                            >
                              <Archive className="h-4 w-4" aria-hidden />
                            </button>
                          </form>
                        )}
                        {canEdit && t.archivedAt && (
                          <form action={restoreLeaveTypeAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <button
                              type="submit"
                              aria-label={`Restore ${t.name}`}
                              className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden />
                            </button>
                          </form>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 max-w-prose text-xs text-faint">
        Changing a type from paid to unpaid applies from then on. It does not
        restate leave already approved, because those days are already on the
        attendance register and may already have been paid.
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
