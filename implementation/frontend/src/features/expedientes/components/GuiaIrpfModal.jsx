import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { CanalChip } from '../../../components/CanalChip';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { MensajeEditable } from './MensajeEditable';
import { useIsMobile } from '../../../utils/useIsMobile';
import { MODALIDADES, TIPOS_VIVIENDA, eur, fechaEs } from '../logic/guiaIrpf';

// ─── Guía de la deducción del IRPF + envío al cliente ────────────────────────
// Un botón: al cliente le llegan sus certificados de eficiencia energética
// FIRMADOS y una guía de una página con la deducción que puede aplicarse (60 %
// en una unifamiliar, 40 % en un piso, 20 % si solo baja la demanda) y todos los
// datos que le pide Renta Web, ya rellenos.
//
// Lo que se decide y se dice vive en `logic/guiaIrpf.js` y lo compone el
// BACKEND (`guiaIrpfService`): la vista previa es el PDF de verdad, el mismo que
// viaja en el correo, el que se guarda en Drive y el que se baja del portal.
//
// Aquí solo se ajusta lo que la app no puede saber sola: el tipo de vivienda si
// el certificado no lo dice, cuántos propietarios hay, y las FACTURAS —su
// importe con IVA cuando solo consta la base, y las que el cliente ha pagado y
// no tenemos—. Lo ajustado se guarda con la guía, así que al volver a abrirla se
// conserva.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v) => (v == null ? '—' : eur(v));
let idManual = 0;

/** Las filas editables → los ajustes que entiende el backend. */
function ajustesDe({ tipo, propietarios, filas }) {
    const facturas = {};
    const extra = [];
    for (const f of filas) {
        if (f.origen === 'manual') {
            if (Number(f.importe) > 0) extra.push({ id: f.id, numero: f.numero, fecha: f.fecha, emisor: f.emisor, nif: f.nif, importe: Number(f.importe), incluir: f.incluir });
            continue;
        }
        facturas[f.id] = { incluir: f.incluir, ...(f.editado && Number(f.importe) > 0 ? { importe: Number(f.importe) } : {}) };
    }
    return { ...(tipo ? { tipo } : {}), ...(propietarios ? { propietarios } : {}), facturas, extra };
}

/**
 * @param {boolean} [soloRevisar] abierto desde la ENTREGA del CEE directo: la guía
 *        la envía la entrega junto al certificado, así que aquí no hay "Enviar"
 *        (sería mandarle el certificado dos veces). Se revisa y se GUARDA, y la
 *        entrega usa esos ajustes.
 */
export function GuiaIrpfModal({ isOpen, onClose, expedienteId, apiBase = '/api/expedientes', onEnviado, soloRevisar = false }) {
    const isMobile = useIsMobile();
    const [datos, setDatos] = useState(null);       // la última respuesta de /estado
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const [tipo, setTipo] = useState(null);
    const [propietarios, setPropietarios] = useState(null);
    const [filas, setFilas] = useState([]);

    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfCargando, setPdfCargando] = useState(false);
    const [pdfError, setPdfError] = useState(null);

    const [email, setEmail] = useState('');
    const [tlf, setTlf] = useState('');
    const [canales, setCanales] = useState({ email: true, whatsapp: true });
    const [waReady, setWaReady] = useState(true);
    const [mensaje, setMensaje] = useState('');
    const mensajeEditado = useRef(false);

    const [overlay, setOverlay] = useState({ phase: null });
    const [guardando, setGuardando] = useState(false);
    const [guardadoLink, setGuardadoLink] = useState(null);

    const inicial = useRef(true);
    const turno = useRef(0);

    // ── Carga ──
    useEffect(() => {
        if (!isOpen || !expedienteId) return;
        let cancelado = false;
        inicial.current = true;
        mensajeEditado.current = false;
        setCargando(true);
        setError(null);
        setGuardadoLink(null);
        axios.get(`${apiBase}/${expedienteId}/guia-irpf`)
            .then(({ data }) => {
                if (cancelado) return;
                setDatos(data);
                setTipo(data.ajustes?.tipo || null);
                setPropietarios(data.ajustes?.propietarios || null);
                setFilas((data.facturas || []).map(f => ({
                    ...f,
                    // Un importe tocado y guardado vuelve como no-estimado: hay que
                    // recordarlo, o al reconstruir los ajustes se perdería.
                    editado: f.origen !== 'manual' && !!data.ajustes?.facturas?.[f.id]?.importe,
                })));
                setEmail(data.destinatario?.email || '');
                setTlf(data.destinatario?.tlf || '');
                setCanales({ email: !!data.destinatario?.email, whatsapp: !!data.destinatario?.tlf });
                setMensaje(data.mensaje || '');
            })
            .catch(e => !cancelado && setError(e.response?.data?.error || 'No se pudo preparar la guía'))
            .finally(() => !cancelado && setCargando(false));
        axios.get('/api/whatsapp/status').then(r => !cancelado && setWaReady(!!r.data?.ready)).catch(() => !cancelado && setWaReady(false));
        return () => { cancelado = true; };
    }, [isOpen, expedienteId, apiBase]);

    // ── Recomponer: estado + PDF, con freno ──
    const recomponer = useCallback(async () => {
        const mio = ++turno.current;
        const ajustes = ajustesDe({ tipo, propietarios, filas });
        try {
            const { data } = await axios.post(`${apiBase}/${expedienteId}/guia-irpf/estado`, { ajustes });
            if (mio !== turno.current) return;
            setDatos(prev => ({ ...prev, ...data }));
            if (!mensajeEditado.current) setMensaje(data.mensaje || '');
        } catch { /* el PDF de abajo dirá qué pasa */ }

        setPdfError(null);
        setPdfCargando(true);
        try {
            const r = await axios.post(`${apiBase}/${expedienteId}/guia-irpf/pdf`, { ajustes }, { responseType: 'blob' });
            if (mio !== turno.current) return;
            const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
            setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
        } catch (e) {
            if (mio !== turno.current) return;
            let msg = 'No se pudo generar la guía';
            try { msg = JSON.parse(await e.response?.data?.text())?.error || msg; } catch { /* noop */ }
            setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
            setPdfError(msg);
        } finally {
            if (mio === turno.current) setPdfCargando(false);
        }
    }, [apiBase, expedienteId, tipo, propietarios, filas]);

    useEffect(() => {
        if (!isOpen || cargando || !datos) return;
        // La primera vez, sin freno: es lo que se abre a mirar.
        const t = setTimeout(recomponer, inicial.current ? 0 : 700);
        inicial.current = false;
        return () => clearTimeout(t);
    }, [isOpen, cargando, tipo, propietarios, filas]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

    if (!isOpen) return null;

    const g = datos?.guia;
    const m = g?.modalidad ? MODALIDADES[g.modalidad] : null;
    // Abierto desde la entrega, el cobro y los PDF los vigila la entrega: aquí
    // solo cuenta lo que impide que haya guía.
    const bloqueos = (soloRevisar ? datos?.bloqueosGuia : datos?.bloqueos) || [];
    const avisos = datos?.avisos || [];
    const totalFilas = filas.filter(f => f.incluir).reduce((s, f) => s + (Number(f.importe) || 0), 0);
    const willEmail = canales.email && !!email.trim();
    const willWa = canales.whatsapp && !!tlf.trim() && waReady;
    const puedeEnviar = !!datos && bloqueos.length === 0 && (willEmail || willWa) && !pdfCargando;
    const enviada = datos?.guardada?.enviada;

    const cambiarFila = (id, cambios) => setFilas(fs => fs.map(f => f.id === id ? { ...f, ...cambios } : f));
    const quitarFila = (id) => setFilas(fs => fs.filter(f => f.id !== id));
    const anadirFila = () => setFilas(fs => [...fs, { id: `x${Date.now()}_${++idManual}`, origen: 'manual', numero: '', fecha: '', emisor: '', nif: '', importe: null, incluir: true, ivaEstimado: false }]);

    const guardar = async () => {
        setGuardando(true);
        try {
            const { data } = await axios.post(`${apiBase}/${expedienteId}/guia-irpf/guardar`, { ajustes: ajustesDe({ tipo, propietarios, filas }) });
            setGuardadoLink(data.link || null);
            onEnviado?.();
        } catch (e) {
            setPdfError(e.response?.data?.error || 'No se pudo guardar la guía en Drive');
        } finally { setGuardando(false); }
    };

    const enviar = async () => {
        setOverlay({ phase: 'sending', subtitle: 'Preparando los certificados y la guía…' });
        try {
            const { data } = await axios.post(`${apiBase}/${expedienteId}/guia-irpf/enviar`, {
                ajustes: ajustesDe({ tipo, propietarios, filas }),
                canales: [willEmail && 'email', willWa && 'whatsapp'].filter(Boolean),
                destinatario: { nombre: datos?.destinatario?.nombre, email: email.trim(), tlf: tlf.trim() },
                mensaje,
            });
            setOverlay({
                phase: 'done', ok: true,
                subtitle: `A ${datos?.destinatario?.nombre || 'el cliente'} por ${data.canales.join(' y ')}`,
                items: [
                    ...data.ficheros.map(f => ({ texto: f, tono: 'ok' })),
                    ...(data.errores || []).map(e => ({ texto: `No salió por ${e}`, tono: 'aviso' })),
                    data.errorDrive
                        ? { texto: 'La guía no se ha podido guardar en Drive: el portal no la tendrá hasta guardarla.', tono: 'aviso' }
                        : { texto: 'Guía guardada en Drive: el cliente también la tiene en su portal.', tono: 'info' },
                ],
            });
            onEnviado?.();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, errorText: e.response?.data?.error || 'No se pudo enviar' });
        }
    };

    const tipoDelCertificado = g?.tipoCee && TIPOS_VIVIENDA[g.tipoCee] ? g.tipoCee : null;

    const contenido = (
        <div className="fixed inset-0 z-[520] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[94vh]"
                 onClick={e => e.stopPropagation()}>

                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">🧾 Certificados + guía de la Renta</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            Al cliente le llegan sus certificados firmados y una guía de una página con la deducción del IRPF que puede aplicarse y los datos que le pide Renta Web.
                            {g?.numeroExpediente ? ` · ${g.numeroExpediente}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-colors">
                        <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {cargando ? (
                    <div className="p-10 text-center text-xs text-white/40">Preparando la guía…</div>
                ) : error ? (
                    <div className="p-6 text-xs text-red-300">{error}</div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                        {/* ── Columna de ajustes ── */}
                        <div className="md:overflow-y-auto p-5 space-y-5 md:border-r border-white/[0.06]">

                            {/* Deducción */}
                            <section className={`rounded-2xl border px-4 py-3.5 ${m ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`}>
                                <div className="text-[9px] font-black uppercase tracking-widest text-white/35">Deducción</div>
                                {m ? (
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-3xl font-black text-brand leading-none whitespace-nowrap">{m.pct} %</span>
                                        <span className="text-xs font-bold text-white/80 leading-snug">{m.nombre}</span>
                                    </div>
                                ) : (
                                    <div className="text-sm font-black text-amber-300 mt-1">No se puede aplicar ninguna</div>
                                )}
                                <p className="text-[11px] text-white/50 mt-1.5 leading-snug">{g?.motivo}</p>
                                {/* Sin facturas de la obra no hay estimación: va un EJEMPLO.
                                    Se dice como información, no como aviso — en un CEE
                                    directo es lo normal. */}
                                {m && g?.ejemplo && (
                                    <p className="text-[11px] text-sky-200/80 mt-1.5 leading-snug">
                                        ℹ️ No hay facturas de la obra, así que la guía lleva un <b>ejemplo</b> con una obra de {eur(g.ejemplo.importe, 0)}
                                        {g.ejemplo.calendario?.porPropietario ? ` (${eur(g.ejemplo.calendario.porPropietario, 0)} de deducción)` : ''} y le pide que sume las suyas.
                                        Si te las pasa, añádelas abajo y saldrá su caso real.
                                    </p>
                                )}

                                <div className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/35">
                                    Tipo de vivienda {tipoDelCertificado && !tipo && <span className="normal-case tracking-normal font-bold text-white/30">· según el certificado</span>}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {Object.entries(TIPOS_VIVIENDA).map(([k, t]) => {
                                        const activo = (tipo || g?.tipo) === k;
                                        return (
                                            <button key={k} type="button"
                                                    onClick={() => setTipo(k === tipoDelCertificado ? null : k)}
                                                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors max-md:flex-1 ${activo
                                                        ? 'text-brand border-brand/50 bg-brand/10'
                                                        : 'text-white/40 border-white/[0.08] hover:text-white/70'}`}>
                                                {t.corto}
                                            </button>
                                        );
                                    })}
                                </div>
                                {tipo && tipoDelCertificado && tipo !== tipoDelCertificado && (
                                    <p className="text-[10px] text-amber-300/80 mt-1.5">El certificado dice «{TIPOS_VIVIENDA[tipoDelCertificado].label}»: lo estás cambiando a mano.</p>
                                )}

                                <label className="flex items-center gap-2 mt-3 text-[11px] text-white/55">
                                    Propietarios que se la aplican
                                    <input type="number" min={1} max={10} value={propietarios ?? g?.propietarios ?? 1}
                                           onChange={e => setPropietarios(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                                           className="w-14 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-brand/40" />
                                </label>
                            </section>

                            {/* Facturas */}
                            <section>
                                <div className="flex items-baseline justify-between gap-2">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-white/45">Facturas · IVA incluido</div>
                                    <div className="text-xs font-black text-white">{eur(totalFilas)}</div>
                                </div>
                                <p className="text-[10px] text-white/35 mt-0.5 leading-snug">
                                    Van a «Cantidades satisfechas». Las que no tengamos las suma el cliente: la guía se lo dice y, sin ninguna de la obra, le pone un ejemplo.
                                </p>
                                <div className="mt-2 space-y-1.5">
                                    {filas.length === 0 && (
                                        <p className="text-[11px] text-white/35 italic">No hay facturas en el expediente.</p>
                                    )}
                                    {filas.map(f => (
                                        <div key={f.id} className={`rounded-xl border px-3 py-2 ${f.incluir ? 'border-white/10 bg-white/[0.02]' : 'border-white/[0.05] opacity-50'}`}>
                                            {f.origen === 'manual' ? (
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <input placeholder="Nº factura" value={f.numero} onChange={e => cambiarFila(f.id, { numero: e.target.value })}
                                                           className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-brand/40" />
                                                    <input type="date" value={f.fecha || ''} onChange={e => cambiarFila(f.id, { fecha: e.target.value })}
                                                           className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-brand/40" />
                                                    <input placeholder="Empresa que la emite" value={f.emisor} onChange={e => cambiarFila(f.id, { emisor: e.target.value })}
                                                           className="col-span-2 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-brand/40" />
                                                    <input placeholder="NIF de la empresa" value={f.nif} onChange={e => cambiarFila(f.id, { nif: e.target.value })}
                                                           className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-brand/40" />
                                                    <div className="flex items-center gap-1.5">
                                                        <CampoDecimal valor={f.importe} onCambio={v => cambiarFila(f.id, { importe: v })}
                                                                      placeholder="Importe IVA incl."
                                                                      className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white text-[11px] text-right focus:outline-none focus:border-brand/40" />
                                                        <button type="button" onClick={() => quitarFila(f.id)} title="Quitar esta factura"
                                                                className="text-white/30 hover:text-red-300 text-sm px-1">✕</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2.5">
                                                    <input type="checkbox" checked={f.incluir} onChange={e => cambiarFila(f.id, { incluir: e.target.checked })}
                                                           className="accent-[var(--brand-primary)] w-4 h-4 shrink-0" title="Incluirla en la guía" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[11px] font-bold text-white/85 truncate">
                                                            {f.numero || 'Sin nº'} <span className="text-white/35 font-normal">· {fechaEs(f.fecha) || 'sin fecha'}</span>
                                                            {f.certificado && <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-wider text-sky-300/80">Certificados</span>}
                                                        </div>
                                                        <div className="text-[10px] text-white/40 truncate">{f.emisor || '—'}{f.nif ? ` · ${f.nif}` : ''}</div>
                                                    </div>
                                                    <div className="w-28 shrink-0">
                                                        <CampoDecimal valor={f.importe} onCambio={v => cambiarFila(f.id, { importe: v, ivaEstimado: false, editado: true })}
                                                                      className={`w-full bg-white/[0.03] border rounded-lg px-2 py-1.5 text-[11px] text-right focus:outline-none focus:border-brand/40 ${f.ivaEstimado ? 'border-amber-400/50 text-amber-200' : 'border-white/10 text-white'}`} />
                                                        {f.ivaEstimado && (
                                                            <div className="text-[8.5px] text-amber-300/80 text-right mt-0.5" title={f.base != null ? `Base: ${fmt(f.base)}` : ''}>
                                                                IVA supuesto 21 % · compruébalo
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={anadirFila}
                                        className="mt-2 px-3 py-2 rounded-lg border border-dashed border-white/15 text-[10px] font-black uppercase tracking-wider text-white/50 hover:text-white hover:border-white/30 transition-colors max-md:w-full">
                                    + Añadir factura
                                </button>
                            </section>

                            {/* Qué se adjunta */}
                            <section>
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/45">Se adjunta</div>
                                <ul className="mt-1.5 space-y-1">
                                    {(datos?.adjuntos || []).map(a => (
                                        <li key={a.clave} className="text-[11px] flex gap-2">
                                            <span className={a.fichero ? 'text-emerald-400' : 'text-red-400'}>{a.fichero ? '✓' : '✗'}</span>
                                            <span className="text-white/70">{a.rotulo}</span>
                                            <span className="text-white/30 truncate">{a.fichero || 'falta el PDF firmado'}</span>
                                        </li>
                                    ))}
                                    <li className="text-[11px] flex gap-2">
                                        <span className={m ? 'text-emerald-400' : 'text-red-400'}>{m ? '✓' : '✗'}</span>
                                        <span className="text-white/70">Guía de la deducción</span>
                                        <span className="text-white/30">se genera al enviar</span>
                                    </li>
                                    {soloRevisar && (
                                        <li className="text-[10px] text-white/40 leading-snug pt-1">
                                            Irá con la <b>entrega del certificado</b> (junto al justificante de registro): aquí solo se revisa y se guarda.
                                        </li>
                                    )}
                                </ul>
                            </section>

                            {/* Lo que impide enviar y lo que hay que mirar */}
                            {(bloqueos.length > 0 || avisos.length > 0) && (
                                <section className="space-y-1.5">
                                    {bloqueos.map((b, i) => (
                                        <p key={`b${i}`} className="text-[11px] text-red-300 leading-snug flex gap-2"><span>⛔</span><span>{b}</span></p>
                                    ))}
                                    {avisos.map((a, i) => (
                                        <p key={`a${i}`} className="text-[11px] text-amber-300/85 leading-snug flex gap-2"><span>⚠️</span><span>{a}</span></p>
                                    ))}
                                </section>
                            )}

                            {/* A quién (en modo revisión lo decide la entrega) */}
                            {!soloRevisar && <section>
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/45">
                                    A quién {datos?.destinatario?.nombre && <span className="normal-case tracking-normal font-bold text-white/60">· {datos.destinatario.nombre}</span>}
                                </div>
                                <div className="grid grid-cols-2 max-md:grid-cols-1 gap-1.5 mt-1.5">
                                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                                           className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 max-md:text-base" />
                                    <input type="tel" placeholder="Teléfono" value={tlf} onChange={e => setTlf(e.target.value)}
                                           className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 max-md:text-base" />
                                </div>
                                <div className="mt-2">
                                    <MensajeEditable value={mensaje} rows={9}
                                                     onChange={v => { mensajeEditado.current = true; setMensaje(v); }} />
                                </div>
                                {enviada && (
                                    <p className="text-[10px] text-white/35 mt-1.5">
                                        Ya se le envió el {fechaEs(String(enviada.at || '').slice(0, 10))} por {(enviada.canales || []).join(' y ')}{enviada.via === 'entrega' ? ', con la entrega del certificado' : ''}.
                                    </p>
                                )}
                            </section>}
                        </div>

                        {/* ── Vista previa: el PDF de verdad ── */}
                        <div className="p-5 md:p-4 flex flex-col min-h-0 max-md:border-t border-white/[0.06]">
                            <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/45">
                                    La guía {pdfCargando && <span className="normal-case tracking-normal font-bold text-white/30">· actualizando…</span>}
                                </div>
                                {pdfUrl && (
                                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                                       className="text-[10px] font-black uppercase tracking-wider text-brand hover:underline">Abrir ↗</a>
                                )}
                            </div>
                            {pdfError ? (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-[11px] text-amber-200">{pdfError}</div>
                            ) : isMobile ? (
                                pdfUrl
                                    ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                                         className="block text-center rounded-xl border border-white/10 py-3.5 text-xs font-black uppercase tracking-wider text-white">Ver la guía (PDF)</a>
                                    : <div className="text-[11px] text-white/35">Generando…</div>
                            ) : (
                                <div className="flex-1 min-h-[520px] rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
                                    {pdfUrl
                                        ? <iframe title="Guía de la deducción del IRPF" src={pdfUrl} className={`w-full h-full ${pdfCargando ? 'opacity-60' : ''}`} />
                                        : <div className="h-full flex items-center justify-center text-[11px] text-white/35">Generando la guía…</div>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Pie: canales y acciones */}
                {!cargando && !error && (
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-white/[0.06] shrink-0 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                        {!soloRevisar && (<>
                        <CanalChip canal="email" nombre="Email" activo={canales.email} disponible={!!email.trim()}
                                   detalle={email.trim() || ''} motivo="Sin email"
                                   onClick={() => setCanales(c => ({ ...c, email: !c.email }))} />
                        <CanalChip canal="whatsapp" nombre="WhatsApp" activo={canales.whatsapp} disponible={!!tlf.trim() && waReady}
                                   detalle={tlf.trim() || ''} motivo={!waReady ? 'WhatsApp no está conectado' : 'Sin teléfono'}
                                   onClick={() => setCanales(c => ({ ...c, whatsapp: !c.whatsapp }))} />
                        </>)}
                        <div className="flex-1" />
                        {guardadoLink && (
                            <a href={guardadoLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-300 hover:underline">✓ Guardada en Drive</a>
                        )}
                        <button type="button" onClick={guardar} disabled={!m || guardando || pdfCargando}
                                title="Guarda la guía en la carpeta del expediente (y en el portal del cliente) sin enviar nada"
                                className="px-4 py-2.5 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:border-white/25 disabled:opacity-40 transition-colors max-md:flex-1">
                            {guardando ? 'Guardando…' : (soloRevisar ? 'Guardar la guía' : 'Solo guardar')}
                        </button>
                        {!soloRevisar && <button type="button" onClick={enviar} disabled={!puedeEnviar}
                                title={bloqueos[0] || (!willEmail && !willWa ? 'Elige un canal' : '')}
                                className="px-5 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all max-md:flex-1">
                            Enviar al cliente
                        </button>}
                    </div>
                )}
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                subtitle={overlay.subtitle}
                items={overlay.items || []}
                errorText={overlay.errorText}
                sendingTitle="Enviando los certificados…"
                okTitle="¡Enviado al cliente!"
                onClose={() => { const ok = overlay.ok; setOverlay({ phase: null }); if (ok) onClose(); }}
            />
        </div>
    );

    // Portaleado a <body>: el módulo CEE vive dentro de tarjetas con
    // backdrop-filter, y un `fixed` se anclaría a ellas (regla 29.b).
    return createPortal(contenido, document.body);
}

/**
 * El botón del módulo CEE. Solo lo ve el equipo interno: lleva importes de
 * facturas y le escribe al cliente.
 */
export function GuiaIrpfBoton({ expediente, apiBase = '/api/expedientes', onEnviado }) {
    const [abierto, setAbierto] = useState(false);
    const enviada = expediente?.documentacion?.guia_irpf?.enviada;
    return (
        <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setAbierto(true)}
                        className="px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/40 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-black transition-colors max-md:w-full max-md:py-3.5">
                    🧾 Enviar al cliente: certificados + guía de la Renta
                </button>
                {enviada && (
                    <span className="text-[10px] text-white/40">
                        Enviada el {fechaEs(String(enviada.at || '').slice(0, 10))} por {(enviada.canales || []).join(' y ')}
                    </span>
                )}
            </div>
            <GuiaIrpfModal isOpen={abierto} onClose={() => setAbierto(false)} expedienteId={expediente?.id}
                           apiBase={apiBase} onEnviado={onEnviado} />
        </>
    );
}

export default GuiaIrpfModal;
