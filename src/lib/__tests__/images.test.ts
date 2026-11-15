import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));
const { fitWithin, squareLayout, plan, checkInput, checkOutput, outputName, IMAGE_RULES } = await import('../images');

const f = (name: string, type: string, size: number) => ({ name, type, size });
const MB = 1024 * 1024;

describe('image sizing', () => {
  it('fits the longest side and never enlarges', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it('puts a wide logo on a square canvas without cutting it', () => {
    const l = squareLayout(640, 321, 512);
    expect(l.w).toBe(512);
    expect(l.h).toBe(257);
    expect(l.x).toBe(0);
    expect(l.y + l.h).toBeLessThanOrEqual(512);
    expect(l.y).toBe(Math.round((512 - 257) / 2));
  });
  it('makes logos square and leaves photos in proportion', () => {
    expect(plan(640, 321, IMAGE_RULES.logo).canvas).toEqual({ width: 512, height: 512 });
    expect(plan(200, 100, IMAGE_RULES.logo).canvas).toEqual({ width: 200, height: 200 });
    expect(plan(4032, 3024, IMAGE_RULES.photo).canvas).toEqual({ width: 1600, height: 1200 });
  });
});

describe('image validation', () => {
  it('accepts images for both stores and PDF only for documents', () => {
    expect(checkInput(f('a.png', 'image/png', 10), 'media')).toBe('image');
    expect(checkInput(f('a.webp', 'image/webp', 10), 'documents')).toBe('image');
    expect(checkInput(f('a.pdf', 'application/pdf', 10), 'documents')).toBe('pdf');
    expect(() => checkInput(f('a.pdf', 'application/pdf', 10), 'media')).toThrow('not an allowed file type');
    expect(() => checkInput(f('a.svg', 'image/svg+xml', 10), 'media')).toThrow('not an allowed file type');
    expect(() => checkInput(f('a.gif', '', 10), 'media')).toThrow('not an allowed file type');
  });
  it('refuses empty files and PDFs over the 10 MB limit', () => {
    expect(() => checkInput(f('a.png', 'image/png', 0), 'media')).toThrow('is empty');
    expect(() => checkInput(f('a.pdf', 'application/pdf', 10 * MB + 1), 'documents')).toThrow('the limit is 10.00 MB');
  });
  it('checks the prepared file against the bucket limits', () => {
    expect(() => checkOutput(5 * MB, 'image/png', 'media')).not.toThrow();
    expect(() => checkOutput(5 * MB + 1, 'image/jpeg', 'media')).toThrow('the limit is 5.00 MB');
    expect(() => checkOutput(100, 'image/webp', 'documents')).toThrow('does not accept');
  });
  it('names the output after the original with the new extension', () => {
    expect(outputName('IMG_2041.HEIC.webp', 'image/jpeg')).toBe('IMG_2041.HEIC.jpg');
    expect(outputName('logo', 'image/png')).toBe('logo.png');
  });
});
