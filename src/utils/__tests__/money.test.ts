import { describe, it, expect } from 'vitest';
import { roundMoney, sumMoney, moneyEquals, currencyDecimals } from '../money';
import { formatCurrency, roundToPrecision } from '../financial';

describe('roundMoney', () => {
  it('rounds half away from zero, like Postgres round(numeric, 3)', () => {
    expect(roundMoney(1.0005)).toBe(1.001);      // 1.0005 * 1000 is 1000.4999… in binary
    expect(roundMoney(-1.0005)).toBe(-1.001);    // the old Math.round version gave -1.000
    expect(roundMoney(2.675, 2)).toBe(2.68);
    expect(roundMoney(-2.675, 2)).toBe(-2.68);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('never returns -0 or NaN', () => {
    expect(Object.is(roundMoney(-0.0004), 0)).toBe(true);
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });
  it('keeps large amounts exact to 3 decimals', () => {
    expect(roundMoney(123456789.1234)).toBe(123456789.123);
    expect(roundMoney(99999999.9995)).toBe(100000000);
  });
});

describe('sumMoney / moneyEquals', () => {
  it('sums without drift and rounds once', () => {
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(sumMoney([0.0004, 0.0004, 0.0004])).toBe(0.001);
    expect(sumMoney([1, null, undefined, 2])).toBe(3);
  });
  it('compares at the currency precision', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(1.001, 1.002)).toBe(false);
  });
});

describe('formatting', () => {
  it('uses 3 decimals for OMR and 2 for USD', () => {
    expect(currencyDecimals('OMR')).toBe(3);
    expect(currencyDecimals('usd')).toBe(2);
    expect(formatCurrency(1234.5)).toBe('OMR 1,234.500');
    expect(formatCurrency(1234.5, 'USD')).toBe('USD 1,234.50');
  });
  it('shows a tiny negative as zero, not -0.000', () => {
    expect(formatCurrency(-0.0004)).toBe('OMR 0.000');
    expect(formatCurrency(null)).toBe('OMR 0.000');
  });
  it('roundToPrecision delegates to roundMoney', () => {
    expect(roundToPrecision(-1.0005, 3)).toBe(-1.001);
  });
});
