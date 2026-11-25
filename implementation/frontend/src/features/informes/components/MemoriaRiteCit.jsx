// ─── MemoriaRiteCit — la memoria RITE de un CIT, hecha con la app RITE ──────
// Regla 245 (Fran, 25/11/2026: «que esté conectado a mi app maestra… hay que
// unificar todo»). Un CIT tiene UNA memoria en la app RITE (riteapp_memorias.informe_id):
//   · «Crear la memoria» la monta con lo que el CIT ya sabe (cliente, instalador,
//     dirección o referencia catastral) y, si no falta nada, la GENERA.
//   · Generada, la memoria en PDF y en Word sube a ESTE CIT como versión final
//     (FINAL_PDF / FINAL_WORD): el circuito del CIT sigue igual (firmar, eDICE…).
//   · «Enlace para el instalador»: un enlace para que él complete el equipo, el nº de
//     serie, las estancias (y los radiadores, en el modo extendido) y la envíe. Aquí
//     solo se PREPARA el mensaje: se copia o se abre en TU WhatsApp; no sale nada solo.
// API: /api/riteapp-admin (staffOClaveInterna). Nada de esto gasta créditos del instalador.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API = '/api/riteapp-admin';
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const ESTADO = { BORRADOR: 'Borrador', GENERADA: 'Generada', FIRMADA: 'Firmada', PRESENTADA: 'Presentada', ANULADA: 'Anulada' };

const Btn = ({ children, pri = false, className = '', ...p }) => (
    <button type="button" {...p}
        className={`min-h-[40px] px-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${pri ? 'bg-brand text-bkg-deep hover:bg-brand-700' : 'border border-white/10 text-white/60 hover:text-white hover:border-white/25'} ${className}`}>
        {children}
    </button>
);

export function MemoriaRiteCit({ informeId, anulado = false, onCambio }) {
    const [d, setD] = useState(null);          // { memoria, cit, faltan, empresa, enlace, app }
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [aviso, setAviso] = useState(null);
    const [modo, setModo] = useState('rapido');
    const [mensaje, setMensaje] = useState(null);   // { url, texto, caduca_at, telefono }

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/por-informe/${encodeURIComponent(informeId)}`);
            setD(data);
            if (data?.memoria?.modo) setModo(data.memoria.modo);
            setError(null);
        } catch (err) {
            setError(err.response?.status === 503 ? 'No se ha podido consultar la app RITE ahora mismo. Vuelve a intentarlo.' : (err.response?.data?.error || 'No se ha podido cargar la memoria RITE.'));
        }
    }, [informeId]);
    useEffect(() => { cargar(); }, [cargar]);

    const hacer = async (clave, fn, ok) => {
        setOcupado(clave); setAviso(null);
        try {
            const r = await fn();
            if (ok) setAviso({ tono: 'ok', texto: typeof ok === 'function' ? ok(r.data) : ok });
            await cargar();
            return r.data;
        } catch (err) {
            const e = err.response?.data || {};
            setAviso({ tono: 'aviso', texto: e.error || 'No se ha podido hacer.', faltan: e.faltan });
            return null;
        } finally { setOcupado(null); }
    };

    const crear = (generar) => hacer('crear', () => axios.post(`${API}/desde-informe/${encodeURIComponent(informeId)}`, { generar }), (r) => {
        if (r.generada) { onCambio?.(); return 'Memoria creada y generada: la memoria en PDF y en Word ya está en los documentos del CIT como versión final.'; }
        return r.existia ? 'Este CIT ya tenía su memoria.' : 'Memoria creada en la app RITE. Complétala tú o manda el enlace al instalador.';
    });
    const generar = () => hacer('generar', () => axios.post(`${API}/memorias/${d.memoria.id}/generar`), (r) => {
        onCambio?.();
        return r.cit && !r.cit.ok
            ? `Generada en la app RITE, pero no ha subido al CIT: ${r.cit.motivo || 'revísalo'}.`
            : 'Generada: la memoria en PDF y en Word ya está en los documentos del CIT como versión final.';
    });
    const prepararEnlace = () => hacer('enlace', () => axios.post(`${API}/memorias/${d.memoria.id}/enlace`, { modo }), (r) => {
        setMensaje({ url: r.url, texto: r.mensaje, caduca_at: r.caduca_at, telefono: r.telefono_instalador });
        return 'Enlace preparado. No se ha enviado nada: cópialo o ábrelo en tu WhatsApp.';
    });
    const copiar = (t, que) => navigator.clipboard?.writeText(t).then(() => setAviso({ tono: 'ok', texto: `${que} copiado.` }));

    const m = d?.memoria;
    return (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40">Memoria RITE (app RITE)</h2>
                <button onClick={cargar} className="text-[10px] text-white/30 hover:text-white/70 uppercase tracking-widest">Recargar</button>
            </div>

            {error && <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-300">{error}</div>}
            {!d && !error && <p className="text-xs text-white/30">Cargando…</p>}

            {d && !m && (
                <>
                    <p className="text-xs text-white/55 mb-3">
                        Hazla con la app RITE: se monta con lo que sabe este CIT (cliente, instalador y vivienda del Catastro) y, si no falta nada, se genera y sube aquí como versión final. Lo que falte lo completas tú o el instalador con un enlace.
                    </p>
                    {!anulado && (
                        <div className="flex flex-wrap gap-2">
                            <Btn pri disabled={!!ocupado} onClick={() => crear(true)}>{ocupado === 'crear' ? 'Creando…' : 'Crear la memoria'}</Btn>
                            <Btn disabled={!!ocupado} onClick={() => crear(false)} title="La crea sin generarla, para completarla antes">Crear sin generar</Btn>
                        </div>
                    )}
                </>
            )}

            {m && (
                <>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-mono text-violet-300 text-sm font-black">{m.numero}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60">{ESTADO[m.estado] || m.estado}</span>
                        <span className="text-[10px] text-white/35 uppercase tracking-widest">{m.modo === 'extendido' ? 'Con radiadores' : 'Rápida'}</span>
                        {d.empresa && <span className="text-[11px] text-white/45">· {d.empresa}</span>}
                    </div>
                    <p className="text-[11px] text-white/40 mb-3">
                        {m.generada_at ? `Generada ${m.generaciones > 1 ? `${m.generaciones} veces, la última` : ''} el ${fmt(m.generada_at)}.` : 'Sin generar todavía.'}
                        {m.completada_at ? ` El instalador la completó el ${fmt(m.completada_at)}.` : ''}
                        {d.enlace ? ` Enlace del instalador activo hasta el ${fmt(d.enlace.caduca_at)}.` : ''}
                    </p>
                    {d.faltan?.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200 mb-3">
                            Falta para generarla: {d.faltan.join(' · ')}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {d.app && <Btn pri={!!d.faltan?.length} onClick={() => window.open(d.app, '_blank', 'noopener')}>Abrir en la app RITE</Btn>}
                        {!anulado && <Btn pri={!d.faltan?.length} disabled={!!ocupado || d.faltan?.length > 0} onClick={generar}>{ocupado === 'generar' ? 'Generando (un minuto)…' : m.generada_at ? 'Volver a generar' : 'Generar'}</Btn>}
                    </div>

                    {!anulado && (
                        <div className="mt-4 pt-4 border-t border-white/[0.06]">
                            <span className="block text-[10px] font-black uppercase tracking-widest text-white/45 mb-2">Que la complete el instalador</span>
                            <div className="flex flex-wrap items-center gap-2">
                                {[['rapido', 'Rápida (por superficie)'], ['extendido', 'Con radiadores por estancia']].map(([k, t]) => (
                                    <button key={k} type="button" onClick={() => setModo(k)}
                                        className={`min-h-[36px] px-3 rounded-lg text-[11px] font-bold border ${modo === k ? 'border-brand/60 text-brand bg-brand/[0.08]' : 'border-white/10 text-white/50'}`}>{t}</button>
                                ))}
                                <Btn disabled={!!ocupado} onClick={prepararEnlace}>{ocupado === 'enlace' ? 'Preparando…' : d.enlace ? 'Enlace nuevo' : 'Preparar enlace'}</Btn>
                            </div>
                            {d.enlace && !mensaje && <p className="text-[10px] text-white/30 mt-2">Uno nuevo anula el anterior.</p>}
                            {mensaje && (
                                <div className="mt-3 space-y-2">
                                    <p className="text-[11px] text-white/45">Borrador del mensaje{mensaje.telefono ? ` (el instalador tiene el teléfono ${mensaje.telefono})` : ''}. No se ha enviado.</p>
                                    <textarea rows={7} value={mensaje.texto} onChange={e => setMensaje({ ...mensaje, texto: e.target.value })}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                                    <div className="flex flex-wrap gap-2">
                                        <Btn onClick={() => copiar(mensaje.texto, 'Mensaje')}>Copiar mensaje</Btn>
                                        <Btn onClick={() => copiar(mensaje.url, 'Enlace')}>Copiar solo el enlace</Btn>
                                        <Btn onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(mensaje.texto)}`, '_blank', 'noopener')}>Abrir en mi WhatsApp</Btn>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {aviso && (
                <div role="status" className={`mt-3 rounded-xl border px-4 py-3 text-xs ${aviso.tono === 'ok' ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200' : 'border-amber-500/30 bg-amber-500/[0.07] text-amber-200'}`}>
                    {aviso.texto}
                    {aviso.faltan?.length > 0 && <span> Falta: {aviso.faltan.join(' · ')}</span>}
                </div>
            )}
        </section>
    );
}

export default MemoriaRiteCit;
