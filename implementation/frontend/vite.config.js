import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Servlets de Autofirma (@firma) para ficheros grandes → backend.
      '/afirma-signature-storage': { target: 'http://localhost:3000', changeOrigin: true },
      '/afirma-signature-retriever': { target: 'http://localhost:3000', changeOrigin: true },
    }
  }
})
