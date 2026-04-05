/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        felt:    '#1a5c2e',
        'felt-dark': '#122b18',
        lobster: '#e8401a',
        gold:    '#f5c842',
        chip:    '#2d2d2d',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-ring': 'pulseRing 1.2s ease-in-out infinite',
        'deal':       'deal 0.3s ease-out forwards',
        'flip':       'flip 0.4s ease-in-out forwards',
        'chip-fly':   'chipFly 0.5s ease-out forwards',
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(245,200,66,0.6)' },
          '50%':      { boxShadow: '0 0 0 12px rgba(245,200,66,0)' },
        },
        deal: {
          from: { transform: 'translateY(-60px) rotate(-15deg)', opacity: 0 },
          to:   { transform: 'translateY(0) rotate(0deg)',        opacity: 1 },
        },
        flip: {
          '0%':   { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        chipFly: {
          from: { transform: 'scale(0) translateY(-20px)', opacity: 0 },
          to:   { transform: 'scale(1) translateY(0)',     opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
