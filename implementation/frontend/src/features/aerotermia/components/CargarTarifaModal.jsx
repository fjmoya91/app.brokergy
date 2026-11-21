// ─── Cargar la tarifa de un distribuidor por Excel (solo ADMIN, fase 4) ──────
// SIEMPRE en dos pasos: 1) se lee EN SECO (no se escribe nada) y se enseña lo que
// casa, lo que no y lo que cambia de precio; 2) «Guardar» manda el MISMO fichero con
// la firma de lo enseñado y el servidor solo escribe si coincide (si no, 409 y se
// vuelve a leer). Lo ambiguo y lo que no casa NO se carga: lo ambiguo se resuelve
// eligiendo aquí su modelo (y volviendo a leer); lo que no casa, en el catálogo.
// Nunca se crea un modelo desde el Excel. El Excel no se guarda en ningún sitio.
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

const B = '/api/aerotermia/tarifas';
export const apiTarifas = {
    plantilla: () => axios.get(`${B}/plantilla`, { responseType: 'blob' }).then((r) => r.data),
    leer: (form) => axios.post(`${B}/leer`, form).then((r) => r.data),
    confirmar: (form) => axios.post(`${B}/confirmar`, form).then((r) => r.data),
};

const hoy = () => new Date().toISOString().slice(0, 10);
// `useGrouping: 'always'`: en es-ES un número de 4 cifras no lleva punto de miles («5990,00»).
const eur = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €` : '—');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const mensaje = (e, d) => e?.response?.data?.error || d;

const PESTANAS = [
    { key: 'guardar', texto: 'Se guardan', de: (f) => f.estado === 'CASA' && f.cambio !== 'IGUAL' },
    { key: 'ambiguas', texto: 'Elegir modelo', de: (f) => f.estado === 'AMBIGUA' },
    { key: 'fuera', texto: 'No casan', de: (f) => ['SIN_PAREJA', 'ERROR', 'DUPLICADA'].includes(f.estado) },
    { key: 'iguales', texto: 'Sin cambio', de: (f) => (f.estado === 'CASA' && f.cambio === 'IGUAL') || f.estado === 'REPETIDA' },
];
const CHIP = {
    NUEVA: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
    SUBE: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    BAJA: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    IGUAL: 'bg-white/5 text-white/45 border-white/10',
};

export function CargarTarifaModal({ onClose, api = apiTarifas }) {
    const [distribuidor, setDistribuidor] = useState('');
    const [desde, setDesde] = useState(hoy());
    const [fichero, setFichero] = useState(null);
    const [lectura, setLectura] = useState(null);   // respuesta de «leer»
    const [elecciones, setElecciones] = useState({}); // { fila: aerotermia_id }
    const [leyendo, setLeyendo] = useState(false);
    const [error, setError] = useState('');
    const [pestana, setPestana] = useState('guardar');
    const [envio, setEnvio] = useState(null);
    const input = useRef(null);

    const formulario = (extra = {}) => {
        const f = new FormData();
        f.append('distribuidor', distribuidor);
        f.append('vigente_desde', desde);
        f.append('elecciones', JSON.stringify(elecciones));
        for (const [k, v] of Object.entries(extra)) f.append(k, v);
        f.append('fichero', fichero);
        return f;
    };
    const leer = async () => {
        setError('');
        if (distribuidor.trim().length < 2) { setError('Escribe de qué distribuidor es la tarifa.'); return; }
        if (!desde) { setError('Pon desde qué fecha vale.'); return; }
        if (!fichero) { setError('Elige el Excel.'); return; }
        setLeyendo(true);
        try {
            const r = await api.leer(formulario());
            setLectura(r);
            const hayGuardar = r.resumen?.a_guardar > 0;
            setPestana(hayGuardar ? 'guardar' : r.resumen?.ambiguas ? 'ambiguas' : 'fuera');
        } catch (e) { setError(mensaje(e, 'No se ha podido leer el Excel.')); } finally { setLeyendo(false); }
    };
    const descargarPlantilla = async () => {
        try {
            const blob = await api.plantilla();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'plantilla-tarifa-aerotermia.xlsx'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch (e) { setError(mensaje(e, 'No se ha podido bajar la plantilla.')); }
    };
    const guardar = async () => {
        setEnvio({ phase: 'sending' });
        try {
            const r = await api.confirmar(formulario({ firma: lectura.firma, sha256: lectura.sha256 }));
            const res = lectura.resumen;
            const fuera = res.ambiguas + res.sin_pareja + res.errores + res.duplicadas;
            setEnvio({
                phase: 'done', ok: true,
                items: [
                    { texto: `${plural(r.guardadas, 'tarifa guardada', 'tarifas guardadas')} (${plural(res.nuevas, 'nueva', 'nuevas')}, ${res.cambian} con precio distinto)`, tono: 'ok' },
                    res.iguales ? { texto: `${plural(res.iguales, 'ya tenía', 'ya tenían')} ese precio: no se tocan`, tono: 'info' } : null,
                    fuera ? { texto: `${fuera} ${fuera === 1 ? 'fila no se ha cargado' : 'filas no se han cargado'}: resuélvelas a mano`, tono: 'aviso' } : null,
                ].filter(Boolean),
            });
        } catch (e) {
            setEnvio({ phase: 'done', ok: false, error: mensaje(e, 'No se han podido guardar las tarifas.') });
            if (e?.response?.status === 409) setLectura(null); // el plan ha cambiado: se vuelve a leer
        }
    };

    const filas = lectura?.filas || [];
    const cuenta = useMemo(() => Object.fromEntries(PESTANAS.map((p) => [p.key, filas.filter(p.de).length])), [filas]);
    const visibles = filas.filter((PESTANAS.find((p) => p.key === pestana) || PESTANAS[0]).de);
    const eleccionesPendientes = filas.some((f) => f.estado === 'AMBIGUA' && elecciones[f.fila]);
    const r = lectura?.resumen;

    return createPortal(
        <div className="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
            onPointerDown={(e) => { if (e.target === e.currentTarget && !leyendo && !envio) onClose(); }}>
            <div className="w-full max-w-4xl bg-bkg-surface border border-white/10 rounded-3xl shadow-2xl p-5 sm:p-7 my-6" role="dialog" aria-modal="true" aria-label="Cargar tarifa por Excel">
                <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Cargar tarifa del distribuidor</h2>
                        <p className="text-xs text-white/45 mt-1">Primero se lee en seco: no se guarda nada hasta que pulses «Guardar». La ven los instaladores de esas marcas, sin IVA.</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white w-11 h-11 shrink-0 grid place-items-center -mr-2 -mt-2" aria-label="Cerrar">✕</button>
                </div>

                {/* ── Paso 1: qué tarifa es ── */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Distribuidor</span>
                        <input type="text" value={distribuidor} maxLength={120} disabled={!!lectura}
                            onChange={(e) => setDistribuidor(e.target.value)} placeholder="Ej.: Saltoki, Salvador Escoda…"
                            className="min-h-[44px] bg-white/[0.04] border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2.5 text-white text-sm outline-none disabled:opacity-60" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Vale desde</span>
                        <input type="date" value={desde} disabled={!!lectura} onChange={(e) => setDesde(e.target.value)}
                            className="min-h-[44px] bg-white/[0.04] border border-white/10 focus:border-sky-400 rounded-xl px-3 py-2.5 text-white text-sm outline-none [color-scheme:dark] disabled:opacity-60" />
                    </label>
                </div>
                <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center">
                    <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
                        onChange={(e) => { setFichero(e.target.files?.[0] || null); setLectura(null); setElecciones({}); e.target.value = ''; }} />
                    <button type="button" onClick={() => input.current?.click()} disabled={!!lectura}
                        className="min-h-[44px] flex-1 text-left rounded-xl border border-dashed border-white/20 hover:border-sky-400/60 px-4 py-3 text-sm text-white/70 disabled:opacity-60">
                        {fichero ? <><b className="text-white">{fichero.name}</b> · {Math.max(1, Math.round(fichero.size / 1024))} KB</> : 'Elegir el Excel (.xlsx, máx. 5 MB)'}
                    </button>
                    <button type="button" onClick={descargarPlantilla} className="min-h-[44px] px-4 py-3 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-sky-300 hover:bg-white/[0.04]">
                        Bajar la plantilla
                    </button>
                </div>
                <p className="text-[11px] text-white/35 mt-2">Columnas: <b className="text-white/55">Marca</b>, <b className="text-white/55">Modelo</b> (comercial, conjunto o ud. exterior) y <b className="text-white/55">Precio</b> sin IVA. Se casa por marca + modelo sin mirar mayúsculas, espacios ni guiones.</p>
                {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}

                {!lectura ? (
                    <div className="mt-5 flex justify-end">
                        <button type="button" onClick={leer} disabled={leyendo}
                            className="min-h-[44px] px-6 py-3 rounded-2xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest disabled:opacity-60">
                            {leyendo ? 'Leyendo…' : 'Leer en seco'}
                        </button>
                    </div>
                ) : (
                    <>
                        {/* ── Paso 2: lo que pasaría ── */}
                        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                                ['Filas leídas', r.leidas, 'text-white'],
                                ['Se guardan', r.a_guardar, 'text-emerald-300'],
                                ['Elegir modelo', r.ambiguas, r.ambiguas ? 'text-amber-300' : 'text-white/40'],
                                ['No casan', r.sin_pareja + r.errores + r.duplicadas, (r.sin_pareja + r.errores + r.duplicadas) ? 'text-amber-300' : 'text-white/40'],
                            ].map(([t, n, c]) => (
                                <div key={t} className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                                    <div className={`text-2xl font-black ${c}`}>{n}</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">{t}</div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-white/45 mt-2">{plural(r.nuevas, 'nueva', 'nuevas')} · {plural(r.cambian, 'cambia', 'cambian')} de precio · {plural(r.iguales, 'ya tenía', 'ya tenían')} ese precio{r.repetidas ? ` · ${r.repetidas} repetidas` : ''}</p>

                        <div className="mt-4 flex flex-wrap gap-2" role="tablist">
                            {PESTANAS.map((p) => (
                                <button key={p.key} type="button" role="tab" aria-selected={pestana === p.key} onClick={() => setPestana(p.key)}
                                    className={`min-h-[44px] px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border ${pestana === p.key ? 'bg-white/10 text-white border-white/20' : 'text-white/45 border-white/[0.06] hover:text-white'}`}>
                                    {p.texto} · {cuenta[p.key]}
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-2xl border border-white/[0.06] divide-y divide-white/[0.05]">
                            {visibles.length === 0 && <p className="px-4 py-6 text-sm text-white/40 text-center">Nada en esta pestaña.</p>}
                            {visibles.map((f) => (
                                <div key={f.fila} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                    <span className="text-[10px] font-black text-white/30 w-14 shrink-0">FILA {f.fila}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white font-bold truncate">{f.marca || '—'} · <span className="font-mono">{f.ref || '—'}</span></div>
                                        {f.nombre && <div className="text-[11px] text-white/45 truncate">→ {f.nombre}{f.elegida_a_mano ? ' (elegido a mano)' : ''}</div>}
                                        {f.motivo && <div className="text-[11px] text-amber-300/80">{f.motivo}</div>}
                                        {f.estado === 'AMBIGUA' && (
                                            <select value={elecciones[f.fila] || ''} onChange={(e) => setElecciones((x) => ({ ...x, [f.fila]: e.target.value ? Number(e.target.value) : undefined }))}
                                                className="min-h-[44px] mt-2 w-full bg-bkg-deep border border-white/15 rounded-lg px-2 py-2 text-xs text-white [color-scheme:dark]">
                                                <option value="">Elige el modelo…</option>
                                                {(f.candidatos || []).map((c) => (
                                                    <option key={c.id} value={c.id}>{c.nombre}{c.exterior ? ` · ext ${c.exterior}` : ''}{c.conjunto ? ` · conj ${c.conjunto}` : ''} (id {c.id})</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="sm:text-right shrink-0">
                                        <div className="text-sm font-black text-white tabular-nums">{f.precio != null ? eur(f.precio) : (f.precio_texto || '—')}</div>
                                        {f.cambio && (
                                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest ${CHIP[f.cambio]}`}>
                                                {f.cambio === 'NUEVA' ? 'Nueva' : f.cambio === 'IGUAL' ? 'Igual' : `${f.cambio === 'SUBE' ? '▲' : '▼'} antes ${eur(f.anterior)}`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
                            <button type="button" onClick={() => { setLectura(null); setElecciones({}); }}
                                className="min-h-[44px] px-5 py-3 rounded-2xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest hover:text-white">
                                Cambiar el Excel o los datos
                            </button>
                            <div className="flex flex-col sm:flex-row gap-3">
                                {eleccionesPendientes && (
                                    <button type="button" onClick={leer} disabled={leyendo}
                                        className="min-h-[44px] px-5 py-3 rounded-2xl border border-amber-400/40 text-amber-300 text-[11px] font-black uppercase tracking-widest">
                                        {leyendo ? 'Leyendo…' : 'Volver a leer con lo elegido'}
                                    </button>
                                )}
                                <button type="button" onClick={guardar} disabled={!r.a_guardar || eleccionesPendientes}
                                    title={eleccionesPendientes ? 'Vuelve a leer con los modelos elegidos antes de guardar' : undefined}
                                    className="min-h-[44px] px-6 py-3 rounded-2xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest disabled:opacity-40">
                                    Guardar {r.a_guardar} {r.a_guardar === 1 ? 'tarifa' : 'tarifas'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
            {envio && (
                <SendActionOverlay
                    phase={envio.phase} ok={!!envio.ok} icon="upload"
                    sendingTitle="Guardando las tarifas…" okTitle="Tarifas guardadas" errorTitle="No se han guardado"
                    subtitle={envio.ok ? 'Ya las ven los instaladores de esas marcas en su Catálogo.' : ''}
                    items={envio.ok ? envio.items : []} errorText={envio.error || ''}
                    onClose={() => { const ok = envio.ok; setEnvio(null); if (ok) onClose(); }}
                />
            )}
        </div>,
        document.body,
    );
}
