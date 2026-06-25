/**
 * ReformaSubFlow — sub-flujo del formulario /reforma.
 *
 * Se monta DESPUÉS de resolver el catastro (lo orquesta LandingFunnelView con
 * variant='reforma'). Pregunta primero el estado de la obra:
 *   - no_empezada → delega al funnel estándar existente (onNoEmpezada)
 *   - nueva       → mensaje "sin ayudas"
 *   - a_medias / ejecutada → flujo de Reforma (reutiliza pasos térmicos Step3/4/5
 *     + preguntas propias: elementos, facturas, fotos, certificados) → resumen de
 *     elegibilidad → contacto → resultado (con cálculo) o derivación a Brokergy.
 *
 * Reutiliza el MISMO motor de cálculo que el funnel estándar
 * (funnelToCalculatorInputs + computeFullCalculatorResult) para que el importe
 * que ve el cliente sea idéntico al de la calculadora interna.
 */

import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';

import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';
import { DocsManager } from '../../docs/DocsManager';
import { useAuth } from '../../../context/AuthContext';
import { Step3_EdadCaldera } from '../steps/Step3_EdadCaldera';
import { Step4_Emisores } from '../steps/Step4_Emisores';
import { Step5_ACS } from '../steps/Step5_ACS';
import { Step7_Gasto } from '../steps/Step7_Gasto';
import { Step8_Presupuesto } from '../steps/Step8_Presupuesto';
import { Step9_Contacto } from '../steps/Step9_Contacto';
import { LandingResultView } from './LandingResultView';
import { LeadDeliveryView } from './LeadDeliveryView';
import { funnelToCalculatorInputs } from '../data/funnelToInputs';
import { computeFullCalculatorResult, computeLandingResult } from '../data/landingCalculation';

const BOILER_COMBUSTIBLE = ['gas', 'gasoleo', 'carbon', 'biomasa'];

// Progreso aproximado por pantalla (0–1). Ausente = no mostrar barra (dead ends, result).
const SCREEN_PROGRESS = {
    estado: 0.07, tipo: 0.15,
    ejec_fecha: 0.22, ejec_terminada: 0.3,
    combustible: 0.3, edad: 0.4, emisores: 0.5, acs: 0.6,
    elementos: 0.68, aviso_no_cae: 0.68,
    facturas: 0.68, factura_fecha: 0.73, cee_previo: 0.76,
    fotos: 0.8, cee_ambos: 0.83,
    gasto: 0.86, presupuesto: 0.92,
};

// Hitos de dinero que marcan el recorrido visual del formulario en móvil.
const MONEY_MILESTONES = [
    { emoji: '🪙', label: 'Inicio',     threshold: 0    },
    { emoji: '💵', label: 'Datos',      threshold: 0.28 },
    { emoji: '💰', label: 'Reforma',    threshold: 0.55 },
    { emoji: '💸', label: 'Ayudas',     threshold: 0.78 },
    { emoji: '🤑', label: 'Propuesta',  threshold: 0.92 },
];

export function ReformaSubFlow({ catastro, funnel, updateFunnel, partnerBranding, mode = 'public', onCreated, onNoEmpezada, onRestart }) {
    // Modo internal (partner/admin "nueva simulación"): mismas pantallas que el
    // flujo público pero con textos neutros (el partner pregunta por su cliente),
    // sin elementos comerciales y terminando en la pantalla de identificación de
    // la oportunidad en lugar de la entrega pública.
    const isInternal = mode === 'internal';
    // Helper de copy: t(textoPúblico, textoNeutroInternal)
    const t = (pub, int) => (isInternal ? int : pub);

    // Usuario logueado (solo relevante en internal) — para permitir validar/borrar
    // fotos si es ADMIN en la pantalla de documentación.
    const { user } = useAuth();
    const isAdminUser = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';
    // Oportunidad recién creada en internal (para abrir su documentación in-situ).
    const [createdOpp, setCreatedOpp] = useState(null);

    // Arranca preguntando el ESTADO de la obra (primera pregunta del funnel /reforma).
    const [stack, setStack] = useState(['estado']);
    const [noTieneState, setNoTieneState] = useState(null); // null | 'warning' | 'dead_end'
    const [contacto, setContacto] = useState({
        nombre: '', email: '', tlf: '',
        titular_type: null, num_propietarios: null,
        timeline: null, rgpd_aceptado: false,
        consent_email: true, consent_whatsapp: true
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [leadResult, setLeadResult] = useState(null);
    const [submittedInputs, setSubmittedInputs] = useState(null);
    const [uploadLink, setUploadLink] = useState(null);

    // Para unificar con /calcula-tu-ayuda: canal de entrega elegido por el cliente
    // (array — ['whatsapp'], ['email'], ['whatsapp','email'], ['tecnico'])
    const [deliveryPreference, setDeliveryPreference] = useState([]);
    // Captura síncrona del resultado calculado en LeadDeliveryView antes del submit
    const deliverySummaryRef = useRef(null);

    // Ref al funnel para leer el valor más reciente dentro de onNext con delay.
    const funnelRef = useRef(funnel);
    funnelRef.current = funnel;

    const screen = stack[stack.length - 1];
    const push = useCallback((s) => { setStack(prev => [...prev, s]); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
    const back = useCallback(() => { setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

    const ej = funnel.obra_estado === 'ejecutada';

    // En modo internal saltamos la pregunta de gasto anual (el partner la afina
    // luego en la calculadora, igual que el funnel interno clásico).
    const gastoStep = () => (isInternal ? 'presupuesto' : 'gasto');

    // ---------- Elegibilidad (lenguaje claro, sin jerga) ----------
    const calc = () => {
        const c = funnel.combustible_actual;
        const esCombustible = BOILER_COMBUSTIBLE.includes(c);
        const esBiomasa = c === 'biomasa';
        const els = funnel.reforma_elementos || {};
        const cambioCaldera = !!els.caldera;
        const env = !!(els.ventanas || els.cubierta || els.paredes || els.suelo);
        const cee = ej ? funnel.reforma_cee_ambos === 'si' : funnel.reforma_cee_previo === 'si';

        // Aires AC: solo dan IRPF si hay ≥ 2 unidades instaladas
        const airesValidos = !!els.aires && (Number(funnel.reforma_aires_count) || 0) >= 2;
        // Placas solas: solo IRPF, nunca CAE
        const placasSolo = !!els.placas;

        // CAE solo se genera con cambio de caldera (aerotermia) o envolvente real
        const generaCae = cambioCaldera || env;

        const ayudaCaldera = esCombustible && cambioCaldera;
        let ayudaReforma = false, reformaRevisar = false;
        if (!ej) {
            if (funnel.reforma_facturas === 'no' || funnel.reforma_factura_fecha === 'menos1mes') ayudaReforma = env;
            else if (cee) reformaRevisar = env || cee;
        } else if (cee) reformaRevisar = true;

        // IRPF: aplica con cee, o si hay aires válidos (≥2) o placas (con sus condiciones)
        const irpfRevisar = cee || airesValidos || placasSolo;
        const ayudaBaja = !cambioCaldera;
        const elegible = ayudaCaldera || ayudaReforma || reformaRevisar || env || cee || airesValidos || placasSolo;
        return {
            esCombustible, esBiomasa, cambioCaldera, env, cee, ayudaCaldera, ayudaReforma, reformaRevisar,
            irpfRevisar, ayudaBaja, elegible, generaCae, airesValidos, placasSolo
        };
    };

    // Próxima pantalla "real" tras elementos según estado de la obra
    // - ejecutada → fotos
    // - a_medias → facturas
    // - no_empezada → directo a gasto (no hay facturas ni fotos previas relevantes)
    const nextAfterElementos = () => {
        if (funnel.obra_estado === 'no_empezada') return gastoStep();
        return ej ? 'fotos' : 'facturas';
    };

    // Handler de transición desde elementos: si la selección no genera CAE, mostrar aviso
    const goAfterElementos = () => {
        const els = funnel.reforma_elementos || {};
        const hayEnv = !!(els.ventanas || els.cubierta || els.paredes || els.suelo);
        const generaCae = !!els.caldera || hayEnv;
        const hayAlgoSoloIrpf = !!els.aires || !!els.placas;
        if (!generaCae && hayAlgoSoloIrpf) {
            push('aviso_no_cae');
        } else {
            push(nextAfterElementos());
        }
    };

    // ---------- Navegación combustible ----------
    const pickCombustible = (value) => {
        if (value === 'no_tiene') {
            if (!funnel.isReforma) {
                // Solo aerotermia + sin calefacción previa → requiere reforma integral
                setNoTieneState('warning');
                return;
            }
            updateFunnel({ combustible_actual: null, reforma_sin_caldera: true, edad_caldera: null, condensacion: null, emisor_tipo: 'radiadores_convencionales' });
            push('acs'); // sin caldera: salta edad y emisores
            return;
        }
        setNoTieneState(null);
        updateFunnel({ combustible_actual: value, reforma_sin_caldera: false, edad_caldera: null, condensacion: null });
        if (value === 'electrica') { push('emisores'); return; } // salta edad
        push('edad');
    };

    const toggleEl = (key) => {
        const next = { ...(funnel.reforma_elementos || {}), [key]: !funnel.reforma_elementos?.[key] };
        const env = !!(next.ventanas || next.cubierta || next.paredes || next.suelo);
        const updates = { reforma_elementos: next, isReforma: env };
        // Al desmarcar aires, resetear el contador. Al marcar, dejar a null para forzar elección.
        if (key === 'aires') updates.reforma_aires_count = null;
        updateFunnel(updates);
    };

    // ---------- Submit ----------
    const doSubmit = async () => {
        setSubmitting(true); setSubmitError(null);
        try {
            const fuerte = !!funnel.reforma_elementos?.caldera;
            const funnelConContacto = {
                ...funnel,
                titular_type: contacto.titular_type || 'particular',
                num_propietarios: contacto.num_propietarios || 1,
                timeline: contacto.timeline || 'explorando'
            };
            const calculatorInputs = funnelToCalculatorInputs(funnelConContacto, catastro, { mode: 'public' });
            let precomputedResult = null;
            try { precomputedResult = computeFullCalculatorResult(calculatorInputs); } catch (e) { /* noop */ }

            // En leads de reforma el admin los activa manualmente si los necesita,
            // igual que con las simulaciones internas (mode='internal').
            // Se fuerza DESPUÉS de calcular precomputedResult para que el cliente
            // vea el resultado completo; lo que se guarda en BD parte de cero.
            calculatorInputs.aplicarIrpfCae = false;
            calculatorInputs.includeAnnualSavings = false;

            // delivery_summary: captura síncrona desde LeadDeliveryView (ref) o fallback
            // al precomputedResult si no se capturó (no debería ocurrir).
            const ds = deliverySummaryRef.current || {};
            const delivery_summary = {
                cae:    ds.caeBonusNetoCliente || 0,
                irpf:   ds.irpfDeduction       || 0,
                neta:   ds.inversionNetaCliente || 0,
                ahorro: ds.ahorroAnualEur      || 0,
            };

            const payload = {
                provinceCode: String(catastro?.provinceCode || '').padStart(2, '0'),
                partner_slug: partnerBranding?.slug || null,
                turnstile_token: null,
                contacto,
                catastro: {
                    ref_catastral: catastro?.rc,
                    address: catastro?.address,
                    municipio: catastro?.municipality || catastro?.municipio,
                    codigo_postal: catastro?.postalCode || null
                },
                funnel: { ...funnel, timeline: contacto.timeline, titular_type: contacto.titular_type },
                calculatorInputs,
                precomputedResult,
                demandaCalefaccionPorM2: precomputedResult?.q_net || null,
                // Canal de entrega elegido por el cliente — mismo formato que /calcula-tu-ayuda
                delivery_preference: deliveryPreference.length ? deliveryPreference : ['tecnico'],
                delivery_summary,
                // Metadatos del flujo Reforma (para el panel admin / clasificación)
                origen: 'reforma',
                reforma: {
                    obra_estado: funnel.obra_estado,
                    sin_caldera: !!funnel.reforma_sin_caldera,
                    facturas: funnel.reforma_facturas,
                    factura_fecha: funnel.reforma_factura_fecha,
                    cee_previo: funnel.reforma_cee_previo,
                    cee_ambos: funnel.reforma_cee_ambos,
                    fotos: funnel.reforma_fotos,
                    ejec_fecha: funnel.reforma_ejec_fecha,
                    elementos: funnel.reforma_elementos,
                    aires_count: funnel.reforma_aires_count,
                    via: fuerte ? 'aerotermia' : 'deduccion_irpf'
                }
            };

            const res = await axios.post('/api/landing/lead', payload);
            setLeadResult({ ...res.data, provincia: catastro?.province || null });
            setUploadLink(res.data?.upload_link || null);
            setSubmittedInputs(calculatorInputs);
            setSubmitting(false);
            // Siempre vamos a la pantalla unificada de resultado (igual que /calcula-tu-ayuda)
            push('result');
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'No pudimos guardar tus datos. Inténtalo en un momento.');
            setSubmitting(false);
        }
    };

    // ---------- Submit INTERNAL (partner/admin nueva simulación) ----------
    // Mismo payload que LandingFunnelView.handleSubmit (rama internal): crea la
    // oportunidad vía /api/oportunidades/internal-simulation y delega en onCreated
    // (que abre la calculadora con la oportunidad recién creada).
    const doSubmitInternal = async () => {
        setSubmitting(true); setSubmitError(null);
        try {
            const funnelConContacto = {
                ...funnel,
                titular_type: contacto.titular_type || 'particular',
                num_propietarios: contacto.num_propietarios || 1,
                timeline: contacto.timeline || 'explorando'
            };
            const calculatorInputs = funnelToCalculatorInputs(funnelConContacto, catastro, { mode: 'internal' });
            let precomputedResult = null;
            let demandaCalefaccionPorM2 = null;
            try {
                precomputedResult = computeFullCalculatorResult(calculatorInputs);
                demandaCalefaccionPorM2 = precomputedResult?.q_net || null;
            } catch (e) { /* noop */ }

            const payload = {
                provinceCode: String(catastro?.provinceCode || '').padStart(2, '0'),
                partner_slug: partnerBranding?.slug || null,
                turnstile_token: null,
                delivery_preference: ['tecnico'],
                delivery_summary: null,
                contacto,
                catastro: {
                    ref_catastral: catastro?.rc,
                    address: catastro?.address,
                    municipio: catastro?.municipality || catastro?.municipio,
                    codigo_postal: catastro?.postalCode || null
                },
                funnel: { ...funnel, timeline: contacto.timeline, titular_type: contacto.titular_type },
                calculatorInputs,
                precomputedResult,
                demandaCalefaccionPorM2
            };

            const res = await axios.post('/api/oportunidades/internal-simulation', payload);
            setSubmitting(false);
            // En vez de abrir la calculadora directamente, llevamos al instalador a
            // la pantalla de documentación (la misma del enlace) para que suba las
            // fotos del ANTES in-situ. El "Finalizar" de esa pantalla llama a onCreated.
            setCreatedOpp(res.data);
            push('docs_upload');
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'No pudimos crear la simulación. Inténtalo de nuevo.');
            setSubmitting(false);
        }
    };

    // ---------- UI helpers ----------
    const BackBtn = () => {
        const progressPct = SCREEN_PROGRESS[screen];
        return (
            <>
                {!isInternal && progressPct != null && (
                    <div className="w-full max-w-2xl mx-auto mb-5 px-2">
                        <div className="flex items-center">
                            {MONEY_MILESTONES.map((m, i) => {
                                const next = MONEY_MILESTONES[i + 1];
                                const reached  = progressPct >= m.threshold;
                                const isActive = reached && (!next || progressPct < next.threshold);
                                const segPct   = next
                                    ? progressPct >= next.threshold ? 1
                                      : progressPct > m.threshold
                                        ? (progressPct - m.threshold) / (next.threshold - m.threshold)
                                        : 0
                                    : 0;
                                return (
                                    <React.Fragment key={i}>
                                        {/* Hito emoji */}
                                        <div
                                            className="flex-shrink-0 transition-all duration-500"
                                            style={{
                                                transform: isActive ? 'scale(1.75)' : reached ? 'scale(1)' : 'scale(0.7)',
                                                opacity: reached ? 1 : 0.25,
                                                filter: isActive
                                                    ? 'drop-shadow(0 0 7px rgba(251,191,36,0.95))'
                                                    : 'none',
                                            }}
                                        >
                                            <span className="text-lg leading-none select-none">{m.emoji}</span>
                                        </div>
                                        {/* Línea entre hitos */}
                                        {next && (
                                            <div className="flex-1 h-[3px] mx-2 bg-white/[0.08] rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-700 ease-out"
                                                    style={{ width: `${segPct * 100}%` }}
                                                />
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}
                {stack.length > 1 && (
                    <button type="button" onClick={back}
                        className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-xs uppercase tracking-widest font-bold py-2 mb-4">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                        Atrás
                    </button>
                )}
            </>
        );
    };

    const DeadEnd = ({ emoji, title, children, cta }) => (
        <div className="text-center max-w-xl mx-auto animate-fade-in">
            <div className="text-6xl mb-6">{emoji}</div>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-4 tracking-tight">{title}</h2>
            <div className="text-white/60 text-sm md:text-base leading-relaxed space-y-3 mb-8">{children}</div>
            {cta || (
                <button onClick={onRestart} className="text-white/30 hover:text-white/70 text-[11px] font-black uppercase tracking-widest">← Empezar de nuevo</button>
            )}
        </div>
    );

    const primaryBtn = "w-full max-w-xs mx-auto block py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 transition-all";

    // ============================================================
    // RENDER POR PANTALLA
    // ============================================================

    if (screen === 'result') {
        return (
            <LandingResultView
                leadResult={leadResult}
                funnel={funnel}
                contacto={contacto}
                partnerBranding={partnerBranding}
                calculatorInputs={submittedInputs}
                deliveryPreference={deliveryPreference}
            />
        );
    }

    // ---- INTERNAL: documentación in-situ (subir fotos del ANTES tras crear) ----
    // Reutiliza el MISMO componente que el enlace público (DocsManager). El
    // instalador, al terminar la toma de datos, sube aquí las fotos del antes.
    if (screen === 'docs_upload' && createdOpp) {
        const oppId = createdOpp.id_oportunidad || createdOpp.oportunidad_uuid;
        return (
            <div className="animate-fade-in max-w-2xl mx-auto">
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-3">
                        <span className="text-sm">✅</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Oportunidad creada</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                        Sube ahora las <span className="text-amber-400">fotos del antes</span>
                    </h1>
                    <p className="text-white/55 text-sm md:text-base mt-3 max-w-xl mx-auto">
                        Caldera actual y su placa, ventanas, fachada, un vídeo del recorrido… Las marcadas como obligatorias son imprescindibles para empezar el expediente.
                    </p>
                </div>

                <DocsManager mode="admin" idOrUuid={oppId} embedded canValidate={isAdminUser} />

                <div className="mt-8 flex flex-col items-center gap-3">
                    <button onClick={() => { if (onCreated) onCreated(createdOpp); }} className={primaryBtn}>
                        Finalizar
                    </button>
                    <p className="text-white/35 text-xs text-center max-w-sm">
                        También puedes subir las fotos más tarde desde el enlace de documentación del expediente.
                    </p>
                </div>
            </div>
        );
    }

    // ---- Tipo de proyecto: aerotermia vs reforma integral ----
    if (screen === 'tipo') {
        const pickSoloAerotermia = () => {
            updateFunnel({
                isReforma: false,
                reforma_elementos: { caldera: true, ventanas: false, cubierta: false, suelo: false, paredes: false, placas: false, aires: false },
                reforma_aires_count: null,
                // obra_estado ya está fijado desde la pantalla de estado — no sobreescribir
            });
            push('combustible');
        };
        const pickIntegral = () => {
            updateFunnel({
                isReforma: true,
                reforma_elementos: { caldera: false, ventanas: false, cubierta: false, suelo: false, paredes: false, placas: false, aires: false },
                reforma_aires_count: null,
            });
            push('combustible');
        };
        return (
            <div className="animate-fade-in">
                <BackBtn />
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
                        {ej
                            ? <>¿Qué {t('hiciste', 'se hizo')} en la <span className="text-amber-400">obra</span>?</>
                            : <>¿Qué mejora {t(<>te <span className="text-amber-400">interesa</span></>, <span className="text-amber-400">interesa</span>)}?</>}
                    </h1>
                    <p className="text-white/60 text-base md:text-lg mt-4 max-w-2xl mx-auto">
                        {ej
                            ? t('Cuéntanos qué incluiste en la reforma.', 'Indica qué incluyó la reforma.')
                            : t('Elige la opción que mejor describe lo que quieres hacer en tu vivienda.', 'Elige la opción que mejor describe la obra de la vivienda.')}
                    </p>
                </div>
                <div className="space-y-3 max-w-2xl mx-auto">
                    <IconCard
                        icon="🔄"
                        title={ej ? "Solo se cambió la caldera por aerotermia" : t("Solo cambiar mi caldera por aerotermia", "Solo cambio de caldera por aerotermia")}
                        subtitle={ej ? "Solo se sustituyó la caldera, sin más cambios en la vivienda." : t("Conservas el resto de tu vivienda como está y ganas eficiencia.", "Se conserva el resto de la vivienda; solo gana eficiencia.")}
                        onClick={pickSoloAerotermia}
                    />
                    <IconCard
                        icon="🏗️"
                        title={ej ? "Reforma integral: aerotermia + aislamiento" : "Reforma integral: aerotermia + mejorar aislamiento"}
                        subtitle={ej ? "Se cambió la caldera y además se mejoró aislamiento, ventanas o fachada." : t("Cambias la caldera y, además, mejoras ventanas, fachada o cubierta.", "Cambio de caldera y, además, mejora de ventanas, fachada o cubierta.")}
                        onClick={pickIntegral}
                        badge="Mayor ayuda"
                    />
                </div>
            </div>
        );
    }

    if (screen === 'estado') {
        return (
            <div className="animate-fade-in">
                <BackBtn />
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">¿En qué punto está {t('tu', 'la')} <span className="text-amber-400">obra</span>?</h1>
                    <p className="text-white/60 text-base md:text-lg mt-4 max-w-2xl mx-auto">{t('Cuéntanos cómo está la reforma. Sin compromiso.', 'Indica el estado de la reforma del cliente.')}</p>
                </div>
                <div className="space-y-3 max-w-2xl mx-auto">
                    {/* 'no_empezada' YA NO salta de URL — sigue el mismo flujo interno
                        para que el botón "Atrás" funcione. Las pantallas posteriores
                        (goAfterElementos) se saltan facturas/fotos cuando la obra
                        aún no se ha empezado. */}
                    <IconCard icon="📐" title={t('Aún no he empezado la obra', 'Aún no ha empezado la obra')} subtitle={t('Quiero saber qué ayudas tendría antes de empezar', 'Para saber qué ayudas tendría antes de empezar')}
                        onClick={() => { updateFunnel({ obra_estado: 'no_empezada' }); push('tipo'); }} />
                    <IconCard icon="🚧" title="Obra a medias" subtitle={t('Ya he empezado la reforma pero no está terminada', 'Reforma empezada pero sin terminar')}
                        onClick={() => { updateFunnel({ obra_estado: 'a_medias' }); push('tipo'); }} />
                    <IconCard icon="✅" title="Obra ya ejecutada" subtitle={t('La reforma ya está hecha y quiero ver si puedo conseguir ayudas', 'Reforma ya hecha; comprobar si hay ayudas posibles')}
                        onClick={() => { updateFunnel({ obra_estado: 'ejecutada' }); push('ejec_fecha'); }} />
                    <IconCard icon="🏗️" title="Obra nueva" subtitle={t('Construyo una vivienda desde cero', 'Vivienda de nueva construcción desde cero')}
                        onClick={() => push('nueva_dead')} />
                </div>
            </div>
        );
    }

    if (screen === 'nueva_dead') {
        return <DeadEnd emoji="🏗️" title="La obra nueva no tiene ayudas">
            <p>Las viviendas de <strong className="text-white">nueva construcción</strong> no pueden acogerse a las ayudas por eficiencia energética. Estas ayudas exigen <strong className="text-white">sustituir o mejorar</strong> instalaciones que ya existían.</p>
            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl text-left text-sm">
                <p className="text-amber-300 font-bold mb-1">☀️ ¿Y las placas solares?</p>
                <p className="text-white/55">Las placas solares <strong className="text-white">no dan ayuda directa</strong>. Sólo dan derecho a <strong className="text-white">deducción en el IRPF</strong> (requiere certificados antes y después de las facturas).</p>
            </div>
        </DeadEnd>;
    }

    // ---- Obra ejecutada: fecha + terminada ----
    if (screen === 'ejec_fecha') {
        return (<><BackBtn /><StepLayout question="¿De cuándo es la factura de la obra?" subtitle="Sólo podemos gestionar obras facturadas desde enero de 2024 en adelante.">
            <IconCard icon="✅" title="Desde enero de 2024" subtitle="La factura es de 2024 en adelante" badge="OK"
                onClick={() => { updateFunnel({ reforma_ejec_fecha: 'desde2024' }); push('ejec_terminada'); }} />
            <IconCard icon="⛔" title="Antes de enero de 2024" subtitle="La obra se facturó antes de esa fecha"
                onClick={() => { updateFunnel({ reforma_ejec_fecha: 'antes2024' }); push('block_fecha'); }} />
        </StepLayout></>);
    }
    if (screen === 'block_fecha') {
        return <DeadEnd emoji="⛔" title="Esa obra ya no se puede gestionar">
            <p>Lo sentimos. Las obras facturadas <strong className="text-white">antes de enero de 2024</strong> ya no pueden acogerse a estas ayudas y no podemos tramitarlas.</p>
        </DeadEnd>;
    }
    if (screen === 'ejec_terminada') {
        return (<><BackBtn /><StepLayout question="¿La obra está totalmente terminada?" subtitle={t('Si sólo tienes una factura parcial, en realidad es una obra a medias y la tratamos de otra forma.', 'Si solo hay una factura parcial, en realidad es una obra a medias y se trata de otra forma.')}>
            <IconCard icon="🏁" title="Sí, totalmente terminada" subtitle="La reforma está acabada y facturada"
                onClick={() => push('tipo')} />
            <IconCard icon="🚧" title={t('Tengo factura parcial', 'Hay factura parcial')} subtitle="Aún queda obra por hacer"
                onClick={() => { updateFunnel({ obra_estado: 'a_medias' }); push('tipo'); }} />
        </StepLayout></>);
    }

    // ---- TÉRMICO: combustible (Step2 + opción "sin caldera") ----
    if (screen === 'combustible') {
        const verbo = ej
            ? t('calentabas tu vivienda ANTES de la reforma', 'se calentaba la vivienda ANTES de la reforma')
            : t('se calienta hoy tu vivienda', 'se calienta hoy la vivienda');
        return (
            <>
                <BackBtn />
                <StepLayout question={`¿Con qué ${verbo}?`} subtitle={t('Esto nos ayuda a calcular cuánto puedes ahorrar.', 'Esto ayuda a calcular cuánto se puede ahorrar.')}>

                    <IconCard icon="🔥" title="Gas natural o butano" subtitle="Caldera de gas (la más común en España)" selected={funnel.combustible_actual === 'gas'} onClick={() => pickCombustible('gas')} />
                    <IconCard icon="🛢️" title="Gasóleo / Diésel" subtitle="Caldera con depósito de combustible líquido" selected={funnel.combustible_actual === 'gasoleo'} onClick={() => pickCombustible('gasoleo')} />
                    <IconCard icon="⚡" title="Electricidad" subtitle="Radiadores eléctricos o caldera eléctrica" selected={funnel.combustible_actual === 'electrica'} onClick={() => pickCombustible('electrica')} />
                    <IconCard icon="⚫" title="Carbón" subtitle="Estufa o caldera de carbón" selected={funnel.combustible_actual === 'carbon'} onClick={() => pickCombustible('carbon')} />
                    <IconCard icon="🪵" title="Biomasa" subtitle="Pellets, leña o hueso de aceituna" selected={funnel.combustible_actual === 'biomasa'} onClick={() => pickCombustible('biomasa')} />
                    <IconCard icon="🚫" title={ej ? 'No tenía caldera de calefacción' : t('No tengo caldera de calefacción', 'No tiene caldera de calefacción')} subtitle="No hay/había sistema central de calefacción" selected={funnel.reforma_sin_caldera} onClick={() => pickCombustible('no_tiene')} />
                </StepLayout>

                {noTieneState && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
                         style={{ background: 'var(--reforma-glass)', backdropFilter: 'blur(6px)' }}>
                        <div className="w-full max-w-sm rounded-3xl p-6 animate-fade-in shadow-2xl shadow-amber-900/40"
                             style={{ background: 'var(--reforma-amber-panel)', border: '1px solid rgba(245,158,11,0.35)' }}>
                            {noTieneState === 'warning' ? (
                                <>
                                    <div className="flex items-start gap-3 mb-5 p-4 rounded-2xl"
                                         style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                                        <span className="text-xl flex-shrink-0">⚠️</span>
                                        <div>
                                            <div className="text-amber-300 font-black text-sm mb-1">
                                                Esto requiere Reforma integral
                                            </div>
                                            <p className="text-white/60 text-xs leading-relaxed">
                                                Las ayudas CAE requieren{' '}
                                                <strong className="text-white/90">sustituir una calefacción existente</strong>.
                                                Sin sistema previo, solo son accesibles si también se mejora
                                                la envolvente (ventanas, aislamiento, fachada…).
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <button
                                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-900 font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 transition-all"
                                            onClick={() => {
                                                updateFunnel({
                                                    isReforma: true,
                                                    combustible_actual: null,
                                                    reforma_sin_caldera: true,
                                                    edad_caldera: null,
                                                    condensacion: null,
                                                    emisor_tipo: 'radiadores_convencionales',
                                                    reforma_elementos: { caldera: true, ventanas: false, cubierta: false, suelo: false, paredes: false, placas: false, aires: false }
                                                });
                                                setNoTieneState(null);
                                                push('acs');
                                            }}>
                                            🏗️ Continuar como Reforma integral
                                        </button>
                                        <button
                                            className="w-full py-3 rounded-2xl border text-white/50 hover:text-white/80 font-bold text-sm transition-all"
                                            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
                                            onClick={() => setNoTieneState('dead_end')}>
                                            No vamos a hacer reforma
                                        </button>
                                        <div className="text-center pt-1">
                                            <button
                                                className="text-white/25 hover:text-white/55 text-[11px] font-black uppercase tracking-widest transition-colors"
                                                onClick={() => setNoTieneState(null)}>
                                                ← Atrás
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-center mb-6">
                                        <div className="text-5xl mb-4">😔</div>
                                        <h3 className="text-white font-black text-xl mb-3 tracking-tight leading-tight">
                                            Sin reforma no podemos tramitarlo
                                        </h3>
                                        <div className="text-white/55 text-sm leading-relaxed space-y-3">
                                            <p>
                                                Las ayudas CAE exigen{' '}
                                                <strong className="text-white/90">sustituir un sistema de calefacción ya existente</strong>.
                                                Sin calefacción previa, el programa solo cubre la instalación
                                                si va acompañada de mejoras en la envolvente del edificio.
                                            </p>
                                            <p>
                                                Si en algún momento decides hacer esas mejoras,{' '}
                                                <strong className="text-amber-400">podremos tramitar la ayuda</strong>.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <button
                                            className="text-white/25 hover:text-white/55 text-[11px] font-black uppercase tracking-widest transition-colors"
                                            onClick={() => setNoTieneState(null)}>
                                            ← Cambiar mi respuesta
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </>
        );
    }

    // ---- TÉRMICO: edad caldera (Step3 reutilizado) ----
    if (screen === 'edad') {
        return (<><BackBtn /><Step3_EdadCaldera funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('emisores')} isInternal={isInternal} /></>);
    }
    // ---- TÉRMICO: emisores (Step4 reutilizado) ----
    if (screen === 'emisores') {
        return (<><BackBtn /><Step4_Emisores funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('acs')} isInternal={isInternal} /></>);
    }
    // ---- TÉRMICO: ACS (Step5 reutilizado) ----
    if (screen === 'acs') {
        const nextAfterAcs = () => {
            if (funnel.isReforma) { push('elementos'); return; }
            // Obra ejecutada (terminada): SIEMPRE exigimos fotos del ANTES, incluso
            // para solo cambio de caldera. Sin fotos del estado anterior no hay ayuda
            // posible — el gasto (gasto_anual_eur) se fija a 0 más adelante en cee_ambos.
            if (ej) { push('fotos'); return; }
            push(gastoStep());
        };
        return (<><BackBtn /><Step5_ACS funnel={funnel} updateFunnel={updateFunnel} onNext={nextAfterAcs} isInternal={isInternal} /></>);
    }

    // ---- Elementos a incluir (multi) ----
    if (screen === 'elementos') {
        const els = funnel.reforma_elementos || {};
        const hayEnv = els.ventanas || els.cubierta || els.paredes || els.suelo;
        const any = els.caldera || hayEnv || els.placas || els.aires;
        // Validación: si solo aires marcados, requerir ≥ 2 unidades para poder continuar
        const airesOk = !els.aires || (funnel.reforma_aires_count != null);
        const canContinue = any && airesOk;

        return (<><BackBtn />
            <StepLayout
                question={ej ? '¿Qué incluyó la reforma?' : t('¿Qué quieres incluir en la ayuda?', '¿Qué incluye la ayuda?')}
                subtitle={t('Marca todos los elementos en los que se actúa. Puedes elegir varios.', 'Marca todos los elementos en los que se actúa. Se pueden elegir varios.')}
                onContinue={goAfterElementos}
                canContinue={canContinue}
            >
                <IconCard icon="🔄" title="Cambio de caldera por aerotermia" subtitle={ej ? 'Se sustituyó la caldera' : 'Sustituir la caldera actual'} selected={!!els.caldera} onClick={() => toggleEl('caldera')} badge="Mayor ayuda" />
                <IconCard icon="❄️" title="Instalar aires acondicionados" subtitle="Bombas de calor (split, multi-split, conductos)" selected={!!els.aires} onClick={() => toggleEl('aires')} />

                {/* Sub-pregunta inline: cuántas unidades. Solo visible si 'aires' está marcado */}
                {els.aires && (
                    <div className="ml-2 -mt-1 mb-1 p-4 rounded-2xl border-2 border-blue-400/30 bg-blue-400/[0.05] animate-fade-in">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-300/80 mb-3">
                            {t('¿Cuántas unidades vas a instalar?', '¿Cuántas unidades se instalan?')}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map(n => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => updateFunnel({ reforma_aires_count: n })}
                                    className={`py-2.5 rounded-xl border-2 font-black text-base transition-all ${
                                        funnel.reforma_aires_count === n
                                            ? 'border-blue-400 bg-blue-400/15 text-blue-200'
                                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-blue-400/40'
                                    }`}
                                >
                                    {n === 4 ? '4+' : n}
                                </button>
                            ))}
                        </div>
                        {/* Aviso si selecciona 1 unidad: no acceso a IRPF */}
                        {funnel.reforma_aires_count === 1 && (
                            <p className="mt-3 text-[11px] text-amber-300/80 leading-snug">
                                ⚠️ Para optar a la <strong>deducción IRPF</strong> con aires acondicionados son necesarias <strong>como mínimo 2 unidades</strong>. Con 1 sola unidad no se accede a la deducción.
                            </p>
                        )}
                    </div>
                )}

                <IconCard icon="🪟" title="Ventanas" subtitle="Cambio de ventanas por modelos más eficientes" selected={!!els.ventanas} onClick={() => toggleEl('ventanas')} />
                <IconCard icon="🏠" title="Cubierta / tejado" subtitle="Aislamiento del techo o tejado" selected={!!els.cubierta} onClick={() => toggleEl('cubierta')} />
                <IconCard icon="🧱" title="Fachada (paredes exteriores)" subtitle="SATE, trasdosado o aislamiento de fachada" selected={!!els.paredes} onClick={() => toggleEl('paredes')} />
                <IconCard icon="⬇️" title="Suelo" subtitle="Aislamiento del suelo de la vivienda" selected={!!els.suelo} onClick={() => toggleEl('suelo')} />
                <IconCard icon="☀️" title="Placas solares" subtitle="Autoconsumo fotovoltaico" selected={!!els.placas} onClick={() => toggleEl('placas')} />

                {!isInternal && !els.caldera && any && (
                    <div className="p-5 bg-gradient-to-r from-amber-500/15 to-amber-400/5 border-2 border-amber-400/30 rounded-2xl animate-fade-in">
                        <div className="flex gap-3"><span className="text-2xl shrink-0">💡</span><div>
                            <div className="text-amber-300 font-black text-sm mb-1">¿Y la aerotermia?</div>
                            <p className="text-white/70 text-xs leading-relaxed">Donde de verdad se consigue la <strong className="text-white">mayor ayuda</strong> es <strong className="text-amber-300">cambiando la caldera por aerotermia</strong>. Si solo mejoras el aislamiento, las ayudas son bastante más bajas. Te recomendamos incluirla.</p>
                        </div></div>
                    </div>
                )}
            </StepLayout></>);
    }

    // ---- Aviso intermedio: selección no genera CAE (solo aires/placas sin envolvente ni caldera) ----
    if (screen === 'aviso_no_cae') {
        const els = funnel.reforma_elementos || {};
        const soloAires = !!els.aires && !els.placas;
        const soloPlacas = !!els.placas && !els.aires;
        const ambos = !!els.aires && !!els.placas;
        const titulo = t('Tu selección no genera Bono CAE', 'La selección no genera Bono CAE');
        return (
            <div className="animate-fade-in max-w-2xl mx-auto">
                <BackBtn />
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 mb-3">
                        <span className="text-sm">💡</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Aviso importante</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">{titulo}</h2>
                    <p className="text-white/55 text-sm md:text-base mt-3 max-w-xl mx-auto">
                        {t('Lo que has marcado solo da derecho a deducción en el IRPF, no a Bono CAE.', 'Lo seleccionado solo da derecho a deducción en el IRPF, no a Bono CAE.')}
                    </p>
                </div>

                {/* Explicación según selección */}
                <div className="space-y-3 mb-6">
                    {soloPlacas && (
                        <div className="p-4 rounded-2xl border-2 border-amber-400/30 bg-amber-400/[0.05]">
                            <p className="text-amber-300 font-black text-sm mb-1">☀️ Placas solares por sí solas</p>
                            <p className="text-white/70 text-xs leading-relaxed">
                                Actualmente <strong className="text-white">no generan Bono CAE</strong>. Solo dan derecho a <strong className="text-white">deducción IRPF</strong> del 60% (hasta 9.000€) con certificados antes y después.
                            </p>
                        </div>
                    )}
                    {soloAires && (
                        <div className="p-4 rounded-2xl border-2 border-blue-400/30 bg-blue-400/[0.05]">
                            <p className="text-blue-300 font-black text-sm mb-1">❄️ Aires acondicionados por sí solos</p>
                            <p className="text-white/70 text-xs leading-relaxed">
                                No generan Bono CAE. Solo dan derecho a <strong className="text-white">deducción IRPF</strong> con un mínimo de <strong>2 unidades instaladas</strong>.
                                {funnel.reforma_aires_count === 1 && <> Y {t('tú has marcado solo 1', 'solo hay 1 marcada')}, así que de momento <strong className="text-amber-300">no {t('podrías', 'se podría')} acoger{t('te', '')} ni siquiera a la deducción</strong>.</>}
                            </p>
                        </div>
                    )}
                    {ambos && (
                        <div className="p-4 rounded-2xl border-2 border-blue-400/30 bg-blue-400/[0.05]">
                            <p className="text-blue-300 font-black text-sm mb-1">☀️❄️ Placas + aires acondicionados</p>
                            <p className="text-white/70 text-xs leading-relaxed">
                                Solo dan derecho a <strong className="text-white">deducción IRPF</strong> (no Bono CAE). Los aires necesitan mínimo <strong>2 unidades</strong> y las placas requieren certificados antes y después.
                            </p>
                        </div>
                    )}

                    {/* Sugerencia: añadir envolvente o caldera */}
                    <div className="p-4 rounded-2xl border-2 border-emerald-400/30 bg-emerald-400/[0.05]">
                        <p className="text-emerald-300 font-black text-sm mb-1">🎯 Para acceder al Bono CAE</p>
                        <p className="text-white/70 text-xs leading-relaxed">
                            Necesitas incluir además <strong className="text-white">cambio de caldera por aerotermia</strong> y/o <strong className="text-white">mejora de la envolvente</strong> (ventanas, cubierta, fachada, suelo). Con eso sí accedes al bono y a deducciones combinadas.
                        </p>
                    </div>
                </div>

                {/* Acciones */}
                <div className="space-y-2.5">
                    <button
                        type="button"
                        onClick={() => back()}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/20 transition-all"
                    >
                        Volver y añadir más elementos
                    </button>
                    <button
                        type="button"
                        onClick={() => push(nextAfterElementos())}
                        className="w-full py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/70 hover:text-white font-bold uppercase tracking-widest text-xs transition-all"
                    >
                        Continuar solo con la deducción IRPF
                    </button>
                </div>
            </div>
        );
    }

    // ---- A medias: facturas ----
    if (screen === 'facturas') {
        return (<><BackBtn /><StepLayout question={t('¿Ya tienes facturas emitidas de la reforma?', '¿Ya hay facturas emitidas de la reforma?')} subtitle={t('Es clave: si ya hay facturas, cambia qué ayudas podemos tramitar.', 'Es clave: si ya hay facturas, cambia qué ayudas se pueden tramitar.')}>
            <IconCard icon="📄" title={t('Sí, ya tengo facturas', 'Sí, ya hay facturas')} subtitle="Hay trabajos ya facturados" onClick={() => { updateFunnel({ reforma_facturas: 'si' }); push('factura_fecha'); }} />
            <IconCard icon="🆕" title="No, todavía no" subtitle="Aún no se ha facturado nada de la reforma" onClick={() => { updateFunnel({ reforma_facturas: 'no' }); push('fotos'); }} />
        </StepLayout></>);
    }
    if (screen === 'factura_fecha') {
        return (<><BackBtn /><StepLayout question="¿De cuándo es la factura más antigua?" subtitle="Si tiene menos de un mes, todavía podríamos tramitar la reforma completa.">
            <IconCard icon="🗓️" title="Menos de 1 mes" subtitle="Todavía estaríamos a tiempo" badge="OK" onClick={() => { updateFunnel({ reforma_factura_fecha: 'menos1mes' }); push('fotos'); }} />
            <IconCard icon="📆" title="Más de 1 mes" subtitle="La factura es más antigua" onClick={() => { updateFunnel({ reforma_factura_fecha: 'mas1mes' }); push('cee_previo'); }} />
        </StepLayout></>);
    }
    if (screen === 'cee_previo') {
        return (<><BackBtn /><StepLayout question={t('¿Tienes Certificado de Eficiencia Energética previo?', '¿Hay Certificado de Eficiencia Energética previo?')} subtitle={t('Tiene que estar registrado en tu Comunidad Autónoma y ser anterior a la reforma. Es lo que permite tramitar la reforma completa cuando ya hay facturas.', 'Tiene que estar registrado en la Comunidad Autónoma y ser anterior a la reforma. Es lo que permite tramitar la reforma completa cuando ya hay facturas.')}>
            <IconCard icon="📑" title={t('Sí, lo tengo registrado', 'Sí, está registrado')} subtitle="Lo revisamos para confirmar" onClick={() => { updateFunnel({ reforma_cee_previo: 'si' }); push('fotos'); }} />
            <IconCard icon="🚫" title={t('No tengo', 'No hay')} subtitle={t('Aún podríamos ayudarte con el cambio de caldera', 'Aún se podría tramitar el cambio de caldera')} onClick={() => { updateFunnel({ reforma_cee_previo: 'no' }); push('fotos'); }} />
            <IconCard icon="❓" title="No lo sé" subtitle={t('No estoy seguro de si lo tengo o está registrado', 'No se sabe si existe o está registrado')} onClick={() => { updateFunnel({ reforma_cee_previo: 'nose' }); push('fotos'); }} />
        </StepLayout></>);
    }

    // ---- Fotos (gate) ----
    if (screen === 'fotos') {
        return (<><BackBtn /><StepLayout
            question={t('¿Tienes fotos de ANTES de la reforma?', '¿Hay fotos de ANTES de la reforma?')}
            subtitle="Imprescindible: hacen falta fotos del estado anterior (caldera antigua y su placa, ventanas viejas, etc.) de todo lo que entre en la ayuda. Sin fotos del ANTES no se puede justificar la reforma y no hay ayuda posible.">
            <IconCard icon="📸" title="Sí, las tengo" subtitle="Fotos del estado anterior (caldera, placa, ventanas…)" onClick={() => { updateFunnel({ reforma_fotos: 'si' }); push(ej ? 'cee_ambos' : gastoStep()); }} />
            <IconCard icon="🚫" title="No las tengo y no las puedo conseguir" subtitle="Sin fotos del ANTES no se pueden tramitar las ayudas" onClick={() => { updateFunnel({ reforma_fotos: 'no' }); push('block_fotos'); }} />
        </StepLayout></>);
    }
    if (screen === 'block_fotos') {
        return <DeadEnd emoji="🙈" title="Sin fotos no podemos justificar la reforma"
            cta={<button onClick={onRestart} className={primaryBtn}>Empezar de nuevo</button>}>
            <p>Sin fotografías del estado anterior <strong className="text-white">no podemos justificar la reforma</strong> y, por tanto, {t('no podrías obtener la ayuda', 'no se podría obtener la ayuda')}.</p>
            <p>{t(<>Te recomendamos <strong className="text-amber-400">encarecidamente que busques</strong> a ver si las encuentras (móvil viejo, álbumes, mensajes…). Si aparecen, vuelve a rellenar el formulario.</>, <>Conviene <strong className="text-amber-400">revisar a fondo</strong> si existen (móvil viejo, álbumes, mensajes…). Si aparecen, se puede volver a rellenar el formulario.</>)}</p>
        </DeadEnd>;
    }
    if (screen === 'cee_ambos') {
        const afterCee = (val) => {
            updateFunnel({ reforma_cee_ambos: val, ...(ej ? { gasto_anual_eur: 0 } : {}) });
            push(ej ? 'presupuesto' : gastoStep());
        };
        return (<><BackBtn /><StepLayout question={t('¿Tienes certificados de eficiencia energética?', '¿Hay certificados de eficiencia energética?')} subtitle="Para valorar la reforma completa y la deducción de IRPF necesitamos certificado previo (registrado) y posterior a la reforma.">
            <IconCard icon="📑" title={t('Sí, tengo ambos (antes y después)', 'Sí, ambos (antes y después)')} subtitle="Registrados — los revisamos" onClick={() => afterCee('si')} />
            <IconCard icon="📄" title="No / sólo uno" subtitle={t('Valoramos las vías posibles al revisar tu caso', 'Se valoran las vías posibles al revisar el caso')} onClick={() => afterCee('no')} />
        </StepLayout></>);
    }

    // ───────────────────────────────────────────────────────────────────────
    // CIERRE UNIFICADO con /calcula-tu-ayuda
    // Sustituye la antigua pantalla "¡Buenas noticias!" + contacto + confirm_dedu.
    // Flujo nuevo: gasto → presupuesto → delivery (LeadDeliveryView con 3 CTAs)
    // → submit → result (LandingResultView con métricas + CTA subida docs).
    // ───────────────────────────────────────────────────────────────────────

    // ---- Gasto anual (Step7 reutilizado) ----
    if (screen === 'gasto') {
        return (<><BackBtn /><Step7_Gasto funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('presupuesto')} /></>);
    }

    // ---- Presupuesto (Step8 reutilizado) ----
    if (screen === 'presupuesto') {
        // Internal → identificación de la oportunidad. Público → entrega (delivery).
        const onPresupuestoNext = () => push(isInternal ? 'identificacion' : 'delivery');
        return (<><BackBtn /><Step8_Presupuesto funnel={funnel} updateFunnel={updateFunnel} onNext={onPresupuestoNext} hideInstalador isInternal={isInternal} /></>);
    }

    // ---- INTERNAL: identificación de la oportunidad (cierre del flujo del partner) ----
    // Misma pantalla "¿Cómo identificas esta oportunidad?" del funnel interno clásico.
    // Al confirmar, crea la oportunidad y abre la calculadora (onCreated).
    if (screen === 'identificacion') {
        return (
            <>
                <BackBtn />
                <Step9_Contacto
                    funnel={funnel} updateFunnel={updateFunnel}
                    contacto={contacto} setContacto={setContacto}
                    onSubmit={doSubmitInternal}
                    submitting={submitting}
                    submitError={submitError}
                    mode="internal"
                />
            </>
        );
    }

    // ---- Delivery: resultado + 3 CTAs (WhatsApp / email / técnico) ----
    if (screen === 'delivery') {
        return (
            <LeadDeliveryView
                funnel={funnel}
                catastro={catastro}
                contacto={contacto}
                setContacto={setContacto}
                deliveryPreference={deliveryPreference}
                setDeliveryPreference={setDeliveryPreference}
                onCaptureSummary={r => { deliverySummaryRef.current = r; }}
                onSubmit={doSubmit}
                onBack={() => back()}
                submitting={submitting}
                submitError={submitError}
                partnerBranding={partnerBranding}
                origen="reforma"
            />
        );
    }

    return null;
}
