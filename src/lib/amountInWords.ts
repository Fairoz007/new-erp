// Amount in words for Omani Rials (1 Rial = 1,000 Baisa), as printed on tax invoices:
//   2677.5   -> "Two Thousand Six Hundred Seventy-Seven Rials and Five Hundred Baisa"
//   1        -> "One Rial"          0.25 -> "Two Hundred Fifty Baisa"          0 -> "Zero Rials"
// The amount is rounded to 3 decimals (the Baisa) first. Negative amounts (credit notes) use the
// absolute value; the document title says what the amount is.

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), r = n % 100;
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ''));
  return parts.join(' ');
}

/** Whole number in English words ("Two Thousand Six Hundred Seventy-Seven"). */
export function numberInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error(`numberInWords: ${n} is not a whole number`);
  if (n === 0) return ONES[0];
  if (n >= 1e12) throw new Error('numberInWords: amount too large');
  const groups: string[] = [];
  for (let i = 0, rest = n; rest > 0; i++, rest = Math.floor(rest / 1000)) {
    const g = rest % 1000;
    if (g) groups.unshift(belowThousand(g) + (SCALES[i] ? ` ${SCALES[i]}` : ''));
  }
  return groups.join(' ');
}

export interface CurrencyWords { major: [string, string]; minor: string; minorPerMajor: number }
/** Omani Rial: singular/plural major unit, minor unit (Baisa does not change in the plural). */
export const OMR_WORDS: CurrencyWords = { major: ['Rial', 'Rials'], minor: 'Baisa', minorPerMajor: 1000 };

export function amountInWords(amount: number, words: CurrencyWords = OMR_WORDS): string {
  if (!Number.isFinite(amount)) throw new Error('amountInWords: not a number');
  const minorTotal = Math.round(Math.abs(amount) * words.minorPerMajor);
  const major = Math.floor(minorTotal / words.minorPerMajor);
  const minor = minorTotal % words.minorPerMajor;
  const majorText = `${numberInWords(major)} ${major === 1 ? words.major[0] : words.major[1]}`;
  if (!minor) return majorText;
  const minorText = `${numberInWords(minor)} ${words.minor}`;
  return major ? `${majorText} and ${minorText}` : minorText;
}
