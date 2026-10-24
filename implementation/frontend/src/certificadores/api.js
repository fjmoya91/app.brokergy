// ─── api.js — lo común para hablar con el backend ────────────────────────────
// Se usa el axios GLOBAL: CertappAuth le pone `Authorization: Bearer …` con la
// sesión de Supabase, y la envolvente (que es del CRM) también llama con él.
// SIN interceptor que cierre la sesión ante un 401: el del CRM lo hace y aquí
// sería un error (un 401 de una ruta que aún no existe no es una sesión caducada).
// Contrato: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

export const API = '/api/certapp';
export const API_ADMIN = '/api/certapp-admin';
export const API_PUB = '/api/public/certapp';

/** El cuerpo de error del servidor, si lo trae en JSON (`{ error, code }`). */
export function errorDe(err) {
    const d = err?.response?.data;
    return d && typeof d === 'object' ? d : {};
}

/**
 * Qué se le dice a quien está delante cuando algo falla. Nunca «Request failed
 * with status code 503»: qué ha pasado y qué puede hacer.
 */
export function mensajeError(err, porDefecto = 'No se ha podido completar. Vuelve a intentarlo.') {
    if (!err) return porDefecto;
    if (!err.response) {
        return err.message && !/network|failed to fetch|timeout/i.test(err.message)
            ? err.message
            : 'No hemos podido conectar. Revisa la conexión y vuelve a intentarlo.';
    }
    const st = err.response.status;
    const d = errorDe(err);
    if (st === 503) return d.error || 'No hemos podido cargar ahora mismo. Vuelve a intentarlo en unos segundos.';
    if (st === 413) return 'El fichero pesa demasiado. Prueba con menos fotos a la vez.';
    if (st === 429) return d.error || 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.';
    if (st >= 500) return d.error || 'Algo ha fallado en nuestro lado. Vuelve a intentarlo en un momento.';
    if (st === 404 && !d.error) return 'No lo encontramos (o ya no está disponible).';
    return d.error || porDefecto;
}

/** ¿El servidor está caído o la ruta todavía no existe? (para esconder, no para gritar) */
export function noDisponible(err) {
    const st = err?.response?.status;
    return !err?.response || st === 503 || st === 502 || st === 504 || (st === 404 && !errorDe(err).code);
}

/**
 * Cargar algo al montar, con su estado. `fn` recibe nada y devuelve una promesa
 * con los datos. `recargar()` lo vuelve a pedir (sin vaciar lo que había si
 * `silencioso`). Nunca deja una pantalla en blanco: o datos, o error, o cargando.
 */
export function useCarga(fn, deps = []) {
    const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const vivo = useRef(true);
    // true al montar (StrictMode monta, desmonta y vuelve a montar).
    useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

    const recargar = useCallback(async ({ silencioso = false } = {}) => {
        if (!silencioso) setEstado(e => ({ ...e, cargando: true, error: null }));
        try {
            const datos = await fnRef.current();
            if (vivo.current) setEstado({ datos, error: null, cargando: false });
            return datos;
        } catch (err) {
            if (vivo.current) setEstado(e => ({ ...e, error: err, cargando: false }));
            return null;
        }
    }, []);

    useEffect(() => { recargar(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps

    return { ...estado, recargar };
}

/** Lista que puede venir como array o envuelta (`{ obras: [...] }`, `{ items }`…). */
export function comoLista(data, ...claves) {
    if (Array.isArray(data)) return data;
    for (const k of [...claves, 'items', 'data', 'lista']) {
        if (Array.isArray(data?.[k])) return data[k];
    }
    return [];
}

/** Una URL de enlace que puede venir como cadena o como `{ url | link | href }`. */
export function urlDe(v) {
    if (!v) return null;
    if (typeof v === 'string') return v;
    return v.url || v.link || v.href || v.webViewLink || null;
}

/** Copiar al portapapeles, con respaldo para http y navegadores viejos. */
export async function alPortapapeles(texto) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch { /* cae al respaldo */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, texto.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/** Enlace de WhatsApp (lo abre el propio usuario: no se envía nada desde aquí). */
export function enlaceWhatsApp(texto, telefono = '') {
    let tel = String(telefono || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
    if (tel && tel.length === 9) tel = `34${tel}`;
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

/** Fecha corta española («24/10/2026») o «—». */
export function fecha(v, conHora = false) {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    const f = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return conHora ? `${f} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : f;
}

/** «hace 5 min», «ayer», o la fecha. */
export function haceCuanto(v) {
    if (!v) return '—';
    const d = new Date(v);
    const s = (Date.now() - d.getTime()) / 1000;
    if (Number.isNaN(s)) return '—';
    if (s < 60) return 'ahora mismo';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    if (s < 172800) return 'ayer';
    return fecha(v);
}

export { axios };
