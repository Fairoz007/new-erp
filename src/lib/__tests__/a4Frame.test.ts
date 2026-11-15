import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { startA4, a4Table, ensureSpace, stampPages, sellerLine, savePdf, printPdf, BODY } = await import('../a4/frame');

/** Text drawn on each page, read back from the PDF content streams. */
function pageTexts(doc: { internal: { pages: unknown[] } }): string[] {
  return (doc.internal.pages.slice(1) as string[][]).map(p => p.join('\n').match(/\((?:\\.|[^\\)])*\)\s*Tj/g)?.map(s => s.slice(1, s.lastIndexOf(')'))).join(' ') ?? '');
}

describe('A4 frame', () => {
  it('a long table repeats the frame, its header and the page label on every page', () => {
    const a = startA4({ title: 'VEHICLES', corner: '01-Jan-2026 to 15-Nov-2026', footer: 'Vehicles', letterhead: null });
    a4Table(a, {
      head: [['Plate', 'Model', 'Office', 'Mileage', 'Book value']],
      body: Array.from({ length: 120 }, (_, i) => [`P-${i + 1}`, 'Sample bus', 'Head Office', String(1000 + i), '1,000.000']),
      startY: BODY.top + 3,
      numeric: [3, 4],
    });
    stampPages(a);
    const pages = pageTexts(a.doc);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((t, i) => {
      expect(t).toContain('VEHICLES');
      expect(t).toContain('01-Jan-2026 to 15-Nov-2026');
      expect(t).toContain('Book value');                                  // header on every page
      expect(t).toContain(`Vehicles · Page ${i + 1} of ${pages.length}`);
    });
    expect(pages.join(' ')).toContain('P-120');
  });

  it('starts a new framed page when a block does not fit', () => {
    const a = startA4({ title: 'T', corner: 'C', letterhead: null });
    expect(ensureSpace(a, BODY.top, 20)).toBe(BODY.top);
    expect(a.doc.getNumberOfPages()).toBe(1);
    expect(ensureSpace(a, BODY.bottom - 5, 20)).toBe(BODY.top);
    expect(a.doc.getNumberOfPages()).toBe(2);
    expect(pageTexts(a.doc)[1]).toContain('T');
  });

  it('leaves empty seller parts out', () => {
    expect(sellerLine({ name: 'Al Hakim National LLC', vat: 'OM1100058123', cr: '' })).toBe('Al Hakim National LLC   ·   VATIN OM1100058123');
  });

  it('saves a number as <number>.pdf and keeps a full file name', () => {
    const save = vi.fn();
    savePdf({ save } as never, '447-FT-2026');
    savePdf({ save } as never, 'Trial_Balance_HO_2026-11-15.pdf');
    expect(save.mock.calls).toEqual([['447-FT-2026.pdf'], ['Trial_Balance_HO_2026-11-15.pdf']]);
  });
});

describe('printPdf', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  /** A minimal browser: an iframe that loads when appended, and a print() that may throw. */
  function fakeBrowser(print: () => void) {
    const frame: Record<string, unknown> = { style: {}, setAttribute: vi.fn(), remove: vi.fn(), contentWindow: { focus: vi.fn(), print } };
    vi.stubGlobal('document', {
      createElement: () => frame,
      body: { appendChild: () => queueMicrotask(() => (frame.onload as () => void)()) },
    });
    vi.stubGlobal('window', { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (t: number) => clearTimeout(t) });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:pdf', revokeObjectURL: vi.fn() });
    return frame;
  }
  const doc = () => ({ output: () => new Blob(['%PDF']), save: vi.fn() });

  it('prints the PDF pages from a hidden frame', async () => {
    const print = vi.fn();
    const frame = fakeBrowser(print);
    const d = doc();
    await expect(printPdf(d as never, '447-FT-2026')).resolves.toBe('printed');
    expect(print).toHaveBeenCalledOnce();
    expect(frame.src).toBe('blob:pdf');
    expect(d.save).not.toHaveBeenCalled();
  });

  it('downloads the file when the browser cannot print it', async () => {
    fakeBrowser(() => { throw new Error('blocked'); });
    const d = doc();
    await expect(printPdf(d as never, '447-FT-2026')).resolves.toBe('downloaded');
    expect(d.save).toHaveBeenCalledWith('447-FT-2026.pdf');
  });

  it('downloads the file outside a browser', async () => {
    const d = doc();
    await expect(printPdf(d as never, 'Statement_Sample_2026-11-15.pdf')).resolves.toBe('downloaded');
    expect(d.save).toHaveBeenCalledWith('Statement_Sample_2026-11-15.pdf');
  });
});
