/**
 * Export serialisers.
 *
 * The scope promises "export functionality to different formats (PDF, excel,
 * word, etc.)" on most reports. CSV and XLSX are implemented here; PDF is
 * handled by the browser's print stylesheet for documents that have a defined
 * layout (receipts, TCs), and a server-side PDF renderer is a separate piece
 * of work tracked in docs/open-questions.md #12.
 */

export interface ExportColumn<Row> {
  header: string
  value: (row: Row) => string | number | null | undefined
}

/** RFC 4180 quoting. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Prefixing
  // with a single quote neutralises CSV injection from user-entered names.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`
  return guarded
}

export function toCsv<Row>(rows: Row[], columns: ExportColumn<Row>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))
  // BOM so Excel opens UTF-8 names (Malayalam/Tamil) correctly.
  return `﻿${[head, ...body].join('\r\n')}\r\n`
}

export async function toXlsx<Row>(
  rows: Row[],
  columns: ExportColumn<Row>[],
  sheetName = 'Export',
): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Bell Cell EduSuite'
  wb.created = new Date()

  const ws = wb.addWorksheet(sheetName.slice(0, 31))
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.min(Math.max(c.header.length + 4, 12), 40),
  }))

  for (const row of rows) {
    ws.addRow(columns.map((c) => c.value(row) ?? ''))
  }

  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE6F6F5' },
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

export function exportFilename(base: string, format: 'csv' | 'xlsx'): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${base}-${stamp}.${format}`
}
