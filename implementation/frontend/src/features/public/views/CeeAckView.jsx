import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// El técnico contesta al encargo: lo cojo / no puedo.
//
// Se abre desde el email o el WhatsApp, casi siempre CON EL MÓVIL y sin estar
// logueado. Por eso es pública y va con el token de un solo uso del encargo.
//
// REGLA — "No puedo" NO es un enlace de un clic. Aceptar sí lo es (un toque de
// más en el móvil no hace daño), pero rechazar retira al técnico del expediente
// y lo devuelve a la cola: un pulgar despistado en la bandeja de entrada no
// puede provocar eso. Pide confirmación y ofrece decir por qué, que es el dato
// que sirve para no volver a proponérselo.
// ─────────────────────────────────────────────────────────────────────────────

const isProd = typeof window !== 'undefined' && window.location.port !== '5173';
const API = isProd ? '/api/public' : 'http://localhost:3000/api/public';

const Dato = ({ etiqueta, valor }) => valor ? (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 w-28 shrink-0">{etiqueta}</span>
        <span className="text-sm text-white/80">{valor}</span>
    </div>
) : null;

export function CeeAckView({ id, token }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [confirmandoNo, setConfirmandoNo] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [hecho, setHecho] = useState(null); // 'acepta' | 'rechaza'

    const cargar = useCallback(() => {
        axios.get(`${API}/cee-ack/${id}`, { params: { token } })
            .then(r => setInfo(r.data))
            .catch(e => setError(e.response?.data?.error || 'Este enlace ya no es válido.'));
    }, [id, token]);

    useEffect(() => { cargar(); }, [cargar]);

    const responder = async (respuesta) => {
        setEnviando(true);
        try {
            await axios.post(`${API}/cee-ack/${id}`, { token, respuesta, motivo: motivo.trim() || null });
            setHecho(respuesta);
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido registrar tu respuesta.');
        } finally {
            setEnviando(false);
        }
    };

    const Marco = ({ children }) => (
        <div className="min-h-screen bg-bkg-deep flex items-center justify-center p-4">
            <div className="w-full max-w-lg">{children}</div>
        </div>
    );

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
                            ? 'Queda registrado que te encargas de este certificado. Ya puedes trabajar con la documentación de las carpetas compartidas.'
                            : 'Se lo asignaremos a otro técnico. No tienes que hacer nada más.'}
                    </p>
                </div>
                <p className="text-center mt-6 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    BROKERGY · Ingeniería Energética
                </p>
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

    if (!info) {
        return <Marco><p className="text-center text-white/30 text-xs font-black uppercase tracking-widest">Cargando…</p></Marco>;
    }

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

                    {!confirmandoNo ? (
                        <div className="mt-6 space-y-3">
                            <p className="text-sm text-white/50 text-center mb-4">
                                ¿Puedes encargarte de este certificado?
                            </p>
                            {/* Aceptar es un solo toque: es la respuesta esperada y no
                                deshace nada. */}
                            <button onClick={() => responder('acepta')} disabled={enviando}
                                className="w-full min-h-[52px] rounded-xl bg-emerald-500 text-bkg-deep text-xs font-black uppercase tracking-widest hover:bg-emerald-400 transition-colors disabled:opacity-40">
                                {enviando ? 'Un momento…' : 'Sí, me encargo'}
                            </button>
                            <button onClick={() => setConfirmandoNo(true)} disabled={enviando}
                                className="w-full min-h-[52px] rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40">
                                No puedo cogerlo
                            </button>
                        </div>
                    ) : (
                        <div className="mt-6">
                            <p className="text-sm text-white/60 mb-3">
                                Lo asignaremos a otro técnico. Si quieres, dinos por qué —nos ayuda a
                                no volver a ofrecerte lo que no te encaja.
                            </p>
                            <textarea
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                rows={3}
                                placeholder="Opcional: no tengo hueco estas semanas, me pilla lejos…"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none mb-3"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmandoNo(false)} disabled={enviando}
                                    className="flex-1 min-h-[52px] rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-white/45 hover:text-white transition-colors">
                                    Volver
                                </button>
                                <button onClick={() => responder('rechaza')} disabled={enviando}
                                    className="flex-[2] min-h-[52px] rounded-xl bg-amber-500 text-bkg-deep text-xs font-black uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-40">
                                    {enviando ? 'Enviando…' : 'Confirmo que no puedo'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <p className="text-center mt-6 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                BROKERGY · Ingeniería Energética
            </p>
        </Marco>
    );
}

export default CeeAckView;
