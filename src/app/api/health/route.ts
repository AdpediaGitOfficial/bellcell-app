import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Liveness and readiness in one endpoint.
 *
 * A load balancer needs to know whether to send traffic here, and "the
 * Node process is up" is not the same question as "the app works" — the
 * usual failure is a running app whose database has gone away. So this
 * actually touches Postgres.
 *
 * Deliberately unauthenticated and deliberately uninformative: it reports
 * up or down and how long the query took, and nothing about versions,
 * schema or configuration that would help someone probing the host.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const started = Date.now()

  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    // The reason is logged where operators can see it, not returned.
    console.error('[health] database unreachable')
    return NextResponse.json(
      { status: 'down', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    { status: 'ok', database: 'ok', latencyMs: Date.now() - started },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
