/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf8',
          100: '#d1faed',
          200: '#a7f3df',
          300: '#6ee7c7',
          400: '#34d3a4',
          500: '#14b88a',
          600: '#0d9672',
          700: '#08785d',
          800: '#075f4b',
          900: '#064e3d',
        },
      },
    },
  },
  plugins: [],
};
