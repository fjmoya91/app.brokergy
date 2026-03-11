// CalculatorForm v2.1 - Economic Data section + UI refinements (2026-03-10)
import React, { useEffect, useState } from 'react';
import { SectionCard, Button, Input, Label, Select, Divider } from './UIComponents';
import { getUByYear, getVentanaYACHByYear, TYPE_DEFAULTS, BOILER_EFFICIENCIES, FUEL_PRICES, AEROTHERMIA_MODELS } from '../logic/calculation';
import { PROVINCE_CLIMATE_MAP } from '../data/provinceMapping';

export function CalculatorForm({ inputs, onInputChange, onCalculate, result, showBrokergy }) {
    const formatDisplay = (value) => {
        if (value === '' || value === null || value === undefined) return '';

        const valStr = String(value);

        // Estado transitorio: el usuario está escribiendo un decimal (ej: "13832,")
        if (valStr.endsWith(',')) {
            const intPart = valStr.slice(0, -1);
            // Añadir separadores de miles a la parte entera
            const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return formatted + ',';
        }

        // Si el estado es un número real (lo más común después de confirmar)
        if (typeof value === 'number') {
            const intPart = Math.trunc(value);
            const decPart = value - intPart;

            const formattedInt = intPart.toLocaleString('es-ES').replace(/\./g, '.');
            if (decPart !== 0) {
                // Mostrar los decimales tal cual existen en el número
                const decStr = String(value).split('.')[1] || '';
                return formattedInt + ',' + decStr;
            }
            return formattedInt;
        }

        // Si es string con coma (ej: "13832,72") ya normalizado parcialmente
        if (valStr.includes(',')) {
            const [intPart, decPart] = valStr.split(',');
            const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return formattedInt + ',' + decPart;
        }

        // Número como string sin coma
        const [intPart, decPart] = valStr.split('.');
        const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        if (decPart !== undefined) {
            return formattedInt + ',' + decPart;
        }
        return formattedInt;
    };
    const [dirtyUWall, setDirtyUWall] = useState(() => {
        if (!inputs.anio || !inputs.uMuro) return false;
        const defaults = getUByYear(inputs.anio);
        return inputs.uMuro !== defaults.wall;
    });
    const [dirtyURoof, setDirtyURoof] = useState(() => {
        if (!inputs.anio || !inputs.uCubierta) return false;
        const defaults = getUByYear(inputs.anio);
        return inputs.uCubierta !== defaults.roof;
    });
    const [dirtyVentana, setDirtyVentana] = useState(() => {
        if (!inputs.anio || !inputs.ventanaU) return false;
        const defaults = getVentanaYACHByYear(inputs.anio);
        return inputs.ventanaU !== defaults.ventanaU;
    });
    const [dirtyAch, setDirtyAch] = useState(() => {
        if (!inputs.anio || !inputs.ach) return false;
        const defaults = getVentanaYACHByYear(inputs.anio);
        return inputs.ach !== defaults.ach;
    });
    const [showBuildingData, setShowBuildingData] = useState(false);
    const [showEnvolvente, setShowEnvolvente] = useState(false);
    const [showInstalaciones, setShowInstalaciones] = useState(false);
    const [showEconomicData, setShowEconomicData] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isPriceLocked, setIsPriceLocked] = useState(true);

    useEffect(() => {
        if (!inputs.anio) return;

        const defaultsU = getUByYear(inputs.anio);
        const defaultsVentanaAch = getVentanaYACHByYear(inputs.anio);
        let updates = {};

        // Actualizar valores si no han sido editados manualmente (dirty)
        // O si el valor actual no coincide con el del año (para permitir el reset automático)
        if (!dirtyUWall && inputs.uMuro !== defaultsU.wall) {
            updates.uMuro = defaultsU.wall;
        }
        if (!dirtyURoof && inputs.uCubierta !== defaultsU.roof) {
            updates.uCubierta = defaultsU.roof;
        }
        if (!dirtyVentana && inputs.ventanaU !== defaultsVentanaAch.ventanaU) {
            updates.ventanaU = defaultsVentanaAch.ventanaU;
        }
        if (!dirtyAch && inputs.ach !== defaultsVentanaAch.ach) {
            updates.ach = defaultsVentanaAch.ach;
        }

        if (Object.keys(updates).length > 0) {
            onInputChange(prev => ({ ...prev, ...updates }));
        }
    }, [inputs.anio, dirtyUWall, dirtyURoof, dirtyVentana, dirtyAch, inputs.uMuro, inputs.uCubierta, inputs.ventanaU, inputs.ach]);

    const handleTypeChange = (t) => {
        const defs = TYPE_DEFAULTS[t];
        onInputChange(prev => {
            const updates = {
                tipo: t,
                gla: defs.defaultGla
            };

            if (t === 'unifamiliar') {
                updates.fachadas = 4;
                updates.sueloTipo = 'terreno';
            } else if (t === 'hilera') {
                updates.fachadas = 2;
                updates.sueloTipo = 'terreno';
            } else if (t === 'piso') {
                updates.fachadas = 1;
                if (prev.subtipo === 'bajo') updates.sueloTipo = 'garaje';
                else updates.sueloTipo = 'vivienda';
            }
            return { ...prev, ...updates };
        });
    };

    const handleChange = (field, value) => {
        onInputChange(prev => {
            const updates = { [field]: value };

            // If user manually changes province, auto-detect the climate zone
            if (field === 'provincia' && PROVINCE_CLIMATE_MAP[value]) {
                updates.zona = PROVINCE_CLIMATE_MAP[value].zone;
            }

            return { ...prev, ...updates };
        });
    };

    // Smart handler para permitir punto y coma en decimales sin "cosas raras"
    const handleSmartNumberChange = (field, rawValue) => {
        // Si está vacío, limpiar
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
            onInputChange(prev => ({ ...prev, [field]: '' }));
            return;
        }

        const valStr = String(rawValue);

        // Si el usuario está en medio de escribir un decimal (termina en ',' o '.'),
        // guardar como string para que formatDisplay lo muestre con la coma al final
        if (valStr.endsWith(',') || valStr.endsWith('.')) {
            // Normalizamos a coma al final (siempre mostramos coma en ES)
            const normalized = valStr.slice(0, -1) + ',';
            onInputChange(prev => ({ ...prev, [field]: normalized }));
            return;
        }

        // Parsear el valor a número JS real
        let parseStr = valStr;
        if (parseStr.includes(',')) {
            // Coma = decimal, puntos = miles
            parseStr = parseStr.replace(/\./g, '').replace(',', '.');
        } else {
            const dotCount = (parseStr.match(/\./g) || []).length;
            if (dotCount > 1) {
                parseStr = parseStr.replace(/\./g, '');
            } else if (dotCount === 1) {
                const parts = parseStr.split('.');
                if (parts[1] && parts[1].length === 3) {
                    parseStr = parseStr.replace('.', '');
                }
            }
        }

        // Validar que sea numérico
        if (!/^\d*\.?\d*$/.test(parseStr)) return;

        const num = parseFloat(parseStr);
        onInputChange(prev => ({ ...prev, [field]: isNaN(num) ? '' : num }));
    };

    const toggleIVA = (checked) => {
        onInputChange(prev => {
            let currentPrice = parseFloat(prev.presupuesto) || 0;
            let newPrice = currentPrice;

            if (checked) {
                // Añadir IVA (x 1.21)
                newPrice = currentPrice * 1.21;
            } else {
                // Quitar IVA (/ 1.21)
                newPrice = currentPrice / 1.21;
            }

            return {
                ...prev,
                includeIVA: checked,
                presupuesto: parseFloat(newPrice.toFixed(2)) // Redondear a 2 decimales para evitar 1209.999999
            };
        });
    };

    return (
        <SectionCard className="h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Cálculo de Eficiencia</h2>
                    <p className="text-sm text-slate-400">Personaliza los parámetros técnicos</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Datos del edificio - COLAPSABLE */}
                <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setShowBuildingData(!showBuildingData)}
                        className="w-full p-4 flex flex-col gap-2 hover:bg-slate-800/30 transition-colors text-left"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-lime-400 uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Datos del edificio
                            </h3>
                            <div className="flex items-center gap-3">
                                {showBuildingData ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showBuildingData ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!showBuildingData && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    {inputs.anio < 1900 ? 'Ant. 1900' : inputs.anio}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    {inputs.superficie} m²
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium capitalize">
                                    {inputs.tipo === 'unifamiliar' ? 'Unifamiliar' : inputs.tipo === 'piso' ? 'Piso' : 'Adosada'}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium uppercase">
                                    Zona {inputs.zona}
                                </span>
                            </div>
                        )}
                    </button>

                    {showBuildingData && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                {/* Ubicación y Año */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="md:col-span-2">
                                        <Label htmlFor="provincia">Provincia</Label>
                                        <Select
                                            id="provincia"
                                            value={inputs.provincia || ''}
                                            onChange={e => handleChange('provincia', e.target.value)}
                                        >
                                            <option value="">Seleccionar (Opcional)</option>
                                            {Object.entries(PROVINCE_CLIMATE_MAP)
                                                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                                                .map(([code, data]) => (
                                                    <option key={code} value={code}>{data.name}</option>
                                                ))}
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="zona">Zona climática</Label>
                                        <Select
                                            id="zona"
                                            value={inputs.zona}
                                            onChange={e => handleChange('zona', e.target.value)}
                                        >
                                            {['A3', 'B3', 'C3', 'D2', 'D3', 'E1', 'E2'].map(z => (
                                                <option key={z} value={z}>{z}</option>
                                            ))}
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                    <div>
                                        <Label htmlFor="anio">Año de construcción</Label>
                                        <Select
                                            id="anio"
                                            value={inputs.anio < 1900 ? 1899 : inputs.anio}
                                            onChange={e => handleChange('anio', parseInt(e.target.value))}
                                        >
                                            {Array.from({ length: 2025 - 1900 + 1 }, (_, i) => 2025 - i).map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                            <option value={1899}>Anterior a 1900</option>
                                        </Select>
                                    </div>
                                </div>

                                {/* Dimensiones */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <Label htmlFor="superficie">Superficie útil (m²)</Label>
                                        <Input
                                            id="superficie"
                                            type="text"
                                            inputMode="decimal"
                                            min={20}
                                            value={formatDisplay(inputs.superficie)}
                                            onChange={e => handleSmartNumberChange('superficie', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="plantas">Nº de plantas</Label>
                                        <Input
                                            id="plantas"
                                            type="text"
                                            inputMode="decimal"
                                            min={1}
                                            value={inputs.plantas}
                                            onChange={e => handleSmartNumberChange('plantas', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="altura">Altura libre (m)</Label>
                                        <Input
                                            id="altura"
                                            type="text"
                                            inputMode="decimal"
                                            step={0.05}
                                            value={formatDisplay(inputs.altura)}
                                            onChange={e => handleSmartNumberChange('altura', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Tipología */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label htmlFor="tipo">Tipo de vivienda</Label>
                                        <Select
                                            id="tipo"
                                            value={inputs.tipo}
                                            onChange={e => handleTypeChange(e.target.value)}
                                        >
                                            <option value="unifamiliar">Unifamiliar</option>
                                            <option value="hilera">Adosada en hilera</option>
                                            <option value="piso">Piso / División Horizontal</option>
                                        </Select>
                                    </div>
                                    {inputs.tipo === 'piso' && (
                                        <div>
                                            <Label htmlFor="subtipo">Posición en el edificio</Label>
                                            <Select
                                                id="subtipo"
                                                value={inputs.subtipo}
                                                onChange={e => handleChange('subtipo', e.target.value)}
                                            >
                                                <option value="intermedio">Piso intermedio (entre viviendas)</option>
                                                <option value="atico">Ático (cubierta expuesta)</option>
                                                <option value="bajo">Planta baja (local inf. no calefactado)</option>
                                                <option value="bajo_terreno">Planta baja (en contacto con terreno)</option>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <Divider />

                {/* Envolvente térmica - COLAPSABLE */}
                <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setShowEnvolvente(!showEnvolvente)}
                        className="w-full p-4 flex flex-col gap-2 hover:bg-slate-800/30 transition-colors text-left"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-lime-400 uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                Envolvente térmica
                            </h3>
                            <div className="flex items-center gap-3">
                                {showEnvolvente ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showEnvolvente ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!showEnvolvente && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    U Muro: {inputs.uMuro}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    U Cubierta: {inputs.uCubierta}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                                    Ventana: {inputs.ventanaU}
                                </span>
                            </div>
                        )}
                    </button>

                    {showEnvolvente && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <Label htmlFor="uMuro">U Muros (W/m²K)</Label>
                                        <Input
                                            id="uMuro"
                                            type="text"
                                            inputMode="decimal"
                                            step={0.01}
                                            value={formatDisplay(inputs.uMuro)}
                                            onChange={e => {
                                                handleSmartNumberChange('uMuro', e.target.value);
                                                setDirtyUWall(true);
                                            }}
                                            className={!dirtyUWall ? 'text-cyan-400 font-bold' : ''}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="uCubierta">U Cubierta (W/m²K)</Label>
                                        <Input
                                            id="uCubierta"
                                            type="text"
                                            inputMode="decimal"
                                            step={0.01}
                                            value={formatDisplay(inputs.uCubierta)}
                                            onChange={e => {
                                                handleSmartNumberChange('uCubierta', e.target.value);
                                                setDirtyURoof(true);
                                            }}
                                            className={!dirtyURoof ? 'text-cyan-400 font-bold' : ''}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label htmlFor="ventana">Tipo de ventana</Label>
                                        <Select
                                            id="ventana"
                                            value={inputs.ventanaU}
                                            onChange={e => {
                                                handleChange('ventanaU', parseFloat(e.target.value));
                                                setDirtyVentana(true);
                                            }}
                                            className={!dirtyVentana ? 'text-cyan-400 font-bold' : ''}
                                        >
                                            <option value="5">Sencilla aluminio (U=5.0)</option>
                                            <option value="3">Doble antiguo (U=3.0)</option>
                                            <option value="2">Doble con RPT (U=2.0)</option>
                                            <option value="1.4">Doble bajo emisivo (U=1.4)</option>
                                            <option value="1.1">Triple eficiente (U=1.1)</option>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="ach">Ventilación (ren/h)</Label>
                                        <Input
                                            id="ach"
                                            type="text"
                                            inputMode="decimal"
                                            step={0.01}
                                            value={formatDisplay(inputs.ach)}
                                            onChange={e => {
                                                handleSmartNumberChange('ach', e.target.value);
                                                setDirtyAch(true);
                                            }}
                                            className={!dirtyAch ? 'text-cyan-400 font-bold' : ''}
                                        />
                                    </div>
                                </div>

                                {/* Advanced Section - Integrated into Envolvente */}
                                <div className="mt-4 pt-4 border-t border-slate-800/30">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-tight mb-4 flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Parámetros de cálculo
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="gla">% Huecos en fachada</Label>
                                            <Input
                                                id="gla"
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDisplay(inputs.gla)}
                                                onChange={e => handleSmartNumberChange('gla', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="fachadas">Fachadas expuestas</Label>
                                            <Input
                                                id="fachadas"
                                                type="number"
                                                min={0}
                                                max={4}
                                                value={inputs.fachadas}
                                                onChange={e => handleChange('fachadas', parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 mt-4 gap-4">
                                        <div>
                                            <Label htmlFor="patios">Patios interiores</Label>
                                            <Input
                                                id="patios"
                                                type="number"
                                                min={0}
                                                value={inputs.patios}
                                                onChange={e => handleChange('patios', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="orientacion">Orientación</Label>
                                            <Select
                                                id="orientacion"
                                                value={inputs.orientacion}
                                                onChange={e => handleChange('orientacion', e.target.value)}
                                            >
                                                {['media', 'N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map(o => (
                                                    <option key={o} value={o}>{o === 'media' ? 'Media' : o}</option>
                                                ))}
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <Label htmlFor="sueloTipo">Tipo de suelo</Label>
                                        <Select
                                            id="sueloTipo"
                                            value={inputs.sueloTipo}
                                            onChange={e => handleChange('sueloTipo', e.target.value)}
                                        >
                                            <option value="terreno">Contacto con terreno</option>
                                            <option value="garaje">Sobre garaje no calefactado</option>
                                            <option value="vivienda">Entre viviendas</option>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <Divider />

                {/* Instalaciones y Mejoras - COLAPSABLE */}
                <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setShowInstalaciones(!showInstalaciones)}
                        className="w-full p-4 flex flex-col gap-2 hover:bg-slate-800/30 transition-colors text-left"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-lime-400 uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Instalaciones y Mejoras
                            </h3>
                            <div className="flex items-center gap-3">
                                {showInstalaciones ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showInstalaciones ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!showInstalaciones && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                                    {BOILER_EFFICIENCIES.find(b => b.id === inputs.boilerId)?.label || 'Caldera no seleccionada'}
                                </span>
                            </div>
                        )}
                    </button>

                    {showInstalaciones && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                {/* Caldera Existente */}
                                <div>
                                    <Label htmlFor="boilerId">Caldera existente</Label>
                                    <Select
                                        id="boilerId"
                                        value={inputs.boilerId}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const selected = BOILER_EFFICIENCIES.find(b => b.id === id);
                                            if (selected) {
                                                setIsPriceLocked(true);
                                                onInputChange(prev => {
                                                    let fuelUpdate = {};
                                                    if (id.startsWith('gas_')) {
                                                        fuelUpdate.fuelType = 'gas_natural';
                                                        fuelUpdate.fuelPrice = FUEL_PRICES.gas_natural.price;
                                                    } else if (id.startsWith('oil_')) {
                                                        fuelUpdate.fuelType = 'gasoleo';
                                                        fuelUpdate.fuelPrice = FUEL_PRICES.gasoleo.price;
                                                    } else if (id.startsWith('solid_')) {
                                                        fuelUpdate.fuelType = 'carbon';
                                                        fuelUpdate.fuelPrice = FUEL_PRICES.carbon.price;
                                                    }

                                                    return {
                                                        ...prev,
                                                        boilerId: id,
                                                        boilerEff: selected.value,
                                                        ...fuelUpdate
                                                    };
                                                });
                                            }
                                        }}
                                        className="font-mono text-sm"
                                    >
                                        {BOILER_EFFICIENCIES.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                {b.label} (η={(b.value * 100).toFixed(0)}%)
                                            </option>
                                        ))}
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="aerothermiaModel">Modelo de máquina (Aerotermia)</Label>
                                    <Select
                                        id="aerothermiaModel"
                                        value={inputs.aerothermiaModel || 'custom'}
                                        onChange={e => {
                                            const modelId = e.target.value;
                                            const selectedModel = AEROTHERMIA_MODELS.find(m => m.id === modelId);
                                            const currentEmitter = inputs.emitterType || 'radiadores_convencionales';

                                            let updates = { aerothermiaModel: modelId };

                                            if (selectedModel && modelId !== 'custom') {
                                                updates.scopHeating = currentEmitter === 'radiadores_convencionales'
                                                    ? selectedModel.scop55
                                                    : selectedModel.scop35;
                                            }

                                            onInputChange(prev => ({ ...prev, ...updates }));
                                        }}
                                    >
                                        {AEROTHERMIA_MODELS.map(m => (
                                            <option key={m.id} value={m.id}>{m.label}</option>
                                        ))}
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="emitterType">Tipo de emisor</Label>
                                    <Select
                                        id="emitterType"
                                        value={inputs.emitterType || 'radiadores_convencionales'}
                                        onChange={e => {
                                            const type = e.target.value;
                                            const currentModelId = inputs.aerothermiaModel || 'custom';
                                            const selectedModel = AEROTHERMIA_MODELS.find(m => m.id === currentModelId);

                                            let newScop = 3.2;
                                            if (type === 'radiadores_baja_temp') newScop = 3.8;
                                            if (type === 'suelo_radiante') newScop = 4.5;

                                            if (selectedModel && currentModelId !== 'custom') {
                                                newScop = type === 'radiadores_convencionales'
                                                    ? selectedModel.scop55
                                                    : selectedModel.scop35;
                                            }

                                            onInputChange(prev => ({
                                                ...prev,
                                                emitterType: type,
                                                scopHeating: newScop
                                            }));
                                        }}
                                    >
                                        <option value="radiadores_convencionales">Radiadores convencionales (55°C)</option>
                                        <option value="radiadores_baja_temp">Radiadores de baja temperatura (35°C)</option>
                                        <option value="suelo_radiante">Suelo radiante (35°C)</option>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label htmlFor="scopHeating">SCOP Calefacción</Label>
                                        <Input
                                            id="scopHeating"
                                            type="text"
                                            inputMode="decimal"
                                            step={0.1}
                                            min={1}
                                            value={formatDisplay(inputs.scopHeating)}
                                            onChange={e => handleSmartNumberChange('scopHeating', e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end pb-2">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={inputs.changeAcs}
                                                    onChange={e => handleChange('changeAcs', e.target.checked)}
                                                />
                                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                                            </div>
                                            <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                                                Incluir cambio de ACS
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {inputs.changeAcs && (
                                    <>
                                        <div className="animate-fade-in">
                                            <Label htmlFor="scopAcs">SCOP ACS</Label>
                                            <Input
                                                id="scopAcs"
                                                type="text"
                                                inputMode="decimal"
                                                step={0.1}
                                                min={1}
                                                value={formatDisplay(inputs.scopAcs)}
                                                onChange={e => handleSmartNumberChange('scopAcs', e.target.value)}
                                            />
                                        </div>

                                        <div className="animate-fade-in">
                                            <Label htmlFor="dacs">Demanda ACS (kWh/día)</Label>
                                            <Input
                                                id="dacs"
                                                type="text"
                                                inputMode="decimal"
                                                min={0}
                                                value={formatDisplay(inputs.dacs)}
                                                onChange={e => handleSmartNumberChange('dacs', e.target.value)}
                                                placeholder="Ej: 10.5"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                Demanda diaria de Agua Caliente Sanitaria
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <Divider />

                {/* Datos Económicos - COLAPSABLE */}
                <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => setShowEconomicData(!showEconomicData)}
                        className="w-full p-4 flex flex-col gap-2 hover:bg-slate-800/30 transition-colors text-left"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-lime-400 uppercase tracking-wider flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Datos Económicos
                            </h3>
                            <div className="flex items-center gap-3">
                                {showEconomicData ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${showEconomicData ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!showEconomicData && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    Presupuesto: {formatDisplay(inputs.presupuesto)} €
                                </span>
                                {inputs.includeAnnualSavings && (
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                                        Ahorro activado ({FUEL_PRICES[inputs.fuelType]?.label})
                                    </span>
                                )}
                            </div>
                        )}
                    </button>

                    {showEconomicData && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-6">
                                {/* Subsección Presupuesto y Propietarios */}
                                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-3 bg-lime-500 rounded-full"></div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Presupuesto y Configuración</span>
                                        </div>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${inputs.includeIVA ? 'text-lime-400' : 'text-slate-500'}`}>
                                                {inputs.includeIVA ? 'IVA Incluido' : 'Sin IVA'}
                                            </span>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={inputs.includeIVA || false}
                                                    onChange={e => toggleIVA(e.target.checked)}
                                                />
                                                <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-lime-500"></div>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="presupuesto" className="flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                {showBrokergy ? 'Presupuesto (€)' : 'Presupuesto instalación (€)'}
                                            </Label>
                                            <Input
                                                id="presupuesto"
                                                type="text"
                                                inputMode="decimal"
                                                min={0}
                                                value={formatDisplay(inputs.presupuesto)}
                                                onChange={e => handleSmartNumberChange('presupuesto', e.target.value)}
                                                className="bg-slate-900/60 border-slate-700/50 focus:border-lime-500/50"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="numOwners" className="flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                {showBrokergy ? 'Propietarios' : 'Nº Propietarios'}
                                            </Label>
                                            <Input
                                                id="numOwners"
                                                type="number"
                                                min={1}
                                                max={10}
                                                step={1}
                                                value={inputs.numOwners || 1}
                                                onChange={e => handleChange('numOwners', parseInt(e.target.value) || 1)}
                                                className="bg-slate-900/60 border-slate-700/50 focus:border-lime-500/50"
                                            />
                                        </div>
                                    </div>

                                    {showBrokergy && (
                                        <div className="animate-fade-in mt-2 border-t border-white/5 pt-4">
                                            <Label htmlFor="caePriceClient" className="flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                </svg>
                                                CAE Cliente (€/MWh)
                                            </Label>
                                            <Input
                                                id="caePriceClient"
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                value={inputs.caePriceClient}
                                                onChange={e => handleChange('caePriceClient', parseFloat(e.target.value) || 0)}
                                                placeholder="Ej: 95"
                                                className="bg-slate-900/60 border-slate-700/50 focus:border-lime-500/50"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Sección Descuento Certificados */}
                                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/20">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Descuento 100% Certificados
                                        </h4>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={inputs.discountCertificates}
                                                    onChange={e => handleChange('discountCertificates', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-amber-400 transition-colors">
                                                {inputs.discountCertificates ? 'Activado' : 'Desactivado'}
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                {/* Sección Legalización - VISIBILIDAD CONTROLADA */}
                                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-900/10 to-orange-900/10 border border-amber-500/10 transition-all duration-300">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Tramitación Legalización
                                        </h4>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={inputs.includeLegalization}
                                                    onChange={e => handleChange('includeLegalization', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-amber-400 transition-colors">
                                                {inputs.includeLegalization ? 'Activado' : 'Desactivado'}
                                            </span>
                                        </label>
                                    </div>

                                    {inputs.includeLegalization && (
                                        <div className="mt-4 pt-4 border-t border-amber-500/10 space-y-4 animate-fade-in text-sm">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="legalizationPrice" className="text-[10px] text-amber-400/70 font-bold uppercase tracking-widest">Importe Legalización (€)</Label>
                                                    <Input
                                                        id="legalizationPrice"
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={formatDisplay(inputs.legalizationPrice)}
                                                        onChange={e => handleSmartNumberChange('legalizationPrice', e.target.value)}
                                                        className="bg-slate-950/40 border-amber-500/20 focus:border-amber-500/50 h-9 font-mono text-amber-50"
                                                    />
                                                </div>
                                                <div className="flex flex-col justify-end pb-1.5">
                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                className="peer sr-only"
                                                                checked={inputs.installerNoCard}
                                                                onChange={e => handleChange('installerNoCard', e.target.checked)}
                                                            />
                                                            <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-600"></div>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-amber-400 transition-colors">
                                                            INSTALADOR SIN CARNET (+100€)
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Sección Ahorro Anual */}
                                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-900/20 to-cyan-900/20 border border-emerald-500/20">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Ahorro Anual
                                        </h4>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={inputs.includeAnnualSavings}
                                                    onChange={e => handleChange('includeAnnualSavings', e.target.checked)}
                                                />
                                                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
                                                {inputs.includeAnnualSavings ? 'Activado' : 'Desactivado'}
                                            </span>
                                        </label>
                                    </div>

                                    {inputs.includeAnnualSavings && (
                                        <div className="animate-fade-in space-y-4">
                                            {/* Toggle Modo Teórico / Real */}
                                            <div className="flex bg-slate-900/60 p-1 rounded-lg border border-white/5 mb-4">
                                                <button
                                                    type="button"
                                                    onClick={() => handleChange('savingsMode', 'theoretical')}
                                                    className={`flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${inputs.savingsMode === 'theoretical'
                                                        ? 'bg-emerald-600 text-white shadow-lg'
                                                        : 'text-slate-400 hover:text-white'
                                                        }`}
                                                >
                                                    Teórico
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleChange('savingsMode', 'real')}
                                                    className={`flex-1 py-2 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${inputs.savingsMode === 'real'
                                                        ? 'bg-amber-600 text-white shadow-lg'
                                                        : 'text-slate-400 hover:text-white'
                                                        }`}
                                                >
                                                    Real
                                                </button>
                                            </div>

                                            {/* Selector Combustible */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <Label htmlFor="fuelType" className="flex items-center gap-1.5">
                                                        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                        </svg>
                                                        Combustible actual
                                                    </Label>
                                                    <Select
                                                        id="fuelType"
                                                        value={inputs.fuelType}
                                                        onChange={e => {
                                                            const type = e.target.value;
                                                            const defaultPrice = FUEL_PRICES[type]?.price || 0;
                                                            setIsPriceLocked(true);
                                                            onInputChange(prev => ({
                                                                ...prev,
                                                                fuelType: type,
                                                                fuelPrice: defaultPrice
                                                            }));
                                                        }}
                                                        className="bg-slate-900/60 border-slate-700/50 focus:border-emerald-500/50"
                                                    >
                                                        {Object.entries(FUEL_PRICES).map(([key, val]) => (
                                                            <option key={key} value={key}>{val.label}</option>
                                                        ))}
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label htmlFor="fuelPrice" className="flex items-center gap-1.5">
                                                        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Precio (€/kWh)
                                                    </Label>
                                                    <div className="relative group">
                                                        <Input
                                                            id="fuelPrice"
                                                            type="text"
                                                            inputMode="decimal"
                                                            step={0.001}
                                                            min={0}
                                                            value={formatDisplay(inputs.fuelPrice)}
                                                            onChange={e => handleSmartNumberChange('fuelPrice', e.target.value)}
                                                            disabled={isPriceLocked}
                                                            className={isPriceLocked ? 'opacity-60 bg-slate-900/50 cursor-not-allowed border-slate-800' : 'bg-slate-900/60 border-emerald-500/50'}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsPriceLocked(!isPriceLocked)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 transition-all border border-white/5"
                                                        >
                                                            {isPriceLocked ? 'Cambiar' : 'Bloquear'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Input Gasto Real (solo visible en modo real) */}
                                            {inputs.savingsMode === 'real' && (
                                                <div className="animate-fade-in space-y-2">
                                                    <Label htmlFor="gastoAnualReal" className="flex items-center gap-1.5">
                                                        <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                        </svg>
                                                        Gasto anual estimado (€)
                                                    </Label>
                                                    <Input
                                                        id="gastoAnualReal"
                                                        type="text"
                                                        inputMode="decimal"
                                                        min={0}
                                                        placeholder="Ej: 2.500"
                                                        value={formatDisplay(inputs.gastoAnualReal)}
                                                        onChange={e => handleSmartNumberChange('gastoAnualReal', e.target.value)}
                                                        className="bg-slate-900/60 border-slate-700/50 focus:border-amber-500/50"
                                                    />
                                                    <p className="text-[10px] text-slate-500 flex items-center gap-1 italic">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Si conoces el gasto anual real, introdúcelo aquí
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>


                                {/* INTERNAL: Brokergy Profit (Solo si el toggle está activo) */}
                                {showBrokergy && result && (
                                    <div className="p-5 rounded-2xl bg-slate-900/80 border-2 border-orange-500/40 flex flex-col gap-4 shadow-[0_0_20px_rgba(249,115,22,0.1)] animate-scale-in relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/10 rounded-full blur-[80px] -mr-20 -mt-20"></div>
                                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-600/5 rounded-full blur-[60px] -ml-16 -mb-16"></div>

                                        <div className="relative">
                                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
                                                <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)] animate-pulse"></div>
                                                <span className="text-orange-500 text-[10px] font-black uppercase tracking-[0.2em]">Configuración y Margen Brokergy</span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                                <div className="space-y-2">
                                                    <Label htmlFor="private-cae-so">Precio CAE S.O. (€/MWh)</Label>
                                                    <Input
                                                        id="private-cae-so"
                                                        type="number"
                                                        className="bg-slate-950/80 border-orange-500/40 text-orange-100 focus:border-orange-500 focus:ring-orange-500/20"
                                                        value={inputs.caePriceSO}
                                                        onChange={e => handleChange('caePriceSO', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>

                                                <div className="flex flex-col justify-end pb-1.5">
                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                        <div className="relative flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                className="peer sr-only"
                                                                checked={inputs.includeCommission}
                                                                onChange={e => handleChange('includeCommission', e.target.checked)}
                                                            />
                                                            <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 group-hover:text-orange-400 transition-colors">
                                                            ¿Incluir Comisión?
                                                        </span>
                                                    </label>
                                                </div>
                                            </div>

                                            {inputs.includeCommission && (
                                                <div className="animate-fade-in space-y-6 mb-6">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="private-cae-prescriptor">Comisión Prescriptor (€/MWh)</Label>
                                                        <Input
                                                            id="private-cae-prescriptor"
                                                            type="number"
                                                            className="bg-slate-950/80 border-orange-500/40 text-orange-100 focus:border-orange-500 focus:ring-orange-500/20"
                                                            value={inputs.caePricePrescriptor}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                handleChange('caePricePrescriptor', val);
                                                            }}
                                                        />
                                                    </div>

                                                    <div className="space-y-3">
                                                        <Label>Restar la comisión del prescriptor de:</Label>
                                                        <div className="flex bg-slate-950/80 rounded-xl p-1.5 border border-slate-700 min-h-[52px] shadow-inner">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleChange('prescriptorMode', 'client')}
                                                                className={`flex-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all duration-300 ${inputs.prescriptorMode === 'client' ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]' : 'text-slate-500 hover:text-orange-400 hover:bg-white/5'}`}
                                                            >
                                                                Cliente
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleChange('prescriptorMode', 'brokergy')}
                                                                className={`flex-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all duration-300 ${inputs.prescriptorMode === 'brokergy' ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]' : 'text-slate-500 hover:text-orange-400 hover:bg-white/5'}`}
                                                            >
                                                                Brokergy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleChange('prescriptorMode', 'both')}
                                                                className={`flex-1 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all duration-300 ${inputs.prescriptorMode === 'both' ? 'bg-orange-600 text-white shadow-[0_0_15px_rgba(234,88,12,0.4)]' : 'text-slate-500 hover:text-orange-400 hover:bg-white/5'}`}
                                                            >
                                                                Ambos
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-1.5 p-4 bg-orange-500/10 rounded-2xl border border-orange-500/30 shadow-[inset_0_0_20px_rgba(249,115,22,0.05)]">
                                                <div className="flex justify-between items-center gap-4">
                                                    <span className="text-orange-400/70 text-[10px] font-bold uppercase tracking-wider leading-tight">Beneficio Brokergy Neto</span>
                                                    <span className="text-orange-500 font-mono font-black text-2xl sm:text-3xl whitespace-nowrap drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                                                        {formatDisplay(result.financials.profitBrokergy?.toFixed(2))} €
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center py-2 border-t border-orange-500/20 mt-1 gap-4">
                                                    <span className="text-orange-300/60 text-[10px] font-bold uppercase tracking-wider">Pago a Prescriptor</span>
                                                    <span className="text-orange-400 font-mono font-bold text-base sm:text-lg whitespace-nowrap">
                                                        {formatDisplay((result.totalPrescriptor || result.financials.totalPrescriptor)?.toFixed(2))} €
                                                    </span>
                                                </div>
                                                <div className="flex justify-start text-[10px] text-orange-500/40 font-bold uppercase tracking-widest mt-1">
                                                    <span>Margen Neto: {result.financials.caePriceBrokergy.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €/MWh</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </SectionCard>
    );
}
