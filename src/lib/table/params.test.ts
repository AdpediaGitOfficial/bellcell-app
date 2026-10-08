import { describe, expect, it } from 'vitest'
import { nextSort, parseTableParams, skipTake, tableHref, totalPages } from './params'

const opts = {
  allowedSorts: ['name', 'createdAt'] as const,
  defaultSort: 'createdAt',
  filterKeys: ['status', 'courseId'] as const,
}

describe('parseTableParams', () => {
  it('applies sane defaults', () => {
    const p = parseTableParams({}, opts)
    expect(p).toMatchObject({ page: 1, pageSize: 25, sort: 'createdAt', dir: 'desc', q: '' })
    expect(p.filters).toEqual({})
  })

  it('ignores a sort column that is not allow-listed', () => {
    // Prevents a crafted ?sort=passwordHash reaching Prisma's orderBy.
    expect(parseTableParams({ sort: 'passwordHash' }, opts).sort).toBe('createdAt')
    expect(parseTableParams({ sort: 'name' }, opts).sort).toBe('name')
  })

  it('drops unknown filter keys and keeps known ones', () => {
    const p = parseTableParams({ status: 'NEW', bogus: 'x' }, opts)
    expect(p.filters).toEqual({ status: 'NEW' })
  })

  it('clamps page size and rejects junk paging', () => {
    expect(parseTableParams({ pageSize: '9999' }, opts).pageSize).toBe(500)
    expect(parseTableParams({ page: '-3' }, opts).page).toBe(1)
    expect(parseTableParams({ page: 'abc' }, opts).page).toBe(1)
  })
})

describe('skipTake', () => {
  it('converts page/pageSize into Prisma skip/take', () => {
    const p = parseTableParams({ page: '3', pageSize: '50' }, opts)
    expect(skipTake(p)).toEqual({ skip: 100, take: 50 })
  })
})

describe('tableHref', () => {
  it('preserves existing params', () => {
    const p = parseTableParams({ q: 'nair', status: 'NEW' }, opts)
    const href = tableHref('/enquiry/leads', p)
    expect(href).toContain('q=nair')
    expect(href).toContain('status=NEW')
  })

  it('resets to page 1 when a filter changes', () => {
    const p = parseTableParams({ page: '7', q: 'nair' }, opts)
    expect(tableHref('/enquiry/leads', p, { status: 'LOST' })).not.toContain('page=')
  })

  it('keeps the page when paging explicitly', () => {
    const p = parseTableParams({ page: '7' }, opts)
    expect(tableHref('/enquiry/leads', p, { page: 8 })).toContain('page=8')
  })

  it('removes a param set to null', () => {
    const p = parseTableParams({ q: 'nair' }, opts)
    expect(tableHref('/enquiry/leads', p, { q: null })).not.toContain('q=')
  })
})

describe('nextSort', () => {
  it('starts ascending on a new column, then toggles', () => {
    const p = parseTableParams({ sort: 'createdAt', dir: 'desc' }, opts)
    expect(nextSort(p, 'name')).toEqual({ sort: 'name', dir: 'asc' })
    expect(nextSort(p, 'createdAt')).toEqual({ sort: 'createdAt', dir: 'asc' })
  })
})

describe('totalPages', () => {
  it('never returns zero, so pagination always renders', () => {
    expect(totalPages(0, 25)).toBe(1)
    expect(totalPages(25, 25)).toBe(1)
    expect(totalPages(26, 25)).toBe(2)
  })
})
