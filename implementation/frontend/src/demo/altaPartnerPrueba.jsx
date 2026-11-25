/**
 * Banco de pruebas del ALTA DEL PARTNER (solo en desarrollo).
 *
 * No entra en el build: `vite build` solo toma `index.html` como entrada. Se abre en
 * http://localhost:PUERTO/alta-partner-prueba.html y pinta, SIN sesión y SIN tocar la
 * BD, lo que ve un instalador en «Nueva simulación»:
 *   · el paso de las fotos de la caldera, con la piel de la marca (`.lf .theme-light`);
 *   · el paso del presupuesto (`docs_obra`) con la misma piel;
 *   · el campo «Sup. Calef.» de la calculadora, como partner y como equipo interno;
 *   · la «Ficha del inmueble» (`?vista=ficha&rc=…`), con un GET de verdad al Catastro;
 *   · la OPORTUNIDAD vista por el partner (`?vista=oportunidad`, `&fm=no|bloquea`,
 *     `&acs=no`, `&estado=ENVIADA`, `&bono=3400`, `&rev=1` revisión pedida, `&cee=1` con
 *     el CEE cargado, `&corregir=1` con «Corregir datos» abierto —el formulario de
 *     verdad, en su tarjeta clara—, `&sucio=1` con cambios sin guardar), con «Pedir que
 *     vaya por FM» y «Solicitar revisión» SIMULADOS.
 * La lectura de la placa va SIMULADA (`?placa=ok|incompleta|no_valida|error`) y toda
 * otra llamada que no sea un GET se corta aquí: local escribe en PRODUCCIÓN.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '../index.css';
import { AuthContext } from '../context/AuthContext';
import { CSS_LANDING_CARTA } from '../features/landing/estiloCarta';
import { StepPlacaCaldera, PLACA_CALDERA_VACIA } from '../features/landing/steps/StepPlacaCaldera';
import { StepDocsObra } from '../features/landing/steps/StepDocsObra';
import { SuperficieCalefaccion } from '../features/calculator/components/SuperficieCalefaccion';
import { LandingPropertyReview } from '../features/landing/views/LandingPropertyReview';
import LandingFunnelView from '../features/landing/views/LandingFunnelView';
import { ResumenOportunidadPartner } from '../features/calculator/components/partner/ResumenOportunidadPartner';
import { CorregirDatosPartner } from '../features/calculator/components/partner/CorregirDatosPartner';
import { CalculatorForm } from '../features/calculator/components/CalculatorForm';

const params = new URLSearchParams(location.search);
const MODO_PLACA = params.get('placa') || 'ok';
const VISTA = params.get('vista') || 'placa';

const LECTURAS = {
    ok: {
        leido: { marca: 'FERROLI', modelo: 'DOMIPROJECT F24', numero_serie: '1234567890', serie_dudosa: false, potencia_texto: 'Pn 24 kW', potencias: [{ etiqueta: 'Pn', valor: '24' }], combustible: 'gas_natural', anio: 2005 },
        potencia_kw: 24, potencia_base: 'util', potencias_por_combustible: {}, avisos: [],
        veredicto: { estado: 'ok', titulo: 'Placa leída', faltan: [], consejo: null },
    },
    incompleta: {
        leido: { marca: 'ROCA', modelo: 'P-30', potencias: [], combustible: 'gasoleo', anio: null },
        potencia_kw: null, potencia_base: null, potencias_por_combustible: {}, avisos: [],
        veredicto: { estado: 'incompleta', titulo: 'Se ve la caldera, pero no su potencia', faltan: ['potencia', 'año'], consejo: 'Acércate a la etiqueta: necesitamos la línea de la potencia en kW («Pn», «Potencia útil»). Puedes seguir y mandarla luego, pero sin ella no se puede hacer el certificado.' } },
    no_valida: {
        leido: { marca: null, modelo: null, potencias: [] }, potencia_kw: null, potencias_por_combustible: {}, avisos: [],
        veredicto: { estado: 'no_valida', titulo: 'No reconocemos una placa de caldera en la foto', faltan: ['marca', 'modelo', 'potencia'], consejo: 'Haz la foto de cerca a la ETIQUETA de características (suele estar en un lateral, debajo o tras la tapa frontal) y que se lean los números. Sin reflejos ni flash.' } },
};

// Nada sale de aquí salvo los GET: la lectura de la placa, simulada; lo demás, cortado.
axios.interceptors.request.use((config) => {
    const url = String(config.url || '');
    const metodo = String(config.method || 'get').toLowerCase();
    if (url.includes('/leer-placa-caldera')) {
        config.adapter = () => new Promise((ok, ko) => setTimeout(() => {
            if (MODO_PLACA === 'error') {
                ko(Object.assign(new Error('simulado'), { response: { status: 502, data: { error: 'No se ha podido leer la placa. Vuelve a intentarlo.' } }, config }));
            } else {
                ok({ data: LECTURAS[MODO_PLACA] || LECTURAS.ok, status: 200, statusText: 'OK', headers: {}, config });
            }
        }, 900));
    } else if (url.includes('/fachada-calle')) {
        // La foto de la CALLE (Street View): SIMULADA, que la de verdad se paga y pide
        // sesión. `?calle=ok|sin|tope|error`; con «ok», la foto del Catastro de la
        // parcela de prueba hace de foto de la calle.
        const modo = params.get('calle') || 'ok';
        config.adapter = () => new Promise((ok, ko) => setTimeout(async () => {
            if (modo === 'sin') return ok({ data: new Blob([]), status: 204, statusText: 'No Content', headers: {}, config });
            if (modo === 'tope' || modo === 'error') {
                const status = modo === 'tope' ? 429 : 502;
                return ko(Object.assign(new Error('simulado'), { response: { status, data: {} }, config }));
            }
            const blob = await fetch('/api/catastro/image/7847709VJ9374N0001DD').then(r => r.blob());
            ok({ data: blob, status: 200, statusText: 'OK', headers: { 'x-fecha-panorama': '2023-05' }, config });
        }, 800));
    } else if (url.includes('/peticion-fm')) {
        // «Pedir que vaya por FM»: SIMULADO, devuelve lo que guardaría el servidor.
        const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data || {});
        const r = body.respuestas || {};
        const v = Object.values(r).some(x => x === false) ? 'no_cumple' : Object.values(r).every(x => x === true) ? 'cumple' : 'faltan';
        console.info('[banco] SIMULADO', url, JSON.stringify(body));
        config.adapter = () => Promise.resolve({ data: { peticion_fm: { respuestas: r, veredicto: v, por: 'P1', at: new Date().toISOString() } }, status: 200, statusText: 'OK', headers: {}, config });
    } else if (url.includes('/peticion-revision')) {
        // «Solicitar revisión»: SIMULADO (el de verdad encarga el CEE a la IA).
        console.info('[banco] SIMULADO', url);
        config.adapter = () => new Promise((ok) => setTimeout(() => ok({ data: { peticion_revision: { por: 'P1', at: new Date().toISOString(), bono: 2640 } }, status: 200, statusText: 'OK', headers: {}, config }), 700));
    } else if (metodo !== 'get' && !url.includes('/api/catastro/reverse-geocode')) {
        // (reverse-geocode es un POST que solo LEE: el mapa de «¿No es este?» lo necesita)
        console.warn('[banco] BLOQUEADO', metodo.toUpperCase(), url);
        config.adapter = () => Promise.reject(Object.assign(new Error('Bloqueado en el banco de pruebas'), { response: { status: 418, data: { error: 'Bloqueado en el banco de pruebas' } }, config }));
    }
    return config;
});

const PARTNER = { nombre: 'Pepe Instalador', razon_social: 'INSTALACIONES PRUEBA', rol: 'INSTALADOR', id_rol: 3 };
const ADMIN = { nombre: 'Fran', rol: 'ADMIN', id_rol: 1 };

function Piel({ children }) {
    return (
        <div className="min-h-screen relative overflow-x-hidden lf theme-light">
            <style>{CSS_LANDING_CARTA}</style>
            <div className="lf-filete" />
            <div className="lf-halo" />
            <div className="relative z-10 px-4 py-5 md:py-8">
                <main className="max-w-3xl mx-auto">{children}</main>
            </div>
        </div>
    );
}

function PasoPlaca() {
    const [estado, setEstado] = useState(PLACA_CALDERA_VACIA);
    const [salida, setSalida] = useState(null);
    return (
        <Piel>
            <StepPlacaCaldera estado={estado} setEstado={setEstado}
                onContinuar={(r) => setSalida({ continuar: r })}
                onSinFoto={() => setSalida({ sinFoto: true })} />
            {salida && <pre id="salida" className="mt-6 text-[11px] whitespace-pre-wrap">{JSON.stringify(salida, null, 2)}</pre>}
        </Piel>
    );
}

function PasoDocs() {
    const [docs, setDocs] = useState([]);
    return <Piel><StepDocsObra docs={docs} setDocs={setDocs} onNext={() => {}} /></Piel>;
}

function CampoSuperficie() {
    const [inputs, setInputs] = useState({ superficie: 120, superficieCalefactable: 120, supCalefMenor: null });
    const [comoPartner, setComoPartner] = useState(params.get('rol') !== 'admin');
    const onInputChange = (fn) => setInputs((prev) => (typeof fn === 'function' ? fn(prev) : { ...prev, ...fn }));
    const onNumero = (campo, v) => {
        const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
        setInputs((prev) => ({ ...prev, [campo]: v === '' ? '' : (Number.isFinite(n) ? n : prev[campo]) }));
    };
    return (
        <AuthContext.Provider value={{ user: comoPartner ? PARTNER : ADMIN }}>
            <div className="min-h-screen bg-bkg-base text-white p-6">
                <div className="max-w-md space-y-4">
                    <label className="flex items-center gap-2 text-sm text-white/70">
                        <input type="checkbox" checked={comoPartner} onChange={(e) => setComoPartner(e.target.checked)} /> Ver como partner
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-white/60 mb-2">Sup. útil (m²)</label>
                            <input className="w-full px-4 py-3 bg-bkg-deep/50 border border-white/[0.1] rounded-xl text-white min-h-[48px]"
                                value={inputs.superficie} onChange={(e) => onNumero('superficie', e.target.value)} />
                        </div>
                        <SuperficieCalefaccion inputs={inputs} onInputChange={onInputChange} onNumero={onNumero}
                            formatDisplay={(v) => (v === '' || v == null ? '' : String(v).replace('.', ','))}
                            esPartner={comoPartner} usuario={comoPartner ? PARTNER : ADMIN} />
                    </div>
                    <pre id="inputs" className="text-[11px] text-white/50 whitespace-pre-wrap">{JSON.stringify(inputs, null, 2)}</pre>
                </div>
            </div>
        </AuthContext.Provider>
    );
}

// La ficha del inmueble del alta interna, con una RC de verdad (un GET al Catastro).
function FichaInmueble() {
    const [catastro, setCatastro] = useState(null);
    const [salida, setSalida] = useState(null);
    React.useEffect(() => {
        axios.get('/api/catastro/search', { params: { q: params.get('rc') || '9352710VJ9395S0001WM' } })
            .then((r) => setCatastro(r.data?.data || null));
    }, []);
    if (!catastro) return <Piel><p>Cargando la ficha…</p></Piel>;
    return (
        <Piel>
            <LandingPropertyReview catastro={catastro} isInternal onConfirm={setSalida} onBack={() => {}} />
            {salida && <pre id="salida" className="mt-6 text-[11px] whitespace-pre-wrap">{JSON.stringify(salida, null, 2)}</pre>}
        </Piel>
    );
}

// La «Nueva simulación» ENTERA del partner (buscar → ficha → mapa → fotos de la
// caldera…), con los GET de verdad y todo POST cortado arriba.
function AltaCompleta() {
    return <LandingFunnelView mode="internal" onCreated={() => {}} onCancel={() => {}} />;
}

// La OPORTUNIDAD vista por el partner: el resumen de arriba de la calculadora
// (`?vista=oportunidad`, con `&fm=no` sin vía FM, `&fm=bloquea`, `&estado=ENVIADA`).
function OportunidadPartner() {
    const fm = params.get('fm') || 'si';
    const inputs = {
        id_oportunidad: '26RES060_OP000', estado: params.get('estado') || 'PTE ENVIAR',
        direccion: 'CL EJEMPLO 12 13700 TOMELLOSO (CIUDAD REAL)', municipio: 'TOMELLOSO',
        referenciaCliente: 'CLIENTE DE PRUEBA', superficie: 124, superficieCalefactable: 124, zona: 'D3',
        placa_caldera: { marca: 'FERROLI', modelo: 'DOMIPROJECT F24', combustible: 'gas_natural', anio: 2005, potencia_kw: 24 },
        presupuesto: 12400, presupuestoEstimado: false, changeAcs: true,
        ...(params.get('rev') === '1' ? { peticion_revision: { por: 'P1', at: new Date().toISOString(), bono: 2640 } } : {}),
        // `&rev=hecha`: la revisión ya resuelta (con el CEE cargado y la cifra nueva en `&bono=`)
        ...(params.get('rev') === 'hecha' ? { peticion_revision: { por: 'P1', at: new Date(Date.now() - 864e5).toISOString(), bono: 2640, resuelta_at: new Date().toISOString(), bono_antes: 2640, bono_despues: Number(params.get('bono')) || 3120 } } : {}),
        ...(params.get('cee') === '1' || params.get('rev') === 'hecha' ? { xmlDemandData: { demandaCalefaccion: 180 } } : {}),
    };
    const bonoPrueba = Number(params.get('bono')) || 2640;
    const reforma = params.get('reforma') === '1';
    if (reforma) Object.assign(inputs, { isReforma: true, comparativaReforma: params.get('solo') === '1' ? false : true });
    const [abierto, setAbierto] = React.useState(params.get('corregir') === '1');
    const [datos, setDatos] = React.useState(() => ({ ...inputs, demandMode: 'estimated', numOwners: 1, includeIrpf: true }));
    const [sucio, setSucio] = React.useState(params.get('sucio') === '1');
    // el formulario normaliza datos al montarse: eso no son «cambios sin guardar»
    const montado = React.useRef(performance.now());
    const result = {
        financials: { presupuesto: 12400, presupuestoTotal: 12400, caeBonus: bonoPrueba, irpfDeduction: 7440, caeMaintenanceCost: 250, costeFinal: Math.max(0, 12400 - bonoPrueba - 7440 + 250) },
        ...(reforma ? { financialsRes080: { presupuesto: 30400, presupuestoTotal: 30400, caeBonus: 6120, irpfDeduction: 9000, caeMaintenanceCost: 250, costeFinal: 15530 } } : {}),
        selectedModel: { marca: 'MARCA', modelo: 'Aerotermia 12 kW' },
        ...(fm === 'no' ? {} : {
            res060fc: {
                ficha: 'RES060_FM', dcalFuente: 'simulacion', acsSupuesto: params.get('acs') === 'no',
                elegible: fm !== 'bloquea',
                avisos: fm === 'bloquea' ? [{ tono: 'bloquea', texto: 'la caldera de hoy es de biomasa: va por la vía normal.' }] : [],
            },
            financialsRes060FC: { caeBonus: 5280 },
        }),
    };
    return (
        <div className="min-h-screen bg-bkg-base text-white p-4 md:p-8 max-md:pb-28">
            <div className="max-w-6xl mx-auto">
                <ResumenOportunidadPartner inputs={inputs} result={result}
                    sinGuardar={sucio} formularioAbierto={abierto}
                    onAccion={(a) => { console.info('[banco] acción', a); if (a === 'guardar') setSucio(false); }} onCorregir={() => setAbierto(true)} />
                {/* «Corregir datos»: el formulario DE VERDAD, en su tarjeta clara */}
                {abierto && (
                    <CorregirDatosPartner sinGuardar={sucio}
                        onListo={() => { setAbierto(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        onGuardar={() => { console.info('[banco] guardar'); setSucio(false); }}>
                        <CalculatorForm inputs={datos}
                            onInputChange={(fn) => setDatos((prev) => {
                                const sig = typeof fn === 'function' ? fn(prev) : { ...prev, ...fn };
                                // abrir o cerrar una sección (show*) no es un cambio, como en la app (getSnapshot)
                                const cambia = Object.keys(sig).some((k) => !k.startsWith('show') && sig[k] !== prev[k]);
                                if (cambia && performance.now() - montado.current > 1500) setTimeout(() => setSucio(true), 0);
                                return sig;
                            })}
                            onCalculate={() => {}} result={result} showBrokergy={false}
                            demandMode={datos.demandMode} onDemandModeChange={(m) => setDatos((p) => ({ ...p, demandMode: m }))}
                            xmlDemandData={datos.xmlDemandData} onOpenEmisionesTable={() => {}} dbModels={[]} />
                    </CorregirDatosPartner>
                )}
            </div>
        </div>
    );
}

function Banco() {
    if (VISTA === 'oportunidad') return <AuthContext.Provider value={{ user: PARTNER }}><OportunidadPartner /></AuthContext.Provider>;
    if (VISTA === 'alta') return <AuthContext.Provider value={{ user: PARTNER }}><AltaCompleta /></AuthContext.Provider>;
    if (VISTA === 'ficha') return <AuthContext.Provider value={{ user: PARTNER }}><FichaInmueble /></AuthContext.Provider>;
    if (VISTA === 'docs') return <AuthContext.Provider value={{ user: PARTNER }}><PasoDocs /></AuthContext.Provider>;
    if (VISTA === 'superficie') return <CampoSuperficie />;
    return <AuthContext.Provider value={{ user: PARTNER }}><PasoPlaca /></AuthContext.Provider>;
}

// Con StrictMode, como la app (main.jsx): sin él no salía el «Leyendo la placa…» eterno.
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Banco /></React.StrictMode>);
