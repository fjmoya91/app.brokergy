import { useState } from 'react';
import { createPortal } from 'react-dom';
import { IconoMovil } from './IconosCroquis';

/**
 * El QR para PINTAR EL CROQUIS DESDE EL MÓVIL.
 *
 * Se abre al pulsar «📱 Pintar desde el móvil» y se CIERRA SOLO en cuanto el
 * teléfono abre el enlace: a partir de ahí lo que hay que mirar es el plano,
 * donde cada trazo aparece según se pinta (el popup lo taparía). Se puede
 * volver a ver el QR desde la barra del croquis mientras la sesión siga viva.
 *
 * Mismo planteamiento que la firma con el móvil (`FirmarConMovil`): el QR lo
 * dibuja el servidor, la URL se enseña igual (hay cámaras que no leen un QR) y
 * en local se ofrecen las otras direcciones de la red por si la primera no es
 * la que ve el teléfono.
 *
 * Va PORTALEADO a `document.body` (regla 29.b): la ventana de la envolvente
 * lleva `backdrop-blur` y un `position: fixed` dentro se anclaría a ella.
 *
 * Lo que manda en el popup es el ESTADO (esperando / conectado): los dos
 * botones son secundarios, porque el popup se cierra solo. Y «Cerrar el
 * enlace» se dice con esas palabras: parecía el botón inofensivo y es el que
 * termina la sesión del móvil.
 */
export function CroquisMovilModal({ sesion, conectado, onCerrar, onTerminar }) {
    const [qrActual, setQrActual] = useState(null);
    const [otras, setOtras] = useState(false);
    const [copiado, setCopiado] = useState(false);
    if (!sesion) return null;
    const qr = qrActual || sesion.qr;

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(sesion.url);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch { /* sin portapapeles: la URL está a la vista */ }
    };

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0
                        backdrop-blur-sm md:items-center md:p-6"
             role="dialog" aria-modal="true" aria-label="Pintar el croquis desde el móvil">
            <div className="w-full max-w-md rounded-t-2xl border border-white/10 bg-bkg-surface p-5
                            pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-2xl">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                                    bg-violet-400/15 text-violet-300"><IconoMovil size={22} /></div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">
                            Pintar desde el móvil
                        </p>
                        <h2 className="text-base font-black text-white">
                            Croquis de {sesion.planta?.nombre?.toLowerCase() || 'la planta'}
                        </h2>
                    </div>
                    <button onClick={onCerrar} aria-label="Cerrar"
                            className="px-1.5 text-lg leading-none text-white/50 hover:text-white">✕</button>
                </div>

                <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                    Rodea con el dedo el garaje, el porche… <strong className="text-white">Lo verás aquí
                    mismo según lo pintas</strong>, y los m² los pone Catastro.
                </p>
                <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-white/70">
                    {['Escanea el QR', 'Rodea con el dedo', 'Ajusta a Catastro'].map((t, i) => (
                        <li key={t} className="flex items-center gap-1.5">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-400/20
                                             text-[10px] font-black text-violet-300">{i + 1}</span>
                            {t}
                        </li>
                    ))}
                </ol>

                <div className="mt-4 flex justify-center">
                    {/* Fondo blanco SIEMPRE: un QR en negativo lo leen mal muchas cámaras. */}
                    <img src={qr} alt="Código QR para pintar el croquis desde el móvil"
                         className="h-56 w-56 rounded-2xl border border-black/10 bg-white p-2" />
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10
                                bg-white/[0.03] px-3 py-2">
                    <code className="flex-1 truncate text-[11px] text-white/55">{sesion.url}</code>
                    <button onClick={copiar} title="Copiar el enlace"
                            className="shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-bold text-white/60
                                       hover:bg-white/10 hover:text-white">
                        {copiado ? '✓ Copiado' : 'Copiar'}
                    </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-2 text-[13px] font-bold
                                      ${conectado ? 'text-emerald-300' : 'text-white/85'}`}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full
                                          ${conectado ? 'bg-emerald-400' : 'animate-pulse bg-violet-400'}`} />
                        {conectado ? '✓ Móvil conectado' : 'Esperando a que se abra en el móvil…'}
                    </span>
                    {sesion.alternativas?.length > 0 && (
                        <button onClick={() => setOtras(!otras)}
                                className="text-[11px] font-black uppercase tracking-wider text-violet-300/80 hover:text-violet-200">
                            ¿No conecta?
                        </button>
                    )}
                </div>

                {/* Un ordenador tiene varias direcciones —Wi-Fi, cable, VPN,
                    máquinas virtuales— y solo una es la que ve el teléfono. */}
                {otras && (
                    <div className="mt-2 space-y-1 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2.5">
                        <p className="text-[11px] leading-snug text-amber-200/85">
                            El teléfono tiene que estar en la <strong>misma Wi-Fi</strong> que este ordenador.
                            Si no abre la página, prueba con otra dirección:
                        </p>
                        {sesion.alternativas.map((alt, i) => (
                            <button key={alt} onClick={() => setQrActual(sesion.qrAlternativas?.[i] || sesion.qr)}
                                    className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[11px]
                                               text-amber-200/75 hover:bg-amber-500/10">
                                {alt}
                            </button>
                        ))}
                    </div>
                )}

                {!sesion.conCartografia && (
                    <p className="mt-2 text-[11px] text-white/45">
                        Sin la cartografía del Catastro de fondo (no se ha podido traer): en el móvil
                        se verán solo las paredes.
                    </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                    <button onClick={onTerminar} title="Termina la sesión: el móvil deja de poder pintar"
                            className="rounded-lg px-2 py-2 text-[11.5px] font-bold text-rose-300/80
                                       hover:text-rose-200">
                        Cerrar el enlace
                    </button>
                    <button onClick={onCerrar} title="El enlace sigue vivo: se puede volver a ver el QR desde la barra"
                            className="rounded-lg border border-white/10 px-3 py-2 text-[11.5px] font-bold
                                       text-white/75 hover:bg-white/[0.06] hover:text-white">
                        Ocultar
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default CroquisMovilModal;
