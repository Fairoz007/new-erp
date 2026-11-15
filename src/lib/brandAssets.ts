// Fixed brand artwork (Al Hakim National LLC), exported from the owner's files: see docs/UPGRADE_NOTES.md.
// The full logo and the mark are small and used on screen; the letterhead (A4, 250 dpi JPEG) is only
// fetched when an invoice, note or statement is printed or downloaded.
import logoUrl from '../assets/brand/ahn-logo.png';
import markUrl from '../assets/brand/ahn-mark.png';

export const BRAND_LOGO_URL = logoUrl;       // mark, tagline, Arabic and English name (640 × 321)
export const BRAND_MARK_URL = markUrl;       // AHN mark with tagline (256 × 162)
export const BRAND_ALT = 'Al Hakim National LLC';

/** The letterhead image URL, loaded on demand (keeps it out of the main bundle). */
export const loadLetterheadUrl = (): Promise<string> =>
  import('../assets/brand/letterhead-a4.jpg').then(m => m.default as string);
