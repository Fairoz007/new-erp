import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { buildTableReportPdf, periodText, reportFileName, footerLine, tableLayout, MIN_FONT } = await import('../a4/tableReport');
const { startA4, PORTRAIT, fitText } = await import('../a4/frame');

/** Text drawn on each page, read back from the PDF content streams. */
function pageTexts(doc: { internal: { pages: unknown[] } }): string[] {
  return (doc.internal.pages.slice(1) as string[][]).map(p => p.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g)?.map(s => s.slice(1, s.lastIndexOf(')')).replace(/\\([()\\])/g, '$1')).join(' ') ?? '');
}

const company = { legalName: 'Al Hakim National LLC', vatNumber: 'OM1100058123', crNumber: '1090254', address: 'Al Jami Al Akbar Street', city: 'Ghala', country: 'Oman', phone: '2450 5595', email: 'info@alhakimnational.com' };
const HO = { code: 'HO', name: 'Head Office', vatNumber: '', registrationNumber: '' };
const now = new Date(2026, 10, 15, 10, 42);
const report = (columns: string[], rows: string[][], extra = {}) => buildTableReportPdf({
  name: 'Vehicle_Master_Report', title: 'Vehicle Master Report', columns, rows, office: HO, company, generatedBy: 'Sara Ali', now, ...extra,
}, { letterhead: null, logo: null });

describe('report period, file name and footer', () => {
  it('writes the period or "As of" a date', () => {
    expect(periodText({ from: '2026-01-01', to: '2026-11-15' }, '2026-11-15')).toBe('01-Jan-2026 to 15-Nov-2026');
    expect(periodText({ from: '2026-01-01' }, '2026-11-15')).toBe('From 01-Jan-2026');
    expect(periodText({ to: '2026-11-15' }, '2026-11-15')).toBe('Up to 15-Nov-2026');
    expect(periodText({ asOf: '2026-10-31' }, '2026-11-15')).toBe('As of 31-Oct-2026');
    expect(periodText(undefined, '2026-11-15')).toBe('As of 15-Nov-2026');
  });

  it('names the file <report>_<office>_<period>.pdf', () => {
    expect(reportFileName('Expense_Report', HO, { from: '2026-01-01', to: '2026-11-15' }, '2026-11-15')).toBe('Expense_Report_HO_2026-01-01_2026-11-15.pdf');
    expect(reportFileName('Trial_Balance', null, { asOf: '2026-10-31' }, '2026-11-15')).toBe('Trial_Balance_All_2026-10-31.pdf');
    expect(reportFileName('Vehicles', { code: 'DQM' }, undefined, '2026-11-15')).toBe('Vehicles_DQM_2026-11-15.pdf');
    expect(reportFileName('AR Aging / Report', null, undefined, '2026-11-15')).toBe('AR_Aging_Report_All_2026-11-15.pdf');
  });

  it('builds the landscape footer from Settings and leaves empty parts out', () => {
    expect(footerLine(company)).toBe('Al Hakim National LLC  ·  CR 1090254  ·  VATIN OM1100058123  ·  Al Jami Al Akbar Street, Ghala, Oman  ·  T. 2450 5595  ·  info@alhakimnational.com');
    expect(footerLine({ ...company, crNumber: '', address: '', city: '', country: '', phone: '' })).toBe('Al Hakim National LLC  ·  VATIN OM1100058123  ·  info@alhakimnational.com');
  });
});

describe('list and report PDF', () => {
  it('a 120-row list repeats the title, period, header and page x of y on every page', () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`V-${i + 1}`, `M ${1000 + i}`, 'Head Office', 'Toyota Coaster', 'Active']);
    const { doc, fileName } = report(['ID', 'Plate', 'Office', 'Make & Model', 'Status'], rows, { period: { from: '2026-01-01', to: '2026-11-15' } });
    const pages = pageTexts(doc);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    pages.forEach((t, i) => {
      expect(t).toContain('VEHICLE MASTER REPORT');
      expect(t).toContain('01-Jan-2026 to 15-Nov-2026');
      expect(t).toContain('Make & Model');
      expect(t).toContain(`Vehicle Master Report · Page ${i + 1} of ${pages.length}`);
    });
    expect(pages[0]).toContain('VATIN OM1100058123');
    expect(pages[0]).toContain('Head Office (HO)');
    expect(pages[0]).toContain('by Sara Ali on 15-Nov-2026 10:42');
    expect(pages.join(' ')).toContain('V-120');
    expect(fileName).toBe('Vehicle_Master_Report_HO_2026-01-01_2026-11-15.pdf');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
  });

  it('a 9-column table stays portrait with readable type', () => {
    const cols = ['Code', 'Account', 'Category', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'];
    const rows = Array.from({ length: 40 }, (_, i) => [`${4000 + i}`, 'Staff bus hire revenue, long-term contracts', 'Revenue', '12,345.678', '-', '1,234.500', '-', '13,580.178', '-']);
    const probe = startA4({ title: '', corner: '', letterhead: null });
    const layout = tableLayout(probe.doc, cols, rows, [3, 4, 5, 6, 7, 8]);
    expect(layout.orientation).toBe('portrait');
    expect(layout.fontSize).toBeGreaterThanOrEqual(MIN_FONT);
    const { doc } = report(cols, rows, { period: { asOf: '2026-11-15' }, totals: ['', 'TOTAL', '', '1.000', '', '', '', '', ''] });
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(pageTexts(doc).slice(-1)[0]).toContain('TOTAL');
  });

  it('a table of more than 10 columns goes landscape, with the company footer', () => {
    const cols = Array.from({ length: 11 }, (_, i) => `Column ${i + 1}`);
    const { doc } = report(cols, [cols.map(() => 'x')]);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    const t = pageTexts(doc)[0];
    expect(t).toContain('VEHICLE MASTER REPORT');
    expect(t).toContain('CR 1090254');
    expect(t).toContain('Vehicle Master Report · Page 1 of 1');
  });

  it('an empty table still prints its header and "No rows"', () => {
    const { doc } = report(['ID', 'Plate'], []);
    const t = pageTexts(doc)[0];
    expect(t).toContain('Plate');
    expect(t).toContain('No rows');
    expect(t).toContain('As of 15-Nov-2026');
  });

  it('long report names fit the corner beside the logo, on at most two lines', () => {
    const a = startA4({ title: 'FIXED ASSET DEPRECIATION REPORT', corner: '01-Jan-2026 to 15-Nov-2026', letterhead: null });
    const width = PORTRAIT.corner.right - PORTRAIT.corner.left;
    expect(pageTexts(a.doc)[0]).toContain('01-Jan-2026 to 15-Nov-2026');
    a.doc.setFont('helvetica', 'bold');
    const t = fitText(a.doc, 'FIXED ASSET DEPRECIATION REPORT', width, 13, 8, 10.5);
    expect(t.lines.length).toBeLessThanOrEqual(2);
    expect(t.size).toBeGreaterThanOrEqual(8);
    a.doc.setFontSize(t.size);
    for (const line of t.lines) expect(a.doc.getTextWidth(line)).toBeLessThanOrEqual(width);
    // short titles keep the full size on one line
    expect(fitText(a.doc, 'TAX INVOICE', width, 13, 8, 10.5)).toEqual({ size: 13, lines: ['TAX INVOICE'] });
  });
});
