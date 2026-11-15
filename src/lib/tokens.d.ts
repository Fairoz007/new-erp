type Scale = Record<string | number, string>;
export const brand: Scale;
export const accent: { red: Scale; blue: Scale; green: Scale };
export const neutral: Record<'text' | 'textStrong' | 'textBody' | 'textMuted' | 'border' | 'divider' | 'hover' | 'surface' | 'surfaceAlt' | 'canvas', string>;
export const status: Record<'success' | 'warning' | 'danger' | 'info', { DEFAULT: string; 50: string; 700: string }>;
export const chart: { primary: string; secondary: string; grid: string; axis: string; series: string[]; positive: string; warning: string; negative: string; light: string };
export const radius: Record<'control' | 'card' | 'frame' | 'pill', string>;
export const shadow: Record<'subtle' | 'card' | 'elevated' | 'floating', string>;
export const fontSize: Record<string, [string, { lineHeight: string }]>;
