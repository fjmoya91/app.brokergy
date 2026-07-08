// Brokergy — conmutador de tema día/noche (sin dependencias).
// Tema oscuro por defecto (:root); el claro se activa con la clase
// `theme-light` en <html>. La elección se guarda en localStorage.

const STORAGE_KEY = 'brokergy-theme';

function safeGet() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function safeSet(v) {
  try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage bloqueado */ }
}

/** Devuelve 'light' | 'dark' según la clase actual del <html>. */
export function getTheme() {
  return document.documentElement.classList.contains('theme-light') ? 'light' : 'dark';
}

/** Aplica un tema concreto ('light' | 'dark') y lo persiste. */
export function setTheme(theme) {
  const light = theme === 'light';
  document.documentElement.classList.toggle('theme-light', light);
  safeSet(light ? 'light' : 'dark');
  return getTheme();
}

/** Alterna entre claro y oscuro. */
export function toggleTheme() {
  return setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

/**
 * Inicializa el tema en la carga: usa la elección guardada, o si no hay,
 * respeta la preferencia del sistema operativo (prefers-color-scheme).
 */
export function initTheme() {
  const saved = safeGet();
  if (saved === 'light' || saved === 'dark') {
    setTheme(saved);
  } else {
    const prefersLight = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.classList.toggle('theme-light', prefersLight);
  }
  return getTheme();
}
