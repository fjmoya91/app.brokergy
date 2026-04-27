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

export function CatastroSearchBox({ onSearch, onAddressSelect, onManualEntry }) {
    const [searchMode, setSearchMode] = useState('rc'); // 'rc' | 'address'
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Autocomplete states
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

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

                {/* TABS - Refined Glasmorphism */}
                <div className="flex p-1.5 rounded-2xl bg-white/[0.03] border border-white/10 mb-8 max-w-md mx-auto relative">
                    <button
                        onClick={() => { setSearchMode('rc'); setQuery(''); setSuggestions([]); }}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all duration-500 ${searchMode === 'rc'
                            ? 'bg-brand text-bkg-deep shadow-lg shadow-brand/20'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        <span className="whitespace-nowrap">Referencia</span>
                    </button>
                    <button
                        onClick={() => { setSearchMode('address'); setQuery(''); }}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all duration-500 ${searchMode === 'address'
                            ? 'bg-brand text-bkg-deep shadow-lg shadow-brand/20'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="whitespace-nowrap">Dirección</span>
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

                <div className="mt-12 text-center">
                    <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] mb-4">Otras opciones</p>
                    <button
                        onClick={onManualEntry}
                        className="px-6 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[10px] font-black text-white/40 hover:text-white hover:bg-white/[0.05] hover:border-white/10 transition-all uppercase tracking-widest"
                    >
                        Simulación Manual (Sin Catastro)
                    </button>
                </div>
            </div>
        </div>
    );
}
