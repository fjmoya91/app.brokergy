/**
 * LandingFunnelView — Container principal de la landing pública.
 *
 * Orquesta:
 *   - Carga de branding del partner (si la URL es /p/[slug])
 *   - Fase HOME: hero + búsqueda catastral (reutiliza CatastroSearchBox)
 *   - Validación geográfica post-catastro (GEO_BLOCKED si no servido)
 *   - Fase FUNNEL: máquina de estados de los 9 pasos
 *   - Fase SUBMITTING: POST /api/landing/lead
 *   - Fase RESULT: cifras orientativas + instaladores
 *
 * Exporta DEFAULT para que React.lazy() funcione en App.jsx.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

import { CatastroSearchBox } from '../../../components/CatastroSearchBox';
import { ConfirmationCard } from '../../../components/ConfirmationCard';
import { GeoLocatingOverlay } from '../../../components/GeoLocatingOverlay';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { MapPickerModal } from '../../../components/MapPickerModal';

import { useFunnelState } from '../hooks/useFunnelState';
import { funnelToCalculatorInputs, shouldWarnBiomasa } from '../data/funnelToInputs';

import { StepHeader } from '../components/StepHeader';
import { CalculatingOverlay } from '../components/CalculatingOverlay';
import { Step1_TipoProyecto } from '../steps/Step1_TipoProyecto';
import { Step2_Combustible } from '../steps/Step2_Combustible';
import { Step3_EdadCaldera } from '../steps/Step3_EdadCaldera';
import { Step4_Emisores } from '../steps/Step4_Emisores';
import { Step5_ACS } from '../steps/Step5_ACS';
import { Step6_ElementosReforma } from '../steps/Step6_ElementosReforma';
import { Step7_Gasto } from '../steps/Step7_Gasto';
import { Step8_Presupuesto } from '../steps/Step8_Presupuesto';
import { Step9_Contacto } from '../steps/Step9_Contacto';
import { LandingResultView } from './LandingResultView';

const CATASTRO_API = '/api/catastro';

export default function LandingFunnelView({ route }) {
    // ---- Branding del partner ----
    const [partnerBranding, setPartnerBranding] = useState(null);
    const [partnerError, setPartnerError] = useState(null);

    useEffect(() => {
        if (route?.type !== 'partner' || !route?.slug) return;
        axios.get(`/api/landing/partner/${route.slug}`)
            .then(res => setPartnerBranding(res.data))
            .catch(err => {
                console.warn('[Landing] Partner no encontrado:', err.message);
                setPartnerError('Esta landing no está disponible.');
            });
    }, [route?.type, route?.slug]);

    // ---- Fase global ----
    const [phase, setPhase] = useState('HOME'); // HOME | GEO_BLOCKED | FUNNEL | SUBMITTING | RESULT
    const [catastro, setCatastro] = useState(null);
    const [confirmCandidate, setConfirmCandidate] = useState(null);
    const [catastroLoading, setCatastroLoading] = useState(false);
    const [catastroError, setCatastroError] = useState(null);
    const [geoBlockedInfo, setGeoBlockedInfo] = useState(null);
    const [geoStage, setGeoStage] = useState(null);
    const [lastGeoCoords, setLastGeoCoords] = useState(null);
    const [showMapPicker, setShowMapPicker] = useState(false);

    // ---- Funnel state ----
    const { funnel, updateFunnel, currentStep, goNext, goBack, resetFunnel } = useFunnelState();

    // ---- Contacto (separado del funnel persistido por RGPD) ----
    const [contacto, setContacto] = useState({
        nombre: '', email: '', tlf: '', titular_type: null, timeline: null, rgpd_aceptado: false
    });

    // ---- Resultado del POST ----
    const [leadResult, setLeadResult] = useState(null);
    const [submittedInputs, setSubmittedInputs] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // ---- Helpers catastro (replican el flujo de App.jsx) ----
    // Construye un candidate listo para ConfirmationCard, con vecinos cargados.
    const buildCandidateFromPropertyData = async (propertyData, location) => {
        const candidate = {
            description: propertyData.address,
            rc: propertyData.rc,
            location,
            imageUrl: `${CATASTRO_API}/image/${propertyData.rc}`,
            fullData: propertyData,
            isResolved: true,
            neighbors: []
        };
        if (propertyData.address) {
            try {
                setGeoStage('neighbors');
                const neighborsRes = await axios.get(`${CATASTRO_API}/neighbors`, {
                    params: { address: propertyData.address }
                });
                candidate.neighbors = neighborsRes.data;
            } catch (e) {
                console.warn('[Landing] No se pudieron cargar vecinos', e);
            }
        }
        return candidate;
    };

    // ---- Búsqueda catastral ----
    const handleSearch = async (query) => {
        setCatastroLoading(true);
        setCatastroError(null);
        try {
            const res = await axios.get(`${CATASTRO_API}/search`, { params: { q: query } });
            if (res.data.type === 'RC_RESULT') {
                // Es una RC ya resuelta — pasamos al gate sin pantalla de confirmación
                handleCatastroResolved(res.data.data);
            } else if (res.data.type === 'ADDRESS_CANDIDATES') {
                if (!res.data.data.length) {
                    setCatastroError('No encontramos direcciones. Intenta ser más específico.');
                } else {
                    setConfirmCandidate(res.data.data[0]);
                }
            }
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'RC_INVALID_FORMAT') setCatastroError('La referencia catastral no tiene formato válido.');
            else if (code === 'RC_NOT_FOUND') setCatastroError('No encontramos esa referencia catastral.');
            else setCatastroError('No pudimos completar la búsqueda. Inténtalo de nuevo.');
        } finally {
            setCatastroLoading(false);
        }
    };

    const handleAddressSelect = async (suggestion) => {
        setCatastroLoading(true);
        setCatastroError(null);
        try {
            // 1. Place details → lat/lng
            const detailsRes = await axios.get(`${CATASTRO_API}/place-details`, { params: { place_id: suggestion.place_id } });
            const location = detailsRes.data;
            setLastGeoCoords(location);
            // 2. Reverse-geocode → propertyData
            const revRes = await axios.post(`${CATASTRO_API}/reverse-geocode`, { lat: location.lat, lng: location.lng });
            // 3. Candidate con vecinos
            const candidate = await buildCandidateFromPropertyData(revRes.data, location);
            setConfirmCandidate(candidate);
        } catch (err) {
            setCatastroError('No pudimos obtener los datos de esta dirección.');
        } finally {
            setGeoStage(null);
            setCatastroLoading(false);
        }
    };

    const handleGeolocate = () => new Promise((resolve) => {
        if (!navigator.geolocation) {
            setCatastroError('Tu navegador no soporta geolocalización.');
            return resolve();
        }
        setCatastroError(null);
        setGeoStage('gps');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude: lat, longitude: lng } = pos.coords;
                    setLastGeoCoords({ lat, lng });
                    setGeoStage('catastro');

                    const revRes = await axios.post(`${CATASTRO_API}/reverse-geocode`, {
                        lat, lng, source: 'gps'
                    });
                    const propertyData = revRes.data;

                    const candidate = await buildCandidateFromPropertyData(propertyData, { lat, lng });
                    setConfirmCandidate(candidate);
                } catch (err) {
                    if (err.response?.status === 404) {
                        setCatastroError('No encontramos ninguna propiedad en tu ubicación. Puedes ajustar la posición en el mapa o buscar por dirección.');
                    } else {
                        setCatastroError('No pudimos identificar tu propiedad por GPS. Prueba a buscar por dirección o ajustar la chincheta en el mapa.');
                    }
                } finally {
                    setGeoStage(null);
                    resolve();
                }
            },
            (err) => {
                setGeoStage(null);
                if (err.code === 1) setCatastroError('Has denegado el acceso a la ubicación. Habilítalo en los ajustes del navegador.');
                else if (err.code === 2) setCatastroError('No pudimos determinar tu ubicación. Comprueba que el GPS esté activo.');
                else if (err.code === 3) setCatastroError('La ubicación ha tardado demasiado. Inténtalo de nuevo.');
                else setCatastroError('No pudimos obtener tu ubicación.');
                resolve();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    });

    // Usuario ajustó la chincheta en el mapa y confirmó
    const handleMapPickConfirm = async (propertyData) => {
        setShowMapPicker(false);
        setGeoStage('neighbors');
        try {
            const candidate = await buildCandidateFromPropertyData(propertyData, lastGeoCoords);
            setConfirmCandidate(candidate);
        } catch (err) {
            setCatastroError('No pudimos cargar el entorno de la vivienda seleccionada.');
        } finally {
            setGeoStage(null);
        }
    };

    const handleConfirmCandidate = async (candidate) => {
        if (candidate.isResolved && candidate.fullData) {
            handleCatastroResolved(candidate.fullData);
            return;
        }
        setCatastroLoading(true);
        try {
            const res = await axios.get(`${CATASTRO_API}/property-data`, { params: { rc: candidate.rc } });
            handleCatastroResolved(res.data);
        } catch {
            setCatastroError('No pudimos obtener los datos de esta propiedad.');
        } finally {
            setCatastroLoading(false);
        }
    };

    // Tras resolver catastro: validar provincia y entrar al funnel
    const handleCatastroResolved = async (data) => {
        setConfirmCandidate(null);

        // Llamada de prueba al endpoint protegido por geoGate — usamos OPTIONS-like
        // verificación: hacemos un fetch a /config para sacar la lista de provincias.
        try {
            const configRes = await axios.get('/api/landing/config');
            const provCode = String(data.provinceCode || '').padStart(2, '0');
            const allowed = (configRes.data?.provincias_atendidas || []).some(p => p.code === provCode);

            if (!allowed) {
                setGeoBlockedInfo({
                    provincia: data.address || 'tu zona',
                    ccaa_atendidas: configRes.data?.ccaa_atendidas || []
                });
                setCatastro(data);
                setPhase('GEO_BLOCKED');
                return;
            }
        } catch (err) {
            console.warn('[Landing] No se pudo verificar config; permitimos paso optimista', err);
        }

        setCatastro(data);
        setPhase('FUNNEL');
    };

    // ---- Submit del funnel ----
    const handleSubmit = useCallback(async () => {
        setSubmitting(true);
        setSubmitError(null);
        const submitStart = Date.now();
        const MIN_VISIBLE_MS = 3000; // Mostrar overlay al menos 3s para percepción "cálculo serio"

        try {
            const calculatorInputs = funnelToCalculatorInputs(funnel, catastro);
            const payload = {
                provinceCode: String(catastro?.provinceCode || '').padStart(2, '0'),
                partner_slug: partnerBranding?.slug || null,
                turnstile_token: null, // Fase 2B: integrar widget Turnstile
                contacto,
                catastro: {
                    ref_catastral: catastro?.rc,
                    address: catastro?.address,
                    municipio: catastro?.municipality || catastro?.municipio,
                    codigo_postal: catastro?.postalCode || null
                },
                funnel: {
                    ...funnel,
                    timeline: contacto.timeline,
                    titular_type: contacto.titular_type
                },
                calculatorInputs
            };

            const res = await axios.post('/api/landing/lead', payload);

            // Esperar a que se cumpla el tiempo mínimo de overlay antes de mostrar resultado
            const elapsed = Date.now() - submitStart;
            if (elapsed < MIN_VISIBLE_MS) {
                await new Promise(r => setTimeout(r, MIN_VISIBLE_MS - elapsed));
            }

            setLeadResult({ ...res.data, provincia: catastro?.province || null });
            setSubmittedInputs(calculatorInputs);
            setPhase('RESULT');
            setSubmitting(false);
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'No pudimos guardar tus datos. Inténtalo en un momento.';
            // Aun ante error, esperamos un poco para no parpadear la pantalla
            const elapsed = Date.now() - submitStart;
            if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed));
            setSubmitError(msg);
            setSubmitting(false);
        }
    }, [funnel, contacto, catastro, partnerBranding]);

    // ---- Pasos activos (8 si solo cambio de caldera, 9 si reforma integral) ----
    const activeSteps = useMemo(() => {
        const base = [
            Step1_TipoProyecto,
            Step2_Combustible,
            Step3_EdadCaldera,
            Step4_Emisores,
            Step5_ACS
        ];
        if (funnel.isReforma) base.push(Step6_ElementosReforma);
        base.push(Step7_Gasto, Step8_Presupuesto, Step9_Contacto);
        return base;
    }, [funnel.isReforma]);

    const totalSteps = activeSteps.length;

    const renderStep = () => {
        const StepComponent = activeSteps[currentStep];
        if (!StepComponent) return null;
        // El último paso (contacto) recibe props extra para el submit
        if (StepComponent === Step9_Contacto) {
            return (
                <Step9_Contacto
                    funnel={funnel} updateFunnel={updateFunnel}
                    contacto={contacto} setContacto={setContacto}
                    onSubmit={handleSubmit}
                    submitting={submitting}
                    submitError={submitError}
                />
            );
        }
        return <StepComponent funnel={funnel} updateFunnel={updateFunnel} onNext={goNext} />;
    };

    // ---- Render principal ----
    return (
        <div className="min-h-screen bg-slate-950 relative overflow-x-hidden">
            <DynamicNetworkBackground />
            <GeoLocatingOverlay stage={geoStage} />

            <div className="relative z-10 px-4 py-8 md:py-12">
                {/* Header con branding */}
                <header className="max-w-3xl mx-auto mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {partnerBranding?.logo_url ? (
                            <img src={partnerBranding.logo_url} alt={partnerBranding.nombre_comercial} className="h-10 w-auto object-contain" />
                        ) : (
                            <div className="text-2xl md:text-3xl font-black tracking-tight">
                                <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                            </div>
                        )}
                    </div>
                    {partnerBranding?.telefono_contacto && (
                        <a href={`tel:${partnerBranding.telefono_contacto}`} className="text-xs font-bold text-amber-400 hover:text-amber-300">
                            📞 {partnerBranding.telefono_contacto}
                        </a>
                    )}
                </header>

                {partnerError && (
                    <div className="max-w-md mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
                        <p className="text-red-400 text-sm">{partnerError}</p>
                    </div>
                )}

                <main className="max-w-3xl mx-auto">
                    {phase === 'HOME' && (
                        <>
                            <div className="text-center mb-10">
                                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
                                    {partnerBranding?.titulo || (
                                        <>Calcula tu ahorro con <span className="text-amber-400">aerotermia</span></>
                                    )}
                                </h1>
                                <p className="text-white/60 text-base md:text-lg mt-4 max-w-2xl mx-auto">
                                    {partnerBranding?.subtitulo || 'Te decimos cuánto te ahorras al año y qué ayuda del Estado te corresponde. Sin compromiso.'}
                                </p>
                            </div>

                            {!confirmCandidate ? (
                                <CatastroSearchBox
                                    onSearch={handleSearch}
                                    onAddressSelect={handleAddressSelect}
                                    onGeolocate={handleGeolocate}
                                    onManualEntry={null}
                                />
                            ) : (
                                <ConfirmationCard
                                    candidate={confirmCandidate}
                                    onConfirm={handleConfirmCandidate}
                                    onCancel={() => setConfirmCandidate(null)}
                                    onPickOnMap={lastGeoCoords ? () => setShowMapPicker(true) : undefined}
                                />
                            )}

                            {catastroLoading && (
                                <div className="mt-6 text-center text-amber-400 text-sm">Resolviendo dirección…</div>
                            )}
                            {catastroError && (
                                <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
                                    <p className="text-red-400 text-sm">{catastroError}</p>
                                </div>
                            )}
                        </>
                    )}

                    {phase === 'GEO_BLOCKED' && (
                        <div className="text-center max-w-xl mx-auto">
                            <div className="text-6xl mb-6">📍</div>
                            <h2 className="text-2xl md:text-3xl font-black text-white mb-4">
                                Aún no operamos en tu zona
                            </h2>
                            <p className="text-white/60 mb-6">
                                Por ahora atendemos en: <span className="text-amber-400 font-bold">{(geoBlockedInfo?.ccaa_atendidas || []).join(' · ')}</span>.
                                Pero estamos en expansión.
                            </p>
                            <div className="p-6 bg-white/[0.04] border border-white/10 rounded-3xl">
                                <p className="text-white/70 text-sm mb-4">
                                    Si quieres, déjanos tu email y te avisaremos cuando lleguemos a tu zona:
                                </p>
                                <a href="mailto:contacto@brokergy.es?subject=Aviso%20expansión%20zona"
                                   className="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-400 text-bkg-deep font-black uppercase tracking-widest text-xs rounded-2xl">
                                    Avisarme cuando lleguéis
                                </a>
                            </div>
                            <button onClick={() => { setPhase('HOME'); setCatastro(null); setGeoBlockedInfo(null); }}
                                    className="mt-6 text-white/40 hover:text-white/70 text-xs font-bold uppercase tracking-widest">
                                ← Probar otra dirección
                            </button>
                        </div>
                    )}

                    {phase === 'FUNNEL' && (
                        <>
                            <StepHeader
                                currentStep={currentStep + 1}
                                totalSteps={totalSteps}
                                onBack={goBack}
                                canGoBack={currentStep > 0}
                            />
                            {renderStep()}
                        </>
                    )}

                    {phase === 'RESULT' && leadResult && (
                        <LandingResultView
                            leadResult={leadResult}
                            funnel={funnel}
                            contacto={contacto}
                            partnerBranding={partnerBranding}
                            calculatorInputs={submittedInputs}
                        />
                    )}
                </main>

                <footer className="max-w-3xl mx-auto mt-16 pt-6 border-t border-white/5 text-center">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">
                        Brokergy Analytics · © 2026
                    </p>
                </footer>
            </div>

            {/* MapPicker (ajuste manual de la chincheta) */}
            {showMapPicker && lastGeoCoords && (
                <MapPickerModal
                    initialLat={lastGeoCoords.lat}
                    initialLng={lastGeoCoords.lng}
                    onConfirm={handleMapPickConfirm}
                    onCancel={() => setShowMapPicker(false)}
                />
            )}

            {/* Overlay calculando — mostrar durante submit */}
            <CalculatingOverlay visible={submitting} />
        </div>
    );
}
