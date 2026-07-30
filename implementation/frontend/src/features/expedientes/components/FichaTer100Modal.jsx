import React, { useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { postEmail } from '../../../utils/emailFallback';
import { buildFichaTer100Html, buildFichaTer100Body, fichaTer100Css, deriveFichaTer100 } from '../logic/fichaTer100Html';

// ─── Modal de la Ficha TER100 (sector terciario) ──────────────────────────────
// A diferencia de los modales de RES060/RES080/RES093 —que repiten el documento
// dos veces: una en JSX para la vista previa y otra como plantilla de texto para
// el PDF— aquí la previsualización se pinta con el MISMO builder que genera el
// PDF (logic/fichaTer100Html.js). Así lo que se ve en pantalla es literalmente lo
// que se descarga, y un cambio en la ficha se hace en un solo sitio.
//
// El CSS del documento es el de impresión más unas pocas reglas de PANTALLA
// (páginas separadas, con sombra y alto mínimo en vez de alto fijo).
const SCREEN_CSS = `
.doc-wrap { background: #e8e8e8; width: 794px; }
.doc-wrap .doc-page {
    height: auto;
    min-height: 1123px;
    margin-bottom: 12px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.18);
}
`;

export function FichaTer100Modal({ isOpen, onClose, expediente, onSaveDrive }) {
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const avail = containerRef.current.clientWidth - 48;
        setScale(avail < 794 ? avail / 794 : 1);
    }, []);

    React.useEffect(() => {
        if (!isOpen) return;
        updateScale();
        const t = setTimeout(updateScale, 80);
        window.addEventListener('resize', updateScale);
        return () => { clearTimeout(t); window.removeEventListener('resize', updateScale); };
    }, [isOpen, updateScale]);

    if (!isOpen || !expediente) return null;

    const op = expediente.oportunidades || {};
    // `clientes` es el join real del expediente; `cliente` se mantiene por
    // compatibilidad con las llamadas antiguas de los modales de ficha.
    const cli = expediente.clientes || expediente.cliente || {};
    const numexpte = expediente.numero_expediente || '';

    const datos = deriveFichaTer100(expediente);
    const bodyHtml = buildFichaTer100Body(expediente);
    const staticHtml = () => buildFichaTer100Html(expediente);

    const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: staticHtml() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${numexpte || 'DRAFT'} - Ficha TER100.pdf`;
            a.click();
        } catch { alert('Error al generar el PDF.'); }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive en la oportunidad.'); return; }
        setSavingDrive(true);
        try {
            const { data } = await axios.post('/api/pdf/save-to-drive', {
                html: staticHtml(),
                folderId,
                fileName: `${numexpte || 'DRAFT'} - Ficha TER100`,
                subfolderName: '6. ANEXOS CAE'
            });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                alert('✅ Guardado en Drive (carpeta 6. ANEXOS CAE)');
            }
        } catch { alert('Error al guardar en Drive.'); }
        finally { setSavingDrive(false); }
    };

    const handleSendByEmail = async () => {
        const toEmail = cli.email;
        if (!toEmail) { alert('❌ El cliente no tiene un email registrado.'); return; }
        setSendingEmail(true);
        try {
            const userName = [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ');
            const response = await postEmail('/api/pdf/send-proposal', {
                html: staticHtml(),
                to: toEmail,
                userName,
                summaryData: { id: numexpte, docType: 'Ficha TER100', userName }
            });
            if (response.data.success) alert(`✅ Ficha TER100 enviada correctamente a ${toEmail}`);
        } catch (error) {
            console.error('Error sending email:', error);
            alert('❌ Error al enviar el correo: ' + (error.response?.data?.message || error.message));
        } finally { setSendingEmail(false); }
    };

    const handleSendByWhatsapp = async () => {
        const toPhone = cli.tlf || cli.telefono;
        if (!toPhone) { alert('❌ El cliente no tiene un teléfono registrado.'); return; }
        setSendingWhatsapp(true);
        try {
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) { alert('❌ WhatsApp no está conectado.'); return; }
            const pdfResp = await axios.post('/api/pdf/generate', { html: staticHtml() });
            const firstName = (cli.nombre_razon_social || '').split(/\s+/)[0];
            const caption = `Hola ${firstName},\n\nTe adjunto la *Ficha TER100* de tu expediente *${numexpte}*.\n\nUn saludo,\n*BROKERGY*`;
            await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption,
                media: { base64: pdfResp.data?.pdf, filename: `${numexpte}_Ficha_TER100.pdf`, mimetype: 'application/pdf' },
                asDocument: true,
            });
            alert('✅ Ficha TER100 enviada por WhatsApp correctamente.');
        } catch (error) {
            console.error('Error sending WhatsApp:', error);
            alert('❌ Error al enviar por WhatsApp: ' + (error.response?.data?.message || error.message));
        } finally { setSendingWhatsapp(false); }
    };

    const busy = generating || savingDrive || sendingEmail || sendingWhatsapp;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>

                {/* ── Toolbar ── */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Ficha TER100</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numexpte} · 5 páginas · Sector terciario</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Desglose del ahorro por servicio: es lo propio de TER100 */}
                        <div className="hidden md:flex items-center gap-4 mr-3 pr-3 border-r border-white/10">
                            {[
                                { label: 'AE calefacción', value: datos.aeCal, color: 'text-brand' },
                                { label: 'AE ACS', value: datos.aeAcs, color: 'text-cyan-400' },
                                { label: 'AE piscina', value: datos.aeCap, color: 'text-sky-400' },
                                { label: 'AE total', value: datos.aeTotal, color: 'text-emerald-400' },
                            ].map(m => (
                                <div key={m.label} className="text-center">
                                    <div className={`${m.color} font-black text-sm`}>{m.value}</div>
                                    <div className="text-white/25 text-[10px] uppercase tracking-wider">{m.label}</div>
                                </div>
                            ))}
                        </div>

                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={busy}
                                title="Guardar en Drive"
                                className="text-white/40 hover:text-blue-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                            >
                                {savingDrive
                                    ? <div className="w-5 h-5 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                    : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>}
                            </button>
                        )}

                        <button
                            onClick={handleSendByEmail}
                            disabled={busy}
                            title="Enviar por Correo"
                            className="text-white/40 hover:text-brand w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingEmail
                                ? <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                                : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                        </button>

                        <button
                            onClick={handleSendByWhatsapp}
                            disabled={busy}
                            title="Enviar por WhatsApp"
                            className="text-white/40 hover:text-emerald-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingWhatsapp
                                ? <div className="w-5 h-5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                                : <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>}
                        </button>

                        <button onClick={handleDownloadPdf} disabled={busy}
                                className="flex items-center gap-2 px-5 py-2 bg-brand text-white text-xs font-black rounded-xl uppercase tracking-wider hover:bg-brand/90 transition-all disabled:opacity-30">
                            {generating
                                ? <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>

                {/* Área scrolleable — el MISMO HTML que se manda a generar el PDF */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left"
                         style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: fichaTer100Css() + SCREEN_CSS }} />
                        <div className="doc-wrap" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
