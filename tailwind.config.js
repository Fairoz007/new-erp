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
        // FleetX uses the slate scale semantically throughout the application.
        // Keeping the tokens and remapping them here makes the white theme apply
        // consistently to legacy pages without changing any application logic.
        slate: {
          50: '#0F172A',
          100: '#0F172A',
          200: '#1E293B',
          300: '#334155',
          400: '#64748B',
          500: '#64748B',
          600: '#CBD5E1',
          700: '#E2E8F0',
          750: '#E8EDF4',
          800: '#F1F5F9',
          850: '#F8FAFC',
          900: '#FFFFFF',
          950: '#F8FAFC',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        navy: {
          800: '#0f172a',
          850: '#0b1120',
          900: '#0a0f1d',
          950: '#030712',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', '-apple-system', 'BlinkMacSystemFont', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
