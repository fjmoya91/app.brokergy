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
        <div className="glass-card p-8 md:p-10" ref={wrapperRef}>
            <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Consulta Catastral
                </h2>

                {/* TABS */}
                <div className="flex w-full p-1.5 rounded-2xl bg-white/5 border border-white/10 mb-2 relative">
                    <button
                        onClick={() => { setSearchMode('rc'); setQuery(''); setSuggestions([]); }}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-sm font-bold transition-all duration-300 ${searchMode === 'rc'
                            ? 'bg-primary-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] scale-[1.02]'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {searchMode === 'rc' && (
                            <div className="absolute inset-0 rounded-xl bg-orange-400/30 blur-md -z-10 animate-pulse"></div>
                        )}
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        <span className="whitespace-nowrap">Referencia Catastral</span>
                    </button>
                    <button
                        onClick={() => { setSearchMode('address'); setQuery(''); }}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-2 px-3 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-sm font-bold transition-all duration-300 ${searchMode === 'address'
                            ? 'bg-primary-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] scale-[1.02]'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {searchMode === 'address' && (
                            <div className="absolute inset-0 rounded-xl bg-orange-400/30 blur-md -z-10 animate-pulse"></div>
                        )}
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="whitespace-nowrap">Dirección</span>
                    </button>
                </div>

                <p className="text-white/50 text-sm mt-4 min-h-[1.25em]">
                    {searchMode === 'rc'
                        ? 'Introduce los 14 o 20 caracteres de la referencia'
                        : 'Busca por calle, número y municipio'
                    }
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative">
                <div className="relative z-20">
                    <div className={`absolute inset-0 rounded-xl bg-gradient-primary opacity-0 blur-xl transition-opacity duration-500 ${isFocused ? 'opacity-30' : ''}`}></div>

                    <div className="relative flex gap-3">
                        <div className="relative flex-1">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">
                                {searchMode === 'rc' ? (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                )}
                            </div>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                className="input-glass !pl-14 pr-4"
                                placeholder={searchMode === 'rc' ? "Ej: 0377706WH7907N..." : "Comienza a escribir la dirección..."}
                                autoComplete="off" // Disable browser default
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn-primary flex items-center gap-2 px-6 whitespace-nowrap"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <span className="hidden sm:inline">Buscar</span>
                        </button>
                    </div>

                    {/* Autocomplete Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-slide-up">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.place_id}
                                    type="button"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="text-white/80 text-sm truncate">{suggestion.description}</span>
                                </button>
                            ))}
                            <div className="bg-[#111] px-2 py-1 flex justify-end">
                                <span className="text-[10px] text-white/20">Google</span>
                            </div>
                        </div>
                    )}
                </div>
            </form>

            <div className="mt-8 pt-6 border-t border-white/5 text-center">
                <button
                    onClick={onManualEntry}
                    className="text-xs font-semibold text-white/30 hover:text-white/60 transition-colors uppercase tracking-widest"
                >
                    Continuar sin referencia (Simulación manual)
                </button>
            </div>
        </div>
    );
}
