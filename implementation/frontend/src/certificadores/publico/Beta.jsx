// ─── Beta — la lista de espera (cee.brokergy.es/beta) ───────────────────────
// Se puede mandar el enlace suelto a la gente. En el móvil, una pregunta por
// pantalla (tocar una opción avanza); en el ordenador, todo en una tarjeta.
// → POST /api/public/certapp/beta (honeypot `web`, origen y utm de la URL).
// Antirrobots: al montar, GET /beta/token → { token }, que va como `form_token`
// (el servidor lo quiere con ≥ 3 s y ≤ 2 h de vida; si responde 400 FORM_TOKEN
// se pide otro y se deja reintentar sin perder nada). Turnstile SOLO si existe
// VITE_TURNSTILE_SITE_KEY (hoy no): entonces se pinta y va `turnstile_token`.
// La respuesta del alta es siempre la misma, esté o no el email ya apuntado.
// Lo escrito se guarda en ESTE navegador mientras no se envía (por si se cierra
// a medias); al enviarlo se borra.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { API_PUB, errorDe, mensajeError } from '../api';
import { Enlace } from '../router';
import { useIsMobile } from '../../utils/useIsMobile';
import { CCAA_LIST, PROV_NOMBRE } from '../../utils/direccionCatastral';
import { BotonCopiar, CabeceraPublica, Campo, Firma, Papel } from '../ui/piezas';
import { CheckDibujado, IcoAtras, IcoCheck, IcoFlecha, Spinner } from '../ui/Iconos';
import { DOMINIO } from '../marca';

const BORRADOR = 'certapp_beta_borrador';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const TOKEN_MIN_MS = 3200;              // el servidor exige ≥ 3 s
const TOKEN_MAX_MS = 110 * 60 * 1000;   // y ≤ 2 h: se renueva antes
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

let promesaTurnstile = null;
function cargarTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!promesaTurnstile) {
        promesaTurnstile = new Promise((resolve, reject) => {
            const sc = document.createElement('script');
            sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            sc.async = true;
            sc.onload = () => resolve(window.turnstile);
            sc.onerror = () => { promesaTurnstile = null; reject(new Error('No se ha podido cargar la comprobación de seguridad.')); };
            document.head.appendChild(sc);
        });
    }
    return promesaTurnstile;
}

/** El recuadro de Cloudflare Turnstile (solo con VITE_TURNSTILE_SITE_KEY). */
function Turnstile({ siteKey, onToken }) {
    const caja = useRef(null);
    const cb = useRef(onToken);
    useEffect(() => { cb.current = onToken; });
    useEffect(() => {
        let vivo = true;
        let widget = null;
        cargarTurnstile().then((ts) => {
            if (!vivo || !caja.current || !ts) return;
            widget = ts.render(caja.current, {
                sitekey: siteKey, language: 'es',
                callback: (t) => cb.current(t),
                'expired-callback': () => cb.current(null),
                'error-callback': () => cb.current(null),
            });
        }).catch(() => cb.current(null));
        return () => { vivo = false; try { if (widget != null) window.turnstile?.remove(widget); } catch { /* noop */ } };
    }, [siteKey]);
    return <div ref={caja} className="ca-turnstile" style={{ marginTop: 14, minHeight: 65 }} />;
}

const PERFILES = [
    { value: 'AUTONOMO', label: 'Soy técnico y certifico yo', sub: 'Autónomo o profesional por mi cuenta' },
    { value: 'EMPRESA_PROPIA', label: 'Empresa con técnicos en plantilla', sub: 'Los CEE los hacéis vosotros' },
    { value: 'EMPRESA_SUBCONTRATA', label: 'Empresa que encarga los CEE a otros', sub: 'Subcontratáis la certificación' },
    { value: 'OTRO', label: 'Otro' },
];
const CEE_MES = [
    { value: '1-5', label: 'De 1 a 5' }, { value: '6-15', label: 'De 6 a 15' },
    { value: '16-40', label: 'De 16 a 40' }, { value: '40+', label: 'Más de 40' },
];
const MIN_CEE = [
    { value: '<30', label: 'Menos de 30 minutos' }, { value: '30-60', label: 'De 30 minutos a 1 hora' },
    { value: '60-120', label: 'De 1 a 2 horas' }, { value: '>120', label: 'Más de 2 horas' },
];
const MIN_PRESENTAR = [
    { value: '<10', label: 'Menos de 10 minutos' }, { value: '10-20', label: 'De 10 a 20 minutos' },
    { value: '20-40', label: 'De 20 a 40 minutos' }, { value: '>40', label: 'Más de 40 minutos' },
];
const INTERES = [
    { value: 'SI', label: 'Sí, me interesa' },
    { value: 'QUIZA', label: 'Quizá, depende de cómo' },
    { value: 'NO', label: 'No, prefiero hacerlo yo' },
];
const SOFTWARE = [
    { value: 'CE3X', label: 'CE3X' }, { value: 'HULC', label: 'HULC' },
    { value: 'CYPETHERM', label: 'CYPETHERM' }, { value: 'OTRO', label: 'Otro' },
];
const MINUS = new Set(['de', 'la', 'y', 'del', 'las', 'los']);
const titulo = (s) => String(s || '').toLowerCase().split(' ')
    .map((w, i) => (i > 0 && MINUS.has(w) ? w : w.replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())))
    .join(' ').replace(/^S\.c\./, 'S.C.');
const PROVINCIAS = Object.values(PROV_NOMBRE).map(titulo).sort((a, b) => a.localeCompare(b, 'es'));
const COMUNIDADES = CCAA_LIST.map(c => ({ value: c, label: titulo(c) }));

const VACIO = {
    nombre: '', email: '', telefono: '', provincia: '', perfil: '', empresa: '',
    cee_mes: '', minutos_cee: '', minutos_presentar: '', interes_ia_presentar: '',
    coste_subcontrata_eur: '', software: [], software_otro: '', comunidades: [], comentarios: '',
    consentimiento: false, acepta_comunicaciones: false, web: '',
};

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// Una pregunta por pantalla en el móvil. `auto`: tocar una opción avanza.
const PASOS = [
    { id: 'datos', titulo: 'Para empezar, ¿quién eres?', ayuda: 'Para escribirte cuando tengas plaza.' },
    { id: 'perfil', titulo: '¿Cómo trabajas?', auto: true },
    { id: 'empresa', titulo: '¿Cómo se llama la empresa?', cuando: f => f.perfil && f.perfil !== 'AUTONOMO', opcional: true },
    { id: 'cee_mes', titulo: '¿Cuántos CEE haces o encargas al mes?', auto: true },
    { id: 'minutos_cee', titulo: '¿Cuánto tardas en hacer un CEE, sin contar la visita?', ayuda: 'La oficina: medir, meterlo en el programa, revisar.', auto: true },
    { id: 'minutos_presentar', titulo: '¿Y en presentarlo en el registro de tu comunidad?', auto: true },
    { id: 'interes_ia_presentar', titulo: '¿Te interesaría que una IA lo presentara en el registro por ti?', ayuda: 'Con tu certificado electrónico y tu permiso en cada uno.', auto: true },
    { id: 'coste', titulo: '¿Cuánto pagas por cada CEE que encargas?', cuando: f => f.perfil === 'EMPRESA_SUBCONTRATA', opcional: true },
    { id: 'software', titulo: '¿Con qué programas certificas?', ayuda: 'Marca todos los que uses.', opcional: true },
    { id: 'comunidades', titulo: '¿En qué comunidades autónomas trabajas?', ayuda: 'Marca todas.', opcional: true },
    { id: 'comentarios', titulo: '¿Qué te quitaría más trabajo?', ayuda: 'Lo que más tiempo te lleva de cada certificado, o lo que te gustaría que hiciera la app.', opcional: true },
    { id: 'enviar', titulo: 'Último paso' },
];

function Opciones({ lista, valor, onElegir, multi = false, cols }) {
    return (
        <div className={`ca-opts${cols ? ' ca-opts-pc2' : ''}`} role={multi ? 'group' : 'radiogroup'}>
            {lista.map(o => {
                const sel = multi ? (valor || []).includes(o.value) : valor === o.value;
                return (
                    <button key={o.value} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={sel}
                        className={`ca-opt${sel ? ' ca-opt-sel' : ''}`} onClick={() => onElegir(o.value)}>
                        <span><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span>
                        <span className={`ca-opt-marca${multi ? ' ca-opt-cuad' : ''}`}>{sel && <IcoCheck size={14} sw={3} />}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default function Beta({ query }) {
    const movil = useIsMobile();
    const [f, setF] = useState(() => {
        try { return { ...VACIO, ...JSON.parse(localStorage.getItem(BORRADOR) || '{}'), web: '' }; } catch { return VACIO; }
    });
    const [paso, setPaso] = useState(0);
    const [errores, setErrores] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState(null);
    const [hecho, setHecho] = useState(false);
    const [tsToken, setTsToken] = useState(null);
    const [tsVuelta, setTsVuelta] = useState(0); // al fallar un envío, el Turnstile se pinta de nuevo
    const formToken = useRef({ token: null, at: 0 });

    const pedirFormToken = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API_PUB}/beta/token`);
            formToken.current = { token: data?.token || null, at: Date.now() };
        } catch {
            formToken.current = { token: null, at: Date.now() }; // se reintenta al enviar
        }
        return formToken.current;
    }, []);
    useEffect(() => { pedirFormToken(); }, [pedirFormToken]);

    // Origen y campaña: lo que traiga la URL (el enlace suelto también cuenta).
    const origen = useMemo(() => {
        const o = query.get('origen') || query.get('utm_source');
        if (o) return o.slice(0, 60);
        try {
            if (document.referrer && new URL(document.referrer).host !== window.location.host) return `ref:${new URL(document.referrer).host}`.slice(0, 60);
        } catch { /* noop */ }
        return 'enlace directo';
    }, [query]);
    const utm = useMemo(() => {
        const u = {};
        for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
            const v = query.get(`utm_${k}`);
            if (v) u[k] = v.slice(0, 120);
        }
        return Object.keys(u).length ? u : null;
    }, [query]);

    useEffect(() => {
        if (hecho) return;
        try {
            const { web, consentimiento, ...guardar } = f; // eslint-disable-line no-unused-vars
            localStorage.setItem(BORRADOR, JSON.stringify(guardar));
        } catch { /* sin almacenamiento: no pasa nada */ }
    }, [f, hecho]);

    const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setErrores(e => ({ ...e, [k]: null })); };
    const alternar = (k, v) => setF(x => ({ ...x, [k]: (x[k] || []).includes(v) ? x[k].filter(y => y !== v) : [...(x[k] || []), v] }));

    const pasos = PASOS.filter(p => !p.cuando || p.cuando(f));
    const actual = pasos[Math.min(paso, pasos.length - 1)];

    const validar = (ids) => {
        const e = {};
        if (ids.includes('datos')) {
            if (f.nombre.trim().length < 2) e.nombre = 'Dinos tu nombre.';
            if (!emailValido(f.email)) e.email = 'Revisa el email: así no nos llegaría.';
        }
        if (ids.includes('perfil') && !f.perfil) e.perfil = 'Elige la que más se parezca.';
        if (ids.includes('enviar') && !f.consentimiento) e.consentimiento = 'Necesitamos tu permiso para guardar tus datos y escribirte.';
        if (ids.includes('enviar') && TURNSTILE_SITE_KEY && !tsToken) e.turnstile = 'Espera a que termine la comprobación de seguridad del recuadro.';
        setErrores(e);
        return Object.keys(e).length === 0;
    };

    const siguiente = () => {
        if (!validar([actual.id])) return;
        setPaso(p => Math.min(p + 1, pasos.length - 1));
        window.scrollTo({ top: 0 });
    };
    const elegirYSeguir = (k, v) => {
        set(k, v);
        if (movil) setTimeout(() => { setPaso(p => Math.min(p + 1, pasos.length - 1)); window.scrollTo({ top: 0 }); }, 160);
    };

    const enviar = async () => {
        if (!validar(['datos', 'perfil', 'enviar'])) {
            if (movil) {
                const malo = !f.nombre.trim() || !emailValido(f.email) ? 'datos' : !f.perfil ? 'perfil' : 'enviar';
                setPaso(pasos.findIndex(p => p.id === malo));
            }
            return;
        }
        setEnviando(true); setErrorEnvio(null);
        // El token del formulario: si no llegó o es viejo, otro; y nunca con menos de 3 s.
        let tk = formToken.current;
        if (!tk.token || Date.now() - tk.at > TOKEN_MAX_MS) tk = await pedirFormToken();
        const falta = TOKEN_MIN_MS - (Date.now() - tk.at);
        if (falta > 0) await esperar(falta);
        const software = f.software.map(s => (s === 'OTRO' && f.software_otro.trim() ? `OTRO: ${f.software_otro.trim()}` : s));
        const respuestas = { ...f, software };
        delete respuestas.web; delete respuestas.consentimiento;
        try {
            await axios.post(`${API_PUB}/beta`, {
                nombre: f.nombre.trim(),
                email: f.email.trim().toLowerCase(),
                telefono: f.telefono.trim() || null,
                provincia: f.provincia || null,
                perfil: f.perfil || null,
                empresa: f.perfil !== 'AUTONOMO' ? (f.empresa.trim() || null) : null,
                cee_mes: f.cee_mes || null,
                minutos_cee: f.minutos_cee || null,
                minutos_presentar: f.minutos_presentar || null,
                interes_ia_presentar: f.interes_ia_presentar || null,
                coste_subcontrata_eur: f.perfil === 'EMPRESA_SUBCONTRATA' && f.coste_subcontrata_eur !== ''
                    ? Number(String(f.coste_subcontrata_eur).replace(',', '.')) || null : null,
                software,
                comunidades: f.comunidades,
                comentarios: f.comentarios.trim() || null,
                consentimiento: true,
                acepta_comunicaciones: !!f.acepta_comunicaciones,
                web: f.web, // trampa para robots: una persona no la ve
                form_token: tk.token || undefined,
                turnstile_token: TURNSTILE_SITE_KEY ? (tsToken || undefined) : undefined,
                origen,
                utm,
                respuestas,
            });
            try { localStorage.removeItem(BORRADOR); } catch { /* noop */ }
            setHecho(true);
            window.scrollTo({ top: 0 });
        } catch (err) {
            if (TURNSTILE_SITE_KEY) { setTsToken(null); setTsVuelta(v => v + 1); } // el de Turnstile es de un solo uso
            if (err.response?.status === 400 && errorDe(err).code === 'FORM_TOKEN') {
                await pedirFormToken();
                setErrorEnvio('Por seguridad hemos renovado el formulario. Lo que has escrito sigue aquí: vuelve a pulsar «Apuntarme».');
            } else {
                setErrorEnvio(mensajeError(err, 'No se ha podido enviar. Vuelve a intentarlo en un momento.'));
            }
        } finally {
            setEnviando(false);
        }
    };

    if (hecho) {
        const enlace = `https://${DOMINIO}/beta?origen=compartido`;
        return (
            <Papel>
                <div className="ca-col">
                    <CabeceraPublica />
                    <div className="ca-card ca-pad ca-in">
                        <div className="ca-filete" />
                        <CheckDibujado />
                        <p className="ca-eyebrow ca-eyebrow-verde" style={{ marginTop: 16 }}>Apuntado</p>
                        <h1 className="ca-display ca-h2" style={{ marginTop: 8 }}>Ya estás en la <span className="ca-mark">lista</span></h1>
                        <p className="ca-txt">
                            Gracias, <b>{f.nombre.split(' ')[0]}</b>. Abrimos plazas poco a poco: cuando tengas la tuya te escribimos
                            con el enlace para crear tu contraseña{f.telefono ? ' (por email y WhatsApp)' : ''}.
                        </p>
                        <div className="ca-crema" style={{ marginTop: 18 }}>
                            <p className="ca-peq" style={{ margin: 0 }}>¿Conoces a otro certificador al que le pueda servir? Pásale el enlace:</p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                                <span className="ca-mono" style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{DOMINIO}/beta</span>
                                <BotonCopiar texto={enlace} />
                            </div>
                        </div>
                        <div className="ca-btns"><Enlace to="/" className="ca-btn ca-btn-sec">Volver al inicio</Enlace></div>
                    </div>
                    <Firma />
                </div>
            </Papel>
        );
    }

    // ── Las piezas de cada pregunta (sirven al móvil y al ordenador) ─────────
    const bloque = (id) => {
        switch (id) {
            case 'datos':
                return (
                    <>
                        <Campo etiqueta="Nombre y apellidos">
                            <input className="ca-input" value={f.nombre} onChange={e => set('nombre', e.target.value)} autoComplete="name" aria-invalid={!!errores.nombre} maxLength={120} />
                        </Campo>
                        {errores.nombre && <p className="ca-error" style={{ gridColumn: '1 / -1' }}>{errores.nombre}</p>}
                        <Campo etiqueta="Email">
                            <input className="ca-input" type="email" inputMode="email" value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" aria-invalid={!!errores.email} maxLength={160} />
                        </Campo>
                        {errores.email && <p className="ca-error" style={{ gridColumn: '1 / -1' }}>{errores.email}</p>}
                        <Campo etiqueta="Teléfono o WhatsApp" opcional>
                            <input className="ca-input" type="tel" inputMode="tel" value={f.telefono} onChange={e => set('telefono', e.target.value)} autoComplete="tel" maxLength={30} />
                        </Campo>
                        <Campo etiqueta="Provincia" opcional>
                            <select className="ca-input" value={f.provincia} onChange={e => set('provincia', e.target.value)}>
                                <option value="">Elige…</option>
                                {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </Campo>
                    </>
                );
            case 'perfil':
                return (
                    <>
                        <Opciones lista={PERFILES} valor={f.perfil} onElegir={v => elegirYSeguir('perfil', v)} cols={!movil} />
                        {errores.perfil && <p className="ca-error">{errores.perfil}</p>}
                    </>
                );
            case 'empresa':
                return (
                    <Campo etiqueta="Empresa" opcional>
                        <input className="ca-input" value={f.empresa} onChange={e => set('empresa', e.target.value)} autoComplete="organization" maxLength={160} />
                    </Campo>
                );
            case 'cee_mes': return <Opciones lista={CEE_MES} valor={f.cee_mes} onElegir={v => elegirYSeguir('cee_mes', v)} cols={!movil} />;
            case 'minutos_cee': return <Opciones lista={MIN_CEE} valor={f.minutos_cee} onElegir={v => elegirYSeguir('minutos_cee', v)} cols={!movil} />;
            case 'minutos_presentar': return <Opciones lista={MIN_PRESENTAR} valor={f.minutos_presentar} onElegir={v => elegirYSeguir('minutos_presentar', v)} cols={!movil} />;
            case 'interes_ia_presentar': return <Opciones lista={INTERES} valor={f.interes_ia_presentar} onElegir={v => elegirYSeguir('interes_ia_presentar', v)} />;
            case 'coste':
                return (
                    <Campo etiqueta="Precio por CEE" opcional sufijo="€" ayuda="Lo que pagas de media al técnico, sin IVA.">
                        <input className="ca-input" inputMode="decimal" value={f.coste_subcontrata_eur} onChange={e => set('coste_subcontrata_eur', e.target.value.replace(/[^\d.,]/g, ''))} maxLength={8} />
                    </Campo>
                );
            case 'software':
                return (
                    <>
                        <Opciones lista={SOFTWARE} valor={f.software} onElegir={v => alternar('software', v)} multi cols={!movil} />
                        {f.software.includes('OTRO') && (
                            <Campo etiqueta="¿Cuál?" opcional>
                                <input className="ca-input" value={f.software_otro} onChange={e => set('software_otro', e.target.value)} maxLength={80} />
                            </Campo>
                        )}
                    </>
                );
            case 'comunidades': return <Opciones lista={COMUNIDADES} valor={f.comunidades} onElegir={v => alternar('comunidades', v)} multi cols={!movil} />;
            case 'comentarios':
                return (
                    <Campo>
                        <textarea className="ca-input" rows={5} value={f.comentarios} onChange={e => set('comentarios', e.target.value)} maxLength={2000}
                            placeholder="Por ejemplo: medir las ventanas, meter los cerramientos, presentar en el registro…" />
                    </Campo>
                );
            case 'enviar':
                return (
                    <>
                        <label className="ca-check">
                            <input type="checkbox" checked={f.consentimiento} onChange={e => set('consentimiento', e.target.checked)} />
                            <span>He leído la <Enlace to="/privacidad" target="_blank" rel="noopener">política de privacidad</Enlace> y acepto que BROKERGY guarde estos datos para gestionar la lista de espera de la beta y escribirme sobre ella.</span>
                        </label>
                        {errores.consentimiento && <p className="ca-error">{errores.consentimiento}</p>}
                        <label className="ca-check">
                            <input type="checkbox" checked={f.acepta_comunicaciones} onChange={e => set('acepta_comunicaciones', e.target.checked)} />
                            <span>Quiero recibir novedades de la app (pocas, y te puedes dar de baja cuando quieras). <span className="ca-peq">Opcional.</span></span>
                        </label>
                        {TURNSTILE_SITE_KEY && (
                            <>
                                <Turnstile key={tsVuelta} siteKey={TURNSTILE_SITE_KEY} onToken={(t) => { setTsToken(t); if (t) setErrores(e => ({ ...e, turnstile: null })); }} />
                                {errores.turnstile && <p className="ca-error">{errores.turnstile}</p>}
                            </>
                        )}
                        {/* Trampa para robots: fuera de la vista y del tabulador. */}
                        <div className="ca-trampa" aria-hidden="true">
                            <label>Web<input tabIndex={-1} autoComplete="off" value={f.web} onChange={e => set('web', e.target.value)} name="web" /></label>
                        </div>
                        {errorEnvio && <p className="ca-error">{errorEnvio}</p>}
                    </>
                );
            default: return null;
        }
    };

    // ── Móvil: una pregunta por pantalla ─────────────────────────────────────
    if (movil) {
        const idx = Math.min(paso, pasos.length - 1);
        const ultimo = actual.id === 'enviar';
        return (
            <Papel>
                <div className="ca-col" style={{ paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
                    <CabeceraPublica derecha={<span className="ca-pill">{idx + 1} / {pasos.length}</span>} />
                    <div className="ca-barra" aria-hidden="true"><i style={{ width: `${Math.round(100 * (idx + 1) / pasos.length)}%` }} /></div>
                    <div className="ca-in" key={actual.id} style={{ marginTop: 22 }}>
                        {idx === 0 && <p className="ca-eyebrow">Lista de espera de la beta</p>}
                        <h1 className="ca-display ca-pregunta" style={{ marginTop: idx === 0 ? 8 : 0 }}>{actual.titulo}</h1>
                        {actual.ayuda && <p className="ca-preg-ayuda">{actual.ayuda}</p>}
                        <div style={{ marginTop: 18 }}>{bloque(actual.id)}</div>
                    </div>
                </div>
                <div className="ca-inf">
                    <div className="ca-inf-in">
                        {idx > 0 && (
                            <button type="button" className="ca-btn ca-btn-sec" onClick={() => setPaso(p => Math.max(0, p - 1))} aria-label="Atrás"><IcoAtras /></button>
                        )}
                        {ultimo ? (
                            <button type="button" className="ca-btn ca-btn-pri" onClick={enviar} disabled={enviando}>
                                {enviando ? <><Spinner /> Enviando…</> : 'Apuntarme'}
                            </button>
                        ) : (
                            <button type="button" className="ca-btn ca-btn-pri" onClick={siguiente}>
                                {actual.opcional && !tieneValor(actual.id, f) ? 'Saltar' : 'Siguiente'} <IcoFlecha />
                            </button>
                        )}
                    </div>
                </div>
            </Papel>
        );
    }

    // ── Ordenador: todo en una tarjeta ───────────────────────────────────────
    return (
        <Papel>
            <div className="ca-col" style={{ maxWidth: 720 }}>
                <CabeceraPublica derecha={<Enlace to="/entrar" className="ca-link">Entrar</Enlace>} />
                <p className="ca-eyebrow">Lista de espera de la beta</p>
                <h1 className="ca-display ca-h1">Apúntate a la <span className="ca-mark">beta</span></h1>
                <p className="ca-sub">Unas preguntas sobre cómo trabajas, para preparar la app con lo que de verdad te quita tiempo. Son dos minutos.</p>
                <div className="ca-card ca-pad ca-stack">
                    <div className="ca-filete" />
                    {pasos.map((p, i) => (
                        <section key={p.id} style={{ marginTop: i === 0 ? 0 : 30 }}>
                            <h2 className="ca-display ca-h3">{p.id === 'enviar' ? 'Tus permisos' : p.titulo}</h2>
                            {p.ayuda && p.id !== 'datos' && <p className="ca-preg-ayuda">{p.ayuda}</p>}
                            <div style={{ marginTop: 14 }}>
                                {p.id === 'datos' ? (
                                    <div className="ca-grid2" style={{ rowGap: 14 }}>{bloque('datos')}</div>
                                ) : bloque(p.id)}
                            </div>
                        </section>
                    ))}
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-pri" onClick={enviar} disabled={enviando}>
                            {enviando ? <><Spinner /> Enviando…</> : <>Apuntarme a la beta <IcoFlecha /></>}
                        </button>
                    </div>
                </div>
                <Firma />
            </div>
        </Papel>
    );
}

function tieneValor(id, f) {
    switch (id) {
        case 'empresa': return !!f.empresa.trim();
        case 'coste': return f.coste_subcontrata_eur !== '';
        case 'software': return f.software.length > 0;
        case 'comunidades': return f.comunidades.length > 0;
        case 'comentarios': return !!f.comentarios.trim();
        default: return true;
    }
}
