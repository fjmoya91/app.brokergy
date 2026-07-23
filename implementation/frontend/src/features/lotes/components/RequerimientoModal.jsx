import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { buildAnexoListadoHtml, CONVENIO_FECHA_DEFAULT, fichaDe } from '../logic/anexoListado';
import { buildFichaRes060Html } from '../../expedientes/logic/fichaRes060Html';
import { buildFichaRes080Html } from '../../expedientes/logic/fichaRes080Html';
import { buildFichaRes093Html } from '../../expedientes/logic/fichaRes093Html';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { SIGN_BOXES, fichaSignBox } from '../../expedientes/logic/signBoxes';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';

// ─────────────────────────────────────────────────────────────────────────────
// Requerimiento — reenvío al S.O. de documentos concretos para NUEVA firma.
//
// Cuando el S.O./verificador hace un requerimiento (p.ej. una ficha estaba mal),
// se corrige el dato en el expediente y desde aquí se REENVÍAN solo las fichas
// afectadas (opcionalmente el Anexo I). La app las REGENERA con los datos
// actuales, resetea su firma y manda el enlace `/firmar-lote/:id` para que el S.O.
// las vuelva a firmar en cadena (o firme los PDF adjuntos). El resto de documentos
// ya firmados del lote no se tocan. Ver POST /api/lotes/:id/requerimiento.
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ANEXO_ANCHOR = ['fdo', 'firma', 'representante legal', 'el cedente'];
const FICHA_ANCHOR = ['fdo', 'firma', 'representante'];

export function RequerimientoModal({ lote, onClose, onSent }) {
    const expedientes = useMemo(() => (Array.isArray(lote?.expedientes) ? lote.expedientes : []), [lote]);
    const docsSo = useMemo(() => (Array.isArray(lote?.documentos_so) ? lote.documentos_so : []), [lote]);

    // Estado de firma actual de cada ficha (por key `ficha_<expId>`), para orientar.
    const estadoFicha = (expId) => {
        const d = docsSo.find(x => x.key === `ficha_${expId}`);
        if (!d) return { label: 'no enviada', tone: 'text-white/30 border-white/10 bg-white/[0.03]' };
        if (d.signed_link) return { label: 'firmada', tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
        if (d.sent_at) return { label: 'enviada', tone: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
        return { label: 'borrador', tone: 'text-white/40 border-white/10 bg-white/[0.03]' };
    };

    const [sel, setSel] = useState(() => new Set());
    const [incluirAnexo, setIncluirAnexo] = useState(false);
    const [mes, setMes] = useState(() => MESES[new Date().getMonth()]);
    const [convenioFecha, setConvenioFecha] = useState(CONVENIO_FECHA_DEFAULT);
    const [sendOpen, setSendOpen] = useState(false);

    const toggle = (id) => setSel(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });
    const allSelected = expedientes.length > 0 && sel.size === expedientes.length;
    const toggleAll = () => setSel(allSelected ? new Set() : new Set(expedientes.map(e => e.id)));

    const selectedExps = useMemo(() => expedientes.filter(e => sel.has(e.id)), [expedientes, sel]);
    const nSel = selectedExps.length + (incluirAnexo ? 1 : 0);

    // ── Destinatario S.O. (misma resolución que AnexoListadoModal) ──────────────
    const so = lote.sujeto_obligado || {};
    const soEmail = so.email || '';
    const soRepNombre = [so.nombre_responsable, so.apellidos_responsable].filter(Boolean).join(' ') || undefined;
    const soRepNif = so.nif_responsable || undefined;
    const soContactos = useMemo(() => {
        const raw = so.contactos_notificacion;
        const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw.trim() ? JSON.parse(raw || '[]') : []);
        return (arr || []).filter(c => c && (c.email || c.tlf));
    }, [so.contactos_notificacion]);
    const contactoPrincipal = soContactos[0] || null;
    const soNotifyEmail = so.notify_email || contactoPrincipal?.email || soEmail || '';
    const soNotifyPhone = contactoPrincipal?.tlf || so.tlf || '';
    const soCc = useMemo(() => {
        const dest = (soNotifyEmail || '').toLowerCase();
        return [soEmail, ...soContactos.map(c => c.email)]
            .filter(e => e && e.toLowerCase() !== dest)
            .filter((e, i, arr) => arr.indexOf(e) === i);
    }, [soEmail, soContactos, soNotifyEmail]);

    // ── Documentos a regenerar y reenviar ───────────────────────────────────────
    const buildDocs = () => {
        const rep = { representanteNombre: soRepNombre, representanteNif: soRepNif };
        const docs = [];
        if (incluirAnexo) {
            docs.push({
                html: buildAnexoListadoHtml(lote, { mes, convenioFecha }),
                key: 'anexo_i', fileName: `${lote.codigo || 'LOTE'} - Anexo I Listado Cesion`,
                label: 'Anexo I', tipo: 'anexo_i_listado', expediente_id: null,
                anchor: ANEXO_ANCHOR, fixedBox: SIGN_BOXES.anexo_i_listado,
            });
        }
        for (const e of selectedExps) {
            const f = fichaDe(e.numero_expediente);
            const html = f === 'RES080' ? buildFichaRes080Html(e, rep)
                : f === 'RES093' ? buildFichaRes093Html(e, rep)
                    : buildFichaRes060Html(e, computeExpedienteFinancials(e), rep);
            docs.push({
                html, fileName: `${e.numero_expediente} - Ficha ${f}`, label: `Ficha ${f} · ${e.numero_expediente}`,
                tipo: 'ficha_res', expediente_id: e.id, anchor: FICHA_ANCHOR, fixedBox: fichaSignBox(f),
            });
        }
        return docs;
    };

    const listaDocs = [
        ...(incluirAnexo ? ['Anexo I (Listado de Cesión)'] : []),
        ...selectedExps.map(e => `Ficha ${fichaDe(e.numero_expediente)} · ${e.numero_expediente}`),
    ];
    const cabecera = `Estimados,\n\nHemos recibido un requerimiento sobre el lote ${lote.codigo || ''} y hemos corregido y regenerado los siguientes documentos, que necesitamos que vuelvan a firmar:\n\n${listaDocs.map(l => `· ${l}`).join('\n')}`;
    const cierre = `Disculpen las molestias y quedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`;

    // Mensaje del EMAIL: lleva los PDF adjuntos y el enlace de firma en cadena.
    const sendMsg = `${cabecera}\n\nPueden firmarlos de nuevo en cadena desde el enlace que incluimos más abajo (Autofirma), sin descargar ni volver a subir nada, o bien firmar los PDF adjuntos y devolvérnoslos. El resto de documentos que ya nos firmaron no se ven afectados.\n\n${cierre}`;

    // Mensaje de WHATSAPP: solo un AVISO para que revisen el email. Ni enlace de
    // firma ni PDFs adjuntos — el canal de trabajo es el correo. `*_..._*` es el
    // formato de WhatsApp para negrita + cursiva.
    const waMsg = `${cabecera}\n\nLes hemos enviado un email con los documentos para que puedan volver a firmarlos.\n\n${cierre}\n\n*_Esto es un mensaje automático generado desde la aplicación de Brokergy_*`;

    const handleRequerimiento = async ({ email, cc, phone, channels, message }) => {
        const ccList = Array.isArray(cc) ? cc : [];
        // El aviso corto solo tiene sentido si además va el email. Si el envío es
        // SOLO por WhatsApp, mandamos el mensaje completo (enlace + adjuntos), que
        // si no el S.O. se quedaría sin forma de firmar.
        const soloWhatsapp = channels.whatsapp && !channels.email;
        const { data } = await axios.post(`/api/lotes/${lote.id}/requerimiento`, {
            to: email,
            cc: ccList,
            phone,
            channels,
            customMessage: message,
            whatsappMessage: soloWhatsapp ? null : waMsg,
            whatsappAttachments: soloWhatsapp,
            summaryData: { id: lote.codigo || 'LOTE', docType: 'Requerimiento · documentos para nueva firma' },
            docs: buildDocs().map(d => ({ html: d.html, key: d.key || null, fileName: d.fileName, label: d.label, tipo: d.tipo, expediente_id: d.expediente_id || null, anchor: d.anchor || null, fixedBox: d.fixedBox || null })),
            frontendOrigin: window.location.origin,
        });
        onSent?.(data?.lote);
        const warnings = data?.warnings || [];
        const results = [];
        if (channels.email) {
            const w = warnings.find(x => /^email/i.test(x));
            const ccTxt = ccList.length ? ` (cc: ${ccList.join(', ')})` : '';
            results.push({ channel: 'email', status: w ? 'fail' : 'ok', text: w || `→ ${email}${ccTxt}` });
        }
        if (channels.whatsapp) {
            const w = warnings.find(x => /^whatsapp/i.test(x));
            results.push({ channel: 'whatsapp', status: w ? 'fail' : 'ok', text: w || `→ ${phone}` });
        }
        return results;
    };

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-lg my-8 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-base font-black text-white">Requerimiento · reenviar para firma</h2>
                        <p className="text-[11px] text-white/40 mt-0.5">{lote.codigo || 'Lote'} · elige qué documentos regenerar y reenviar</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-[11px] text-white/40 leading-relaxed">
                        Se <b className="text-white/70">regeneran con los datos actuales</b> solo los documentos marcados y se resetea su firma para que el S.O. los vuelva a firmar. La versión anterior (borrador y firmado) se archiva en la subcarpeta <b className="text-white/60">OLD</b> de Drive y la nueva se nombra <b className="text-white/60">_rev1</b>, <b className="text-white/60">_rev2</b>… El resto de documentos ya firmados del lote no se tocan.
                    </p>

                    {/* Fichas por expediente */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] uppercase tracking-widest font-black text-white/30">Fichas RES a reenviar</label>
                            {expedientes.length > 0 && (
                                <button type="button" onClick={toggleAll}
                                    className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                                    {allSelected ? 'Ninguna' : 'Todas'}
                                </button>
                            )}
                        </div>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                            {expedientes.length === 0 ? (
                                <p className="text-[12px] text-white/30 py-3 text-center">El lote no tiene expedientes.</p>
                            ) : expedientes.map(e => {
                                const est = estadoFicha(e.id);
                                const checked = sel.has(e.id);
                                return (
                                    <label key={e.id}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${checked ? 'border-brand/40 bg-brand/5' : 'border-white/[0.06] bg-bkg-surface hover:border-white/15'}`}>
                                        <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} className="w-4 h-4 accent-brand shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-bold text-white truncate">{e.numero_expediente} <span className="text-white/40 font-normal">· Ficha {fichaDe(e.numero_expediente)}</span></p>
                                            {e.cliente_nombre && <p className="text-[10px] text-white/40 truncate">{e.cliente_nombre}</p>}
                                        </div>
                                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${est.tone}`}>{est.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Incluir Anexo I */}
                    <div className="border-t border-white/5 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={incluirAnexo} onChange={e => setIncluirAnexo(e.target.checked)} className="w-4 h-4 accent-brand" />
                            <span className="text-[11px] font-bold text-white/80">Incluir también el Anexo I (Listado de Cesión)</span>
                        </label>
                        {incluirAnexo && (
                            <div className="grid grid-cols-2 gap-2 mt-3">
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Mes</label>
                                    <select value={mes} onChange={e => setMes(e.target.value)}
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none">
                                        {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1">Fecha convenio</label>
                                    <input value={convenioFecha} onChange={e => setConvenioFecha(e.target.value)} placeholder="dd/mm/aaaa"
                                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none" />
                                </div>
                                <p className="col-span-2 text-[10px] text-amber-400/70">El Anexo I se regenera sin la firma del Proveedor (Brokergy). Si necesitas volver a firmarlo como Proveedor, hazlo desde “Anexo I · Cesión S.O.”.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06]">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cerrar</button>
                    <button onClick={() => setSendOpen(true)} disabled={nSel === 0}
                        className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        Continuar · {nSel} doc{nSel === 1 ? '' : 's'}
                    </button>
                </div>
            </div>

            {sendOpen && (
                <EnviarLoteDocModal
                    title="Requerimiento al Sujeto Obligado"
                    subtitle={`${lote.codigo || 'Lote'} · ${nSel} documento(s) para nueva firma`}
                    defaultEmail={soNotifyEmail}
                    defaultPhone={soNotifyPhone}
                    defaultMessage={sendMsg}
                    messageLabel="Mensaje (email)"
                    whatsappNote={waMsg}
                    defaultCc={soCc.join(', ')}
                    ccSuggestions={soCc}
                    summaryData={{ id: lote.codigo || 'LOTE', docType: 'Requerimiento · documentos para nueva firma' }}
                    docs={buildDocs()}
                    onSendOverride={handleRequerimiento}
                    onClose={() => setSendOpen(false)}
                />
            )}
        </div>,
        document.body
    );
}

export default RequerimientoModal;
