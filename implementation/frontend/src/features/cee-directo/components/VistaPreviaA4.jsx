import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Vista previa de un documento A4 (oferta, factura) que se lee IGUAL en el
// móvil que en el PC.
//
// El HTML del documento está maquetado a 794 px (una hoja A4 a 96 ppp): es el
// mismo que se rasteriza a PDF. Metido tal cual en un iframe de 375 px se
// RECOLOCA —las columnas de la tabla se montan unas sobre otras y la cabecera se
// sale por la derecha— y lo que se revisa ya no es el documento que se envía.
// Por eso se pinta SIEMPRE a su ancho real y se ENCOGE entero para que quepa:
// en el PC sale a tamaño natural (escala 1) y en el móvil, la hoja completa.
// Si hace falta leer un detalle, el navegador del móvil deja ampliar con dos dedos.
const ANCHO_A4 = 794;

export function VistaPreviaA4({ html, titulo, rotulo, onClose }) {
    const marco = useRef(null);
    const iframe = useRef(null);
    const [escala, setEscala] = useState(1);
    const [alto, setAlto] = useState(1123);

    // Ancho disponible → escala. Nunca se agranda por encima de 1: a tamaño
    // natural el documento ya se lee, y ampliarlo solo lo pixela.
    useEffect(() => {
        const el = marco.current;
        if (!el) return;
        const medir = () => setEscala(Math.min(1, el.clientWidth / ANCHO_A4));
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // El iframe mide lo que mide el documento, para que el scroll lo lleve el
    // marco (el que se ha encogido) y no un iframe con su propia barra dentro.
    const alCargar = () => {
        try {
            const doc = iframe.current?.contentDocument;
            const h = Math.max(doc?.documentElement?.scrollHeight || 0, doc?.body?.scrollHeight || 0);
            if (h) setAlto(h);
        } catch { /* sin acceso al documento: se queda con el alto de una hoja */ }
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-stretch md:items-center justify-center md:p-6" onClick={onClose}>
            <div className="bg-bkg-surface w-full md:max-w-[860px] h-[100dvh] md:h-[92vh] md:rounded-xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/10 shrink-0"
                    style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
                    <span className="text-[11px] font-black uppercase tracking-widest text-white/60">{rotulo}</span>
                    <button onClick={onClose} aria-label="Cerrar la vista previa"
                        className="min-w-[44px] min-h-[44px] -mr-2 text-white/50 hover:text-white text-2xl leading-none">×</button>
                </div>
                <div ref={marco} className="flex-1 overflow-y-auto overflow-x-hidden bg-neutral-500/30"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    <div style={{ width: ANCHO_A4 * escala, height: alto * escala, margin: '0 auto' }}>
                        <iframe ref={iframe} title={titulo} srcDoc={html} onLoad={alCargar} scrolling="no"
                            className="bg-white block border-0"
                            style={{ width: ANCHO_A4, height: alto, transform: `scale(${escala})`, transformOrigin: 'top left' }} />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
