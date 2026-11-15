// ─── NuevaObra — /obra/nueva ────────────────────────────────────────────────
// 1. Dónde está: referencia catastral, dirección (→ mapa), o «estoy aquí» (GPS).
// 2. Se crea la obra (POST /obras) SOLO con una referencia elegida, y el servidor
//    trae el Catastro (POST /obras/:id/catastro). Edificio de varias viviendas →
//    409 PARCELA con `viviendas`: se elige la suya (DwellingPicker) y se reenvía.
//    Si algo falla tras crearla, se sigue con LA MISMA obra (sin duplicados).
// 3. Se confirman los datos (todo editable) → titular (opcional) → «¿estás en la
//    vivienda?» → la ficha.
// Catastro (reglas 15–17): el backend hace las consultas, de una en una; desde
// aquí nunca dos a la vez (los botones se bloquean mientras hay una en vuelo).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { DwellingPicker } from '../../components/DwellingPicker';
import { MapPickerModal } from '../../components/MapPickerModal';
import { GeoLocatingOverlay } from '../../components/GeoLocatingOverlay';
import { limpiarRefCatastral, refCatastralValida } from '../../utils/traerDireccionCatastral';
import { API, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { navegar } from '../router';
import { Aviso, Campo } from '../ui/piezas';
import { IcoAtras, IcoBuscar, IcoCasa, IcoFlecha, IcoGps, IcoMapa, IcoCamara, IcoImagen, Spinner } from '../ui/Iconos';
import { Opcion } from './Pregunta';
import { TITULAR_VACIO } from './comun';

const PASOS = ['buscar', 'confirmar', 'titular', 'visita'];
const INMUEBLE = ['direccion', 'codigo_postal', 'municipio', 'provincia', 'superficie_catastro', 'anio_construccion'];
const txt = (v) => (v == null ? '' : String(v));

/** Las viviendas del 409 PARCELA del servidor, con la forma que pinta DwellingPicker. */
const aPicker = (lista = []) => lista.map(v => ({
    rc: v.rc, address: v.direccion, block: v.escalera, floor: v.planta, door: v.puerta,
    use: v.uso, surface: v.superficie, yearBuilt: v.anio,
    isResidential: v.vivienda === true ? true : v.vivienda === false && v.uso ? false : null,
}));

function Portal({ children }) {
    return createPortal(children, document.body);
}

export default function NuevaObra() {
    const { cuenta } = useCertappAuth();
    const [paso, setPaso] = useState('buscar');
    const [modo, setModo] = useState('rc');
    const [rcTxt, setRcTxt] = useState('');
    const [dirTxt, setDirTxt] = useState('');
    const [sugerencias, setSugerencias] = useState([]);
    const [verSug, setVerSug] = useState(false);
    const [mapa, setMapa] = useState(null);          // { lat, lng }
    const [geo, setGeo] = useState(null);            // 'gps' | 'catastro'
    const [viviendas, setViviendas] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [obra, setObra] = useState(null);
    const [inm, setInm] = useState({});
    const [titular, setTitular] = useState(TITULAR_VACIO);
    const [manual, setManual] = useState(false);
    const obraIdRef = useRef(null);
    const ultimaPos = useRef(null);

    // Sugerencias de dirección (Google Places por el backend), con freno.
    useEffect(() => {
        if (modo !== 'dir' || dirTxt.trim().length < 3) { setSugerencias([]); return undefined; }
        let vivo = true;
        const t = setTimeout(async () => {
            try {
                const { data } = await axios.get('/api/catastro/autocomplete', { params: { input: dirTxt.trim() } });
                if (vivo) { setSugerencias(Array.isArray(data) ? data.slice(0, 6) : []); setVerSug(true); }
            } catch { if (vivo) setSugerencias([]); }
        }, 350);
        return () => { vivo = false; clearTimeout(t); };
    }, [dirTxt, modo]);

    const irPaso = (p) => { setError(null); setPaso(p); window.scrollTo({ top: 0, behavior: 'auto' }); };

    // ── Crear la obra con una referencia y traer el Catastro ────────────────
    const conReferencia = async (rcEntrada) => {
        const rc = limpiarRefCatastral(rcEntrada);
        if (!refCatastralValida(rc)) { setError('La referencia catastral tiene 20 caracteres (o 14 la de la parcela).'); return; }
        setOcupado(true); setError(null); setManual(false);
        try {
            let id = obraIdRef.current;
            if (!id) {
                const { data } = await axios.post(`${API}/obras`, { ref_catastral: rc });
                id = data?.obra?.id;
                if (!id) throw new Error('No ha llegado la obra creada.');
                obraIdRef.current = id;
                setObra(data.obra);
            }
            await traerCatastro(id, rc);
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido crear la obra.'));
        } finally {
            setOcupado(false);
        }
    };

    const traerCatastro = async (id, rc) => {
        setGeo('catastro');
        try {
            const { data } = await axios.post(`${API}/obras/${id}/catastro`, { rc });
            setViviendas(null);
            alConfirmar(data?.obra);
        } catch (err) {
            const st = err.response?.status;
            const d = err.response?.data || {};
            if (st === 409 && d.code === 'PARCELA' && Array.isArray(d.viviendas) && d.viviendas.length) {
                setViviendas({ lista: aPicker(d.viviendas), parcela: d.parcela || null });
                irPaso('buscar');
                return;
            }
            if (st === 503 || st === 429) {
                // El Catastro no deja: se sigue a mano con la referencia ya guardada.
                setManual(true);
                setError(mensajeError(err));
                return;
            }
            setError(mensajeError(err, 'No se han podido traer los datos del Catastro.'));
        } finally {
            setGeo(null);
        }
    };

    const alConfirmar = (o) => {
        if (o) setObra(o);
        const base = o || obra || {};
        setInm(Object.fromEntries(INMUEBLE.map(k => [k, txt(base[k])])));
        irPaso('confirmar');
    };

    const elegirVivienda = async (v) => {
        if (!v?.rc || ocupado) return;
        setOcupado(true);
        try {
            if (obraIdRef.current) await traerCatastro(obraIdRef.current, v.rc);
            else await conReferencia(v.rc);
        } finally { setOcupado(false); }
    };

    // ── Ubicación: GPS, dirección → mapa ─────────────────────────────────────
    const conDatosDeUbicacion = (data) => {
        const lista = data?.isParcela ? (data.dwellings || []) : [];
        if (lista.length > 1) {
            const orden = [...lista].sort((a, b) => Number(b.isResidential === true) - Number(a.isResidential === true));
            setViviendas({ lista: orden, parcela: { rc: data.rc, direccion: data.address } });
            return;
        }
        const rc = lista.length === 1 ? lista[0].rc : data?.rc;
        if (!rc) { setError('No hemos encontrado la referencia de ese inmueble. Escríbela.'); return; }
        conReferencia(rc);
    };

    const usarUbicacion = () => {
        setError(null); setViviendas(null);
        if (!navigator.geolocation) { setError('Este navegador no permite usar la ubicación. Escribe la referencia o la dirección.'); return; }
        setGeo('gps');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            ultimaPos.current = p;
            setGeo('catastro');
            try {
                const { data } = await axios.post('/api/catastro/reverse-geocode', { ...p, source: 'gps' });
                setGeo(null);
                conDatosDeUbicacion(data);
            } catch (err) {
                setGeo(null);
                const st = err.response?.status;
                setError(st === 404 ? 'No hay ningún inmueble justo en tu ubicación. Afina en el mapa o escribe la dirección.'
                    : st === 503 ? 'El Catastro está saturado. Prueba en unos minutos o escribe la referencia.'
                        : 'No hemos podido identificar el inmueble por tu ubicación.');
            }
        }, (err) => {
            setGeo(null);
            setError(err.code === 1
                ? 'No has dado permiso para usar la ubicación. Actívalo en el navegador o escribe la dirección.'
                : 'No hemos podido obtener tu ubicación. Comprueba el GPS o escribe la dirección.');
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };

    const elegirSugerencia = async (s) => {
        setVerSug(false); setDirTxt(s.description || dirTxt); setError(null);
        setOcupado(true);
        try {
            const { data } = await axios.get('/api/catastro/place-details', { params: { place_id: s.place_id } });
            if (!(data?.lat && data?.lng)) throw new Error('sin coordenadas');
            ultimaPos.current = { lat: data.lat, lng: data.lng };
            setMapa({ lat: data.lat, lng: data.lng });
        } catch {
            setError('No hemos podido situar esa dirección. Prueba con la referencia catastral.');
        } finally { setOcupado(false); }
    };

    // ── Guardar lo confirmado, el titular y la visita ───────────────────────
    const guardar = async (patch, siguiente) => {
        const id = obraIdRef.current;
        if (!id) return;
        setOcupado(true); setError(null);
        try {
            if (patch && Object.keys(patch).length) {
                const { data } = await axios.put(`${API}/obras/${id}`, patch);
                if (data?.obra) setObra(data.obra);
            }
            siguiente();
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido guardar.'));
        } finally { setOcupado(false); }
    };
    const confirmarInmueble = (e) => {
        e?.preventDefault();
        if (!inm.direccion?.trim() || !inm.municipio?.trim()) { setError('Pon al menos la dirección y el municipio.'); return; }
        const patch = {};
        for (const k of INMUEBLE) if (txt(obra?.[k]) !== inm[k]) patch[k] = inm[k] === '' ? null : inm[k];
        if ('superficie_catastro' in patch && patch.superficie_catastro != null) patch.superficie_catastro = Number(String(patch.superficie_catastro).replace(',', '.')) || null;
        guardar(patch, () => irPaso('titular'));
    };
    const confirmarTitular = (e) => {
        e?.preventDefault();
        const t = Object.fromEntries(Object.entries(titular).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));
        guardar(Object.keys(t).length ? { titular: t } : null, () => irPaso('visita'));
    };
    const elegirVisita = (enVivienda) => {
        guardar({ en_vivienda: enVivienda }, () => navegar(`/obra/${obraIdRef.current}`, { replace: true }));
    };

    // ── Render ───────────────────────────────────────────────────────────────
    const n = PASOS.indexOf(paso) + 1;
    const cabecera = (
        <div className="ca-q-top" style={{ marginBottom: 14 }}>
            <button type="button" className="ca-icobtn" aria-label="Atrás"
                onClick={() => (n > 1 ? irPaso(PASOS[n - 2]) : navegar('/panel'))}><IcoAtras /></button>
            <div style={{ flex: 1 }}>
                <p className="ca-eyebrow" style={{ margin: 0 }}>Nueva obra · paso {n} de {PASOS.length}</p>
                <div className="ca-barra" style={{ marginTop: 6 }}><i style={{ width: `${Math.round(100 * n / PASOS.length)}%` }} /></div>
            </div>
        </div>
    );
    const sinCreditos = cuenta && Number(cuenta.creditos || 0) <= 0;

    let cuerpo;
    if (paso === 'buscar') {
        cuerpo = (
            <>
                <section className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <h1 className="ca-display ca-h2">¿Dónde está la <span className="ca-mark">vivienda</span>?</h1>
                    <p className="ca-txt">Con la referencia catastral traemos del Catastro la dirección, la superficie y el año.</p>

                    {!viviendas && (
                        <>
                            <div className="ca-tabs" role="tablist" style={{ marginTop: 16 }}>
                                <button type="button" role="tab" aria-selected={modo === 'rc'} className={`ca-tab${modo === 'rc' ? ' ca-tab-act' : ''}`} onClick={() => { setModo('rc'); setError(null); }}>Referencia catastral</button>
                                <button type="button" role="tab" aria-selected={modo === 'dir'} className={`ca-tab${modo === 'dir' ? ' ca-tab-act' : ''}`} onClick={() => { setModo('dir'); setError(null); }}>Dirección</button>
                            </div>

                            {modo === 'rc' ? (
                                <form onSubmit={(e) => { e.preventDefault(); conReferencia(rcTxt); }} style={{ marginTop: 14 }}>
                                    <Campo etiqueta="Referencia catastral" ayuda="20 caracteres. Está en el recibo del IBI o en la escritura.">
                                        <input className="ca-input ca-input-mayus ca-mono" value={rcTxt} maxLength={26} autoComplete="off" spellCheck={false}
                                            autoCapitalize="characters" autoCorrect="off"
                                            placeholder="1234567AB1234C0001XY" onChange={e => setRcTxt(e.target.value.toUpperCase())} />
                                    </Campo>
                                    <div className="ca-btns">
                                        <button type="submit" className="ca-btn ca-btn-pri" disabled={ocupado || !rcTxt.trim()}>
                                            {ocupado ? <><Spinner /> Buscando…</> : <><IcoBuscar /> Buscar en el Catastro</>}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div style={{ marginTop: 14, position: 'relative' }}>
                                    <Campo etiqueta="Dirección" ayuda="Elige la dirección y marca el edificio en el mapa.">
                                        <input className="ca-input" value={dirTxt} autoComplete="off" placeholder="Calle, número y municipio"
                                            onChange={e => setDirTxt(e.target.value)} onFocus={() => sugerencias.length && setVerSug(true)} />
                                    </Campo>
                                    {verSug && sugerencias.length > 0 && (
                                        <ul className="ca-sugerencias" role="listbox">
                                            {sugerencias.map(s => (
                                                <li key={s.place_id}>
                                                    <button type="button" onClick={() => elegirSugerencia(s)} disabled={ocupado}>{s.description}</button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {ocupado && <p className="ca-peq"><Spinner size={14} /> Situando la dirección…</p>}
                                </div>
                            )}
                        </>
                    )}

                    {viviendas && (
                        <div style={{ marginTop: 10 }}>
                            <Aviso tono="ambar" titulo="Es un edificio con varias viviendas">
                                Elige la del certificado: elegir otra sería certificar la del vecino.
                                {viviendas.parcela?.direccion && <div className="ca-peq" style={{ marginTop: 4 }}>{viviendas.parcela.direccion}</div>}
                            </Aviso>
                            <DwellingPicker dwellings={viviendas.lista} onSelect={elegirVivienda} loading={ocupado} compact />
                            <button type="button" className="ca-link ca-link-gris" style={{ marginTop: 12 }} onClick={() => setViviendas(null)}>Buscar otra</button>
                        </div>
                    )}

                    {error && <p className="ca-error" role="alert">{error}</p>}
                    {manual && obraIdRef.current && (
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={() => alConfirmar(null)}>Seguir y rellenarlo a mano</button>
                        </div>
                    )}
                </section>

                {!viviendas && (
                    <section className="ca-card ca-pad ca-in-2" style={{ marginTop: 12 }}>
                        <div className="ca-fila-top" style={{ justifyContent: 'flex-start' }}>
                            <div className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoGps /></div>
                            <div>
                                <h2 className="ca-display ca-h3" style={{ margin: 0 }}>¿Estás en la vivienda?</h2>
                                <p className="ca-peq" style={{ margin: '2px 0 0' }}>La sacamos de tu ubicación.</p>
                            </div>
                        </div>
                        <div className="ca-btns ca-btns-2">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={usarUbicacion} disabled={ocupado || !!geo}><IcoGps /> Usar mi ubicación</button>
                            <button type="button" className="ca-btn ca-btn-sec" disabled={ocupado || !!geo}
                                onClick={() => setMapa(ultimaPos.current || { lat: 40.4168, lng: -3.7038 })}><IcoMapa /> Elegir en el mapa</button>
                        </div>
                    </section>
                )}
                {sinCreditos && (
                    <Aviso tono="ambar" titulo="No te quedan certificados" className="ca-in-3">
                        Puedes preparar la obra; para generar el certificado necesitarás más. Escríbenos y te damos.
                    </Aviso>
                )}
            </>
        );
    } else if (paso === 'confirmar') {
        const campo = (k, etiqueta, extra = {}) => (
            <Campo etiqueta={etiqueta} sufijo={extra.sufijo} ayuda={extra.ayuda}>
                <input className="ca-input" value={inm[k] ?? ''} inputMode={extra.inputMode} autoComplete="off" maxLength={extra.max || 200}
                    onChange={e => setInm(s => ({ ...s, [k]: extra.limpiar ? extra.limpiar(e.target.value) : e.target.value }))} />
            </Campo>
        );
        cuerpo = (
            <form className="ca-card ca-pad ca-in" onSubmit={confirmarInmueble} noValidate>
                <div className="ca-filete" />
                <p className="ca-eyebrow ca-eyebrow-verde">{manual ? 'Sin respuesta del Catastro' : 'Lo que dice el Catastro'}</p>
                <h1 className="ca-display ca-h2" style={{ marginTop: 6 }}>¿Es <span className="ca-mark">esta</span>?</h1>
                <dl className="ca-dl ca-crema" style={{ padding: '6px 14px', borderRadius: 16, margin: '14px 0 16px' }}>
                    <div><dt>Referencia</dt><dd className="ca-mono">{obra?.ref_catastral || '—'}</dd></div>
                    <div><dt>Expediente</dt><dd>{obra?.numero_expediente || '—'}</dd></div>
                    {obra?.zona_climatica && <div><dt>Zona climática</dt><dd>{obra.zona_climatica}</dd></div>}
                    {obra?.uso && <div><dt>Uso</dt><dd>{obra.uso}</dd></div>}
                </dl>
                {campo('direccion', 'Dirección', { ayuda: 'Añade el piso y la puerta si faltan.' })}
                <div className="ca-grid2">
                    {campo('codigo_postal', 'Código postal', { inputMode: 'numeric', max: 5, limpiar: s => s.replace(/\D/g, '').slice(0, 5) })}
                    {campo('municipio', 'Municipio', { max: 80 })}
                </div>
                {campo('provincia', 'Provincia', { max: 60 })}
                <div className="ca-grid2">
                    {campo('superficie_catastro', 'Superficie', { sufijo: 'm²', inputMode: 'decimal', limpiar: s => s.replace(/[^\d.,]/g, '').slice(0, 9) })}
                    {campo('anio_construccion', 'Año', { inputMode: 'numeric', limpiar: s => s.replace(/\D/g, '').slice(0, 4) })}
                </div>
                {error && <p className="ca-error" role="alert">{error}</p>}
                <div className="ca-btns">
                    <button type="submit" className="ca-btn ca-btn-pri" disabled={ocupado}>{ocupado ? <Spinner /> : <>Es correcto <IcoFlecha /></>}</button>
                </div>
            </form>
        );
    } else if (paso === 'titular') {
        const campo = (k, etiqueta, extra = {}) => (
            <Campo etiqueta={etiqueta} opcional={extra.opcional}>
                <input className={`ca-input${extra.mayus ? ' ca-input-mayus' : ''}`} value={titular[k] ?? ''} type={extra.type || 'text'}
                    inputMode={extra.inputMode} autoComplete="off" maxLength={extra.max || 160}
                    onChange={e => setTitular(t => ({ ...t, [k]: extra.mayus ? e.target.value.toUpperCase() : e.target.value }))} />
            </Campo>
        );
        cuerpo = (
            <form className="ca-card ca-pad ca-in" onSubmit={confirmarTitular} noValidate>
                <div className="ca-filete" />
                <h1 className="ca-display ca-h2">¿Quién es el <span className="ca-mark">titular</span>?</h1>
                <p className="ca-txt">El nombre hace falta para pedir el certificado; lo demás, para registrarlo. Lo puedes poner después.</p>
                <div style={{ marginTop: 14 }}>
                    <div className="ca-grid2">{campo('nombre', 'Nombre', { max: 120 })}{campo('apellidos', 'Apellidos')}</div>
                    {campo('nif', 'NIF o NIE', { mayus: true, max: 20, opcional: true })}
                    <div className="ca-grid2">
                        {campo('telefono', 'Teléfono', { type: 'tel', inputMode: 'tel', max: 30, opcional: true })}
                        {campo('email', 'Email', { type: 'email', inputMode: 'email', opcional: true })}
                    </div>
                </div>
                {error && <p className="ca-error" role="alert">{error}</p>}
                <div className="ca-btns">
                    <button type="submit" className="ca-btn ca-btn-pri" disabled={ocupado}>{ocupado ? <Spinner /> : <>Seguir <IcoFlecha /></>}</button>
                    <button type="button" className="ca-link ca-link-gris" onClick={() => irPaso('visita')}>Lo pongo después</button>
                </div>
            </form>
        );
    } else {
        cuerpo = (
            <section className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <h1 className="ca-display ca-h2">¿Estás ahora en la <span className="ca-mark">vivienda</span>?</h1>
                <p className="ca-txt">Las preguntas son las mismas; cambia cómo se hacen las fotos.</p>
                <div className="ca-opts" style={{ marginTop: 16 }}>
                    <Opcion label="Sí, estoy en la vivienda" sub="Te guiamos foto a foto con la cámara del móvil." disabled={ocupado}
                        sel={false} onClick={() => elegirVisita(true)} extra={<span className="ca-opt-ico"><IcoCamara size={26} /></span>} />
                    <Opcion label="No, lo hago con fotos" sub="Subes las que tengas o se las pides al propietario con un enlace." disabled={ocupado}
                        sel={false} onClick={() => elegirVisita(false)} extra={<span className="ca-opt-ico"><IcoImagen size={26} /></span>} />
                </div>
                {error && <p className="ca-error" role="alert">{error}</p>}
                {ocupado && <p className="ca-peq" style={{ marginTop: 10 }}><Spinner size={14} /> Abriendo la obra…</p>}
            </section>
        );
    }

    return (
        <div className="ca-col">
            {cabecera}
            {cuerpo}
            <p className="ca-peq" style={{ textAlign: 'center', marginTop: 16 }}>
                <IcoCasa size={14} /> {obra?.numero_expediente ? `Obra ${obra.numero_expediente} creada: la tienes en «Mis obras».` : 'La obra se crea al elegir la vivienda.'}
            </p>
            {geo && <Portal><GeoLocatingOverlay stage={geo} /></Portal>}
            {mapa && (
                <Portal>
                    <MapPickerModal initialLat={mapa.lat} initialLng={mapa.lng}
                        onCancel={() => setMapa(null)}
                        onConfirm={(data) => { setMapa(null); conDatosDeUbicacion(data); }} />
                </Portal>
            )}
        </div>
    );
}
