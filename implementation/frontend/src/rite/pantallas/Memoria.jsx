// ─── Memoria.jsx — una memoria RITE, por pasos ──────────────────────────────
// Regla 245. Vivienda (Catastro) → Titular → Instalación (equipo del catálogo,
// emisor, ACS, frío y fechas) → Estancias (rápido o con radiadores) → Revisar
// (lo que falta, los avisos y la tabla de cargas TAL COMO SALDRÁ, del servidor)
// → Generar → Documentos.
//
// Se guarda sola (PUT con los datos enteros, que el backend limpia con su lista
// blanca) a los 900 ms de dejar de escribir, y SIEMPRE antes de revisar o generar.
// Lo que bloquea lo decide el servidor (`validateMemoriaRite`, la misma del CRM):
// aquí no se repite ninguna regla de la memoria.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { API, axios, errorDe, fecha, mensajeError, useCarga } from '../api';
import { navegar } from '../../certificadores/router';
import { Aviso, Campo, ErrorRed, Esqueleto, useToast } from '../../certificadores/ui/piezas';
import { IcoAtras, IcoBuscar, IcoCheck, IcoEnviar, IcoFlecha, IcoRecargar, IcoUbicacion, Spinner } from '../../certificadores/ui/Iconos';
import { useRiteAuth } from '../auth/RiteAuth';
import { PROVINCIAS_CLM } from '../marca';
import { Marco } from '../ui/Marco';
import Estancias, { esRadiadores } from './Estancias';
import Documentos from './Documentos';
import { ESTADOS } from './Panel';

const PASOS = [
    { id: 'vivienda', t: 'Vivienda' },
    { id: 'titular', t: 'Titular' },
    { id: 'instalacion', t: 'Instalación' },
    { id: 'estancias', t: 'Estancias' },
    { id: 'revisar', t: 'Revisar' },
    { id: 'documentos', t: 'Documentos' },
];
const EMISORES = [
    ['radiadores_convencionales', 'Radiadores', 'Agua caliente a radiadores'],
    ['suelo_radiante', 'Suelo radiante', 'También suelo refrescante'],
    ['splits', 'Splits', 'Aire-aire por estancia'],
    ['conductos', 'Conductos', 'Aire por conductos'],
];
const SITUADO = ['CUBIERTA', 'FACHADA', 'SUELO'];

/**
 * De dónde se lee y adónde se guarda la memoria. La MISMA pantalla sirve a tres:
 *   cuenta — el instalador con su cuenta (/api/riteapp)
 *   admin  — el equipo de BROKERGY (/api/riteapp-admin), sin créditos
 *   enlace — el instalador con el enlace, sin cuenta (/api/public/riteapp/:token);
 *            «Generar» es «Enviar a BROKERGY».
 */
export function fuenteDe(tipo, clave) {
    const k = encodeURIComponent(clave);
    if (tipo === 'enlace') {
        const base = `/api/public/riteapp/${k}`;
        return { tipo, base, guardar: base, generar: `${base}/enviar`, catastro: (rc) => `${base}/catastro/${encodeURIComponent(rc)}`, equipos: `${base}/equipos` };
    }
    if (tipo === 'admin') {
        const base = `/api/riteapp-admin/memorias/${k}`;
        return { tipo, base, guardar: `${base}/datos`, generar: `${base}/generar`, catastro: (rc) => `/api/riteapp-admin/catastro/${encodeURIComponent(rc)}`, equipos: '/api/riteapp-admin/equipos' };
    }
    const base = `${API}/memorias/${k}`;
    return { tipo: 'cuenta', base, guardar: base, generar: `${base}/generar`, catastro: (rc) => `${API}/catastro/${encodeURIComponent(rc)}`, equipos: `${API}/equipos` };
}
const FuenteCtx = createContext(null);
const useFuente = () => useContext(FuenteCtx);

function conDefectos(d = {}) {
    return {
        titular: { es_empresa: false, misma_direccion: true, ...(d.titular || {}) },
        vivienda: { plantas: 1, ...(d.vivienda || {}) },
        instalacion: { tipo_emisor: 'radiadores_convencionales', ...(d.instalacion || {}), aerotermia_cal: { ...(d.instalacion?.aerotermia_cal || {}) } },
        fechas: { ...(d.fechas || {}) },
        estancias: { modo: 'rapido', w_elemento: 100, plantas: [], ...(d.estancias || {}) },
    };
}
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

function Txt({ valor, onCambio, etiqueta, opcional, mayus, id, ayuda, sufijo, ...resto }) {
    return (
        <Campo etiqueta={etiqueta} opcional={opcional} id={id} ayuda={ayuda} sufijo={sufijo}>
            <input id={id} className={`ca-input${mayus ? ' ca-input-mayus' : ''}`} value={valor ?? ''} onChange={e => onCambio(e.target.value)} {...resto} />
        </Campo>
    );
}

/* ── 1 · Vivienda ─────────────────────────────────────────────────────────── */
function PasoVivienda({ v, set }) {
    const fuente = useFuente();
    const [rc, setRc] = useState(v.ref_catastral || '');
    const [estado, setEstado] = useState({ trayendo: false, error: null });
    const traer = async () => {
        setEstado({ trayendo: true, error: null });
        try {
            const { data } = await axios.get(fuente.catastro(rc.trim()));
            const viv = data?.vivienda || {};
            set({ ...v, ...Object.fromEntries(Object.entries(viv).filter(([, x]) => x !== null && x !== '')) });
            setRc(viv.ref_catastral || rc);
            setEstado({ trayendo: false, error: null });
        } catch (err) {
            setEstado({ trayendo: false, error: mensajeError(err, 'No hemos podido traer los datos del Catastro.') });
        }
    };
    const fueraClm = v.provincia && !PROVINCIAS_CLM.includes(sinTildes(v.provincia));
    const campo = (k) => (x) => set({ ...v, [k]: x });
    return (
        <>
            <Campo etiqueta="Referencia catastral de la vivienda" id="rt-rc" ayuda="Los 20 caracteres de la vivienda (no la del edificio).">
                <input id="rt-rc" className="ca-input ca-input-mayus ca-mono" value={rc} maxLength={24} autoCapitalize="characters"
                    onChange={e => { setRc(e.target.value); set({ ...v, ref_catastral: e.target.value }); }} placeholder="1234567VK1213S0001AB" />
            </Campo>
            <div className="ca-btns">
                <button type="button" className="ca-btn ca-btn-pri" onClick={traer} disabled={estado.trayendo || rc.replace(/[^A-Za-z0-9]/g, '').length < 14}>
                    {estado.trayendo ? <Spinner /> : <IcoBuscar size={18} />} Traer datos del Catastro
                </button>
            </div>
            {estado.error && <div style={{ marginTop: 12 }}><Aviso titulo="El Catastro">{estado.error}</Aviso></div>}
            {v.catastro_at && !estado.error && (
                <div style={{ marginTop: 12 }}><Aviso tono="ok" titulo="Datos del Catastro">Traídos el {fecha(v.catastro_at, true)}. Revísalos y corrige lo que haga falta: lo que pongas a mano manda.</Aviso></div>
            )}
            <Txt id="rt-dir" etiqueta="Dirección" mayus valor={v.direccion} onCambio={campo('direccion')} />
            <div className="ca-grid2" style={{ marginTop: 14 }}>
                <Txt id="rt-mun" etiqueta="Municipio" mayus valor={v.municipio} onCambio={campo('municipio')} />
                <Txt id="rt-cp" etiqueta="C. P." inputMode="numeric" maxLength={5} valor={v.codigo_postal} onCambio={campo('codigo_postal')} />
            </div>
            <div className="ca-grid2" style={{ marginTop: 14 }}>
                <Txt id="rt-prov" etiqueta="Provincia" mayus valor={v.provincia} onCambio={campo('provincia')} />
                <Txt id="rt-zona" etiqueta="Zona climática" mayus maxLength={4} valor={v.zona} onCambio={campo('zona')} placeholder="D3" />
            </div>
            {fueraClm && <div style={{ marginTop: 12 }}><Aviso tono="fuerte" titulo="Fuera de Castilla-La Mancha">De momento la memoria es la oficial de la JCCM: con una vivienda de {v.provincia} no se puede generar.</Aviso></div>}
            <div className="ca-grid2" style={{ marginTop: 14 }}>
                <Txt id="rt-sup" etiqueta="Superficie útil" inputMode="decimal" sufijo="m²" valor={v.superficie} onCambio={x => set({ ...v, superficie: x.replace(',', '.') })} />
                <Campo etiqueta="Plantas" id="rt-plantas">
                    <div className="ca-chips" style={{ marginTop: 0 }}>
                        {[1, 2, 3, 4].map(n => (
                            <button key={n} type="button" className={`ca-chipbtn${Number(v.plantas || 1) === n ? ' ca-chipbtn-sel' : ''}`} style={{ minWidth: 44, padding: 0 }}
                                onClick={() => set({ ...v, plantas: n })}>{n}</button>
                        ))}
                    </div>
                </Campo>
            </div>
        </>
    );
}

/* ── 2 · Titular ──────────────────────────────────────────────────────────── */
function PasoTitular({ t, set }) {
    const campo = (k) => (x) => set({ ...t, [k]: x });
    return (
        <>
            <div className="ca-chips" style={{ marginTop: 4 }}>
                {[[false, 'Persona'], [true, 'Empresa']].map(([v, txt]) => (
                    <button key={txt} type="button" className={`ca-chipbtn${!!t.es_empresa === v ? ' ca-chipbtn-sel' : ''}`} onClick={() => set({ ...t, es_empresa: v })}>{txt}</button>
                ))}
            </div>
            {t.es_empresa ? (
                <Txt id="rt-tnom" etiqueta="Razón social" mayus valor={t.nombre} onCambio={campo('nombre')} />
            ) : (
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Txt id="rt-tnom" etiqueta="Nombre" mayus valor={t.nombre} onCambio={campo('nombre')} />
                    <Txt id="rt-tape" etiqueta="Apellidos" mayus valor={t.apellidos} onCambio={campo('apellidos')} />
                </div>
            )}
            <div className="ca-grid2" style={{ marginTop: 14 }}>
                <Txt id="rt-tnif" etiqueta={t.es_empresa ? 'CIF' : 'DNI / NIE'} mayus valor={t.nif} onCambio={campo('nif')} />
                <Txt id="rt-ttel" etiqueta="Teléfono" opcional inputMode="tel" valor={t.telefono} onCambio={campo('telefono')} />
            </div>
            {!t.es_empresa && (
                <Campo etiqueta="Tratamiento" id="rt-tsexo">
                    <div className="ca-chips" style={{ marginTop: 0 }}>
                        {[['H', 'D. (señor)'], ['M', 'Dña. (señora)']].map(([v, txt]) => (
                            <button key={v} type="button" className={`ca-chipbtn${t.sexo === v ? ' ca-chipbtn-sel' : ''}`} onClick={() => set({ ...t, sexo: t.sexo === v ? '' : v })}>{txt}</button>
                        ))}
                    </div>
                </Campo>
            )}
            <Txt id="rt-tmail" etiqueta="Email" opcional type="email" inputMode="email" valor={t.email} onCambio={campo('email')} />
            <label className="ca-check" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={t.misma_direccion !== false} onChange={e => set({ ...t, misma_direccion: e.target.checked })} />
                <span>Vive en la vivienda de la instalación</span>
            </label>
            {t.misma_direccion === false && (
                <>
                    <Txt id="rt-tdir" etiqueta="Domicilio del titular" mayus valor={t.direccion} onCambio={campo('direccion')} />
                    <div className="ca-grid2" style={{ marginTop: 14 }}>
                        <Txt id="rt-tmun" etiqueta="Municipio" mayus valor={t.municipio} onCambio={campo('municipio')} />
                        <Txt id="rt-tcp" etiqueta="C. P." inputMode="numeric" maxLength={5} valor={t.codigo_postal} onCambio={campo('codigo_postal')} />
                    </div>
                    <Txt id="rt-tprov" etiqueta="Provincia" mayus valor={t.provincia} onCambio={campo('provincia')} />
                </>
            )}
        </>
    );
}

/* ── 3 · Instalación ──────────────────────────────────────────────────────── */
function BuscarEquipo({ onElegir }) {
    const fuente = useFuente();
    const [q, setQ] = useState('');
    const [res, setRes] = useState({ buscando: false, lista: null, error: null });
    useEffect(() => {
        const t = q.trim();
        if (t.length < 2) { setRes({ buscando: false, lista: null, error: null }); return undefined; }
        let vivo = true;
        setRes(r => ({ ...r, buscando: true }));
        const timer = setTimeout(async () => {
            try {
                const { data } = await axios.get(fuente.equipos, { params: { q: t } });
                if (vivo) setRes({ buscando: false, lista: data?.equipos || [], error: null });
            } catch (err) {
                if (vivo) setRes({ buscando: false, lista: null, error: mensajeError(err, 'No hemos podido buscar en el catálogo.') });
            }
        }, 350);
        return () => { vivo = false; clearTimeout(timer); };
    }, [q, fuente.equipos]);
    return (
        <>
            <Campo etiqueta="Busca el equipo por marca o modelo" id="rt-q">
                <div className="ca-sufijo">
                    <input id="rt-q" className="ca-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Daikin Altherma 8" autoComplete="off" />
                    <span>{res.buscando ? <Spinner size={16} /> : <IcoBuscar size={17} />}</span>
                </div>
            </Campo>
            {res.error && <div style={{ marginTop: 10 }}><Aviso>{res.error}</Aviso></div>}
            {res.lista && !res.lista.length && <p className="ca-peq" style={{ marginTop: 8 }}>No hay nada con «{q.trim()}» en el catálogo. Prueba con menos palabras o mételo a mano.</p>}
            {res.lista?.length > 0 && (
                <div className="rt-resultados">
                    {res.lista.map(m => (
                        <button key={m.id} type="button" className="ca-opt" onClick={() => onElegir(m)}>
                            <span>
                                <b>{m.marca} {m.modelo}</b>
                                <small>{[m.potencia && `${m.potencia} kW calor`, m.potencia_frio && `${m.potencia_frio} kW frío`, m.refrigerante, m.modelo_ud_exterior && `Ud. ext. ${m.modelo_ud_exterior}`].filter(Boolean).join(' · ')}</small>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

function PasoInstalacion({ i, f, setI, setF }) {
    const cal = i.aerotermia_cal || {};
    const [aMano, setAMano] = useState(() => !cal.aerotermia_db_id && !!cal.modelo);
    const setCal = (c) => setI({ ...i, aerotermia_cal: c });
    const campoCal = (k) => (x) => setCal({ ...cal, [k]: x });
    return (
        <>
            <span className="ca-label" style={{ marginTop: 4 }}>Emisores</span>
            <div className="ca-opts ca-opts-2" style={{ marginTop: 0 }}>
                {EMISORES.map(([id, t, d]) => (
                    <button key={id} type="button" className={`ca-opt${i.tipo_emisor === id ? ' ca-opt-sel' : ''}`} onClick={() => setI({ ...i, tipo_emisor: id })}>
                        <span><b>{t}</b><small>{d}</small></span>
                    </button>
                ))}
            </div>

            <hr className="ca-sep" />
            <span className="ca-label">La bomba de calor</span>
            {cal.aerotermia_db_id && !aMano ? (
                <div className="rt-equipo">
                    <span className="ca-ico-tile ca-tile-verde"><IcoCheck size={18} sw={2.6} /></span>
                    <div>
                        <b>{cal.marca} {cal.modelo}</b>
                        <small>{[cal.potencia && `${cal.potencia} kW`, cal.refrigerante, 'del catálogo'].filter(Boolean).join(' · ')}</small>
                    </div>
                    <button type="button" className="ca-link" onClick={() => setCal({ numero_serie: cal.numero_serie || '' })}>Cambiar</button>
                </div>
            ) : aMano ? (
                <>
                    <div className="ca-grid2">
                        <Txt id="rt-marca" etiqueta="Marca" mayus valor={cal.marca} onCambio={campoCal('marca')} />
                        <Txt id="rt-modelo" etiqueta="Modelo" mayus valor={cal.modelo} onCambio={campoCal('modelo')} />
                    </div>
                    <Txt id="rt-pot" etiqueta="Potencia de calefacción" inputMode="decimal" sufijo="kW" valor={cal.potencia} onCambio={x => setCal({ ...cal, potencia: x.replace(',', '.') })} />
                    <button type="button" className="ca-link ca-link-gris" onClick={() => setAMano(false)}>Buscar en el catálogo</button>
                </>
            ) : (
                <>
                    <BuscarEquipo onElegir={(m) => setCal({
                        aerotermia_db_id: m.id, marca: m.marca, modelo: m.modelo, modelo_ud_exterior: m.modelo_ud_exterior || '',
                        potencia: m.potencia || '', refrigerante: m.refrigerante || '', numero_serie: cal.numero_serie || '',
                    })} />
                    <button type="button" className="ca-link ca-link-gris" onClick={() => { setAMano(true); setCal({ numero_serie: cal.numero_serie || '' }); }}>No está en el catálogo: meterlo a mano</button>
                </>
            )}
            <Txt id="rt-serie" etiqueta="Nº de serie" mayus valor={cal.numero_serie} onCambio={campoCal('numero_serie')} ayuda="Viene en la placa de la unidad exterior." />

            <span className="ca-label" style={{ marginTop: 18 }}>Agua caliente (ACS)</span>
            <div className="ca-opts ca-opts-2" style={{ marginTop: 0 }}>
                {[[true, 'También hace el ACS', 'Calefacción y agua caliente'], [false, 'Solo calefacción', 'El ACS no se toca']].map(([v, t, d]) => (
                    <button key={t} type="button" className={`ca-opt${i.cambio_acs === v ? ' ca-opt-sel' : ''}`} onClick={() => setI({ ...i, cambio_acs: v })}>
                        <span><b>{t}</b><small>{d}</small></span>
                    </button>
                ))}
            </div>

            <Campo etiqueta="Si da frío: ¿dónde está la unidad exterior?" opcional id="rt-frio">
                <div className="ca-chips" style={{ marginTop: 0 }}>
                    {SITUADO.map(s => (
                        <button key={s} type="button" className={`ca-chipbtn${i.frio_situado_en === s ? ' ca-chipbtn-sel' : ''}`}
                            onClick={() => setI({ ...i, frio_situado_en: i.frio_situado_en === s ? '' : s })}>{s[0] + s.slice(1).toLowerCase()}</button>
                    ))}
                </div>
            </Campo>

            <hr className="ca-sep" />
            <div>
                <Txt id="rt-fpru" etiqueta="Fecha de las pruebas" type="date" valor={f.pruebas || ''} onCambio={x => setF({ ...f, pruebas: x })} />
                <Txt id="rt-ffir" etiqueta="Fecha de firma" opcional type="date" valor={f.firma || ''} onCambio={x => setF({ ...f, firma: x })} />
            </div>
        </>
    );
}

/* ── 5 · Revisar y generar (o, con el enlace, «Enviar a BROKERGY») ──────── */
function Revisar({ memoria, guardarYa, onGenerada, emisor }) {
    const fuente = useFuente();
    const { cuenta, refrescar } = useRiteAuth();
    const toast = useToast();
    const [generando, setGenerando] = useState(false);
    const [errorGen, setErrorGen] = useState(null);
    const [enviada, setEnviada] = useState(null);   // con el enlace: { faltan } si se envió sin poder generarse
    const r = useCarga(async () => { await guardarYa(); return (await axios.get(`${fuente.base}/comprobar`)).data; }, [fuente.base]);
    const enlace = fuente.tipo === 'enlace';
    const creditos = Number(cuenta?.creditos) || 0;
    // Lo de BROKERGY (la administración y el enlace) no gasta memorias del instalador.
    const gratis = fuente.tipo !== 'cuenta' || memoria.credito_consumido || memoria.origen === 'BROKERGY';

    const generar = async () => {
        setGenerando(true); setErrorGen(null); setEnviada(null);
        try {
            await guardarYa();
            const { data } = await axios.post(fuente.generar);
            if (fuente.tipo === 'cuenta') await refrescar();
            if (enlace && !data.generada) {
                setEnviada({ faltan: data.faltan || [] });
                toast('Enviada a BROKERGY');
                r.recargar({ silencioso: true });
                return;
            }
            toast(enlace ? 'Enviada y generada' : 'Memoria generada');
            onGenerada(data.memoria);
        } catch (err) {
            const e = errorDe(err);
            setErrorGen({ texto: mensajeError(err, enlace ? 'No hemos podido enviarla.' : 'No hemos podido generar la memoria.'), faltan: e.faltan || null });
            r.recargar({ silencioso: true });
        } finally {
            setGenerando(false);
        }
    };

    if (r.cargando && !r.datos) return <Esqueleto alto={90} n={3} />;
    if (r.error && !r.datos) return <ErrorRed compacto error={r.error} onReintentar={r.recargar} titulo="No hemos podido revisarla" />;
    const { faltan = [], avisos = [], tabla } = r.datos || {};
    const rad = esRadiadores(emisor);
    return (
        <>
            {faltan.length > 0 ? (
                <Aviso tono="fuerte" titulo={faltan.length === 1 ? 'Falta una cosa para generarla' : `Faltan ${faltan.length} cosas para generarla`}>
                    <ul className="rt-lista-faltan">{faltan.map(x => <li key={x}>{x}</li>)}</ul>
                    {enlace && <p className="ca-peq" style={{ marginTop: 6 }}>Si no lo sabes, envíala igual: BROKERGY lo completa.</p>}
                </Aviso>
            ) : (
                <Aviso tono="ok" titulo="Está todo">La memoria se puede generar.</Aviso>
            )}
            {avisos.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <Aviso titulo="Revísalo antes de firmar"><ul className="rt-lista-faltan">{avisos.map(x => <li key={x}>{x}</li>)}</ul></Aviso>
                </div>
            )}

            {tabla?.filas?.length > 0 && (
                <>
                    <p className="ca-sec" style={{ marginTop: 22 }}>Cargas por estancia · {tabla.factor} W/m²</p>
                    <div className="ca-datos" style={{ overflowX: 'auto' }}>
                        <table className="rt-cargas">
                            <thead><tr><th>Estancia</th><th>m²</th><th>Carga W</th>{rad && <th>Elem.</th>}<th>Pot. W</th></tr></thead>
                            <tbody>
                                {tabla.filas.map((f, k) => (
                                    <tr key={k}>
                                        <td>{f.nombre}</td>
                                        <td>{f.m2}</td>
                                        <td>{f.carga_w}</td>
                                        {rad && <td className={f.elementos_reales ? 'rt-real' : ''}>{f.elementos}</td>}
                                        <td className={f.elementos_reales ? 'rt-real' : ''}>{f.potencia_w}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr><td>Total</td><td /><td>{tabla.total.carga_w}</td>{rad && <td />}<td>{tabla.total.potencia_w}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                    {rad && <p className="ca-peq" style={{ marginTop: 8 }}>En verde, la potencia que sale de los elementos que has puesto; el resto, de la carga por superficie.</p>}
                </>
            )}

            {enviada && (
                <div style={{ marginTop: 12 }}>
                    <Aviso tono="ok" titulo="Recibida en BROKERGY">
                        Gracias. Con lo que falta no se puede generar todavía: lo completamos nosotros y te quedan aquí los documentos.
                    </Aviso>
                </div>
            )}
            {errorGen && (
                <div style={{ marginTop: 12 }}>
                    <Aviso tono="fuerte" titulo={enlace ? 'No se ha enviado' : 'No se ha generado'}>
                        {errorGen.texto}
                        {errorGen.faltan?.length > 0 && <ul className="rt-lista-faltan">{errorGen.faltan.map(x => <li key={x}>{x}</li>)}</ul>}
                    </Aviso>
                </div>
            )}
            <div className="ca-btns">
                {enlace ? (
                    <button type="button" className="ca-btn ca-btn-pri" onClick={generar} disabled={generando}>
                        {generando ? <><Spinner /> Enviando (un minuto)…</> : <><IcoEnviar size={18} /> {memoria.completada_at ? 'Enviar otra vez a BROKERGY' : 'Enviar a BROKERGY'}</>}
                    </button>
                ) : (
                    <button type="button" className="ca-btn ca-btn-pri" onClick={generar} disabled={generando || faltan.length > 0 || (!gratis && !creditos)}>
                        {generando ? <><Spinner /> Generando (un minuto)…</> : memoria.generaciones ? <><IcoRecargar size={18} /> Volver a generar</> : <><IcoCheck size={18} sw={2.6} /> Generar la memoria</>}
                    </button>
                )}
            </div>
            <p className="ca-peq" style={{ marginTop: 8, textAlign: 'center' }}>
                {enlace ? 'Si está todo, la memoria se genera al momento y te queda en «Documentos».'
                    : fuente.tipo === 'admin' ? 'De BROKERGY: no gasta memorias del instalador.'
                        : gratis ? 'Volver a generarla no gasta memorias.' : creditos ? `Gasta 1 memoria (te quedan ${creditos}). Si algo falla, no se gasta.` : 'No te quedan memorias: escríbenos y te cargamos más.'}
            </p>
        </>
    );
}

/* ── La pantalla ──────────────────────────────────────────────────────────── */
/**
 * `fuente`: de `fuenteDe` (cuenta · admin · enlace). `Envoltorio`: el marco de la página
 * (con el enlace no hay cuenta: lo pone App). `volver`: { txt, to } o nada.
 * `extra({ memoria, info, recargar })`: lo que la administración pone encima de los pasos
 * (el enlace para el instalador, el CIT). `info` es la respuesta entera del GET.
 */
export default function Memoria({ fuente, pasoInicial, Envoltorio = Marco, volver = { txt: 'Mis memorias', to: '/panel' }, extra }) {
    const carga = useCarga(() => axios.get(fuente.base).then(r => r.data), [fuente.base]);
    const [memoria, setMemoria] = useState(null);
    const [datos, setDatos] = useState(null);
    const [paso, setPaso] = useState(pasoInicial || null);
    const [guardado, setGuardado] = useState({ estado: 'ok', error: null });   // ok · pendiente · guardando · error
    const [versionDocs, setVersionDocs] = useState(0);
    const pendiente = useRef(null);
    const timer = useRef(null);
    const enCurso = useRef(Promise.resolve());
    const pasosRef = useRef(null);
    const hayMemoria = !!memoria;

    // El paso activo, a la vista en la tira de pasos (en el móvil no caben todos).
    useEffect(() => {
        const el = pasosRef.current?.querySelector('.rt-paso-act');
        if (el) pasosRef.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
    }, [paso, hayMemoria]);

    useEffect(() => {
        const m = carga.datos?.memoria;
        if (!m) return;
        setMemoria(m);
        setDatos(conDefectos(m.datos));
        // Con el enlace, la vivienda y el titular ya los ha puesto BROKERGY: se empieza por la instalación.
        const yaPuesto = fuente.tipo === 'enlace' && m.datos?.vivienda?.ref_catastral && m.datos?.titular?.nombre;
        setPaso(p => p || (m.estado !== 'BORRADOR' ? 'documentos' : yaPuesto ? 'instalacion' : 'vivienda'));
    }, [carga.datos, fuente.tipo]);

    const guardarYa = useCallback(async () => {
        clearTimeout(timer.current);
        await enCurso.current;
        const d = pendiente.current;
        if (!d) return;
        pendiente.current = null;
        setGuardado({ estado: 'guardando', error: null });
        const p = axios.put(fuente.guardar, { datos: d })
            .then(({ data }) => {
                setMemoria(m => ({ ...m, ...data.memoria, datos: m?.datos }));
                setGuardado(g => (pendiente.current ? g : { estado: 'ok', error: null }));
            })
            .catch((err) => {
                if (!pendiente.current) pendiente.current = d;
                setGuardado({ estado: 'error', error: mensajeError(err, 'No se ha podido guardar.') });
                throw err;
            });
        enCurso.current = p.catch(() => {});
        await p;
    }, [fuente.guardar]);

    const cambiar = useCallback((bloque, valor) => {
        setDatos(prev => {
            const nuevo = { ...prev, [bloque]: valor };
            pendiente.current = nuevo;
            return nuevo;
        });
        setGuardado({ estado: 'pendiente', error: null });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { guardarYa().catch(() => {}); }, 900);
    }, [guardarYa]);

    // Al salir de la pantalla, lo que quede pendiente se guarda.
    useEffect(() => () => { clearTimeout(timer.current); if (pendiente.current) guardarYa().catch(() => {}); }, [guardarYa]);

    const ir = async (p) => {
        if (pendiente.current) { try { await guardarYa(); } catch { /* el aviso ya lo dice */ } }
        setPaso(p);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (carga.cargando && !memoria) return <Envoltorio><Esqueleto alto={60} /><Esqueleto alto={320} /></Envoltorio>;
    if (carga.error && !memoria) return <Envoltorio><ErrorRed error={carga.error} onReintentar={carga.recargar} /></Envoltorio>;
    if (!memoria || !datos) return <Envoltorio><Esqueleto alto={320} /></Envoltorio>;

    const iPaso = Math.max(0, PASOS.findIndex(p => p.id === paso));
    const titular = [datos.titular.nombre, datos.titular.apellidos].filter(Boolean).join(' ');
    const e = ESTADOS[memoria.estado] || ESTADOS.BORRADOR;
    const textoGuardado = { ok: 'Guardado', pendiente: 'Sin guardar…', guardando: 'Guardando…', error: 'Sin guardar' }[guardado.estado];

    const origenTxt = fuente.tipo === 'enlace'
        ? 'Te la ha preparado BROKERGY: completa lo que sepas y dale a «Enviar a BROKERGY» en «Revisar». No te gasta memorias.'
        : fuente.tipo === 'admin' ? null
            : memoria.origen === 'BROKERGY' ? 'Preparada por BROKERGY: no te gasta memorias.' : null;

    return (
        <FuenteCtx.Provider value={fuente}>
        <Envoltorio>
            <div className="ca-in" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: volver ? 'space-between' : 'flex-end' }}>
                {volver && <button type="button" className="ca-link ca-link-gris" onClick={() => navegar(volver.to)}><IcoAtras size={16} /> {volver.txt}</button>}
                <span className="rt-guardado" aria-live="polite">{textoGuardado}</span>
            </div>
            <div className="ca-in" style={{ margin: '6px 2px 14px' }}>
                <p className="ca-eyebrow">{memoria.numero} · <span className={`ca-chip ${e.chip}`} style={{ height: 20, verticalAlign: 'middle' }}>{e.txt}</span></p>
                <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>{titular || 'Nueva memoria RITE'}</h1>
                {datos.vivienda.direccion && <p className="ca-peq" style={{ marginTop: 6 }}><IcoUbicacion size={13} /> {datos.vivienda.direccion}{datos.vivienda.municipio ? `, ${datos.vivienda.municipio}` : ''}</p>}
                {origenTxt && <p className="ca-peq" style={{ marginTop: 6 }}>{origenTxt}</p>}
            </div>
            {extra && extra({ memoria, info: carga.datos, recargar: () => carga.recargar({ silencioso: true }) })}
            {guardado.estado === 'error' && (
                <div style={{ marginBottom: 12 }}>
                    <Aviso titulo="No se ha guardado">{guardado.error} <button type="button" className="ca-link" onClick={() => guardarYa().catch(() => {})}>Reintentar</button></Aviso>
                </div>
            )}

            <nav className="rt-pasos" aria-label="Pasos de la memoria" ref={pasosRef}>
                {PASOS.map((p, k) => (
                    <button key={p.id} type="button" className={`rt-paso${p.id === paso ? ' rt-paso-act' : k < iPaso ? ' rt-paso-ok' : ''}`}
                        aria-current={p.id === paso ? 'step' : undefined} onClick={() => ir(p.id)}>
                        <b>{k + 1}</b>{p.t}
                    </button>
                ))}
            </nav>

            <section className="ca-card ca-pad ca-in" key={paso}>
                <div className="ca-filete" />
                <h2 className="ca-display ca-h3" style={{ marginBottom: 4 }}>{PASOS[iPaso].t}</h2>
                {paso === 'vivienda' && <PasoVivienda v={datos.vivienda} set={(v) => cambiar('vivienda', v)} />}
                {paso === 'titular' && <PasoTitular t={datos.titular} set={(t) => cambiar('titular', t)} />}
                {paso === 'instalacion' && (
                    <PasoInstalacion i={datos.instalacion} f={datos.fechas}
                        setI={(i) => cambiar('instalacion', i)} setF={(f) => cambiar('fechas', f)} />
                )}
                {paso === 'estancias' && (
                    <Estancias estancias={datos.estancias} superficie={Number(datos.vivienda.superficie) || 0}
                        plantasVivienda={datos.vivienda.plantas} emisor={datos.instalacion.tipo_emisor}
                        onChange={(es) => cambiar('estancias', es)} />
                )}
                {paso === 'revisar' && (
                    <Revisar memoria={memoria} guardarYa={guardarYa} emisor={datos.instalacion.tipo_emisor}
                        onGenerada={(m) => { setMemoria(x => ({ ...x, ...m, datos: x.datos })); setVersionDocs(v => v + 1); setPaso('documentos'); }} />
                )}
                {paso === 'documentos' && (
                    <>
                        <p className="ca-txt">{fuente.tipo === 'enlace'
                            ? 'Fírmala con el certificado de la empresa (AutoFirma). Si algo no está bien, corrígelo y vuelve a enviarla desde «Revisar»: la anterior queda guardada.'
                            : 'Fírmala con el certificado de la empresa (AutoFirma) y preséntala en eDICE (JCCM). Si cambias algo, vuelve a «Revisar» y genérala otra vez: la anterior queda guardada.'}</p>
                        <div style={{ marginTop: 6 }}><Documentos base={fuente.base} version={versionDocs} /></div>
                    </>
                )}
                {iPaso < 4 && (
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-pri" onClick={() => ir(PASOS[iPaso + 1].id)}>
                            {iPaso === 3 ? 'Revisar' : 'Siguiente'} <IcoFlecha size={18} />
                        </button>
                    </div>
                )}
            </section>
        </Envoltorio>
        </FuenteCtx.Provider>
    );
}
