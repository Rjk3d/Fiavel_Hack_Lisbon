import type { ISODate } from './types'

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eurCents = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

export const formatEUR = (n: number) => (Number.isInteger(n) ? eur.format(n) : eurCents.format(n))

/** Parse YYYY-MM-DD as a calendar date (no timezone drift). */
export function parseDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

const opts = (o: Intl.DateTimeFormatOptions) => ({ timeZone: 'UTC', ...o })

export const formatDate = (d: ISODate) =>
  parseDate(d).toLocaleDateString('en-GB', opts({ day: 'numeric', month: 'short', year: 'numeric' }))

export const formatDateShort = (d: ISODate) =>
  parseDate(d).toLocaleDateString('en-GB', opts({ weekday: 'short', day: 'numeric', month: 'short' }))

export const formatDateLong = (d: ISODate) =>
  parseDate(d).toLocaleDateString('en-GB', opts({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))

export const formatMonth = (d: ISODate) => parseDate(d).toLocaleDateString('en-GB', opts({ month: 'long', year: 'numeric' }))

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = parseDate(d)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export function relativeDays(from: ISODate, to: ISODate): string {
  const n = daysBetween(from, to)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Parts for a calendar chip: { day: '1', month: 'Nov' }. */
export function dayMonth(d: ISODate) {
  const t = parseDate(d)
  return { day: String(t.getUTCDate()), month: t.toLocaleDateString('en-GB', opts({ month: 'short' })) }
}
