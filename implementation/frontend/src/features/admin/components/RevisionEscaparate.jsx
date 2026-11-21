// ─── «Pendiente de revisar»: lo que un instalador propone para su página (fase 3) ──
// Va dentro de la ficha del instalador (PrescriptorDetailModal, sección Escaparate).
// Lo VE el equipo interno; APRUEBA y RECHAZA solo ADMIN (el backend lo repite:
// routes/escaparateRevision.js). Rechazar pide el motivo, que el instalador lee.
// Aprobar una foto de obra es el mismo camino que «Publicar en el escaparate» del
// gestor. Aquí sí se ve el nº de la obra (es interno); en la web, solo el pueblo.
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const B = '/api/escaparate-revision';
const ESP = { aerotermia: 'Aerotermia', suelo_radiante: 'Suelo radiante', fotovoltaica: 'Placas solares', aire_acondicionado: 'Aire acondicionado', calderas: 'Calderas' };
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '');
const err = (e) => e?.response?.data?.error || 'No se ha podido. Vuelve a intentarlo.';

export function RevisionEscaparate({ instaladorId, puedeResolver, onContador }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(null);   // id en curso
    const [rechazo, setRechazo] = useState(null);   // { tipo, id, motivo }
    const [aviso, setAviso] = useState(null);

    const cargar = useCallback(() => {
        setError(null);
        axios.get(`${B}/instalador/${instaladorId}`).then((r) => {
            setDatos(r.data);
            onContador?.((r.data.fotos || []).filter((f) => f.estado === 'PENDIENTE').length + (r.data.textos_pendientes || []).length);
        }).catch((e) => setError(err(e)));
    }, [instaladorId, onContador]);
    useEffect(() => { cargar(); }, [cargar]);

    const accion = async (id, fn, ok) => {
        setOcupado(id); setAviso(null);
        try { await fn(); setAviso({ ok: true, t: ok }); setRechazo(null); cargar(); }
        catch (e) { setAviso({ ok: false, t: err(e) }); }
        finally { setOcupado(null); }
    };
    const aprobarFoto = (f) => accion(f.id, () => axios.post(`${B}/fotos/${f.id}/aprobar`, {}), 'Foto publicada en su página.');
    const aprobarTextos = (t) => accion(t.id, () => axios.post(`${B}/textos/${t.id}/aprobar`, {}), 'Textos publicados en su página.');
    const rechazar = () => {
        const { tipo, id, motivo } = rechazo;
        return accion(id, () => axios.post(`${B}/${tipo}/${id}/rechazar`, { motivo }), 'Rechazado. El instalador verá el motivo.');
    };

    if (error) return <p className="text-xs text-amber-400/80">{error} <button type="button" className="underline" onClick={cargar}>Reintentar</button></p>;
    if (!datos) return <p className="text-xs text-white/30">Cargando lo pendiente…</p>;
    const pend = (datos.fotos || []).filter((f) => f.estado === 'PENDIENTE');
    const noVale = (datos.fotos || []).filter((f) => f.estado === 'NO_VALE');
    const textos = datos.textos_pendientes || [];
    const vig = datos.textos_vigentes || {};

    const cajaRechazo = (tipo, id) => rechazo?.id === id && (
        <div className="mt-2 space-y-2">
            <textarea rows={2} value={rechazo.motivo} onChange={(e) => setRechazo({ tipo, id, motivo: e.target.value })} autoFocus
                placeholder="Por qué no vale (lo lee el instalador): «sale la matrícula», «se ve la cara del cliente»…"
                className="no-uppercase w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500/40" />
            <div className="flex gap-2">
                <button type="button" disabled={ocupado === id || rechazo.motivo.trim().length < 5} onClick={rechazar}
                    className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Rechazar</button>
                <button type="button" onClick={() => setRechazo(null)} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest">Cancelar</button>
            </div>
        </div>
    );
    const botones = (tipo, item, aprobar) => puedeResolver && (
        <div className="flex gap-2 mt-2">
            <button type="button" disabled={!!ocupado} onClick={() => aprobar(item)}
                className="flex-1 px-2 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40">
                {ocupado === item.id ? '…' : 'Aprobar'}</button>
            <button type="button" disabled={!!ocupado} onClick={() => setRechazo({ tipo, id: item.id, motivo: '' })}
                className="flex-1 px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white disabled:opacity-40">No vale</button>
        </div>
    );

    return (
        <div className="space-y-4">
            {aviso && <p className={`text-xs ${aviso.ok ? 'text-emerald-400' : 'text-amber-400'}`} role="status">{aviso.t}</p>}
            {!pend.length && !textos.length && <p className="text-xs text-white/30 italic">Nada pendiente de revisar.</p>}
            {!puedeResolver && (pend.length > 0 || textos.length > 0) && <p className="text-[11px] text-white/35">Aprobar y rechazar es de un ADMIN.</p>}

            {pend.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase tracking-widest font-black text-white/40 mb-2">Fotos · {pend.length}</p>
                    <p className="text-[11px] text-white/35 mb-2">Mira que no salga nadie, ni una matrícula, ni la dirección o el número de la casa.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {pend.map((f) => (
                            <div key={f.id} className="rounded-xl border border-white/[0.08] bg-black/20 p-2">
                                <a href={f.miniatura} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-white/5">
                                    <img src={f.miniatura} alt="" loading="lazy" className="w-full h-full object-cover" />
                                </a>
                                <p className="mt-1.5 text-[11px] text-white/70 leading-tight">
                                    {f.fase === 'DESPUES' ? 'Después' : 'Antes'} · {f.municipio || 'sin pueblo'}
                                </p>
                                <p className="text-[10px] text-white/35 leading-tight">
                                    {f.origen === 'SUELTA' ? 'Subida del móvil' : f.obra || 'De una obra'} · {fecha(f.propuesta_at)}
                                    {f.permiso_cliente ? ' · permiso ✓' : ''}
                                </p>
                                {cajaRechazo('fotos', f.id) || botones('fotos', f, aprobarFoto)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {textos.map((t) => (
                <div key={t.id} className="rounded-xl border border-white/[0.08] bg-black/20 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-black text-white/40">Textos propuestos · {fecha(t.propuesto_at)}</p>
                    {t.presentacion && <p className="text-sm text-white/85 whitespace-pre-wrap">{t.presentacion}</p>}
                    {(t.especialidades || []).length > 0 && <p className="text-xs text-white/60">A qué se dedica: {t.especialidades.map((e) => ESP[e] || e).join(', ')}</p>}
                    {(t.pueblos || []).length > 0 && <p className="text-xs text-white/60">Pueblos: {t.pueblos.join(', ')}</p>}
                    {(vig.presentacion || (vig.pueblos || []).length > 0) && (
                        <p className="text-[11px] text-white/30">Ahora sale: {vig.presentacion ? `«${vig.presentacion.slice(0, 140)}${vig.presentacion.length > 140 ? '…' : ''}»` : '—'}</p>
                    )}
                    {cajaRechazo('textos', t.id) || botones('textos', t, aprobarTextos)}
                </div>
            ))}

            {noVale.length > 0 && (
                <p className="text-[11px] text-white/30">{noVale.length === 1 ? '1 foto rechazada' : `${noVale.length} fotos rechazadas`} (el instalador ve el motivo y puede quitarlas).</p>
            )}
        </div>
    );
}
