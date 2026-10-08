import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every page in the (app) group must authorise itself.
 *
 * This exists because it already went wrong: seventeen list pages shipped
 * with no permission check at all, relying on the sidebar to hide them. A
 * test is the only thing that makes "add the guard" unforgettable.
 */
const ROOT = join(process.cwd(), 'src/app/(app)')

/**
 * Pages that legitimately need no resource check, with the reason. Adding to
 * this list is a deliberate, reviewable act.
 */
const EXEMPT: Record<string, string> = {
  '[...slug]/page.tsx':
    'Catch-all placeholder for screens that are not built yet; it shows no data.',
}

function pages(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...pages(full, prefix ? `${prefix}/${entry}` : entry))
    } else if (entry === 'page.tsx') {
      out.push(prefix ? `${prefix}/${entry}` : entry)
    }
  }
  return out
}

describe('(app) page guards', () => {
  const found = pages(ROOT)

  it('finds the pages at all', () => {
    expect(found.length).toBeGreaterThan(40)
  })

  it.each(found)('%s authorises itself', (rel) => {
    if (rel in EXEMPT) return
    const source = readFileSync(join(ROOT, rel), 'utf8')
    expect(
      source.includes('requirePageUser('),
      `${rel} must call requirePageUser(resource) — see src/lib/auth/guard.ts`,
    ).toBe(true)
  })

  it('every exemption still exists', () => {
    for (const rel of Object.keys(EXEMPT)) expect(found).toContain(rel)
  })
})
