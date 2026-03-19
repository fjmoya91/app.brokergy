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
                bkg: {
                    deep: '#08090C',
                    base: '#0C0E12',
                    surface: '#13151A',
                    elevated: '#1A1C22',
                    hover: '#22242B',
                },
            },
        },
    },
    plugins: [],
}
