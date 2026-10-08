'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { recordAudit } from '@/lib/audit'

/**
 * Generic master CRUD.
 *
 * The 19 masters are structurally identical — a name, sometimes a couple of
 * flags, add/edit/archive. One pair of actions serves all of them rather than
 * 19 near-copies.
 *
 * Masters are ARCHIVED, never deleted (ADR-008): deleting the course a 2019
 * graduate was admitted to rewrites history.
 */

export type MasterKind = 'enquiryCallStatus' | 'enquirySource' | 'department'

const CONFIG = {
  enquiryCallStatus: {
    label: 'Enquiry call status',
    path: '/masters/enquiry-call-status',
    model: 'enquiryCallStatus',
  },
  enquirySource: {
    label: 'Nature of enquiry',
    path: '/masters/enquiry-source',
    model: 'enquirySource',
  },
  department: {
    label: 'Department',
    path: '/masters/departments',
    model: 'department',
  },
} as const satisfies Record<MasterKind, { label: string; path: string; model: string }>

const schema = z.object({
  id: z.string().optional().or(z.literal('')),
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: z.string().trim().max(20).optional(),
  requiresFollowUp: z.string().optional(),
  isTerminal: z.string().optional(),
  sortOrder: z.string().optional(),
})

export interface MasterState {
  error?: string
  /** Set on a successful save, so the editor knows it may close. */
  ok?: boolean
  /**
   * What was submitted, echoed back on a refusal. React resets an
   * uncontrolled form once its action settles, so without this the typist
   * loses everything they entered the moment the server says no.
   */
  values?: { name?: string; code?: string }
}

export async function saveMasterAction(
  kind: MasterKind,
  _prev: MasterState,
  formData: FormData,
): Promise<MasterState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  assertCan(user, 'masters', id ? 'update' : 'create')

  const submitted = {
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
  }

  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid details',
      values: submitted,
    }
  }

  const cfg = CONFIG[kind]
  const { name } = parsed.data

  const extra =
    kind === 'enquiryCallStatus'
      ? {
          requiresFollowUp: parsed.data.requiresFollowUp === 'on',
          isTerminal: parsed.data.isTerminal === 'on',
          sortOrder: Number.parseInt(parsed.data.sortOrder ?? '0', 10) || 0,
        }
      : {}

  // A department's code is set once. It is what a printed staff list is
  // sorted by, so renaming it later would silently reorder old paperwork.
  if (kind === 'department' && !id) {
    const code = (parsed.data.code ?? '').toUpperCase()
    if (!code) {
      return { error: 'A department needs a short code.', values: submitted }
    }
    Object.assign(extra, { code })
  }

  try {
    if (id) {
      // @ts-expect-error — delegate chosen by a validated key, not user input
      await db[cfg.model].update({ where: { id }, data: { name, ...extra } })
    } else {
      // @ts-expect-error — as above
      await db[cfg.model].create({ data: { name, ...extra } })
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // For a coded master the collision may be on the code, not the name.
      const target = (error.meta?.target as string[] | undefined)?.join(', ')
      return {
        error: target?.includes('code')
          ? 'That code is already used by another entry.'
          : `"${name}" already exists.`,
        values: submitted,
      }
    }
    throw error
  }

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: id ? 'UPDATE' : 'CREATE',
    entityType: cfg.model,
    entityId: id || undefined,
    summary: `${id ? 'Updated' : 'Added'} ${cfg.label.toLowerCase()} "${name}"`,
  })

  revalidatePath(cfg.path)
  return { ok: true }
}

export async function archiveMasterAction(
  kind: MasterKind,
  formData: FormData,
): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'delete')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const cfg = CONFIG[kind]
  // @ts-expect-error — delegate chosen by a validated key, not user input
  const row = await db[cfg.model].update({
    where: { id },
    data: { archivedAt: new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'ARCHIVE',
    entityType: cfg.model,
    entityId: id,
    summary: `Archived ${cfg.label.toLowerCase()} "${(row as { name: string }).name}"`,
  })

  revalidatePath(cfg.path)
}

export async function restoreMasterAction(
  kind: MasterKind,
  formData: FormData,
): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'masters', 'update')

  const id = String(formData.get('id') ?? '')
  if (!id) return

  const cfg = CONFIG[kind]
  // @ts-expect-error — delegate chosen by a validated key, not user input
  await db[cfg.model].update({ where: { id }, data: { archivedAt: null } })

  await recordAudit({
    userId: user.id,
    branchId: user.activeBranchId,
    action: 'RESTORE',
    entityType: cfg.model,
    entityId: id,
    summary: `Restored ${cfg.label.toLowerCase()}`,
  })

  revalidatePath(cfg.path)
}
