// ─── flag.js — ¿está activa la DEMO con datos simulados? (solo desarrollo) ───
// `?demo=1` en la URL la enciende (sessionStorage, se va al cerrar la pestaña) y
// `?demo=0` la apaga. En el build de producción `import.meta.env.DEV` es false:
// esto siempre devuelve false y los datos simulados (dev/demo.js) no se empaquetan.
// ─────────────────────────────────────────────────────────────────────────────

export function leerFlagDemoDeLaUrl() {
    if (!import.meta.env.DEV) return false;
    try {
        const q = new URLSearchParams(window.location.search).get('demo');
        if (q === '1') sessionStorage.setItem('certapp_demo', '1');
        if (q === '0') { sessionStorage.removeItem('certapp_demo'); sessionStorage.removeItem('certapp_demo_sesion'); }
        return sessionStorage.getItem('certapp_demo') === '1';
    } catch {
        return false;
    }
}

export function demoActiva() {
    if (!import.meta.env.DEV) return false;
    try { return sessionStorage.getItem('certapp_demo') === '1'; } catch { return false; }
}
