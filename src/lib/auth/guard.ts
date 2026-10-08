import 'server-only'
import { notFound } from 'next/navigation'
import { can } from '@/lib/rbac/can'
import type { Action, Resource } from '@/lib/rbac/resources'
import { requireUser, type CurrentUser } from './current-user'

/**
 * The guard every page in the (app) group starts with.
 *
 * A browser pass found that detail pages checked `can(...)` but most LIST
 * pages did not — so a FACULTY account could open the whole staff directory
 * by typing the URL, even though the sidebar never offered it. Hiding a nav
 * item is not access control.
 *
 * One helper, used by every page, so the check cannot be the thing someone
 * forgets. `src/app/(app)/guards.test.ts` fails the build if a page skips it.
 *
 * `notFound()` rather than a "forbidden" screen: a 404 does not confirm that
 * the record or screen exists.
 */
export async function requirePageUser(
  resource: Resource,
  action: Action = 'view',
): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user, resource, action)) notFound()
  return user
}
