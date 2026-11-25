// ─── Admin.jsx — la administración de la app RITE (rite.brokergy.es/admin) ──
// Regla 245. Para el EQUIPO de BROKERGY (sesión con fila en `usuarios`, ADMIN o
// TRABAJADOR; las cuentas y los bonos, solo ADMIN):
//   /admin              Memorias (todas las cuentas) · Cuentas (bonos, bloquear)
//   /admin/memoria/:id  la MISMA pantalla de la memoria (fuente `admin`: no gasta
//                       créditos) + el enlace para el instalador y su CIT del CRM.
// El precio (Fran, 25/11/2026): la primera memoria es gratis al darse de alta y las
// demás van por BONOS que se cargan desde aquí. El mensaje con el enlace NO se envía
// desde aquí: se copia o se abre en el WhatsApp de quien lo prepara.
// API /api/riteapp-admin.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { axios, enlaceWhatsApp, fecha, mensajeError, useCarga } from '../api';
import { Enlace } from '../../certificadores/router';
import { Aviso, BotonCopiar, Campo, ErrorRed, Esqueleto, Hoja, useToast } from '../../certificadores/ui/piezas';
import { IcoBuscar, IcoChevron, IcoDoc, IcoEnlace, IcoMas, IcoWhatsApp, Spinner } from '../../certificadores/ui/Iconos';
import { urlAppExterna } from '../../utils/appsExternas';
import { useRiteAuth } from '../auth/RiteAuth';
import { Marco } from '../ui/Marco';
import Memoria, { fuenteDe } from './Memoria';
import { ESTADOS } from './Panel';

const API = '/api/riteapp-admin';
const CHIP_CUENTA = { PENDIENTE: 'ca-chip-naranja', ACTIVA: 'ca-chip-verde', BLOQUEADA: 'ca-chip-ambar' };

/* ── Memorias ─────────────────────────────────────────────────────────────── */
function Memorias() {
    const [q, setQ] = useState('');
    const [buscar, setBuscar] = useState('');
    const { datos, error, cargando, recargar } = useCarga(
        () => axios.get(`${API}/memorias`, { params: buscar ? { q: buscar } : {} }).then(r => r.data?.memorias || []), [buscar]);
    return (
        <>
            <form className="ca-buscar" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); setBuscar(q.trim()); }}>
                <IcoBuscar size={17} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nº o titular" aria-label="Buscar memorias" />
            </form>
            {cargando && !datos && <div style={{ marginTop: 12 }}><Esqueleto alto={68} n={4} /></div>}
            {error && !datos && <ErrorRed error={error} onReintentar={recargar} compacto />}
            {datos && !datos.length && <p className="ca-txt" style={{ marginTop: 14 }}>{buscar ? `Nada con «${buscar}».` : 'Aún no hay memorias.'}</p>}
            {datos?.length > 0 && (
                <div className="ca-stack" style={{ marginTop: 12 }}>
                    {datos.map(m => {
                        const e = ESTADOS[m.estado] || ESTADOS.BORRADOR;
                        const marcas = [m.informe_id && 'CIT', m.origen === 'BROKERGY' && 'BROKERGY', m.completada_at && 'completada por el instalador'].filter(Boolean);
                        return (
                            <Enlace key={m.id} to={`/admin/memoria/${m.id}`} className="ca-fila">
                                <span className="ca-ico-tile ca-tile-crema"><IcoDoc size={19} /></span>
                                <span>
                                    <b>{m.nombre || 'Sin titular'}</b>
                                    <small>{m.numero} · {m.riteapp_cuentas?.empresa || m.riteapp_cuentas?.email || '—'} · {m.municipio || 'sin vivienda'} · {fecha(m.updated_at || m.created_at)}</small>
                                    {marcas.length > 0 && <small>{marcas.join(' · ')}</small>}
                                </span>
                                <div className={`ca-chip ${e.chip}`} style={{ flex: 'none' }}>{e.txt}</div>
                                <IcoChevron size={18} />
                            </Enlace>
                        );
                    })}
                </div>
            )}
        </>
    );
}

/* ── Cuentas: bonos y bloquear ────────────────────────────────────────────── */
function Cuentas() {
    const toast = useToast();
    const { datos, error, cargando, recargar } = useCarga(() => axios.get(`${API}/cuentas`).then(r => r.data?.cuentas || []), []);
    const [bono, setBono] = useState(null);   // { cuenta, creditos, concepto, importe }
    const [ocupado, setOcupado] = useState(null);
    const [errBono, setErrBono] = useState(null);

    const cargarBono = async (ev) => {
        ev.preventDefault();
        setOcupado('bono'); setErrBono(null);
        try {
            const importe = String(bono.importe || '').replace(',', '.').trim();
            const { data } = await axios.post(`${API}/cuentas/${bono.cuenta.id}/creditos`, {
                creditos: parseInt(bono.creditos, 10), concepto: bono.concepto || undefined, importe_eur: importe ? Number(importe) : null,
            });
            toast(`Cargado. Ahora tiene ${data.creditos} ${data.creditos === 1 ? 'memoria' : 'memorias'}.`);
            setBono(null);
            recargar({ silencioso: true });
        } catch (err) { setErrBono(mensajeError(err, 'No se ha podido cargar el bono.')); } finally { setOcupado(null); }
    };
    const estado = async (c, nuevo) => {
        setOcupado(c.id);
        try {
            await axios.post(`${API}/cuentas/${c.id}/estado`, { estado: nuevo });
            toast(nuevo === 'BLOQUEADA' ? 'Cuenta bloqueada.' : 'Cuenta activada.');
            recargar({ silencioso: true });
        } catch (err) { toast(mensajeError(err)); } finally { setOcupado(null); }
    };

    return (
        <>
            <p className="ca-peq" style={{ marginTop: 14 }}>La primera memoria es gratis al darse de alta. Las demás, con bonos: «Añadir memorias» y, si lo ha pagado, el importe.</p>
            {cargando && !datos && <div style={{ marginTop: 12 }}><Esqueleto alto={84} n={3} /></div>}
            {error && !datos && <ErrorRed error={error} onReintentar={recargar} compacto />}
            {datos && !datos.length && <p className="ca-txt" style={{ marginTop: 14 }}>Aún no hay cuentas.</p>}
            {datos?.length > 0 && (
                <div className="ca-stack" style={{ marginTop: 12 }}>
                    {datos.map(c => (
                        <div key={c.id} className="ca-card ca-pad" style={{ padding: 16 }}>
                            <div className="ca-fila-top">
                                <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.empresa || c.email}</b>
                                <span className={`ca-chip ${CHIP_CUENTA[c.estado] || 'ca-chip-gris'}`} style={{ flex: 'none' }}>{c.estado}</span>
                            </div>
                            <p className="ca-peq" style={{ marginTop: 4 }}>{c.email}{c.municipio ? ` · ${c.municipio}` : ''} · alta {fecha(c.created_at)}</p>
                            <p className="ca-txt" style={{ marginTop: 8 }}><b>{c.creditos ?? 0}</b> {c.creditos === 1 ? 'memoria disponible' : 'memorias disponibles'} · {c.creditos_usados ?? 0} usadas</p>
                            <div className="ca-btns ca-btns-2" style={{ marginTop: 10 }}>
                                <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" onClick={() => { setErrBono(null); setBono({ cuenta: c, creditos: '5', concepto: '', importe: '' }); }}>
                                    <IcoMas size={17} /> Añadir memorias
                                </button>
                                {c.estado === 'BLOQUEADA'
                                    ? <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" disabled={ocupado === c.id} onClick={() => estado(c, 'ACTIVA')}>Activar</button>
                                    : <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" disabled={ocupado === c.id} onClick={() => estado(c, 'BLOQUEADA')}>Bloquear</button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Hoja abierta={!!bono} titulo={`Añadir memorias${bono?.cuenta?.empresa ? ` a ${bono.cuenta.empresa}` : ''}`} onCerrar={() => setBono(null)}>
                {bono && (
                    <form onSubmit={cargarBono}>
                        <Campo etiqueta="Cuántas memorias" id="rt-bono-n" ayuda="En negativo, para quitar (un ajuste).">
                            <input id="rt-bono-n" className="ca-input" inputMode="numeric" value={bono.creditos} onChange={e => setBono({ ...bono, creditos: e.target.value.replace(/[^\d-]/g, '') })} />
                        </Campo>
                        <Campo etiqueta="Concepto" opcional id="rt-bono-c">
                            <input id="rt-bono-c" className="ca-input" value={bono.concepto} maxLength={200} placeholder="Bono de 5 memorias" onChange={e => setBono({ ...bono, concepto: e.target.value })} />
                        </Campo>
                        <Campo etiqueta="Importe cobrado" opcional id="rt-bono-i" sufijo="€">
                            <input id="rt-bono-i" className="ca-input" inputMode="decimal" value={bono.importe} onChange={e => setBono({ ...bono, importe: e.target.value })} />
                        </Campo>
                        {errBono && <div style={{ marginTop: 12 }}><Aviso titulo="No ha podido ser">{errBono}</Aviso></div>}
                        <div className="ca-btns">
                            <button type="submit" className="ca-btn ca-btn-pri" disabled={ocupado === 'bono' || !parseInt(bono.creditos, 10)}>
                                {ocupado === 'bono' ? <Spinner /> : <IcoMas size={18} />} Cargar {parseInt(bono.creditos, 10) || 0}
                            </button>
                        </div>
                    </form>
                )}
            </Hoja>
        </>
    );
}

/* ── /admin ───────────────────────────────────────────────────────────────── */
export function AdminInicio({ pestana = 'memorias' }) {
    const { equipo } = useRiteAuth();
    const [tab, setTab] = useState(pestana === 'cuentas' && equipo?.esAdmin ? 'cuentas' : 'memorias');
    return (
        <Marco>
            <div className="ca-in">
                <p className="ca-eyebrow">BROKERGY · {equipo?.nombre || 'equipo'}</p>
                <h1 className="ca-display ca-h2" style={{ margin: '8px 2px 0' }}>Administración</h1>
                <p className="ca-peq" style={{ marginTop: 6 }}>
                    Las memorias de un CIT se crean desde su ficha en el CRM. <a className="ca-link" href={urlAppExterna('cee', '/admin')} target="_blank" rel="noopener noreferrer">App CEE</a>
                    {' · '}<a className="ca-link" href={urlAppExterna('app', '/')} target="_blank" rel="noopener noreferrer">CRM</a>
                </p>
            </div>
            {equipo?.esAdmin && (
                <div className="ca-tabs ca-in ca-in-2" style={{ marginTop: 16 }} role="tablist">
                    {[['memorias', 'Memorias'], ['cuentas', 'Cuentas y bonos']].map(([id, t]) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ca-tab${tab === id ? ' ca-tab-act' : ''}`} onClick={() => setTab(id)}>{t}</button>
                    ))}
                </div>
            )}
            {tab === 'cuentas' ? <Cuentas /> : <Memorias />}
        </Marco>
    );
}

/* ── /admin/memoria/:id — lo de BROKERGY encima de los pasos ──────────────── */
function TarjetaAdmin({ memoria, info }) {
    const toast = useToast();
    const [modo, setModo] = useState(memoria.datos?.estancias?.modo || 'rapido');
    const [enlace, setEnlace] = useState(null);   // { url, mensaje, caduca_at, telefono_instalador }
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const cuenta = info?.cuenta;
    const vigente = enlace || info?.enlace;

    const preparar = async () => {
        setOcupado(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/memorias/${memoria.id}/enlace`, { modo });
            setEnlace(data);
            toast('Enlace preparado (no se ha enviado nada)');
        } catch (err) { setError(mensajeError(err, 'No se ha podido preparar el enlace.')); } finally { setOcupado(false); }
    };

    return (
        <section className="ca-card ca-pad ca-in" style={{ marginBottom: 14 }}>
            <p className="ca-eyebrow">De BROKERGY · no gasta memorias</p>
            <p className="ca-txt" style={{ marginTop: 6 }}>
                Cuenta: <b>{cuenta?.empresa || cuenta?.email || '—'}</b>{cuenta?.email && cuenta?.empresa ? ` (${cuenta.email})` : ''}
                {memoria.informe_id && <> · <a className="ca-link" href={urlAppExterna('app', `/?informe=${memoria.informe_id}`)} target="_blank" rel="noopener noreferrer">Abrir su CIT en el CRM</a></>}
            </p>
            {memoria.informe_id && <p className="ca-peq" style={{ marginTop: 4 }}>Al generarla, la memoria en PDF y en Word sube a su CIT como versión final.</p>}
            {memoria.completada_at && <p className="ca-peq" style={{ marginTop: 4 }}>El instalador la envió el {fecha(memoria.completada_at, true)}.</p>}

            <hr className="ca-sep" />
            <span className="ca-label">Que la complete el instalador</span>
            <div className="ca-chips" style={{ marginTop: 0 }}>
                {[['rapido', 'Rápida'], ['extendido', 'Con radiadores']].map(([k, t]) => (
                    <button key={k} type="button" className={`ca-chipbtn${modo === k ? ' ca-chipbtn-sel' : ''}`} onClick={() => setModo(k)}>{t}</button>
                ))}
            </div>
            <div className="ca-btns">
                <button type="button" className="ca-btn ca-btn-sec" onClick={preparar} disabled={ocupado}>
                    {ocupado ? <Spinner /> : <IcoEnlace size={18} />} {vigente ? 'Preparar un enlace nuevo' : 'Preparar el enlace'}
                </button>
            </div>
            {vigente && !enlace && <p className="ca-peq" style={{ marginTop: 8 }}>Hay un enlace activo hasta el {fecha(vigente.caduca_at)}. Uno nuevo anula el anterior.</p>}
            {error && <div style={{ marginTop: 12 }}><Aviso titulo="No ha podido ser">{error}</Aviso></div>}
            {enlace && (
                <div style={{ marginTop: 12 }}>
                    <Aviso tono="ok" titulo="Mensaje listo (no se ha enviado)">
                        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0' }}>{enlace.mensaje}</p>
                        {enlace.telefono_instalador && <p className="ca-peq">El instalador tiene el teléfono {enlace.telefono_instalador}.</p>}
                        <div className="ca-btns ca-btns-2">
                            <BotonCopiar texto={enlace.mensaje} etiqueta="Copiar mensaje" className="ca-btn ca-btn-sec ca-btn-peq" />
                            <a className="ca-btn ca-btn-sec ca-btn-peq" href={enlaceWhatsApp(enlace.mensaje)} target="_blank" rel="noreferrer"><IcoWhatsApp size={18} /> Mi WhatsApp</a>
                        </div>
                    </Aviso>
                </div>
            )}
        </section>
    );
}

export function AdminMemoria({ id, pasoInicial }) {
    return (
        <Memoria fuente={fuenteDe('admin', id)} pasoInicial={pasoInicial} volver={{ txt: 'Memorias', to: '/admin' }}
            extra={({ memoria, info }) => <TarjetaAdmin memoria={memoria} info={info} />} />
    );
}
