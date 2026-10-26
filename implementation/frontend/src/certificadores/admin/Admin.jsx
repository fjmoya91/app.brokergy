// ─── Admin — /admin: el panel de BROKERGY de la app de certificadores ───────
// Rutas (las da por hechas el backend en sus avisos):
//   /admin            resumen + lista de espera
//   /admin/beta       lista de espera   ·  /admin/cuentas  ·  /admin/obras
//   /admin/obras/:id  detalle de una obra (pedir a la IA, entregar, devolver crédito)
//                     con sus DOCUMENTOS como los ve el certificador (obra/Documentos.jsx:
//                     visor de PDF, versiones, sus .cex en cuarentena) y el Drive de cada uno
//   /admin/sugerencias  incidencias y sugerencias: estado y respuesta (le llega al certificador por email)
// API /api/certapp-admin/* (adminOnly). Más sobria que el resto, mismos tokens.
// Los enlaces de activación y el WhatsApp los abre el ADMIN desde su móvil
// (wa.me): desde aquí no se envía nada por WhatsApp.
import { useMemo, useState } from 'react';
import axios from 'axios';
import { API_ADMIN, alPortapapeles, comoLista, enlaceWhatsApp, fecha, haceCuanto, mensajeError, urlDe, useCarga } from '../api';
import { casar, Enlace, navegar, useRuta } from '../router';
import { Aviso, BotonCopiar, Campo, ErrorRed, Esqueleto, Hoja, useToast } from '../ui/piezas';
import {
    IcoAtras, IcoCarpeta, IcoChevron, IcoChispa, IcoEnlace, IcoMas, IcoMenos, IcoPlano, IcoRecargar, IcoWhatsApp, Spinner,
} from '../ui/Iconos';
import { estadoDe, nombreObra } from '../obra/comun';
import { genericosDe, resumenCuestionario, slotsAplicables } from '../logic/cuestionario';
import { ListaDocumentos, VisorPdf } from '../obra/Documentos';
import { CLASES, autorTxt, useDocumentos } from '../obra/documentosComun';

const PESTANAS = [
    { id: 'beta', label: 'Lista de espera' },
    { id: 'cuentas', label: 'Cuentas' },
    { id: 'obras', label: 'Obras' },
    { id: 'sugerencias', label: 'Incidencias' },   // la ruta sigue siendo /admin/sugerencias (la usan los avisos)
];
const ESTADOS_BETA = ['NUEVA', 'CONTACTADA', 'INVITADA', 'DESCARTADA'];
const CHIP_BETA = { NUEVA: 'ca-chip-naranja', CONTACTADA: 'ca-chip-gris', INVITADA: 'ca-chip-verde', DESCARTADA: 'ca-chip-gris' };
const CHIP_CUENTA = { PENDIENTE: 'ca-chip-naranja', ACTIVA: 'ca-chip-verde', BLOQUEADA: 'ca-chip-ambar' };
const ESTADOS_FB = ['NUEVA', 'VISTA', 'HECHA', 'DESCARTADA'];
const ESTADO_LLANO = { NUEVA: 'Recibida', VISTA: 'En revisión', HECHA: 'Resuelta', DESCARTADA: 'Cerrada' };   // lo que lee el certificador
const PERFIL_TXT = { AUTONOMO: 'Autónomo', EMPRESA_PROPIA: 'Empresa con técnicos', EMPRESA_SUBCONTRATA: 'Empresa que subcontrata', OTRO: 'Otro' };
const nombreCuenta = (c) => [c?.nombre, c?.apellidos].filter(Boolean).join(' ') || c?.email || '—';

/* ── El enlace de activación, para copiar o mandar por SU WhatsApp ──────── */
function EnlaceInvitacion({ r, telefono, nombre }) {
    if (!r?.enlace) return null;
    const texto = r.preexistente
        ? `Hola${nombre ? ` ${nombre}` : ''}: ya tienes plaza en la beta de la app de certificados de BROKERGY. Entra con tu email y tu contraseña de siempre: ${r.enlace}`
        : `Hola${nombre ? ` ${nombre}` : ''}: ya tienes plaza en la beta de la app de certificados de BROKERGY. Activa tu cuenta aquí (pon una contraseña): ${r.enlace}`;
    const correo = r.email?.seco ? 'El email NO ha salido (avisos apagados en este entorno).' : r.email?.canales?.length ? `Email enviado (${r.email.canales.join(', ')}).` : null;
    return (
        <Aviso tono="ok" titulo={r.reinvitada ? 'Invitación repetida' : 'Cuenta creada'}>
            {correo && <div className="ca-peq">{correo}</div>}
            <p className="ca-mono ca-enlace" style={{ margin: '8px 0' }}>{r.enlace}</p>
            <div className="ca-btns ca-btns-2">
                <BotonCopiar texto={r.enlace} etiqueta="Copiar enlace" className="ca-btn ca-btn-sec ca-btn-peq" />
                <a className="ca-btn ca-btn-sec ca-btn-peq" href={enlaceWhatsApp(texto, telefono)} target="_blank" rel="noreferrer"><IcoWhatsApp size={18} /> WhatsApp</a>
            </div>
        </Aviso>
    );
}

/* ── Resumen ─────────────────────────────────────────────────────────────── */
function Resumen() {
    const { datos, error, cargando, recargar } = useCarga(async () => (await axios.get(`${API_ADMIN}/resumen`)).data, []);
    if (cargando && !datos) return <Esqueleto alto={84} n={1} />;
    if (error && !datos) return <ErrorRed error={error} onReintentar={() => recargar()} compacto titulo="No se ha podido cargar el resumen" />;
    const d = datos || {};
    const k = [
        { label: 'En lista de espera', v: d.beta?.NUEVA },
        { label: 'Cuentas activas', v: d.cuentas?.ACTIVA },
        { label: 'En preparación', v: d.obras?.EN_PREPARACION },
        { label: 'Incidencias nuevas', v: d.feedback_nuevo },
    ];
    return (
        <>
            <div className="ca-kpis">
                {k.map(x => <div key={x.label} className="ca-kpi"><span>{x.label}</span><b>{x.v ?? '—'}</b></div>)}
            </div>
            <p className="ca-peq" style={{ marginTop: 10 }}>
                Créditos: {d.creditos?.disponibles ?? '—'} disponibles · {d.creditos?.usados ?? '—'} usados
                {' · '}Asistente: {d.asistente?.encendido ? `encendido (${Number(d.asistente.gastado_mes_usd || 0).toFixed(2)} / ${d.asistente.tope_mes_usd ?? '—'} $ este mes)` : 'apagado'}
                {' · '}Avisos {d.config?.avisos ? 'ON' : 'off'} · IA automática {d.config?.ia_auto ? 'ON' : 'off'} · Entrega automática {d.config?.entrega_auto ? 'ON' : 'off'}
                {d.drive && !d.drive.raiz_configurada ? ' · ⚠ falta CERTAPP_DRIVE_ROOT_ID' : ''}
                {d.config?.url ? ` · ${d.config.url}` : ''}
            </p>
            {d.drive?.raiz_link && (
                <a className="ca-fila" style={{ marginTop: 10 }} href={d.drive.raiz_link} target="_blank" rel="noreferrer">
                    <span className="ca-ico-tile ca-tile-crema"><IcoCarpeta /></span>
                    <span><b>Carpetas de los certificados en Drive</b><small>Una por certificador y, dentro, una por obra (el CEE en «1. CEE») · Solo ADMIN</small></span>
                    <IcoChevron />
                </a>
            )}
        </>
    );
}

/* ── Lista de espera ─────────────────────────────────────────────────────── */
function ListaEspera() {
    const toast = useToast();
    const [estado, setEstado] = useState('NUEVA');
    const [abierta, setAbierta] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [creditos, setCreditos] = useState('5');
    const [res, setRes] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const { datos, error: errCarga, cargando, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API_ADMIN}/beta`, { params: estado ? { estado } : {} });
        return comoLista(data, 'solicitudes');
    }, [estado]);

    const abrir = async (s) => {
        setAbierta(s); setDetalle(null); setRes(null); setError(null); setCreditos('5');
        try { const { data } = await axios.get(`${API_ADMIN}/beta/${s.id}`); setDetalle(data?.solicitud || null); } catch { /* el listado basta */ }
    };
    const invitar = async () => {
        const n = Number(creditos);
        if (!Number.isInteger(n) || n < 0) { setError('Los créditos son un número entero.'); return; }
        setOcupado(true); setError(null);
        try {
            const { data } = await axios.post(`${API_ADMIN}/beta/${abierta.id}/invitar`, { creditos: n });
            setRes(data);
            recargar({ silencioso: true });
        } catch (err) { setError(mensajeError(err, 'No se ha podido invitar.')); } finally { setOcupado(false); }
    };
    const cambiarEstado = async (e) => {
        setOcupado(true); setError(null);
        try {
            await axios.patch(`${API_ADMIN}/beta/${abierta.id}`, { estado: e });
            setAbierta(a => ({ ...a, estado: e }));
            toast('Estado cambiado.');
            recargar({ silencioso: true });
        } catch (err) { setError(mensajeError(err)); } finally { setOcupado(false); }
    };

    const s = detalle || abierta;
    return (
        <>
            <div className="ca-chips" style={{ marginBottom: 12 }}>
                {[...ESTADOS_BETA, ''].map(e => (
                    <button key={e || 'todas'} type="button" className={`ca-chipbtn${estado === e ? ' ca-chipbtn-sel' : ''}`} onClick={() => setEstado(e)}>{e ? e.toLowerCase() : 'todas'}</button>
                ))}
            </div>
            {cargando && !datos ? <Esqueleto alto={60} n={4} /> : errCarga && !datos ? <ErrorRed error={errCarga} onReintentar={() => recargar()} compacto /> : (
                <div className="ca-tabla-wrap">
                    {!(datos || []).length ? <p className="ca-pad ca-peq" style={{ margin: 0 }}>No hay solicitudes{estado ? ` ${estado.toLowerCase()}s` : ''}.</p> : (
                        <div className="ca-tabla-scroll">
                            <table className="ca-tabla">
                                <thead><tr><th>Quién</th><th>Perfil</th><th>CEE/mes</th><th>Provincia</th><th>IA presentar</th><th>Cuándo</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {datos.map(x => (
                                        <tr key={x.id} onClick={() => abrir(x)}>
                                            <td><b>{x.nombre}</b><div className="ca-peq">{x.email}{x.telefono ? ` · ${x.telefono}` : ''}</div></td>
                                            <td>{PERFIL_TXT[x.perfil] || x.perfil || '—'}{x.empresa ? <div className="ca-peq">{x.empresa}</div> : null}</td>
                                            <td className="ca-num">{x.cee_mes || '—'}</td>
                                            <td>{x.provincia || '—'}</td>
                                            <td>{x.interes_ia_presentar || '—'}</td>
                                            <td className="ca-num" title={fecha(x.created_at, true)}>{haceCuanto(x.created_at)}</td>
                                            <td><span className={`ca-chip ${CHIP_BETA[x.estado] || 'ca-chip-gris'}`}>{x.estado}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <Hoja abierta={!!abierta} titulo={s?.nombre || 'Solicitud'} onCerrar={() => setAbierta(null)} ancho={620}
                pie={res ? null : (
                    <div className="ca-btns">
                        <div className="ca-grid2" style={{ alignItems: 'end' }}>
                            <Campo etiqueta="Créditos de prueba">
                                <input className="ca-input" inputMode="numeric" value={creditos} onChange={e => setCreditos(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                            </Campo>
                            <button type="button" className="ca-btn ca-btn-pri" disabled={ocupado} onClick={invitar} style={{ marginBottom: 14 }}>
                                {ocupado ? <Spinner /> : <IcoChispa />} Invitar
                            </button>
                        </div>
                    </div>
                )}>
                {s && (
                    <>
                        <dl className="ca-dl">
                            <div><dt>Email</dt><dd>{s.email}</dd></div>
                            <div><dt>Teléfono</dt><dd>{s.telefono || '—'}</dd></div>
                            <div><dt>Provincia</dt><dd>{s.provincia || '—'}</dd></div>
                            <div><dt>Perfil</dt><dd>{PERFIL_TXT[s.perfil] || s.perfil || '—'}{s.empresa ? ` · ${s.empresa}` : ''}</dd></div>
                            <div><dt>CEE al mes</dt><dd>{s.cee_mes || '—'}</dd></div>
                            <div><dt>Minutos por CEE</dt><dd>{s.minutos_cee || '—'}</dd></div>
                            <div><dt>Minutos en presentar</dt><dd>{s.minutos_presentar || '—'}</dd></div>
                            <div><dt>IA para presentar</dt><dd>{s.interes_ia_presentar || '—'}</dd></div>
                            {s.coste_subcontrata_eur != null && <div><dt>Paga por CEE subcontratado</dt><dd>{s.coste_subcontrata_eur} €</dd></div>}
                            <div><dt>Programas</dt><dd>{(s.software || []).join(', ') || '—'}</dd></div>
                            <div><dt>Comunidades</dt><dd>{(s.comunidades || []).join(', ') || '—'}</dd></div>
                            <div><dt>Comunicaciones</dt><dd>{s.acepta_comunicaciones ? 'Sí' : 'No'}</dd></div>
                            <div><dt>Origen</dt><dd>{s.origen || '—'}</dd></div>
                            <div><dt>Apuntado</dt><dd>{fecha(s.created_at, true)}</dd></div>
                        </dl>
                        {s.comentarios && <div className="ca-crema" style={{ padding: 14, borderRadius: 16 }}><b>Lo que le quitaría más trabajo</b><p className="ca-txt" style={{ margin: '4px 0 0' }}>{s.comentarios}</p></div>}
                        <div className="ca-chips">
                            {ESTADOS_BETA.filter(e => e !== 'INVITADA').map(e => (
                                <button key={e} type="button" disabled={ocupado} className={`ca-chipbtn${s.estado === e ? ' ca-chipbtn-sel' : ''}`} onClick={() => cambiarEstado(e)}>{e.toLowerCase()}</button>
                            ))}
                        </div>
                        {error && <p className="ca-error" role="alert">{error}</p>}
                        <EnlaceInvitacion r={res} telefono={s.telefono} nombre={String(s.nombre || '').split(' ')[0]} />
                    </>
                )}
            </Hoja>
        </>
    );
}

/* ── Cuentas ─────────────────────────────────────────────────────────────── */
function Cuentas() {
    const toast = useToast();
    const [nueva, setNueva] = useState(false);
    const [f, setF] = useState({ email: '', nombre: '', telefono: '', creditos: '5' });
    const [res, setRes] = useState(null);
    const [ocupado, setOcupado] = useState(null);
    const [error, setError] = useState(null);
    const { datos, error: errCarga, cargando, recargar } = useCarga(async () => comoLista((await axios.get(`${API_ADMIN}/cuentas`)).data, 'cuentas'), []);

    const patch = async (c, cambios, ok) => {
        setOcupado(c.id);
        try {
            await axios.patch(`${API_ADMIN}/cuentas/${c.id}`, cambios);
            toast(ok);
            await recargar({ silencioso: true });
        } catch (err) {
            toast(mensajeError(err));
            // 409 CREDITOS_CAMBIADOS: ha pedido un certificado entretanto; se trae el saldo de ahora.
            if (err?.response?.status === 409) recargar({ silencioso: true });
        } finally { setOcupado(null); }
    };
    const crear = async (e) => {
        e.preventDefault();
        setOcupado('nueva'); setError(null);
        try {
            const { data } = await axios.post(`${API_ADMIN}/cuentas`, { ...f, creditos: Number(f.creditos) || 0 });
            setRes(data);
            recargar({ silencioso: true });
        } catch (err) { setError(mensajeError(err, 'No se ha podido crear la cuenta.')); } finally { setOcupado(null); }
    };

    return (
        <>
            <div className="ca-fila-top" style={{ marginBottom: 12 }}>
                <span className="ca-peq">{datos ? `${datos.length} cuentas` : ''}</span>
                <button type="button" className="ca-btn ca-btn-sec ca-btn-peq ca-btn-auto" onClick={() => { setNueva(true); setRes(null); setError(null); }}><IcoMas size={18} /> Cuenta sin pasar por la lista</button>
            </div>
            {cargando && !datos ? <Esqueleto alto={60} n={4} /> : errCarga && !datos ? <ErrorRed error={errCarga} onReintentar={() => recargar()} compacto /> : (
                <div className="ca-tabla-wrap">
                    <div className="ca-tabla-scroll">
                        <table className="ca-tabla">
                            <thead><tr><th>Certificador</th><th>Estado</th><th>Créditos</th><th>Usados</th><th>Último acceso</th><th aria-label="Acciones" /></tr></thead>
                            <tbody>
                                {(datos || []).map(c => (
                                    <tr key={c.id} style={{ cursor: 'default' }}>
                                        <td><b>{nombreCuenta(c)}</b><div className="ca-peq">{c.email}{c.empresa ? ` · ${c.empresa}` : ''}</div></td>
                                        <td><span className={`ca-chip ${CHIP_CUENTA[c.estado] || 'ca-chip-gris'}`}>{c.estado}</span></td>
                                        <td className="ca-num">
                                            <span className="ca-creditos-ed">
                                                <button type="button" className="ca-icobtn" aria-label="Un crédito menos" disabled={ocupado === c.id || !c.creditos}
                                                    onClick={() => patch(c, { creditos: Math.max(0, (c.creditos || 0) - 1) }, 'Créditos actualizados.')}><IcoMenos size={16} /></button>
                                                <b>{c.creditos ?? 0}</b>
                                                <button type="button" className="ca-icobtn" aria-label="Un crédito más" disabled={ocupado === c.id}
                                                    onClick={() => patch(c, { creditos: (c.creditos || 0) + 1 }, 'Créditos actualizados.')}><IcoMas size={16} /></button>
                                            </span>
                                        </td>
                                        <td className="ca-num">{c.creditos_usados ?? 0}</td>
                                        <td className="ca-num" title={fecha(c.ultimo_acceso_at, true)}>{c.ultimo_acceso_at ? haceCuanto(c.ultimo_acceso_at) : 'nunca'}</td>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <Enlace to={`/admin/obras?cuenta=${c.id}`} className="ca-link ca-link-gris">Obras</Enlace>
                                            {' · '}
                                            {c.estado === 'BLOQUEADA'
                                                ? <button type="button" className="ca-link" disabled={ocupado === c.id} onClick={() => patch(c, { estado: 'ACTIVA' }, 'Cuenta desbloqueada.')}>Desbloquear</button>
                                                : <button type="button" className="ca-link ca-link-gris" disabled={ocupado === c.id}
                                                    onClick={() => window.confirm(`¿Bloquear a ${nombreCuenta(c)}? No podrá entrar.`) && patch(c, { estado: 'BLOQUEADA' }, 'Cuenta bloqueada.')}>Bloquear</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Hoja abierta={nueva} titulo="Nueva cuenta" onCerrar={() => setNueva(false)}
                pie={res ? null : <div className="ca-btns"><button type="submit" form="form-cuenta" className="ca-btn ca-btn-pri" disabled={ocupado === 'nueva'}>{ocupado === 'nueva' ? <Spinner /> : <IcoChispa />} Crear e invitar</button></div>}>
                {res ? <EnlaceInvitacion r={res} telefono={f.telefono} nombre={f.nombre.split(' ')[0]} /> : (
                    <form id="form-cuenta" onSubmit={crear} noValidate>
                        <Campo etiqueta="Email"><input className="ca-input" type="email" value={f.email} onChange={e => setF(s => ({ ...s, email: e.target.value }))} /></Campo>
                        <Campo etiqueta="Nombre"><input className="ca-input" value={f.nombre} onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} /></Campo>
                        <div className="ca-grid2">
                            <Campo etiqueta="Teléfono" opcional><input className="ca-input" type="tel" value={f.telefono} onChange={e => setF(s => ({ ...s, telefono: e.target.value }))} /></Campo>
                            <Campo etiqueta="Créditos"><input className="ca-input" inputMode="numeric" value={f.creditos} onChange={e => setF(s => ({ ...s, creditos: e.target.value.replace(/\D/g, '').slice(0, 4) }))} /></Campo>
                        </div>
                        {error && <p className="ca-error" role="alert">{error}</p>}
                    </form>
                )}
            </Hoja>
        </>
    );
}

/* ── Obras ───────────────────────────────────────────────────────────────── */
function Obras({ cuentaId }) {
    const [estado, setEstado] = useState('');
    const { datos, error, cargando, recargar } = useCarga(async () => {
        const params = {};
        if (estado) params.estado = estado;
        if (cuentaId) params.cuenta_id = cuentaId;
        return comoLista((await axios.get(`${API_ADMIN}/obras`, { params })).data, 'obras');
    }, [estado, cuentaId]);
    return (
        <>
            <div className="ca-chips" style={{ marginBottom: 12 }}>
                {['', 'BORRADOR', 'EN_PREPARACION', 'LISTO', 'VALIDADO', 'ARCHIVADA'].map(e => (
                    <button key={e || 'todas'} type="button" className={`ca-chipbtn${estado === e ? ' ca-chipbtn-sel' : ''}`} onClick={() => setEstado(e)}>{e ? estadoDe(e).label : 'Todas'}</button>
                ))}
                {cuentaId && <Enlace to="/admin/obras" className="ca-chipbtn">De todas las cuentas</Enlace>}
            </div>
            {cargando && !datos ? <Esqueleto alto={60} n={4} /> : error && !datos ? <ErrorRed error={error} onReintentar={() => recargar()} compacto /> : (
                <div className="ca-tabla-wrap">
                    {!(datos || []).length ? <p className="ca-pad ca-peq" style={{ margin: 0 }}>No hay obras.</p> : (
                        <div className="ca-tabla-scroll">
                            <table className="ca-tabla">
                                <thead><tr><th>Obra</th><th>Certificador</th><th>Dirección</th><th>Estado</th><th>Pedida</th></tr></thead>
                                <tbody>
                                    {datos.map(o => (
                                        <tr key={o.id} onClick={() => navegar(`/admin/obras/${o.id}`)}>
                                            <td><b>{nombreObra(o)}</b><div className="ca-peq ca-mono">{o.numero_expediente}</div></td>
                                            <td>{nombreCuenta(o.cuenta)}</td>
                                            <td className="ca-trunc">{[o.direccion, o.municipio].filter(Boolean).join(', ') || '—'}</td>
                                            <td><span className={`ca-chip ${estadoDe(o.estado).chip}`}>{estadoDe(o.estado).label}</span></td>
                                            <td className="ca-num">{o.pedido_at ? haceCuanto(o.pedido_at) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

function ObraAdmin({ id }) {
    const toast = useToast();
    const [ocupado, setOcupado] = useState(null);
    const [aviso, setAviso] = useState(null);
    const { datos, error, cargando, recargar } = useCarga(async () => (await axios.get(`${API_ADMIN}/obras/${id}`)).data, [id]);
    const documentos = useDocumentos(id, { admin: true });
    const [visor, setVisor] = useState(null);
    const d = datos || {};
    const obra = d.obra;
    const resumen = useMemo(() => (obra ? resumenCuestionario(obra) : []), [obra]);

    const accion = async (ruta, cuerpo, ok) => {
        setOcupado(ruta); setAviso(null);
        try {
            const { data } = await axios.post(`${API_ADMIN}/obras/${id}/${ruta}`, cuerpo || {});
            toast(ok);
            if (ruta === 'entregar' && data?.compartida && !data.compartida.ok) setAviso(`Entregado, pero la carpeta NO se ha compartido: ${data.compartida.error || data.compartida.motivo || 'sin detalle'}.`);
            await recargar({ silencioso: true });
            return { ok: true, data };
        } catch (err) {
            const c = err.response?.data?.code;
            if (ruta === 'entregar' && c === 'SIN_CEE') {
                if (window.confirm('En «1. CEE» no hay ni el PDF ni el .cex. ¿Entregar igualmente?')) return accion('entregar', { forzar: true }, ok);
                return { ok: false };
            }
            setAviso(mensajeError(err));
            return { ok: false };
        } finally { setOcupado(null); }
    };

    if (cargando && !datos) return <Esqueleto alto={120} n={3} />;
    if (error && !datos) return <ErrorRed error={error} onReintentar={() => recargar()} titulo="No se ha podido abrir la obra" />;
    if (!obra) return null;
    const e = obra.estado;
    const enl = d.enlaces || {};
    const docs = d.docs?.slots || {};
    const aplican = slotsAplicables(obra.cuestionario || {});
    const genericos = genericosDe(obra.cuestionario || {});
    const calif = { consumo: obra.cee?.cee_inicial?.epnrLetra || null, emisiones: obra.cee?.cee_inicial?.emisionesLetra || null };
    const firmaCee = obra.cee?.firma || null;

    return (
        <div className="ca-stack">
            <div>
                <Enlace to="/admin/obras" className="ca-link ca-link-gris"><IcoAtras size={14} /> Todas las obras</Enlace>
            </div>
            <section className="ca-card ca-pad">
                <div className="ca-filete" />
                <div className="ca-fila-top">
                    <p className="ca-eyebrow" style={{ margin: 0 }}>{obra.numero_expediente}</p>
                    <span className={`ca-chip ${estadoDe(e).chip}`}>{estadoDe(e).label}</span>
                </div>
                <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>{nombreObra(obra)}</h1>
                <p className="ca-sub">{[obra.direccion, obra.codigo_postal, obra.municipio, obra.provincia].filter(Boolean).join(', ')}</p>
                <dl className="ca-dl" style={{ marginTop: 12 }}>
                    <div><dt>Certificador</dt><dd>{nombreCuenta(d.cuenta)}{d.cuenta?.email ? ` · ${d.cuenta.email}` : ''}</dd></div>
                    <div><dt>Créditos del certificador</dt><dd>{d.cuenta?.creditos ?? '—'}</dd></div>
                    <div><dt>Referencia</dt><dd className="ca-mono">{obra.ref_catastral || '—'}</dd></div>
                    <div><dt>Zona · superficie · año</dt><dd>{[obra.zona_climatica, obra.superficie_catastro && `${obra.superficie_catastro} m²`, obra.anio_construccion].filter(Boolean).join(' · ') || '—'}</dd></div>
                    <div><dt>Pedida</dt><dd>{fecha(obra.pedido_at, true)}</dd></div>
                    {genericos.length > 0 && <div><dt>Equipo genérico</dt><dd>{genericos.join(', ')}</dd></div>}
                </dl>
                {aviso && <p className="ca-error" role="alert">{aviso}</p>}
                <div className="ca-btns ca-btns-2">
                    <button type="button" className="ca-btn ca-btn-pri" disabled={!!ocupado || !['EN_PREPARACION', 'LISTO'].includes(e)}
                        onClick={() => accion('pedir-ia', { rehacer: e === 'LISTO' }, 'Encargado a la IA.')}>
                        {ocupado === 'pedir-ia' ? <Spinner /> : <IcoChispa />} {e === 'LISTO' ? 'Rehacer con la IA' : 'Pedir a la IA'}
                    </button>
                    <button type="button" className="ca-btn ca-btn-sec" disabled={!!ocupado || !['EN_PREPARACION', 'LISTO'].includes(e)}
                        onClick={() => window.confirm('¿Entregar al certificador? Se le avisa y se comparte su carpeta.') && accion('entregar', null, 'Entregado.')}>
                        {ocupado === 'entregar' ? <Spinner /> : <IcoEnlace />} {e === 'LISTO' ? 'Volver a entregar' : 'Entregar'}
                    </button>
                    <button type="button" className="ca-btn ca-btn-sec" disabled={!!ocupado}
                        onClick={() => { const m = window.prompt('Motivo de la devolución del crédito:', 'No se ha podido hacer el certificado'); if (m != null) accion('devolver-credito', { motivo: m }, 'Crédito devuelto.'); }}>
                        {ocupado === 'devolver-credito' ? <Spinner /> : <IcoRecargar />} Devolver el crédito
                    </button>
                    <Enlace to={`/obra/${obra.id}/envolvente?origen=ext`} className="ca-btn ca-btn-sec"><IcoPlano /> Abrir la envolvente</Enlace>
                </div>
            </section>

            <section className="ca-card ca-pad">
                <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Certificado</h2>
                {(calif.consumo || calif.emisiones || firmaCee) && (
                    <p className="ca-peq" style={{ marginTop: 8 }}>
                        {calif.consumo || calif.emisiones ? `Calificación ${calif.consumo || '—'} en consumo · ${calif.emisiones || '—'} en emisiones` : ''}
                        {firmaCee ? `${calif.consumo || calif.emisiones ? ' · ' : ''}${enl.firmado ? 'Firmado' : 'Firma anterior al PDF actual'} el ${fecha(firmaCee.at, true)}${firmaCee.firmante?.nombre ? ` por ${firmaCee.firmante.nombre}` : ''}${firmaCee.coincide === false ? ' (⚠ no parece el certificador)' : ''}` : ''}
                    </p>
                )}
                {/* Lo mismo que ve el certificador, con el visor y el enlace de Drive de cada fichero. */}
                <ListaDocumentos d={documentos.datos} cargando={documentos.cargando} error={documentos.error} recargar={documentos.recargar}
                    onVer={(doc) => setVisor(doc)} admin />
                {urlDe(enl.carpeta) && <a className="ca-fila" style={{ marginTop: 10 }} href={urlDe(enl.carpeta)} target="_blank" rel="noreferrer"><span className="ca-ico-tile ca-tile-crema"><IcoCarpeta /></span><span><b>Carpeta de la obra en Drive</b><small>Solo ADMIN</small></span><IcoChevron /></a>}
                {d.enlace_cliente && (
                    <div style={{ marginTop: 12 }}>
                        <p className="ca-peq" style={{ margin: 0 }}>Enlace del propietario</p>
                        <p className="ca-mono ca-enlace">{d.enlace_cliente}</p>
                        <button type="button" className="ca-link" onClick={async () => { if (await alPortapapeles(d.enlace_cliente)) toast('Copiado.'); }}>Copiar</button>
                    </div>
                )}
            </section>

            {d.barrido && (d.barrido.bloqueantes?.length > 0 || d.barrido.avisos?.length > 0) && (
                <section className="ca-card ca-pad">
                    <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Barrido</h2>
                    <ul className="ca-barrido" style={{ marginTop: 10 }}>
                        {(d.barrido.bloqueantes || []).map(x => <li key={x.id} className="ca-aviso ca-aviso-fuerte"><span className="ca-ico-tile">!</span><div>{x.texto}</div></li>)}
                        {(d.barrido.avisos || []).map(x => <li key={x.id} className="ca-aviso ca-aviso-ambar"><span className="ca-ico-tile">·</span><div>{x.texto}</div></li>)}
                    </ul>
                </section>
            )}

            <section className="ca-card ca-pad">
                <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Cuestionario</h2>
                {resumen.length ? <dl className="ca-dl" style={{ marginTop: 10 }}>{resumen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : <p className="ca-peq">Sin contestar.</p>}
            </section>

            <section className="ca-card ca-pad">
                <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Fotos y documentos</h2>
                {aplican.map(s => {
                    const fs = docs[s.id] || [];
                    return (
                        <div key={s.id} className="ca-admin-slot">
                            <b>{s.label}</b> <span className="ca-peq">{fs.length || '—'}</span>
                            {fs.length > 0 && (
                                <div className="ca-thumbs">
                                    {fs.map(f => (
                                        <a key={f.driveId} className="ca-thumb" href={f.link || undefined} target="_blank" rel="noreferrer" title={f.nombre || ''}>
                                            {f.thumb ? <img src={f.thumb} alt={f.nombre || ''} loading="lazy" /> : 'DOC'}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>

            {d.eventos?.length > 0 && (
                <section className="ca-card ca-pad">
                    <h2 className="ca-display ca-h3" style={{ margin: '0 0 12px' }}>Historial</h2>
                    <ul className="ca-hist">
                        {d.eventos.map(ev => <li key={ev.id}>{ev.texto || ev.tipo}<small>{fecha(ev.created_at, true)} · {ev.por || '—'}</small></li>)}
                    </ul>
                </section>
            )}

            {visor && (
                <VisorPdf key={visor.id} doc={visor} titulo={CLASES[visor.clase] || 'Documento'}
                    detalle={`${visor.actual ? '' : 'Versión anterior · '}${fecha(visor.fecha, true)} · ${autorTxt(visor.autor, true)} · ${visor.nombre}`}
                    onCerrar={() => setVisor(null)}
                    pie={() => (visor.drive ? <a className="ca-btn ca-btn-sec" href={visor.drive} target="_blank" rel="noreferrer"><IcoCarpeta size={16} /> Abrir en Drive</a> : null)} />
            )}
        </div>
    );
}

/* ── Incidencias y sugerencias ───────────────────────────────────────────── */
// El certificador las ve en «Mis incidencias» con el estado en palabras llanas y la
// respuesta. Guardar una respuesta NUEVA le manda un email (PUT /feedback/:id; con
// los avisos apagados, en seco) y pasa una «nueva» a «vista».
function IncidenciaAdmin({ f, onGuardada }) {
    const toast = useToast();
    const [estado, setEstado] = useState(f.estado);
    const [respuesta, setRespuesta] = useState(f.respuesta || '');
    const [avisar, setAvisar] = useState(true);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const cambiaResp = respuesta.trim() !== (f.respuesta || '').trim();
    const avisara = cambiaResp && !!respuesta.trim() && avisar;
    const hayCambios = cambiaResp || estado !== f.estado;

    const guardar = async () => {
        setOcupado(true); setError(null);
        try {
            const cuerpo = {};
            if (estado !== f.estado) cuerpo.estado = estado;
            if (cambiaResp) { cuerpo.respuesta = respuesta.trim(); cuerpo.avisar = avisar; }
            const { data } = await axios.put(`${API_ADMIN}/feedback/${f.id}`, cuerpo);
            const a = data?.aviso;
            toast(!a ? 'Guardado.'
                : a.seco ? 'Guardado. El email ha ido EN SECO (avisos apagados en este entorno).'
                    : a.canales?.includes('email') ? 'Guardado y avisado por email.' : 'Guardado, pero el email no ha salido.');
            await onGuardada?.();
        } catch (err) { setError(mensajeError(err, 'No se ha podido guardar.')); } finally { setOcupado(false); }
    };

    return (
        <article className="ca-card ca-pad">
            <div className="ca-fila-top">
                <span className="ca-chip ca-chip-gris">{f.tipo}</span>
                <span className="ca-peq" title={fecha(f.created_at, true)}>{haceCuanto(f.created_at)}</span>
            </div>
            <p className="ca-txt" style={{ whiteSpace: 'pre-wrap' }}>{f.texto}</p>
            <p className="ca-peq">
                {nombreCuenta(f.cuenta)}
                {f.obra_id ? <> · <Enlace to={`/admin/obras/${f.obra_id}`}>{f.obra?.numero_expediente || 'obra'}</Enlace></> : ' · de la app en general'}
                {f.pantalla ? ` · ${f.pantalla}` : ''}
            </p>
            <label className="ca-campo">
                <span className="ca-label">Estado <small>· el certificador ve «{ESTADO_LLANO[estado] || estado}»</small></span>
                <select className="ca-input" value={estado} onChange={e => setEstado(e.target.value)}>
                    {ESTADOS_FB.map(e => <option key={e} value={e}>{ESTADO_LLANO[e]} ({e.toLowerCase()})</option>)}
                </select>
            </label>
            <label className="ca-campo">
                <span className="ca-label">Respuesta al certificador <small>· la ve en «Mis incidencias»</small></span>
                <textarea className="ca-input" rows={3} maxLength={4000} value={respuesta} onChange={e => setRespuesta(e.target.value)}
                    placeholder="Qué hemos hecho o qué le pedimos. Le llega por email al guardar." />
            </label>
            {f.respuesta_at && <p className="ca-peq" style={{ marginTop: 6 }}>Respondida el {fecha(f.respuesta_at, true)}{f.respuesta_por ? ` por ${f.respuesta_por}` : ''}.</p>}
            {cambiaResp && !!respuesta.trim() && (
                <label className="ca-check">
                    <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} />
                    <span>Avisarle por email{f.cuenta?.email ? ` (${f.cuenta.email})` : ''}</span>
                </label>
            )}
            {error && <p className="ca-error" role="alert">{error}</p>}
            <div className="ca-btns">
                <button type="button" className="ca-btn ca-btn-pri ca-btn-peq" disabled={!hayCambios || ocupado} onClick={guardar}>
                    {ocupado && <Spinner />} {avisara ? 'Guardar y avisar' : 'Guardar'}
                </button>
            </div>
        </article>
    );
}

function Incidencias() {
    const [estado, setEstado] = useState('NUEVA');
    const { datos, error, cargando, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API_ADMIN}/feedback`, { params: estado ? { estado } : {} });
        return comoLista(data, 'feedback');
    }, [estado]);
    return (
        <>
            <div className="ca-chips" style={{ marginBottom: 12 }}>
                {[...ESTADOS_FB, ''].map(e => (
                    <button key={e || 'todas'} type="button" className={`ca-chipbtn${estado === e ? ' ca-chipbtn-sel' : ''}`} onClick={() => setEstado(e)}>{e ? e.toLowerCase() : 'todas'}</button>
                ))}
            </div>
            {cargando && !datos ? <Esqueleto alto={80} n={3} /> : error && !datos ? <ErrorRed error={error} onReintentar={() => recargar()} compacto /> : !(datos || []).length ? <p className="ca-peq">No hay incidencias.</p> : (
                <div className="ca-stack" style={{ gap: 10 }}>
                    {/* La clave cambia al guardarse: la tarjeta vuelve a partir de lo guardado. */}
                    {datos.map(f => <IncidenciaAdmin key={`${f.id}-${f.estado}-${f.respuesta_at || ''}`} f={f} onGuardada={() => recargar({ silencioso: true })} />)}
                </div>
            )}
        </>
    );
}

export default function Admin() {
    const { path, query } = useRuta();
    const pObra = casar('/admin/obras/:id', path);
    const tab = pObra ? 'obras' : (path.split('/')[2] || 'beta');

    return (
        <div className="ca-col-ancha">
            <div className="ca-fila-top" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                <h1 className="ca-display ca-h2" style={{ margin: 0 }}>Administración</h1>
                <span className="ca-chip ca-chip-tinta">BROKERGY</span>
            </div>
            {!pObra && <Resumen />}
            <div className="ca-tabs" role="tablist" style={{ margin: '18px 0 14px' }}>
                {PESTANAS.map(t => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ca-tab${tab === t.id ? ' ca-tab-act' : ''}`}
                        onClick={() => navegar(`/admin/${t.id}`, { arriba: false })}>{t.label}</button>
                ))}
            </div>
            {pObra ? <ObraAdmin id={pObra.id} />
                : tab === 'cuentas' ? <Cuentas />
                    : tab === 'obras' ? <Obras cuentaId={query.get('cuenta')} />
                        : tab === 'sugerencias' ? <Incidencias />
                            : <ListaEspera />}
        </div>
    );
}
