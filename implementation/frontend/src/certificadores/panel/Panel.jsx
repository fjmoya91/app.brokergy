// ─── Panel — /panel: las obras del certificador ─────────────────────────────
// GET /api/certapp/obras → { obras: [...] } (solo columnas escalares, regla 22).
// Los créditos salen de /me (useCertappAuth) y se refrescan al entrar.
// Con la API caída se dice («no hemos podido cargar»), NUNCA «0 obras».
// Con el menú lateral (PC, 26/10/2026): el saludo con los créditos y «Nueva obra» se
// quedan en el menú; aquí, el buscador y «Lo siguiente» de cada obra.
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, comoLista, fecha, haceCuanto, useCarga } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar, useRuta } from '../router';
import { Aviso, ErrorRed, Esqueleto } from '../ui/piezas';
import { IcoBuscar, IcoChevron, IcoMas, IcoUsuario } from '../ui/Iconos';
import { estadoDe, nombreObra } from '../obra/comun';

const FILTROS = [
    { id: 'todas', label: 'Todas', f: () => true },
    { id: 'curso', label: 'En curso', f: o => o.estado === 'BORRADOR' || o.estado === 'EN_PREPARACION' },
    { id: 'listas', label: 'Para revisar', f: o => o.estado === 'LISTO' },
    { id: 'hechas', label: 'Validadas', f: o => o.estado === 'VALIDADO' },
];

const lugar = (o) => [o.direccion, o.municipio].filter(Boolean).join(', ') || o.ref_catastral || '—';
const cuando = (o) => o.entregado_at || o.pedido_at || o.updated_at || o.created_at;
// Lo que le toca a cada obra (fuerte: lo que tiene que hacer el certificador).
const SIGUIENTE = {
    BORRADOR: { t: 'Terminar la ficha y pedirlo', fuerte: true },
    EN_PREPARACION: { t: 'Lo estamos preparando' },
    LISTO: { t: 'Revisarlo y firmarlo', fuerte: true },
    VALIDADO: { t: 'Registrarlo' },
};
const Siguiente = ({ o }) => {
    const s = SIGUIENTE[o.estado];
    return s ? <span className={`ca-sigtxt${s.fuerte ? ' ca-sigtxt-fuerte' : ''}`}>{s.t}</span> : <span className="ca-sigtxt">—</span>;
};
// Buscar sin tildes ni mayúsculas.
const plano = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Panel() {
    const { cuenta, refrescar } = useCertappAuth();
    const { query } = useRuta();
    const [filtro, setFiltro] = useState('todas');
    const { datos, error, cargando, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API}/obras`);
        return comoLista(data, 'obras');
    }, []);

    // Créditos al día (los gasta «Generar» y los da el admin).
    useEffect(() => { refrescar?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const obras = useMemo(() => datos || [], [datos]);
    const listas = obras.filter(o => o.estado === 'LISTO').length;
    const [buscar, setBuscar] = useState('');
    const visibles = useMemo(() => {
        const q = plano(buscar).trim();
        return obras
            .filter((FILTROS.find(x => x.id === filtro) || FILTROS[0]).f)
            .filter(o => !q || plano([nombreObra(o), o.numero_expediente, lugar(o), o.ref_catastral].join(' ')).includes(q));
    }, [obras, filtro, buscar]);
    const creditos = Number(cuenta?.creditos ?? 0);
    const perfilIncompleto = cuenta && ['nombre', 'nif', 'titulacion'].some(k => !String(cuenta[k] || '').trim());
    const bienvenida = query.get('bienvenida') === '1';
    const nombre = String(cuenta?.nombre || '').split(' ')[0];

    return (
        <div className="ca-col-ancha">
            <div className="ca-panel-cab">
                {/* En el PC los créditos y «Nueva obra» están en el menú lateral. */}
                <section className="ca-card ca-pad ca-in ca-sin-menu">
                    <div className="ca-filete" />
                    <p className="ca-hola">{bienvenida ? 'Bienvenido' : 'Hola'}{nombre ? <>, <b>{nombre}</b></> : ''}</p>
                    <div className="ca-cifra" style={{ marginTop: 10 }}>
                        <b>{cuenta ? creditos : '—'}</b>
                        <span>{creditos === 1 ? 'certificado disponible' : 'certificados disponibles'}</span>
                    </div>
                    <p className="ca-peq" style={{ marginTop: 6 }}>
                        {creditos > 0 ? 'Cada certificado que pides gasta uno. Si no podemos hacerlo, te lo devolvemos.' : 'Se te han acabado. Escríbenos y te damos más.'}
                    </p>
                    <div className="ca-btns">
                        <Enlace to="/obra/nueva" className="ca-btn ca-btn-pri"><IcoMas /> Nueva obra</Enlace>
                    </div>
                </section>

                <div className="ca-stack ca-in-2">
                    {bienvenida && (
                        <Aviso tono="ok" titulo="Ya tienes tu cuenta">
                            Empieza por «Nueva obra»: con la referencia catastral traemos el resto del Catastro.
                        </Aviso>
                    )}
                    {listas > 0 && (
                        <Aviso tono="info" className="ca-sin-menu" titulo={`${listas} ${listas === 1 ? 'certificado listo' : 'certificados listos'} para revisar`}>
                            <button type="button" className="ca-link" onClick={() => setFiltro('listas')}>Verlos</button>
                        </Aviso>
                    )}
                    {perfilIncompleto && (
                        <button type="button" className="ca-fila" onClick={() => navegar('/perfil')}>
                            <span className="ca-ico-tile ca-tile-ambar" aria-hidden="true"><IcoUsuario /></span>
                            <span><b>Completa tu perfil</b><small>Tu nombre, NIF y titulación salen en el certificado como técnico.</small></span>
                            <IcoChevron />
                        </button>
                    )}
                </div>
            </div>

            <div className="ca-fila-top ca-panel-obras" style={{ flexWrap: 'wrap' }}>
                <h1 className="ca-display ca-h2" style={{ margin: 0 }}>Mis obras</h1>
                {obras.length >= 3 && (
                    <label className="ca-buscar">
                        <IcoBuscar size={18} />
                        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)}
                            placeholder="Buscar por titular, número o dirección" aria-label="Buscar obras" />
                    </label>
                )}
                {obras.length > 0 && (
                    <div className="ca-tabs" role="tablist" aria-label="Filtrar obras">
                        {FILTROS.map(x => {
                            const n = obras.filter(x.f).length;
                            return (
                                <button key={x.id} type="button" role="tab" aria-selected={filtro === x.id}
                                    className={`ca-tab${filtro === x.id ? ' ca-tab-act' : ''}`} onClick={() => setFiltro(x.id)}>
                                    {x.label}{x.id !== 'todas' && n > 0 ? <span className="ca-badge">{n}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 14 }}>
                {cargando && !datos ? (
                    <Esqueleto alto={84} n={3} />
                ) : error && !datos ? (
                    <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido cargar tus obras" />
                ) : !obras.length ? (
                    <section className="ca-card ca-pad ca-vacio">
                        <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Aún no tienes obras</h2>
                        <p className="ca-txt">Crea la primera con la referencia catastral, la dirección o tu ubicación si estás en la vivienda.</p>
                        <div className="ca-btns"><Enlace to="/obra/nueva" className="ca-btn ca-btn-sec"><IcoMas /> Crear la primera</Enlace></div>
                    </section>
                ) : !visibles.length ? (
                    <p className="ca-peq">No hay obras en «{FILTROS.find(x => x.id === filtro)?.label}».</p>
                ) : (
                    <>
                        <div className="ca-obras ca-solo-movil">
                            {visibles.map(o => (
                                <Enlace key={o.id} to={`/obra/${o.id}`} className="ca-obra">
                                    <div className="ca-obra-top">
                                        <span className="ca-eyebrow ca-eyebrow-gris" style={{ margin: 0 }}>{o.numero_expediente || 'Sin número'}</span>
                                        <span className={`ca-chip ${estadoDe(o.estado).chip}`}>{estadoDe(o.estado).label}</span>
                                    </div>
                                    <b>{nombreObra(o)}</b>
                                    <small>{lugar(o)}</small>
                                    <small><Siguiente o={o} /> · {haceCuanto(cuando(o))}</small>
                                </Enlace>
                            ))}
                        </div>
                        <div className="ca-tabla-wrap ca-solo-pc">
                            <table className="ca-tabla">
                                <thead>
                                    <tr><th>Obra</th><th>Dirección</th><th>Estado</th><th>Lo siguiente</th><th>Actualizada</th><th aria-label="Abrir" /></tr>
                                </thead>
                                <tbody>
                                    {visibles.map(o => (
                                        <tr key={o.id} onClick={() => navegar(`/obra/${o.id}`)}>
                                            <td>
                                                <Enlace to={`/obra/${o.id}`} className="ca-tabla-enlace" onClick={e => e.stopPropagation()}>
                                                    <b>{nombreObra(o)}</b>
                                                </Enlace>
                                                <div className="ca-peq ca-mono">{o.numero_expediente || '—'}</div>
                                            </td>
                                            <td className="ca-trunc">{lugar(o)}</td>
                                            <td><span className={`ca-chip ${estadoDe(o.estado).chip}`}>{estadoDe(o.estado).label}</span></td>
                                            <td><Siguiente o={o} /></td>
                                            <td className="ca-num" title={fecha(cuando(o), true)}>{haceCuanto(cuando(o))}</td>
                                            <td style={{ width: 40, color: 'var(--gris)' }}><IcoChevron size={16} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                {error && datos && <p className="ca-peq" style={{ marginTop: 10 }}>No se ha podido actualizar la lista. <button type="button" className="ca-link" onClick={() => recargar({ silencioso: true })}>Reintentar</button></p>}
            </div>
        </div>
    );
}
