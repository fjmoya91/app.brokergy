import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

/**
 * El QR para pasar la firma al móvil.
 *
 * Port de `ScannerApp/src/renderer/components/PhoneSignModal.tsx`. El QR no es
 * un adorno: la alternativa es teclear una URL con treinta y dos caracteres de
 * token en el teclado de un teléfono, con la errata garantizada. La URL se
 * enseña igualmente, porque hay cámaras que no leen bien un QR y porque a veces
 * hace falta mandársela a alguien por otro medio.
 *
 * REGLA — al teléfono NO le viaja el documento, solo vuelve la firma. Es lo que
 * hace razonable abrir esto con una cámara: con el token en la mano, lo único
 * que se puede hacer es mandar un PNG.
 */

const Icono = ({ d, className = 'w-5 h-5', w = 2 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={w}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D_MOVIL = 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z';
const D_COPIAR = 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z';
const D_OK = 'M5 13l4 4L19 7';

/** Cada cuánto se pregunta al servidor si ya ha firmado. */
const POLL_MS = 2000;

export function FirmarConMovil({ apiUrl, etiqueta, onFirma, onRaton }) {
    const [enlace, setEnlace] = useState(null);
    const [error, setError] = useState(null);
    const [restante, setRestante] = useState(0);
    const [copiado, setCopiado] = useState(false);
    const [otras, setOtras] = useState(false);
    const [qrActual, setQrActual] = useState(null);
    const [intento, setIntento] = useState(0);
    const vivo = useRef(true);
    const entregada = useRef(false);
    const alFirmar = useRef(onFirma);
    useEffect(() => { alFirmar.current = onFirma; });

    /**
     * Pedir el enlace. Va DENTRO del efecto y se repite subiendo `intento`, en
     * vez de llamar a una función que hace `setState`: el enlace se pide una vez
     * por montaje y cada renovación es un efecto nuevo con su propia cancelación,
     * así que una respuesta que llega tarde no puede pisar un enlace más nuevo.
     */
    useEffect(() => {
        vivo.current = true;
        let cancelado = false;
        (async () => {
            try {
                const { data } = await axios.post(`${apiUrl}/firma-movil`, { etiqueta });
                if (cancelado || !vivo.current) return;
                setError(null);
                setOtras(false);
                setEnlace(data);
                setQrActual(data.qr);
            } catch (e) {
                if (!cancelado && vivo.current) {
                    setError(e.response?.data?.error || 'No se ha podido abrir el enlace de firma.');
                }
            }
        })();
        return () => { cancelado = true; vivo.current = false; };
    }, [apiUrl, etiqueta, intento]);

    /** Pedir otro enlace a mano (el anterior caducó). */
    const renovar = () => { setEnlace(null); setQrActual(null); setIntento(n => n + 1); };

    // Esperar la firma. Se pregunta cada dos segundos en vez de abrir un
    // websocket: dura un minuto, y así sobrevive a que el PC recargue la página.
    useEffect(() => {
        if (!enlace) return;
        let parado = false;
        const id = setInterval(async () => {
            if (parado || entregada.current) return;
            try {
                const { data } = await axios.get(`${apiUrl}/firma-movil/${enlace.token}/esperar`);
                if (data.estado === 'firmada' && data.firma) {
                    entregada.current = true;
                    parado = true;
                    clearInterval(id);
                    alFirmar.current?.({ dataUrl: data.firma });
                } else if (data.estado === 'caducado') {
                    parado = true;
                    clearInterval(id);
                }
            } catch { /* un fallo de red suelto se reintenta al siguiente tic */ }
        }, POLL_MS);
        return () => { parado = true; clearInterval(id); };
    }, [apiUrl, enlace]);

    // Cuenta atrás. El enlace caduca solo; esto es para que no sorprenda.
    useEffect(() => {
        if (!enlace) return;
        const tick = () => setRestante(Math.max(0, enlace.caducaEn - Date.now()));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [enlace]);

    const minutos = Math.floor(restante / 60000);
    const segundos = Math.floor((restante % 60000) / 1000);
    const caducado = !!enlace && restante <= 0;

    const copiar = async () => {
        if (!enlace) return;
        try {
            await navigator.clipboard.writeText(enlace.url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch { /* sin portapapeles: la URL está a la vista */ }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
                    <Icono d={D_MOVIL} className="w-6 h-6 text-brand" w={1.7} />
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Firma con tu móvil</p>
                    <h2 className="text-base font-black text-white">{etiqueta}</h2>
                </div>
            </div>

            <p className="text-white/45 text-[13px] leading-relaxed">
                Con el ratón la firma sale rígida y no se parece a la tuya. Apunta con la cámara del móvil,
                firma con el dedo y <strong className="text-white">vuelve aquí</strong>: la pantalla continúa sola.
            </p>

            {error ? (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[12px] flex gap-2 items-start">
                    <Icono d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            ) : !enlace ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <p className="text-white/40 text-[11px] font-black uppercase tracking-widest">Preparando el enlace…</p>
                </div>
            ) : caducado ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center space-y-3">
                    <p className="text-white font-bold text-sm">El enlace ha caducado</p>
                    <p className="text-white/40 text-[12px]">Por seguridad solo dura unos minutos y sirve una vez.</p>
                    <button onClick={renovar}
                        className="px-5 py-2.5 rounded-xl bg-brand/15 border border-brand/40 text-brand text-[11px] font-black uppercase tracking-widest">
                        Generar otro enlace
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex justify-center">
                        {/* Fondo blanco SIEMPRE, también en tema oscuro: un QR en
                            negativo lo leen mal muchas cámaras de móvil. */}
                        <img src={qrActual} alt="Código QR para firmar desde el móvil"
                            className="w-56 h-56 rounded-2xl bg-white p-2" />
                    </div>

                    <div className="flex items-center gap-2 bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2">
                        <code className="text-[11px] text-white/50 truncate flex-1">{enlace.url}</code>
                        <button onClick={copiar} title="Copiar el enlace"
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 shrink-0">
                            <Icono d={copiado ? D_OK : D_COPIAR} className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white/30 font-bold uppercase tracking-wider">
                            Caduca en {minutos}:{String(segundos).padStart(2, '0')} · un solo uso
                        </span>
                        {enlace.alternativas?.length > 0 && (
                            <button onClick={() => setOtras(!otras)} className="text-brand/80 hover:text-brand font-black uppercase tracking-wider">
                                ¿No conecta?
                            </button>
                        )}
                    </div>

                    {/* Un ordenador normal tiene varias direcciones —Wi-Fi, cable,
                        VPN, máquinas virtuales— y solo una es la que ve el
                        teléfono. Se elige la más probable, pero acertar siempre es
                        imposible. */}
                    {otras && (
                        <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5 space-y-1">
                            <p className="text-[11px] text-amber-200/80 leading-snug">
                                El teléfono tiene que estar en la <strong>misma Wi-Fi</strong> que este ordenador.
                                Si no abre la página, prueba con otra dirección:
                            </p>
                            {enlace.alternativas.map((alt, i) => (
                                <button key={alt} onClick={() => setQrActual(enlace.qrAlternativas?.[i] || enlace.qr)}
                                    className="block w-full text-left text-[11px] font-mono text-amber-200/70 hover:bg-amber-500/10 rounded px-2 py-1 truncate">
                                    {alt}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-white/30">
                        <span className="h-px flex-1 bg-white/10" />
                        <span className="text-[10px] font-black uppercase tracking-widest">o si lo prefieres</span>
                        <span className="h-px flex-1 bg-white/10" />
                    </div>
                </>
            )}

            <button onClick={onRaton}
                className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/60 text-[11px] font-black uppercase tracking-widest hover:border-white/20">
                Firmar aquí con el ratón
            </button>
        </div>
    );
}

export default FirmarConMovil;
