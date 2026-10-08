import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * The lockup's "Group of institutions" line is charcoal (#282828), which is
 * all but invisible on a dark sidebar. We ship a recoloured variant and swap
 * on theme rather than filtering, so the brand teal is never distorted.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/brand/bellcell-logo.png"
        alt="Bell Cell Group of Institutions"
        width={1263}
        height={367}
        priority
        className={cn('object-contain dark:hidden', className)}
      />
      <Image
        src="/brand/bellcell-logo-dark.png"
        alt=""
        aria-hidden
        width={1263}
        height={367}
        priority
        className={cn('hidden object-contain dark:block', className)}
      />
    </>
  )
}
