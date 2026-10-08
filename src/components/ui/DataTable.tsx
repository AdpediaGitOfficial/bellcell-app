import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Density } from '@/lib/table/density'
import { nextSort, tableHref, type TableParams } from '@/lib/table/params'

export interface Column<Row> {
  key: string
  header: string
  cell: (row: Row) => React.ReactNode
  /** Only allow-listed keys are sortable; see parseTableParams. */
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  /** Tailwind width utility, e.g. 'w-40'. */
  width?: string
  /** Hide below this breakpoint to keep narrow screens readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

const HIDE = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const

/**
 * The workhorse of the application — ~50 of the ~55 screens are a list.
 *
 * Deliberate choices (see docs/design-system.md §5.1):
 *   * Sticky header AND sticky first column, because student-name is the
 *     anchor when scrolling a wide fee table sideways.
 *   * Row separators, not zebra striping — striping fights status badges.
 *   * Density is server-rendered from a cookie, so there is no layout flash.
 *   * Sorting is a plain <Link>, so it works without JavaScript and every
 *     sorted view is a real, shareable URL.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  params,
  basePath,
  density = 'comfortable',
  stickyFirstColumn = false,
  rowHref,
  empty,
}: {
  columns: Column<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
  params: TableParams
  basePath: string
  density?: Density
  stickyFirstColumn?: boolean
  rowHref?: (row: Row) => string
  empty?: React.ReactNode
}) {
  const cellY = density === 'compact' ? 'py-1.5' : 'py-2.5'
  const textSize = density === 'compact' ? 'text-[13px]' : 'text-sm'

  if (rows.length === 0 && empty) {
    return <div className="px-5 py-12">{empty}</div>
  }

  return (
    <div className="scroll-slim w-full overflow-x-auto">
      <table className={cn('w-full border-collapse', textSize)}>
        <thead>
          <tr className="border-b border-[rgb(var(--border-base))]">
            {columns.map((col, i) => {
              const sticky = stickyFirstColumn && i === 0
              const isSorted = params.sort === col.key
              const head = (
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable &&
                    (isSorted ? (
                      params.dir === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      )
                    ) : (
                      <ChevronsUpDown
                        className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50"
                        aria-hidden
                      />
                    ))}
                </span>
              )

              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    col.sortable
                      ? isSorted
                        ? params.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap bg-[rgb(var(--surface-card))] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted',
                    ALIGN[col.align ?? 'left'],
                    col.width,
                    col.hideBelow && HIDE[col.hideBelow],
                    sticky && 'left-0 z-20',
                  )}
                >
                  {col.sortable ? (
                    <Link
                      href={tableHref(basePath, params, nextSort(params, col.key))}
                      className="group inline-flex items-center gap-1 hover:text-strong"
                    >
                      {head}
                    </Link>
                  ) : (
                    head
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row)
            return (
              <tr
                key={getRowKey(row)}
                className="border-b border-[rgb(var(--border-base))] last:border-0 hover:bg-[rgb(var(--surface-hover))]"
              >
                {columns.map((col, i) => {
                  const sticky = stickyFirstColumn && i === 0
                  const content = col.cell(row)
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 align-middle',
                        cellY,
                        ALIGN[col.align ?? 'left'],
                        col.hideBelow && HIDE[col.hideBelow],
                        sticky &&
                          'sticky left-0 bg-[rgb(var(--surface-card))] font-medium text-strong',
                        col.className,
                      )}
                    >
                      {/* Only the first cell carries the row link, so the row
                          stays keyboard-navigable without nesting links. */}
                      {href && i === 0 ? (
                        <Link href={href} className="hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
