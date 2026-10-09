'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { saveLeaveTypeAction, type LeaveTypeState } from './actions'

export interface LeaveTypeRow {
  id: string
  code: string
  name: string
  isPaid: boolean
  annualEntitlementDays: string
  allowCarryForward: boolean
  carryForwardCapDays: string
  requiresApproval: boolean
  sortOrder: number
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  )
}

export function LeaveTypeEditor({ type }: { type?: LeaveTypeRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {type ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${type.name}`}
          className="rounded-md p-1.5 text-faint hover:bg-[rgb(var(--surface-hover))] hover:text-strong"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add leave type
        </Button>
      )}
      {open && <Dialog type={type} onClose={() => setOpen(false)} />}
    </>
  )
}

function Dialog({ type, onClose }: { type?: LeaveTypeRow; onClose: () => void }) {
  const [state, formAction] = useActionState<LeaveTypeState, FormData>(
    saveLeaveTypeAction,
    {},
  )
  const [carry, setCarry] = useState(type?.allowCarryForward ?? false)
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.ok) {
      onClose()
      return
    }
    if (state.values?.name !== undefined && nameRef.current) {
      nameRef.current.value = state.values.name
    }
    if (state.values?.code !== undefined && codeRef.current) {
      codeRef.current.value = state.values.code
    }
  }, [state, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={type ? 'Edit leave type' : 'Add leave type'}
    >
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="animate-fade-in surface-card relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card p-5 shadow-popover">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-strong">
            {type ? 'Edit leave type' : 'Add leave type'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="rounded p-1 text-faint hover:text-strong"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form action={formAction} className="space-y-4">
          {state.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-critical-50 px-3 py-2 text-sm text-critical-700 dark:bg-critical-500/10 dark:text-critical-500"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          )}

          <input type="hidden" name="id" value={type?.id ?? ''} />

          <div className="grid gap-4 sm:grid-cols-2">
            {!type && (
              <Field label="Code" htmlFor="lt-code" required hint="Short, e.g. CL.">
                <Input ref={codeRef} id="lt-code" name="code" required maxLength={20} />
              </Field>
            )}
            <Field label="Name" htmlFor="lt-name" required>
              <Input
                ref={nameRef}
                id="lt-name"
                name="name"
                defaultValue={type?.name ?? ''}
                required
                autoFocus
              />
            </Field>
            <Field
              label="Days per year"
              htmlFor="lt-entitlement"
              hint="Zero means uncapped — what loss of pay normally wants."
            >
              <Input
                id="lt-entitlement"
                name="annualEntitlementDays"
                type="number"
                step="0.5"
                min={0}
                max={365}
                defaultValue={type?.annualEntitlementDays ?? '0'}
              />
            </Field>
            <Field label="Sort order" htmlFor="lt-sort">
              <Input
                id="lt-sort"
                name="sortOrder"
                type="number"
                defaultValue={type?.sortOrder ?? 0}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-sm text-base">
            <input
              type="checkbox"
              name="isPaid"
              defaultChecked={type?.isPaid ?? true}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
            />
            <span>
              Paid
              <span className="block text-xs text-muted">
                This single flag decides whether an approved day of this type
                costs the employee money. Unticked, every day is a salary
                deduction.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-base">
            <input
              type="checkbox"
              name="requiresApproval"
              defaultChecked={type?.requiresApproval ?? true}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
            />
            <span>
              Needs approval
              <span className="block text-xs text-muted">
                Unticked, recording it approves it in the same step.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-base">
            <input
              type="checkbox"
              name="allowCarryForward"
              defaultChecked={carry}
              onChange={(e) => setCarry(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--border-strong))] text-brand-700 focus:ring-brand-500"
            />
            <span>
              Unused days carry into next year
              <span className="block text-xs text-muted">
                Only when someone runs carry-forward; it never happens by
                itself.
              </span>
            </span>
          </label>

          {carry && (
            <Field
              label="Carry-forward cap (days)"
              htmlFor="lt-cap"
              hint="Zero means no cap. The cap applies to the carried amount, not the resulting total."
            >
              <Input
                id="lt-cap"
                name="carryForwardCapDays"
                type="number"
                step="0.5"
                min={0}
                max={365}
                defaultValue={type?.carryForwardCapDays ?? '0'}
              />
            </Field>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Submit label={type ? 'Save changes' : 'Add leave type'} />
          </div>
        </form>
      </div>
    </div>
  )
}
