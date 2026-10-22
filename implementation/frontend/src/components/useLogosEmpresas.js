import { useEffect, useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// LOGOS EN MINIATURA para pintarlos a 16-28 px en un listado.
//
// `prescriptores.logo_empresa` es un data URL a tamaño de papel (se imprime en
// las propuestas): entre todas las empresas son ~8 MB, para pintar cuadraditos.
// Aquí se piden UNA vez (`POST /api/prescriptores/logos`), se reducen en el
// navegador a 64 px y se guardan con su huella en este navegador; en las
// siguientes visitas solo viaja el logo que haya cambiado.
//
// El almacenamiento es una comodidad: si falla, se piden otra vez y ya está.
// Sin logo, `LogoEmpresa` pinta las iniciales.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'brokergy.logos.mini.v1';
const LADO = 64;

const leer = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { return {}; }
};
const guardar = (m) => {
    try { localStorage.setItem(CLAVE, JSON.stringify(m)); } catch { /* sin almacenamiento */ }
};
const soloSrc = (m) => Object.fromEntries(Object.entries(m).map(([id, v]) => [id, v?.src]).filter(([, s]) => s));

// Encaja el logo en un cuadrado de LADO px sin deformarlo. Si no se puede
// dibujar (formato raro), se queda el original: mejor pesado que sin logo.
function reducir(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const k = Math.min(1, LADO / Math.max(img.naturalWidth || LADO, img.naturalHeight || LADO));
                const w = Math.max(1, Math.round((img.naturalWidth || LADO) * k));
                const h = Math.max(1, Math.round((img.naturalHeight || LADO) * k));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const mini = canvas.toDataURL('image/png');
                resolve(mini.length < src.length ? mini : src);
            } catch { resolve(src); }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/** @returns {Record<string, string>} id_empresa -> data URL en miniatura */
export function useLogosEmpresas(ids) {
    const clave = [...new Set((ids || []).filter(Boolean).map(String))].sort().join(',');
    const [logos, setLogos] = useState(() => soloSrc(leer()));

    useEffect(() => {
        if (!clave) return;
        let vivo = true;
        (async () => {
            const cache = leer();
            const lista = clave.split(',');
            const tengo = Object.fromEntries(lista.filter(id => cache[id]?.h).map(id => [id, cache[id].h]));
            const { data } = await axios.post('/api/prescriptores/logos', { ids: lista, tengo });
            let cambia = false;
            for (const id of lista) {
                const r = data?.[id];
                if (!r) continue;
                if (!r.h) { if (cache[id]) { delete cache[id]; cambia = true; } continue; }
                if (r.src) {
                    const src = await reducir(r.src);
                    if (src) cache[id] = { h: r.h, src }; else delete cache[id];
                    cambia = true;
                }
            }
            if (!cambia) return;
            guardar(cache);
            if (vivo) setLogos(soloSrc(cache));
        })().catch(() => { /* sin logos se pintan las iniciales */ });
        return () => { vivo = false; };
    }, [clave]);

    return logos;
}

export default useLogosEmpresas;
