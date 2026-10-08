import 'server-only'
import { cookies } from 'next/headers'

export type Density = 'comfortable' | 'compact'

const COOKIE = 'bellcell_density'

/**
 * Density is persisted per user in a cookie rather than localStorage, so the
 * server renders the right row height on first paint and admissions staff
 * doing bulk entry are not flashed a comfortable table before it shrinks.
 */
export async function getDensity(): Promise<Density> {
  const value = (await cookies()).get(COOKIE)?.value
  return value === 'compact' ? 'compact' : 'comfortable'
}

export const DENSITY_COOKIE = COOKIE
