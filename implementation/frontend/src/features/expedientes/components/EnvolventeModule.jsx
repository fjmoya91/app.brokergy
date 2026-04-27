import React, { useState, useEffect } from 'react';

// ─── Componentes de UI ────────────────────────────────────────────────────────

function SectionHeader({ title, icon, color = 'brand' }) {
    return (
        <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/5">
            <div className={`p-2 rounded-lg bg-${color}/10 text-${color}`}>
                {icon}
            </div>
            <h4 className={`text-sm font-black text-white uppercase tracking-widest`}>{title}</h4>
        </div>
    );
}

function Toggle({ label, value, onChange, readOnly = false }) {
    return (
        <div className="flex items-center justify-between gap-4 py-2">
            <span className="text-xs text-white/50 font-bold uppercase tracking-wider">{label}</span>
            <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5 shadow-inner">
                {[{ v: true, l: 'SÍ' }, { v: false, l: 'NO' }].map(({ v, l }) => (
                    <button
                        key={l}
                        disabled={readOnly}
                        onClick={() => !readOnly && onChange(v)}
                        className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${
                            value === v
                                ? 'bg-brand text-black shadow-lg'
                                : 'text-white/20 hover:text-white/40'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>
        </div>
    );
}

function FieldGroup({ label, children }) {
    return (
        <div className="space-y-1.5 flex flex-col h-full">
            <label className="text-[10px] text-white/30 uppercase font-black tracking-widest ml-1">{label}</label>
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}

function NumberField({ value, onChange, readOnly = false, step = 1, min = 0 }) {
    const handleChange = (e) => {
        const val = e.target.value === '' ? '' : parseFloat(e.target.value);
        onChange(val);
    };

    const adjust = (delta) => {
        if (readOnly) return;
        const current = typeof value === 'number' ? value : 0;
        const next = Math.max(min, current + delta);
        onChange(Number(next.toFixed(4)));
    };

    return (
        <div className="relative flex items-center bg-bkg-elevated border border-white/10 rounded-xl px-2 h-11 group focus-within:border-brand/50 transition-all">
            <button 
                onClick={() => adjust(-step)}
                disabled={readOnly}
                className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-brand disabled:opacity-0 transition-colors"
                type="button"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
            </button>
            <input
                type="number"
                step={step}
                value={value ?? ''}
                onChange={handleChange}
                readOnly={readOnly}
                className="flex-1 bg-transparent text-white text-sm font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button 
                onClick={() => adjust(step)}
                disabled={readOnly}
                className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-brand disabled:opacity-0 transition-colors"
                type="button"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            </button>
        </div>
    );
}

function SelectField({ value, onChange, options, readOnly = false, placeholder = "— Seleccionar —", onAddCustom }) {
    const [isAdding, setIsAdding] = useState(false);
    const [newValue, setNewValue] = useState('');

    if (isAdding) {
        return (
            <div className="relative h-11">
                <input
                    autoFocus
                    type="text"
                    value={newValue}
                    placeholder="Escribe y pulsa Enter..."
                    onChange={e => setNewValue(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newValue.trim()) {
                                onAddCustom?.(newValue.trim());
                                onChange(newValue.trim());
                                setIsAdding(false);
                                setNewValue('');
                            }
                        } else if (e.key === 'Escape') {
                            setIsAdding(false);
                        }
                    }}
                    onBlur={() => {
                        if (!newValue.trim()) setIsAdding(false);
                    }}
                    className="w-full h-full bg-bkg-elevated border border-brand/50 rounded-xl px-4 text-sm font-bold text-white focus:outline-none shadow-[0_0_15px_-3px_rgba(255,160,0,0.3)] animate-in zoom-in duration-200"
                />
                <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                    <button onClick={() => setIsAdding(false)} className="text-white/20 hover:text-red-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-11">
            <select
                value={value ?? ''}
                onChange={e => {
                    if (e.target.value === 'ADD_NEW') {
                        setIsAdding(true);
                    } else {
                        onChange(e.target.value);
                    }
                }}
                disabled={readOnly}
                className={`w-full h-full bg-bkg-elevated border rounded-xl px-4 text-sm font-bold appearance-none transition-all focus:outline-none ${
                    readOnly ? 'border-white/5 text-white/20' : 'border-white/10 text-white focus:border-brand/40 hover:border-white/20'
                }`}
            >
                <option value="" disabled>{placeholder}</option>
                {options.map(o => (
                    <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
                ))}
                {!readOnly && (
                    <option value="ADD_NEW" className="text-brand font-black">+ Añadir nuevo...</option>
                )}
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-white/20">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function EnvolventeModule({ expediente, onSave, onLiveUpdate, saving }) {
    const [local, setLocal] = useState({
        // Ventanas
        sustituye_ventanas: false,
        num_ventanas: 0,
        marco_existente_material: '',
        permeabilidad_existente: 0,
        cristal_existente_composicion: '',
        marco_nuevo_material: '',
        marco_nuevo_marca: '',
        marco_nuevo_modelo: '',
        marco_nuevo_transmitancia: 2.7,
        cristal_nuevo_marca: '',
        cristal_nuevo_modelo: 'Climaguard', // Climaguard / Planitherm
        cristal_nuevo_composicion: '',
        cristal_nuevo_transmitancia: 1.3,
        permeabilidad_nueva: 3,
        cristal_nuevo_factor_solar: 0.43,
        descripcion_ventanas: 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',

        // Cerramientos
        actua_cerramientos: false,
        aislamiento_muros: false,
        aislamiento_muros_tipo: '',
        aislamiento_muros_material: '',
        aislamiento_muros_espesor: 0,
        aislamiento_muros_conductividad: 0,
        aislamiento_cubierta: false,
        aislamiento_cubierta_tipo: '',
        aislamiento_cubierta_material: '',
        aislamiento_cubierta_espesor: 0,
        aislamiento_cubierta_conductividad: 0,
        descripcion_cerramientos: 'No aplica',

        ...(expediente?.documentacion?.envolvente || {})
    });

    const [editMode, setEditMode] = useState(false);

    // Listas base + personalizadas de localStorage
    const [lists, setLists] = useState(() => {
        const saved = localStorage.getItem('brokergy_envolvente_lists');
        const defaults = {
            marcos: ['Aluminio', 'Aluminio RPT', 'PVC', 'Madera', 'Mixto'],
            cristales: ['Guardian', 'Saint-Gobain', 'Climalit'],
            composiciones: ['Vidrio simple', 'Doble vidrio (4/12/4)', 'Doble vidrio (4/16/4)', '4/18/4 BAJO EMISIVO', 'Triple vidrio'],
            marcas_marco: ['Simer', 'Kömmerling', 'Cortizo', 'Schüco', 'Deceuninck'],
            modelos_marco: ['A.61 RPT', 'Premium 76', 'Thermo 8.0']
        };
        if (!saved) return defaults;
        
        try {
            const parsed = JSON.parse(saved);
            return {
                marcos: Array.from(new Set([...defaults.marcos, ...(parsed.marcos || [])])),
                cristales: Array.from(new Set([...defaults.cristales, ...(parsed.cristales || [])])),
                composiciones: Array.from(new Set([...defaults.composiciones, ...(parsed.composiciones || [])])),
                marcas_marco: Array.from(new Set([...defaults.marcas_marco, ...(parsed.marcas_marco || [])])),
                modelos_marco: Array.from(new Set([...defaults.modelos_marco, ...(parsed.modelos_marco || [])])),
            };
        } catch(e) {
            return defaults;
        }
    });

    useEffect(() => {
        localStorage.setItem('brokergy_envolvente_lists', JSON.stringify(lists));
    }, [lists]);

    const addCustomOption = (listKey, value) => {
        setLists(prev => ({
            ...prev,
            [listKey]: Array.from(new Set([...prev[listKey], value]))
        }));
    };

    useEffect(() => {
        if (onLiveUpdate) {
            onLiveUpdate({ ...expediente?.documentacion, envolvente: local });
        }
    }, [local]);

    const handleSave = () => {
        onSave({ documentacion: { ...expediente?.documentacion, envolvente: local } });
        setEditMode(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header / Barra de Acciones */}
            <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] text-white/30 uppercase font-bold tracking-[0.2em]">Configuración técnica de la envolvente térmica</p>
                <div className="flex items-center gap-2">
                    {editMode ? (
                        <>
                            <button 
                                onClick={() => setEditMode(false)}
                                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white/30 hover:text-white/60 transition-all"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all"
                                type="button"
                            >
                                {saving ? 'Guardando...' : 'Confirmar Cambios'}
                            </button>
                        </>
                    ) : (
                        <button 
                            onClick={() => setEditMode(true)}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:border-brand/40 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl"
                            type="button"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            Editar Envolvente
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* SECCIÓN VENTANAS */}
                <div className="bg-bkg-surface border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 bg-brand/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-brand/10 transition-all duration-700" />
                    
                    <SectionHeader 
                        title="Sustitución de Ventanas" 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>}
                    />

                    <div className="space-y-6 relative z-10">
                        <Toggle 
                            label="¿Se sustituyen ventanas?" 
                            value={local.sustituye_ventanas} 
                            onChange={v => setLocal(p => ({ ...p, sustituye_ventanas: v }))} 
                            readOnly={!editMode}
                        />

                        {local.sustituye_ventanas && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-4 duration-300">
                                <FieldGroup label="Nº de ventanas sustituidas">
                                    <NumberField value={local.num_ventanas} onChange={v => setLocal(p => ({ ...p, num_ventanas: v }))} readOnly={!editMode} />
                                </FieldGroup>

                                <FieldGroup label="Material marco existente">
                                    <SelectField value={local.marco_existente_material} onChange={v => setLocal(p => ({ ...p, marco_existente_material: v }))} options={lists.marcos} readOnly={!editMode} onAddCustom={v => addCustomOption('marcos', v)} />
                                </FieldGroup>

                                <FieldGroup label="Permeabilidad existente">
                                    <NumberField value={local.permeabilidad_existente} onChange={v => setLocal(p => ({ ...p, permeabilidad_existente: v }))} readOnly={!editMode} />
                                </FieldGroup>

                                <FieldGroup label="Composición cristal existente">
                                    <SelectField value={local.cristal_existente_composicion} onChange={v => setLocal(p => ({ ...p, cristal_existente_composicion: v }))} options={lists.composiciones} readOnly={!editMode} onAddCustom={v => addCustomOption('composiciones', v)} />
                                </FieldGroup>

                                <div className="col-span-full border-t border-white/5 my-2 pt-4">
                                     <h5 className="text-[10px] font-black text-brand/60 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-brand rounded-full" /> Especificaciones Nuevas
                                     </h5>
                                </div>

                                <FieldGroup label="Material marco nuevo">
                                    <SelectField value={local.marco_nuevo_material} onChange={v => setLocal(p => ({ ...p, marco_nuevo_material: v }))} options={lists.marcos} readOnly={!editMode} onAddCustom={v => addCustomOption('marcos', v)} />
                                </FieldGroup>

                                <FieldGroup label="Marca Marco nuevo">
                                    <SelectField value={local.marco_nuevo_marca} onChange={v => setLocal(p => ({ ...p, marco_nuevo_marca: v }))} options={lists.marcas_marco} readOnly={!editMode} onAddCustom={v => addCustomOption('marcas_marco', v)} />
                                </FieldGroup>

                                <FieldGroup label="Modelo Marco nuevo">
                                    <SelectField value={local.marco_nuevo_modelo} onChange={v => setLocal(p => ({ ...p, marco_nuevo_modelo: v }))} options={lists.modelos_marco} readOnly={!editMode} onAddCustom={v => addCustomOption('modelos_marco', v)} />
                                </FieldGroup>

                                <FieldGroup label="Transmitancia Marco (Uf)">
                                    <NumberField value={local.marco_nuevo_transmitancia} onChange={v => setLocal(p => ({ ...p, marco_nuevo_transmitancia: v }))} readOnly={!editMode} step={0.1} />
                                </FieldGroup>

                                <FieldGroup label="Marca Cristal nuevo">
                                    <SelectField value={local.cristal_nuevo_marca} onChange={v => setLocal(p => ({ ...p, cristal_nuevo_marca: v }))} options={lists.cristales} readOnly={!editMode} onAddCustom={v => addCustomOption('cristales', v)} />
                                </FieldGroup>

                                <FieldGroup label="Modelo Cristal nuevo">
                                    <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5 h-11">
                                        {['Climaguard', 'Planitherm'].map(m => (
                                            <button
                                                key={m}
                                                disabled={!editMode}
                                                onClick={() => setLocal(p => ({ ...p, cristal_nuevo_modelo: m }))}
                                                className={`flex-1 rounded-lg text-[10px] font-black transition-all ${local.cristal_nuevo_modelo === m ? 'bg-brand/20 text-brand' : 'text-white/20'}`}
                                                type="button"
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </FieldGroup>

                                <FieldGroup label="Composición cristal nuevo">
                                    <SelectField value={local.cristal_nuevo_composicion} onChange={v => setLocal(p => ({ ...p, cristal_nuevo_composicion: v }))} options={lists.composiciones} readOnly={!editMode} onAddCustom={v => addCustomOption('composiciones', v)} />
                                </FieldGroup>

                                <FieldGroup label="Transmitancia Cristal (Ug)">
                                    <NumberField value={local.cristal_nuevo_transmitancia} onChange={v => setLocal(p => ({ ...p, cristal_nuevo_transmitancia: v }))} readOnly={!editMode} step={0.1} />
                                </FieldGroup>

                                <FieldGroup label="Permeabilidad nueva">
                                    <NumberField value={local.permeabilidad_nueva} onChange={v => setLocal(p => ({ ...p, permeabilidad_nueva: v }))} readOnly={!editMode} />
                                </FieldGroup>

                                <FieldGroup label="Factor Solar (g)">
                                    <NumberField value={local.cristal_nuevo_factor_solar} onChange={v => setLocal(p => ({ ...p, cristal_nuevo_factor_solar: v }))} readOnly={!editMode} step={0.01} />
                                </FieldGroup>

                                <div className="col-span-full">
                                    <FieldGroup label="Descripción de la actuación">
                                        <textarea 
                                            value={local.descripcion_ventanas}
                                            onChange={e => setLocal(p => ({ ...p, descripcion_ventanas: e.target.value }))}
                                            readOnly={!editMode}
                                            className="w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/40 min-h-[100px] resize-none"
                                        />
                                    </FieldGroup>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* SECCIÓN CERRAMIENTOS */}
                <div className="bg-bkg-surface border border-white/5 rounded-3xl p-6 shadow-2xl relative overflow-hidden group h-fit">
                    <div className="absolute top-0 right-0 p-12 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all duration-700" />
                    
                    <SectionHeader 
                        title="Actuación Cerramientos" 
                        icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                    />

                    <div className="space-y-6 relative z-10">
                        <Toggle 
                            label="¿Se actúa sobre los cerramientos?" 
                            value={local.actua_cerramientos} 
                            onChange={v => setLocal(p => ({ ...p, actua_cerramientos: v }))} 
                            readOnly={!editMode}
                        />

                        {local.actua_cerramientos && (
                            <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
                                
                                {/* AISLAMIENTO MUROS */}
                                <div className="space-y-4 p-5 bg-white/[0.02] rounded-2xl border border-white/5">
                                    <Toggle 
                                        label="¿Aislamiento térmico sobre muros?" 
                                        value={local.aislamiento_muros} 
                                        onChange={v => setLocal(p => ({ ...p, aislamiento_muros: v }))} 
                                        readOnly={!editMode}
                                    />
                                    
                                    {local.aislamiento_muros && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <FieldGroup label="Tipo de aislamiento">
                                                <SelectField value={local.aislamiento_muros_tipo} onChange={v => setLocal(p => ({ ...p, aislamiento_muros_tipo: v }))} options={['SATE (Exterior)', 'Inyectado en cámara', 'Interior Trasdosado']} readOnly={!editMode} onAddCustom={v => addCustomOption('aislamiento_muros_tipo', v)} />
                                            </FieldGroup>
                                            <FieldGroup label="Material aislamiento">
                                                <SelectField value={local.aislamiento_muros_material} onChange={v => setLocal(p => ({ ...p, aislamiento_muros_material: v }))} options={['Lana Mineral', 'EPS Grafitado', 'XPS', 'Poliuretano Proyectado']} readOnly={!editMode} onAddCustom={v => addCustomOption('aislamiento_muros_material', v)} />
                                            </FieldGroup>
                                            <FieldGroup label="Espesor (cm)">
                                                <NumberField value={local.aislamiento_muros_espesor} onChange={v => setLocal(p => ({ ...p, aislamiento_muros_espesor: v }))} readOnly={!editMode} step={0.5} />
                                            </FieldGroup>
                                            <FieldGroup label="Conductividad λ (W/mK)">
                                                <NumberField value={local.aislamiento_muros_conductividad} onChange={v => setLocal(p => ({ ...p, aislamiento_muros_conductividad: v }))} readOnly={!editMode} step={0.0001} />
                                            </FieldGroup>
                                        </div>
                                    )}
                                </div>

                                {/* AISLAMIENTO CUBIERTA */}
                                <div className="space-y-4 p-5 bg-white/[0.02] rounded-2xl border border-white/5">
                                    <Toggle 
                                        label="¿Aislamiento térmico sobre la cubierta?" 
                                        value={local.aislamiento_cubierta} 
                                        onChange={v => setLocal(p => ({ ...p, aislamiento_cubierta: v }))} 
                                        readOnly={!editMode}
                                    />
                                    
                                    {local.aislamiento_cubierta && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <FieldGroup label="Tipo de aislamiento">
                                                <SelectField value={local.aislamiento_cubierta_tipo} onChange={v => setLocal(p => ({ ...p, aislamiento_cubierta_tipo: v }))} options={['Cubierta Invertida', 'Cubierta Inclinada Entrerrastreles', 'Sándwich']} readOnly={!editMode} />
                                            </FieldGroup>
                                            <FieldGroup label="Material aislamiento">
                                                <SelectField value={local.aislamiento_cubierta_material} onChange={v => setLocal(p => ({ ...p, aislamiento_cubierta_material: v }))} options={['Lana Mineral', 'XPS', 'Poliuretano Proyectado']} readOnly={!editMode} />
                                            </FieldGroup>
                                            <FieldGroup label="Espesor (cm)">
                                                <NumberField value={local.aislamiento_cubierta_espesor} onChange={v => setLocal(p => ({ ...p, aislamiento_cubierta_espesor: v }))} readOnly={!editMode} step={0.5} />
                                            </FieldGroup>
                                            <FieldGroup label="Conductividad λ (W/mK)">
                                                <NumberField value={local.aislamiento_cubierta_conductividad} onChange={v => setLocal(p => ({ ...p, aislamiento_cubierta_conductividad: v }))} readOnly={!editMode} step={0.0001} />
                                            </FieldGroup>
                                        </div>
                                    )}
                                </div>

                                <FieldGroup label="Descripción de la actuación">
                                    <textarea 
                                        value={local.descripcion_cerramientos}
                                        onChange={e => setLocal(p => ({ ...p, descripcion_cerramientos: e.target.value }))}
                                        readOnly={!editMode}
                                        className="w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/40 min-h-[100px] resize-none"
                                    />
                                </FieldGroup>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
