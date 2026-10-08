import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tableHref, totalPages, type TableParams } from '@/lib/table/params'

export function Pagination({
  params,
  basePath,
  totalRows,
}: {
  params: TableParams
  basePath: string
  totalRows: number
}) {
  const pages = totalPages(totalRows, params.pageSize)
  const from = totalRows === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const to = Math.min(params.page * params.pageSize, totalRows)

  const prevDisabled = params.page <= 1
  const nextDisabled = params.page >= pages

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--border-base))] px-5 py-3">
      <p className="numeric text-xs text-muted">
        {totalRows === 0
          ? 'No records'
          : `Showing ${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')} of ${totalRows.toLocaleString('en-IN')}`}
      </p>

      <div className="flex items-center gap-1">
        <PageLink
          href={tableHref(basePath, params, { page: params.page - 1 })}
          disabled={prevDisabled}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </PageLink>
        <span className="numeric px-2 text-xs text-muted">
          Page {params.page} of {pages}
        </span>
        <PageLink
          href={tableHref(basePath, params, { page: params.page + 1 })}
          disabled={nextDisabled}
          label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PageLink>
      </div>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  const classes = cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgb(var(--border-base))]',
    disabled
      ? 'cursor-not-allowed text-faint opacity-50'
      : 'text-muted hover:bg-[rgb(var(--surface-hover))] hover:text-strong',
  )

  if (disabled) {
    return (
      <span className={classes} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className={classes} aria-label={label}>
      {children}
    </Link>
  )
}
