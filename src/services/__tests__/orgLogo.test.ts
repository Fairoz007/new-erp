import { describe, expect, it, vi } from 'vitest';

const upload = vi.fn(async () => ({ error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { storage: { from: () => ({ upload }) } } }));

const { uploadOrgLogo } = await import('../org');
const file = (type: string, bytes = 10) => new File([new Uint8Array(bytes)], 'logo', { type });

describe('uploadOrgLogo', () => {
  it('refuses SVG, which the media bucket does not accept', async () => {
    await expect(uploadOrgLogo(file('image/svg+xml'))).rejects.toThrow('Logo must be a PNG, JPG or WebP image.');
    expect(upload).not.toHaveBeenCalled();
  });
  it('refuses a logo over 2 MB', async () => {
    await expect(uploadOrgLogo(file('image/png', 2 * 1024 * 1024 + 1))).rejects.toThrow('Logo must be 2 MB or smaller.');
  });
  it('uploads PNG, JPEG and WebP to the media bucket', async () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp']) await expect(uploadOrgLogo(file(t))).resolves.toMatch(/^organization\/logo-/);
    expect(upload).toHaveBeenCalledTimes(3);
  });
});
