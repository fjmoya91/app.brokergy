import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AISLAR_PORTAL } from '../../../components/aislarPortal';
import { Input } from './UIComponents';
import { m2, supCalefPorDebajo, confirmacionSupCalef, confirmacionVigente } from '../logic/superficieCalefaccion';

/**
 * El campo «Sup. Calef. (m²)» de la calculadora, con su explicación y su candado.
 *
 * - Un botón (i) explica qué metros cuentan: los que SE CALIENTAN, también los de una
 *   planta que el Catastro llama «almacén» y en la casa es vivienda.
 * - Al SALIR del campo (no al teclear: «1», «12»… serían menos que la útil a mitad de
 *   escribir), si queda por debajo de la útil:
 *     · partner → popup que avisa de que la ayuda baja y pide confirmarlo; sin
 *       confirmar, vuelve a la útil.
 *     · equipo interno → aviso ámbar junto al campo, sin bloquear.
 * - Lo confirmado se guarda en `inputs.supCalefMenor` (quién y cuándo) y el equipo
 *   interno lo lee bajo el campo. Ver logic/superficieCalefaccion.js.
 *
 * @param {object} props
 * @param {object} props.inputs
 * @param {Function} props.onInputChange  el `onInputChange(prev => …)` de la calculadora
 * @param {Function} props.onNumero       `handleSmartNumberChange` de la calculadora
 * @param {Function} props.formatDisplay
 * @param {boolean} props.esPartner
 * @param {object}  props.usuario
 */
export function SuperficieCalefaccion({ inputs, onInputChange, onNumero, formatDisplay, esPartner, usuario }) {
    const [info, setInfo] = useState(false);
    const [preguntar, setPreguntar] = useState(null); // { util, calef }

    const util = m2(inputs.superficie);
    const calef = m2(inputs.superficieCalefactable);
    const porDebajo = supCalefPorDebajo(util, calef);
    const confirmado = inputs.supCalefMenor;
    const vigente = confirmacionVigente(confirmado, util, calef);

    const alSalir = () => {
        if (!supCalefPorDebajo(util, calef)) {
            // Por encima o igual: lo confirmado antes ya no aplica.
            if (confirmado) onInputChange(prev => ({ ...prev, supCalefMenor: null }));
            return;
        }
        if (vigente) return; // ya lo confirmó con estos mismos metros
        if (esPartner) {
            setPreguntar({ util, calef });
        } else {
            // El equipo interno no se bloquea, pero queda dicho quién lo puso.
            onInputChange(prev => ({ ...prev, supCalefMenor: confirmacionSupCalef({ util, calef, usuario }) }));
        }
    };

    const confirmar = () => {
        const p = preguntar;
        setPreguntar(null);
        onInputChange(prev => ({ ...prev, supCalefMenor: confirmacionSupCalef({ util: p.util, calef: p.calef, usuario }) }));
    };
    const deshacer = () => {
        const p = preguntar;
        setPreguntar(null);
        onInputChange(prev => ({ ...prev, superficieCalefactable: p.util, supCalefMenor: null }));
    };

    const fmt = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
    const fecha = confirmado?.at ? new Date(confirmado.at).toLocaleDateString('es-ES') : null;

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="superficieCalefactable" className="block text-sm font-medium text-white/60">
                    Sup. Calef. (m²)
                </label>
                <button
                    type="button"
                    onClick={() => setInfo(v => !v)}
                    aria-expanded={info}
                    aria-controls="sup-calef-info"
                    title="¿Qué metros cuentan?"
                    className={`w-6 h-6 shrink-0 rounded-full border text-[11px] font-black leading-none transition-colors ${info ? 'bg-sky-500/20 border-sky-400/60 text-sky-200' : 'border-white/20 text-white/50 hover:text-white hover:border-white/40'}`}
                >
                    i
                </button>
            </div>
            <Input
                id="superficieCalefactable"
                type="text"
                inputMode="decimal"
                min={0}
                value={formatDisplay(inputs.superficieCalefactable)}
                onChange={e => onNumero('superficieCalefactable', e.target.value)}
                onBlur={alSalir}
                placeholder={util ? `${fmt(util)} o más` : 'Igual o mayor que la útil'}
                className={porDebajo ? 'border-amber-500/50 focus:border-amber-400/60 focus:ring-amber-400/20' : ''}
            />

            {info && (
                <div id="sup-calef-info" className="mt-2 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-[12px] leading-relaxed text-sky-100">
                    <p className="font-bold text-sky-200 mb-1">Los metros que SE CALIENTAN</p>
                    <p>
                        Si el Catastro llama <b>«almacén»</b>, «garaje» o «trastero» a una planta que en la casa
                        es vivienda y tiene radiadores o suelo radiante, <b>súmala aquí</b>: más metros
                        calefactados, más ayuda.
                    </p>
                    <p className="mt-1.5 text-sky-100/80">
                        No pongas menos que la superficie útil{util ? ` (${fmt(util)} m²)` : ''} salvo que haya
                        zonas de la vivienda sin calefacción: con menos metros, la ayuda baja.
                    </p>
                </div>
            )}

            {porDebajo && (
                <p className="mt-2 text-[11px] leading-snug text-amber-300">
                    {fmt(util - calef)} m² menos que la útil: la ayuda baja.
                    {!esPartner && vigente && confirmado?.rol && !['ADMIN', 'TRABAJADOR'].includes(confirmado.rol) && (
                        <> Lo confirmó <b>{confirmado.por || 'el partner'}</b>{confirmado.empresa ? ` (${confirmado.empresa})` : ''}{fecha ? ` el ${fecha}` : ''}.</>
                    )}
                    {esPartner && vigente && <> Confirmado.</>}
                </p>
            )}

            {preguntar && createPortal(
                <div
                    {...AISLAR_PORTAL}
                    className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sup-calef-titulo"
                >
                    <div className="w-full max-w-md rounded-2xl bg-bkg-surface border border-amber-500/30 shadow-2xl overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-300 to-lime-400" />
                        <div className="p-5 space-y-3">
                            <h3 id="sup-calef-titulo" className="text-lg font-black text-white">
                                ¿Se calientan menos metros que los útiles?
                            </h3>
                            <p className="text-sm text-white/70 leading-relaxed">
                                Has puesto <b className="text-white">{fmt(preguntar.calef)} m²</b> calefactados y la vivienda
                                tiene <b className="text-white">{fmt(preguntar.util)} m²</b> útiles.
                            </p>
                            <p className="text-sm text-amber-200 leading-relaxed p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                                Con menos metros calefactados la demanda baja y <b>la ayuda también</b>. Ponlo solo si hay
                                zonas de la vivienda sin calefacción.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={deshacer}
                                    className="min-h-[48px] px-4 rounded-xl bg-brand text-bkg-deep font-bold text-sm hover:brightness-110"
                                >
                                    Dejar {fmt(preguntar.util)} m²
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmar}
                                    className="min-h-[48px] px-4 rounded-xl border border-white/15 text-white/80 font-semibold text-sm hover:bg-white/5"
                                >
                                    Sí, solo {fmt(preguntar.calef)} m²
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
