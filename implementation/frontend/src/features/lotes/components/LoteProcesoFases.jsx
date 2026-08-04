import { useMemo, useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { analizarProceso, SLOTS } from '../logic/loteProceso';
import { computeLoteEco } from '../logic/loteEco';
import { EnviarOfertaModal } from './EnviarOfertaModal';

// ─────────────────────────────────────────────────────────────────────────────
// El proceso del lote, por FASES, en el orden real del trámite. Sustituye a los
// dos bloques sueltos de antes ("Documentos del lote" + "Acciones"), que obligaban
// a saber de memoria qué iba antes de qué.
//
// Cada fase muestra sus documentos, sus acciones y —si aún no toca— el motivo por
// el que está bloqueada. Los documentos y el estado del lote los manda el backend
// (services/loteDocs.js); aquí solo se pintan. Ver logic/loteProceso.js.
// ─────────────────────────────────────────────────────────────────────────────

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
});

const fmtFecha = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('es-ES'); } catch { return null; }
};

const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const EstadoPill = ({ doc }) => {
    if (doc.signed_link) return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Firmado</span>;
    if (doc.sent_at) return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/30">Enviado</span>;
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-white/[0.04] text-white/30 border-white/10">Borrador</span>;
};

// Fila de un documento: nombre, fecha, estado y enlaces a Drive.
const Fila = ({ doc, acciones = null, onBorrar = null }) => {
    const fecha = fmtFecha(doc.signed_at) || fmtFecha(doc.sent_at) || fmtFecha(doc.uploaded_at);
    return (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 px-3 py-2.5">
                <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-white/80 truncate">{doc.label || doc.file_name}</p>
                    <p className="text-[9px] text-white/25">
                        {[fecha, doc.importe ? eur(doc.importe) : null].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <EstadoPill doc={doc} />
                <div className="flex items-center gap-1.5 shrink-0">
                    {doc.draft_link && (
                        <a href={doc.draft_link} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white/40 hover:text-white hover:bg-white/5 transition-all">Borrador</a>
                    )}
                    {doc.signed_link && (
                        <a href={doc.signed_link} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/10 transition-all">Firmado</a>
                    )}
                    {onBorrar && (
                        <button type="button" onClick={onBorrar} title="Quitar del lote"
                            className="px-1.5 py-1 rounded-lg text-[11px] text-white/20 hover:text-red-400 transition-all">✕</button>
                    )}
                </div>
            </div>
            {acciones && <div className="px-3 pb-2.5 flex items-center gap-2 flex-wrap">{acciones}</div>}
        </div>
    );
};

// Botón-etiqueta para subir un PDF a un slot.
const BotonSubir = ({ children, disabled, onFile, destacado = false }) => (
    <label className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
        disabled ? 'opacity-40 cursor-not-allowed border-white/10 text-white/30'
            : destacado ? 'cursor-pointer border-brand/30 bg-brand/10 text-brand hover:bg-brand/20'
                : 'cursor-pointer border-dashed border-white/15 text-white/45 hover:text-white/80 hover:border-brand/40'}`}>
        {children}
        <input type="file" accept="application/pdf" className="hidden" disabled={disabled}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
);

// Botón de acción de una fase (abre un modal del lote).
const BotonAccion = ({ children, onClick, disabled, title, tono = 'brand' }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
            tono === 'amber' ? 'border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-brand/30 bg-brand/10 text-brand hover:bg-brand/20'}`}>
        {children}
    </button>
);

export function LoteProcesoFases({ lote, onChanged, canSeeMargin = false, acciones = {} }) {
    const { showConfirm, showAlert } = useModal();
    const [subiendo, setSubiendo] = useState(null);   // slot en curso
    const [error, setError] = useState('');
    const [enviarOferta, setEnviarOferta] = useState(false);
    const [importeFactura, setImporteFactura] = useState('');
    const [ofertaRecien, setOfertaRecien] = useState(null);

    const p = useMemo(() => analizarProceso(lote), [lote]);

    // Lo que la operación le cuesta al SUJETO OBLIGADO en €/MWh: la verificación que
    // paga él (importe de la factura del verificador) MÁS lo que nos paga a nosotros
    // (oferta del lote). No entra en nuestro margen — no es un coste de Brokergy.
    const costeSo = useMemo(() => {
        const importe = Number(p.facturaVerificador?.importe) || 0;
        if (!importe) return null;
        const eco = computeLoteEco(lote);
        // Si todos los expedientes tienen ahorro verificado se usa ese, que es el que
        // de verdad se factura; si no, el estimado (y se avisa de que lo es).
        const mwh = eco.fullyVerif && eco.ahorroMwhVerif > 0 ? eco.ahorroMwhVerif : eco.ahorroMwh;
        if (!(mwh > 0)) return null;
        const verifMwh = importe / mwh;
        const nuestro = eco.ofertaLote;
        return {
            importe, mwh, verifMwh, nuestro,
            total: nuestro != null ? verifMwh + nuestro : null,
            estimado: !(eco.fullyVerif && eco.ahorroMwhVerif > 0),
        };
    }, [lote, p.facturaVerificador]);

    // ── Subida genérica a un slot ─────────────────────────────────────────────
    const subir = async (slot, file, extra = {}) => {
        if (!file) return null;
        if (file.type !== 'application/pdf') { setError('El fichero debe ser un PDF.'); return null; }
        setError('');
        setSubiendo(slot);
        try {
            const base64 = await fileToBase64(file);
            const { data } = await axios.post(`/api/lotes/${lote.id}/documentos/${slot}`, {
                base64, fileName: file.name, ...extra,
            });
            if (onChanged) onChanged();
            return data?.documento || null;
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir el documento.');
            return null;
        } finally {
            setSubiendo(null);
        }
    };

    const borrar = async (doc) => {
        const ok = await showConfirm(`¿Quitar "${doc.label || doc.file_name}" del lote?\n\nSe borra también de la carpeta de Drive.`, 'Quitar documento', 'warning');
        if (!ok) return;
        setError('');
        try {
            await axios.delete(`/api/lotes/${lote.id}/documentos/${doc.key}`);
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo borrar el documento.');
        }
    };

    // Fase 1 — al subir la solicitud, el paso siguiente es SIEMPRE generar el Anexo I.
    const subirSolicitud = async (file) => {
        const doc = await subir('solicitud_verificacion', file);
        if (!doc) return;
        const seguir = await showConfirm(
            'Solicitud de verificación guardada en el lote.\n\n¿Generamos ahora el Anexo I y las fichas RES para mandárselos al Sujeto Obligado? La solicitud irá ya incluida.',
            'Solicitud subida', 'success'
        );
        if (seguir && acciones.abrirAnexo) acciones.abrirAnexo();
    };

    // Fase 3 — al subir la oferta, el paso siguiente es mandarla al S.O. a firmar.
    const subirOferta = async (file) => {
        const doc = await subir('oferta_verificacion', file);
        if (!doc) return;
        setOfertaRecien(doc);
        const enviar = await showConfirm(
            'La oferta de verificación ya está guardada en la carpeta del lote.\n\n¿La enviamos ahora al Sujeto Obligado para que la firme?',
            'Oferta subida', 'success'
        );
        if (enviar) setEnviarOferta(true);
    };

    // Fase 4 — la factura del verificador trae su importe (rellena el coste del lote).
    const subirFacturaVerificador = async (file) => {
        const imp = Number(String(importeFactura).replace(',', '.'));
        const doc = await subir('factura_verificador', file, Number.isFinite(imp) && imp > 0 ? { importe: imp } : {});
        if (doc) {
            setImporteFactura('');
            if (!(Number.isFinite(imp) && imp > 0)) {
                showAlert('Factura guardada, pero sin importe no se puede calcular a cuánto le sale el €/MWh al Sujeto Obligado. Puedes volver a subirla con el importe.', 'Sin importe', 'info');
            }
        }
    };

    // ── Cabecera de fase ──────────────────────────────────────────────────────
    const Fase = ({ f, children }) => {
        const esActual = p.faseActual === f.n;
        const bloqueada = !!f.bloqueo && !f.hecha;
        return (
            <div className={`rounded-2xl border p-4 transition-colors ${
                f.hecha ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                    : esActual ? 'border-brand/30 bg-brand/[0.04]'
                        : 'border-white/[0.06] bg-white/[0.01]'}`}>
                <div className="flex items-center gap-2.5 mb-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        f.hecha ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : esActual ? 'bg-brand/15 text-brand border border-brand/40'
                                : 'bg-white/[0.04] text-white/25 border border-white/10'}`}>
                        {f.hecha ? '✓' : f.n}
                    </span>
                    <p className={`text-[11px] font-black uppercase tracking-[0.15em] flex-1 min-w-0 truncate ${
                        f.hecha ? 'text-emerald-400/80' : esActual ? 'text-white' : 'text-white/35'}`}>
                        {f.titulo}
                    </p>
                    {esActual && <span className="text-[9px] font-black uppercase tracking-wider text-brand shrink-0">← ahora</span>}
                    {bloqueada && (
                        <svg className="w-3.5 h-3.5 text-white/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    )}
                </div>
                <div className="space-y-2 pl-8">
                    {f.docs.map(d => (
                        <Fila key={d.key} doc={d}
                            onBorrar={SLOTS[d.tipo] && !d.signed_link ? () => borrar(d) : null} />
                    ))}
                    {bloqueada ? <p className="text-[10px] text-white/25 italic">{f.bloqueo}</p> : children}
                </div>
            </div>
        );
    };

    const [f1, f2, f3, f4, f5] = p.fases;
    const nExps = (lote?.expedientes || []).length;

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Proceso del lote</p>
                {lote?.drive_folder_id && (
                    <a href={`https://drive.google.com/drive/folders/${lote.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                        Abrir carpeta Drive →
                    </a>
                )}
            </div>

            {/* 1 · Solicitud al verificador */}
            <Fase f={f1}>
                <div className="flex items-center gap-2 flex-wrap">
                    <BotonAccion onClick={acciones.abrirSolicitud} disabled={!nExps}
                        title={!nExps ? 'El lote no tiene expedientes' : 'Genera el formulario de solicitud'}>
                        Generar solicitud
                    </BotonAccion>
                    <BotonSubir disabled={subiendo === 'solicitud_verificacion'} onFile={subirSolicitud}
                        destacado={!p.solicitud}>
                        {subiendo === 'solicitud_verificacion' ? 'Subiendo…' : (p.solicitud ? 'Reemplazar' : '↑ Subir solicitud firmada')}
                    </BotonSubir>
                </div>
            </Fase>

            {/* 2 · Firma del Sujeto Obligado */}
            <Fase f={f2}>
                <div className="flex items-center gap-2 flex-wrap">
                    <BotonAccion onClick={acciones.abrirAnexo} disabled={!nExps}>
                        {p.soEnviado ? 'Reenviar Anexo I · Cesión S.O.' : 'Anexo I · Cesión S.O.'}
                    </BotonAccion>
                    <BotonAccion onClick={acciones.abrirRequerimiento} disabled={!p.soEnviado} tono="amber"
                        title={!p.soEnviado ? 'Disponible cuando el lote se haya enviado al S.O.' : ''}>
                        Requerimiento · reenviar para firma
                    </BotonAccion>
                </div>
                {p.soEnviado && !p.soFirmado && (
                    <p className="text-[10px] text-white/30">Enviado. Esperando la firma del Sujeto Obligado.</p>
                )}
            </Fase>

            {/* 3 · Oferta de verificación */}
            <Fase f={f3}>
                <div className="flex items-center gap-2 flex-wrap">
                    {!p.oferta ? (
                        <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta} destacado>
                            {subiendo === 'oferta_verificacion' ? 'Subiendo…' : '↑ Subir oferta del verificador'}
                        </BotonSubir>
                    ) : !p.ofertaFirmada ? (
                        <>
                            <BotonAccion onClick={() => setEnviarOferta(true)}>
                                {p.ofertaEnviada ? '↻ Reenviar para firma' : '✉ Enviar para firma'}
                            </BotonAccion>
                            <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={(f) => subir('oferta_verificacion', f, { firmado: true })}>
                                Subir firmada
                            </BotonSubir>
                            <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta}>Reemplazar</BotonSubir>
                        </>
                    ) : (
                        <p className="text-[10px] text-emerald-400/70">Oferta firmada por el S.O. · lote enviado a verificar.</p>
                    )}
                </div>
            </Fase>

            {/* 4 · Verificación */}
            <Fase f={f4}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <BotonSubir disabled={subiendo === 'informe_inexactitudes'} onFile={(f) => subir('informe_inexactitudes', f)}>
                            {subiendo === 'informe_inexactitudes' ? 'Subiendo…' : `+ Informe de inexactitudes${p.inexactitudes.length ? ` (${p.inexactitudes.length})` : ''}`}
                        </BotonSubir>
                        {!p.informeVerificacion && (
                            <BotonSubir disabled={subiendo === 'informe_verificacion'} onFile={(f) => subir('informe_verificacion', f)}>
                                {subiendo === 'informe_verificacion' ? 'Subiendo…' : '↑ Informe de Verificación'}
                            </BotonSubir>
                        )}
                        {!p.dictamen && (
                            <BotonSubir disabled={subiendo === 'dictamen_favorable'} onFile={(f) => subir('dictamen_favorable', f)}>
                                {subiendo === 'dictamen_favorable' ? 'Subiendo…' : '↑ Dictamen favorable'}
                            </BotonSubir>
                        )}
                    </div>
                    {/* Factura del verificador: su importe revela lo que le cuesta la
                        operación al S.O., que es precio de venta → solo ADMIN. */}
                    {canSeeMargin && !p.facturaVerificador && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <input value={importeFactura} onChange={e => setImporteFactura(e.target.value)}
                                placeholder="Importe €" inputMode="decimal"
                                className="w-28 bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-white/20 focus:border-brand/40 focus:outline-none" />
                            <BotonSubir disabled={subiendo === 'factura_verificador'} onFile={subirFacturaVerificador}>
                                {subiendo === 'factura_verificador' ? 'Subiendo…' : '↑ Factura del verificador al S.O.'}
                            </BotonSubir>
                            <span className="text-[9px] text-white/25">La que el VERIFICADOR emite al S.O. (no la nuestra).</span>
                        </div>
                    )}

                    {/* Lo que le sale la jugada al Sujeto Obligado: verificación + lo que
                        nos paga. Es SU coste, no el nuestro: no toca el margen del lote. */}
                    {canSeeMargin && costeSo && (
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1.5">
                                Coste para el Sujeto Obligado{costeSo.estimado ? ' · sobre ahorro estimado' : ' · sobre ahorro verificado'}
                            </p>
                            <div className="flex items-baseline gap-3 flex-wrap text-[11px]">
                                <span className="text-white/50">
                                    Verificación <strong className="text-white/80">{costeSo.verifMwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €/MWh</strong>
                                    <span className="text-white/25"> ({eur(costeSo.importe)} / {costeSo.mwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh)</span>
                                </span>
                                {costeSo.nuestro != null && (
                                    <>
                                        <span className="text-white/50">+ nos paga <strong className="text-white/80">{costeSo.nuestro.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €/MWh</strong></span>
                                        <span className="text-brand font-black">= {costeSo.total.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €/MWh</span>
                                    </>
                                )}
                            </div>
                            {costeSo.nuestro == null && (
                                <p className="text-[9px] text-white/25 mt-1">Pon la oferta del lote (€/MWh) para ver el total.</p>
                            )}
                        </div>
                    )}

                    {p.verificado && <p className="text-[10px] text-emerald-400/70">Verificación favorable · informe y dictamen recibidos.</p>}
                </div>
            </Fase>

            {/* 5 · La factura de Brokergy al S.O. por la venta de CAEs. NO es la del
                verificador (fase 4, que va del verificador al S.O.). Es margen: solo ADMIN. */}
            {canSeeMargin && (
                <Fase f={f5}>
                    <div className="space-y-2">
                        {p.facturaSo?.drive_link && (
                            <Fila doc={{
                                label: `Factura de Brokergy al S.O. ${p.facturaSo.numero || ''}`.trim(),
                                draft_link: p.facturaSo.drive_link,
                                uploaded_at: p.facturaSo.fecha,
                            }} />
                        )}
                        <BotonAccion onClick={acciones.abrirFactura} disabled={!lote?.sujeto_obligado_id}
                            title={!lote?.sujeto_obligado_id ? 'Asigna primero el Sujeto Obligado' : ''}>
                            {p.facturaSo?.numero ? `Factura de Brokergy al S.O. · ${p.facturaSo.numero}` : 'Generar factura de Brokergy al S.O.'}
                        </BotonAccion>
                    </div>
                </Fase>
            )}

            {error && <p className="text-[10px] text-red-400">{error}</p>}

            {enviarOferta && (
                <EnviarOfertaModal
                    lote={lote}
                    oferta={p.oferta || ofertaRecien}
                    onClose={() => setEnviarOferta(false)}
                    onSent={() => { if (onChanged) onChanged(); }}
                />
            )}
        </div>
    );
}

export default LoteProcesoFases;
