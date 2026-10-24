/** @type {import('tailwindcss').Config} */
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
      colors: {
        // Reference-based design tokens
        forest: {
          50: '#F0F8F4',
          100: '#DCEFE5', // Light green tint from reference
          200: '#BDE2D0',
          300: '#8ACDB0',
          400: '#4CAE88',
          500: '#086343', // Reference Primary Green
          600: '#06452F', // Reference Dark Green
          700: '#043423',
          800: '#03261a',
          900: '#021a12',
          950: '#010f0a',
        },
        brand: {
          50: '#F0F8F4',
          100: '#DCEFE5',
          200: '#BDE2D0',
          300: '#8ACDB0',
          400: '#4CAE88',
          500: '#086343',
          600: '#06452F',
          700: '#043423',
          800: '#03261a',
          900: '#021a12',
          950: '#010f0a',
        },
        // Map indigo to primary green so existing classes throughout ERP inherit reference styling
        indigo: {
          50: '#F0F8F4',
          100: '#DCEFE5',
          200: '#BDE2D0',
          300: '#8ACDB0',
          400: '#4CAE88',
          500: '#086343',
          600: '#086343',
          700: '#06452F',
          800: '#043423',
          900: '#021a12',
          950: '#010f0a',
        },
        // Semantic neutral palette from reference
        slate: {
          50: '#000000',
          100: '#111827', // Reference Primary text
          200: '#1F2937', // Strong text / Headings
          300: '#374151', // Body text
          400: '#7B8581', // Reference Secondary text
          500: '#9CA3AF', // Muted / placeholders
          600: '#D1D5DB', // Secondary dividers
          700: '#E7EBE8', // Reference Primary borders
          750: '#EFF2F0',
          800: '#F0F2F1', // Hover & subtle buttons
          850: '#F7F8F7', // Reference Secondary surface & table headers
          900: '#FFFFFF', // Main white surfaces
          950: '#F1F3F2', // Reference Application background canvas
        },
        canvas: '#F1F3F2',
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F7F8F7',
        },
        success: '#21865B',
        warning: '#D9A441',
        danger: '#D94B4B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card': '0 2px 8px -2px rgba(0, 0, 0, 0.04), 0 1px 3px -1px rgba(0, 0, 0, 0.02)',
        'elevated': '0 10px 25px -5px rgba(0, 0, 0, 0.06), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        'floating': '0 20px 40px -15px rgba(0, 0, 0, 0.07), 0 0 1px 1px rgba(0, 0, 0, 0.03)',
      },
      borderRadius: {
        'card': '20px',
        'frame': '28px',
        'pill': '9999px',
      }
    },
  },
  plugins: [],
}
