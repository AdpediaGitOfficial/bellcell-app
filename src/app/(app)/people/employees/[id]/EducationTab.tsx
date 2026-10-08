import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { addEducationAction, removeChildAction } from '../actions'
import type { EmployeeRecord } from '../queries'

export function EducationTab({
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
          Qualifications
        </h2>

        {employee.educations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No qualifications recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {employee.educations.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strong">{e.qualification}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[
                      e.boardOrUniversity,
                      e.institution,
                      e.yearOfPassing ? `Passed ${e.yearOfPassing}` : null,
                      e.marksPercentage ? `${e.marksPercentage.toString()}%` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>

                {canEdit && (
                  <form action={removeChildAction}>
                    <input type="hidden" name="kind" value="education" />
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${e.qualification}`}
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
          action={addEducationAction}
          className="rounded-card surface-card p-5 shadow-card"
        >
          <h2 className="mb-4 text-sm font-semibold text-strong">
            Add a qualification
          </h2>
          <input type="hidden" name="employeeId" value={employee.id} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Qualification" htmlFor="qualification" required>
              <Input
                id="qualification"
                name="qualification"
                placeholder="M.Com, B.Ed, Ph.D…"
                required
              />
            </Field>
            <Field label="Board / university" htmlFor="boardOrUniversity">
              <Input id="boardOrUniversity" name="boardOrUniversity" />
            </Field>
            <Field label="Institution" htmlFor="institution">
              <Input id="institution" name="institution" />
            </Field>
            <Field label="Year of passing" htmlFor="yearOfPassing">
              <Input id="yearOfPassing" name="yearOfPassing" type="number" min={1950} max={2100} />
            </Field>
            <Field label="Marks (%)" htmlFor="marksPercentage">
              <Input
                id="marksPercentage"
                name="marksPercentage"
                type="number"
                step="0.01"
                min={0}
                max={100}
              />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" size="sm">
              Add qualification
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
