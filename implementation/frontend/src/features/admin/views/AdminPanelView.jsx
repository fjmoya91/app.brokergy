import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { PrescriptoresList } from './PrescriptoresList';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';

export function AdminPanelView({ 
    onLoadOpportunity, 
    onBackToCalculator, 
    activeTab,
    returnToExpediente,
    onReturnToExpediente
}) {
    const { user } = useAuth();

    const [oportunidades, setOportunidades] = useState([]);
    const [prescriptores, setPrescriptores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [oportunidadToDelete, setOportunidadToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [assigningPrescriptor, setAssigningPrescriptor] = useState(null);

    // CRM States
    const [updatingStatus, setUpdatingStatus] = useState(null);
    const [historyModalOp, setHistoryModalOp] = useState(null);
    const [deletingHistory, setDeletingHistory] = useState(false);
    const [showHistoryDeleteConfirm, setShowHistoryDeleteConfirm] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [addingComment, setAddingComment] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [showStats, setShowStats] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('all'); // 'all', 'notes' o 'status'
    
    // Estados para edición de notas
    const [editingEntryId, setEditingEntryId] = useState(null);
    const [editingText, setEditingText] = useState('');
    const [updatingEntry, setUpdatingEntry] = useState(false);
    const [viewMode, setViewMode] = useState(user?.rol?.toUpperCase() === 'ADMIN' ? 'brokergy' : 'prescriptor');
    const [clienteModalOp, setClienteModalOp] = useState(null); // oportunidad para crear cliente
    const [clienteDetailId, setClienteDetailId] = useState(null); // cliente_id para ver detalle
    const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null); // { op, nuevoEstado }

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10); // Default to 10
    const [showAll, setShowAll] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState(null); // 'filter' or opportunity id
    const [partnerSearch, setPartnerSearch] = useState('');
    const [globalSearch, setGlobalSearch] = useState('');

    // Cerrar dropdown al hacer click fuera
    useEffect(() => {
        const handleClickOutside = () => {
            if (openDropdownId) setOpenDropdownId(null);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [openDropdownId]);

    const CCAA_MAP = {
        '01': 'País Vasco', '20': 'País Vasco', '48': 'País Vasco',
        '02': 'Castilla-La Mancha', '13': 'Castilla-La Mancha', '16': 'Castilla-La Mancha', '19': 'Castilla-La Mancha', '45': 'Castilla-La Mancha',
        '03': 'C. Valenciana', '12': 'C. Valenciana', '46': 'C. Valenciana',
        '04': 'Andalucía', '11': 'Andalucía', '14': 'Andalucía', '18': 'Andalucía', '21': 'Andalucía', '23': 'Andalucía', '29': 'Andalucía', '41': 'Andalucía',
        '05': 'Castilla y León', '09': 'Castilla y León', '24': 'Castilla y León', '34': 'Castilla y León', '37': 'Castilla y León', '40': 'Castilla y León', '42': 'Castilla y León', '47': 'Castilla y León', '49': 'Castilla y León',
        '06': 'Extremadura', '10': 'Extremadura',
        '07': 'I. Baleares',
        '08': 'Cataluña', '17': 'Cataluña', '25': 'Cataluña', '43': 'Cataluña',
        '15': 'Galicia', '27': 'Galicia', '32': 'Galicia', '36': 'Galicia',
        '22': 'Aragón', '44': 'Aragón', '50': 'Aragón',
        '26': 'La Rioja',
        '28': 'Madrid',
        '30': 'Murcia',
        '31': 'Navarra',
        '33': 'Asturias',
        '35': 'Canarias', '38': 'Canarias',
        '39': 'Cantabria',
        '51': 'Ceuta', '52': 'Melilla'
    };

    const getCCAA = (op) => {
        const provCode = op?.datos_calculo?.inputs?.provincia;
        return provCode ? (CCAA_MAP[provCode] || '-') : '-';
    };

    const SearchablePartnerSelect = ({ value, onSelect, placeholder = "Seleccionar Partner...", isFilter = false }) => {
        const isOpen = openDropdownId === (isFilter ? 'filter' : value?.id_oportunidad || 'new');
        // El valor seleccionado es el ID del prescriptor
        const currentId = isFilter ? value : value?.prescriptor_id;
        const selected = prescriptores.find(p => p.id_empresa === currentId);
        
        const filtered = prescriptores.filter(p => {
            const name = (p.acronimo || p.razon_social || '').toLowerCase();
            return name.includes(partnerSearch.toLowerCase());
        });

        return (
            <div className="relative w-full" onClick={e => e.stopPropagation()}>
                <div 
                    onClick={() => {
                        if (isOpen) {
                            setOpenDropdownId(null);
                        } else {
                            setOpenDropdownId(isFilter ? 'filter' : value?.id_oportunidad || 'new');
                            setPartnerSearch('');
                        }
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        isOpen ? 'border-brand ring-1 ring-brand bg-black/40' : 'border-white/[0.08] bg-black/30 hover:border-white/20'
                    }`}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        {selected?.logo_empresa ? (
                            <img src={selected.logo_empresa} alt="" className="w-4 h-4 rounded object-contain shrink-0" />
                        ) : (
                            <div className="w-4 h-4 rounded bg-white/5 flex items-center justify-center shrink-0">
                                <svg className="w-2.5 h-2.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </div>
                        )}
                        <span className={`text-[10px] font-bold truncate uppercase tracking-tight ${selected ? 'text-white' : 'text-white/20 italic'}`}>
                            {selected ? (selected.acronimo || selected.razon_social) : (isFilter ? 'TODOS' : 'Sin asignar')}
                        </span>
                    </div>
                    <svg className={`w-3 h-3 text-white/20 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>

                {isOpen && (
                    <div className="absolute z-[100] left-0 right-0 mt-1 bg-bkg-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 min-w-[200px]">
                        <div className="p-2 border-b border-white/[0.05] bg-white/[0.02]">
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Buscar..."
                                className="w-full bg-black/40 border border-white/[0.08] rounded-md px-2 py-1 text-[10px] text-white focus:outline-none focus:border-brand/40"
                                value={partnerSearch}
                                onChange={e => setPartnerSearch(e.target.value)}
                            />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            <div 
                                onClick={() => { onSelect(''); setOpenDropdownId(null); }}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors ${((isFilter ? value : value?.prescriptor_id) === '' || (isFilter && value === 'none')) ? 'bg-brand/10 text-brand' : 'text-white/60'}`}
                            >
                                <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center shrink-0">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                    </svg>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">{isFilter ? 'TODOS' : 'Sin asignar'}</span>
                            </div>
                            
                            {isFilter && (
                                <div 
                                    onClick={() => { onSelect('none'); setOpenDropdownId(null); }}
                                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors ${filters.prescriptor_id === 'none' ? 'bg-brand/10 text-brand' : 'text-white/60'}`}
                                >
                                    <span className="text-[10px] font-black uppercase tracking-widest ml-7">Sin asignar</span>
                                </div>
                            )}

                            {filtered.map(p => (
                                <div 
                                    key={p.id_empresa}
                                    onClick={() => { onSelect(p.id_empresa); setOpenDropdownId(null); }}
                                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors ${(isFilter ? value : value?.prescriptor_id) === p.id_empresa ? 'bg-brand/10 text-brand' : 'text-white/60'}`}
                                >
                                    {p.logo_empresa ? (
                                        <img src={p.logo_empresa} alt="" className="w-5 h-5 rounded object-contain bg-white/5 shrink-0" />
                                    ) : (
                                        <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center shrink-0">
                                            <span className="text-[8px] font-black">{(p.acronimo || p.razon_social).charAt(0)}</span>
                                        </div>
                                    )}
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold truncate uppercase">{p.acronimo || p.razon_social}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Sincronizar viewMode cuando el rol del usuario esté disponible
    useEffect(() => {
        if (user?.rol?.toUpperCase() === 'ADMIN' && viewMode !== 'brokergy') {
            setViewMode('brokergy');
        } else if (user?.rol && user.rol.toUpperCase() !== 'ADMIN' && viewMode !== 'prescriptor') {
            setViewMode('prescriptor');
        }
    }, [user?.rol]);

    // Filter Stats
    const [filters, setFilters] = useState({
        id_oportunidad: '',
        referencia_cliente: '',
        ref_catastral: '',
        ficha: '',
        ccaa: '',
        prescriptor_id: '',
        estado: '',
        cod_cliente_interno: ''
    });

    useEffect(() => {
        fetchOportunidades();
        if (user?.rol === 'ADMIN') {
            fetchPrescriptores();
        }
    }, [user]);

    const fetchPrescriptores = async () => {
        try {
            const res = await axios.get('/api/prescriptores');
            setPrescriptores(res.data);
        } catch (err) {
            console.error('Error fetching prescriptores', err);
        }
    };

    const fetchOportunidades = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/oportunidades');
            setOportunidades(res.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching oportunidades:', err);
            setError('Error al cargar las oportunidades desde Supabase.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-dismiss error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleDelete = async () => {
        if (!oportunidadToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`/api/oportunidades/${oportunidadToDelete.id_oportunidad}`);
            setOportunidades(prev => prev.filter(op => op.id_oportunidad !== oportunidadToDelete.id_oportunidad));
            setOportunidadToDelete(null);
            setError(null);
        } catch (err) {
            console.error('Error al eliminar:', err);
            const serverError = err.response?.data;
            if (serverError?.error === 'HAS_EXPEDIENTE') {
                setError(serverError.message);
            } else {
                setError('Error interno al eliminar la oportunidad.');
            }
        } finally {
            setDeleting(false);
            setOportunidadToDelete(null);
        }
    };

    const handleStatusChange = async (e, op) => {
        e.stopPropagation();
        const nuevoEstado = e.target.value;
        const currentEstado = op.datos_calculo?.estado || 'PTE ENVIAR';

        if (nuevoEstado === currentEstado) return;

        // Validar cliente para estado ACEPTADA
        if (nuevoEstado === 'ACEPTADA' && !op.cliente_id) {
            setError('No se puede marcar como ACEPTADA sin haber creado/vinculado un cliente primero.');
            setPendingStatusUpdate({ op, nuevoEstado });
            setClienteModalOp(op);
            // Forzar re-render para revertir el select visualmente
            setOportunidades(prev => [...prev]);
            return;
        }

        setUpdatingStatus(op.id_oportunidad);
        try {
            const res = await axios.patch(`/api/oportunidades/${op.id_oportunidad}/estado`, { nuevo_estado: nuevoEstado });
            const updatedOp = res.data.data;

            // Refrescar localmente
            setOportunidades(prev => prev.map(o => 
                o.id_oportunidad === op.id_oportunidad ? updatedOp : o
            ));
        } catch (err) {
            console.error('Error al actualizar estado:', err);
            setError('Error al actualizar el estado de la oportunidad.');
        } finally {
            setUpdatingStatus(null);
        }
    };

    const handleAssignPrescriptor = async (e, op, nuevoPrescriptorId) => {
        e.stopPropagation();
        
        let prescriptorName = 'BROKERGY';
        if (nuevoPrescriptorId) {
            const selected = prescriptores.find(p => p.id_empresa === nuevoPrescriptorId);
            if (selected) {
                prescriptorName = selected.acronimo || selected.razon_social || `${selected.usuarios?.nombre} ${selected.usuarios?.apellidos || ''}`.trim();
            }
        }
        
        setAssigningPrescriptor(op.id_oportunidad);
        try {
            await axios.patch(`/api/oportunidades/${op.id_oportunidad}/asignar`, { 
                prescriptor_id: nuevoPrescriptorId || null, 
                prescriptor_name: prescriptorName 
            });

            // Refrescar localmente
            setOportunidades(prev => prev.map(o => {
                if (o.id_oportunidad === op.id_oportunidad) {
                    return { ...o, prescriptor_id: nuevoPrescriptorId || null, prescriptor: prescriptorName };
                }
                return o;
            }));
        } catch (err) {
            console.error('Error al asignar prescriptor:', err);
            setError('Error al asignar el prescriptor.');
        } finally {
            setAssigningPrescriptor(null);
        }
    };

    const handleDeleteHistory = async (id) => {
        setDeletingHistory(true);
        try {
            await axios.delete(`/api/oportunidades/${id}/historial`);

            // Actualizar localmente
            const updated = prev => prev.map(o => {
                if (o.id_oportunidad === id) {
                    return {
                        ...o,
                        datos_calculo: {
                            ...(o.datos_calculo || {}),
                            historial: []
                        }
                    };
                }
                return o;
            });
            setOportunidades(updated);

            // También actualizar el objeto del modal si está abierto
            if (historyModalOp && historyModalOp.id_oportunidad === id) {
                setHistoryModalOp(prev => ({
                    ...prev,
                    datos_calculo: {
                        ...(prev.datos_calculo || {}),
                        historial: []
                    }
                }));
            }
            setShowHistoryDeleteConfirm(false);
        } catch (err) {
            console.error('Error al borrar historial:', err);
            setError('Error al borrar el historial de la oportunidad.');
        } finally {
            setDeletingHistory(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !historyModalOp) return;

        setAddingComment(true);
        setModalError(null);
        try {
            const id = historyModalOp.id_oportunidad;
            console.log('[Frontend] Enviando comentario a /api/oportunidades/' + id + '/comentarios');
            const res = await axios.post(`/api/oportunidades/${id}/comentarios`, { comentario: newComment });

            const updatedOp = res.data.data;

            // Actualizar localmente
            setOportunidades(prev => prev.map(o => o.id_oportunidad === id ? updatedOp : o));
            setHistoryModalOp(updatedOp);
            setNewComment('');
            setShowCommentForm(false);
        } catch (err) {
            console.error('[Frontend] Error completo al añadir comentario:', err);
            const status = err.response?.status;
            const msg = err.response?.data?.error || err.message || 'Error desconocido';
            const detail = err.response?.data?.details || '';
            setModalError(`Error (${status || 'Red'}): ${msg}. ${detail}`);
        } finally {
            setAddingComment(false);
        }
    };

    const handleDeleteEntry = async (entryId) => {
        if (!historyModalOp) return;
        const id = historyModalOp.id_oportunidad;

        try {
            const res = await axios.delete(`/api/oportunidades/${id}/historial/${entryId}`);
            const updatedOp = res.data.data;

            // Actualizar localmente
            setOportunidades(prev => prev.map(o => o.id_oportunidad === id ? updatedOp : o));
            setHistoryModalOp(updatedOp);
        } catch (err) {
            console.error('Error al eliminar entrada del historial:', err);
            setError('Error al eliminar la nota.');
        }
    };

    const handleEditEntry = async (entryId) => {
        if (!historyModalOp || !editingText.trim()) return;
        const id = historyModalOp.id_oportunidad;

        setUpdatingEntry(true);
        try {
            const res = await axios.put(`/api/oportunidades/${id}/historial/${entryId}`, { texto: editingText });
            const updatedOp = res.data.data;

            // Actualizar localmente
            setOportunidades(prev => prev.map(o => o.id_oportunidad === id ? updatedOp : o));
            setHistoryModalOp(updatedOp);
            setEditingEntryId(null);
            setEditingText('');
        } catch (err) {
            console.error('Error al editar entrada del historial:', err);
            setError('Error al actualizar la nota.');
        } finally {
            setUpdatingEntry(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'EN CURSO': return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
            case 'ENVIADA': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
            case 'ACEPTADA': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            case 'RECHAZADA': return 'bg-red-500/10 text-red-400 border-red-500/30';
            default: return 'bg-white/[0.06] text-white/40 border-white/10'; // PTE ENVIAR
        }
    };

    const filteredOportunidades = (oportunidades || []).filter(op => {
        if (!op) return false;

        // 1. Filtros por columna (los que están en la parte superior de la tabla)
        const matchesColFilters = (
            (filters.id_oportunidad === '' || (op.id_oportunidad || '').toLowerCase().includes(filters.id_oportunidad.toLowerCase())) &&
            (filters.referencia_cliente === '' || (op.referencia_cliente || '').toLowerCase().includes(filters.referencia_cliente.toLowerCase())) &&
            (filters.ref_catastral === '' || (op.ref_catastral || '').toLowerCase().includes(filters.ref_catastral.toLowerCase())) &&
            (filters.ficha === '' || (() => {
                const isReforma = (op.datos_calculo?.isReforma === true) || 
                                (op.datos_calculo?.reformaType && op.datos_calculo?.reformaType !== 'none') ||
                                (op.ficha === 'RES080') ||
                                (op.referencia_cliente?.includes('RES080')) ||
                                (op.id_oportunidad?.includes('RES080'));
                const isHybrid = !isReforma && ((op.datos_calculo?.hibridacion === true) || (op.ficha === 'RES093'));
                const fichaValue = isReforma ? 'RES080' : (isHybrid ? 'RES093' : 'RES060');
                return fichaValue === filters.ficha;
            })()) &&
            (filters.ccaa === '' || getCCAA(op) === filters.ccaa) &&
            (filters.prescriptor_id === '' || (filters.prescriptor_id === 'none' ? !op.prescriptor_id : op.prescriptor_id === filters.prescriptor_id)) &&
            (filters.estado === '' || (op.datos_calculo?.estado || 'PTE ENVIAR') === filters.estado) &&
            (filters.cod_cliente_interno === '' || (op.datos_calculo?.cod_cliente_interno || '').toLowerCase().includes(filters.cod_cliente_interno.toLowerCase()))
        );

        if (!matchesColFilters) return false;

        // 2. Búsqueda Global (el buscador central)
        if (!globalSearch) return true;
        const gs = globalSearch.toLowerCase();
        const inputs = op.datos_calculo?.inputs || {};
        
        const searchFields = [
            op.id_oportunidad,
            op.referencia_cliente,
            op.ref_catastral,
            op.prescriptor,
            op.id_oportunidad_ref,
            op.numero_expediente,
            inputs.nombre,
            inputs.apellidos,
            inputs.razon_social,
            inputs.dni,
            inputs.nif,
            inputs.email,
            inputs.telefono,
            inputs.direccion,
            inputs.municipio,
            inputs.provincia,
            user?.rol === 'DISTRIBUIDOR' ? op.datos_calculo?.cod_cliente_interno : null
        ];

        return searchFields.some(field => field && String(field).toLowerCase().includes(gs));
    });

    // Reset pagination when filters or global search change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, globalSearch]);

    // Pagination logic
    const totalItems = filteredOportunidades.length;
    const totalPages = showAll ? 1 : Math.ceil(totalItems / itemsPerPage);
    const startIndex = showAll ? 0 : (currentPage - 1) * itemsPerPage;
    const paginatedOportunidades = showAll ? filteredOportunidades : filteredOportunidades.slice(startIndex, startIndex + itemsPerPage);

    // Cálculos financieros dinámicos basados en filtros
    const financialStats = filteredOportunidades.reduce((acc, op) => {
        const isReforma = (op.datos_calculo?.isReforma === true) || 
                         (op.datos_calculo?.reformaType && op.datos_calculo?.reformaType !== 'none') ||
                         (op.ficha === 'RES080') ||
                         (op.referencia_cliente?.includes('RES080')) ||
                         (op.id_oportunidad?.includes('RES080'));
                         
        const financials = isReforma ? op.datos_calculo?.result?.financialsRes080 : op.datos_calculo?.result?.financials;
        const cae = financials?.caeBonus || 0;
        const profit = financials?.profitBrokergy || 0;
        const budget = financials?.presupuesto || 0;
        
        const savingsKwh = isReforma 
            ? (op.datos_calculo?.result?.res080?.ahorroEnergiaFinalTotal || 0)
            : (op.datos_calculo?.result?.savings?.savingsKwh || 0);

        return {
            totalCae: acc.totalCae + cae,
            totalProfit: acc.totalProfit + profit,
            totalBudget: acc.totalBudget + budget,
            totalSavings: acc.totalSavings + savingsKwh
        };
    }, { totalCae: 0, totalProfit: 0, totalBudget: 0, totalSavings: 0 });

    const stats = {
        total: (oportunidades || []).length,
        pending: (oportunidades || []).filter(op => (op.datos_calculo?.estado || 'PTE ENVIAR') === 'PTE ENVIAR').length,
        inProgress: (oportunidades || []).filter(op => op.datos_calculo?.estado === 'EN CURSO').length,
        sent: (oportunidades || []).filter(op => op.datos_calculo?.estado === 'ENVIADA').length,
        accepted: (oportunidades || []).filter(op => op.datos_calculo?.estado === 'ACEPTADA').length,
        rejected: (oportunidades || []).filter(op => op.datos_calculo?.estado === 'RECHAZADA').length,
    };

    return (
        <>
            {activeTab === 'prescriptores' ? (
                <PrescriptoresList />
            ) : (
                <div className="animate-fade-in w-full max-w-[1600px] mx-auto px-6 sm:px-10 py-10 relative z-10">
                    {/* ─── Header ─── */}
                    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pb-4">
                            <div className="flex items-center gap-4 md:gap-6 min-w-0">
                                <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3 whitespace-nowrap">
                                    <div className="p-2 bg-gradient-to-br from-brand/20 to-brand-700/10 rounded-xl border border-brand/20 text-brand shadow-lg shadow-brand/10">
                            <svg className="w-4 h-4 md:w-5 md:h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                {user?.rol?.toUpperCase() === 'ADMIN' ? 'Panel de Control' : 'Mis Oportunidades'}
                            </h2>

                    {user?.rol?.toUpperCase() === 'ADMIN' && (
                        <div className="flex bg-bkg-surface p-1 rounded-xl border border-white/[0.06] ml-2">
                            <button
                                onClick={() => setViewMode('brokergy')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    viewMode === 'brokergy'
                                        ? 'bg-brand text-black shadow-lg shadow-brand/20'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                            >
                                Brokergy
                            </button>
                            <button
                                onClick={() => setViewMode('prescriptor')}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    viewMode === 'prescriptor'
                                        ? 'bg-brand text-black shadow-lg shadow-brand/20'
                                        : 'text-white/40 hover:text-white/60'
                                }`}
                            >
                                Prescriptor
                            </button>
                        </div>
                    )}

                    {!showStats && (
                        <div className="hidden md:flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="h-4 w-px bg-white/10 mx-2"></div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-tighter font-black text-emerald-400/50">Bono CAE</span>
                                <span className="text-sm font-bold text-emerald-400 leading-none">
                                    {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase tracking-tighter font-black text-cyan-400/50">
                                    {viewMode === 'brokergy' ? 'Beneficio' : 'Presupuesto'}
                                </span>
                                <span className="text-sm font-bold text-cyan-400 leading-none">
                                    {(viewMode === 'brokergy' ? financialStats.totalProfit : financialStats.totalBudget).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Buscador Global ─── */}
                <div className="flex-1 max-w-xl mx-8 hidden lg:block">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <svg className="w-4 h-4 text-white/20 group-focus-within:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por nombre, email, DNI..."
                            className="w-full bg-black/40 border border-white/[0.06] rounded-2xl pl-12 pr-4 py-3 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-brand/40 focus:bg-black/60 transition-all shadow-2xl shadow-black/20"
                            value={globalSearch}
                            onChange={e => setGlobalSearch(e.target.value)}
                        />
                        {globalSearch && (
                            <button 
                                onClick={() => setGlobalSearch('')}
                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/20 hover:text-white transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {returnToExpediente && (
                        <button
                            onClick={onReturnToExpediente}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-amber-500/20 transition-all group"
                        >
                            <svg className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 8.959 8.959 0 01-9 9" />
                            </svg>
                            Volver al Expediente
                        </button>
                    )}
                    <button
                        onClick={onBackToCalculator}
                        className="px-4 py-2 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep rounded-xl font-black uppercase tracking-wider text-[10px] md:text-xs flex items-center gap-2 shadow-lg shadow-brand/20 transition-all hover:scale-105 active:scale-95"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Nueva Simulación
                    </button>
                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                    <button
                        onClick={() => setShowStats(!showStats)}
                        className={`px-2 md:px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5 md:gap-2 text-[10px] font-black uppercase tracking-wider ${
                            showStats 
                                ? 'bg-brand/10 border-brand/20 text-brand' 
                                : 'bg-bkg-surface border-white/[0.06] text-white/40 hover:text-white hover:bg-bkg-hover'
                        }`}
                        title={showStats ? 'Ocultar Resumen' : 'Mostrar Resumen'}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {showStats 
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            }
                        </svg>
                        <span className="hidden sm:inline">{showStats ? 'Ocultar Resumen' : 'Mostrar Resumen'}</span>
                    </button>
                </div>
            </header>

            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-medium text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* ─── Panel de Resumen Financiero y Estados ─── */}
            {showStats && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
                        {/* Bono CAE Card */}
                        <div className="relative overflow-hidden p-4 rounded-xl border border-emerald-500/15"
                             style={{ background: 'linear-gradient(135deg, rgba(0,200,83,0.05) 0%, rgba(0,200,83,0.01) 100%)' }}>
                            <div className="relative flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/10">
                                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase tracking-wider font-black text-emerald-400/50 block">Bono CAE</span>
                                        <div className="text-xl md:text-2xl font-black text-emerald-400 leading-none">
                                            {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-white/20 font-medium block">{filteredOportunidades.length} ops</span>
                                    <span className="text-[8px] text-emerald-400/40 uppercase font-bold tracking-widest">Live</span>
                                </div>
                            </div>
                        </div>

                        {/* Beneficio Brokergy Card */}
                        <div className="relative overflow-hidden p-4 rounded-xl border border-cyan-500/15"
                             style={{ background: 'linear-gradient(135deg, rgba(41,182,246,0.05) 0%, rgba(41,182,246,0.01) 100%)' }}>
                            <div className="relative flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/10">
                                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase tracking-wider font-black text-cyan-400/50 block">
                                            {viewMode === 'brokergy' ? 'Beneficio' : 'Presupuesto'}
                                        </span>
                                        <div className="text-xl md:text-2xl font-black text-cyan-400 leading-none">
                                            {(viewMode === 'brokergy' ? financialStats.totalProfit : financialStats.totalBudget).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-white/20 font-medium block">{filteredOportunidades.length} ops</span>
                                    <span className="text-[8px] text-cyan-400/40 uppercase font-bold tracking-widest">Live</span>
                                </div>
                            </div>
                        </div>

                        {/* Ahorro Card */}
                        <div className="relative overflow-hidden p-4 rounded-xl border border-blue-500/15"
                             style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(59,130,246,0.01) 100%)' }}>
                            <div className="relative flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/10">
                                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <span className="text-[9px] uppercase tracking-wider font-black text-blue-400/50 block">Ahorro Generado</span>
                                        <div className="text-xl md:text-2xl font-black text-blue-400 leading-none">
                                            {(financialStats.totalSavings / 1000000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} <span className="text-xs text-blue-400/60 ml-0.5">GWh</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-white/20 font-medium block">{filteredOportunidades.length} ops</span>
                                    <span className="text-[8px] text-blue-400/40 uppercase font-bold tracking-widest">Total</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status Filter Cards */}
                    <div className="flex overflow-x-auto gap-2 pb-2 mb-4 md:mb-6 md:grid md:grid-cols-5 md:overflow-visible md:pb-0 snap-x snap-mandatory scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {[
                            { label: 'Total', count: stats.total, filter: '', dotColor: 'bg-white/30', borderActive: 'border-brand shadow-brand/20' },
                            { label: 'Pendientes', count: stats.pending, filter: 'PTE ENVIAR', dotColor: 'bg-brand', borderActive: 'border-brand shadow-brand/20' },
                            { label: 'En Curso', count: stats.inProgress, filter: 'EN CURSO', dotColor: 'bg-orange-400', borderActive: 'border-orange-500 shadow-orange-500/20' },
                            { label: 'Enviadas', count: stats.sent, filter: 'ENVIADA', dotColor: 'bg-blue-400', borderActive: 'border-blue-500 shadow-blue-500/20' },
                            { label: 'Aceptadas', count: stats.accepted, filter: 'ACEPTADA', dotColor: 'bg-emerald-400', borderActive: 'border-emerald-500 shadow-emerald-500/20' },
                            { label: 'Rechazadas', count: stats.rejected, filter: 'RECHAZADA', dotColor: 'bg-red-400', borderActive: 'border-red-500 shadow-red-500/20' }
                        ].map((stat, i) => (
                            <button
                                key={i}
                                onClick={() => setFilters(prev => ({ ...prev, estado: stat.filter }))}
                                className={`relative py-2.5 px-3 rounded-xl border flex items-center justify-between transition-all duration-200 hover:bg-white/[0.03] active:scale-[0.97] min-w-[140px] md:min-w-0 snap-start shrink-0 md:shrink ${
                                    filters.estado === stat.filter 
                                        ? `${stat.borderActive} bg-white/[0.04] shadow-lg` 
                                        : 'border-white/[0.06] hover:border-white/10'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${stat.dotColor} ${filters.estado === stat.filter ? 'animate-pulse' : 'opacity-80'}`}></span>
                                    <span className={`text-[9px] uppercase tracking-wider font-bold transition-colors ${filters.estado === stat.filter ? 'text-white' : 'text-white/60'}`}>
                                        {stat.label}
                                    </span>
                                </div>
                                <div className={`text-sm font-black tracking-tight ${stat.count > 0 ? 'text-white' : 'text-white/15'}`}>{stat.count}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Data Table ─── */}
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(19,21,26,0.6)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr style={{ background: 'rgba(26,28,34,0.8)' }}>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 w-24 border-b border-white/[0.06]">ID</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Ref. Cliente</th>
                                {user?.rol === 'DISTRIBUIDOR' && (
                                    <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-400/60 border-b border-white/[0.06]">Nº Cliente</th>
                                )}
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">CCAA</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Ficha</th>
                                {user?.rol === 'ADMIN' && (
                                    <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-blue-400/60 text-right border-b border-white/[0.06]">Ahorro (MWh)</th>
                                )}
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400/40 text-right border-b border-white/[0.06]">Bono CAE</th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400/40 text-right border-b border-white/[0.06]">
                                    {viewMode === 'brokergy' ? 'Beneficio Brokergy' : 'Presupuesto'}
                                </th>
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Fecha</th>
                                {user?.rol === 'ADMIN' && (
                                    <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] text-center w-36">Prescriptor</th>
                                )}
                                <th className="p-3.5 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Estado</th>
                            </tr>
                            {/* Fila de Filtros */}
                            <tr style={{ background: 'rgba(19,21,26,0.5)' }}>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <input
                                        type="text"
                                        placeholder="ID..."
                                        className="w-full bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-cyan-400 placeholder-white/20 focus:outline-none focus:border-cyan-500/40 focus:bg-black/40 transition-all font-mono"
                                        value={filters.id_oportunidad}
                                        onChange={e => setFilters(prev => ({ ...prev, id_oportunidad: e.target.value }))}
                                    />
                                </td>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <input
                                        type="text"
                                        placeholder="Buscar cliente..."
                                        className="w-full bg-bkg-deep border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-white/20 focus:outline-none focus:border-brand/40 focus:bg-bkg-elevated transition-all font-mono"
                                        value={filters.referencia_cliente}
                                        onChange={e => setFilters(prev => ({ ...prev, referencia_cliente: e.target.value }))}
                                    />
                                </td>
                                {user?.rol === 'DISTRIBUIDOR' && (
                                    <td className="p-2.5 border-b border-white/[0.06]">
                                        <input
                                            type="text"
                                            placeholder="Código..."
                                            className="w-full bg-bkg-deep border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[10px] text-amber-400 placeholder-white/20 focus:outline-none focus:border-amber-500/40 focus:bg-bkg-elevated transition-all font-mono"
                                            value={filters.cod_cliente_interno}
                                            onChange={e => setFilters(prev => ({ ...prev, cod_cliente_interno: e.target.value }))}
                                        />
                                    </td>
                                )}
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <select
                                        className="w-full bg-bkg-deep border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-brand/40 focus:bg-bkg-elevated transition-all font-mono uppercase"
                                        value={filters.ccaa}
                                        onChange={e => setFilters(prev => ({ ...prev, ccaa: e.target.value }))}
                                    >
                                        <option value="" className="bg-slate-800 text-white/50">Todas</option>
                                        {Array.from(new Set((oportunidades || []).map(op => getCCAA(op))))
                                            .filter(ccaa => ccaa && ccaa !== '-')
                                            .sort()
                                            .map(ccaa => (
                                                <option key={ccaa} value={ccaa} className="bg-slate-800 text-white">{ccaa}</option>
                                            ))}
                                    </select>
                                </td>
                                <td className="p-2.5 border-b border-white/[0.06]">
                                    <select
                                        className="w-full bg-bkg-deep border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-brand/40 focus:bg-bkg-elevated transition-all font-mono uppercase"
                                        value={filters.ficha}
                                        onChange={e => setFilters(prev => ({ ...prev, ficha: e.target.value }))}
                                    >
                                        <option value="" className="bg-slate-800 text-white/50">TODAS</option>
                                        <option value="RES060" className="bg-slate-800 text-brand">RES060</option>
                                        <option value="RES080" className="bg-slate-800 text-emerald-400">RES080</option>
                                        <option value="RES093" className="bg-slate-800 text-indigo-400">RES093</option>
                                    </select>
                                </td>
                                {user?.rol === 'ADMIN' && (
                                    <td className="p-2.5 border-b border-white/[0.06]"></td>
                                )}
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                                {user?.rol === 'ADMIN' && (
                                    <td className="p-2.5 border-b border-white/[0.06]">
                                        <SearchablePartnerSelect 
                                            isFilter 
                                            value={filters.prescriptor_id} 
                                            onSelect={val => setFilters(prev => ({ ...prev, prescriptor_id: val }))}
                                        />
                                    </td>
                                )}
                                <td className="p-2.5 border-b border-white/[0.06]"></td>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {loading && filteredOportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan={user?.rol === 'ADMIN' ? 10 : (user?.rol === 'DISTRIBUIDOR' ? 9 : 8)} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <svg className="w-6 h-6 text-white/15 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            <span className="text-white/20 text-sm">Cargando oportunidades...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedOportunidades.length === 0 ? (
                                <tr>
                                    <td colSpan={user?.rol === 'ADMIN' ? 10 : (user?.rol === 'DISTRIBUIDOR' ? 9 : 8)} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <svg className="w-8 h-8 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <span className="text-white/20 text-sm">No se encontraron oportunidades</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedOportunidades.map((op) => {
                                    const calcInputs = op.datos_calculo?.inputs || {};
                                    const isReforma = calcInputs.isReforma === true || op.datos_calculo?.isReforma === true || 
                                                     (calcInputs.reformaType && calcInputs.reformaType !== 'none') ||
                                                     (op.ficha === 'RES080') ||
                                                     (op.referencia_cliente?.toUpperCase().includes('RES080')) ||
                                                     (op.id_oportunidad?.toUpperCase().includes('RES080'));
                                    const isHybrid = calcInputs.hibridacion === true || op.datos_calculo?.hibridacion === true || 
                                                     (op.ficha === 'RES093') ||
                                                     (op.referencia_cliente?.toUpperCase().includes('RES093')) ||
                                                     (op.id_oportunidad?.toUpperCase().includes('RES093'));
                                    
                                    const currentFicha = isReforma ? 'RES080' : (isHybrid ? 'RES093' : 'RES060');
                                    
                                    // Seleccionar financieros correctos según ficha
                                    // Solo RES080 (Reforma) usa financialsRes080 si existe. RES093 y RES060 usan financials estándar.
                                    const financials = (isReforma && op.datos_calculo?.result?.financialsRes080) 
                                        ? op.datos_calculo.result.financialsRes080 
                                        : op.datos_calculo?.result?.financials;
                                        
                                    const caeBonus = financials?.caeBonus || 0;
                                    const profitBrokergy = financials?.profitBrokergy || 0;
                                    const presupuesto = financials?.presupuesto || 0;

                                    return (
                                        <tr
                                            key={op.id}
                                            className="hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer group"
                                            onClick={() => onLoadOpportunity && onLoadOpportunity(op)}
                                        >
                                            <td className="p-3.5 text-xs font-mono text-cyan-400/80 whitespace-nowrap">{op.id_oportunidad}</td>
                                            <td className="p-3.5 text-sm text-white/90 font-medium max-w-[140px] truncate" title={op.referencia_cliente}>{op.referencia_cliente || '-'}</td>
                                             {user?.rol === 'DISTRIBUIDOR' && (
                                                <td className="p-3.5 text-[10px] text-amber-400 font-bold tracking-tight">
                                                    {op.datos_calculo?.cod_cliente_interno || '-'}
                                                </td>
                                             )}
                                            <td className="p-3.5 text-[10px] text-white/40 uppercase font-bold tracking-tight">
                                                {getCCAA(op)}
                                            </td>
                                            <td className="p-3.5 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider border ${
                                                    currentFicha === 'RES080'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                        : currentFicha === 'RES093'
                                                            ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                                                            : 'bg-brand/10 text-brand border-brand/20'
                                                }`}>
                                                    {currentFicha}
                                                </span>
                                            </td>
                                            {user?.rol === 'ADMIN' && (
                                                <td className="p-3.5 text-sm text-blue-400 font-mono text-right font-bold">
                                                    {(() => {
                                                        const savingsKwh = isReforma 
                                                            ? (op.datos_calculo?.result?.res080?.ahorroEnergiaFinalTotal || 0)
                                                            : (op.datos_calculo?.result?.savings?.savingsKwh || 0);
                                                        return (savingsKwh / 1000).toFixed(2);
                                                    })()}
                                                </td>
                                            )}
                                            <td className="p-3.5 text-sm font-bold text-emerald-400 text-right">
                                                {caeBonus > 0 ? caeBonus.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-'}
                                            </td>
                                            <td className="p-3.5 text-sm font-bold text-cyan-400 text-right">
                                                {viewMode === 'brokergy'
                                                    ? (profitBrokergy > 0 ? profitBrokergy.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-')
                                                    : (presupuesto > 0 ? presupuesto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '-')
                                                }
                                            </td>
                                            <td className="p-3.5 text-[11px] text-white/25 whitespace-nowrap font-mono">
                                                {new Date(op.created_at).toLocaleDateString('es-ES')}
                                            </td>
                                            
                                            {user?.rol === 'ADMIN' && (
                                                <td className="p-3.5 text-center min-w-[140px]" onClick={e => e.stopPropagation()}>
                                                    <SearchablePartnerSelect 
                                                        value={op} 
                                                        onSelect={val => handleAssignPrescriptor({ stopPropagation: () => {} }, op, val)}
                                                    />
                                                </td>
                                            )}

                                            <td className="p-3.5" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={op.datos_calculo?.estado || 'PTE ENVIAR'}
                                                        onChange={(e) => handleStatusChange(e, op)}
                                                        disabled={updatingStatus === op.id_oportunidad}
                                                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer transition-all appearance-none ${getStatusColor(op.datos_calculo?.estado || 'PTE ENVIAR')} ${updatingStatus === op.id_oportunidad ? 'opacity-50' : ''}`}
                                                    >
                                                        <option value="PTE ENVIAR" className="bg-slate-800 text-slate-300">PTE ENVIAR</option>
                                                        <option value="EN CURSO" className="bg-slate-800 text-orange-400">EN CURSO</option>
                                                        <option value="ENVIADA" className="bg-slate-800 text-blue-400">ENVIADA</option>
                                                        <option value="ACEPTADA" className="bg-slate-800 text-emerald-400">ACEPTADA</option>
                                                        <option value="RECHAZADA" className="bg-slate-800 text-red-500">RECHAZADA</option>
                                                    </select>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setHistoryModalOp(op); }}
                                                        className="text-white/15 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-all"
                                                        title="Ver historial de estados"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </button>
                                                    {op.datos_calculo?.drive_folder_link && user?.rol === 'ADMIN' && (
                                                        <a
                                                            href={op.datos_calculo.drive_folder_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="p-1 text-cyan-400/40 hover:text-cyan-400 transition-all rounded-lg hover:bg-cyan-500/10"
                                                            title="Abrir carpeta en Google Drive"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                            </svg>
                                                        </a>
                                                    )}
                                                    {user?.rol !== 'DISTRIBUIDOR' && (
                                                        <>
                                                            {op.cliente_id ? (
                                                                /* Botón Ver Cliente (ya tiene cliente asignado) */
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setClienteDetailId(op.cliente_id); }}
                                                                    className="p-1 text-brand/60 hover:text-brand transition-all rounded-lg hover:bg-brand/10"
                                                                    title="Ver Cliente vinculado"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                </button>
                                                            ) : (
                                                                /* Botón Crear Cliente */
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setClienteModalOp(op); }}
                                                                    className="p-1 text-white/10 hover:text-brand transition-all rounded-lg hover:bg-brand/10 opacity-0 group-hover:opacity-100"
                                                                    title="Crear Cliente desde esta Oportunidad"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    {user?.rol?.toUpperCase() === 'ADMIN' && (op.drive_folder_id || op.drive_folder_url) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(op.drive_folder_url || `https://drive.google.com/drive/folders/${op.drive_folder_id}`, '_blank');
                                                            }}
                                                            className="p-1.5 text-white/20 hover:text-brand transition-colors rounded-lg hover:bg-brand/10"
                                                            title="Abrir carpeta en Drive"
                                                        >
                                                            <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOportunidadToDelete(op);
                                                        }}
                                                        className="p-1 text-white/10 hover:text-red-400 transition-all rounded-lg hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                                                        title="Eliminar Oportunidad"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>

                    </table>
                </div>
            </div>

            {/* Pagination Controls */}
            {totalItems > 0 && (
                <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-white/40 uppercase font-bold tracking-wider">
                            Mostrando <span className="text-white">{showAll ? 1 : startIndex + 1} - {showAll ? totalItems : Math.min(startIndex + itemsPerPage, totalItems)}</span> de <span className="text-white">{totalItems}</span> oportunidades
                        </span>
                        <div className="h-4 w-px bg-white/10 mx-1"></div>
                        <button 
                            onClick={() => setShowAll(!showAll)}
                            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${
                                showAll 
                                    ? 'bg-brand text-black border-brand shadow-lg shadow-brand/20' 
                                    : 'bg-bkg-surface text-white/60 border-white/10 hover:border-white/20 hover:text-white'
                            }`}
                        >
                            {showAll ? 'MOSTRAR POR PÁGINAS' : 'MOSTRAR TODAS'}
                        </button>
                    </div>

                    {!showAll && totalPages > 1 && (
                        <div className="flex items-center gap-1.5 bg-bkg-deep p-1 rounded-xl border border-white/[0.06]">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            
                            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                                // Simple pagination logic for 5 pages around current
                                let pageNum = i + 1;
                                if (totalPages > 5) {
                                    if (currentPage > 3) pageNum = currentPage - 3 + i;
                                    if (pageNum > totalPages) pageNum = totalPages - 4 + i;
                                    if (pageNum < 1) pageNum = i + 1;
                                }
                                
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-[11px] font-black transition-all ${
                                            currentPage === pageNum 
                                                ? 'bg-brand text-bkg-deep shadow-lg shadow-brand/20' 
                                                : 'text-white/40 hover:text-white hover:bg-bkg-hover'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                            
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Confirmación de Borrado */}
            {oportunidadToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-bkg-surface border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 p-4">
                            <button
                                onClick={() => setOportunidadToDelete(null)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            ¿Eliminar Oportunidad?
                        </h3>
                        <p className="text-white/60 text-sm mb-6 mt-4">
                            Se eliminarán todos los datos y ahorros calculados de esta oportunidad, liberando su Referencia Catastral. <br /><br />Esta acción es <strong>irreversible</strong>.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setOportunidadToDelete(null)}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors text-sm font-bold tracking-wider"
                                disabled={deleting}
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-bold tracking-wider flex items-center gap-2"
                                disabled={deleting}
                            >
                                {deleting ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        BORRANDO...
                                    </>
                                ) : 'SÍ, BORRAR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Huella Temporal (Historial) */}
            {historyModalOp && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setHistoryModalOp(null)}>
                    <div className="bg-bkg-surface border border-white/[0.1] p-6 rounded-2xl w-full max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 p-4">
                            <button onClick={() => { setHistoryModalOp(null); setShowHistoryDeleteConfirm(false); setModalError(null); }} className="text-white/40 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Historial de Estados
                            </h3>
                            
                            <div className="flex items-center gap-2 mr-8">
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.06] mr-4">
                                    <button
                                        onClick={() => setHistoryFilter('all')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            historyFilter === 'all'
                                                ? 'bg-brand text-black shadow-lg shadow-brand/20'
                                                : 'text-white/40 hover:text-white/60'
                                        }`}
                                    >
                                        TODO
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilter('notes')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            historyFilter === 'notes'
                                                ? 'bg-brand text-black shadow-lg shadow-brand/20'
                                                : 'text-white/40 hover:text-white/60'
                                        }`}
                                    >
                                        NOTAS
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilter('status')}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            historyFilter === 'status'
                                                ? 'bg-brand text-black shadow-lg shadow-brand/20'
                                                : 'text-white/40 hover:text-white/60'
                                        }`}
                                    >
                                        ESTADOS
                                    </button>
                                </div>

                                {(historyModalOp.datos_calculo?.historial || []).length > 0 && (
                                    <button
                                        onClick={() => setShowHistoryDeleteConfirm(true)}
                                        disabled={deletingHistory}
                                        className="text-[10px] font-black uppercase tracking-tighter px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all flex items-center gap-2 group"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        BORRAR
                                    </button>
                                )}
                            </div>
                        </div>

                        {showHistoryDeleteConfirm ? (
                            <div className="py-8 text-center animate-in fade-in zoom-in duration-200">
                                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-white font-bold mb-2 text-lg">¿Borrar todo el historial?</h4>
                                <p className="text-slate-400 text-sm mb-8 px-6">
                                    Esta acción eliminará permanentemente todos los registros de cambios de estado de esta oportunidad.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => setShowHistoryDeleteConfirm(false)}
                                        className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest"
                                        disabled={deletingHistory}
                                    >
                                        CANCELAR
                                    </button>
                                    <button
                                        onClick={() => handleDeleteHistory(historyModalOp.id_oportunidad)}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/20"
                                        disabled={deletingHistory}
                                    >
                                        {deletingHistory ? (
                                            <>
                                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                BORRANDO...
                                            </>
                                        ) : 'SÍ, BORRAR TODO'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/5 flex gap-4 text-sm justify-between items-center">
                                    <div>
                                        <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Oportunidad</span>
                                        <span className="text-cyan-400 font-mono font-bold">{historyModalOp.id_oportunidad}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-slate-400 text-xs mb-1 uppercase tracking-wider">Ref. Cliente</span>
                                        <span className="text-white font-medium">{historyModalOp.referencia_cliente || '-'}</span>
                                    </div>
                                </div>

                                {/* Botón para mostrar/ocultar formulario de comentario */}
                                {!showCommentForm ? (
                                    <div className="mb-6 flex justify-center">
                                        <button
                                            onClick={() => setShowCommentForm(true)}
                                            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl transition-all flex items-center gap-2 group text-xs font-black uppercase tracking-widest"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                            </svg>
                                            Nueva Nota
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mb-8 p-4 bg-white/5 rounded-2xl border border-amber-500/30 group animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="flex justify-between items-center mb-3">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-amber-500/80 px-1">Nueva Nota del Cliente</label>
                                            <button
                                                onClick={() => { setShowCommentForm(false); setNewComment(''); }}
                                                className="text-slate-500 hover:text-white transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="flex gap-3">
                                            <textarea
                                                autoFocus
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                placeholder="Escribe una actualización o nota sobre este cliente..."
                                                className="flex-1 bg-black/30 border border-white/5 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-white/20 min-h-[80px] resize-none custom-scrollbar"
                                            />
                                            <button
                                                onClick={handleAddComment}
                                                disabled={addingComment || !newComment.trim()}
                                                className={`self-end p-3 rounded-xl border border-amber-500/20 text-amber-500 hover:bg-amber-500/10 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:grayscale shadow-lg shadow-amber-500/10`}
                                                title="Añadir Nota"
                                            >
                                                {addingComment ? (
                                                    <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {modalError && (
                                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium animate-in slide-in-from-top-1 duration-200">
                                        <div className="flex items-center gap-2 mb-1 uppercase font-black tracking-widest text-[10px]">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Error al Procesar
                                        </div>
                                        {modalError}
                                    </div>
                                )}

                                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                    {((historyModalOp.datos_calculo?.historial || []).filter(h => {
                                        if (historyFilter === 'all') return true;
                                        if (historyFilter === 'notes') return h.tipo === 'comentario';
                                        if (historyFilter === 'status') return h.tipo !== 'comentario';
                                        return true;
                                    })).length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                                <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-slate-500 text-sm">No hay registros aún.</p>
                                        </div>
                                    ) : (
                                        [...(historyModalOp.datos_calculo.historial)]
                                            .filter(h => {
                                                if (historyFilter === 'all') return true;
                                                if (historyFilter === 'notes') return h.tipo === 'comentario';
                                                if (historyFilter === 'status') return h.tipo !== 'comentario';
                                                return true;
                                            })
                                            .reverse()
                                            .map((registro, idx, arr) => {
                                            const isComment = registro.tipo === 'comentario';
                                            return (
                                                <div key={idx} className="relative pl-6 pb-4 last:pb-0">
                                                    {idx !== arr.length - 1 && (
                                                        <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-slate-700"></div>
                                                    )}
                                                    <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isComment ? 'bg-indigo-900/40 border-indigo-500/50' : 'bg-slate-800 border-slate-600'}`}>
                                                        {isComment ? (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                                        ) : (
                                                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                        )}
                                                    </div>

                                                    <div className={`border rounded-xl p-4 ml-4 transition-all hover:border-white/20 ${isComment ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-slate-800/50 border-slate-700/50'}`}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            {isComment ? (
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1.5">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                                                    </svg>
                                                                    Nota Manual
                                                                </span>
                                                            ) : (
                                                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${getStatusColor(registro.estado)}`}>
                                                                    {registro.estado}
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-slate-400 font-mono">
                                                                {new Date(registro.fecha).toLocaleString('es-ES', {
                                                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                                                    hour: '2-digit', minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>

                                                        <div className={`text-sm ${isComment ? 'text-indigo-100/90 italic' : 'text-slate-300'}`}>
                                                            {isComment ? (
                                                                editingEntryId === registro.id ? (
                                                                    <div className="flex flex-col gap-2">
                                                                        <textarea
                                                                            autoFocus
                                                                            value={editingText}
                                                                            onChange={(e) => setEditingText(e.target.value)}
                                                                            className="w-full bg-black/40 border border-brand/30 rounded-lg p-2 text-xs text-white focus:outline-none min-h-[60px] resize-none"
                                                                        />
                                                                        <div className="flex justify-end gap-2">
                                                                            <button 
                                                                                onClick={() => setEditingEntryId(null)}
                                                                                className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[9px] font-black uppercase tracking-widest transition-all"
                                                                            >
                                                                                CANCELAR
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleEditEntry(registro.id)}
                                                                                disabled={updatingEntry || !editingText.trim()}
                                                                                className="px-2 py-1 bg-brand text-black rounded text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                                                            >
                                                                                {updatingEntry ? 'GUARDANDO...' : 'GUARDAR'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    registro.texto
                                                                )
                                                            ) : `Estado cambiado a ${registro.estado}`}
                                                        </div>

                                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5">
                                                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 uppercase tracking-tighter">
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                </svg>
                                                                Por: <span className="text-slate-400 font-bold">{registro.usuario || 'Sistema'}</span>
                                                            </div>

                                                            {isComment && (
                                                                <div className="flex items-center gap-1">
                                                                    {user?.rol === 'ADMIN' && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditingEntryId(registro.id);
                                                                                setEditingText(registro.texto);
                                                                            }}
                                                                            className="p-1 text-slate-600 hover:text-brand transition-colors"
                                                                            title="Editar Nota"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => handleDeleteEntry(registro.id)}
                                                                        className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                                                        title="Eliminar Nota"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
                </div>
            )}

            {/* Modal Crear Cliente desde Oportunidad */}
            <ClienteFormModal
                isOpen={!!clienteModalOp}
                onClose={() => {
                    setClienteModalOp(null);
                    setPendingStatusUpdate(null);
                }}
                oportunidad={clienteModalOp}
                onSuccess={(cliente) => {
                    // Actualizar el cliente_id en la oportunidad localmente
                    if (clienteModalOp && cliente?.id_cliente) {
                        const updatedOportunidades = oportunidades.map(o =>
                            o.id_oportunidad === clienteModalOp.id_oportunidad
                                ? { ...o, cliente_id: cliente.id_cliente }
                                : o
                        );
                        setOportunidades(updatedOportunidades);

                        // Si teníamos una actualización de estado pendiente, ejecutarla ahora
                        if (pendingStatusUpdate && pendingStatusUpdate.op.id_oportunidad === clienteModalOp.id_oportunidad) {
                            const { op: savedOp, nuevoEstado } = pendingStatusUpdate;
                            // Preparamos un objeto que simule el evento de cambio para reutilizar handleStatusChange
                            const fakeEvent = { 
                                target: { value: nuevoEstado }, 
                                stopPropagation: () => {} 
                            };
                            const updatedOpWithClient = { ...savedOp, cliente_id: cliente.id_cliente };
                            handleStatusChange(fakeEvent, updatedOpWithClient);
                        }
                    }
                    setClienteModalOp(null);
                    setPendingStatusUpdate(null);
                }}
            />

            {/* Modal Ver/Editar Cliente */}
            <ClienteDetailModal
                isOpen={!!clienteDetailId}
                onClose={() => setClienteDetailId(null)}
                clienteId={clienteDetailId}
                onOpenOportunidad={(op) => { setClienteDetailId(null); onLoadOpportunity(op); }}
            />
        </>
    );
}
