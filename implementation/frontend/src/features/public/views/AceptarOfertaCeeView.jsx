import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import CondicionesAceptacionModal from '../components/CondicionesAceptacionModal';
import { CONDICIONES_OFERTA_CEE, CONDICIONES_OFERTA_CEE_VERSION } from '../logic/condicionesOfertaCee';
import { parseCatastroAddressFull } from '../../../utils/direccionCatastral';
import { CALEFACCION, ACS, PLACAS, CUESTIONARIO_VACIO, faltanCuestionario } from '../../cee-directo/logic/cuestionarioCee';
import { traerDireccionCatastral, refCatastralValida, limpiarRefCatastral } from '../../../utils/traerDireccionCatastral';
import { DocsManager } from '../../docs/DocsManager';
import { API_DOCS_CEE_DIRECTO } from '../../docs/docsApi';

// ─────────────────────────────────────────────────────────────────────────────
// /aceptar-cee/:token — el cliente acepta la OFERTA de un CEE directo.
//
// Es la misma pantalla que /firma/:id de la propuesta CAE y pide LOS MISMOS
// datos (nombre, apellidos, DNI, email y teléfono), SIN la cuenta bancaria:
// aquí no hay bono que ingresarle, es él quien paga. Y termina de completar lo
// que falte: el INMUEBLE (con su referencia catastral, que puede sacar de su
// UBICACIÓN como en la captación de oportunidades) y su DOMICILIO.
//
// Al aceptar nace el expediente {AAAA}CEE_{n} y se le dice su número.
//
// La API se pide en RELATIVO (como FirmaMovilView): así funciona igual desde el
// móvil en la red local que en producción.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/public/oferta-cee';

const capital = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/**
 * Una propiedad del Catastro ({ rc, address, postalCode, municipality,
 * province }) repartida en los campos del formulario. La vía viene como la tiene
 * registrada el Catastro y sin piso: queda editable.
 */
function camposDePropiedad(p) {
    const t = parseCatastroAddressFull(p.address) || {};
    return {
        ref_catastral: p.rc || '',
        direccion: t.direccion || p.address || '',
        codigo_postal: p.postalCode || t.codigo_postal || '',
        municipio: capital(p.municipality || t.municipioHint || ''),
        provincia: capital(p.province || t.provincia || ''),
    };
}

/** Rótulo de un inmueble de un edificio: "Esc. 1 · Planta 02 · Puerta B · Vivienda · 90 m²". */
const rotuloInmueble = (d) => [
    d.block && `Esc. ${d.block}`, d.floor && `Planta ${d.floor}`, d.door && `Puerta ${d.door}`,
    d.use && capital(d.use), d.surface ? `${d.surface} m²` : null,
].filter(Boolean).join(' · ') || d.rc;
const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

const lbl = 'block text-xs font-black uppercase tracking-widest text-white/40 ml-1';
const inp = 'w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium';

function Campo({ id, label, req, value, onChange, type = 'text', upper = false, placeholder }) {
    return (
        <div className="space-y-1.5">
            <label className={lbl} htmlFor={id}>{label}{req && <span className="text-brand"> *</span>}</label>
            <input id={id} name={id} type={type} required={req} value={value || ''} placeholder={placeholder}
                onChange={e => onChange(id, e.target.value)}
                className={`${inp} ${upper ? 'uppercase' : ''} ${type === 'email' ? 'no-uppercase' : ''}`} />
        </div>
    );
}

/** Pregunta de opciones: tarjetas pulsables, una respuesta. */
function Pregunta({ titulo, opciones, valor, onElegir }) {
    return (
        <div>
            <p className="text-sm font-bold text-white/85 mb-2">{titulo} <span className="text-brand">*</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {opciones.map(o => (
                    <button key={o.value} type="button" onClick={() => onElegir(o.value)}
                        className={`text-left px-4 py-3 rounded-xl border transition-colors ${valor === o.value ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
                        <span className={`block text-[13px] font-bold ${valor === o.value ? 'text-brand' : 'text-white/80'}`}>{o.label}</span>
                        {o.sub && <span className="block text-[11px] text-white/35 mt-0.5">{o.sub}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

function SiNo({ titulo, valor, onElegir }) {
    return (
        <div>
            <p className="text-sm font-bold text-white/85 mb-2">{titulo} <span className="text-brand">*</span></p>
            <div className="flex gap-2">
                {[[true, 'Sí'], [false, 'No']].map(([v, t]) => (
                    <button key={t} type="button" onClick={() => onElegir(v)}
                        className={`flex-1 sm:flex-none sm:min-w-[110px] px-4 py-3 rounded-xl border text-[13px] font-bold transition-colors ${valor === v ? 'border-brand bg-brand/10 text-brand' : 'border-white/10 bg-white/[0.02] text-white/75 hover:border-white/25'}`}>
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Marco({ children }) {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center py-10 px-4 relative overflow-x-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-2xl relative z-10 px-1 sm:px-4">
                <div className="text-center mb-8">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Presupuesto</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">BROKERGY</span>
                    </h1>
                </div>
                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-6 sm:p-10 relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>
                    {children}
                </div>
                <p className="text-center mt-10 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}

export function AceptarOfertaCeeView({ token }) {
    const [loading, setLoading] = useState(true);
    const [oferta, setOferta] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [hecho, setHecho] = useState(null);          // { numeroExpediente, expedienteId, docsToken }
    // Tras aceptar: 'enviando' | { faltaban: [] } cuando ha pulsado terminar.
    const [terminado, setTerminado] = useState(null);
    const [verCondiciones, setVerCondiciones] = useState(false);
    const formRef = useRef(null);
    // Localizar el inmueble: 'gps' | 'catastro' | 'rc' mientras se busca.
    const [localizando, setLocalizando] = useState(null);
    const [avisoInmueble, setAvisoInmueble] = useState(null);       // { tono, texto }
    const [opcionesEdificio, setOpcionesEdificio] = useState(null); // inmuebles de un bloque
    // ¿Vive en el inmueble que se certifica? Es lo normal en un CEE suelto: por
    // defecto sí, y su domicilio no se le vuelve a pedir.
    const [viveAqui, setViveAqui] = useState(true);
    // Climatización: lo que el técnico necesita saber antes de la visita.
    const [cuest, setCuest] = useState(CUESTIONARIO_VACIO);
    const cambiaCuest = (k, v) => setCuest(c => ({ ...c, [k]: v }));
    const faltanC = faltanCuestionario(cuest);

    useEffect(() => {
        axios.get(`${API}/${token}`)
            .then(({ data }) => {
                setOferta(data);
                const d = data.cliente?.domicilio || {};
                setForm({
                    ...data.cliente, ...data.inmueble,
                    dom_direccion: d.direccion || '', dom_codigo_postal: d.codigo_postal || '',
                    dom_municipio: d.municipio || '', dom_provincia: d.provincia || '',
                });
                // Si ya consta un domicilio y NO es el del inmueble, se enseña.
                const norm = (x) => String(x || '').trim().toUpperCase();
                if (d.direccion && data.inmueble?.direccion && norm(d.direccion) !== norm(data.inmueble.direccion)) setViveAqui(false);
            })
            .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el presupuesto.'))
            .finally(() => setLoading(false));
    }, [token]);

    const cambia = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const aplicarPropiedad = (p) => {
        setForm(f => ({ ...f, ...camposDePropiedad(p) }));
        setOpcionesEdificio(null);
        setAvisoInmueble({ tono: 'ok', texto: 'Hemos rellenado la dirección con los datos del Catastro. Compruébala y añade el piso y la puerta si faltan.' });
    };

    /**
     * "Usar mi ubicación": lo mismo que la captación de oportunidades — GPS del
     * móvil → referencia catastral. Si cae en un edificio de varias viviendas, se
     * le pregunta cuál es la suya: elegir por él sería certificar la del vecino.
     */
    const usarUbicacion = () => {
        setAvisoInmueble(null); setOpcionesEdificio(null);
        if (!navigator.geolocation) {
            setAvisoInmueble({ tono: 'error', texto: 'Tu navegador no permite usar la ubicación. Escribe la referencia catastral o la dirección.' });
            return;
        }
        setLocalizando('gps');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            setLocalizando('catastro');
            try {
                const { data } = await axios.post('/api/catastro/reverse-geocode', {
                    lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps',
                });
                const lista = data?.isParcela ? (data.dwellings || []) : [];
                if (lista.length > 1) {
                    const orden = [...lista].sort((a, b) => Number(b.isResidential) - Number(a.isResidential));
                    setOpcionesEdificio({ base: data, lista: orden });
                } else if (lista.length === 1) {
                    aplicarPropiedad({ ...data, rc: lista[0].rc, address: lista[0].address || data.address });
                } else {
                    aplicarPropiedad(data);
                }
            } catch (err) {
                const st = err.response?.status;
                setAvisoInmueble({
                    tono: 'error',
                    texto: st === 404 ? 'No hemos encontrado ningún inmueble en tu ubicación. Si no estás en él, escribe la dirección.'
                        : st === 503 ? 'El Catastro está saturado ahora mismo. Inténtalo en unos minutos o escribe la dirección.'
                            : 'No hemos podido identificar el inmueble por tu ubicación. Escribe la dirección.',
                });
            } finally { setLocalizando(null); }
        }, (err) => {
            setLocalizando(null);
            setAvisoInmueble({
                tono: 'error',
                texto: err.code === 1
                    ? 'No has dado permiso para usar tu ubicación. Puedes activarlo en el navegador o escribir la dirección.'
                    : 'No hemos podido obtener tu ubicación. Comprueba que el GPS esté activo o escribe la dirección.',
            });
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };

    /** Con la referencia escrita, trae la dirección del Catastro. */
    const buscarReferencia = async () => {
        setAvisoInmueble(null); setOpcionesEdificio(null); setLocalizando('rc');
        try {
            const r = await traerDireccionCatastral(form.ref_catastral);
            const c = r.campos || {};
            setForm(f => ({
                ...f, ref_catastral: r.rc,
                direccion: c.direccion || r.direccion || f.direccion,
                codigo_postal: c.codigo_postal || f.codigo_postal,
                municipio: capital(r.municipioHint || f.municipio),
                provincia: capital(c.provincia || f.provincia),
            }));
            setAvisoInmueble({ tono: 'ok', texto: 'Dirección traída del Catastro. Compruébala y añade el piso y la puerta si faltan.' });
        } catch (err) {
            setAvisoInmueble({ tono: 'error', texto: err.message });
        } finally { setLocalizando(null); }
    };

    const aceptar = async (e) => {
        e.preventDefault();
        if (faltanC.length) { setError(`Falta por contestar: ${faltanC.join(', ')}.`); return; }
        setEnviando(true);
        setError(null);
        try {
            const { data } = await axios.post(`${API}/${token}/aceptar`, {
                ...form,
                ref_catastral: limpiarRefCatastral(form.ref_catastral),
                // Con "vivo aquí", su domicilio ES el inmueble.
                domicilio: viveAqui
                    ? { direccion: form.direccion, codigo_postal: form.codigo_postal, municipio: form.municipio, provincia: form.provincia }
                    : { direccion: form.dom_direccion, codigo_postal: form.dom_codigo_postal, municipio: form.dom_municipio, provincia: form.dom_provincia },
                cuestionario: cuest,
                condiciones_version: CONDICIONES_OFERTA_CEE_VERSION,
            });
            setHecho({ numeroExpediente: data.numeroExpediente, expedienteId: data.expedienteId, docsToken: data.docsToken });
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar la aceptación. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <p className="relative z-10 text-white/40 font-bold uppercase tracking-widest text-xs">Cargando presupuesto…</p>
            </div>
        );
    }

    if (!oferta) {
        return <Marco><p className="text-center text-red-300 text-sm">{error || 'Este presupuesto no existe.'}</p></Marco>;
    }

    const resumen = (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Presupuesto {oferta.numero} · {fmtFecha(oferta.fecha)}</p>
                    <p className="text-white font-bold mt-1">Contratas {oferta.concepto}</p>
                    {oferta.inmueble?.direccion && (
                        <p className="text-white/45 text-xs mt-1">{[oferta.inmueble.direccion, oferta.inmueble.municipio].filter(Boolean).join(', ')}</p>
                    )}
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-brand font-mono">{fmtEur(oferta.total)}</p>
                    <p className="text-[11px] text-white/35">IVA incluido</p>
                </div>
            </div>
            <a href={`${API}/${token}/pdf`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-[11px] font-black uppercase tracking-widest text-brand/80 hover:text-brand">
                📄 Ver el presupuesto en PDF
            </a>
        </div>
    );

    /**
     * "He terminado" / "Lo subo más tarde": dispara la confirmación de la
     * aceptación, que lleva el enlace si falta algo por adjuntar.
     */
    const terminar = async () => {
        setTerminado('enviando');
        try {
            const { data } = await axios.post(`${API}/${token}/terminar`, {});
            setTerminado({ faltaban: data.faltaban || [] });
        } catch {
            setTerminado({ faltaban: [] });
        }
    };

    if (hecho || oferta.estado === 'ACEPTADA') {
        const num = hecho?.numeroExpediente || oferta.numero_expediente;
        const docs = hecho?.docsToken ? { expedienteId: hecho.expedienteId, token: hecho.docsToken } : oferta.docs;
        return (
            <Marco>
                <div className="text-center">
                    <div className="w-20 h-20 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
                        <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-3">{hecho ? '¡Presupuesto aceptado!' : 'Este presupuesto ya está aceptado'}</h2>
                    {!hecho && oferta.aceptada_at && (
                        <p className="text-white/45 text-sm mb-2">Lo aceptó {oferta.aceptada_por || 'el cliente'} el {fmtFecha(oferta.aceptada_at)}.</p>
                    )}
                    {num && (
                        <div className="inline-block rounded-2xl border border-brand/30 bg-brand/[0.07] px-6 py-4 my-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Tu número de expediente</p>
                            <p className="text-2xl font-black font-mono text-brand mt-1">{num}</p>
                        </div>
                    )}
                    <p className="text-white/60 text-sm leading-relaxed max-w-md mx-auto">
                        En los próximos días el técnico certificador se pondrá en contacto contigo para concertar la visita.
                    </p>
                </div>

                {/* ── Las fotos para el certificado, en el mismo sitio ─────────
                    Es el MISMO gestor de documentación que el CAE. Se le pide
                    aquí, con el presupuesto recién aceptado, que es cuando las
                    hace; lo que no suba ahora le llega por enlace. */}
                {docs && (
                    <div className="mt-8 pt-6 border-t border-white/10">
                        <p className="text-xs font-black uppercase tracking-widest text-white/60 text-center">Ayúdanos a preparar tu certificado</p>
                        <p className="text-[12px] text-white/40 text-center mt-1 mb-4">
                            Fotos de la fachada y de los patios interiores, y si puedes un vídeo recorriendo la casa o los planos.
                            Con ellas el técnico llega a la visita sabiendo lo que va a encontrar.
                        </p>
                        <DocsManager mode="token" idOrUuid={docs.expedienteId} token={docs.token} embedded api={API_DOCS_CEE_DIRECTO} />
                        {hecho && !terminado && (
                            <div className="mt-5 flex flex-col sm:flex-row gap-2">
                                <button type="button" onClick={terminar}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-widest">
                                    He terminado
                                </button>
                                <button type="button" onClick={terminar}
                                    className="flex-1 py-3 rounded-xl border border-white/15 text-white/70 hover:text-white font-bold text-sm">
                                    Lo subo más tarde
                                </button>
                            </div>
                        )}
                        {terminado === 'enviando' && <p className="mt-4 text-center text-[12px] text-white/40">Un momento…</p>}
                        {terminado && terminado !== 'enviando' && (
                            <p className="mt-4 text-center text-[12px] text-emerald-300">
                                {terminado.faltaban?.length
                                    ? 'Te hemos enviado un enlace para que subas lo que falte cuando puedas.'
                                    : '¡Gracias! Ya tenemos lo necesario.'}
                            </p>
                        )}
                        {!hecho && (
                            <p className="mt-4 text-center text-[11px] text-white/35">Puedes volver a este enlace cuando quieras para añadir más.</p>
                        )}
                    </div>
                )}
            </Marco>
        );
    }

    if (oferta.estado === 'ANULADA') {
        return (
            <Marco>
                {resumen}
                <p className="text-center text-amber-300 text-sm">Este presupuesto ha sido anulado. Si sigues interesado, ponte en contacto con nosotros y te enviamos uno nuevo.</p>
            </Marco>
        );
    }

    return (
        <Marco>
            <p className="text-white/60 text-sm text-center mb-6">Revisa y completa tus datos para aceptar el presupuesto.</p>
            {resumen}

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
            )}

            <form ref={formRef} onSubmit={aceptar} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Campo id="nombre_razon_social" label="Nombre / Razón Social" req value={form.nombre_razon_social} onChange={cambia} />
                    <Campo id="apellidos" label="Apellidos" value={form.apellidos} onChange={cambia} />
                    <Campo id="dni_cif" label="DNI / CIF" req upper value={form.dni_cif} onChange={cambia} />
                    <Campo id="email" label="Email" req type="email" value={form.email} onChange={cambia} />
                    <Campo id="telefono" label="Teléfono" req type="tel" value={form.telefono} onChange={cambia} />
                </div>

                {/* ── El inmueble ─────────────────────────────────────────
                    Siempre a la vista y relleno con lo que ya tengamos: el
                    Catastro no da el piso ni la puerta, y quien mejor sabe cuál
                    es su vivienda es él. */}
                <div className="pt-2">
                    <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-1">El inmueble que se certifica</p>
                    <p className="text-[12px] text-white/35 mb-4">La vivienda o local del certificado, que puede no ser tu domicilio.</p>

                    <div className="space-y-1.5">
                        <label className={lbl} htmlFor="ref_catastral">Referencia catastral</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input id="ref_catastral" value={form.ref_catastral || ''}
                                onChange={e => cambia('ref_catastral', e.target.value.toUpperCase())}
                                placeholder="Viene en el recibo del IBI (20 caracteres)"
                                className={`${inp} uppercase font-mono`} />
                            <button type="button" onClick={buscarReferencia}
                                disabled={!!localizando || !refCatastralValida(form.ref_catastral)}
                                className="shrink-0 px-4 py-3 rounded-xl border border-brand/30 bg-brand/10 text-brand text-[11px] font-black uppercase tracking-widest hover:bg-brand/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                {localizando === 'rc' ? 'Buscando…' : 'Buscar'}
                            </button>
                        </div>
                        <button type="button" onClick={usarUbicacion} disabled={!!localizando}
                            className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/15 bg-white/[0.03] text-white/75 hover:text-white hover:border-white/30 text-[12px] font-bold transition-colors disabled:opacity-50">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {localizando === 'gps' ? 'Obteniendo tu ubicación…'
                                : localizando === 'catastro' ? 'Buscando el inmueble en el Catastro…'
                                    : '¿No la sabes? Usar mi ubicación (si estás en el inmueble)'}
                        </button>
                    </div>

                    {opcionesEdificio && (
                        <div className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.05] p-3">
                            <p className="text-[12px] text-white/70 mb-2">Estás en un edificio con varios inmuebles. ¿Cuál es el tuyo?</p>
                            <div className="max-h-56 overflow-y-auto space-y-1">
                                {opcionesEdificio.lista.map(d => (
                                    <button key={d.rc} type="button"
                                        onClick={() => aplicarPropiedad({ ...opcionesEdificio.base, rc: d.rc, address: d.address || opcionesEdificio.base.address })}
                                        className={`w-full text-left px-3 py-2 rounded-lg border text-[12px] transition-colors ${d.isResidential ? 'border-white/10 text-white/80 hover:border-brand/40' : 'border-white/5 text-white/35 hover:border-white/20'}`}>
                                        {rotuloInmueble(d)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {avisoInmueble && (
                        <p className={`mt-2 text-[12px] ${avisoInmueble.tono === 'error' ? 'text-amber-300' : 'text-emerald-300'}`}>{avisoInmueble.texto}</p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                        <div className="sm:col-span-2">
                            <Campo id="direccion" label="Dirección (calle, número, piso y puerta)" req value={form.direccion} onChange={cambia} />
                        </div>
                        <Campo id="codigo_postal" label="Código postal" req value={form.codigo_postal} onChange={cambia} />
                        <Campo id="municipio" label="Municipio" req value={form.municipio} onChange={cambia} />
                        <Campo id="provincia" label="Provincia" value={form.provincia} onChange={cambia} />
                    </div>
                </div>

                {/* ── Climatización ───────────────────────────────────────
                    Lo que el técnico necesita saber antes de la visita, con
                    las mismas opciones que el formulario de captación. */}
                <div className="pt-2 space-y-5">
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-1">Calefacción y agua caliente</p>
                        <p className="text-[12px] text-white/35">Con esto el técnico llega a la visita sabiendo qué va a encontrar.</p>
                    </div>
                    <Pregunta titulo="¿Con qué se calienta la vivienda?" opciones={CALEFACCION} valor={cuest.calefaccion} onElegir={v => cambiaCuest('calefaccion', v)} />
                    <Pregunta titulo="¿Con qué se calienta el agua?" opciones={ACS} valor={cuest.acs}
                        onElegir={v => setCuest(c => ({ ...c, acs: v, termo_extra: v === 'misma_caldera' ? c.termo_extra : null }))} />
                    {cuest.acs === 'misma_caldera' && (
                        <SiNo titulo="Además de la caldera, ¿tienes un termo eléctrico para el agua caliente?" valor={cuest.termo_extra} onElegir={v => cambiaCuest('termo_extra', v)} />
                    )}
                    <SiNo titulo="¿Tienes aire acondicionado?" valor={cuest.aire_acondicionado}
                        onElegir={v => setCuest(c => ({ ...c, aire_acondicionado: v, num_aires: v ? c.num_aires : '' }))} />
                    {cuest.aire_acondicionado === true && (
                        <div className="space-y-1.5 max-w-[220px]">
                            <label className={lbl} htmlFor="num_aires">¿Cuántos aparatos? <span className="text-brand">*</span></label>
                            <input id="num_aires" type="number" inputMode="numeric" min="1" max="99" value={cuest.num_aires}
                                onChange={e => cambiaCuest('num_aires', e.target.value)} className={inp} placeholder="Ej. 2" />
                        </div>
                    )}
                    <Pregunta titulo="¿Tienes placas solares fotovoltaicas?" opciones={PLACAS} valor={cuest.placas} onElegir={v => cambiaCuest('placas', v)} />
                </div>

                {/* ── Su domicilio ────────────────────────────────────────── */}
                <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={viveAqui} onChange={e => setViveAqui(e.target.checked)}
                            className="w-5 h-5 accent-orange-500" />
                        <span className="text-sm text-white/75">Vivo en este inmueble <span className="text-white/35">(es mi domicilio)</span></span>
                    </label>
                    {!viveAqui && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
                            <div className="sm:col-span-2">
                                <Campo id="dom_direccion" label="Tu domicilio" req value={form.dom_direccion} onChange={cambia} />
                            </div>
                            <Campo id="dom_codigo_postal" label="Código postal" req value={form.dom_codigo_postal} onChange={cambia} />
                            <Campo id="dom_municipio" label="Municipio" req value={form.dom_municipio} onChange={cambia} />
                            <Campo id="dom_provincia" label="Provincia" value={form.dom_provincia} onChange={cambia} />
                        </div>
                    )}
                </div>

                <div className="pt-4">
                    <button type="submit" disabled={enviando}
                        className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed text-base uppercase tracking-widest">
                        {enviando ? 'Procesando…' : `Aceptar la oferta · ${fmtEur(oferta.total)}`}
                    </button>
                    <p className="mt-3 text-center text-[11px] text-white/40 leading-relaxed">
                        Al pulsar «Aceptar la oferta» aceptas las{' '}
                        <button type="button" onClick={() => setVerCondiciones(true)}
                            className="underline underline-offset-2 text-white/60 hover:text-brand transition-colors">
                            condiciones y autorizaciones
                        </button>
                        {' '}del presupuesto, incluidas la visita del técnico, la presentación del certificado en el registro y el tratamiento de tus datos personales.
                    </p>
                </div>
            </form>

            <CondicionesAceptacionModal
                open={verCondiciones}
                onClose={() => setVerCondiciones(false)}
                enviando={enviando}
                condiciones={CONDICIONES_OFERTA_CEE}
                version={CONDICIONES_OFERTA_CEE_VERSION}
                subtitulo="Lo que aceptas al confirmar el presupuesto"
                aceptarLabel="Aceptar la oferta"
                onAceptar={() => { setVerCondiciones(false); formRef.current?.requestSubmit(); }}
            />
        </Marco>
    );
}

export default AceptarOfertaCeeView;
