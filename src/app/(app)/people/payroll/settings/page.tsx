import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ShieldAlert, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { requirePageUser } from '@/lib/auth/guard'
import { can } from '@/lib/rbac/can'
import { branchScope, needsBranchChoice } from '@/lib/branch'
import { formatPaise } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { PageHeader } from '@/components/shell/PageHeader'
import { SettingsForm } from './SettingsForm'
import { deleteTaxSlabAction, saveTaxSlabAction } from '../actions'

export const metadata: Metadata = { title: 'Payroll settings' }

function rupees(paise: number): string {
  return formatPaise(paise, { symbol: false, decimals: false })
}

export default async function PayrollSettingsPage() {
  const user = await requirePageUser('people.payroll')
  const mayEdit = can(user, 'people.payroll', 'approve')

  const scope = branchScope(user)
  const setting = scope.branchId
    ? await db.payrollSetting.findUnique({
        where: { branchId: scope.branchId },
        include: { slabs: { orderBy: { sortOrder: 'asc' } } },
      })
    : null

  const heads = await db.accountHead.findMany({
    where: { kind: 'EXPENSE', archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  })

  const branches = needsBranchChoice(user) ? user.branches : undefined

  return (
    <>
      <Link
        href="/people/payroll"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to payroll
      </Link>

      <PageHeader
        eyebrow="Payroll"
        title="Payroll settings"
        subtitle="What the institute is registered for, and the rates that follow from it."
      />

      {!mayEdit ? (
        <Card className="p-5">
          <p className="flex items-start gap-2 text-sm text-muted">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-caution-600 dark:text-caution-500"
              aria-hidden
            />
            Only someone who can approve payroll may change these rates. You can
            still prepare and review runs.
          </p>
        </Card>
      ) : (
        <div className="mx-auto max-w-3xl">
          {/* Said plainly, because the opposite default is the dangerous one:
              an institute that silently deducts PF it never remits. */}
          <p className="mb-4 max-w-prose rounded-lg bg-[rgb(var(--surface-sunken))] px-4 py-3 text-xs text-muted">
            Nothing statutory is deducted until it is switched on here. The rates
            below are the figures in force when this was written — they change by
            notification, so check them against the institute&rsquo;s own
            registration rather than trusting the defaults.
          </p>

          <SettingsForm
            branches={branches}
            heads={heads}
            values={{
              pfEnabled: setting?.pfEnabled ?? false,
              pfEmployeeRate: setting?.pfEmployeeRate.toString() ?? '12',
              pfEmployerRate: setting?.pfEmployerRate.toString() ?? '12',
              pfWageCeiling: rupees(setting?.pfWageCeilingPaise ?? 1_500_000),
              pfNumber: setting?.pfNumber ?? '',
              esiEnabled: setting?.esiEnabled ?? false,
              esiEmployeeRate: setting?.esiEmployeeRate.toString() ?? '0.75',
              esiEmployerRate: setting?.esiEmployerRate.toString() ?? '3.25',
              esiEligibility: rupees(setting?.esiEligibilityPaise ?? 2_100_000),
              esiNumber: setting?.esiNumber ?? '',
              ptEnabled: setting?.ptEnabled ?? false,
              standardWorkingDays: setting?.standardWorkingDays?.toString() ?? '',
              salaryAccountHeadId: setting?.salaryAccountHeadId ?? '',
            }}
          />

          {setting && (
            <Card className="mt-4 p-5">
              <h2 className="text-sm font-semibold text-strong">
                Professional tax slabs
              </h2>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Stated on half-yearly earnings, which is Kerala&rsquo;s basis. The
                levy is deducted in September and March. Leave the upper bound
                blank for the top slab.
              </p>

              {setting.slabs.length > 0 && (
                <table className="mt-4 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--border-base))]">
                      <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                        Half-yearly earnings
                      </th>
                      <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                        Tax
                      </th>
                      <th className="py-2 text-right">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setting.slabs.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-[rgb(var(--border-base))] last:border-0"
                      >
                        <td className="numeric py-2 text-strong">
                          {formatPaise(s.fromPaise)} —{' '}
                          {s.toPaise === null ? 'above' : formatPaise(s.toPaise)}
                        </td>
                        <td className="numeric py-2 text-right text-strong">
                          {formatPaise(s.amountPaise)}
                        </td>
                        <td className="py-2 text-right">
                          <form action={deleteTaxSlabAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              aria-label="Remove slab"
                              className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <form
                action={saveTaxSlabAction}
                className="mt-4 flex flex-wrap items-end gap-3 border-t border-[rgb(var(--border-base))] pt-4"
              >
                <input type="hidden" name="settingId" value={setting.id} />
                <Field label="From (₹)" htmlFor="slab-from" className="w-32">
                  <Input id="slab-from" name="from" inputMode="decimal" required />
                </Field>
                <Field label="To (₹)" htmlFor="slab-to" className="w-32">
                  <Input id="slab-to" name="to" inputMode="decimal" placeholder="above" />
                </Field>
                <Field label="Tax (₹)" htmlFor="slab-amount" className="w-32">
                  <Input id="slab-amount" name="amount" inputMode="decimal" required />
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Add slab
                </Button>
              </form>
            </Card>
          )}

          <p className="mt-4 max-w-prose text-xs text-faint">
            Income tax (TDS) is not calculated by this system. It depends on each
            employee&rsquo;s regime choice, declared investments and other income,
            and a wrong figure is a wrong return — so the monthly amount is
            entered per payslip from the institute&rsquo;s accountant.
          </p>
        </div>
      )}
    </>
  )
}
