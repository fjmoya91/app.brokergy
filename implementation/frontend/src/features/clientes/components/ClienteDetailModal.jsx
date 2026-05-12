import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

// ─── Helpers ───────────────────────────────────────────────────────────────
function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const PROV_CCAA = {
    '04':'ANDALUCÍA','11':'ANDALUCÍA','14':'ANDALUCÍA','18':'ANDALUCÍA',
    '21':'ANDALUCÍA','23':'ANDALUCÍA','29':'ANDALUCÍA','41':'ANDALUCÍA',
    '22':'ARAGÓN','44':'ARAGÓN','50':'ARAGÓN',
    '33':'ASTURIAS','07':'ISLAS BALEARES','35':'CANARIAS','38':'CANARIAS',
    '39':'CANTABRIA','02':'CASTILLA-LA MANCHA','13':'CASTILLA-LA MANCHA',
    '16':'CASTILLA-LA MANCHA','19':'CASTILLA-LA MANCHA','45':'CASTILLA-LA MANCHA',
    '05':'CASTILLA Y LEÓN','09':'CASTILLA Y LEÓN','24':'CASTILLA Y LEÓN',
    '34':'CASTILLA Y LEÓN','37':'CASTILLA Y LEÓN','40':'CASTILLA Y LEÓN',
    '42':'CASTILLA Y LEÓN','47':'CASTILLA Y LEÓN','49':'CASTILLA Y LEÓN',
    '08':'CATALUÑA','17':'CATALUÑA','25':'CATALUÑA','43':'CATALUÑA',
    '51':'CEUTA','03':'COMUNIDAD VALENCIANA','12':'COMUNIDAD VALENCIANA','46':'COMUNIDAD VALENCIANA',
    '06':'EXTREMADURA','10':'EXTREMADURA','15':'GALICIA','27':'GALICIA','32':'GALICIA','36':'GALICIA',
    '26':'LA RIOJA','28':'COMUNIDAD DE MADRID','52':'MELILLA','30':'REGIÓN DE MURCIA',
    '31':'NAVARRA','01':'PAÍS VASCO','20':'PAÍS VASCO','48':'PAÍS VASCO',
};

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

const CCAA_LIST = Object.values(PROV_CCAA).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'es'));

// Obtener código de provincia a partir del nombre
function getProvCodByNombre(nombre) {
    if (!nombre) return '';
    const norm = normalize(nombre);
    return Object.entries(PROV_NOMBRE).find(([, n]) => normalize(n) === norm)?.[0] || '';
}

// ─── Sub-componentes ────────────────────────────────────────────────────────
function FieldView({ label, value, valueClassName = '' }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-0.5">{label}</p>
            <p className={`text-sm text-white font-medium ${valueClassName}`}>{value}</p>
        </div>
    );
}

function FieldInput({ label, required, children }) {
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

function SelectEl({ className = '', children, ...props }) {
    return (
        <select
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${className}`}
            {...props}
        >
            {children}
        </select>
    );
}

// ─── Sección dirección editable ─────────────────────────────────────────────
function DireccionEdit({ values, onChange }) {
    const [provincias, setProvincias] = useState([]);
    const [municipios, setMunicipios] = useState([]);
    const [loadingProv, setLoadingProv] = useState(false);
    const [loadingMuni, setLoadingMuni] = useState(false);

    // 1. Normalizar CCAA al cargar (viniendo de DB puede ser uppercase)
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

    // 4. Derivar ccaa del código postal si no viene del cliente
    useEffect(() => {
        if (!values.ccaa && values.codigo_postal && values.codigo_postal.length >= 2) {
            const cpProvCode = values.codigo_postal.substring(0, 2);
            const provNombre = PROV_NOMBRE[cpProvCode];
            const ccaaName = PROV_CCAA[cpProvCode];
            if (provNombre && ccaaName) {
                const matchedCCAA = CCAA_LIST.find(c => normalize(c) === normalize(ccaaName)) || ccaaName;
                onChange({ ccaa: matchedCCAA, provincia: provNombre, provincia_cod: cpProvCode });
            }
        }
    }, []);

    // 5. Cargar provincias cuando cambia CCAA
    useEffect(() => {
        if (!values.ccaa) { setProvincias([]); setMunicipios([]); return; }
        setLoadingProv(true);
        axios.get('/api/geo/provincias', { params: { ccaa: values.ccaa } })
            .then(r => setProvincias(r.data))
            .catch(() => setProvincias([]))
            .finally(() => setLoadingProv(false));
    }, [values.ccaa]);

    // 6. Cargar municipios cuando cambia provincia_cod
    useEffect(() => {
        if (!values.provincia_cod) { setMunicipios([]); return; }
        setLoadingMuni(true);
        axios.get('/api/geo/municipios', { params: { codprov: values.provincia_cod } })
            .then(r => setMunicipios(r.data))
            .catch(() => setMunicipios([]))
            .finally(() => setLoadingMuni(false));
    }, [values.provincia_cod]);

    // 7. Si ya tenemos provincia (del cliente existente) y no hay código, derivarlo
    useEffect(() => {
        if (!values.provincia_cod && values.provincia) {
            const cod = getProvCodByNombre(values.provincia);
            if (cod) {
                const ccaa = values.ccaa || PROV_CCAA[cod] || '';
                onChange({ provincia_cod: cod, ccaa });
            }
        }
    }, [values.provincia]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldInput label="CCAA">
                <SelectEl value={values.ccaa || ''} onChange={e => onChange({ ccaa: e.target.value, provincia: '', provincia_cod: '', municipio: '' })}>
                    <option value="">— Selecciona CCAA —</option>
                    {CCAA_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Provincia">
                <SelectEl value={values.provincia_cod || ''} disabled={!values.ccaa || loadingProv}
                    onChange={e => { const opt = e.target.options[e.target.selectedIndex]; onChange({ provincia: opt.text, provincia_cod: opt.value, municipio: '' }); }}>
                    <option value="">{loadingProv ? 'Cargando...' : '— Selecciona provincia —'}</option>
                    {provincias.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Municipio">
                <SelectEl value={values.municipio || ''} disabled={!values.provincia_cod || loadingMuni}
                    onChange={e => onChange({ municipio: e.target.value })}>
                    <option value="">{loadingMuni ? 'Cargando...' : '— Selecciona municipio —'}</option>
                    {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Código Postal">
                <Input placeholder="28001" value={values.codigo_postal || ''} maxLength={5}
                    onChange={e => onChange({ codigo_postal: e.target.value })} />
            </FieldInput>
            <div className="sm:col-span-2">
                <FieldInput label="Dirección">
                    <Input placeholder="CALLE, NÚMERO, PISO..." uppercase value={values.direccion || ''}
                        onChange={e => onChange({ direccion: e.target.value })} />
                </FieldInput>
            </div>
        </div>
    );
}

// ─── Modal principal ────────────────────────────────────────────────────────
export function ClienteDetailModal({ isOpen, onClose, cliente: clienteProp, clienteId, onUpdated, onOpenOportunidad, onOpenExpediente }) {
    const { user } = useAuth();
    const userRole = (user?.rol || '').toUpperCase();
    const userRoleId = user?.id_rol ? Number(user.id_rol) : null;
    const isAdmin = userRole === 'ADMIN' || userRoleId === 1;
    const isCertificador = userRole === 'CERTIFICADOR' || userRoleId === 4;

    const [cliente, setCliente] = useState(null);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [prescriptores, setPrescriptores] = useState([]);
    const [loadingPrescriptores, setLoadingPrescriptores] = useState(false);
    const [prescriptoresError, setPrescriptoresError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    const [showNotas, setShowNotas] = useState(false);

    const filteredPrescriptores = prescriptores.filter(p => {
        return normalize(p.acronimo || p.razon_social).includes(normalize(searchTerm));
    });
    const selectedPrescriptor = prescriptores.find(p => p.id_empresa === form.prescriptor_id);

    // Cargar cliente completo siempre que se abra
    useEffect(() => {
        if (!isOpen) return;
        setEditing(false);
        setError(null);
        setSaved(false);
        setSearchTerm('');
        setIsDropdownOpen(false);
        const id = clienteId || clienteProp?.id_cliente;
        if (!id) return;
        setFetching(true);
        axios.get(`/api/clientes/${id}`)
            .then(r => setCliente(r.data))
            .catch(() => {
                if (clienteProp) setCliente(clienteProp);
                else setError('No se pudo cargar el cliente');
            })
            .finally(() => setFetching(false));
    }, [isOpen, clienteProp?.id_cliente, clienteId]);

    // Admin: prescriptores
    useEffect(() => {
        if (!isOpen || !isAdmin) return;
        setLoadingPrescriptores(true);
        setPrescriptoresError(null);
        axios.get('/api/prescriptores')
            .then(r => {
                if (Array.isArray(r.data)) setPrescriptores(r.data);
                else setPrescriptores([]);
            })
            .catch(() => {
                setPrescriptoresError('Error al cargar partners');
                setPrescriptores([]);
            })
            .finally(() => setLoadingPrescriptores(false));
    }, [isOpen, isAdmin]);

    // Inicializar formulario de edición
    useEffect(() => {
        if (!cliente) return;
        const cod = getProvCodByNombre(cliente.provincia || '');
        setForm({
            nombre_razon_social: cliente.nombre_razon_social || '',
            apellidos: cliente.apellidos || '',
            email: cliente.email || '',
            tlf: cliente.tlf || '',
            dni: cliente.dni || '',
            numero_cuenta: cliente.numero_cuenta || '',
            ccaa: (cliente.ccaa || '').toUpperCase(),
            provincia: (cliente.provincia || '').toUpperCase(),
            provincia_cod: cod,
            municipio: (cliente.municipio || '').toUpperCase(),
            direccion: cliente.direccion || '',
            codigo_postal: cliente.codigo_postal || '',

            prescriptor_id: cliente.prescriptor_id || '',
            persona_contacto_nombre: cliente.persona_contacto_nombre || '',
            persona_contacto_tlf: cliente.persona_contacto_tlf || '',
            persona_contacto_email: cliente.persona_contacto_email || '',
            notificaciones_contacto_activas: !!cliente.notificaciones_contacto_activas,
            notas: cliente.notas || '',
        });
        setShowNotas(!!cliente.notas);
    }, [cliente]);

    const updateForm = useCallback((patch) => setForm(f => ({ ...f, ...patch })), []);

    const handleSave = async () => {
        setError(null);
        setLoading(true);
        try {
            const payload = {
                nombre_razon_social: form.nombre_razon_social.trim(),
                apellidos: form.apellidos.trim() || null,
                email: form.email.trim() || null,
                tlf: form.tlf.trim() || null,
                dni: form.dni.trim() || null,
                ccaa: form.ccaa || null,
                provincia: form.provincia || null,
                municipio: form.municipio || null,
                direccion: form.direccion.trim() || null,
                codigo_postal: form.codigo_postal.trim() || null,
                numero_cuenta: form.numero_cuenta.trim() || null,
                ...(isAdmin ? { prescriptor_id: form.prescriptor_id || null } : {}),
                persona_contacto_nombre: form.persona_contacto_nombre?.trim() || null,
                persona_contacto_tlf: form.persona_contacto_tlf?.trim() || null,
                persona_contacto_email: form.persona_contacto_email?.trim() || null,
                notificaciones_contacto_activas: form.notificaciones_contacto_activas || false,
                notas: form.notas?.trim() || null,
            };
            const res = await axios.put(`/api/clientes/${cliente.id_cliente}`, payload);
            setCliente(res.data);
            setEditing(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
            if (onUpdated) onUpdated(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al guardar cambios');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand/20 to-brand/5 border border-brand/20 flex items-center justify-center">
                            <span className="text-brand font-black text-sm">
                                {(cliente?.nombre_razon_social || '?').charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div>
                            <h2 className="text-base font-black text-white uppercase tracking-widest">
                                {cliente?.nombre_razon_social}{cliente?.apellidos ? ` ${cliente.apellidos}` : ''}
                            </h2>
                            {cliente?.dni && <p className="text-xs text-white/30 font-mono">{cliente.dni}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {saved && (
                            <span className="text-xs text-emerald-400 font-black uppercase tracking-widest animate-fade-in">
                                ✓ Guardado
                            </span>
                        )}
                        {!editing && !isCertificador && (
                            <button onClick={() => setEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest hover:bg-brand/20 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Editar
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {fetching && (
                        <div className="flex items-center justify-center py-16 text-white/30">
                            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Cargando...
                        </div>
                    )}

                    {error && !fetching && (
                        <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-white font-black uppercase tracking-widest mb-1">Error de acceso</h3>
                                <p className="text-sm text-white/40">{error}</p>
                            </div>
                            <button 
                                onClick={onClose}
                                className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all text-sm font-bold"
                            >
                                Cerrar ventana
                            </button>
                        </div>
                    )}

                    {!fetching && cliente && !editing && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Datos personales</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4 [&_p.text-sm]:uppercase">
                                    <FieldView label="Nombre / Razón Social" value={`${cliente.nombre_razon_social || ''}${cliente.apellidos ? ` ${cliente.apellidos}` : ''}`} />
                                    <FieldView label="DNI / CIF" value={cliente.dni} />
                                    <FieldView label="Email" value={cliente.email?.toLowerCase()} valueClassName="!lowercase" />
                                    <FieldView label="Teléfono" value={cliente.tlf} />
                                    {cliente.numero_cuenta && isAdmin && <FieldView label="Cuenta (IBAN)" value={cliente.numero_cuenta} />}
                                    {cliente.prescriptores?.acronimo && <FieldView label="Prescriptor" value={cliente.prescriptores.acronimo || cliente.prescriptores.razon_social} />}
                                    {cliente.persona_contacto_nombre && <FieldView label="Contacto" value={cliente.persona_contacto_nombre} />}
                                    {cliente.persona_contacto_email && <FieldView label="Email Contacto" value={cliente.persona_contacto_email?.toLowerCase()} valueClassName="!lowercase" />}
                                    {cliente.persona_contacto_tlf && (
                                        <div>
                                            <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-0.5">Tlf. Contacto</p>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm text-white font-medium">{cliente.persona_contacto_tlf}</p>
                                                {cliente.notificaciones_contacto_activas && (
                                                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">Notif. aquí</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {(cliente.ccaa || cliente.provincia || cliente.municipio || cliente.direccion) && (
                                <div className="space-y-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Dirección</p>
                                    <div className="p-4 bg-bkg-surface rounded-xl border border-white/[0.06] grid grid-cols-2 gap-x-6 gap-y-3 [&_p.text-sm]:uppercase">
                                        <FieldView label="CCAA" value={cliente.ccaa} />
                                        <FieldView label="Provincia" value={cliente.provincia} />
                                        <FieldView label="Municipio" value={cliente.municipio} />
                                        <FieldView label="CP" value={cliente.codigo_postal} />
                                        {cliente.direccion && (
                                            <div className="col-span-2">
                                                <FieldView label="Dirección" value={cliente.direccion} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {cliente.notas && (
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Notas</p>
                                    <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/10">
                                        <p className="text-sm text-amber-200/80 leading-relaxed font-medium">
                                            {cliente.notas}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Oportunidades y Expedientes vinculados */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {!isCertificador && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Oportunidades</p>
                                        {cliente.oportunidades_vinculadas?.length > 0 ? (
                                            cliente.oportunidades_vinculadas.map(op => (
                                                <div key={op.id_oportunidad}
                                                    onClick={() => onOpenOportunidad ? (onClose(), onOpenOportunidad(op)) : undefined}
                                                    className={`flex items-center justify-between p-3 bg-bkg-surface rounded-xl border border-white/[0.06] transition-all hover:scale-[1.02] active:scale-[0.98] ${onOpenOportunidad ? 'cursor-pointer hover:border-brand/30 hover:bg-brand/5' : ''}`}>
                                                    <div>
                                                        <span className="text-xs font-mono font-black text-brand">{op.id_oportunidad}</span>
                                                        <p className="text-[10px] text-white/40 truncate max-w-[120px]">
                                                            {op.referencia_cliente || 'Sin ref.'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-[9px] font-black uppercase tracking-tight text-white/30 block mb-0.5">
                                                            {op.datos_calculo?.estado || 'PENDIENTE'}
                                                        </span>
                                                        <span className="text-[9px] text-white/20">
                                                            {new Date(op.created_at).toLocaleDateString('es-ES')}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-[10px] text-white/20 font-bold uppercase py-2">Sin oportunidades</p>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Expedientes</p>
                                    {cliente.expedientes_vinculados?.length > 0 ? (
                                        cliente.expedientes_vinculados.map(exp => (
                                            <div key={exp.id}
                                                onClick={() => onOpenExpediente ? (onClose(), onOpenExpediente(exp)) : undefined}
                                                className={`flex items-center justify-between p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] ${onOpenExpediente ? 'cursor-pointer hover:border-amber-500/30 hover:bg-amber-500/10' : ''}`}>
                                                <div>
                                                    <span className="text-xs font-mono font-black text-amber-500">{exp.numero_expediente}</span>
                                                    <p className="text-[10px] text-amber-500/40 uppercase tracking-widest font-bold">
                                                        Expediente
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[9px] font-black uppercase tracking-tight text-amber-500/40 block mb-0.5">
                                                        ACTIVO
                                                    </span>
                                                    <span className="text-[9px] text-amber-500/20">
                                                        {new Date(exp.created_at).toLocaleDateString('es-ES')}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[10px] text-white/20 font-bold uppercase py-2">Sin expedientes</p>
                                    )}
                                </div>
                            </div>

                            <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest pt-2 border-t border-white/[0.04]">
                                Alta: {new Date(cliente.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                        </div>
                    )}

                    {!fetching && cliente && editing && (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Datos personales</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FieldInput label="Nombre / Razón Social" required>
                                        <Input value={form.nombre_razon_social} required uppercase
                                            onChange={e => updateForm({ nombre_razon_social: e.target.value })} />
                                    </FieldInput>
                                    <FieldInput label="Apellidos">
                                        <Input value={form.apellidos} uppercase onChange={e => updateForm({ apellidos: e.target.value })} />
                                    </FieldInput>
                                    <FieldInput label="DNI / CIF">
                                        <Input value={form.dni} uppercase onChange={e => updateForm({ dni: e.target.value })} />
                                    </FieldInput>
                                    <FieldInput label="Email">
                                        <Input type="email" value={form.email} onChange={e => updateForm({ email: e.target.value.toLowerCase() })} />
                                    </FieldInput>
                                    <FieldInput label="Teléfono">
                                        <Input value={form.tlf} onChange={e => updateForm({ tlf: e.target.value })} />
                                    </FieldInput>
                                    {isAdmin && (
                                        <FieldInput label="Número de Cuenta (IBAN)">
                                            <Input value={form.numero_cuenta} uppercase onChange={e => updateForm({ numero_cuenta: e.target.value })} />
                                        </FieldInput>
                                    )}
                                    <div className="sm:col-span-2 pt-2">
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
                                                ¿Añadir/editar notas sobre el cliente?
                                            </span>
                                        </label>
                                    </div>

                                    {showNotas && (
                                        <div className="sm:col-span-2 animate-fade-in">
                                            <FieldInput label="Notas / Observaciones">
                                                <textarea
                                                    placeholder="Escribe aquí cualquier detalle relevante..."
                                                    className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all min-h-[100px] resize-none"
                                                    value={form.notas || ''}
                                                    onChange={e => updateForm({ notas: e.target.value })}
                                                />
                                            </FieldInput>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-4">
                                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={!!(form.persona_contacto_nombre || form.persona_contacto_tlf || form.persona_contacto_email || form.showContact)}
                                                onChange={e => updateForm({ showContact: e.target.checked })}
                                            />
                                            <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
                                            ¿Persona de contacto distinta al titular?
                                        </span>
                                    </label>

                                    {(form.showContact || form.persona_contacto_nombre || form.persona_contacto_tlf || form.persona_contacto_email) && (
                                        <div className="space-y-3 animate-fade-in p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <FieldInput label="Nombre de Contacto">
                                                    <Input
                                                        placeholder="P. EJ. MARÍA (HIJA)"
                                                        uppercase
                                                        value={form.persona_contacto_nombre || ''}
                                                        onChange={e => updateForm({ persona_contacto_nombre: e.target.value })}
                                                    />
                                                </FieldInput>
                                                <FieldInput label="Teléfono de Contacto">
                                                    <Input
                                                        placeholder="600 000 000"
                                                        value={form.persona_contacto_tlf || ''}
                                                        onChange={e => updateForm({ persona_contacto_tlf: e.target.value })}
                                                    />
                                                </FieldInput>
                                                <div className="sm:col-span-2">
                                                    <FieldInput label="Email de Contacto">
                                                        <Input
                                                            type="email"
                                                            placeholder="contacto@email.com"
                                                            value={form.persona_contacto_email || ''}
                                                            onChange={e => updateForm({ persona_contacto_email: e.target.value.toLowerCase() })}
                                                        />
                                                    </FieldInput>
                                                </div>
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

                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Dirección</p>
                                <DireccionEdit values={form} onChange={updateForm} />
                            </div>

                            {isAdmin && (
                                <div className="space-y-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Prescriptor / Partner</p>
                                    <FieldInput label="Asignar a prescriptor">
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
                                                                 className="w-full bg-bkg-deep/50 border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand/50 transition-all font-sans normal-case"
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
                                     </FieldInput>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setEditing(false); setError(null); }}
                                    className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white font-bold text-sm transition-all">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleSave} disabled={loading || !form.nombre_razon_social.trim()}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-wider shadow-lg shadow-brand/20 transition-all disabled:opacity-50">
                                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
