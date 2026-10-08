'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Archive, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input } from '@/components/ui/Field'
import {
  archiveMasterAction,
  restoreMasterAction,
  saveMasterAction,
  type MasterKind,
  type MasterState,
} from './actions'

export interface MasterRow {
  id: string
  name: string
  code?: string
  archivedAt: Date | null
  requiresFollowUp?: boolean
  isTerminal?: boolean
  sortOrder?: number
  inUse?: number
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function MasterTable({
  kind,
  rows,
  canEdit,
  canDelete,
  showFlags = false,
  showCode = false,
  usageLabel = 'in use',
}: {
  kind: MasterKind
  rows: MasterRow[]
  canEdit: boolean
  canDelete: boolean
  showFlags?: boolean
  /** Entries carrying a short code, set once at creation. */
  showCode?: boolean
  usageLabel?: string
}) {
  const [editing, setEditing] = useState<MasterRow | 'new' | null>(null)
  const close = useCallback(() => setEditing(null), [])

  const current = editing === 'new' ? null : editing

  return (
    <>
      {canEdit && (
        <div className="flex justify-end px-5 pt-5">
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        </div>
      )}

      {editing !== null && (
        <MasterForm
          kind={kind}
          current={current}
          showFlags={showFlags}
          showCode={showCode}
          onClose={close}
        />
      )}

      <div className="scroll-slim mt-4 w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border-base))]">
              <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                Name
              </th>
              {showFlags && (
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Behaviour
                </th>
              )}
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                {usageLabel}
              </th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">
                &nbsp;
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-muted">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
              >
                <td className="px-5 py-2.5 font-medium text-strong">
                  <span className={r.archivedAt ? 'line-through opacity-60' : ''}>
                    {r.name}
                  </span>
                  {r.code && (
                    <span className="numeric ml-2 text-xs font-normal text-faint">
                      {r.code}
                    </span>
                  )}
                  {r.archivedAt && (
                    <Badge tone="neutral" className="ml-2">
                      Archived
                    </Badge>
                  )}
                </td>
                {showFlags && (
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {r.requiresFollowUp && <Badge tone="info">Needs follow-up</Badge>}
                      {r.isTerminal && <Badge tone="neutral">Closes enquiry</Badge>}
                    </span>
                  </td>
                )}
                <td className="numeric px-3 py-2.5 text-right text-muted">
                  {r.inUse?.toLocaleString('en-IN') ?? '—'}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <span className="inline-flex gap-1">
                    {canEdit && !r.archivedAt && (
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        aria-label={`Edit ${r.name}`}
                        className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    {canDelete && !r.archivedAt && (
                      <form action={archiveMasterAction.bind(null, kind)}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          aria-label={`Archive ${r.name}`}
                          className="rounded-md p-1.5 text-faint hover:bg-critical-50 hover:text-critical-600 dark:hover:bg-critical-500/10"
                        >
                          <Archive className="h-4 w-4" aria-hidden />
                        </button>
                      </form>
                    )}
                    {canEdit && r.archivedAt && (
                      <form action={restoreMasterAction.bind(null, kind)}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          aria-label={`Restore ${r.name}`}
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
    </>
  )
}

/**
 * The editor is its own component so that `useActionState` lives and dies
 * with the open form.
 *
 * It also closes ONLY on a successful save. The earlier version closed
 * unconditionally after the action, which swallowed every validation error —
 * a duplicate entry looked like it had saved. Caught by a browser pass.
 */
function MasterForm({
  kind,
  current,
  showFlags,
  showCode,
  onClose,
}: {
  kind: MasterKind
  current: MasterRow | null
  showFlags: boolean
  showCode: boolean
  onClose: () => void
}) {
  const [state, formAction] = useActionState<MasterState, FormData>(
    saveMasterAction.bind(null, kind),
    {},
  )

  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.ok) {
      onClose()
      return
    }
    // React clears an uncontrolled form once its action settles — a refusal
    // included — so put back what was typed. useActionState hands us a new
    // object every submit, so this also fires when the same error repeats.
    if (state.values?.name !== undefined && nameRef.current) {
      nameRef.current.value = state.values.name
    }
    if (state.values?.code !== undefined && codeRef.current) {
      codeRef.current.value = state.values.code
    }
  }, [state, onClose])

  return (
    <form
      action={formAction}
      className="mx-5 mt-4 rounded-lg border border-[rgb(var(--border-base))] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-strong">
          {current ? 'Edit entry' : 'New entry'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="rounded p-1 text-faint hover:text-strong"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <input type="hidden" name="id" value={current?.id ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Code is set once: it is what printed lists are sorted by, so a
            later rename would silently reorder old paperwork. */}
        {showCode && !current && (
          <Field label="Code" htmlFor="code" required hint="Short, e.g. COMM.">
            <Input ref={codeRef} id="code" name="code" required maxLength={20} />
          </Field>
        )}

        <Field label="Name" htmlFor="name" required>
          <Input
            ref={nameRef}
            id="name"
            name="name"
            defaultValue={current?.name ?? ''}
            required
            autoFocus
          />
        </Field>

        {showFlags && (
          <>
            <Field label="Sort order" htmlFor="sortOrder">
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={current?.sortOrder ?? 0}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-base">
              <input
                type="checkbox"
                name="requiresFollowUp"
                defaultChecked={current?.requiresFollowUp ?? true}
                className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
              />
              Requires a follow-up call
            </label>

            <label className="flex items-center gap-2 text-sm text-base">
              <input
                type="checkbox"
                name="isTerminal"
                defaultChecked={current?.isTerminal ?? false}
                className="h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
              />
              Closes the enquiry
            </label>
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <SubmitButton label={current ? 'Save changes' : 'Add entry'} />
      </div>
    </form>
  )
}
