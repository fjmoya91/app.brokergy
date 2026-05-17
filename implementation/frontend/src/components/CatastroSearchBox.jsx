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

export function CatastroSearchBox({ onSearch, onAddressSelect, onManualEntry, onGeolocate }) {
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

    return (
        <div className="bg-bkg-surface border border-white/[0.06] rounded-[2rem] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-xl" ref={wrapperRef}>
            {/* Background Accents */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-brand/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="relative z-10">
                <div className="text-center mb-10">
                    <h2 className="text-2xl md:text-4xl font-black text-white mb-2 tracking-tight">
                        Consulta Catastral
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.3em] font-black">
                        Acceso a servicios oficiales de catastro
                    </p>
                </div>

                {/* TABS — Referencia · Dirección (iconos compactos) */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5 max-w-2xl mx-auto">
                    <button
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
                        <span className="text-[10px] sm:text-xs leading-none whitespace-nowrap">Referencia catastral</span>
                    </button>
                    <button
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
                        {/* Glow effect on focus */}
                        <div className={`absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-2xl blur opacity-0 transition-opacity duration-500 ${isFocused ? 'opacity-100' : ''}`}></div>

                        <div className="relative flex gap-3">
                            <div className="relative flex-1">
                                <div className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors duration-300 ${isFocused ? 'text-brand' : 'text-white/20'}`}>
                                    {searchMode === 'rc' ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-2xl pl-14 pr-4 py-4 text-white text-lg placeholder:text-white/10 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20 transition-all font-mono tracking-tight"
                                    placeholder={searchMode === 'rc' ? "0000000XX0000X..." : "Busca calle y municipio..."}
                                    autoComplete="off"
                                />
                            </div>

                            <button
                                type="submit"
                                className="px-8 bg-brand hover:bg-brand-500 text-bkg-deep font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-brand/10 transition-all active:scale-[0.98] flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <span>Buscar</span>
                            </button>
                        </div>

                        {/* Autocomplete Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-3 bg-bkg-surface/90 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                                {suggestions.map((suggestion) => (
                                    <button
                                        key={suggestion.place_id}
                                        type="button"
                                        onClick={() => handleSuggestionClick(suggestion)}
                                        className="w-full text-left px-5 py-4 hover:bg-white/[0.03] border-b border-white/[0.03] last:border-0 transition-colors flex items-center gap-4 group"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center text-white/20 group-hover:text-brand transition-colors">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            </svg>
                                        </div>
                                        <span className="text-white/60 text-sm truncate group-hover:text-white transition-colors">{suggestion.description}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </form>

                {/* Botón GPS — siempre visible (sirve tanto para Referencia como Dirección) */}
                {onGeolocate && (
                    <div className="mt-5 max-w-2xl mx-auto">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1 h-px bg-white/10"></div>
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">o</span>
                            <div className="flex-1 h-px bg-white/10"></div>
                        </div>
                        <button
                            type="button"
                            onClick={handleGeolocateClick}
                            disabled={geoLoading}
                            className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border-2 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 font-black text-xs sm:text-sm uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-wait"
                        >
                            {geoLoading ? (
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                                    <circle cx="12" cy="12" r="4" strokeWidth={2.5} />
                                </svg>
                            )}
                            <span>{geoLoading ? 'Localizando…' : 'Usar mi ubicación'}</span>
                        </button>
                    </div>
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
