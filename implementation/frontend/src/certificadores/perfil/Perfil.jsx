// ─── Perfil — /perfil: los datos del técnico ────────────────────────────────
// Lo que sale en el .cex como técnico certificador. PUT /api/certapp/me con la
// lista blanca del backend (el email, los créditos y el estado no se tocan aquí).
// Guardado EXPLÍCITO (botón): son datos que se escriben una vez.
// Además: dónde trabaja y con qué programa (`comunidades`, `software`, en
// prefs.perfil), cómo entra (Google o email), las condiciones que aceptó y,
// si se dio de alta por email, el teléfono del formulario POR CONFIRMAR: sale
// ya escrito y se guarda solo cuando él pulsa Guardar.
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API, mensajeError } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace, navegar, useRuta } from '../router';
import { Aviso, Campo, useToast } from '../ui/piezas';
import { IcoCheck, IcoSalir, Spinner } from '../ui/Iconos';
import { COMUNIDADES, SOFTWARE } from '../ui/listas';
import { EMAIL_CONTACTO } from '../marca';

const CAMPOS = ['nombre', 'apellidos', 'nif', 'telefono', 'titulacion', 'num_colegiado', 'colegio',
    'empresa', 'empresa_nif', 'direccion', 'codigo_postal', 'municipio', 'provincia'];
const LISTAS = ['comunidades', 'software'];
const MAYUS = new Set(['nif', 'empresa_nif']);
const deCuenta = (c) => ({
    ...Object.fromEntries(CAMPOS.map(k => [k, c?.[k] == null ? '' : String(c[k])])),
    comunidades: Array.isArray(c?.comunidades) ? c.comunidades : [],
    software: Array.isArray(c?.software) ? c.software : [],
});
// Lo que se enseña al abrir: el teléfono por confirmar ya escrito (pero sin guardar).
const inicialDe = (c) => {
    const d = deCuenta(c);
    if (!d.telefono && c?.telefono_por_confirmar) d.telefono = String(c.telefono_por_confirmar);
    return d;
};
const mismaLista = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const vueltaSegura = (v) => (v && v.startsWith('/') && !v.startsWith('//') ? v : null);
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES'); } catch { return ''; } };

function Chips({ lista, valor, onCambiar }) {
    return (
        <div className="ca-opts ca-opts-pc2" role="group">
            {lista.map(o => {
                const sel = valor.includes(o.value);
                return (
                    <button key={o.value} type="button" role="checkbox" aria-checked={sel} className={`ca-opt${sel ? ' ca-opt-sel' : ''}`}
                        onClick={() => onCambiar(sel ? valor.filter(x => x !== o.value) : [...valor, o.value])}>
                        <span><b>{o.label}</b></span>
                        <span className="ca-opt-marca ca-opt-cuad">{sel && <IcoCheck size={14} sw={3} />}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default function Perfil() {
    const { cuenta, email, session, refrescar, signOut } = useCertappAuth();
    const { query } = useRuta();
    const toast = useToast();
    const [f, setF] = useState(() => inicialDe(cuenta));
    const [base, setBase] = useState(() => deCuenta(cuenta));
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const vuelta = vueltaSegura(query.get('vuelta'));
    const mostrado = useRef(f);   // lo último que se puso en el formulario sin que él lo tocara

    // Si /me llega después (o cambia), se recoge sin pisar lo que se esté escribiendo.
    useEffect(() => {
        setBase(deCuenta(cuenta));
        const ini = inicialDe(cuenta);
        const antes = mostrado.current;   // el actualizador corre después: se captura ya
        setF(prev => (JSON.stringify(prev) === JSON.stringify(antes) ? ini : prev));
        mostrado.current = ini;
    }, [cuenta]);

    const cambios = useMemo(() => {
        const c = {};
        for (const k of CAMPOS) if ((f[k] || '').trim() !== (base[k] || '').trim()) c[k] = f[k].trim() || null;
        for (const k of LISTAS) if (!mismaLista(f[k], base[k])) c[k] = f[k];
        return c;
    }, [f, base]);
    const hayCambios = Object.keys(cambios).length > 0;
    const faltan = ['nombre', 'nif', 'titulacion'].filter(k => !String(f[k] || '').trim());
    const telefonoPorConfirmar = !base.telefono && !!cuenta?.telefono_por_confirmar;

    const guardar = async (e) => {
        e.preventDefault();
        if (!hayCambios) { if (vuelta) navegar(vuelta); return; }
        setGuardando(true); setError(null);
        try {
            const { data } = await axios.put(`${API}/me`, cambios);
            const nueva = deCuenta(data?.cuenta || { ...cuenta, ...cambios });
            setBase(nueva); setF(nueva); mostrado.current = nueva;
            await refrescar?.();
            toast('Perfil guardado.');
            if (vuelta) navegar(vuelta);
        } catch (err) {
            setError(mensajeError(err, 'No se ha podido guardar el perfil.'));
        } finally { setGuardando(false); }
    };

    const campo = (k, etiqueta, extra = {}) => (
        <Campo etiqueta={etiqueta} opcional={extra.opcional} ayuda={extra.ayuda}>
            <input className={`ca-input${MAYUS.has(k) ? ' ca-input-mayus' : ''}`} value={f[k]} autoComplete={extra.ac || 'off'}
                type={extra.type || 'text'} inputMode={extra.inputMode} maxLength={extra.max || 160}
                onChange={e => setF(s => ({ ...s, [k]: MAYUS.has(k) ? e.target.value.toUpperCase() : e.target.value }))} />
        </Campo>
    );
    const creditos = Number(cuenta?.creditos ?? 0);
    const proveedores = session?.user?.app_metadata?.providers || [session?.user?.app_metadata?.provider].filter(Boolean);
    const conGoogle = proveedores.includes('google');
    const condiciones = cuenta?.condiciones;

    return (
        <div className="ca-col">
            <section className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <p className="ca-eyebrow">Mi cuenta</p>
                <div className="ca-cifra" style={{ marginTop: 8 }}>
                    <b>{creditos}</b><span>{creditos === 1 ? 'certificado disponible' : 'certificados disponibles'}</span>
                </div>
                <dl className="ca-dl" style={{ marginTop: 14 }}>
                    <div><dt>Email</dt><dd>{email || cuenta?.email || '—'}</dd></div>
                    <div><dt>Usados</dt><dd>{cuenta?.creditos_usados ?? 0} · <Enlace to="/gastos">ver mis gastos</Enlace></dd></div>
                    <div><dt>Entras con</dt><dd>{conGoogle ? 'Google o un enlace a tu email' : 'Un enlace a tu email o tu contraseña'}</dd></div>
                    <div>
                        <dt>Condiciones</dt>
                        <dd>{condiciones?.at ? `Aceptadas el ${fecha(condiciones.at)}` : '—'} · <Enlace to="/condiciones" target="_blank" rel="noopener">leerlas</Enlace></dd>
                    </div>
                </dl>
                <p className="ca-peq" style={{ marginTop: 10 }}>
                    ¿Necesitas más certificados? Escríbenos a <a href={`mailto:${EMAIL_CONTACTO}`}>{EMAIL_CONTACTO}</a>.{' '}
                    <Enlace to="/recuperar">Poner o cambiar mi contraseña</Enlace>.
                </p>
            </section>

            <form className="ca-card ca-pad ca-in-2" style={{ marginTop: 12 }} onSubmit={guardar} noValidate>
                <h1 className="ca-display ca-h2" style={{ margin: 0 }}>Tus datos de <span className="ca-mark">técnico</span></h1>
                <p className="ca-txt">Salen en el certificado como técnico certificador. Los puedes cambiar después en CE3X.</p>
                {faltan.length > 0 && (
                    <Aviso tono="ambar" className="ca-in" titulo="Te falta lo básico">
                        Sin nombre, NIF y titulación el certificado sale sin técnico y tendrás que ponerlo en CE3X.
                    </Aviso>
                )}
                {telefonoPorConfirmar && (
                    <Aviso tono="ambar" className="ca-in" titulo="¿Es este tu teléfono?">
                        Es el que escribiste al apuntarte. Revísalo y pulsa Guardar para que te avisemos por WhatsApp cuando tu certificado esté listo.
                    </Aviso>
                )}
                <h2 className="ca-sec">Tú</h2>
                <div className="ca-grid2">{campo('nombre', 'Nombre', { max: 80 })}{campo('apellidos', 'Apellidos', { max: 120 })}</div>
                <div className="ca-grid2">{campo('nif', 'NIF', { max: 20 })}{campo('telefono', 'Teléfono', { type: 'tel', inputMode: 'tel', max: 30, ayuda: 'Te avisamos por WhatsApp aquí.' })}</div>
                <h2 className="ca-sec">Titulación</h2>
                {campo('titulacion', 'Titulación', { max: 120, ayuda: 'Por ejemplo: Arquitecto técnico, Ingeniero técnico industrial.' })}
                <div className="ca-grid2">{campo('num_colegiado', 'Nº de colegiado', { max: 40, opcional: true })}{campo('colegio', 'Colegio', { opcional: true })}</div>
                <h2 className="ca-sec">Empresa (si certificas con una)</h2>
                <div className="ca-grid2">{campo('empresa', 'Empresa', { opcional: true })}{campo('empresa_nif', 'CIF', { max: 20, opcional: true })}</div>
                <h2 className="ca-sec">Dirección profesional</h2>
                {campo('direccion', 'Dirección', { max: 200, opcional: true })}
                <div className="ca-grid2">
                    {campo('codigo_postal', 'Código postal', { inputMode: 'numeric', max: 10, opcional: true })}
                    {campo('municipio', 'Municipio', { max: 80, opcional: true })}
                </div>
                {campo('provincia', 'Provincia', { max: 60, opcional: true })}
                <h2 className="ca-sec">Dónde certificas</h2>
                <p className="ca-peq" style={{ marginTop: -4 }}>Las comunidades en las que trabajas: para el registro de cada una.</p>
                <Chips lista={COMUNIDADES} valor={f.comunidades} onCambiar={v => setF(s => ({ ...s, comunidades: v }))} />
                <h2 className="ca-sec">Con qué programas</h2>
                <Chips lista={SOFTWARE} valor={f.software} onCambiar={v => setF(s => ({ ...s, software: v }))} />

                {error && <p className="ca-error" role="alert">{error}</p>}
                <div className="ca-btns">
                    <button type="submit" className="ca-btn ca-btn-pri" disabled={guardando || (!hayCambios && !vuelta)}>
                        {guardando ? <><Spinner /> Guardando…</> : hayCambios ? <><IcoCheck /> Guardar{vuelta ? ' y volver' : ''}</> : vuelta ? 'Volver a la obra' : <><IcoCheck /> Guardado</>}
                    </button>
                </div>
            </form>

            <div className="ca-btns" style={{ marginTop: 18 }}>
                <button type="button" className="ca-btn ca-btn-sec" onClick={async () => { await signOut(); navegar('/'); }}><IcoSalir /> Cerrar sesión</button>
            </div>
        </div>
    );
}
