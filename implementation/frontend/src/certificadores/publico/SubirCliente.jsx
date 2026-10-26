// ─── SubirCliente — /subir/:id?token= : el PROPIETARIO sube las fotos ───────
// Lo abre el cliente del certificador desde el enlace que este le mandó por SU
// WhatsApp. Sin cuenta: el `portal_token` de la obra es la llave.
// El enlace que se manda es el CORTO, /s/<token> (`codigo`): primero
//   GET  /api/public/certapp/s/:codigo               → { id }
// y se sigue en /subir/:id?token= (replace), con los mismos errores.
//   GET  /api/public/certapp/subir/:id?token=        → { obra, apartados }
//   POST /api/public/certapp/subir/:id/:slot?token=  (multipart `files`)
//        → { ok, subidos, rechazados, errores, obra, apartados }
// 404 = enlace no válido · 409 OBRA_CERRADA = el certificado ya está hecho ·
// 410 ENLACE_CADUCADO = el enlace ha caducado: que pida otro. Un apartado de un
// solo archivo que ya subió su técnico llega `cubierto`: hecho y sin botones.
// Mobile first: el 90 % lo abre con el móvil. No se borra nada desde aquí.
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_PUB, errorDe, mensajeError } from '../api';
import { Enlace, navegar } from '../router';
import { Aviso, CabeceraPublica, ErrorRed, Esqueleto, Papel, useToast } from '../ui/piezas';
import { CheckDibujado, IcoCamara, IcoCheck, IcoDoc, IcoImagen, IcoVideo, Spinner } from '../ui/Iconos';
import { aceptaDe, reducirTodas } from '../obra/comun';

function Apartado({ a, onSubir, pct, guia, cerrada }) {
    const [error, setError] = useState(null);
    const n = a.ficheros?.length || 0;
    const cubierto = !!a.cubierto && n === 0;
    const ocupado = pct != null;
    const acepta = aceptaDe(a);
    const alElegir = async (e) => {
        const files = e.target.files;
        if (!files?.length) return;
        setError(null);
        const r = await onSubir(a, files);
        e.target.value = '';
        if (!r.ok) setError(r.error);
        else if (r.rechazados?.length) setError(r.rechazados.map(x => `${x.nombre}: ${x.motivo}`).join(' · '));
    };
    return (
        <div className={`ca-slot${guia ? ' ca-guia' : ''}`}>
            <div className="ca-slot-top">
                <div className={`ca-ico-tile ${n || cubierto ? 'ca-tile-verde' : guia ? 'ca-tile-naranja' : 'ca-tile-crema'}`} aria-hidden="true">
                    {n || cubierto ? <IcoCheck /> : a.video ? <IcoVideo /> : a.documento ? <IcoDoc /> : <IcoCamara />}
                </div>
                <span><b>{a.label}</b>{cubierto ? <small>Ya lo tiene tu técnico: no hace falta.</small> : a.ayuda && <small>{a.ayuda}</small>}</span>
                <span className={`ca-cuenta${n ? '' : ' ca-cuenta-0'}`}>{n ? `${n} ✓` : ''}</span>
            </div>
            {n > 0 && (
                <div className="ca-thumbs">
                    {a.ficheros.map(f => (
                        <div key={f.driveId} className="ca-thumb" title={f.nombre || ''}>
                            {f.thumb ? <img src={f.thumb} alt={f.nombre || 'Foto subida'} loading="lazy" /> : <IcoDoc />}
                        </div>
                    ))}
                </div>
            )}
            {ocupado && <div className="ca-subiendo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>}
            {error && <p className="ca-error" role="alert">{error}</p>}
            {!cerrada && !cubierto && (
                <div className={`ca-btns${a.documento ? '' : ' ca-btns-2'}`} style={{ marginTop: 12 }}>
                    {!a.documento && (
                        <label className={`ca-btn ca-btn-peq ${guia ? 'ca-btn-pri' : 'ca-btn-sec'}${ocupado ? ' ca-btn-off' : ''}`} htmlFor={`c-${a.id}`}>
                            {ocupado ? <Spinner size={16} /> : a.video ? <IcoVideo size={18} /> : <IcoCamara size={18} />}
                            {a.video ? 'Grabar' : n && !a.multiple ? 'Repetir' : 'Hacer foto'}
                            <input id={`c-${a.id}`} className="ca-input-fichero" type="file" accept={acepta} capture="environment"
                                multiple={!!a.multiple} onChange={alElegir} disabled={ocupado} />
                        </label>
                    )}
                    <label className={`ca-btn ca-btn-peq ca-btn-sec${ocupado ? ' ca-btn-off' : ''}`} htmlFor={`g-${a.id}`}>
                        {a.documento ? <IcoDoc size={18} /> : <IcoImagen size={18} />}
                        {a.documento ? 'Subir archivo' : a.video ? 'Elegir vídeo' : 'De la galería'}
                        <input id={`g-${a.id}`} className="ca-input-fichero" type="file" accept={acepta}
                            multiple={!!a.multiple} onChange={alElegir} disabled={ocupado} />
                    </label>
                </div>
            )}
        </div>
    );
}

const esCaducado = (err) => err?.response?.status === 410 || errorDe(err).code === 'ENLACE_CADUCADO';

export default function SubirCliente({ id, token, codigo = null }) {
    const toast = useToast();
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [subiendo, setSubiendo] = useState({});
    const [caducado, setCaducado] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        let sigue = false;
        try {
            if (codigo) {
                const { data } = await axios.get(`${API_PUB}/s/${encodeURIComponent(codigo)}`);
                sigue = true;
                navegar(`/subir/${encodeURIComponent(data.id)}?token=${encodeURIComponent(codigo)}`, { replace: true });
                return;
            }
            const { data } = await axios.get(`${API_PUB}/subir/${encodeURIComponent(id)}`, { params: { token } });
            setDatos(data);
        } catch (err) {
            setError(err);
            if (esCaducado(err)) setCaducado(true);
        } finally { if (!sigue) setCargando(false); }
    }, [id, token, codigo]);
    useEffect(() => { cargar(); }, [cargar]);

    const subir = async (a, fileList) => {
        const files = Array.from(fileList || []);
        setSubiendo(s => ({ ...s, [a.id]: 1 }));
        try {
            const listos = a.video || a.documento ? files : await reducirTodas(files);
            const fd = new FormData();
            listos.forEach(f => fd.append('files', f));
            const { data } = await axios.post(`${API_PUB}/subir/${encodeURIComponent(id)}/${a.id}`, fd, {
                params: { token },
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => { if (e.total) setSubiendo(s => ({ ...s, [a.id]: Math.max(1, Math.round(95 * e.loaded / e.total)) })); },
            });
            if (data?.apartados) setDatos(d => ({ ...d, ...data }));
            const n = Number(data?.subidos) || 0;
            if (n) toast(n === 1 ? 'Subida. ¡Gracias!' : `${n} archivos subidos. ¡Gracias!`);
            const rechazados = [...(data?.rechazados || []), ...(data?.errores || []).map(e => ({ nombre: e.nombre, motivo: e.error }))];
            return { ok: n > 0 || !rechazados.length, rechazados };
        } catch (err) {
            if (esCaducado(err)) { setCaducado(true); return { ok: false, error: 'Este enlace ha caducado.' }; }
            if (err.response?.status === 409) setDatos(d => ({ ...d, obra: { ...(d?.obra || {}), cerrada: true } }));
            return { ok: false, error: mensajeError(err, 'No se ha podido subir. Vuelve a intentarlo.') };
        } finally {
            setSubiendo(s => { const c = { ...s }; delete c[a.id]; return c; });
        }
    };

    const obra = datos?.obra || {};
    const apartados = datos?.apartados || [];
    const fotos = apartados.filter(a => !a.documento);
    const hechos = fotos.filter(a => a.ficheros?.length).length;
    const guiaId = fotos.find(a => !a.video && !a.ficheros?.length)?.id;
    const nombre = String(obra.titular || '').split(' ')[0];
    const enlaceRoto = error && [404, 400, 403].includes(error.response?.status);

    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica enlace={null} />
                {cargando && !datos ? (
                    <Esqueleto alto={200} n={3} />
                ) : caducado ? (
                    <section className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <h1 className="ca-display ca-h2">Este enlace ha <span className="ca-mark">caducado</span></h1>
                        <p className="ca-txt">
                            Por seguridad, los enlaces para subir fotos duran un tiempo. Pídele a tu técnico que te mande uno nuevo:
                            lo que ya subiste no se pierde.
                        </p>
                    </section>
                ) : enlaceRoto ? (
                    <section className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <h1 className="ca-display ca-h2">Este enlace no <span className="ca-mark">funciona</span></h1>
                        <p className="ca-txt">Puede que esté mal copiado o que ya no sea válido. Pídele a tu técnico que te lo vuelva a mandar.</p>
                    </section>
                ) : error && !datos ? (
                    <ErrorRed error={error} onReintentar={cargar} titulo="No hemos podido abrir la página" />
                ) : (
                    <>
                        <section className="ca-card ca-pad ca-in">
                            <div className="ca-filete" />
                            <p className="ca-eyebrow">Certificado energético{obra.numero_expediente ? ` · ${obra.numero_expediente}` : ''}</p>
                            <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>
                                {nombre ? <>Hola, <span className="ca-mark">{nombre}</span></> : <>Unas <span className="ca-mark">fotos</span> de tu vivienda</>}
                            </h1>
                            <p className="ca-txt">
                                Tu técnico necesita unas fotos para preparar el certificado energético
                                {obra.direccion ? <> de <b>{[obra.direccion, obra.municipio].filter(Boolean).join(', ')}</b></> : ''}.
                                Se hacen con el móvil en unos minutos y no hace falta registrarse.
                            </p>
                            {!obra.cerrada && fotos.length > 0 && (
                                <>
                                    <div className="ca-avance" style={{ marginTop: 16 }}><b>{hechos}</b><span>de {fotos.length} apartados con fotos</span></div>
                                    <div className="ca-barra" style={{ marginTop: 8 }}><i style={{ width: `${Math.round(100 * hechos / Math.max(1, fotos.length))}%` }} /></div>
                                </>
                            )}
                        </section>

                        {obra.cerrada ? (
                            <section className="ca-card ca-pad ca-in-2" style={{ marginTop: 12 }}>
                                <CheckDibujado />
                                <h2 className="ca-display ca-h3" style={{ marginTop: 12 }}>Ya no hacen falta más fotos</h2>
                                <p className="ca-txt">El certificado ya está hecho. Gracias por tu ayuda.</p>
                            </section>
                        ) : (
                            <>
                                <Aviso tono="info" icono={IcoCamara} titulo="Cómo hacerlas" className="ca-in-2">
                                    De día, desde la calle o el patio, que se vean las ventanas enteras. Las de las placas de los aparatos, de cerca y que se lea.
                                </Aviso>
                                <div style={{ marginTop: 14 }}>
                                    {apartados.map(a => (
                                        <Apartado key={a.id} a={a} onSubir={subir} pct={subiendo[a.id]} guia={guiaId === a.id} cerrada={obra.cerrada} />
                                    ))}
                                </div>
                                {hechos > 0 && hechos >= fotos.filter(a => !a.video).length && (
                                    <Aviso tono="ok" titulo="¡Listo!" className="ca-in">Ya tiene tu técnico lo que necesita. Puedes cerrar esta página.</Aviso>
                                )}
                            </>
                        )}
                    </>
                )}
                <p className="ca-pie" style={{ marginTop: 24 }}>
                    Las fotos solo las ve tu técnico y el equipo que prepara el certificado. <Enlace to="/privacidad">Privacidad</Enlace>
                </p>
            </div>
        </Papel>
    );
}
