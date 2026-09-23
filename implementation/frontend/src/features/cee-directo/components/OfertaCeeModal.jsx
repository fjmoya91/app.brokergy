import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ClientePicker } from './ClientePicker';
import { PrescriptorPicker } from '../../../components/PrescriptorPicker';
import { DireccionEdit } from '../../../components/DireccionEdit';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { CanalChip } from '../../../components/CanalChip';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { contactoCliente } from '../../../utils/contactoCliente';
import { traerDireccionCatastral, refCatastralValida } from '../../../utils/traerDireccionCatastral';
import {
    ALCANCES, PRECIO_DEFECTO, TASA_REGISTRO_CLM, IVA_DEFECTO, numTasasDe,
    totalesOferta, observacionesDefecto, mensajeOferta, buildOfertaCeeHtml,
    direccionInmueble, fmtEur,
} from '../logic/ofertaCee';

// ─────────────────────────────────────────────────────────────────────────────
// Enviar una OFERTA de CEE a un cliente.
//
// Lo mínimo para mandarla: qué se ofrece (un certificado o inicial + final) y a
// qué precio, y a quién. El inmueble es OPCIONAL: si no se pone aquí, el cliente
// lo completa al aceptar. Todo lo demás lleva un valor por defecto que casi
// nunca se toca (tasa de Castilla-La Mancha, observaciones, el mensaje).
//
// Sale como la propuesta CAE: el PDF adjunto y un enlace para aceptarla y
// completar sus datos. El número de EXPEDIENTE no existe hasta que acepta.
// ─────────────────────────────────────────────────────────────────────────────

const INMUEBLE_VACIO = { direccion: '', codigo_postal: '', ccaa: '', provincia: '', provincia_cod: '', municipio: '' };
const nombreDe = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');

/** El destino del mensaje: con el desvío activo, la persona de contacto manda. */
function destinoDe(c) {
    if (!c) return { email: '', tlf: '', nombre: '' };
    if (c.notificaciones_contacto_activas && (c.persona_contacto_tlf || c.persona_contacto_email)) {
        return {
            email: c.persona_contacto_email || c.email || '',
            tlf: c.persona_contacto_tlf || c.tlf || '',
            nombre: c.persona_contacto_nombre || nombreDe(c),
        };
    }
    const k = contactoCliente(c);
    return { email: k.email || '', tlf: k.telefono || '', nombre: nombreDe(c) };
}

const lbl = 'block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2';
const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40';

export function OfertaCeeModal({ isOpen, onClose, onSent, prescriptores = [] }) {
    const [alcance, setAlcance] = useState('UNICO');
    const [precio, setPrecio] = useState(PRECIO_DEFECTO.UNICO);
    const [precioTocado, setPrecioTocado] = useState(false);
    const [tasa, setTasa] = useState(TASA_REGISTRO_CLM);
    // Descuento sobre los HONORARIOS (la tasa no se descuenta). Sale en la
    // columna % Dto del PDF y ya aplicado en el total.
    const [dto, setDto] = useState(0);

    const [cliente, setCliente] = useState(null);
    // 'rapido' → basta un nombre (el teléfono y el email son los de "Se envía a"):
    // es lo que se tiene de quien pregunta por WhatsApp, y el resto lo completa
    // él al aceptar. 'existente' → se busca su ficha.
    const [modoCliente, setModoCliente] = useState('rapido');
    const [nombreRapido, setNombreRapido] = useState('');
    const [prescriptorId, setPrescriptorId] = useState(null);

    const [verInmueble, setVerInmueble] = useState(false);
    const [refCatastral, setRefCatastral] = useState('');
    const [inmueble, setInmueble] = useState(INMUEBLE_VACIO);
    const [pistaMunicipio, setPistaMunicipio] = useState(null);
    const [catastro, setCatastro] = useState({ cargando: false, msg: null, error: null });

    const [observaciones, setObservaciones] = useState(observacionesDefecto('UNICO'));
    const [obsTocadas, setObsTocadas] = useState(false);

    const [email, setEmail] = useState('');
    const [tlf, setTlf] = useState('');
    const [usaEmail, setUsaEmail] = useState(true);
    const [usaWa, setUsaWa] = useState(true);
    const [waReady, setWaReady] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [mensajeTocado, setMensajeTocado] = useState(false);
    const [verMensaje, setVerMensaje] = useState(false);

    const [preview, setPreview] = useState(false);
    const [fase, setFase] = useState(null);           // null | 'sending' | 'done'
    const [resultado, setResultado] = useState({ ok: false, items: [], text: '' });

    useEffect(() => {
        if (!isOpen) return;
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
    }, [isOpen]);

    // El precio sigue al alcance mientras no se haya tecleado otro: pisar lo
    // escrito a mano es la forma más rápida de que nadie se fíe del automatismo.
    const elegirAlcance = (a) => {
        setAlcance(a);
        if (!precioTocado) setPrecio(PRECIO_DEFECTO[a]);
        if (!obsTocadas) setObservaciones(observacionesDefecto(a));
    };

    const borrador = useMemo(() => ({
        alcance, precio, tasa, dto_pct: dto, iva_pct: IVA_DEFECTO, num_tasas: numTasasDe(alcance),
        direccion: inmueble.direccion.trim() || null,
        codigo_postal: inmueble.codigo_postal.trim() || null,
        municipio: inmueble.municipio.trim() || null,
        provincia: inmueble.provincia.trim() || null,
        ccaa: inmueble.ccaa.trim() || null,
        ref_catastral: refCatastral.trim().toUpperCase() || null,
        observaciones: observaciones.trim(),
    }), [alcance, precio, tasa, dto, inmueble, refCatastral, observaciones]);

    const totales = useMemo(() => totalesOferta(borrador), [borrador]);
    const destino = useMemo(() => (modoCliente === 'rapido'
        ? { email, tlf, nombre: nombreRapido.trim() }
        : destinoDe(cliente)), [modoCliente, cliente, email, tlf, nombreRapido]);
    // Lo que sale en el bloque "Cliente" del PDF.
    const clientePdf = modoCliente === 'rapido'
        ? { nombre_razon_social: nombreRapido.trim().toUpperCase(), tlf: tlf.trim(), email: email.trim() }
        : (cliente || {});
    const hayCliente = modoCliente === 'rapido' ? !!nombreRapido.trim() : !!cliente;

    // El mensaje se compone solo mientras no se edite. El enlace real lo pone
    // el servidor (el token nace al crear la oferta): aquí va un marcador.
    const mensajeAuto = useMemo(() => mensajeOferta({
        nombre: destino.nombre, numero: '(nº de oferta)', alcance, total: totales.total,
        tasas: totales.tasas, url: '(enlace para aceptar)', inmueble: direccionInmueble(borrador),
    }), [destino.nombre, alcance, totales, borrador]);
    const mensajeVisible = mensajeTocado ? mensaje : mensajeAuto;

    const elegirCliente = (c) => {
        setCliente(c);
        const d = destinoDe(c);
        setEmail(d.email); setTlf(d.tlf);
        setUsaEmail(!!d.email); setUsaWa(!!d.tlf);
    };

    const traerDelCatastro = async () => {
        setCatastro({ cargando: true, msg: null, error: null });
        try {
            const r = await traerDireccionCatastral(refCatastral);
            setRefCatastral(r.rc);
            if (!r.campos) setInmueble(v => ({ ...v, direccion: r.direccion }));
            else { setInmueble(v => ({ ...v, ...r.campos, municipio: '' })); setPistaMunicipio(r.municipioHint); }
            setCatastro({ cargando: false, error: null, msg: r.aviso });
        } catch (err) {
            setCatastro({ cargando: false, msg: null, error: err.message });
        }
    };

    const canEmail = usaEmail && /\S+@\S+\.\S+/.test(email);
    const canWa = usaWa && waReady && tlf.replace(/\D/g, '').length >= 9;
    const puedeEnviar = hayCliente && precio > 0 && (canEmail || canWa) && !fase;

    // Por qué el botón está apagado, dicho junto al botón.
    const motivo = !hayCliente ? (modoCliente === 'rapido' ? 'Pon el nombre del cliente' : 'Elige el cliente')
        : !(precio > 0) ? 'Pon el precio'
        : !(canEmail || canWa) ? 'Marca un canal con destinatario'
        : null;

    const cerrar = () => {
        setAlcance('UNICO'); setPrecio(PRECIO_DEFECTO.UNICO); setPrecioTocado(false); setTasa(TASA_REGISTRO_CLM); setDto(0);
        setCliente(null); setPrescriptorId(null); setModoCliente('rapido'); setNombreRapido('');
        setVerInmueble(false); setRefCatastral(''); setInmueble(INMUEBLE_VACIO); setPistaMunicipio(null);
        setCatastro({ cargando: false, msg: null, error: null });
        setObservaciones(observacionesDefecto('UNICO')); setObsTocadas(false);
        setEmail(''); setTlf(''); setUsaEmail(true); setUsaWa(true);
        setMensaje(''); setMensajeTocado(false); setVerMensaje(false); setPreview(false);
        setFase(null); setResultado({ ok: false, items: [], text: '' });
        onClose?.();
    };

    const enviar = async () => {
        setFase('sending');
        const canales = [...(canEmail ? ['email'] : []), ...(canWa ? ['whatsapp'] : [])];
        try {
            const { data } = await axios.post('/api/cee-directos/ofertas', {
                ...borrador,
                cliente_id: modoCliente === 'existente' ? cliente?.id_cliente : null,
                // Alta rápida: la ficha nace con el nombre y el contacto al que se
                // manda la oferta; DNI y demás los completa él al aceptar.
                cliente_nuevo: modoCliente === 'rapido'
                    ? { nombre: nombreRapido.trim(), tlf: tlf.trim() || null, email: email.trim() || null }
                    : null,
                prescriptor_id: prescriptorId,
                envio: {
                    canales, email: email.trim(), tlf: tlf.trim(),
                    // Editado a mano, el servidor lo usa tal cual; si no, lo
                    // compone él con el número y el enlace de verdad.
                    mensaje: mensajeTocado ? mensaje : null,
                },
            }, { timeout: 120000 });
            const items = Object.entries(data.resultados || {}).map(([k, r]) => ({
                texto: r.ok ? `${k === 'email' ? 'Email' : 'WhatsApp'} → ${r.to}` : `${k === 'email' ? 'Email' : 'WhatsApp'}: ${r.error}`,
                tono: r.ok ? 'ok' : 'aviso',
            }));
            setResultado({ ok: true, items, text: '' });
            setFase('done');
            onSent?.(data);
        } catch (err) {
            const r = err.response?.data;
            const det = r?.resultados ? Object.entries(r.resultados).map(([k, v]) => `${k}: ${v.error || 'ok'}`).join(' · ') : '';
            // Un 404 sin cuerpo JSON es que el servidor NO TIENE esta ruta (un
            // backend arrancado antes de la versión que la trae): decirlo, en vez
            // del genérico, ahorra buscar el fallo en WhatsApp.
            const base = err.response?.status === 404 && typeof r !== 'object'
                ? 'El servidor no reconoce el envío de ofertas: hay que reiniciar el backend para que cargue la versión nueva.'
                : !err.response
                    ? 'No hay conexión con el servidor.'
                    : (r?.error || `No se pudo enviar la oferta (error ${err.response.status}).`);
            setResultado({ ok: false, items: [], text: [base, det].filter(Boolean).join(' — ') });
            setFase('done');
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6">
                <div className="bg-bkg-surface border border-white/10 w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl max-h-[92vh] flex flex-col">

                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Enviar oferta de CEE</h2>
                            <p className="text-[11px] text-white/35 mt-0.5">El cliente recibe el PDF y un enlace para aceptarla. Al aceptar, nace el expediente.</p>
                        </div>
                        <button onClick={cerrar} className="w-9 h-9 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
                    </div>

                    <div className="overflow-y-auto px-5 py-5 space-y-6">

                        {/* ── Qué se ofrece y a qué precio ───────────────────── */}
                        <section>
                            <label className={lbl}>¿Qué se ofrece?</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {Object.entries(ALCANCES).map(([v, a]) => (
                                    <button key={v} type="button" onClick={() => elegirAlcance(v)}
                                        className={`text-left p-4 rounded-xl border transition-all ${alcance === v ? 'bg-brand/[0.08] border-brand/50' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className={`text-xs font-black uppercase tracking-wider ${alcance === v ? 'text-brand' : 'text-white/70'}`}>{a.titulo}</span>
                                            <span className="text-[11px] font-mono text-white/40">{PRECIO_DEFECTO[v]} €</span>
                                        </div>
                                        <div className="text-[11px] text-white/35 mt-1 leading-snug">{a.sub}</div>
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                                <div>
                                    <label className="block text-[10px] text-white/35 mb-1">Honorarios (sin IVA)</label>
                                    <div className="relative">
                                        <CampoDecimal valor={precio} onCambio={(n) => { setPrecio(n); setPrecioTocado(true); }} className={`${inp} pr-8`} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">€</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-white/35 mb-1">Descuento sobre honorarios</label>
                                    <div className="relative">
                                        <CampoDecimal valor={dto} onCambio={(n) => setDto(Math.min(100, n))} alVaciar={() => setDto(0)} className={`${inp} pr-8`} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">%</span>
                                    </div>
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="block text-[10px] text-white/35 mb-1">Tasa de registro por certificado</label>
                                    <div className="relative">
                                        <CampoDecimal valor={tasa} onCambio={setTasa} alVaciar={() => setTasa(0)} className={`${inp} pr-8`} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">€</span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-white/30 mt-1.5">
                                La tasa es la de Castilla-La Mancha (16,39 €), sin IVA, una por certificado{alcance === 'DOBLE' ? ' — aquí van dos' : ''}. Pon 0 si no se incluye.
                            </p>

                            {/* El total que va a leer el cliente, a la vista mientras se decide. */}
                            <div className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-[11px] text-white/45">
                                    {dto > 0 ? `${fmtEur(precio)} − ${String(dto).replace('.', ',')} % = ${fmtEur(totales.lineas[0].subtotal)}` : fmtEur(precio)} + IVA {fmtEur(totales.iva)}{totales.tasas > 0 ? ` + ${numTasasDe(alcance)} × tasa ${fmtEur(tasa)}` : ''}
                                </span>
                                <span className="text-lg font-black text-brand font-mono">{fmtEur(totales.total)}</span>
                            </div>
                        </section>

                        {/* ── Cliente ─────────────────────────────── */}
                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <label className={`${lbl} mb-0`}>Cliente <span className="text-brand">·</span> obligatorio</label>
                                <button type="button"
                                    onClick={() => { setModoCliente(m => (m === 'rapido' ? 'existente' : 'rapido')); setCliente(null); }}
                                    className="text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand">
                                    {modoCliente === 'rapido' ? 'Buscar uno que ya existe' : 'Es nuevo: solo nombre'}
                                </button>
                            </div>
                            {modoCliente === 'rapido' ? (
                                <>
                                    <input value={nombreRapido} onChange={e => setNombreRapido(e.target.value)}
                                        placeholder="Nombre del cliente (p. ej. Francisca Martínez)" className={inp} />
                                    <p className="text-[11px] text-white/30 mt-1.5">
                                        Con el nombre y el teléfono de abajo basta: el DNI, el email y la dirección los completa él al aceptar.
                                    </p>
                                </>
                            ) : (
                                <ClientePicker cliente={cliente} onChange={elegirCliente} datosNuevoCliente={inmueble} />
                            )}
                        </section>

                        {/* ── Inmueble (opcional) ─────────────────── */}
                        <section>
                            {!verInmueble ? (
                                <button type="button" onClick={() => setVerInmueble(true)}
                                    className="w-full min-h-[44px] rounded-xl border border-dashed border-white/15 text-[11px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/30 transition-colors">
                                    + Añadir el inmueble <span className="normal-case font-normal tracking-normal text-white/30">— opcional: si no, lo pone el cliente al aceptar</span>
                                </button>
                            ) : (
                                <>
                                    <label className={lbl}>El inmueble <span className="text-white/20 normal-case font-normal tracking-normal">— sale en la oferta y lo hereda el expediente</span></label>
                                    <div className="flex gap-2">
                                        <input value={refCatastral} onChange={e => setRefCatastral(e.target.value.toUpperCase())}
                                            placeholder="Ref. catastral (opcional)" className={`${inp} font-mono`} />
                                        <button type="button" onClick={traerDelCatastro}
                                            disabled={catastro.cargando || !refCatastralValida(refCatastral)}
                                            className="shrink-0 min-h-[44px] px-4 rounded-xl border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                            {catastro.cargando ? '…' : 'Traer dirección'}
                                        </button>
                                    </div>
                                    {catastro.msg && <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-3 text-[11px] text-emerald-300">{catastro.msg}</div>}
                                    {catastro.error && <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300">{catastro.error}</div>}
                                    <div className="mt-3">
                                        <DireccionEdit values={inmueble} onChange={(p) => setInmueble(v => ({ ...v, ...p }))} autoMunicipioHint={pistaMunicipio} />
                                    </div>
                                </>
                            )}
                        </section>

                        {/* ── Origen y observaciones ──────────────── */}
                        <section className="space-y-3">
                            <label className={lbl}>Quién nos lo trae <span className="text-white/20 normal-case font-normal tracking-normal">— opcional</span></label>
                            <PrescriptorPicker prescriptores={prescriptores} value={prescriptorId} onChange={setPrescriptorId}
                                placeholder="— ¿Quién nos lo trae? —" sinPartnerLabel="Directo (sin prescriptor)" />
                            <div>
                                <label className="block text-[10px] text-white/35 mb-1">Observaciones que salen en el PDF</label>
                                <textarea value={observaciones} rows={3}
                                    onChange={e => { setObservaciones(e.target.value); setObsTocadas(true); }}
                                    className="no-uppercase w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:border-brand/40 resize-none" />
                            </div>
                        </section>

                        {/* ── A quién y cómo ──────────────────────── */}
                        <section>
                            <label className={lbl}>Se envía a</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email del cliente"
                                    className={`${inp} no-uppercase`} />
                                <input value={tlf} onChange={e => setTlf(e.target.value)} type="tel" placeholder="móvil (WhatsApp)" className={inp} />
                            </div>
                            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02]">
                                <button type="button" onClick={() => setVerMensaje(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left">
                                    <span className="text-[11px] text-white/50 line-clamp-1">{mensaje.split('\n').filter(Boolean).slice(1, 2).join(' ') || 'Mensaje'}</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-brand/70 shrink-0 ml-3">{verMensaje ? 'Ocultar' : 'Ver / editar el mensaje'}</span>
                                </button>
                                {verMensaje && (
                                    <div className="px-4 pb-4">
                                        <textarea value={mensajeVisible} rows={11}
                                            onChange={e => { setMensaje(e.target.value); setMensajeTocado(true); }}
                                            className="no-uppercase w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[13px] text-white/80 focus:outline-none focus:border-brand/40 resize-y font-mono" />
                                        <p className="text-[11px] text-white/30 mt-1">
                                            {mensajeTocado
                                                ? <>Editado a mano: sale tal cual. <button type="button" className="underline" onClick={() => setMensajeTocado(false)}>Volver al automático</button> — el automático pone el nº de oferta y el enlace de verdad.</>
                                                : 'El número de oferta y el enlace para aceptarla se ponen al enviar.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* ── Barra de envío ─────────────────────────────────── */}
                    <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 space-y-3"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                        <div className="flex flex-wrap gap-2">
                            <CanalChip canal="email" nombre="Email" activo={usaEmail} disponible={/\S+@\S+\.\S+/.test(email)}
                                detalle={email} motivo="Sin email" onClick={() => setUsaEmail(v => !v)} bloqueado={!!fase} />
                            <CanalChip canal="whatsapp" nombre="WhatsApp" activo={usaWa}
                                disponible={!!waReady && tlf.replace(/\D/g, '').length >= 9}
                                detalle={tlf} motivo={waReady === false ? 'WhatsApp desconectado' : 'Sin teléfono'}
                                onClick={() => setUsaWa(v => !v)} bloqueado={!!fase} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setPreview(true)} disabled={!hayCliente}
                                className="flex-1 md:flex-none md:px-5 min-h-[44px] rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/55 hover:text-white transition-colors disabled:opacity-30">
                                Ver PDF
                            </button>
                            <button onClick={enviar} disabled={!puedeEnviar} title={motivo || ''}
                                className="flex-[2] md:flex-1 min-h-[44px] rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors">
                                {motivo ? motivo : `Enviar oferta · ${fmtEur(totales.total)}`}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {preview && createPortal(
                <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-6" onClick={() => setPreview(false)}>
                    <div className="bg-white w-full max-w-[860px] h-[92vh] rounded-xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-2 bg-bkg-surface border-b border-white/10">
                            <span className="text-[11px] font-black uppercase tracking-widest text-white/60">Vista previa · el nº se asigna al enviar</span>
                            <button onClick={() => setPreview(false)} className="text-white/50 hover:text-white text-xl leading-none px-2">×</button>
                        </div>
                        <iframe title="Vista previa de la oferta" className="flex-1 w-full bg-white"
                            srcDoc={buildOfertaCeeHtml(borrador, { cliente: clientePdf, firmaUrl: '#' })} />
                    </div>
                </div>,
                document.body
            )}

            <SendActionOverlay
                phase={fase}
                ok={resultado.ok}
                subtitle={`Oferta de CEE · ${nombreDe(clientePdf)}`}
                items={resultado.items}
                errorText={resultado.text}
                sendingTitle="Enviando la oferta…"
                okTitle="¡Oferta enviada!"
                onClose={() => { const ok = resultado.ok; setFase(null); if (ok) cerrar(); }}
            />
        </>
    );
}

export default OfertaCeeModal;
