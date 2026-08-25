import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// El técnico contesta al encargo de un CEE contratado suelto.
//
// MISMO GESTO QUE EN EL CAE, a propósito: al certificador le llegan los dos
// encargos y no puede tener que aprender dos procesos. En el CAE (`CertAckView`)
// el enlace "Aceptar encargo" **acepta al abrirse** —sin preguntar nada— y a los
// 2,5 s te deja dentro del expediente. Aquí igual.
//
// La única diferencia es que aquí también se puede decir que NO, y eso el CAE no
// lo contempla. El email lleva dos enlaces:
//
//   ?r=si  → acepta sola, como el CAE, y entra al expediente.
//   ?r=no  → NO hace nada al abrirse: pide confirmación y ofrece motivo.
//
// REGLA — aceptar es automático; RECHAZAR nunca. Aceptar de más no rompe nada
// (sigues siendo el técnico); rechazar te retira del expediente y lo devuelve a
// la cola, así que un pulgar despistado sobre el enlace equivocado en la bandeja
// de entrada no puede provocarlo.
//
// No se puede resolver DENTRO del email: los clientes de correo no ejecutan
// JavaScript y Gmail elimina los formularios, así que lo único pulsable es un
// enlace. Es la misma razón por la que el CAE abre una página.
// ─────────────────────────────────────────────────────────────────────────────

const isProd = typeof window !== 'undefined' && window.location.port !== '5173';
const API = isProd ? '/api/public' : 'http://localhost:3000/api/public';

const Dato = ({ etiqueta, valor }) => valor ? (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 w-28 shrink-0">{etiqueta}</span>
        <span className="text-sm text-white/80">{valor}</span>
    </div>
) : null;

const Marco = ({ children }) => (
    <div className="min-h-screen bg-bkg-deep flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
            {children}
            <p className="text-center mt-6 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                BROKERGY · Ingeniería Energética
            </p>
        </div>
    </div>
);

export function CeeAckView({ id, token, respuestaInicial }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [hecho, setHecho] = useState(null);   // 'acepta' | 'rechaza'
    const [motivo, setMotivo] = useState('');
    // El auto-aceptar solo puede dispararse UNA vez: sin esto, cualquier
    // re-render (o el modo estricto de React en desarrollo) lo lanzaría dos veces
    // y la segunda encontraría el token ya quemado, mostrando un error donde
    // acababa de haber un acierto.
    const yaDisparado = useRef(false);

    const responder = useCallback(async (respuesta, elMotivo = '') => {
        setEnviando(true);
        setError(null);
        try {
            await axios.post(`${API}/cee-ack/${id}`, { token, respuesta, motivo: elMotivo.trim() || null });
            setHecho(respuesta);
            // Aceptar termina DENTRO del expediente, igual que en el CAE: si no
            // hay sesión, la app enseña el login y entra ahí después. Al rechazar
            // no se redirige: el expediente ha dejado de ser suyo y desaparece de
            // su listado, así que llevarle allí sería enseñarle un 403.
            if (respuesta === 'acepta') {
                setTimeout(() => { window.location.href = `/?cee=${id}`; }, 2500);
            }
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido registrar tu respuesta.');
        } finally {
            setEnviando(false);
        }
    }, [id, token]);

    // Carga de la ficha del encargo.
    useEffect(() => {
        axios.get(`${API}/cee-ack/${id}`, { params: { token } })
            .then(r => setInfo(r.data))
            .catch(e => setError(e.response?.data?.error || 'Este enlace ya no es válido.'));
    }, [id, token]);

    // Auto-aceptar cuando el enlace es el de "Lo cojo" (?r=si). No espera a que
    // cargue la ficha: el técnico ya ha decidido al pulsar, y hacerle esperar a
    // una segunda petición solo alarga la pantalla en blanco.
    useEffect(() => {
        if (respuestaInicial !== 'si' || yaDisparado.current) return;
        yaDisparado.current = true;
        responder('acepta');
    }, [respuestaInicial, responder]);

    // ── Resultado ────────────────────────────────────────────────────────────
    if (hecho) {
        const acepta = hecho === 'acepta';
        return (
            <Marco>
                <div className="rounded-2xl border border-white/10 bg-bkg-surface p-8 text-center">
                    <div className={`w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center border ${
                        acepta ? 'bg-emerald-500/15 border-emerald-500/30' : 'bg-amber-500/15 border-amber-500/30'
                    }`}>
                        <span className="text-3xl">{acepta ? '✅' : '👍'}</span>
                    </div>
                    <h1 className="text-lg font-black text-white uppercase tracking-widest mb-2">
                        {acepta ? '¡Anotado, gracias!' : 'Gracias por avisar'}
                    </h1>
                    <p className="text-sm text-white/50">
                        {acepta
                            ? 'Queda registrado que te encargas de este certificado. Te llevamos al expediente…'
                            : 'Se lo asignaremos a otro técnico y desaparecerá de tu listado. No tienes que hacer nada más.'}
                    </p>
                    {acepta && (
                        <a href={`/?cee=${id}`}
                            className="inline-block mt-5 px-6 py-3 rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest hover:bg-brand-700 transition-colors">
                            Ir al expediente
                        </a>
                    )}
                </div>
            </Marco>
        );
    }

    if (error) {
        return (
            <Marco>
                <div className="rounded-2xl border border-white/10 bg-bkg-surface p-8 text-center">
                    <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center bg-white/[0.04] border border-white/10">
                        <span className="text-3xl">🔗</span>
                    </div>
                    <h1 className="text-lg font-black text-white uppercase tracking-widest mb-2">Enlace no válido</h1>
                    <p className="text-sm text-white/50">{error}</p>
                </div>
            </Marco>
        );
    }

    // Aceptando: no se le pregunta nada, igual que en el CAE.
    if (respuestaInicial === 'si') {
        return (
            <Marco>
                <div className="rounded-2xl border border-white/10 bg-bkg-surface p-10 text-center">
                    <div className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin mx-auto mb-5" />
                    <h1 className="text-lg font-black text-white uppercase tracking-widest mb-2">Confirmando el encargo…</h1>
                    <p className="text-sm text-white/50">Un momento.</p>
                </div>
            </Marco>
        );
    }

    if (!info) {
        return <Marco><p className="text-center text-white/30 text-xs font-black uppercase tracking-widest">Cargando…</p></Marco>;
    }

    // ── Rechazando: esto SÍ se confirma ──────────────────────────────────────
    return (
        <Marco>
            <div className="rounded-2xl border border-white/10 bg-bkg-surface overflow-hidden">
                <div className="px-6 py-5 border-b border-white/[0.06]">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-brand mb-1">Encargo de certificado</div>
                    <h1 className="text-xl font-black text-white">{info.numero_expediente}</h1>
                    <p className="text-sm text-white/45 mt-0.5">{info.faseLabel}</p>
                </div>

                <div className="px-6 py-5">
                    <Dato etiqueta="Cliente" valor={info.cliente} />
                    <Dato etiqueta="Dirección" valor={info.direccion} />
                    <Dato etiqueta="Catastro" valor={info.ref_catastral} />

                    <p className="text-sm text-white/60 mt-6 mb-3">
                        Vas a decirnos que <strong className="text-white">no puedes</strong> con este certificado.
                        Lo asignaremos a otro técnico y desaparecerá de tu listado. Si quieres, dinos por qué
                        —nos ayuda a no volver a ofrecerte lo que no te encaja.
                    </p>
                    <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        rows={3}
                        placeholder="Opcional: no tengo hueco estas semanas, me pilla lejos…"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none mb-4"
                    />

                    <div className="space-y-3">
                        <button onClick={() => responder('rechaza', motivo)} disabled={enviando}
                            className="w-full min-h-[52px] rounded-xl bg-amber-500 text-bkg-deep text-xs font-black uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-40">
                            {enviando ? 'Enviando…' : 'Confirmo que no puedo'}
                        </button>
                        {/* Salida por si llegó aquí por error: aceptar sigue a un clic. */}
                        <button onClick={() => responder('acepta')} disabled={enviando}
                            className="w-full min-h-[52px] rounded-xl border border-emerald-500/30 text-xs font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                            Me he equivocado, sí me encargo
                        </button>
                    </div>
                </div>
            </div>
        </Marco>
    );
}

export default CeeAckView;
