import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CatastroSearchBox } from './components/CatastroSearchBox';
import { ConfirmationCard } from './components/ConfirmationCard';
import { PropertySheet } from './components/PropertySheet';
import { CalculatorView } from './features/calculator/views/CalculatorView';
import { AdminPanelView } from './features/admin/views/AdminPanelView';
import { useAuth } from './context/AuthContext';
import { LoginView } from './features/auth/views/LoginView';

import { DynamicNetworkBackground } from './components/DynamicNetworkBackground';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ClientesView } from './features/clientes/views/ClientesView';
import { AerotermiaView } from './features/aerotermia/views/AerotermiaView';
import { ExpedientesView } from './features/expedientes/views/ExpedientesView';
import { ResetPasswordView } from './features/auth/views/ResetPasswordView';
import { AceptarPropuestaView } from './features/public/views/AceptarPropuestaView';
import { CertAckView } from './features/public/views/CertAckView';
import { WhatsappSettingsView } from './features/whatsapp/views/WhatsappSettingsView';

const API_URL = '/api/catastro'; // Vercel force redeploy v3

function App() {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState('ADMIN');

  // 1. Detectar parámetros de URL (necesarios para inicializar otros estados)
  const [resetToken, setResetToken] = useState(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (path === '/reset-password') return params.get('token') || null;
    return null;
  });

  const [initialExpediente] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('exp') || null;
  });

  const [firmaOportunidadId] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/firma/')) return path.split('/firma/')[1] || null;
    return null;
  });

  const [certAckData] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/cert-ack/')) {
       const id = path.split('/cert-ack/')[1];
       const params = new URLSearchParams(window.location.search);
       const token = params.get('token');
       const phase = params.get('phase');
       if (id && token) return { id, token, phase };
    }
    return null;
  });

  // 2. Inicializar navegación basada en los parámetros detectados
  const [activeTab, setActiveTab] = useState(() => {
    if (initialExpediente) return 'expedientes';
    return 'oportunidades';
  });

  // Ajustar pestaña inicial cuando el usuario carga
  useEffect(() => {
    const userRole = (user?.rol || '').toUpperCase();
    const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
    const isCertificador = userRole === 'CERTIFICADOR' || userRoleId === 4;
    if (isCertificador && activeTab !== 'expedientes') {
      setActiveTab('expedientes');
    }
  }, [user?.id, user?.rol, user?.id_rol, activeTab]);

  const [showSearchModal, setShowSearchModal] = useState(false);

  // Efecto para limpiar el parámetro de la URL tras cargar el deep link
  useEffect(() => {
    if (initialExpediente) {
      // Limpiar el parámetro ?exp de la URL sin recargar la página para que no se re-active al navegar
      const url = new URL(window.location);
      url.searchParams.delete('exp');
      window.history.replaceState({}, '', url);
    }
  }, [initialExpediente]);

  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [propertyData, setPropertyData] = useState(null);
  const [calculatorData, setCalculatorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // States for Existing Opportunity Flow
  const [showExistingModal, setShowExistingModal] = useState(false);
  const [existingOpportunityData, setExistingOpportunityData] = useState(null);
  const [pendingPropertyData, setPendingPropertyData] = useState(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Scroll al inicio cuando cambia de pantalla (mejora UX en móvil)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const checkExistingOpportunity = async (data) => {
    if (!data?.rc) {
      setPropertyData(data);
      setStep('RESULT');
      return;
    }

    setLoading(true);
    setExistingOpportunityData(null);
    setPendingPropertyData(data);
    try {
      const res = await axios.get(`/api/oportunidades/${data.rc}`);
      setExistingOpportunityData(res.data);
      setPendingPropertyData(data);
      setShowExistingModal(true);
    } catch (err) {
      // 404 es que no existe, lo tratamos como nueva
      setPropertyData(data);
      setStep('RESULT');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setLoading(true);
    setError(null);
    // Limpiar inputs persistentes al buscar una nueva RC para evitar contaminar la nueva calculadora
    setPersistentCalculatorInputs(null);
    try {
      const res = await axios.get(`${API_URL}/search`, { params: { q: query } });

      if (res.data.type === 'RC_RESULT') {
        checkExistingOpportunity(res.data.data);
      } else if (res.data.type === 'ADDRESS_CANDIDATES') {
        if (res.data.data.length === 0) {
          setError('No se encontraron direcciones. Intenta ser más específico.');
        } else {
          setCandidates(res.data.data);
          setSelectedCandidate(res.data.data[0]);
          setStep('CONFIRM');
        }
      }
    } catch (err) {
      console.error(err);
      const details = err.response?.data?.details || err.message || '';
      const code = err.response?.data?.code || '';
      
      let errorMsg = 'No se pudo completar la búsqueda.';
      
      if (code === 'RC_INVALID_FORMAT') {
        errorMsg = 'La referencia catastral no tiene un formato válido (deben ser 20 caracteres alfanuméricos). Revisa que no falte ningún dígito.';
      } else if (code === 'RC_NOT_FOUND') {
        errorMsg = 'No se ha encontrado ninguna propiedad con esa referencia. Verifica que sea correcta o busca por dirección.';
      } else if (code === 'CATASTRO_TIMEOUT' || details.includes('timeout')) {
        errorMsg = 'Los servidores de Catastro están tardando demasiado en responder. Inténtalo de nuevo en unos momentos.';
      } else if (code === 'CATASTRO_DOWN' || code === 'CATASTRO_UNREACHABLE') {
        errorMsg = 'El servicio de Catastro parece estar fuera de servicio temporalmente. Puedes probar con la entrada manual.';
      } else if (err.response?.data?.details) {
        errorMsg = err.response.data.details;
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSelect = async (suggestion) => {
    setLoading(true);
    setError(null);
    setPersistentCalculatorInputs(null);
    try {
      // 1. Get Details (Lat/Lng)
      const detailsRes = await axios.get(`${API_URL}/place-details`, { params: { place_id: suggestion.place_id } });
      const location = detailsRes.data; // { lat, lng }

      // 2. Resolve to RC using reverse-geocode
      const revRes = await axios.post(`${API_URL}/reverse-geocode`, {
        lat: location.lat,
        lng: location.lng
      });

      const propertyData = revRes.data;

      // 3. Fetch Neighbors (Wait for this to ensure UI has data)
      let neighbors = [];
      try {
        const neighborsRes = await axios.get(`${API_URL}/neighbors`, {
          params: { address: suggestion.description }
        });
        neighbors = neighborsRes.data;
      } catch (neighErr) {
        console.warn("Could not fetch neighbors", neighErr);
      }

      // 4. Prepare main candidate
      const candidate = {
        description: propertyData.address,
        rc: propertyData.rc,
        location: location,
        imageUrl: `${API_URL}/image/${propertyData.rc}`,
        fullData: propertyData,
        isResolved: true,
        neighbors: neighbors // Neighbors loaded
      };

      setSelectedCandidate(candidate);
      setCandidates([candidate]);
      setStep('CONFIRM');

    } catch (err) {
      console.error(err);
      setError('No se pudo obtener la información catastral de esta dirección.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAddress = async (candidate) => {
    // Limpiar inputs persistentes al confirmar una nueva dirección
    setPersistentCalculatorInputs(null);
    // If we already have the full data (from Autocomplete flow or Neighbor select), just use it
    if (candidate.isResolved && candidate.fullData) {
      // Ensure we use the CANDIDATE's full data (which might be a neighbor, not the original propertyData state)
      checkExistingOpportunity(candidate.fullData);
    } else {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`${API_URL}/property-data`, { params: { rc: candidate.rc } });
        checkExistingOpportunity(res.data);
      } catch (err) {
        console.error(err);
        const details = err.response?.data?.details || '';
        setError(details || 'No se pudo obtener el detalle de esta propiedad.');
      } finally {
        setLoading(false);
      }
    }
  };

  const [persistentCalculatorInputs, setPersistentCalculatorInputs] = useState(null);

  const reset = () => {
    setStep('SEARCH');
    setSelectedCandidate(null);
    setPropertyData(null);
    setCalculatorData(null);
    setPersistentCalculatorInputs(null);
    setExistingOpportunityData(null);
    setPendingPropertyData(null);
    setShowExistingModal(false);
    setShowOverwriteConfirm(false);
  };

  const handleOpenCalculator = (data) => {
    // Si ya tenemos inputs guardados para esta misma RC, los usamos. 
    // De lo contrario, usamos la data inicial de PropertySheet.
    let baseData = data;
    if (persistentCalculatorInputs && persistentCalculatorInputs.rc === data.rc) {
      // Priorizar inputs persistentes para el año, pero permitir que la ficha técnica actualice la selección de construcciones
      baseData = { 
        ...persistentCalculatorInputs, 
        ...data, 
        anio: persistentCalculatorInputs.anio || data.anio || persistentCalculatorInputs.yearBuilt || data.yearBuilt,
        isPersistent: true 
      };
    }

    // SIEMPRE asegurar que si conocemos una referencia de cliente previa para esta RC, la inyectamos
    if (existingOpportunityData && existingOpportunityData.ref_catastral === data.rc) {
      baseData = {
        ...baseData,
        id_oportunidad: existingOpportunityData.id_oportunidad,
        referenciaCliente: existingOpportunityData.referencia_cliente || baseData.referenciaCliente || '',
        prescriptor_id: existingOpportunityData.prescriptor_id || '', // INYECTAR EL PARTNER EXISTENTE
        instalador_asociado_id: existingOpportunityData.instalador_asociado_id || '', // INYECTAR EL INSTALADOR EXISTENTE
        cliente_id: existingOpportunityData.cliente_id,
        drive_folder_id: existingOpportunityData.datos_calculo?.drive_folder_id,
        drive_folder_link: existingOpportunityData.datos_calculo?.drive_folder_link,
        cod_cliente_interno: existingOpportunityData.datos_calculo?.cod_cliente_interno || ''
      };
    }

    setCalculatorData(baseData);
    setStep('CALCULATOR');
  };

  const handleBackFromCalculator = (currentInputs) => {
    // Al volver, guardamos el estado actual de los inputs
    if (currentInputs) {
      setPersistentCalculatorInputs(currentInputs);
      // Sincronizar el año de vuelta a la ficha técnica para mantener coherencia visual
      if ((currentInputs.anio || currentInputs.yearBuilt) && propertyData) {
        const syncAnio = currentInputs.anio || currentInputs.yearBuilt;
        setPropertyData(prev => prev ? { ...prev, yearBuilt: syncAnio } : null);
      }
    }

    if (!propertyData) {
      setStep('SEARCH');
    } else {
      setStep('RESULT');
    }
  };

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedExpedienteId, setSelectedExpedienteId] = useState(initialExpediente);
  const [returnToExpediente, setReturnToExpediente] = useState(null);
  const [navNonce, setNavNonce] = useState(0);

  const loadOpportunity = async (op) => {
    setStep('RESULT');
    setLoading(true);
    setError(null);
    setActiveTab('oportunidades');

    try {
      let catastroData = null;
      
      if (!op.ref_catastral || op.ref_catastral === 'MANUAL') {
        catastroData = {
          rc: op.ref_catastral || 'MANUAL',
          address: op.referencia_cliente || 'Ubicación Manual',
          verified: false,
          source: 'Registro Manual',
          constructions: [],
          yearBuilt: op.datos_calculo?.inputs?.yearBuilt || 2000
        };
      } else {
        try {
          const res = await axios.get(`${API_URL}/property-data`, { params: { rc: op.ref_catastral } });
          catastroData = res.data;
        } catch (catError) {
          console.warn('Catastro service failed, using local fallback data:', catError);
          const code = catError.response?.data?.code || '';
          
          // Fallback data: use what we have in the opportunity
          catastroData = {
            rc: op.ref_catastral,
            address: op.referencia_cliente || 'Dirección guardada',
            verified: false,
            source: 'Datos locales (Catastro no responde)',
            constructions: [],
            yearBuilt: op.datos_calculo?.inputs?.yearBuilt || 0,
            use: op.datos_calculo?.inputs?.use || 'Residencial',
            totalSurface: op.datos_calculo?.inputs?.constructionSurface || 0,
            summaryByType: { 'VIVIENDA': op.datos_calculo?.inputs?.constructionSurface || 0 },
            floors: { total: op.datos_calculo?.inputs?.numFloors || op.datos_calculo?.inputs?.floors || 1 },
            participation: op.datos_calculo?.inputs?.participation?.toString() || '100,00',
            typeCatastro: op.datos_calculo?.inputs?.houseType || 'Cargado desde base de datos',
            climateInfo: {
                climateZone: op.datos_calculo?.inputs?.climateZone || '—',
                altitude: op.datos_calculo?.inputs?.altitude || '—'
            }
          };

          let warningMsg = 'El servicio de Catastro no responde. Se muestran los datos guardados.';
          if (code === 'RC_NOT_FOUND') {
            warningMsg = 'La referencia catastral ya no parece existir en Catastro. Usando datos guardados.';
          } else if (code === 'RC_INVALID_FORMAT') {
            warningMsg = 'La referencia guardada tiene un formato inválido. Usando datos locales.';
          }

          setError(warningMsg);
          // Quitar el aviso automáticamente después de 6 segundos
          setTimeout(() => setError(null), 6000);
        }
      }

      setExistingOpportunityData(op);
      const inputsData = typeof op.datos_calculo === 'string' ? JSON.parse(op.datos_calculo) : (op.datos_calculo || {});
      const inputs = {
        ...inputsData, // Propiedades en la raíz (compatibilidad y fallback)
        ...(inputsData.inputs || {}), // Propiedades anidadas (estructura estándar actual)
        cliente_id: op.cliente_id || null, 
        instalador_asociado_id: op.instalador_asociado_id || '',
        estado: inputsData.estado || 'BORRADOR',
        cod_cliente_interno: inputsData.cod_cliente_interno || '',
        id_uuid: op.id,
        id_oportunidad: op.id_oportunidad,
        isPersistent: true,
        demandMode: (inputsData.inputs?.demandMode || inputsData.demandMode) || 'estimated'
      };
      setPersistentCalculatorInputs(inputs);
      // Asegurar que la ficha técnica refleje el año guardado (posiblemente editado)
      // Buscamos tanto 'anio' como 'yearBuilt' por compatibilidad con diferentes versiones de guardado
      const savedAnio = inputs.anio || inputs.yearBuilt || op.anio;
      if (savedAnio) {
        catastroData.yearBuilt = Number(savedAnio);
        inputs.anio = Number(savedAnio);
        inputs.yearBuilt = Number(savedAnio);
      }
      setPropertyData(catastroData);
    } catch (err) {
      console.error('Fatal error loading opportunity:', err);
      setError('Error al procesar los datos de la oportunidad.');
      setStep('ADMIN');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (tab, payload, fromExpediente = null) => {
    if (fromExpediente) {
        setReturnToExpediente(fromExpediente);
    }

    if (tab === 'clientes') {
      setActiveTab('clientes');
      setStep('ADMIN');
      if (payload?.cliente_id) {
        setSelectedClientId(payload.cliente_id);
      }
    }

    if (tab === 'expedientes') {
      setActiveTab('expedientes');
      setStep('ADMIN');
      if (payload?.expediente_id) {
        setSelectedExpedienteId(payload.expediente_id);
      }
    } else if (tab === 'oportunidades') {
      if (payload?.ref_catastral) {
        loadOpportunity(payload);
      } else {
        setActiveTab('oportunidades');
        setStep('ADMIN');
      }
    } else {
      setActiveTab(tab);
      setStep('ADMIN');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-primary-500 font-bold tracking-widest text-sm uppercase">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden relative">
      <DynamicNetworkBackground />
      
      <div className={`relative z-10 ${(user && !firmaOportunidadId && !resetToken && !certAckData) ? 'p-0 h-screen overflow-hidden' : 'px-4 py-8'}`}>
        {certAckData ? (
          <CertAckView expedienteId={certAckData.id} token={certAckData.token} phase={certAckData.phase} />
        ) : firmaOportunidadId ? (
          <AceptarPropuestaView idOportunidad={firmaOportunidadId} />
        ) : resetToken ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <ResetPasswordView
              token={resetToken}
              onBackToLogin={() => {
                setResetToken(null);
                window.history.replaceState({}, '', '/');
              }}
            />
          </div>
        ) : !user ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <LoginView onSuccess={() => setStep('ADMIN')} />
          </div>
        ) : (
          <DashboardLayout 
            activeTab={activeTab} 
            onTabChange={(tab) => {
              const uRole = (user?.rol || '').toUpperCase();
              const uRoleId = user?.id_rol ? Number(user.id_rol) : null;
              
              // Bloqueos de seguridad por pestaña
              if (tab === 'aerotermia' && uRole !== 'ADMIN') return;
              if (tab === 'whatsapp' && uRole !== 'ADMIN') return;
              if (tab === 'prescriptores' && uRole !== 'ADMIN' && uRole !== 'DISTRIBUIDOR') return;
              if ((uRole === 'CERTIFICADOR' || uRoleId === 4) && tab !== 'expedientes') return;
              
              setActiveTab(tab);
              setStep('ADMIN'); // Volver a la lista al cambiar de pestaña
              setSelectedClientId(null); // Limpiar seleccion previa
              setSelectedExpedienteId(null); // Limpiar seleccion previa
              setReturnToExpediente(null); // Limpiar retorno si cambia manualmente
              setNavNonce(prev => prev + 1); // Incrementar nonce para forzar reset de vista si se pulsa de nuevo
            }}
          >
            {/* Global Loading Overlay */}
            {loading && step === 'RESULT' && (
              <div className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-bkg-surface border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
                  <svg className="w-10 h-10 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="text-center">
                    <h3 className="text-white font-bold text-lg">Cargando Oportunidad</h3>
                    <p className="text-white/40 text-sm">Consultando datos catastrales...</p>
                  </div>
                </div>
              </div>
            )}

            {/* Global Error Message */}
            {error && (
              <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[600] w-full max-w-md animate-in slide-in-from-top-4 duration-500 px-4">
                <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-md p-4 rounded-2xl flex items-start gap-4 shadow-2xl">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-red-400 font-bold text-sm mb-1 uppercase tracking-tight">Error detectado</h3>
                    <p className="text-white/70 text-xs leading-relaxed">{error}</p>
                    <button onClick={() => setError(null)} className="mt-3 text-[9px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400 transition-colors">Cerrar aviso</button>
                  </div>
                </div>
              </div>
            )}
            {step === 'ADMIN' && activeTab === 'whatsapp' && user?.rol === 'ADMIN' ? (
              <WhatsappSettingsView key={`wwa-${navNonce}`} />
            ) : step === 'ADMIN' && activeTab === 'expedientes' ? (
              <ExpedientesView 
                key={`exp-${navNonce}`}
                onNavigate={handleNavigate} 
                initialSelectedId={selectedExpedienteId}
                onClearInitialSelection={() => setSelectedExpedienteId(null)}
              />
            ) : step === 'ADMIN' && activeTab === 'aerotermia' && user?.rol === 'ADMIN' ? (
              <AerotermiaView key={`aero-${navNonce}`} />
            ) : step === 'ADMIN' && activeTab === 'clientes' ? (
              <ClientesView 
                key={`cli-${navNonce}`}
                onNavigate={handleNavigate}
                onLoadOpportunity={loadOpportunity} 
                initialSelectedId={selectedClientId}
                onClearInitialSelection={() => setSelectedClientId(null)}
                returnToExpediente={returnToExpediente}
                onReturnToExpediente={() => {
                    setActiveTab('expedientes');
                    setStep('ADMIN');
                    setReturnToExpediente(null);
                    setSelectedClientId(null);
                }}
              />
            ) : step === 'ADMIN' ? (
              <AdminPanelView
                key={`admin-${navNonce}`}
                activeTab={activeTab}
                onBackToCalculator={() => setShowSearchModal(true)}
                onLoadOpportunity={loadOpportunity}
                returnToExpediente={returnToExpediente}
                onReturnToExpediente={() => {
                    setActiveTab('expedientes');
                    setStep('ADMIN');
                    setReturnToExpediente(null);
                }}
              />
            ) : (
              <div className="animate-fade-in w-full max-w-[1600px] mx-auto px-6 sm:px-10 py-10 relative z-10">
                {/* Main Content Areas */}
                {(step === 'SEARCH' || step === 'CONFIRM') && (
                  <header className="max-w-6xl mx-auto text-center mb-10 animate-slide-down">
                    <div className="inline-flex items-center gap-4 mb-4">
                        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
                          <span className="text-white">Calculadora</span>{' '}
                          <span className="text-gradient">BROKERGY</span>
                        </h1>
                    </div>
                    <p className="text-white/60 text-lg max-w-3xl mx-auto">
                      La herramienta líder en valoración de ahorros y bonos energéticos CAE.
                    </p>
                  </header>
                )}

                {step === 'SEARCH' && (
                  <div className="animate-fade-in max-w-4xl mx-auto">
                    <CatastroSearchBox
                      onSearch={handleSearch}
                      onAddressSelect={handleAddressSelect}
                      onManualEntry={() => handleOpenCalculator(null)}
                    />
                  </div>
                )}



                {step === 'CONFIRM' && candidates.length > 0 && (
                  <div className="animate-slide-up max-w-4xl mx-auto">
                    <ConfirmationCard
                      candidate={selectedCandidate}
                      onConfirm={handleConfirmAddress}
                      onCancel={reset}
                    />
                  </div>
                )}

                {step === 'RESULT' && propertyData && (
                  <div className="animate-slide-up">
                    <button
                      onClick={() => { 
                        if (returnToExpediente) {
                          setActiveTab('expedientes');
                          setStep('ADMIN');
                          setReturnToExpediente(null);
                          setSelectedClientId(null);
                        } else {
                          reset(); 
                          if (user) setStep('ADMIN'); 
                        }
                      }}
                      className="mb-8 flex items-center gap-3 text-amber-500/60 hover:text-amber-500 transition-colors group px-4 py-2 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/10 rounded-xl"
                    >
                      <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span className="font-bold uppercase tracking-widest text-xs">
                        {returnToExpediente ? 'Volver al Expediente' : 'Volver al panel'}
                      </span>
                    </button>
                    <PropertySheet
                      data={propertyData}
                      onCalculateDemand={handleOpenCalculator}
                      initialSelection={persistentCalculatorInputs?.selectedConstructions}
                    />
                  </div>
                )}

                {step === 'CALCULATOR' && (
                  <CalculatorView
                    key={calculatorData?.rc || 'manual'}
                    initialData={calculatorData}
                    onBack={handleBackFromCalculator}
                    onNavigate={handleNavigate}
                  />
                )}
              </div>
            )}
            
            {/* Footer */}
            <footer className="max-w-6xl mx-auto mt-auto py-8 text-center border-t border-white/5 opacity-50">
              <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">
                Brokergy Analytics · © 2026
              </p>
            </footer>
          </DashboardLayout>
        )}
      </div>

       {showSearchModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bkg-deep/60 backdrop-blur-md p-4 animate-fade-in">
            <button 
                onClick={() => setShowSearchModal(false)} 
                className="absolute top-6 right-6 text-white/20 hover:text-white transition-all bg-white/[0.03] p-4 rounded-full border border-white/10 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500 z-50 group"
            >
                <svg className="w-6 h-6 transform group-hover:rotate-90 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <div className="w-full max-w-4xl relative z-10 animate-slide-up">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-700 flex items-center justify-center shadow-lg shadow-brand/20">
                    <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black tracking-tight">
                    <span className="text-white">Calculadora</span>{' '}
                    <span className="text-brand">BROKERGY</span>
                  </h2>
                </div>
              </div>
 
              <CatastroSearchBox
                onSearch={(q) => { setShowSearchModal(false); handleSearch(q); }}
                onAddressSelect={(c) => { setShowSearchModal(false); handleAddressSelect(c); }}
                onManualEntry={() => { setShowSearchModal(false); handleOpenCalculator(null); }}
              />
            </div>
        </div>
      )}

      {showExistingModal && existingOpportunityData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-8 border border-amber-500/30 shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-500 to-orange-500"></div>

            {!showOverwriteConfirm ? (
              <>
                <h3 className="text-2xl font-bold text-white text-center mb-2 flex flex-col items-center">
                  <span className="text-4xl mb-3">📂</span>
                  Oportunidad Existente
                </h3>
                <p className="text-slate-400 text-center mb-6 text-sm">
                  La ref. catastral <span className="text-white font-mono">{existingOpportunityData.ref_catastral}</span> ya se calculó anteriormente por <strong className="text-amber-400">{existingOpportunityData.prescriptor || 'BROKERGY'}</strong> con la referencia del cliente: <br /><strong className="text-amber-400 block mt-2 text-lg uppercase">{existingOpportunityData.referencia_cliente || 'SIN NOMBRE'}</strong>.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 font-black rounded-xl transition-all shadow-lg shadow-amber-500/20"
                    onClick={() => {
                      setShowExistingModal(false);
                      const inputs = existingOpportunityData.datos_calculo?.inputs || {};
                      setPersistentCalculatorInputs(inputs);
                      setPropertyData(pendingPropertyData);
                      setStep('RESULT');
                    }}
                  >
                    Cargar datos existentes
                  </button>
                  <button
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all"
                    onClick={() => setShowOverwriteConfirm(true)}
                  >
                    Sobrescribir (Cargar nueva)
                  </button>
                </div>
              </>
            ) : (
              <div className="animate-fade-in text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">¿Estás seguro?</h3>
                <p className="text-slate-400 mb-6 text-sm">
                  Si seleccionas sobrescribir, todos los datos guardados anteriormente por <strong className="text-white">{existingOpportunityData.prescriptor}</strong> para este cliente se perderán permanentemente.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/20"
                    onClick={() => {
                      setShowExistingModal(false);
                      setShowOverwriteConfirm(false);
                      setPersistentCalculatorInputs(null);
                      setPropertyData(pendingPropertyData);
                      setStep('RESULT');
                    }}
                  >
                    Sí, sobrescribir datos
                  </button>
                  <button
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all"
                    onClick={() => setShowOverwriteConfirm(false)}
                  >
                    Cancelar y volver
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
