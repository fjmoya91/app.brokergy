import React from 'react';

/**
 * Desplegable con BUSCADOR y dos renglones por opción (`label` + `sublabel`).
 *
 * Vivía dentro de `InstalacionModule.jsx`. Se sacó aquí al necesitarlo la
 * CALCULADORA para elegir el equipo de aerotermia: con dos copias, el mismo
 * catálogo se leería de una forma en la oportunidad y de otra en el expediente,
 * que es justo lo que hace elegir el modelo equivocado.
 *
 * REGLA — se busca por las DOS líneas. El `sublabel` es donde va la referencia
 * de la placa (`WH-WDG12ME5`), y esa referencia es lo que se tiene delante
 * cuando se busca el equipo: filtrar solo por el nombre comercial dejaría fuera
 * el único dato que distingue dos modelos gemelos.
 */
function norm(s) {
    // Sin tildes, como el resto de buscadores de la app: "kommerling" tiene que
    // encontrar "KÖMMERLING". En un código de placa no cambia nada, y en una
    // marca sí.
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function SearchableSelect({ value, onChange, options, label, placeholder = '— Selecciona —', searchPlaceholder = 'Buscar...', disabled = false, showAvatar = true, dropUp = false, triggerClassName = '', id }) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const containerRef = React.useRef(null);
    const inputRef = React.useRef(null);

    const selected = options.find(o => String(o.value) === String(value));
    const filtered = query
        ? options.filter(o => norm(`${o.label} ${o.sublabel || ''}`).includes(norm(query)))
        : options;

    React.useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    React.useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        if (disabled) return;
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            {label && <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>}
            <button
                type="button"
                id={id}
                onClick={handleOpen}
                disabled={disabled}
                className={`w-full flex items-center justify-between bg-bkg-elevated border rounded-lg px-3 py-2 text-sm outline-none transition-all text-left ${
                    disabled
                        ? 'border-white/5 text-white/60 cursor-not-allowed'
                        : 'border-white/10 text-white cursor-pointer focus:border-brand/50'
                } ${triggerClassName}`}
            >
                {selected ? (
                    <span className="flex items-center gap-2 min-w-0">
                        {showAvatar && (
                            <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5 border border-white/10">
                                {selected.logo
                                    ? <img src={selected.logo} alt="" className="w-full h-full object-contain" />
                                    : <span className="text-[8px] font-black text-white/40">{(selected.acronimo || selected.label || '?').slice(0, 2).toUpperCase()}</span>
                                }
                            </span>
                        )}
                        <span className="flex flex-col min-w-0">
                            <span className="truncate">{selected.label}</span>
                            {selected.sublabel && <span className="text-[11px] text-brand/80 font-mono font-semibold truncate leading-tight">{selected.sublabel}</span>}
                        </span>
                    </span>
                ) : (
                    <span className="text-white/30">{placeholder}</span>
                )}
                <svg className={`w-4 h-4 ml-2 flex-shrink-0 text-white/20 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className={`absolute z-50 w-full bg-bkg-elevated border border-white/10 rounded-xl shadow-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <div className="p-2 border-b border-white/5">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-brand/40"
                        />
                    </div>
                    <ul className="max-h-52 overflow-y-auto">
                        <li
                            onClick={() => handleSelect('')}
                            className="px-3 py-2 text-sm text-white/30 hover:bg-white/5 cursor-pointer"
                        >
                            {placeholder}
                        </li>
                        {filtered.length === 0 && (
                            <li className="px-3 py-2 text-xs text-white/20 italic">Sin resultados</li>
                        )}
                        {filtered.map(o => {
                            const isActive = String(value) === String(o.value);
                            const initials = (o.acronimo || o.label || '?').slice(0, 2).toUpperCase();
                            return (
                                <li
                                    key={o.value}
                                    onClick={() => handleSelect(o.value)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                        isActive ? 'bg-brand/20' : 'hover:bg-white/5'
                                    }`}
                                >
                                    {/* Logo o avatar de iniciales */}
                                    {showAvatar && (
                                        <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5 border border-white/10">
                                            {o.logo
                                                ? <img src={o.logo} alt="" className="w-full h-full object-contain" />
                                                : <span className="text-[9px] font-black text-white/40">{initials}</span>
                                            }
                                        </div>
                                    )}
                                    <span className="flex flex-col min-w-0">
                                        <span className={`text-sm truncate ${isActive ? 'text-brand font-semibold' : 'text-white/70'}`}>
                                            {o.label}
                                        </span>
                                        {o.sublabel && <span className="text-[11px] text-brand/70 font-mono font-semibold truncate leading-tight">{o.sublabel}</span>}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
