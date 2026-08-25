import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── WhatsappEtiquetas ───────────────────────────────────────────────────────
// Las etiquetas de WhatsApp Business de un contacto, desde la ficha.
//
// Son las MISMAS que se ven en el móvil (Pagado, EN CURSO, ACEPTADO,
// DISTRIBUIDOR…) y sirven para lo mismo: organizar la cartera. La diferencia es
// que una de ellas —la del asistente— además decide si el bot contesta a ese
// chat, y hasta ahora ese paso había que darlo en el teléfono. Es justo el que
// se olvida, y el síntoma ("no contesta") no apunta a él.
//
// REGLA — se guarda la lista COMPLETA, no la que cambia. Así es la operación de
// WhatsApp por dentro; mandar solo una le borraría al chat todas las demás.

/** Píldora de una etiqueta, con el color que le puso WhatsApp. */
function Pildora({ etiqueta, puesta, esBot, onClick, ocupado }) {
    // WhatsApp da el color en hexadecimal con alfa (0xFF...). Si no viene, se
    // usa el color de marca: una etiqueta sin color se sigue pudiendo usar.
    const color = etiqueta.color || null;
    const estilo = puesta && color
        ? { backgroundColor: `${color}22`, borderColor: `${color}88`, color }
        : undefined;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={ocupado}
            title={esBot
                ? (puesta
                    ? 'El asistente contesta en este chat. Pulsa para desactivarlo.'
                    : 'Pulsa para que el asistente conteste a este cliente.')
                : (puesta ? 'Pulsa para quitar esta etiqueta' : 'Pulsa para poner esta etiqueta')}
            style={estilo}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 max-md:py-2.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${
                puesta
                    ? (color ? '' : 'text-brand border-brand/40 bg-brand/10')
                    : 'text-white/35 border-white/10 bg-white/[0.02] hover:text-white/70 hover:border-white/20'
            }`}
        >
            {puesta && (
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )}
            {etiqueta.name}
            {/* La del asistente se marca aparte: no es una etiqueta más, es un
                interruptor que hace hablar a una máquina con este cliente. */}
            {esBot && <span className="text-[9px] opacity-60">· bot</span>}
        </button>
    );
}

export function WhatsappEtiquetas({ telefono, puedeEditar = false }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const tlf = String(telefono || '').replace(/\D/g, '');

    const cargar = useCallback(async () => {
        if (tlf.length < 9) { setCargando(false); return; }
        setCargando(true);
        try {
            const { data } = await axios.get(`/api/whatsapp/etiquetas/${tlf}`);
            setDatos(data);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
            setDatos(null);
        } finally {
            setCargando(false);
        }
    }, [tlf]);

    useEffect(() => { cargar(); }, [cargar]);

    const alternar = async (id) => {
        if (!puedeEditar || !datos) return;
        const puestas = datos.puestas || [];
        const destino = puestas.includes(id)
            ? puestas.filter(x => x !== id)
            : [...puestas, id];

        // Se pinta el cambio antes de que responda el servidor: tocar una
        // etiqueta y que no pase nada durante un segundo hace pulsar otra vez.
        const previo = datos;
        setDatos({ ...datos, puestas: destino });
        setGuardando(true);
        try {
            const { data } = await axios.put(`/api/whatsapp/etiquetas/${tlf}`, { ids: destino });
            setDatos(d => ({ ...d, puestas: data.puestas || destino }));
            setError(null);
        } catch (e) {
            setDatos(previo);          // si falla, se deshace: no se miente
            setError(e.response?.data?.error || e.message);
        } finally {
            setGuardando(false);
        }
    };

    if (tlf.length < 9) return null;

    const etiquetas = datos?.etiquetas || [];
    const puestas = datos?.puestas || [];
    const nombreBot = (datos?.etiquetaBot || '').trim().toLowerCase();
    const esBot = (e) => e.name.trim().toLowerCase() === nombreBot;
    const botActivo = etiquetas.some(e => esBot(e) && puestas.includes(e.id));

    // Las puestas primero: son las que dicen algo de este cliente. El resto es
    // una lista para elegir, y con 16 etiquetas hay que poder ver de un vistazo
    // cuáles lleva sin leerlas todas.
    const ordenadas = [...etiquetas].sort((a, b) => {
        const pa = puestas.includes(a.id) ? 0 : 1;
        const pb = puestas.includes(b.id) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (esBot(a) !== esBot(b)) return esBot(a) ? -1 : 1;
        return a.name.localeCompare(b.name, 'es');
    });

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-2">
                <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                    Etiquetas de WhatsApp
                </h4>
                {botActivo && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Asistente activo
                    </span>
                )}
            </div>

            {error && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                    {error}
                </div>
            )}

            {cargando ? (
                <p className="text-[11px] text-white/20 italic">Consultando WhatsApp…</p>
            ) : !etiquetas.length ? (
                !error && <p className="text-[11px] text-white/25 italic">Esta cuenta no tiene etiquetas.</p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-1.5">
                        {ordenadas.map(e => (
                            <Pildora
                                key={e.id}
                                etiqueta={e}
                                puesta={puestas.includes(e.id)}
                                esBot={esBot(e)}
                                ocupado={guardando || !puedeEditar}
                                onClick={() => alternar(e.id)}
                            />
                        ))}
                    </div>
                    <p className="text-[10px] text-white/25 mt-2 leading-relaxed">
                        {puedeEditar
                            ? <>Son las mismas etiquetas del WhatsApp del móvil: lo que cambies aquí se ve allí.
                                Con <span className="text-white/45 font-bold">{datos?.etiquetaBot}</span> puesta,
                                el asistente contesta a los mensajes de este cliente.</>
                            : 'Solo un administrador puede cambiarlas.'}
                    </p>
                </>
            )}
        </div>
    );
}

export default WhatsappEtiquetas;
