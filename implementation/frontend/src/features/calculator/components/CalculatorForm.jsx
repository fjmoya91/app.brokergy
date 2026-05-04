// CalculatorForm v2.2 - Dynamic Aerotermia Integration (2026-03-27)
import React, { useEffect, useState } from 'react';
import { SectionCard, Button, Input, Label, Select, Divider } from './UIComponents';
import {
    getUByYear,
    getVentanaYACHByYear,
    TYPE_DEFAULTS,
    BOILER_EFFICIENCIES,
    FUEL_PRICES,
    AEROTHERMIA_MODELS,
    FACTORES_PASO,
    getScopFromModel,
    getScopAcsFromModel
} from '../logic/calculation';
import { PROVINCE_CLIMATE_MAP } from '../data/provinceMapping';
import { useAuth } from '../../../context/AuthContext';
import { parseCeeXml } from '../logic/xmlCeeParser';

export function CalculatorForm({
    inputs,
    onInputChange,
    onCalculate,
    result,
    showBrokergy,
    demandMode,
    onDemandModeChange,
    xmlDemandData,
    onXmlDemandDataChange,
    dbModels = []
}) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    const [showXmlModal, setShowXmlModal] = useState(false);
    const [xmlError, setXmlError] = useState(null);
    const [xmlFinalError, setXmlFinalError] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDraggingFinal, setIsDraggingFinal] = useState(false);


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
        const defaults = getUByYear(inputs.anio, inputs.zona);
        return inputs.uMuro !== defaults.wall;
    });
    const [dirtyURoof, setDirtyURoof] = useState(() => {
        if (!inputs.anio || !inputs.uCubierta) return false;
        const defaults = getUByYear(inputs.anio, inputs.zona);
        return inputs.uCubierta !== defaults.roof;
    });
    const [dirtyVentana, setDirtyVentana] = useState(() => {
        if (!inputs.anio || !inputs.ventanaU) return false;
        const defaults = getVentanaYACHByYear(inputs.anio, inputs.zona);
        return inputs.ventanaU !== defaults.ventanaU;
    });
    const [dirtyAch, setDirtyAch] = useState(() => {
        if (!inputs.anio || !inputs.ach) return false;
        const defaults = getVentanaYACHByYear(inputs.anio, inputs.zona);
        return inputs.ach !== defaults.ach;
    });

    const [dirtyScopHeating, setDirtyScopHeating] = useState(() => {
        return !!inputs.isPersistent;
    });
    const [dirtyScopAcs, setDirtyScopAcs] = useState(() => {
        return !!inputs.isPersistent;
    });

    // Actualizar Eficiencia si cambia la zona o el emisor
    useEffect(() => {
        const modelId = inputs.aerothermiaModel;
        if (!modelId || modelId === 'custom') return;

        let selectedModel = dbModels.find(m => String(m.id) === String(modelId));
        if (!selectedModel) selectedModel = AEROTHERMIA_MODELS.find(m => m.id === modelId);

        if (selectedModel) {
            const temp = inputs.emitterType === 'radiadores_convencionales' ? 55 : (inputs.emitterType === 'radiadores_baja_temp' ? 45 : 35);
            const newScop = getScopFromModel(selectedModel, inputs.zona, temp);
            const power = parseFloat(selectedModel.potencia_calefaccion) || parseFloat(selectedModel.potencia_nominal_35) || 0;

            const updates = {};
            if (!dirtyScopHeating && newScop !== inputs.scopHeating) updates.scopHeating = newScop;
            if (power > 0 && power !== inputs.potenciaBomba) updates.potenciaBomba = power;

            // Gestionar SCOP ACS
            if (!dirtyScopAcs) {
                if (!inputs.changeAcs) {
                    // ACS Integrado: usar el mismo modelo
                    const newScopAcs = getScopAcsFromModel(selectedModel, inputs.zona);
                    if (newScopAcs !== inputs.scopAcs) updates.scopAcs = newScopAcs;
                } else {
                    // ACS Dedicado: usar el modelo de ACS específico
                    const modelIdAcs = inputs.aerothermiaModelAcs;
                    if (modelIdAcs && modelIdAcs !== 'custom') {
                        const selectedModelAcs = dbModels.find(m => String(m.id) === String(modelIdAcs));
                        if (selectedModelAcs) {
                            const newScopAcs = getScopAcsFromModel(selectedModelAcs, inputs.zona);
                            if (newScopAcs !== inputs.scopAcs) updates.scopAcs = newScopAcs;
                        }
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                onInputChange(prev => ({ ...prev, ...updates }));
            }
        }
    }, [inputs.zona, inputs.emitterType, inputs.aerothermiaModel, inputs.aerothermiaModelAcs, inputs.changeAcs, dbModels, inputs.hibridacion, dirtyScopHeating, dirtyScopAcs]);
    const [isPriceLocked, setIsPriceLocked] = useState(true);

    // Estado local para el filtro de marcas
    const [selectedMarca, setSelectedMarca] = useState('');

    // Estado local para el filtro de marcas de ACS
    const [selectedMarcaAcs, setSelectedMarcaAcs] = useState('');

    // Sincronizar marca seleccionada con el modelo inicial si existe
    useEffect(() => {
        if (inputs.aerothermiaModel && inputs.aerothermiaModel !== 'custom' && !selectedMarca) {
            const currentModel = dbModels.find(m => String(m.id) === String(inputs.aerothermiaModel)) || 
                               AEROTHERMIA_MODELS.find(m => m.id === inputs.aerothermiaModel);
            if (currentModel) {
                setSelectedMarca(currentModel.marca || 'GENÉRICO');
            }
        }
        
        if (inputs.aerothermiaModelAcs && inputs.aerothermiaModelAcs !== 'custom' && !selectedMarcaAcs) {
            const currentModelAcs = dbModels.find(m => String(m.id) === String(inputs.aerothermiaModelAcs));
            if (currentModelAcs) {
                setSelectedMarcaAcs(currentModelAcs.marca);
            }
        }
    }, [inputs.aerothermiaModel, inputs.aerothermiaModelAcs, dbModels]);

    // Estados para dropdowns de marcas
    const [isBrandDropdownOpen, setIsBrandDropdownOpen] = useState(false);
    const [brandSearchTerm, setBrandSearchTerm] = useState('');
    const brandRef = React.useRef(null);

    const [isBrandAcsDropdownOpen, setIsBrandAcsDropdownOpen] = useState(false);
    const [brandAcsSearchTerm, setBrandAcsSearchTerm] = useState('');
    const brandAcsRef = React.useRef(null);

    // Popup SCOP para marca personalizada
    const [showScopPopup, setShowScopPopup] = useState(false);
    const [showScopAcsPopup, setShowScopAcsPopup] = useState(false);
    const CUSTOM_MARCA = '__OTRA__';

    // Cerrar dropdowns al hacer click fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (brandRef.current && !brandRef.current.contains(event.target)) {
                setIsBrandDropdownOpen(false);
            }
            if (brandAcsRef.current && !brandAcsRef.current.contains(event.target)) {
                setIsBrandAcsDropdownOpen(false);
            }
        }
        if (isBrandDropdownOpen || isBrandAcsDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isBrandDropdownOpen, isBrandAcsDropdownOpen]);

    // Extraer marcas únicas con su logo (usamos Map para preservar logos y unicidad)
    const marcasDisponibles = React.useMemo(() => {
        const brandsMap = new Map();
        
        // De la base de datos
        dbModels.forEach(m => {
            if (m.marca && !brandsMap.has(m.marca)) {
                brandsMap.set(m.marca, m.logo_marca);
            }
        });
        
        // Genéricos
        if (!brandsMap.has('GENÉRICO')) {
            brandsMap.set('GENÉRICO', null);
        }
        
        // Convertir a lista y ordenar
        return Array.from(brandsMap.entries())
            .map(([nombre, logo]) => ({ nombre, logo }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [dbModels]);

    // Marcas específicamente para ACS
    const marcasAcsDisponibles = React.useMemo(() => {
        const brandsMap = new Map();
        dbModels.forEach(m => {
            // Un equipo es para ACS si tiene SCOP de ACS o volumen de depósito
            const isAcsModel = m.scop_dhw_medio > 0 || m.scop_dhw_calido > 0 || m.deposito_acs_incluido > 0 || String(m.tipo || '').includes('ACS');
            if (m.marca && isAcsModel && !brandsMap.has(m.marca)) {
                brandsMap.set(m.marca, m.logo_marca);
            }
        });
        return Array.from(brandsMap.entries())
            .map(([nombre, logo]) => ({ nombre, logo }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [dbModels]);

    const filteredMarcas = marcasDisponibles.filter(m => 
        m.nombre.toLowerCase().includes(brandSearchTerm.toLowerCase())
    );

    const filteredMarcasAcs = marcasAcsDisponibles.filter(m => 
        m.nombre.toLowerCase().includes(brandAcsSearchTerm.toLowerCase())
    );

    const activeBrandLogo = marcasDisponibles.find(m => m.nombre === selectedMarca)?.logo;
    const activeBrandAcsLogo = marcasAcsDisponibles.find(m => m.nombre === selectedMarcaAcs)?.logo;

    useEffect(() => {
        if (!inputs.anio) return;

        const defaultsU = getUByYear(inputs.anio, inputs.zona);
        const defaultsVentanaAch = getVentanaYACHByYear(inputs.anio, inputs.zona);
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
    }, [inputs.anio, inputs.zona, dirtyUWall, dirtyURoof, dirtyVentana, dirtyAch, inputs.uMuro, inputs.uCubierta, inputs.ventanaU, inputs.ach]);

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

    // Handler para procesar el archivo XML
    const handleXmlFile = (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.xml')) {
            setXmlError('Por favor, selecciona un archivo .xml válido.');
            return;
        }
        setXmlError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const xmlData = parseCeeXml(e.target.result);
                onXmlDemandDataChange(xmlData);
                onDemandModeChange('real');
                if (!inputs.isReforma) {
                    setShowXmlModal(false);
                }

                // Si el XML trae superficie, actualizar los inputs
                if (xmlData.superficieHabitable) {
                    onInputChange(prev => ({
                        ...prev,
                        superficie: xmlData.superficieHabitable,
                        superficieCalefactable: xmlData.superficieHabitable
                    }));
                }
            } catch (err) {
                setXmlError(err.message);
            }
        };
        reader.onerror = () => setXmlError('Error al leer el archivo.');
        reader.readAsText(file);
    };

    // Drag & Drop handlers
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = (e) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        handleXmlFile(file);
    };

    const handleXmlFileFinal = (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.xml')) {
            setXmlFinalError('Por favor, selecciona un archivo .xml válido.');
            return;
        }
        setXmlFinalError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const xmlData = parseCeeXml(e.target.result);
                // Usamos onInputChange para guardar el xmlDemandDataFinal en el estado unificado
                onInputChange(prev => ({
                    ...prev,
                    xmlDemandDataFinal: xmlData
                }));
            } catch (err) {
                setXmlFinalError(err.message);
            }
        };
        reader.onerror = () => setXmlFinalError('Error al leer el archivo final.');
        reader.readAsText(file);
    };

    const handleDragOverFinal = (e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFinal(true); };
    const handleDragLeaveFinal = (e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingFinal(false); };
    const handleDropFinal = (e) => {
        e.preventDefault(); e.stopPropagation(); setIsDraggingFinal(false);
        const file = e.dataTransfer.files?.[0];
        handleXmlFileFinal(file);
    };

    return (
        <>
        <SectionCard className="h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Cálculo de Eficiencia</h2>
                    <p className="text-sm text-slate-400">Personaliza los parámetros técnicos</p>
                </div>
                {/* Botón de Reforma: Ahora visible para todos (Admin y Partner) */}
                <div className="flex items-center gap-2 border border-white/5 bg-slate-900/50 rounded-xl p-1 shadow-inner">
                    <button
                        onClick={() => onInputChange(prev => ({ ...prev, isReforma: !prev.isReforma, reformaType: !prev.isReforma ? 'estimated' : 'none', comparativaReforma: true }))}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                            inputs.isReforma 
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                        }`}
                        title="Activar o desactivar Reforma Integral (RES080)"
                    >
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span className="text-sm font-semibold">{inputs.isReforma ? 'Reforma Activada' : 'Modo Reforma'}</span>
                    </button>
                    
                    {inputs.isReforma && (
                        <label className="flex items-center gap-2 px-3 py-1 cursor-pointer group border-l border-white/10 pl-4 animate-fade-in" title="Mostrar en PDF tabla comparativa vs solo Aerotermia">
                            <div className="relative flex items-center justify-center">
                                <input 
                                    type="checkbox" 
                                    checked={inputs.comparativaReforma !== false} 
                                    onChange={e => onInputChange(prev => ({ ...prev, comparativaReforma: e.target.checked }))} 
                                    className="sr-only"
                                />
                                <div className={`w-8 h-4 rounded-full transition-colors ${inputs.comparativaReforma !== false ? 'bg-cyan-500/50 border border-cyan-500/50' : 'bg-slate-800 border border-slate-700'}`}></div>
                                <div className={`absolute w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${inputs.comparativaReforma !== false ? 'translate-x-2 shadow-[0_0_8px_cyan]' : '-translate-x-2'}`}></div>
                            </div>
                            <span className={`text-[9px] font-black tracking-widest uppercase transition-colors ${inputs.comparativaReforma !== false ? 'text-cyan-400' : 'text-slate-500'}`}>
                                {inputs.comparativaReforma !== false ? 'Comparativa PDF' : 'Solo Reforma PDF'}
                            </span>
                        </label>
                    )}
                </div>
            </div>
            {/* ===== TOGGLE MODO DEMANDA: Estimado / Real / Manual ===== */}
            <div className="mb-6">
                    <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-800/50 shadow-inner">
                        <button
                            onClick={() => onDemandModeChange('estimated')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                                demandMode === 'estimated'
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Cálculo Estimado
                        </button>
                        {/* Botón Cálculo Real (Solo visible para Admin o si ya está seleccionado) */}
                        {(showBrokergy || demandMode === 'real') && (
                            <button
                                onClick={() => {
                                    if (xmlDemandData) {
                                        onDemandModeChange('real');
                                    } else {
                                        setShowXmlModal(true);
                                    }
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                                    demandMode === 'real'
                                        ? 'bg-gradient-to-r from-emerald-500 to-lime-600 text-white shadow-lg shadow-emerald-500/20'
                                        : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Cálculo Real (CEE)
                            </button>
                        )}
                        <button
                            onClick={() => onDemandModeChange('manual')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                                demandMode === 'manual'
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                                    : 'text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            CEE Aportado
                        </button>
                    </div>

                    {demandMode === 'real' && xmlDemandData && (
                        <div className="mt-2 flex justify-end">
                            <button
                                onClick={() => setShowXmlModal(true)}
                                className="text-[9px] font-bold text-emerald-400/60 hover:text-emerald-400 uppercase tracking-widest transition-colors flex items-center gap-1"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Cambiar Certificado XML
                            </button>
                        </div>
                    )}

                    {demandMode === 'real' && inputs.isReforma && inputs.reformaType !== 'none' && (
                        <div className="mt-4 p-5 bg-slate-900/80 border border-cyan-500/30 rounded-xl animate-scale-in">
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                Factores de Paso (Combustibles)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* ACS */}
                                <div className="space-y-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest text-center border-b border-slate-800 pb-2">ACS</h4>
                                    <div>
                                        <Label className="text-[10px] text-emerald-400">Combustible Inicial</Label>
                                        <Select value={inputs.combustibleAcsInicial} onChange={e => handleChange('combustibleAcsInicial', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-cyan-400">Combustible Final</Label>
                                        <Select value={inputs.combustibleAcsFinal} onChange={e => handleChange('combustibleAcsFinal', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                </div>
                                {/* Calefacción */}
                                <div className="space-y-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest text-center border-b border-slate-800 pb-2">Calefacción</h4>
                                    <div>
                                        <Label className="text-[10px] text-emerald-400">Combustible Inicial</Label>
                                        <Select value={inputs.combustibleCalefaccionInicial} onChange={e => handleChange('combustibleCalefaccionInicial', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-cyan-400">Combustible Final</Label>
                                        <Select value={inputs.combustibleCalefaccionFinal} onChange={e => handleChange('combustibleCalefaccionFinal', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                </div>
                                {/* Refrigeración */}
                                <div className="space-y-3 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest text-center border-b border-slate-800 pb-2">Refrigeración</h4>
                                    <div>
                                        <Label className="text-[10px] text-emerald-400">Combustible Inicial</Label>
                                        <Select value={inputs.combustibleRefrigeracionInicial} onChange={e => handleChange('combustibleRefrigeracionInicial', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-cyan-400">Combustible Final</Label>
                                        <Select value={inputs.combustibleRefrigeracionFinal} onChange={e => handleChange('combustibleRefrigeracionFinal', e.target.value)} className="text-xs py-1 h-8 mt-1">
                                            {Object.keys(FACTORES_PASO).map(k => <option key={k} value={k}>{k}</option>)}
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}


                </div>

            {/* El modal XML fue movido al final del componente para soportar doble carga */}

            {/* SECCIÓN ESTIMACIÓN REFORMA (MANUAL O ESTIMADO) - Mostrar calderas y mejoras si es estimado o manual */}
            {inputs.isReforma && (inputs.reformaType === 'estimated' || demandMode === 'manual') && demandMode !== 'real' && (
                <div className="bg-orange-500/5 border border-orange-500/10 rounded-3xl p-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
                                <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-wider">Configuración de Reforma Estimada</h4>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Sistemas actuales y mejoras propuestas (RES080)</p>
                            </div>
                        </div>

                        {demandMode === 'manual' && (
                            <div className="flex items-center gap-4 bg-slate-950/40 p-2 pl-4 rounded-2xl border border-white/5 shadow-inner">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-widest mb-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        Demanda de Calefacción (CEE)
                                    </div>
                                    <div className="relative group min-w-[120px]">
                                        <Input
                                            id="manualDemand"
                                            type="text"
                                            inputMode="decimal"
                                            className="bg-slate-900 border-white/10 h-10 text-[15px] font-mono font-bold text-amber-300 pr-12 group-hover:border-amber-500/50 transition-all text-center"
                                            placeholder="209,4"
                                            value={formatDisplay(inputs.manualDemand)}
                                            onChange={e => handleSmartNumberChange('manualDemand', e.target.value)}
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-amber-500/40 uppercase pointer-events-none text-right flex flex-col items-end">
                                            <span>kWh/m²</span>
                                            <span>año</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        {/* Situación Inicial - Fila Superior 3 columnas */}
                        <div>
                            <h5 className="text-[10px] font-black text-orange-400/60 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50"></span>
                                Situación Inicial
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="boiler-acs" className={`text-[11px] font-bold ${!inputs.boilerAcsType ? 'text-red-400 underline decoration-red-400/50' : 'text-slate-400'}`}>Caldera ACS *</Label>
                                    <Select
                                        id="boiler-acs"
                                        value={inputs.boilerAcsType}
                                        onChange={e => handleChange('boilerAcsType', e.target.value)}
                                        className={`bg-slate-950/50 border-white/10 h-11 transition-all ${!inputs.boilerAcsType ? 'border-red-500/50 bg-red-500/[0.02]' : ''}`}
                                    >
                                        <option value="">Seleccionar caldera...</option>
                                        <option value="Termo">Termo</option>
                                        <option value="Gasoil">Gasoil</option>
                                        <option value="Gas">Gas</option>
                                        <option value="Carbon">Carbón</option>
                                        <option value="Butano">Butano (GLP)</option>
                                        <option value="Propano">Propano</option>
                                        <option value="BIOMASA">BIOMASA</option>
                                    </Select>
                                    {!inputs.boilerAcsType && (
                                        <p className="text-[9px] text-red-500/70 font-black uppercase tracking-tighter animate-pulse">Obligatorio: Selecciona Termo o Butano</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="boiler-heating" className="text-[11px] font-bold text-slate-400">Caldera Calefacción</Label>
                                    <Select
                                        id="boiler-heating"
                                        value={inputs.boilerHeatingType}
                                        onChange={e => handleChange('boilerHeatingType', e.target.value)}
                                        className="bg-slate-950/50 border-white/10 h-11"
                                    >
                                        <option value="No tiene Calefacción">No tiene Calefacción</option>
                                        <option value="Termo">Radiadores eléctricos</option>
                                        <option value="Gasoil">Gasoil</option>
                                        <option value="Gas">Gas</option>
                                        <option value="Carbon">Carbón</option>
                                        <option value="Butano">Butano (GLP)</option>
                                        <option value="Propano">Propano</option>
                                        <option value="BIOMASA">BIOMASA</option>
                                    </Select>
                                </div>

                                {inputs.boilerHeatingType !== 'No tiene Calefacción' && inputs.boilerHeatingType !== 'Termo' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="insulation-state" className="text-[11px] font-bold text-slate-400">Aislamiento de la caldera</Label>
                                        <Select
                                            id="insulation-state"
                                            value={inputs.insulationState}
                                            onChange={e => handleChange('insulationState', e.target.value)}
                                            className="bg-slate-950/50 border-white/10 h-11"
                                        >
                                            <option value="sin_aislamiento">Sin aislamiento</option>
                                            <option value="antigua_mal_aislamiento">Antigua con mal aislamiento</option>
                                            <option value="antigua_aislamiento_medio">Antigua aislamiento medio</option>
                                            <option value="bien_aislada">Bien aislada y mantenida</option>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mejoras de Envolvente - Fila Inferior 4 columnas */}
                        <div>
                            <h5 className="text-[10px] font-black text-orange-400/60 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50"></span>
                                Mejoras de Envolvente
                            </h5>
                            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 shadow-inner">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[
                                        { id: 'reformaVentanas', label: 'Ventanas' },
                                        { id: 'reformaCubierta', label: 'Cubierta' },
                                        { id: 'reformaSuelo', label: 'Suelo' },
                                        { id: 'reformaParedes', label: 'Fachada' }
                                    ].map(item => (
                                        <label key={item.id} className="flex items-center gap-3 cursor-pointer group p-2 rounded-xl hover:bg-white/[0.04] transition-all bg-white/[0.01] border border-white/[0.02]">
                                            <div className="relative flex items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={inputs[item.id]}
                                                    onChange={e => handleChange(item.id, e.target.checked)}
                                                    className="peer sr-only"
                                                />
                                                <div className="w-8 h-4 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 shadow-sm"></div>
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {/* Datos del edificio - COLAPSABLE (oculto en modo REAL) */}
                {/* PESTAÑAS EDIFICIO Y ENVOLVENTE OCULTAS EN MODO MANUAL */}
            {demandMode !== 'manual' && (
                <>
                {demandMode !== 'real' && inputs.reformaType !== 'onlyReforma' && (
                <div className={`relative rounded-2xl bg-slate-900/40 border border-slate-800/50 ${inputs.showBuildingData ? 'z-10 overflow-visible' : 'z-0 overflow-hidden'} transition-all duration-300`}>
                    <button
                        onClick={() => onInputChange(prev => ({ ...prev, showBuildingData: !prev.showBuildingData }))}
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
                                {inputs.showBuildingData ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${inputs.showBuildingData ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!inputs.showBuildingData && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    {inputs.anio < 1900 ? 'Ant. 1900' : inputs.anio}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium">
                                    Útil: {inputs.superficie} m² | Calef: {inputs.superficieCalefactable} m²
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

                    {inputs.showBuildingData && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                {/* Ubicación y Año - REJILLA 4 COLUMNAS */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                                            {['A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'E1'].map(z => (
                                                <option key={z} value={z}>{z}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="anio">Año de const.</Label>
                                        <Select
                                            id="anio"
                                            value={inputs.anio < 1900 ? 1899 : inputs.anio}
                                            onChange={e => {
                                                handleChange('anio', parseInt(e.target.value));
                                                // Resetear dirty flags para permitir recalcular transmitancias según el nuevo año
                                                setDirtyUWall(false);
                                                setDirtyURoof(false);
                                                setDirtyVentana(false);
                                                setDirtyAch(false);
                                            }}
                                        >
                                            {Array.from({ length: 2025 - 1900 + 1 }, (_, i) => 2025 - i).map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                            <option value={1899}>Anterior a 1900</option>
                                        </Select>
                                    </div>
                                </div>

                                {/* Métricas - REJILLA 4 COLUMNAS */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <Label htmlFor="superficie">Sup. útil (m²)</Label>
                                        <Input
                                            id="superficie"
                                            type="text"
                                            inputMode="decimal"
                                            min={20}
                                            value={formatDisplay(inputs.superficie)}
                                            onChange={e => {
                                                const val = e.target.value;
                                                handleSmartNumberChange('superficie', val);
                                                if (!inputs.superficieCalefactable || inputs.superficieCalefactable === inputs.superficie) {
                                                    handleSmartNumberChange('superficieCalefactable', val);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="superficieCalefactable">Sup. Calef. (m²)</Label>
                                        <Input
                                            id="superficieCalefactable"
                                            type="text"
                                            inputMode="decimal"
                                            min={0}
                                            value={formatDisplay(inputs.superficieCalefactable)}
                                            onChange={e => handleSmartNumberChange('superficieCalefactable', e.target.value)}
                                            placeholder="Igual o mayor"
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="plantas">Plantas</Label>
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
                                        <Label htmlFor="altura">Altura (m)</Label>
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

                                {/* Tipología - REJILLA COMPACTA */}
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
                                            <Label htmlFor="subtipo">Posición en edificio</Label>
                                            <Select
                                                id="subtipo"
                                                value={inputs.subtipo}
                                                onChange={e => handleChange('subtipo', e.target.value)}
                                            >
                                                <option value="intermedio">Piso intermedio</option>
                                                <option value="atico">Ático (cubierta exp.)</option>
                                                <option value="bajo">Planta baja (local inf.)</option>
                                                <option value="bajo_terreno">Planta baja (terreno)</option>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                )}

                {demandMode === 'estimated' && <Divider />}

                {/* Envolvente térmica - COLAPSABLE (oculto en modo REAL) */}
                {demandMode === 'estimated' && inputs.reformaType !== 'onlyReforma' && (
                <div className={`relative rounded-2xl bg-slate-900/40 border border-slate-800/50 ${inputs.showEnvolvente ? 'z-10 overflow-visible' : 'z-0 overflow-hidden'} transition-all duration-300`}>
                    <button
                        onClick={() => onInputChange(prev => ({ ...prev, showEnvolvente: !prev.showEnvolvente }))}
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
                                {inputs.showEnvolvente ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${inputs.showEnvolvente ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!inputs.showEnvolvente && (
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

                    {inputs.showEnvolvente && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <Label htmlFor="uMuro">U Muros</Label>
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
                                        <Label htmlFor="uCubierta">U Cubierta</Label>
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
                                    <div className="col-span-1">
                                        <Label htmlFor="ach">ACH</Label>
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
                                    <div className="col-span-2 md:col-span-1">
                                        <Label htmlFor="ventana">U Ventana</Label>
                                        <Select
                                            id="ventana"
                                            value={inputs.ventanaU}
                                            onChange={e => {
                                                handleChange('ventanaU', parseFloat(e.target.value));
                                                setDirtyVentana(true);
                                            }}
                                            className={!dirtyVentana ? 'text-cyan-400 font-bold' : ''}
                                        >
                                            <option value="5">U=5.0 (Alum.)</option>
                                            <option value="3">U=3.0 (Dbl. Ant.)</option>
                                            <option value="2">U=2.0 (RPT)</option>
                                            <option value="1.4">U=1.4 (B. Emis.)</option>
                                            <option value="1.1">U=1.1 (Triple)</option>
                                        </Select>
                                    </div>
                                </div>

                                {/* Advanced Section - Integrated and Compacted */}
                                <div className="mt-4 pt-4 border-t border-slate-800/30">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <svg className="w-3 h-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Parámetros de cálculo (GEOMETRÍA)
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div>
                                            <Label htmlFor="gla">% Huecos</Label>
                                            <Input
                                                id="gla"
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDisplay(inputs.gla)}
                                                onChange={e => handleSmartNumberChange('gla', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="fachadas">Fachadas exp.</Label>
                                            <Input
                                                id="fachadas"
                                                type="number"
                                                min={0}
                                                max={4}
                                                value={inputs.fachadas}
                                                onChange={e => handleChange('fachadas', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="patios">Patios int.</Label>
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

                                    <div className="mt-3">
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
            )}
                
                {/* FIN PESTAÑAS EDIFICIO Y ENVOLVENTE */}
                </>
            )}

                {/* Dividers condicionales para un flujo limpio */}
                {!(inputs.isReforma && demandMode === 'real') && inputs.reformaType !== 'onlyReforma' && <Divider />}

                {/* Instalaciones y Mejoras - COLAPSABLE */}
                {inputs.reformaType !== 'onlyReforma' && !(inputs.isReforma && demandMode === 'real') && (
                <div className={`relative rounded-2xl bg-slate-900/40 border border-slate-800/50 ${inputs.showInstalaciones ? 'z-10 overflow-visible' : 'z-0 overflow-hidden'} transition-all duration-300`}>
                    <button
                        onClick={() => onInputChange(prev => ({ ...prev, showInstalaciones: !prev.showInstalaciones }))}
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
                                {inputs.showInstalaciones ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${inputs.showInstalaciones ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!inputs.showInstalaciones && (() => {
                            const selectedModelData = dbModels.find(m => String(m.id) === String(inputs.aerothermiaModel)) || 
                                                      AEROTHERMIA_MODELS.find(m => m.id === inputs.aerothermiaModel);
                            
                            const selectedAcsModelData = dbModels.find(m => String(m.id) === String(inputs.aerothermiaModelAcs));

                            const newEquipmentLabel = selectedModelData 
                                ? `${selectedModelData.marca} ${selectedModelData.modelo_comercial || selectedModelData.label || ''}`.trim()
                                : null;
                            
                            const newAcsLabel = (inputs.changeAcs && selectedAcsModelData)
                                ? `ACS: ${selectedAcsModelData.marca} ${selectedAcsModelData.modelo_comercial || selectedAcsModelData.label || ''}`.trim()
                                : null;

                            const existingBoilerLabel = BOILER_EFFICIENCIES.find(b => b.id === inputs.boilerId)?.label || 'Caldera no seleccionada';

                            return (
                                <div className="flex flex-wrap gap-2 animate-fade-in">
                                    {!inputs.isReforma && (
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                                            {existingBoilerLabel}
                                        </span>
                                    )}
                                    {newEquipmentLabel && (
                                        <span className="px-2 py-0.5 rounded bg-brand/10 border border-brand/20 text-[11px] text-brand font-black whitespace-nowrap overflow-hidden text-ellipsis max-w-full uppercase">
                                            {newEquipmentLabel}
                                        </span>
                                    )}
                                    {newAcsLabel && (
                                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[11px] text-cyan-400 font-black whitespace-nowrap overflow-hidden text-ellipsis max-w-full uppercase">
                                            {newAcsLabel}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                    </button>

                    {inputs.showInstalaciones && (
                        <div className="p-4 pt-0 border-t border-slate-800/30 animate-scale-in">
                            <div className="pt-4 space-y-4">
                                {/* Calderas y Aerotermia - REJILLA COMPACTA */}
                                {/* LAYOUT MEJORADO - MINIMALISTA Y LIMPIO */}
                                <div className="space-y-6">
                                    {/* Fila 1: Caldera y Emisor */}
                                    {/* Ocultar sistema anterior y de calefacción si es reforma estimada (ya se definen arriba) */}
                                    {!(inputs.isReforma && inputs.reformaType === 'estimated') && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="boilerId" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                    Sistema anterior
                                                </Label>
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
                                                    className="h-12 bg-slate-900/50 border-slate-700/50 focus:border-brand/50 rounded-xl"
                                                >
                                                    {BOILER_EFFICIENCIES.map((b) => (
                                                        <option key={b.id} value={b.id}>
                                                            {b.label} ({(b.value * 100).toFixed(0)}%)
                                                        </option>
                                                    ))}
                                                </Select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="emitterType" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                    Sistema de calefacción
                                                </Label>
                                                <Select
                                                    id="emitterType"
                                                    value={inputs.emitterType || 'radiadores_convencionales'}
                                                    onChange={e => {
                                                        const type = e.target.value;
                                                        const currentModelId = inputs.aerothermiaModel || 'custom';
                                                        let selectedModel = dbModels.find(m => String(m.id) === String(currentModelId));
                                                        if (!selectedModel) selectedModel = AEROTHERMIA_MODELS.find(m => m.id === currentModelId);

                                                        let newScop = 3.2;
                                                        if (type === 'radiadores_baja_temp') newScop = 3.6;
                                                        if (type === 'suelo_radiante') newScop = 4.5;

                                                        if (selectedModel && currentModelId !== 'custom') {
                                                            const temp = type === 'radiadores_convencionales' ? 55 : (type === 'radiadores_baja_temp' ? 45 : 35);
                                                            newScop = getScopFromModel(selectedModel, inputs.zona, temp);
                                                        }

                                                        onInputChange(prev => ({
                                                            ...prev,
                                                            emitterType: type,
                                                            scopHeating: newScop
                                                        }));
                                                    }}
                                                    className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl"
                                                >
                                                    <option value="suelo_radiante">Suelo radiante (35ºC)</option>
                                                    <option value="radiadores_baja_temp">Fancoils o Baja Temperatura (45ºC)</option>
                                                    <option value="radiadores_convencionales">Radiadores convencionales (55ºC)</option>
                                                </Select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Fila 2: Marca y Modelo seleccionada */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-1.5 relative" ref={brandRef}>
                                            <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                Marca nueva
                                            </Label>
                                            <div 
                                                className={`w-full h-12 px-4 bg-slate-900/50 border ${isBrandDropdownOpen ? 'border-brand' : 'border-slate-700/50'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between shadow-sm`}
                                                onClick={() => setIsBrandDropdownOpen(!isBrandDropdownOpen)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {activeBrandLogo && (
                                                        <img src={activeBrandLogo} alt="" className="w-5 h-5 object-contain brightness-110" />
                                                    )}
                                                    <span className={`text-sm font-medium ${selectedMarca ? 'text-white' : 'text-slate-500'}`}>
                                                        {selectedMarca === CUSTOM_MARCA ? '✏️ Otra marca' : (selectedMarca || 'Seleccionar marca...')}
                                                    </span>
                                                </div>
                                                <svg className={`w-4 h-4 text-slate-500 transition-transform ${isBrandDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>

                                            {isBrandDropdownOpen && (
                                                <div className="absolute z-[250] left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="p-3 border-b border-slate-700 bg-slate-800/30">
                                                        <input 
                                                            autoFocus
                                                            type="text" 
                                                            placeholder="Buscar marca..."
                                                            className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand/50 transition-all uppercase"
                                                            value={brandSearchTerm}
                                                            onChange={(e) => setBrandSearchTerm(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </div>

                                                    <div className="max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                                                        {filteredMarcas.map(m => (
                                                            <div
                                                                key={m.nombre}
                                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5 ${selectedMarca === m.nombre ? 'bg-brand/10 text-brand' : 'text-slate-400'}`}
                                                                onClick={() => {
                                                                    setSelectedMarca(m.nombre);
                                                                    onInputChange(prev => ({ ...prev, aerothermiaModel: 'custom' }));
                                                                    setIsBrandDropdownOpen(false);
                                                                    setBrandSearchTerm('');
                                                                }}
                                                            >
                                                                {m.logo && (
                                                                    <img src={m.logo} alt="" className="w-6 h-6 object-contain bg-white/5 rounded p-1" />
                                                                )}
                                                                <span className="text-sm font-bold uppercase tracking-tight">{m.nombre}</span>
                                                            </div>
                                                        ))}
                                                        <div
                                                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5 border-t border-slate-700/50 mt-1 pt-2 ${selectedMarca === CUSTOM_MARCA ? 'bg-brand/10 text-brand' : 'text-slate-400'}`}
                                                            onClick={() => {
                                                                setSelectedMarca(CUSTOM_MARCA);
                                                                onInputChange(prev => ({ ...prev, aerothermiaModel: 'custom', customBrandName: '', customModelName: '' }));
                                                                setIsBrandDropdownOpen(false);
                                                                setBrandSearchTerm('');
                                                                setShowScopPopup(true);
                                                            }}
                                                        >
                                                            <span className="text-sm font-bold uppercase tracking-tight">✏️ Otra marca (introducir manualmente)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label htmlFor="aerothermiaModel" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                {selectedMarca === CUSTOM_MARCA ? 'Marca / Modelo' : 'Modelo seleccionado'}
                                            </Label>
                                            {selectedMarca === CUSTOM_MARCA ? (
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="text"
                                                        placeholder="Marca..."
                                                        value={inputs.customBrandName || ''}
                                                        onChange={e => onInputChange(prev => ({ ...prev, customBrandName: e.target.value }))}
                                                        className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl flex-1 no-uppercase"
                                                    />
                                                    <Input
                                                        type="text"
                                                        placeholder="Modelo..."
                                                        value={inputs.customModelName || ''}
                                                        onChange={e => onInputChange(prev => ({ ...prev, customModelName: e.target.value }))}
                                                        className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl flex-1 no-uppercase"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <Select
                                                        id="aerothermiaModel"
                                                        value={inputs.aerothermiaModel || 'custom'}
                                                        onChange={e => {
                                                            const modelId = e.target.value;
                                                            let selectedModel = dbModels.find(m => String(m.id) === String(modelId));
                                                            if (!selectedModel) selectedModel = AEROTHERMIA_MODELS.find(m => m.id === modelId);

                                                            const currentEmitter = inputs.emitterType || 'radiadores_convencionales';
                                                            let updates = { aerothermiaModel: modelId, customModelName: '' };

                                                            if (selectedModel && modelId !== 'custom') {
                                                                const temp = currentEmitter === 'radiadores_convencionales' ? 55 : (currentEmitter === 'radiadores_baja_temp' ? 45 : 35);
                                                                updates.scopHeating = getScopFromModel(selectedModel, inputs.zona, temp);
                                                                updates.scopAcs = getScopAcsFromModel(selectedModel, inputs.zona);
                                                                updates.potenciaBomba = selectedModel.potencia_calefaccion || selectedModel.potencia_nominal_35 || 0;
                                                                setDirtyScopHeating(false);
                                                                setDirtyScopAcs(false);
                                                                setShowScopPopup(false);
                                                            } else if (modelId === 'custom') {
                                                                setShowScopPopup(true);
                                                            }
                                                            onInputChange(prev => ({ ...prev, ...updates }));
                                                        }}
                                                        className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl"
                                                    >
                                                        <option value="custom">-- Seleccionar modelo --</option>
                                                        <optgroup label={selectedMarca || 'Modelos disponibles'}>
                                                            {dbModels
                                                                .filter(m => m.marca === selectedMarca)
                                                                .map(m => (
                                                                    <option key={m.id} value={m.id}>
                                                                        {m.modelo_comercial} ({m.potencia_calefaccion} kW)
                                                                    </option>
                                                                ))
                                                            }
                                                        </optgroup>
                                                        <option value="custom">✏️ Introducir manualmente</option>
                                                    </Select>
                                                    {inputs.aerothermiaModel === 'custom' && (
                                                        <Input
                                                            type="text"
                                                            placeholder="Nombre del modelo..."
                                                            value={inputs.customModelName || ''}
                                                            onChange={e => onInputChange(prev => ({ ...prev, customModelName: e.target.value }))}
                                                            className="h-10 bg-slate-900/50 border-slate-700/50 rounded-xl no-uppercase text-sm"
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Fila 3: SCOP y Toggles */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pb-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="scopHeating" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                Rendimiento (SCOP)
                                            </Label>
                                            <Input
                                                id="scopHeating"
                                                type="text"
                                                inputMode="decimal"
                                                value={formatDisplay(inputs.scopHeating)}
                                                onChange={e => {
                                                    handleSmartNumberChange('scopHeating', e.target.value);
                                                    setDirtyScopHeating(true);
                                                }}
                                                className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl text-center font-mono text-lg font-bold text-brand"
                                            />
                                        </div>

                                        {/* SCOP Popup — marca personalizada */}
                                        {showScopPopup && (
                                            <div className="md:col-span-3 animate-in fade-in duration-200">
                                                <div className="p-4 bg-brand/5 border border-brand/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">¿Conoces el valor del SCOP?</p>
                                                        <p className="text-xs text-slate-400 mt-0.5">Si no lo conoces aplicaremos SCOP = 4 (valor conservador)</p>
                                                    </div>
                                                    <div className="flex gap-2 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowScopPopup(false)}
                                                            className="px-4 py-2 rounded-lg border border-brand/50 text-brand text-xs font-bold uppercase tracking-wider hover:bg-brand/10 transition-colors"
                                                        >
                                                            Sí, lo introduzco
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onInputChange(prev => ({ ...prev, scopHeating: 4 }));
                                                                setDirtyScopHeating(true);
                                                                setShowScopPopup(false);
                                                            }}
                                                            className="px-4 py-2 rounded-lg bg-brand text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-brand/90 transition-colors"
                                                        >
                                                            No, usar SCOP 4
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="md:col-span-2 flex gap-3 h-12">
                                            <button 
                                                type="button"
                                                onClick={() => handleChange('changeAcs', !inputs.changeAcs)}
                                                className={`flex-1 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border-2 
                                                    ${inputs.changeAcs 
                                                        ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                                                        : 'bg-slate-900/30 border-slate-700/50 text-slate-500 hover:border-slate-600'}`}
                                            >
                                                Incluir ACS
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => handleChange('hibridacion', !inputs.hibridacion)}
                                                className={`flex-1 rounded-xl font-bold text-xs uppercase tracking-widest transition-all border-2 
                                                    ${inputs.hibridacion 
                                                        ? 'bg-brand/10 border-brand text-brand shadow-[0_0_15px_rgba(245,158,11,0.2)]' 
                                                        : 'bg-slate-900/30 border-slate-700/50 text-slate-500 hover:border-slate-600'}`}
                                            >
                                                Hibridación
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                    {inputs.hibridacion && (
                                        <div className="animate-scale-in p-4 bg-brand/5 border border-brand/20 rounded-2xl space-y-4 mb-4 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
                                            <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                            </svg>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                            <div className="min-w-[140px]">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_rgba(255,160,0,0.5)] animate-pulse" />
                                                    <h4 className="text-[10px] font-black text-brand uppercase tracking-widest">Cálculo RES093</h4>
                                                </div>
                                                <Label htmlFor="potenciaBomba" className="text-[9px] text-slate-500 mb-1 font-bold">POTENCIA BdC (kW)</Label>
                                                <Input 
                                                    id="potenciaBomba"
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={formatDisplay(inputs.potenciaBomba)}
                                                    onChange={e => handleSmartNumberChange('potenciaBomba', e.target.value)}
                                                    className="h-9 text-sm bg-slate-950/50 border-brand/30 focus:border-brand font-mono font-bold"
                                                />
                                            </div>

                                            {result?.hybridization && isAdmin && (
                                                <div className="flex-1 w-full grid grid-cols-2 lg:grid-cols-4 gap-4 px-5 py-4 bg-bkg-deep border border-brand/20 rounded-xl shadow-inner-lg">
                                                    <div>
                                                        <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 line-clamp-1">Horas Eq. (th)</p>
                                                        <p className="text-sm font-black text-white">{result.hybridization.th} <span className="text-[8px] text-white/30">h</span></p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 line-clamp-1">P. Diseño</p>
                                                        <p className="text-sm font-black text-white leading-none tabular-nums">{result.hybridization.pDesign.toFixed(2)} <span className="text-[8px] text-white/30">kW</span></p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[7px] font-bold text-slate-400/60 uppercase tracking-widest mb-1.5 line-clamp-1">% Cobertura</p>
                                                        <div className="flex items-end gap-1 leading-none">
                                                            <p className="text-sm font-black text-brand-300 tabular-nums">{(result.hybridization.coverage * 100).toFixed(1)}%</p>
                                                            {result.hybridization.coverage < 0.20 && (
                                                                <span className="text-[7px] text-red-500 font-bold mb-0.5 animate-pulse">MIN 20%</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="relative group/cb">
                                                        <p className="text-[7px] font-bold text-white/30 uppercase tracking-widest mb-1.5 flex items-center gap-1.5 cursor-help">
                                                            Coef. CB
                                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                        </p>
                                                        <p className="text-lg font-black text-brand leading-none tabular-nums">{(result.hybridization.cb * 100).toFixed(2)}%</p>
                                                        
                                                        {/* Tooltip simple para el Coeficiente */}
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-900 border border-slate-700 rounded-lg text-[9px] text-white/60 w-32 opacity-0 group-hover/cb:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
                                                            Interpolado según tabla de bivalencia Anexo III.
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {inputs.changeAcs && (
                                    <div className="mt-8 pt-8 border-t border-slate-800 animate-in fade-in duration-500">
                                        <div className="text-xs font-black text-cyan-500 uppercase tracking-[.25em] mb-6 flex items-center gap-4">
                                            <span className="shrink-0">Configuración ACS</span>
                                            <div className="h-px w-full bg-gradient-to-r from-cyan-500/50 to-transparent" />
                                        </div>
                                        
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-1.5 relative" ref={brandAcsRef}>
                                                    <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                        Marca ACS
                                                    </Label>
                                                    <div 
                                                        className={`w-full h-12 px-4 bg-slate-900/50 border ${isBrandAcsDropdownOpen ? 'border-brand' : 'border-slate-700/50'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between shadow-sm`}
                                                        onClick={() => setIsBrandAcsDropdownOpen(!isBrandAcsDropdownOpen)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {activeBrandAcsLogo && (
                                                                <img src={activeBrandAcsLogo} alt="" className="w-5 h-5 object-contain brightness-110" />
                                                            )}
                                                            <span className={`text-sm font-medium ${selectedMarcaAcs ? 'text-white' : 'text-slate-500'}`}>
                                                                {selectedMarcaAcs === CUSTOM_MARCA ? '✏️ Otra marca' : (selectedMarcaAcs || 'Seleccionar marca...')}
                                                            </span>
                                                        </div>
                                                        <svg className={`w-4 h-4 text-slate-500 transition-transform ${isBrandAcsDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>

                                                    {isBrandAcsDropdownOpen && (
                                                        <div className="absolute z-[250] left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                                                            <div className="p-3 border-b border-slate-700 bg-slate-800/30">
                                                                <input 
                                                                    autoFocus
                                                                    type="text" 
                                                                    placeholder="Buscar marca..."
                                                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 uppercase"
                                                                    value={brandAcsSearchTerm}
                                                                    onChange={(e) => setBrandAcsSearchTerm(e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                                                {filteredMarcasAcs.map(m => (
                                                                    <div
                                                                        key={m.nombre}
                                                                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-white/5 ${selectedMarcaAcs === m.nombre ? 'text-brand' : 'text-slate-400'}`}
                                                                        onClick={() => {
                                                                            setSelectedMarcaAcs(m.nombre);
                                                                            onInputChange(prev => ({ ...prev, aerothermiaModelAcs: 'custom' }));
                                                                            setIsBrandAcsDropdownOpen(false);
                                                                            setBrandAcsSearchTerm('');
                                                                        }}
                                                                    >
                                                                        {m.logo && <img src={m.logo} alt="" className="w-6 h-6 object-contain rounded bg-white/5 p-1" />}
                                                                        <span className="text-sm font-bold uppercase tracking-tight">{m.nombre}</span>
                                                                    </div>
                                                                ))}
                                                                <div
                                                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5 border-t border-slate-700/50 mt-1 pt-2 ${selectedMarcaAcs === CUSTOM_MARCA ? 'bg-brand/10 text-brand' : 'text-slate-400'}`}
                                                                    onClick={() => {
                                                                        setSelectedMarcaAcs(CUSTOM_MARCA);
                                                                        onInputChange(prev => ({ ...prev, aerothermiaModelAcs: 'custom', customBrandAcsName: '', customModelAcsName: '' }));
                                                                        setIsBrandAcsDropdownOpen(false);
                                                                        setBrandAcsSearchTerm('');
                                                                        setShowScopAcsPopup(true);
                                                                    }}
                                                                >
                                                                    <span className="text-sm font-bold uppercase tracking-tight">✏️ Otra marca (introducir manualmente)</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <Label htmlFor="aerothermiaModelAcs" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                        {selectedMarcaAcs === CUSTOM_MARCA ? 'Marca / Modelo ACS' : 'Modelo ACS'}
                                                    </Label>
                                                    {selectedMarcaAcs === CUSTOM_MARCA ? (
                                                        <div className="flex gap-2">
                                                            <Input
                                                                type="text"
                                                                placeholder="Marca..."
                                                                value={inputs.customBrandAcsName || ''}
                                                                onChange={e => onInputChange(prev => ({ ...prev, customBrandAcsName: e.target.value }))}
                                                                className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl flex-1 no-uppercase"
                                                            />
                                                            <Input
                                                                type="text"
                                                                placeholder="Modelo..."
                                                                value={inputs.customModelAcsName || ''}
                                                                onChange={e => onInputChange(prev => ({ ...prev, customModelAcsName: e.target.value }))}
                                                                className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl flex-1 no-uppercase"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <Select
                                                                id="aerothermiaModelAcs"
                                                                value={inputs.aerothermiaModelAcs || 'custom'}
                                                                onChange={e => {
                                                                    const modelId = e.target.value;
                                                                    let selectedModel = dbModels.find(m => String(m.id) === String(modelId));
                                                                    let updates = { aerothermiaModelAcs: modelId, customModelAcsName: '' };
                                                                    if (selectedModel && modelId !== 'custom') {
                                                                        updates.scopAcs = getScopAcsFromModel(selectedModel, inputs.zona);
                                                                        setDirtyScopAcs(false);
                                                                        setShowScopAcsPopup(false);
                                                                    } else if (modelId === 'custom') {
                                                                        setShowScopAcsPopup(true);
                                                                    }
                                                                    onInputChange(prev => ({ ...prev, ...updates }));
                                                                }}
                                                                className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl"
                                                            >
                                                                <option value="custom">-- Seleccionar modelo ACS --</option>
                                                                <optgroup label={selectedMarcaAcs || 'Modelos ACS'}>
                                                                    {dbModels
                                                                        .filter(m => m.marca === selectedMarcaAcs && (m.scop_dhw_medio || m.scop_dhw_calido || m.deposito_acs_incluido || String(m.tipo || '').includes('ACS')))
                                                                        .map(m => (
                                                                            <option key={m.id} value={m.id}>
                                                                                {m.modelo_comercial} {m.modelo_conjunto ? `(${m.modelo_conjunto})` : (typeof m.deposito_acs_incluido === 'number' && m.deposito_acs_incluido > 0 ? `(${m.deposito_acs_incluido}L)` : '')}
                                                                            </option>
                                                                        ))
                                                                    }
                                                                </optgroup>
                                                                <option value="custom">✏️ Introducir manualmente</option>
                                                            </Select>
                                                            {inputs.aerothermiaModelAcs === 'custom' && (
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Nombre del modelo ACS..."
                                                                    value={inputs.customModelAcsName || ''}
                                                                    onChange={e => onInputChange(prev => ({ ...prev, customModelAcsName: e.target.value }))}
                                                                    className="h-10 bg-slate-900/50 border-slate-700/50 rounded-xl no-uppercase text-sm"
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* SCOP ACS Popup — marca personalizada */}
                                            {showScopAcsPopup && (
                                                <div className="animate-in fade-in duration-200">
                                                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-white">¿Conoces el SCOP para ACS?</p>
                                                            <p className="text-xs text-slate-400 mt-0.5">Si no lo conoces aplicaremos SCOP ACS = 4 (valor conservador)</p>
                                                        </div>
                                                        <div className="flex gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowScopAcsPopup(false)}
                                                                className="px-4 py-2 rounded-lg border border-cyan-500/50 text-cyan-400 text-xs font-bold uppercase tracking-wider hover:bg-cyan-500/10 transition-colors"
                                                            >
                                                                Sí, lo introduzco
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    onInputChange(prev => ({ ...prev, scopAcs: 4 }));
                                                                    setDirtyScopAcs(true);
                                                                    setShowScopAcsPopup(false);
                                                                }}
                                                                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-cyan-400 transition-colors"
                                                            >
                                                                No, usar SCOP 4
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="scopAcs" className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                                                        Rendimiento ACS
                                                    </Label>
                                                    <Input
                                                        id="scopAcs"
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={formatDisplay(inputs.scopAcs)}
                                                        onChange={e => {
                                                            handleSmartNumberChange('scopAcs', e.target.value);
                                                            setDirtyScopAcs(true);
                                                        }}
                                                        className="h-12 bg-slate-900/50 border-slate-700/50 rounded-xl text-center font-mono text-lg font-bold text-cyan-400"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
                <Divider />

                {/* Datos Económicos - COLAPSABLE */}
                <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 overflow-hidden transition-all duration-300">
                    <button
                        onClick={() => onInputChange(prev => ({ ...prev, showEconomicData: !prev.showEconomicData }))}
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
                                {inputs.showEconomicData ? (
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cerrar edición</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Modificar datos</span>
                                )}
                                <svg
                                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${inputs.showEconomicData ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {!inputs.showEconomicData && (
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

                    {inputs.showEconomicData && (
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

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div>
                                            <Label htmlFor="presupuesto" className="flex items-center gap-1.5 whitespace-nowrap">
                                                <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                P. Aerotermia (€)
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
                                        {inputs.isReforma && (
                                            <div className="animate-fade-in">
                                                <Label htmlFor="presupuestoEnvolvente" className="flex items-center gap-1.5 whitespace-nowrap">
                                                    <svg className="w-3 h-3 text-cyan-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                    </svg>
                                                    P. Reforma (€)
                                                </Label>
                                                <Input
                                                    id="presupuestoEnvolvente"
                                                    type="text"
                                                    inputMode="decimal"
                                                    min={0}
                                                    value={formatDisplay(inputs.presupuestoEnvolvente)}
                                                    onChange={e => handleSmartNumberChange('presupuestoEnvolvente', e.target.value)}
                                                    className="bg-slate-900/60 border-slate-700/50 focus:border-cyan-500/50"
                                                />
                                            </div>
                                        )}
                                        <div>
                                            <Label htmlFor="numOwners" className="flex items-center gap-1.5">
                                                <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                </svg>
                                                Propietarios
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
                                        {showBrokergy && (
                                            <div className="animate-fade-in col-span-2 md:col-span-1">
                                                <Label htmlFor="caePriceClient" className="flex items-center gap-1.5">
                                                    <svg className="w-3 h-3 text-lime-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                    </svg>
                                                    CAE (€/MWh)
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
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Sección Impacto Fiscal del CAE - SOLO PARTICULARES */}
                                    {(inputs.titularType === 'particular' || !inputs.titularType) && (
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-pink-900/20 to-rose-900/20 border border-pink-500/20 flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-3 group relative">
                                                <h4 className="text-[10px] font-bold text-pink-400 uppercase tracking-wider flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    IRPF del CAE
                                                </h4>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            className="peer sr-only"
                                                            checked={inputs.aplicarIrpfCae !== false}
                                                            onChange={e => handleChange('aplicarIrpfCae', e.target.checked)}
                                                        />
                                                        <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-pink-500"></div>
                                                    </div>
                                                </label>
                                                
                                                {/* Tooltip ganancia patrimonial */}
                                                <div className="absolute top-full left-0 mt-2 p-2 bg-slate-900 border border-slate-700 rounded-lg text-[9px] text-white/70 w-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl hidden lg:block">
                                                    Tributación del ingreso CAE como ganancia patrimonial en IRPF (base del ahorro).
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 relative z-0">
                                                <Label htmlFor="titularType" className="text-[10px] font-bold text-slate-400">Titular:</Label>
                                                <Select
                                                    id="titularType"
                                                    value={inputs.titularType || 'particular'}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        handleChange('titularType', val);
                                                        if(val !== 'particular') {
                                                            handleChange('aplicarIrpfCae', false);
                                                        } else {
                                                            handleChange('aplicarIrpfCae', true);
                                                        }
                                                    }}
                                                    className="bg-slate-900/60 border-pink-500/30 focus:border-pink-500 text-xs h-8 flex-1"
                                                >
                                                    <option value="particular">Particular</option>
                                                    <option value="autonomo">Autónomo</option>
                                                    <option value="empresa">Empresa</option>
                                                </Select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Titular Type Selector - SOLO PARA NO PARTICULARES (Para que no desaparezca el selector principal) */}
                                    {inputs.titularType && inputs.titularType !== 'particular' && (
                                        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 flex flex-col justify-center">
                                            <div className="flex items-center justify-between gap-3">
                                                <Label htmlFor="titularType" className="text-[10px] font-bold text-slate-400">Titular:</Label>
                                                <Select
                                                        id="titularType"
                                                        value={inputs.titularType}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            handleChange('titularType', val);
                                                            if(val !== 'particular') {
                                                                handleChange('aplicarIrpfCae', false);
                                                                handleChange('includeIrpf', false);
                                                            } else {
                                                                handleChange('aplicarIrpfCae', true);
                                                                handleChange('includeIrpf', true);
                                                            }
                                                        }}
                                                        className="bg-slate-900/60 border-slate-700/50 focus:border-brand text-xs h-8 flex-1"
                                                    >
                                                        <option value="particular">Particular</option>
                                                        <option value="autonomo">Autónomo</option>
                                                        <option value="empresa">Empresa</option>
                                                </Select>
                                            </div>
                                        </div>
                                    )}

                                    {/* Sección Deducción IRPF (Rehabilitación) - SOLO PARTICULARES */}
                                    {(inputs.titularType === 'particular' || !inputs.titularType) && (
                                        <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-indigo-500/20 flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Deducción Obra
                                                </h4>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            className="peer sr-only"
                                                            checked={inputs.includeIrpf}
                                                            onChange={e => handleChange('includeIrpf', e.target.checked)}
                                                        />
                                                        <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                                                    </div>
                                                </label>
                                            </div>
                                            <div className="text-[9px] text-slate-500 leading-tight">
                                                Deducción IRPF (hasta 60%) s/ coste elegible rehab. energética.
                                            </div>
                                        </div>
                                    )}

                                    {/* Sección Descuento Certificados */}
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/20 flex flex-col justify-between">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Dto. Certificados
                                            </h4>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        className="peer sr-only"
                                                        checked={inputs.discountCertificates}
                                                        onChange={e => handleChange('discountCertificates', e.target.checked)}
                                                    />
                                                    <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                                                </div>
                                            </label>
                                        </div>
                                        <div className="text-[9px] text-slate-500 leading-tight">
                                            Asumir coste de certificados energéticos.
                                        </div>
                                    </div>
                                </div>
                                
                                {(!inputs.titularType || inputs.titularType === 'particular') && inputs.aplicarIrpfCae !== false && (
                                    <div className="mt-2 text-[10px] text-pink-400/80 italic font-medium px-2 border-l border-pink-500/30">
                                        * El ingreso por CAE puede tributar en IRPF como ganancia patrimonial; este cálculo es estimativo y progresivo por tramos.
                                    </div>
                                )}

                                    {/* Sección Legalización */}
                                    <div className={`p-4 rounded-xl bg-gradient-to-br from-amber-900/10 to-orange-900/10 border border-amber-500/10 transition-all duration-300 ${inputs.includeLegalization ? 'sm:col-span-2' : ''}`}>
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                                    <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                                                </div>
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
                                    <div className={`p-4 rounded-xl bg-gradient-to-br from-emerald-900/20 to-cyan-900/20 border border-emerald-500/20 ${inputs.includeAnnualSavings ? 'sm:col-span-2' : ''}`}>
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                                    <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </div>
                                            </label>
                                        </div>

                                        {inputs.includeAnnualSavings && (
                                            <div className="animate-fade-in space-y-4 mt-4 pt-4 border-t border-emerald-500/10">
                                                {/* Toggle Modo Teórico / Real */}
                                                <div className="flex bg-slate-900/60 p-1 rounded-lg border border-white/5 mb-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleChange('savingsMode', 'theoretical')}
                                                        className={`flex-1 py-1 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${inputs.savingsMode === 'theoretical'
                                                            ? 'bg-emerald-600 text-white shadow-lg'
                                                            : 'text-slate-400 hover:text-white'
                                                            }`}
                                                    >
                                                        Teórico
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleChange('savingsMode', 'real')}
                                                        className={`flex-1 py-1 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${inputs.savingsMode === 'real'
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
                                                        <Label htmlFor="fuelType" className="flex items-center gap-1.5 text-[10px]">
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
                                                            className="bg-slate-900/60 border-slate-700/50 focus:border-emerald-500/50 h-8 text-xs"
                                                        >
                                                            {Object.entries(FUEL_PRICES).map(([key, val]) => (
                                                                <option key={key} value={key}>{val.label}</option>
                                                            ))}
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label htmlFor="fuelPrice" className="flex items-center gap-1.5 text-[10px]">
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
                                                                className={`h-8 text-xs ${isPriceLocked ? 'opacity-60 bg-slate-900/50 cursor-not-allowed border-slate-800' : 'bg-slate-900/60 border-emerald-500/50'}`}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsPriceLocked(!isPriceLocked)}
                                                                className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-800/80 text-[8px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-all border border-white/5"
                                                            >
                                                                {isPriceLocked ? 'Cambiar' : 'Bloquear'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Input Gasto Real (solo visible en modo real) */}
                                                {inputs.savingsMode === 'real' && (
                                                    <div className="animate-fade-in space-y-2">
                                                        <Label htmlFor="gastoAnualReal" className="flex items-center gap-1.5 text-[10px]">
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
                                                            className="bg-slate-900/60 border-slate-700/50 focus:border-amber-500/50 h-8 text-xs"
                                                        />
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

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
                                                                checked={inputs.includeItp}
                                                                onChange={e => handleChange('includeItp', e.target.checked)}
                                                            />
                                                            <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 group-hover:text-orange-400 transition-colors">
                                                            ¿Reducir ITP?
                                                            {inputs.includeItp && (
                                                                <span className="ml-1 text-orange-500 font-mono">({inputs.itpPercent}%)</span>
                                                            )}
                                                        </span>
                                                    </label>
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

                                            {inputs.includeItp && (
                                                <div className="animate-fade-in space-y-2 mb-6 p-4 rounded-xl bg-slate-950/40 border border-orange-500/20">
                                                    <Label htmlFor="private-itp-percent">Porcentaje de ITP (%)</Label>
                                                    <Input
                                                        id="private-itp-percent"
                                                        type="number"
                                                        step="1"
                                                        max="100"
                                                        min="0"
                                                        className="bg-slate-900 border-orange-500/40 text-orange-100 focus:border-orange-500 h-9"
                                                        value={inputs.itpPercent}
                                                        onChange={e => handleChange('itpPercent', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            )}

                                            {inputs.includeCommission && (
                                                <div className="animate-fade-in space-y-6 mb-6 p-4 rounded-xl bg-slate-950/40 border border-orange-500/20">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="private-cae-prescriptor">Comisión Prescriptor (€/MWh)</Label>
                                                        <Input
                                                            id="private-cae-prescriptor"
                                                            type="number"
                                                            className="bg-slate-900 border-orange-500/40 text-orange-100 focus:border-orange-500 h-9"
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
                                                {/* BENEFICIO NETO */}
                                                {!result.financialsRes080 ? (
                                                    <div className="flex justify-between items-center gap-4">
                                                        <span className="text-orange-400/70 text-[10px] font-bold uppercase tracking-wider leading-tight">Beneficio Brokergy Neto</span>
                                                        <span className="text-orange-500 font-mono font-black text-2xl sm:text-3xl whitespace-nowrap drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">
                                                            {formatDisplay(result.financials.profitBrokergy?.toFixed(2))} €
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <span className="text-orange-400/70 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">Beneficio Brokergy Neto</span>
                                                        <div className="flex justify-between items-center gap-4 py-1.5 border-b border-orange-500/10">
                                                            <span className="text-orange-300/40 text-[10px] font-bold uppercase tracking-wider">Aero (RES060)</span>
                                                            <span className="text-orange-500 font-mono font-black text-xl whitespace-nowrap">
                                                                {formatDisplay(result.financials.profitBrokergy?.toFixed(2))} €
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center gap-4 py-1.5">
                                                            <span className="text-cyan-400/60 text-[10px] font-bold uppercase tracking-wider font-black">Reforma (RES080)</span>
                                                            <span className="text-orange-500 font-mono font-black text-xl whitespace-nowrap">
                                                                {formatDisplay(result.financialsRes080.profitBrokergy?.toFixed(2))} €
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* PAGO PRESCRIPTOR */}
                                                {!result.financialsRes080 ? (
                                                    <div className="flex justify-between items-center py-2 border-t border-orange-500/20 mt-1 gap-4">
                                                        <span className="text-orange-300/60 text-[10px] font-bold uppercase tracking-wider">Pago a Prescriptor</span>
                                                        <span className="text-orange-400 font-mono font-bold text-base sm:text-lg whitespace-nowrap">
                                                            {formatDisplay((result.totalPrescriptor || result.financials.totalPrescriptor)?.toFixed(2))} €
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5 pt-2 border-t border-orange-500/20 mt-1">
                                                        <div className="flex justify-between items-center gap-4">
                                                            <span className="text-orange-300/40 text-[9px] font-bold uppercase tracking-wider">Pago Prescr. RES060</span>
                                                            <span className="text-orange-400 font-mono font-bold text-sm whitespace-nowrap">
                                                                {formatDisplay((result.financials.totalPrescriptor)?.toFixed(2))} €
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center gap-4">
                                                            <span className="text-orange-300/40 text-[9px] font-bold uppercase tracking-wider">Pago Prescr. RES080</span>
                                                            <span className="text-orange-400 font-mono font-bold text-sm whitespace-nowrap">
                                                                {formatDisplay((result.financialsRes080.totalPrescriptor)?.toFixed(2))} €
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ITP RETENCIÓN */}
                                                {result.financials.includeItp && (
                                                    <div className="flex justify-between items-center py-2 border-t border-orange-500/20 mt-1 gap-4">
                                                        <span className="text-orange-300/60 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                                            Retención ITP 
                                                            <span className="bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[8px] border border-orange-500/30">
                                                                {result.financials.itpPercent}%
                                                            </span>
                                                        </span>
                                                        <div className="text-right">
                                                            {result.financialsRes080 ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-red-400/60 font-mono font-bold text-[10px] whitespace-nowrap leading-none">- {formatDisplay(result.financials.itpCost?.toFixed(2))} € (060)</span>
                                                                    <span className="text-red-400/90 font-mono font-black text-xs whitespace-nowrap mt-1">- {formatDisplay(result.financialsRes080.itpCost?.toFixed(2))} € (080)</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-red-400/80 font-mono font-bold text-base sm:text-lg whitespace-nowrap">
                                                                    - {formatDisplay(result.financials.itpCost?.toFixed(2))} €
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

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


        {/* PANTALLA CARGA XML (MODAL PREMIUM CENTRADO) */}
        {showXmlModal && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                {/* Backdrop con Blur fuerte */}
                <div 
                    className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-500"
                    onClick={() => setShowXmlModal(false)}
                />
                
                {/* Contenido del Modal Centrado */}
                <div className={`relative bg-[#0F1117] border border-white/10 rounded-[2.5rem] p-10 ${inputs.isReforma ? 'max-w-2xl' : 'max-w-md'} w-full shadow-[0_30px_100px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 slide-in-from-bottom-5 duration-500 ring-1 ring-white/5`}>
                    <div className="flex flex-col items-center text-center mb-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20 mb-6">
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Cargar Certificados CEE</h3>
                        <p className="text-sm text-slate-400 leading-relaxed font-medium">Sube los archivos .xml generados por CE3X para realizar un <span className="text-emerald-400 font-bold">Cálculo Real</span>.</p>
                    </div>
                    
                    <div className={`grid grid-cols-1 ${inputs.isReforma ? 'md:grid-cols-2' : ''} gap-6`}>
                        {/* XML INICIAL */}
                        <div className="flex flex-col">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 text-center">PASO 1: Certificado Inicial</h4>
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`
                                    relative group flex-1 border-2 border-dashed rounded-[2rem] p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden
                                    ${xmlDemandData 
                                        ? 'border-emerald-500/50 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]' 
                                        : (isDragging ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20')}
                                `}
                            >
                                <input
                                    type="file"
                                    accept=".xml"
                                    onChange={(e) => handleXmlFile(e.target.files?.[0])}
                                    className="hidden"
                                    id="xmlUpload"
                                />
                                <label htmlFor="xmlUpload" className="cursor-pointer flex flex-col items-center justify-center h-full">
                                    {xmlDemandData ? (
                                        <div className="animate-in zoom-in duration-300 flex flex-col items-center">
                                            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <span className="text-xs text-emerald-400 font-black uppercase tracking-widest">Inicial Cargado</span>
                                            <span className="text-[10px] text-slate-600 mt-1 font-bold">Pulsa para cambiar</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${isDragging ? 'bg-brand text-black' : 'bg-white/5 text-slate-500 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">{isDragging ? 'Suelta el archivo' : 'XML Inicial'}</span>
                                        </>
                                    )}
                                </label>
                            </div>
                            {xmlError && <p className="text-red-400 text-[10px] mt-2 text-center font-bold px-2">{xmlError}</p>}
                        </div>

                        {/* XML FINAL (Solo si es Reforma) */}
                        {inputs.isReforma && (
                            <div className="flex flex-col">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 text-center">PASO 2: Certificado Final</h4>
                                <div
                                    onDragOver={handleDragOverFinal}
                                    onDragLeave={handleDragLeaveFinal}
                                    onDrop={handleDropFinal}
                                    className={`
                                        relative group flex-1 border-2 border-dashed rounded-[2rem] p-8 text-center transition-all duration-300 cursor-pointer overflow-hidden
                                        ${inputs.xmlDemandDataFinal 
                                            ? 'border-cyan-500/50 bg-cyan-500/[0.03] hover:bg-cyan-500/[0.06]' 
                                            : (isDraggingFinal ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20')}
                                    `}
                                >
                                    <input
                                        type="file"
                                        accept=".xml"
                                        onChange={(e) => handleXmlFileFinal(e.target.files?.[0])}
                                        className="hidden"
                                        id="xmlUploadFinal"
                                    />
                                    <label htmlFor="xmlUploadFinal" className="cursor-pointer flex flex-col items-center justify-center h-full">
                                        {inputs.xmlDemandDataFinal ? (
                                            <div className="animate-in zoom-in duration-300 flex flex-col items-center">
                                                <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-xs text-cyan-400 font-black uppercase tracking-widest">Final Cargado</span>
                                                <span className="text-[10px] text-slate-600 mt-1 font-bold">Pulsa para cambiar</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${isDraggingFinal ? 'bg-brand text-black' : 'bg-white/5 text-slate-500 group-hover:bg-brand/10 group-hover:text-brand'}`}>
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                </div>
                                                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">{isDraggingFinal ? 'Suelta el archivo' : 'XML Final'}</span>
                                            </>
                                        )}
                                    </label>
                                </div>
                                {xmlFinalError && <p className="text-red-400 text-[10px] mt-2 text-center font-bold px-2">{xmlFinalError}</p>}
                            </div>
                        )}
                    </div>

                    <div className="mt-10 flex flex-col gap-4">
                        <button
                            onClick={() => setShowXmlModal(false)}
                            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-black font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl shadow-brand/20 transition-all hover:scale-[1.02] active:scale-95"
                        >
                            Confirmar y Cerrar
                        </button>
                        <button
                            onClick={() => {
                                onXmlDemandDataChange(null);
                                onInputChange(prev => ({ ...prev, xmlDemandDataFinal: null }));
                                setXmlError(null);
                                setXmlFinalError(null);
                            }}
                            className="py-2 text-[10px] font-black text-slate-600 hover:text-red-400 uppercase tracking-widest transition-colors text-center"
                        >
                            Limpiar Archivos
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
