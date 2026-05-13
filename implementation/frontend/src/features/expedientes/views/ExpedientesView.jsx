import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { ExpedienteDetailView, EXPEDIENTE_ESTADOS } from './ExpedienteDetailView';
import { 
    calculateSavings, 
    calculateFinancials,
    calculateRes080,
    calculateHybridization,
    BOILER_EFFICIENCIES 
} from '../../calculator/logic/calculation';

// ─── Modal de creación de expediente ─────────────────────────────────────────
function NuevoExpedienteModal({ onClose, onCreated, existingOportunidadIds = [] }) {
    const [oportunidades, setOportunidades] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [selectedOp, setSelectedOp] = useState('');
    const [selectedCliente, setSelectedCliente] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(true);
    const [error, setError] = useState(null);
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualExpNumber, setManualExpNumber] = useState('');

    useEffect(() => {
        Promise.all([
            axios.get('/api/oportunidades'),
            axios.get('/api/clientes')
        ]).then(([opsRes, cliRes]) => {
            // Solo mostrar oportunidades con estado ACEPTADA que no tengan expediente ya
            const aceptadas = (opsRes.data || []).filter(
                op => op.datos_calculo?.estado === 'ACEPTADA' && !existingOportunidadIds.includes(op.id)
            );
            setOportunidades(aceptadas);
            setClientes(cliRes.data || []);
        }).catch(() => {
            setError('No se pudieron cargar los datos necesarios.');
        }).finally(() => setLoadingData(false));
    }, []);

    // Al seleccionar oportunidad, preseleccionar cliente vinculado si existe
    const handleOpChange = (opId) => {
        setSelectedOp(opId);
        const op = oportunidades.find(o => o.id === opId);
        if (op?.cliente_id) setSelectedCliente(op.cliente_id);
        else setSelectedCliente('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedOp || !selectedCliente) {
            setError('Selecciona una oportunidad y un cliente.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data } = await axios.post('/api/expedientes', {
                oportunidad_id: selectedOp,
                cliente_id: selectedCliente,
                numero_expediente: isManualMode ? manualExpNumber : null
            });
            onCreated(data);
        } catch (err) {
            if (err.response?.status === 409) {
                setError(`Ya existe un expediente para esta oportunidad.`);
            } else {
                setError(err.response?.data?.error || 'Error al crear el expediente.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div
                className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Nuevo Expediente</h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {loadingData ? (
                    <div className="p-8 text-center text-white/40 text-sm">Cargando datos...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs text-white/50 uppercase tracking-wider mb-1.5 font-bold">
                                Oportunidad (estado ACEPTADA)
                            </label>
                            <select
                                value={selectedOp}
                                onChange={e => handleOpChange(e.target.value)}
                                className="w-full bg-bkg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/50"
                                required
                            >
                                <option value="">— Selecciona oportunidad —</option>
                                {oportunidades.map(op => (
                                    <option key={op.id} value={op.id}>
                                        {op.id_oportunidad} — {op.referencia_cliente || 'Sin nombre'}
                                    </option>
                                ))}
                            </select>
                            {oportunidades.length === 0 && (
                                <p className="text-amber-400/80 text-xs mt-1.5">
                                    No hay oportunidades en estado ACEPTADA.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs text-white/50 uppercase tracking-wider mb-1.5 font-bold">
                                Cliente
                            </label>
                            <select
                                value={selectedCliente}
                                onChange={e => setSelectedCliente(e.target.value)}
                                className="w-full bg-bkg-surface border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand/50"
                                required
                            >
                                <option value="">— Selecciona cliente —</option>
                                {clientes.map(c => (
                                    <option key={c.id_cliente} value={c.id_cliente}>
                                        {c.nombre_razon_social} {c.apellidos || ''} {c.municipio ? `· ${c.municipio}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Selector de Modo de Numeración */}
                        <div className="space-y-4 pt-2">
                            <label className="block text-xs text-white/50 uppercase tracking-wider mb-1.5 font-bold text-center">
                                Numeración del Expediente
                            </label>
                            <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                                <button 
                                    type="button"
                                    onClick={() => setIsManualMode(false)}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${!isManualMode ? 'bg-emerald-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                                >
                                    Auto-Generar
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setIsManualMode(true)}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${isManualMode ? 'bg-brand text-bkg-deep shadow-lg' : 'text-white/40 hover:text-white'}`}
                                >
                                    Manual
                                </button>
                            </div>

                            {isManualMode ? (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 ml-1">Número de Expediente</label>
                                    <input 
                                        type="text"
                                        value={manualExpNumber}
                                        onChange={e => setManualExpNumber(e.target.value.toUpperCase())}
                                        placeholder="EJ: 24RES060_999"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand transition-all font-mono text-sm placeholder:text-white/10"
                                        required={isManualMode}
                                    />
                                </div>
                            ) : (
                                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <p className="text-[10px] text-emerald-400/80 leading-relaxed font-black uppercase tracking-widest text-center">
                                        {(() => {
                                            const op = oportunidades.find(o => o.id === selectedOp);
                                            const isReforma = op?.datos_calculo?.isReforma || op?.ficha === 'RES080';
                                            const isHybrid = !isReforma && (op?.datos_calculo?.hibridacion || op?.ficha === 'RES093');
                                            const programa = isReforma ? 'RES080' : (isHybrid ? 'RES093' : 'RES060');
                                            return `Se asignará el correlativo oficial ${new Date().getFullYear().toString().slice(-2)}${programa}_...`;
                                        })()}
                                    </p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-bold text-sm transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-wider disabled:opacity-50 transition-all"
                            >
                                {loading ? 'Creando...' : 'Crear Expediente'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

// ─── Vista principal ──────────────────────────────────────────────────────────
const CCAA_MAP = {
    '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunidad Valenciana', '04': 'Andalucía',
    '05': 'Castilla y León', '06': 'Extremadura', '07': 'Islas Baleares', '08': 'Cataluña',
    '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunidad Valenciana',
    '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
    '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
    '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
    '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Madrid',
    '29': 'Andalucía', '30': 'Murcia', '31': 'Navarra', '32': 'Galicia',
    '33': 'Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
    '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
    '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
    '45': 'Castilla-La Mancha', '46': 'Comunidad Valenciana', '47': 'Castilla y León',
    '48': 'País Vasco', '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla'
};

export function ExpedientesView({ onNavigate, initialSelectedId, onClearInitialSelection }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const [expedientes, setExpedientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const userRole = (user?.rol || '').toUpperCase();
    const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
    const isCertificador = userRole === 'CERTIFICADOR' || userRoleId === 4;
    
    const getCCAA = (exp) => {
        // 1. Intentar del campo ccaa del cliente (si existe en BD)
        if (exp.clientes?.ccaa) return exp.clientes.ccaa;
        
        // 2. Fallback: Derivar del código de provincia de la oportunidad (como en AdminPanelView)
        const provCode = exp.oportunidades?.datos_calculo?.inputs?.provincia;
        if (provCode && CCAA_MAP[provCode]) return CCAA_MAP[provCode];
        
        // 3. Si no, provincia textual del cliente
        if (exp.clientes?.provincia) return exp.clientes.provincia;

        return '—';
    };

    const getExpedienteFinancials = (exp) => {
        const op = exp.oportunidades;
        if (!op) return { ficha: '—', savingsKwh: null, cae: null, profit: null };

        let ficha = op.ficha || 'RES060';
        if (exp.numero_expediente?.includes('RES080')) ficha = 'RES080';
        else if (exp.numero_expediente?.includes('RES093')) ficha = 'RES093';

        const cee = exp.cee || {};
        const inst = exp.instalacion || {};
        const opInputs = op.datos_calculo?.inputs || {};

        let cae = null;
        let profit = null;
        let savingsKwh = null;

        if (ficha === 'RES060' || ficha === 'RES093') {
            const ceeFinal = cee.cee_final || {};
            // Determinar si tenemos datos REALES del expediente (no solo de la oportunidad)
            const hasExpData = !!ceeFinal.superficieHabitable || !!ceeFinal.demandaCalefaccion;
            
            if (hasExpData) {
                const superficie = parseFloat(ceeFinal.superficieHabitable) || 0;
                const q_net_heating = (parseFloat(ceeFinal.demandaCalefaccion) || 0) * superficie;
                
                let dacs = 0;
                if (cee.acs_method === 'cte') {
                    const numPeople = (parseInt(cee.num_rooms) || 4) + 1;
                    dacs = 28 * numPeople * 0.001162 * 365 * 46;
                } else {
                    dacs = (parseFloat(ceeFinal.demandaACS) || 0) * superficie;
                }

                if (superficie > 0 && q_net_heating > 0) {
                    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
                    const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
                    const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
                    const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);
                    
                    let cb = 1;
                    if (ficha === 'RES093' || inst.hibridacion || opInputs.hibridacion) {
                        const hybridRes = calculateHybridization({
                            demandAnnual: q_net_heating,
                            zone: op.datos_calculo?.zona || 'D3',
                            heatPumpPower: parseFloat(inst.potencia_bomba || opInputs.potenciaBomba) || 0
                        });
                        cb = hybridRes.cb;
                    }

                    const sv = calculateSavings({
                        q_net_heating,
                        dacs: inst.cambio_acs !== false ? dacs : 0,
                        boilerEff: boilerEffValue,
                        scopHeating,
                        scopAcs,
                        cb,
                        changeAcs: inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs?.aerotermia_db_id)
                    });

                    // Sincronizar parámetros financieros con ExpedienteDetailView
                    const overrides = inst.economico_override || {};
                    const includeCommission = overrides.include_commission ?? !!opInputs.include_commission;
                    
                    const fin = calculateFinancials({
                        presupuesto: overrides.presupuesto ?? (parseFloat(inst.presupuesto_final) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
                        savingsKwh: sv.savingsKwh,
                        caePriceClient: overrides.cae_client_rate ?? (parseFloat(opInputs.cae_client_rate) || 95),
                        caePriceSO: overrides.cae_so_rate ?? (parseFloat(opInputs.cae_so_rate) || 160),
                        caePricePrescriptor: includeCommission ? (parseFloat(overrides.cae_prescriptor_rate ?? opInputs.cae_prescriptor_rate) || 0) : 0,
                        prescriptorMode: overrides.cae_prescriptor_mode ?? opInputs.cae_prescriptor_mode ?? 'brokergy',
                        discountCertificates: overrides.discount_certificates ?? !!opInputs.discount_certificates,
                        certificatesCost: overrides.certificates_cost ?? opInputs.certificates_cost ?? 250,
                        includeLegalization: overrides.include_legalization ?? !!opInputs.include_legalization,
                        legalizationMode: overrides.legalization_mode ?? opInputs.legalization_mode ?? 'client',
                        includeIrpf: true
                    });

                    cae = fin.caeBonus;
                    profit = fin.profitBrokergy;
                    savingsKwh = sv.savingsKwh;
                }
            }
        } else if (ficha === 'RES080') {
            if (cee.cee_inicial && cee.cee_final) {
                const res080 = calculateRes080({
                    xmlInicial: cee.cee_inicial,
                    xmlFinal: cee.cee_final,
                    combAcsInicial: cee.comb_acs_inicial,
                    combAcsFinal: cee.comb_acs_final,
                    combCalefaccionInicial: cee.comb_cal_inicial,
                    combCalefaccionFinal: cee.comb_cal_final,
                    combRefrigeracionInicial: cee.comb_ref_inicial,
                    combRefrigeracionFinal: cee.comb_ref_final,
                    superficieCustom: cee.superficie_custom
                });

                if (res080) {
                    const overrides = inst.economico_override || {};
                    const fin = calculateFinancials({
                        presupuesto: overrides.presupuesto ?? (parseFloat(inst.presupuesto_final) || parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0),
                        savingsKwh: res080.ahorroEnergiaFinalTotal,
                        caePriceClient: overrides.cae_client_rate ?? 60,
                        caePriceSO: overrides.cae_so_rate ?? 140,
                        includeIrpf: true
                    });
                    cae = fin.caeBonus;
                    profit = fin.profitBrokergy;
                    savingsKwh = res080.ahorroEnergiaFinalTotal;
                }
            }
        }

        return { ficha, savingsKwh, cae, profit };
    };


    const [showModal, setShowModal] = useState(false);
    const [selectedExpediente, setSelectedExpediente] = useState(null);

    // CRM / History States
    const [historyModalExp, setHistoryModalExp] = useState(null);
    const [historyFilter, setHistoryFilter] = useState('all');
    const [showHistoryDeleteConfirm, setShowHistoryDeleteConfirm] = useState(false);
    const [deletingHistory, setDeletingHistory] = useState(false);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [addingComment, setAddingComment] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [editingEntryId, setEditingEntryId] = useState(null);
    const [editingText, setEditingText] = useState('');
    const [updatingEntry, setUpdatingEntry] = useState(false);

    // Auto-selección inicial
    useEffect(() => {
        if (initialSelectedId && expedientes.length > 0) {
            // Permitir búsqueda tanto por UUID como por número de expediente legible (24RES060_...)
            const found = expedientes.find(e => 
                e.id === initialSelectedId || 
                e.numero_expediente === initialSelectedId ||
                (e.oportunidades?.id_oportunidad === initialSelectedId)
            );
            
            if (found) {
                console.log(`[DeepLink] Expediente encontrado: ${found.numero_expediente || found.id}`);
                setSelectedExpediente(found);
                onClearInitialSelection?.();
            }
        }
    }, [initialSelectedId, expedientes, onClearInitialSelection]);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [certificadorFilter, setCertificadorFilter] = useState('ALL');
    const [ccaaFilter, setCcaaFilter] = useState('ALL');
    const [certificadores, setCertificadores] = useState([]);
    const [showStats, setShowStats] = useState(true);

    const fetchExpedientes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await axios.get('/api/expedientes');
            console.log('Fetched Expedientes:', data?.[0]);
            setExpedientes(data || []);
        } catch (err) {
            const detail = err.response?.data?.details || err.message;
            setError(`Error al cargar expedientes: ${detail}`);
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { 
        fetchExpedientes(); 
        // Cargar lista de certificadores para el filtro y mapeo de nombres
        axios.get('/api/prescriptores')
            .then(res => {
                const list = (res.data || []).filter(p => p.tipo_empresa === 'CERTIFICADOR' || p.tipo_empresa === 'OTRO');
                setCertificadores(list);
            })
            .catch(err => console.error('Error fetching certificadores list:', err));
    }, [fetchExpedientes]);

    const handleCreated = (newExp) => {
        setShowModal(false);
        setExpedientes(prev => [newExp, ...prev]);
        setSelectedExpediente(newExp);
    };

    const handleDelete = async (id) => {
        const confirmed = await showConfirm(
            '¿Estás seguro de que deseas eliminar este expediente? Esta acción eliminará permanentemente todos los datos asociados y no se puede deshacer.',
            'Eliminar Expediente',
            'error'
        );
        
        if (!confirmed) return;

        try {
            await axios.delete(`/api/expedientes/${id}`);
            setExpedientes(prev => prev.filter(e => e.id !== id));
            showAlert('El expediente ha sido eliminado correctamente.', 'Expediente Eliminado', 'success');
        } catch (err) {
            showAlert(err.response?.data?.error || 'No se pudo completar la eliminación del expediente.', 'Error al eliminar', 'error');
        }
    };

    const handleStatusChange = async (id, newStatus, e) => {
        if (e) e.stopPropagation();
        try {
            const res = await axios.put(`/api/expedientes/${id}`, { estado: newStatus });
            // Actualizar con la respuesta completa que trae el historial actualizado
            setExpedientes(prev => prev.map(exp => exp.id === id ? { ...exp, ...res.data } : exp));
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error al actualizar el estado.');
        }
    };

    const handleDeleteHistory = async (id) => {
        setDeletingHistory(true);
        try {
            const res = await axios.delete(`/api/expedientes/${id}/historial`);
            const updatedExp = res.data;

            setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
            if (historyModalExp && historyModalExp.id === id) {
                setHistoryModalExp(updatedExp);
            }
            setShowHistoryDeleteConfirm(false);
        } catch (err) {
            console.error('Error al borrar historial:', err);
            setError('Error al borrar el historial del expediente.');
        } finally {
            setDeletingHistory(false);
        }
    };

    const handleAddComment = async () => {
        if (!newComment.trim() || !historyModalExp) return;

        setAddingComment(true);
        setModalError(null);
        try {
            const id = historyModalExp.id;
            const res = await axios.post(`/api/expedientes/${id}/comentarios`, { comentario: newComment });
            const updatedExp = res.data;

            setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
            setHistoryModalExp(updatedExp);
            setNewComment('');
            setShowCommentForm(false);
        } catch (err) {
            console.error('Error al añadir comentario:', err);
            setModalError('Error al guardar la nota.');
        } finally {
            setAddingComment(false);
        }
    };

    const handleDeleteEntry = async (entryId, phase) => {
        if (!historyModalExp) return;
        const id = historyModalExp.id;
        const opId = historyModalExp.id_oportunidad_ref || historyModalExp.oportunidades?.id_oportunidad;

        try {
            if (phase === 'CAPTACIÓN' && opId) {
                const res = await axios.delete(`/api/oportunidades/${opId}/historial/${entryId}`);
                const updatedOp = res.data.data;
                const updatedExp = { ...historyModalExp, oportunidades: updatedOp };
                setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
                setHistoryModalExp(updatedExp);
            } else {
                const res = await axios.delete(`/api/expedientes/${id}/historial/${entryId}`);
                const updatedExp = res.data;
                setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
                setHistoryModalExp(updatedExp);
            }
        } catch (err) {
            console.error('Error al eliminar entrada:', err);
            alert('Error al eliminar la nota.');
        }
    };

    const handleEditEntry = async (entryId, phase) => {
        if (!historyModalExp || !editingText.trim()) return;
        const id = historyModalExp.id;
        const opId = historyModalExp.id_oportunidad_ref || historyModalExp.oportunidades?.id_oportunidad;

        setUpdatingEntry(true);
        try {
            if (phase === 'CAPTACIÓN' && opId) {
                const res = await axios.put(`/api/oportunidades/${opId}/historial/${entryId}`, { texto: editingText });
                const updatedOp = res.data.data;
                const updatedExp = { ...historyModalExp, oportunidades: updatedOp };
                setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
                setHistoryModalExp(updatedExp);
            } else {
                const res = await axios.put(`/api/expedientes/${id}/historial/${entryId}`, { texto: editingText });
                const updatedExp = res.data;
                setExpedientes(prev => prev.map(e => e.id === id ? updatedExp : e));
                setHistoryModalExp(updatedExp);
            }
            setEditingEntryId(null);
            setEditingText('');
        } catch (err) {
            console.error('Error al editar entrada:', err);
            alert('Error al actualizar la nota.');
        } finally {
            setUpdatingEntry(false);
        }
    };

    const getStatusColor = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('PTE') || s.includes('SOLICITADO')) return 'bg-white/5 text-white/40 border-white/10';
        if (s.includes('ACEPTADA') || s.includes('FINALIZADO')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
        if (s.includes('ENVIADO')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        if (s.includes('REQUERIMIENTO')) return 'bg-red-500/10 text-red-400 border-red-500/20';
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    };

    // Obtener lista única de CCAA para el filtro
    const availableCcaa = useMemo(() => {
        const set = new Set(expedientes.map(e => getCCAA(e)));
        return Array.from(set).filter(c => c && c !== '—').sort();
    }, [expedientes]);
    
    // Si hay un expediente seleccionado, mostrar el detalle
    if (selectedExpediente) {
        return (
            <ExpedienteDetailView
                expedienteId={selectedExpediente.id}
                onBack={() => { setSelectedExpediente(null); fetchExpedientes(); }}
                onNavigate={onNavigate}
            />
        );
    }

    const filtered = expedientes.filter(e => {
        const q = search.toLowerCase();
        const searchableText = [
            e.numero_expediente,
            e.id_oportunidad_ref,
            e.id, // UUID por si acaso
            e.oportunidades?.id_oportunidad,
            e.oportunidades?.referencia_cliente,
            e.oportunidades?.ref_catastral,
            e.clientes?.nombre_razon_social,
            e.clientes?.apellidos,
            e.clientes?.dni,
            e.clientes?.tlf,
            e.clientes?.municipio,
            e.clientes?.provincia,
            e.clientes?.direccion,
            e.clientes?.ccaa,
            getCCAA(e) // CCAA calculada
        ].filter(Boolean).join(' ').toLowerCase();

        const matchesSearch = searchableText.includes(q);

        const matchesStatus = statusFilter === 'ALL' || (e.estado || 'PTE. CEE INICIAL') === statusFilter;
        const matchesCert = certificadorFilter === 'ALL' || String(e.cee?.certificador_id) === String(certificadorFilter);
        const matchesCCAA = ccaaFilter === 'ALL' || getCCAA(e) === ccaaFilter;
        return matchesSearch && matchesStatus && matchesCert && matchesCCAA;
    });

    // Cálculos financieros dinámicos basados en filtros (CÁLCULO REAL DE EXPEDIENTE)
    const financialStats = filtered.reduce((acc, exp) => {
        const fin = getExpedienteFinancials(exp);
        return {
            totalCae: acc.totalCae + fin.cae,
            totalProfit: acc.totalProfit + fin.profit,
            totalSavings: acc.totalSavings + fin.savingsKwh
        };
    }, { totalCae: 0, totalProfit: 0, totalSavings: 0 });

    const stats = {
        total: expedientes.length,
        // Agrupar los estados más relevantes para las tarjetas de resumen
        groups: EXPEDIENTE_ESTADOS.map(st => ({
            label: st,
            count: expedientes.filter(e => (e.estado || 'PTE. CEE INICIAL') === st).length
        }))
    };

    return (
        <div className="p-6 sm:p-10 min-h-full animate-fade-in relative z-10 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-gradient-to-br from-brand/20 to-brand-700/10 rounded-xl border border-brand/20 text-brand shadow-lg shadow-brand/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tight">Expedientes</h1>
                        <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-0.5">{expedientes.length} registros totales</p>
                    </div>
                </div>

                <div className="relative flex-1 max-w-sm hidden lg:block mx-4">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por expediente, cliente, dni..."
                        className="w-full bg-black/40 border border-white/[0.06] rounded-xl pl-11 pr-4 py-2 text-[10px] uppercase tracking-wider font-extrabold text-white placeholder-white/20 focus:outline-none focus:border-brand/40 focus:bg-black/60 transition-all shadow-xl"

                    />
                </div>

                <div className="flex items-center gap-3">
                    {!isCertificador && (
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className={`px-3 py-2 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${
                                showStats 
                                    ? 'bg-brand/10 border-brand/20 text-brand' 
                                    : 'bg-bkg-surface border-white/[0.06] text-white/40 hover:text-white hover:bg-bkg-hover'
                            }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {showStats 
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                }
                            </svg>
                            <span className="hidden sm:inline">{showStats ? 'Ocultar Resumen' : 'Mostrar Resumen'}</span>
                        </button>
                    )}

                    {!isCertificador && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand/20"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Nuevo Expediente
                        </button>
                    )}
                </div>
            </div>

            {/* ─── Panel de Resumen Financiero y Estados ─── */}
            {showStats && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500 mb-8">
                    {!isCertificador && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
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
                                            <span className="text-[9px] uppercase tracking-wider font-black text-emerald-400/50 block">Bono CAE Estimado</span>
                                            <div className="text-xl md:text-2xl font-black text-emerald-400 leading-none">
                                                {financialStats.totalCae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-white/20 font-medium block">{filtered.length} exp.</span>
                                        <span className="text-[8px] text-emerald-400/40 uppercase font-bold tracking-widest">Global</span>
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
                                            <span className="text-[9px] uppercase tracking-wider font-black text-cyan-400/50 block">Beneficio Potencial</span>
                                            <div className="text-xl md:text-2xl font-black text-cyan-400 leading-none">
                                                {financialStats.totalProfit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-white/20 font-medium block">{filtered.length} exp.</span>
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
                                            <span className="text-[9px] uppercase tracking-wider font-black text-blue-400/50 block">Ahorro Energético</span>
                                            <div className="text-xl md:text-2xl font-black text-blue-400 leading-none">
                                                {(financialStats.totalSavings / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs text-blue-400/60 ml-0.5">MWh</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-white/20 font-medium block">{filtered.length} exp.</span>
                                        <span className="text-[8px] text-blue-400/40 uppercase font-bold tracking-widest">Total</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Status Filter Cards */}
                    <div className="flex overflow-x-auto gap-2 pb-2 snap-x snap-mandatory hide-scrollbar custom-scrollbar-h" style={{ WebkitOverflowScrolling: 'touch' }}>
                         <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`relative py-2.5 px-4 rounded-xl border flex items-center justify-between transition-all duration-200 min-w-[140px] snap-start shrink-0 ${
                                statusFilter === 'ALL' 
                                    ? 'border-brand bg-white/[0.04] shadow-lg shadow-brand/10' 
                                    : 'border-white/[0.06] hover:border-white/10 bg-bkg-surface/50'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full bg-white/30 ${statusFilter === 'ALL' ? 'animate-pulse' : 'opacity-80'}`}></span>
                                <span className={`text-[9px] uppercase tracking-wider font-bold transition-colors ${statusFilter === 'ALL' ? 'text-white' : 'text-white/40'}`}>
                                    Total
                                </span>
                            </div>
                            <div className={`text-sm font-black tracking-tight ${expedientes.length > 0 ? 'text-white' : 'text-white/15'}`}>
                                {expedientes.length}
                            </div>
                        </button>

                        {EXPEDIENTE_ESTADOS.map((st, i) => {
                            const count = expedientes.filter(e => (e.estado || 'PTE. CEE INICIAL') === st).length;
                            if (count === 0 && statusFilter !== st) return null;
                            
                            return (
                                <button
                                    key={st}
                                    onClick={() => setStatusFilter(st)}
                                    className={`relative py-2.5 px-4 rounded-xl border flex items-center justify-between transition-all duration-200 min-w-[140px] snap-start shrink-0 ${
                                        statusFilter === st 
                                            ? 'border-brand bg-white/[0.04] shadow-lg shadow-brand/10' 
                                            : 'border-white/[0.06] hover:border-white/10 bg-bkg-surface/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${st === 'FINALIZADO' ? 'bg-emerald-400' : st.includes('REQUERIMIENTO') ? 'bg-red-400' : 'bg-brand'} ${statusFilter === st ? 'animate-pulse' : 'opacity-80'}`}></span>
                                        <span className={`text-[9px] uppercase tracking-wider font-bold transition-colors truncate max-w-[120px] ${statusFilter === st ? 'text-white' : 'text-white/40'}`}>
                                            {st}
                                        </span>
                                    </div>
                                    <div className={`text-sm font-black tracking-tight ${count > 0 ? 'text-white' : 'text-white/15'}`}>
                                        {count}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Espaciador */}
            <div className="mb-2"></div>

            {/* Tabla */}
            {loading ? (
                <div className="text-center py-20 text-white/30 text-sm">Cargando expedientes...</div>
            ) : error ? (
                <div className="text-center py-20 text-red-400/70 text-sm">{error}</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-black/20 rounded-2xl border border-white/[0.04]">
                    <svg className="w-12 h-12 text-white/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-white/30 text-sm">{search ? 'Sin resultados para tu búsqueda.' : 'Aún no hay expedientes.'}</p>
                </div>
            ) : (
                <div className="rounded-2xl border border-white/[0.06] overflow-hidden shadow-2xl" style={{ background: 'rgba(19,21,26,0.6)' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                    <tr style={{ background: 'rgba(26,28,34,0.8)' }}>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Número Expediente</th>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] hidden md:table-cell">Comunidad Autónoma</th>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Estado</th>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] text-center">Seguimiento</th>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] text-center hidden xl:table-cell">Ficha</th>
                                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                                            <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06]">Certificador</th>
                                        )}
                                        {user?.rol?.toUpperCase() !== 'CERTIFICADOR' && (
                                            <>
                                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-blue-400/50 border-b border-white/[0.06] text-center hidden xl:table-cell">Ahorro (MWh)</th>
                                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-400/50 border-b border-white/[0.06] text-center hidden xl:table-cell">Bono CAE</th>
                                                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-400/50 border-b border-white/[0.06] text-center hidden xl:table-cell">Beneficio Brokergy</th>
                                            </>
                                        )}
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] hidden lg:table-cell">Fecha</th>
                                        <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] text-right">Acciones</th>
                                    </tr>
                                    {/* Fila de Filtros Integrados (Estilo Ejemplo) */}
                                    <tr className="bg-white/[0.01]">
                                        <td className="px-5 py-3 border-b border-white/[0.04]">
                                            <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.1em]">Filtrar por:</div>
                                        </td>
                                        <td className="px-5 py-3 border-b border-white/[0.04] hidden md:table-cell">
                                            <select
                                                value={ccaaFilter}
                                                onChange={(e) => setCcaaFilter(e.target.value)}
                                                className="bg-transparent text-[10px] font-black text-white/40 uppercase tracking-wider focus:outline-none focus:text-brand transition-colors cursor-pointer w-full p-0 appearance-none"
                                            >
                                                <option value="ALL" className="bg-bkg-deep text-white">TODAS LAS CCAA</option>
                                                {availableCcaa.map(c => (
                                                    <option key={c} value={c} className="bg-bkg-deep text-white">{c}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-5 py-3 border-b border-white/[0.04]">
                                            <div className="relative group">
                                                <select
                                                    value={statusFilter}
                                                    onChange={(e) => setStatusFilter(e.target.value)}
                                                    className="bg-transparent text-[10px] font-black text-brand uppercase tracking-wider focus:outline-none transition-colors cursor-pointer w-full p-0 pr-4 appearance-none"
                                                >
                                                    <option value="ALL" className="bg-bkg-deep text-white">TODOS LOS ESTADOS</option>
                                                    {EXPEDIENTE_ESTADOS.map(st => (
                                                        <option key={st} value={st} className="bg-bkg-deep text-white">{st}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                                                    <svg className="w-3 h-3 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-2 border-b border-white/[0.04] text-center"></td>
                                        <td className="px-5 py-2 border-b border-white/[0.04] text-center hidden xl:table-cell"></td>
                                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                                            <td className="px-5 py-3 border-b border-white/[0.04]">
                                                <select
                                                    value={certificadorFilter}
                                                    onChange={(e) => setCertificadorFilter(e.target.value)}
                                                    className="bg-transparent text-[10px] font-black text-white/40 uppercase tracking-wider focus:outline-none focus:text-brand transition-colors cursor-pointer w-full p-0 appearance-none"
                                                >
                                                    <option value="ALL" className="bg-bkg-deep text-white">TODOS LOS TÉCNICOS</option>
                                                    {certificadores.map(c => (
                                                        <option key={c.id_empresa} value={c.id_empresa} className="bg-bkg-deep text-white">
                                                            {c.razon_social || c.acronimo}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        )}
                                        {user?.rol?.toUpperCase() !== 'CERTIFICADOR' && (
                                            <>
                                                <td className="px-5 py-2 border-b border-white/[0.04] hidden xl:table-cell"></td>
                                                <td className="px-5 py-2 border-b border-white/[0.04] hidden xl:table-cell"></td>
                                                <td className="px-5 py-2 border-b border-white/[0.04] hidden xl:table-cell"></td>
                                            </>
                                        )}
                                        <td className="px-5 py-2 border-b border-white/[0.04] hidden lg:table-cell"></td>
                                        <td className="px-5 py-2 border-b border-white/[0.04]"></td>
                                    </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {filtered.map((exp, idx) => (
                                <tr
                                    key={exp.id}
                                    onClick={() => setSelectedExpediente(exp)}
                                    className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors group"
                                >
                                    <td className="px-5 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-mono text-brand text-xs font-bold">
                                                {exp.numero_expediente || exp.id_oportunidad_ref || exp.oportunidades?.id_oportunidad || '—'}
                                                {exp.clientes && ` - ${exp.clientes.nombre_razon_social} ${exp.clientes.apellidos || ''}`.toUpperCase()}
                                            </span>
                                            {exp.oportunidades?.referencia_cliente && (
                                                <div className="text-white/40 text-[10px] mt-0.5 truncate max-w-[220px] font-medium uppercase tracking-wider">
                                                    {exp.oportunidades.referencia_cliente}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 hidden md:table-cell text-white/50 text-xs font-medium uppercase tracking-wider">
                                        {getCCAA(exp)}
                                    </td>
                                    <td className="px-5 py-4">
                                        <select
                                            value={exp.estado || 'PTE. CEE INICIAL'}
                                            onClick={e => e.stopPropagation()}
                                            onChange={e => handleStatusChange(exp.id, e.target.value, e)}
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border cursor-pointer focus:outline-none transition-colors appearance-none text-center min-w-[120px] ${
                                                exp.estado === 'FINALIZADO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                exp.estado?.includes('REQUERIMIENTO') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                exp.estado?.startsWith('ENVIADO') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                'bg-white/5 text-white/50 border-white/10'
                                            }`}
                                        >
                                            {EXPEDIENTE_ESTADOS.map(st => (
                                                <option key={st} value={st} className="bg-bkg-deep text-white">
                                                    {st}
                                                </option>
                                            ))}
        </select>
    </td>

    <td className="px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-1.5" title="Seguimiento: CEI | CEF | ANX">
            {/* CEE INICIAL */}
            <div className={`w-2.5 h-2.5 rounded-full border transition-all ${
                exp.seguimiento?.cee_inicial === 'REGISTRADO' ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]' :
                exp.seguimiento?.cee_inicial && exp.seguimiento?.cee_inicial !== 'PTE_ENVIO_CERT' ? 'bg-amber-500 border-amber-400 animate-pulse' :
                'bg-white/5 border-white/10'
            }`} />
            {/* CEE FINAL */}
            <div className={`w-2.5 h-2.5 rounded-full border transition-all ${
                exp.seguimiento?.cee_final === 'REGISTRADO' ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]' :
                exp.seguimiento?.cee_final && exp.seguimiento?.cee_final !== 'PTE_ENVIO_CERT' ? 'bg-amber-500 border-amber-400 animate-pulse' :
                'bg-white/5 border-white/10'
            }`} />
            {/* ANEXOS */}
            <div className={`w-2.5 h-2.5 rounded-full border transition-all ${
                exp.seguimiento?.anexos === 'FIRMADOS' ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]' :
                exp.seguimiento?.anexos && exp.seguimiento?.anexos !== 'PTE_EMITIR' ? 'bg-amber-500 border-amber-400 animate-pulse' :
                'bg-white/5 border-white/10'
            }`} />
        </div>
    </td>
    
    {/* Nuevas Columnas Financieras */}
                                    <td className="px-5 py-4 text-center hidden xl:table-cell">
                                        <span className="text-[10px] font-black text-white px-2 py-1 bg-white/5 rounded border border-white/10">
                                            {getExpedienteFinancials(exp).ficha}
                                        </span>
                                    </td>

                                    {/* Columna de Certificador (Sólo ADMIN) */}
                                    {user?.rol?.toUpperCase() === 'ADMIN' && (
                                        <td className="px-5 py-4">
                                            <span className="text-[10px] font-black text-white px-2 py-1 bg-white/5 rounded border border-white/10 uppercase tracking-tighter">
                                                {(() => {
                                                    const cert = certificadores.find(c => String(c.id_empresa) === String(exp.cee?.certificador_id));
                                                    return cert ? (cert.razon_social || cert.acronimo) : '—';
                                                })()}
                                            </span>
                                        </td>
                                    )}
                                    {user?.rol?.toUpperCase() !== 'CERTIFICADOR' && (
                                        <>
                                            <td className="px-5 py-4 text-center hidden xl:table-cell text-blue-400 font-mono text-xs font-bold">
                                                {getExpedienteFinancials(exp).savingsKwh !== null 
                                                    ? (getExpedienteFinancials(exp).savingsKwh / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                                                    : '—'
                                                }
                                            </td>
                                            <td className="px-5 py-4 text-center hidden xl:table-cell text-emerald-400 font-mono text-xs font-bold">
                                                {getExpedienteFinancials(exp).cae !== null 
                                                    ? getExpedienteFinancials(exp).cae.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                                                    : '—'
                                                }
                                            </td>
                                            <td className="px-5 py-4 text-center hidden xl:table-cell text-cyan-400 font-mono text-xs font-bold">
                                                {getExpedienteFinancials(exp).profit !== null 
                                                    ? getExpedienteFinancials(exp).profit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
                                                    : '—'
                                                }
                                            </td>
                                        </>
                                    )}
                                    <td className="px-5 py-4 hidden lg:table-cell text-white/40 text-xs">
                                        {exp.created_at ? new Date(exp.created_at).toLocaleDateString('es-ES') : '—'}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Historial Toggle */}
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    // Abrimos el modal inmediatamente con los datos del listado,
                                                    // y en paralelo traemos el `documentacion` completo (no viene en la lista por rendimiento)
                                                    setHistoryModalExp(exp);
                                                    try {
                                                        const { data: full } = await axios.get(`/api/expedientes/${exp.id}`);
                                                        if (full) setHistoryModalExp(prev => prev && prev.id === exp.id ? { ...prev, documentacion: full.documentacion } : prev);
                                                    } catch (err) {
                                                        console.error('Error cargando documentacion para historial:', err);
                                                    }
                                                }}
                                                className="text-white/40 hover:text-brand transition-colors"
                                                title="Ver historial de estados"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </button>
                                            {user?.rol?.toUpperCase() !== 'CERTIFICADOR' && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDelete(exp.id); }}
                                                    className="text-white/40 hover:text-red-400 transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {showModal && (
            <NuevoExpedienteModal 
                onClose={() => setShowModal(false)}
                onCreated={handleCreated}
                existingOportunidadIds={expedientes.map(e => e.oportunidad_id)}
            />
        )}

        {/* Modal de Historial Compartido (Oportunidad + Expediente) */}
        {historyModalExp && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setHistoryModalExp(null)}>
                <div className="bg-bkg-surface border border-white/[0.1] p-6 rounded-2xl w-full max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                    <div className="absolute top-0 right-0 p-4">
                        <button onClick={() => { setHistoryModalExp(null); setShowHistoryDeleteConfirm(false); setModalError(null); }} className="text-white/40 hover:text-white transition-colors">
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
                            Historial Unificado
                        </h3>
                        
                        <div className="flex items-center gap-2 mr-8">
                            <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.06] mr-4">
                                {['all', 'notes', 'status'].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setHistoryFilter(f)}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                            historyFilter === f ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/60'
                                        }`}
                                    >
                                        {f === 'all' ? 'TODO' : f === 'notes' ? 'NOTAS' : 'ESTADOS'}
                                    </button>
                                ))}
                            </div>
                            {(historyModalExp.documentacion?.historial || []).length > 0 && user?.rol === 'ADMIN' && (
                                <button
                                    onClick={() => setShowHistoryDeleteConfirm(true)}
                                    className="text-[10px] font-black uppercase px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-all"
                                >
                                    BORRAR
                                </button>
                            )}
                        </div>
                    </div>

                    {showHistoryDeleteConfirm ? (
                        <div className="py-8 text-center animate-fade-in">
                            <h4 className="text-white font-bold mb-2">¿Borrar historial de tramitación?</h4>
                            <p className="text-slate-400 text-sm mb-6">Esta acción no afectará al historial de captación.</p>
                            <div className="flex gap-3 justify-center">
                                <button onClick={() => setShowHistoryDeleteConfirm(false)} className="px-4 py-2 bg-white/5 text-white rounded-lg text-xs font-black uppercase tracking-widest">CANCELAR</button>
                                <button onClick={() => handleDeleteHistory(historyModalExp.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase tracking-widest">SÍ, BORRAR</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/5 flex gap-4 text-xs justify-between items-center">
                                <div>
                                    <span className="block text-white/20 text-[9px] uppercase font-black mb-0.5 tracking-widest">Expediente</span>
                                    <span className="text-brand font-mono font-bold tracking-tight">{historyModalExp.numero_expediente || 'S/N'}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-white/20 text-[9px] uppercase font-black mb-0.5 tracking-widest">Oportunidad</span>
                                    <span className="text-white/60 font-medium tracking-tight">{historyModalExp.oportunidades?.id_oportunidad || '-'}</span>
                                </div>
                            </div>

                            {!showCommentForm ? (
                                <div className="mb-4 flex justify-center">
                                    <button
                                        onClick={() => setShowCommentForm(true)}
                                        className="px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 rounded-xl transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                        </svg>
                                        Nueva Nota de Tramitación
                                    </button>
                                </div>
                            ) : (
                                <div className="mb-6 p-4 bg-black/40 rounded-2xl border border-brand/30 animate-fade-in">
                                    <div className="flex gap-3">
                                        <textarea
                                            autoFocus
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder="Anota incidencias o actualizaciones en la tramitación..."
                                            className="flex-1 bg-black/30 border border-white/5 rounded-xl p-3 text-xs text-white focus:outline-none min-h-[70px] resize-none focus:border-brand/40"
                                        />
                                        <button
                                            onClick={handleAddComment}
                                            disabled={addingComment || !newComment.trim()}
                                            className="self-end p-3 rounded-xl border border-brand/20 text-brand hover:bg-brand/10 transition-all disabled:opacity-30 disabled:grayscale"
                                        >
                                            {addingComment ? (
                                                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                            )}
                                        </button>
                                    </div>
                                    {modalError && <p className="text-[10px] text-red-400 mt-2 font-bold">{modalError}</p>}
                                </div>
                            )}

                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {(() => {
                                    const histOp = (historyModalExp.oportunidades?.datos_calculo?.historial || []).map(h => ({ ...h, phase: 'CAPTACIÓN', canDelete: true }));
                                    const histExp = (historyModalExp.documentacion?.historial || []).map(h => ({ ...h, phase: 'TRAMITACIÓN', canDelete: true }));
                                    
                                    const combined = [...histOp, ...histExp]
                                        .filter(h => {
                                            if (historyFilter === 'all') return true;
                                            if (historyFilter === 'notes') return h.tipo === 'comentario';
                                            if (historyFilter === 'status') return h.tipo !== 'comentario';
                                            return true;
                                        })
                                        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                                    if (combined.length === 0) return (
                                        <div className="text-center py-10 opacity-20">
                                            <svg className="w-10 h-10 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-xs italic">Sin registros en el historial</p>
                                        </div>
                                    );

                                    return combined.map((reg, i) => (
                                        <div key={i} className="relative pl-6 pb-2 border-l border-white/5 ml-3">
                                            <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-bkg-surface ${reg.phase === 'CAPTACIÓN' ? 'bg-white/20' : 'bg-brand shadow-[0_0_10px_rgba(var(--brand-rgb),0.3)]'}`}></div>
                                            <div className={`rounded-xl p-3 border transition-all hover:bg-white/[0.05] ${reg.tipo === 'comentario' ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded tracking-widest ${reg.phase === 'CAPTACIÓN' ? 'bg-white/10 text-white/40' : 'bg-brand/20 text-brand'}`}>
                                                        {reg.phase}
                                                    </span>
                                                    <span className="text-[10px] text-white/20 font-mono tracking-tighter">
                                                        {new Date(reg.fecha).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="flex-1">
                                                        {reg.tipo === 'comentario' ? (
                                                            editingEntryId === reg.id ? (
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
                                                                            onClick={() => handleEditEntry(reg.id, reg.phase)}
                                                                            disabled={updatingEntry || !editingText.trim()}
                                                                            className="px-2 py-1 bg-brand text-black rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                                                                        >
                                                                            {updatingEntry ? 'GUARDANDO...' : 'GUARDAR'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs text-white/90 italic leading-relaxed">"{reg.texto}"</p>
                                                            )
                                                        ) : (
                                                            <p className="text-xs text-white/60 leading-relaxed font-medium">Estado cambiado a <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getStatusColor(reg.estado)}`}>{reg.estado}</span></p>
                                                        )}
                                                        <div className="flex items-center gap-1.5 mt-2 opacity-30">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                            <span className="text-[9px] uppercase font-black tracking-widest">{reg.usuario || 'Sistema'}</span>
                                                        </div>
                                                    </div>
                                                    {user?.rol === 'ADMIN' && reg.canDelete && reg.tipo === 'comentario' && editingEntryId !== reg.id && (
                                                        <div className="flex gap-1">
                                                            <button 
                                                                onClick={() => { setEditingEntryId(reg.id); setEditingText(reg.texto); }} 
                                                                className="p-1 text-white/10 hover:text-brand transition-colors"
                                                                title="Editar nota"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteEntry(reg.id, reg.phase)} 
                                                                className="p-1 text-white/10 hover:text-red-400 transition-colors"
                                                                title="Eliminar nota"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
        </div>
    );
}
