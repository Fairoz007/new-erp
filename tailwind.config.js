/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic slate mapping for clean enterprise white dashboard
        slate: {
          50: '#000000',
          100: '#111111', // Primary text: near-black
          200: '#1C1C1E', // Strong text / Headings
          300: '#3C3C43', // Body text
          400: '#6B6B72', // Secondary text
          500: '#8E8E93', // Muted / placeholders
          600: '#D8D8DC', // Secondary dividers
          700: '#E7E7EA', // Primary borders
          750: '#EAEAED',
          800: '#F4F4F6', // Hover & subtle buttons
          850: '#FAFAFB', // Table headers & subtle cards
          900: '#FFFFFF', // Main white surfaces
          950: '#F4F4F6', // Page background
        },
        brand: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5', // FleetX primary purple
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        navy: {
          800: '#0f172a',
          850: '#0b1120',
          900: '#0a0f1d',
          950: '#030712',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'elevated': '0 4px 12px 0 rgba(0, 0, 0, 0.06)',
      },
      borderRadius: {
        'card': '14px',
      }
    },
  },
  plugins: [],
}
