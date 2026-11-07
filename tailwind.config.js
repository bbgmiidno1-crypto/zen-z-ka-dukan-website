/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#080808',
        charcoal: '#111111',
        panel: '#151515',
        gold: '#D4AF37',
        'gold-soft': '#E7CE82',
        'gold-muted': '#9C8143',
      },
      fontFamily: {
        display: ['"Bodoni Moda"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        editorial: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        luxe: '0.28em',
        wide2: '0.16em',
      },
      boxShadow: {
        gold: '0 0 34px rgba(212, 175, 55, 0.18)',
        luxe: '0 24px 80px rgba(0, 0, 0, 0.65)',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
};
