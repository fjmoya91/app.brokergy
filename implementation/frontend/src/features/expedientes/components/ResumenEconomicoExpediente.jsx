import React, { useState, useEffect, useRef } from 'react';

// ─── Umbrales del aviso de margen tras verificación ───────────────────────────
// El ahorro VERIFICADO (verificador, p. ej. Marwen) es un campo manual independiente
// del estimado. Cuando difiere, el margen puede estrecharse más que proporcionalmente:
// los costes fijos (certificados, legalización, comisión) no bajan con el volumen.
const MIN_MARGEN = 500;        // € — margen verificado mínimo aceptable
const MARGEN_DROP_PCT = 15;    // % — caída de margen (estimado → verificado) que avisa
const AHORRO_DELTA_PCT = 10;   // % — variación de ahorro que pide revisar la liquidación

// Movido fuera para evitar que React desmonte el componente en cada renderizado de ResumenEconomicoExpediente
const Metric = ({ label, value, sub, icon, color = 'text-white', tag, proposalValue, proposalDiff, verified, onDoubleClick, isEditingVal, editValue, onEditChange, handleKeyDown, handleSaveLocal, onCancel, inputRef }) => (
    <div
        className={`flex-1 min-w-[200px] p-4 border-r border-white/5 last:border-0 group hover:bg-white/[0.02] transition-colors relative max-md:min-w-0 max-md:p-3 max-md:border-0 max-md:rounded-xl max-md:bg-white/[0.03] ${onDoubleClick && !isEditingVal ? 'cursor-pointer' : ''}`}
        onDoubleClick={isEditingVal ? null : onDoubleClick}
    >
        <div className="flex items-center gap-2 mb-1">
            <span className="text-white/30 group-hover:text-brand/50 transition-colors">{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{label}</span>
            {tag && (
                <span className={`ml-auto text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${tag.tone === 'ok' ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' : 'text-white/30 bg-white/[0.04] border-white/10'}`}>
                    {tag.text}
                </span>
            )}
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
                        onChange={e => onEditChange(e.target.value)}
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
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
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

        {sub && <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter mt-0.5 max-md:hidden">{sub}</div>}

        {/* Línea VERIFICADO: dato manual e independiente del estimado (read-only en
            Ayuda/Ganancia; editable en Volumen). */}
        {verified && (verified.value != null || verified.editable) && (
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/[0.04]" title="Ahorro verificado por el verificador (dato manual). Base del pago real al cliente y del margen.">
                {verified.editable && verified.isEditing ? (
                    <div className="flex items-center gap-1.5 w-full" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                        <span className="text-[8px] font-black uppercase tracking-widest text-amber-400/70">Verificado</span>
                        <input
                            ref={verified.inputRef}
                            type="number"
                            step="1"
                            value={verified.editValue}
                            onChange={e => verified.onChange(e.target.value)}
                            onKeyDown={verified.onKeyDown}
                            className="bg-bkg-elevated border border-amber-400/50 rounded px-1.5 py-0.5 text-xs font-black text-amber-300 w-20 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                        />
                        <span className="text-[8px] font-black text-amber-400/50 uppercase tracking-tighter">kWh</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); verified.onSave(); }} className="p-1 text-amber-400 hover:scale-110 active:scale-95 transition-all" title="Aceptar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); verified.onCancel(); }} className="p-1 text-white/30 hover:text-white transition-all" title="Cancelar">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={verified.editable ? (e) => { e.stopPropagation(); verified.onStart(); } : undefined}
                        className={`flex items-center gap-1.5 group/v ${verified.editable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                        <span className="text-[8px] font-black uppercase tracking-widest text-amber-400/70">Verificado</span>
                        {verified.value != null ? (
                            <span className={`text-[11px] font-bold tracking-tight ${verified.diff ? 'text-amber-300' : 'text-white/55'}`}>{verified.value}</span>
                        ) : (
                            <span className="text-[11px] font-bold text-white/30 italic">añadir…</span>
                        )}
                        {verified.editable && (
                            <svg className="w-3 h-3 text-white/15 group-hover/v:text-amber-400/60 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        )}

        {proposalValue != null && (
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-white/[0.04]" title="Valor que se presentó al cliente en la oportunidad">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/25">Propuesta</span>
                <span className={`text-[11px] font-bold tracking-tight ${proposalDiff ? 'text-amber-400/80' : 'text-white/45'}`}>
                    {proposalValue}
                </span>
                {proposalDiff && (
                    <svg className="w-3 h-3 text-amber-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="Difiere del dato actual del expediente">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                    </svg>
                )}
            </div>
        )}

        {onDoubleClick && !isEditingVal && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-brand/10 text-brand text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-brand/20 backdrop-blur-sm">
                Doble clic para editar
            </div>
        )}
    </div>
);

export function ResumenEconomicoExpediente({ results, proposal, onUpdatePrice, onLivePrice, onUpdateVerified, onLiveVerified }) {
    const [isEditing, setIsEditing] = useState(false);
    // En móvil el panel vive fijo abajo y arranca plegado (tira compacta) para no
    // tapar el formulario; se expande a matriz 2×2 al tocar. En escritorio no aplica.
    const [collapsed, setCollapsed] = useState(true);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);
    // Valor previo al empezar a editar, para poder revertir si se cancela
    // (mientras se edita reflejamos el cambio en vivo en el resto de la app).
    const originalRef = useRef(null);

    // ─── Edición del ahorro VERIFICADO (línea editable de la tarjeta "Volumen CAEs") ──
    const [isEditingVerif, setIsEditingVerif] = useState(false);
    const [editVerif, setEditVerif] = useState('');
    const inputRefVerif = useRef(null);
    const originalRefVerif = useRef(null);

    if (!results) return null;

    const {
        savingsKwh = 0,
        savingsPercent = 0,
        totalAyuda = 0,
        caeBonus = 0,
        caePriceBrokergy = 0,
        profitBrokergy = 0,
        finalPriceClient = 0,
        // ── Verificación de ahorro (campo manual, junto al estimado) ──
        savingsKwhVerificado = null,
        caeBonusVerificado = null,
        profitBrokergyVerificado = null
    } = results;

    // ─── Propuesta original presentada al cliente en la oportunidad ──────────────
    const fmtMwh = (n) => `${((n || 0) / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh`;
    const fmtKwh = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} kWh`;
    const fmtEur = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €`;
    const fmtPrice = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} €/MWh`;
    const prop = proposal || null;

    // ─── Estado de verificación ──────────────────────────────────────────────
    const hasVerified = savingsKwhVerificado != null;
    const verifKwh = savingsKwhVerificado;

    // ─── Aviso de margen (solo cuando hay verificado) ─────────────────────────
    let alerta = null;
    if (hasVerified && profitBrokergyVerificado != null) {
        const dropPct = profitBrokergy > 0 ? ((profitBrokergy - profitBrokergyVerificado) / profitBrokergy) * 100 : 0;
        const ahorroDeltaPct = savingsKwh > 0 ? (Math.abs((verifKwh || 0) - savingsKwh) / savingsKwh) * 100 : 0;
        const belowMin = profitBrokergyVerificado < MIN_MARGEN;
        const bigDrop = dropPct > MARGEN_DROP_PCT;
        const bigDelta = ahorroDeltaPct > AHORRO_DELTA_PCT;
        if (belowMin || bigDrop || bigDelta) {
            alerta = {
                dropPct,
                ahorroDeltaPct,
                belowMin, bigDrop, bigDelta,
                severe: belowMin || profitBrokergyVerificado < 0,
                ahorroSign: (verifKwh || 0) - savingsKwh >= 0 ? '+' : '−'
            };
        }
    }

    // ─── Handlers: precio CAE cliente (edición primaria) ──────────────────────
    const handleDoubleClick = (e) => {
        e.stopPropagation();
        const cur = Math.round(finalPriceClient);
        originalRef.current = cur;
        setEditValue(cur.toString());
        setIsEditing(true);
    };

    const handleLiveChange = (raw) => {
        setEditValue(raw);
        const val = parseFloat(raw);
        if (!isNaN(val) && onLivePrice) onLivePrice(val);
    };

    const handleSaveLocal = () => {
        const val = parseFloat(editValue);
        if (!isNaN(val)) {
            onUpdatePrice(val);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        if (onLivePrice && originalRef.current != null) onLivePrice(originalRef.current);
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSaveLocal(); }
        if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    };

    // ─── Handlers: ahorro verificado (en MWh) ─────────────────────────────────
    const handleVerifStart = () => {
        // El verificador da el dato en kWh (= CAEs). Arranca en el verificado si lo hay;
        // si no, en el estimado vigente (en kWh) para ajustar desde ahí.
        const curKwh = Math.round(hasVerified ? verifKwh : savingsKwh);
        // Para revertir al cancelar: si no había verificado previo, volvemos a null.
        originalRefVerif.current = hasVerified ? curKwh : null;
        setEditVerif(curKwh.toString());
        setIsEditingVerif(true);
    };

    const handleVerifLiveChange = (raw) => {
        setEditVerif(raw);
        const val = parseFloat(raw);
        if (onLiveVerified) onLiveVerified(isNaN(val) ? null : val);
    };

    const handleVerifSave = () => {
        const val = parseFloat(editVerif);
        if (onUpdateVerified) onUpdateVerified(isNaN(val) ? null : val);
        setIsEditingVerif(false);
    };

    const handleVerifCancel = () => {
        if (onLiveVerified) onLiveVerified(originalRefVerif.current);
        setIsEditingVerif(false);
    };

    const handleVerifKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleVerifSave(); }
        if (e.key === 'Escape') { e.preventDefault(); handleVerifCancel(); }
    };

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (isEditingVerif) {
            inputRefVerif.current?.focus();
            inputRefVerif.current?.select();
        }
    }, [isEditingVerif]);

    // Config de la línea "Verificado" (editable solo en Volumen).
    const verifEditProps = {
        isEditing: isEditingVerif,
        editValue: editVerif,
        onChange: handleVerifLiveChange,
        onKeyDown: handleVerifKeyDown,
        onSave: handleVerifSave,
        onCancel: handleVerifCancel,
        onStart: handleVerifStart,
        inputRef: inputRefVerif,
    };

    // Una sola fuente de verdad para las 4 métricas → se reutiliza tanto en la fila
    // de escritorio / matriz 2×2 (móvil expandido) como en la tira compacta (móvil plegado).
    // Los valores PRIMARIOS son siempre el ESTIMADO (dinámico, como hasta ahora).
    const metrics = [
        {
            key: 'volumen',
            label: 'Volumen CAEs',
            value: `${(savingsKwh / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MWh`,
            sub: `${Math.round(savingsKwh).toLocaleString('es-ES')} CAEs (1 kWh = 1 CAE)`,
            proposalValue: prop ? fmtMwh(prop.savingsKwh) : null,
            proposalDiff: prop ? fmtMwh(prop.savingsKwh) !== fmtMwh(savingsKwh) : false,
            tag: hasVerified ? { text: 'Verificado', tone: 'ok' } : { text: 'Pdte. verif.', tone: 'muted' },
            verified: {
                value: hasVerified ? fmtKwh(verifKwh) : null,
                diff: hasVerified ? fmtKwh(verifKwh) !== fmtKwh(savingsKwh) : false,
                editable: true,
                ...verifEditProps,
            },
            color: 'text-green-400',
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
        },
        {
            key: 'ayuda',
            label: 'Ayuda Cliente',
            value: `${Math.round(caeBonus).toLocaleString('es-ES')} €`,
            sub: 'Bono CAE Directo',
            proposalValue: prop ? fmtEur(prop.caeBonus) : null,
            proposalDiff: prop ? fmtEur(prop.caeBonus) !== fmtEur(caeBonus) : false,
            verified: hasVerified ? {
                value: fmtEur(caeBonusVerificado),
                diff: fmtEur(caeBonusVerificado) !== fmtEur(caeBonus),
                editable: false,
            } : null,
            color: 'text-brand',
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
        {
            key: 'precio',
            label: 'Precio CAE',
            value: `${Math.round(finalPriceClient).toLocaleString('es-ES')} €/MWh`,
            sub: 'Precio pagado al cliente',
            proposalValue: prop ? fmtPrice(prop.finalPriceClient) : null,
            proposalDiff: prop ? fmtPrice(prop.finalPriceClient) !== fmtPrice(finalPriceClient) : false,
            color: 'text-white',
            editable: true,
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
            ),
        },
        {
            key: 'ganancia',
            label: 'Ganancia BRKRGY',
            value: `${Math.round(profitBrokergy).toLocaleString('es-ES')} €`,
            sub: 'Margen tras ajuste',
            proposalValue: prop ? fmtEur(prop.profitBrokergy) : null,
            proposalDiff: prop ? fmtEur(prop.profitBrokergy) !== fmtEur(profitBrokergy) : false,
            verified: hasVerified ? {
                value: fmtEur(profitBrokergyVerificado),
                diff: fmtEur(profitBrokergyVerificado) !== fmtEur(profitBrokergy),
                editable: false,
            } : null,
            color: 'text-cyan-400',
            icon: (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
    ];

    // En móvil arranca plegado; si se está editando (precio o verificado) forzamos la vista completa.
    const showFull = !collapsed || isEditing || isEditingVerif;

    const renderMetric = (m) => (
        <Metric
            key={m.key}
            label={m.label}
            value={m.value}
            sub={m.sub}
            icon={m.icon}
            color={m.color}
            tag={m.tag}
            proposalValue={m.proposalValue}
            proposalDiff={m.proposalDiff}
            verified={m.verified}
            {...(m.editable ? {
                onDoubleClick: handleDoubleClick,
                isEditingVal: isEditing,
                editValue,
                onEditChange: handleLiveChange,
                handleKeyDown,
                handleSaveLocal,
                onCancel: handleCancel,
                inputRef,
            } : {})}
        />
    );

    return (
        <div className="bg-bkg-surface border border-white/[0.08] rounded-2xl overflow-hidden mb-6 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 max-md:mb-0 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
            {/* Aviso de margen tras verificación (estimado → verificado). */}
            {alerta && (
                <div className={`flex items-start gap-2.5 px-4 py-2.5 border-b ${alerta.severe ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'} max-md:px-3`}>
                    <svg className={`w-4 h-4 shrink-0 mt-0.5 ${alerta.severe ? 'text-red-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-[11px] font-bold leading-snug">
                        <span className={alerta.severe ? 'text-red-300' : 'text-amber-300'}>
                            {alerta.belowMin
                                ? 'Margen por debajo del mínimo'
                                : alerta.bigDrop
                                    ? 'Caída de margen relevante'
                                    : 'Variación de ahorro relevante'} tras verificación.
                        </span>
                        <span className="text-white/40 ml-1">
                            Margen verificado {fmtEur(profitBrokergyVerificado)} ({alerta.dropPct >= 0 ? '−' : '+'}{Math.abs(Math.round(alerta.dropPct))}% vs estimado) · Ahorro {alerta.ahorroSign}{Math.round(alerta.ahorroDeltaPct)}%. Revisa la liquidación.
                        </span>
                    </div>
                </div>
            )}

            {/* Móvil: control de plegado. Plegado = tira compacta (1 línea); expandido = cabecera "Ocultar". */}
            <div className="md:hidden">
                {showFull ? (
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-white/30 active:text-white/60 transition-colors"
                    >
                        <span className="text-[9px] font-black uppercase tracking-widest">Ocultar resumen</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setCollapsed(false)}
                        className="w-full flex items-center gap-3 px-1 py-2.5 overflow-x-auto scrollbar-hide"
                    >
                        {metrics.map((m) => (
                            <span key={m.key} className="flex items-center gap-1.5 shrink-0">
                                <span className={m.color}>{m.icon}</span>
                                <span className={`text-[11px] font-black tracking-tight whitespace-nowrap ${m.color}`}>{m.value}</span>
                            </span>
                        ))}
                        <svg className="w-4 h-4 ml-auto shrink-0 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Métricas: fila de 4 en escritorio (sin cambios) · matriz 2×2 en móvil expandido. */}
            <div className={`flex-wrap divide-x divide-white/5 max-md:grid-cols-2 max-md:gap-2 max-md:p-2 max-md:pt-0 max-md:divide-x-0 ${showFull ? 'grid md:flex' : 'hidden md:flex'}`}>
                {metrics.map(renderMetric)}
            </div>
        </div>
    );
}
