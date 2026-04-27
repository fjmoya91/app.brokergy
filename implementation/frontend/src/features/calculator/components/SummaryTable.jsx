import React from 'react';

export function SummaryTable({ result, isReforma = false }) {
    if (!result || !result.financials) return null;

    const { financials, annualSavings, payback } = result;

    // Formateador robusto para moneda (7.474 €)
    const formatCurrency = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return new Intl.NumberFormat('es-ES', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
            useGrouping: true
        }).format(Math.round(num)) + ' €';
    };

    // Formateador para enteros con punto de miles (2.084)
    const formatInteger = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return new Intl.NumberFormat('es-ES', {
            maximumFractionDigits: 0,
            useGrouping: true
        }).format(Math.round(num));
    };

    // Formateador para decimales con coma (14)
    const formatDecimal = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value) || 0;
        return new Intl.NumberFormat('es-ES', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
            useGrouping: true
        }).format(Math.round(num));
    };

    const cellStyle = {
        verticalAlign: 'middle',
        lineHeight: '1.3'
    };

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-200 w-full max-w-[900px] mx-auto overflow-x-auto" style={{ minWidth: 'min(100%, 900px)' }}>

            {/* TABLA 1: SUBVENCIONES Y DEDUCCIONES */}
            <div className="bg-white rounded-xl border-2 border-slate-300 overflow-hidden shadow-lg">
                <table className="w-full text-slate-800" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                        <col style={{ width: '62%' }} />
                        <col style={{ width: '38%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="bg-[#FF6D00] text-white py-3 sm:py-4 px-3 sm:px-6 text-left text-xs sm:text-base font-black uppercase tracking-wide" style={cellStyle}>
                                ANÁLISIS DE SUBVENCIONES Y DEDUCCIONES
                            </th>
                            <th className="bg-[#FF6D00] text-white py-3 sm:py-4 px-3 sm:px-6 text-right text-xs sm:text-base font-black uppercase tracking-wide" style={cellStyle}>
                                IMPORTE
                            </th>
                        </tr>
                    </thead>
                    <tbody className="text-sm sm:text-base">
                        <tr>
                            <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-900 font-semibold" style={cellStyle}>
                                {isReforma ? 'Inversión Reforma de Vivienda + Aerotermia (IVA INC.)' : 'Inversión sustitución de caldera por aerotermia (IVA INC.)'}
                            </td>
                            <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right font-black text-slate-900 text-lg sm:text-xl" style={cellStyle}>
                                {formatCurrency(financials.presupuesto)}
                            </td>
                        </tr>
                        <tr>
                            <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-700" style={cellStyle}>
                                Bono Energético CAE (Ingreso Bruto) {!financials.isParticular && financials.titularType !== 'particular' ? '(IVA INC.)' : ''}
                            </td>
                            <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-slate-900 font-bold text-lg sm:text-xl" style={cellStyle}>
                                - {formatCurrency(financials.caeBonus)}
                            </td>
                        </tr>
                        {financials.irpfCaeAmount > 0 && (
                            <tr>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-pink-700 italic" style={cellStyle}>
                                    Impuestos aplicables por cobro de ayuda CAE (Estimado)
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-pink-600 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    + {formatCurrency(financials.irpfCaeAmount)}
                                </td>
                            </tr>
                        )}
                        {financials.caeMaintenanceCost > 0 && (
                            <tr>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-700" style={cellStyle}>
                                    Gestión tramitación Expediente CAE
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-red-600 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    + {formatCurrency(financials.caeMaintenanceCost)}
                                </td>
                            </tr>
                        )}
                        {financials.legalizationCost > 0 && (
                            <tr>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-700" style={cellStyle}>
                                    Legalización Instalación
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-red-600 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    + {formatCurrency(financials.legalizationCost)}
                                </td>
                            </tr>
                        )}
                        {financials.irpfCap > 0 && Array.from({ length: Math.max(1, financials.numOwners || 1) }).map((_, index) => (
                            <tr key={`owner-${index}`}>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-700" style={cellStyle}>
                                    Deducción en el IRPF Propietario {index + 1}
                                    <span className="text-[10px] sm:text-xs text-slate-500 ml-1 sm:ml-2">
                                        ({financials.irpfRate}%, Límite {formatCurrency(financials.irpfCap)})
                                    </span>
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-slate-900 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    - {formatCurrency(financials.irpfDeductionPerOwner || financials.irpfDeduction)}
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-[#F59E0B]">
                            <td className="py-4 sm:py-5 px-3 sm:px-6 font-black text-slate-900 text-sm sm:text-base uppercase" style={cellStyle}>
                                AYUDA TOTAL ESTIMADA
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-6 text-right font-black text-slate-900 text-xl sm:text-2xl" style={cellStyle}>
                                {formatCurrency(financials.totalBeneficioFiscal || financials.totalAyuda)}
                            </td>
                        </tr>
                        <tr className="bg-[#00C853]">
                            <td className="py-4 sm:py-5 px-3 sm:px-6 text-white font-bold uppercase text-xs sm:text-base" style={cellStyle}>
                                Porcentaje cubierto gracias a las ayudas
                            </td>
                            <td className="py-4 sm:py-5 px-3 sm:px-6 text-right font-black text-white text-xl sm:text-2xl" style={cellStyle}>
                                {formatInteger(financials.porcentajeCubierto)}%
                            </td>
                        </tr>
                        <tr className="bg-[#08090C] text-white">
                            <td className="py-5 sm:py-6 px-3 sm:px-6 font-black text-lg sm:text-2xl uppercase" style={cellStyle}>
                                INVERSIÓN NETA FINAL
                            </td>
                            <td className="py-5 sm:py-6 px-3 sm:px-6 text-right font-black text-2xl sm:text-4xl" style={cellStyle}>
                                {formatCurrency(financials.costeFinal)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* TABLA 2: AHORRO ANUAL Y RENTABILIDAD */}
            {result.includeAnnualSavings && annualSavings && (
                <div className="bg-white rounded-xl border-2 border-slate-300 overflow-hidden shadow-lg">
                    <table className="w-full text-slate-800" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '62%' }} />
                            <col style={{ width: '38%' }} />
                        </colgroup>
                        <tbody className="text-base">
                            <tr className="bg-[#08090C] text-white">
                                <td colSpan={2} className="py-3 sm:py-4 px-3 sm:px-6 text-center text-sm sm:text-base font-black uppercase tracking-wide" style={cellStyle}>
                                    ANÁLISIS DE AHORRO Y RENTABILIDAD
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-600 font-medium text-xs sm:text-base" style={cellStyle}>
                                    Gasto aproximado actual con {annualSavings.fuelLabel}
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-red-600 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    {formatInteger(annualSavings.costeActual)} €/año
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-slate-600 font-medium text-xs sm:text-base" style={cellStyle}>
                                    Gasto estimado con Aerotermia
                                </td>
                                <td className="py-3 sm:py-4 px-3 sm:px-6 border-b border-slate-200 text-right text-emerald-600 font-bold text-lg sm:text-xl" style={cellStyle}>
                                    {formatInteger(annualSavings.costeNuevo)} €/año
                                </td>
                            </tr>
                            <tr className="bg-[#00C853]">
                                <td className="py-4 sm:py-5 px-3 sm:px-6 font-black text-white text-sm sm:text-base uppercase" style={cellStyle}>
                                    AHORRO ECONÓMICO ANUAL
                                </td>
                                <td className="py-4 sm:py-5 px-3 sm:px-6 text-right font-black text-white text-xl sm:text-3xl" style={cellStyle}>
                                    {formatInteger(annualSavings.ahorroAnual)} €
                                </td>
                            </tr>
                            {payback && (
                                <tr className="bg-[#befce5]">
                                    <td className="py-3 sm:py-4 px-3 sm:px-6 font-bold text-slate-800 uppercase text-xs sm:text-base" style={cellStyle}>
                                        Plazo de amortización de la inversión
                                    </td>
                                    <td className="py-3 sm:py-4 px-3 sm:px-6 text-right font-black text-slate-900 text-xl sm:text-3xl" style={cellStyle}>
                                        {payback.paybackYears < 100
                                            ? `${formatDecimal(payback.paybackYears)} años`
                                            : '—'
                                        }
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* NOTAS LEGALES */}
            <div className="px-2 space-y-3 text-[11px] text-slate-500 italic leading-relaxed text-justify">
                <p>
                    <span className="font-bold text-slate-700 uppercase mr-1">Nota 1:</span>
                    La ayuda Bono Energético CAE está garantizada por Brokergy. El importe indicado es una estimación técnica y se ajustará de forma definitiva una vez se emitan y validen los certificados de eficiencia energética (CEE) inicial y final de la instalación.
                </p>
                {financials.irpfCap > 0 && (
                    <p>
                        <span className="font-bold text-slate-700 uppercase mr-1">Nota 2:</span>
                        Las deducciones en el IRPF por eficiencia energética no suponen un descuento directo sobre el precio de la actuación, sino un derecho a deducción en la declaración de la renta. El ahorro real dependerá de la situación fiscal personal del contribuyente y de la normativa vigente en el momento de la aplicación.
                    </p>
                )}
                {result.includeAnnualSavings && (
                    <p>
                        <span className="font-bold text-slate-700 uppercase mr-1">Nota 3:</span>
                        El análisis de ahorro anual es un cálculo teórico basado en las características constructivas del inmueble y datos climáticos zonales. Los resultados reales dependerán estrictamente de los hábitos de uso, tales como la temperatura de consigna interior, el tiempo de encendido de la calefacción y el mantenimiento del sistema.
                    </p>
                )}
                <p className="not-italic font-bold text-slate-600 mt-2 border-t border-slate-200 pt-2 uppercase text-[10px] tracking-widest text-center">
                    Aviso: Los cálculos son estimaciones teóricas. Los consumos reales pueden variar.
                </p>
            </div>
        </div>
    );
}
