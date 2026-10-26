// ─── menuObra.js — la obra abierta cuenta sus partes al menú lateral ─────────
// (Fuera de ui/Marco.jsx: react-refresh pide que un .jsx solo exporte componentes.)
import { createContext, useContext, useEffect } from 'react';

export const MenuObraCtx = createContext(null);

/**
 * La obra abierta cuenta sus partes al menú lateral (ui/Marco.jsx). `nav`:
 * `{ numero, titulo, items: [{ id, label, to, act?, hecho?, num?, n? }] }` o null.
 * `num`: el número de la fase (con ✓ si `hecho`); `n`: el contador de la derecha.
 */
export function useMenuObra(nav) {
    const poner = useContext(MenuObraCtx);
    const clave = nav ? JSON.stringify(nav) : '';
    useEffect(() => {
        if (!poner) return undefined;
        poner(clave ? JSON.parse(clave) : null);
        return () => poner(null);
    }, [poner, clave]);
}
