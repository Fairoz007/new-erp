import { describe, expect, it } from 'vitest';
import { csvSafeCell, toCsv } from '../export';

describe('CSV standard', () => {
  it('starts with a UTF-8 BOM, quotes every cell and ends lines with CRLF', () => {
    const csv = toCsv(['Name', 'Amount'], [['شركة', 12.5], ['A "quoted" name', -3]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"Name","Amount"\r\n"شركة","12.5"\r\n"A ""quoted"" name","-3"\r\n');
  });
  it('keeps the header when there are no rows (stable columns)', () => {
    expect(toCsv(['A', 'B'], []).slice(1)).toBe('"A","B"\r\n');
  });
  it('neutralises formulas but keeps numbers and numeric text raw', () => {
    expect(csvSafeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafeCell('+cmd')).toBe(`'+cmd`);
    expect(csvSafeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvSafeCell(-12.5)).toBe('-12.5');
    expect(csvSafeCell('-12.500')).toBe('-12.500');
    expect(toCsv(['x'], [['-1+1']]).slice(1)).toBe(`"x"\r\n"'-1+1"\r\n`);
  });
  it('writes empty cells for null and undefined', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]]).slice(1)).toBe('"a","b"\r\n"",""\r\n');
  });
});
