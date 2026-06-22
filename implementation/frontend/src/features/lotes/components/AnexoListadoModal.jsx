import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { buildAnexoListadoHtml, buildAnexoListadoRows, buildAnexoListadoTotals, CONVENIO_FECHA_DEFAULT, fichaDe } from '../logic/anexoListado';
import { buildFichaRes060Html } from '../../expedientes/logic/fichaRes060Html';
import { buildFichaRes080Html } from '../../expedientes/logic/fichaRes080Html';
import { buildFichaRes093Html } from '../../expedientes/logic/fichaRes093Html';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function AnexoListadoModal({ lote, onClose }) {
    const { showAlert } = useModal();
    const [mes, setMes] = useState(() => MESES[new Date().getMonth()]);
    const [convenioFecha, setConvenioFecha] = useState(CONVENIO_FECHA_DEFAULT);
    const [generating, setGenerating] = useState(false);

    const rows = useMemo(() => buildAnexoListadoRows(lote), [lote]);
    const totals = useMemo(() => buildAnexoListadoTotals(rows), [rows]);
    const html = useMemo(() => buildAnexoListadoHtml(lote, { mes, convenioFecha }), [lote, mes, convenioFecha]);

    // ── Envío al Sujeto Obligado ──────────────────────────────────────────────
    const so = lote.sujeto_obligado || {};
    const soEmail = so.email || '';
    const soNotifyEmail = so.notify_email || so.email || '';
    const soRepNombre = [so.nombre_responsable, so.apellidos_responsable].filter(Boolean).join(' ') || undefined;
    const soRepNif = so.nif_responsable || undefined;
    const numFichas = (lote.expedientes || []).length;
    const [sendOpen, setSendOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [recipient, setRecipient] = useState(soNotifyEmail);
    const [sendMsg, setSendMsg] = useState(
        `Estimados,\n\nAdjuntamos el Anexo I (Listado de Cesión de Ahorros) del lote ${lote.codigo || ''}, que recoge ${totals.numActuaciones} actuaciones con un ahorro total de ${totals.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh/año (${totals.ahorroGwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} GWh/año), junto con las fichas técnicas RES de cada actuación.\n\nRogamos procedan a su firma con el certificado electrónico del representante legal y nos devuelvan la documentación firmada para continuar con la tramitación. Quedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`
    );

    const handleEnviar = async () => {
        const to = (recipient || '').trim();
        if (!to) { showAlert('Indica un email de destinatario.', 'Falta email', 'warning'); return; }
        setSending(true);
        try {
            const docs = [{ html, fileName: `${lote.codigo || 'LOTE'} - Anexo I Listado Cesion` }];
            const rep = { representanteNombre: soRepNombre, representanteNif: soRepNif };
            for (const e of (lote.expedientes || [])) {
                const f = fichaDe(e.numero_expediente);
                const fichaHtml = f === 'RES080' ? buildFichaRes080Html(e, rep)
                    : f === 'RES093' ? buildFichaRes093Html(e, rep)
                        : buildFichaRes060Html(e, computeExpedienteFinancials(e), rep);
                docs.push({ html: fichaHtml, fileName: `${e.numero_expediente} - Ficha ${f}` });
            }
            await axios.post('/api/pdf/send-annex', {
                to,
                customMessage: sendMsg,
                summaryData: { id: lote.codigo || 'LOTE', docType: 'Anexo I · Listado Cesión + Fichas RES' },
                docs,
            });
            showAlert(`Enviado a ${to}: Anexo I + ${numFichas} ficha(s) RES.`, 'Enviado', 'success');
            setSendOpen(false);
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al enviar el paquete', 'Error', 'error');
        } finally { setSending(false); }
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

                    {/* Panel de envío al Sujeto Obligado */}
                    {sendOpen && (
                        <div className="border border-brand/20 bg-brand/[0.06] rounded-xl p-4 space-y-3 animate-fade-in">
                            <p className="text-[11px] uppercase tracking-widest font-black text-brand/70">Enviar al Sujeto Obligado</p>
                            <p className="text-[11px] text-white/50">Adjuntos: <b className="text-white/80">Anexo I + {numFichas} ficha(s) RES (una por actuación)</b></p>
                            <div>
                                <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Destinatario (email)</label>
                                <input type="email" value={recipient} onChange={e => setRecipient(e.target.value)}
                                    placeholder="email@destinatario"
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white lowercase focus:border-brand/40 focus:outline-none" />
                                <p className="text-[9px] text-white/30 mt-1">Por defecto, el contacto de notificaciones del S.O. ({soNotifyEmail || 'sin email en su ficha'}). Cámbialo para hacer una prueba antes de enviarlo de verdad.</p>
                            </div>
                            <div>
                                <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Mensaje</label>
                                <textarea value={sendMsg} onChange={e => setSendMsg(e.target.value)} rows={7}
                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white normal-case focus:border-brand/40 focus:outline-none resize-none" />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setSendOpen(false)} className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cancelar</button>
                                <button onClick={handleEnviar} disabled={sending || !(recipient || '').trim()}
                                    className="px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 disabled:opacity-40 transition-all">
                                    {sending ? 'Enviando…' : 'Confirmar envío'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] flex-wrap">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cerrar</button>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setSendOpen(s => !s)}
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
        </div>,
        document.body
    );
}
