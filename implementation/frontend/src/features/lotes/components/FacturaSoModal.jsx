import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { computeLoteEco } from '../logic/loteEco';
import { buildFacturaSoHtml, computeFacturaAmounts, defaultPrecioKwh } from '../logic/facturaSoHtml';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';

const pad = (n) => String(n).padStart(2, '0');
const toDmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const eur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// Nº de CAEs que cubre un rango "CAE_{serial}_{sufijo}" (serial = parte central).
function caeRangeCount(caeInicial, caeFinal) {
    const serial = (s) => {
        const m = String(s || '').match(/CAE_(\d+)_/i);
        return m ? parseInt(m[1], 10) : null;
    };
    const a = serial(caeInicial), b = serial(caeFinal);
    if (a == null || b == null) return null;
    return Math.abs(b - a) + 1;
}

export function FacturaSoModal({ lote, onClose, onGenerated }) {
    const { showAlert } = useModal();
    const eco = useMemo(() => computeLoteEco(lote), [lote]);
    const prev = lote.factura_so || null;
    // El CERTIFICADO CAE emitido trae el rango de códigos y el total: de ahí salen
    // el CAE inicial, el final y las unidades (se lee al subirlo; ver
    // `leerCodigosCertificadoCae` en el backend). Lo ya escrito en la factura manda.
    const certDoc = (lote.documentos_so || []).find(d => d?.key === 'certificado_cae') || null;
    const [certCae, setCertCae] = useState(certDoc?.cae || null);
    const [leyendoCert, setLeyendoCert] = useState(false);
    const [errorCert, setErrorCert] = useState('');
    const tieneCodigos = !!(prev?.cae_inicial || prev?.cae_final);

    const [numero, setNumero] = useState(prev?.numero || '');
    const [fecha, setFecha] = useState(prev?.fecha || toDmy(new Date()));
    const [vencimiento, setVencimiento] = useState(prev?.vencimiento || toDmy(new Date(Date.now() + 30 * 24 * 3600 * 1000)));
    const [caeInicial, setCaeInicial] = useState(prev?.cae_inicial || certDoc?.cae?.cae_inicial || '');
    const [caeFinal, setCaeFinal] = useState(prev?.cae_final || certDoc?.cae?.cae_final || '');
    // Sin códigos en la factura, las unidades son los CAE emitidos (1 CAE = 1 kWh);
    // el borrador puede traer ya las del ahorro, autoguardadas antes del certificado.
    const [unidadesKwh, setUnidadesKwh] = useState(
        (!tieneCodigos && certDoc?.cae?.total)
            ? certDoc.cae.total
            : (prev?.unidades_kwh ?? Math.round(eco.hasVerif ? eco.ahorroKwhVerif : eco.ahorroKwh))
    );
    const [precioKwh, setPrecioKwh] = useState(prev?.precio_kwh ?? defaultPrecioKwh(lote));
    const [generating, setGenerating] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [sendOpen, setSendOpen] = useState(false);

    // Sugerir el siguiente nº de factura de CAE (solo si aún no hay una emitida).
    useEffect(() => {
        if (prev?.numero) return;
        const year = new Date().getFullYear();
        axios.get('/api/lotes/factura-so/next-number', { params: { year } })
            .then(({ data }) => setNumero(data.numero))
            .catch(() => { });
    }, [prev?.numero]);

    // Lee el certificado ya subido (los subidos antes de que la app supiera leerlo
    // no traen `cae`). Solo RELLENA huecos; lo escrito no se pisa.
    const leerCertificado = async () => {
        setLeyendoCert(true); setErrorCert('');
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/certificado-cae/leer`);
            const c = data?.cae || null;
            setCertCae(c);
            if (c?.cae_inicial && c?.cae_final) {
                setCaeInicial(v => v || c.cae_inicial);
                setCaeFinal(v => v || c.cae_final);
                if (c.total && !tieneCodigos) setUnidadesKwh(c.total);
            }
        } catch (err) {
            setErrorCert(err.response?.data?.error || 'No se pudo leer el certificado CAE.');
        } finally {
            setLeyendoCert(false);
        }
    };
    useEffect(() => {
        if (certDoc?.draft_file_id && !certDoc?.cae && !tieneCodigos) leerCertificado();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const usarCodigosCertificado = () => {
        if (!certCae) return;
        setCaeInicial(certCae.cae_inicial || '');
        setCaeFinal(certCae.cae_final || '');
        if (certCae.total) setUnidadesKwh(certCae.total);
    };
    const difiereDelCert = !!certCae?.cae_inicial && (
        caeInicial.trim() !== certCae.cae_inicial || caeFinal.trim() !== certCae.cae_final
        || (certCae.total && Math.round(Number(unidadesKwh) || 0) !== Number(certCae.total)));

    const fields = { numero, fecha, vencimiento, caeInicial, caeFinal, unidadesKwh, precioKwh };
    const html = useMemo(() => buildFacturaSoHtml(lote, fields), [lote, numero, fecha, vencimiento, caeInicial, caeFinal, unidadesKwh, precioKwh]);
    const { base, iva, total } = computeFacturaAmounts({ unidadesKwh, precioKwh });

    const rangeCount = caeRangeCount(caeInicial, caeFinal);
    const rangeMismatch = rangeCount != null && Math.round(Number(unidadesKwh) || 0) !== rangeCount;

    // Auto-guardado del borrador en `facturas_so`: persiste al salir de cualquier
    // campo (onBlur burbujea en React). Nunca se pierde el dato aunque no se genere.
    const saveDraft = () => {
        axios.put(`/api/lotes/${lote.id}/factura-so/draft`, {
            factura: {
                numero: numero ? numero.trim() : null,
                fecha, vencimiento,
                cae_inicial: caeInicial ? caeInicial.trim() : null,
                cae_final: caeFinal ? caeFinal.trim() : null,
                unidades_kwh: Math.round(Number(unidadesKwh) || 0) || null,
                precio_kwh: Number(precioKwh) || null,
                base, iva, total,
            },
        }).catch(() => { });
    };

    const handleGenerate = async () => {
        if (!numero.trim()) return showAlert('Indica el número de factura.', 'Falta dato', 'warning');
        if (!caeInicial.trim() || !caeFinal.trim()) return showAlert('Indica el CAE inicial y el CAE final.', 'Faltan datos', 'warning');
        if (!(Number(unidadesKwh) > 0)) return showAlert('Las unidades (kWh) deben ser mayores que 0.', 'Falta dato', 'warning');
        setGenerating(true);
        try {
            const factura = {
                numero: numero.trim(), fecha, vencimiento,
                cae_inicial: caeInicial.trim(), cae_final: caeFinal.trim(),
                unidades_kwh: Math.round(Number(unidadesKwh)), precio_kwh: Number(precioKwh),
                base, iva, total,
            };
            const { data } = await axios.post(`/api/lotes/${lote.id}/factura-so`, { html, factura });
            onGenerated?.(data);
            showAlert('Factura generada y guardada en la carpeta del lote.', 'Hecho', 'success');
            onClose();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al generar la factura', 'Error', 'error');
        } finally {
            setGenerating(false);
        }
    };

    // Nombre del PDF: "{nº factura} - {nombre lote} - {acrónimo S.O.}" (igual que en Drive).
    const soAcronimo = lote.sujeto_obligado?.acronimo || lote.sujeto_obligado?.razon_social || '';
    const fileNameFactura = [numero || 'Factura', lote.codigo || 'LOTE', soAcronimo].filter(Boolean).join(' - ');

    // Descarga directa del PDF (sin guardar en Drive) — ruta existente /api/pdf/generate.
    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html });
            if (!data.pdf) throw new Error('No se pudo generar el PDF');
            const bytes = Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${fileNameFactura}.pdf`;
            a.click();
        } catch (err) {
            showAlert(err.response?.data?.error || 'Error al generar el PDF', 'Error', 'error');
        } finally {
            setDownloading(false);
        }
    };

    // Datos y mensaje del envío al Sujeto Obligado (mismo popup que el Anexo I del lote).
    const so = lote.sujeto_obligado || {};
    const soEmail = so.notify_email || so.email || '';
    const soPhone = so.landing_telefono_contacto || so.telefono || '';
    const fmtUnidades = Math.round(Number(unidadesKwh) || 0).toLocaleString('es-ES');
    const fmtTotal = (Number(total) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sendMessage = `Estimados,\n\nAdjuntamos la factura ${numero || ''} correspondiente a la venta de los Ahorros Energéticos del lote ${lote.codigo || ''} para la emisión de Certificados de Ahorro Energético (CAE).\n\n· Códigos CAE: del ${caeInicial || '—'} al ${caeFinal || '—'}\n· Volumen: ${fmtUnidades} kWh\n· Importe total: ${fmtTotal} € (IVA 21% incluido)\n\nRogamos procedan al pago mediante transferencia bancaria a la cuenta indicada en la factura. Quedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`;
    const sendDocs = [{ html, fileName: fileNameFactura, label: 'Factura S.O.' }];

    const inputCls = 'w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none';
    const labelCls = 'block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1';

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-5xl my-8 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-base font-black text-white">Factura al Sujeto Obligado</h2>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            {lote.codigo || 'Lote'} · {lote.sujeto_obligado?.razon_social || lote.sujeto_obligado?.acronimo || 'S.O. sin asignar'}
                            {prev?.numero && <span className="text-emerald-400/80"> · ya emitida ({prev.numero})</span>}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Campos editables · onBlur en el contenedor → auto-guarda el borrador */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" onBlur={saveDraft}>
                        <div>
                            <label className={labelCls}>Nº de factura</label>
                            <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="F-2026CAE_1" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Fecha factura</label>
                            <input value={fecha} onChange={e => setFecha(e.target.value)} placeholder="dd/mm/aaaa" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Vencimiento</label>
                            <input value={vencimiento} onChange={e => setVencimiento(e.target.value)} placeholder="dd/mm/aaaa" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>CAE inicial</label>
                            <input value={caeInicial} onChange={e => setCaeInicial(e.target.value)} placeholder="CAE_000000000000_000000" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>CAE final</label>
                            <input value={caeFinal} onChange={e => setCaeFinal(e.target.value)} placeholder="CAE_000000000000_000000" className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Unidades [kWh]</label>
                            <input type="number" value={unidadesKwh} onChange={e => setUnidadesKwh(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Precio [€/kWh]</label>
                            <input type="number" step="0.0001" value={precioKwh} onChange={e => setPrecioKwh(e.target.value)} className={inputCls} />
                        </div>
                    </div>

                    {/* Lo que dice el certificado CAE emitido */}
                    {certDoc && (
                        <div className={`text-[11px] rounded-xl px-3 py-2 border ${difiereDelCert ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-emerald-500/20 bg-emerald-500/[0.04]'}`}>
                            {leyendoCert ? (
                                <span className="text-white/60">Leyendo los códigos del Certificado CAE emitido…</span>
                            ) : certCae?.cae_inicial ? (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-white/60">
                                        Certificado CAE emitido: <b className="text-white/85">{certCae.cae_inicial}</b> → <b className="text-white/85">{certCae.cae_final}</b>
                                        {certCae.total ? <> · <b className="text-white/85">{Number(certCae.total).toLocaleString('es-ES')}</b> CAE</> : null}
                                    </span>
                                    {difiereDelCert
                                        ? <span className="text-amber-400/90">La factura no dice lo mismo.</span>
                                        : <span className="text-emerald-400/80">✓ La factura coincide.</span>}
                                    <span className="ml-auto flex items-center gap-3">
                                        {difiereDelCert && (
                                            <button onClick={usarCodigosCertificado} className="text-brand font-black uppercase tracking-widest text-[10px] hover:underline">Usar los del certificado</button>
                                        )}
                                        <button onClick={() => leerCertificado()} className="text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px]">Volver a leer</button>
                                    </span>
                                    {certCae.avisos?.length > 0 && (
                                        <p className="basis-full text-amber-400/80">⚠️ {certCae.avisos.join(' · ')}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-amber-400/80">{errorCert || 'No se han leído los códigos del Certificado CAE emitido.'}</span>
                                    <button onClick={() => leerCertificado()} className="ml-auto text-brand font-black uppercase tracking-widest text-[10px] hover:underline">Leer los códigos del certificado</button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Avisos */}
                    {!eco.hasVerif && (
                        <p className="text-[11px] text-amber-400/80">⚠️ El lote aún no tiene ahorro <b>verificado</b>; las unidades se han prerrellenado con el estimado. Revisa el dato del verificador antes de emitir.</p>
                    )}
                    {rangeMismatch && (
                        <p className="text-[11px] text-amber-400/80">⚠️ El rango de CAEs son <b>{rangeCount.toLocaleString('es-ES')}</b> códigos, pero has puesto <b>{Math.round(Number(unidadesKwh) || 0).toLocaleString('es-ES')}</b> kWh. Deberían coincidir.</p>
                    )}

                    {/* Totales rápidos */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50 bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2">
                        <span>Base <b className="text-white/80">{eur(base)}</b></span>
                        <span>· IVA 21% <b className="text-white/80">{eur(iva)}</b></span>
                        <span>· Total <b className="text-emerald-400">{eur(total)}</b></span>
                        {prev?.drive_link && (
                            <a href={prev.drive_link} target="_blank" rel="noopener noreferrer" className="ml-auto text-brand hover:underline font-black uppercase tracking-widest text-[10px]">Ver factura en Drive ↗</a>
                        )}
                    </div>

                    {/* Previsualización */}
                    <div className="border border-white/[0.08] rounded-xl overflow-auto max-h-[55vh] bg-white">
                        <div className="min-w-[760px]" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] flex-wrap">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">Cerrar</button>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={handleDownloadPdf} disabled={downloading || generating}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-white/15 text-white/70 hover:text-white hover:border-white/30 disabled:opacity-40 transition-all">
                            {downloading ? 'Generando…' : 'Descargar PDF'}
                        </button>
                        <button onClick={() => setSendOpen(true)} disabled={generating}
                            className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-40 transition-all">
                            Enviar al S.O.
                        </button>
                        <button onClick={handleGenerate} disabled={generating}
                            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep disabled:opacity-40 transition-all">
                            {generating ? 'Generando…' : (prev?.numero ? 'Regenerar y guardar' : 'Generar y guardar en Drive')}
                        </button>
                    </div>
                </div>
            </div>
            {sendOpen && (
                <EnviarLoteDocModal
                    title="Enviar factura al Sujeto Obligado"
                    subtitle={`${lote.codigo || 'Lote'} · Factura ${numero || ''}`}
                    defaultEmail={soEmail}
                    defaultPhone={soPhone}
                    defaultMessage={sendMessage}
                    summaryData={{ id: lote.codigo || 'LOTE', docType: 'Factura S.O.' }}
                    docs={sendDocs}
                    onClose={() => setSendOpen(false)}
                />
            )}
        </div>,
        document.body
    );
}
