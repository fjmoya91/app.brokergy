// Puente nativo (Capacitor) — hace que la web funcione DENTRO de la app iOS/Android.
//
// En un WebView nativo dos cosas de la web se rompen y aquí se reparan de forma global,
// sin tocar los ~45 componentes que las usan:
//   1. Descargas de PDF/imagen por blob (jsPDF → <a download> → click()) → no hacen nada
//      visible en WKWebView. Aquí se interceptan y se guardan a fichero + hoja de compartir
//      (Guardar en Archivos, AirDrop, WhatsApp, Mail…).
//   2. Enlaces externos a Google Drive y demás (window.open / <a target="_blank">) → en
//      WebView pueden no abrir nada. Aquí se abren en el navegador in-app.
//
// Todo está detrás de Capacitor.isNativePlatform(): en navegador de escritorio y en la
// PWA de iPhone este módulo es INERTE y la web se comporta exactamente igual que hoy.

import { Capacitor } from '@capacitor/core';

let installed = false;

export async function initNativeBridge() {
  if (installed) return;
  if (!Capacitor?.isNativePlatform?.()) return; // solo dentro de la app nativa
  installed = true;

  const [
    { Browser },
    { Share },
    { Filesystem, Directory },
    { StatusBar, Style },
    { SplashScreen },
  ] = await Promise.all([
    import('@capacitor/browser'),
    import('@capacitor/share'),
    import('@capacitor/filesystem'),
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
  ]);

  // --- Mapa blob:URL -> Blob: conserva el Blob original aunque el código de la app
  //     llame a revokeObjectURL inmediatamente después de click() (patrón de ProposalModal). ---
  const blobMap = new Map();
  const origCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const url = origCreateObjectURL(obj);
    try {
      if (obj instanceof Blob) {
        blobMap.set(url, obj);
        if (blobMap.size > 40) blobMap.delete(blobMap.keys().next().value); // cota de memoria
      }
    } catch { /* noop */ }
    return url;
  };

  const isExternalHttp = (url) =>
    /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
  const isDownloadable = (url) => /^(blob:|data:)/i.test(url);

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error);
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.readAsDataURL(blob);
    });

  async function resolveBlob(blobOrUrl) {
    if (blobOrUrl instanceof Blob) return blobOrUrl;
    const url = String(blobOrUrl);
    if (blobMap.has(url)) return blobMap.get(url);
    const res = await fetch(url); // data: o blob: aún vivo
    return await res.blob();
  }

  async function saveAndShare(blobOrUrl, filename) {
    try {
      const blob = await resolveBlob(blobOrUrl);
      const base64 = await blobToBase64(blob);
      const safe = (filename || 'documento').replace(/[/\\:*?"<>|]+/g, '_');
      const written = await Filesystem.writeFile({
        path: safe,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ title: safe, url: written.uri });
    } catch (e) {
      // Usuario canceló la hoja de compartir, o el blob ya no existe: silencioso.
      if (e && e.message && !/cancel/i.test(e.message)) {
        console.warn('[nativeBridge] guardar/compartir falló:', e.message);
      }
    }
  }

  async function openExternal(url) {
    try {
      await Browser.open({ url });
    } catch (e) {
      console.warn('[nativeBridge] abrir enlace externo falló:', e?.message);
    }
  }

  // --- Interceptor global de clicks (fase de captura, en document = por encima de React) ---
  document.addEventListener(
    'click',
    (ev) => {
      const anchor = ev.target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const hasDownload = anchor.hasAttribute('download');
      const targetBlank = anchor.getAttribute('target') === '_blank';

      // 1) Descarga de fichero generado en cliente (PDF, imagen…)
      if (hasDownload && isDownloadable(href)) {
        ev.preventDefault();
        saveAndShare(href, anchor.getAttribute('download') || 'documento.pdf');
        return;
      }
      // 2) Enlace externo (Drive, EPREL, firma…) que iría a una pestaña inexistente
      if (isExternalHttp(href) && targetBlank) {
        ev.preventDefault();
        openExternal(href);
      }
    },
    true,
  );

  // --- window.open: usado para abrir Drive y algún PDF blob ---
  const origWindowOpen = window.open.bind(window);
  window.open = (url, ...rest) => {
    const u = typeof url === 'string' ? url : '';
    if (isDownloadable(u)) {
      saveAndShare(u, 'documento.pdf');
      return null;
    }
    if (isExternalHttp(u)) {
      openExternal(u);
      return null;
    }
    return origWindowOpen(url, ...rest);
  };

  // --- Chrome nativo: barra de estado acorde al tema y ocultar splash al arrancar ---
  try {
    const isLight = document.documentElement.classList.contains('theme-light');
    await StatusBar.setStyle({ style: isLight ? Style.Light : Style.Dark });
  } catch { /* Android sin overlay / no soportado */ }
  try {
    await SplashScreen.hide();
  } catch { /* noop */ }
}
