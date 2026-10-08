import 'server-only'
import type { AuditAction } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Append-only audit trail. Called from every Server Action that writes.
 * Deliberately swallows its own errors: an audit failure must never roll back
 * the user's work, but it is logged loudly so it gets noticed.
 */
export async function recordAudit(input: {
  userId?: string | null
  branchId?: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  summary: string
  before?: unknown
  after?: unknown
  ipAddress?: string | null
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        branchId: input.branchId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ipAddress: input.ipAddress ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to record audit entry', {
      entityType: input.entityType,
      action: input.action,
      error,
    })
  }
}
