import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { registrarConfirm } from '../utils/emailFallback';

// ─────────────────────────────────────────────────────────────────────────────
// El AVISO y la PREGUNTA de la app.
//
// Dos cosas que se arreglaron el 10/09/2026 y que no conviene deshacer:
//
// 1. IDENTIDAD. Llevaba colores propios (slate + azul/ámbar/verde de Tailwind) y
//    no se parecía a nada más de la app: el mismo gesto —un popup que interrumpe
//    para decir algo— salía con una cara en el envío (`SendActionOverlay`) y con
//    otra aquí. Ahora comparte cáscara con el overlay de envío: fondo `#0F1013`,
//    filete de marca arriba, tipografía en versalitas y pie de BROKERGY. El
//    `bg-[#0F1013]` NO es un capricho: es el que `.theme-light` ya sabe remapear a
//    superficie clara, así que se ve bien en los dos temas sin tocar el tema.
//
// 2. LOS BOTONES DICEN LA DECISIÓN, no "Aceptar / Cancelar". Con un popup que
//    pregunta "¿la enviamos ahora al S.O.?", un botón que pone *Cancelar* se lee
//    como *deshacer la subida* —que es justo lo que NO hace—, así que quien quería
//    decir "ahora no" no encontraba dónde. `showConfirm` acepta las dos etiquetas
//    y quien pregunta las escribe con las palabras de su decisión.
//
// 3. Y va PORTALEADO al <body> (regla 29.b). Vivía dentro de `#root`, así que un
//    `SendActionOverlay` —que sí se portalea— lo tapaba por mucho z-index que
//    llevara: la pregunta quedaba invisible y la app se quedaba esperando un "sí"
//    que nadie podía dar.
// ─────────────────────────────────────────────────────────────────────────────

const ModalContext = createContext();

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    return context;
};

// Cada variante tiene su color de acento: el aro del icono, el resplandor y —solo
// en `error`— el botón principal, porque ahí el rojo ES la advertencia.
const VARIANTE = {
    error:   { aro: 'bg-red-500/15 border-red-400/50 text-red-400',         glow: 'bg-red-500/20',     path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    warning: { aro: 'bg-amber-500/15 border-amber-400/50 text-amber-400',   glow: 'bg-amber-500/20',   path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
    success: { aro: 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400', glow: 'bg-emerald-500/25', path: 'M5 13l4 4L19 7' },
    info:    { aro: 'bg-brand/15 border-brand/40 text-brand',               glow: 'bg-brand/20',       path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

// El mismo pie que el overlay de envío: firma, no cabecera. El logo va en su disco
// para que se lea igual en tema oscuro y en claro.
function BrandFooter() {
    return (
        <div className="mt-7 flex items-center justify-center gap-2 opacity-70">
            <img src="/logo-brokergy-circular-transparent.png" alt="" className="w-4 h-4 object-contain shrink-0" />
            <span className="text-[8px] font-black uppercase tracking-[0.35em] text-white/35">Brokergy</span>
        </div>
    );
}

export const ModalProvider = ({ children }) => {
    const [modal, setModal] = useState({
        isOpen: false,
        type: 'alert', // 'alert' | 'confirm'
        title: '',
        message: '',
        onConfirm: null,
        onCancel: null,
        confirmText: 'Aceptar',
        cancelText: 'Cancelar',
        variant: 'info', // 'info' | 'warning' | 'error' | 'success'
    });

    const showAlert = useCallback((message, title = 'Aviso', variant = 'info', opts = {}) => {
        return new Promise((resolve) => {
            setModal({
                isOpen: true,
                type: 'alert',
                title,
                message,
                variant,
                confirmText: opts.aceptar || 'Aceptar',
                onConfirm: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve();
                },
            });
        });
    }, []);

    /**
     * @param {string} message
     * @param {string} title
     * @param {string} variant  'info' | 'warning' | 'error' | 'success'
     * @param {object} opts     { confirmar, cancelar } — LAS PALABRAS DE LA DECISIÓN.
     *   "Aceptar / Cancelar" solo vale cuando la pregunta es literalmente si se
     *   sigue adelante. En cuanto la pregunta es una elección entre dos caminos
     *   ("¿la mando ahora o luego con las demás?"), *Cancelar* se lee como deshacer
     *   lo anterior y el camino que no se ha elegido no aparece por ninguna parte.
     */
    const showConfirm = useCallback((message, title = 'Confirmar', variant = 'warning', opts = {}) => {
        return new Promise((resolve) => {
            setModal({
                isOpen: true,
                type: 'confirm',
                title,
                message,
                variant,
                confirmText: opts.confirmar || 'Confirmar',
                cancelText: opts.cancelar || 'Cancelar',
                onConfirm: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve(true);
                },
                onCancel: () => {
                    setModal(prev => ({ ...prev, isOpen: false }));
                    resolve(false);
                },
            });
        });
    }, []);

    // Los envíos de email necesitan poder preguntar "¿lo mando desde el otro
    // buzón?" cuando el principal agota su cuota, y ocurren dentro de helpers sin
    // acceso al contexto. Se registra aquí el showConfirm real de la app.
    useEffect(() => { registrarConfirm(showConfirm); }, [showConfirm]);

    // ESC = la salida sin consecuencias. En una pregunta es "no"; en un aviso,
    // cerrarlo. Nunca se cierra pulsando FUERA: un clic despistado no puede
    // resolver una decisión (mismo criterio que los modales de cliente y partner).
    useEffect(() => {
        if (!modal.isOpen) return undefined;
        const esc = (e) => {
            if (e.key !== 'Escape') return;
            if (modal.type === 'confirm') modal.onCancel?.();
            else modal.onConfirm?.();
        };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [modal]);

    const v = VARIANTE[modal.variant] || VARIANTE.info;

    const popup = !modal.isOpen ? null : (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-black/[0.88] backdrop-blur-xl animate-fade-in">
            <div className="relative w-full max-w-sm bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                {/* Filete de marca: lo primero que entra por el ojo y lo que hace que
                    el popup se reconozca como de la casa sin leer una palabra. */}
                <div className="absolute inset-x-0 top-0 h-[3px] pointer-events-none" style={{ background: 'var(--brand-gradient)' }} />
                <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none ${v.glow}`} />

                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                    <div className="relative w-20 h-20 mb-5 flex items-center justify-center">
                        <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 ${v.aro}`}>
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={v.path} />
                            </svg>
                        </div>
                    </div>

                    <h3 className="text-xl font-black uppercase tracking-tight text-white">{modal.title}</h3>
                    {/* El cuerpo NO va en versalitas: es prosa, y a veces son cuatro
                        líneas explicando qué pasa si dices que sí. */}
                    <p className="mt-3 text-[12px] text-white/55 leading-relaxed whitespace-pre-wrap no-uppercase">
                        {modal.message}
                    </p>

                    {/* Apilados y a todo el ancho, como el overlay de envío: así caben
                        las palabras de la decisión ("Ahora no · las mando juntas") en
                        vez de tener que resumirlas en un verbo. */}
                    <div className="mt-7 w-full space-y-2">
                        <button
                            onClick={modal.onConfirm}
                            className={`w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all ${
                                modal.variant === 'error'
                                    ? 'bg-red-600 hover:bg-red-500 text-white'
                                    : 'bg-brand text-black hover:brightness-110'}`}>
                            {modal.confirmText}
                        </button>
                        {modal.type === 'confirm' && (
                            <button
                                onClick={modal.onCancel}
                                className="w-full py-3 rounded-xl bg-white/[0.06] border border-white/15 text-white/60 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">
                                {modal.cancelText}
                            </button>
                        )}
                    </div>

                    <BrandFooter />
                </div>
            </div>
        </div>
    );

    return (
        <ModalContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {popup && typeof document !== 'undefined' ? createPortal(popup, document.body) : popup}
        </ModalContext.Provider>
    );
};
