/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './app/js/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: { DEFAULT: '#4ECDC4', hover: '#45b7b0' },
                secondary: '#2C3E50',
                danger: { DEFAULT: '#E74C3C', hover: '#c0392b' },
                background: '#1a1a2e',
                surface: { DEFAULT: '#16213e', light: '#1f2b47' },
                'border-custom': '#2d3a52',
                success: '#2ECC71',
                warning: '#F39C12',
                muted: '#a0a0a0',
            },
            borderRadius: {
                DEFAULT: '8px',
                lg: '12px',
            },
            boxShadow: {
                DEFAULT: '0 4px 6px rgba(0, 0, 0, 0.3)',
            },
            animation: {
                'slide-in': 'slideIn 0.3s ease',
                'fade-out': 'fadeOut 0.3s ease forwards',
            },
            keyframes: {
                slideIn: {
                    from: { transform: 'translateX(100%)', opacity: '0' },
                    to: { transform: 'translateX(0)', opacity: '1' },
                },
                fadeOut: {
                    to: { transform: 'translateX(100%)', opacity: '0' },
                },
            },
        },
    },
    plugins: [],
};
