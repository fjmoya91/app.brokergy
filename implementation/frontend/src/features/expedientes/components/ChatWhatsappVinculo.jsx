import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── ChatWhatsappVinculo ─────────────────────────────────────────────────────
// Qué chat de WhatsApp habla de ESTA obra.
//
// El bot resuelve quién escribe por el teléfono, y con eso acierta en el 85 % de
// los casos (medido: 219 de 257 teléfonos con expedientes vivos resuelven a uno
// solo). Donde falla es con quien tiene varias obras a la vez —un instalador
// puede tener 33 vivas en el mismo chat—: ahí el bot pregunta de cuál se trata,
// y esta pantalla es la forma de ahorrarle la pregunta.
//
// Tres procedencias, y se distinguen a propósito:
//   · FIJADO      lo has dicho tú. No caduca y gana a todo lo demás.
//   · APRENDIDO   el propio cliente dijo de qué obra hablaba (vale unas horas).
//   · AUTOMÁTICO  le escribimos desde esta obra (vale unos días).
//
// Se enseñan los tres porque significan cosas distintas: uno es una decisión y
// los otros dos son una conjetura con fecha de caducidad. Presentarlos igual
// haría creer que el bot tiene una certeza que no tiene.

const ORIGEN_META = {
    manual: {
        label: 'Fijado',
        clase: 'text-brand border-brand/30 bg-brand/10',
        ayuda: 'Lo has asignado tú. El bot siempre usará esta obra para ese número.',
    },
    conversacion: {
        label: 'Aprendido',
        clase: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
        ayuda: 'El propio cliente dijo por WhatsApp que hablaba de esta obra.',
    },
    envio: {
        label: 'Automático',
        clase: 'text-white/50 border-white/10 bg-white/[0.04]',
        ayuda: 'Le hemos escrito desde esta obra. Es solo una pista y caduca a los días.',
    },
};

const fmtTelefono = (t) => {
    const d = String(t || '').replace(/\D/g, '');
    const nac = d.startsWith('34') ? d.slice(2) : d;
    return nac.length === 9 ? `${nac.slice(0, 3)} ${nac.slice(3, 5)} ${nac.slice(5, 7)} ${nac.slice(7)}` : d;
};

const hace = (iso) => {
    if (!iso) return null;
    const h = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (h < 1) return 'hace un momento';
    if (h < 24) return `hace ${Math.round(h)} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
};

export function ChatWhatsappVinculo({ expediente }) {
    const [chats, setChats] = useState([]);
    const [contactos, setContactos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const [abierto, setAbierto] = useState(false);
    const [manual, setManual] = useState('');
    // telefono → true|false|'?'  ·  si el chat lleva la etiqueta del bot.
    const [bot, setBot] = useState({});
    const [cambiando, setCambiando] = useState(null);

    const expId = expediente?.id;

    const cargar = useCallback(async () => {
        if (!expId) return;
        try {
            const { data } = await axios.get(`/api/expedientes/${expId}/whatsapp-chats`);
            setChats(data.chats || []);
            setContactos(data.contactos || []);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setCargando(false);
        }
    }, [expId]);

    useEffect(() => { cargar(); }, [cargar]);

    // ¿Está el bot activado en cada chat? Se pregunta APARTE y después de
    // pintar la lista: cada consulta cruza a WhatsApp y puede tardar o fallar
    // (sesión caída), y eso no puede retrasar lo demás ni dejar la ficha en
    // blanco. Mientras no se sabe, se dice que no se sabe.
    useEffect(() => {
        let vivo = true;
        (async () => {
            for (const c of chats) {
                try {
                    const { data } = await axios.get(
                        `/api/expedientes/${expId}/whatsapp-chats/${c.telefono}/etiqueta`);
                    if (vivo) setBot(b => ({ ...b, [c.telefono]: !!data.etiquetado }));
                } catch {
                    if (vivo) setBot(b => ({ ...b, [c.telefono]: '?' }));
                }
            }
        })();
        return () => { vivo = false; };
    }, [chats, expId]);

    const alternarBot = async (telefono, activar) => {
        setCambiando(telefono);
        setError(null);
        try {
            const { data } = await axios.post(
                `/api/expedientes/${expId}/whatsapp-chats/${telefono}/etiqueta`,
                { quitar: !activar });
            setBot(b => ({ ...b, [telefono]: !!data.etiquetado }));
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setCambiando(null);
        }
    };

    const fijar = async (telefono) => {
        const t = String(telefono || '').replace(/\D/g, '');
        // Nueve dígitos es un móvil español; con prefijo, once o más. Menos de
        // eso no es un teléfono y no merece la pena mandarlo al servidor para
        // que lo rechace.
        if (t.length < 9) { setError('Ese número no parece un teléfono.'); return; }
        setGuardando(true);
        try {
            const { data } = await axios.post(`/api/expedientes/${expId}/whatsapp-chats`, { telefono: t });
            setChats(data.chats || []);
            setManual('');
            setAbierto(false);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setGuardando(false);
        }
    };

    const soltar = async (telefono) => {
        setGuardando(true);
        try {
            const { data } = await axios.delete(`/api/expedientes/${expId}/whatsapp-chats/${telefono}`);
            setChats(data.chats || []);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setGuardando(false);
        }
    };

    // Un contacto que ya está vinculado no se vuelve a ofrecer: sería fijar lo
    // que ya está fijado y confunde sobre si ha hecho algo.
    const yaVinculado = (t) => chats.some(c => c.telefono.slice(-9) === String(t).slice(-9));
    const disponibles = contactos.filter(c => !yaVinculado(c.telefono));

    if (!expId) return null;

    return (
        <div className="pt-6 mt-6 border-t border-white/[0.06]">
            <div className="flex items-center justify-between gap-3 mb-1">
                <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                    Chat de WhatsApp de esta obra
                </h4>
                {!cargando && (
                    <button
                        type="button"
                        onClick={() => setAbierto(v => !v)}
                        className="text-[10px] font-black uppercase tracking-widest text-brand hover:text-brand/80 transition-colors shrink-0 max-md:px-3 max-md:py-2 max-md:-mr-3"
                    >
                        {abierto ? 'Cancelar' : '+ Asignar'}
                    </button>
                )}
            </div>
            <p className="text-[11px] text-white/30 leading-relaxed mb-3">
                Aquí se decide <span className="text-white/50">quién habla de esta obra</span> por
                WhatsApp y si el asistente le contesta. Asignar el número solo hace falta cuando
                ese teléfono tiene varias obras con nosotros; el interruptor del bot, siempre.
            </p>

            {error && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
                    {error}
                </div>
            )}

            {cargando ? (
                <p className="text-[11px] text-white/20 italic">Cargando…</p>
            ) : (
                <>
                    {/* ── Lo ya vinculado ── */}
                    {chats.length === 0 ? (
                        <p className="text-[11px] text-white/25 italic">
                            Ningún número asignado todavía. El asistente resolverá por el teléfono
                            del cliente y, si tuviera varias obras, le preguntará de cuál se trata.
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            {chats.map(c => {
                                const meta = ORIGEN_META[c.origen] || ORIGEN_META.envio;
                                return (
                                    <div
                                        key={c.chat_id}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bkg-surface/60 border border-white/[0.06]"
                                    >
                                        <svg className="w-4 h-4 text-emerald-400/60 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                        </svg>
                                        <div className="min-w-0 flex-1">
                                            <a
                                                href={`https://wa.me/${c.telefono}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-white font-bold text-sm hover:text-brand transition-colors"
                                            >
                                                {fmtTelefono(c.telefono)}
                                            </a>
                                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                                <span
                                                    title={meta.ayuda}
                                                    className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${meta.clase}`}
                                                >
                                                    {meta.label}
                                                </span>
                                                {hace(c.visto_at) && (
                                                    <span className="text-[10px] text-white/25 font-bold">{hace(c.visto_at)}</span>
                                                )}
                                            </div>

                                            {/* El interruptor del bot. Asignar la obra y ACTIVAR el bot son
                                                dos cosas distintas y hasta ahora la segunda había que hacerla
                                                a mano en el WhatsApp del móvil — que es justo el paso que se
                                                olvida, y el síntoma ("lo tengo asignado y no contesta") no
                                                apunta a él. */}
                                            <div className="mt-2">
                                                {bot[c.telefono] === undefined ? (
                                                    <span className="text-[10px] text-white/20 font-bold">comprobando el bot…</span>
                                                ) : bot[c.telefono] === '?' ? (
                                                    <span className="text-[10px] text-white/25 font-bold" title="Hace falta que WhatsApp esté conectado">
                                                        no se pudo comprobar el bot
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => alternarBot(c.telefono, !bot[c.telefono])}
                                                        disabled={cambiando === c.telefono}
                                                        className={`inline-flex items-center gap-1.5 px-2 py-1 max-md:py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${
                                                            bot[c.telefono]
                                                                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                                                                : 'text-white/40 border-white/10 bg-white/[0.03] hover:text-white hover:border-white/20'
                                                        }`}
                                                        title={bot[c.telefono]
                                                            ? 'El asistente contesta en este chat. Pulsa para desactivarlo.'
                                                            : 'El asistente NO contesta aquí. Pulsa para activarlo.'}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${bot[c.telefono] ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                                        {cambiando === c.telefono
                                                            ? '…'
                                                            : bot[c.telefono] ? 'Bot activo' : 'Bot apagado'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* El botón de quitar va SIEMPRE, también en lo automático:
                                            una pista que apunta a la obra equivocada es justo lo que
                                            hay que poder borrar sin esperar a que caduque.
                                            Los 28 px bastan con un ratón; con el pulgar no, así que
                                            en móvil sube a 44 como el resto de la app. */}
                                        <button
                                            type="button"
                                            onClick={() => soltar(c.telefono)}
                                            disabled={guardando}
                                            title="Quitar este número de esta obra"
                                            className="shrink-0 w-7 h-7 max-md:w-11 max-md:h-11 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Asignar ── */}
                    {abierto && (
                        <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                            {/* Los contactos del expediente van PRIMERO y como botones.
                                Teclear un móvil a mano es la forma más fácil de vincular
                                el chat equivocado, y los buenos ya están en la ficha. */}
                            {disponibles.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">
                                        Contactos de este expediente
                                    </p>
                                    <div className="space-y-1.5">
                                        {disponibles.map(c => (
                                            <button
                                                key={c.telefono}
                                                type="button"
                                                onClick={() => fijar(c.telefono)}
                                                disabled={guardando}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bkg-surface/60 border border-white/[0.06] hover:border-brand/40 hover:bg-brand/[0.06] transition-all text-left disabled:opacity-40"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-white text-sm font-bold truncate">{c.nombre}</p>
                                                    <p className="text-white/35 text-[11px] font-bold">
                                                        {c.papel} · {fmtTelefono(c.telefono)}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-brand shrink-0">
                                                    Asignar
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">
                                    {disponibles.length > 0 ? 'U otro número' : 'Número de WhatsApp'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="tel"
                                        inputMode="tel"
                                        value={manual}
                                        onChange={(e) => setManual(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fijar(manual); } }}
                                        placeholder="612 34 56 78"
                                        // 16px reales: por debajo de eso iOS amplía la página al enfocar.
                                        className="flex-1 min-w-0 bg-bkg-base border border-white/10 rounded-lg px-3 py-2 max-md:py-3 text-white text-base md:text-sm focus:border-brand/50 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fijar(manual)}
                                        disabled={guardando || manual.replace(/\D/g, '').length < 9}
                                        className="shrink-0 px-4 py-2 max-md:py-3.5 rounded-lg bg-brand text-bkg-deep font-black text-[11px] uppercase tracking-widest hover:shadow-lg hover:shadow-brand/20 active:scale-95 transition-all disabled:opacity-30 disabled:active:scale-100"
                                    >
                                        {guardando ? '…' : 'Asignar'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-white/25 mt-1.5">
                                    Sin prefijo se asume España (+34).
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default ChatWhatsappVinculo;
