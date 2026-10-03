/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see src/index.css) so the whole app re-themes (light / dark) without touching components.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                heading: ['Fraunces', 'Georgia', 'serif'],
                display: ['Cormorant Garamond', 'Georgia', 'serif'],
                script: ['Pinyon Script', 'cursive'],
                body: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
                accent: ['Space Grotesk', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Consolas', 'monospace'],
            },
            colors: {
                campus: {
                    navy: v('navy'),                 // strong text / headings (light in dark mode)
                    'navy-light': v('navy-light'),
                    primary: v('primary'),           // filled buttons and chips (always dark enough for white text)
                    'primary-light': v('primary-light'),
                    gold: v('gold'),
                    'gold-light': v('gold-light'),
                    'gold-dark': v('gold-dark'),     // gold used as TEXT
                    cream: v('cream'),
                    ivory: v('ivory'),
                    surface: v('surface'),
                    ink: v('ink'),
                    success: v('success'),
                    'success-light': v('success-light'),
                    amber: v('amber'),
                    'amber-light': v('amber-light'),
                    rose: v('rose'),
                    'rose-light': v('rose-light'),
                    warm: {
                        50: v('warm-50'),
                        100: v('warm-100'),
                        200: v('warm-200'),
                        300: v('warm-300'),
                        400: v('warm-400'),
                        500: v('warm-500'),
                    },
                    aurora1: v('aurora1'),
                    aurora2: v('aurora2'),
                    aurora3: v('aurora3'),
                },
            },
            borderRadius: {
                'campus': '20px',
                'campus-sm': '12px',
                'campus-lg': '28px',
                'campus-xl': '36px',
            },
            boxShadow: {
                'campus': 'var(--shadow-1)',
                'campus-md': 'var(--shadow-2)',
                'campus-lg': 'var(--shadow-3)',
                'campus-gold': '0 6px 20px -4px rgb(var(--c-gold) / 0.45)',
                'campus-navy': '0 6px 20px -4px rgb(var(--c-primary) / 0.45)',
                'glow': '0 0 40px -8px rgb(var(--c-aurora1) / 0.6)',
            },
            keyframes: {
                float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
                shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
                'border-beam': { '100%': { 'offset-distance': '100%' } },
                marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
                'pulse-ring': { '0%': { transform: 'scale(.9)', opacity: '.6' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
                'gradient-pan': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
            },
            animation: {
                float: 'float 6s ease-in-out infinite',
                shimmer: 'shimmer 4s linear infinite',
                'border-beam': 'border-beam calc(var(--duration, 8) * 1s) linear infinite',
                marquee: 'marquee 40s linear infinite',
                'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
                'gradient-pan': 'gradient-pan 8s ease infinite',
            },
            typography: () => ({
                campus: {
                    css: {
                        '--tw-prose-body': 'rgb(var(--c-ink))',
                        '--tw-prose-headings': 'rgb(var(--c-navy))',
                        '--tw-prose-lead': 'rgb(var(--c-warm-400))',
                        '--tw-prose-links': 'rgb(var(--c-navy))',
                        '--tw-prose-bold': 'rgb(var(--c-ink))',
                        '--tw-prose-counters': 'rgb(var(--c-warm-400))',
                        '--tw-prose-bullets': 'rgb(var(--c-warm-300))',
                        '--tw-prose-hr': 'rgb(var(--c-warm-200))',
                        '--tw-prose-quotes': 'rgb(var(--c-ink))',
                        '--tw-prose-quote-borders': 'rgb(var(--c-gold))',
                        '--tw-prose-captions': 'rgb(var(--c-warm-400))',
                        '--tw-prose-code': 'rgb(var(--c-navy))',
                        '--tw-prose-pre-code': 'rgb(var(--c-warm-100))',
                        '--tw-prose-pre-bg': 'rgb(var(--c-primary))',
                        '--tw-prose-th-borders': 'rgb(var(--c-warm-200))',
                        '--tw-prose-td-borders': 'rgb(var(--c-warm-100))',
                    },
                },
            }),
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
