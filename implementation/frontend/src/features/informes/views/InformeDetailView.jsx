// ─── InformeDetailView — la ficha de un INFORME técnico ({AAAA}INF_{n}) ─────
// El circuito entero en una pantalla, como la app de certificadores lo hace con
// sus obras: PROCEDIMIENTO (en qué paso está y el botón de ese paso), DOCUMENTOS
// (lo actual de cada clase, «subir versión nueva», el visor y las versiones
// anteriores en OLD), DATOS y HISTORIAL.
//   · Firmar = AutoFirma sobre la versión FINAL, con la rúbrica de BROKERGY; una
//     firma rota no se guarda (422) y una final nueva deja la firma sin efecto.
//   · Facturar prepara un BORRADOR en Facturación: emitir y enviar se hace allí,
//     con el texto a la vista (lleva el enlace para subir el justificante).
//   · Confirmar cobro: UN clic (Fran, 05/11/2026) y sale la entrega del firmado.
//   · Entregar a mano: popup con el texto y los canales, resultado en SendActionOverlay.
// Ver docs/conocimiento/informes/.
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { lazyWithReload } from '../../../utils/lazyWithReload';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { colorEstadoInforme } from '../logic/estados';

const FirmarConCertificadoModal = lazyWithReload(() => import('../../expedientes/components/FirmarConCertificadoModal'), { name: 'informe:firmar' });

const API = '/api/informes';
const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtFechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const fmtEur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

// Las clases que se suben desde la ficha, en el orden del trabajo.
const SUBIDAS = [
    { clase: 'BORRADOR_PDF', titulo: 'Borrador (PDF)', accept: '.pdf' },
    { clase: 'BORRADOR_WORD', titulo: 'Borrador (Word)', accept: '.docx,.doc' },
    { clase: 'FINAL_PDF', titulo: 'Versión final (PDF)', accept: '.pdf' },
    { clase: 'FINAL_WORD', titulo: 'Versión final (Word)', accept: '.docx,.doc' },
];

const Tarjeta = ({ titulo, children, derecha = null }) => (
    <section className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40">{titulo}</h2>
            {derecha}
        </div>
        {children}
    </section>
);
const Btn = ({ children, pri = false, className = '', ...p }) => (
    <button type="button" {...p}
        className={`min-h-[40px] px-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${pri ? 'bg-brand text-bkg-deep hover:bg-brand-700' : 'border border-white/10 text-white/60 hover:text-white hover:border-white/25'} ${className}`}>
        {children}
    </button>
);

/** El visor: el fichero se pide con la sesión y se enseña en un iframe (PDF) o como imagen. */
function Visor({ informeId, doc, onCerrar, pie = null }) {
    const [url, setUrl] = useState(null);
    const [mime, setMime] = useState('');
    const [error, setError] = useState(null);
    useEffect(() => {
        let vivo = true;
        let u = null;
        axios.get(`${API}/${informeId}/fichero/${doc.id}`, { responseType: 'blob' })
            .then(r => { if (!vivo) return; u = URL.createObjectURL(r.data); setMime(r.data.type || ''); setUrl(u); })
            .catch(() => vivo && setError('No se ha podido abrir el fichero.'));
        return () => { vivo = false; if (u) URL.revokeObjectURL(u); };
    }, [informeId, doc.id]);
    return createPortal(
        <div className="fixed inset-0 z-[9990] bg-black/85 backdrop-blur-md flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                <span className="text-xs text-white/80 font-mono truncate">{doc.nombre}</span>
                <div className="flex gap-2 shrink-0">
                    {url && <a href={url} download={doc.nombre} className="min-h-[40px] px-4 rounded-xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest flex items-center">Descargar</a>}
                    <Btn onClick={onCerrar}>Cerrar</Btn>
                </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-2">
                {error ? <p className="text-amber-300 text-sm">{error}</p>
                    : !url ? <p className="text-white/40 text-xs uppercase tracking-widest">Cargando…</p>
                        : mime.startsWith('image/') ? <img src={url} alt={doc.nombre} className="max-w-full max-h-full object-contain" />
                            : mime === 'application/pdf' ? <iframe title={doc.nombre} src={url} className="w-full h-full rounded-xl bg-white" />
                                : <p className="text-white/60 text-sm">Este tipo de fichero no se previsualiza: descárgalo.</p>}
            </div>
            {pie && <div className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">{pie}</div>}
        </div>,
        document.body,
    );
}

/** Un fichero de la lista: nombre, fecha y «Ver». */
function FilaDoc({ doc, onVer, extra = null }) {
    return (
        <div className={`flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0 ${doc.caducado ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
                <div className="text-xs text-white/80 font-mono truncate">{doc.nombre}</div>
                <div className="text-[10px] text-white/30">{fmtFechaHora(doc.fecha)}{doc.caducado ? ' · firma anterior a la versión final: no vale' : ''}</div>
            </div>
            <div className="flex gap-2 shrink-0">{extra}<Btn onClick={() => onVer(doc)}>Ver</Btn></div>
        </div>
    );
}

export function InformeDetailView({ id, onBack }) {
    const { user } = useAuth();
    const esAdmin = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';
    const [inf, setInf] = useState(null);
    const [docs, setDocs] = useState(null);
    const [error, setError] = useState(null);
    const [aviso, setAviso] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [visor, setVisor] = useState(null);
    const [pdfFirmar, setPdfFirmar] = useState(null);
    const [verAnteriores, setVerAnteriores] = useState(false);
    const [entrega, setEntrega] = useState(null);       // la vista previa del popup de entrega
    const [overlay, setOverlay] = useState(null);       // { phase, ok, items, errorText }
    const [fechaCobro, setFechaCobro] = useState(hoy());
    const [datos, setDatos] = useState(null);           // el borrador de «Datos»
    const subida = useRef(null);
    const claseSubida = useRef(null);

    const cargar = useCallback(async () => {
        try {
            const [{ data: i }, { data: d }] = await Promise.all([axios.get(`${API}/${id}`), axios.get(`${API}/${id}/documentos`)]);
            setInf(i);
            setDocs(d);
            setDatos({ titulo: i.titulo || '', organismo: i.organismo || '', tipo: i.tipo, direccion: i.direccion || '', municipio: i.municipio || '', provincia: i.provincia || '', ref_catastral: i.ref_catastral || '', notas: i.notas || '' });
            setError(null);
        } catch (err) {
            setError(err.response?.status === 404 ? 'Este informe no existe.' : (err.response?.data?.error || 'No se ha podido cargar el informe.'));
        }
    }, [id]);
    useEffect(() => { cargar(); }, [cargar]);

    const hacer = async (clave, fn, ok = null) => {
        setOcupado(clave);
        setAviso(null);
        try {
            const r = await fn();
            if (ok) setAviso({ tono: 'ok', texto: typeof ok === 'function' ? ok(r) : ok });
            await cargar();
            return r;
        } catch (err) {
            const d = err.response?.data || {};
            setAviso({ tono: 'aviso', texto: d.error || 'No se ha podido hacer.' });
            return null;
        } finally { setOcupado(null); }
    };

    const pedirSubida = (clase, accept) => {
        claseSubida.current = clase;
        subida.current.accept = accept;
        subida.current.value = '';
        subida.current.click();
    };
    const alElegirFichero = async (e) => {
        const f = e.target.files?.[0];
        const clase = claseSubida.current;
        if (!f || !clase) return;
        const fd = new FormData();
        fd.append('file', f);
        await hacer(`subir-${clase}`, () => axios.post(`${API}/${id}/subir/${clase}`, fd), r => (clase === 'FIRMADO'
            ? `Firma comprobada${r.data.firmante ? `: ${r.data.firmante}` : ''}.${r.data.avisos?.length ? ` ${r.data.avisos.join(' ')}` : ''}`
            : r.data.firmaAnulada
            ? `Subido como ${r.data.fichero.nombre}. La firma anterior deja de valer: toca firmar esta versión.`
            : `Subido como ${r.data.fichero.nombre}.`));
    };

    const firmar = () => hacer('firmar', async () => {
        const { data } = await axios.get(`${API}/${id}/para-firmar`);
        setVisor(null);
        setPdfFirmar(data.base64);
    });
    const alFirmar = async (b64) => {
        setPdfFirmar(null);
        await hacer('guardar-firma', () => axios.post(`${API}/${id}/firmado`, { base64: b64 }),
            r => `Firmado${r.data.firmante ? ` por ${r.data.firmante}` : ''}.${r.data.avisos?.length ? ` ${r.data.avisos.join(' ')}` : ''}`);
    };

    const facturar = () => hacer('facturar', () => axios.post(`${API}/${id}/facturar`), r => {
        window.open(`/?tab=facturacion&sub=facturas&abrir=${r.data.facturaId}`, '_blank', 'noopener');
        return 'Factura preparada en BORRADOR: se ha abierto en Facturación para emitirla y enviarla.';
    });

    const confirmarCobro = (pagada = true) => hacer('cobro', () => axios.post(`${API}/${id}/cobro`, { pagada, fecha: fechaCobro }), r => {
        if (!pagada) return 'Cobro deshecho.';
        const e = r.data.entrega;
        if (e?.enviado) return `Cobro confirmado y entregado ${inf?.linea === 'CIT' ? 'el certificado' : 'el informe firmado'} por ${e.canales.join(' y ')}.`;
        if (e?.motivo === 'AUTO_DESACTIVADO') return 'Cobro confirmado. La entrega automática está apagada aquí: entrégalo con «Entregar».';
        if (e?.motivo === 'FALTAN_REQUISITOS') return `Cobro confirmado. Para entregarlo falta: ${e.faltan.join(' · ')}.`;
        return 'Cobro confirmado.';
    });

    const abrirEntrega = (opciones = {}) => hacer('entrega-prev', async () => {
        const { data } = await axios.get(`${API}/${id}/entrega`, { params: opciones.sinCobro ? { sinCobro: 1 } : {} });
        setEntrega({ ...data, ...opciones, texto: data.mensaje, canales: { email: !!data.destinatario?.email, whatsapp: !!data.destinatario?.tlf } });
    });
    const enviarEntrega = async () => {
        const e = entrega;
        setEntrega(null);
        setOverlay({ phase: 'sending' });
        try {
            const { data } = await axios.post(`${API}/${id}/entrega`, {
                reenviar: !!e.yaEntregado, sinCobro: !!e.sinCobro, mensaje: e.texto,
                channels: Object.entries(e.canales).filter(([, v]) => v).map(([k]) => k),
            });
            setOverlay({ phase: 'done', ok: true, items: [`${inf?.linea === 'CIT' ? 'Certificado oficial' : 'Informe firmado'} (${data.fichero})`, ...data.canales.map(c => `Enviado por ${c === 'email' ? 'email' : 'WhatsApp'}`), ...(data.errores || []).map(t => ({ texto: t, tono: 'aviso' }))] });
        } catch (err) {
            setOverlay({ phase: 'done', ok: false, errorText: err.response?.data?.error || 'No se ha enviado.' });
        }
        cargar();
    };

    const guardarDatos = () => hacer('datos', () => axios.put(`${API}/${id}`, datos), 'Datos guardados.');

    if (error) return (
        <div className="px-6 sm:px-10 pt-4">
            <button onClick={onBack} className="text-[11px] text-white/40 hover:text-white uppercase tracking-widest mb-4">← Volver</button>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-300">{error}</div>
        </div>
    );
    if (!inf) return <div className="py-16 text-center text-white/25 text-xs font-black uppercase tracking-widest">Cargando…</div>;

    const actual = docs?.actual || {};
    const pasos = inf.proceso?.pasos || [];
    const firmadoVale = actual.FIRMADO && !actual.FIRMADO.caducado;
    const facturas = inf.facturas || [];
    const vivas = facturas.filter(f => (!f.tipo || f.tipo === 'F1') && ['EMITIDA', 'PAGADA'].includes(f.estado));
    const borradores = facturas.filter(f => f.estado === 'BORRADOR');
    const entregado = inf.documentacion?.entrega;
    const anulado = !!inf.anulado_at;
    const esCit = inf.linea === 'CIT';
    const queSeEntrega = esCit ? 'el certificado de instalación térmica' : 'el informe firmado';

    // El botón del paso en que está (uno por paso: lo demás, en Documentos).
    const accionPaso = () => {
        if (anulado) return null;
        if (!actual.FINAL_PDF) return (
            <div className="flex flex-wrap gap-2">
                <Btn pri={!actual.BORRADOR_PDF} disabled={!!ocupado} onClick={() => pedirSubida('BORRADOR_PDF', '.pdf')}>Subir borrador</Btn>
                <Btn pri={!!actual.BORRADOR_PDF} disabled={!!ocupado} onClick={() => pedirSubida('FINAL_PDF', '.pdf')}>{esCit ? 'Subir memoria final' : 'Subir versión final'}</Btn>
            </div>
        );
        // CIT: la memoria la firma el REPRESENTANTE de la empresa instaladora
        // (skill presentar-rite); si se firmó fuera, se sube y se comprueba igual.
        if (!firmadoVale) return esCit ? (
            <div className="flex flex-wrap items-center gap-2">
                <Btn pri disabled={!!ocupado} onClick={firmar}>{ocupado === 'firmar' ? 'Preparando…' : 'Firmar con AutoFirma'}</Btn>
                <Btn disabled={!!ocupado} onClick={() => pedirSubida('FIRMADO', '.pdf')}>{ocupado === 'subir-FIRMADO' ? 'Comprobando la firma…' : 'Subir memoria firmada'}</Btn>
                <span className="text-[11px] text-white/35">Con el certificado de representante de la empresa instaladora.</span>
            </div>
        ) : <Btn pri disabled={!!ocupado} onClick={firmar}>{ocupado === 'firmar' ? 'Preparando…' : 'Firmar con AutoFirma'}</Btn>;
        if (esCit && !inf.registrado_at) return (
            <div className="flex flex-wrap items-center gap-2">
                <Btn pri disabled={!!ocupado} onClick={() => pedirSubida('CERTIFICADO_OFICIAL', '.pdf')}>{ocupado === 'subir-CERTIFICADO_OFICIAL' ? 'Subiendo…' : 'Subir certificado oficial (eDICE)'}</Btn>
                <span className="text-[11px] text-white/35">Presenta la memoria en eDICE-Térmicas (skill «presentar-rite») y sube aquí el impreso sellado.</span>
            </div>
        );
        if (!vivas.length && esAdmin) return borradores.length
            ? <Btn pri onClick={() => window.open(`/?tab=facturacion&sub=facturas&abrir=${borradores[0].id}`, '_blank', 'noopener')}>Emitir y enviar la factura</Btn>
            : <Btn pri disabled={!!ocupado} onClick={facturar}>Preparar factura</Btn>;
        if (!inf.cobrado && esAdmin) return (
            <div className="flex flex-wrap items-center gap-2">
                {!vivas.some(f => f.enviada_at) && <span className="text-[11px] text-amber-300">La factura no consta enviada.</span>}
                <input type="date" value={fechaCobro} onChange={e => setFechaCobro(e.target.value)}
                    className="bg-white/[0.03] border border-white/10 rounded-xl px-3 min-h-[40px] text-sm text-white" aria-label="Fecha del cobro" />
                <Btn pri={!!inf.justificante_at} disabled={!!ocupado} onClick={() => confirmarCobro(true)}>Confirmar cobro</Btn>
                <Btn disabled={!!ocupado} onClick={() => abrirEntrega({ sinCobro: true })} title="Solo si se ha decidido entregarlo antes de cobrar">Entregar sin cobrar</Btn>
            </div>
        );
        if (inf.cobrado && !entregado) return <Btn pri disabled={!!ocupado} onClick={() => abrirEntrega()}>Entregar al cliente</Btn>;
        if (entregado) return <Btn disabled={!!ocupado} onClick={() => abrirEntrega()}>Reenviar</Btn>;
        return null;
    };

    return (
        <div className="px-6 sm:px-10 pt-4 pb-16 space-y-4">
            <input ref={subida} type="file" className="hidden" onChange={alElegirFichero} />

            {/* ── Cabecera ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <button onClick={onBack} className="text-[11px] text-white/40 hover:text-white uppercase tracking-widest mb-2">← CEE directos e informes</button>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-mono text-violet-300 text-lg md:text-xl font-black">{inf.numero}</h1>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${colorEstadoInforme(inf.estado)}`}>{inf.estado}</span>
                        {inf.proceso?.pelota && !anulado && inf.estado !== 'ENTREGADO' && (
                            <span className="text-[10px] text-white/30 uppercase tracking-widest">Pelota: {inf.proceso.pelota === 'CLIENTE' ? 'Cliente' : 'Nuestra'}</span>
                        )}
                    </div>
                    <p className="text-sm text-white/80 font-bold uppercase tracking-wide mt-1">{inf.titulo}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                        {[inf.cliente ? `${inf.cliente.nombre_razon_social || ''} ${inf.cliente.apellidos || ''}`.trim() : null, inf.organismo, [inf.direccion, inf.municipio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Btn onClick={() => navigator.clipboard?.writeText(inf.enlace_cliente).then(() => setAviso({ tono: 'ok', texto: 'Enlace del cliente copiado.' }))}>Copiar enlace del cliente</Btn>
                    {esAdmin && inf.drive_folder_link && <a href={inf.drive_folder_link} target="_blank" rel="noopener noreferrer"
                        className="min-h-[40px] px-4 rounded-xl border border-white/10 text-white/60 hover:text-white text-[11px] font-black uppercase tracking-widest flex items-center">Carpeta</a>}
                </div>
            </div>

            {aviso && (
                <div role="status" className={`rounded-xl border px-4 py-3 text-xs ${aviso.tono === 'ok' ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200' : 'border-amber-500/30 bg-amber-500/[0.07] text-amber-200'}`}>{aviso.texto}</div>
            )}

            {/* ── Procedimiento ────────────────────────────────────── */}
            <Tarjeta titulo="Procedimiento">
                <ol className={`grid grid-cols-2 gap-2 mb-4 ${esCit ? 'md:grid-cols-4 xl:grid-cols-7' : 'md:grid-cols-6'}`}>
                    {pasos.map((p, i) => (
                        <li key={p.id} className={`rounded-xl border px-3 py-2 ${p.hecho ? 'border-emerald-500/25 bg-emerald-500/[0.05]' : p.actual ? 'border-brand/40 bg-brand/[0.07]' : 'border-white/[0.06]'}`}>
                            <div className="text-[9px] font-black uppercase tracking-widest text-white/30">{i + 1}</div>
                            <div className={`text-[11px] font-bold ${p.hecho ? 'text-emerald-300' : p.actual ? 'text-brand' : 'text-white/45'}`}>{p.titulo}</div>
                            {p.detalle && <div className="text-[10px] text-white/35 mt-0.5">{p.detalle}</div>}
                        </li>
                    ))}
                </ol>
                {accionPaso()}
                {inf.justificante_at && !inf.cobrado && (
                    <p className="text-[11px] text-lime-300 mt-3">El cliente subió el justificante el {fmtFechaHora(inf.justificante_at)}. Míralo en el banco y confirma el cobro.</p>
                )}
                {entregado && (
                    <p className="text-[11px] text-emerald-300 mt-3">
                        Entregado el {fmtFechaHora(entregado.at)} por {(entregado.canales || []).join(' y ')}{entregado.destinatario?.paga ? ` a ${entregado.destinatario.paga} (quien paga)` : ''}{entregado.sin_cobrar ? ' · sin cobrar (decisión manual)' : ''}.
                    </p>
                )}
                {esAdmin && inf.cobrado && <button onClick={() => confirmarCobro(false)} className="mt-3 text-[10px] text-white/30 hover:text-white/60 uppercase tracking-widest">Deshacer el cobro</button>}
            </Tarjeta>

            {/* ── Documentos ───────────────────────────────────────── */}
            <Tarjeta titulo="Documentos" derecha={<button onClick={cargar} className="text-[10px] text-white/30 hover:text-white/70 uppercase tracking-widest">Recargar</button>}>
                {!docs?.hay ? <p className="text-xs text-white/40">Todavía no tiene carpeta en Drive: se crea al subir el primer fichero.</p> : null}
                <div className="grid md:grid-cols-2 gap-x-6">
                    {[...SUBIDAS, { clase: 'FIRMADO', titulo: esCit ? 'Memoria firmada' : 'Firmado', accept: '.pdf' },
                        ...(esCit ? [{ clase: 'CERTIFICADO_OFICIAL', titulo: 'Certificado oficial (eDICE)', accept: '.pdf' }] : [])].map(s => {
                        const d = actual[s.clase];
                        return (
                            <div key={s.clase} className="py-2 border-b border-white/[0.04]">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/45">{s.titulo}</span>
                                    {(s.clase !== 'FIRMADO' || esCit) && !anulado && (
                                        <button disabled={!!ocupado} onClick={() => pedirSubida(s.clase, s.accept)}
                                            className="text-[10px] text-brand/80 hover:text-brand uppercase tracking-widest disabled:opacity-40">
                                            {ocupado === `subir-${s.clase}` ? 'Subiendo…' : d ? 'Subir versión nueva' : 'Subir'}
                                        </button>
                                    )}
                                </div>
                                {d ? <FilaDoc doc={d} onVer={setVisor} /> : <p className="text-[11px] text-white/20 py-1">—</p>}
                            </div>
                        );
                    })}
                </div>

                {docs?.anteriores?.length > 0 && (
                    <div className="mt-3">
                        <button onClick={() => setVerAnteriores(v => !v)} className="text-[10px] text-white/35 hover:text-white/70 uppercase tracking-widest">
                            {verAnteriores ? 'Ocultar' : 'Ver'} versiones anteriores ({docs.anteriores.length})
                        </button>
                        {verAnteriores && <div className="mt-2">{docs.anteriores.map(d => <FilaDoc key={d.id} doc={d} onVer={setVisor} />)}</div>}
                    </div>
                )}

                <div className="mt-5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Documentación del cliente</span>
                        {!anulado && <button disabled={!!ocupado} onClick={() => pedirSubida('DOCUMENTACION', '.pdf,.jpg,.jpeg,.png,.heic,.webp,.docx,.xlsx,.zip')}
                            className="text-[10px] text-brand/80 hover:text-brand uppercase tracking-widest disabled:opacity-40">Subir</button>}
                    </div>
                    <ul className="flex flex-wrap gap-1.5 my-2">
                        {(inf.docs_cliente || []).map(d => (
                            <li key={d.id} className={`text-[10px] px-2 py-1 rounded-lg border ${d.subido ? 'border-emerald-500/25 text-emerald-300' : d.opcional ? 'border-white/10 text-white/30' : 'border-amber-500/25 text-amber-300'}`}>
                                {d.subido ? '✓ ' : ''}{d.etiqueta}{d.opcional && !d.subido ? ' (si lo hay)' : ''}
                            </li>
                        ))}
                    </ul>
                    {(docs?.documentacion || []).map(d => <FilaDoc key={d.id} doc={d} onVer={setVisor} />)}
                </div>

                {esAdmin && (
                    <div className="mt-5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Presupuesto, facturas y pago</span>
                            {!anulado && <button disabled={!!ocupado} onClick={() => pedirSubida('JUSTIFICANTE', '.pdf,.jpg,.jpeg,.png,.heic,.webp')}
                                className="text-[10px] text-brand/80 hover:text-brand uppercase tracking-widest disabled:opacity-40">Subir justificante</button>}
                        </div>
                        {facturas.map(f => (
                            <div key={f.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04]">
                                <span className="text-xs text-white/70 font-mono">{f.numero || 'Borrador'} · {f.estado}{f.total != null ? ` · ${fmtEur(f.total)}` : ''}{f.enviada_at ? ` · enviada ${fmtFecha(f.enviada_at)}` : ''}</span>
                                <Btn onClick={() => window.open(`/?tab=facturacion&sub=facturas&abrir=${f.id}`, '_blank', 'noopener')}>Abrir</Btn>
                            </div>
                        ))}
                        {(docs?.pago || []).map(d => <FilaDoc key={d.id} doc={d} onVer={setVisor} />)}
                    </div>
                )}
            </Tarjeta>

            {/* ── Datos ────────────────────────────────────────────── */}
            {datos && (
                <Tarjeta titulo="Datos" derecha={<Btn disabled={!!ocupado} onClick={guardarDatos}>{ocupado === 'datos' ? 'Guardando…' : 'Guardar'}</Btn>}>
                    <div className="grid md:grid-cols-2 gap-3">
                        {[['titulo', 'Título'], ...(esCit ? [] : [['organismo', 'Para quién (organismo)']]),['direccion', 'Dirección'], ['municipio', 'Municipio'], ['provincia', 'Provincia'], ['ref_catastral', 'Referencia catastral']].map(([k, et]) => (
                            <label key={k} className="block">
                                <span className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-1">{et}</span>
                                <input value={datos[k]} onChange={e => setDatos({ ...datos, [k]: e.target.value })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 min-h-[40px] text-base md:text-sm text-white focus:outline-none focus:border-brand/40" />
                            </label>
                        ))}
                        <label className="block md:col-span-2">
                            <span className="block text-[9px] font-black uppercase tracking-widest text-white/35 mb-1">Notas internas</span>
                            <textarea rows={3} value={datos.notas} onChange={e => setDatos({ ...datos, notas: e.target.value })}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-brand/40" />
                        </label>
                    </div>
                    {esAdmin && !anulado && !entregado && (
                        <button onClick={() => { const m = window.prompt('¿Por qué se anula?'); if (m !== null) hacer('anular', () => axios.post(`${API}/${id}/anular`, { motivo: m }), 'Informe anulado.'); }}
                            className="mt-4 text-[10px] text-white/30 hover:text-amber-300 uppercase tracking-widest">Anular el informe</button>
                    )}
                </Tarjeta>
            )}

            {/* ── Historial ────────────────────────────────────────── */}
            <Tarjeta titulo="Historial">
                <ul className="space-y-1.5">
                    {[...(inf.historial || [])].reverse().map((h, i) => (
                        <li key={i} className="text-[11px] text-white/55"><span className="text-white/25 font-mono">{fmtFechaHora(h.fecha)}</span> · {h.texto}{h.usuario ? <span className="text-white/25"> · {h.usuario}</span> : null}</li>
                    ))}
                </ul>
            </Tarjeta>

            {visor && (
                <Visor informeId={id} doc={visor} onCerrar={() => setVisor(null)}
                    pie={visor.clase === 'FINAL_PDF' && !firmadoVale && !anulado ? <Btn pri disabled={!!ocupado} onClick={firmar}>Firmar con AutoFirma</Btn> : null} />
            )}

            {pdfFirmar && createPortal(
                <Suspense fallback={null}>
                    <FirmarConCertificadoModal
                        pdfBase64={pdfFirmar}
                        title={`Firmar ${inf.numero}`}
                        signatureAnchor={['El técnico redactor', 'Fdo.']}
                        productionCity={inf.municipio || 'Tomelloso'}
                        onClose={() => setPdfFirmar(null)}
                        onSigned={alFirmar}
                    />
                </Suspense>,
                document.body,
            )}

            {entrega && createPortal(
                <div className="fixed inset-0 z-[9990] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6">
                    <div className="w-full md:max-w-xl max-h-[92vh] overflow-y-auto bg-bkg-surface border border-white/10 rounded-t-3xl md:rounded-3xl p-5 space-y-4">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">{entrega.yaEntregado ? 'Reenviar' : 'Entregar'} {queSeEntrega}</h2>
                        {entrega.faltan?.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">Falta: {entrega.faltan.join(' · ')}</div>}
                        {entrega.sinCobro && <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">Sin cobrar: quedará anotado como decisión tuya.</div>}
                        <p className="text-xs text-white/60">A <b className="text-white">{entrega.destinatario?.nombre || '—'}</b>{entrega.destinatario?.paga ? ' (quien paga)' : ''} · con <span className="font-mono">{entrega.fichero || '—'}</span></p>
                        <div className="flex gap-4">
                            {[['email', entrega.destinatario?.email], ['whatsapp', entrega.destinatario?.tlf]].map(([c, v]) => (
                                <label key={c} className={`flex items-center gap-2 text-xs ${v ? 'text-white/70' : 'text-white/25'}`}>
                                    <input type="checkbox" disabled={!v} checked={!!entrega.canales[c]} onChange={e => setEntrega({ ...entrega, canales: { ...entrega.canales, [c]: e.target.checked } })} />
                                    {c === 'email' ? 'Email' : 'WhatsApp'} <span className="font-mono text-white/40">{v || 'sin dato'}</span>
                                </label>
                            ))}
                        </div>
                        <textarea rows={9} value={entrega.texto} onChange={e => setEntrega({ ...entrega, texto: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                        <div className="flex justify-end gap-2">
                            <Btn onClick={() => setEntrega(null)}>Cancelar</Btn>
                            <Btn pri disabled={!entrega.puede || !Object.values(entrega.canales).some(Boolean)} onClick={enviarEntrega}>Enviar</Btn>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {overlay && (
                <SendActionOverlay phase={overlay.phase} ok={overlay.ok} items={overlay.items || []} errorText={overlay.errorText || ''}
                    sendingTitle={esCit ? 'Entregando el certificado…' : 'Entregando el informe…'} okTitle={esCit ? '¡Certificado entregado!' : '¡Informe entregado!'} onClose={() => setOverlay(null)} />
            )}
        </div>
    );
}

export default InformeDetailView;
