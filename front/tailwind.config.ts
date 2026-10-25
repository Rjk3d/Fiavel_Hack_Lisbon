import type { Config } from 'tailwindcss'

/** Fiável design tokens — the only colours used in the app. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#6338B8', dark: '#4F2B98', soft: '#9B72E8', tint: '#F3EEFF' },
        canvas: '#FAF9FD',
        ink: { DEFAULT: '#171329', muted: '#777487' },
        line: '#EAE7F1',
        success: { DEFAULT: '#12866A', tint: '#E6F4F0' },
        warning: { DEFAULT: '#B97924', tint: '#FBF2E4' },
        danger: { DEFAULT: '#C94B5B', tint: '#FBEBED' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { card: '24px', xl2: '20px', xl3: '28px' },
      boxShadow: {
        card: '0 1px 2px rgba(23,19,41,0.04), 0 8px 24px -12px rgba(23,19,41,0.08)',
        lift: '0 2px 4px rgba(23,19,41,0.05), 0 18px 40px -16px rgba(23,19,41,0.18)',
        brand: '0 18px 40px -18px rgba(99,56,184,0.55)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        slideInLeft: { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        blink: { '0%,80%,100%': { opacity: '0.25' }, '40%': { opacity: '1' } },
      },
      animation: {
        rise: 'rise .45s cubic-bezier(.2,.7,.2,1) both',
        fade: 'fade .2s ease-out both',
        slideIn: 'slideIn .3s cubic-bezier(.2,.7,.2,1) both',
        slideUp: 'slideUp .3s cubic-bezier(.2,.7,.2,1) both',
        slideInLeft: 'slideInLeft .3s cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 1.4s infinite',
        blink: 'blink 1.2s infinite both',
      },
    },
  },
  plugins: [],
} satisfies Config
