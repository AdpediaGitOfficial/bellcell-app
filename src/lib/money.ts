/**
 * Money handling.
 *
 * Every monetary value in this system is an integer number of PAISE.
 * Floating point rupees are banned: 0.1 + 0.2 !== 0.3, and a fee register
 * that drifts by a paisa per row will not reconcile against the Day Book.
 */

export const PAISE_PER_RUPEE = 100

/** Parse user input ("1,250.50", "1250", "₹1250.5") into paise. */
export function parseRupeesToPaise(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Invalid amount')
    return Math.round(input * PAISE_PER_RUPEE)
  }
  const cleaned = input.replace(/[₹,\s]/g, '').trim()
  if (cleaned === '') return 0
  if (!/^-?\d*\.?\d*$/.test(cleaned)) {
    throw new Error(`Invalid amount: ${input}`)
  }
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${input}`)
  return Math.round(value * PAISE_PER_RUPEE)
}

/** Format paise for display. Indian digit grouping (1,23,456.00). */
export function formatPaise(
  paise: number,
  options: { symbol?: boolean; decimals?: boolean } = {},
): string {
  const { symbol = true, decimals = true } = options
  const negative = paise < 0
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / PAISE_PER_RUPEE)
  const remainder = abs % PAISE_PER_RUPEE

  const grouped = groupIndian(rupees)
  const body = decimals
    ? `${grouped}.${remainder.toString().padStart(2, '0')}`
    : grouped

  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`
}

/**
 * Indian grouping: last three digits, then pairs.
 * 1234567 -> "12,34,567"
 */
export function groupIndian(value: number): string {
  const s = Math.trunc(Math.abs(value)).toString()
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${grouped},${last3}`
}

/**
 * Short form for dashboard tiles: 4860000000 paise -> "₹48.6L".
 * Institutes read lakhs and crores, not millions.
 */
export function formatPaiseShort(paise: number): string {
  const rupees = paise / PAISE_PER_RUPEE
  const abs = Math.abs(rupees)
  const sign = rupees < 0 ? '-' : ''
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)}Cr`
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)}L`
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`
  return `${sign}₹${trim(abs)}`
}

function trim(n: number): string {
  return n
    .toFixed(1)
    .replace(/\.0$/, '')
}

/** Outstanding on an instalment. Never stored - always derived. */
export function balancePaise(inst: {
  duePaise: number
  concessionPaise: number
  lateFeePaise: number
  paidPaise: number
}): number {
  return Math.max(
    0,
    inst.duePaise + inst.lateFeePaise - inst.concessionPaise - inst.paidPaise,
  )
}

/** Late fee for an overdue instalment, honouring grace days and the cap. */
export function lateFeeFor(
  dueDate: Date,
  asOf: Date,
  policy: { graceDays: number; lateFeePerDayPaise: number; lateFeeMaxPaise: number },
): number {
  if (policy.lateFeePerDayPaise <= 0) return 0
  const msPerDay = 24 * 60 * 60 * 1000
  const daysLate = Math.floor(
    (startOfDay(asOf).getTime() - startOfDay(dueDate).getTime()) / msPerDay,
  )
  const chargeable = daysLate - policy.graceDays
  if (chargeable <= 0) return 0
  const fee = chargeable * policy.lateFeePerDayPaise
  return policy.lateFeeMaxPaise > 0 ? Math.min(fee, policy.lateFeeMaxPaise) : fee
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
