// ─── «Le compra a…»: a qué distribuidores le COMPRA este instalador (solo ADMIN) ──
// Fran, 22/11/2026: «RCA trabaja con Electrofil, pero también ponle con Calindsa».
// Decide qué tarifas ve el instalador en el Catálogo de su app y a qué comercial le
// puede pedir un equipo. NO es la «red» del distribuidor (`distribuidor_instalador`),
// que le da al distribuidor visibilidad sobre los clientes y obras del instalador:
// esto solo dice a quién le compra. Se guarda AL MOMENTO con su propia ruta
// (PUT /api/aerotermia/tarifas/proveedores/:id, adminOnly), no con el «Guardar» de la ficha.
// Ver docs/conocimiento/instalador-app/catalogo-por-distribuidor.md.
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const B = '/api/aerotermia/tarifas';
export const apiProveedores = {
    distribuidores: () => axios.get(`${B}/distribuidores`).then((r) => r.data.distribuidores || []),
    leer: (id) => axios.get(`${B}/proveedores/${id}`).then((r) => r.data.distribuidores || []),
    guardar: (id, lista) => axios.put(`${B}/proveedores/${id}`, { distribuidores: lista }).then((r) => r.data),
};
const mensaje = (e, d) => e?.response?.data?.error || d;

export function LeCompraA({ instaladorId, api = apiProveedores }) {
    const [todos, setTodos] = useState(null);   // [{ id, nombre, razon_social }]
    const [suyos, setSuyos] = useState([]);     // [id]
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [ok, setOk] = useState('');

    useEffect(() => {
        let vivo = true;
        setTodos(null); setError('');
        Promise.all([api.distribuidores(), api.leer(instaladorId)])
            .then(([t, s]) => { if (vivo) { setTodos(t); setSuyos(s); } })
            .catch((e) => { if (vivo) { setTodos([]); setError(mensaje(e, 'No se ha podido cargar a quién compra.')); } });
        return () => { vivo = false; };
    }, [instaladorId, api]);

    const guardar = async (lista) => {
        const antes = suyos;
        setSuyos(lista); setGuardando(true); setError(''); setOk('');
        try {
            const r = await api.guardar(instaladorId, lista);
            setSuyos(r.distribuidores || lista);
            setOk('Guardado');
            setTimeout(() => setOk(''), 2000);
        } catch (e) {
            setSuyos(antes);
            setError(mensaje(e, 'No se ha podido guardar.'));
        } finally { setGuardando(false); }
    };

    if (todos == null) return <p className="text-xs text-white/35">Cargando distribuidores…</p>;
    const nombre = new Map(todos.map((d) => [d.id, d.nombre]));
    const libres = todos.filter((d) => !suyos.includes(d.id));

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-white/40">
                En el Catálogo de su app verá la tarifa de cada uno y podrá pedirle un equipo a su comercial.
                No le da al distribuidor acceso a sus clientes (eso es la red del distribuidor).
            </p>
            <div className="flex flex-wrap gap-2">
                {suyos.length === 0 && <span className="text-xs text-white/30 italic">Todavía no le compra a ninguno.</span>}
                {suyos.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 pl-3 pr-0.5 min-h-[44px] rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-200 text-xs font-bold">
                        {nombre.get(id) || 'Distribuidor'}
                        <button type="button" disabled={guardando} onClick={() => guardar(suyos.filter((x) => x !== id))}
                            aria-label={`Quitar ${nombre.get(id) || 'distribuidor'}`}
                            className="w-11 h-11 grid place-items-center rounded-md text-sky-200/60 hover:text-white hover:bg-white/10 disabled:opacity-40">✕</button>
                    </span>
                ))}
            </div>
            {libres.length > 0 && (
                <select value="" disabled={guardando} onChange={(e) => { if (e.target.value) guardar([...suyos, e.target.value]); }}
                    className="min-h-[44px] w-full sm:w-auto bg-bkg-deep border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2 text-sm text-white outline-none [color-scheme:dark] disabled:opacity-60">
                    <option value="">+ Añadir distribuidor…</option>
                    {libres.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
            )}
            {todos.length === 0 && !error && <p className="text-[11px] text-white/35">No hay empresas DISTRIBUIDOR dadas de alta.</p>}
            <div aria-live="polite" className="min-h-[16px] text-[11px]">
                {guardando && <span className="text-white/40">Guardando…</span>}
                {ok && <span className="text-emerald-400">✓ {ok}</span>}
                {error && <span className="text-amber-300">{error}</span>}
            </div>
        </div>
    );
}
