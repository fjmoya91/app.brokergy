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
//   · Equipo sin placa: «La subo ahora · Ahora no, la subo luego · Usar un equipo
//     genérico» (cuestionario.fotos_decision[equipo]); la foto que falta NO bloquea.
//   · Apartado opcional (slot.opcional): chip «Opcional» y «Ahora no», que lo pliega
//     (cuestionario.fotos_omitidas) hasta que se pulse «Subirla».
//   · «Fachada principal» vacía: la foto del Catastro y la de Street View
//     (GET /obras/:id/fachada-sugerida/:fuente) con «Usar esta foto»
//     (POST …/:fuente/usar), o la suya con los botones de siempre.
//   · YA PEDIDA (Fran, 28/10/2026: «no me deja ya añadir más fotos… las que falten,
//     de la caldera, de los patios interiores»): con `ctx.puedeSubir` se AÑADEN
//     fotos a cualquier apartado —también a los que no aplicaban, en «Otras
//     fotos»—, pero no se quita ninguna: lo pedido se generó con ellas. El
//     servidor ya lo admitía (docs.subir: todo salvo ARCHIVADA).
import { useEffect, useState } from 'react';
import axios from 'axios';
import {
    ANTIGUEDAD_EQUIPO, DECISION_FOTO, EQUIPOS_CON_ANTIGUEDAD, NOMBRE_EQUIPO, SLOTS, estadoEquipos, fotoOmitida, omitirFoto, placaDe, siguienteDeLaVisita, slotsAplicables,
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

const FUENTES_FACHADA = [
    { id: 'catastro', label: 'Del Catastro' },
    { id: 'streetview', label: 'De Street View' },
];

/**
 * «Fachada principal» vacía: las fotos que proponemos (Catastro y Street View).
 * Se guarda la que elija («Usar esta foto»); si ninguna es la casa, hace o sube
 * la suya con los botones de siempre. Las imágenes van con la sesión (blob).
 */
function FachadaSugerida({ obraId, usar, ocupado }) {
    const toast = useToast();
    const [fotos, setFotos] = useState(null);   // null = cargando · [{ id, label, url }]
    const [usando, setUsando] = useState(null);

    useEffect(() => {
        let vivo = true;
        const urls = [];
        Promise.all(FUENTES_FACHADA.map(async (f) => {
            try {
                const { data } = await axios.get(`${API}/obras/${obraId}/fachada-sugerida/${f.id}`, { responseType: 'blob' });
                const url = URL.createObjectURL(data);
                urls.push(url);
                return { ...f, url };
            } catch { return null; }
        })).then(r => { if (vivo) setFotos(r.filter(Boolean)); });
        return () => { vivo = false; urls.forEach(u => URL.revokeObjectURL(u)); };
    }, [obraId]);

    if (fotos === null) {
        return <p className="ca-txt ca-txt-peq" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Spinner size={14} /> Buscando la fachada en el Catastro y en Street View…</p>;
    }
    if (!fotos.length) return null;

    const alUsar = async (f) => {
        setUsando(f.id);
        const r = await usar(f.id);
        setUsando(null);
        toast(r.ok ? 'Foto de la fachada guardada.' : r.error);
    };

    return (
        <div className="ca-fachada-sug">
            <p className="ca-txt ca-txt-peq" style={{ margin: '10px 0 8px' }}>
                {fotos.length > 1 ? 'Hemos encontrado estas fotos de la fachada.' : 'Hemos encontrado esta foto de la fachada.'} Si es la casa,
                úsala; si no, haz una o súbela de la galería.
            </p>
            <div className="ca-fachada-sug-grid">
                {fotos.map(f => (
                    <figure key={f.id} className="ca-fachada-sug-item">
                        <img src={f.url} alt={`Fachada ${f.label.toLowerCase()}`} />
                        <figcaption>{f.label}</figcaption>
                        <button type="button" className="ca-btn ca-btn-pri ca-btn-peq" disabled={ocupado || !!usando} onClick={() => alUsar(f)}>
                            {usando === f.id ? <Spinner size={16} /> : <IcoCheck size={16} />} Usar esta foto
                        </button>
                    </figure>
                ))}
            </div>
        </div>
    );
}

/**
 * Un apartado: lo subido, el progreso y los botones de cámara / galería.
 * `visita`: en la vivienda (la cámara manda). `guia`: es el siguiente que falta.
 */
export function SlotFoto({ slot, ctx, visita, guia = false }) {
    const { slots, subir, reintentar, descartar, pendientes, quitar, subiendo, editable, puedeSubir, form, setCuestionario } = ctx;
    // Ya pedida: se añade, no se quita.
    const subible = editable || !!puedeSubir;
    const toast = useToast();
    const [error, setError] = useState(null);
    const ficheros = slots?.[slot.id] || [];
    const pct = subiendo?.[slot.id];
    const n = ficheros.length;
    const sinSitio = !slot.multiple && n > 0;
    // Lo que no ha podido subir (sin cobertura): guardado en el móvil (colaFotos) para «Reintentar».
    const sinSubir = pendientes?.[slot.id] || [];

    const alResultado = (r) => {
        const avisos = [];
        if (r.fallidos?.length) {
            avisos.push(`${r.error || 'No hemos podido conectar.'} ${plural(r.fallidos.length, 'archivo sin subir', 'archivos sin subir')}: no hace falta repetir${r.fallidos.length === 1 ? 'lo' : 'los'}, se ${r.fallidos.length === 1 ? 'ha' : 'han'} guardado en este móvil. Pulsa «Reintentar» cuando tengas cobertura.`);
        }
        if (r.rechazados?.length) avisos.push(r.rechazados.map(x => `${x.nombre}: ${x.motivo}`).join(' · '));
        if (!avisos.length && !r.ok) avisos.push(r.error || 'No se ha podido subir.');
        setError(avisos.length ? avisos.join(' ') : null);
        if (r.n) toast(slot.video ? 'Vídeo subido.' : `${plural(r.n, 'archivo subido', 'archivos subidos')}.`);
    };
    const alElegir = async (e) => {
        // Se copian ANTES de vaciar el input: vaciarlo vacía también su FileList.
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        setError(null);
        alResultado(await subir(slot.id, files));
    };
    const alReintentar = async () => {
        setError(null);
        alResultado(await reintentar(slot.id));
    };
    const alDescartar = () => {
        if (!window.confirm(`¿Olvidar ${sinSubir.length === 1 ? 'el archivo que no ha subido' : `los ${sinSubir.length} archivos que no han subido`}? Se borran de este móvil.`)) return;
        setError(null);
        descartar(slot.id);
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
    const puedeOmitir = slot.opcional && editable && !!setCuestionario;
    const omitir = (si) => setCuestionario(c => omitirFoto(c, slot.id, si));
    const opcional = slot.opcional && <span className="ca-chip ca-chip-gris" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Opcional</span>;

    // «Ahora no»: plegado, con la vuelta atrás a mano.
    if (puedeOmitir && n === 0 && !ocupado && fotoOmitida(form?.cuestionario, slot.id)) {
        return (
            <div className="ca-slot ca-slot-omitido" id={`slot-${slot.id}`}>
                <div className="ca-slot-top">
                    <div className="ca-ico-tile ca-tile-crema" aria-hidden="true">{ico}</div>
                    <span>
                        <b>{slot.label}{opcional}</b>
                        <small>Ahora no. No hace falta para pedir el certificado.</small>
                    </span>
                    <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" style={{ width: 'auto', flex: 'none' }} onClick={() => omitir(false)}>
                        {slot.documento ? 'Subirlo' : slot.video ? 'Subirlo' : 'Subirla'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`ca-slot${guia ? ' ca-guia' : ''}`} id={`slot-${slot.id}`}>
            <div className="ca-slot-top">
                <div className={`ca-ico-tile ${n ? 'ca-tile-verde' : guia ? 'ca-tile-naranja' : 'ca-tile-crema'}`} aria-hidden="true">{n ? <IcoCheck /> : ico}</div>
                <span>
                    <b>{slot.label}{guia && <span className="ca-chip ca-chip-naranja" style={{ marginLeft: 8, verticalAlign: 'middle' }}>Ahora</span>}{!guia && opcional}</b>
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
            {slot.id === 'FOTO_FACHADA_PRINCIPAL' && n === 0 && editable && ctx.usarFachada && ctx.obra?.id && (
                <FachadaSugerida obraId={ctx.obra.id} usar={ctx.usarFachada} ocupado={ocupado} />
            )}
            {ocupado && <div className="ca-subiendo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>}
            {error && <p className="ca-error" role="alert">{error}</p>}
            {subible && sinSubir.length > 0 && !ocupado && (
                <>
                    {!error && <p className="ca-error">{plural(sinSubir.length, 'archivo guardado en este móvil sin subir', 'archivos guardados en este móvil sin subir')}.</p>}
                    <div className="ca-btns" style={{ marginTop: 10 }}>
                        <button type="button" className="ca-btn ca-btn-pri ca-btn-peq" onClick={alReintentar}>
                            <IcoRecargar size={16} /> Reintentar ({plural(sinSubir.length, 'archivo sin subir', 'archivos sin subir')})
                        </button>
                        {descartar && (
                            <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" style={{ width: 'auto', flex: 'none' }} onClick={alDescartar}>Olvidar</button>
                        )}
                    </div>
                </>
            )}

            {subible && (
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
                    {puedeOmitir && n === 0 && (
                        <button type="button" className="ca-btn ca-btn-peq ca-btn-ahora-no" disabled={ocupado} onClick={() => omitir(true)}>
                            Ahora no
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/** «La subo ahora · Ahora no, la subo luego · Usar un equipo genérico» para un equipo sin placa. */
export function DecisionEquipo({ equipo, ctx }) {
    const { form, setDecision, setCuestionario, editable } = ctx;
    const d = form.cuestionario.fotos_decision?.[equipo] || null;
    const antiguedad = form.cuestionario.fotos_antiguedad?.[equipo] || null;
    const conAntiguedad = d === 'GENERICA' && EQUIPOS_CON_ANTIGUEDAD.includes(equipo) && !!setCuestionario;
    const setAntiguedad = (v) => setCuestionario(c => ({ ...c, fotos_antiguedad: { ...(c.fotos_antiguedad || {}), [equipo]: v } }));
    return (
        <div className="ca-decision">
            <p className="ca-peq" style={{ margin: '0 0 8px' }}>¿No puedes subir ahora {placaDe(equipo)}?</p>
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
                    {conAntiguedad
                        ? 'Se pondrá un equipo genérico con su rendimiento estimado según la antigüedad, como en CE3X. El resultado puede salir peor que con la placa.'
                        : 'Se pondrá un equipo genérico de la época. El resultado puede salir peor que con la placa; lo puedes cambiar después en CE3X.'}
                </p>
            )}
            {conAntiguedad && (
                <>
                    <p className="ca-peq" style={{ margin: '10px 0 8px' }}><b>Antigüedad del equipo</b></p>
                    <div className="ca-chips" role="radiogroup" aria-label={`Antigüedad de ${NOMBRE_EQUIPO[equipo] || equipo}`}>
                        {ANTIGUEDAD_EQUIPO.map(o => (
                            <button key={o.value} type="button" disabled={!editable} role="radio" aria-checked={antiguedad === o.value}
                                className={`ca-chipbtn${antiguedad === o.value ? ' ca-chipbtn-sel' : ''}`}
                                onClick={() => setAntiguedad(antiguedad === o.value ? null : o.value)}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                    {!antiguedad && <p className="ca-peq" style={{ marginTop: 8 }}>Si no lo sabes, déjalo así: se pondrá la de la época de la vivienda.</p>}
                </>
            )}
            {d === 'DESPUES' && <p className="ca-peq" style={{ marginTop: 8 }}>Te lo recordaremos antes de generar el certificado.</p>}
        </div>
    );
}

/** Un equipo: su foto, su placa y, si falta la placa, la decisión. */
export function BloqueEquipo({ e, ctx, visita, guiaId }) {
    const editable = ctx.editable;
    const slots = e.slots.map(id => SLOTS.find(s => s.id === id)).filter(Boolean)
        .filter(s => editable || ctx.puedeSubir || (ctx.slots?.[s.id] || []).length > 0);
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
    const [otras, setOtras] = useState(false);
    const c = form.cuestionario;
    const visita = form.en_vivienda === true;
    // Ya pedida: con `puedeSubir`, todos los apartados para añadir; si no, solo lo subido.
    const anadir = !editable && !!ctx.puedeSubir;
    const ver = soloVer && !anadir;
    const conFicheros = (s) => (slots?.[s.id] || []).length > 0;
    const todos = slotsAplicables(c);
    const aplican = todos.filter(s => !ver || conFicheros(s));
    if (ver && !aplican.length) {
        return <p className="ca-peq">{docsError ? mensajeError(docsError) : 'No se subieron fotos ni documentos.'}</p>;
    }
    const vivienda = aplican.filter(s => !s.equipo && !s.documento);
    const docs = aplican.filter(s => s.documento);
    const equipos = estadoEquipos(c, slots).filter(e => !ver || e.fotos > 0);
    // Los apartados que no aplicaban (otro equipo, los patios…): con algo subido, a la vista.
    const resto = anadir ? SLOTS.filter(s => !todos.includes(s)) : [];
    const restoCon = resto.filter(conFicheros);
    const restoSin = resto.filter(s => !conFicheros(s));
    // En la visita, el siguiente apartado que falta (fotos de la vivienda y equipos, en orden).
    const guiaId = visita && editable ? siguienteDeLaVisita(aplican, c, slots) : null;

    return (
        <div className="ca-stack">
            {docsError && (
                <Aviso tono="ambar" titulo="No hemos podido cargar las fotos">
                    {mensajeError(docsError)}{' '}
                    <button type="button" className="ca-link" onClick={recargarDocs}>Reintentar</button>
                </Aviso>
            )}
            {anadir && (
                <Aviso tono="info" icono={IcoCamara} titulo="Puedes añadir las que falten">
                    Se guardan en la carpeta de la obra, con las demás. Las que ya estaban no se quitan: el certificado se hizo con ellas.
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
                    Ve en este orden: te marcamos en naranja la siguiente foto. «Hacer foto» abre la cámara trasera: una foto cada vez; para otra, vuelve a pulsarlo.
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

            {resto.length > 0 && (
                <section>
                    <h3 className="ca-sec">Otras fotos</h3>
                    {restoCon.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={false} />)}
                    {restoSin.length > 0 && (
                        <>
                            <button type="button" className="ca-docs-mas" aria-expanded={otras} onClick={() => setOtras(v => !v)}>
                                {otras ? 'Ocultar' : `Añadir a otro apartado (${restoSin.map(s => s.label.toLowerCase()).slice(0, 3).join(', ')}${restoSin.length > 3 ? '…' : ''})`}
                            </button>
                            {otras && restoSin.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={false} />)}
                        </>
                    )}
                </section>
            )}
        </div>
    );
}

export default FotosObra;
