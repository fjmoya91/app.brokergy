/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: '#FFA000',
                    50: '#FFF8E1',
                    100: '#FFECB3',
                    200: '#FFD54F',
                    300: '#FFC107',
                    400: '#FFB300',
                    500: '#FFA000',
                    600: '#FF8F00',
                    700: '#FF6D00',
                    800: '#E65100',
                    900: '#BF360C',
                },
                // Tokens de fondo definidos como canales RGB en variables CSS
                // para poder cambiar de tema (oscuro/claro) sin tocar el JSX y
                // manteniendo las utilidades de opacidad (bg-bkg-deep/90, etc.).
                // Los valores viven en index.css (:root = oscuro, .theme-light = claro).
                bkg: {
                    deep: 'rgb(var(--bkg-deep) / <alpha-value>)',
                    base: 'rgb(var(--bkg-base) / <alpha-value>)',
                    surface: 'rgb(var(--bkg-surface) / <alpha-value>)',
                    elevated: 'rgb(var(--bkg-elevated) / <alpha-value>)',
                    hover: 'rgb(var(--bkg-hover) / <alpha-value>)',
                },
            },
        },
    },
    plugins: [],
}
