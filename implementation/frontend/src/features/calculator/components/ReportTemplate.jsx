import React from 'react';

export const ReportTemplate = ({ result }) => {
    if (!result || !result.financials) return null;

    const financials = result.financials;

    const formatCurrency = (val) => {
        const num = typeof val === 'number' ? val : parseFloat(val) || 0;
        const d = (num % 1 === 0) ? 0 : 2;
        return num.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
    };

    return (
        <div id="report-template" className="bg-white text-slate-900 font-sans p-0 m-0 print:p-0" style={{ width: '210mm', minHeight: '297mm' }}>

            {/* PÁGINA 1 */}
            <div className="page p-12 relative" style={{ height: '297mm', pageBreakAfter: 'always' }}>
                {/* Header */}
                <div className="flex items-center gap-4 border-b-2 border-orange-500 pb-4 mb-8">
                    <div className="w-12 h-12 bg-orange-500 rounded flex items-center justify-center text-white text-2xl">
                        🤝
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter text-slate-800">BROKERGY</h1>
                </div>

                {/* Hero */}
                <div className="text-center mb-12 mt-16">
                    <h2 className="text-2xl font-bold text-orange-500 mb-4">¡Descubre las ayudas que te corresponden!</h2>
                    <p className="text-slate-600 max-w-lg mx-auto leading-relaxed">
                        En BROKERGY, somos especialistas en eficiencia energética, dedicados a maximizar
                        las oportunidades de ahorro y sostenibilidad en tu vivienda.
                    </p>
                </div>

                <div className="mb-12">
                    <h3 className="text-lg font-bold text-green-600 mb-2 italic">
                        ¿Estás listo para ahorrar dinero y reducir tu huella de carbono?
                    </h3>
                    <p className="text-slate-500 text-sm">
                        A continuación, te planteamos las mejores opciones para amortizar tu instalación:
                    </p>
                </div>

                {/* Tabla Financiera */}
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm mb-8">
                    <div className="bg-orange-500 text-white py-3 px-4 text-center font-bold text-sm uppercase tracking-wider">
                        Simulación de Inversión y Ayudas
                    </div>
                    <table className="w-full border-collapse">
                        <tbody>
                            <tr className="border-b border-slate-100">
                                <td className="p-4 text-sm font-bold text-slate-700">Coste de inversión Total (IVA INCLUIDO)</td>
                                <td className="p-4 text-sm font-bold text-right text-slate-900">{formatCurrency(financials.presupuesto)}</td>
                            </tr>
                            <tr className="border-b border-slate-100 bg-slate-50/30">
                                <td className="p-4 text-sm text-slate-600">Ayuda 1: BONO ENERGÉTICO CAE BROKERGY (Nota 1)</td>
                                <td className="p-4 text-sm font-bold text-right text-green-600">+{formatCurrency(financials.caeBonus)}</td>
                            </tr>
                            {financials.irpfCap > 0 && (
                                <tr className="border-b border-slate-100">
                                    <td className="p-4 text-sm text-slate-600">
                                        Ayuda 2: Deducciones en el IRPF (Nota 2)
                                        <span className="block text-[10px] text-slate-400 mt-1 uppercase font-medium">
                                            ({financials.irpfRate}% - MÁX {formatCurrency(financials.irpfCap)})
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm font-bold text-right text-green-600">+{formatCurrency(financials.irpfDeduction)}</td>
                                </tr>
                            )}
                            <tr className="border-b border-slate-100 bg-yellow-400/20">
                                <td className="p-4 text-sm font-bold text-slate-800 uppercase tracking-tight">Total ayuda</td>
                                <td className="p-4 text-sm font-bold text-right text-slate-900 italic">{formatCurrency(financials.totalAyuda)}</td>
                            </tr>
                            <tr className="border-b border-slate-100 bg-green-100/50">
                                <td className="p-4 text-xs font-bold text-green-800 uppercase italic">Ahorro conseguido por BROKERGY</td>
                                <td className="p-4 text-sm font-black text-right text-green-700">{Math.round(financials.porcentajeCubierto).toLocaleString('es-ES')}%</td>
                            </tr>
                            <tr className="bg-slate-800 text-white">
                                <td className="p-5 text-base font-black uppercase tracking-widest text-orange-400">COSTE FINAL</td>
                                <td className="p-5 text-2xl font-black text-right">{formatCurrency(financials.costeFinal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Notas pie página 1 */}
                <div className="space-y-2 mt-8">
                    <p className="text-[10px] text-slate-400 leading-tight">
                        Nota 1: La ayuda Bono Energético CAE está garantizada. El importe indicado es orientativo y se ajustará una vez se emitan los certificados de eficiencia energética inicial y final (CEE).
                    </p>
                    {financials.irpfCap > 0 && (
                        <p className="text-[10px] text-slate-400 leading-tight">
                            Nota 2: Las deducciones en el IRPF por eficiencia energética no suponen un descuento directo sobre el precio de la actuación, sino que se aplican en la declaración de la renta del contribuyente. El importe finalmente recuperado dependerá de su situación fiscal personal y de que dichas deducciones se encuentren en vigor en el momento de su aplicación, que tendrá lugar al año siguiente de la ejecución de la obra.
                        </p>
                    )}
                </div>

                {/* Footer Página 1 */}
                <div className="absolute bottom-0 left-0 right-0 bg-yellow-400 py-3 text-center text-[10px] font-bold text-slate-800">
                    email: info@brokergy.es  |  tlf: 623 926 179  |  web: www.brokergy.es
                </div>
            </div>

            {/* PÁGINA 2 */}
            <div className="page p-12 relative" style={{ height: '297mm', pageBreakAfter: 'always' }}>
                <div className="flex items-center gap-4 border-b-2 border-orange-500 pb-4 mb-4">
                    <div className="w-10 h-10 bg-orange-500 rounded flex items-center justify-center text-white text-xl">🤝</div>
                    <div className="text-xl font-bold">BROKERGY</div>
                </div>

                <div className="bg-yellow-400 text-slate-800 py-3 px-4 text-center font-black text-sm uppercase tracking-wider mb-8">
                    ¡AYUDA 1 GARANTIZADA con BROKERGY y los CAEs!
                </div>

                <div className="space-y-6">
                    <section>
                        <h4 className="text-orange-500 font-bold text-sm mb-2 uppercase tracking-wide">¿Qué son los Certificados de Ahorro Energético (CAE)?</h4>
                        <div className="text-xs text-slate-700 leading-relaxed text-justify space-y-3">
                            <p>Los Certificados de Ahorro Energético son un mecanismo regulado por el Ministerio para la Transición Ecológica y el Reto Demográfico que premia económicamente las acciones de eficiencia energética.</p>
                            <p>En términos sencillos: cuando realizas mejoras que ahorran energía (como instalar aerotermia o aislamiento), esas mejoras se convierten en un activo económico que las grandes energéticas están obligadas a comprar. Este sistema está respaldado por el <strong>Real Decreto 36/2023</strong>.</p>
                        </div>
                    </section>


                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-orange-50 border-l-4 border-orange-500 p-4">
                            <h5 className="font-bold text-orange-700 text-xs mb-2 uppercase italic tracking-tighter">⚠️ El problema para un particular:</h5>
                            <ul className="text-[10px] text-orange-900 space-y-1">
                                <li>• Se requiere documentación técnica y verificación compleja.</li>
                                <li>• Las energéticas solo compran grandes volúmenes de ahorro.</li>
                                <li>• La gestión burocrática es lenta y desalentadora.</li>
                            </ul>
                        </div>
                        <div className="bg-green-50 border-l-4 border-green-500 p-4">
                            <h5 className="font-bold text-green-700 text-xs mb-2 uppercase italic tracking-tighter">✅ La solución BROKERGY:</h5>
                            <p className="text-[10px] text-green-900 leading-relaxed">
                                Actuamos como <strong>Agregadores</strong>. Agrupamos tu expediente con cientos de otros para tener fuerza de negociación y conseguirte el máximo dinero posible por tus mejoras, encargándonos de toda la burocracia por ti.
                            </p>
                        </div>
                    </div>

                    <section>
                        <h4 className="text-orange-500 font-bold text-sm mb-4 uppercase tracking-wide">¿Cómo funciona el proceso?</h4>
                        <div className="space-y-3 pl-4 border-l border-slate-100">
                            {[
                                { t: '1. Mejoras', d: 'Realizas la instalación o reforma energética en tu vivienda.' },
                                { t: '2. Gestión Técnica', d: 'Brokergy prepara los informes y certificados necesarios.' },
                                { t: '3. Agrupación', d: 'Integramos tu ahorro en la plataforma del Ministerio.' },
                                { t: '4. Negociación', d: 'Vendemos el ahorro agrupado al mejor postor del mercado.' },
                                { t: '5. Cobro', d: 'Recibes el pago íntegro en tu cuenta bancaria.' }
                            ].map((step, i) => (
                                <div key={i} className="flex gap-4 items-start">
                                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">{step.t}</p>
                                        <p className="text-[10px] text-slate-500">{step.d}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-yellow-400 py-3 text-center text-[10px] font-bold text-slate-800">
                    email: info@brokergy.es  |  tlf: 623 926 179  |  web: www.brokergy.es
                </div>
            </div>

            {/* PÁGINA 3 */}
            <div className="page p-12 relative" style={{ height: '297mm' }}>
                <div className="flex items-center gap-4 border-b-2 border-orange-500 pb-4 mb-4">
                    <div className="w-10 h-10 bg-orange-500 rounded flex items-center justify-center text-white text-xl">🤝</div>
                    <div className="text-xl font-bold">BROKERGY</div>
                </div>

                <div className="bg-orange-500 text-white py-3 px-4 text-center font-black text-sm uppercase tracking-wider mb-8">
                    Ventajas de trabajar con Brokergy
                </div>

                <div className="grid grid-cols-1 gap-6 mb-12">
                    {[
                        { t: 'Máximo Beneficio Económico', d: 'Al vender en grandes volúmenes, conseguimos precios muy superiores a los que obtendría un particular por su cuenta.' },
                        { t: 'Gestión Integral "Llave en Mano"', d: 'Nos ocupamos de todo: desde el CEE inicial hasta la tramitación final en la sede del Ministerio.' },
                        { t: 'Procesos Automatizados y Ágiles', d: 'Nuestra tecnología nos permite reducir los tiempos de validación y cobro significativamente.' },
                        { t: 'Máxima Seguridad y Confianza', d: 'Historial impecable en la gestión de subvenciones públicas y eficiencia energética.' }
                    ].map((v, i) => (
                        <div key={i} className="flex gap-4">
                            <span className="text-green-500 text-lg font-bold">✓</span>
                            <div>
                                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-tight">{v.t}</h5>
                                <p className="text-[10px] text-slate-500 leading-normal">{v.d}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {financials.irpfCap > 0 && (
                    <>
                        <div className="bg-yellow-400 text-slate-800 py-3 px-4 text-center font-black text-sm uppercase tracking-wider mb-6">
                            Ayuda 2: Deducciones en el IRPF
                        </div>

                        <div className="text-[11px] text-slate-700 space-y-4 mb-8">
                            <p className="font-bold border-b border-yellow-200 pb-1">Requisitos para acceder:</p>
                            <ul className="space-y-2 pl-2">
                                <li>• Estar al corriente de obligaciones tributarias y ser contribuyente del IRPF.</li>
                                <li>• Realizar Certificado Energético (CEE) ANTES y DESPUÉS de la actuación.</li>
                                <li>• <strong>No se permite el pago en metálico</strong>. Todo debe ser vía transferencia bancaria.</li>
                                <li>• La deducción se aplica al ejercicio fiscal en el que se finaliza la obra.</li>
                            </ul>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-dashed border-slate-300">
                            <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Ejemplo Práctico:</h6>
                            <div className="text-xs text-slate-600 space-y-2 italic">
                                <p>Si tu deducción total es de <strong>7.200 €</strong> y tu máximo anual deducible es de 3.000 €:</p>
                                <div className="pl-4 space-y-1">
                                    <p>- Renta ejercicio 1: Desgravas 3.000 €</p>
                                    <p>- Renta ejercicio 2: Desgravas 3.000 €</p>
                                    <p>- Renta ejercicio 3: Desgravas los 1.200 € restantes.</p>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-yellow-400 py-3 text-center text-[10px] font-bold text-slate-800">
                    email: info@brokergy.es  |  tlf: 623 926 179  |  web: www.brokergy.es
                </div>
            </div>
        </div>
    );
};
