import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { CeeModule } from '../components/CeeModule';

import { InstalacionModule } from '../components/InstalacionModule';
import { EnvolventeModule } from '../components/EnvolventeModule';
import { DocumentacionModule } from '../components/DocumentacionModule';
import { ChecklistModule } from '../components/ChecklistModule';
import { EconomicoModule } from '../components/EconomicoModule';
import { ResumenEconomicoExpediente } from '../components/ResumenEconomicoExpediente';
import {
    calculateSavings,
    calculateFinancials,
    calculateRes080,
    calculateRes080FromEmissions,
    calculateHybridization,
    BOILER_EFFICIENCIES
} from '../../calculator/logic/calculation';
import { calculateRes060FC } from '../../calculator/logic/res060fc';
import { SeguimientoModule } from '../components/SeguimientoModule';
import { ComunicacionesCertificador } from '../components/ComunicacionesCertificador';
import { HistorialModal } from '../../../components/HistorialModal';
import { IncidenciasModal } from '../components/IncidenciasModal';
import { DocsAdminModal } from '../../calculator/components/DocsAdminModal';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';
import { LoteDetailModal } from '../../lotes/components/LoteDetailModal';
import { FechasPrevistasEjecucion } from '../components/FechasPrevistasEjecucion';

export const EXPEDIENTE_ESTADOS = [
    'PTE. CEE INICIAL',
    'EN CERTIFICADOR CEE INICIAL',
    'PTE. FIN OBRA',
    'PTE. CEE FINAL',
    'EN CERTIFICADOR CEE FINAL',
    'PTE FIRMA ANEXOS',
    'PTE. CIFO BROKERGY',
    'PTE FIRMA CIFO',
    'PTE FIN EXPTE',
    'DOC. COMPLETA',
    'DOC. COMPLETA APPSHEET',
    'PENDIENTE REVISAR EXPTE',
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
    // Equipo interno: opera el expediente (el TRABAJADOR también, sin ver margen).
    const isStaff = isAdmin || userRole === 'TRABAJADOR' || userRoleId === 8;

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
    const [showIncidencias, setShowIncidencias] = useState(false);
    const [showFotos, setShowFotos] = useState(false);
    const [showClienteModal, setShowClienteModal] = useState(false);
    const [openLoteId, setOpenLoteId] = useState(null);
    const [localPrioridad, setLocalPrioridad] = useState('NORMAL');

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
            setLocalPrioridad(data.prioridad || 'NORMAL');
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

    // Al entrar en un expediente, el contenedor <main> (scroll del layout) puede seguir
    // en la posición donde se dejó la lista — forzamos que la vista empiece arriba.
    const rootRef = useRef(null);
    const scrolledRef = useRef(null);
    useEffect(() => {
        if (!loading && expediente && scrolledRef.current !== expedienteId) {
            scrolledRef.current = expedienteId;
            rootRef.current?.scrollIntoView({ block: 'start' });
        }
    }, [expedienteId, loading, expediente]);

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

    // ─── Abrir la carpeta LOCAL de Windows (solo ADMIN) ───────────────────────
    // Los navegadores bloquean abrir rutas file:// directamente desde una web, así
    // que: el backend reconstruye la ruta local (espejo de Drive para escritorio) y
    // lanzamos el protocolo personalizado "brokergylocal:" (registrado una vez con
    // brokergylocal_setup.reg → handler .vbs vía wscript, SIN consola). Abre el
    // Explorador directamente, sin modal. La ruta se copia al portapapeles en
    // silencio como respaldo. El path va en base64url (con padding '=') para evitar
    // problemas de espacios/acentos/barras en la URL del protocolo.
    const [localPathLoading, setLocalPathLoading] = useState(false);
    const handleOpenLocalFolder = useCallback(async () => {
        try {
            setLocalPathLoading(true);
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/local-path`);
            const path = data?.path;
            if (!path) { showAlert('No se pudo obtener la ruta local del expediente.', 'Carpeta local', 'error'); return; }

            // Respaldo silencioso: copiar la ruta al portapapeles
            try { await navigator.clipboard.writeText(path); } catch (e) { /* contexto no seguro */ }

            // Abrir el Explorador vía protocolo brokergylocal: (directo, sin modal)
            const b64url = btoa(unescape(encodeURIComponent(path)))
                .replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            const msg = err?.response?.data?.error || 'No se pudo resolver la ruta local.';
            showAlert(msg, 'Carpeta local', 'error');
        } finally {
            setLocalPathLoading(false);
        }
    }, [expedienteId, showAlert]);

    const handlePrioridadChange = async (newPrio) => {
        setLocalPrioridad(newPrio);
        try {
            await axios.patch(`/api/expedientes/${expedienteId}/prioridad`, { prioridad: newPrio });
        } catch (err) {
            console.error('[prioridad]', err.message);
        }
    };

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

    // Acepta un objeto con varias claves (`{ fecha_registro_cee_inicial, cee_inicial,
    // estado }`) y las reparte en UN ÚNICO guardado. Admite también la forma antigua
    // (key, value) por compatibilidad con las llamadas sueltas que aún existen.
    //
    // Es importante que sea un solo PUT: si se lanzan varios, cada uno se construye
    // desde la misma copia del expediente y se pisan entre sí.
    const handleCeeAutoStatus = useCallback((keyOrPatch, value) => {
        const patch = typeof keyOrPatch === 'object' && keyOrPatch !== null
            ? keyOrPatch
            : { [keyOrPatch]: value };

        const cambios = {};
        const seguimiento = {};
        const documentacion = {};

        for (const [key, val] of Object.entries(patch)) {
            if (key === 'estado') cambios.estado = val;
            // Claves fecha_* van a documentacion (ej: fecha_registro_cee_inicial).
            // Esto garantiza que los flags cee_ini/fin_registro_ok de la vista SQL
            // sean correctos.
            else if (key.startsWith('fecha_')) documentacion[key] = val;
            else seguimiento[key] = val;
        }

        if (Object.keys(seguimiento).length) {
            cambios.seguimiento = { ...expediente?.seguimiento, ...seguimiento };
        }
        if (Object.keys(documentacion).length) {
            cambios.documentacion = { ...expediente?.documentacion, ...documentacion };
        }

        if (Object.keys(cambios).length) handleSave(cambios);
    }, [handleSave, expediente?.seguimiento, expediente?.documentacion]);

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
        // Ficha RES060FC (propuesta de nueva normativa): cálculo paralelo con las
        // variables REALES del expediente. Se rellena en la rama RES060/RES093.
        let res060fcRaw = null;
        let res060fcCtx = null;

        if (ficha === 'RES060' || ficha === 'RES093') {
            // Elegir el CEE que corresponde: si el CEE FINAL ya está cargado, su demanda
            // y superficie son las definitivas y mandan sobre el inicial (los documentos
            // —CIFO, fichas RES— ya usan el final, así que el panel debe reflejar el mismo).
            // Mientras no haya final, el inicial da el ahorro estimado.
            const ceeFinalValido = cee.cee_final && parseFloat(cee.cee_final.demandaCalefaccion) > 0;
            const ceeBase = ceeFinalValido ? cee.cee_final : (cee.cee_inicial || cee.cee_final || {});
            const superficie = parseFloat(ceeBase.superficieHabitable) || parseFloat(op.datos_calculo?.surface) || 0;
            const q_net_heating = (parseFloat(ceeBase.demandaCalefaccion) || 0) * superficie || parseFloat(op.datos_calculo?.Q_net) || 0;

            // Lógica Dual de ACS
            let dacs = 0;
            if (cee.acs_method === 'cte') {
                const numPeople = (parseInt(cee.num_rooms) || 4) + 1;
                // Fórmula CTE: 28 l/p·día * NP * 0.001162 kWh/kg·ºC * 365 días * 46 ºC ΔT
                dacs = 28 * numPeople * 0.001162 * 365 * 46;
            } else {
                dacs = (parseFloat(ceeBase.demandaACS) || 0) * superficie || parseFloat(op.datos_calculo?.demand_acs) || 0;
            }

            if (superficie > 0 && q_net_heating > 0) {
                const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
                const boilerEffValue = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.65;
                const scopHeating = parseFloat(inst.aerotermia_cal?.scop) || 3.2;
                const scopAcs = inst.misma_aerotermia_acs ? scopHeating : (parseFloat(inst.aerotermia_acs?.scop) || 2.5);
                // LOGICA HIBRIDACION
                let cb = 1;
                const calcInputs = op.datos_calculo?.inputs || {};
                // El toggle explícito (activado/desactivado por el usuario) manda sobre el default de la ficha.
                // Solo si no hay toggle explícito guardado, RES093 activa hibridación por defecto.
                const hibridActive = (inst.hibridacion ?? calcInputs.hibridacion) ?? (ficha === 'RES093');
                if (hibridActive) {
                    const hybridRes = calculateHybridization({
                        demandAnnual: q_net_heating,
                        zone: op.datos_calculo?.zona || 'D3',
                        heatPumpPower: parseFloat(inst.potencia_bomba || calcInputs.potenciaBomba) || 0
                    });
                    cb = hybridRes.cb;
                }

                const changeAcsFlag = inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs?.aerotermia_db_id);

                savings = calculateSavings({
                    q_net_heating,
                    dacs: inst.cambio_acs !== false ? dacs : 0,
                    boilerEff: boilerEffValue,
                    scopHeating,
                    scopAcs,
                    cb,
                    changeAcs: changeAcsFlag
                });

                // ── Ficha RES060FC (propuesta) con las variables reales del expediente ──
                // Demanda del Anexo IV (provincia + año + tipología), mismo η y SCOP,
                // CEF = consumo previo estimado (finalEnergyOld del cálculo de ahorro).
                const tipoFC = opInputs.tipo || (opInputs.housing_type === 'flat' ? 'piso' : 'unifamiliar');
                res060fcRaw = calculateRes060FC({
                    provinciaCode: opInputs.provincia || opInputs.provinceCode,
                    anio: opInputs.anio || op.datos_calculo?.anio,
                    tipo: tipoFC,
                    superficie,
                    boilerEff: boilerEffValue,
                    scopHeating,
                    scopAcs,
                    changeAcs: changeAcsFlag,
                    dacs,
                    cef: savings.finalEnergyOld,
                });
                // Contexto para el popup de desglose (mismas unidades que la calculadora).
                res060fcCtx = { scopHeating, scopAcs, changeAcs: changeAcsFlag, dacs };
            }
        } else if (ficha === 'RES080') {
            // Caso RES080: emisiones manuales (sin .xml) o XML Inicial vs Final.
            // El backend puede guardar cee_source en MAYÚSCULAS → comparar en minúsculas.
            const ceeSourceManual = String(cee.cee_source || '').toLowerCase() === 'manual';
            let res080 = null;
            if (ceeSourceManual && cee.emisiones_manual) {
                const em = cee.emisiones_manual;
                const supFallback = cee.superficie_manual || op.datos_calculo?.surface;
                res080 = calculateRes080FromEmissions({
                    emiAcsIni: em.acs_ini, emiAcsFin: em.acs_fin,
                    emiCalIni: em.cal_ini, emiCalFin: em.cal_fin,
                    emiRefIni: em.ref_ini, emiRefFin: em.ref_fin,
                    combAcsInicial: cee.comb_acs_inicial,
                    combAcsFinal: cee.comb_acs_final,
                    combCalefaccionInicial: cee.comb_cal_inicial,
                    combCalefaccionFinal: cee.comb_cal_final,
                    combRefrigeracionInicial: cee.comb_ref_inicial,
                    combRefrigeracionFinal: cee.comb_ref_final,
                    superficieInicial: cee.superficie_manual_inicial || supFallback,
                    superficieFinal: cee.superficie_manual_final || cee.superficie_manual_inicial || supFallback
                });
            } else if (cee.cee_inicial && cee.cee_final) {
                res080 = calculateRes080({
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
            }
            if (res080) {
                savings = {
                    ...res080,
                    savingsKwh: res080.ahorroEnergiaFinalTotal // Normalizar nombre para Anexo I
                };
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

        // Argumentos económicos comunes (todo menos el VOLUMEN de ahorro, que puede
        // ser el ESTIMADO del CEE o el VERIFICADO por el verificador — ver abajo).
        const finArgs = {
            presupuesto,
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
        };

        // Economía ESTIMADA (dinámica): se calcula con el ahorro del CEE, exactamente
        // como hasta ahora. Es read-only y se recalcula si cambia el CEE / SCOP / etc.
        const financials = calculateFinancials({ ...finArgs, savingsKwh: savings.savingsKwh || 0 });

        // ── Ahorro VERIFICADO (verificador, p. ej. Marwen) ───────────────────────
        // Campo MANUAL e independiente. NO sustituye al estimado: es un dato aparte
        // que persiste y sobre el que se calcula el pago real al cliente y el margen.
        const verif = inst.verificacion || {};
        const verifRaw = verif.ahorro_verificado_kwh;
        const ahorroVerificadoKwh = (verifRaw !== null && verifRaw !== undefined && verifRaw !== '')
            ? (parseFloat(verifRaw) || 0)
            : null;
        const financialsVerificado = ahorroVerificadoKwh != null
            ? calculateFinancials({ ...finArgs, savingsKwh: ahorroVerificadoKwh })
            : null;

        // ── Financieros de la ficha RES060FC (mismas reglas que el estimado) ──
        // Solo si hay cálculo válido (provincia disponible + Anexo IV con dato).
        let financialsRes060FC = null;
        if (res060fcRaw && res060fcRaw.cae > 0) {
            financialsRes060FC = calculateFinancials({ ...finArgs, savingsKwh: res060fcRaw.cae });
        }

        return {
            ...savings,
            ...financials,
            // Guardar para uso en UI
            profit_neto: financials.profitBrokergy,
            // ── Verificación de ahorro (campo manual, mostrado junto al estimado) ──
            savingsKwhVerificado: ahorroVerificadoKwh,
            caeBonusVerificado: financialsVerificado ? financialsVerificado.caeBonus : null,
            profitBrokergyVerificado: financialsVerificado ? financialsVerificado.profitBrokergy : null,
            // ── Ficha RES060FC (propuesta de nueva normativa) ──
            res060fc: res060fcRaw,
            financialsRes060FC,
            res060fcInputs: res060fcCtx ? {
                scopHeating: res060fcCtx.scopHeating,
                scopAcs: res060fcCtx.scopAcs,
                changeAcs: res060fcCtx.changeAcs,
                dacs: res060fcCtx.dacs,
                caePriceClient: finArgs.caePriceClient,
            } : null,
        };
    }, [expediente, liveCee, liveInst]);

    // Mientras no haya CEE cargado el expediente no tiene ahorro propio, pero SÍ
    // hereda como supuesto la economía que se le presentó al cliente en la
    // oportunidad. Sirve para saber de qué ahorro disponemos antes de arrancar.
    //
    // Se toman los importes GUARDADOS, sin recalcular: los expedientes migrados de
    // AppSheet no traen `cae_client_rate` en inputs (su precio pactado real fue de
    // 52 a 80 €/MWh), así que un recálculo caería al default de 95 €/MWh e inflaría
    // la ayuda al cliente y el margen. Mismo criterio que la lista de expedientes
    // (`expedienteFinancials.estimadoGuardado`).
    //
    // Alimenta SOLO el panel de resumen. Los documentos oficiales (Anexo I, fichas
    // RES, CIFO) siguen recibiendo `calcResults`, para que ninguno pueda emitirse
    // con un ahorro supuesto en lugar del real del CEE.
    const resumenResults = useMemo(() => {
        if (calcResults) return calcResults;
        const opResult = expediente?.oportunidades?.datos_calculo?.result || {};
        const opFin = opResult.financials || {};
        const heredadoKwh = parseFloat(
            opResult.savings?.savingsKwh ?? opFin.ahorroKwh ?? opResult.savingsKwh
        );
        if (!(heredadoKwh > 0)) return null;
        // Los financials antiguos no guardaban `finalPriceClient`; se deriva del
        // CAE pagado y el ahorro para no pintar un precio de 0 €/MWh.
        const precioImplicito = opFin.caeBonus > 0 ? opFin.caeBonus / (heredadoKwh / 1000) : 0;
        return {
            ...opResult.savings,
            ...opFin,
            savingsKwh: heredadoKwh,
            finalPriceClient: opFin.finalPriceClient ?? precioImplicito,
            profit_neto: opFin.profitBrokergy ?? 0,
            ahorroHeredado: true,
            savingsKwhVerificado: null,
            caeBonusVerificado: null,
            profitBrokergyVerificado: null
        };
    }, [calcResults, expediente]);

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

    // Incidencias detectadas (control de calidad — solo ADMIN). Viven en documentacion.incidencias[].
    const incidenciasList = expediente.documentacion?.incidencias || [];
    const incidenciasAbiertas = incidenciasList.filter(i => i.estado !== 'SUBSANADA').length;
    const incidenciasGraves = incidenciasList.filter(i => i.estado !== 'SUBSANADA' && i.severidad === 'GRAVE').length;

    // Detección robusta de programa basada en el Nº DE EXPEDIENTE (La verdad absoluta del programa)
    const numero = expediente.numero_expediente || '';
    const isHybrid = numero.includes('RES093');
    const isReforma = numero.includes('RES080');
    const isSustitucion = numero.includes('RES060');
    
    const opInputs = op.datos_calculo?.inputs || {};
    const opCalcResult = op.datos_calculo?.result || {};
    const driveLink = op.datos_calculo?.drive_folder_link;

    // Propuesta económica original que se presentó al cliente en la oportunidad.
    // Estructura canónica: result.savings.* + result.financials.* (con fallback a campos planos).
    // Se pasa al resumen económico para compararla de un vistazo con los datos vivos del expediente.
    const proposalResults = (() => {
        const fin = opCalcResult.financials || {};
        const sav = opCalcResult.savings || {};
        if (!opCalcResult.financials && !opCalcResult.savings && opCalcResult.caeBonus === undefined) return null;
        return {
            savingsKwh: sav.savingsKwh ?? opCalcResult.savingsKwh ?? 0,
            caeBonus: fin.caeBonus ?? opCalcResult.caeBonus ?? 0,
            finalPriceClient: fin.finalPriceClient ?? opCalcResult.finalPriceClient ?? 0,
            profitBrokergy: fin.profitBrokergy ?? opCalcResult.profitBrokergy ?? 0,
        };
    })();

    return (
        <div ref={rootRef} className="p-6 sm:p-8 lg:p-10 min-h-full max-md:pb-24">
            {/* Panel de Resumen Económico Sticky (Solo RES060) — ARRIBA DEL TODO.
                Va como primer elemento y con -mt para quedar pegado al borde superior;
                sticky top-0 lo mantiene fijo al hacer scroll. Importes = SOLO ADMIN. */}
            {resumenResults && isAdmin && (
                <div className="sticky top-0 z-[100] -mt-6 sm:-mt-8 lg:-mt-10 -mx-6 sm:-mx-8 lg:-mx-10 px-6 sm:px-8 lg:px-10 py-3 md:py-2 bg-bkg-base/60 backdrop-blur-xl border-b border-white/[0.05] mb-6 md:mb-4 shadow-2xl max-md:fixed max-md:bottom-0 max-md:inset-x-0 max-md:top-auto max-md:mt-0 max-md:mx-0 max-md:px-3 max-md:py-2 max-md:mb-0 max-md:border-0 max-md:bg-transparent max-md:backdrop-blur-none max-md:shadow-none max-md:rounded-none">
                    <ResumenEconomicoExpediente
                        results={resumenResults}
                        proposal={proposalResults}
                        onLivePrice={(newPrice) => {
                            // Reflejo en vivo (sin persistir) mientras se edita el precio
                            // arriba: actualiza el cálculo y el módulo "Datos Económicos".
                            setLiveInst(prev => ({
                                ...(prev || {}),
                                economico_override: {
                                    ...(prev?.economico_override || {}),
                                    cae_client_rate: newPrice
                                }
                            }));
                        }}
                        onUpdatePrice={(newPrice) => {
                            // Confirmar = persistir en el expediente.
                            const base = liveInst || expediente.instalacion || {};
                            const newInst = {
                                ...base,
                                economico_override: {
                                    ...(base.economico_override || {}),
                                    cae_client_rate: newPrice
                                }
                            };
                            setLiveInst(newInst);
                            handleSave({ instalacion: newInst });
                        }}
                        onLiveVerified={(val) => {
                            // Reflejo en vivo (sin persistir) del ahorro verificado mientras
                            // se edita: recalcula pago al cliente y margen al momento. El dato
                            // se introduce en kWh (= CAEs), tal cual lo da el verificador.
                            const kwh = (val === null || val === '' || isNaN(val)) ? null : Math.round(parseFloat(val));
                            setLiveInst(prev => {
                                const base = prev || expediente.instalacion || {};
                                return {
                                    ...base,
                                    verificacion: { ...(base.verificacion || {}), ahorro_verificado_kwh: kwh }
                                };
                            });
                        }}
                        onUpdateVerified={(val) => {
                            // Confirmar = persistir el ahorro VERIFICADO (campo manual e
                            // independiente del estimado), en kWh. Fuente del dato: verificador (Marwen).
                            const base = liveInst || expediente.instalacion || {};
                            const prevVerif = base.verificacion || {};
                            const kwh = (val === null || val === '' || isNaN(val)) ? null : Math.round(parseFloat(val));
                            const newInst = {
                                ...base,
                                verificacion: {
                                    ...prevVerif,
                                    ahorro_verificado_kwh: kwh,
                                    fuente: 'MARWEN',
                                    fecha: new Date().toISOString(),
                                    registrado_por: user?.email || user?.nombre || null
                                }
                            };
                            setLiveInst(newInst);
                            handleSave({ instalacion: newInst });
                        }}
                    />
                </div>
            )}

            {/* Aviso de incidencias abiertas (solo ADMIN) */}
            {isAdmin && incidenciasAbiertas > 0 && (
                <button
                    onClick={() => setShowIncidencias(true)}
                    className={`w-full mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        incidenciasGraves > 0
                            ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_14px_rgba(239,68,68,0.25)] hover:bg-red-500/15'
                            : 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_14px_rgba(245,158,11,0.18)] hover:bg-amber-500/15'
                    }`}
                >
                    <span className="flex items-center gap-3">
                        <svg className={`w-5 h-5 shrink-0 ${incidenciasGraves > 0 ? 'text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.85)]' : 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className={`text-sm font-bold ${incidenciasGraves > 0 ? 'text-red-300' : 'text-amber-300'}`}>
                            {incidenciasGraves > 0
                                ? `${incidenciasGraves} incidencia${incidenciasGraves === 1 ? '' : 's'} GRAVE${incidenciasGraves === 1 ? '' : 'S'} sin subsanar`
                                : `${incidenciasAbiertas} incidencia${incidenciasAbiertas === 1 ? '' : 's'} leve${incidenciasAbiertas === 1 ? '' : 's'} pendiente${incidenciasAbiertas === 1 ? '' : 's'}`}
                            {incidenciasGraves > 0 && incidenciasAbiertas - incidenciasGraves > 0 && ` (+${incidenciasAbiertas - incidenciasGraves} leve${incidenciasAbiertas - incidenciasGraves === 1 ? '' : 's'})`}
                        </span>
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${incidenciasGraves > 0 ? 'text-red-400 bg-red-500/15 border-red-500/40' : 'text-amber-400 bg-amber-500/15 border-amber-500/40'}`}>
                        Ver / Corregir
                    </span>
                </button>
            )}

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

                         {/* Lote: chip clicable que abre el modal del lote */}
                         {expediente.lote && (
                            <button
                                type="button"
                                onClick={() => setOpenLoteId(expediente.lote.id)}
                                className="flex items-center gap-3 bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/[0.06] shadow-lg hover:bg-white/[0.06] hover:border-brand/30 transition-all group"
                                title="Ver lote"
                            >
                                <div className="text-left">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-white/30">Lote</p>
                                    <p className="text-[11px] font-black text-white whitespace-nowrap group-hover:text-brand transition-colors">
                                        {expediente.lote.codigo || 'BORRADOR'}
                                        <span className="text-white/40 font-bold"> · {expediente.lote.estado}</span>
                                    </p>
                                </div>
                                <div className="h-6 w-px bg-white/10" />
                                <div className="text-left">
                                    <p className="text-[8px] uppercase tracking-widest font-black text-white/30">S.O. / Verificador</p>
                                    <p className="text-[11px] text-white/70 whitespace-nowrap">
                                        {expediente.lote.sujeto_obligado ? (expediente.lote.sujeto_obligado.acronimo || expediente.lote.sujeto_obligado.razon_social) : '—'}
                                        {' · '}
                                        {expediente.lote.verificador ? (expediente.lote.verificador.acronimo || expediente.lote.verificador.razon_social) : '—'}
                                    </p>
                                </div>
                            </button>
                         )}

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

                         {/* Botón de Incidencias (solo ADMIN). Rojo neón + badge si hay abiertas. */}
                         {isAdmin && (
                            <button
                               onClick={() => setShowIncidencias(true)}
                               className={`relative p-2.5 rounded-xl border transition-all shadow-lg group ${
                                   incidenciasGraves > 0
                                       ? 'bg-red-500/10 border-red-500/40 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.85)] hover:bg-red-500/20'
                                       : incidenciasAbiertas > 0
                                           ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)] hover:bg-amber-500/20'
                                           : 'bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5'
                               }`}
                               title={incidenciasAbiertas > 0 ? `${incidenciasAbiertas} incidencia(s) abierta(s)${incidenciasGraves > 0 ? ` · ${incidenciasGraves} grave(s)` : ''}` : 'Incidencias del expediente'}
                            >
                               <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                               </svg>
                               {incidenciasAbiertas > 0 && (
                                   <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-white text-[10px] font-black ${
                                       incidenciasGraves > 0
                                           ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]'
                                           : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.85)]'
                                   }`}>
                                       {incidenciasAbiertas}
                                   </span>
                               )}
                            </button>
                         )}

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
                                onClick={() => !isCertificador && setShowClienteModal(true)}
                                className={`text-white transition-colors text-base font-black text-left ${isCertificador ? 'cursor-default' : 'hover:text-brand'}`}
                                title={isCertificador ? '' : 'Ver / editar ficha de cliente'}
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

                <div className="flex items-center gap-3 flex-wrap max-md:w-full">
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

                    {/* Selector de prioridad */}
                    {isAdmin ? (
                        <div className="flex items-center rounded-xl overflow-hidden border border-white/[0.08]" title="Prioridad del expediente">
                            {['NORMAL', 'ALTA', 'URGENTE'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => handlePrioridadChange(p)}
                                    className={`px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all border-r border-white/[0.05] last:border-r-0 ${
                                        localPrioridad === p
                                            ? p === 'URGENTE' ? 'bg-red-500 text-white' :
                                              p === 'ALTA' ? 'bg-amber-500 text-black' :
                                              'bg-white/10 text-white/70'
                                            : 'text-white/20 hover:text-white/50 hover:bg-white/[0.03]'
                                    }`}
                                >
                                    {p === 'URGENTE' ? '⚠ ' : ''}{p}
                                </button>
                            ))}
                        </div>
                    ) : (localPrioridad !== 'NORMAL' && (
                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                            localPrioridad === 'URGENTE' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                            {localPrioridad === 'URGENTE' ? '⚠ ' : '● '}{localPrioridad}
                        </span>
                    ))}

                    {/* Acceso Drive raíz (solo ADMIN) */}
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

                    {/* Acceso a la carpeta LOCAL de Windows (solo ADMIN) */}
                    {driveLink && isAdmin && (
                        <button
                            type="button"
                            onClick={handleOpenLocalFolder}
                            disabled={localPathLoading}
                            title="Abrir la carpeta del expediente en el Explorador de Windows (requiere instalar una vez brokergylocal_setup.reg)"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/10 transition-all disabled:opacity-50 disabled:cursor-wait"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13l2 2 4-4" />
                            </svg>
                            {localPathLoading ? 'Abriendo…' : 'Carpeta Local'}
                        </button>
                    )}

                    {/* Acceso a la subcarpeta CEE (ADMIN + CERTIFICADOR) */}
                    {(isAdmin || isCertificador) && (liveCee?.cee_folder_link || expediente.cee?.cee_folder_link) && (
                        <a
                            href={liveCee?.cee_folder_link || expediente.cee?.cee_folder_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-all"
                            title="Carpeta '12. DOCUMENTOS PARA CEE' en Google Drive"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            Carpeta CEE
                        </a>
                    )}

                    {/* Fotos / Documentación — mismo popup que en la oportunidad */}
                    {op?.id_oportunidad && (
                        <button
                            type="button"
                            onClick={() => setShowFotos(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/10 transition-all"
                            title="Gestionar documentación fotográfica del expediente"
                        >
                            <span className="text-sm">📸</span>
                            Fotos
                        </button>
                    )}
                </div>
            </div>

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

                {!isCertificador && (
                    <ModuleSection
                        id="checklist"
                        title="Barrido · Qué falta"
                        icon={
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                            </svg>
                        }
                        activeSection={activeSection}
                        onToggle={setActiveSection}
                        badge="Pendientes"
                    >
                        <ChecklistModule expediente={expediente} onChanged={() => fetchExpediente(true)} />
                    </ModuleSection>
                )}

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
                        <>
                            {/* La fecha prevista de inicio de obra es la que marca el plazo
                                real del CEE inicial: debe estar registrado antes. */}
                            <FechasPrevistasEjecucion
                                expediente={{ ...expediente, instalacion: liveInst || expediente.instalacion, seguimiento: liveSeguimiento || expediente.seguimiento }}
                                onSave={handleSave}
                                editable={isStaff}
                                saving={saving}
                            />
                            {assignedCertificador && (
                                <div className="hidden md:flex items-center gap-2 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-xl ml-4 mr-2 group/cert">
                                    <svg className="w-3.5 h-3.5 text-white/30 group-hover/cert:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover/cert:text-white transition-colors">
                                        {assignedCertificador.razon_social || assignedCertificador.acronimo}
                                    </span>
                                </div>
                            )}
                        </>
                    }
                >
                    <CeeModule
                        expediente={expediente}
                        onSave={handleCeeSave}
                        onLiveUpdate={handleCeeLiveUpdate}
                        onRefresh={() => fetchExpediente(true)}
                        saving={saving}
                        certificadores={certificadores}
                        onAutoStatus={handleCeeAutoStatus}
                        onEditCliente={() => setShowClienteModal(true)}
                    />

                    {/* Comunicaciones con el certificador — dentro del bloque CEE,
                        ya que todo el flujo de notificación/revisión vive aquí. */}
                    <div className="mt-10 pt-8 border-t border-white/[0.06]">
                        <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4 mb-5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Comunicaciones con el certificador
                        </h3>
                        <ComunicacionesCertificador expediente={expediente} />
                    </div>
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
                            onEditCliente={() => setShowClienteModal(true)}
                        />
                    </ModuleSection>
                )}

                {/* Datos Económicos (tarifas CAE, beneficio, presupuesto) = SOLO ADMIN. */}
                {isAdmin && (
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
                            liveInst={liveInst}
                            results={calcResults}
                            onSave={handleSave}
                            onLiveUpdate={setLiveInst}
                            saving={saving}
                        />
                    </ModuleSection>
                )}
            </div>

            <HistorialModal
                isOpen={showQuickNote}
                onClose={() => setShowQuickNote(false)}
                idOportunidad={expediente?.oportunidades?.id_oportunidad}
                referenciaCliente={expediente?.oportunidades?.referencia_cliente}
                expediente={expediente}
                incidenciasAbiertas={isAdmin ? incidenciasAbiertas : 0}
                onOpenIncidencias={isAdmin ? () => { setShowQuickNote(false); setShowIncidencias(true); } : undefined}
            />

            {isAdmin && (
                <IncidenciasModal
                    isOpen={showIncidencias}
                    onClose={() => setShowIncidencias(false)}
                    expedienteId={expediente?.id}
                    onChanged={() => fetchExpediente(true)}
                />
            )}

            <DocsAdminModal
                isOpen={showFotos}
                onClose={() => setShowFotos(false)}
                idOportunidad={expediente?.oportunidades?.id_oportunidad}
            />

            {showClienteModal && (
                <ClienteDetailModal
                    isOpen={true}
                    clienteId={cliente.id_cliente}
                    expedienteId={expediente.id}
                    justificanteLink={expediente?.documentacion?.justificante_titularidad_link || null}
                    catastroData={{
                        direccion: opInputs.direccion || opInputs.address || null,
                        municipio: opInputs.municipio || null,
                        provincia_cod: opInputs.provincia || null,
                        provincia_nombre: opInputs.provincia_nombre || null,
                        ccaa: opInputs.ccaa || null,
                        codigo_postal: opInputs.cp || opInputs.codigo_postal || null,
                        ref_catastral: op.ref_catastral || opInputs.ref_catastral || opInputs.rc || expediente.instalacion?.ref_catastral || null,
                    }}
                    onClose={() => setShowClienteModal(false)}
                    onUpdated={() => fetchExpediente(true)}
                    onClienteSwapped={() => { setShowClienteModal(false); fetchExpediente(true); }}
                />
            )}

            {openLoteId && (
                <LoteDetailModal
                    loteId={openLoteId}
                    soList={[]}
                    verList={[]}
                    onClose={() => setOpenLoteId(null)}
                    onChanged={() => fetchExpediente(true)}
                    onNavigateExpediente={() => setOpenLoteId(null)}
                />
            )}
        </div>
    );
}
