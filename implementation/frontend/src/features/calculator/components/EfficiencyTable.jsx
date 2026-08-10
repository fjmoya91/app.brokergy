import React from 'react';

// Factores paso keys para los selectores (método detallado, o "otros" del simplificado)
const FUEL_OPTIONS = [
    'Electricidad peninsular',
    'Gasoleo Calefacción',
    'GLP',
    'Gas Natural',
    'Carbón',
    'Biomasa no densificada',
    'Biomasa densificada (pelets)'
];
// Igual que FUEL_OPTIONS pero sin Electricidad: el vector "otros combustibles" del método
// simplificado nunca puede ser electricidad (esa es justo la otra fila, y va fija).
export const FUEL_OPTIONS_SIN_ELECTRICIDAD = FUEL_OPTIONS.filter((f) => f !== 'Electricidad peninsular');

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORÍAS DE LA TABLA — los rótulos van EXPLÍCITOS por fila (no compuestos con
// plantillas) porque el método detallado y el simplificado no comparten redacción:
// uno habla de USOS ("para ACS") y el otro de VECTORES ("por consumo eléctrico").
// Cada entrada: { key (clave en results.details), type (id para los onChange),
// title/emisiones/consumo (textos), fuelOptions? (opciones del <select>),
// fixed? (combustible NO editable, se pinta como texto) }.
// ─────────────────────────────────────────────────────────────────────────────

// Método DETALLADO (por uso). Textos idénticos a los que había antes de existir esta prop.
const DEFAULT_CATEGORIES = [
    {
        key: 'acs', type: 'acs',
        title: 'Tipo de combustible para ACS',
        emisiones: 'Emisiones de CO2 ACS (kgCO2/ m² año)',
        consumo: 'Consumo de energía final para ACS (kWh/m² año)',
    },
    {
        key: 'cal', type: 'cal',
        title: 'Tipo de combustible para calefacción',
        emisiones: 'Emisiones de CO2 CALEFACCIÓN (kgCO2/ m² año)',
        consumo: 'Consumo de energía final para CALEFACCIÓN (kWh/m² año)',
    },
    {
        key: 'ref', type: 'ref',
        title: 'Tipo de combustible para Refrigeración',
        emisiones: 'Emisiones de CO2 REFRIGERACIÓN (kgCO2/ m² año)',
        consumo: 'Consumo de energía final para REFRIGERACIÓN (kWh/m² año)',
    },
];

// Método SIMPLIFICADO (por vector energético). Se redacta con las MISMAS palabras que
// imprime el CEE en su apartado de calificación en emisiones ("Emisiones CO2 por consumo
// eléctrico" / "por otros combustibles") para que quien copia los datos lea lo mismo en
// el certificado y en la tabla. Fuente única: la usan ResultsPanel y CeeModule.
export const CATEGORIES_SIMPLIFICADO = [
    {
        key: 'electrico', type: 'electrico',
        fixed: 'Electricidad peninsular',
        title: 'Vector energético · CONSUMO ELÉCTRICO',
        emisiones: 'Emisiones de CO2 por consumo eléctrico (kgCO2/ m² año)',
        consumo: 'Consumo de energía final eléctrica (kWh/m² año)',
    },
    {
        key: 'otros', type: 'otros',
        fuelOptions: FUEL_OPTIONS_SIN_ELECTRICIDAD,
        title: 'Tipo de combustible · OTROS COMBUSTIBLES',
        emisiones: 'Emisiones de CO2 por otros combustibles (kgCO2/ m² año)',
        consumo: 'Consumo de energía final de otros combustibles (kWh/m² año)',
    },
];

export function EfficiencyTable({ res080, editable = false, onFuelChange = null, onEmissionChange = null, emissionDraft = null, superficieDraft = null, onSuperficieChange = null, categories = DEFAULT_CATEGORIES }) {
    if (!res080 || !res080.details) return null;

    const { details, totalEnergiaInicialM2, totalEnergiaFinalM2, totalEnergiaInicialAno, totalEnergiaFinalAno, ahorroEnergiaFinalTotal } = res080;

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

    const FuelSelector = ({ value, type, isFinal, options, fixed }) => {
        // Vector fijo (p.ej. "Electricidad peninsular" en el método simplificado): no
        // hay nada que elegir, se pinta como texto igual que en modo no-editable.
        if (fixed) return <span>{fixed}</span>;
        if (!editable || !onFuelChange) return <span>{value}</span>;
        return (
            <select
                value={value}
                onChange={(e) => onFuelChange(type, isFinal, e.target.value)}
                className="block w-full max-w-full truncate bg-black/20 border border-black/10 rounded px-2 py-1 text-[11px] font-bold focus:outline-none focus:border-black/30"
            >
                {(options || FUEL_OPTIONS).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        );
    };

    // Celda de emisiones: editable (input crudo) solo si se pasa onEmissionChange.
    // El consumo se recalcula solo (= emisiones / factor), así que sigue de solo lectura.
    // Si hay `emissionDraft`, el input muestra el texto crudo tecleado (admite coma
    // decimal) en vez del número recalculado, para que no pelee con el re-render.
    const EmissionCell = ({ value, type, isFinal }) => {
        if (!editable || !onEmissionChange) return <span>{formatDec(value)}</span>;
        const draft = emissionDraft?.[type]?.[isFinal ? 'fin' : 'ini'];
        const shown = (draft !== undefined && draft !== null) ? draft : (value ?? '');
        return (
            <input
                type="text"
                inputMode="decimal"
                value={shown}
                onChange={(e) => onEmissionChange(type, isFinal, e.target.value)}
                className="w-24 text-center bg-black/20 border border-black/10 rounded px-2 py-0.5 text-xs font-bold font-mono focus:outline-none focus:border-black/30"
            />
        );
    };

    // Celda de superficie (m²) — input solo si editable+onSuperficieChange; si no, texto.
    // Render function (se llama, no <SupCell/>) para no remontar el input al teclear.
    const SupCell = ({ value, isFinal }) => {
        if (!editable || !onSuperficieChange) return <span>{value || '—'}</span>;
        return (
            <input
                type="text"
                inputMode="decimal"
                value={value ?? ''}
                onChange={(e) => onSuperficieChange(isFinal, e.target.value)}
                className="w-24 text-center bg-black/20 border border-black/10 rounded px-2 py-0.5 text-xs font-bold font-mono focus:outline-none focus:border-black/30"
            />
        );
    };

    const Row = ({ label, inicial, final, isTitle = false, type = null, options = null, fixed = null }) => (
        <tr className={`${isTitle ? 'bg-lime-400 font-bold' : 'border-b border-slate-200'}`}>
            <td className={`py-2 px-3 text-sm ${isTitle ? 'text-slate-900 font-black' : 'text-slate-600'}`}>
                {label}
            </td>
            <td className={`py-2 px-3 text-sm text-center font-mono ${isTitle ? 'text-slate-900 bg-amber-500/10' : 'text-slate-800'}`}>
                {isTitle && (type || fixed) ? FuelSelector({ value: inicial, type, isFinal: false, options, fixed }) : inicial}
            </td>
            <td className={`py-2 px-3 text-sm text-center font-mono ${isTitle ? 'text-slate-900 bg-amber-500/10' : 'text-slate-800'}`}>
                {isTitle && (type || fixed) ? FuelSelector({ value: final, type, isFinal: true, options, fixed }) : final}
            </td>
        </tr>
    );

    // Render function (NO componente JSX): se llama como función para que los <input>/
    // <select> que devuelve sean elementos host estables y NO se remonten en cada tecla
    // (eso provocaba pérdida de foco al escribir las emisiones). `cat` = una entrada de
    // `categories` ({ key, label, type, fuelOptions?, fixed? }).
    const CategoryBlock = ({ cat, data }) => (
        <>
            {Row({
                label: cat.title,
                inicial: data.fuelIni,
                final: data.fuelFin,
                isTitle: true,
                type: cat.type,
                options: cat.fuelOptions,
                fixed: cat.fixed,
            })}
            {Row({
                label: "Factor de paso de la fuente de energía seleccionada",
                inicial: formatDec(data.factorIni, 3),
                final: formatDec(data.factorFin, 3),
            })}
            {Row({
                label: cat.emisiones,
                inicial: EmissionCell({ value: data.emissionsIni, type: cat.type, isFinal: false }),
                final: EmissionCell({ value: data.emissionsFin, type: cat.type, isFinal: true }),
            })}
            {Row({
                label: cat.consumo,
                inicial: formatDec(data.energyIni),
                final: formatDec(data.energyFin),
            })}
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
                    {superficieDraft && (
                        <tr className="border-b border-slate-200 bg-orange-50/70">
                            <td className="py-2 px-3 text-sm text-slate-700 font-bold">Superficie (m²) · base del ahorro</td>
                            <td className="py-2 px-3 text-center font-mono text-slate-800">{SupCell({ value: superficieDraft.ini, isFinal: false })}</td>
                            <td className="py-2 px-3 text-center font-mono text-slate-800">{SupCell({ value: superficieDraft.fin, isFinal: true })}</td>
                        </tr>
                    )}
                    {categories.map((cat) => details[cat.key] ? (
                        <React.Fragment key={cat.key}>
                            {CategoryBlock({ cat, data: details[cat.key] })}
                        </React.Fragment>
                    ) : null)}

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
