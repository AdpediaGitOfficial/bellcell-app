import { describe, expect, it } from 'vitest'
import { mapHeaders, normalisePhone, parseCsv } from './csv'

describe('parseCsv', () => {
  it('parses a simple file', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles quoted cells containing commas and newlines', () => {
    expect(parseCsv('name,note\n"Nair, A","line1\nline2"')).toEqual([
      ['name', 'note'],
      ['Nair, A', 'line1\nline2'],
    ])
  })

  it('handles escaped quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('handles CRLF and strips a BOM', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops blank trailing lines', () => {
    expect(parseCsv('a\n1\n\n\n')).toEqual([['a'], ['1']])
  })
})

describe('mapHeaders', () => {
  const aliases = {
    name: ['name', 'full name', 'student name'],
    phone: ['phone', 'mobile', 'phone no'],
  }

  it('matches regardless of case, spacing and punctuation', () => {
    expect(mapHeaders(['Full Name', 'Phone No.'], aliases)).toEqual({
      name: 0,
      phone: 1,
    })
  })

  it('omits fields that are absent', () => {
    expect(mapHeaders(['Mobile'], aliases)).toEqual({ phone: 0 })
  })
})

describe('normalisePhone', () => {
  it('accepts the formats people actually paste', () => {
    expect(normalisePhone('9876543210')).toBe('9876543210')
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210')
    expect(normalisePhone('091-9876543210')).toBe('9876543210')
    expect(normalisePhone('09876543210')).toBe('9876543210')
    expect(normalisePhone('0091 9876543210')).toBe('9876543210')
    expect(normalisePhone('+91-98765-43210')).toBe('9876543210')
  })

  it('rejects anything that is not a 10-digit number', () => {
    expect(normalisePhone('12345')).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('abcdefghij')).toBeNull()
  })
})
