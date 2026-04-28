import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { CeeModule } from '../components/CeeModule';

import { InstalacionModule } from '../components/InstalacionModule';
import { EnvolventeModule } from '../components/EnvolventeModule';
import { DocumentacionModule } from '../components/DocumentacionModule';
import { EconomicoModule } from '../components/EconomicoModule';
import { ResumenEconomicoExpediente } from '../components/ResumenEconomicoExpediente';
import { 
    calculateSavings, 
    calculateFinancials,
    calculateRes080,
    calculateHybridization,
    BOILER_EFFICIENCIES 
} from '../../calculator/logic/calculation';
import { SeguimientoModule } from '../components/SeguimientoModule';
import { QuickNoteModal } from '../components/QuickNoteModal';

export const EXPEDIENTE_ESTADOS = [
    'PTE. CEE INICIAL',
    'PTE. FIN OBRA',
    'PTE. CEE FINAL',
    'PTE FIRMA ANEXOS',
    'PTE. CIFO BROKERGY',
    'PTE FIRMA CIFO',
    'PTE FIN EXPTE',
    'DOC. COMPLETA',
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO'
];

// ─── Acordeón de módulo ───────────────────────────────────────────────────────
function ModuleSection({ id, title, icon, activeSection, onToggle, children, badge, headerAction, leftAction }) {
    const isOpen = activeSection === id;
    return (
        <div className="border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="flex items-center bg-bkg-surface border-b border-white/5 pr-6 transition-all duration-300">
                {leftAction && (
                    <div className="pl-6">
                        {leftAction}
                    </div>
                )}
                <button
                    onClick={() => onToggle(isOpen ? null : id)}
                    className="flex-1 flex items-center justify-between px-6 py-4 hover:bg-bkg-hover transition-colors text-left"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-white/50">{icon}</span>
                        <span className="text-sm font-black text-white uppercase tracking-wider">{title}</span>
                        {badge && (
                            <span className="text-xs text-brand/80 bg-brand/10 px-2 py-0.5 rounded font-bold">{badge}</span>
                        )}
                    </div>
                </button>
                {headerAction}
                <button 
                    onClick={() => onToggle(isOpen ? null : id)}
                    className="p-2 text-white/30 hover:text-white transition-colors"
                >
                    <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>
            {isOpen && (
                <div className="p-6 border-t border-white/[0.06] bg-bkg-base/40">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Vista de Detalle ─────────────────────────────────────────────────────────
export function ExpedienteDetailView({ expedienteId, onBack, onNavigate }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const userRole = (user?.rol || '').toUpperCase();
    const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
    const isCertificador = userRole === 'CERTIFICADOR' || userRoleId === 4;
    const isAdmin = userRole === 'ADMIN' || userRoleId === 1;

    const [expediente, setExpediente] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null);
    const [activeSection, setActiveSection] = useState(null);
    const [certificadores, setCertificadores] = useState([]);

    // Estado "Live" para monitorización en tiempo real sin guardar
    const [liveCee, setLiveCee] = useState(null);
    const [liveInst, setLiveInst] = useState(null);
    const [liveDoc, setLiveDoc] = useState(null);
    const [liveSeguimiento, setLiveSeguimiento] = useState(null);
    const [showQuickNote, setShowQuickNote] = useState(false);

    // Carga de certificadores (utilizado en Header CEE y CeeModule)
    useEffect(() => {
        axios.get('/api/prescriptores')
            .then(res => {
                const list = (res.data || []).filter(p => p.tipo_empresa === 'CERTIFICADOR' || p.tipo_empresa === 'OTRO');
                setCertificadores(list);
            })
            .catch(err => console.error('Error fetching certificadores:', err));
    }, []);

    const fetchExpediente = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}`);
            setExpediente(data);
            // Inicializar datos live
            setLiveCee(data.cee || {});
            setLiveInst(data.instalacion || {});
            setLiveDoc(data.documentacion || {});
            setLiveSeguimiento(data.seguimiento || {});
        } catch (err) {
            setError('No se pudo cargar el expediente.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [expedienteId]);

    useEffect(() => { fetchExpediente(); }, [fetchExpediente]);

    const handleSave = useCallback(async (patch) => {
        setSaving(true);
        setSaveMsg(null);
        try {
            await axios.put(`/api/expedientes/${expedienteId}`, patch);
            
            await fetchExpediente(true); // Re-fetch silencioso para no desmontar componentes

            setSaveMsg({ type: 'ok', text: 'Guardado correctamente.' });
        } catch (err) {
            setSaveMsg({ type: 'error', text: err.response?.data?.error || 'Error al guardar.' });
        } finally {
            setSaving(false);
            setTimeout(() => {
                setSaveMsg(null);
            }, 2000);
        }
    }, [expedienteId, fetchExpediente]);
 
    const handleCeeSave = useCallback((ceePatch) => {
        // Al guardar CEE, también persistimos las fechas en Documentación.
        // Devolvemos la promise para que CeeModule pueda esperar antes de notificar al certificador.
        const patch = {
            ...ceePatch,
            documentacion: {
                ...liveDoc,
                fecha_visita_cee_inicial: ceePatch.cee.fecha_visita_cee_inicial || liveDoc?.fecha_visita_cee_inicial,
                fecha_firma_cee_inicial: ceePatch.cee.fecha_firma_cee_inicial || liveDoc?.fecha_firma_cee_inicial,
                fecha_visita_cee_final: ceePatch.cee.fecha_visita_cee_final || liveDoc?.fecha_visita_cee_final,
                fecha_firma_cee_final: ceePatch.cee.fecha_firma_cee_final || liveDoc?.fecha_firma_cee_final,
            }
        };
        return handleSave(patch);
    }, [handleSave, liveDoc]);

    const handleCeeLiveUpdate = useCallback((newCee) => {
        setLiveCee(newCee);
        // Sincronizar fechas con Documentación si vienen del XML
        setLiveDoc(prev => ({
            ...prev,
            fecha_visita_cee_inicial: newCee.fecha_visita_cee_inicial || prev?.fecha_visita_cee_inicial,
            fecha_firma_cee_inicial: newCee.fecha_firma_cee_inicial || prev?.fecha_firma_cee_inicial,
            fecha_visita_cee_final: newCee.fecha_visita_cee_final || prev?.fecha_visita_cee_final,
            fecha_firma_cee_final: newCee.fecha_firma_cee_final || prev?.fecha_firma_cee_final,
        }));
    }, []);

    const handleCeeAutoStatus = useCallback((key, value) => {
        handleSave({ 
            seguimiento: { 
                ...expediente?.seguimiento, 
                [key]: value 
            } 
        });
    }, [handleSave, expediente?.seguimiento]);

    const handleQuickNoteSave = async (text) => {
        try {
            const usuarioName = user.rol_nombre === 'ADMIN' 
                ? 'ADMINISTRADOR' 
                : (user.acronimo || user.razon_social || 'PARTNER');

            const newEntry = {
                id: Date.now().toString() + '_quick',
                tipo: 'comentario',
                texto: text,
                fecha: new Date().toISOString(),
                usuario: usuarioName
            };

            const docObj = expediente.documentacion || {};
            const hist = docObj.historial || [];
            
            await handleSave({
                documentacion: {
                    ...docObj,
                    historial: [...hist, newEntry]
                }
            });
            setShowQuickNote(false);
        } catch (err) {
            console.error('Error saving quick note:', err);
        }
    };

    const [showProgramSelect, setShowProgramSelect] = useState(false);

    const handleMigrateProgram = async (targetProgram) => {
        const confirmed = await showConfirm(
            `¿Estás seguro de que deseas cambiar este expediente a ${targetProgram}?\n\nEste proceso:\n1. Generará un NUEVO número de expediente oficial.\n2. RENOMBRARÁ la carpeta en Google Drive.\n3. ACTUALIZARÁ la ficha técnica (hibridación/reforma) en la calculadora.`,
            'Cambiar Programa',
            'warning'
        );
        
        if (!confirmed) return;
        
        try {
            setSaving(true);
            const { data } = await axios.patch(`/api/expedientes/${expedienteId}/regenerar-numero`, { targetProgram });
            if (data.success) {
                await fetchExpediente();
                setShowProgramSelect(false);
                showAlert('El expediente ha sido migrado correctamente al nuevo programa.', 'Migración Exitosa', 'success');
            }
        } catch (err) {
            showAlert('Error al migrar programa: ' + (err.response?.data?.error || err.message), 'Error de Migración', 'error');
        } finally {
            setSaving(false);
        }
    };

    // ─── Autosave se ha desactivado para Instalación/Económico por petición del usuario (ahora manual) ───

    // ─── Cálculo de resultados económicos en tiempo real ──────────────────────
    const calcResults = useMemo(() => {
        if (!expediente || !expediente.oportunidades) return null;
        
        const op = expediente.oportunidades;
        let ficha = op.ficha || 'RES060';
        
        if (expediente.numero_expediente && expediente.numero_expediente.includes('RES080')) {
            ficha = 'RES080';
        } else if (expediente.numero_expediente && expediente.numero_expediente.includes('RES093')) {
            ficha = 'RES093';
        }
        
        // PRIORIZAR ESTADO LIVE SOBRE EL DEL OBJETO EXPEDIENTE PERSISTIDO
        const cee = liveCee || expediente.cee || {};
        const inst = liveInst || expediente.instalacion || {};
        const opInputs = op.datos_calculo?.inputs || {};

        let savings = null;

        if (ficha === 'RES060' || ficha === 'RES093') {
            // 1. Datos base prioritarios: CEE Final > Oportunidad Comercial
            const ceeFinal = cee.cee_final || {};
            const superficie = parseFloat(ceeFinal.superficieHabitable) || parseFloat(op.datos_calculo?.surface) || 0;
            const q_net_heating = (parseFloat(ceeFinal.demandaCalefaccion) || 0) * superficie || parseFloat(op.datos_calculo?.Q_net) || 0;

            // Lógica Dual de ACS
            let dacs = 0;
            if (cee.acs_method === 'cte') {
                const numPeople = (parseInt(cee.num_rooms) || 4) + 1;
                // Fórmula CTE: 28 l/p·día * NP * 0.001162 kWh/kg·ºC * 365 días * 46 ºC ΔT
                dacs = 28 * numPeople * 0.001162 * 365 * 46;
            } else {
                dacs = (parseFloat(ceeFinal.demandaACS) || 0) * superficie || parseFloat(op.datos_calculo?.demand_acs) || 0;
            }

            if (superficie > 0 && q_net_heating > 0) {
                const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
                const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
                const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
                const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);
                // LOGICA HIBRIDACION
                let cb = 1;
                const calcInputs = op.datos_calculo?.inputs || {};
                // Si la ficha es RES093 o se ha activado el toggle localmente (en inputs o manual)
                if (ficha === 'RES093' || inst.hibridacion || calcInputs.hibridacion) {
                    const hybridRes = calculateHybridization({
                        demandAnnual: q_net_heating,
                        zone: op.datos_calculo?.zona || 'D3',
                        heatPumpPower: parseFloat(inst.potencia_bomba || calcInputs.potenciaBomba) || 0
                    });
                    cb = hybridRes.cb;
                }

                savings = calculateSavings({
                    q_net_heating,
                    dacs: inst.cambio_acs !== false ? dacs : 0,
                    boilerEff: boilerEffValue,
                    scopHeating,
                    scopAcs,
                    cb,
                    changeAcs: inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs?.aerotermia_db_id)
                });
            }
        } else if (ficha === 'RES080') {
            // Caso RES080: Basado en XML Inicial vs Final
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
                    savings = {
                        ...res080,
                        savingsKwh: res080.ahorroEnergiaFinalTotal // Normalizar nombre para Anexo I
                    };
                }
            }
        }

        if (!savings) return null;

        // 4. Ejecutar Cálculo Financiero (Bono CAE, IRPF, etc.)
        const overrides = inst.economico_override || {};
        const caePriceClientBase = overrides.cae_client_rate ?? (parseFloat(opInputs.cae_client_rate) || 95);
        const caePriceSOBase = overrides.cae_so_rate ?? (parseFloat(opInputs.cae_so_rate) || 160);
        const includeCommission = overrides.include_commission ?? !!opInputs.include_commission;
        const discountCertificates = overrides.discount_certificates ?? !!opInputs.discount_certificates;
        const includeLegalization = overrides.include_legalization ?? !!opInputs.include_legalization;
        const legalizationMode = overrides.legalization_mode ?? opInputs.legalization_mode ?? 'client';
        const certificatesCost = overrides.certificates_cost ?? opInputs.certificates_cost ?? 250;
        const presupuesto = overrides.presupuesto ?? (parseFloat(opInputs.presupuesto || opInputs.importe_total) || 0);

        const financials = calculateFinancials({
            presupuesto,
            savingsKwh: savings.savingsKwh || 0,
            caePriceClient: caePriceClientBase,
            caePriceSO: caePriceSOBase,
            caePricePrescriptor: includeCommission ? (parseFloat(overrides.cae_prescriptor_rate ?? opInputs.cae_prescriptor_rate) || 0) : 0,
            prescriptorMode: overrides.cae_prescriptor_mode ?? opInputs.cae_prescriptor_mode ?? 'brokergy',
            tipo: opInputs.housing_type === 'flat' ? 'piso' : 'unifamiliar',
            participation: parseFloat(opInputs.irpf_participation) || 100,
            numOwners: parseInt(opInputs.irpf_num_owners) || 1,
            discountCertificates,
            certificatesCost,
            includeLegalization,
            legalizationMode,
            includeIrpf: true
        });

        return {
            ...savings,
            ...financials,
            // Guardar para uso en UI
            profit_neto: financials.profitBrokergy
        };
    }, [expediente, liveCee, liveInst]);

    const assignedCertificador = useMemo(() => {
        const id = liveCee?.certificador_id || expediente?.cee?.certificador_id;
        if (!id) return null;
        return (certificadores || []).find(c => String(c.id_empresa) === String(id));
    }, [liveCee, expediente, certificadores]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-white/30 text-sm">Cargando expediente...</div>
            </div>
        );
    }

    if (error || !expediente) {
        return (
            <div className="p-8">
                <button onClick={onBack} className="text-white/40 hover:text-white text-sm mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Volver
                </button>
                <p className="text-red-400">{error || 'Expediente no encontrado.'}</p>
            </div>
        );
    }

    const op = expediente.oportunidades || {};
    const cliente = expediente.clientes || {};
    
    // Detección robusta de programa basada en el Nº DE EXPEDIENTE (La verdad absoluta del programa)
    const numero = expediente.numero_expediente || '';
    const isHybrid = numero.includes('RES093');
    const isReforma = numero.includes('RES080');
    const isSustitucion = numero.includes('RES060');
    
    const opInputs = op.datos_calculo?.inputs || {};
    const opCalcResult = op.datos_calculo?.result || {};
    const driveLink = op.datos_calculo?.drive_folder_link;

    return (
        <div className="p-6 sm:p-8 lg:p-10 min-h-full">
            {/* Header / breadcrumb */}
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                <div>
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors group mb-3"
                    >
                        <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-widest">Expedientes</span>
                    </button>

                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-black text-white uppercase tracking-tight">
                            Expediente
                        </h1>
                        <span className="font-mono text-brand font-bold text-lg">
                            {expediente.numero_expediente || expediente.id_oportunidad_ref || op.id_oportunidad || '—'}
                            {cliente && ` - ${cliente.nombre_razon_social} ${cliente.apellidos || ''}`.toUpperCase()}
                        </span>

                         {/* Selector de Estado Global */}
                         <div className="flex items-center gap-2 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] shadow-xl ml-2">
                              <div className="pl-3 text-white/20">
                                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                 </svg>
                              </div>
                              <select
                                 value={expediente.estado || 'PTE. CEE INICIAL'}
                                 onChange={(e) => handleSave({ estado: e.target.value })}
                                 className={`bg-transparent text-[10px] font-black uppercase tracking-widest focus:outline-none pr-4 py-1.5 appearance-none cursor-pointer transition-colors ${
                                     expediente.estado === 'FINALIZADO' ? 'text-emerald-400' : 
                                     expediente.estado?.includes('REQUERIMIENTO') ? 'text-red-400' : 'text-brand'
                                 }`}
                              >
                                 {EXPEDIENTE_ESTADOS.map(st => (
                                     <option key={st} value={st} className="bg-bkg-deep text-white">
                                         {st}
                                     </option>
                                 ))}
                              </select>
                         </div>

                         {/* Botón de Nota Rápida */}
                         <button
                            onClick={() => setShowQuickNote(true)}
                            className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-brand hover:border-brand/30 hover:bg-brand/5 transition-all shadow-lg group"
                            title="Añadir nota rápida"
                         >
                            <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                         </button>

                        <div className="relative">
                            <button 
                                onClick={() => isAdmin && setShowProgramSelect(!showProgramSelect)}
                                className={`flex items-center gap-1 transition-all group ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                                {isHybrid ? (
                                    <span className="text-[10px] font-black text-indigo-400 bg-indigo-400/10 px-2.5 py-1 rounded uppercase tracking-wider border border-indigo-400/20 group-hover:border-indigo-400/40">RES093 — Hibridación</span>
                                ) : isReforma ? (
                                    <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded uppercase tracking-wider border border-emerald-500/20 group-hover:border-emerald-500/40">RES080 — Reforma</span>
                                ) : (
                                    <span className="text-[10px] font-black text-brand/80 bg-brand/10 px-2.5 py-1 rounded uppercase tracking-wider border border-brand/20 group-hover:border-brand/40">RES060 — Sustitución</span>
                                )}
                                
                                {user?.rol === 'ADMIN' && (
                                    <svg className={`w-3 h-3 text-white/20 group-hover:text-white/40 transition-transform ${showProgramSelect ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                    </svg>
                                )}
                            </button>

                            {showProgramSelect && (
                                <>
                                    <div className="fixed inset-0 z-[110]" onClick={() => setShowProgramSelect(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-bkg-deep border border-white/10 rounded-xl shadow-2xl z-[120] overflow-hidden animate-in fade-in zoom-in duration-200">
                                        <div className="p-2 border-b border-white/5 bg-white/5">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2 py-1">Cambiar Programa a:</p>
                                        </div>
                                        <button 
                                            onClick={() => handleMigrateProgram('RES060')}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 text-left transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-brand uppercase tracking-wider">RES060</span>
                                                <span className="text-[10px] text-white/40 uppercase font-black">Sustitución Estándar</span>
                                            </div>
                                            {!isHybrid && !isReforma && <div className="w-1.5 h-1.5 bg-brand rounded-full" />}
                                        </button>
                                        <button 
                                            onClick={() => handleMigrateProgram('RES080')}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 text-left border-t border-white/5 transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">RES080</span>
                                                <span className="text-[10px] text-white/40 uppercase font-black">Reforma Energética</span>
                                            </div>
                                            {isReforma && <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />}
                                        </button>
                                        <button 
                                            onClick={() => handleMigrateProgram('RES093')}
                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 text-left border-t border-white/5 transition-colors"
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">RES093</span>
                                                <span className="text-[10px] text-white/40 uppercase font-black">Hibridación</span>
                                            </div>
                                            {isHybrid && <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 mt-2">
                        {/* Nombre del Cliente */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button 
                                onClick={() => !isCertificador && onNavigate?.('clientes', { cliente_id: cliente.id_cliente }, expediente.id)}
                                className={`text-white transition-colors text-base font-black text-left ${isCertificador ? 'cursor-default' : 'hover:text-brand'}`}
                                title={isCertificador ? '' : 'Ir a ficha de cliente'}
                            >
                                {cliente.nombre_razon_social}
                                {cliente.apellidos && ` ${cliente.apellidos}`}
                            </button>
                            
                            {!isCertificador && (
                                <div className="flex items-center gap-2">
                                    <span className="text-white/20 text-xs">·</span>
                                    <button 
                                        onClick={() => !isCertificador && onNavigate?.('oportunidades', op, expediente.id)}
                                        className={`text-white/40 transition-colors text-xs font-mono font-bold ${isCertificador ? 'cursor-default' : 'hover:text-brand'}`}
                                        title={isCertificador ? '' : 'Ir a oportunidad'}
                                    >
                                        {op.id_oportunidad || 'OP—'}
                                        {op.referencia_cliente && ` · ${op.referencia_cliente}`}
                                    </button>
                                    <span className="text-white/20 text-xs">·</span>
                                    <span className="text-white/30 text-[10px] font-black uppercase tracking-wider">
                                        Creado: {expediente.created_at ? new Date(expediente.created_at).toLocaleDateString('es-ES') : '—'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Dirección Housing (Vivienda) */}
                        <p className="text-[11px] text-white/50 font-bold uppercase tracking-widest leading-none mt-1">
                            {`${opInputs.direccion || opInputs.address || 'DIRECCIÓN NO DEFINIDA'}, ${opInputs.cp || cliente.codigo_postal || ''}, ${opInputs.municipio || cliente.municipio || ''} (${opInputs.provincia || cliente.provincia || ''})`.toUpperCase()}
                        </p>

                        {/* Contacto y DNI */}
                        <div className="flex items-center gap-4 flex-wrap mt-0.5">
                            {cliente.tlf && (
                                <span className="text-white/40 text-[11px] font-bold flex items-center gap-1.5">
                                    <svg className="w-3 h-3 text-brand/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {cliente.tlf}
                                </span>
                            )}
                            {cliente.email && (
                                <span className="text-white/40 text-[11px] font-bold flex items-center gap-1.5">
                                    <svg className="w-3 h-3 text-brand/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {cliente.email}
                                </span>
                            )}
                            {cliente.dni && (
                                <span className="text-white/20 text-[10px] font-black uppercase tracking-widest leading-none">
                                    DNI: {cliente.dni}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Indicador de Sincronización (Autosave) */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
                        {saving ? (
                            <>
                                <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                                <span className="text-[10px] font-black text-brand uppercase tracking-widest">Sincronizando</span>
                            </>
                        ) : saveMsg?.type === 'ok' ? (
                            <>
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Guardado</span>
                            </>
                        ) : (
                            <>
                                <div className="w-2 h-2 bg-white/20 rounded-full" />
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Al día</span>
                            </>
                        )}
                    </div>

                    {/* Acceso Drive */}
                    {driveLink && isAdmin && (
                        <a
                            href={driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/10 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            Drive
                        </a>
                    )}
                </div>
            </div>

            {/* Panel de Resumen Económico Sticky (Solo RES060) */}
            {calcResults && !isCertificador && (
                <div className="sticky top-0 z-[100] -mx-6 sm:-mx-8 lg:-mx-10 px-6 sm:px-8 lg:px-10 py-4 bg-bkg-base/60 backdrop-blur-xl border-b border-white/[0.05] mb-6 shadow-2xl">
                    <ResumenEconomicoExpediente 
                        results={calcResults} 
                        onUpdatePrice={(newPrice) => {
                            const newInst = { 
                                ...liveInst, 
                                economico_override: { 
                                    ...liveInst?.economico_override, 
                                    cae_client_rate: newPrice 
                                } 
                            };
                            setLiveInst(newInst);
                            handleSave({ instalacion: newInst });
                        }}
                    />
                </div>
            )}

            {/* Toast de guardado */}
            {saveMsg && (
                <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    saveMsg.type === 'ok'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                    {saveMsg.text}
                </div>
            )}

            {/* Módulos en acordeón */}
            <div className="space-y-3">



                <ModuleSection
                    id="seguimiento"
                    title="Control de Seguimiento"
                    icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    }
                    activeSection={activeSection}
                    onToggle={setActiveSection}
                    badge="Roadmap"
                >
                    <SeguimientoModule 
                        expediente={expediente}
                        onSave={handleSave}
                        saving={saving}
                        readOnly={isCertificador}
                    />
                </ModuleSection>

                <ModuleSection
                    id="cee"
                    title="Certificado de Eficiencia Energética"
                    icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                    }
                    activeSection={activeSection}
                    onToggle={setActiveSection}
                    badge={expediente.cee?.tipo === 'xml' ? 'XML' : 'Aportado'}
                    headerAction={
                        assignedCertificador && (
                            <div className="hidden md:flex items-center gap-2 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-xl ml-4 mr-2 group/cert">
                                <svg className="w-3.5 h-3.5 text-white/30 group-hover/cert:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover/cert:text-white transition-colors">
                                    {assignedCertificador.razon_social || assignedCertificador.acronimo}
                                </span>
                            </div>
                        )
                    }
                >
                    <CeeModule
                        expediente={expediente}
                        onSave={handleCeeSave}
                        onLiveUpdate={handleCeeLiveUpdate}
                        saving={saving}
                        certificadores={certificadores}
                        onAutoStatus={handleCeeAutoStatus}
                    />
                </ModuleSection>

                <ModuleSection
                    id="instalacion"
                    title="Instalación"
                    icon={
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    }
                    activeSection={activeSection}
                    onToggle={setActiveSection}
                    headerAction={
                        (JSON.stringify(liveInst || {}) !== JSON.stringify(expediente.instalacion || {})) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSave({ instalacion: liveInst });
                                }}
                                disabled={saving}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    saving ? 'bg-orange-500/10 text-orange-500/50' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 active:scale-95 animate-in fade-in zoom-in duration-300'
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                {saving ? 'Guardando...' : 'Guardar Datos'}
                            </button>
                        )
                    }
                >
                    <InstalacionModule
                        expediente={expediente}
                        onSave={handleSave}
                        onLiveUpdate={setLiveInst}
                        saving={saving}
                        readOnly={isCertificador}
                    />
                </ModuleSection>

                {isReforma && (
                    <ModuleSection
                        id="envolvente"
                        title="Envolvente"
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        }
                        activeSection={activeSection}
                        onToggle={setActiveSection}
                        headerAction={
                            (JSON.stringify(liveDoc?.envolvente || {}) !== JSON.stringify(expediente.documentacion?.envolvente || {})) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSave({ documentacion: liveDoc });
                                    }}
                                    disabled={saving}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        saving ? 'bg-orange-500/10 text-orange-500/50' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 active:scale-95 animate-in fade-in zoom-in duration-300'
                                    }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {saving ? 'Guardando...' : 'Guardar Datos'}
                                </button>
                            )
                        }
                    >
                        <EnvolventeModule
                            expediente={expediente}
                            onSave={handleSave}
                            onLiveUpdate={setLiveDoc}
                            saving={saving}
                            readOnly={isCertificador}
                        />
                    </ModuleSection>
                )}

                {!isCertificador && (
                    <ModuleSection
                        id="documentacion"
                        title="Documentación"
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        }
                        activeSection={activeSection}
                        onToggle={setActiveSection}
                        headerAction={
                            (JSON.stringify(liveDoc || {}) !== JSON.stringify(expediente.documentacion || {})) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSave({ documentacion: liveDoc });
                                    }}
                                    disabled={saving}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        saving ? 'bg-orange-500/10 text-orange-500/50' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 active:scale-95 animate-in fade-in zoom-in duration-300'
                                    }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {saving ? 'Guardando...' : 'Guardar Datos'}
                                </button>
                            )
                        }
                    >
                        <DocumentacionModule
                            expediente={expediente}
                            onSave={handleSave}
                            onLiveUpdate={setLiveDoc}
                            saving={saving}
                            results={calcResults}
                        />
                    </ModuleSection>
                )}

                {!isCertificador && (
                    <ModuleSection
                        id="economico"
                        title="Datos Económicos"
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        }
                        activeSection={activeSection}
                        onToggle={setActiveSection}
                        badge="CAE"
                        headerAction={
                            (JSON.stringify(liveInst?.economico_override || {}) !== JSON.stringify(expediente.instalacion?.economico_override || {})) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSave({ instalacion: liveInst });
                                    }}
                                    disabled={saving}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        saving ? 'bg-orange-500/10 text-orange-500/50' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 active:scale-95 animate-in fade-in zoom-in duration-300'
                                    }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {saving ? 'Guardando...' : 'Guardar Datos'}
                                </button>
                            )
                        }
                    >
                        <EconomicoModule
                            expediente={expediente}
                            results={calcResults}
                            onSave={handleSave}
                            onLiveUpdate={setLiveInst}
                            saving={saving}
                        />
                    </ModuleSection>
                )}
            </div>

            <QuickNoteModal
                isOpen={showQuickNote}
                onClose={() => setShowQuickNote(false)}
                onSave={handleQuickNoteSave}
                saving={saving}
            />
        </div>
    );
}
