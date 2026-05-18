import React, { useState, useMemo } from 'react';

function formatFloor(floor) {
    if (!floor) return '';
    const f = floor.toString().trim().toUpperCase();
    if (f === '00' || f === 'BJ' || f === 'B' || f === 'PB') return 'Bajo';
    if (f === 'EN' || f === 'E') return 'Entresuelo';
    if (f === 'PR' || f === 'PRL') return 'Principal';
    if (f === 'AT' || f === 'AT.') return 'Ático';
    if (f === 'SS' || f === 'SO') return 'Sótano';
    if (/^-\d+$/.test(f)) return `Sótano ${f.replace('-', '')}`;
    if (/^\d+$/.test(f)) return `${parseInt(f)}ª planta`;
    return f;
}

function formatDwellingLabel(d) {
    const parts = [];
    if (d.block && d.block !== '01' && d.block !== '1') parts.push(`Esc. ${d.block}`);
    const floor = formatFloor(d.floor);
    if (floor) parts.push(floor);
    if (d.door) parts.push(`Puerta ${d.door}`);
    return parts.length > 0 ? parts.join(' · ') : 'Inmueble';
}

function shortUseLabel(use) {
    if (!use) return '';
    const u = use.toLowerCase();
    if (u.includes('almac') || u.includes('estacion')) return 'Garaje/Trastero';
    if (u.includes('comerc')) return 'Comercial';
    if (u.includes('industr')) return 'Industrial';
    if (u.includes('ofic')) return 'Oficinas';
    if (u.includes('cultural')) return 'Cultural';
    if (u.includes('residen') || u.includes('vivien')) return 'Vivienda';
    return use;
}

export function DwellingPicker({ dwellings, selectedRc, onSelect, loading, compact = false }) {
    const [showAll, setShowAll] = useState(false);

    const { residentials, nonResidentials } = useMemo(() => {
        const res = [];
        const non = [];
        (dwellings || []).forEach(d => {
            // isResidential: true → vivienda; false → garaje/trastero confirmado;
            // null/undefined → desconocido, lo tratamos como potencial residencial.
            if (d.isResidential === false) non.push(d);
            else res.push(d);
        });
        return { residentials: res, nonResidentials: non };
    }, [dwellings]);

    const hasResidentials = residentials.length > 0;
    const visible = showAll || !hasResidentials ? [...residentials, ...nonResidentials] : residentials;

    if (!dwellings || dwellings.length === 0 || visible.length === 0) return null;

    return (
        <div className={compact ? 'mt-3' : 'mt-5'}>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <p className="text-white/60 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-bold">
                    Selecciona tu vivienda
                </p>
                <span className="text-white/40 text-[10px] uppercase tracking-wider">
                    {hasResidentials && !showAll
                        ? `${residentials.length} vivienda${residentials.length !== 1 ? 's' : ''}`
                        : `${visible.length} inmuebles`}
                </span>
            </div>

            {!hasResidentials && (
                <p className="text-amber-400/80 text-[11px] mb-2 leading-snug">
                    No se ha podido identificar el uso de los inmuebles. Selecciona el tuyo manualmente.
                </p>
            )}

            <div
                className="rounded-xl bg-black/30 border border-white/5 overflow-y-auto divide-y divide-white/5"
                style={{ maxHeight: compact ? '180px' : '240px' }}
            >
                {visible.map((d) => {
                    const isSelected = d.rc === selectedRc;
                    const useLabel = shortUseLabel(d.use);
                    const isOther = !d.isResidential;

                    return (
                        <button
                            key={d.rc}
                            type="button"
                            onClick={() => !loading && onSelect(d)}
                            disabled={loading}
                            className={`w-full px-3 py-2.5 sm:px-4 sm:py-3 text-left flex items-center gap-3 transition-colors ${
                                isSelected
                                    ? 'bg-brand/15 hover:bg-brand/20'
                                    : 'hover:bg-white/[0.04]'
                            } ${loading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                isSelected ? 'border-brand bg-brand' : 'border-white/20 bg-transparent'
                            }`}>
                                {isSelected && (
                                    <svg className="w-3 h-3 text-bkg-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold truncate ${isSelected ? 'text-brand' : 'text-white/90'}`}>
                                        {formatDwellingLabel(d)}
                                    </span>
                                    {isOther && useLabel && (
                                        <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/40 flex-shrink-0">
                                            {useLabel}
                                        </span>
                                    )}
                                </div>
                                <div className="text-white/40 font-mono text-[10px] truncate mt-0.5">
                                    {d.rc}
                                </div>
                            </div>

                            {d.surface > 0 && (
                                <div className="text-white/60 text-[11px] sm:text-xs font-semibold whitespace-nowrap flex-shrink-0">
                                    {d.surface} m²
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {hasResidentials && nonResidentials.length > 0 && (
                <button
                    type="button"
                    onClick={() => setShowAll(s => !s)}
                    className="mt-2 text-[10px] uppercase tracking-widest font-bold text-white/40 hover:text-brand transition-colors"
                >
                    {showAll
                        ? `← Solo viviendas (${residentials.length})`
                        : `+ Mostrar trasteros y garajes (${nonResidentials.length})`}
                </button>
            )}
        </div>
    );
}
