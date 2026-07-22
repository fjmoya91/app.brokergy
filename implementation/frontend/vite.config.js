import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Puerto del backend al que proxear. Por defecto 3000, que es donde arranca
// `node server.js`. Se puede sobreescribir con BACKEND_PORT para levantar un
// segundo backend en paralelo (p.ej. dos sesiones de trabajo a la vez) sin que
// este frontend acabe hablando con el backend del otro.
const BACKEND_PORT = process.env.BACKEND_PORT || 3000

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    proxy: {
      // Cubre también los servlets de Autofirma en /api/afirma-signature-*.
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    }
  }
})
