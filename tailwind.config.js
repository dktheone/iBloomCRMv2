/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: '#F8FAFC',
          dark: '#0B1120',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#000000',
          sunkenLight: '#F1F5F9',
          sunkenDark: '#0F1729',
        },
        accent: {
          light: '#0E7490', // Kingfisher Teal
          dark: '#22A6C3',
          washLight: 'rgba(14,116,137,0.08)',
          washDark: 'rgba(34,166,195,0.12)',
        },
        ink: {
          light: '#0F172A',
          mutedLight: '#475569',
          faintLight: '#94A3B8',
          dark: '#E7ECF3',
          mutedDark: '#94A3B8',
          faintDark: '#5B6B82',
        },
        status: {
          emerald: '#059669',
          amber: '#D97706',
          rose: '#E11D48',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
