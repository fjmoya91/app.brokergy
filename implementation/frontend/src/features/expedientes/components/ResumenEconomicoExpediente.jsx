import React, { useState, useEffect, useRef } from 'react';

// Movido fuera para evitar que React desmonte el componente en cada renderizado de ResumenEconomicoExpediente
const Metric = ({ label, value, sub, icon, color = 'text-white', onDoubleClick, isEditingVal, editValue, setEditValue, handleKeyDown, handleSaveLocal, setIsEditing, inputRef }) => (
    <div 
        className={`flex-1 min-w-[200px] p-4 border-r border-white/5 last:border-0 group hover:bg-white/[0.02] transition-colors relative ${onDoubleClick && !isEditingVal ? 'cursor-pointer' : ''}`}
        onDoubleClick={isEditingVal ? null : onDoubleClick}
    >
        <div className="flex items-center gap-2 mb-1">
            <span className="text-white/30 group-hover:text-brand/50 transition-colors">{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
        </div>
        
        {isEditingVal ? (
            <div 
                className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
                onDoubleClick={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
            >
                <div className="relative group/input flex items-center">
                    <input
                        ref={inputRef}
                        type="number"
                        step="1"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="bg-bkg-elevated border border-brand/50 rounded-lg px-2 py-1 text-lg font-black text-brand w-24 focus:outline-none focus:ring-2 focus:ring-brand/20 shadow-xl"
                    />
                    <span className="ml-2 text-[10px] font-black text-brand/50 uppercase tracking-tighter">€/MWh</span>
                </div>
                
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSaveLocal(); }}
                    className="p-1.5 bg-brand text-bkg-deep rounded-lg hover:scale-110 active:scale-95 transition-all shadow-lg shadow-brand/20"
                    title="Aceptar"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}
                    className="p-1.5 bg-white/5 text-white/40 rounded-lg hover:text-white hover:bg-white/10 transition-all"
                    title="Cancelar"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        ) : (
            <div className={`text-lg font-black tracking-tight ${color} flex items-baseline gap-1.5`}>
                {value}
                {onDoubleClick && (
                    <svg className="w-3.5 h-3.5 text-white/10 group-hover:text-brand/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                )}
            </div>
        )}
        
        {sub && <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter mt-0.5">{sub}</div>}
        
        {onDoubleClick && !isEditingVal && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-brand/10 text-brand text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-brand/20 backdrop-blur-sm">
                Doble clic para editar
            </div>
        )}
    </div>
);

export function ResumenEconomicoExpediente({ results, onUpdatePrice }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    if (!results) return null;

    const {
        savingsKwh = 0,
        savingsPercent = 0,
        totalAyuda = 0,
        caeBonus = 0,
        caePriceBrokergy = 0,
        profitBrokergy = 0,
        finalPriceClient = 0
    } = results;

    const handleDoubleClick = (e) => {
        e.stopPropagation();
        setEditValue(Math.round(finalPriceClient).toString()); 
        setIsEditing(true);
    };

    const handleSaveLocal = () => {
        const val = parseFloat(editValue);
        if (!isNaN(val)) {
            onUpdatePrice(val);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveLocal();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
        }
    };

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    return (
        <div className="bg-bkg-surface border border-white/[0.08] rounded-2xl overflow-hidden mb-6 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-wrap divide-x divide-white/5">
                <Metric
                    label="Volumen CAEs"
                    value={`${(savingsKwh / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh`}
                    sub={`${Math.round(savingsKwh).toLocaleString('es-ES')} CAEs (1 kWh = 1 CAE)`}
                    icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    }
                    color="text-green-400"
                />
                <Metric
                    label="Ayuda Cliente"
                    value={`${Math.round(caeBonus).toLocaleString('es-ES')} €`}
                    sub="Bono CAE Directo"
                    icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                    color="text-brand"
                />
                <Metric
                    label="Precio CAE"
                    value={`${Math.round(finalPriceClient).toLocaleString('es-ES')} €/MWh`}
                    sub="Precio pagado al cliente"
                    icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                    }
                    onDoubleClick={handleDoubleClick}
                    isEditingVal={isEditing}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    handleKeyDown={handleKeyDown}
                    handleSaveLocal={handleSaveLocal}
                    setIsEditing={setIsEditing}
                    inputRef={inputRef}
                />
                <Metric
                    label="Ganancia BRKRGY"
                    value={`${Math.round(profitBrokergy).toLocaleString('es-ES')} €`}
                    sub="Margen tras ajuste"
                    icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    }
                    color="text-cyan-400"
                />
            </div>
        </div>
    );
}
