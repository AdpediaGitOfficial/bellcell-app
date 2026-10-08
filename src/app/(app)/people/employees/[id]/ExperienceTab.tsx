import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { addExperienceAction, removeChildAction } from '../actions'
import type { EmployeeRecord } from '../queries'

function period(from: Date | null, to: Date | null): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  if (!from && !to) return 'Dates not recorded'
  if (from && !to) return `${fmt(from)} — present`
  if (!from && to) return `until ${fmt(to)}`
  return `${fmt(from!)} — ${fmt(to!)}`
}

export function ExperienceTab({
  employee,
  canEdit,
}: {
  employee: EmployeeRecord
  canEdit: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Previous employment
        </h2>

        {employee.experiences.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No previous employment recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {employee.experiences.map((x) => (
              <li key={x.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strong">
                    {x.designation ? `${x.designation}, ` : ''}
                    {x.organisation}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {period(x.fromDate, x.toDate)}
                  </p>
                  {x.remarks && (
                    <p className="mt-1 text-xs text-muted">{x.remarks}</p>
                  )}
                </div>

                {canEdit && (
                  <form action={removeChildAction}>
                    <input type="hidden" name="kind" value="experience" />
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${x.organisation}`}
                      className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <form
          action={addExperienceAction}
          className="rounded-card surface-card p-5 shadow-card"
        >
          <h2 className="mb-4 text-sm font-semibold text-strong">
            Add previous employment
          </h2>
          <input type="hidden" name="employeeId" value={employee.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation" htmlFor="organisation" required>
              <Input id="organisation" name="organisation" required />
            </Field>
            <Field label="Designation" htmlFor="x-designation">
              <Input id="x-designation" name="designation" />
            </Field>
            <Field label="From" htmlFor="fromDate">
              <Input id="fromDate" name="fromDate" type="date" />
            </Field>
            <Field label="To" htmlFor="toDate" hint="Leave blank if still there.">
              <Input id="toDate" name="toDate" type="date" />
            </Field>
            <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2">
              <Textarea id="remarks" name="remarks" rows={2} />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" size="sm">
              Add experience
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
