// ─── ConfirmarVivienda.jsx ───────────────────────────────────────────────────
// El segundo tramo de la aceptación de la propuesta (/firma/:id): tres
// preguntas de la vivienda, UNA POR PANTALLA, y un resumen con el botón de
// aceptar. Qué se pregunta y por qué: logic/confirmacionCliente.js.
//
// POR QUÉ PANTALLAS Y NO SCROLL: el 90 % de las aceptaciones se hacen con el
// móvil. Una pregunta por pantalla cabe entera sin desplazarse, no se puede
// dejar ninguna atrás sin contestar y es el mismo gesto que el formulario de
// captación, que el cliente ya conoce. Los datos personales se quedan en su
// formulario de siempre: vienen rellenos y ahí solo se repasan.
//
// REGLA — tocar una opción AVANZA sola, salvo que abra una sub-pregunta (la
// potencia de las placas, cuántos aires): ahí se contesta y se pulsa Continuar.
// REGLA — desde el resumen, "Cambiar" lleva a la pregunta y al contestar se
// VUELVE al resumen, no a la pregunta siguiente.
// REGLA — el texto secundario se tiene que leer en el móvil: en el tema oscuro,
// a /35 no se leía en un iPhone (2026-09-29). Desde el 24/10/2026 va en el
// estilo «carta de pago» (gris #55585f sobre blanco, AA) con las clases `.fp-`
// de AceptarPropuestaView: este componente solo se pinta dentro de esa página.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { CampoDecimal } from '../../../components/CampoDecimal';
import {
    EMISOR_OPCIONES, PLACAS_OPCIONES, AIRES_OPCIONES, MAX_AIRES,
    etiquetaAires,
} from '../../expedientes/logic/confirmacionCliente';
import { FV } from '../../expedientes/logic/fotovoltaica';
import {
    IconRadiador, IconSueloRadiante, IconMixto, IconNoSe,
    IconPlacas, IconPlacasFuturo, IconSinPlacas, IconAire, IconSinAire,
} from '../../../components/IconosVivienda';

const ICONO_EMISOR = { radiadores: IconRadiador, suelo: IconSueloRadiante, mixto: IconMixto, no_se: IconNoSe };
const ICONO_PLACAS = { [FV.SI]: IconPlacas, [FV.FUTURO]: IconPlacasFuturo, [FV.NO]: IconSinPlacas };
const ICONO_AIRE = { true: IconAire, false: IconSinAire };

// Color de la baldosa del dibujo por tema: calor en naranja, sol en verde
// (energía), aire y «no lo sé» en crema. Las clases son del CSS de la página
// (`.fp-`, AceptarPropuestaView): este componente solo se pinta dentro de ella.
const TINTE = {
    calor: 'fp-dib-calor',
    sol: 'fp-dib-sol',
    aire: 'fp-dib-aire',
    neutro: 'fp-dib-neutro',
};

const PASOS = ['emisor', 'placas', 'aires', 'revisar'];

/** Las placas, dichas como las diría el cliente (no con la etiqueta del staff). */
function placasParaElCliente(conf) {
    if (conf.placas === FV.SI) {
        const kwp = Number(conf.placas_kwp);
        return kwp > 0 ? `Sí · ${kwp.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kWp` : 'Sí · no sé la potencia';
    }
    return PLACAS_OPCIONES.find(o => o.value === conf.placas)?.label || '—';
}
const AVANCE_MS = 280;

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoFlecha = (p) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;
const IcoAtras = (p) => <Ico {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Ico>;
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;

/** Una opción grande: dibujo, texto y la marca de elegida. */
function Opcion({ icono, tinte, label, sub, sel, onClick }) {
    const Icono = icono;
    return (
        <button type="button" onClick={onClick} aria-pressed={sel}
            className={`fp-opc${sel ? ' fp-opc-sel' : ''}`}>
            <span className={`fp-opc-dib ${tinte}`}>
                <Icono className="w-9 h-9" />
            </span>
            <span className="fp-opc-cuerpo">
                <span className="fp-opc-label">{label}</span>
                {sub && <span className="fp-opc-sub">{sub}</span>}
            </span>
            <span className="fp-radio" aria-hidden="true">
                {sel && <IcoCheck size={14} sw={3} />}
            </span>
        </button>
    );
}

function Pregunta({ titulo, ayuda, children }) {
    return (
        <div className="fp-in">
            <h2 className="fp-display fp-h2">{titulo}</h2>
            {ayuda && <p className="fp-txt">{ayuda}</p>}
            <div className="fp-opcs">{children}</div>
        </div>
    );
}

function BotonContinuar({ onClick, disabled, children = 'Continuar' }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="fp-btn fp-btn-pri">
            {children}
            <IcoFlecha size={20} sw={2.4} />
        </button>
    );
}

/**
 * @param {object}   conf           respuestas (forma de CONFIRMACION_VACIA)
 * @param {function} setConf
 * @param {function} onVolverDatos  "Atrás" desde la primera pregunta
 * @param {function} onAceptar      envía la aceptación
 * @param {function} onVerCondiciones
 * @param {boolean}  enviando
 * @param {string}   error
 */
export function ConfirmarVivienda({ conf, setConf, onVolverDatos, onAceptar, onVerCondiciones, enviando, error }) {
    const [paso, setPaso] = useState(0);
    const [desdeResumen, setDesdeResumen] = useState(false);
    const arriba = useRef(null);
    const temporizador = useRef(null);

    // Cada pantalla empieza arriba: en el móvil, la anterior deja el scroll abajo.
    // ⚠️ NO con scrollIntoView: también desplaza los ancestros con
    // `overflow-hidden` (la página lo lleva por el fondo animado) y dejaba una
    // franja negra encima de la tarjeta. Se mueve SOLO la ventana.
    useEffect(() => {
        const el = arriba.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 16;
        window.scrollTo({ top: Math.max(0, top) });
    }, [paso]);
    useEffect(() => () => clearTimeout(temporizador.current), []);

    const idPaso = PASOS[paso];
    const siguiente = () => {
        clearTimeout(temporizador.current);
        if (desdeResumen) { setDesdeResumen(false); setPaso(PASOS.length - 1); return; }
        setPaso(p => Math.min(p + 1, PASOS.length - 1));
    };
    const avanzarEnUnMomento = () => {
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(siguiente, AVANCE_MS);
    };
    const atras = () => {
        clearTimeout(temporizador.current);
        setDesdeResumen(false);
        if (paso === 0) onVolverDatos();
        else setPaso(p => p - 1);
    };
    const cambiar = (id) => { setDesdeResumen(true); setPaso(PASOS.indexOf(id)); };

    const placasListas = conf.placas && (conf.placas !== FV.SI || conf.placas_kwp_nose || Number(conf.placas_kwp) > 0);
    const airesListos = conf.aire_acondicionado === false || (conf.aire_acondicionado === true && Number(conf.num_aires) > 0);
    const listo = { emisor: !!conf.emisor, placas: !!placasListas, aires: airesListos };
    const numPregunta = Math.min(paso + 1, 3);

    return (
        <div ref={arriba} style={{ scrollMarginTop: 16 }}>
            {/* Cabecera: volver y por dónde va */}
            <div className="fp-top">
                <button type="button" onClick={atras} className="fp-atras">
                    <IcoAtras size={18} sw={2.4} />
                    Atrás
                </button>
                <p className="fp-paso-n">
                    {idPaso === 'revisar' ? 'Último paso' : `Tu vivienda · ${numPregunta} de 3`}
                </p>
            </div>
            <div className="fp-pasos" aria-hidden="true">
                {PASOS.map((p, i) => (
                    <span key={p} className="fp-paso"><i style={{ transform: `scaleX(${i <= paso ? 1 : 0})` }} /></span>
                ))}
            </div>

            {idPaso === 'emisor' && (
                <Pregunta
                    titulo="¿Cómo te llega el calor a cada habitación?"
                    ayuda="Lo que tienes hoy en paredes o suelo. De ello depende a qué temperatura trabajará la aerotermia.">
                    {EMISOR_OPCIONES.map(o => (
                        <Opcion key={o.value} icono={ICONO_EMISOR[o.value]} tinte={o.value === 'no_se' ? TINTE.neutro : TINTE.calor}
                            label={o.label} sub={o.sub} sel={conf.emisor === o.value}
                            onClick={() => { setConf(c => ({ ...c, emisor: o.value })); avanzarEnUnMomento(); }} />
                    ))}
                </Pregunta>
            )}

            {idPaso === 'placas' && (
                <Pregunta
                    titulo="¿Tienes placas solares fotovoltaicas?"
                    ayuda="Las que producen electricidad y ya están puestas en tu vivienda. No las del agua caliente.">
                    {PLACAS_OPCIONES.map(o => (
                        <Opcion key={o.value} icono={ICONO_PLACAS[o.value]} tinte={o.value === FV.NO ? TINTE.neutro : TINTE.sol}
                            label={o.label} sub={o.sub} sel={conf.placas === o.value}
                            onClick={() => {
                                if (o.value === FV.SI) { setConf(c => ({ ...c, placas: o.value })); return; }
                                setConf(c => ({ ...c, placas: o.value, placas_kwp: null, placas_kwp_nose: false }));
                                avanzarEnUnMomento();
                            }} />
                    ))}
                    {conf.placas === FV.SI && (
                        <div className="fp-subcaja">
                            <label className="fp-k" htmlFor="placas_kwp">
                                ¿Qué potencia tienes instalada?
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <CampoDecimal
                                    id="placas_kwp"
                                    valor={conf.placas_kwp}
                                    onCambio={n => setConf(c => ({ ...c, placas_kwp: n, placas_kwp_nose: false }))}
                                    alVaciar={() => setConf(c => ({ ...c, placas_kwp: null }))}
                                    placeholder="Ej. 3,5"
                                    disabled={conf.placas_kwp_nose}
                                    inputMode="decimal"
                                    className="fp-input fp-input-grande"
                                />
                                <span className="fp-display" style={{ fontSize: 22 }}>kWp</span>
                            </div>
                            <button type="button"
                                onClick={() => setConf(c => ({ ...c, placas_kwp: null, placas_kwp_nose: !c.placas_kwp_nose }))}
                                aria-pressed={conf.placas_kwp_nose}
                                className={`fp-elige${conf.placas_kwp_nose ? ' fp-elige-sel' : ''}`}
                                style={{ width: '100%', marginTop: 12 }}>
                                No lo sé
                            </button>
                            <p className="fp-ayuda">
                                Suele venir en la factura de la instalación o en el boletín eléctrico. Si no la encuentras, no pasa nada: la comprobamos nosotros.
                            </p>
                        </div>
                    )}
                </Pregunta>
            )}

            {idPaso === 'aires' && (
                <Pregunta
                    titulo="¿Tienes aire acondicionado?"
                    ayuda="Aunque solo lo uses en verano. El certificado energético tiene que recogerlo.">
                    {AIRES_OPCIONES.map(o => (
                        <Opcion key={String(o.value)} icono={ICONO_AIRE[String(o.value)]} tinte={o.value ? TINTE.aire : TINTE.neutro}
                            label={o.label} sub={o.sub} sel={conf.aire_acondicionado === o.value}
                            onClick={() => {
                                if (o.value) { setConf(c => ({ ...c, aire_acondicionado: true, num_aires: c.num_aires || 1 })); return; }
                                setConf(c => ({ ...c, aire_acondicionado: false, num_aires: null }));
                                avanzarEnUnMomento();
                            }} />
                    ))}
                    {conf.aire_acondicionado === true && (
                        <div className="fp-subcaja">
                            <p className="fp-k" style={{ marginBottom: 4 }}>¿Cuántos aparatos tienes?</p>
                            <p className="fp-ayuda" style={{ marginTop: 0 }}>Cada aparato de pared cuenta como uno, y un sistema de conductos también es uno aunque tenga varias rejillas.</p>
                            <div className="fp-contador">
                                <button type="button" aria-label="Uno menos"
                                    onClick={() => setConf(c => ({ ...c, num_aires: Math.max(1, (Number(c.num_aires) || 1) - 1) }))}>−</button>
                                <span className="fp-display" aria-live="polite">{conf.num_aires || 1}</span>
                                <button type="button" aria-label="Uno más"
                                    onClick={() => setConf(c => ({ ...c, num_aires: Math.min(MAX_AIRES, (Number(c.num_aires) || 1) + 1) }))}>+</button>
                            </div>
                        </div>
                    )}
                </Pregunta>
            )}

            {idPaso !== 'revisar' && (
                <div style={{ marginTop: 20 }}>
                    <BotonContinuar onClick={siguiente} disabled={!listo[idPaso]}>
                        {desdeResumen ? 'Volver al resumen' : 'Continuar'}
                    </BotonContinuar>
                </div>
            )}

            {idPaso === 'revisar' && (
                <div className="fp-in">
                    <h2 className="fp-display fp-h2">Revisa y <span className="fp-mark">acepta</span> la propuesta</h2>
                    <p className="fp-txt">Esto es lo que nos has dicho de tu vivienda. Si algo no está bien, pulsa «Cambiar».</p>

                    <ul className="fp-resumen">
                        {[
                            { id: 'emisor', tema: 'Calefacción', valor: EMISOR_OPCIONES.find(o => o.value === conf.emisor)?.resumen || '—', Icono: ICONO_EMISOR[conf.emisor] || IconNoSe },
                            { id: 'placas', tema: 'Placas fotovoltaicas', valor: placasParaElCliente(conf), Icono: ICONO_PLACAS[conf.placas] || IconPlacas },
                            { id: 'aires', tema: 'Aire acondicionado', valor: etiquetaAires(conf) || '—', Icono: ICONO_AIRE[String(conf.aire_acondicionado)] || IconAire },
                        ].map(r => (
                            <li key={r.id}>
                                <span className="fp-opc-dib fp-dib-neutro">
                                    <r.Icono className="w-7 h-7" />
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <small>{r.tema}</small>
                                    <b>{r.valor}</b>
                                </span>
                                <button type="button" onClick={() => cambiar(r.id)} className="fp-mini">
                                    Cambiar
                                </button>
                            </li>
                        ))}
                    </ul>

                    {error && (
                        <div className="fp-aviso fp-aviso-ambar fp-mt" role="alert">
                            <span className="fp-ico-tile"><IcoAlerta size={20} /></span>
                            <p>{error}</p>
                        </div>
                    )}

                    <div style={{ marginTop: 20 }}>
                        <button type="button" onClick={onAceptar} disabled={enviando} className="fp-btn fp-btn-pri">
                            {enviando ? 'Procesando…' : 'Confirmar y aceptar propuesta'}
                        </button>
                        {/* Aceptación por clic: el botón ES la aceptación, y el
                            texto completo queda a un clic. */}
                        <p className="fp-nota">
                            Al pulsar «Confirmar y aceptar propuesta» aceptas las{' '}
                            <button type="button" onClick={onVerCondiciones} className="fp-link">
                                condiciones y autorizaciones
                            </button>
                            {' '}de la propuesta, incluidas la presentación de los Certificados de Eficiencia Energética y el tratamiento de tus datos personales.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ConfirmarVivienda;
