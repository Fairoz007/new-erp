import { describe, expect, it } from 'vitest';
import { amountInWords, numberInWords } from '../amountInWords';

describe('amountInWords (Rials and Baisa)', () => {
  it('writes 2,677.500 the way the invoice prints it', () => {
    expect(amountInWords(2677.5)).toBe('Two Thousand Six Hundred Seventy-Seven Rials and Five Hundred Baisa');
  });
  it('handles whole Rials, Baisa only, one Rial and zero', () => {
    expect(amountInWords(1050)).toBe('One Thousand Fifty Rials');
    expect(amountInWords(0.25)).toBe('Two Hundred Fifty Baisa');
    expect(amountInWords(1)).toBe('One Rial');
    expect(amountInWords(1.005)).toBe('One Rial and Five Baisa');
    expect(amountInWords(0)).toBe('Zero Rials');
  });
  it('rounds to three decimals and ignores the sign', () => {
    expect(amountInWords(12.3456)).toBe('Twelve Rials and Three Hundred Forty-Six Baisa');
    expect(amountInWords(-333.333)).toBe('Three Hundred Thirty-Three Rials and Three Hundred Thirty-Three Baisa');
    expect(amountInWords(0.0004)).toBe('Zero Rials');
  });
  it('covers teens, tens and large groups', () => {
    expect(numberInWords(19)).toBe('Nineteen');
    expect(numberInWords(90)).toBe('Ninety');
    expect(numberInWords(101)).toBe('One Hundred One');
    expect(numberInWords(1_000_000)).toBe('One Million');
    expect(numberInWords(2_001_015)).toBe('Two Million One Thousand Fifteen');
    expect(() => numberInWords(1.5)).toThrow();
  });
});
