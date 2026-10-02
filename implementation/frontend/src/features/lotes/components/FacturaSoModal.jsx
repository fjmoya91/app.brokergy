import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { computeLoteEco } from '../logic/loteEco';
import { buildFacturaSoHtml, computeFacturaAmounts, defaultPrecioKwh } from '../logic/facturaSoHtml';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';
import { mensajeFacturaSo, ahorroSoFactura } from '../logic/mensajeFacturaSo';
import { EQUIVALENCIA_FINANCIERA } from '../../calculator/logic/calculation';

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

// Una fila de importe de la columna derecha: rótulo a la izquierda, cifra a la derecha.
function Importe({ label, value, fuerte = false, color = 'text-white/85' }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className={`text-[11px] ${fuerte ? 'text-white/70 font-bold' : 'text-white/45'}`}>{label}</span>
            <span className={`tabular-nums shrink-0 ${fuerte ? 'text-base font-black' : 'text-[12px] font-bold'} ${color}`}>{value}</span>
        </div>
    );
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
            const c = data?.contabilidad;
            showAlert(
                c?.ruta
                    ? `Factura guardada en la carpeta del lote y en contabilidad (${c.ruta}).`
                    : `Factura guardada en la carpeta del lote, pero NO en contabilidad${c?.error ? `: ${c.error}` : ''}.`,
                c?.ruta ? 'Hecho' : 'Revisa contabilidad', c?.ruta ? 'success' : 'warning');
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

    // Datos y mensaje del envío al Sujeto Obligado: los MISMOS contactos que el resto
    // de envíos al S.O. (`deriveSoEnvio`): a quién va, con su cargo, y quién en copia.
    const envio = useMemo(() => deriveSoEnvio(lote.sujeto_obligado), [lote.sujeto_obligado]);
    // El mensaje lleva además lo que se ha ahorrado el S.O. con el lote frente a la
    // equivalencia financiera (sin IVA). Se rehace al elegir otro destinatario: el
    // saludo es de quien lo lee.
    const messageFor = useCallback((email) => {
        const nombre = envio.nombrePilaDe ? envio.nombrePilaDe(email) : '';
        return mensajeFacturaSo({
            saludo: nombre ? `Buenos días ${nombre},` : 'Buenos días,',
            codigoLote: lote.codigo, numero, caeInicial, caeFinal,
            unidadesKwh, precioKwh, base, total,
            costeVerif: eco.costeVerif, equivalencia: EQUIVALENCIA_FINANCIERA,
        });
    }, [envio, lote.codigo, numero, caeInicial, caeFinal, unidadesKwh, precioKwh, base, total, eco.costeVerif]);
    const ahorroSo = ahorroSoFactura({ unidadesKwh, base, costeVerif: eco.costeVerif, equivalencia: EQUIVALENCIA_FINANCIERA });
    const sendDocs = [{ html, fileName: fileNameFactura, label: 'Factura S.O.' }];

    const inputCls = 'w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:border-brand/40 focus:outline-none';
    const labelCls = 'block text-[9px] uppercase tracking-widest font-black text-white/30 mb-1';

    // ── Disposición: la FACTURA a la izquierda, a todo lo que da, y los DATOS en
    // una columna a la derecha con las acciones ancladas abajo — la misma que el
    // gestor de documentos firmados. Se edita un campo y se ve el papel cambiar al
    // lado, sin bajar por debajo de un formulario para encontrar el documento.
    // En el móvil no caben dos columnas: el documento arriba y los datos debajo.
    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-[1500px] h-[94vh] flex flex-col shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-white">Factura al Sujeto Obligado</h2>
                        <p className="text-[11px] text-white/40 mt-0.5 truncate">
                            {lote.codigo || 'Lote'} · {lote.sujeto_obligado?.razon_social || lote.sujeto_obligado?.acronimo || 'S.O. sin asignar'}
                            {prev?.numero && <span className="text-emerald-400/80"> · ya emitida ({prev.numero})</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {prev?.drive_link && (
                            <a href={prev.drive_link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-black uppercase tracking-widest text-[10px]">Ver en Drive ↗</a>
                        )}
                        <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex max-md:flex-col">

                    {/* La factura, tal cual saldrá en el PDF */}
                    <div className="flex-1 min-h-0 max-md:h-[45vh] max-md:shrink-0 overflow-auto custom-scrollbar bg-black/40 p-4 sm:p-6">
                        <div className="mx-auto w-[794px] max-w-none bg-white shadow-2xl rounded-sm overflow-hidden">
                            <div dangerouslySetInnerHTML={{ __html: html }} />
                        </div>
                    </div>

                    {/* Los datos, al lado del papel */}
                    <aside className="w-[400px] shrink-0 max-md:w-full max-md:flex-1 min-h-0 flex flex-col border-l max-md:border-l-0 max-md:border-t border-white/[0.06] bg-white/[0.01]">
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-4">

                            {/* Campos editables · onBlur en el contenedor → auto-guarda el borrador */}
                            <div className="grid grid-cols-2 gap-3" onBlur={saveDraft}>
                                <div className="col-span-2">
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
                                <div className="col-span-2">
                                    <label className={labelCls}>CAE inicial</label>
                                    <input value={caeInicial} onChange={e => setCaeInicial(e.target.value)} placeholder="CAE_000000000000_000000" className={`${inputCls} tabular-nums`} />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>CAE final</label>
                                    <input value={caeFinal} onChange={e => setCaeFinal(e.target.value)} placeholder="CAE_000000000000_000000" className={`${inputCls} tabular-nums`} />
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
                                <div className={`text-[11px] rounded-xl px-3 py-2.5 border ${difiereDelCert ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-emerald-500/20 bg-emerald-500/[0.04]'}`}>
                                    {leyendoCert ? (
                                        <span className="text-white/60">Leyendo los códigos del Certificado CAE emitido…</span>
                                    ) : certCae?.cae_inicial ? (
                                        <div className="space-y-1.5">
                                            <p className="text-[9px] uppercase tracking-widest font-black text-white/35">Certificado CAE emitido</p>
                                            <p className="text-white/75 tabular-nums break-all">
                                                {certCae.cae_inicial} → {certCae.cae_final}
                                                {certCae.total ? <> · <b className="text-white/90">{Number(certCae.total).toLocaleString('es-ES')}</b> CAE</> : null}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                {difiereDelCert
                                                    ? <span className="text-amber-400/90">La factura no dice lo mismo.</span>
                                                    : <span className="text-emerald-400/80">✓ La factura coincide.</span>}
                                                <span className="ml-auto flex items-center gap-3">
                                                    {difiereDelCert && (
                                                        <button onClick={usarCodigosCertificado} className="text-brand font-black uppercase tracking-widest text-[10px] hover:underline">Usar los del certificado</button>
                                                    )}
                                                    <button onClick={() => leerCertificado()} className="text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px]">Volver a leer</button>
                                                </span>
                                            </div>
                                            {certCae.avisos?.length > 0 && (
                                                <p className="text-amber-400/80">⚠️ {certCae.avisos.join(' · ')}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <p className="text-amber-400/80">{errorCert || 'No se han leído los códigos del Certificado CAE emitido.'}</p>
                                            <button onClick={() => leerCertificado()} className="text-brand font-black uppercase tracking-widest text-[10px] hover:underline">Leer los códigos del certificado</button>
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

                            {/* Importes */}
                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                                <Importe label="Base imponible" value={eur(base)} />
                                <Importe label="IVA 21 %" value={eur(iva)} />
                                <div className="border-t border-white/[0.06] pt-1.5">
                                    <Importe label="Total factura" value={eur(total)} fuerte color="text-emerald-400" />
                                </div>
                            </div>

                            {/* Lo que se ahorra el S.O. — va en el mensaje de envío */}
                            {ahorroSo && ahorroSo.ahorro > 0 && (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-1.5">
                                    <p className="text-[9px] uppercase tracking-widest font-black text-emerald-400/70">Ahorro del S.O. con este lote · sin IVA</p>
                                    <Importe label={`Aportando al FNEE (${EQUIVALENCIA_FINANCIERA.toLocaleString('es-ES')} €/MWh)`} value={eur(ahorroSo.alternativa)} />
                                    <Importe label={`Con nosotros${ahorroSo.verif ? ' (factura + verificación)' : ''}`} value={eur(ahorroSo.coste)} />
                                    <div className="border-t border-emerald-500/15 pt-1.5">
                                        <Importe label={`Ahorro neto${ahorroSo.pct != null ? ` · ${ahorroSo.pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : ''}`}
                                            value={eur(ahorroSo.ahorro)} fuerte color="text-emerald-400" />
                                    </div>
                                    <p className="text-[10px] text-white/35">Va en el mensaje al enviarle la factura.</p>
                                </div>
                            )}
                        </div>

                        {/* Acciones — ancladas abajo, siempre a la vista */}
                        <div className="p-4 sm:p-5 border-t border-white/[0.06] shrink-0 space-y-2">
                            <button onClick={handleGenerate} disabled={generating}
                                className="w-full px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep disabled:opacity-40 transition-all">
                                {generating ? 'Generando…' : (prev?.numero ? 'Regenerar y guardar' : 'Generar y guardar en Drive')}
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleDownloadPdf} disabled={downloading || generating}
                                    className="px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/15 text-white/70 hover:text-white hover:border-white/30 disabled:opacity-40 transition-all">
                                    {downloading ? 'Generando…' : 'Descargar PDF'}
                                </button>
                                <button onClick={() => setSendOpen(true)} disabled={generating}
                                    className="px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-40 transition-all">
                                    Enviar al S.O.
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
            {sendOpen && (
                <EnviarLoteDocModal
                    title="Enviar factura al Sujeto Obligado"
                    subtitle={`${lote.codigo || 'Lote'} · Factura ${numero || ''}`}
                    defaultEmail={envio.notifyEmail}
                    defaultPhone={envio.notifyPhone}
                    defaultCc={CC_BROKERGY}
                    ccSuggestions={envio.ccSugerencias}
                    toSuggestions={envio.destinatarios}
                    messageFor={messageFor}
                    defaultMessage={messageFor(envio.notifyEmail)}
                    summaryData={{ id: lote.codigo || 'LOTE', docType: 'Factura S.O.' }}
                    docs={sendDocs}
                    // Enviada la factura, su PDF se archiva en contabilidad:
                    // FACTURAS VENTAS/{año}/{n. MES}, por la fecha de la factura.
                    afterSendLabel="Guardando en contabilidad…"
                    onAfterSend={async () => {
                        const { data } = await axios.post(`/api/lotes/${lote.id}/factura-so/contabilidad`, { html, numero, fecha });
                        return [{ channel: 'drive', status: 'ok', label: 'Guardada', text: data.ruta || 'Contabilidad' }];
                    }}
                    onClose={() => setSendOpen(false)}
                />
            )}
        </div>,
        document.body
    );
}
