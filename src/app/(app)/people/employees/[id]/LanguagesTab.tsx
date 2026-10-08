import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { removeChildAction, saveLanguageSkillAction } from '../actions'
import type { EmployeeRecord } from '../queries'

const LEVELS = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'FLUENT', label: 'Fluent' },
  { value: 'NATIVE', label: 'Native' },
] as const

/**
 * Read / write / speak are three separate skills, which is why the quotation
 * asks for all three rather than one "language known" field: a clerk who
 * speaks Tamil but cannot write it still cannot draft a Tamil letter.
 */
export function LanguagesTab({
  employee,
  languages,
  canEdit,
}: {
  employee: EmployeeRecord
  languages: { id: string; name: string }[]
  canEdit: boolean
}) {
  const recorded = new Map(employee.languages.map((l) => [l.languageId, l]))
  const unrecorded = languages.filter((l) => !recorded.has(l.id))

  return (
    <div className="space-y-4">
      <div className="rounded-card surface-card overflow-hidden shadow-card">
        <h2 className="border-b border-[rgb(var(--border-base))] px-5 py-3 text-sm font-semibold text-strong">
          Languages known
        </h2>

        {employee.languages.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No languages recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border-base))]">
            {employee.languages.map((l) => (
              <li key={l.id} className="px-5 py-3">
                {canEdit ? (
                  <form
                    action={saveLanguageSkillAction}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2"
                  >
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <input type="hidden" name="languageId" value={l.languageId} />
                    <span className="w-28 shrink-0 text-sm font-medium text-strong">
                      {l.language.name}
                    </span>
                    <SkillBox name="canRead" label="Read" defaultChecked={l.canRead} />
                    <SkillBox name="canWrite" label="Write" defaultChecked={l.canWrite} />
                    <SkillBox name="canSpeak" label="Speak" defaultChecked={l.canSpeak} />
                    <Select
                      name="proficiency"
                      aria-label={`${l.language.name} proficiency`}
                      defaultValue={l.proficiency}
                      className="h-9 w-auto min-w-[9rem]"
                    >
                      {LEVELS.map((lv) => (
                        <option key={lv.value} value={lv.value}>
                          {lv.label}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" size="sm">
                      <Check className="h-4 w-4" aria-hidden />
                      Save
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-strong">
                    <span className="font-medium">{l.language.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {[
                        l.canRead ? 'read' : null,
                        l.canWrite ? 'write' : null,
                        l.canSpeak ? 'speak' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'none'}
                      {' · '}
                      {LEVELS.find((lv) => lv.value === l.proficiency)?.label ??
                        l.proficiency}
                    </span>
                  </p>
                )}

                {canEdit && (
                  <form action={removeChildAction} className="mt-1">
                    <input type="hidden" name="kind" value="language" />
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 text-xs text-faint hover:text-critical-600"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Remove {l.language.name}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && unrecorded.length > 0 && (
        <form
          action={saveLanguageSkillAction}
          className="rounded-card surface-card p-5 shadow-card"
        >
          <h2 className="mb-4 text-sm font-semibold text-strong">Add a language</h2>
          <input type="hidden" name="employeeId" value={employee.id} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Select
              name="languageId"
              aria-label="Language"
              defaultValue=""
              required
              className="h-9 w-auto min-w-[10rem]"
            >
              <option value="">Select a language…</option>
              {unrecorded.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <SkillBox name="canRead" label="Read" defaultChecked />
            <SkillBox name="canWrite" label="Write" defaultChecked />
            <SkillBox name="canSpeak" label="Speak" defaultChecked />
            <Select
              name="proficiency"
              aria-label="Proficiency"
              defaultValue="INTERMEDIATE"
              className="h-9 w-auto min-w-[9rem]"
            >
              {LEVELS.map((lv) => (
                <option key={lv.value} value={lv.value}>
                  {lv.label}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm">
              Add language
            </Button>
          </div>
        </form>
      )}

      {canEdit && languages.length === 0 && (
        <p className="text-xs text-faint">
          No languages are defined yet. Add them under Masters first.
        </p>
      )}
    </div>
  )
}

function SkillBox({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-base">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
      />
      {label}
    </label>
  )
}
