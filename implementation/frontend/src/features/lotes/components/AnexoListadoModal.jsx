import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { buildAnexoListadoHtml, buildAnexoListadoRows, buildAnexoListadoTotals, CONVENIO_FECHA_DEFAULT, fichaDe } from '../logic/anexoListado';
import { buildFichaRes060Html } from '../../expedientes/logic/fichaRes060Html';
import { buildFichaRes080Html } from '../../expedientes/logic/fichaRes080Html';
import { buildFichaRes093Html } from '../../expedientes/logic/fichaRes093Html';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { SIGN_BOXES, fichaSignBox } from '../../expedientes/logic/signBoxes';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Textos ancla para pre-situar el recuadro de firma (Autofirma) en la firma en cadena del S.O.
const ANEXO_ANCHOR = ['fdo', 'firma', 'representante legal', 'el cedente'];
const FICHA_ANCHOR = ['fdo', 'firma', 'representante'];

// Lee un File a base64 (sin el prefijo data:).
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
});

export function AnexoListadoModal({ lote, onClose }) {
    const { showAlert, showConfirm } = useModal();
    const [mes, setMes] = useState(() => MESES[new Date().getMonth()]);
    const [convenioFecha, setConvenioFecha] = useState(CONVENIO_FECHA_DEFAULT);
    const [generating, setGenerating] = useState(false);

    const rows = useMemo(() => buildAnexoListadoRows(lote), [lote]);
    const totals = useMemo(() => buildAnexoListadoTotals(rows), [rows]);
    const html = useMemo(() => buildAnexoListadoHtml(lote, { mes, convenioFecha }), [lote, mes, convenioFecha]);

    // ── Envío al Sujeto Obligado ──────────────────────────────────────────────
    const so = lote.sujeto_obligado || {};
    const soEmail = so.email || '';
    const soRepNombre = [so.nombre_responsable, so.apellidos_responsable].filter(Boolean).join(' ') || undefined;
    const soRepNif = so.nif_responsable || undefined;

    // Los contactos del S.O. ya están en su ficha (`contactos_notificacion`): el
    // interlocutor habitual va como destinatario y el email de la empresa en copia,
    // en vez de escribirlos a mano en cada envío.
    const soContactos = useMemo(() => {
        const raw = so.contactos_notificacion;
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? JSON.parse(raw || '[]') : []);
        return (arr || []).filter(c => c && (c.email || c.tlf));
    }, [so.contactos_notificacion]);

    const contactoPrincipal = soContactos[0] || null;
    const soNotifyEmail = so.notify_email || contactoPrincipal?.email || soEmail || '';
    const soNotifyPhone = contactoPrincipal?.tlf || so.tlf || '';
    // En copia: el email de la empresa y el resto de contactos, sin repetir el destinatario.
    const soCc = useMemo(() => {
        const dest = (soNotifyEmail || '').toLowerCase();
        return [soEmail, ...soContactos.map(c => c.email)]
            .filter(e => e && e.toLowerCase() !== dest)
            .filter((e, i, arr) => arr.indexOf(e) === i);
    }, [soEmail, soContactos, soNotifyEmail]);

    // Aviso corto por WhatsApp al interlocutor, además del email con los documentos.
    const avisoWaDefault = `Hola ${contactoPrincipal?.nombre ? String(contactoPrincipal.nombre).split(' ')[0] : ''}, os hemos enviado por email otro lote (${lote.codigo || ''}) para firmar.

Una vez firmado a través de la app, nos llegará una notificación para continuar con el proceso.
Cuando tengamos la oferta del verificador formal os la enviamos para su firma.
Un saludo.`.replace(/ ,/g, ',');
    const numFichas = (lote.expedientes || []).length;
    const [sendOpen, setSendOpen] = useState(false);
    const [solicitud, setSolicitud] = useState(null);   // { name, base64 }
    const [solicitudErr, setSolicitudErr] = useState('');
    const [solicitudDrag, setSolicitudDrag] = useState(false);
    // Aviso por WhatsApp al interlocutor del S.O. (editable antes de enviar).
    const [avisoWaOn, setAvisoWaOn] = useState(true);
    const [avisoWaPhone, setAvisoWaPhone] = useState('');
    const [avisoWaMsg, setAvisoWaMsg] = useState('');
    // Firma del PROVEEDOR (Brokergy) del Anexo I ANTES de enviarlo al S.O.
    const [provSignOpen, setProvSignOpen] = useState(false);
    const [provPdfB64, setProvPdfB64] = useState(null);       // PDF del listado a firmar
    const [proveedorSigned, setProveedorSigned] = useState(null); // base64 del listado firmado por Brokergy
    const [provBusy, setProvBusy] = useState(false);
    // Si cambian mes/convenio, el listado se regenera → invalida la firma previa de Brokergy.
    useEffect(() => { setProveedorSigned(null); }, [mes, convenioFecha]);

    // Al abrir el envío, sembramos el aviso con el contacto y el texto por defecto,
    // pero DESACTIVADO: enviar un WhatsApp a un tercero se decide a mano en cada
    // envío (y en pruebas se cambia el número por el propio).
    useEffect(() => {
        if (!sendOpen) return;
        setAvisoWaPhone(soNotifyPhone || '');
        setAvisoWaMsg(avisoWaDefault);
        setAvisoWaOn(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendOpen]);
    const sendMsg = `Estimados,\n\nAdjuntamos el Anexo I (Listado de Cesión de Ahorros) del lote ${lote.codigo || ''}, que recoge ${totals.numActuaciones} actuaciones con un ahorro total de ${totals.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh/año (${totals.ahorroGwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} GWh/año), junto con las fichas técnicas RES de cada actuación y la solicitud de verificación.\n\nRogamos procedan a su firma con el certificado electrónico del representante legal. Pueden firmar todo en cadena desde el enlace que incluimos más abajo (Autofirma), sin descargar ni volver a subir nada. Quedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`;

    // Construye los documentos a adjuntar: Anexo I (listado) + una ficha por expediente (RES060/080/093).
    const buildDocs = () => {
        const rep = { representanteNombre: soRepNombre, representanteNif: soRepNif };
        // Si Brokergy ya firmó el Anexo I (columna PROVEEDOR), se envía ESE PDF firmado
        // (pdfBase64) para que el S.O. solo añada su firma; si no, se genera del HTML.
        const docs = [{ html, pdfBase64: proveedorSigned, fileName: `${lote.codigo || 'LOTE'} - Anexo I Listado Cesion`, label: 'Anexo I', tipo: 'anexo_i_listado', expediente_id: null, anchor: ANEXO_ANCHOR, fixedBox: SIGN_BOXES.anexo_i_listado }];
        for (const e of (lote.expedientes || [])) {
            const f = fichaDe(e.numero_expediente);
            const fichaHtml = f === 'RES080' ? buildFichaRes080Html(e, rep)
                : f === 'RES093' ? buildFichaRes093Html(e, rep)
                    : buildFichaRes060Html(e, computeExpedienteFinancials(e), rep);
            docs.push({ html: fichaHtml, fileName: `${e.numero_expediente} - Ficha ${f}`, label: `Ficha ${f}`, tipo: 'ficha_res', expediente_id: e.id, anchor: FICHA_ANCHOR, fixedBox: fichaSignBox(f) });
        }
        return docs;
    };

    const aceptarSolicitud = async (file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setSolicitudErr('El fichero debe ser un PDF.'); return; }
        setSolicitudErr('');
        try {
            const base64 = await fileToBase64(file);
            setSolicitud({ name: file.name, base64 });
        } catch { setSolicitudErr('No se pudo leer el fichero.'); }
    };

    const onPickSolicitud = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        await aceptarSolicitud(file);
    };

    const onDropSolicitud = async (e) => {
        e.preventDefault();
        setSolicitudDrag(false);
        await aceptarSolicitud(e.dataTransfer.files?.[0]);
    };

    // Envío al S.O. vía el backend del lote: crea carpeta, mueve expedientes, guarda
    // borradores (Anexo I + fichas + solicitud) y manda el email/WhatsApp con el enlace de firma.
    const handleEnviarSo = async ({ email, phone, channels, message }) => {
        const { data } = await axios.post(`/api/lotes/${lote.id}/enviar-so`, {
            to: email,
            cc: soCc,
            phone,
            channels,
            customMessage: message,
            avisoWhatsApp: (avisoWaOn && avisoWaPhone.trim())
                ? { phone: avisoWaPhone.trim(), message: avisoWaMsg }
                : null,
            summaryData: { id: lote.codigo || 'LOTE', docType: 'Anexo I · Listado Cesión + Fichas RES' },
            docs: buildDocs().map(d => ({ html: d.html, pdfBase64: d.pdfBase64 || null, fileName: d.fileName, label: d.label, tipo: d.tipo, expediente_id: d.expediente_id || null, anchor: d.anchor || null, fixedBox: d.fixedBox || null })),
            solicitud: solicitud ? { base64: solicitud.base64, fileName: solicitud.name, fixedBox: SIGN_BOXES.solicitud_verificacion } : null,
            frontendOrigin: window.location.origin,
        });
        const warnings = data?.warnings || [];
        const results = [];
        if (channels.email) {
            const w = warnings.find(x => /^email/i.test(x));
            const ccTxt = soCc.length ? ` (cc: ${soCc.join(', ')})` : '';
            results.push({ channel: 'email', status: w ? 'fail' : 'ok', text: w || `→ ${email}${ccTxt}` });
        }
        if (channels.whatsapp) {
            const w = warnings.find(x => /^whatsapp/i.test(x));
            results.push({ channel: 'whatsapp', status: w ? 'fail' : 'ok', text: w || `→ ${phone}` });
        }
        if (avisoWaOn && avisoWaPhone.trim()) {
            const w = warnings.find(x => /^aviso whatsapp/i.test(x));
            results.push({ channel: 'whatsapp', status: w ? 'fail' : 'ok', text: w || `Aviso → ${avisoWaPhone.trim()}` });
        }
        return results;
    };

    // Slot para subir la Solicitud de Verificación descargada (se inyecta en el modal de envío).
    const solicitudSlot = (
        <div className="space-y-5">
            <div>
                <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Solicitud de Verificación (PDF)</label>
                {solicitud ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30">
                        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span className="text-[11px] text-white/80 truncate flex-1">{solicitud.name}</span>
                        <button type="button" onClick={() => setSolicitud(null)} className="text-white/40 hover:text-red-400 transition-colors text-xs font-black shrink-0">✕</button>
                    </div>
                ) : (
                    <label
                        onDragOver={(e) => { e.preventDefault(); setSolicitudDrag(true); }}
                        onDragLeave={() => setSolicitudDrag(false)}
                        onDrop={onDropSolicitud}
                        className={`flex items-center gap-2 px-3 py-4 rounded-xl border border-dashed text-[11px] cursor-pointer transition-all ${solicitudDrag ? 'border-brand bg-brand/5 text-white/80' : 'border-white/15 text-white/50 hover:border-brand/40 hover:text-white/70'}`}
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        {solicitudDrag ? 'Suelta aquí el PDF' : 'Arrastra el PDF de la solicitud o pulsa para elegirlo'}
                        <input type="file" accept="application/pdf" className="hidden" onChange={onPickSolicitud} />
                    </label>
                )}
                {solicitudErr && <p className="mt-1 text-[10px] text-red-400">{solicitudErr}</p>}
                <p className="mt-1 text-[9px] text-white/25">Se adjunta al email y entra en la firma en cadena del S.O.</p>
            </div>

            {/* Aviso por WhatsApp, además del email. Desactivado por defecto y con el
                número siempre editable: en pruebas se pone el propio. */}
            <div>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={avisoWaOn} onChange={e => setAvisoWaOn(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                        Avisar por WhatsApp {contactoPrincipal?.nombre ? `a ${contactoPrincipal.nombre}` : ''}
                    </span>
                </label>

                {avisoWaOn && (
                    <>
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="tel"
                                value={avisoWaPhone}
                                onChange={e => setAvisoWaPhone(e.target.value)}
                                placeholder="Teléfono destino (ej. 600 000 000)"
                                className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40"
                            />
                            {soNotifyPhone && avisoWaPhone.trim() !== soNotifyPhone && (
                                <button type="button" onClick={() => setAvisoWaPhone(soNotifyPhone)}
                                    className="shrink-0 px-2.5 py-2 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                                    title={`Restaurar el teléfono del S.O. (${soNotifyPhone})`}>
                                    ↺ S.O.
                                </button>
                            )}
                        </div>

                        {/* Avisa de a quién va a llegar de verdad el mensaje. */}
                        {avisoWaPhone.trim() && soNotifyPhone && avisoWaPhone.trim() !== soNotifyPhone ? (
                            <p className="mb-2 text-[10px] text-amber-400/80">
                                Se enviará a {avisoWaPhone.trim()}, no al contacto del S.O.
                            </p>
                        ) : (
                            <p className="mb-2 text-[10px] text-white/25">
                                {soNotifyPhone
                                    ? `Se enviará a ${contactoPrincipal?.nombre || 'el contacto del S.O.'} (${soNotifyPhone}).`
                                    : 'El S.O. no tiene teléfono en su ficha: escribe el destino a mano.'}
                            </p>
                        )}

                        <textarea
                            value={avisoWaMsg}
                            onChange={e => setAvisoWaMsg(e.target.value)}
                            rows={5}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-white normal-case resize-none focus:outline-none focus:border-emerald-500/40"
                        />
                    </>
                )}
            </div>

            {/* A quién va: destinatario + copias, resueltos desde la ficha del S.O. */}
            {soCc.length > 0 && (
                <p className="text-[10px] text-white/30 leading-snug">
                    En copia: <span className="text-white/50">{soCc.join(', ')}</span>
                </p>
            )}
        </div>
    );

    // Firma del PROVEEDOR (Brokergy): genera el PDF del listado y abre Autofirma con la
    // caja de la columna izquierda. El PDF firmado se enviará luego al S.O.
    const handleFirmarProveedor = async () => {
        setProvBusy(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html });
            if (!data?.pdf) throw new Error('No se pudo generar el PDF del Anexo I');
            setProvPdfB64(data.pdf);
            setProvSignOpen(true);
        } catch (err) {
            showAlert(err.response?.data?.error || err.message || 'Error al preparar la firma', 'Error', 'error');
        } finally {
            setProvBusy(false);
        }
    };
    const onProveedorSigned = (signedB64) => {
        setProveedorSigned(signedB64);
        setProvSignOpen(false);
        setProvPdfB64(null);
    };

    // Antes de enviar: si NO se ha subido la Solicitud de Verificación, preguntar si
    // continuar sin ella o volver para subirla. Devuelve true = enviar, false = cancelar.
    const confirmAntesDeEnviar = async () => {
        if (solicitud) return true;
        return showConfirm(
            'No has adjuntado la Solicitud de Verificación (PDF). Si continúas, se enviará al S.O. sin ella y no entrará en la firma en cadena.\n\nPulsa "Enviar sin solicitud" para continuar, o "Cancelar" para subirla primero.',
            'Falta la solicitud de verificación',
            'warning'
        );
    };

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html });
            const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${lote.codigo || 'LOTE'} - Anexo I Listado Cesion.pdf`;
            a.click();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al generar el PDF', 'Error', 'error');
        } finally {
            setGenerating(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-5xl my-8 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-base font-black text-white">Anexo I · Listado Cesión de Ahorros</h2>
                        <p className="text-[11px] text-white/40 mt-0.5">{lote.codigo || 'Lote'} · {totals.numActuaciones} actuaciones · {totals.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Campos editables */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Mes</label>
                            <select value={mes} onChange={e => setMes(e.target.value)}
                                className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none">
                                {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Fecha del convenio</label>
                            <input value={convenioFecha} onChange={e => setConvenioFecha(e.target.value)} placeholder="dd/mm/aaaa"
                                className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
                        </div>
                    </div>

                    {/* Previsualización del documento */}
                    <div className="border border-white/[0.08] rounded-xl overflow-auto max-h-[55vh] bg-white">
                        <div className="min-w-[900px]" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>

                    {(!lote.oferta_lote && lote.oferta_lote !== 0) && (
                        <p className="text-[11px] text-amber-400/80">⚠️ El lote no tiene <b>Oferta lote (€/MWh)</b> fijada: la columna Precio saldrá vacía. Ponla en el detalle del lote.</p>
                    )}

                </div>

                {/* Estado de la firma del Proveedor (Brokergy) */}
                <div className="px-6">
                    {proveedorSigned ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30">
                            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-[11px] text-emerald-300 font-bold flex-1">Anexo I firmado por el Proveedor (Brokergy). Al enviar, el S.O. solo añadirá su firma.</span>
                            <button onClick={handleFirmarProveedor} disabled={provBusy} className="text-[10px] font-black uppercase tracking-wider text-white/40 hover:text-white/70 shrink-0">Volver a firmar</button>
                        </div>
                    ) : (
                        <p className="text-[11px] text-white/40">Recomendado: firma el Anexo I como <b className="text-white/70">Proveedor (Brokergy)</b> antes de enviarlo al S.O.</p>
                    )}
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] flex-wrap">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cerrar</button>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={handleFirmarProveedor} disabled={provBusy}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-400/30 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 transition-all flex items-center gap-1.5">
                            {provBusy ? 'Preparando…' : (proveedorSigned ? '✓ Firmado (Proveedor)' : '🖊️ Firmar (Proveedor)')}
                        </button>
                        <button onClick={() => setSendOpen(true)}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-all">
                            Enviar al S.O.
                        </button>
                        <button onClick={handleDownloadPdf} disabled={generating}
                            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep disabled:opacity-40 transition-all">
                            {generating ? 'Generando…' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>
            </div>
            {sendOpen && (
                <EnviarLoteDocModal
                    title="Enviar al Sujeto Obligado"
                    subtitle={`${lote.codigo || 'Lote'} · Anexo I + ${numFichas} ficha(s) RES${solicitud ? ' + solicitud' : ''}`}
                    defaultEmail={soNotifyEmail}
                    defaultMessage={sendMsg}
                    summaryData={{ id: lote.codigo || 'LOTE', docType: 'Anexo I · Listado Cesión + Fichas RES' }}
                    docs={buildDocs()}
                    extraBody={solicitudSlot}
                    onSendOverride={handleEnviarSo}
                    onBeforeSend={confirmAntesDeEnviar}
                    onClose={() => setSendOpen(false)}
                />
            )}
            {provSignOpen && provPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={provPdfB64}
                    title={`Firmar Anexo I como Proveedor · ${lote.codigo || 'Lote'}`}
                    fixedBox={SIGN_BOXES.anexo_i_listado_proveedor}
                    onClose={() => { setProvSignOpen(false); setProvPdfB64(null); }}
                    onSigned={onProveedorSigned}
                />
            )}
        </div>,
        document.body
    );
}
