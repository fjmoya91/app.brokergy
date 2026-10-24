// ─── Fotos — los apartados de fotos y documentos de una obra ────────────────
// Los apartados que aplican salen de slotsAplicables() (logic/cuestionario.js).
//   · En la vivienda (en_vivienda = sí): cámara trasera, en el orden de la visita,
//     marcando el siguiente que falta.
//   · Sin visita: subir lo que ya se tiene, o mandar al propietario su enlace
//     (POST /obras/:id/enlace-cliente → { url, caduca_at }); lo comparte el
//     certificador con SU WhatsApp (wa.me): desde aquí no se envía nada. El enlace
//     caduca (410 ENLACE_CADUCADO); con «Generar un enlace nuevo»
//     (POST /obras/:id/enlace-cliente/rotar → { url, caduca_at }) el anterior
//     deja de funcionar.
//   · Equipo sin placa: «La subo ahora · Después · Usar un equipo genérico»
//     (cuestionario.fotos_decision[equipo]); la foto que falta NO bloquea.
import { useState } from 'react';
import axios from 'axios';
import {
    DECISION_FOTO, NOMBRE_EQUIPO, SLOTS, estadoEquipos, slotsAplicables,
} from '../logic/cuestionario';
import { API, alPortapapeles, enlaceWhatsApp, errorDe, mensajeError } from '../api';
import { Aviso, useToast } from '../ui/piezas';
import {
    IcoCamara, IcoCheck, IcoCopiar, IcoDoc, IcoEnlace, IcoImagen, IcoPapelera, IcoRecargar, IcoVideo, IcoWhatsApp, Spinner,
} from '../ui/Iconos';
import { aceptaDe } from './comun';
import { pasoDelEquipo } from './pasos';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function Miniatura({ f, onQuitar, puedeQuitar }) {
    const [roto, setRoto] = useState(false);
    const esImagen = /^image\//.test(f.mime || '');
    const esVideo = /^video\//.test(f.mime || '');
    return (
        <div className="ca-thumb" title={f.nombre || ''}>
            {f.thumb && !roto
                ? <img src={f.thumb} alt={f.nombre || 'Archivo subido'} loading="lazy" onError={() => setRoto(true)} />
                : esVideo ? <IcoVideo /> : esImagen ? <IcoImagen /> : <IcoDoc />}
            {f.link && <a href={f.link} target="_blank" rel="noreferrer" className="ca-thumb-ver" aria-label={`Abrir ${f.nombre || 'archivo'}`} />}
            {puedeQuitar && (
                <button type="button" className="ca-thumb-x" onClick={onQuitar} aria-label={`Quitar ${f.nombre || 'archivo'}`}>
                    <IcoPapelera size={14} />
                </button>
            )}
        </div>
    );
}

/**
 * Un apartado: lo subido, el progreso y los botones de cámara / galería.
 * `visita`: en la vivienda (la cámara manda). `guia`: es el siguiente que falta.
 */
export function SlotFoto({ slot, ctx, visita, guia = false }) {
    const { slots, subir, quitar, subiendo, editable } = ctx;
    const toast = useToast();
    const [error, setError] = useState(null);
    const ficheros = slots?.[slot.id] || [];
    const pct = subiendo?.[slot.id];
    const n = ficheros.length;
    const sinSitio = !slot.multiple && n > 0;

    const alElegir = async (e) => {
        const files = e.target.files;
        if (!files?.length) return;
        setError(null);
        const r = await subir(slot.id, files);
        e.target.value = '';
        if (!r.ok) { setError(r.error || 'No se ha podido subir.'); return; }
        if (r.rechazados?.length) setError(r.rechazados.map(x => `${x.nombre}: ${x.motivo}`).join(' · '));
        if (r.n) toast(slot.video ? 'Vídeo subido.' : `${plural(r.n, 'archivo subido', 'archivos subidos')}.`);
    };
    const alQuitar = async (f) => {
        if (!window.confirm('¿Quitar este archivo?')) return;
        const r = await quitar(slot.id, f.driveId || f.id);
        if (!r.ok) toast(r.error);
    };

    const ico = slot.video ? <IcoVideo /> : slot.documento ? <IcoDoc /> : <IcoCamara />;
    const acepta = aceptaDe(slot);
    const camara = !slot.documento;
    const idBase = `f-${slot.id}`;
    const ocupado = pct != null;

    return (
        <div className={`ca-slot${guia ? ' ca-guia' : ''}`} id={`slot-${slot.id}`}>
            <div className="ca-slot-top">
                <div className={`ca-ico-tile ${n ? 'ca-tile-verde' : guia ? 'ca-tile-naranja' : 'ca-tile-crema'}`} aria-hidden="true">{n ? <IcoCheck /> : ico}</div>
                <span>
                    <b>{slot.label}{guia && <span className="ca-chip ca-chip-naranja" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Ahora</span>}</b>
                    <small>{!visita && slot.ayudaRemota ? `${slot.ayuda} ${slot.ayudaRemota}` : slot.ayuda}</small>
                </span>
                <span className={`ca-cuenta${n ? '' : ' ca-cuenta-0'}`}>{n ? `${n} ✓` : '—'}</span>
            </div>

            {n > 0 && (
                <div className="ca-thumbs">
                    {ficheros.map(f => (
                        <Miniatura key={f.driveId || f.id || f.nombre} f={f} puedeQuitar={editable} onQuitar={() => alQuitar(f)} />
                    ))}
                </div>
            )}
            {ocupado && <div className="ca-subiendo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>}
            {error && <p className="ca-error" role="alert">{error}</p>}

            {editable && (
                <div className="ca-btns ca-btns-2" style={{ marginTop: 12 }}>
                    {camara && (
                        <label className={`ca-btn ca-btn-peq ${visita ? 'ca-btn-pri' : 'ca-btn-sec'}${ocupado ? ' ca-btn-off' : ''}`} htmlFor={`${idBase}-cam`}>
                            {ocupado ? <Spinner size={16} /> : slot.video ? <IcoVideo size={18} /> : <IcoCamara size={18} />}
                            {slot.video ? 'Grabar' : sinSitio ? 'Repetir foto' : 'Hacer foto'}
                            <input id={`${idBase}-cam`} className="ca-input-fichero" type="file" accept={acepta}
                                capture="environment" multiple={!!slot.multiple} onChange={alElegir} disabled={ocupado} />
                        </label>
                    )}
                    <label className={`ca-btn ca-btn-peq ${camara && !visita ? 'ca-btn-pri' : 'ca-btn-sec'}${ocupado ? ' ca-btn-off' : ''}`}
                        htmlFor={`${idBase}-gal`} style={!camara ? { gridColumn: '1 / -1' } : undefined}>
                        {slot.documento ? <IcoDoc size={18} /> : <IcoImagen size={18} />}
                        {slot.documento ? 'Subir archivo' : slot.video ? 'Elegir vídeo' : 'De la galería'}
                        <input id={`${idBase}-gal`} className="ca-input-fichero" type="file" accept={acepta}
                            multiple={!!slot.multiple} onChange={alElegir} disabled={ocupado} />
                    </label>
                </div>
            )}
        </div>
    );
}

/** «La subo ahora · Después · Usar un equipo genérico» para un equipo sin placa. */
export function DecisionEquipo({ equipo, ctx }) {
    const { form, setDecision, editable } = ctx;
    const d = form.cuestionario.fotos_decision?.[equipo] || null;
    return (
        <div className="ca-decision">
            <p className="ca-peq" style={{ margin: '0 0 8px' }}>¿Y si ahora no tienes la placa de {NOMBRE_EQUIPO[equipo] || equipo}?</p>
            <div className="ca-chips" role="radiogroup" aria-label={`Placa de ${NOMBRE_EQUIPO[equipo] || equipo}`}>
                {DECISION_FOTO.map(o => (
                    <button key={o.value} type="button" disabled={!editable} role="radio" aria-checked={d === o.value}
                        className={`ca-chipbtn${d === o.value ? ' ca-chipbtn-sel' : ''}`}
                        onClick={() => setDecision(equipo, d === o.value ? null : o.value)}>
                        {o.label}
                    </button>
                ))}
            </div>
            {d === 'GENERICA' && (
                <p className="ca-peq" style={{ marginTop: 8 }}>
                    Se pondrá un equipo genérico de la época. El resultado puede salir peor que con la placa; lo puedes cambiar después en CE3X.
                </p>
            )}
            {d === 'DESPUES' && <p className="ca-peq" style={{ marginTop: 8 }}>Te lo recordaremos antes de generar el certificado.</p>}
        </div>
    );
}

/** Un equipo: su foto, su placa y, si falta la placa, la decisión. */
function BloqueEquipo({ e, ctx, visita, guiaId }) {
    const editable = ctx.editable;
    const slots = e.slots.map(id => SLOTS.find(s => s.id === id)).filter(Boolean)
        .filter(s => editable || (ctx.slots?.[s.id] || []).length > 0);
    return (
        <div className="ca-equipo">
            {slots.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={visita} guia={guiaId === s.id} />)}
            {!e.completo && editable && <DecisionEquipo equipo={e.equipo} ctx={ctx} />}
        </div>
    );
}

/** Las fotos de los equipos que se enseñan en un paso (calefacción, ACS…). */
export function SlotsDeEquipos({ ctx, paso }) {
    const c = ctx.form.cuestionario;
    const visita = ctx.form.en_vivienda === true;
    const equipos = estadoEquipos(c, ctx.slots).filter(e => pasoDelEquipo(e.equipo, c) === paso);
    if (!equipos.length) return <p className="ca-peq">Elige antes el equipo para ver qué fotos hacen falta.</p>;
    return (
        <div className="ca-stack" style={{ gap: 10 }}>
            {equipos.map(e => <BloqueEquipo key={e.equipo} e={e} ctx={ctx} visita={visita} />)}
        </div>
    );
}

/* ── El enlace para el propietario ──────────────────────────────────────── */
export function EnlacePropietario({ obraId, form }) {
    const toast = useToast();
    const [url, setUrl] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [caducado, setCaducado] = useState(false);
    const [confirmarNuevo, setConfirmarNuevo] = useState(false);
    const t = form?.titular || {};

    const pedir = async () => {
        if (url) return url;
        setCargando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/obras/${obraId}/enlace-cliente`);
            const u = data?.url || data?.enlace || null;
            if (!u) throw new Error('No ha llegado el enlace.');
            setUrl(u);
            return u;
        } catch (err) {
            if (err.response?.status === 410 || errorDe(err).code === 'ENLACE_CADUCADO') {
                setCaducado(true);
                setError('El enlace de esta obra ha caducado. Genera uno nuevo para mandárselo.');
            } else setError(mensajeError(err, 'No se ha podido crear el enlace.'));
            return null;
        } finally {
            setCargando(false);
        }
    };
    const generarNuevo = async () => {
        setCargando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/obras/${obraId}/enlace-cliente/rotar`);
            const u = data?.url || data?.enlace || null;
            if (!u) throw new Error('No ha llegado el enlace nuevo.');
            setUrl(u); setCaducado(false); setConfirmarNuevo(false);
            toast('Enlace nuevo creado. El anterior ya no funciona.');
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido generar el enlace nuevo.'));
        } finally {
            setCargando(false);
        }
    };
    const texto = (u) => `Hola${t.nombre ? ` ${t.nombre}` : ''}. Para preparar el certificado energético de tu vivienda necesito unas fotos. Las puedes subir desde el móvil aquí, sin registrarte: ${u}`;
    const copiar = async () => {
        const u = await pedir();
        if (u && await alPortapapeles(u)) toast('Enlace copiado.');
    };
    const whatsapp = async () => {
        // La ventana se abre en el mismo gesto (si se espera al servidor, el navegador la bloquea).
        const w = url ? null : window.open('', '_blank');
        const u = await pedir();
        if (!u) { w?.close(); return; }
        const destino = enlaceWhatsApp(texto(u), t.telefono);
        if (w) w.location.href = destino; else window.open(destino, '_blank', 'noopener');
    };

    return (
        <div className="ca-card ca-pad">
            <div className="ca-fila-top" style={{ justifyContent: 'flex-start' }}>
                <div className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoEnlace /></div>
                <div>
                    <p className="ca-eyebrow ca-eyebrow-verde" style={{ margin: 0 }}>Sin ir a la vivienda</p>
                    <h3 className="ca-display ca-h3" style={{ margin: '2px 0 0' }}>Pídeselas al propietario</h3>
                </div>
            </div>
            <p className="ca-txt" style={{ marginTop: 10 }}>
                Le mandas un enlace y sube las fotos desde su móvil, sin cuenta. Aparecen aquí solas.
            </p>
            {url && <p className="ca-mono ca-enlace" style={{ marginTop: 10 }}>{url}</p>}
            {error && <p className="ca-error" role="alert">{error}</p>}
            <div className="ca-btns ca-btns-2">
                <button type="button" className="ca-btn ca-btn-pri" onClick={whatsapp} disabled={cargando}>
                    {cargando ? <Spinner /> : <IcoWhatsApp />} Por WhatsApp
                </button>
                <button type="button" className="ca-btn ca-btn-sec" onClick={copiar} disabled={cargando}>
                    <IcoCopiar /> Copiar enlace
                </button>
            </div>
            <p className="ca-peq" style={{ marginTop: 10 }}>El WhatsApp sale de tu móvil, con tu número. Nosotros no le escribimos.</p>
            {confirmarNuevo || caducado ? (
                <div className="ca-crema" style={{ marginTop: 12 }}>
                    <p className="ca-peq" style={{ margin: 0 }}>
                        {caducado
                            ? 'Con un enlace nuevo el propietario puede seguir subiendo fotos; lo que ya subió se queda.'
                            : 'El enlace que ya le mandaste dejará de funcionar. Úsalo si ha caducado o si se lo mandaste a quien no era.'}
                    </p>
                    <div className="ca-btns ca-btns-2" style={{ marginTop: 10 }}>
                        <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" onClick={generarNuevo} disabled={cargando}>
                            {cargando ? <Spinner size={16} /> : <IcoRecargar size={16} />} Generar uno nuevo
                        </button>
                        {!caducado && <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" onClick={() => setConfirmarNuevo(false)}>Cancelar</button>}
                    </div>
                </div>
            ) : (
                <button type="button" className="ca-link" style={{ marginTop: 10 }} onClick={() => setConfirmarNuevo(true)}>Generar un enlace nuevo</button>
            )}
        </div>
    );
}

/* ── El paso «Fotos y documentos» entero ────────────────────────────────── */
export function FotosObra({ ctx, obraId, soloVer = false }) {
    const { form, slots, docsError, recargarDocs, editable, setCampo } = ctx;
    const c = form.cuestionario;
    const visita = form.en_vivienda === true;
    // Ya pedida: solo lo subido, sin botones.
    const conFicheros = (s) => (slots?.[s.id] || []).length > 0;
    const aplican = slotsAplicables(c).filter(s => !soloVer || conFicheros(s));
    if (soloVer && !aplican.length) {
        return <p className="ca-peq">{docsError ? mensajeError(docsError) : 'No se subieron fotos ni documentos.'}</p>;
    }
    const vivienda = aplican.filter(s => !s.equipo && !s.documento);
    const docs = aplican.filter(s => s.documento);
    const equipos = estadoEquipos(c, slots).filter(e => !soloVer || e.fotos > 0);
    // En la visita, el siguiente apartado que falta (fotos de la vivienda y equipos, en orden).
    const guiaId = visita && editable ? aplican.find(s => !s.documento && !s.video && !(slots?.[s.id] || []).length)?.id : null;

    return (
        <div className="ca-stack">
            {docsError && (
                <Aviso tono="ambar" titulo="No hemos podido cargar las fotos">
                    {mensajeError(docsError)}{' '}
                    <button type="button" className="ca-link" onClick={recargarDocs}>Reintentar</button>
                </Aviso>
            )}
            {editable && (
                <div className="ca-chips" role="radiogroup" aria-label="¿Estás en la vivienda?">
                    <button type="button" role="radio" aria-checked={visita} className={`ca-chipbtn${visita ? ' ca-chipbtn-sel' : ''}`}
                        onClick={() => setCampo('en_vivienda', true)}>Estoy en la vivienda</button>
                    <button type="button" role="radio" aria-checked={form.en_vivienda === false} className={`ca-chipbtn${form.en_vivienda === false ? ' ca-chipbtn-sel' : ''}`}
                        onClick={() => setCampo('en_vivienda', false)}>Lo hago con fotos</button>
                </div>
            )}
            {editable && (visita ? (
                <Aviso tono="info" icono={IcoCamara} titulo="Visita guiada">
                    Ve en este orden: te marcamos en naranja la siguiente foto. «Hacer foto» abre la cámara trasera; puedes hacer varias seguidas.
                </Aviso>
            ) : (
                <EnlacePropietario obraId={obraId} form={form} />
            ))}

            {vivienda.length > 0 && (
                <section>
                    <h3 className="ca-sec">La vivienda</h3>
                    {vivienda.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={visita} guia={guiaId === s.id} />)}
                </section>
            )}

            {equipos.length > 0 && (
                <section>
                    <h3 className="ca-sec">Los equipos</h3>
                    <div className="ca-stack" style={{ gap: 10 }}>
                        {equipos.map(e => <BloqueEquipo key={e.equipo} e={e} ctx={ctx} visita={visita} guiaId={guiaId} />)}
                    </div>
                </section>
            )}

            {docs.length > 0 && (
                <section>
                    <h3 className="ca-sec">Documentos</h3>
                    {docs.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={false} />)}
                </section>
            )}
        </div>
    );
}

export default FotosObra;
