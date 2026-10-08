'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/current-user'
import { assertCan } from '@/lib/rbac/can'
import { NoBranchSelectedError, branchScope, writeBranchId } from '@/lib/branch'
import { recordAudit } from '@/lib/audit'
import { mapHeaders, normalisePhone, parseCsv } from '@/lib/csv'

const BASE = '/enquiry/leads'

const leadSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z
    .string()
    .trim()
    .transform((v) => normalisePhone(v))
    .refine((v): v is string => v !== null, 'Enter a valid 10-digit mobile number'),
  altPhone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  courseId: z.string().trim().optional().or(z.literal('')),
  sourceId: z.string().trim().optional().or(z.literal('')),
  callStatusId: z.string().trim().optional().or(z.literal('')),
  assignedToId: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  nextCallAt: z.string().trim().optional().or(z.literal('')),
})

export interface FormState {
  error?: string
  fieldErrors?: Record<string, string>
}

function orNull(v: string | undefined): string | null {
  return v && v !== '' ? v : null
}

function parseDate(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function saveLeadAction(
  leadId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser()
  assertCan(user, 'enquiry.lead', leadId ? 'update' : 'create')

  const parsed = leadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Please correct the highlighted fields.', fieldErrors }
  }

  const d = parsed.data
  const data = {
    name: d.name,
    phone: d.phone,
    altPhone: orNull(d.altPhone),
    email: orNull(d.email),
    city: orNull(d.city),
    courseId: orNull(d.courseId),
    sourceId: orNull(d.sourceId),
    callStatusId: orNull(d.callStatusId),
    assignedToId: orNull(d.assignedToId),
    notes: orNull(d.notes),
    nextCallAt: parseDate(d.nextCallAt),
  }

  try {
    if (leadId) {
      const existing = await db.enquiryLead.findFirst({
        where: { id: leadId, ...branchScope(user) },
      })
      if (!existing) return { error: 'Lead not found in the current branch.' }

      const updated = await db.enquiryLead.update({ where: { id: leadId }, data })
      await recordAudit({
        userId: user.id,
        branchId: existing.branchId,
        action: 'UPDATE',
        entityType: 'EnquiryLead',
        entityId: leadId,
        summary: `Updated lead ${updated.name} (${updated.phone})`,
        before: existing,
        after: updated,
      })
    } else {
      const created = await db.enquiryLead.create({
        data: {
          ...data,
          branchId: writeBranchId(user, String(formData.get('branchId') ?? '')),
        },
      })
      await recordAudit({
        userId: user.id,
        branchId: created.branchId,
        action: 'CREATE',
        entityType: 'EnquiryLead',
        entityId: created.id,
        summary: `Added lead ${created.name} (${created.phone})`,
        after: created,
      })
    }
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return {
        error: 'Choose which branch this lead belongs to.',
        fieldErrors: { branchId: 'Required while viewing all branches' },
      }
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // @@unique([branchId, phone]) — the dedupe rule bulk import relies on.
      return {
        error: 'A lead with this phone number already exists in this branch.',
        fieldErrors: { phone: 'Already present in this branch' },
      }
    }
    throw error
  }

  revalidatePath(BASE)
  redirect(BASE)
}

/** Log a call against a lead and schedule the next one. */
export async function logLeadCallAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.lead', 'update')

  const leadId = String(formData.get('leadId') ?? '')
  const callStatusId = orNull(String(formData.get('callStatusId') ?? ''))
  const remarks = orNull(String(formData.get('remarks') ?? ''))
  const nextCallAt = parseDate(String(formData.get('nextCallAt') ?? ''))

  const lead = await db.enquiryLead.findFirst({
    where: { id: leadId, ...branchScope(user) },
  })
  if (!lead) return

  await db.$transaction([
    db.enquiryFollowUp.create({
      data: {
        leadId: lead.id,
        callStatusId,
        calledById: user.id,
        remarks,
        nextCallAt,
      },
    }),
    db.enquiryLead.update({
      where: { id: lead.id },
      data: {
        callStatusId: callStatusId ?? lead.callStatusId,
        lastCalledAt: new Date(),
        callCount: { increment: 1 },
        nextCallAt,
      },
    }),
  ])

  await recordAudit({
    userId: user.id,
    branchId: lead.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'EnquiryLead',
    entityId: lead.id,
    summary: `Logged call for lead ${lead.name}`,
  })

  revalidatePath(BASE)
}

/**
 * Promote a lead to a qualified Enquiry.
 *
 * Done in one transaction so a lead can never be marked converted without the
 * enquiry existing, and the enquiry number is allocated inside it.
 */
export async function convertLeadAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.lead', 'update')
  assertCan(user, 'enquiry.enquiry', 'create')

  const leadId = String(formData.get('leadId') ?? '')

  const lead = await db.enquiryLead.findFirst({
    where: { id: leadId, ...branchScope(user), convertedEnquiryId: null },
  })
  if (!lead) return

  const enquiry = await db.$transaction(async (tx) => {
    const count = await tx.enquiry.count({ where: { branchId: lead.branchId } })
    const created = await tx.enquiry.create({
      data: {
        branchId: lead.branchId,
        enquiryNo: `ENQ${String(count + 1).padStart(4, '0')}`,
        name: lead.name,
        phone: lead.phone,
        altPhone: lead.altPhone,
        email: lead.email,
        city: lead.city,
        courseId: lead.courseId,
        sourceId: lead.sourceId,
        callStatusId: lead.callStatusId,
        assignedToId: lead.assignedToId ?? user.id,
        stage: 'CONTACTED',
        nextCallAt: lead.nextCallAt,
        lastCalledAt: lead.lastCalledAt,
        callCount: lead.callCount,
      },
    })

    await tx.enquiryLead.update({
      where: { id: lead.id },
      data: { convertedEnquiryId: created.id, convertedAt: new Date() },
    })

    return created
  })

  await recordAudit({
    userId: user.id,
    branchId: lead.branchId,
    action: 'STATUS_CHANGE',
    entityType: 'EnquiryLead',
    entityId: lead.id,
    summary: `Converted lead ${lead.name} to enquiry ${enquiry.enquiryNo}`,
  })

  revalidatePath(BASE)
  redirect(`/enquiry/enquiries/${enquiry.id}`)
}

export async function archiveLeadAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user, 'enquiry.lead', 'delete')

  const leadId = String(formData.get('leadId') ?? '')
  const lead = await db.enquiryLead.findFirst({
    where: { id: leadId, ...branchScope(user) },
  })
  if (!lead) return

  // Archived, not deleted — a lead carries call history worth keeping.
  await db.enquiryLead.update({
    where: { id: lead.id },
    data: { archivedAt: new Date() },
  })

  await recordAudit({
    userId: user.id,
    branchId: lead.branchId,
    action: 'ARCHIVE',
    entityType: 'EnquiryLead',
    entityId: lead.id,
    summary: `Archived lead ${lead.name} (${lead.phone})`,
  })

  revalidatePath(BASE)
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

const HEADER_ALIASES = {
  name: ['name', 'full name', 'student name', 'lead name', 'candidate'],
  phone: ['phone', 'mobile', 'phone no', 'mobile no', 'contact', 'contact no'],
  altPhone: ['alt phone', 'alternate phone', 'phone 2', 'whatsapp'],
  email: ['email', 'email id', 'mail'],
  city: ['city', 'place', 'location', 'town'],
  course: ['course', 'course interested', 'programme', 'program'],
  notes: ['notes', 'remarks', 'comment', 'comments'],
} as const

export interface ImportState {
  error?: string
  result?: {
    total: number
    imported: number
    skipped: number
    problems: { row: number; reason: string }[]
  }
}

const MAX_IMPORT_ROWS = 5_000

export async function importLeadsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser()
  assertCan(user, 'enquiry.lead', 'create')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV file to import.' }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: 'File is larger than 5 MB. Split it and import in parts.' }
  }

  const sourceId = orNull(String(formData.get('sourceId') ?? ''))
  const assignedToId = orNull(String(formData.get('assignedToId') ?? ''))

  const rows = parseCsv(await file.text())
  if (rows.length < 2) {
    return { error: 'The file has a header row but no data rows.' }
  }

  const header = rows[0] ?? []
  const index = mapHeaders([...header], HEADER_ALIASES)

  if (index.phone === undefined) {
    return {
      error:
        'No phone column found. The file needs a column named Phone, Mobile or Contact No.',
    }
  }

  const body = rows.slice(1)
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      error: `This file has ${body.length.toLocaleString('en-IN')} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString('en-IN')} at a time.`,
    }
  }

  let branchId: string
  try {
    branchId = writeBranchId(user, String(formData.get('branchId') ?? ''))
  } catch (error) {
    if (error instanceof NoBranchSelectedError) {
      return {
        error:
          'Choose which branch these leads belong to — you are currently viewing all branches.',
      }
    }
    throw error
  }

  const courses = await db.course.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, code: true },
  })
  const courseByName = new Map(
    courses.flatMap((c) => [
      [c.name.toLowerCase(), c.id] as const,
      [c.code.toLowerCase(), c.id] as const,
    ]),
  )

  // Existing numbers in this branch, so duplicates are reported rather than
  // throwing one at a time.
  const existing = new Set(
    (
      await db.enquiryLead.findMany({
        where: { branchId },
        select: { phone: true },
      })
    ).map((l) => l.phone),
  )

  const batch = await db.leadImportBatch.create({
    data: {
      branchId,
      fileName: file.name,
      totalRows: body.length,
      importedById: user.id,
    },
  })

  const problems: { row: number; reason: string }[] = []
  const toCreate: Prisma.EnquiryLeadCreateManyInput[] = []
  const seenInFile = new Set<string>()

  body.forEach((row, i) => {
    const lineNo = i + 2 // 1-based, plus the header
    const cell = (field: keyof typeof HEADER_ALIASES): string =>
      (index[field] !== undefined ? (row[index[field]!] ?? '') : '').trim()

    const phone = normalisePhone(cell('phone'))
    if (!phone) {
      problems.push({ row: lineNo, reason: `Invalid phone "${cell('phone')}"` })
      return
    }
    if (existing.has(phone)) {
      problems.push({ row: lineNo, reason: `Duplicate — ${phone} already in this branch` })
      return
    }
    if (seenInFile.has(phone)) {
      problems.push({ row: lineNo, reason: `Duplicate within the file — ${phone}` })
      return
    }

    const name = cell('name') || `Lead ${phone}`
    const courseCell = cell('course').toLowerCase()

    seenInFile.add(phone)
    toCreate.push({
      branchId,
      name,
      phone,
      altPhone: cell('altPhone') || null,
      email: cell('email') || null,
      city: cell('city') || null,
      courseId: courseByName.get(courseCell) ?? null,
      sourceId,
      assignedToId,
      notes: cell('notes') || null,
      importBatchId: batch.id,
    })
  })

  if (toCreate.length > 0) {
    await db.enquiryLead.createMany({ data: toCreate, skipDuplicates: true })
  }

  await db.leadImportBatch.update({
    where: { id: batch.id },
    data: {
      importedRows: toCreate.length,
      skippedRows: problems.length,
      // Cap what we persist; the full list is shown on screen.
      errorReport: problems.slice(0, 500) as unknown as Prisma.InputJsonValue,
    },
  })

  await recordAudit({
    userId: user.id,
    branchId,
    action: 'BULK_IMPORT',
    entityType: 'EnquiryLead',
    entityId: batch.id,
    summary: `Imported ${toCreate.length} of ${body.length} leads from ${file.name}`,
  })

  revalidatePath(BASE)

  return {
    result: {
      total: body.length,
      imported: toCreate.length,
      skipped: problems.length,
      problems: problems.slice(0, 50),
    },
  }
}
