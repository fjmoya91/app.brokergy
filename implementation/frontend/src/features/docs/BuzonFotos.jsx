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
import { ClasificandoFotos } from './ClasificandoFotos';

const CONFIANZA_UI = {
    alta: { cls: 'text-emerald-300', txt: 'Seguro' },
    media: { cls: 'text-amber-300', txt: 'Probable' },
    baja: { cls: 'text-white/40', txt: 'Dudoso' },
};

export function BuzonFotos({ idOrUuid, files, slots, addableConcepts = [], onSubir, onCerrar, onAnadirApartado = null, adminBase = '/api/oportunidades' }) {
    // Una fila por fichero: su miniatura local, el destino elegido y lo que el
    // modelo dijo haber visto (que es lo que permite confirmar sin abrir la foto).
    const [filas, setFilas] = useState(() => Array.from(files || []).map((f, i) => ({
        id: `${i}-${f.name}-${f.size}`,
        file: f,
        slot: '',
        visto: '',
        confianza: null,
        concepto: null,   // lo que el modelo cree que es, aunque aquí no haya apartado
    })));
    const [leyendo, setLeyendo] = useState(false);
    // Cuántas fotos van reducidas. Es el ÚNICO tramo que se puede contar de
    // verdad —ocurre aquí—, así que se enseña; lo que pasa en el servidor va
    // por tiempo. `null` = ya han salido.
    const [preparadas, setPreparadas] = useState(null);
    const [error, setError] = useState(null);
    const [subiendo, setSubiendo] = useState(null); // { hecho, total }
    const lanzado = useRef(false);

    // ── Las miniaturas ──────────────────────────────────────────────────────
    // Los `objectURL` se crean AQUÍ y no en el estado inicial. Creados allí, el
    // cleanup de este efecto los revocaba y no se volvían a crear: React monta,
    // desmonta y remonta en StrictMode (desarrollo), y al remontar el estado se
    // RESTAURA en vez de recalcularse — así que las trece miniaturas salían rotas
    // y era imposible clasificar nada sin ver la foto. Creándolos en el efecto, el
    // ciclo de StrictMode los revoca y los vuelve a crear, que es lo correcto.
    //
    // Y hay que soltarlos: veinte fotos de móvil retenidas son cien megas que el
    // navegador no recupera solo.
    const [urls, setUrls] = useState({});
    useEffect(() => {
        const m = {};
        for (const f of filas) {
            if (f.file?.type?.startsWith('image/')) m[f.id] = URL.createObjectURL(f.file);
        }
        setUrls(m);   // sincronizar con un recurso externo es justo para lo que está el efecto
        return () => Object.values(m).forEach(u => URL.revokeObjectURL(u));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- los ficheros no cambian mientras el buzón está abierto

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
        setPreparadas(0);
        try {
            // Se manda una copia MUY reducida: lo que hay que reconocer es qué
            // aparato sale, no leer su nº de serie. Subir después va con el
            // fichero de verdad.
            const form = new FormData();
            let hechas = 0;
            for (const f of imagenes) {
                form.append('files', await miniaturaParaMirar(f.file));
                setPreparadas(++hechas);
            }
            setPreparadas(null);   // a partir de aquí manda el servidor
            const { data } = await axios.post(`${adminBase}/${idOrUuid}/docs/clasificar`, form, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 3 * 60 * 1000,
            });
            const prop = data?.propuesta || [];
            setFilas(prev => prev.map(fila => {
                const i = imagenes.findIndex(x => x.id === fila.id);
                const p = i >= 0 ? prop[i] : null;
                if (!p) return fila;
                return {
                    ...fila, slot: p.slot || '', visto: p.que_se_ve || '', confianza: p.confianza || null,
                    concepto: p.concepto || null, conceptoLabel: p.concepto_label || null, fase: p.fase || 'ANTES',
                };
            }));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudieron leer las fotos. Colócalas a mano.');
        } finally {
            setPreparadas(null);
            setLeyendo(false);
        }
    };

    const setSlot = (id, slot) => setFilas(prev => prev.map(f => (f.id === id ? { ...f, slot } : f)));
    const quitar = (id) => setFilas(prev => prev.filter(f => f.id !== id));

    // ── Lo que este expediente NO contempla ─────────────────────────────────
    // Cuatro fotos de ventanas en un RES060 (cuya ficha no cubre envolvente) se
    // quedaban "sin clasificar" y ahí morían: trece casillas vacías y ninguna
    // pista de qué hacer con ellas. El modelo dice QUÉ son aunque no haya dónde
    // ponerlas, y aquí se ofrece añadir ese apartado — el mismo botón "Añadir
    // apartado de obra" que ya existe, traído a donde hace falta.
    const faltanApartados = useMemo(() => {
        const m = new Map();
        for (const f of filas) {
            if (f.slot || !f.concepto) continue;
            if (!m.has(f.concepto)) m.set(f.concepto, { id: f.concepto, label: f.conceptoLabel || f.concepto, n: 0 });
            m.get(f.concepto).n++;
        }
        return [...m.values()];
    }, [filas]);

    // Ver la foto en grande. A 56 px no se distingue "ventana de cocina" de
    // "ventana de baño", y confirmar la propuesta es justo eso.
    const [visor, setVisor] = useState(null);

    const [anadiendo, setAnadiendo] = useState(null);
    const anadirApartado = async (conceptId) => {
        if (!onAnadirApartado || anadiendo) return;
        setAnadiendo(conceptId);
        try {
            const nuevos = await onAnadirApartado(conceptId);
            // Las fotos de ese concepto se colocan solas en el apartado de SU fase:
            // añadir el apartado y dejarlas igual de huérfanas no resolvería nada.
            setFilas(prev => prev.map(f => {
                if (f.slot || f.concepto !== conceptId) return f;
                const candidatos = (nuevos || []).filter(s => (s.concepto === conceptId) || sDelConcepto(s, conceptId));
                const elegido = candidatos.find(s => s.fase === (f.fase || 'ANTES')) || candidatos[0];
                return elegido ? { ...f, slot: elegido.key } : f;
            }));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo añadir el apartado.');
        } finally {
            setAnadiendo(null);
        }
    };
    // Qué slots pertenecen a un concepto. Sale de `addableConcepts`, que es la
    // MISMA lista con la que el backend decide qué se puede activar.
    const sDelConcepto = (slot, conceptId) => {
        const c = (addableConcepts || []).find(x => x.id === conceptId);
        return !!c && (c.slots || []).includes(slot.key);
    };

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
        <>
        {leyendo && <ClasificandoFotos total={filas.filter(f => f.file.type?.startsWith('image/')).length} preparadas={preparadas} />}
        {visor && urls[visor] && (
            <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/95 p-4 cursor-zoom-out" onClick={() => setVisor(null)}>
                <img src={urls[visor]} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
                <p className="absolute bottom-5 left-0 right-0 text-center text-white/50 text-xs font-bold">
                    {filas.find(f => f.id === visor)?.visto || filas.find(f => f.id === visor)?.file?.name}
                    <span className="block mt-1 text-white/30">Pulsa para cerrar</span>
                </p>
            </div>
        )}
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

                {/* Reconocidas, pero sin sitio donde ponerlas en ESTE expediente. */}
                {faltanApartados.length > 0 && onAnadirApartado && (
                    <div className="mx-6 mt-4 space-y-2">
                        {faltanApartados.map(c => (
                            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-4 py-2.5">
                                <p className="text-xs text-white/70 leading-snug min-w-0">
                                    <strong className="text-sky-200">{c.n} {c.n === 1 ? 'foto parece' : 'fotos parecen'} de {c.label.replace(/\s*\(.*\)$/, '').toLowerCase()}</strong>
                                    {' '}· este expediente no tiene ese apartado.
                                </p>
                                <button onClick={() => anadirApartado(c.id)} disabled={!!anadiendo}
                                    className="shrink-0 px-3 py-1.5 rounded-lg border border-sky-400/40 text-sky-200 text-[10px] font-black uppercase tracking-wider hover:bg-sky-400/15 transition-all disabled:opacity-40">
                                    {anadiendo === c.id ? 'Añadiendo…' : '➕ Añadir apartado'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="p-6 overflow-y-auto space-y-2 flex-1">
                    {filas.map(f => (
                        <div key={f.id} className={`flex items-center gap-3 rounded-2xl border-2 p-2.5 transition-all ${f.slot ? 'border-white/10 bg-white/[0.03]' : 'border-amber-400/25 bg-amber-400/[0.04]'}`}>
                            <button type="button" onClick={() => urls[f.id] && setVisor(f.id)}
                                title={urls[f.id] ? 'Ver la foto en grande' : undefined}
                                className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-white/[0.04] shrink-0 flex items-center justify-center hover:border-white/30 transition-all">
                                {urls[f.id]
                                    ? <img src={urls[f.id]} alt="" className={`w-full h-full object-cover ${leyendo ? 'opacity-50' : ''}`} />
                                    : <span className="text-2xl">📄</span>}
                            </button>
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
                            {subiendo ? `Subiendo… ${subiendo.hecho}/${subiendo.total}` : leyendo ? 'Leyendo…'
                                : `Subir ${filas.length - sinDestino} archivo${filas.length - sinDestino === 1 ? '' : 's'}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}

export default BuzonFotos;
