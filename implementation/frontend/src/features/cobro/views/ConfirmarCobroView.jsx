/**
 * ConfirmarCobroView — /cobro/:expedienteId?token=
 *
 * Lo que ve el CLIENTE cuando su ayuda está concedida y vamos a ingresársela.
 * Confirma sus datos de cobro y, de paso, contesta tres preguntas de venta
 * cruzada. Sustituye al formulario externo de Tally.
 *
 * REGLA — la API se pide en RELATIVO. Esta pantalla la abre el cliente CON EL
 * MÓVIL desde un WhatsApp, así que tiene que funcionar entrando por la IP de la
 * LAN en desarrollo (en el teléfono, `localhost` es el teléfono). Mismo motivo
 * que FirmaMovilView y FirmarAnexosView.
 *
 * REGLA — los tres bloques comerciales son OPCIONALES y se puede pasar de largo.
 * El cliente ha venido a cobrar; convertir la venta cruzada en un peaje es la
 * forma de que abandone antes de confirmar el IBAN, que es lo que de verdad
 * necesitamos. Por eso van ANTES los opcionales y AL FINAL lo obligatorio: si se
 * pusieran al revés, cerraría la pestaña en cuanto acabara lo suyo.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { normalizarIban, ibanEnBloques, bloquesPara, bloquePago, textoEsfuerzo, eurEs } from '../logic/cobroForm';

const API = '/api/public';

// /cobro/demo — el formulario con datos de MENTIRA, para verlo como el cliente sin
// tocar ningún expediente (mismo criterio que /firma/demo). No llama a la API: ni
// lee ni guarda nada. Las preguntas salen de la MISMA fuente (`bloquesPara`).
const DEMO = 'demo';
const DEMO_BONO = 1840;
const vistaDemo = () => {
    const pago = bloquePago(250, DEMO_BONO);
    return {
    numero_expediente: '26RES060_000',
    saludo: 'María',
    bloques: bloquesPara({ clienteAsumeCoste: true, costeGestion: 250, solarPrevio: 'no', respuestas: {}, bono: DEMO_BONO }),
    importe: {
        bono: DEMO_BONO,
        honorarios_sin_iva: pago.importe_sin_iva, honorarios_total: pago.importe_total,
        recibe_descuento: pago.recibe_descuento, recibe_factura: pago.recibe_factura,
    },
    esfuerzo: textoEsfuerzo(2),
    cliente: {
        nombre_razon_social: 'María', apellidos: 'Ejemplo Demo', dni: '00000000T',
        email: 'maria@ejemplo.es', telefono: '600000000', iban: 'ES9121000418450200051332',
    },
    justificante_subido: false,
    requiere_justificante_sin_iban: false,
    completado_at: null,
    };
};

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Marco({ children }) {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-lg relative z-10 my-6">{children}</div>
        </div>
    );
}

function Tarjeta({ children }) {
    return (
        <div className="bg-bkg-surface border border-white/[0.06] rounded-[2rem] p-6 sm:p-8 backdrop-blur-xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent rounded-t-[2rem]" />
            {children}
        </div>
    );
}

/**
 * Opción grande y pulsable. Objetivo táctil holgado: esto se usa con el pulgar.
 *
 * `desaconsejada` no la bloquea —es una elección legítima del cliente— pero la
 * enseña como lo que es: se apaga, avisa de la consecuencia en la propia chapa y
 * el motivo va en ámbar. Dos opciones pintadas igual se leen como equivalentes, y
 * ésta le cuesta dinero y le retrasa el cobro.
 */
function Opcion({ icono, label, sub, recomendada, desaconsejada, aviso, seleccionada, onClick }) {
    const borde = seleccionada
        ? (desaconsejada ? 'border-amber-500 bg-amber-500/10' : 'border-amber-400 bg-amber-400/10')
        : (desaconsejada
            ? 'border-white/[0.07] bg-white/[0.015] hover:border-amber-500/40'
            : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40 hover:bg-white/[0.05]');
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${borde}`}
        >
            <span className={`text-3xl leading-none shrink-0 ${desaconsejada && !seleccionada ? 'opacity-40 grayscale' : ''}`}>{icono}</span>
            <span className="min-w-0 flex-1">
                <span className={`block font-bold text-[15px] leading-snug ${
                    seleccionada ? 'text-amber-300' : (desaconsejada ? 'text-white/55' : 'text-white')
                }`}>
                    {label}
                    {recomendada && (
                        <span className="ml-2 align-middle text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30">
                            Recomendado
                        </span>
                    )}
                </span>
                {aviso && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        ⚠ {aviso}
                    </span>
                )}
                {sub && (
                    <span className={`block text-xs mt-1.5 leading-snug ${desaconsejada ? 'text-amber-200/60' : 'text-white/45'}`}>
                        {sub}
                    </span>
                )}
            </span>
        </button>
    );
}

function Campo({ label, value, onChange, type = 'text', placeholder, ayuda, error, autoComplete }) {
    return (
        <div>
            <label className="block text-[11px] font-black text-white/50 uppercase tracking-widest mb-1.5">{label}</label>
            <input
                type={type}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                // 16px reales: por debajo, iOS amplía la página al enfocar el campo.
                className={`w-full bg-white/[0.06] border-2 rounded-xl px-4 py-3 text-white text-base outline-none transition-all no-uppercase ${
                    error ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
                }`}
            />
            {ayuda && <p className="text-white/30 text-[11px] mt-1.5 leading-snug">{ayuda}</p>}
        </div>
    );
}

// ─── Vista ───────────────────────────────────────────────────────────────────

export function ConfirmarCobroView({ expedienteId, token }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [paso, setPaso] = useState(0);          // 0 = portada · 1..N bloques · N+1 datos
    const [respuestas, setRespuestas] = useState({});
    const [datos, setDatos] = useState(null);
    const [justificante, setJustificante] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [hecho, setHecho] = useState(false);
    // ¿La cuenta que tenemos es la buena? null = aún no lo ha dicho · 'si' · 'otra'.
    // Es la pregunta por la que se le ha escrito, así que se contesta EXPLÍCITAMENTE:
    // un campo relleno que se deja como está no es una confirmación, es un descuido
    // que no se distingue de ella.
    const [cuentaOk, setCuentaOk] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        const aplicar = (d) => {
            setInfo(d);
            setDatos(d.cliente);
            const previas = {};
            (d.bloques || []).forEach(b => { if (b.valor != null) previas[b.id] = b.valor; });
            setRespuestas(previas);
            if (d.completado_at) setHecho(true);
        };
        if (expedienteId === DEMO) { aplicar(vistaDemo()); return; }
        axios.get(`${API}/cobro/${expedienteId}`, { params: { token } })
            .then(r => aplicar(r.data))
            .catch(e => setLoadError(e.response?.data?.error || 'No hemos podido abrir tu enlace.'));
    }, [expedienteId, token]);

    const bloques = info?.bloques || [];
    const totalPasos = bloques.length + 1;

    // El IBAN se compara sin espacios: el cliente lo escribe como se lo enseña su
    // banco y el que consta viene de otro formulario. Cambiar el formato no es
    // cambiar de cuenta, y pedirle el justificante por eso sería absurdo.
    const ibanOriginal = normalizarIban(info?.cliente?.iban);
    const ibanCambiado = useMemo(
        () => !!ibanOriginal && normalizarIban(datos?.iban) !== ibanOriginal,
        [datos?.iban, ibanOriginal]
    );
    // REGLA — un justificante ANTERIOR no vale para una cuenta NUEVA. Acredita la
    // que ya teníamos, que es justo la que el cliente está cambiando: darlo por bueno
    // sería ingresar en una cuenta sin comprobar de quién es. (Y el backend lo
    // rechazaría igual, dejando al cliente ante un error que no puede entender.)
    // Y si NO teníamos ninguna cuenta y tampoco justificante, la que escriba hay que
    // acreditarla igual (convenio firmado sin IBAN).
    const sinCuentaPrevia = !ibanOriginal;
    const necesitaJustificante = ibanCambiado || (sinCuentaPrevia && !!info?.requiere_justificante_sin_iban);
    const formaPago = respuestas.forma_pago || null;
    const costePago = (info?.bloques || []).find(b => b.id === 'forma_pago') || null;
    const eur = eurEs;
    // Lo que se le ingresa: la ayuda VERIFICADA (la manda el servidor; sin ella no
    // se enseña ninguna cifra) menos los honorarios si elige descontarlos.
    const importe = info?.importe || null;
    const recibes = importe
        ? (formaPago === 'factura' ? importe.recibe_factura
            : formaPago === 'descuento' ? importe.recibe_descuento
                : (importe.honorarios_sin_iva == null ? importe.bono : null))
        : null;

    const responder = (bloqueId, valor) => {
        setRespuestas(p => ({ ...p, [bloqueId]: valor }));
        // Auto-avance, como en el formulario que sustituye: al elegir ya está
        // contestado y un "siguiente" de más es una pulsación que no aporta.
        setTimeout(() => { setPaso(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 220);
    };

    const avanzar = (n) => { setPaso(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    const enviar = async () => {
        setError(null);
        const falta = ['nombre_razon_social', 'dni', 'email', 'telefono'].find(k => !String(datos?.[k] || '').trim());
        if (falta) return setError('Faltan datos por rellenar.');
        if (ibanOriginal && !cuentaOk) return setError('Dinos si la cuenta que tenemos es la correcta.');
        if (normalizarIban(datos?.iban).length < 20) return setError('El número de cuenta no parece completo.');
        if (necesitaJustificante && !justificante) {
            return setError('Como has cambiado el número de cuenta, necesitamos el justificante de titularidad.');
        }
        if (expedienteId === DEMO) {
            setHecho(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setEnviando(true);
        try {
            const fd = new FormData();
            Object.entries(datos).forEach(([k, v]) => fd.append(k, v ?? ''));
            fd.append('respuestas', JSON.stringify(respuestas));
            if (justificante) fd.append('justificante', justificante);
            await axios.post(`${API}/cobro/${expedienteId}`, fd, { params: { token } });
            setHecho(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            setError(e.response?.data?.error || 'No hemos podido guardar tus datos. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    // ── Estados de carga / error ────────────────────────────────────────────
    if (loadError) {
        return (
            <Marco><Tarjeta>
                <div className="text-center">
                    <div className="text-5xl mb-4">🔒</div>
                    <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Enlace no válido</h2>
                    <p className="text-white/45 text-sm leading-relaxed">{loadError}</p>
                    <p className="text-white/25 text-xs mt-6">Escríbenos y te mandamos uno nuevo.</p>
                </div>
            </Tarjeta></Marco>
        );
    }
    if (!info) {
        return (
            <Marco><Tarjeta>
                <p className="text-center text-white/40 font-bold uppercase tracking-widest text-xs py-8">Cargando…</p>
            </Tarjeta></Marco>
        );
    }

    if (hecho) {
        return (
            <Marco><Tarjeta>
                <div className="text-center">
                    <div className="text-6xl mb-4">✅</div>
                    <h2 className="text-2xl font-black text-white mb-3 tracking-tight">¡Listo, gracias!</h2>
                    <p className="text-white/55 text-sm leading-relaxed">
                        Ya tenemos tus datos confirmados. Prepararemos el ingreso y te avisaremos en cuanto salga.
                    </p>
                    {recibes != null && (
                        <div className="mt-5 p-4 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/25">
                            <p className="text-[11px] font-black text-emerald-300/80 uppercase tracking-widest mb-1">Vas a recibir</p>
                            <p className="text-3xl font-black text-white tracking-tight">{eur(recibes)}</p>
                        </div>
                    )}
                    {/* REGLA — no se promete fecha de ingreso: depende del pago del
                        Sujeto Obligado. Una fecha inventada aquí es una reclamación
                        dentro de dos semanas. */}
                    <div className="mt-6 p-4 rounded-xl bg-white/[0.04] border border-white/10 text-left">
                        <p className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-1">Cuenta de ingreso</p>
                        <p className="text-white font-mono font-bold text-sm">
                            {ibanEnBloques(datos?.iban).split(' ').map((b, i) => (
                                <span key={i} className="inline-block mr-[0.45em] whitespace-nowrap">{b}</span>
                            ))}
                        </p>
                    </div>
                    {ibanCambiado && (
                        <p className="text-amber-300/80 text-xs mt-4 leading-snug">
                            Has cambiado la cuenta respecto a la que teníamos. La comprobaremos con el justificante antes de hacer la transferencia.
                        </p>
                    )}
                    {/* Qué pasa ahora con la gestión: la factura retrasa el ingreso, y
                        si no se le dice aquí espera el dinero sin saber que falta un
                        paso suyo. */}
                    {formaPago === 'factura' && costePago && (
                        <p className="text-white/55 text-xs mt-4 leading-snug text-left p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                            🧾 Te enviaremos la factura de nuestros honorarios ({eur(costePago.importe_total)}, IVA incluido).
                            En cuanto esté abonada haremos el ingreso de tu ayuda{importe ? ` (${eur(importe.recibe_factura)})` : ''}.
                        </p>
                    )}
                    {formaPago === 'descuento' && costePago && (
                        <p className="text-white/55 text-xs mt-4 leading-snug text-left p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
                            ✂️ Te ingresaremos tu ayuda con nuestros honorarios ({eur(costePago.importe_sin_iva)}) ya descontados. No tienes que hacer nada más.
                        </p>
                    )}
                </div>
            </Tarjeta></Marco>
        );
    }

    // ── Portada ─────────────────────────────────────────────────────────────
    if (paso === 0) {
        return (
            <Marco><Tarjeta>
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-5">
                        <span className="text-sm">🎉</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Enhorabuena</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                        {info.saludo ? `${info.saludo}, por fin lo tenemos` : 'Por fin lo tenemos'}
                    </h1>
                    {/* El esfuerzo, con lo que DE VERDAD pasó en su expediente (lo
                        cuenta el servidor: requerimientos contestados, o el proceso). */}
                    {info.esfuerzo && (
                        <p className="text-white/55 text-sm sm:text-base mt-4 leading-relaxed">
                            {info.esfuerzo}: el pago de tu ayuda ya nos ha llegado.
                        </p>
                    )}
                    {importe && (
                        <div className="mt-5 p-5 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/25">
                            <p className="text-[11px] font-black text-emerald-300/80 uppercase tracking-widest">Tu ayuda</p>
                            <p className="text-4xl sm:text-5xl font-black text-white tracking-tight mt-1">{eur(importe.bono)}</p>
                            {importe.honorarios_sin_iva != null && (
                                <p className="text-white/55 text-xs sm:text-sm mt-2 leading-snug">
                                    Descontando nuestros honorarios ({eur(importe.honorarios_sin_iva)}) te ingresamos
                                    {' '}<strong className="text-emerald-300">{eur(importe.recibe_descuento)}</strong>.
                                    {' '}También puedes pagarlos aparte con factura: lo eliges dentro.
                                </p>
                            )}
                        </div>
                    )}
                    <p className="text-white/55 text-sm sm:text-base mt-5 leading-relaxed">
                        <strong className="text-white">Por seguridad</strong>, antes de hacer cualquier transferencia
                        confirmamos contigo que el <strong className="text-white">número de cuenta</strong> que tenemos es el correcto.
                    </p>
                    <p className="text-white/35 text-xs mt-3 leading-relaxed">
                        Te llevará menos de un minuto: ya lo tienes casi todo relleno.
                    </p>
                    <button
                        type="button"
                        onClick={() => avanzar(1)}
                        className="mt-8 w-full px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-lg shadow-amber-500/20"
                    >
                        Empezar →
                    </button>
                    {info.numero_expediente && (
                        <p className="text-white/20 text-[10px] mt-5 uppercase tracking-widest font-bold">
                            Expediente {info.numero_expediente}
                        </p>
                    )}
                </div>
            </Tarjeta></Marco>
        );
    }

    // ── Bloques comerciales ─────────────────────────────────────────────────
    if (paso <= bloques.length) {
        const b = bloques[paso - 1];
        return (
            <Marco>
                <Progreso paso={paso} total={totalPasos} />
                <Tarjeta>
                    <button type="button" onClick={() => avanzar(paso - 1)}
                            className="text-white/30 hover:text-white/70 text-[11px] font-black uppercase tracking-widest transition-colors mb-4">
                        ← Atrás
                    </button>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{b.icono}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{b.titulo}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">{b.pregunta}</h2>
                    <p className="text-white/45 text-sm mt-3 leading-relaxed">{b.ayuda}</p>
                    {b.destacado && (
                        <p className="mt-3 p-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-200 text-sm font-bold leading-snug">
                            ✓ {b.destacado}
                        </p>
                    )}

                    {/* Lo que ya nos dijo en la captación viene marcado y se dice: sin
                        avisarlo, parece que el formulario ha elegido por él. */}
                    {b.heredado && respuestas[b.id] && (
                        <p className="text-cyan-300/70 text-[11px] mt-3 leading-snug">
                            ℹ️ Esto es lo que nos dijiste cuando empezamos. Si ha cambiado, corrígelo.
                        </p>
                    )}

                    <div className="space-y-2.5 mt-5">
                        {b.opciones.map(o => (
                            <Opcion
                                key={o.value}
                                icono={o.icono}
                                label={o.label}
                                sub={o.sub}
                                recomendada={o.recomendada}
                                desaconsejada={o.desaconsejada}
                                aviso={o.aviso}
                                seleccionada={respuestas[b.id] === o.value}
                                onClick={() => responder(b.id, o.value)}
                            />
                        ))}
                    </div>

                    {/* La forma de pago SÍ hay que contestarla: de ella depende cómo se
                        liquida. Las tres preguntas comerciales no. */}
                    {b.id !== 'forma_pago' && (
                        <button
                            type="button"
                            onClick={() => avanzar(paso + 1)}
                            className="mt-5 w-full py-3 text-white/30 hover:text-white/60 text-[11px] font-black uppercase tracking-widest transition-colors"
                        >
                            Prefiero no contestar →
                        </button>
                    )}
                </Tarjeta>
            </Marco>
        );
    }

    // ── Datos de cobro ──────────────────────────────────────────────────────
    return (
        <Marco>
            <Progreso paso={totalPasos} total={totalPasos} />
            <Tarjeta>
                <button type="button" onClick={() => avanzar(paso - 1)}
                        className="text-white/30 hover:text-white/70 text-[11px] font-black uppercase tracking-widest transition-colors mb-4">
                    ← Atrás
                </button>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">🏦</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Datos de cobro</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                    Confirma dónde te ingresamos
                </h2>
                <p className="text-white/45 text-sm mt-3 leading-relaxed">
                    Son los datos que ya tenemos. Por seguridad, confírmanos la cuenta y corrige lo que haga falta.
                </p>

                <div className="space-y-4 mt-6">
                    {/* LA PREGUNTA por la que se le ha escrito: ¿es ésta tu cuenta?
                        Con cuenta en la ficha se le enseña ENTERA (aquí, detrás del
                        token; en el mensaje iba enmascarada) y se contesta con dos
                        botones. Solo si dice que es otra aparece el campo. */}
                    {ibanOriginal ? (
                        <div className="p-4 rounded-2xl border-2 border-white/10 bg-white/[0.03]">
                            <p className="text-[11px] font-black text-white/50 uppercase tracking-widest mb-1.5">La cuenta que tenemos</p>
                            <p className="text-white font-mono font-bold text-[15px] sm:text-lg leading-snug">
                                {ibanEnBloques(ibanOriginal).split(' ').map((b, i) => (
                                    <span key={i} className="inline-block mr-[0.45em] whitespace-nowrap">{b}</span>
                                ))}
                            </p>
                            <p className="text-white/35 text-[11px] mt-1.5 leading-snug">Es donde te haremos la transferencia. Compruébala con calma.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                                <button type="button"
                                    onClick={() => { setCuentaOk('si'); setDatos(d => ({ ...d, iban: ibanOriginal })); setJustificante(null); setError(null); }}
                                    className={`py-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${
                                        cuentaOk === 'si' ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300' : 'border-white/10 text-white/70 hover:border-emerald-400/50'}`}>
                                    ✓ Sí, es correcta
                                </button>
                                <button type="button"
                                    onClick={() => { setCuentaOk('otra'); setDatos(d => ({ ...d, iban: '' })); setError(null); }}
                                    className={`py-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${
                                        cuentaOk === 'otra' ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-white/10 text-white/70 hover:border-amber-400/50'}`}>
                                    No, es otra
                                </button>
                            </div>
                            {cuentaOk === 'otra' && (
                                <div className="mt-4">
                                    <Campo
                                        label="La cuenta correcta (IBAN)"
                                        value={datos?.iban}
                                        onChange={v => setDatos(d => ({ ...d, iban: v }))}
                                        placeholder="ES91 2100 1234 5612 3456 7890"
                                    />
                                </div>
                            )}
                        </div>
                    ) : (
                        <Campo
                            label="Número de cuenta (IBAN)"
                            value={datos?.iban}
                            onChange={v => setDatos(d => ({ ...d, iban: v }))}
                            placeholder="ES91 2100 1234 5612 3456 7890"
                            ayuda="No tenemos ninguna cuenta tuya: es donde te haremos la transferencia. Compruébala con calma."
                        />
                    )}

                    {/* REGLA — cambiar de cuenta exige justificante. El IBAN que consta
                        va impreso en el convenio que el cliente firmó; cambiarlo sin
                        acreditar la cuenta nueva es el error de ingreso que este
                        formulario viene a evitar. Si repite el que ya teníamos, no se
                        le pide nada. */}
                    {necesitaJustificante && (
                        <div className="p-4 rounded-2xl border-2 border-amber-400/30 bg-amber-400/[0.06] animate-fade-in">
                            <p className="text-amber-300 font-black text-sm mb-1">
                                {ibanCambiado ? 'Has cambiado el número de cuenta' : 'Justificante de la cuenta'}
                            </p>
                            <p className="text-white/55 text-xs leading-relaxed">
                                {ibanCambiado && <>Antes teníamos <span className="text-white/80 font-mono break-all">{ibanEnBloques(ibanOriginal)}</span>.{' '}</>}
                                Para asegurarnos de que el dinero llega a tu cuenta necesitamos un
                                justificante de titularidad <strong className="text-white/80">{ibanCambiado ? 'de la cuenta nueva' : 'de esa cuenta'}</strong>:
                                un recibo o una captura del banco donde se vea tu nombre junto al IBAN.
                            </p>
                            <>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        onChange={e => setJustificante(e.target.files?.[0] || null)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className={`mt-3 w-full py-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all ${
                                            justificante
                                                ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                                                : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                                        }`}
                                    >
                                        {justificante ? `✓ ${justificante.name}` : '📎 Adjuntar justificante'}
                                    </button>
                            </>
                        </div>
                    )}

                    {/* Los datos de contacto van DETRÁS: la cuenta es la pregunta por la
                        que se le ha escrito, y con cinco campos delante quedaba al fondo
                        de la pantalla del móvil, donde no se ve. */}
                    <p className="text-[11px] font-black text-white/40 uppercase tracking-widest pt-2">Tus datos</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Campo label="Nombre" value={datos?.nombre_razon_social}
                               onChange={v => setDatos(d => ({ ...d, nombre_razon_social: v }))} autoComplete="given-name" />
                        <Campo label="Apellidos" value={datos?.apellidos}
                               onChange={v => setDatos(d => ({ ...d, apellidos: v }))} autoComplete="family-name" />
                    </div>
                    <Campo label="DNI / NIE" value={datos?.dni}
                           onChange={v => setDatos(d => ({ ...d, dni: v }))} placeholder="12345678A" />
                    <Campo label="Email" type="email" value={datos?.email}
                           onChange={v => setDatos(d => ({ ...d, email: v }))} autoComplete="email" />
                    <Campo label="Teléfono" type="tel" value={datos?.telefono}
                           onChange={v => setDatos(d => ({ ...d, telefono: v }))} autoComplete="tel" />
                </div>

                {error && (
                    <p className="mt-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs leading-snug">{error}</p>
                )}

                <button
                    type="button"
                    onClick={enviar}
                    disabled={enviando}
                    className="mt-6 w-full px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 disabled:opacity-40 disabled:cursor-wait text-bkg-deep font-black uppercase tracking-widest text-sm rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                >
                    {enviando ? 'Guardando…' : 'Confirmar mis datos'}
                </button>
                <p className="text-white/25 text-[11px] text-center mt-4 leading-snug">
                    Solo usamos estos datos para hacerte el ingreso de tu ayuda.
                </p>
            </Tarjeta>
        </Marco>
    );
}

/** Barra de avance: quien ve cuánto queda, termina. */
function Progreso({ paso, total }) {
    const pct = Math.round((paso / total) * 100);
    return (
        <div className="mb-4 px-2">
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
                     style={{ width: `${pct}%` }} />
            </div>
            <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mt-2 text-right">
                Paso {paso} de {total}
            </p>
        </div>
    );
}

export default ConfirmarCobroView;
