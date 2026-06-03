import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function VincularClienteModal({ isOpen, onClose, oportunidad, onSuccess, onCreateNew }) {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [linking, setLinking] = useState(null); // id_cliente en proceso
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) { setSearch(''); setError(null); return; }
        setLoading(true);
        axios.get('/api/clientes')
            .then(r => setClientes(r.data || []))
            .catch(() => setError('No se pudieron cargar los clientes.'))
            .finally(() => setLoading(false));
    }, [isOpen]);

    const filtered = useMemo(() => {
        if (!search.trim()) return clientes;
        const q = normalize(search);
        return clientes.filter(c => {
            const nombre = normalize(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`);
            const dni = normalize(c.dni || '');
            const municipio = normalize(c.municipio || '');
            const email = normalize(c.email || '');
            const tlf = normalize(c.tlf || '');
            return nombre.includes(q) || dni.includes(q) || municipio.includes(q) || email.includes(q) || tlf.includes(q);
        });
    }, [clientes, search]);

    const handleSelect = async (cliente) => {
        setLinking(cliente.id_cliente);
        setError(null);
        try {
            await axios.patch(`/api/oportunidades/${oportunidad.id_oportunidad}/vincular-cliente`, {
                cliente_id: cliente.id_cliente,
            });
            onSuccess(cliente);
        } catch (e) {
            setError(e.response?.data?.error || 'Error al vincular el cliente.');
            setLinking(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-bkg-card border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-base font-black text-white uppercase tracking-widest">Vincular Cliente</h2>
                        {oportunidad && (
                            <p className="text-xs text-white/40 mt-0.5">
                                Oportunidad: <span className="text-brand font-bold">{oportunidad.id_oportunidad}</span>
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-white/[0.06]">
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por nombre, DNI, municipio, email, teléfono..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all"
                    />
                    {!loading && (
                        <p className="text-[10px] text-white/25 mt-1.5 ml-1">
                            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'} encontrados
                        </p>
                    )}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <p className="text-center text-white/40 text-sm py-10">Cargando clientes...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-white/40 text-sm py-10">
                            {search ? 'Sin resultados para esa búsqueda.' : 'No hay clientes registrados.'}
                        </p>
                    ) : (
                        filtered.map(c => (
                            <div
                                key={c.id_cliente}
                                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors group"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-white truncate">
                                        {c.nombre_razon_social}{c.apellidos ? ` ${c.apellidos}` : ''}
                                    </p>
                                    <p className="text-xs text-white/35 truncate mt-0.5">
                                        {[c.dni, c.municipio, c.email].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleSelect(c)}
                                    disabled={!!linking}
                                    className="ml-3 flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-all max-md:opacity-100 opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {linking === c.id_cliente ? '...' : 'Seleccionar'}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/[0.06] space-y-2">
                    {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
                    <button
                        onClick={onCreateNew}
                        className="w-full py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold transition-all"
                    >
                        + Crear nuevo cliente
                    </button>
                </div>
            </div>
        </div>
    );
}
