import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// ============================================================================
// GuardarEnCatalogoGate — "esta ficha, ¿la guardo también en el catálogo?"
// ----------------------------------------------------------------------------
// La ficha técnica aparece casi siempre por el lado del expediente: alguien la
// busca para UNA obra y la sube ahí. Sin el camino de vuelta, el hueco del modelo
// se queda vacío para siempre y el siguiente expediente con el mismo equipo la
// vuelve a buscar desde cero.
//
// REGLA — se PROPONE, nunca se escribe en silencio. La casilla nace MARCADA si el
// modelo no tiene ficha (ahí no hay nada que perder) y DESMARCADA si ya la tiene,
// diciendo que la sustituye: un PDF equivocado en el catálogo se propaga a todos
// los expedientes que vengan detrás, y eso no puede pasar por descuido.
//
// REGLA — sin modelo del catálogo NO hay puerta. Si el equipo se tecleó a mano no
// hay a quién guardárselo, así que la subida sigue directa: preguntar algo que no
// se puede contestar es un clic de peaje.
//
// Vale para los TRES catálogos: la bomba de calor (huecos cal/acs), el marco y el
// vidrio. El `kind` sale del tipo del hueco.
// ============================================================================

/** De qué catálogo es este hueco, y de dónde se lee la fila del modelo. */
const CATALOGO = {
    marco:      { etiqueta: 'marco',           url: (id) => `/api/ventanas/marcos/${id}`,
                  nombre: (r) => [r.marca, r.serie, r.apertura].filter(Boolean).join(' ') },
    cristal:    { etiqueta: 'vidrio',          url: (id) => `/api/ventanas/cristales/${id}`,
                  nombre: (r) => [r.fabricante, r.gama, r.composicion].filter(Boolean).join(' · ') },
    aerotermia: { etiqueta: 'equipo',          url: (id) => `/api/aerotermia/${id}`,
                  nombre: (r) => [r.marca, r.modelo_comercial || r.modelo_conjunto].filter(Boolean).join(' ') },
};

export function kindDeTipo(type) {
    if (type === 'marco') return 'marco';
    if (type === 'cristal') return 'cristal';
    return 'aerotermia';
}

/**
 * @param {object} slot     el hueco de ficha (necesita `type` y `modelId`)
 * @param {string} nombreFichero  el fichero que se acaba de elegir
 * @param {(opts:{guardarEnCatalogo:boolean, sustituirEnCatalogo:boolean}) => void} onConfirmar
 * @param {() => void} onCancelar
 */
export function GuardarEnCatalogoGate({ slot, nombreFichero, onConfirmar, onCancelar }) {
    const kind = kindDeTipo(slot?.type);
    const cfg = CATALOGO[kind];
    const [modelo, setModelo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardar, setGuardar] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { data } = await axios.get(cfg.url(slot.modelId));
                if (!vivo) return;
                setModelo(data);
                // Marcada solo si el hueco del catálogo está vacío.
                setGuardar(!String(data?.ficha_tecnica || '').trim());
            } catch {
                if (vivo) setModelo(null);
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot?.modelId]);

    // Si no se puede leer el modelo, no se inventa una pregunta: se sube y ya.
    useEffect(() => {
        if (!cargando && !modelo) onConfirmar?.({ guardarEnCatalogo: false, sustituirEnCatalogo: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cargando, modelo]);

    if (cargando || !modelo) return null;

    const yaTiene = !!String(modelo.ficha_tecnica || '').trim();
    const etiquetaModelo = cfg.nombre(modelo) || 'este modelo';

    return createPortal(
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-bkg-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                    <h3 className="text-white font-black uppercase tracking-widest text-xs">Ficha técnica</h3>
                    <p className="text-sm text-white/50 mt-2 leading-snug">
                        Vas a subir <b className="text-white/80">{nombreFichero}</b> a este expediente.
                    </p>

                    <label className="mt-5 flex items-start gap-3 cursor-pointer select-none bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                        <input type="checkbox" checked={guardar}
                               onChange={e => setGuardar(e.target.checked)}
                               className="mt-0.5 w-4 h-4 accent-brand shrink-0" />
                        <span className="text-xs leading-snug">
                            <b className="text-white/90">
                                Guardarla también en el catálogo ({cfg.etiqueta} {etiquetaModelo})
                            </b>
                            <br />
                            {yaTiene ? (
                                <span className="text-amber-300/80">
                                    ⚠ Ese {cfg.etiqueta} YA tiene ficha en el catálogo. Si marcas esto la
                                    sustituyes, y a partir de ahora se adjuntará ésta en todos los expedientes
                                    que lleven ese modelo. La anterior queda archivada en OLD.
                                </span>
                            ) : (
                                <span className="text-white/35">
                                    No la tiene. Guardándola aquí, los siguientes expedientes con ese
                                    {' '}{cfg.etiqueta} la adjuntan solos y nadie tiene que volver a buscarla.
                                </span>
                            )}
                        </span>
                    </label>
                </div>

                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3">
                    <button onClick={onCancelar}
                            className="px-4 py-2 rounded-xl text-[11px] font-black uppercase text-white/30 hover:text-white/60 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirmar?.({
                            guardarEnCatalogo: guardar,
                            sustituirEnCatalogo: guardar && yaTiene,
                        })}
                        className="px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all">
                        Subir la ficha
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
