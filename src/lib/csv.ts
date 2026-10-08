/**
 * Minimal RFC 4180 CSV reader for bulk lead import.
 *
 * Hand-rolled rather than pulled in as a dependency because the input is a
 * small, well-defined file and a parser is easier to reason about than a
 * library's quirks when a row fails and we must tell the user which row.
 */

export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM, which Excel adds and which otherwise corrupts the
  // first header name.
  const text = input.replace(/^﻿/, '')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch === '\r') {
      // handled by the \n branch; CRLF and lone CR both work
      if (text[i + 1] !== '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      }
    } else {
      cell += ch
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // Drop trailing blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Normalise a header cell for tolerant matching ("Phone No." -> "phoneno"). */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Map a file's headers onto known fields, accepting the spellings people
 * actually use when they export from a listing site or a spreadsheet.
 */
export function mapHeaders(
  headers: string[],
  aliases: Record<string, readonly string[]>,
): Record<string, number> {
  const index: Record<string, number> = {}
  const normalised = headers.map(normaliseHeader)

  for (const [field, names] of Object.entries(aliases)) {
    for (const name of names) {
      const at = normalised.indexOf(normaliseHeader(name))
      if (at !== -1) {
        index[field] = at
        break
      }
    }
  }
  return index
}

/** Indian mobile numbers, tolerant of +91 / 0 prefixes and spacing. */
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '')

  // Strip trunk zeros first ("0", "00"), then the country code, in that
  // order — "091-98765 43210" carries both and is a format people paste.
  // Indian mobile numbers start 6-9, so no significant digit is lost.
  digits = digits.replace(/^0+/, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)

  return digits.length === 10 ? digits : null
}
