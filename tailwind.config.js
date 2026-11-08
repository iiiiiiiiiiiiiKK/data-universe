/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          950: '#04060f',
          900: '#070b18',
          850: '#0a0f20',
          800: '#0e1428',
          700: '#151d36',
          600: '#1e2844',
        },
        starlight: {
          50: '#f4f7ff',
          100: '#e5ecff',
          200: '#c8d6ff',
          300: '#a3b8ff',
          400: '#7d96f8',
          500: '#5b74e8',
        },
        plasma: {
          400: '#8b6cff',
          500: '#7a55f2',
          600: '#6533d9',
        },
        aurora: {
          300: '#6ce6c4',
          400: '#2ed3a6',
          500: '#16b98c',
        },
        flare: {
          300: '#ffc46b',
          400: '#ffa62b',
          500: '#f0850a',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 60px -30px rgba(0,0,0,0.8)',
        glow: '0 0 40px -8px rgba(122,85,242,0.55)',
      },
      borderRadius: {
        xl2: '1.15rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        breathe: 'breathe 4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
