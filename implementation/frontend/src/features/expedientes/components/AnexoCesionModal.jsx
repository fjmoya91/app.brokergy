import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { buildAnexoCesionHtml, buildAnexoIHtml, getDualMessage, ANEXO_CESION_CSS } from '../utils/docGenerators';
import { useAuth } from '../../../context/AuthContext';
import AppConfirm from '../../../components/AppConfirm';

const LOGO_URL  = '/logo_brokergy_dark.png';

export function AnexoCesionModal({ isOpen, onClose, expediente, results, onSaveDrive }) {
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState(null);

    const updateScale = useCallback(() => {
        if (containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            const docWidth = 794;
            const newScale = (containerWidth - 60) / docWidth;
            setScale(Math.min(newScale, 1.2));
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            updateScale();
            window.addEventListener('resize', updateScale);
        }
        return () => window.removeEventListener('resize', updateScale);
    }, [isOpen, updateScale]);

    if (!isOpen || !expediente) return null;

    const op      = expediente.oportunidades || {};
    const cliente = expediente.clientes || {};
    const inst    = expediente.instalacion || {};
    const numexpte = expediente.numero_expediente || '___________';

    const aeRaw     = results?.savingsKwh || 0;
    const aeKwh     = Math.round(aeRaw).toLocaleString('es-ES', { useGrouping: true });

    // Simplificando lógica de beneficio para evitar errores de sintaxis
    const opInputs = op?.datos_calculo?.inputs || {};
    const rateMwh = parseFloat(inst.economico_override?.cae_client_rate ?? opInputs.cae_client_rate) || 0;
    const rateMWhStr = rateMwh ? Math.round(rateMwh).toString() : '___';
    
    let beneficioRaw = results?.caeBonus;
    if (beneficioRaw === undefined || beneficioRaw === null) {
        if (aeRaw && rateMwh) {
            beneficioRaw = (aeRaw / 1000) * rateMwh;
        }
    }
    const beneficioStr = beneficioRaw ? Math.round(beneficioRaw).toLocaleString('es-ES', { useGrouping: true }) : '___________';

    const handleDownload = async () => {
        setGenerating(true);
        try {
            const html = buildAnexoCesionHtml(expediente, results);
            const { data } = await axios.post('/api/pdf/generate', { html }, { timeout: 60000 });
            if (!data.pdf) throw new Error('Error al generar el PDF');
            
            const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
            const blob  = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${numexpte} - Anexo Cesion ahorro.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error PDF:', err);
            alert('Error al generar el PDF.');
        } finally {
            setGenerating(false);
        }
    };

    const handleSaveDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) {
            alert('No se encontró el identificador de la carpeta de Drive en la oportunidad.');
            return;
        }
        setSavingDrive(true);
        try {
            const html = buildAnexoCesionHtml(expediente, results);
            const fileName = `${numexpte} - Anexo Cesion ahorro`;
            await axios.post('/api/pdf/save-to-drive', {
                html, 
                folderId,
                fileName,
                subfolderName: '6. ANEXOS CAE'
            }, { timeout: 90000 });
            alert('✅ Guardado en Drive correctamente');
        } catch (err) {
            console.error(err);
            alert('Error al guardar en Drive');
        } finally {
            setSavingDrive(false);
        }
    };

    const handleSendByEmail = async () => {
        const toEmail = cliente.email;
        if (!toEmail) {
            setConfirmConfig({ title: 'Error', message: '❌ El cliente no tiene un email registrado.', confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
            return;
        }

        const missingAnexoI = [];
        const rc = opInputs.rc || cliente.referencia_catastral || inst.ref_catastral;
        if (!rc || rc === '___________') missingAnexoI.push('Referencia Catastral');

        const missingCesion = [];
        const hasIban = !!(cliente.numero_cuenta && !cliente.numero_cuenta.includes('_'));
        const hasUtms = !!(inst.coord_x && inst.coord_y && !inst.coord_x.includes('_'));
        if (!hasIban) missingCesion.push('IBAN (Número de cuenta)');
        if (!hasUtms) missingCesion.push('Coordenadas UTM');

        const executeSend = async (sendDual) => {
            setConfirmConfig(null);
            setSendingEmail(true);
            try {
                const summaryData = { id: numexpte, docType: sendDual ? 'Anexo de Cesion y Anexo I' : 'Anexo de Cesion', userName: [cliente.nombre_razon_social, cliente.apellidos].filter(Boolean).join(' ') };
                const htmlCesion = buildAnexoCesionHtml(expediente, results);
                const firstName = (cliente.nombre_razon_social || '').split(/\s+/)[0];
                const docs = [{ html: htmlCesion, fileName: `${numexpte}_Anexo_Cesion.pdf` }];
                let customMessage = null;
                if (sendDual) {
                    const htmlAnexoI = buildAnexoIHtml(expediente, results);
                    docs.push({ html: htmlAnexoI, fileName: `${numexpte}_Anexo_I.pdf` });
                    customMessage = getDualMessage(firstName, beneficioStr, numexpte);
                }
                await axios.post('/api/pdf/send-annex', { to: toEmail, userName: summaryData.userName, customMessage, summaryData, docs });
                setConfirmConfig({ title: 'Éxito', message: `✅ ${sendDual ? 'Ambos anexos enviados' : 'Anexo de Cesión enviado'} correctamente a ${toEmail}`, confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
            } catch (error) {
                setConfirmConfig({ title: 'Error', message: "❌ Error al enviar el correo: " + (error.response?.data?.message || error.message), confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
            } finally { setSendingEmail(false); }
        };

        const checkIncompletes = (sendDual) => {
            const currentMissing = missingCesion;
            const otherMissing = sendDual ? missingAnexoI : [];
            const allMissing = [...currentMissing, ...otherMissing];

            if (allMissing.length > 0) {
                setConfirmConfig({
                    title: 'Documentos Incompletos',
                    type: 'warning',
                    message: `Hay datos incompletos en los documentos:\n${allMissing.join(', ')}\n\n¿Estás seguro de que quieres enviarlos así?`,
                    confirmText: 'Enviar de todos modos',
                    onConfirm: () => executeSend(sendDual),
                    onCancel: () => setConfirmConfig(null)
                });
            } else {
                executeSend(sendDual);
            }
        };

        setConfirmConfig({
            title: '¿Enviar por Email?',
            message: `Vas a enviar el Anexo de Cesión a ${toEmail}.` + (missingCesion.length ? `\n(Nota: Le faltan datos: ${missingCesion.join(', ')})` : '') + 
                     `\n\n¿Quieres enviar también el Anexo I?` + (missingAnexoI.length ? `\n(Nota: Le faltan datos: ${missingAnexoI.join(', ')})` : ''),
            confirmText: 'Enviar Ambos',
            cancelText: 'Enviar sólo Cesión',
            onConfirm: () => checkIncompletes(true),
            onCancel: () => checkIncompletes(false)
        });
    };

    const handleSendByWhatsapp = async () => {
        const toPhone = cliente.tlf || cliente.telefono;
        if (!toPhone) {
            setConfirmConfig({ title: 'Error', message: '❌ El cliente no tiene un teléfono registrado.', confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
            return;
        }

        const missingAnexoI = [];
        const rc = opInputs.rc || cliente.referencia_catastral || inst.ref_catastral;
        if (!rc || rc === '___________') missingAnexoI.push('Referencia Catastral');

        const missingCesion = [];
        const hasIban = !!(cliente.numero_cuenta && !cliente.numero_cuenta.includes('_'));
        const hasUtms = !!(inst.coord_x && inst.coord_y && !inst.coord_x.includes('_'));
        if (!hasIban) missingCesion.push('IBAN (Número de cuenta)');
        if (!hasUtms) missingCesion.push('Coordenadas UTM');

        const executeSend = async (sendDual) => {
            setConfirmConfig(null);
            setSendingWhatsapp(true);
            try {
                const st = await axios.get('/api/whatsapp/status');
                if (!st.data?.ready) {
                    setConfirmConfig({ title: 'WhatsApp desconectado', message: '❌ WhatsApp no está conectado.', confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
                    return;
                }
                const firstName = (cliente.nombre_razon_social || '').split(/\s+/)[0];
                const htmlCesion = buildAnexoCesionHtml(expediente, results);
                if (sendDual) {
                    const htmlAnexoI = buildAnexoIHtml(expediente, results);
                    const caption = getDualMessage(firstName, beneficioStr, numexpte);
                    const resC = await axios.post('/api/pdf/generate', { html: htmlCesion });
                    const resI = await axios.post('/api/pdf/generate', { html: htmlAnexoI });
                    await axios.post('/api/whatsapp/send-media', { phone: toPhone, caption, media: { base64: resC.data.pdf, filename: `${numexpte}_Anexo_Cesion.pdf`, mimetype: 'application/pdf' }, asDocument: true });
                    await axios.post('/api/whatsapp/send-media', { phone: toPhone, caption: 'Anexo I (Declaración Responsable)', media: { base64: resI.data.pdf, filename: `${numexpte}_Anexo_I.pdf`, mimetype: 'application/pdf' }, asDocument: true });
                    setConfirmConfig({ title: 'Éxito', message: '✅ Ambos anexos enviados por WhatsApp correctamente.', confirmText: 'Genial', onConfirm: () => setConfirmConfig(null) });
                } else {
                    const pdfResp = await axios.post('/api/pdf/generate', { html: htmlCesion });
                    const caption = `Hola ${firstName},\n\nTe adjunto el *Anexo de Cesion de Ahorros* para tu expediente *${numexpte}*.\n\nPor favor, revísalo y quedo a tu disposición para cualquier duda.\n\nUn saludo,\n*BROKERGY*`;
                    await axios.post('/api/whatsapp/send-media', { phone: toPhone, caption, media: { base64: pdfResp.data?.pdf, filename: `${numexpte}_Anexo_Cesion.pdf`, mimetype: 'application/pdf' }, asDocument: true });
                    setConfirmConfig({ title: 'Éxito', message: '✅ Anexo de Cesión enviado por WhatsApp correctamente.', confirmText: 'Genial', onConfirm: () => setConfirmConfig(null) });
                }
            } catch (error) {
                setConfirmConfig({ title: 'Error', message: "❌ Error al enviar por WhatsApp: " + (error.response?.data?.message || error.message), confirmText: 'Entendido', onConfirm: () => setConfirmConfig(null) });
            } finally { setSendingWhatsapp(false); }
        };

        const checkIncompletes = (sendDual) => {
            const currentMissing = missingCesion;
            const otherMissing = sendDual ? missingAnexoI : [];
            const allMissing = [...currentMissing, ...otherMissing];

            if (allMissing.length > 0) {
                setConfirmConfig({
                    title: 'Documentos Incompletos',
                    type: 'warning',
                    message: `Hay datos incompletos en los documentos:\n${allMissing.join(', ')}\n\n¿Estás seguro de que quieres enviarlos así?`,
                    confirmText: 'Enviar por WhatsApp anyway',
                    onConfirm: () => executeSend(sendDual),
                    onCancel: () => setConfirmConfig(null)
                });
            } else {
                executeSend(sendDual);
            }
        };

        setConfirmConfig({
            title: '¿Enviar por WhatsApp?',
            message: `Vas a enviar la documentación al teléfono ${toPhone}.` + (missingCesion.length ? `\n(Nota: Le faltan datos: ${missingCesion.join(', ')})` : '') + 
                     `\n\n¿Quieres enviar también el Anexo I?` + (missingAnexoI.length ? `\n(Nota: Le faltan datos: ${missingAnexoI.join(', ')})` : ''),
            confirmText: 'Enviar Ambos',
            cancelText: 'Enviar sólo Cesión',
            onConfirm: () => checkIncompletes(true),
            onCancel: () => checkIncompletes(false)
        });
    };

    const Spinner = () => (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
    );

    return (
        <>
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
                <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                    <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                        <div className="flex items-center gap-3">
                            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <div className="border-l border-white/10 pl-3">
                                <h2 className="text-sm font-black text-white tracking-wider uppercase">Convenio Cesión CAE</h2>
                                <p className="text-white/30 text-xs mt-0.5">{numexpte} · 2 páginas</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-4 mr-3 pr-3 border-r border-white/10">
                                <div className="text-center"><div className="text-brand font-black text-sm">{aeKwh} kWh</div><div className="text-white/25 text-[10px] uppercase tracking-wider">Ahorro</div></div>
                                <div className="text-center"><div className="text-amber-400 font-black text-sm">{beneficioStr} €</div><div className="text-white/25 text-[10px] uppercase tracking-wider">Bono CAE</div></div>
                            </div>
                            {user?.rol?.toUpperCase() === 'ADMIN' && (
                                <button onClick={handleSaveDrive} disabled={savingDrive || generating || sendingEmail || sendingWhatsapp} title="Guardar en Drive" className="text-white/40 hover:text-blue-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20">
                                    {savingDrive ? <Spinner /> : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>}
                                </button>
                            )}
                            <button onClick={handleSendByEmail} disabled={sendingEmail || generating || savingDrive || sendingWhatsapp} title="Enviar por Correo" className="text-white/40 hover:text-brand w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20">
                                {sendingEmail ? <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin" /> : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                            </button>
                            <button onClick={handleSendByWhatsapp} disabled={sendingWhatsapp || generating || savingDrive || sendingEmail} title="Enviar por WhatsApp" className="text-white/40 hover:text-emerald-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20">
                                {sendingWhatsapp ? <div className="w-5 h-5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" /> : <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>}
                            </button>
                            <button onClick={handleDownload} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand text-white text-xs font-black uppercase tracking-wider hover:bg-brand/90 transition-all disabled:opacity-30">
                                {generating ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                                {generating ? 'Generando...' : 'Descargar PDF'}
                            </button>
                        </div>
                    </div>

                    <div ref={containerRef} className="flex-1 overflow-y-auto py-8 px-4" style={{ background: '#16181D' }}>
                        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, margin: '0 auto' }}>
                            <div 
                                className="conv-wrap" 
                                dangerouslySetInnerHTML={{ __html: buildAnexoCesionHtml(expediente, results) }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: ANEXO_CESION_CSS }} />
            <AppConfirm 
                isOpen={!!confirmConfig}
                {...confirmConfig}
                onCancel={confirmConfig?.onCancel || (() => setConfirmConfig(null))}
            />
        </>
    );
}

export default AnexoCesionModal;
