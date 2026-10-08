import { Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { deleteGuardianAction, saveGuardianAction } from '../actions'
import type { StudentRecord } from './queries'

export function FamilyTab({
  student,
  canEdit,
}: {
  student: StudentRecord
  canEdit: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Guardians
        </h2>

        {student.guardians.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No family details recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {student.guardians.map((g) => (
              <li key={g.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
                    {g.name}
                    <Badge tone="neutral">{g.relation}</Badge>
                    {g.isPrimaryContact && <Badge tone="brand">Primary contact</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[g.occupation, g.phone, g.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {canEdit && (
                  <form action={deleteGuardianAction}>
                    <input type="hidden" name="guardianId" value={g.id} />
                    <input type="hidden" name="studentId" value={student.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${g.name}`}
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
          action={saveGuardianAction}
          className="rounded-card surface-card p-5 shadow-card"
        >
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-strong">
            <UserPlus className="h-4 w-4 text-brand-600" aria-hidden />
            Add a guardian
          </h2>
          <input type="hidden" name="studentId" value={student.id} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Relation" htmlFor="relation" required>
              <Select id="relation" name="relation" defaultValue="Father">
                <option>Father</option>
                <option>Mother</option>
                <option>Guardian</option>
                <option>Spouse</option>
                <option>Sibling</option>
              </Select>
            </Field>
            <Field label="Name" htmlFor="g-name" required>
              <Input id="g-name" name="name" required />
            </Field>
            <Field label="Occupation" htmlFor="occupation">
              <Input id="occupation" name="occupation" />
            </Field>
            <Field label="Phone" htmlFor="g-phone">
              <Input id="g-phone" name="phone" inputMode="tel" />
            </Field>
            <Field label="Email" htmlFor="g-email">
              <Input id="g-email" name="email" type="email" />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-base">
              <input
                type="checkbox"
                name="isPrimaryContact"
                className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
              />
              Primary contact
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" size="sm">Add guardian</Button>
          </div>
        </form>
      )}
    </div>
  )
}
