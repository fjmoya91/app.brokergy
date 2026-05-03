import React from 'react';

export function EfficiencyTable({ res080, editable = false, onFuelChange = null }) {
    if (!res080 || !res080.details) return null;

    const { details, totalEnergiaInicialM2, totalEnergiaFinalM2, totalEnergiaInicialAno, totalEnergiaFinalAno, ahorroEnergiaFinalTotal } = res080;

    // Factores paso keys para los selectores
    const FUEL_OPTIONS = [
        'Electricidad peninsular',
        'Gasoleo Calefacción',
        'GLP',
        'Gas Natural',
        'Carbón',
        'Biomasa no densificada',
        'Biomasa densificada (pelets)'
    ];

    const formatDec = (val, decimals = 2) => {
        const num = typeof val === 'number' ? val : parseFloat(val) || 0;
        return new Intl.NumberFormat('es-ES', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            useGrouping: true
        }).format(num);
    };

    const formatInt = (val) => {
        const num = typeof val === 'number' ? val : parseFloat(val) || 0;
        return new Intl.NumberFormat('es-ES', {
            maximumFractionDigits: 0,
            useGrouping: true
        }).format(num);
    };

    const FuelSelector = ({ value, type, isFinal }) => {
        if (!editable) return <span>{value}</span>;
        return (
            <select
                value={value}
                onChange={(e) => onFuelChange(type, isFinal, e.target.value)}
                className="bg-black/20 border border-black/10 rounded px-2 py-0.5 text-xs font-bold focus:outline-none focus:border-black/30"
            >
                {FUEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        );
    };

    const Row = ({ label, inicial, final, isTitle = false, type = null }) => (
        <tr className={`${isTitle ? 'bg-lime-400 font-bold' : 'border-b border-slate-200'}`}>
            <td className={`py-2 px-3 text-sm ${isTitle ? 'text-slate-900 font-black' : 'text-slate-600'}`}>
                {label}
            </td>
            <td className={`py-2 px-3 text-sm text-center font-mono ${isTitle ? 'text-slate-900 bg-amber-500/10' : 'text-slate-800'}`}>
                {isTitle && type ? <FuelSelector value={inicial} type={type} isFinal={false} /> : inicial}
            </td>
            <td className={`py-2 px-3 text-sm text-center font-mono ${isTitle ? 'text-slate-900 bg-amber-500/10' : 'text-slate-800'}`}>
                {isTitle && type ? <FuelSelector value={final} type={type} isFinal={true} /> : final}
            </td>
        </tr>
    );

    const CategoryBlock = ({ title, data, type }) => (
        <>
            <Row 
                label={title} 
                inicial={data.fuelIni} 
                final={data.fuelFin} 
                isTitle={true} 
                type={type}
            />
            <Row
                label="Factor de paso de la fuente de energía seleccionada"
                inicial={formatDec(data.factorIni, 3)}
                final={formatDec(data.factorFin, 3)}
            />
            <Row 
                label={`Emisiones de CO2 ${title.split(' para ')[1].toUpperCase()} (kgCO2/ m² año)`} 
                inicial={formatDec(data.emissionsIni)} 
                final={formatDec(data.emissionsFin)} 
            />
            <Row 
                label={`Consumo de energía final para ${title.split(' para ')[1].toUpperCase()} (kWh/m² año)`} 
                inicial={formatDec(data.energyIni)} 
                final={formatDec(data.energyFin)} 
            />
        </>
    );

    return (
        <div className="bg-white rounded-xl border-2 border-slate-300 overflow-hidden shadow-lg">
            <table className="w-full text-left border-collapse table-fixed">
                <colgroup>
                    <col style={{ width: '60%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                    <tr className="bg-black text-white uppercase text-[10px] font-black tracking-widest">
                        <th className="py-3 px-4">Parámetro Energético</th>
                        <th className="py-3 px-4 text-center">INICIAL</th>
                        <th className="py-3 px-4 text-center">FINAL</th>
                    </tr>
                </thead>
                <tbody>
                    <CategoryBlock title="Tipo de combustible para ACS" data={details.acs} type="acs" />
                    <CategoryBlock title="Tipo de combustible para calefacción" data={details.cal} type="cal" />
                    <CategoryBlock title="Tipo de combustible para Refrigeración" data={details.ref} type="ref" />
                    
                    {/* TOTALES */}
                    <tr className="border-t-2 border-slate-900">
                        <td className="py-3 px-4 text-sm font-bold text-slate-800 italic">Consumo Total de Energía final (kWh/m² año)</td>
                        <td className="py-3 px-4 text-sm text-center font-bold text-slate-900 border-l border-slate-100">{formatDec(totalEnergiaInicialM2)}</td>
                        <td className="py-3 px-4 text-sm text-center font-bold text-slate-900 border-l border-slate-100">{formatDec(totalEnergiaFinalM2)}</td>
                    </tr>
                    <tr className="border-t border-slate-200">
                        <td className="py-3 px-4 text-sm font-bold text-slate-800 italic">Consumo Total de Energía final (kWh/año)</td>
                        <td className="py-3 px-4 text-sm text-center font-bold text-slate-900 border-l border-slate-100">{formatInt(totalEnergiaInicialAno)}</td>
                        <td className="py-3 px-4 text-sm text-center font-bold text-slate-900 border-l border-slate-100">{formatInt(totalEnergiaFinalAno)}</td>
                    </tr>
                    <tr className="border-t-2 border-slate-900 bg-amber-500 text-slate-900">
                        <td className="py-4 px-4 text-base font-black uppercase tracking-tight">AHORRO DE ENERGÍA FINAL (MWh/año)</td>
                        <td colSpan={2} className="py-4 px-4 text-center text-2xl font-black border-l border-slate-900/10">
                            {formatDec(ahorroEnergiaFinalTotal / 1000)}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
