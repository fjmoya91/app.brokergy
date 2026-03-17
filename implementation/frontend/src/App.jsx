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


const API_URL = '/api/catastro'; // Vercel force redeploy v2

function App() {
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState('ADMIN');
  const [activeTab, setActiveTab] = useState('oportunidades');
  const [showSearchModal, setShowSearchModal] = useState(false);

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
      let errorMsg = 'Verifica el servidor o la referencia.';
      if (details.includes('timeout')) {
        errorMsg = 'El servidor de Catastro está tardando demasiado.';
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
      baseData = { ...persistentCalculatorInputs, isPersistent: true };
    }

    // SIEMPRE asegurar que si conocemos una referencia de cliente previa para esta RC, la inyectamos
    if (existingOpportunityData && existingOpportunityData.ref_catastral === data.rc) {
      baseData = {
        ...baseData,
        referenciaCliente: existingOpportunityData.referencia_cliente || baseData.referenciaCliente || ''
      };
    }

    setCalculatorData(baseData);
    setStep('CALCULATOR');
  };

  const handleBackFromCalculator = (currentInputs) => {
    // Al volver, guardamos el estado actual de los inputs
    if (currentInputs) {
      setPersistentCalculatorInputs(currentInputs);
    }

    if (!propertyData) {
      setStep('SEARCH');
    } else {
      setStep('RESULT');
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
      
      <div className={`relative z-10 ${user ? 'p-0 h-screen overflow-hidden' : 'px-4 py-8'}`}>
        {!user ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <LoginView onSuccess={() => setStep('ADMIN')} />
          </div>
        ) : (
          <DashboardLayout 
            activeTab={activeTab} 
            onTabChange={(tab) => {
              setActiveTab(tab);
              setStep('ADMIN'); // Volver a la lista al cambiar de pestaña
            }}
          >
            {step === 'ADMIN' ? (
              <AdminPanelView
                activeTab={activeTab}
                onBackToCalculator={() => setShowSearchModal(true)} 
                onLoadOpportunity={async (op) => {
                  setLoading(true);
                  setError(null);
                  try {
                    const res = await axios.get(`${API_URL}/property-data`, { params: { rc: op.ref_catastral } });
                    const catastroData = res.data;
                    setExistingOpportunityData(op);
                    const inputs = op.datos_calculo?.inputs || {};
                    setPersistentCalculatorInputs(inputs);
                    setPropertyData(catastroData);
                    setStep('RESULT');
                  } catch (err) {
                    console.error('Error loading opportunity data:', err);
                    setError('No se pudieron cargar los datos catastrales de esta oportunidad.');
                  } finally {
                    setLoading(false);
                  }
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
                        <span className="text-xs text-white/20 ml-2">v2.0</span>
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

                {loading && (
                  <div className="mt-8 animate-fade-in max-w-4xl mx-auto">
                    <div className="glass-card p-8 text-center">
                      <div className="inline-flex items-center gap-3">
                        <svg className="w-6 h-6 animate-spin text-primary-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-white/80 text-lg">Consultando servicios oficiales...</span>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-8 animate-fade-in max-w-4xl mx-auto">
                    <div className="glass-card p-6 border-l-4 border-red-500">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-red-400 font-semibold mb-1">Error en la consulta</h3>
                          <p className="text-white/70 whitespace-pre-line text-sm leading-relaxed">{error}</p>
                        </div>
                      </div>
                    </div>
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
                      onClick={existingOpportunityData ? () => { reset(); setStep('ADMIN'); } : reset}
                      className="mb-8 flex items-center gap-2 text-white/60 hover:text-white transition-colors group px-2"
                    >
                      <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      <span className="font-bold uppercase tracking-widest text-xs">Volver al panel</span>
                    </button>
                    <PropertySheet
                      data={propertyData}
                      onCalculateDemand={handleOpenCalculator}
                    />
                  </div>
                )}

                {step === 'CALCULATOR' && (
                  <CalculatorView
                    key={calculatorData?.rc || 'manual'}
                    initialData={calculatorData}
                    onBack={handleBackFromCalculator}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in">
            <button 
                onClick={() => setShowSearchModal(false)} 
                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-white/5 p-3 rounded-full hover:bg-red-500/20 hover:text-red-500 z-50"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <div className="w-full max-w-3xl relative z-10 animate-slide-up">
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
