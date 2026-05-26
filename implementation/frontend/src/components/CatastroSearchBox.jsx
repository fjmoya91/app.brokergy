import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Simple debounce utility
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

export function CatastroSearchBox({ onSearch, onAddressSelect, onManualEntry, onGeolocate, geolocatePrimary = false }) {
    const [searchMode, setSearchMode] = useState('rc'); // 'rc' | 'address'
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);

    // Autocomplete states
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleGeolocateClick = async () => {
        if (!onGeolocate || geoLoading) return;
        setGeoLoading(true);
        try {
            await onGeolocate();
        } finally {
            setGeoLoading(false);
        }
    };

    const debouncedQuery = useDebounce(query, 300);
    const wrapperRef = useRef(null);

    // Close suggestions on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Fetch suggestions when query changes (Debounced)
    useEffect(() => {
        if (searchMode === 'address' && debouncedQuery.length > 2) {
            const fetchSuggestions = async () => {
                try {
                    const res = await axios.get('/api/catastro/autocomplete', {
                        params: { input: debouncedQuery }
                    });
                    setSuggestions(res.data || []);
                    setShowSuggestions(true);
                } catch (err) {
                    console.error("Error fetching suggestions", err);
                    setSuggestions([]);
                }
            };
            fetchSuggestions();
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [debouncedQuery, searchMode]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        if (searchMode === 'rc') {
            onSearch(query);
        } else {
            // Fallback if user hits enter without selecting a suggestion? 
            // Maybe try to search as we used to?
            onSearch(query);
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion.description);
        setShowSuggestions(false);
        if (onAddressSelect) {
            onAddressSelect(suggestion);
        }
    };

    // ─── Bloque búsqueda manual (tabs + input + botón Buscar) ──────────────
    const searchBlock = (
        <>
            {/* TABS — Referencia · Dirección (iconos compactos)
                IMPORTANTE: type="button" para evitar que se interpreten como
                submit del form al estar en un fragment cercano. */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5 max-w-2xl mx-auto">
                <button
                    type="button"
                    onClick={() => { setSearchMode('rc'); setQuery(''); setSuggestions([]); }}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-3 sm:py-4 rounded-xl border-2 font-black uppercase tracking-widest transition-all duration-300 ${
                        searchMode === 'rc'
                            ? 'bg-gradient-to-br from-brand to-brand-500 border-brand text-bkg-deep shadow-lg shadow-brand/20'
                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    {/* Mobile: label corto. Desktop: label completo. Evita desbordamiento en pantallas pequeñas */}
                    <span className="text-[10px] sm:text-xs leading-none sm:hidden">Ref. catastral</span>
                    <span className="text-[10px] sm:text-xs leading-none hidden sm:inline whitespace-nowrap">Referencia catastral</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setSearchMode('address'); setQuery(''); }}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-3 sm:py-4 rounded-xl border-2 font-black uppercase tracking-widest transition-all duration-300 ${
                        searchMode === 'address'
                            ? 'bg-gradient-to-br from-brand to-brand-500 border-brand text-bkg-deep shadow-lg shadow-brand/20'
                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 22V12h6v10" />
                    </svg>
                    <span className="text-[10px] sm:text-xs leading-none">Dirección</span>
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                <div className="relative">
                    <div className={`absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-2xl blur opacity-0 transition-opacity duration-500 ${isFocused ? 'opacity-100' : ''}`}></div>
                    {/* Mobile: input ancho + botón cuadrado solo icono / Desktop: input + botón con texto */}
                    <div className="relative flex gap-2 sm:gap-3">
                        <div className="relative flex-1 min-w-0">
                            <div className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 transition-colors duration-300 ${isFocused ? 'text-brand' : 'text-white/20'}`}>
                                {searchMode === 'rc' ? (
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                    </svg>
                                ) : (
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                )}
                            </div>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-10 sm:pl-14 pr-3 sm:pr-4 py-3.5 sm:py-4 text-white text-sm sm:text-lg placeholder:text-white/10 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20 transition-all font-mono tracking-tight"
                                placeholder={searchMode === 'rc' ? "0000000XX0000X..." : "Busca calle y municipio..."}
                                autoComplete="off"
                            />
                        </div>
                        <button
                            type="submit"
                            aria-label="Buscar"
                            className="flex-shrink-0 w-12 sm:w-auto sm:px-8 bg-brand hover:bg-brand-500 text-bkg-deep font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-brand/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span className="hidden sm:inline">Buscar</span>
                        </button>
                    </div>

                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-bkg-elevated border border-white/10 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.85)] overflow-hidden z-[9999] animate-fade-in">
                            {suggestions.map((suggestion, idx) => (
                                <button
                                    key={suggestion.place_id}
                                    type="button"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="w-full text-left px-4 py-3.5 hover:bg-white/[0.06] border-b border-white/[0.05] last:border-0 transition-colors flex items-center gap-3 group"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center text-brand/40 group-hover:text-brand group-hover:bg-brand/15 transition-colors flex-shrink-0">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        </svg>
                                    </div>
                                    <span className="text-white/70 text-sm truncate group-hover:text-white transition-colors">{suggestion.description}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </form>
        </>
    );

    // ─── Bloque geolocalización (botón GPS) ────────────────────────────────
    const geolocateBlock = onGeolocate && (
        <div className={geolocatePrimary ? "max-w-2xl mx-auto" : "mt-5 max-w-2xl mx-auto"}>
            <button
                type="button"
                onClick={handleGeolocateClick}
                disabled={geoLoading}
                className={
                    geolocatePrimary
                        ? "w-full flex items-center justify-center gap-3 px-5 py-5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 hover:from-emerald-500/30 hover:to-emerald-500/15 border-2 border-emerald-500/50 hover:border-emerald-400 text-emerald-300 hover:text-emerald-200 font-black text-sm sm:text-base uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-emerald-500/10"
                        : "w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border-2 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 font-black text-xs sm:text-sm uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-wait"
                }
            >
                {geoLoading ? (
                    <svg className="w-5 h-5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                ) : (
                    // Chincheta de mapa (location pin) — más reconocible para "ubicación"
                    <svg className={geolocatePrimary ? "w-6 h-6 flex-shrink-0" : "w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0"} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                )}
                <span className="flex flex-col items-center leading-tight">
                    <span>{geoLoading ? 'Localizando…' : 'Usar mi ubicación'}</span>
                    {geolocatePrimary && !geoLoading && (
                        <span className="text-[10px] sm:text-[11px] font-bold normal-case tracking-normal text-emerald-300/70 mt-0.5">
                            (siempre y cuando estés en casa)
                        </span>
                    )}
                </span>
            </button>
        </div>
    );

    // ─── Separador "o" ──────────────────────────────────────────────────────
    const separator = (
        <div className="my-5 max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">o</span>
            <div className="flex-1 h-px bg-white/10"></div>
        </div>
    );

    return (
        <div className="bg-bkg-surface border border-white/[0.06] rounded-[2rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative" ref={wrapperRef}>
            {/* Background Accents — overflow-hidden acotado a esta capa para no cortar el dropdown de sugerencias */}
            <div className="absolute inset-0 overflow-hidden rounded-[2rem] pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px]"></div>
                <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-brand/5 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative">
                <div className="text-center mb-8">
                    <h2 className="text-2xl md:text-4xl font-black text-white mb-2 tracking-tight">
                        {geolocatePrimary ? '¿Dónde está la vivienda?' : 'Consulta Catastral'}
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-black">
                        {geolocatePrimary ? 'Necesitamos identificar tu vivienda en el Catastro' : 'Acceso a servicios oficiales de catastro'}
                    </p>
                </div>

                {/* Orden de bloques según modo:
                    - geolocatePrimary=true  → GPS arriba (CTA principal) + "o" + búsqueda manual abajo
                    - geolocatePrimary=false → Búsqueda manual arriba + GPS al final (comportamiento original) */}
                {geolocatePrimary ? (
                    <>
                        {geolocateBlock}
                        {separator}
                        {searchBlock}
                    </>
                ) : (
                    <>
                        {searchBlock}
                        {geolocateBlock}
                    </>
                )}

                {onManualEntry && (
                    <div className="mt-10 text-center">
                        <button
                            onClick={onManualEntry}
                            className="px-6 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[10px] font-black text-white/40 hover:text-white hover:bg-white/[0.05] hover:border-white/10 transition-all uppercase tracking-widest"
                        >
                            Simulación Manual (Sin Catastro)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
