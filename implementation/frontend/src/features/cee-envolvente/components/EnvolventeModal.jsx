import { useEffect, useRef } from 'react';
import { EnvolventeView } from '../views/EnvolventeView';

// ─────────────────────────────────────────────────────────────────────────────
// La envolvente, en una ventana.
//
// Se abre desde la barra del certificador. Ocupa casi toda la pantalla porque
// dentro hay planos: en una columna estrecha no se distingue una pared de otra,
// y equivocarse de pared es el único error caro que puede cometer aquí.
//
// No cierra al pulsar fuera. Dentro hay trabajo a medio hacer —ventanas puestas
// una a una— y un clic despistado en el fondo no puede tirarlo.
// ─────────────────────────────────────────────────────────────────────────────

export function EnvolventeModal({ abierto, onCerrar, expediente, onAviso }) {
    const caja = useRef(null);

    useEffect(() => {
        if (!abierto) return;
        const conEsc = e => { if (e.key === 'Escape') onCerrar(); };
        document.addEventListener('keydown', conEsc);
        // Sin esto la página de detrás sigue desplazándose bajo el modal.
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        caja.current?.focus();
        return () => {
            document.removeEventListener('keydown', conEsc);
            document.body.style.overflow = antes;
        };
    }, [abierto, onCerrar]);

    if (!abierto) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-start justify-center
                        bg-black/70 p-3 backdrop-blur-sm md:p-6 animate-fade-in"
             role="dialog" aria-modal="true" aria-label="Envolvente térmica">
            <div
                ref={caja}
                tabIndex={-1}
                className="flex max-h-full w-full max-w-[1180px] flex-col overflow-hidden
                           rounded-2xl border border-white/10 bg-bkg-deep shadow-2xl
                           focus:outline-none">

                <header className="flex items-center gap-3 border-b border-white/[0.07]
                                   bg-bkg-surface/60 px-5 py-4">
                    <span className="rounded-lg border border-brand/40 bg-brand/10 px-2 py-1
                                     text-[10px] font-black uppercase tracking-widest text-brand">
                        CE3X
                    </span>
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-black uppercase tracking-widest">
                            Envolvente térmica
                        </h3>
                        <p className="truncate text-[11px] text-white/40">
                            {expediente?.numero_expediente || expediente?.id || ''}
                        </p>
                    </div>
                    <button
                        onClick={onCerrar}
                        className="ml-auto rounded-lg border border-white/10 px-3 py-2
                                   text-[10px] font-black uppercase tracking-widest
                                   text-white/40 hover:border-white/25 hover:text-white">
                        Cerrar
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                    <EnvolventeView expediente={expediente} onAviso={onAviso} />
                </div>
            </div>
        </div>
    );
}

export default EnvolventeModal;
