import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

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

// ─── La app de certificadores en DESARROLLO (cee.brokergy.es) ────────────────
// Es la segunda entrada del build (`certificadores.html`, ver build.input). En
// producción la sirve nginx en su propio subdominio, con `try_files …
// /certificadores.html` (docs/conocimiento/certificadores-app/). En desarrollo,
// el Vite de siempre serviría el `index.html` del CRM para `/panel` o `/obra/…`,
// así que este middleware decide qué HTML se sirve en cada NAVEGACIÓN:
//
//   1. POR HOST: todo lo que llegue a `cee.localhost:<puerto>` es la app de
//      certificadores (Chrome y Edge resuelven `*.localhost` solos, y Vite los
//      admite por defecto). Es lo que imita a producción: rutas en la raíz.
//          http://cee.localhost:5173/        → la landing
//          http://cee.localhost:5173/panel   → el panel
//   2. POR COOKIE, para cuando no hay subdominio (el móvil por la IP de la red
//      local con `vite --host`): abrir una vez `/?app=cee` deja la cookie
//      `brokergy_app_<puerto>=cee` y desde ahí ese navegador ve la app de
//      certificadores en ESE puerto; `/?app=crm` la quita. La cookie lleva el
//      puerto en el nombre porque las cookies no distinguen puertos: sin él,
//      probar la app en el 5181 cambiaría el CRM que otra sesión tiene en el 5173.
//
// Solo actúa en navegaciones (GET con `Accept: text/html`) a rutas sin
// extensión: los módulos, /api, /@vite, /src, /assets, /fonts y los ficheros de
// public/ siguen su camino. El CRM en `localhost` no cambia en nada.
//
// Y NO se reescriben las páginas PÚBLICAS DEL CRM que se abren desde la app de
// certificadores: `/croquis-movil/:token` (el QR que genera la envolvente para
// dibujar el croquis con el móvil) es de la entrada del CRM (index.html); en
// producción nginx también la manda a index.html (nginx/cee.brokergy.es.conf).
// Si se añade otra página así, va en DEL_CRM y en ese nginx.
function appCertificadoresDev() {
  const INTERNO = /^\/(?:api(?:\/|$)|@|src\/|node_modules\/|assets\/|fonts\/|__)/
  const DEL_CRM = /^\/croquis-movil(?:\/|$)/
  const CON_EXTENSION = /\.[a-z0-9]{1,8}$/i
  return {
    name: 'brokergy-app-certificadores-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        if (!String(req.headers.accept || '').includes('text/html')) return next()
        let url
        try { url = new URL(req.url, 'http://x') } catch { return next() }
        if (INTERNO.test(url.pathname) || DEL_CRM.test(url.pathname) || CON_EXTENSION.test(url.pathname)) return next()

        const host = String(req.headers.host || '').toLowerCase()
        const puerto = (host.match(/:(\d+)$/) || [])[1] || '80'
        const nombreCookie = `brokergy_app_${puerto}`
        const pide = url.searchParams.get('app')
        if (pide === 'crm') {
          res.setHeader('Set-Cookie', `${nombreCookie}=; Path=/; Max-Age=0; SameSite=Lax`)
          return next()
        }
        let esCee = host.startsWith('cee.')
          || new RegExp(`(?:^|;\\s*)${nombreCookie}=cee(?:;|$)`).test(String(req.headers.cookie || ''))
        if (pide === 'cee') {
          esCee = true
          res.setHeader('Set-Cookie', `${nombreCookie}=cee; Path=/; SameSite=Lax`)
        }
        if (!esCee) return next()
        req.url = '/certificadores.html'
        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const BACKEND_PORT = process.env.BACKEND_PORT || env.BACKEND_PORT || 3000

  return {
    plugins: [react(), appCertificadoresDev()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    build: {
      rollupOptions: {
        // Dos entradas, un solo build y un solo despliegue: el CRM (app.brokergy.es)
        // y la app de certificadores (cee.brokergy.es).
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          certificadores: fileURLToPath(new URL('./certificadores.html', import.meta.url)),
        },
      },
    },
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
