import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import InstaladorFormModal from './InstaladorFormModal';

// ─── Helpers ───────────────────────────────────────────────────────────────
function normalize(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

// Mapping código provincia → nombre (mismo que backend/routes/geo.js)
const PROV_NOMBRE = {
    '01':'ÁLAVA','02':'ALBACETE','03':'ALICANTE','04':'ALMERÍA','05':'ÁVILA',
    '06':'BADAJOZ','07':'BALEARES','08':'BARCELONA','09':'BURGOS','10':'CÁCERES',
    '11':'CÁDIZ','12':'CASTELLÓN','13':'CIUDAD REAL','14':'CÓRDOBA','15':'A CORUÑA',
    '16':'CUENCA','17':'GIRONA','18':'GRANADA','19':'GUADALAJARA','20':'GUIPÚZCOA',
    '21':'HUELVA','22':'HUESCA','23':'JAÉN','24':'LEÓN','25':'LLEIDA',
    '26':'LA RIOJA','27':'LUGO','28':'MADRID','29':'MÁLAGA','30':'MURCIA',
    '31':'NAVARRA','32':'OURENSE','33':'ASTURIAS','34':'PALENCIA','35':'LAS PALMAS',
    '36':'PONTEVEDRA','37':'SALAMANCA','38':'S.C. DE TENERIFE','39':'CANTABRIA',
    '40':'SEGOVIA','41':'SEVILLA','42':'SORIA','43':'TARRAGONA','44':'TERUEL',
    '45':'TOLEDO','46':'VALENCIA','47':'VALLADOLID','48':'VIZCAYA','49':'ZAMORA',
    '50':'ZARAGOZA','51':'CEUTA','52':'MELILLA',
};

// Mapping código provincia → CCAA
const PROV_CCAA = {
    '01':'PAÍS VASCO','02':'CASTILLA-LA MANCHA','03':'COMUNIDAD VALENCIANA','04':'ANDALUCÍA',
    '05':'CASTILLA Y LEÓN','06':'EXTREMADURA','07':'ISLAS BALEARES','08':'CATALUÑA',
    '09':'CASTILLA Y LEÓN','10':'EXTREMADURA','11':'ANDALUCÍA','12':'COMUNIDAD VALENCIANA',
    '13':'CASTILLA-LA MANCHA','14':'ANDALUCÍA','15':'GALICIA','16':'CASTILLA-LA MANCHA',
    '17':'CATALUÑA','18':'ANDALUCÍA','19':'CASTILLA-LA MANCHA','20':'PAÍS VASCO',
    '21':'ANDALUCÍA','22':'ARAGÓN','23':'ANDALUCÍA','24':'CASTILLA Y LEÓN',
    '25':'CATALUÑA','26':'LA RIOJA','27':'GALICIA','28':'COMUNIDAD DE MADRID',
    '29':'ANDALUCÍA','30':'REGIÓN DE MURCIA','31':'NAVARRA','32':'GALICIA',
    '33':'ASTURIAS','34':'CASTILLA Y LEÓN','35':'CANARIAS','36':'GALICIA',
    '37':'CASTILLA Y LEÓN','38':'CANARIAS','39':'CANTABRIA','40':'CASTILLA Y LEÓN',
    '41':'ANDALUCÍA','42':'CASTILLA Y LEÓN','43':'CATALUÑA','44':'ARAGÓN',
    '45':'CASTILLA-LA MANCHA','46':'COMUNIDAD VALENCIANA','47':'CASTILLA Y LEÓN',
    '48':'PAÍS VASCO','49':'CASTILLA Y LEÓN','50':'ARAGÓN','51':'CEUTA','52':'MELILLA',
};

/**
 * Parsea una dirección catastral tipo "CL PRIM 21 13700 TOMELLOSO CIUDAD REAL"
 * devuelve { calle, cp, municipioRaw }
 */
function parseCatastroAddress(address) {
    if (!address) return {};
    // Quitar paréntesis y normalizar espacios
    const str = address.trim().replace(/[()]/g, ' ').replace(/\s+/g, ' ');
    const cpMatch = str.match(/\b(\d{5})\b/);
    if (!cpMatch) return { calle: str };

    const cpIdx = str.indexOf(cpMatch[0]);
    const calle = str.substring(0, cpIdx).trim();
    const municipioRaw = str.substring(cpIdx + 5).trim();
    return { calle, cp: cpMatch[0], municipioRaw };
}

// Provincias ordenadas por longitud de nombre desc (para matches más largos primero)
const PROV_NOMBRE_SORTED = Object.entries(PROV_NOMBRE)
    .sort((a, b) => b[1].length - a[1].length);

/**
 * Extrae ccaa, provincia, provincia_cod y municipioHint de la oportunidad.
 * Intenta provinceCode primero, si no lo tiene parsea la provincia del string de dirección.
 */
function extractDireccionFromOportunidad(oportunidad) {
    if (!oportunidad) return null;
    const inputs = oportunidad.datos_calculo?.inputs || {};
    // Nuevas oportunidades → inputs.address; antiguas → inputs.direccion
    const address = inputs.address || inputs.direccion || '';
    const { calle, cp, municipioRaw } = parseCatastroAddress(address);

    // 1. Intentar con provinceCode (nuevo) o provincia (antiguo) del catastro
    const rawProvCode = inputs.provinceCode || inputs.provincia || '';
    let provCode = rawProvCode ? String(rawProvCode).padStart(2, '0') : '';
    let provNombre = PROV_NOMBRE[provCode] || '';
    let ccaaName = PROV_CCAA[provCode] || '';

    // 2. Si no hay código de provincia, derivar del texto de la dirección
    if (!provNombre && municipioRaw) {
        for (const [cod, nombre] of PROV_NOMBRE_SORTED) {
            if (normalize(municipioRaw).endsWith(normalize(nombre))) {
                provCode = cod;
                provNombre = nombre;
                ccaaName = PROV_CCAA[cod] || '';
                break;
            }
        }
    }

    // 2b. Fallback: derivar provincia del código postal (primeros 2 dígitos = código provincia)
    if (!provNombre && cp && cp.length >= 2) {
        const cpProvCode = cp.substring(0, 2);
        if (PROV_NOMBRE[cpProvCode]) {
            provCode = cpProvCode;
            provNombre = PROV_NOMBRE[cpProvCode];
            ccaaName = PROV_CCAA[cpProvCode] || '';
        }
    }

    // 3. Extraer municipio quitando la provincia del final
    let municipioHint = municipioRaw || '';
    if (provNombre && municipioHint) {
        const provWords = provNombre.split(' ');
        const muniWords = municipioHint.split(' ');
        if (muniWords.length > provWords.length) {
            const lastN = muniWords.slice(-provWords.length).join(' ');
            if (normalize(lastN) === normalize(provNombre)) {
                municipioHint = muniWords.slice(0, -provWords.length).join(' ');
            }
        }
    }

    return {
        ccaa: ccaaName,
        provincia: provNombre,
        provincia_cod: provCode || '',
        municipioHint: municipioHint.trim(),
        direccion: calle || '',
        codigo_postal: cp || '',
    };
}

// ─── Componentes internos ─────────────────────────────────────────────────
function Field({ label, children, required }) {
    return (
        <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1.5">
                {label}{required && <span className="text-brand ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

function Input({ className = '', uppercase = false, onChange, ...props }) {
    const handleChange = uppercase && onChange
        ? (e) => { e.target.value = e.target.value.toUpperCase(); onChange(e); }
        : onChange;
    return (
        <input
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${uppercase ? 'uppercase' : ''} ${className}`}
            onChange={handleChange}
            {...props}
        />
    );
}

function Select({ className = '', children, ...props }) {
    return (
        <select
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${className}`}
            {...props}
        >
            {children}
        </select>
    );
}

const CCAA_LIST = Object.values(PROV_CCAA).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'es'));


// ─── Sección de dirección con auto-selección de municipio ─────────────────
function DireccionFields({ values, onChange, autoMunicipioHint }) {
    const [provincias, setProvincias] = useState([]);
    const [municipios, setMunicipios] = useState([]);
    const [loadingProv, setLoadingProv] = useState(false);
    const [loadingMuni, setLoadingMuni] = useState(false);

    // 1. Normalizar CCAA al cargar (viniendo de DB o Catastro puede ser diferente case)
    useEffect(() => {
        if (!values.ccaa) return;
        const matched = CCAA_LIST.find(c => normalize(c) === normalize(values.ccaa));
        if (matched && matched !== values.ccaa) {
            onChange({ ccaa: matched });
        }
    }, [values.ccaa]);

    // 2. Normalizar Provincia cuando cargue la lista
    useEffect(() => {
        if (loadingProv || provincias.length === 0 || !values.provincia_cod) return;
        const matchedProv = provincias.find(p => p.cod === values.provincia_cod);
        if (matchedProv && matchedProv.nombre !== values.provincia) {
            onChange({ provincia: matchedProv.nombre });
        }
    }, [provincias, loadingProv, values.provincia_cod]);

    // 3. Normalizar Municipio cuando cargue la lista
    useEffect(() => {
        if (loadingMuni || municipios.length === 0 || !values.municipio) return;
        if (!municipios.includes(values.municipio)) {
            const normTarget = normalize(values.municipio);
            const match = municipios.find(m => normalize(m) === normTarget)
                || municipios.find(m => normalize(m).includes(normTarget))
                || municipios.find(m => normTarget.includes(normalize(m)));
            if (match && match !== values.municipio) {
                onChange({ municipio: match });
            }
        }
    }, [municipios, loadingMuni]);

    // 4. Cargar provincias cuando cambia CCAA
    useEffect(() => {
        if (!values.ccaa) { setProvincias([]); setMunicipios([]); return; }
        setLoadingProv(true);
        axios.get('/api/geo/provincias', { params: { ccaa: values.ccaa } })
            .then(r => setProvincias(r.data))
            .catch(() => setProvincias([]))
            .finally(() => setLoadingProv(false));
    }, [values.ccaa]);

    // 5. Cargar municipios cuando cambia provincia
    useEffect(() => {
        if (!values.provincia_cod) { setMunicipios([]); return; }
        setLoadingMuni(true);
        axios.get('/api/geo/municipios', { params: { codprov: values.provincia_cod } })
            .then(r => setMunicipios(r.data))
            .catch(() => setMunicipios([]))
            .finally(() => setLoadingMuni(false));
    }, [values.provincia_cod]);

    // 6. Auto-seleccionar municipio cuando la lista cargue y hay un hint
    useEffect(() => {
        if (!autoMunicipioHint || loadingMuni || municipios.length === 0) return;
        if (values.municipio) return; // ya está seleccionado

        const hintNorm = normalize(autoMunicipioHint);
        const found = municipios.find(m => normalize(m) === hintNorm)
            || municipios.find(m => normalize(m).includes(hintNorm))
            || municipios.find(m => hintNorm.includes(normalize(m)));
        if (found) onChange({ municipio: found });
    }, [municipios, loadingMuni, autoMunicipioHint]);

    const handleCcaaChange = (e) => {
        onChange({ ccaa: e.target.value, provincia: '', provincia_cod: '', municipio: '' });
    };

    const handleProvinciaChange = (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        onChange({ provincia: opt.text, provincia_cod: opt.value, municipio: '' });
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="CCAA">
                <Select value={values.ccaa || ''} onChange={handleCcaaChange}>
                    <option value="">— Selecciona CCAA —</option>
                    {CCAA_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
            </Field>

            <Field label="Provincia">
                <Select value={values.provincia_cod || ''} onChange={handleProvinciaChange} disabled={!values.ccaa || loadingProv}>
                    <option value="">{loadingProv ? 'Cargando...' : '— Selecciona provincia —'}</option>
                    {provincias.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
                </Select>
            </Field>

            <Field label="Municipio">
                <Select value={values.municipio || ''} onChange={e => onChange({ municipio: e.target.value })} disabled={!values.provincia_cod || loadingMuni}>
                    <option value="">{loadingMuni ? 'Cargando...' : '— Selecciona municipio —'}</option>
                    {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
            </Field>

            <Field label="Código Postal">
                <Input
                    placeholder="28001"
                    value={values.codigo_postal || ''}
                    onChange={e => onChange({ codigo_postal: e.target.value })}
                    maxLength={5}
                />
            </Field>

            <div className="sm:col-span-2">
                <Field label="Dirección">
                    <Input
                        placeholder="CALLE, NÚMERO, PISO..."
                        uppercase
                        value={values.direccion || ''}
                        onChange={e => onChange({ direccion: e.target.value })}
                    />
                </Field>
            </div>
        </div>
    );
}

// ─── Modal principal ────────────────────────────────────────────────────────
export function ClienteFormModal({ isOpen, onClose, onSuccess, oportunidad, initialData }) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    // Extraer datos de dirección de la oportunidad (memoizado para no recalcular)
    const getOpDireccion = useCallback(
        () => extractDireccionFromOportunidad(oportunidad),
        [oportunidad]
    );

    const isDistribuidor = user?.rol?.toUpperCase() === 'DISTRIBUIDOR';
    const isInstalador = user?.rol?.toUpperCase() === 'INSTALADOR';

    const EMPTY = { ccaa: '', provincia: '', provincia_cod: '', municipio: '', municipioHint: '', direccion: '', codigo_postal: '' };

    const [esEmpresa, setEsEmpresa] = useState(false);
    const [mismaDireccion, setMismaDireccion] = useState(false);
    const [autoMunicipioHint, setAutoMunicipioHint] = useState('');
    const [showNotas, setShowNotas] = useState(false);
    const [form, setForm] = useState({
        nombre_razon_social: '',
        apellidos: '',
        email: '',
        tlf: '',
        dni: '',
        numero_cuenta: '',
        prescriptor_id: '',
        instalador_asociado_id: '',
        ccaa: '', provincia: '', provincia_cod: '', municipio: '',
        persona_contacto_nombre: '',
        persona_contacto_tlf: '',
        notas: '',
        cod_cliente_interno: '',
        ...(initialData || {}),
    });
    const [prescriptores, setPrescriptores] = useState([]);
    const [loadingPrescriptores, setLoadingPrescriptores] = useState(false);
    const [prescriptoresError, setPrescriptoresError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const [instaladores, setInstaladores] = useState([]);
    const [loadingInstaladores, setLoadingInstaladores] = useState(false);
    const [isInstaladorDropdownOpen, setIsInstaladorDropdownOpen] = useState(false);
    const [showInstaladorModal, setShowInstaladorModal] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [savedCliente, setSavedCliente] = useState(null);

    const filteredPrescriptores = prescriptores.filter(p => {
        return normalize(p.acronimo || p.razon_social).includes(normalize(searchTerm));
    });
    const selectedPrescriptor = prescriptores.find(p => p.id_empresa === form.prescriptor_id);

    // Reset al abrir
    useEffect(() => {
        if (!isOpen) return;
        setEsEmpresa(false);
        setMismaDireccion(false);
        setAutoMunicipioHint('');
        setError(null);
        setSuccess(false);
        setSavedCliente(null);
        setSearchTerm('');
        setIsDropdownOpen(false);
        setShowNotas(!!initialData?.notas);
        setForm({
            nombre_razon_social: '',
            apellidos: '',
            email: '',
            tlf: '',
            dni: '',
            numero_cuenta: '',
            prescriptor_id: initialData?.prescriptor_id || oportunidad?.prescriptor_id || '',
            instalador_asociado_id: initialData?.instalador_asociado_id || oportunidad?.instalador_asociado_id || '',
            ccaa: '', provincia: '', provincia_cod: '', municipio: '',
            persona_contacto_nombre: '',
            persona_contacto_tlf: '',
            notas: '',
            cod_cliente_interno: initialData?.cod_cliente_interno || 
                                oportunidad?.datos_calculo?.cod_cliente_interno || 
                                oportunidad?.datos_calculo?.inputs?.cod_cliente_interno || '',
            ...(initialData || {}),
        });
    }, [isOpen]);

    // Admin: cargar prescriptores
    useEffect(() => {
        if (!isOpen || !isAdmin) return;
        setLoadingPrescriptores(true);
        setPrescriptoresError(null);
        axios.get('/api/prescriptores')
            .then(r => {
                if (Array.isArray(r.data)) {
                    setPrescriptores(r.data);
                } else {
                    setPrescriptores([]);
                }
            })
            .catch(() => {
                setPrescriptoresError('Error al cargar partners');
                setPrescriptores([]);
            })
            .finally(() => setLoadingPrescriptores(false));
    }, [isOpen, isAdmin]);

    // Cargar Instaladores si aplica
    useEffect(() => {
        if (!isOpen) return;
        let distId = null;
        if (isDistribuidor) {
            distId = user.prescriptor_id;
        } else if (isAdmin && selectedPrescriptor?.tipo_empresa === 'DISTRIBUIDOR') {
            distId = selectedPrescriptor.id_empresa;
        }

        if (distId) {
            setLoadingInstaladores(true);
            axios.get(`/api/prescriptores/${distId}/instaladores`)
                .then(r => setInstaladores(r.data))
                .catch(() => setInstaladores([]))
                .finally(() => setLoadingInstaladores(false));
        } else {
            setInstaladores([]);
            // Solo limpiamos si realmente el partner seleccionado NO es un distribuidor
            // Si está cargando o no hay selección, mantenemos el valor inicial
            if (isAdmin && selectedPrescriptor && selectedPrescriptor.tipo_empresa !== 'DISTRIBUIDOR') {
                setForm(f => ({ ...f, instalador_asociado_id: '' }));
            }
        }
    }, [isOpen, isAdmin, isDistribuidor, user?.prescriptor_id, selectedPrescriptor]);

    // Cuando cambia el checkbox de misma dirección
    useEffect(() => {
        if (mismaDireccion) {
            const opDir = getOpDireccion();
            if (opDir) {
                setAutoMunicipioHint(opDir.municipioHint || '');
                setForm(f => ({
                    ...f,
                    ccaa: opDir.ccaa,
                    provincia: opDir.provincia,
                    provincia_cod: opDir.provincia_cod,
                    municipio: '',
                    direccion: opDir.direccion,
                    codigo_postal: opDir.codigo_postal,
                }));
            }
        } else {
            setAutoMunicipioHint('');
            setForm(f => ({
                ...f,
                ccaa: '', provincia: '', provincia_cod: '', municipio: '',
                direccion: '', codigo_postal: '',
            }));
        }
    }, [mismaDireccion, getOpDireccion]);

    const updateForm = useCallback((patch) => setForm(f => ({ ...f, ...patch })), []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        let payload;
        try {
            payload = {
                nombre_razon_social: form.nombre_razon_social.trim(),
                apellidos: esEmpresa ? null : (form.apellidos.trim() || null),
                email: form.email.trim() || null,
                tlf: form.tlf.trim() || null,
                dni: form.dni.trim() || null,
                ccaa: form.ccaa || null,
                provincia: form.provincia || null,
                municipio: form.municipio || null,
                direccion: form.direccion.trim() || null,
                codigo_postal: form.codigo_postal.trim() || null,
                numero_cuenta: form.numero_cuenta.trim() || null,
                prescriptor_id: isAdmin ? (form.prescriptor_id || null) : undefined,
                instalador_asociado_id: (isAdmin || isDistribuidor) ? (form.instalador_asociado_id || null) : undefined,
                oportunidad_id: oportunidad?.id_oportunidad || null,
                persona_contacto_nombre: form.persona_contacto_nombre?.trim() || null,
                persona_contacto_tlf: form.persona_contacto_tlf?.trim() || null,
                notificaciones_contacto_activas: form.notificaciones_contacto_activas || false,
                notas: form.notas?.trim() || null,
            };

            const res = await axios.post('/api/clientes', payload);
            setSavedCliente(res.data);
            setSuccess(true);
            if (onSuccess) onSuccess(res.data);
        } catch (err) {
            const body = err.response?.data || {};
            const msg = body.details || body.message || body.error || err.message || 'Error al crear el cliente';
            console.error('[ClienteFormModal] Error creando cliente:', { status: err.response?.status, body, payload });
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto"
        >
            <div
                className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl relative"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Nuevo Cliente</h2>
                        {oportunidad && (
                            <p className="text-xs text-white/40 mt-0.5">
                                Vinculado a: <span className="text-brand font-bold">{oportunidad.id_oportunidad}</span>
                                {oportunidad.referencia_cliente && ` · ${oportunidad.referencia_cliente}`}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6">
                    {!success ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Tipo */}
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setEsEmpresa(false)}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${!esEmpresa ? 'bg-brand text-bkg-deep border-brand' : 'border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
                                    Particular
                                </button>
                                <button type="button" onClick={() => setEsEmpresa(true)}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${esEmpresa ? 'bg-brand text-bkg-deep border-brand' : 'border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
                                    Empresa
                                </button>
                            </div>

                            {/* Datos personales */}
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Datos personales</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label={esEmpresa ? 'Razón Social' : 'Nombre'} required>
                                        <Input placeholder={esEmpresa ? 'EMPRESA S.L.' : 'JUAN'} uppercase
                                            value={form.nombre_razon_social}
                                            onChange={e => updateForm({ nombre_razon_social: e.target.value })} required />
                                    </Field>
                                    {!esEmpresa && (
                                        <Field label="Apellidos">
                                            <Input placeholder="GARCÍA LÓPEZ" uppercase value={form.apellidos}
                                                onChange={e => updateForm({ apellidos: e.target.value })} />
                                        </Field>
                                    )}
                                    <Field label={esEmpresa ? 'CIF' : 'DNI/NIF'}>
                                        <Input placeholder={esEmpresa ? 'B12345678' : '12345678A'} uppercase
                                            value={form.dni} onChange={e => updateForm({ dni: e.target.value })} />
                                    </Field>
                                    <Field label="Email">
                                        <Input type="email" placeholder="cliente@email.com"
                                            value={form.email} onChange={e => updateForm({ email: e.target.value.toLowerCase() })} />
                                    </Field>
                                    <Field label="Teléfono">
                                        <Input placeholder="600 000 000" value={form.tlf}
                                            onChange={e => updateForm({ tlf: e.target.value })} />
                                    </Field>
                                    {!esEmpresa && isAdmin && (
                                        <Field label="Número de Cuenta (IBAN)">
                                            <Input placeholder="ES00 0000 0000 00 0000000000" uppercase
                                                value={form.numero_cuenta}
                                                onChange={e => updateForm({ numero_cuenta: e.target.value })} />
                                        </Field>
                                    )}
                                </div>

                                {/* Persona de Contacto */}
                                <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-4">
                                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={!!(form.persona_contacto_nombre || form.persona_contacto_tlf || form.showContact)}
                                                onChange={e => updateForm({ showContact: e.target.checked })}
                                            />
                                            <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
                                            ¿Persona de contacto distinta al titular?
                                        </span>
                                    </label>

                                    {(form.showContact || form.persona_contacto_nombre || form.persona_contacto_tlf) && (
                                        <div className="space-y-3 animate-fade-in p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <Field label="Nombre de Contacto">
                                                    <Input
                                                        placeholder="P. EJ. MARÍA (HIJA)"
                                                        uppercase
                                                        value={form.persona_contacto_nombre || ''}
                                                        onChange={e => updateForm({ persona_contacto_nombre: e.target.value })}
                                                    />
                                                </Field>
                                                <Field label="Teléfono de Contacto">
                                                    <Input
                                                        placeholder="600 000 000"
                                                        value={form.persona_contacto_tlf || ''}
                                                        onChange={e => updateForm({ persona_contacto_tlf: e.target.value })}
                                                    />
                                                </Field>
                                            </div>
                                            <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        className="peer sr-only"
                                                        checked={!!form.notificaciones_contacto_activas}
                                                        onChange={e => updateForm({ notificaciones_contacto_activas: e.target.checked })}
                                                    />
                                                    <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
                                                    Enviar notificaciones WhatsApp a este contacto
                                                </span>
                                            </label>
                                            <p className="text-[10px] text-white/20 italic">
                                                Si se activa, las notificaciones de WhatsApp se enviarán a este número en lugar del teléfono principal.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notas */}
                            <div className="space-y-4 pt-2">
                                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={showNotas}
                                            onChange={e => setShowNotas(e.target.checked)}
                                        />
                                        <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
                                        ¿Añadir notas/observaciones sobre el cliente?
                                    </span>
                                </label>

                                {showNotas && (
                                    <div className="space-y-3 animate-fade-in">
                                        <Field label="Observaciones sobre el cliente">
                                            <textarea
                                                placeholder="Escribe aquí cualquier detalle relevante..."
                                                className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all min-h-[100px] resize-none"
                                                value={form.notas || ''}
                                                onChange={e => updateForm({ notas: e.target.value })}
                                            />
                                        </Field>
                                    </div>
                                )}
                            </div>

                            {/* Dirección */}
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Dirección</p>
                                {oportunidad && (
                                    <label className="flex items-center gap-3 p-3 bg-brand/5 border border-brand/20 rounded-xl cursor-pointer hover:bg-brand/10 transition-colors">
                                        <input type="checkbox" checked={mismaDireccion}
                                            onChange={e => setMismaDireccion(e.target.checked)}
                                            className="w-4 h-4 accent-brand rounded" />
                                        <div>
                                            <p className="text-xs font-black text-white/80 uppercase tracking-widest">Misma dirección que la oportunidad</p>
                                            <p className="text-[10px] text-white/30">Se autocompletarán los campos de localización del inmueble</p>
                                        </div>
                                    </label>
                                )}
                                <DireccionFields
                                    values={form}
                                    onChange={updateForm}
                                    autoMunicipioHint={autoMunicipioHint}
                                />
                            </div>

                            {/* Prescriptor (solo admin) */}
                            {isAdmin && (!oportunidad || !oportunidad.prescriptor_id) && (
                                <div className="space-y-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Prescriptor / Partner</p>
                                    <Field label="Asignar a prescriptor">
                                        <div className="relative">
                                            {/* Gatillo del Dropdown */}
                                            <div 
                                                className={`w-full px-3 py-2.5 bg-bkg-surface border ${isDropdownOpen ? 'border-brand/40 ring-2 ring-brand/40' : 'border-white/[0.08]'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between min-h-[42px]`}
                                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {selectedPrescriptor?.logo_empresa ? (
                                                        <img src={selectedPrescriptor.logo_empresa} alt="" className="w-5 h-5 rounded-md object-contain bg-white/5" />
                                                    ) : (
                                                        <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center">
                                                            <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                    <span className={`text-sm ${selectedPrescriptor ? 'text-white' : 'text-white/20'}`}>
                                                        {selectedPrescriptor ? (selectedPrescriptor.acronimo || selectedPrescriptor.razon_social) : '— Sin prescriptor (Brokergy) —'}
                                                    </span>
                                                </div>
                                                <svg className={`w-4 h-4 text-white/30 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>

                                            {/* Panel del Dropdown */}
                                            {isDropdownOpen && (
                                                <div className="absolute z-[310] left-0 right-0 mt-2 bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                    {/* Buscador */}
                                                    <div className="p-2 border-b border-white/[0.05] bg-white/[0.02]">
                                                        <div className="relative">
                                                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                            </svg>
                                                            <input 
                                                                autoFocus
                                                                type="text" 
                                                                placeholder="Buscar partner..."
                                                                className="w-full bg-bkg-deep/50 border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand/50 transition-all"
                                                                value={searchTerm}
                                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Lista */}
                                                    <div className="max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                                                        {loadingPrescriptores ? (
                                                            <div className="p-8 text-center flex flex-col items-center gap-3">
                                                                <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin"></div>
                                                                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Cargando partners...</span>
                                                            </div>
                                                        ) : prescriptoresError ? (
                                                            <div className="p-6 text-center">
                                                                <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">{prescriptoresError}</p>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div 
                                                                    className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${!form.prescriptor_id ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                    onClick={() => { updateForm({ prescriptor_id: '' }); setIsDropdownOpen(false); setSearchTerm(''); }}
                                                                >
                                                                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-white/40">
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                                                                        </svg>
                                                                    </div>
                                                                    <span className="text-xs font-black uppercase tracking-widest text-white/60">— Brokergy (Directo) —</span>
                                                                </div>

                                                                {filteredPrescriptores.map(p => (
                                                                    <div 
                                                                        key={p.id_empresa}
                                                                        className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${form.prescriptor_id === p.id_empresa ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                        onClick={() => { updateForm({ prescriptor_id: p.id_empresa }); setIsDropdownOpen(false); setSearchTerm(''); }}
                                                                    >
                                                                        {p.logo_empresa ? (
                                                                            <img src={p.logo_empresa} alt="" className="w-7 h-7 rounded-lg object-contain bg-white/5 shrink-0" />
                                                                        ) : (
                                                                            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                                                                <span className="text-[10px] font-black text-white/20">{(p.acronimo || p.razon_social || '?').charAt(0).toUpperCase()}</span>
                                                                            </div>
                                                                        )}
                                                                        <div className="flex flex-col min-w-0 flex-1 text-left">
                                                                            <span className="text-xs font-black text-white truncate uppercase tracking-tight">{p.acronimo || p.razon_social}</span>
                                                                            {p.acronimo && p.razon_social && p.acronimo !== p.razon_social && (
                                                                                <span className="text-[9px] text-white/30 truncate uppercase">{p.razon_social}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}

                                                                {filteredPrescriptores.length === 0 && (
                                                                    <div className="p-10 text-center flex flex-col items-center gap-2">
                                                                        <svg className="w-6 h-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                                                        </svg>
                                                                        <span className="text-[10px] text-white/20 italic uppercase tracking-[0.2em]">No se encontraron partners</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </Field>
                                </div>
                            )}

                            {/* Instalador Asociado y Código Interno */}
                            {(isDistribuidor || (isAdmin && selectedPrescriptor?.tipo_empresa === 'DISTRIBUIDOR')) && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Instalador Asociado</p>
                                            <Field label="Instalador">
                                                <div className="relative">
                                                    {/* Gatillo */}
                                                    <div 
                                                        className={`w-full px-3 py-2.5 bg-bkg-surface border ${isInstaladorDropdownOpen ? 'border-brand/40 ring-2 ring-brand/40' : 'border-white/[0.08]'} rounded-xl text-white cursor-pointer transition-all flex items-center justify-between min-h-[42px]`}
                                                        onClick={() => setIsInstaladorDropdownOpen(!isInstaladorDropdownOpen)}
                                                    >
                                                        <div className="flex items-center gap-2 text-sm">
                                                            {form.instalador_asociado_id ? (
                                                                <span className="text-white">
                                                                    {instaladores.find(i => i.id_empresa === form.instalador_asociado_id)?.razon_social || 'Instalador seleccionado'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-white/30">— Selecciona un instalador —</span>
                                                            )}
                                                        </div>
                                                        <svg className={`w-4 h-4 transition-transform ${isInstaladorDropdownOpen ? 'rotate-180' : ''} ${oportunidad?.instalador_asociado_id ? 'text-brand' : 'text-white/30'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                    {oportunidad?.instalador_asociado_id && (
                                                        <p className="text-[9px] text-white/20 uppercase font-bold mt-1 px-1 tracking-widest">Pre-fijado en Oportunidad</p>
                                                    )}

                                                    {/* Dropdown */}
                                                    {isInstaladorDropdownOpen && (
                                                        <div className="absolute z-[310] left-0 right-0 mt-2 bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                                                                {loadingInstaladores ? (
                                                                    <div className="p-4 text-center">
                                                                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Cargando...</span>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        {instaladores.map(inst => (
                                                                            <div 
                                                                                key={inst.id_empresa}
                                                                                className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white/[0.05] ${form.instalador_asociado_id === inst.id_empresa ? 'bg-brand/10 border border-brand/20' : 'border border-transparent'}`}
                                                                                onClick={() => { updateForm({ instalador_asociado_id: inst.id_empresa }); setIsInstaladorDropdownOpen(false); }}
                                                                            >
                                                                                <span className="text-xs font-black text-white uppercase">{inst.razon_social}</span>
                                                                            </div>
                                                                        ))}

                                                                        {instaladores.length === 0 && (
                                                                            <div className="p-4 text-center">
                                                                                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">No hay instaladores asociados</span>
                                                                            </div>
                                                                        )}

                                                                        <div className="p-1 mt-1 border-t border-white/[0.05]">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setIsInstaladorDropdownOpen(false);
                                                                                    setShowInstaladorModal(true);
                                                                                }}
                                                                                className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 transition-colors text-xs font-bold uppercase tracking-wider"
                                                                            >
                                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                                                </svg>
                                                                                Crear Nuevo
                                                                            </button>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </Field>
                                        </div>

                                         {user?.rol === 'DISTRIBUIDOR' && (
                                            <div className="space-y-3">
                                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Cod. Cliente Interno</p>
                                                <Field label="Nº Cliente Interno">
                                                    <Input 
                                                        placeholder="P. EJ. 12345" 
                                                        uppercase
                                                        value={form.cod_cliente_interno || oportunidad?.datos_calculo?.cod_cliente_interno || ''}
                                                        onChange={e => updateForm({ cod_cliente_interno: e.target.value })}
                                                    />
                                                </Field>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={onClose}
                                    className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/20 font-bold text-sm transition-all">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading || !form.nombre_razon_social.trim()}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-wider shadow-lg shadow-brand/20 hover:shadow-brand/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                    {loading ? 'Creando...' : 'Crear Cliente'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-8 animate-fade-in">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-black text-white mb-2 uppercase tracking-widest">¡Cliente Creado!</h3>
                            <p className="text-white/50 text-sm mb-6">
                                {savedCliente?.nombre_razon_social}{savedCliente?.apellidos ? ` ${savedCliente.apellidos}` : ''}
                                {oportunidad && <> vinculado a <span className="text-brand font-bold">{oportunidad.id_oportunidad}</span></>}
                            </p>
                            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-6 inline-block">
                                <p className="text-xs text-emerald-400/80 uppercase tracking-widest font-bold mb-1">ID Cliente</p>
                                <p className="text-sm font-mono font-black text-emerald-400 break-all">{savedCliente?.id_cliente}</p>
                            </div>
                            <button onClick={onClose}
                                className="w-full py-3 rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 font-bold text-sm transition-all">
                                Cerrar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal para crear instalador al vuelo */}
            <InstaladorFormModal
                isOpen={showInstaladorModal}
                onClose={() => setShowInstaladorModal(false)}
                onSuccess={(nuevoInstalador) => {
                    setInstaladores(prev => [nuevoInstalador, ...prev]);
                    updateForm({ instalador_asociado_id: nuevoInstalador.id_empresa });
                    setShowInstaladorModal(false);
                }}
            />
        </div>
    );
}
