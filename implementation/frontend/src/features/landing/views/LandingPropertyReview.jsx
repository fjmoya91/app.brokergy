/**
 * LandingPropertyReview — pantalla intermedia entre la confirmación del inmueble
 * y el inicio del formulario de aerotermia.
 *
 * Muestra los datos catastrales básicos + tabla de construcciones (con columna
 * de Superficie Útil = construida × 0,8) donde el instalador puede seleccionar
 * qué zonas quiere climatizar.
 *
 * Las fotos (fachada + plano catastral) aparecen al final de la pantalla.
 */

import React, { useState, useEffect } from 'react';

const API_URL = '/api/catastro';

function getTypeTag(type) {
    const u = (type || '').toUpperCase();
    if (u.includes('VIVIENDA'))
        return { icon: '🏠', label: 'Vivienda', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' };
    if (u.includes('APARCAMIENTO') || u.includes('GARAJE'))
        return { icon: '🚗', label: 'Aparcamiento', cls: 'text-blue-300 bg-blue-500/10 border-blue-500/20' };
    if (u.includes('ALMACEN') || u.includes('TRASTERO'))
        return { icon: '📦', label: 'Almacén', cls: 'text-orange-300 bg-orange-500/10 border-orange-500/20' };
    if (u.includes('LOCAL'))
        return { icon: '🏪', label: 'Local', cls: 'text-purple-300 bg-purple-500/10 border-purple-500/20' };
    if (u.includes('PORCHE') || u.includes('PORCH'))
        return { icon: '🏡', label: 'Porche', cls: 'text-white/40 bg-white/[0.04] border-white/10' };
    if (u.includes('TERRAZA'))
        return { icon: '☀️', label: 'Terraza', cls: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20' };
    return { icon: '🏗️', label: type || 'Otro', cls: 'text-white/40 bg-white/[0.04] border-white/10' };
}

function getFloorLabel(floor) {
    const num = parseInt(floor);
    if (isNaN(num)) return floor || '—';
    if (num < 0) return `Sótano ${Math.abs(num)}`;
    if (num === 0) return 'Planta Baja';
    return `Planta ${num}`;
}

function StatCard({ label, value, highlight = false }) {
    return (
        <div className={`p-4 rounded-2xl border ${highlight
            ? 'bg-amber-500/[0.08] border-amber-500/20'
            : 'bg-white/[0.04] border-white/[0.07]'}`}>
            <p className={`text-[10px] uppercase tracking-widest mb-1 font-bold ${highlight ? 'text-amber-400/50' : 'text-white/35'}`}>
                {label}
            </p>
            <p className={`font-black text-xl leading-tight ${highlight ? 'text-amber-400' : 'text-white'}`}>
                {value}
            </p>
        </div>
    );
}

export function LandingPropertyReview({ catastro, onConfirm, onBack }) {
    const [selectedElements, setSelectedElements] = useState([]);
    const [facadeError, setFacadeError] = useState(false);
    const [parcelError, setParcelError] = useState(false);

    const constructions = catastro?.constructions || [];
    const imageUrl  = catastro?.rc ? `${API_URL}/image/${catastro.rc}` : null;
    const parcelUrl = catastro?.rc ? `${API_URL}/parcel-image/${catastro.rc}` : null;

    // Default: seleccionar todas las zonas de tipo VIVIENDA.
    // Si no hay VIVIENDA (p.ej. parcela sin tipo explícito), seleccionar todo.
    useEffect(() => {
        if (constructions.length === 0) return;
        const vivIdx = constructions
            .map((c, i) => (c.type || '').toUpperCase().includes('VIVIENDA') ? i : null)
            .filter(i => i !== null);
        setSelectedElements(vivIdx.length > 0 ? vivIdx : constructions.map((_, i) => i));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catastro?.rc]);

    const toggleElement = (idx) => {
        setSelectedElements(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    // Superficie construida seleccionada (sum)
    const selectedSurface = constructions
        .filter((_, i) => selectedElements.includes(i))
        .reduce((acc, c) => acc + (c.surface || 0), 0);

    // Superficie útil = construida × 0,8
    const selectedUsefulSurface = Math.round(selectedSurface * 0.8);

    const canContinue = constructions.length === 0 || selectedElements.length > 0;

    const handleContinue = () => {
        // Si no hay desglose de construcciones, usar la superficie VIVIENDA del catastro
        const fallbackSurface = catastro?.summaryByType?.VIVIENDA
            || catastro?.summaryByType?.['VIVIENDA']
            || catastro?.totalSurface
            || 120;
        onConfirm({
            selectedConstructions: selectedElements,
            superficieCalefactable: selectedSurface || fallbackSurface,
            superficieUtil: selectedUsefulSurface || Math.round((selectedSurface || fallbackSurface) * 0.8),
        });
    };

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">

            {/* ── Atrás ─────────────────────────────────────────────────────── */}
            <button type="button" onClick={onBack}
                className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-xs uppercase tracking-widest font-bold py-2 mb-6">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Atrás
            </button>

            {/* ── Título ────────────────────────────────────────────────────── */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                    Ficha del <span className="text-amber-400">inmueble</span>
                </h1>
                <p className="text-white/50 text-sm mt-3 max-w-lg mx-auto leading-snug flex items-start justify-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span>{catastro?.address}</span>
                </p>
                {catastro?.rc && (
                    <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                        <span className="text-white/30 text-[10px] uppercase tracking-widest font-bold">RC</span>
                        <code className="text-amber-400 font-mono text-xs font-black">{catastro.rc}</code>
                    </div>
                )}
            </div>

            {/* ── Stats rápidas ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatCard label="Año construcción" value={catastro?.yearBuilt || '—'} />
                <StatCard label="Sup. total"       value={catastro?.totalSurface ? `${catastro.totalSurface} m²` : '—'} />
                <StatCard label="Zona CTE"         value={catastro?.climateInfo?.climateZone || '—'} highlight />
                <StatCard label="Participación"    value={`${(catastro?.participation || '100,00').replace('%', '')}%`} />
            </div>

            {/* ── UTM + Datos climáticos ────────────────────────────────────── */}
            {(catastro?.utm || catastro?.climateInfo) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    {catastro?.utm && (
                        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold mb-3">
                                Coordenadas UTM
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest mb-0.5">X (Este)</p>
                                    <p className="text-white font-mono font-bold text-sm">
                                        {catastro.utm.x ? Math.round(catastro.utm.x) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest mb-0.5">Y (Norte)</p>
                                    <p className="text-white font-mono font-bold text-sm">
                                        {catastro.utm.y ? Math.round(catastro.utm.y) : '—'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {catastro?.climateInfo && (
                        <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/15">
                            <p className="text-amber-400/40 text-[10px] uppercase tracking-widest font-bold mb-3">
                                Datos climáticos
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest mb-0.5">Altitud</p>
                                    <p className="text-amber-400 font-mono font-bold text-sm">
                                        {catastro.climateInfo.altitude} m
                                    </p>
                                </div>
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest mb-0.5">Zona CTE</p>
                                    <p className="text-amber-400 font-black text-2xl leading-none">
                                        {catastro.climateInfo.climateZone}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tabla de zonas a climatizar ───────────────────────────────── */}
            {constructions.length > 0 && (
                <div className="mb-7">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                            🏗️ Zonas a climatizar
                        </h2>
                        <span className="text-white/25 text-[10px]">Toca para seleccionar</span>
                    </div>

                    <div className="rounded-2xl overflow-hidden border border-white/[0.08]">

                        {/* Cabecera de columnas */}
                        <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.07]"
                            style={{ display: 'grid', gridTemplateColumns: '28px 1fr 72px 72px', gap: '0' }}>
                            <div />
                            <div className="text-white/25 text-[9px] uppercase tracking-widest font-bold pl-2">
                                Tipo / Planta
                            </div>
                            <div className="text-white/25 text-[9px] uppercase tracking-widest font-bold text-right pr-3">
                                Constr.
                            </div>
                            <div className="text-amber-400/40 text-[9px] uppercase tracking-widest font-bold text-right">
                                Útil ×0,8
                            </div>
                        </div>

                        {/* Filas */}
                        {constructions.map((c, idx) => {
                            const tag        = getTypeTag(c.type);
                            const isSelected = selectedElements.includes(idx);
                            const usefulSurf = Math.round((c.surface || 0) * 0.8);

                            return (
                                <div
                                    key={idx}
                                    onClick={() => toggleElement(idx)}
                                    className={`px-4 py-3 cursor-pointer transition-all border-b border-white/[0.04] last:border-0
                                        ${isSelected ? 'bg-amber-500/[0.07]' : 'hover:bg-white/[0.02] opacity-50'}`}
                                    style={{ display: 'grid', gridTemplateColumns: '28px 1fr 72px 72px', gap: '0' }}
                                >
                                    {/* Checkbox */}
                                    <div className="flex items-center">
                                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                            isSelected
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'border-white/20 bg-transparent'
                                        }`}>
                                            {isSelected && (
                                                <svg className="w-3 h-3 text-bkg-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>

                                    {/* Tipo + Planta */}
                                    <div className="pl-2 flex flex-col justify-center gap-0.5 min-w-0 overflow-hidden">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold self-start ${tag.cls}`}>
                                            <span>{tag.icon}</span>
                                            <span className="truncate">{tag.label}</span>
                                        </span>
                                        <span className="text-white/30 text-[10px] pl-0.5 truncate">
                                            {getFloorLabel(c.floor)}
                                        </span>
                                    </div>

                                    {/* Superficie construida */}
                                    <div className="flex items-center justify-end pr-3">
                                        <span className={`font-black text-sm tabular-nums ${isSelected ? 'text-white' : 'text-white/30'}`}>
                                            {c.surface}&nbsp;m²
                                        </span>
                                    </div>

                                    {/* Superficie útil */}
                                    <div className="flex items-center justify-end">
                                        <span className={`font-bold text-sm tabular-nums ${isSelected ? 'text-amber-400' : 'text-white/20'}`}>
                                            {usefulSurf}&nbsp;m²
                                        </span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Totales */}
                        {selectedElements.length > 0 && (
                            <div
                                className="px-4 py-3 bg-amber-500/[0.06] border-t border-amber-500/15"
                                style={{ display: 'grid', gridTemplateColumns: '28px 1fr 72px 72px', gap: '0' }}
                            >
                                <div />
                                <div className="pl-2 text-amber-400 text-[11px] font-black uppercase tracking-widest flex items-center">
                                    Total
                                </div>
                                <div className="flex items-center justify-end pr-3">
                                    <span className="text-white font-black text-base tabular-nums">{selectedSurface}&nbsp;m²</span>
                                </div>
                                <div className="flex items-center justify-end">
                                    <span className="text-amber-400 font-black text-base tabular-nums">{selectedUsefulSurface}&nbsp;m²</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <p className="text-white/20 text-[10px] mt-2 text-center">
                        Sup. útil estimada = superficie construida × 0,8
                    </p>
                </div>
            )}

            {/* ── CTA principal ─────────────────────────────────────────────── */}
            <button
                type="button"
                onClick={handleContinue}
                disabled={!canContinue}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3 mb-10"
            >
                Continuar al formulario
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
            </button>

            {/* ── Imágenes (al final) ───────────────────────────────────────── */}
            <div className="mb-8">
                <p className="text-white/25 text-[10px] uppercase tracking-widest font-bold mb-3">
                    Imágenes del inmueble
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    {/* Fachada */}
                    <div className="relative rounded-2xl overflow-hidden border border-white/[0.07]">
                        <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-white/70 uppercase tracking-wider">
                            Fachada
                        </div>
                        {imageUrl && !facadeError ? (
                            <img
                                src={imageUrl}
                                alt="Fachada del inmueble"
                                className="w-full aspect-video object-cover"
                                onError={() => setFacadeError(true)}
                            />
                        ) : (
                            <div className="aspect-video bg-white/[0.03] flex items-center justify-center">
                                <span className="text-white/20 text-sm">Sin imagen de fachada</span>
                            </div>
                        )}
                    </div>

                    {/* Plano catastral */}
                    <div className="relative rounded-2xl overflow-hidden border border-white/[0.07]">
                        <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-white/70 uppercase tracking-wider">
                            Plano Catastral
                        </div>
                        {parcelUrl && !parcelError ? (
                            <img
                                src={parcelUrl}
                                alt="Plano catastral"
                                className="w-full aspect-video object-cover"
                                onError={() => setParcelError(true)}
                            />
                        ) : (
                            <div className="aspect-video bg-white/[0.03] flex items-center justify-center">
                                <span className="text-white/20 text-sm">Sin plano catastral</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
