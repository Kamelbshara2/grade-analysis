/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        primary: {
          50: '#E8F4EE',
          100: '#C8E6D4',
          200: '#92CCA8',
          300: '#5BB37C',
          400: '#3A8F62',
          500: '#1D5E3F',
          600: '#184F35',
          700: '#12402B',
          800: '#0D3020',
          900: '#082015',
        },
      },
    },
  },
  plugins: [],
}
