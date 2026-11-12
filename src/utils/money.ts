// Money helpers. Amounts are numbers in major units (OMR has 3 decimals, other currencies 2).
// Rounding is half away from zero, the same as Postgres round(numeric, n), so a figure rounded in
// the browser equals the one the database stores. Binary float noise (1.0005 * 1000 =
// 1000.4999999999999) is removed before rounding.

/** Decimal places used for a currency (OMR, BHD, KWD, JOD: 3; others: 2). */
export function currencyDecimals(currency = 'OMR'): number {
  return ['OMR', 'BHD', 'KWD', 'JOD', 'TND', 'LYD', 'IQD'].includes(currency.toUpperCase()) ? 3 : 2;
}

/** Round half away from zero to `dp` decimals. -0 becomes 0. Non-finite input becomes 0. */
export function roundMoney(value: number, dp = 3): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** dp;
  const scaled = Number((Math.abs(value) * f).toPrecision(15));
  const r = (Math.sign(value) * Math.round(scaled)) / f;
  return r === 0 ? 0 : r;
}

/** Sum of amounts, rounded once at the end (no drift from rounding every step). */
export function sumMoney(values: Iterable<number | null | undefined>, dp = 3): number {
  let s = 0;
  for (const v of values) s += Number(v) || 0;
  return roundMoney(s, dp);
}

/** True when two amounts are equal at `dp` decimals. */
export function moneyEquals(a: number, b: number, dp = 3): boolean {
  return roundMoney(a - b, dp) === 0;
}
