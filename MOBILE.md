# Brokergy Móvil — iOS y Android (Capacitor)

Estrategia: **Capacitor** envuelve la web existente. En Fase 1 la app nativa carga
`https://app.brokergy.es` directamente (ver `server.url` en
[capacitor.config.json](implementation/frontend/capacitor.config.json)), así que
**cada deploy al VPS actualiza también las apps** sin republicar nada.

## Estado

| Pieza | Estado |
|---|---|
| Proyecto Android (`implementation/frontend/android/`) | ✅ Generado, iconos+splash de marca |
| Proyecto iOS (`implementation/frontend/ios/`) | ✅ Generado, iconos+splash de marca |
| CI Android (APK) | ✅ `.github/workflows/mobile-android.yml` |
| CI iOS (compila en runner macOS) | ✅ `.github/workflows/mobile-ios.yml` (sin firma hasta tener cuenta Apple) |
| PWA (vía instalable gratis en iPhone) | ✅ Ya existía; añadido `viewport-fit=cover` + safe-areas + `100dvh` |

## Cómo obtener la app

### Android (gratis, ya)
1. GitHub → **Actions** → *Mobile Android (APK)* → **Run workflow**.
2. Descargar el artifact `brokergy-debug-apk` y pasar el `app-debug.apk` al móvil (WhatsApp/Drive/cable).
3. Al abrirlo, Android pide permitir "instalar apps de origen desconocido" → aceptar.

### iPhone sin pagar (PWA)
1. Abrir `https://app.brokergy.es` en **Safari**.
2. Compartir → **Añadir a pantalla de inicio**.
3. Queda instalada con icono y pantalla completa. Es la vía oficial gratuita: distribuir una app iOS nativa exige cuenta Apple Developer (99 €/año).

### iPhone nativo (cuando haya cuenta Apple Developer)
1. Crear cuenta en developer.apple.com (99 €/año).
2. Generar certificado de distribución + perfil y añadirlos como secrets del repo
   (lista exacta comentada dentro de `mobile-ios.yml`).
3. Descomentar el bloque de firma/TestFlight del workflow → la app llega a **TestFlight**
   (hasta 100 usuarios internos). No hace falta Mac: compila el runner macOS de GitHub.

## Desarrollo

- Cambiar la web = cambiar la app (Fase 1 carga la web remota). Flujo normal: local → push → deploy VPS.
- Si se toca `capacitor.config.json` o se añaden plugins: `cd implementation/frontend && npx cap sync`.
- Regenerar iconos/splash (fuente en `implementation/frontend/assets/`):
  `npx @capacitor/assets generate --ios --android --iconBackgroundColor '#08090C' --splashBackgroundColor '#08090C'`.
- `appId`: `es.brokergy.app`.

## Fase 2 — pendiente (para tiendas públicas y UX 100% nativa)

La auditoría del frontend en WebView detectó estos frentes, por orden de impacto:

1. **Descargas de PDF cliente (jsPDF/blob + `<a download>`)** — 15+ puntos en expedientes/lotes;
   en WKWebView no disparan nada visible. Solución: helper único que en nativo use
   `@capacitor/filesystem` + `@capacitor/share`, y en web siga igual.
2. **`window.open`/`target="_blank"` a Drive y externos** (30+ usos) — en WebView pueden no abrir.
   Solución: `@capacitor/browser` vía interceptor global.
3. **Empaquetar el frontend dentro de la app** (quitar `server.url`): requiere interceptor de
   `fetch` que prefije `https://app.brokergy.es` a las 352 llamadas relativas `/api/...`
   (1 fichero) + CORS en Express para `capacitor://localhost`. Obligatorio para App Store pública
   (Apple rechaza wrappers de web remota) y para Play Store.
4. **Cámara**: añadir `capture="environment"` a los inputs de foto de obra, o `@capacitor/camera`.
5. **Push**: `@capacitor/push-notifications` (avisos de expedientes, incidencias).
