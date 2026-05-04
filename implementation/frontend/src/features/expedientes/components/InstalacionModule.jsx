import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BOILER_EFFICIENCIES, getScopFromModel, getScopAcsFromModel, calculateHybridization } from '../../calculator/logic/calculation';

const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
];

function getEmitterTemp(tipo_emisor) {
    return EMITTER_OPTIONS.find(o => o.value === tipo_emisor)?.temp ?? 35;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', readOnly = false, placeholder = '' }) {
    return (
        <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>
            <input
                type={type}
                value={value ?? ''}
                onChange={onChange ? e => onChange(e.target.value) : undefined}
                readOnly={readOnly}
                placeholder={placeholder}
                className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                    readOnly
                        ? 'border-white/5 text-white/60 cursor-not-allowed'
                        : 'border-white/10 focus:border-brand/50'
                }`}
            />
        </div>
    );
}

function SelectField({ label, value, onChange, options, readOnly = false, loading = false }) {
    return (
        <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>
            <div className="relative">
                <select
                    value={value ?? ''}
                    onChange={onChange ? e => onChange(e.target.value) : undefined}
                    disabled={readOnly || loading}
                    className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-sm focus:outline-none appearance-none ${
                        readOnly || loading
                            ? 'border-white/5 text-white/60 cursor-not-allowed'
                            : 'border-white/10 text-white focus:border-brand/50'
                    }`}
                >
                    <option value="">{loading ? 'Cargando...' : '— Selecciona —'}</option>
                    {options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-white/20">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        </div>
    );
}

const CCAA_LIST = [
    'Andalucía','Aragón','Asturias','Baleares','Canarias','Cantabria','Castilla-La Mancha','Castilla y León','Cataluña',
    'Ceuta','Comunidad Valenciana','Extremadura','Galicia','La Rioja',
    'Comunidad de Madrid','Melilla','Región de Murcia','Navarra','País Vasco',
].sort((a, b) => a.localeCompare(b, 'es'));

function Toggle({ label, value, onChange, readOnly = false }) {
    return (
        <div className="flex items-center gap-3 my-3">
            <span className="text-xs text-white/50 font-bold uppercase tracking-wider">{label}</span>
            <div className="flex gap-2">
                {[{ v: true, l: 'Sí' }, { v: false, l: 'No' }].map(({ v, l }) => (
                    <button
                        key={l}
                        disabled={readOnly}
                        onClick={() => !readOnly && onChange(v)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            value === v
                                ? 'bg-brand text-bkg-deep border-brand'
                                : 'border-white/10 text-white/40 hover:text-white disabled:cursor-default'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── Sección Caldera Antigua ──────────────────────────────────────────────────
function CalderaSection({ title, data, onChange, readOnly }) {
    const rendimientoOptions = BOILER_EFFICIENCIES.map(b => ({
        value: b.id,
        label: `${b.label} (η=${b.value})`
    }));

    return (
        <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-wider">{title}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Marca caldera antigua
                    </label>
                    <input
                        type="text"
                        value={data?.marca ?? ''}
                        onChange={v => onChange({ ...data, marca: v.target.value })}
                        disabled={readOnly}
                        className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand/50"
                    />
                </div>
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                        Modelo caldera antigua
                    </label>
                    <input
                        type="text"
                        value={data?.modelo ?? ''}
                        onChange={v => onChange({ ...data, modelo: v.target.value })}
                        disabled={readOnly}
                        className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand/50"
                    />
                </div>
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Número de serie
                    </label>
                    <input
                        type="text"
                        value={data?.numero_serie ?? ''}
                        onChange={v => onChange({ ...data, numero_serie: v.target.value })}
                        disabled={readOnly}
                        className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand/50"
                    />
                </div>
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Rendimiento
                    </label>
                    <select
                        value={data?.rendimiento_id ?? ''}
                        onChange={v => onChange({ ...data, rendimiento_id: v.target.value })}
                        disabled={readOnly}
                        className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand/50 appearance-none"
                    >
                        <option value="">— Selecciona —</option>
                        {rendimientoOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
}

// ─── Sección Aerotermia Nueva ─────────────────────────────────────────────────
function AerotermiaSection({ title, data, onChange, marcas, modelosPorMarca, tipoEmisor, isAcs = false, readOnly = false }) {
    const brandOptions = marcas.map(m => ({ value: m.nombre, label: m.nombre }));
    const availableModels = data?.marca ? (modelosPorMarca[data.marca.toUpperCase()] || []) : [];
    const modelOptions = availableModels.map(m => ({
        value: String(m.id),
        label: `${m.modelo_comercial || m.modelo_conjunto || ''} ${m.potencia_calefaccion ? `(${m.potencia_calefaccion}kW)` : ''}`
    }));

    const handleMarcaChange = (brand) => {
        onChange({ ...data, marca: brand, aerotermia_db_id: null, modelo: '', scop: null, metodo_scop: 'ficha' });
    };

    const handleModeloChange = (idStr) => {
        const hexId = String(idStr);
        const found = availableModels.find(m => String(m.id) === hexId);
        
        if (found) {
            const method = data?.metodo_scop || 'ficha';
            let scop;
            if (isAcs) {
                scop = getScopAcsFromModel(found, found.zona_climatica || 'D3', method);
            } else {
                const temp = getEmitterTemp(tipoEmisor);
                scop = getScopFromModel(found, found.zona_climatica || 'D3', temp, method);
            }
            
            onChange({
                ...data,
                aerotermia_db_id: found.id,
                modelo: found.modelo_comercial || found.modelo_conjunto || found.modelo_exterior || '',
                scop,
                potencia: found.potencia_calefaccion || found.potencia_nominal_35 || 0,
                metodo_scop: method,
                url_eprel: found.eprel,
                url_keymark: found.url_keymark,
                url_ficha: found.ficha_tecnica
            });
        } else {
            onChange({ ...data, aerotermia_db_id: null, modelo: '', scop: null });
        }
    };

    const handleMethodChange = (method) => {
        const found = availableModels.find(m => String(m.id) === String(data?.aerotermia_db_id));
        if (found) {
            let scop;
            if (isAcs) {
                scop = getScopAcsFromModel(found, found.zona_climatica || 'D3', method);
            } else {
                const temp = getEmitterTemp(tipoEmisor);
                scop = getScopFromModel(found, found.zona_climatica || 'D3', temp, method);
            }
            onChange({ ...data, metodo_scop: method, scop });
        } else {
            onChange({ ...data, metodo_scop: method });
        }
    };

    return (
        <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-black text-brand/80 uppercase tracking-wider">{title}</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                    label="Marca"
                    options={brandOptions}
                    value={data?.marca ?? ''}
                    onChange={handleMarcaChange}
                    readOnly={readOnly}
                />
                <SelectField
                    label="Modelo"
                    options={modelOptions}
                    value={String(data?.aerotermia_db_id ?? '')}
                    onChange={handleModeloChange}
                    readOnly={readOnly || !data?.marca}
                />
            </div>

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs text-brand/40 uppercase tracking-wider font-bold">
                    <svg className="w-3 h-3 text-brand/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Número de serie
                </label>
                <input
                    type="text"
                    value={data?.numero_serie ?? ''}
                    onChange={v => onChange({ ...data, numero_serie: v.target.value })}
                    readOnly={readOnly}
                    className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                        readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                    }`}
                />
            </div>

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs text-brand/40 uppercase tracking-wider font-bold">
                    <svg className="w-3.5 h-3.5 text-brand/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    SCOP (rendimiento)
                </label>
                <div className="space-y-2">
                    <div className="flex bg-bkg-elevated p-1 rounded-lg border border-white/5 w-fit">
                        {[
                            { id: 'ficha', label: 'Ficha Técnica' },
                            { id: 'eprel', label: 'EPREL (ηs)' }
                        ].map(m => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => !readOnly && handleMethodChange(m.id)}
                                disabled={readOnly}
                                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    (data?.metodo_scop || 'ficha') === m.id
                                        ? 'bg-brand text-bkg-deep'
                                        : 'text-white/40 hover:text-white disabled:opacity-50'
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="number"
                        step="0.01"
                        value={data?.scop ?? ''}
                        onChange={e => onChange({ ...data, scop: e.target.value })}
                        readOnly={readOnly}
                        className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                            readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                        }`}
                        placeholder="Se obtiene del modelo"
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function InstalacionModule({ expediente, onSave, onLiveUpdate, saving, readOnly = false }) {
    const [marcas, setMarcas] = useState([]);
    const [modelosPorMarca, setModelosPorMarca] = useState({});
    const [prescriptores, setPrescriptores] = useState([]);
    const [fetchingUtm, setFetchingUtm] = useState(false);
    const [provincias, setProvincias] = useState([]);
    const [municipios, setMunicipios] = useState([]);
    const [loadingGeo, setLoadingGeo] = useState({ prov: false, muni: false });

    const [local, setLocal] = useState(() => ({
        misma_direccion: true,
        ref_catastral: '',
        coord_x: '',
        coord_y: '',

        // Campos de dirección custom
        direccion: '',
        codigo_postal: '',
        municipio: '',
        provincia: '',
        provincia_cod: '',
        ccaa: '',

        caldera_antigua_cal: { marca: '', modelo: '', numero_serie: '', rendimiento_id: 'default' },
        misma_caldera_acs: true,
        caldera_antigua_acs: { marca: '', modelo: '', numero_serie: '', rendimiento_id: 'default' },
        aerotermia_cal: { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' },
        potencia_bomba: '',
        cambio_acs: true,
        misma_aerotermia_acs: true,
        aerotermia_acs: { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' },
        instalador_id: null,
        ...(expediente?.instalacion || {}),
        // Normalizar a minúsculas por retrocompatibilidad con datos guardados en mayúsculas por normalizeData
        tipo_emisor: ((expediente?.instalacion?.tipo_emisor) || 'suelo_radiante').toLowerCase(),
        // Si el número de expediente es RES093, forzamos hibridación a true si no viene ya definida
        hibridacion: (expediente?.numero_expediente?.includes('RES093') ? true : (expediente?.instalacion?.hibridacion ?? false))
    }));

    // Notificar al padre de cambios en tiempo real para el resumen sticky y autosave
    useEffect(() => {
        if (onLiveUpdate) onLiveUpdate(local);
    }, [local, onLiveUpdate]);

    // Sincronizar local cuando cambie el expediente (para resetear al entrar en otro diferente)
    useEffect(() => {
        if (expediente?.id) {
            const inst = expediente?.instalacion || {};
            setLocal({
                misma_direccion: true,
                cambio_acs: true,
                misma_aerotermia_acs: true,
                hibridacion: false,
                potencia_bomba: 0,
                ...inst,
                // Normalizar a minúsculas por retrocompatibilidad con datos guardados en mayúsculas
                tipo_emisor: (inst.tipo_emisor || 'suelo_radiante').toLowerCase(),
            });
        }
    }, [expediente?.id]);

    const opDatos = expediente?.oportunidades?.datos_calculo || {};
    const opRC = expediente?.oportunidades?.ref_catastral || '';

    // Cargar marcas, modelos y todos los prescriptores
    useEffect(() => {
        axios.get('/api/aerotermia/marcas').then(r => setMarcas(r.data || [])).catch(() => {});
        axios.get('/api/aerotermia').then(r => {
            const byMarca = {};
            (r.data || []).forEach(m => {
                const marca = (m.marca || '').toUpperCase();
                if (!byMarca[marca]) byMarca[marca] = [];
                byMarca[marca].push(m);
            });
            setModelosPorMarca(byMarca);
        }).catch(() => {});
        axios.get('/api/prescriptores').then(r => {
            setPrescriptores(r.data || []);
        }).catch(() => {});
    }, []);

    // Lógica Geográfica (CCAA -> PROV -> MUNI)
    useEffect(() => {
        if (!local.ccaa || local.misma_direccion) return;
        setLoadingGeo(p => ({ ...p, prov: true }));
        axios.get('/api/geo/provincias', { params: { ccaa: local.ccaa } })
            .then(r => setProvincias(r.data || []))
            .catch(() => setProvincias([]))
            .finally(() => setLoadingGeo(p => ({ ...p, prov: false })));
    }, [local.ccaa, local.misma_direccion]);

    useEffect(() => {
        if (!local.provincia_cod || local.misma_direccion) return;
        setLoadingGeo(p => ({ ...p, muni: true }));
        axios.get('/api/geo/municipios', { params: { codprov: local.provincia_cod } })
            .then(r => setMunicipios(r.data || []))
            .catch(() => setMunicipios([]))
            .finally(() => setLoadingGeo(p => ({ ...p, muni: false })));
    }, [local.provincia_cod, local.misma_direccion]);

    const handleMismaDireccionChange = async (val) => {
        if (val) {
            const rc = opRC;
            setLocal(p => ({ ...p, misma_direccion: true, ref_catastral: rc, coord_x: '', coord_y: '' }));
            if (rc) {
                setFetchingUtm(true);
                try {
                    const { data } = await axios.get(`/api/catastro/property-data?rc=${encodeURIComponent(rc)}`);
                    const x = String(data?.utm?.x || data?.coordX || '');
                    const y = String(data?.utm?.y || data?.coordY || '');
                    setLocal(p => ({ ...p, coord_x: x, coord_y: y }));
                } catch {
                } finally {
                    setFetchingUtm(false);
                }
            }
        } else {
            setLocal(p => ({ ...p, misma_direccion: false }));
        }
    };

    const handleTipoEmisorChange = (tipo_emisor) => {
        const temp = getEmitterTemp(tipo_emisor);
        setLocal(p => {
            const recalcScop = (aero) => {
                if (!aero?.aerotermia_db_id) return aero;
                const marca = aero.marca?.toUpperCase();
                const modelos = modelosPorMarca[marca] || [];
                const found = modelos.find(m => m.id === aero.aerotermia_db_id);
                if (!found) return aero;
                return { ...aero, scop: getScopFromModel(found, found.zona_climatica || 'D3', temp) };
            };
            const newCal = recalcScop(p.aerotermia_cal);
            const newAcs = p.misma_aerotermia_acs ? { ...newCal } : recalcScop(p.aerotermia_acs);
            return { ...p, tipo_emisor, aerotermia_cal: newCal, aerotermia_acs: newAcs };
        });
    };

    const handleMismaCalderaAcsChange = (val) => {
        if (val) {
            setLocal(p => ({ ...p, misma_caldera_acs: true, caldera_antigua_acs: { ...p.caldera_antigua_cal } }));
        } else {
            setLocal(p => ({ ...p, misma_caldera_acs: false }));
        }
    };

    const handleMismaAerotermiaAcsChange = (val) => {
        if (val) {
            setLocal(p => ({ ...p, misma_aerotermia_acs: true, aerotermia_acs: { ...p.aerotermia_cal } }));
        } else {
            setLocal(p => ({ ...p, misma_aerotermia_acs: false }));
        }
    };

    const handleCambioAcsChange = (val) => {
        if (val) {
            setLocal(p => ({
                ...p,
                cambio_acs: true,
                misma_caldera_acs: true,
                caldera_antigua_acs: { ...p.caldera_antigua_cal },
                misma_aerotermia_acs: true,
                aerotermia_acs: { ...p.aerotermia_cal },
            }));
        } else {
            setLocal(p => ({ ...p, cambio_acs: false }));
        }
    };

    const prescriptorOptions = prescriptores
        .filter(i => i.tipo_empresa === 'INSTALADOR')
        .map(i => ({
            value: i.id_empresa,
            label: `${i.razon_social || i.acronimo || 'Sin nombre'} ${i.cif ? `(${i.cif})` : ''}`
        }));

    // 1. Extraer demanda con precisión técnica (Prioridad CEE Final > Oportunidad)
    const ceeFinal = expediente?.cee?.cee_final || {};
    const superficie = parseFloat(ceeFinal.superficieHabitable) || parseFloat(opDatos.surface) || 0;
    const demandAnnual = (parseFloat(ceeFinal.demandaCalefaccion) || 0) * superficie || parseFloat(opDatos.Q_net) || 0;

    const hybridizationRes = local.hibridacion ? calculateHybridization({
        demandAnnual: demandAnnual,
        zone: opDatos.zona || 'D3',
        heatPumpPower: local.potencia_bomba || 0
    }) : null;

    return (
        <div className="space-y-6">
            <div className={`space-y-5 transition-all duration-500`}>
                {/* ── DIRECCIÓN ── */}
                <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-4">
                    <Toggle
                        label="¿Misma dirección que el cliente?"
                        value={local.misma_direccion}
                        onChange={handleMismaDireccionChange}
                        readOnly={readOnly}
                    />

                    {!local.misma_direccion && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-white/5 animate-fade-in">
                            <SelectField label="CCAA" value={local.ccaa} onChange={v => setLocal(prev => ({ ...prev, ccaa: v, provincia: '', provincia_cod: '', municipio: '' }))} options={CCAA_LIST.map(c => ({ value: c, label: c }))} readOnly={readOnly} />
                            <SelectField label="Provincia" value={local.provincia_cod} onChange={v => { const pName = provincias.find(p => p.cod === v)?.nombre || ''; setLocal(prev => ({ ...prev, provincia_cod: v, provincia: pName, municipio: '' })); }} options={provincias.map(p => ({ value: p.cod, label: p.nombre }))} loading={loadingGeo.prov} readOnly={readOnly || !local.ccaa} />
                            <SelectField label="Municipio" value={local.municipio} onChange={v => setLocal(prev => ({ ...prev, municipio: v }))} options={municipios.map(m => ({ value: m.nombre, label: m.nombre }))} loading={loadingGeo.muni} readOnly={readOnly || !local.provincia_cod} />
                            <Field label="Código Postal" value={local.codigo_postal} onChange={v => setLocal(prev => ({ ...prev, codigo_postal: v }))} placeholder="Ej: 28001" readOnly={readOnly} />
                            <div className="sm:col-span-2"><Field label="Dirección de la instalación" value={local.direccion} onChange={v => setLocal(prev => ({ ...prev, direccion: v }))} placeholder="Calle, número, piso..." readOnly={readOnly} /></div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5">
                        <Field label="Referencia Catastral" value={local.ref_catastral} onChange={v => setLocal(p => ({ ...p, ref_catastral: v }))} readOnly={readOnly || local.misma_direccion} />
                        <Field label={fetchingUtm ? 'Coordenada X (obteniendo...)' : 'Coordenada X'} value={local.coord_x} onChange={v => setLocal(p => ({ ...p, coord_x: v }))} readOnly={readOnly || local.misma_direccion} />
                        <Field label={fetchingUtm ? 'Coordenada Y (obteniendo...)' : 'Coordenada Y'} value={local.coord_y} onChange={v => setLocal(p => ({ ...p, coord_y: v }))} readOnly={readOnly || local.misma_direccion} />
                    </div>
                </div>

                {/* ── PREGUNTA ACS ── */}
                <div className={`bg-slate-900 border p-4 rounded-xl ${readOnly ? 'border-white/5 opacity-80' : 'border-brand/20'}`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-widest">¿Se va a actuar también sobre el ACS?</span>
                        <div className="flex items-center gap-2 p-1 bg-slate-950/50 rounded-xl border border-slate-700/50">
                            <button
                                onClick={() => !readOnly && handleCambioAcsChange(true)}
                                disabled={readOnly}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                                    local.cambio_acs
                                        ? (readOnly ? 'bg-cyan-900 text-cyan-300 border-cyan-800' : 'bg-cyan-500 text-bkg-deep border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]')
                                        : 'text-white/20 border-transparent hover:text-white'
                                }`}
                            >SÍ</button>
                            <button
                                onClick={() => !readOnly && handleCambioAcsChange(false)}
                                disabled={readOnly}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                                    !local.cambio_acs
                                        ? (readOnly ? 'bg-brand/40 text-bkg-deep border-brand/40' : 'bg-brand text-bkg-deep border-brand')
                                        : 'text-white/20 border-transparent hover:text-white'
                                }`}
                            >NO</button>
                        </div>
                    </div>
                    {local.cambio_acs && (
                        <p className="text-[10px] text-white/30 mt-2">
                            Los datos de ACS se copian de calefacción por defecto. Edita la columna derecha para usar equipos distintos.
                        </p>
                    )}
                </div>

                {/* ── CALDERAS (2 cols si ACS activo) ── */}
                <div className={`grid gap-4 ${local.cambio_acs ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                    <CalderaSection
                        title="Caldera Antigua — Calefacción"
                        data={local.caldera_antigua_cal}
                        readOnly={readOnly}
                        onChange={v => {
                            setLocal(p => {
                                const next = { ...p, caldera_antigua_cal: v };
                                if (p.misma_caldera_acs) next.caldera_antigua_acs = { ...v };
                                return next;
                            });
                        }}
                    />
                    {local.cambio_acs && (
                        <CalderaSection
                            title="Caldera Antigua — ACS"
                            data={local.caldera_antigua_acs}
                            readOnly={readOnly}
                            onChange={v => setLocal(p => ({ ...p, caldera_antigua_acs: v, misma_caldera_acs: false }))}
                        />
                    )}
                </div>

                {/* ── TIPO EMISOR ── */}
                <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06]">
                    <SelectField
                        label="Tipo de emisor (calefacción)"
                        value={local.tipo_emisor}
                        onChange={handleTipoEmisorChange}
                        options={EMITTER_OPTIONS}
                        readOnly={readOnly}
                    />
                </div>

                {/* ── AEROTERMIAS (2 cols si ACS activo) ── */}
                <div className={`grid gap-4 ${local.cambio_acs ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                    <AerotermiaSection
                        title="Aerotermia Nueva — Calefacción"
                        data={local.aerotermia_cal}
                        readOnly={readOnly}
                        onChange={v => {
                            setLocal(p => {
                                const next = {
                                    ...p,
                                    aerotermia_cal: v,
                                    potencia_bomba: v.potencia || p.potencia_bomba
                                };
                                if (p.misma_aerotermia_acs) next.aerotermia_acs = { ...v };
                                return next;
                            });
                        }}
                        marcas={marcas}
                        modelosPorMarca={modelosPorMarca}
                        tipoEmisor={local.tipo_emisor}
                    />
                    {local.cambio_acs && (
                        <AerotermiaSection
                            title="Aerotermia Nueva — ACS"
                            data={local.aerotermia_acs}
                            readOnly={readOnly}
                            onChange={v => setLocal(p => ({ ...p, aerotermia_acs: v, misma_aerotermia_acs: false }))}
                            marcas={marcas}
                            modelosPorMarca={modelosPorMarca}
                            tipoEmisor={local.tipo_emisor}
                            isAcs={true}
                        />
                    )}
                </div>

                {/* ── HIBRIDACIÓN ── */}
                <div className="bg-slate-950/80 border border-brand/20 p-5 rounded-2xl space-y-4 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 bg-brand/5 rounded-full blur-3xl -mr-10 -mt-10" />

                    <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black text-brand uppercase tracking-widest">Análisis de Hibridación</span>
                                <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-xl border border-white/5">
                                    <button
                                        onClick={() => setLocal(p => ({ ...p, hibridacion: !p.hibridacion }))}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all duration-300 border ${local.hibridacion ? 'bg-amber-500 text-bkg-deep border-amber-400 font-bold shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'text-slate-500 border-transparent hover:text-white'}`}
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span className="text-xs uppercase tracking-tight">HABILITAR HIBRIDACIÓN</span>
                                    </button>
                                </div>
                            </div>

                            {local.hibridacion && (
                                <div className="flex flex-col gap-2 animate-in slide-in-from-left duration-500">
                                    <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest pl-1">Potencia Hid. (kW)</span>
                                    <div className="p-0.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            className="w-24 bg-transparent border-none text-amber-400 font-black text-sm px-3 py-2 focus:outline-none placeholder:text-amber-500/30 tabular-nums font-mono"
                                            value={local.potencia_bomba || ''}
                                            onChange={e => setLocal(prev => ({ ...prev, potencia_bomba: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {local.hibridacion && hybridizationRes && (
                             <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-8 pr-8">
                                <div className="grid grid-cols-4 gap-8">
                                    <div className="relative">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Demanda Anual</p>
                                        <p className="text-sm font-black text-white leading-none tabular-nums font-mono tracking-tighter">
                                            {demandAnnual.toFixed(0)} <span className="text-[10px] text-white/30 ml-0.5 font-sans">kWh</span>
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-2 px-1.5 py-0.5 rounded-full bg-brand/5 border border-brand/10 w-fit">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                                            <span className="text-[7px] font-black text-brand uppercase tracking-widest">
                                                {ceeFinal.demandaCalefaccion ? 'Certificado CEE' : 'Oportunidad'}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Horas Eq.</p>
                                        <p className="text-sm font-black text-white leading-none tabular-nums font-mono">
                                            {hybridizationRes.pDesign > 0 ? (demandAnnual / hybridizationRes.pDesign).toFixed(0) : '0'}
                                            <span className="text-[10px] text-white/30 ml-1 font-sans">h</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">% Cobertura</p>
                                        <p className="text-sm font-black text-brand leading-none tabular-nums font-mono">{(hybridizationRes.coverage * 100).toFixed(1)}%</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1.5">Coef. CB</p>
                                        <p className="text-xl font-black text-amber-400 leading-none tabular-nums font-mono">{(hybridizationRes.cb * 100).toFixed(2)}%</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── INSTALADOR ── */}
                <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06] space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded bg-brand/10 flex items-center justify-center">
                             <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <h4 className="text-xs font-black text-white uppercase tracking-widest">Empresa Instaladora Asignada</h4>
                    </div>
                    <SelectField
                        label="Seleccionar Instalador"
                        value={local.instalador_id}
                        onChange={v => setLocal(p => ({ ...p, instalador_id: v || null }))}
                        options={prescriptorOptions}
                    />
                </div>
            </div>
        </div>
    );
}
