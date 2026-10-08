import 'server-only'
import type { NotificationChannel } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Notification dispatch.
 *
 * The scope promises Email/SMS "as and when required" but names no gateway.
 * Until one is chosen (docs/open-questions.md #6), this records what WOULD be
 * sent and marks it SKIPPED, so:
 *   * the screens behave exactly as they will once a gateway is wired in,
 *   * the institute can see the message volume it is about to pay for, and
 *   * nothing is silently lost.
 *
 * For SMS in India, DLT sender-ID and template registration must be completed
 * in Bell Cell's own name before any transactional message will be delivered.
 */
export async function queueNotification(input: {
  channel: NotificationChannel
  template: string
  recipient: string | null
  subject?: string
  body: string
  studentId?: string | null
  relatedType?: string
  relatedId?: string
}): Promise<void> {
  const enabled =
    input.channel === 'EMAIL'
      ? process.env.NOTIFY_EMAIL_ENABLED === 'true'
      : process.env.NOTIFY_SMS_ENABLED === 'true'

  if (!input.recipient) {
    await db.notificationLog.create({
      data: {
        channel: input.channel,
        status: 'FAILED',
        template: input.template,
        recipient: '',
        subject: input.subject ?? null,
        body: input.body,
        studentId: input.studentId ?? null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        errorText: 'No contact details on the student record',
      },
    })
    return
  }

  await db.notificationLog.create({
    data: {
      channel: input.channel,
      // No gateway configured yet — recorded, not sent.
      status: enabled ? 'QUEUED' : 'SKIPPED',
      template: input.template,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body,
      studentId: input.studentId ?? null,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      errorText: enabled ? null : 'No notification gateway configured',
    },
  })
}
