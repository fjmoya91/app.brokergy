import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { ClienteFormModal } from '../components/ClienteFormModal';
import { ClienteDetailModal } from '../components/ClienteDetailModal';

function Badge({ children, color = 'default' }) {
    const colors = {
        default: 'bg-white/5 text-white/50 border-white/10',
        brand: 'bg-brand/10 text-brand border-brand/20',
        green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${colors[color]}`}>
            {children}
        </span>
    );
}

export function ClientesView({ 
    onNavigate,
    onLoadOpportunity, 
    initialSelectedId, 
    onClearInitialSelection,
    returnToExpediente,
    onReturnToExpediente
}) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [clienteToDelete, setClienteToDelete] = useState(null);
    const [clienteDetail, setClienteDetail] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/clientes');
            setClientes(res.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching clientes:', err);
            setError('Error al cargar los clientes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientes();
    }, []);

    // Efecto para abrir el detalle automáticamente si viene una selección inicial
    useEffect(() => {
        if (initialSelectedId && clientes.length > 0) {
            const found = clientes.find(c => c.id_cliente === initialSelectedId);
            if (found) {
                setClienteDetail(found);
                onClearInitialSelection?.();
            }
        }
    }, [initialSelectedId, clientes, onClearInitialSelection]);

    const handleDelete = async () => {
        if (!clienteToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`/api/clientes/${clienteToDelete.id_cliente}`);
            setClientes(prev => prev.filter(c => c.id_cliente !== clienteToDelete.id_cliente));
            setClienteToDelete(null);
        } catch (err) {
            console.error('Error eliminando cliente:', err);
            setError('Error al eliminar el cliente.');
        } finally {
            setDeleting(false);
        }
    };

    // Filtrado
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const filtered = clientes.filter(c => {
        if (!searchTerm.trim()) return true;
        const term = norm(searchTerm);
        return (
            norm(c.nombre_razon_social).includes(term) ||
            norm(c.apellidos).includes(term) ||
            norm(c.email).includes(term) ||
            norm(c.dni).includes(term) ||
            (c.tlf || '').includes(term) ||
            norm(c.municipio).includes(term)
        );
    });

    // Paginación
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ── */}
            <div className="px-6 sm:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 relative">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-brand/[0.03] rounded-full blur-[100px] pointer-events-none"></div>
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40">Clientes</h1>
                    <p className="text-[10px] text-brand uppercase tracking-[0.3em] mt-1 font-black">
                        {clientes.length} registro{clientes.length !== 1 ? 's' : ''} registrados
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {returnToExpediente && (
                        <button
                            onClick={onReturnToExpediente}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-amber-500/20 transition-all group"
                        >
                            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 8.959 8.959 0 01-9 9" />
                            </svg>
                            Volver al Expediente
                        </button>
                    )}
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/10 hover:shadow-brand/30 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Nuevo Cliente
                    </button>
                </div>
            </div>

            {/* ── Filtro ── */}
            <div className="px-6 sm:px-10 py-6">
                <div className="relative max-w-xl group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                    <div className="relative flex items-center">
                        <svg className="absolute left-4 w-4 h-4 text-white/20 group-focus-within:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar por nombre, email, DNI..."
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-bkg-surface border border-white/[0.06] rounded-2xl pl-11 pr-4 py-4 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/5 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* ── Contenido ── */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6">
                {loading && (
                    <div className="flex items-center justify-center py-20 text-white/30">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm uppercase tracking-widest font-bold">Cargando...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">
                        {error}
                    </div>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <p className="text-white/30 text-xs uppercase tracking-widest font-bold">
                            {searchTerm ? 'Sin resultados para tu búsqueda' : 'No hay clientes registrados'}
                        </p>
                        {!searchTerm && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="mt-4 px-4 py-2 bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest rounded-lg hover:bg-brand/20 transition-all"
                            >
                                Crear primer cliente
                            </button>
                        )}
                    </div>
                )}

                {!loading && paginated.length > 0 && (
                    <div className="space-y-2">
                        {paginated.map(cliente => (
                            <div
                                key={cliente.id_cliente}
                                onClick={() => setClienteDetail(cliente)}
                                className="bg-bkg-surface border border-white/[0.04] rounded-[1.25rem] p-5 hover:border-brand/40 hover:bg-bkg-elevated transition-all group cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-brand/0 via-brand/20 to-brand/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    {/* Avatar inicial */}
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand/20 to-brand/5 border border-brand/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-brand font-black text-sm">
                                            {(cliente.nombre_razon_social || '?').charAt(0).toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Info principal */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-white font-black text-sm truncate">
                                                {cliente.nombre_razon_social}
                                                {cliente.apellidos && ` ${cliente.apellidos}`}
                                            </span>
                                            {cliente.dni && <Badge>{cliente.dni}</Badge>}
                                            {cliente.prescriptores?.acronimo && (
                                                <Badge color="brand">{cliente.prescriptores.acronimo}</Badge>
                                            )}
                                            {cliente.oportunidades?.length > 0 ? (
                                                <Badge color="green">
                                                    {cliente.oportunidades[0].id_oportunidad} · {cliente.oportunidades[0].referencia_cliente}
                                                </Badge>
                                            ) : (
                                                <Badge>SIN ASIGNAR</Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-white/30">
                                            {cliente.email && <span>{cliente.email}</span>}
                                            {cliente.tlf && <span>{cliente.tlf}</span>}
                                            {(cliente.municipio || cliente.provincia) && (
                                                <span>{[cliente.municipio, cliente.provincia].filter(Boolean).join(', ')}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Fecha */}
                                    <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest flex-shrink-0">
                                        {new Date(cliente.created_at).toLocaleDateString('es-ES')}
                                    </div>

                                    {/* Acciones */}
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setClienteToDelete(cliente); }}
                                            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                                            title="Eliminar cliente"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            ← Anterior
                        </button>
                        <span className="text-xs text-white/30 font-bold uppercase tracking-widest px-3">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>

            {/* Modal ver/editar cliente */}
            <ClienteDetailModal
                isOpen={!!clienteDetail}
                onClose={() => setClienteDetail(null)}
                cliente={clienteDetail}
                onOpenOportunidad={onLoadOpportunity}
                onOpenExpediente={(exp) => onNavigate('expedientes', { expediente_id: exp.id })}
                onUpdated={(updated) => {
                    setClientes(prev => prev.map(c => c.id_cliente === updated.id_cliente ? { ...c, ...updated } : c));
                    setClienteDetail(null);
                }}
            />

            {/* Modal crear cliente */}
            <ClienteFormModal
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                onSuccess={() => {
                    setShowForm(false);
                    fetchClientes();
                }}
            />

            {/* Modal confirmar eliminación */}
            {clienteToDelete && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-white font-black text-center uppercase tracking-widest mb-2">Eliminar Cliente</h3>
                        <p className="text-white/40 text-sm text-center mb-6">
                            ¿Estás seguro de que quieres eliminar a{' '}
                            <strong className="text-white">{clienteToDelete.nombre_razon_social}</strong>?
                            Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setClienteToDelete(null)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white font-bold text-sm transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                                {deleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
