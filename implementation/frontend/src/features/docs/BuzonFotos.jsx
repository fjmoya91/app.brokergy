/**
 * BuzonFotos — se sueltan TODAS las fotos de la obra de golpe y se reparten.
 *
 * El admin recibe la documentación como llega: veinte imágenes de un chat, con
 * nombres tipo `IMG-20260919-WA0007.jpg`. Colocarlas era abrir veinte casillas y
 * soltar veinte veces, mirando cada foto para acordarse de cuál era la unidad
 * exterior y cuál la interior.
 *
 * Aquí se sueltan todas, un modelo PROPONE el apartado de cada una (y lo dice:
 * "caldera mural de gas"), y quien mira confirma o corrige con un desplegable.
 * Nada se sube hasta que se pulsa: la clasificación es una propuesta, no una
 * decisión — mismo reparto que el resto de lectores de la casa.
 *
 * Solo modo ADMIN: detrás de la clasificación hay una llamada de pago, y el
 * cliente sube por su enlace, apartado a apartado y guiado.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { miniaturaParaMirar } from '../../utils/imageResize';

const CONFIANZA_UI = {
    alta: { cls: 'text-emerald-300', txt: 'Seguro' },
    media: { cls: 'text-amber-300', txt: 'Probable' },
    baja: { cls: 'text-white/40', txt: 'Dudoso' },
};

export function BuzonFotos({ idOrUuid, files, slots, onSubir, onCerrar }) {
    // Una fila por fichero: su miniatura local, el destino elegido y lo que el
    // modelo dijo haber visto (que es lo que permite confirmar sin abrir la foto).
    const [filas, setFilas] = useState(() => Array.from(files || []).map((f, i) => ({
        id: `${i}-${f.name}-${f.size}`,
        file: f,
        url: f.type?.startsWith('image/') ? URL.createObjectURL(f) : null,
        slot: '',
        visto: '',
        confianza: null,
    })));
    const [leyendo, setLeyendo] = useState(false);
    const [error, setError] = useState(null);
    const [subiendo, setSubiendo] = useState(null); // { hecho, total }
    const lanzado = useRef(false);

    // Los objectURL se sueltan al cerrar: veinte fotos de móvil retenidas en
    // memoria son cien megas que el navegador no recupera solo.
    useEffect(() => () => filas.forEach(f => f.url && URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

    // Destinos que se pueden elegir a mano. "Otros" SÍ aparece aquí aunque no se
    // proponga solo: es donde va a parar lo que no encaja, y es una decisión de
    // la persona, no del modelo.
    const opciones = useMemo(
        () => (slots || []).filter(s => !s.existing).map(s => ({
            key: s.key, label: s.label, fase: s.fase === 'DESPUES' ? 'Después' : 'Antes',
        })),
        [slots]
    );

    // La clasificación salta SOLA al abrir: es lo que se viene a hacer, y dejarla
    // detrás de un botón la convierte en un paso que nadie da.
    useEffect(() => {
        if (lanzado.current) return;
        lanzado.current = true;
        clasificar();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const clasificar = async () => {
        const imagenes = filas.filter(f => f.file.type?.startsWith('image/'));
        if (!imagenes.length) return;      // solo documentos: no hay nada que mirar
        setLeyendo(true);
        setError(null);
        try {
            // Se manda una copia MUY reducida: lo que hay que reconocer es qué
            // aparato sale, no leer su nº de serie. Subir después va con el
            // fichero de verdad.
            const form = new FormData();
            for (const f of imagenes) form.append('files', await miniaturaParaMirar(f.file));
            const { data } = await axios.post(`/api/oportunidades/${idOrUuid}/docs/clasificar`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 3 * 60 * 1000,
            });
            const prop = data?.propuesta || [];
            setFilas(prev => prev.map(fila => {
                const i = imagenes.findIndex(x => x.id === fila.id);
                const p = i >= 0 ? prop[i] : null;
                if (!p) return fila;
                return { ...fila, slot: p.slot || '', visto: p.que_se_ve || '', confianza: p.confianza || null };
            }));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudieron leer las fotos. Colócalas a mano.');
        } finally {
            setLeyendo(false);
        }
    };

    const setSlot = (id, slot) => setFilas(prev => prev.map(f => (f.id === id ? { ...f, slot } : f)));
    const quitar = (id) => setFilas(prev => prev.filter(f => f.id !== id));

    // Se agrupan por destino y se sube un grupo por tanda: la subida ya va en
    // paralelo dentro de cada apartado, así que repartir en más peticiones no
    // ganaría nada y sí complicaría decir por dónde va.
    const grupos = useMemo(() => {
        const m = new Map();
        for (const f of filas) {
            if (!f.slot) continue;
            if (!m.has(f.slot)) m.set(f.slot, []);
            m.get(f.slot).push(f.file);
        }
        return m;
    }, [filas]);

    const sinDestino = filas.filter(f => !f.slot).length;

    const subir = async () => {
        if (!grupos.size) return;
        const total = grupos.size;
        let hecho = 0;
        setSubiendo({ hecho, total });
        for (const [key, archivos] of grupos) {
            const slot = (slots || []).find(s => s.key === key);
            if (slot) await onSubir(slot, archivos);
            setSubiendo({ hecho: ++hecho, total });
        }
        setSubiendo(null);
        onCerrar();
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onCerrar}>
            <div className="bg-[#0F1013] border border-white/10 rounded-3xl w-full max-w-3xl flex flex-col max-h-[92vh] shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <span className="text-amber-400">🗂️</span> Repartir {filas.length} archivo{filas.length === 1 ? '' : 's'}
                        </h3>
                        <p className="text-white/40 text-[11px] mt-0.5">
                            {leyendo ? 'Mirando las fotos para proponer su sitio…'
                                : 'Comprueba el apartado de cada una y corrige lo que no cuadre.'}
                        </p>
                    </div>
                    <button onClick={onCerrar} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-amber-200 text-xs font-bold flex items-center justify-between gap-3">
                        <span>{error}</span>
                        <button onClick={clasificar} className="underline underline-offset-2 hover:text-white shrink-0">Reintentar</button>
                    </div>
                )}

                <div className="p-6 overflow-y-auto space-y-2 flex-1">
                    {filas.map(f => (
                        <div key={f.id} className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 transition-all ${f.slot ? 'border-white/10 bg-white/[0.03]' : 'border-amber-400/25 bg-amber-400/[0.04]'}`}>
                            <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-white/[0.04] shrink-0 flex items-center justify-center">
                                {f.url
                                    ? <img src={f.url} alt="" className={`w-full h-full object-cover ${leyendo ? 'opacity-50' : ''}`} />
                                    : <span className="text-2xl">📄</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                                <select
                                    value={f.slot}
                                    onChange={e => setSlot(f.id, e.target.value)}
                                    className="w-full bg-white/[0.06] border-2 border-white/10 focus:border-amber-400 rounded-xl px-3 py-2 text-white text-sm font-bold outline-none"
                                >
                                    <option value="">— Sin clasificar —</option>
                                    {opciones.map(o => (
                                        <option key={o.key} value={o.key}>{o.fase} · {o.label}</option>
                                    ))}
                                </select>
                                <p className="mt-1 text-[10px] flex items-center gap-2 min-w-0">
                                    <span className="text-white/30 truncate max-w-[45%]" title={f.file.name}>{f.file.name}</span>
                                    {f.visto && <span className="text-white/50 truncate">· {f.visto}</span>}
                                    {f.confianza && <span className={`font-black uppercase tracking-wider shrink-0 ${CONFIANZA_UI[f.confianza].cls}`}>· {CONFIANZA_UI[f.confianza].txt}</span>}
                                </p>
                            </div>
                            <button onClick={() => quitar(f.id)} title="Quitar de la lista"
                                className="w-8 h-8 rounded-lg text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-all shrink-0 font-black">✕</button>
                        </div>
                    ))}
                </div>

                <div className="px-6 py-4 bg-black/30 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
                    <p className="text-[11px] font-bold text-white/40">
                        {sinDestino > 0
                            ? <>Se subirán <span className="text-white/70">{filas.length - sinDestino}</span> · <span className="text-amber-300">{sinDestino} sin clasificar</span> (no se suben)</>
                            : <>Listas para subir: <span className="text-white/70">{filas.length}</span></>}
                    </p>
                    <div className="flex items-center gap-3">
                        <button onClick={onCerrar} disabled={!!subiendo} className="px-4 py-2 text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest disabled:opacity-40">Cancelar</button>
                        <button onClick={subir} disabled={leyendo || !grupos.size || !!subiendo}
                            className="px-6 py-2.5 text-xs font-black rounded-xl uppercase tracking-widest bg-amber-500 hover:bg-amber-400 text-black transition-all disabled:opacity-40">
                            {subiendo ? `Subiendo… ${subiendo.hecho}/${subiendo.total}` : leyendo ? 'Leyendo…' : `Subir a ${grupos.size} apartado${grupos.size === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BuzonFotos;
