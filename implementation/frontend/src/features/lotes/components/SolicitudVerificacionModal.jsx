import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { buildSolicitudVerificacionHtml, SOLICITUD_DEFAULTS, vidaUtilDefaultSolicitud } from '../logic/solicitudVerificacion';
import { fichaDe } from '../logic/anexoListado';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';

export function SolicitudVerificacionModal({ lote, onClose }) {
    const { showAlert } = useModal();
    const exps = lote.expedientes || [];

    const [contacto, setContacto] = useState({ ...SOLICITUD_DEFAULTS.contacto });
    const [intermediaria, setIntermediaria] = useState(SOLICITUD_DEFAULTS.intermediaria);
    const [cnae, setCnae] = useState(SOLICITUD_DEFAULTS.cnae);
    const [vidaUtil, setVidaUtil] = useState(() => {
        const m = {};
        for (const e of exps) m[e.id] = vidaUtilDefaultSolicitud(fichaDe(e.numero_expediente));
        return m;
    });
    const [generating, setGenerating] = useState(false);

    const html = useMemo(
        () => buildSolicitudVerificacionHtml(lote, { contacto, intermediaria, cnae, vidaUtilByExp: vidaUtil }),
        [lote, contacto, intermediaria, cnae, vidaUtil]
    );

    const totalMwh = useMemo(
        () => exps.reduce((s, e) => s + (computeExpedienteFinancials(e).savingsKwh || 0), 0) / 1000,
        [exps]
    );

    // ── Envío al Verificador ──────────────────────────────────────────────────
    const ver = lote.verificador || {};
    const verNotify = ver.notify_email || ver.email || '';
    const [sendOpen, setSendOpen] = useState(false);
    const sendMsg = `Estimados,\n\nAdjuntamos el Formulario de Solicitud de Verificación Estandarizada del lote ${lote.codigo || ''}, que recoge ${exps.length} actuaciones con un ahorro total de ${totalMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh/año, para su verificación.\n\nQuedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`;

    const upd = (patch) => setContacto(c => ({ ...c, ...patch }));

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html });
            const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${lote.codigo || 'LOTE'} - Solicitud Verificacion.pdf`;
            a.click();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al generar el PDF', 'Error', 'error');
        } finally { setGenerating(false); }
    };

    const inputCls = 'w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none';

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-5xl my-8 shadow-2xl">

                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-base font-black text-white">Solicitud de Verificación Estandarizada</h2>
                        <p className="text-[11px] text-white/40 mt-0.5">{lote.codigo || 'Lote'} · {exps.length} actuaciones · {totalMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Datos de contacto del solicitante (Brokergy, editable) */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Persona de contacto</label>
                            <input value={contacto.persona} onChange={e => upd({ persona: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Email</label>
                            <input value={contacto.email} onChange={e => upd({ email: e.target.value })} className={`${inputCls} lowercase`} />
                        </div>
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Teléfono</label>
                            <input value={contacto.telefono} onChange={e => upd({ telefono: e.target.value })} className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Empresa intermediaria CAE</label>
                            <input value={intermediaria} onChange={e => setIntermediaria(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">CNAE</label>
                            <input value={cnae} onChange={e => setCnae(e.target.value)} className={inputCls} />
                        </div>
                    </div>

                    {/* Vida útil por actuación (RES080 puede ser 15 ó 25) */}
                    <div>
                        <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Vida útil por actuación (años)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {exps.map(e => (
                                <div key={e.id} className="flex items-center gap-2 bg-bkg-surface border border-white/[0.06] rounded-lg px-3 py-1.5">
                                    <span className="text-[12px] text-white/70 flex-1 truncate">{e.numero_expediente} <span className="text-white/30">· {fichaDe(e.numero_expediente)}</span></span>
                                    <input type="number" value={vidaUtil[e.id] ?? ''} onChange={ev => setVidaUtil(m => ({ ...m, [e.id]: ev.target.value === '' ? '' : Number(ev.target.value) }))}
                                        className="w-16 bg-bkg-base border border-white/[0.08] rounded-lg px-2 py-1 text-sm text-white text-center focus:border-brand/40 focus:outline-none" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Previsualización */}
                    <div className="border border-white/[0.08] rounded-xl overflow-auto max-h-[50vh] bg-white">
                        <div dangerouslySetInnerHTML={{ __html: html }} />
                    </div>

                </div>

                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] flex-wrap">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cerrar</button>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => setSendOpen(true)}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-all">
                            Enviar al Verificador
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
                    title="Enviar al Verificador"
                    subtitle={`${lote.codigo || 'Lote'} · Solicitud de Verificación`}
                    defaultEmail={verNotify}
                    defaultMessage={sendMsg}
                    summaryData={{ id: lote.codigo || 'LOTE', docType: 'Solicitud de Verificación Estandarizada' }}
                    docs={[{ html, fileName: `${lote.codigo || 'LOTE'} - Solicitud Verificacion`, label: 'Solicitud' }]}
                    onClose={() => setSendOpen(false)}
                />
            )}
        </div>,
        document.body
    );
}
