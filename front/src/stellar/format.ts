/** Amounts are i128 stroops of a 7-decimal token; times are unix seconds. */

export const UNIT = 10_000_000n

export function usdc(amount: bigint, opts: { decimals?: number; unit?: boolean } = {}): string {
  const { decimals = 2, unit = true } = opts
  const neg = amount < 0n
  // Round half up to the shown precision (Blend leaves 209.9999999 after rounding its shares).
  const step = 10n ** BigInt(7 - decimals)
  const abs = (((neg ? -amount : amount) + step / 2n) / step) * step
  const whole = abs / UNIT
  const frac = (abs % UNIT).toString().padStart(7, '0').slice(0, decimals)
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '−' : ''}${grouped}${decimals ? '.' + frac : ''}${unit ? ' USDC' : ''}`
}

export const toUnits = (value: string): bigint => {
  const [w, f = ''] = value.trim().replace(',', '.').split('.')
  return BigInt(w || '0') * UNIT + BigInt((f + '0000000').slice(0, 7))
}

export const toNumber = (amount: bigint) => Number(amount) / 1e7

/** "1 min", "30 days": lease durations, which are parameters (demo mode uses minutes). */
export function duration(seconds: number | bigint): string {
  const s = Number(seconds)
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'min'],
  ]
  for (const [n, label] of units) {
    if (s >= n && s % n === 0) {
      const v = s / n
      return `${v} ${label}${v > 1 && label !== 'min' ? 's' : ''}`
    }
  }
  return `${s} s`
}

/** Live countdown text: "in 42 s", "3 min ago". */
export function relative(at: number, now: number): string {
  const d = at - now
  const a = Math.abs(d)
  const txt =
    a < 60 ? `${a} s` : a < 3600 ? `${Math.floor(a / 60)} min ${a % 60 ? `${a % 60} s` : ''}`.trim() : a < 172800 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} days`
  if (d === 0) return 'now'
  return d > 0 ? `in ${txt}` : `${txt} ago`
}

export function clock(at: number): string {
  const d = new Date(at * 1000)
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
