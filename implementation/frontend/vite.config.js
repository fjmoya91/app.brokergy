import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Puerto del backend al que proxear. Por defecto 3000, que es donde arranca
// `node server.js`. Se puede sobreescribir con BACKEND_PORT para levantar un
// segundo backend en paralelo (p.ej. dos sesiones de trabajo a la vez) sin que
// este frontend acabe hablando con el backend del otro.
//
// Se lee del entorno Y de `.env.local`: en Windows no hay forma cómoda de poner
// una variable delante del comando, y quien arranca Vite desde un panel o desde
// un launch.json no controla su entorno. Con el fichero, la elección viaja con
// la carpeta y no hay que acordarse de nada al arrancar.
//
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const BACKEND_PORT = process.env.BACKEND_PORT || env.BACKEND_PORT || 3000

  return {
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
  }
})
