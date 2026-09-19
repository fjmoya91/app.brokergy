import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../../utils/useIsMobile';
import { aFecha, aHora, componer, esValido, atajos, porDefecto, textoFecha } from '../logic/programarEnvio';

// ─────────────────────────────────────────────────────────────────────────────
// Elegir CUÁNDO sale un envío. Cuelga del botón de reloj que va pegado a
// ENVIAR: es la misma decisión, y el reloj solo cambia el "ahora" por una hora.
//
// REGLA — se PORTALEA a `document.body` y va `fixed` (regla 29.b). El popup de
// envío es una caja con `overflow-hidden`, así que un panel `absolute` dentro
// del pie se recortaría justo por abajo, que es donde vive.
//
// REGLA — los ATAJOS van primero y el calendario detrás. La aritmética de
// fechas vive en `logic/programarEnvio.js`, fuera de aquí, para poder probarla.
//
// En móvil es HOJA INFERIOR: 340 px colgando de un botón de 44 en una pantalla
// de 375 se salen de la pantalla (mismo criterio que el resto de la app).
// ─────────────────────────────────────────────────────────────────────────────

export function ProgramarEnvioPanel({
    anchorRef,          // ref del botón de reloj (para anclar el panel)
    onClose,
    onProgramar,        // (Date) => Promise<void>
    resumen,            // "a 2 destinatarios por email y WhatsApp"
    aviso,              // línea en ámbar (despachador apagado, WhatsApp…)
    busy = false,
}) {
    const esMovil = useIsMobile();
    const cajaRef = useRef(null);
    const [inicial] = useState(() => porDefecto());
    const [opciones] = useState(() => atajos());
    // El mínimo del calendario es HOY, no el valor por defecto: quien quiere
    // mandarla dentro de una hora la manda HOY. Que la hora elegida sea posterior
    // a ahora lo decide `esValido`, que es quien sabe la hora — el calendario solo
    // sabe de días, y cerrar el de hoy deja fuera medio día de envíos legítimos.
    const [hoy] = useState(() => aFecha(new Date()));
    const [fecha, setFecha] = useState(() => aFecha(inicial));
    const [hora, setHora] = useState(() => aHora(inicial));
    const [valido, setValido] = useState(true);
    const [error, setError] = useState(null);
    const [pos, setPos] = useState(null);

    const elegido = componer(fecha, hora);

    // La validez depende del RELOJ, así que se recalcula en un efecto: leer la
    // hora durante el render es justo lo que la regla de pureza prohíbe.
    useEffect(() => { setValido(esValido(componer(fecha, hora))); }, [fecha, hora]);

    // Anclado al botón y volteado hacia ARRIBA: el reloj vive en el pie del
    // popup, así que abajo no hay sitio.
    useLayoutEffect(() => {
        if (esMovil) return;
        const r = anchorRef?.current?.getBoundingClientRect();
        if (!r) return;
        const ancho = 340;
        setPos({
            bottom: Math.max(12, window.innerHeight - r.top + 10),
            left: Math.min(Math.max(12, r.right - ancho), window.innerWidth - ancho - 12),
            width: ancho,
        });
    }, [esMovil, anchorRef]);

    // Cerrar al pulsar fuera / con Escape. El panel decide una sola cosa; que
    // haya que buscarle la X sería un clic de peaje.
    useEffect(() => {
        const fuera = (e) => {
            if (cajaRef.current?.contains(e.target)) return;
            if (anchorRef?.current?.contains(e.target)) return;
            onClose?.();
        };
        const tecla = (e) => { if (e.key === 'Escape') onClose?.(); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', tecla);
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
    }, [anchorRef, onClose]);

    const ponerAtajo = (d) => { setFecha(aFecha(d)); setHora(aHora(d)); setError(null); };

    const confirmar = async () => {
        const d = componer(fecha, hora);
        if (!d) { setError('Elige la fecha y la hora.'); return; }
        if (!esValido(d)) { setError('Esa hora ya ha pasado. Elige al menos un minuto por delante.'); return; }
        setError(null);
        // Un fallo se enseña AQUÍ, no detrás del panel: el aviso del popup queda
        // tapado por esta caja y el botón seguiría invitando a pulsarlo otra vez.
        try { await onProgramar(d); }
        catch (err) { setError(err?.message || 'No se pudo programar el envío.'); }
    };

    const cuerpo = (
        <div
            ref={cajaRef}
            style={esMovil ? undefined : (pos || { bottom: 80, left: 40, width: 340 })}
            className={esMovil
                ? 'fixed inset-x-0 bottom-0 z-[10050] bg-[#0F1013] border-t border-white/10 rounded-t-3xl shadow-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200'
                : 'fixed z-[10050] bg-[#0F1013] border border-white/10 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in duration-150'}
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
                    Programar el envío
                </h3>
                <button onClick={onClose} className="text-white/30 hover:text-white text-lg leading-none px-1">×</button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
                {opciones.map((a, i) => {
                    const activo = fecha === aFecha(a.d) && hora === aHora(a.d);
                    const solo = i === opciones.length - 1 && opciones.length % 2 === 1;
                    return (
                        <button key={a.label} onClick={() => ponerAtajo(a.d)}
                            className={`px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${solo ? 'col-span-2' : ''} ${activo ? 'bg-brand text-black' : 'bg-white/[0.04] border border-white/10 text-white/60 hover:text-white hover:border-white/25'}`}>
                            {a.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center gap-2">
                {/* 16px en los dos campos: por debajo, iOS amplía la página al
                    enfocarlos y el panel se sale de la pantalla. */}
                <input type="date" value={fecha} min={hoy}
                    onChange={e => { setFecha(e.target.value); setError(null); }}
                    className="flex-1 min-w-0 no-uppercase bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2.5 text-white text-[16px] md:text-[13px] focus:outline-none focus:border-brand/40" />
                <input type="time" value={hora} step="300"
                    onChange={e => { setHora(e.target.value); setError(null); }}
                    className="w-[7.5rem] shrink-0 no-uppercase bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2.5 text-white text-[16px] md:text-[13px] focus:outline-none focus:border-brand/40" />
            </div>

            {/* Con la hora ya pasada se dice POR QUÉ no vale: el botón se apaga
                solo, y un botón apagado sin explicación se lee como una avería. */}
            <p className={`mt-2.5 text-[10px] leading-relaxed ${valido || !elegido ? 'text-white/40' : 'text-amber-400/90'}`}>
                {valido && elegido
                    ? <>Saldrá el <span className="text-white font-bold">{textoFecha(elegido)}</span>{resumen ? ` · ${resumen}` : ''}.</>
                    : elegido
                        ? 'Esa hora ya ha pasado. Elige una posterior a ahora.'
                        : 'Elige cuándo tiene que salir.'}
            </p>
            {/* Lo que se programa es el documento de AHORA: si mañana se cambia
                el precio en la calculadora, esto sigue llevando el de hoy. */}
            <p className="mt-1 text-[10px] text-white/25 leading-relaxed">
                Se guardan el mensaje y el PDF tal y como están ahora. No hace falta dejar el ordenador encendido.
            </p>
            {aviso && <p className="mt-2 text-[10px] text-amber-400/90 leading-relaxed">⚠️ {aviso}</p>}
            {error && <p className="mt-2 text-[10px] text-red-400">{error}</p>}

            <button onClick={confirmar} disabled={busy || !valido}
                className="mt-3 w-full py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                {busy ? 'Programando…' : 'Programar el envío'}
            </button>
        </div>
    );

    return createPortal(
        <>
            {esMovil && <div className="fixed inset-0 z-[10040] bg-black/60" onClick={onClose} />}
            {cuerpo}
        </>,
        document.body
    );
}

export default ProgramarEnvioPanel;
