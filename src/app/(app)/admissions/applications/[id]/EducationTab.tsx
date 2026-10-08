import { FileCheck2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge, type Tone } from '@/components/ui/Badge'
import { Field, Input, Select } from '@/components/ui/Field'
import { deleteEducationAction, saveEducationAction } from '../actions'
import type { StudentRecord } from './queries'

const CUSTODY_TONES: Record<string, Tone> = {
  WITH_INSTITUTE: 'caution',
  SENT_FOR_VERIFICATION: 'info',
  RETURNED_FROM_AFFILIATION: 'brand',
  RETURNED_TO_STUDENT: 'positive',
  LOST: 'critical',
}

const CUSTODY_LABELS: Record<string, string> = {
  WITH_INSTITUTE: 'Original held',
  SENT_FOR_VERIFICATION: 'Sent to university',
  RETURNED_FROM_AFFILIATION: 'Back from university',
  RETURNED_TO_STUDENT: 'Returned to student',
  LOST: 'Lost',
}

export function EducationTab({
  student,
  certificateTypes,
  canEdit,
}: {
  student: StudentRecord
  certificateTypes: { id: string; name: string }[]
  canEdit: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Prior qualifications
        </h2>

        {student.educations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No education details recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {student.educations.map((e) => {
              const custody = e.custody[0]
              const stillHeld =
                custody &&
                ['WITH_INSTITUTE', 'SENT_FOR_VERIFICATION', 'RETURNED_FROM_AFFILIATION'].includes(
                  custody.status,
                )
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-strong">
                      {e.qualification}
                      {custody && (
                        <Badge
                          tone={CUSTODY_TONES[custody.status] ?? 'neutral'}
                          icon={<FileCheck2 className="h-3 w-3" />}
                        >
                          {CUSTODY_LABELS[custody.status] ?? custody.status}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[
                        e.boardOrUniversity,
                        e.institution,
                        e.yearOfPassing ? `Passed ${e.yearOfPassing}` : null,
                        e.marksPercentage ? `${e.marksPercentage.toString()}%` : null,
                        e.registerNumber ? `Reg ${e.registerNumber}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>

                  {canEdit && !stillHeld && (
                    <form action={deleteEducationAction}>
                      <input type="hidden" name="educationId" value={e.id} />
                      <input type="hidden" name="studentId" value={student.id} />
                      <button
                        type="submit"
                        aria-label={`Remove ${e.qualification}`}
                        className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </form>
                  )}
                  {stillHeld && (
                    <span
                      className="px-1.5 py-1 text-[11px] text-faint"
                      title="Cannot be removed while the institute holds the original"
                    >
                      Locked
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {canEdit && (
        <form
          action={saveEducationAction}
          className="rounded-card surface-card p-5 shadow-card"
        >
          <h2 className="mb-1 text-sm font-semibold text-strong">Add a qualification</h2>
          <p className="mb-4 text-xs text-muted">
            Ticking &ldquo;original collected&rdquo; opens a custody record, so the
            document can be tracked all the way back to the student.
          </p>
          <input type="hidden" name="studentId" value={student.id} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Qualification" htmlFor="qualification" required>
              <Input id="qualification" name="qualification" placeholder="SSLC, Plus Two, Degree…" required />
            </Field>
            <Field label="Certificate type" htmlFor="certificateTypeId">
              <Select id="certificateTypeId" name="certificateTypeId" defaultValue="">
                <option value="">Not specified</option>
                {certificateTypes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
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
              <Input id="marksPercentage" name="marksPercentage" type="number" step="0.01" min={0} max={100} />
            </Field>
            <Field label="Register number" htmlFor="registerNumber">
              <Input id="registerNumber" name="registerNumber" />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-base sm:col-span-2">
              <input
                type="checkbox"
                name="originalCollected"
                className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
              />
              Original certificate collected from the student
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" size="sm">Add qualification</Button>
          </div>
        </form>
      )}
    </div>
  )
}
