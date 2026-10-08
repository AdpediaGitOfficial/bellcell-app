import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Construction } from 'lucide-react'
import { requireUser } from '@/lib/auth/current-user'
import { canView } from '@/lib/rbac/can'
import { NAV } from '@/lib/nav'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/shell/PageHeader'

export const metadata: Metadata = { title: 'Not built yet' }

/**
 * Catch-all for modules that are in the signed scope but not yet built.
 *
 * Next matches specific routes first, so this only ever receives paths with no
 * page of their own. A path that is in the navigation gets an honest "not
 * built yet" screen; anything else is a genuine 404.
 */
export default async function PlannedModulePage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const user = await requireUser()
  const { slug } = await params
  const path = `/${slug.join('/')}`

  const item = NAV.flatMap((g) => g.items).find((i) => i.href === path)
  if (!item) notFound()
  if (!canView(user, item.resource)) notFound()

  return (
    <>
      <PageHeader title={item.label} />
      <Card className="px-5 py-16">
        <EmptyState
          icon={<Construction className="h-5 w-5" aria-hidden />}
          title={`${item.label} is not built yet`}
          description="This screen is part of the agreed scope and is scheduled for a later milestone. The data model behind it already exists, so nothing is lost by using the rest of the system now."
          action={
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                Back to dashboard
              </Button>
            </Link>
          }
        />
      </Card>
    </>
  )
}
