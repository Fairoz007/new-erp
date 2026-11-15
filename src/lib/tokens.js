// Design tokens: the one place the app's colours, type scale, radius and shadows are defined.
// tailwind.config.js reads this file (classes such as bg-brand-500, text-accent-red-600), and code
// that needs a colour value (charts, canvas, PDF) imports it through src/lib/tokens.d.ts.
// Brand: the app's green is the primary colour; the logo's red, light blue and green are accents.

/** Primary green (buttons, links, active states). 500 is the base; 600 is hover / text on light green. */
export const brand = {
  50: '#F0F8F4', 100: '#DCEFE5', 200: '#BDE2D0', 300: '#8ACDB0', 400: '#4CAE88',
  500: '#086343', 600: '#06452F', 700: '#043423', 800: '#03261A', 900: '#021A12', 950: '#010F0A',
};

/** Logo accents (sampled from Al Hakim PDF.pdf). 500 = the logo colour; 700 = text on white (AA). */
export const accent = {
  red:   { 50: '#FDEDED', 100: '#F9D3D3', 500: '#D92B2B', 600: '#B92020', 700: '#931A1A' },
  blue:  { 50: '#EAF6FB', 100: '#CBE9F5', 500: '#3AA3CF', 600: '#1F7EA8', 700: '#17617F' },
  green: { 50: '#F2F8EA', 100: '#DEEFC8', 500: '#84BC42', 600: '#5E8D27', 700: '#46691D' },
};

/** Neutrals. The `slate` scale is inverted for historical reasons (50 = black, 900 = white). */
export const neutral = {
  text: '#111827',        // primary text (slate-100)
  textStrong: '#1F2937',  // headings (slate-200)
  textBody: '#374151',    // body (slate-300)
  textMuted: '#626B67',   // secondary text, AA on white and on surfaces (slate-400)
  border: '#E7EBE8',      // borders (slate-700)
  divider: '#D1D5DB',     // stronger dividers (slate-600)
  hover: '#F0F2F1',       // hover background (slate-800)
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8F7',  // table headers, secondary surfaces (slate-850)
  canvas: '#F1F3F2',
};

/** Status colours. DEFAULT for fills and icons; 700 for text on white; 50 for soft backgrounds. */
export const status = {
  success: { DEFAULT: '#21865B', 50: '#EDF7F2', 700: '#17603F' },
  warning: { DEFAULT: '#D9A441', 50: '#FFFBEB', 700: '#92400E' },
  danger:  { DEFAULT: '#D94B4B', 50: '#FEECEC', 700: '#9F1D1D' },
  info:    { DEFAULT: '#3AA3CF', 50: '#EAF6FB', 700: '#17617F' },
};

/** Chart series: brand green first, then the logo accents, then neutrals. */
export const chart = {
  primary: brand[500],
  secondary: neutral.textMuted,
  grid: neutral.border,
  axis: neutral.textMuted,
  series: [brand[500], accent.blue[600], accent.red[500], accent.green[600], status.warning.DEFAULT, neutral.textMuted],
  positive: brand[500],
  warning: status.warning.DEFAULT,
  negative: status.danger.DEFAULT,
  light: brand[400],
};

export const radius = { control: '12px', card: '20px', frame: '28px', pill: '9999px' };

export const shadow = {
  subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
  card: '0 2px 8px -2px rgba(0, 0, 0, 0.04), 0 1px 3px -1px rgba(0, 0, 0, 0.02)',
  elevated: '0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  floating: '0 20px 40px -15px rgba(0, 0, 0, 0.07), 0 0 1px 1px rgba(0, 0, 0, 0.03)',
};

/** Type scale (Tailwind fontSize entries): 2xs is the smallest label size used in tables and badges. */
export const fontSize = {
  '2xs': ['10px', { lineHeight: '14px' }],
};
