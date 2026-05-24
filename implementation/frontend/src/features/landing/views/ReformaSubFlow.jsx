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
import { Step3_EdadCaldera } from '../steps/Step3_EdadCaldera';
import { Step4_Emisores } from '../steps/Step4_Emisores';
import { Step5_ACS } from '../steps/Step5_ACS';
import { Step8_Presupuesto } from '../steps/Step8_Presupuesto';
import { Step9_Contacto } from '../steps/Step9_Contacto';
import { LandingResultView } from './LandingResultView';
import { funnelToCalculatorInputs } from '../data/funnelToInputs';
import { computeFullCalculatorResult } from '../data/landingCalculation';

const BOILER_COMBUSTIBLE = ['gas', 'gasoleo', 'carbon', 'biomasa'];

export function ReformaSubFlow({ catastro, funnel, updateFunnel, partnerBranding, onNoEmpezada, onRestart }) {
    const [stack, setStack] = useState(['estado']);
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

    // Ref al funnel para leer el valor más reciente dentro de onNext con delay.
    const funnelRef = useRef(funnel);
    funnelRef.current = funnel;

    const screen = stack[stack.length - 1];
    const push = useCallback((s) => { setStack(prev => [...prev, s]); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
    const back = useCallback(() => { setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

    const ej = funnel.obra_estado === 'ejecutada';

    // ---------- Elegibilidad (lenguaje claro, sin jerga) ----------
    const calc = () => {
        const c = funnel.combustible_actual;
        const esCombustible = BOILER_COMBUSTIBLE.includes(c);
        const esBiomasa = c === 'biomasa';
        const els = funnel.reforma_elementos || {};
        const cambioCaldera = !!els.caldera;
        const env = !!(els.ventanas || els.cubierta || els.paredes || els.suelo);
        const cee = ej ? funnel.reforma_cee_ambos === 'si' : funnel.reforma_cee_previo === 'si';

        const ayudaCaldera = esCombustible && cambioCaldera;
        let ayudaReforma = false, reformaRevisar = false;
        if (!ej) {
            if (funnel.reforma_facturas === 'no' || funnel.reforma_factura_fecha === 'menos1mes') ayudaReforma = env;
            else if (cee) reformaRevisar = env || cee;
        } else if (cee) reformaRevisar = true;

        const irpfRevisar = cee;
        const ayudaBaja = !cambioCaldera;
        const elegible = ayudaCaldera || ayudaReforma || reformaRevisar || env || cee;
        return { esCombustible, esBiomasa, cambioCaldera, env, cee, ayudaCaldera, ayudaReforma, reformaRevisar, irpfRevisar, ayudaBaja, elegible };
    };

    // ---------- Navegación combustible ----------
    const pickCombustible = (value) => {
        if (value === 'no_tiene') {
            updateFunnel({ combustible_actual: null, reforma_sin_caldera: true, edad_caldera: null, condensacion: null, emisor_tipo: 'radiadores_convencionales' });
            push('acs'); // sin caldera: salta edad y emisores
            return;
        }
        updateFunnel({ combustible_actual: value, reforma_sin_caldera: false, edad_caldera: null, condensacion: null });
        if (value === 'electrica') { push('emisores'); return; } // salta edad
        push('edad');
    };

    const toggleEl = (key) => {
        const next = { ...(funnel.reforma_elementos || {}), [key]: !funnel.reforma_elementos?.[key] };
        const env = !!(next.ventanas || next.cubierta || next.paredes || next.suelo);
        updateFunnel({ reforma_elementos: next, isReforma: env });
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
                    via: fuerte ? 'aerotermia' : 'deduccion_irpf'
                }
            };

            const res = await axios.post('/api/landing/lead', payload);
            setLeadResult({ ...res.data, provincia: catastro?.province || null });
            setUploadLink(res.data?.upload_link || null);
            setSubmittedInputs(calculatorInputs);
            setSubmitting(false);
            push(fuerte ? 'result' : 'confirm_dedu');
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'No pudimos guardar tus datos. Inténtalo en un momento.');
            setSubmitting(false);
        }
    };

    // ---------- UI helpers ----------
    const BackBtn = () => (
        stack.length > 1 ? (
            <button type="button" onClick={back}
                className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-xs uppercase tracking-widest font-bold py-2 mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                Atrás
            </button>
        ) : null
    );

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
            <>
                {uploadLink && (
                    <div className="max-w-2xl mx-auto mb-6 p-5 bg-gradient-to-br from-amber-500/20 to-amber-400/5 border-2 border-amber-400/40 rounded-3xl animate-fade-in">
                        <p className="text-amber-300 font-black text-base leading-tight">📎 Sube tu documentación</p>
                        <p className="text-white/70 text-sm mt-2 leading-relaxed">Te hemos enviado el enlace por WhatsApp y email. También puedes hacerlo ahora mismo (fotos de la caldera, certificados, facturas…).</p>
                        <a href={uploadLink} className="mt-4 inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep font-black uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20">Subir mis documentos</a>
                    </div>
                )}
                <LandingResultView leadResult={leadResult} funnel={funnel} contacto={contacto} partnerBranding={partnerBranding} calculatorInputs={submittedInputs} />
            </>
        );
    }

    if (screen === 'estado') {
        return (
            <div className="animate-fade-in">
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">¿En qué punto está tu <span className="text-amber-400">obra</span>?</h1>
                    <p className="text-white/60 text-base md:text-lg mt-4 max-w-2xl mx-auto">Cuéntanos cómo está la reforma. Sin compromiso.</p>
                </div>
                <div className="space-y-3 max-w-2xl mx-auto">
                    <IconCard icon="📐" title="Aún no he empezado la obra" subtitle="Quiero saber qué ayudas tendría antes de empezar"
                        onClick={() => { updateFunnel({ obra_estado: 'no_empezada' }); onNoEmpezada(); }} />
                    <IconCard icon="🚧" title="Obra a medias" subtitle="Ya he empezado la reforma pero no está terminada"
                        onClick={() => { updateFunnel({ obra_estado: 'a_medias' }); push('combustible'); }} />
                    <IconCard icon="✅" title="Obra ya ejecutada" subtitle="La reforma ya está hecha y quiero ver si puedo conseguir ayudas"
                        onClick={() => { updateFunnel({ obra_estado: 'ejecutada' }); push('ejec_fecha'); }} />
                    <IconCard icon="🏗️" title="Obra nueva" subtitle="Construyo una vivienda desde cero"
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
        return (<><BackBtn /><StepLayout question="¿La obra está totalmente terminada?" subtitle="Si sólo tienes una factura parcial, en realidad es una obra a medias y la tratamos de otra forma.">
            <IconCard icon="🏁" title="Sí, totalmente terminada" subtitle="La reforma está acabada y facturada"
                onClick={() => push('combustible')} />
            <IconCard icon="🚧" title="Tengo factura parcial" subtitle="Aún queda obra por hacer"
                onClick={() => { updateFunnel({ obra_estado: 'a_medias' }); push('combustible'); }} />
        </StepLayout></>);
    }

    // ---- TÉRMICO: combustible (Step2 + opción "sin caldera") ----
    if (screen === 'combustible') {
        const verbo = ej ? 'calentabas tu vivienda ANTES de la reforma' : 'se calienta hoy tu vivienda';
        return (<><BackBtn /><StepLayout question={`¿Con qué ${verbo}?`} subtitle="Esto nos ayuda a calcular cuánto puedes ahorrar.">
            <IconCard icon="🔥" title="Gas natural o butano" subtitle="Caldera de gas (la más común en España)" selected={funnel.combustible_actual === 'gas'} onClick={() => pickCombustible('gas')} />
            <IconCard icon="🛢️" title="Gasóleo / Diésel" subtitle="Caldera con depósito de combustible líquido" selected={funnel.combustible_actual === 'gasoleo'} onClick={() => pickCombustible('gasoleo')} />
            <IconCard icon="⚡" title="Electricidad" subtitle="Radiadores eléctricos o caldera eléctrica" selected={funnel.combustible_actual === 'electrica'} onClick={() => pickCombustible('electrica')} />
            <IconCard icon="⚫" title="Carbón" subtitle="Estufa o caldera de carbón" selected={funnel.combustible_actual === 'carbon'} onClick={() => pickCombustible('carbon')} />
            <IconCard icon="🪵" title="Biomasa" subtitle="Pellets, leña o hueso de aceituna" selected={funnel.combustible_actual === 'biomasa'} onClick={() => pickCombustible('biomasa')} />
            <IconCard icon="🚫" title={ej ? 'No tenía caldera de calefacción' : 'No tengo caldera de calefacción'} subtitle="No hay/había sistema central de calefacción" selected={funnel.reforma_sin_caldera} onClick={() => pickCombustible('no_tiene')} />
        </StepLayout></>);
    }

    // ---- TÉRMICO: edad caldera (Step3 reutilizado) ----
    if (screen === 'edad') {
        return (<><BackBtn /><Step3_EdadCaldera funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('emisores')} /></>);
    }
    // ---- TÉRMICO: emisores (Step4 reutilizado) ----
    if (screen === 'emisores') {
        return (<><BackBtn /><Step4_Emisores funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('acs')} /></>);
    }
    // ---- TÉRMICO: ACS (Step5 reutilizado) ----
    if (screen === 'acs') {
        return (<><BackBtn /><Step5_ACS funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('elementos')} /></>);
    }

    // ---- Elementos a incluir (multi) ----
    if (screen === 'elementos') {
        const els = funnel.reforma_elementos || {};
        const hayEnv = els.ventanas || els.cubierta || els.paredes || els.suelo || els.placas;
        const any = els.caldera || hayEnv;
        return (<><BackBtn />
            <StepLayout
                question={ej ? '¿Qué incluyó la reforma?' : '¿Qué quieres incluir en la ayuda?'}
                subtitle="Marca todos los elementos en los que se actúa. Puedes elegir varios."
                onContinue={() => push(ej ? 'fotos' : 'facturas')}
                canContinue={any}
            >
                <IconCard icon="🔄" title="Cambio de caldera por aerotermia" subtitle={ej ? 'Se sustituyó la caldera' : 'Sustituir la caldera actual'} selected={!!els.caldera} onClick={() => toggleEl('caldera')} badge="Mayor ayuda" />
                <IconCard icon="🪟" title="Ventanas" subtitle="Cambio de ventanas por modelos más eficientes" selected={!!els.ventanas} onClick={() => toggleEl('ventanas')} />
                <IconCard icon="🏠" title="Cubierta / tejado" subtitle="Aislamiento del techo o tejado" selected={!!els.cubierta} onClick={() => toggleEl('cubierta')} />
                <IconCard icon="🧱" title="Fachada (paredes exteriores)" subtitle="SATE, trasdosado o aislamiento de fachada" selected={!!els.paredes} onClick={() => toggleEl('paredes')} />
                <IconCard icon="⬇️" title="Suelo" subtitle="Aislamiento del suelo de la vivienda" selected={!!els.suelo} onClick={() => toggleEl('suelo')} />
                <IconCard icon="☀️" title="Placas solares" subtitle="Autoconsumo fotovoltaico" selected={!!els.placas} onClick={() => toggleEl('placas')} />
                {!els.caldera && any && (
                    <div className="p-5 bg-gradient-to-r from-amber-500/15 to-amber-400/5 border-2 border-amber-400/30 rounded-2xl animate-fade-in">
                        <div className="flex gap-3"><span className="text-2xl shrink-0">💡</span><div>
                            <div className="text-amber-300 font-black text-sm mb-1">¿Y la aerotermia?</div>
                            <p className="text-white/70 text-xs leading-relaxed">Donde de verdad se consigue la <strong className="text-white">mayor ayuda</strong> es <strong className="text-amber-300">cambiando la caldera por aerotermia</strong>. Si solo mejoras el aislamiento, las ayudas son bastante más bajas. Te recomendamos incluirla.</p>
                        </div></div>
                    </div>
                )}
            </StepLayout></>);
    }

    // ---- A medias: facturas ----
    if (screen === 'facturas') {
        return (<><BackBtn /><StepLayout question="¿Ya tienes facturas emitidas de la reforma?" subtitle="Es clave: si ya hay facturas, cambia qué ayudas podemos tramitar.">
            <IconCard icon="📄" title="Sí, ya tengo facturas" subtitle="Hay trabajos ya facturados" onClick={() => { updateFunnel({ reforma_facturas: 'si' }); push('factura_fecha'); }} />
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
        return (<><BackBtn /><StepLayout question="¿Tienes Certificado de Eficiencia Energética previo?" subtitle="Tiene que estar registrado en tu Comunidad Autónoma y ser anterior a la reforma. Es lo que permite tramitar la reforma completa cuando ya hay facturas.">
            <IconCard icon="📑" title="Sí, lo tengo registrado" subtitle="Lo revisamos para confirmar" onClick={() => { updateFunnel({ reforma_cee_previo: 'si' }); push('fotos'); }} />
            <IconCard icon="🚫" title="No tengo" subtitle="Aún podríamos ayudarte con el cambio de caldera" onClick={() => { updateFunnel({ reforma_cee_previo: 'no' }); push('fotos'); }} />
            <IconCard icon="❓" title="No lo sé" subtitle="No estoy seguro de si lo tengo o está registrado" onClick={() => { updateFunnel({ reforma_cee_previo: 'nose' }); push('fotos'); }} />
        </StepLayout></>);
    }

    // ---- Fotos (gate) ----
    if (screen === 'fotos') {
        return (<><BackBtn /><StepLayout question="¿Tienes fotografías de lo que había antes?" subtitle="Necesitamos fotos de la caldera antigua y su placa, ventanas viejas, etc. — de todo lo que quieras meter en la ayuda. Sin fotos no se puede justificar la reforma.">
            <IconCard icon="📸" title="Sí, tengo fotos" subtitle="Del estado anterior (caldera, placa, ventanas…)" onClick={() => { updateFunnel({ reforma_fotos: 'si' }); push(ej ? 'cee_ambos' : 'resumen'); }} />
            <IconCard icon="🙈" title="No tengo fotos" subtitle="No hice fotos antes de la reforma" onClick={() => { updateFunnel({ reforma_fotos: 'no' }); push('block_fotos'); }} />
        </StepLayout></>);
    }
    if (screen === 'block_fotos') {
        return <DeadEnd emoji="🙈" title="Sin fotos no podemos justificar la reforma"
            cta={<button onClick={onRestart} className={primaryBtn}>Empezar de nuevo</button>}>
            <p>Sin fotografías del estado anterior <strong className="text-white">no podemos justificar la reforma</strong> y, por tanto, no podrías obtener la ayuda.</p>
            <p>Te recomendamos <strong className="text-amber-400">encarecidamente que busques</strong> a ver si las encuentras (móvil viejo, álbumes, mensajes…). Si aparecen, vuelve a rellenar el formulario.</p>
        </DeadEnd>;
    }
    if (screen === 'cee_ambos') {
        return (<><BackBtn /><StepLayout question="¿Tienes certificados de eficiencia energética?" subtitle="Para valorar la reforma completa y la deducción de IRPF necesitamos certificado previo (registrado) y posterior a la reforma.">
            <IconCard icon="📑" title="Sí, tengo ambos (antes y después)" subtitle="Registrados — los revisamos" onClick={() => { updateFunnel({ reforma_cee_ambos: 'si' }); push('resumen'); }} />
            <IconCard icon="📄" title="No / sólo uno" subtitle="Valoramos las vías posibles al revisar tu caso" onClick={() => { updateFunnel({ reforma_cee_ambos: 'no' }); push('resumen'); }} />
        </StepLayout></>);
    }

    // ---- Resumen de elegibilidad ----
    if (screen === 'resumen') {
        const r = calc();
        const els = funnel.reforma_elementos || {};
        const items = [];
        if (!r.ayudaBaja) {
            if (r.ayudaCaldera) items.push({ tone: r.esBiomasa ? 'amber' : 'ok', icon: r.esBiomasa ? '🔎' : '✅', t: 'Ayuda por cambio de caldera por aerotermia', d: r.esBiomasa ? 'Posible — la biomasa está en revisión por el Ministerio.' : 'Sustitución de tu caldera por aerotermia.' });
            if (r.ayudaReforma) items.push({ tone: 'ok', icon: '✅', t: 'Ayuda por Reforma (mejora de aislamiento)', d: 'Tu reforma es elegible para la ayuda de mejora de la envolvente.' });
            if (r.reformaRevisar) items.push({ tone: 'amber', icon: '🔎', t: 'Ayuda por Reforma — a revisar', d: 'Posible, sujeto a revisión de tu certificado de eficiencia energética.' });
            if (r.irpfRevisar) items.push({ tone: 'amber', icon: '🔎', t: 'Deducción en el IRPF — a revisar', d: ej ? 'En obra ejecutada no calculamos el IRPF aquí; lo valoramos al revisar tus certificados.' : 'Posible si mantienes certificados antes/después y facturas.' });
        } else {
            if (els.ventanas) items.push({ tone: 'amber', icon: '💶', t: 'Deducción en el IRPF · Ventanas', d: 'Podrías deducir el 20% del coste de la obra, hasta 1.000€. Si la vivienda tiene dos propietarios, se duplica (hasta 2.000€). Necesitas certificados de eficiencia energética antes y después.' });
            if (els.cubierta || els.paredes || els.suelo) items.push({ tone: 'amber', icon: '🏠', t: 'Deducción IRPF + posible ayuda · Aislamiento', d: 'El 20% del coste hasta 1.000€ en IRPF (el doble si sois dos propietarios). Además, el aislamiento de cubierta, fachada o suelo puede tener ayuda por mejora energética: lo analizamos contigo. Necesitas certificados antes y después.' });
            if (els.placas) items.push({ tone: 'amber', icon: '☀️', t: 'Deducción en el IRPF · Placas solares', d: 'Las placas no dan ayuda directa, pero podrías deducir el 60% del coste, hasta un máximo de 9.000€. Necesitas certificados de eficiencia energética antes y después.' });
        }

        const titulo = !r.elegible ? 'Lo revisamos contigo' : r.ayudaBaja ? 'Aquí la ayuda es pequeña' : '¡Buenas noticias!';
        const subt = !r.elegible ? 'Tu caso necesita una revisión personalizada.' : r.ayudaBaja ? 'Sin aerotermia, lo que te corresponde es básicamente una deducción en el IRPF:' : 'Según lo que nos cuentas, esto es lo que podrías conseguir:';

        return (<><BackBtn />
            <div className="text-center mb-8 animate-fade-in">
                <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight">{titulo}</h2>
                <p className="text-white/55 text-sm md:text-base mt-3 max-w-xl mx-auto">{subt}</p>
            </div>
            <div className="space-y-3 max-w-2xl mx-auto">
                {items.length ? items.map((i, idx) => (
                    <div key={idx} className={`flex items-start gap-3 p-4 rounded-2xl border ${i.tone === 'ok' ? 'border-emerald-400/30 bg-emerald-400/5' : i.tone === 'amber' ? 'border-amber-400/30 bg-amber-400/5' : 'border-white/10 bg-white/[0.03]'}`}>
                        <span className="text-xl mt-0.5">{i.icon}</span>
                        <div><p className="font-black text-white text-sm">{i.t}</p><p className="text-white/55 text-xs mt-1 leading-snug">{i.d}</p></div>
                    </div>
                )) : <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] text-white/50 text-sm">Déjanos tus datos y un técnico revisará tu caso.</div>}
            </div>
            {r.ayudaBaja && (
                <div className="max-w-2xl mx-auto mt-5 p-5 bg-gradient-to-br from-amber-500/20 to-amber-400/5 border-2 border-amber-400/40 rounded-3xl">
                    <div className="flex items-start gap-4"><span className="text-4xl shrink-0">🔥</span><div className="flex-1">
                        <p className="text-amber-300 font-black text-base md:text-lg leading-tight">¿Quieres conseguir mucho más?</p>
                        <p className="text-white/70 text-sm mt-2 leading-relaxed">Donde de verdad se consigue la mayor ayuda es <strong className="text-amber-300">cambiando la caldera por aerotermia</strong>. Si la incluyes, podrías multiplicar lo que recibes.</p>
                        <button onClick={() => push('elementos')} className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep font-black uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20">+ Añadir aerotermia</button>
                    </div></div>
                </div>
            )}
            <div className="max-w-2xl mx-auto mt-5 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/45 leading-relaxed">
                {r.ayudaBaja
                    ? <span><strong className="text-white/70">Para tramitar la deducción</strong> necesitas certificado de eficiencia energética antes y después de la obra. Déjanos tus datos y enviaremos tu solicitud a nuestro equipo (<span className="text-amber-300">info@brokergy.es</span>) para analizar tu caso.</span>
                    : <span><strong className="text-white/70">Importante:</strong> esto es una estimación orientativa. La confirmación final depende de la documentación que aportes y de nuestra revisión técnica.</span>}
            </div>
            <div className="mt-8 flex justify-center">
                <button onClick={() => push(r.ayudaBaja ? 'contacto' : 'presupuesto')} className={primaryBtn}>{r.ayudaBaja ? 'Quiero que lo analicéis →' : 'Calcular mi importe exacto →'}</button>
            </div>
        </>);
    }

    // ---- Presupuesto (Step8 reutilizado) — solo caso con aerotermia ----
    if (screen === 'presupuesto') {
        return (<><BackBtn /><Step8_Presupuesto funnel={funnel} updateFunnel={updateFunnel} onNext={() => push('contacto')} hideInstalador /></>);
    }

    // ---- Contacto (Step9 reutilizado) ----
    if (screen === 'contacto') {
        const fuerte = !!funnel.reforma_elementos?.caldera;
        return (<><BackBtn />
            <Step9_Contacto
                funnel={funnel} updateFunnel={updateFunnel}
                contacto={contacto} setContacto={setContacto}
                onSubmit={doSubmit} submitting={submitting} submitError={submitError}
                mode="public"
                submitLabel={fuerte ? 'Recibir mi cálculo' : 'Enviar mi solicitud'}
            />
        </>);
    }

    // ---- Confirmación (caso solo deducción → info@brokergy.es) ----
    if (screen === 'confirm_dedu') {
        const nombre = (contacto.nombre || '').split(' ')[0] || 'gracias';
        return (
            <div className="animate-fade-in">
                <div className="max-w-xl mx-auto text-center">
                    <div className="text-6xl mb-5">📩</div>
                    <h2 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">¡Recibido, {nombre}!</h2>
                    <p className="text-white/60 text-sm md:text-base mb-2">Hemos enviado tu solicitud a <span className="font-mono text-amber-400 font-bold">info@brokergy.es</span>.</p>
                    <p className="text-white/50 text-sm mb-8">Un técnico analizará tu caso y te contactará para explicarte cómo conseguir tu deducción en el IRPF.</p>
                </div>
                <div className="max-w-xl mx-auto p-6 bg-white/[0.03] border border-white/10 rounded-3xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-4">Para tramitar la deducción harán falta</p>
                    <ul className="space-y-3 text-sm text-white/70">
                        <li className="flex gap-3"><span>📑</span><span><strong className="text-white">Certificado de eficiencia energética ANTES</strong> de la obra (registrado en tu CCAA).</span></li>
                        <li className="flex gap-3"><span>📑</span><span><strong className="text-white">Certificado de eficiencia energética DESPUÉS</strong> de la obra.</span></li>
                        <li className="flex gap-3"><span>🧾</span><span><strong className="text-white">Facturas y justificantes de pago</strong> de la reforma.</span></li>
                    </ul>
                    <p className="text-white/35 text-xs mt-5 leading-relaxed border-t border-white/5 pt-4">Sin los certificados antes y después no es posible aplicar la deducción. Si aún no los tienes, te ayudamos a organizarlo.</p>
                </div>
                {uploadLink && (
                    <div className="max-w-xl mx-auto mt-6 text-center">
                        <a href={uploadLink} className="inline-block px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20">📎 Subir mi documentación</a>
                        <p className="text-white/35 text-xs mt-3">También te lo hemos enviado por WhatsApp y email.</p>
                    </div>
                )}
                <div className="text-center mt-6">
                    <button onClick={onRestart} className="text-white/30 hover:text-white/70 text-[11px] font-black uppercase tracking-widest">Empezar otra simulación</button>
                </div>
            </div>
        );
    }

    return null;
}
