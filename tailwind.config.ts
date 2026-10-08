import type { Config } from 'tailwindcss'

/**
 * Bell Cell design tokens.
 *
 * Brand colour is #00A59F (hsl 178 100% 32%), used as `brand-500`.
 * The scale below is a linear mix of that hue toward white (50-400) and
 * black (600-950), so every step keeps the same teal character.
 *
 * ACCESSIBILITY NOTE - read before using `brand-500` as a background:
 *   white on #00A59F  = 3.05:1  -> FAILS WCAG AA for normal text
 *   white on #007C77  = 5.07:1  -> passes AA  (this is `brand-700`)
 * So filled controls that carry small white label text use brand-700, and
 * brand-500 is reserved for accents, borders, icons, chart series, active
 * indicators and large display text. See docs/design-system.md.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f6f5',
          100: '#ccedec',
          200: '#99dbd8',
          300: '#66c9c5',
          400: '#33b7b2',
          500: '#00a59f', // brand
          600: '#00958f',
          700: '#007c77', // AA-safe fill for white text
          800: '#00635f',
          900: '#004a48',
          950: '#002e2d',
        },
        // Semantic colours chosen to sit beside the teal without clashing.
        positive: {
          50: '#ecfdf5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        caution: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        critical: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        info: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '0.875rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover':
          '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
        popover:
          '0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-down': 'slide-down 140ms ease-out',
      },
    },
  },
  plugins: [],
}

export default config
