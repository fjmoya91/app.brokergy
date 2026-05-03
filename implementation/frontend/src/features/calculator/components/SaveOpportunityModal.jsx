import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button, Input, Label, Select } from './UIComponents';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { useAuth } from '../../../context/AuthContext';
import { PrescriptorDetailModal } from '../../admin/views/PrescriptorDetailModal';

export function SaveOpportunityModal({ isOpen, onClose, onSaveSuccess, onClientLinked, inputs, result }) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    const [referenciaCliente, setReferenciaCliente] = useState(inputs.referenciaCliente || '');
    const [codClienteInterno, setCodClienteInterno] = useState(inputs.cod_cliente_interno || '');
    const [prescriptorId, setPrescriptorId] = useState('');
    const [prescriptores, setPrescriptores] = useState([]);
    const [showClienteModal, setShowClienteModal] = useState(false);
    const [savedOportunidadData, setSavedOportunidadData] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    
    const [instaladores, setInstaladores] = useState([]);
    const [instaladorId, setInstaladorId] = useState('');
    const [loadingInstaladores, setLoadingInstaladores] = useState(false);
    const [instaladorSearchTerm, setInstaladorSearchTerm] = useState('');
    const [isInstaladorDropdownOpen, setIsInstaladorDropdownOpen] = useState(false);
    const [showNewInstaladorModal, setShowNewInstaladorModal] = useState(false);

    // Filtrar prescriptores por búsqueda
    const filteredPrescriptores = prescriptores.filter(p => {
        const name = (p.acronimo || p.razon_social || '').toLowerCase();
        return name.includes(searchTerm.toLowerCase());
    });

    const selectedPrescriptor = prescriptores.find(p => p.id_empresa === prescriptorId);

    // Sincronizar siempre que cambie el valor externo para asegurar que se muestra el dato correcto
    useEffect(() => {
        setReferenciaCliente(inputs.referenciaCliente || '');
        setCodClienteInterno(inputs.cod_cliente_interno || '');
        if (isAdmin) {
            // Si hay un prescriptor_id en los inputs (cuando cargamos una op existente), lo usamos
            setPrescriptorId(inputs.prescriptor_id || '');
            setInstaladorId(inputs.instalador_asociado_id || '');
        } else if (user?.prescriptor_id) {
            setPrescriptorId(user.prescriptor_id);
            setInstaladorId(inputs.instalador_asociado_id || '');
        }
    }, [inputs.referenciaCliente, inputs.prescriptor_id, inputs.instalador_asociado_id, isOpen, isAdmin, user?.prescriptor_id]); // isOpen para forzar recarga al abrir

    // Cargar prescriptores solo para ADMIN
    useEffect(() => {
        if (isOpen && isAdmin) {
            axios.get('/api/prescriptores')
                .then(r => setPrescriptores(r.data))
                .catch(() => setPrescriptores([]));
        }
    }, [isOpen, isAdmin]);

    // Cargar Instaladores
    useEffect(() => {
        if (!isOpen) return;
        
        let distId = null;
        if (user?.rol?.toUpperCase() === 'DISTRIBUIDOR') {
            distId = user.prescriptor_id;
        } else if (isAdmin && selectedPrescriptor?.tipo_empresa === 'DISTRIBUIDOR') {
            distId = selectedPrescriptor.id_empresa;
        }

        console.log('[Frontend] Loading installers for distId:', distId);

        if (distId) {
            setLoadingInstaladores(true);
            axios.get(`/api/prescriptores/${distId}/instaladores`)
                .then(r => {
                    console.log(`[Frontend] Loaded ${r.data.length} installers`);
                    setInstaladores(r.data);
                })
                .catch(err => {
                    console.error('[Frontend] Error loading installers:', err);
                    setInstaladores([]);
                })
                .finally(() => setLoadingInstaladores(false));
        } else {
            setInstaladores([]);
            // Solo limpiamos el instaladorId si realmente hemos cambiado de partner y no es el primer render
            // Para simplificar, quitamos el clearing automático de aquí y lo movemos al cambio de partner
        }
    }, [isOpen, isAdmin, user?.rol, user?.prescriptor_id, selectedPrescriptor]);

    const selectedInstalador = instaladores.find(i => i.id_empresa === instaladorId);
    const filteredInstaladores = instaladores.filter(i => {
        const name = (i.acronimo || i.razon_social || '').toLowerCase();
        return name.includes(instaladorSearchTerm.toLowerCase());
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [savedOportunidadId, setSavedOportunidadId] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [nota, setNota] = useState('');
    const [conflictInstaller, setConflictInstaller] = useState(null);

    const checkInternalNumber = async (num, currentInstId) => {
        if (!num || num.trim() === '' || user?.rol !== 'DISTRIBUIDOR') {
            setConflictInstaller(null);
            return;
        }

        // Si el número coincide con el que ya tiene el instalador en el listado, no hay conflicto
        const inst = instaladores.find(i => i.id_empresa === currentInstId);
        if (inst && inst.cod_cliente_interno === num) {
            setConflictInstaller(null);
            return;
        }

        try {
            const res = await axios.get(`/api/prescriptores/check-internal-number?number=${num}&installerId=${currentInstId || ''}`);
            if (res.data.exists) {
                setConflictInstaller(res.data.installerName);
            } else {
                setConflictInstaller(null);
            }
        } catch (err) {
            console.error('Error checking number:', err);
        }
    };

    // 1. Auto-fill cuando cambia el instalador
    useEffect(() => {
        if (instaladorId && user?.rol === 'DISTRIBUIDOR') {
            const inst = instaladores.find(i => i.id_empresa === instaladorId);
            if (inst && inst.cod_cliente_interno) {
                console.log('[InternalNumber] Auto-filling from selected installer:', inst.cod_cliente_interno);
                setCodClienteInterno(inst.cod_cliente_interno);
            }
        }
    }, [instaladorId]);

    // 2. Comprobación de conflictos con debounce
    useEffect(() => {
        if (user?.rol === 'DISTRIBUIDOR') {
            console.log('[InternalNumber] Triggering conflict check for:', codClienteInterno, 'inst:', instaladorId);
            const timer = setTimeout(() => {
                checkInternalNumber(codClienteInterno, instaladorId);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [codClienteInterno, instaladorId, user?.rol]);

    if (!isOpen) return null;

    const executeSave = async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                id_oportunidad: inputs.id_oportunidad, // Pasar el ID para no generar errores 500 o inserciones dobles al editar
                ref_catastral: inputs.rc || 'MANUAL',
                prescriptor_id: isAdmin ? (prescriptorId || null) : (user?.prescriptor_id || null),
                instalador_asociado_id: instaladorId || null,
                referencia_cliente: referenciaCliente,
                demanda_calefaccion: result?.q_net || 0,
                anio: inputs.anio,
                zona: inputs.zona,
                cliente_id: inputs.cliente_id || null,
                datos_calculo: {
                    ...inputs,
                    cod_cliente_interno: codClienteInterno,
                    inputs: {
                        ...inputs,
                        cod_cliente_interno: codClienteInterno
                    },
                    result
                },
                nota: nota.trim() || null
            };

            console.log('[Frontend] Saving opportunity payload:', payload);
            const response = await axios.post('/api/oportunidades', payload);
            const savedData = response.data;
            console.log('[Frontend] Save response:', savedData);
            setSavedOportunidadId(savedData.id_oportunidad);
            setSavedOportunidadData(savedData);
            setSuccess(true);
            setShowConfirmation(false);
            if (onSaveSuccess) onSaveSuccess(
                referenciaCliente,
                savedData.id_oportunidad,
                savedData.datos_calculo?.drive_folder_id,
                payload.prescriptor_id,
                payload.instalador_asociado_id,
                codClienteInterno
            );

            // ACTUALIZAR MAPEADO DE INSTALADOR (Si somos distribuidores y hay instalador)
            if (user?.rol === 'DISTRIBUIDOR' && instaladorId && codClienteInterno) {
                try {
                    await axios.post('/api/prescriptores/update-internal-number', {
                        installerId: instaladorId,
                        number: codClienteInterno
                    });
                    console.log('[Frontend] Mapping updated successfully');
                } catch (mapErr) {
                    console.error('[Frontend] Error updating mapping:', mapErr);
                }
            }
        } catch (err) {
            console.error('Error guardando oportunidad:', err);
            setError('No se pudo guardar la oportunidad. Inténtalo de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInit = async () => {
        if (!inputs.rc || inputs.rc === 'MANUAL') {
            return executeSave();
        }

        setLoading(true);
        setError(null);
        try {
            // Check if it exists
            await axios.get(`/api/oportunidades/${inputs.rc}`);
            // If it succeeds (200 OK), it means it exists
            setShowConfirmation(true);
            setLoading(false);
        } catch (err) {
            // If 404, it doesn't exist, just save directly
            if (err.response?.status === 404) {
                executeSave();
            } else {
                setError('Error al verificar existencia de la oportunidad.');
                setLoading(false);
            }
        }
    };

    const handleClose = () => {
        // Limpiamos el estado al cerrar para que esté limpio la próxima vez
        setTimeout(() => {
            // Solo limpiamos si ha habido éxito, para que si cancelas se mantenga lo escrito
            if (success) {
                setReferenciaCliente('');
                setNota('');
            }
            setSuccess(false);
            setSavedOportunidadId(null);
            setError(null);
            setShowConfirmation(false);
        }, 300);
        onClose();
    };

    return (
        <>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bkg-deep/80 backdrop-blur-md animate-fade-in" onClick={handleClose}>
                <div className="w-full max-w-md relative z-10">
                    <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 relative backdrop-blur-xl" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px] pointer-events-none"></div>

                        <button
                            onClick={handleClose}
                            className="absolute top-6 right-6 p-2 text-white/20 hover:text-white transition-colors z-20"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="relative z-10">
                            {!success && !showConfirmation && (
                                <>
                                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                        <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                        </svg>
                                        Guardar Oportunidad
                                    </h3>
                                    <p className="text-sm text-white/40 mb-6">
                                        Asigna una referencia de cliente para identificar este cálculo más adelante en tu Panel de Control.
                                    </p>
                                    <div className="space-y-4 mb-6">
                                        <div>
                                            <Label htmlFor="refClient">Referencia de Cliente</Label>
                                            <Input
                                                id="refClient"
                                                placeholder="Ej: Cliente Martínez, Proyecto Centro..."
                                                className="uppercase font-bold"
                                                value={referenciaCliente}
                                                onChange={(e) => setReferenciaCliente(e.target.value)}
                                            />
                                        </div>

                                        {isAdmin && (
                                            <div className="relative">
                                                <Label htmlFor="prescriptor">Asignar a Prescriptor / Partner</Label>
                                                
                                                {/* Gatillo del Dropdown */}
                                                <div 
                                                    className={`w-full px-4 py-3 bg-bkg-elevated border ${isDropdownOpen ? 'border-brand ring-1 ring-brand' : 'border-white/[0.1]'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between min-h-[52px]`}
                                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {selectedPrescriptor?.logo_empresa ? (
                                                            <img src={selectedPrescriptor.logo_empresa} alt="" className="w-6 h-6 rounded-md object-contain bg-white/5" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                                                                <svg className="w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                        <span className={selectedPrescriptor ? 'text-white font-bold' : 'text-white/40 italic'}>
                                                            {selectedPrescriptor ? (selectedPrescriptor.acronimo || selectedPrescriptor.razon_social) : '— Selecciona Partner —'}
                                                        </span>
                                                    </div>
                                                    <svg className={`w-5 h-5 text-white/30 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>

                                                {isDropdownOpen && (
                                                    <div className="absolute z-[210] left-0 right-0 mt-2 bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                        <div className="p-3 border-b border-white/[0.05] bg-white/[0.02]">
                                                            <div className="relative">
                                                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                </svg>
                                                                <input 
                                                                    autoFocus
                                                                    type="text" 
                                                                    placeholder="Buscar partner..."
                                                                    className="w-full bg-bkg-deep/50 border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 transition-all"
                                                                    value={searchTerm}
                                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                                            {filteredPrescriptores.map(p => (
                                                                <div 
                                                                    key={p.id_empresa}
                                                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${prescriptorId === p.id_empresa ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                    onClick={() => { 
                                                                        setPrescriptorId(p.id_empresa); 
                                                                        setInstaladorId(''); // Limpiar instalador al cambiar de partner
                                                                        setIsDropdownOpen(false); 
                                                                        setSearchTerm(''); 
                                                                    }}
                                                                >
                                                                    {p.logo_empresa ? (
                                                                        <img src={p.logo_empresa} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/5 shrink-0" />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                                                            <span className="text-xs font-black text-white/20">{(p.acronimo || p.razon_social || '?').charAt(0).toUpperCase()}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-sm font-black text-white truncate uppercase tracking-tight">{p.acronimo || p.razon_social}</span>
                                                                        {p.acronimo && p.razon_social && p.acronimo !== p.razon_social && (
                                                                            <span className="text-[10px] text-white/30 truncate uppercase">{p.razon_social}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {filteredPrescriptores.length === 0 && (
                                                                <div className="p-8 text-center text-white/20 text-xs italic uppercase tracking-widest">
                                                                    No se encontraron partners
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Selector de Instalador Asociado (Visible para Distribuidores o para Admin cuando selecciona un Distribuidor) */}
                                        {(user?.rol === 'DISTRIBUIDOR' || (isAdmin && selectedPrescriptor?.tipo_empresa === 'DISTRIBUIDOR')) && (
                                            <div className="relative">
                                                <Label htmlFor="instalador">Instalador Asociado</Label>
                                                
                                                <div 
                                                    className={`w-full px-4 py-3 bg-bkg-elevated border ${isInstaladorDropdownOpen ? 'border-brand ring-1 ring-brand' : 'border-white/[0.1]'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between min-h-[52px]`}
                                                    onClick={() => setIsInstaladorDropdownOpen(!isInstaladorDropdownOpen)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {selectedInstalador?.logo_empresa ? (
                                                            <img src={selectedInstalador.logo_empresa} alt="" className="w-6 h-6 rounded-md object-contain bg-white/5" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                                                                <svg className="w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                        <span className={selectedInstalador ? 'text-white font-bold' : 'text-white/40 italic'}>
                                                            {selectedInstalador ? (selectedInstalador.acronimo || selectedInstalador.razon_social) : '— Selecciona Instalador —'}
                                                        </span>
                                                    </div>
                                                    {loadingInstaladores ? (
                                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                                                    ) : (
                                                        <svg className={`w-5 h-5 text-white/30 transition-transform ${isInstaladorDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    )}
                                                </div>

                                                {isInstaladorDropdownOpen && (
                                                    <div className="absolute z-[210] left-0 right-0 mt-2 bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                        <div className="p-3 border-b border-white/[0.05] bg-white/[0.02]">
                                                            <div className="relative">
                                                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                </svg>
                                                                <input 
                                                                    autoFocus
                                                                    type="text" 
                                                                    placeholder="Buscar instalador..."
                                                                    className="w-full bg-bkg-deep/50 border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-brand/50 transition-all"
                                                                    value={instaladorSearchTerm}
                                                                    onChange={(e) => setInstaladorSearchTerm(e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                                            <div 
                                                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${!instaladorId ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                onClick={() => { setInstaladorId(''); setIsInstaladorDropdownOpen(false); setInstaladorSearchTerm(''); }}
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-white/40">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </div>
                                                                <span className="text-xs font-black uppercase tracking-widest text-white/60">— Sin instalador —</span>
                                                            </div>

                                                            {filteredInstaladores.map(i => (
                                                                <div 
                                                                    key={i.id_empresa}
                                                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${instaladorId === i.id_empresa ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                    onClick={() => { setInstaladorId(i.id_empresa); setIsInstaladorDropdownOpen(false); setInstaladorSearchTerm(''); }}
                                                                >
                                                                    {i.logo_empresa ? (
                                                                        <img src={i.logo_empresa} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/5 shrink-0" />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                                                            <span className="text-xs font-black text-white/20">{(i.acronimo || i.razon_social || '?').charAt(0).toUpperCase()}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-sm font-black text-white truncate uppercase tracking-tight">{i.acronimo || i.razon_social}</span>
                                                                        {i.acronimo && i.razon_social && i.acronimo !== i.razon_social && (
                                                                            <span className="text-[10px] text-white/30 truncate uppercase">{i.razon_social}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {filteredInstaladores.length === 0 && instaladorSearchTerm && (
                                                                <div className="p-8 text-center text-white/20 text-xs italic uppercase tracking-widest">
                                                                    No se encontraron instaladores
                                                                </div>
                                                            )}
                                                            
                                                            {filteredInstaladores.length === 0 && !instaladorSearchTerm && !loadingInstaladores && (
                                                                <div className="p-8 text-center text-white/20 text-xs italic uppercase tracking-widest leading-relaxed">
                                                                    No hay instaladores asociados <br/> a este distribuidor
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="p-2 border-t border-white/[0.05] bg-white/[0.01]">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setShowNewInstaladorModal(true);
                                                                    setIsInstaladorDropdownOpen(false);
                                                                }}
                                                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand/5 border border-brand/20 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/10 transition-all active:scale-[0.98]"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                                                </svg>
                                                                Añadir nuevo instalador
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {user?.rol === 'DISTRIBUIDOR' && (
                                            <div>
                                                <Label htmlFor="codInterno">Nº Cliente Interno (Dist.)</Label>
                                                <Input
                                                    id="codInterno"
                                                    placeholder="Ej: 33121..."
                                                    type="text"
                                                    value={codClienteInterno}
                                                    onChange={(e) => setCodClienteInterno(e.target.value)}
                                                />
                                                {conflictInstaller && (
                                                    <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                        <span>Este número ya está asignado a: <strong className="text-white">{conflictInstaller}</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        )}




                                        <div>
                                            <Label htmlFor="nota">Nota inicial (opcional)</Label>
                                            <textarea
                                                id="nota"
                                                rows="3"
                                                placeholder="Añade una nota que aparecerá en el historial de la oportunidad..."
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none text-sm"
                                                value={nota}
                                                onChange={(e) => setNota(e.target.value)}
                                            />
                                        </div>

                                        <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] flex justify-between items-center text-sm">
                                            <span className="text-white/40">Ref. Catastral</span>
                                            <span className="text-white font-mono font-bold tracking-tight">{inputs.rc || 'MANUAL'}</span>
                                        </div>
                                        <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] flex justify-between items-center text-sm">
                                            <span className="text-white/40">Demanda Estimada</span>
                                            <span className="text-white font-mono font-bold tracking-tight">{result?.q_net ? result.q_net.toFixed(2) : 0} kWh/m²</span>
                                        </div>
                                    </div>

                                    {error && (
                                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-8">
                                        <Button
                                            variant="secondary"
                                            className="flex-1"
                                            onClick={handleClose}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            className="flex-1 bg-brand-600 hover:bg-brand-500 text-bkg-deep shadow-brand-500/20 shadow-lg font-black"
                                            variant="primary"
                                            onClick={handleSaveInit}
                                            disabled={loading}
                                        >
                                            {loading ? 'Guardando...' : 'Guardar Datos'}
                                        </Button>
                                    </div>
                                </>
                            )}

                            {showConfirmation && !success && (
                                <div className="text-center py-2 animate-fade-in">
                                    <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-500/30">
                                        <span className="text-3xl text-brand">⚠️</span>
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">RC ya existente</h3>
                                    <p className="text-white/40 mb-6 text-sm">
                                        Ya existe una oportunidad guardada con la referencia catastral <strong className="text-white">{inputs.rc}</strong>. <br /><br />
                                        Si continúas, los datos actuales <strong className="text-brand-400 font-bold">se sobrescribirán por completo</strong>. ¿Estás seguro de que deseas guardar y sobrescribir?
                                    </p>

                                    {error && (
                                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-8">
                                        <Button
                                            variant="secondary"
                                            className="flex-1"
                                            onClick={() => setShowConfirmation(false)}
                                            disabled={loading}
                                        >
                                            Atrás
                                        </Button>
                                        <Button
                                            className="flex-1 bg-brand-600 hover:bg-brand-500 text-bkg-deep shadow-brand-500/20 shadow-lg font-black"
                                            variant="primary"
                                            onClick={executeSave}
                                            disabled={loading}
                                        >
                                            {loading ? 'Guardando...' : 'Sí, Sobrescribir'}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {success && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">¡Oportunidad Guardada!</h3>
                                    <p className="text-slate-400 mb-6">
                                        Este proyecto se ha registrado y está disponible en tu panel de administrador.
                                    </p>
                                    <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-8 inline-block">
                                        <p className="text-xs text-emerald-400/80 uppercase tracking-widest font-bold mb-1">ID Generado</p>
                                        <p className="text-xl font-mono font-black text-emerald-400">{savedOportunidadId}</p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        {!savedOportunidadData?.cliente_id && (
                                            <button
                                                onClick={() => setShowClienteModal(true)}
                                                className="w-full py-4 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-wider shadow-lg shadow-brand/20 hover:shadow-brand/30 transition-all active:scale-[0.98]"
                                            >
                                                Crear Cliente
                                            </button>
                                        )}
                                        <Button className="w-full bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10" onClick={handleClose}>
                                            Cerrar Ventana
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal crear cliente vinculado a esta oportunidad */}
            <ClienteFormModal
                isOpen={showClienteModal}
                onClose={() => setShowClienteModal(false)}
                oportunidad={savedOportunidadData ? {
                    id_oportunidad: savedOportunidadData.id_oportunidad,
                    referencia_cliente: referenciaCliente,
                    prescriptor_id: savedOportunidadData.prescriptor_id,
                    instalador_asociado_id: savedOportunidadData.instalador_asociado_id,
                    datos_calculo: { 
                        inputs,
                        cod_cliente_interno: codClienteInterno
                    }
                } : null}
                onSuccess={(cliente) => {
                    setShowClienteModal(false);
                    if (onClientLinked && cliente?.id_cliente) {
                        onClientLinked(cliente.id_cliente);
                    }
                    handleClose();
                }}
            />

            <PrescriptorDetailModal
                isOpen={showNewInstaladorModal}
                onClose={() => setShowNewInstaladorModal(false)}
                onCreated={(newInst) => {
                    console.log('[SaveOpportunityModal] Installer created/linked:', newInst);
                    // Recargar lista de instaladores para que aparezca el nuevo
                    const distId = user?.rol?.toUpperCase() === 'DISTRIBUIDOR' ? user.prescriptor_id : (selectedPrescriptor?.id_empresa || null);
                    if (distId) {
                        axios.get(`/api/prescriptores/${distId}/instaladores`)
                            .then(r => {
                                setInstaladores(r.data);
                                // Seleccionarlo automáticamente
                                setInstaladorId(newInst.id_empresa);
                            });
                    } else {
                        // Si por algún motivo no tenemos distId, al menos intentamos seleccionarlo
                        setInstaladorId(newInst.id_empresa);
                    }
                    setShowNewInstaladorModal(false);
                }}
            />
        </>
    );
}
