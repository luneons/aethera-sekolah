import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e0fffe',
          100: '#b3fdfd',
          200: '#7df9f9',
          300: '#00f2f2',
          400: '#00d4d4',
          500: '#00b8b8',
          600: '#009999',
          700: '#007777',
          800: '#005555',
          900: '#003333',
        },
        accent: {
          50: '#fff8e1',
          100: '#ffecb3',
          200: '#ffe082',
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107',
          600: '#ffb300',
          700: '#ffa000',
          800: '#ff8f00',
          900: '#ff6f00',
        },
        success: { DEFAULT: '#00e676', dark: '#00c853', light: '#69f0ae' },
        danger: { DEFAULT: '#ff1744', dark: '#d50000', light: '#ff616f' },
        surface: {
          base: '#050a0f',
          raised: '#0a1520',
          overlay: '#0f1e2e',
          border: '#1a3045',
          muted: '#0d1a26',
        },
        text: {
          primary: '#e8f4f8',
          secondary: '#8baebe',
          muted: '#4a6b82',
          inverse: '#050a0f',
        },
        scanner: {
          line: '#00f2f2',
          glow: 'rgba(0, 242, 242, 0.3)',
          grid: 'rgba(0, 184, 184, 0.1)',
          success: '#00e676',
          fail: '#ff1744',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        '2xl': '2rem',
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 184, 184, 0.4)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.4)',
        'glow-danger': '0 0 20px rgba(255, 23, 68, 0.4)',
        'glow-sm': '0 0 10px rgba(0, 184, 184, 0.2)',
        card: '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.6)',
      },
      keyframes: {
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        scanPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.08)', opacity: '0.3' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        statusBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'scan-line': 'scanLine 2s linear infinite',
        'scan-pulse': 'scanPulse 2s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease infinite',
        'status-blink': 'statusBlink 1.5s ease-in-out infinite',
        'fade-up': 'fadeUp 0.4s ease forwards',
        'slide-in-left': 'slideInLeft 0.25s ease-out',
      },
      backgroundImage: {
        'grid-cyber':
          'linear-gradient(rgba(0,184,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(0,184,184,0.07) 1px, transparent 1px)',
        'gradient-radial-primary':
          'radial-gradient(ellipse at center, rgba(0,184,184,0.15) 0%, transparent 70%)',
        'gradient-card': 'linear-gradient(135deg, #0a1520 0%, #0f1e2e 100%)',
      },
      backgroundSize: {
        grid: '40px 40px',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')({ strategy: 'class' })],
};

export default config;
