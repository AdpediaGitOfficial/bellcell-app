/**
 * URL-driven table state.
 *
 * Every list screen keeps page / sort / filters in the query string rather
 * than component state, so a filtered view can be bookmarked, shared with a
 * colleague, back-buttoned, and — importantly — handed to the export route
 * unchanged, which is how "export respects the filters" works without any
 * duplicated query logic.
 */

export type SortDir = 'asc' | 'desc'

export interface TableParams {
  page: number
  pageSize: number
  sort: string | null
  dir: SortDir
  q: string
  filters: Record<string, string>
}

export type SearchParams = Record<string, string | string[] | undefined>

export const PAGE_SIZES = [25, 50, 100, 200] as const
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 500

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function parseTableParams(
  searchParams: SearchParams,
  options: {
    /** Column keys that may be sorted on. Anything else is ignored. */
    allowedSorts: readonly string[]
    defaultSort?: string
    defaultDir?: SortDir
    /** Filter keys this screen understands. Unknown keys are dropped. */
    filterKeys?: readonly string[]
  },
): TableParams {
  const rawPage = Number.parseInt(first(searchParams.page) ?? '1', 10)
  const rawSize = Number.parseInt(first(searchParams.pageSize) ?? '', 10)

  const sortCandidate = first(searchParams.sort) ?? options.defaultSort ?? null
  const sort =
    sortCandidate && options.allowedSorts.includes(sortCandidate)
      ? sortCandidate
      : (options.defaultSort ?? null)

  const dirCandidate = first(searchParams.dir)
  const dir: SortDir =
    dirCandidate === 'asc' || dirCandidate === 'desc'
      ? dirCandidate
      : (options.defaultDir ?? 'desc')

  const filters: Record<string, string> = {}
  for (const key of options.filterKeys ?? []) {
    const value = first(searchParams[key])?.trim()
    if (value) filters[key] = value
  }

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize:
      Number.isFinite(rawSize) && rawSize > 0
        ? Math.min(rawSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE,
    sort,
    dir,
    q: (first(searchParams.q) ?? '').trim(),
    filters,
  }
}

export function skipTake(params: TableParams): { skip: number; take: number } {
  return {
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
  }
}

/** Build a href preserving current params, with overrides applied. */
export function tableHref(
  basePath: string,
  params: TableParams,
  overrides: Partial<Record<string, string | number | null>> = {},
): string {
  const sp = new URLSearchParams()

  if (params.q) sp.set('q', params.q)
  if (params.sort) sp.set('sort', params.sort)
  if (params.dir) sp.set('dir', params.dir)
  if (params.page > 1) sp.set('page', String(params.page))
  if (params.pageSize !== DEFAULT_PAGE_SIZE) {
    sp.set('pageSize', String(params.pageSize))
  }
  for (const [k, v] of Object.entries(params.filters)) sp.set(k, v)

  const overrideKeys = Object.keys(overrides)
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === '') sp.delete(k)
    else sp.set(k, String(v))
  }

  // Any change other than paging itself returns the user to page 1. Staying
  // on page 7 of a freshly filtered list is the classic "empty table" bug.
  const changesMoreThanPage = overrideKeys.some((k) => k !== 'page')
  if (changesMoreThanPage && !overrideKeys.includes('page')) sp.delete('page')

  const qs = sp.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Toggle helper for a sortable column header. */
export function nextSort(
  params: TableParams,
  columnKey: string,
): { sort: string; dir: SortDir } {
  if (params.sort !== columnKey) return { sort: columnKey, dir: 'asc' }
  return { sort: columnKey, dir: params.dir === 'asc' ? 'desc' : 'asc' }
}

export function totalPages(totalRows: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalRows / pageSize))
}
