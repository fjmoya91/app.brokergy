import { useState, useMemo, useRef, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Selector de prescriptor / partner con buscador y logo.
//
// Misma superficie en los dos sitios donde se atribuye una oportunidad: al
// guardarla (SaveOpportunityModal) y al crearla desde Nueva simulación
// (Step9_Contacto). Busca por acrónimo Y por razón social a la vez, sin tildes,
// y muestra el logo a la izquierda para reconocerlo de un vistazo.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Coincide si TODAS las palabras escritas aparecen en algún campo del partner:
// así "porrero ism" encuentra "J.PORRERO-HIJOS, S.L. · ISM".
const coincide = (p, consulta) => {
    const palabras = norm(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return true;
    const heno = norm([p.acronimo, p.razon_social, p.cif].filter(Boolean).join(' '));
    return palabras.every(w => heno.includes(w));
};

const Logo = ({ p, size = 'w-8 h-8' }) => (
    p?.logo_empresa ? (
        <img src={p.logo_empresa} alt="" className={`${size} rounded-lg object-contain bg-white/5 shrink-0`} />
    ) : (
        <div className={`${size} rounded-lg bg-white/5 flex items-center justify-center shrink-0`}>
            <span className="text-xs font-black text-white/25">
                {(p?.acronimo || p?.razon_social || '?').charAt(0).toUpperCase()}
            </span>
        </div>
    )
);

/**
 * @param {Array} prescriptores lista completa
 * @param {string|null} value id_empresa seleccionado (null = sin partner)
 * @param {Function} onChange (id_empresa|null) => void
 * @param {string} placeholder texto cuando no hay nada elegido
 * @param {string} sinPartnerLabel etiqueta de la opción vacía; null la oculta
 */
export function PrescriptorPicker({
    prescriptores = [],
    value = null,
    onChange,
    placeholder = '— Selecciona partner —',
    sinPartnerLabel = 'BROKERGY (sin partner)',
    disabled = false,
}) {
    const [abierto, setAbierto] = useState(false);
    const [consulta, setConsulta] = useState('');
    const raiz = useRef(null);

    const seleccionado = useMemo(
        () => prescriptores.find(p => String(p.id_empresa) === String(value)) || null,
        [prescriptores, value]
    );

    const filtrados = useMemo(
        () => prescriptores.filter(p => coincide(p, consulta)),
        [prescriptores, consulta]
    );

    // Cerrar al clicar fuera o al pulsar Escape: es un desplegable, no un modal.
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
        const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', escape);
        };
    }, [abierto]);

    const elegir = (id) => {
        onChange(id);
        setAbierto(false);
        setConsulta('');
    };

    return (
        <div className="relative" ref={raiz}>
            {/* Gatillo */}
            <button
                type="button"
                disabled={disabled}
                onClick={() => setAbierto(v => !v)}
                className={`w-full px-4 py-3 bg-bkg-elevated border rounded-xl text-left transition-all flex items-center justify-between gap-3 min-h-[52px] disabled:opacity-50 ${
                    abierto ? 'border-brand ring-1 ring-brand' : 'border-white/[0.1] hover:border-white/20'
                }`}
            >
                <span className="flex items-center gap-3 min-w-0">
                    {seleccionado ? <Logo p={seleccionado} size="w-6 h-6" /> : (
                        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                    )}
                    <span className={`truncate ${seleccionado ? 'text-white font-bold' : 'text-white/40 italic'}`}>
                        {seleccionado
                            ? (seleccionado.acronimo || seleccionado.razon_social)
                            : (sinPartnerLabel && value === null ? sinPartnerLabel : placeholder)}
                    </span>
                </span>
                <svg className={`w-5 h-5 text-white/30 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {abierto && (
                <div className="absolute z-[210] left-0 right-0 mt-2 bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-3 border-b border-white/[0.05] bg-white/[0.02]">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Buscar por acrónimo o nombre…"
                                className="w-full bg-bkg-deep/50 border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/50 transition-all"
                                value={consulta}
                                onChange={(e) => setConsulta(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                        {sinPartnerLabel && (
                            <button
                                type="button"
                                onClick={() => elegir(null)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-white/[0.05] ${
                                    value === null ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'
                                }`}
                            >
                                <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-black text-brand">B</span>
                                </div>
                                <span className="text-sm font-black text-white/70 uppercase tracking-tight">{sinPartnerLabel}</span>
                            </button>
                        )}

                        {filtrados.map(p => (
                            <button
                                key={p.id_empresa}
                                type="button"
                                onClick={() => elegir(p.id_empresa)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-white/[0.05] ${
                                    String(value) === String(p.id_empresa) ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'
                                }`}
                            >
                                <Logo p={p} />
                                <span className="flex flex-col min-w-0">
                                    <span className="text-sm font-black text-white truncate uppercase tracking-tight">
                                        {p.acronimo || p.razon_social}
                                    </span>
                                    {p.acronimo && p.razon_social && p.acronimo !== p.razon_social && (
                                        <span className="text-[10px] text-white/30 truncate uppercase">{p.razon_social}</span>
                                    )}
                                </span>
                            </button>
                        ))}

                        {filtrados.length === 0 && (
                            <p className="p-8 text-center text-white/20 text-xs italic uppercase tracking-widest">
                                Ningún partner coincide
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default PrescriptorPicker;
