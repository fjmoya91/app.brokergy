import React from 'react';
import { CSS_OPORTUNIDAD_PARTNER } from './estiloOportunidadPartner';

// ─────────────────────────────────────────────────────────────────────────────
// «Corregir datos» del PARTNER (Fran, 17/11/2026: «falta por mejorar la pantalla
// de si los datos no están bien»). El formulario es el de SIEMPRE (`CalculatorForm`,
// el mismo cálculo y los mismos campos que ve el equipo interno, recortados para
// el partner), pero va dentro de una tarjeta en el estilo «carta de pago» (regla
// 164) y con `.theme-light`, que remapea sus clases oscuras al tema claro. Lo de
// la tarjeta: qué es, que las cifras de arriba se recalculan solas y que hay que
// GUARDAR (la acción naranja), y «Listo» para plegarlo.
// ─────────────────────────────────────────────────────────────────────────────

const ICO_GUARDAR = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;

export function CorregirDatosPartner({ children, conCifras = true, sinGuardar = false, onListo, onGuardar }) {
    return (
        <section className="po po-corregir" aria-labelledby="po-corr-t">
            <style>{CSS_OPORTUNIDAD_PARTNER}</style>
            <div className="po-filete" />
            <div className="po-in">
                <div className="po-cab" style={{ flexWrap: 'nowrap' }}>
                    <div>
                        <p className="po-eti">{conCifras ? 'Corregir datos' : 'Datos de la vivienda'}</p>
                        <h2 id="po-corr-t" className="po-h1" style={{ fontSize: 'clamp(26px,5vw,34px)' }}>
                            {conCifras ? <>¿Algo no <span className="po-mark">cuadra</span>? Cámbialo aquí</> : <>Completa los <span className="po-mark">datos</span> de la vivienda</>}
                        </h2>
                        <p className="po-sub">
                            {conCifras
                                ? 'Las cifras de arriba se recalculan solas. Al terminar, guarda.'
                                : 'Con la vivienda, la caldera de hoy y el equipo nuevo sale el bono.'}
                        </p>
                    </div>
                    {onListo && (
                        <button type="button" className="po-cerrar" aria-label="Cerrar la corrección de datos" onClick={onListo}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    )}
                </div>

                <div className="theme-light po-form">{children}</div>

                {conCifras && (onGuardar || onListo) && (
                    <div className="po-corr-pie">
                        <p className="po-corr-estado" aria-live="polite">
                            {sinGuardar ? <><span className="po-punto" aria-hidden="true" />Hay cambios sin guardar</> : 'Todo guardado'}
                        </p>
                        {/* Sin cambios, solo «Listo»; con cambios, «Guardar cambios» en naranja. Plegar
                            no pierde nada: lo cambiado sigue en pantalla y el aviso de arriba lo dice. */}
                        <div className={`po-corr-bts${sinGuardar && onGuardar ? '' : ' solo'}`}>
                            {onListo && <button type="button" className="po-btn2" onClick={onListo}>{sinGuardar ? 'Cerrar' : 'Listo'}</button>}
                            {onGuardar && sinGuardar && (
                                <button type="button" className="po-btn po-btn-ico" onClick={onGuardar}>
                                    {ICO_GUARDAR}Guardar cambios
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
