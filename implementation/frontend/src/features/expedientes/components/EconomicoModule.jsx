import React, { useState, useEffect } from 'react';
import { Input, Label, SectionCard } from '../../calculator/components/UIComponents';

export function EconomicoModule({ expediente, results, onSave, onLiveUpdate, saving }) {
    const op = expediente.oportunidades || {};
    const opInputs = op.datos_calculo?.inputs || {};
    const inst = expediente.instalacion || {};
    const economico = inst.economico_override || {};

    // Estado local para edición fluida
    const [localData, setLocalData] = useState({
        presupuesto: economico.presupuesto ?? (parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
        cae_client_rate: economico.cae_client_rate ?? (parseFloat(opInputs.caePriceClient || opInputs.cae_client_rate) || 95),
        cae_so_rate: economico.cae_so_rate ?? (parseFloat(opInputs.caePriceSO || opInputs.cae_so_rate) || 160),
        include_commission: economico.include_commission ?? false, 
        cae_prescriptor_rate: economico.cae_prescriptor_rate ?? (parseFloat(opInputs.caePricePrescriptor || opInputs.cae_prescriptor_rate) || 0),
        cae_prescriptor_mode: economico.cae_prescriptor_mode ?? opInputs.prescriptorMode ?? 'brokergy',
        discount_certificates: economico.discount_certificates ?? false,
        certificates_cost: economico.certificates_cost ?? (parseFloat(opInputs.certificates_cost) || 250),
        include_legalization: economico.include_legalization ?? false,
        legalization_mode: economico.legalization_mode ?? opInputs.legalization_mode ?? 'client',
        legalization_price: economico.legalization_price ?? (parseFloat(opInputs.legalizationPrice || opInputs.legalization_price) || 200)
    });

    // Sincronizar si cambian los datos base desde el exterior (pero no si estamos editando localmente)
    useEffect(() => {
        // Solo actualizamos si NO hay cambios pendientes o si el expediente persistido cambió (ej: recarga)
        if (JSON.stringify(economico) !== JSON.stringify(inst.economico_override)) {
             setLocalData({
                presupuesto: economico.presupuesto ?? (parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
                cae_client_rate: economico.cae_client_rate ?? (parseFloat(opInputs.caePriceClient || opInputs.cae_client_rate) || 95),
                cae_so_rate: economico.cae_so_rate ?? (parseFloat(opInputs.caePriceSO || opInputs.cae_so_rate) || 160),
                include_commission: economico.include_commission ?? false,
                cae_prescriptor_rate: economico.cae_prescriptor_rate ?? (parseFloat(opInputs.caePricePrescriptor || opInputs.cae_prescriptor_rate) || 0),
                cae_prescriptor_mode: economico.cae_prescriptor_mode ?? opInputs.prescriptorMode ?? 'brokergy',
                discount_certificates: economico.discount_certificates ?? false,
                certificates_cost: economico.certificates_cost ?? (parseFloat(opInputs.certificates_cost) || 250),
                include_legalization: economico.include_legalization ?? false,
                legalization_mode: economico.legalization_mode ?? opInputs.legalization_mode ?? 'client',
                legalization_price: economico.legalization_price ?? (parseFloat(opInputs.legalizationPrice || opInputs.legalization_price) || 200)
            });
        }
    }, [expediente.id]);

    const formatNumber = (num) => (num || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const handleChange = (field, value) => {
        const newData = { ...localData, [field]: value };
        setLocalData(newData);
        // Actualizar el estado LIVE del padre para recalcular resultados en tiempo real
        if (onLiveUpdate) {
            onLiveUpdate({
                ...inst,
                economico_override: newData
            });
        }
    };

    const toggleField = (field) => {
        const newVal = !localData[field];
        const newData = { ...localData, [field]: newVal };
        setLocalData(newData);
        if (onLiveUpdate) {
            onLiveUpdate({
                ...inst,
                economico_override: newData
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bloque 1: Inversión y Precios */}
                <SectionCard title="Inversión y Tasas" icon={<span className="text-lg">💰</span>}>
                    <div className="space-y-4">
                        <div>
                            <Label>Coste Instalación (€)</Label>
                            <Input
                                type="number"
                                value={localData.presupuesto}
                                onChange={e => handleChange('presupuesto', parseFloat(e.target.value) || 0)}
                                className="bg-white/5 border-white/10"
                            />
                            <p className="text-[10px] text-white/20 font-bold italic mt-1 uppercase tracking-tighter">
                                Origen Oportunidad: {formatNumber(parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0)} €
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Precio CAE Cliente (€/MWh)</Label>
                                <Input
                                    type="number"
                                    step={1}
                                    value={localData.cae_client_rate}
                                    onChange={e => handleChange('cae_client_rate', parseFloat(e.target.value) || 0)}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                            <div>
                                <Label>Precio Venta CAE S.O. (€/MWh)</Label>
                                <Input
                                    type="number"
                                    step={1}
                                    value={localData.cae_so_rate}
                                    onChange={e => handleChange('cae_so_rate', parseFloat(e.target.value) || 0)}
                                    className="bg-white/5 border-white/10"
                                />
                            </div>
                        </div>
                    </div>
                </SectionCard>

                {/* Bloque 2: Comisiones y Servicios */}
                <SectionCard title="Servicios y Comisiones" icon={<span className="text-lg">⚙️</span>}>
                    <div className="space-y-5">
                        {/* Toggle Comisión */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">Incluir Comisión</span>
                                <span className="text-[10px] text-white/40 italic">Abono al partner prescriptor</span>
                            </div>
                            <button
                                onClick={() => toggleField('include_commission')}
                                className={`w-10 h-5 rounded-full relative transition-colors ${localData.include_commission ? 'bg-orange-500' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${localData.include_commission ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {localData.include_commission && (
                            <div className="pl-4 border-l-2 border-orange-500/30 space-y-4 animate-fade-in">
                                <div>
                                    <Label>Importe Comisión (€/MWh)</Label>
                                    <Input
                                        type="number"
                                        value={localData.cae_prescriptor_rate}
                                        onChange={e => handleChange('cae_prescriptor_rate', parseFloat(e.target.value) || 0)}
                                        className="h-8 text-xs bg-orange-500/5 border-orange-500/20"
                                    />
                                </div>
                                <div>
                                    <Label className="text-[10px]">Restar comisión de:</Label>
                                    <div className="flex bg-slate-950/80 rounded-lg p-1 border border-white/5">
                                        {['client', 'brokergy', 'both'].map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => handleChange('cae_prescriptor_mode', mode)}
                                                className={`flex-1 py-1 text-[9px] font-bold uppercase rounded ${localData.cae_prescriptor_mode === mode ? 'bg-orange-600 text-white' : 'text-white/40'}`}
                                            >
                                                {mode === 'client' ? 'Cliente' : mode === 'brokergy' ? 'Brokergy' : 'Ambos'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Toggle Descuento Certificados */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">Descuento Certificados</span>
                                <span className="text-[10px] text-white/40 italic">Brokergy asume el coste del CEE</span>
                            </div>
                            <button
                                onClick={() => toggleField('discount_certificates')}
                                className={`w-10 h-5 rounded-full relative transition-colors ${localData.discount_certificates ? 'bg-orange-500' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${localData.discount_certificates ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {localData.discount_certificates && (
                            <div className="pl-4 border-l-2 border-orange-500/30 animate-fade-in">
                                <Label>Coste Certificados (€)</Label>
                                <Input
                                    type="number"
                                    value={localData.certificates_cost}
                                    onChange={e => handleChange('certificates_cost', parseFloat(e.target.value) || 0)}
                                    className="h-8 text-xs bg-orange-500/5 border-orange-500/20"
                                />
                            </div>
                        )}

                        {/* Toggle Legalización */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white uppercase tracking-wider">Tramitar Legalización</span>
                                <span className="text-[10px] text-white/40 italic">Gestión de boletines y trámites</span>
                            </div>
                            <button
                                onClick={() => toggleField('include_legalization')}
                                className={`w-10 h-5 rounded-full relative transition-colors ${localData.include_legalization ? 'bg-orange-500' : 'bg-white/10'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${localData.include_legalization ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {localData.include_legalization && (
                            <div className="pl-4 border-l-2 border-orange-500/30 space-y-4 animate-fade-in">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Importe (€)</Label>
                                        <Input
                                            type="number"
                                            value={localData.legalization_price}
                                            onChange={e => handleChange('legalization_price', parseFloat(e.target.value) || 0)}
                                            className="h-8 text-xs bg-orange-500/5 border-orange-500/20"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end">
                                        <Label className="text-[10px]">Asumido por:</Label>
                                        <div className="flex bg-slate-950/80 rounded-lg p-1 border border-white/5">
                                            {['client', 'brokergy', 'both'].map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => handleChange('legalization_mode', mode)}
                                                    className={`flex-1 py-1 text-[9px] font-bold uppercase rounded ${localData.legalization_mode === mode ? 'bg-orange-600 text-white' : 'text-white/40'}`}
                                                >
                                                    {mode === 'client' ? 'Cli' : mode === 'brokergy' ? 'Brok' : 'Amb'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </SectionCard>
            </div>

            {/* Cabecera de Resumen Rápido (MOVIDA ABAJO) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.05)]">
                    <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest mb-1 block">Beneficio BROKERGY Neto</span>
                    <div className="text-2xl font-black text-orange-500">
                        {formatNumber(results?.profit_neto || results?.profitBrokergy)} €
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                    <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1 block">Comisión Partner</span>
                    <div className="text-2xl font-black text-blue-500 text-right">
                        {formatNumber(results?.totalPrescriptor)} €
                    </div>
                </div>
            </div>
            
            <div className="flex justify-between items-center text-[10px] text-white/20 uppercase tracking-widest font-bold">
                 <p>Modo: Vista previa en tiempo real</p>
                 <p>Status: {results ? 'Calculando...' : 'Pendiente'}</p>
            </div>
        </div>
    );
}
