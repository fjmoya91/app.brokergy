import { useMemo, useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { analizarProceso, SLOTS } from '../logic/loteProceso';
import { computeLoteEco } from '../logic/loteEco';
import { EnviarDocLoteModal } from './EnviarDocLoteModal';
import { BotonCarpetaLocal } from './BotonCarpetaLocal';

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

// El ciclo de un documento tiene CUATRO estados, y cada uno su color, para saber de
// un vistazo si la pelota está en nuestro tejado o en el del S.O./verificador:
//   BORRADOR (gris)  · generado o subido, todavía no ha salido
//   ENVIADO  (ámbar) · salió al S.O./verificador — esperando respuesta
//   RECIBIDO (cian)  · ha vuelto firmado, PENDIENTE DE REVISAR
//   OK       (verde) · revisado y dado por bueno por un ADMIN
const ESTADOS_DOC = {
    ok:       { label: 'OK ✓',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    recibido: { label: 'Recibido', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
    enviado:  { label: 'Enviado',  cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    borrador: { label: 'Borrador', cls: 'bg-white/[0.04] text-white/30 border-white/10' },
};

export const estadoDeDoc = (doc) => {
    if (!doc) return 'borrador';
    if (doc.validado_at) return 'ok';
    if (doc.signed_link) return 'recibido';
    if (doc.sent_at) return 'enviado';
    return 'borrador';
};

const EstadoPill = ({ doc }) => {
    const e = ESTADOS_DOC[estadoDeDoc(doc)];
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${e.cls}`}>{e.label}</span>;
};

// Documentos que pueden volver firmados (los que salen a firmar).
const TIPOS_FIRMABLES = ['solicitud_verificacion', 'anexo_i_listado', 'ficha_res', 'oferta_verificacion'];
const esFirmable = (doc) => TIPOS_FIRMABLES.includes(doc?.tipo);

// Fila de un documento. Cuando ha vuelto firmado, el firmado se pinta como una
// SUBFILA propia en cian/verde: son dos cosas distintas (lo que mandamos y lo que
// nos devolvieron) y antes se confundían en un solo enlace.
const Fila = ({ doc, acciones = null, onBorrar = null, onSubirFirmado = null, onValidar = null, ocupado = false }) => {
    const fecha = fmtFecha(doc.sent_at) || fmtFecha(doc.uploaded_at);
    const estado = estadoDeDoc(doc);
    return (
        <div className={`rounded-xl border transition-colors ${
            estado === 'ok' ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                : estado === 'recibido' ? 'bg-cyan-500/[0.04] border-cyan-500/20'
                    : 'bg-white/[0.02] border-white/[0.05] hover:border-white/10'}`}>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-white/80 truncate">{doc.label || doc.file_name}</p>
                    <p className="text-[9px] text-white/25">
                        {[doc.sent_at ? `Enviado ${fecha}` : (fecha ? `Subido ${fecha}` : null),
                          doc.importe ? eur(doc.importe) : null].filter(Boolean).join(' · ') || '—'}
                    </p>
                </div>
                <EstadoPill doc={doc} />
                <div className="flex items-center gap-1.5 shrink-0">
                    {doc.draft_link && (
                        <a href={doc.draft_link} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white/40 hover:text-white hover:bg-white/5 transition-all">Ver</a>
                    )}
                    {onBorrar && (
                        <button type="button" onClick={onBorrar} title="Quitar del lote"
                            className="px-1.5 py-1 rounded-lg text-[11px] text-white/20 hover:text-red-400 transition-all">✕</button>
                    )}
                </div>
            </div>

            {/* Lo que nos han DEVUELTO firmado, en su propia línea. */}
            {doc.signed_link && (
                <div className={`mx-3 mb-2.5 rounded-lg border px-2.5 py-2 flex items-center gap-2 flex-wrap ${
                    estado === 'ok' ? 'bg-emerald-500/[0.07] border-emerald-500/25' : 'bg-cyan-500/[0.07] border-cyan-500/25'}`}>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${estado === 'ok' ? 'text-emerald-400' : 'text-cyan-300'}`}>
                        ↩ Firmado recibido
                    </span>
                    <span className="text-[9px] text-white/30">{fmtFecha(doc.signed_at) || ''}</span>
                    <a href={doc.signed_link} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/5 transition-all">Abrir</a>
                    <div className="flex-1" />
                    {doc.validado_at ? (
                        <span className="text-[9px] text-emerald-400/70 font-bold">
                            OK{doc.validado_por ? ` · ${doc.validado_por}` : ''}
                            {onValidar && (
                                <button type="button" onClick={() => onValidar(false)} disabled={ocupado}
                                    className="ml-2 text-white/25 hover:text-amber-400 transition-colors">quitar</button>
                            )}
                        </span>
                    ) : onValidar ? (
                        <button type="button" onClick={() => onValidar(true)} disabled={ocupado}
                            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-all">
                            ✓ Marcar OK
                        </button>
                    ) : null}
                </div>
            )}

            {(acciones || onSubirFirmado) && (
                <div className="px-3 pb-2.5 flex items-center gap-2 flex-wrap">
                    {onSubirFirmado && (
                        <BotonSubir disabled={ocupado} onFile={onSubirFirmado}>
                            {doc.signed_link ? '↻ Reemplazar firmado' : '↑ Subir firmado'}
                        </BotonSubir>
                    )}
                    {acciones}
                </div>
            )}
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
    const [docAEnviar, setDocAEnviar] = useState(null);   // documento que se está mandando al S.O.
    const [importeFactura, setImporteFactura] = useState('');


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

    // ── El PDF que nos devuelven FIRMADO, de cualquier documento del lote ─────
    // Vale para el Anexo I, las fichas, la solicitud o la oferta: da igual que el
    // S.O. haya firmado por el enlace o nos lo mande por email, acaba en el mismo
    // sitio (mismo endpoint que la firma pública).
    const subirFirmado = async (docKey, file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setError('El fichero firmado debe ser un PDF.'); return; }
        setError('');
        setSubiendo(docKey);
        try {
            const base64 = await fileToBase64(file);
            await axios.post(`/api/lotes/${lote.id}/documentos/${docKey}/firmado`, { base64 });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar el firmado.');
        } finally {
            setSubiendo(null);
        }
    };

    // Visto bueno del ADMIN: que vuelva firmado no quiere decir que esté bien.
    const validar = async (docKey, ok) => {
        setError('');
        setSubiendo(docKey);
        try {
            await axios.post(`/api/lotes/${lote.id}/documentos/${docKey}/validar`, { ok });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo marcar el documento.');
        } finally {
            setSubiendo(null);
        }
    };

    // Props comunes de una fila de documento (firmado + visto bueno cuando aplica).
    const propsFila = (d) => ({
        ocupado: subiendo === d.key,
        onSubirFirmado: esFirmable(d) ? (f) => subirFirmado(d.key, f) : null,
        onValidar: (canSeeMargin && d.signed_link) ? (ok) => validar(d.key, ok) : null,
        onBorrar: (SLOTS[d.tipo] && !d.signed_link) ? () => borrar(d) : null,
    });

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
        const enviar = await showConfirm(
            'La oferta de verificación ya está guardada en la carpeta del lote.\n\n¿La enviamos ahora al Sujeto Obligado para que la firme?',
            'Oferta subida', 'success'
        );
        if (enviar) setDocAEnviar(doc);
    };

    // Fase 4 — la factura del verificador trae su importe (rellena el coste del lote).
    const subirFacturaVerificador = async (file) => {
        const imp = Number(String(importeFactura).replace(',', '.'));
        const doc = await subir('factura_verificador', file, Number.isFinite(imp) && imp > 0 ? { importe: imp } : {});
        if (!doc) return;
        setImporteFactura('');
        if (!(Number.isFinite(imp) && imp > 0)) {
            await showAlert('Factura guardada, pero sin importe no se puede calcular a cuánto le sale el €/MWh al Sujeto Obligado. Puedes volver a subirla con el importe.', 'Sin importe', 'info');
        }
        // El verificador se la emite AL S.O., así que se la remitimos nosotros.
        const enviar = await showConfirm(
            'Factura del verificador guardada en el lote.\n\n¿Se la enviamos por email al Sujeto Obligado? Es a él a quien se la emite el verificador.',
            'Factura subida', 'success'
        );
        if (enviar) setDocAEnviar(doc);
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
                    {f.docs.map(d => <Fila key={d.key} doc={d} {...propsFila(d)} />)}
                    {/* El aviso de "aún no toca" NO impide actuar: los lotes que vienen
                        de antes de la app tienen documentos firmados fuera y hay que
                        poder registrarlos igual. Se avisa, no se bloquea. */}
                    {bloqueada && <p className="text-[10px] text-white/25 italic">{f.bloqueo}</p>}
                    {children}
                </div>
            </div>
        );
    };

    const [f1, f2, f3, f4, f5, f6] = p.fases;
    const nExps = (lote?.expedientes || []).length;

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Proceso del lote</p>
                {lote?.drive_folder_id && (
                    <div className="flex items-center gap-2">
                        <BotonCarpetaLocal loteId={lote.id} compacto onError={setError} />
                        <a href={`https://drive.google.com/drive/folders/${lote.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                            Abrir carpeta Drive →
                        </a>
                    </div>
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
                {/* Subir el firmado y darle el OK van en la propia fila del documento;
                    aquí solo lo que es de la fase: traer la oferta y mandarla a firmar. */}
                <div className="flex items-center gap-2 flex-wrap">
                    {!p.oferta ? (
                        <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta} destacado>
                            {subiendo === 'oferta_verificacion' ? 'Subiendo…' : '↑ Subir oferta del verificador'}
                        </BotonSubir>
                    ) : (
                        <>
                            {!p.ofertaFirmada && (
                                <BotonAccion onClick={() => setDocAEnviar(p.oferta)}>
                                    {p.ofertaEnviada ? '↻ Reenviar para firma' : '✉ Enviar para firma'}
                                </BotonAccion>
                            )}
                            <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta}>Reemplazar oferta</BotonSubir>
                        </>
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

                    {p.verificado && <p className="text-[10px] text-emerald-400/70">Verificación favorable · informe y dictamen recibidos.</p>}
                </div>
            </Fase>

            {/* 5 · Presentación a MITECO y resolución de la Gestora de Ahorros */}
            <Fase f={f5}>
                <div className="flex items-center gap-2 flex-wrap">
                    {!p.justificanteMiteco && (
                        <BotonSubir disabled={subiendo === 'justificante_miteco'} onFile={(f) => subir('justificante_miteco', f)}>
                            {subiendo === 'justificante_miteco' ? 'Subiendo…' : '↑ Justificante de subida a MITECO'}
                        </BotonSubir>
                    )}
                    <BotonSubir disabled={subiendo === 'requerimiento_ga'} onFile={(f) => subir('requerimiento_ga', f)}>
                        {subiendo === 'requerimiento_ga' ? 'Subiendo…' : `+ Requerimiento G.A.${p.requerimientosGa.length ? ` (${p.requerimientosGa.length})` : ''}`}
                    </BotonSubir>
                    {!p.certificadoCae && (
                        <BotonSubir disabled={subiendo === 'certificado_cae'} onFile={(f) => subir('certificado_cae', f)} destacado>
                            {subiendo === 'certificado_cae' ? 'Subiendo…' : '↑ Certificado CAE emitido'}
                        </BotonSubir>
                    )}
                </div>
                {p.certificadoCae && <p className="text-[10px] text-emerald-400/70">CAE emitido · pendiente del pago del S.O. a Brokergy.</p>}
            </Fase>

            {/* 6 · La factura de Brokergy al S.O. por la venta de CAEs. NO es la del
                verificador (fase 4, que va del verificador al S.O.). Es margen: solo ADMIN. */}
            {canSeeMargin && (
                <Fase f={f6}>
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

            {docAEnviar && (
                <EnviarDocLoteModal
                    lote={lote}
                    doc={docAEnviar}
                    onClose={() => setDocAEnviar(null)}
                    onSent={() => { if (onChanged) onChanged(); }}
                />
            )}
        </div>
    );
}

export default LoteProcesoFases;
