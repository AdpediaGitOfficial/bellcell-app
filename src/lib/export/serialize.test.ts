import { describe, expect, it } from 'vitest'
import { exportFilename, toCsv, type ExportColumn } from './serialize'

interface Row {
  name: string
  phone: string
  amount: number
}

const columns: ExportColumn<Row>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Amount', value: (r) => r.amount },
]

describe('toCsv', () => {
  it('writes a header and rows with CRLF endings and a BOM', () => {
    const csv = toCsv([{ name: 'Anjali', phone: '9876543210', amount: 1500 }], columns)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Name,Phone,Amount\r\n')
    expect(csv).toContain('Anjali,9876543210,1500')
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    const csv = toCsv([{ name: 'Nair, Anjali', phone: 'a"b', amount: 0 }], columns)
    expect(csv).toContain('"Nair, Anjali"')
    expect(csv).toContain('"a""b"')
  })

  it('neutralises CSV injection from a user-entered name', () => {
    // A student named by an attacker must not become a formula in Excel.
    const csv = toCsv([{ name: '=cmd|calc', phone: '+919', amount: 0 }], columns)
    expect(csv).toContain("'=cmd|calc")
    expect(csv).toContain("'+919")
  })

  it('renders null/undefined as empty, not "null"', () => {
    const cols: ExportColumn<{ v: string | null }>[] = [
      { header: 'V', value: (r) => r.v },
    ]
    expect(toCsv([{ v: null }], cols)).toContain('V\r\n\r\n')
  })
})

describe('exportFilename', () => {
  it('stamps the date and extension', () => {
    expect(exportFilename('enquiry-leads', 'csv')).toMatch(
      /^enquiry-leads-\d{4}-\d{2}-\d{2}\.csv$/,
    )
  })
})
