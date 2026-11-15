/** @type {import('tailwindcss').Config} */
// Every colour, radius and shadow comes from src/lib/tokens.js (the single definition).
import { brand, accent, neutral, status, radius, shadow, fontSize } from './src/lib/tokens.js';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        '18': '4.5rem', // 72px for toolbar / headers
      },
      height: {
        '18': '4.5rem', // 72px
      },
      fontSize,
      colors: {
        brand,
        forest: brand,     // older name for the same scale
        indigo: { ...brand, 600: brand[500], 700: brand[600], 800: brand[700] }, // legacy classes map to the brand green
        accent,
        // Neutral scale, inverted for historical reasons (50 = black … 900 = white): see tokens.js
        slate: {
          50: '#000000',
          100: neutral.text,
          200: neutral.textStrong,
          300: neutral.textBody,
          400: neutral.textMuted,   // WCAG AA (>= 4.5:1) on white and on every surface
          500: '#666F6B',           // muted / placeholders (>= 4.5:1 on white)
          600: neutral.divider,
          700: neutral.border,
          750: '#EFF2F0',
          800: neutral.hover,
          850: neutral.surfaceAlt,
          900: neutral.surface,
          950: neutral.canvas,
        },
        canvas: neutral.canvas,
        surface: {
          DEFAULT: neutral.surface,
          secondary: neutral.surfaceAlt,
        },
        success: status.success,
        warning: status.warning,
        danger: status.danger,
        info: status.info,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: shadow,
      borderRadius: radius,
    },
  },
  plugins: [],
}
