// ─── Empresa.jsx — el alta y el perfil: los datos de la EMPRESA que firma ────
// Lo que sale en la memoria como empresa instaladora: razón social, CIF, nº de
// empresa RITE (REI), domicilio y el representante que firma (o un técnico
// habilitado distinto). El backend lo filtra con `limpiarPerfil` (lista blanca).
// El email es el de la SESIÓN, nunca el del formulario.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { API, axios, mensajeError } from '../api';
import { navegar } from '../../certificadores/router';
import { Aviso, Campo, useToast } from '../../certificadores/ui/piezas';
import { IcoCheck, Spinner } from '../../certificadores/ui/Iconos';
import { useRiteAuth } from '../auth/RiteAuth';
import { Marco } from '../ui/Marco';

const CAMPOS = ['empresa', 'empresa_nif', 'es_autonomo', 'numero_empresa_rite', 'telefono', 'direccion', 'municipio', 'provincia', 'codigo_postal',
    'representante_nombre', 'representante_apellidos', 'representante_nif', 'representante_cargo',
    'tecnico_firmante_distinto', 'tecnico_firmante_nombre', 'tecnico_firmante_apellidos', 'tecnico_firmante_dni', 'tecnico_firmante_carnet_rite'];

const desde = (c) => Object.fromEntries(CAMPOS.map(k => [k, c?.[k] ?? (k === 'es_autonomo' || k === 'tecnico_firmante_distinto' ? false : '')]));

/** Lo mínimo para que la memoria salga firmada (lo demás lo pide el «Revisar»). */
function faltanEmpresa(f) {
    const faltan = [];
    if (!f.empresa.trim()) faltan.push('la razón social');
    if (!f.empresa_nif.trim()) faltan.push('el CIF o NIF de la empresa');
    if (!f.representante_nombre.trim()) faltan.push('el nombre de quien firma');
    return faltan;
}

function Texto({ f, set, k, etiqueta, opcional, mayus, ...resto }) {
    return (
        <Campo etiqueta={etiqueta} opcional={opcional} id={`rt-${k}`}>
            <input id={`rt-${k}`} className={`ca-input${mayus ? ' ca-input-mayus' : ''}`} value={f[k] || ''}
                onChange={e => set(k, e.target.value)} {...resto} />
        </Campo>
    );
}

export function FormEmpresa({ inicial, alta = false }) {
    const { refrescar, ponerCuenta, email } = useRiteAuth();
    const toast = useToast();
    const [f, setF] = useState(() => desde(inicial));
    const [acepta, setAcepta] = useState(false);
    const [estado, setEstado] = useState({ guardando: false, error: null });
    const set = (k, v) => setF(x => ({ ...x, [k]: v }));
    const faltan = faltanEmpresa(f);

    const guardar = async (ev) => {
        ev.preventDefault();
        if (faltan.length) { setEstado({ guardando: false, error: `Falta ${faltan.join(', ')}.` }); return; }
        if (alta && !acepta) { setEstado({ guardando: false, error: 'Para darte de alta tienes que aceptar las condiciones.' }); return; }
        setEstado({ guardando: true, error: null });
        try {
            if (alta) {
                await axios.post(`${API}/alta`, { ...f, acepta_condiciones: true });
                await refrescar();
                navegar('/panel', { replace: true });
            } else {
                const { data } = await axios.put(`${API}/me`, f);
                if (data?.cuenta) ponerCuenta(data.cuenta);
                setEstado({ guardando: false, error: null });
                toast('Datos de la empresa guardados');
            }
        } catch (err) {
            setEstado({ guardando: false, error: mensajeError(err, 'No hemos podido guardar los datos.') });
        }
    };

    return (
        <form onSubmit={guardar}>
            <section className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <p className="ca-eyebrow">La empresa instaladora</p>
                <h2 className="ca-display ca-h3" style={{ marginTop: 8 }}>Sale así en la memoria</h2>
                {email && <p className="ca-peq" style={{ marginTop: 8 }}>Cuenta: <b>{email}</b></p>}
                <Texto f={f} set={set} k="empresa" etiqueta="Razón social" mayus autoComplete="organization" />
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Texto f={f} set={set} k="empresa_nif" etiqueta="CIF / NIF" mayus />
                    <Texto f={f} set={set} k="numero_empresa_rite" etiqueta="Nº empresa RITE" opcional mayus />
                </div>
                <label className="ca-check">
                    <input type="checkbox" checked={!!f.es_autonomo} onChange={e => set('es_autonomo', e.target.checked)} />
                    <span>Soy autónomo (firmo yo, sin sociedad)</span>
                </label>
                <Texto f={f} set={set} k="direccion" etiqueta="Domicilio" mayus autoComplete="street-address" />
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Texto f={f} set={set} k="municipio" etiqueta="Municipio" mayus />
                    <Texto f={f} set={set} k="codigo_postal" etiqueta="C. P." inputMode="numeric" maxLength={5} />
                </div>
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Texto f={f} set={set} k="provincia" etiqueta="Provincia" mayus />
                    <Texto f={f} set={set} k="telefono" etiqueta="Teléfono" opcional inputMode="tel" autoComplete="tel" />
                </div>
            </section>

            <section className="ca-card ca-pad ca-in ca-in-2" style={{ marginTop: 14 }}>
                <p className="ca-eyebrow">Quién firma</p>
                <h2 className="ca-display ca-h3" style={{ marginTop: 8 }}>{f.es_autonomo ? 'Tus datos' : 'El representante'}</h2>
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Texto f={f} set={set} k="representante_nombre" etiqueta="Nombre" mayus autoComplete="given-name" />
                    <Texto f={f} set={set} k="representante_apellidos" etiqueta="Apellidos" mayus autoComplete="family-name" />
                </div>
                <div className="ca-grid2" style={{ marginTop: 14 }}>
                    <Texto f={f} set={set} k="representante_nif" etiqueta="DNI / NIE" mayus />
                    <Texto f={f} set={set} k="representante_cargo" etiqueta="Cargo" opcional mayus placeholder="ADMINISTRADOR" />
                </div>
                <label className="ca-check" style={{ marginTop: 6 }}>
                    <input type="checkbox" checked={!!f.tecnico_firmante_distinto} onChange={e => set('tecnico_firmante_distinto', e.target.checked)} />
                    <span>El técnico habilitado que firma es otra persona</span>
                </label>
                {f.tecnico_firmante_distinto && (
                    <>
                        <div className="ca-grid2">
                            <Texto f={f} set={set} k="tecnico_firmante_nombre" etiqueta="Nombre del técnico" mayus />
                            <Texto f={f} set={set} k="tecnico_firmante_apellidos" etiqueta="Apellidos" mayus />
                        </div>
                        <div className="ca-grid2" style={{ marginTop: 14 }}>
                            <Texto f={f} set={set} k="tecnico_firmante_dni" etiqueta="DNI / NIE" mayus />
                            <Texto f={f} set={set} k="tecnico_firmante_carnet_rite" etiqueta="Carné RITE" opcional mayus />
                        </div>
                    </>
                )}
            </section>

            {alta && (
                <label className="ca-check" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} />
                    <span>Acepto las condiciones de uso y que BROKERGY trate estos datos para preparar mis memorias.</span>
                </label>
            )}
            {estado.error && <div style={{ marginTop: 12 }}><Aviso titulo="Revisa esto">{estado.error}</Aviso></div>}
            <div className="ca-btns">
                <button type="submit" className="ca-btn ca-btn-pri" disabled={estado.guardando}>
                    {estado.guardando ? <Spinner /> : <IcoCheck size={18} sw={2.6} />} {alta ? 'Crear mi cuenta' : 'Guardar'}
                </button>
            </div>
        </form>
    );
}

export function Alta() {
    const { nombreSesion } = useRiteAuth();
    const [n, ...a] = String(nombreSesion || '').toUpperCase().split(' ');
    return (
        <Marco>
            <p className="ca-eyebrow ca-in">Alta · dos minutos</p>
            <h1 className="ca-display ca-h2 ca-in" style={{ margin: '8px 2px 0' }}>Los datos de tu empresa</h1>
            <p className="ca-sub ca-in">Se ponen una vez y salen en todas tus memorias. Tu primera memoria es gratis.</p>
            <div style={{ marginTop: 18 }}>
                <FormEmpresa alta inicial={{ representante_nombre: n || '', representante_apellidos: a.join(' ') }} />
            </div>
        </Marco>
    );
}

export function Perfil() {
    const { cuenta, signOut } = useRiteAuth();
    return (
        <Marco>
            <p className="ca-eyebrow ca-in">Mi empresa</p>
            <h1 className="ca-display ca-h2 ca-in" style={{ margin: '8px 2px 18px' }}>{cuenta?.empresa || 'Datos de la empresa'}</h1>
            <FormEmpresa inicial={cuenta} />
            <div className="ca-btns">
                <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/', { replace: true }); }}>Cerrar sesión</button>
            </div>
        </Marco>
    );
}
