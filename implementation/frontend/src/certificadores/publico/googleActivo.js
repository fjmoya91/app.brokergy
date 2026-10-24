// ─── googleActivo — ¿está activado «Continuar con Google»? ──────────────────
// El botón se enseña solo si Google está activado en Supabase (Auth → Providers):
// con él apagado, signInWithOAuth lleva a una página de error de Supabase. Se
// pregunta una vez por carga a `/auth/v1/settings` (público con la clave anon).
import { useEffect, useState } from 'react';
import { demoActiva } from '../dev/flag';

let promesa = null;
function consultar() {
    if (!promesa) {
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        promesa = !url || !key
            ? Promise.resolve(false)
            : fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
                .then(r => (r.ok ? r.json() : null))
                .then(s => s?.external?.google === true)
                .catch(() => false);
    }
    return promesa;
}

/** En la demo, siempre; si no, hasta saberlo, no. */
export function useGoogleActivo() {
    const demo = demoActiva();
    const [activo, setActivo] = useState(demo);
    useEffect(() => {
        if (demo) return undefined;
        let vivo = true;
        consultar().then(a => { if (vivo) setActivo(a); });
        return () => { vivo = false; };
    }, [demo]);
    return activo;
}
