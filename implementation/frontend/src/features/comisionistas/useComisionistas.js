// ─── Lista de COMISIONISTAS, compartida por toda la pantalla ─────────────────
// La piden a la vez cada fila del listado de oportunidades, la cabecera del
// expediente y la calculadora: con un `useEffect` por componente serían cientos
// de peticiones iguales. Se pide UNA vez por sesión de pantalla y quien da de
// alta a alguien la refresca para todos (`recargarComisionistas`).
//
// Solo para el equipo interno: `/api/comisionistas` es staffOnly. Lo pactado
// (comision_*) y las sumas solo llegan a ADMIN — el backend lo poda.
import { useEffect, useState } from 'react';
import axios from 'axios';

let cache = null;          // array | null
let enVuelo = null;        // Promise | null
const oyentes = new Set();

const avisar = () => oyentes.forEach(fn => fn(cache));

export function recargarComisionistas() {
    enVuelo = axios.get('/api/comisionistas')
        .then(r => { cache = Array.isArray(r.data) ? r.data : []; avisar(); return cache; })
        .catch(err => { console.warn('[comisionistas] no se han podido cargar:', err?.message); if (!cache) cache = []; avisar(); return cache; })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

export function useComisionistas(activo = true) {
    const [lista, setLista] = useState(cache || []);
    useEffect(() => {
        if (!activo) return undefined;
        oyentes.add(setLista);
        if (cache) setLista(cache);
        else if (!enVuelo) recargarComisionistas();
        return () => { oyentes.delete(setLista); };
    }, [activo]);
    return lista;
}

export const nombreComisionista = (lista, id) =>
    (id && (lista || []).find(c => String(c.id) === String(id))?.nombre) || '';
