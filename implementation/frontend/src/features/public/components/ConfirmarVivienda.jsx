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
// REGLA — el texto secundario va a /70 como mínimo: a /35 no se leía en la
// pantalla de un móvil (visto en un iPhone, 2026-09-29).
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

// Color del dibujo por tema: calor en naranja, sol en ámbar, aire en azul.
// (Todos remapeados en .theme-light — index.css.)
const TINTE = {
    calor: 'text-orange-400 bg-orange-500/10',
    sol: 'text-amber-400 bg-amber-500/10',
    aire: 'text-sky-400 bg-sky-500/10',
    neutro: 'text-white/70 bg-white/[0.06]',
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

/** Una opción grande: dibujo, texto y la marca de elegida. */
function Opcion({ icono, tinte, label, sub, sel, onClick }) {
    const Icono = icono;
    return (
        <button type="button" onClick={onClick} aria-pressed={sel}
            className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border-2 transition-colors ${sel ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25 active:bg-white/[0.06]'}`}>
            <span className={`shrink-0 w-14 h-14 rounded-xl flex items-center justify-center ${sel ? 'text-brand bg-brand/15' : tinte}`}>
                <Icono className="w-10 h-10" />
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-bold leading-snug ${sel ? 'text-brand' : 'text-white'}`}>{label}</span>
                {sub && <span className="block text-[13px] text-white/70 mt-1 leading-snug">{sub}</span>}
            </span>
            <span className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${sel ? 'border-brand bg-brand' : 'border-white/25'}`} aria-hidden="true">
                {sel && (
                    <svg className="w-3.5 h-3.5 text-bkg-deep" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                )}
            </span>
        </button>
    );
}

function Pregunta({ titulo, ayuda, children }) {
    return (
        <div>
            <h3 className="text-xl font-black text-white leading-tight tracking-tight">{titulo}</h3>
            {ayuda && <p className="text-[14px] text-white/70 mt-2 leading-relaxed">{ayuda}</p>}
            <div className="mt-5 grid grid-cols-1 gap-3">{children}</div>
        </div>
    );
}

function BotonContinuar({ onClick, disabled, children = 'Continuar' }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black rounded-xl shadow-lg shadow-brand/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base uppercase tracking-widest">
            {children}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
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
        <div ref={arriba} className="scroll-mt-4">
            {/* Cabecera: volver y por dónde va */}
            <div className="flex items-center justify-between gap-3 mb-6">
                <button type="button" onClick={atras}
                    className="-ml-2 px-2 py-2 rounded-lg text-[14px] font-bold text-white/70 hover:text-white flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    Atrás
                </button>
                <span className="text-[12px] font-black uppercase tracking-widest text-white/70">
                    {idPaso === 'revisar' ? 'Último paso' : `Tu vivienda · ${numPregunta} de 3`}
                </span>
            </div>
            <div className="flex gap-1.5 mb-7" aria-hidden="true">
                {PASOS.map((p, i) => (
                    <div key={p} className={`h-1.5 flex-1 rounded-full ${i <= paso ? 'bg-brand' : 'bg-white/10'}`} />
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
                        <div className="p-4 rounded-2xl border-2 border-brand/30 bg-brand/[0.05]">
                            <label className="block text-[14px] font-bold text-white mb-3" htmlFor="placas_kwp">
                                ¿Qué potencia tienes instalada?
                            </label>
                            <div className="flex items-center gap-2">
                                <CampoDecimal
                                    id="placas_kwp"
                                    valor={conf.placas_kwp}
                                    onCambio={n => setConf(c => ({ ...c, placas_kwp: n, placas_kwp_nose: false }))}
                                    alVaciar={() => setConf(c => ({ ...c, placas_kwp: null }))}
                                    placeholder="Ej. 3,5"
                                    disabled={conf.placas_kwp_nose}
                                    className="flex-1 min-w-0 bg-bkg-elevated border border-white/15 rounded-xl px-4 py-3 text-white text-lg font-bold placeholder-white/40 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-40"
                                />
                                <span className="text-white/70 text-base font-black shrink-0">kWp</span>
                            </div>
                            <button type="button"
                                onClick={() => setConf(c => ({ ...c, placas_kwp: null, placas_kwp_nose: !c.placas_kwp_nose }))}
                                aria-pressed={conf.placas_kwp_nose}
                                className={`mt-3 w-full py-3 rounded-xl border-2 text-[13px] font-black uppercase tracking-widest transition-colors ${conf.placas_kwp_nose ? 'border-brand bg-brand/10 text-brand' : 'border-white/15 text-white/70 hover:border-white/30'}`}>
                                No lo sé
                            </button>
                            <p className="mt-3 text-[13px] text-white/70 leading-snug">
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
                        <div className="p-4 rounded-2xl border-2 border-brand/30 bg-brand/[0.05]">
                            <p className="text-[14px] font-bold text-white mb-3">¿Cuántos aparatos tienes?</p>
                            <p className="text-[13px] text-white/70 -mt-2 mb-3 leading-snug">Cada aparato de pared cuenta como uno, y un sistema de conductos también es uno aunque tenga varias rejillas.</p>
                            <div className="flex items-center justify-center gap-5">
                                <button type="button" aria-label="Uno menos"
                                    onClick={() => setConf(c => ({ ...c, num_aires: Math.max(1, (Number(c.num_aires) || 1) - 1) }))}
                                    className="w-14 h-14 rounded-xl border-2 border-white/15 text-white text-2xl font-black hover:border-white/30 active:bg-white/[0.06]">−</button>
                                <span className="min-w-[3ch] text-center text-4xl font-black text-white tabular-nums" aria-live="polite">{conf.num_aires || 1}</span>
                                <button type="button" aria-label="Uno más"
                                    onClick={() => setConf(c => ({ ...c, num_aires: Math.min(MAX_AIRES, (Number(c.num_aires) || 1) + 1) }))}
                                    className="w-14 h-14 rounded-xl border-2 border-white/15 text-white text-2xl font-black hover:border-white/30 active:bg-white/[0.06]">+</button>
                            </div>
                        </div>
                    )}
                </Pregunta>
            )}

            {idPaso !== 'revisar' && (
                <div className="mt-6">
                    <BotonContinuar onClick={siguiente} disabled={!listo[idPaso]}>
                        {desdeResumen ? 'Volver al resumen' : 'Continuar'}
                    </BotonContinuar>
                </div>
            )}

            {idPaso === 'revisar' && (
                <div>
                    <h3 className="text-xl font-black text-white leading-tight tracking-tight">Revisa y acepta la propuesta</h3>
                    <p className="text-[14px] text-white/70 mt-2 leading-relaxed">Esto es lo que nos has dicho de tu vivienda. Si algo no está bien, pulsa «Cambiar».</p>

                    <div className="mt-5 rounded-2xl border border-white/10 divide-y divide-white/10">
                        {[
                            { id: 'emisor', tema: 'Calefacción', valor: EMISOR_OPCIONES.find(o => o.value === conf.emisor)?.resumen || '—', Icono: ICONO_EMISOR[conf.emisor] || IconNoSe },
                            { id: 'placas', tema: 'Placas fotovoltaicas', valor: placasParaElCliente(conf), Icono: ICONO_PLACAS[conf.placas] || IconPlacas },
                            { id: 'aires', tema: 'Aire acondicionado', valor: etiquetaAires(conf) || '—', Icono: ICONO_AIRE[String(conf.aire_acondicionado)] || IconAire },
                        ].map(r => (
                            <div key={r.id} className="flex items-center gap-3 p-4">
                                <span className="shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-white/80 bg-white/[0.06]">
                                    <r.Icono className="w-7 h-7" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[12px] font-black uppercase tracking-widest text-white/70">{r.tema}</span>
                                    <span className="block text-[15px] font-bold text-white leading-snug">{r.valor}</span>
                                </span>
                                <button type="button" onClick={() => cambiar(r.id)}
                                    className="shrink-0 px-3 py-2 rounded-lg text-[13px] font-bold text-brand hover:bg-brand/10">
                                    Cambiar
                                </button>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="mt-5 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm" role="alert">{error}</div>
                    )}

                    <div className="mt-6">
                        <button type="button" onClick={onAceptar} disabled={enviando}
                            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-base uppercase tracking-widest">
                            {enviando ? 'Procesando…' : 'Confirmar y aceptar propuesta'}
                        </button>
                        {/* Aceptación por clic: el botón ES la aceptación, y el
                            texto completo queda a un clic. */}
                        <p className="mt-3 text-center text-[12px] text-white/70 leading-relaxed">
                            Al pulsar «Confirmar y aceptar propuesta» aceptas las{' '}
                            <button type="button" onClick={onVerCondiciones}
                                className="underline underline-offset-2 text-white hover:text-brand transition-colors">
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
