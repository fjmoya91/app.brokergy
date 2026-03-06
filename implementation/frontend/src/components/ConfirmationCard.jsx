import React, { useState, useEffect } from 'react';
import axios from 'axios';

export function ConfirmationCard({ candidate, onConfirm, onCancel }) {
    const [selected, setSelected] = React.useState(candidate);
    const [loadingDetails, setLoadingDetails] = React.useState(false);
    const [details, setDetails] = React.useState(candidate.fullData || null);

    // Reset when candidate changes
    useEffect(() => {
        setSelected(candidate);
        setDetails(candidate.fullData);
    }, [candidate]);

    // Fetch details when selection changes and we don't have them
    useEffect(() => {
        const fetchDetails = async () => {
            if (selected.fullData) {
                setDetails(selected.fullData);
                return;
            }

            // If it's the original candidate, we might already have data
            if (selected.rc === candidate.rc && candidate.fullData) {
                setDetails(candidate.fullData);
                return;
            }

            setLoadingDetails(true);
            try {
                // Reuse the search endpoint which handles RC lookup
                const res = await axios.get('/api/catastro/search', {
                    params: { q: selected.rc }
                });
                if (res.data.type === 'RC_RESULT') {
                    setDetails(res.data.data);
                    // Update selected with full data to avoid re-fetching
                    setSelected(prev => ({ ...prev, fullData: res.data.data, isResolved: true }));
                }
            } catch (err) {
                console.error("Error fetching details:", err);
            } finally {
                setLoadingDetails(false);
            }
        };

        if (selected.rc) {
            fetchDetails();
        }
    }, [selected.rc, candidate]);

    // Parse current number for highlighting
    const currentNumber = React.useMemo(() => {
        const match = selected?.description?.match(/, (\d+)/);
        return match ? parseInt(match[1]) : null;
    }, [selected]);

    const isOriginal = selected.rc === candidate.rc;

    return (
        <div className="glass-card p-6 border-l-4 border-amber-500 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">Confirma el inmueble</h3>
                    <p className="text-white/50 text-sm">Verifica la imagen y los datos básicos</p>
                </div>
                {!isOriginal && (
                    <button
                        onClick={() => setSelected(candidate)}
                        className="ml-auto text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-full transition-colors"
                    >
                        Volver al original
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Image */}
                <div className="relative group">
                    <div className="aspect-square w-full rounded-xl overflow-hidden border border-white/10 bg-black/40">
                        {selected.imageUrl ? (
                            <img
                                src={selected.imageUrl}
                                alt="Fachada"
                                className="w-full h-full object-contain"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30">
                                <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}
                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
                        <div className="absolute bottom-3 left-3 right-3">
                            <p className="text-white text-sm font-medium truncate drop-shadow-md">
                                {selected.address || selected.description}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Details & Actions */}
                <div className="flex flex-col h-full">
                    <div className="bg-white/5 rounded-xl border border-white/5 p-4 flex-1 mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold tracking-wider text-white/40 uppercase">Datos Catastrales</span>
                            {loadingDetails && <span className="text-xs text-primary-400 animate-pulse">Cargando...</span>}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-white/40 text-xs block mb-1">Referencia Catastral</label>
                                <code className="block bg-black/20 rounded p-2 text-primary-300 font-mono text-sm break-all">
                                    {selected.rc}
                                </code>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div className="text-white/40 text-xs mb-1">Año Construcción</div>
                                    <div className="text-white text-lg font-semibold">
                                        {details?.yearBuilt || '---'}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div className="text-white/40 text-xs mb-1">Superficie Total</div>
                                    <div className="text-white text-lg font-semibold">
                                        {details?.totalSurface ? `${details.totalSurface} m²` : '---'}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div className="text-white/40 text-xs mb-1">Sup. Vivienda</div>
                                    <div className="text-white text-lg font-semibold">
                                        {details?.summaryByType?.['VIVIENDA'] ? `${details.summaryByType['VIVIENDA']} m²` : '---'}
                                    </div>
                                </div>
                                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div className="text-white/40 text-xs mb-1">Nº Plantas</div>
                                    <div className="text-white text-lg font-semibold">
                                        {details?.floors?.total || '1'}
                                    </div>
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                                <div className="text-white/40 text-xs mb-1">Uso Principal</div>
                                <div className="text-white font-medium capitalize">
                                    {details?.use?.toLowerCase() || 'Desconocido'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions Area - Now on the right */}
                    <div className="flex gap-3 mt-auto">
                        <button
                            onClick={onCancel}
                            className="flex-1 btn-secondary text-sm py-3 justify-center"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => onConfirm(selected)}
                            className="flex-[2] btn-primary text-sm py-3 justify-center flex items-center gap-2"
                            disabled={loadingDetails && !selected.fullData}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Confirmar Inmueble
                        </button>
                    </div>
                </div>
            </div>

            {/* Neighborhood Strip */}
            <NeighborhoodStrip
                neighbors={candidate.neighbors}
                currentNumber={currentNumber}
                originalNumber={candidate.description?.match(/, (\d+)/)?.[1] ? parseInt(candidate.description.match(/, (\d+)/)[1]) : -1}
                onSelectNeighbor={(n) => {
                    setSelected({
                        ...n,
                        description: n.address,
                        // Keep other props
                    });
                }}
            />
        </div>
    );
}

function NeighborhoodStrip({ neighbors, currentNumber, originalNumber, onSelectNeighbor }) {
    if (!neighbors || neighbors.length === 0) return null;

    return (
        <div className="mt-6 pt-6 border-t border-white/10">
            <h4 className="text-sm font-semibold text-white/60 mb-4 uppercase tracking-wider">
                Vecinos detectados (Ayuda visual)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {neighbors.map((n, idx) => {
                    const isSelected = n.number === currentNumber;
                    const isOriginal = n.number === originalNumber;

                    return (
                        <button
                            key={idx}
                            onClick={() => onSelectNeighbor(n)}
                            className={`relative flex flex-col items-center gap-2 p-2 rounded-xl border transition-all duration-200 group ${isSelected
                                ? 'bg-primary-500/20 border-primary-500 ring-2 ring-primary-500/50 scale-[1.02]'
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                }`}
                        >
                            {isOriginal && (
                                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]" title="Búsqueda original"></span>
                            )}

                            <div className="w-full aspect-square rounded-lg bg-black/40 overflow-hidden relative">
                                {n.imageUrl ? (
                                    <img src={n.imageUrl} className="w-full h-full object-contain" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">
                                        N/D
                                    </div>
                                )}
                            </div>
                            <div className="text-center w-full px-1">
                                <span className={`text-base font-bold block ${isSelected ? 'text-white' : 'text-white/80'}`}>
                                    Nº {n.number}
                                </span>
                                <span className="text-[10px] font-mono text-white/40 block truncate w-full">
                                    {n.rc || '---'}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
