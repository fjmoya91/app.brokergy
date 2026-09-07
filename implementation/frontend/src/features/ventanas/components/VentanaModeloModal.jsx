import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import {
    APERTURAS, MATERIALES_MARCO, FABRICANTES_CRISTAL, faltaEnMarco, faltaEnCristal, enumerar,
} from '../../expedientes/logic/ventanasCatalogo';

// ============================================================================
// VentanaModeloModal — dar de alta o corregir un modelo del catálogo.
// ----------------------------------------------------------------------------
// Se abre DESDE EL EXPEDIENTE (además de desde la pestaña del catálogo), y ese es
// el punto: si para añadir un modelo hubiera que salir a otra pantalla, nadie lo
// añadiría — se escribiría a mano en el expediente y el catálogo seguiría vacío.
//
// REGLA — el alta desde el expediente es IDEMPOTENTE (`upsertar`). El mismo
// modelo se puede estar dando de alta desde dos expedientes a la vez; chocar con
// la clave única a mitad de rellenar la envolvente es un callejón sin salida.
// Desde la pestaña del catálogo NO se upserta: allí un duplicado es un aviso
// útil ("ese modelo ya está"), porque quien lo teclea está mirando la lista.
//
// REGLA — se PORTALEA a `document.body`. El módulo de Envolvente vive dentro de
// una tarjeta con `overflow-hidden`, que recortaría el modal (mismo motivo que
// `SendActionOverlay`, regla 29.b).
// ============================================================================

const Campo = ({ label, hint, children }) => (
    <div className="space-y-1.5">
        <label className="text-[10px] text-white/35 uppercase font-black tracking-widest ml-0.5">{label}</label>
        {children}
        {hint && <p className="text-[10px] text-white/25 leading-snug ml-0.5">{hint}</p>}
    </div>
);

const inputCls = 'w-full h-11 bg-bkg-elevated border border-white/10 rounded-xl px-4 text-sm font-bold text-white focus:outline-none focus:border-brand/40 transition-all';

export function VentanaModeloModal({ tipo, modelo, onClose, onGuardado, desdeExpediente = false }) {
    const esMarco = tipo === 'marcos';
    const editando = !!modelo?.id;

    const [f, setF] = useState(() => (esMarco ? {
        marca: modelo?.marca || '',
        serie: modelo?.serie || '',
        apertura: modelo?.apertura || 'ABISAGRADA',
        material: modelo?.material || '',
        uf: modelo?.uf ?? '',
        permeabilidad: modelo?.permeabilidad || '',
        ficha_tecnica: modelo?.ficha_tecnica || '',
        notas: modelo?.notas || '',
        validado: !!modelo?.validado,
    } : {
        fabricante: modelo?.fabricante || 'GUARDIAN',
        gama: modelo?.gama || '',
        composicion: modelo?.composicion || '',
        ug: modelo?.ug ?? '',
        factor_solar: modelo?.factor_solar ?? '',
        transmision_luminosa: modelo?.transmision_luminosa ?? '',
        ficha_tecnica: modelo?.ficha_tecnica || '',
        notas: modelo?.notas || '',
        validado: !!modelo?.validado,
    }));

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', esc);
        return () => document.removeEventListener('keydown', esc);
    }, [onClose]);

    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    // Lo que le seguiría faltando al modelo tal y como está el formulario ahora.
    // Se enseña ANTES de guardar: un modelo sin Uf se puede guardar (la ficha ya
    // vale de algo), pero conviene saber que no va a autorrellenar nada.
    const falta = esMarco ? faltaEnMarco(f) : faltaEnCristal(f);

    const guardar = async () => {
        setGuardando(true); setError(null);
        try {
            const body = { ...f, upsertar: !editando && desdeExpediente };
            const { data } = editando
                ? await axios.put(`/api/ventanas/${tipo}/${modelo.id}`, body)
                : await axios.post(`/api/ventanas/${tipo}`, body);
            onGuardado?.(data);
            onClose?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido guardar el modelo');
        } finally {
            setGuardando(false);
        }
    };

    const titulo = editando
        ? (esMarco ? 'Editar el marco' : 'Editar el vidrio')
        : (esMarco ? 'Nuevo marco en el catálogo' : 'Nuevo vidrio en el catálogo');

    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
             onClick={onClose}>
            <div className="w-full max-w-2xl bg-bkg-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                 onClick={e => e.stopPropagation()}>

                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-white font-black uppercase tracking-widest text-xs">{titulo}</h3>
                        <p className="text-[10px] text-white/30 mt-0.5">
                            Queda en el catálogo para todos los expedientes, no solo para éste.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5">
                    {esMarco ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Campo label="Marca del sistema"
                                       hint="El FABRICANTE del perfil (Cortizo, Kömmerling…), no la carpintería que monta la ventana.">
                                    <input className={inputCls} value={f.marca}
                                           onChange={e => set('marca', e.target.value)} placeholder="CORTIZO" />
                                </Campo>
                                <Campo label="Serie / modelo">
                                    <input className={inputCls} value={f.serie}
                                           onChange={e => set('serie', e.target.value)} placeholder="A 70" />
                                </Campo>
                                <Campo label="Apertura"
                                       hint="El Uf es de la serie EN ESA APERTURA: la misma serie da un valor abisagrada y otro corredera.">
                                    <select className={inputCls} value={f.apertura} onChange={e => set('apertura', e.target.value)}>
                                        {APERTURAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Material">
                                    <select className={inputCls} value={f.material} onChange={e => set('material', e.target.value)}>
                                        <option value="">— Sin indicar —</option>
                                        {MATERIALES_MARCO.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </Campo>
                                <Campo label="Uf (W/m²K)" hint="El de la CARPINTERÍA, no el Uw de la ventana entera.">
                                    <input className={inputCls} value={f.uf} inputMode="decimal"
                                           onChange={e => set('uf', e.target.value)} placeholder="1,30" />
                                </Campo>
                                <Campo label="Permeabilidad al aire" hint="Clase 1 a 4, si la ficha la declara.">
                                    <input className={inputCls} value={f.permeabilidad}
                                           onChange={e => set('permeabilidad', e.target.value)} placeholder="4" />
                                </Campo>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Campo label="Fabricante">
                                <input className={inputCls} value={f.fabricante} list="fabricantes-cristal"
                                       onChange={e => set('fabricante', e.target.value)} placeholder="GUARDIAN" />
                                <datalist id="fabricantes-cristal">
                                    {FABRICANTES_CRISTAL.map(x => <option key={x} value={x} />)}
                                </datalist>
                            </Campo>
                            <Campo label="Gama / capa bajo emisiva"
                                   hint="Guardian Sun, Planitherm 4S, Planitherm One…">
                                <input className={inputCls} value={f.gama}
                                       onChange={e => set('gama', e.target.value)} placeholder="GUARDIAN SUN" />
                            </Campo>
                            <div className="sm:col-span-2">
                                <Campo label="Composición"
                                       hint="Como la escribe la ficha. El Ug depende de ella: 4 (16 AIRE) 4 no es 4 (16 ARGÓN) 4.">
                                    <input className={inputCls} value={f.composicion}
                                           onChange={e => set('composicion', e.target.value)} placeholder="4 (16 AIRE) 4" />
                                </Campo>
                            </div>
                            <Campo label="Ug (W/m²K)">
                                <input className={inputCls} value={f.ug} inputMode="decimal"
                                       onChange={e => set('ug', e.target.value)} placeholder="1,30" />
                            </Campo>
                            <Campo label="Factor solar (g)" hint="Entre 0 y 1. Si la ficha lo da en %, divídelo entre 100.">
                                <input className={inputCls} value={f.factor_solar} inputMode="decimal"
                                       onChange={e => set('factor_solar', e.target.value)} placeholder="0,43" />
                            </Campo>
                            <Campo label="Transmisión luminosa (%)" hint="Opcional. Se usa al teclear el CEE en CE3X.">
                                <input className={inputCls} value={f.transmision_luminosa} inputMode="decimal"
                                       onChange={e => set('transmision_luminosa', e.target.value)} placeholder="66" />
                            </Campo>
                        </div>
                    )}

                    <Campo label="Ficha técnica (enlace)"
                           hint="El PDF del fabricante. Es lo que se adjunta al certificado RES080 como anexo.">
                        <input className={`${inputCls} no-uppercase`} value={f.ficha_tecnica}
                               onChange={e => set('ficha_tecnica', e.target.value)}
                               placeholder="https://drive.google.com/file/d/…/view" />
                    </Campo>

                    <Campo label="Notas" hint="Dónde está el dato dentro de la ficha, matices del ensayo…">
                        <textarea value={f.notas} onChange={e => set('notas', e.target.value)}
                                  className="w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/40 min-h-[70px] resize-none no-uppercase" />
                    </Campo>

                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={f.validado}
                               onChange={e => set('validado', e.target.checked)}
                               className="mt-0.5 w-4 h-4 accent-brand" />
                        <span className="text-xs text-white/60 leading-snug">
                            <b className="text-white/80">He comprobado estos valores contra la ficha.</b>
                            <br />
                            <span className="text-white/30">
                                Sin marcar, el modelo se usa igual pero sale avisado como «sin verificar».
                            </span>
                        </span>
                    </label>

                    {falta.length > 0 && (
                        <div className="text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                            ⚠ Así guardado, a este modelo le faltará {enumerar(falta)}: se podrá elegir, pero no
                            autorrellenará ese dato en el expediente.
                        </div>
                    )}

                    {error && (
                        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-3 shrink-0">
                    <button onClick={onClose}
                            className="px-4 py-2 rounded-xl text-[11px] font-black uppercase text-white/30 hover:text-white/60 transition-all">
                        Cancelar
                    </button>
                    <button onClick={guardar} disabled={guardando}
                            className="px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all disabled:opacity-40">
                        {guardando ? 'Guardando…' : (editando ? 'Guardar cambios' : 'Añadir al catálogo')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
