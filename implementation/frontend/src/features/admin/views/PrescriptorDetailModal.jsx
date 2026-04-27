// PrescriptorDetailModal — Patrón idéntico a ClienteDetailModal
// Vista de datos + toggle de edición en línea, con toggle de acceso al portal
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';

// ─── Helpers ────────────────────────────────────────────────────────────────
function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const PROV_NOMBRE = {
    '01':'Álava','02':'Albacete','03':'Alicante','04':'Almería','05':'Ávila',
    '06':'Badajoz','07':'Baleares','08':'Barcelona','09':'Burgos','10':'Cáceres',
    '11':'Cádiz','12':'Castellón','13':'Ciudad Real','14':'Córdoba','15':'A Coruña',
    '16':'Cuenca','17':'Girona','18':'Granada','19':'Guadalajara','20':'Guipúzcoa',
    '21':'Huelva','22':'Huesca','23':'Jaén','24':'León','25':'Lleida',
    '26':'La Rioja','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia',
    '31':'Navarra','32':'Ourense','33':'Asturias','34':'Palencia','35':'Las Palmas',
    '36':'Pontevedra','37':'Salamanca','38':'S.C. de Tenerife','39':'Cantabria',
    '40':'Segovia','41':'Sevilla','42':'Soria','43':'Tarragona','44':'Teruel',
    '45':'Toledo','46':'Valencia','47':'Valladolid','48':'Vizcaya','49':'Zamora',
    '50':'Zaragoza','51':'Ceuta','52':'Melilla',
};
const PROV_CCAA = {
    '04':'Andalucía','11':'Andalucía','14':'Andalucía','18':'Andalucía',
    '21':'Andalucía','23':'Andalucía','29':'Andalucía','41':'Andalucía',
    '22':'Aragón','44':'Aragón','50':'Aragón','33':'Asturias',
    '07':'Islas Baleares','35':'Canarias','38':'Canarias','39':'Cantabria',
    '02':'Castilla-La Mancha','13':'Castilla-La Mancha','16':'Castilla-La Mancha',
    '19':'Castilla-La Mancha','45':'Castilla-La Mancha',
    '05':'Castilla y León','09':'Castilla y León','24':'Castilla y León',
    '34':'Castilla y León','37':'Castilla y León','40':'Castilla y León',
    '42':'Castilla y León','47':'Castilla y León','49':'Castilla y León',
    '08':'Cataluña','17':'Cataluña','25':'Cataluña','43':'Cataluña','51':'Ceuta',
    '03':'Comunidad Valenciana','12':'Comunidad Valenciana','46':'Comunidad Valenciana',
    '06':'Extremadura','10':'Extremadura',
    '15':'Galicia','27':'Galicia','32':'Galicia','36':'Galicia','26':'La Rioja',
    '28':'Comunidad de Madrid','52':'Melilla','30':'Región de Murcia','31':'Navarra',
    '01':'País Vasco','20':'País Vasco','48':'País Vasco',
};
const CCAA_LIST = [
    'Andalucía','Aragón','Asturias','Islas Baleares','Canarias','Cantabria',
    'Castilla-La Mancha','Castilla y León','Cataluña','Ceuta','Comunidad Valenciana',
    'Extremadura','Galicia','La Rioja','Comunidad de Madrid','Melilla',
    'Región de Murcia','Navarra','País Vasco',
].sort((a, b) => a.localeCompare(b, 'es'));

function getProvCodByNombre(nombre) {
    const n = normalize(nombre);
    return Object.entries(PROV_NOMBRE).find(([, v]) => normalize(v) === n)?.[0] || '';
}

const TIPO_BADGE = {
    DISTRIBUIDOR: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    INSTALADOR:   'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    CERTIFICADOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    OTRO:         'bg-white/5 text-white/40 border-white/10',
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────
function FV({ label, value, mono = false, lower = false }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-0.5">{label}</p>
            <p className={`text-sm text-white font-medium ${mono ? 'font-mono' : ''} ${lower ? 'lowercase' : 'uppercase'}`}>{value}</p>
        </div>
    );
}

function FI({ label, required, children }) {
    return (
        <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1.5">
                {label}{required && <span className="text-brand ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

function Inp({ className = '', uppercase = false, onChange, ...props }) {
    const h = uppercase && onChange
        ? (e) => { e.target.value = e.target.value.toUpperCase(); onChange(e); }
        : onChange;
    return (
        <input
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${uppercase ? 'uppercase' : ''} ${className}`}
            onChange={h}
            {...props}
        />
    );
}

function Sel({ children, ...props }) {
    return (
        <select
            className="w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all"
            {...props}
        >
            {children}
        </select>
    );
}

// ─── Sección dirección editable ──────────────────────────────────────────────
function DireccionEdit({ values, onChange }) {
    const [provincias, setProvincias] = useState([]);
    const [municipios, setMunicipios] = useState([]);

    useEffect(() => {
        if (!values.ccaa) { setProvincias([]); setMunicipios([]); return; }
        axios.get('/api/geo/provincias', { params: { ccaa: values.ccaa } })
            .then(r => setProvincias(r.data)).catch(() => setProvincias([]));
    }, [values.ccaa]);

    useEffect(() => {
        if (!values.provincia_cod) { setMunicipios([]); return; }
        axios.get('/api/geo/municipios', { params: { codprov: values.provincia_cod } })
            .then(r => setMunicipios(r.data)).catch(() => setMunicipios([]));
    }, [values.provincia_cod]);

    useEffect(() => {
        if (!values.provincia_cod && values.provincia) {
            const cod = getProvCodByNombre(values.provincia);
            if (cod) onChange({ provincia_cod: cod });
        }
    }, [values.provincia]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FI label="CCAA">
                <Sel value={values.ccaa || ''} onChange={e => onChange({ ccaa: e.target.value, provincia: '', provincia_cod: '', municipio: '' })}>
                    <option value="">— Selecciona CCAA —</option>
                    {CCAA_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </Sel>
            </FI>
            <FI label="Provincia">
                <Sel value={values.provincia_cod || ''} disabled={!values.ccaa}
                    onChange={e => { const o = e.target.options[e.target.selectedIndex]; onChange({ provincia: o.text, provincia_cod: o.value, municipio: '' }); }}>
                    <option value="">— Selecciona provincia —</option>
                    {provincias.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
                </Sel>
            </FI>
            <FI label="Municipio">
                <Sel value={values.municipio || ''} disabled={!values.provincia_cod}
                    onChange={e => onChange({ municipio: e.target.value })}>
                    <option value="">— Selecciona municipio —</option>
                    {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </Sel>
            </FI>
            <FI label="Código Postal">
                <Inp placeholder="13700" value={values.codigo_postal || ''} maxLength={5}
                    onChange={e => onChange({ codigo_postal: e.target.value })} />
            </FI>
            <div className="sm:col-span-2">
                <FI label="Dirección">
                    <Inp placeholder="CALLE EJEMPLO, 1" uppercase value={values.direccion || ''}
                        onChange={e => onChange({ direccion: e.target.value })} />
                </FI>
            </div>
        </div>
    );
}

// ─── Modal principal ─────────────────────────────────────────────────────────
export function PrescriptorDetailModal({ isOpen, onClose, prescriptor: prescProp, onUpdated, onCreated }) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    // isCreating = abrimos el modal con {} (sin id_empresa)
    const isCreating = isOpen && !prescProp?.id_empresa;

    const [p, setP] = useState(null);
    const [editing, setEditing] = useState(false);
    const emptyForm = {
        razon_social: '', acronimo: '', cif: '', email: '', tlf: '',
        tipo_empresa: 'DISTRIBUIDOR', marca_referencia: '', marca_secundaria: '',
        tiene_carnet_rite: false, numero_carnet_rite: '', cargo: '',
        nombre_responsable: '', apellidos_responsable: '',
        ccaa: '', provincia: '', provincia_cod: '', municipio: '',
        codigo_postal: '', direccion: '', es_autonomo: false, logo_empresa: '',
        marcas_aerotermia: [],
        instaladores_asociados: [],
        usuario_password: '', usuario_confirm_password: '',
        contacto_alternativo_activo: false,
        nombre_contacto: '',
        tlf_contacto: '',
        email_contacto: '',
        contacto_notificaciones_activas: false,
    };
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [offerAssocData, setOfferAssocData] = useState(null);
    const [togglingAcceso, setTogglingAcceso] = useState(false);
    const [marcas, setMarcas] = useState([]);
    const [allInstaladores, setAllInstaladores] = useState([]);
    const [loadingInst, setLoadingInst] = useState(false);
    const logoInputRef = useRef(null);

    // Cargar marcas disponibles
    useEffect(() => {
        if (!isOpen) return;
        axios.get('/api/aerotermia/marcas')
            .then(r => setMarcas(r.data))
            .catch(err => console.error('Error cargando marcas:', err));
    }, [isOpen]);

    // Cargar todos los instaladores disponibles
    useEffect(() => {
        if (!isOpen || !isAdmin) return;
        setLoadingInst(true);
        axios.get('/api/prescriptores')
            .then(r => {
                setAllInstaladores(r.data.filter(x => x.tipo_empresa === 'INSTALADOR'));
            })
            .catch(err => console.error('Error cargando instaladores:', err))
            .finally(() => setLoadingInst(false));
    }, [isOpen, isAdmin]);

    // Cargar asociaciones actuales para distribuidores
    useEffect(() => {
        if (!isOpen || !p || p.tipo_empresa !== 'DISTRIBUIDOR') return;
        axios.get(`/api/prescriptores/${p.id_empresa}/instaladores`)
            .then(r => {
                upd({ instaladores_asociados: r.data.map(i => i.id_empresa) });
            })
            .catch(err => console.error('Error cargando asociaciones:', err));
    }, [isOpen, p?.id_empresa]);

    // Sincronizar al abrir
    useEffect(() => {
        if (!isOpen) return;
        setError(null);
        setSaved(false);
        setOfferAssocData(null);
        if (!prescProp?.id_empresa) {
            // Nuevo partner: abrir directamente en modo edición con form vacío
            setP(null);
            setEditing(true);
            setForm({
                ...emptyForm,
                tipo_empresa: isAdmin ? 'DISTRIBUIDOR' : 'INSTALADOR'
            });
        } else {
            setEditing(false);
            setP(prescProp);
        }
    }, [isOpen, prescProp?.id_empresa]);

    // Inicializar form al abrir en modo edición o al cambiar prescriptor
    useEffect(() => {
        if (!p) return;
        const cod = getProvCodByNombre(p.provincia || '');
        setForm({
            razon_social:         p.razon_social || '',
            acronimo:             p.acronimo || '',
            cif:                  p.cif || '',
            email:                p.email || p.usuarios?.email || '',
            tlf:                  p.tlf || p.usuarios?.tlf || '',
            tipo_empresa:         p.tipo_empresa || 'INSTALADOR',
            marca_referencia:     p.marca_referencia || '',
            marca_secundaria:     p.marca_secundaria || '',
            tiene_carnet_rite:    p.tiene_carnet_rite || false,
            numero_carnet_rite:   p.numero_carnet_rite || '',
            cargo:                p.cargo || '',
            nombre_responsable:   p.nombre_responsable || p.usuarios?.nombre || '',
            apellidos_responsable:p.apellidos_responsable || p.usuarios?.apellidos || '',
            ccaa:                 p.ccaa || '',
            provincia:            p.provincia || '',
            provincia_cod:        cod,
            municipio:            p.municipio || '',
            codigo_postal:        p.codigo_postal || '',
            direccion:            p.direccion || '',
            es_autonomo:          p.es_autonomo || false,
            logo_empresa:         p.logo_empresa || '',
            // Convertimos la cadena de marcas en un array para el multi-select
            marcas_aerotermia:    p.marca_referencia ? p.marca_referencia.split(',').map(m => m.trim().toUpperCase()) : [],
            instaladores_asociados: [], // Se cargará por el useEffect específico
            usuario_password:     '',
            usuario_confirm_password: '',
            contacto_alternativo_activo: p.contacto_alternativo_activo || false,
            nombre_contacto:      p.nombre_contacto || '',
            tlf_contacto:         p.tlf_contacto || '',
            email_contacto:       p.email_contacto || '',
            contacto_notificaciones_activas: p.contacto_notificaciones_activas || false,
        });
    }, [p]);

    const upd = useCallback((patch) => setForm(f => ({ ...f, ...patch })), []);

    // ─── Logo upload ─────────────────────────────────────────────────────────
    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => upd({ logo_empresa: reader.result });
        reader.readAsDataURL(file);
    };

    // ─── Guardar edición ──────────────────────────────────────────────────────
    const handleSave = async () => {
        setError(null);
        // Validar contraseña si se ha introducido
        if (form.usuario_password) {
            if (form.usuario_password.length < 6) {
                setError('La contraseña debe tener al menos 6 caracteres.');
                setLoading(false);
                return;
            }
            if (form.usuario_password !== form.usuario_confirm_password) {
                setError('Las contraseñas no coinciden.');
                setLoading(false);
                return;
            }
        }

        // Validación de campos obligatorios
        if (!form.cif?.trim()) {
            setError('El CIF/NIF es obligatorio.');
            setLoading(false);
            return;
        }
        if (form.es_autonomo) {
            if (!form.nombre_responsable?.trim()) {
                setError('El nombre del profesional es obligatorio.');
                setLoading(false);
                return;
            }
        } else {
            if (!form.razon_social?.trim()) {
                setError('La razón social es obligatoria.');
                setLoading(false);
                return;
            }
        }
        setLoading(true);
        try {
            // Para autónomos: razon_social = "Nombre Apellidos" si no hay razón social explícita
            const razonSocial = form.es_autonomo
                ? (form.razon_social.trim() || [form.nombre_responsable, form.apellidos_responsable].filter(Boolean).join(' ') || null)
                : (form.razon_social.trim() || null);

            const basePayload = {
                razon_social:          razonSocial,
                acronimo:              form.acronimo.trim() || null,
                cif:                   form.cif.trim().toUpperCase() || null,
                email:                 form.email.trim().toLowerCase() || null,
                tlf:                   form.tlf.trim() || null,
                tipo_empresa:          form.tipo_empresa,
                marca_referencia:      form.marcas_aerotermia?.length > 0 ? form.marcas_aerotermia.join(',') : null,
                marca_secundaria:      null,
                tiene_carnet_rite:     form.tiene_carnet_rite,
                numero_carnet_rite:    form.numero_carnet_rite.trim() || null,
                cargo:                 form.cargo.trim() || null,
                nombre_responsable:    form.nombre_responsable.trim() || null,
                apellidos_responsable: form.apellidos_responsable.trim() || null,
                ccaa:                  form.ccaa || null,
                provincia:             form.provincia || null,
                municipio:             form.municipio || null,
                codigo_postal:         form.codigo_postal.trim() || null,
                direccion:             form.direccion.trim() || null,
                es_autonomo:           form.es_autonomo,
                logo_empresa:          form.logo_empresa || null,
                instaladores_asociados: form.tipo_empresa === 'DISTRIBUIDOR' ? form.instaladores_asociados : [],
                contacto_alternativo_activo: form.contacto_alternativo_activo,
                nombre_contacto:      form.nombre_contacto.trim() || null,
                tlf_contacto:         form.tlf_contacto.trim() || null,
                email_contacto:       form.email_contacto.trim().toLowerCase() || null,
                contacto_notificaciones_activas: form.contacto_notificaciones_activas,

                // Campos para el backend (creación/actualización de usuario vinculado)
                usuario_nombre:    form.nombre_responsable.trim() || null,
                usuario_apellidos: form.apellidos_responsable.trim() || null,
                usuario_email:     form.email.trim().toLowerCase() || null,
                usuario_tlf:       form.tlf.trim() || null,
                usuario_nif:       form.cif.trim().toUpperCase() || null,
            };

            if (isCreating) {
                const res = await axios.post('/api/prescriptores/avanzado', basePayload);
                if (onCreated) onCreated(res.data.prescriptor || res.data);
                onClose();
            } else {
                const patchPayload = {
                    ...basePayload,
                    ...(form.usuario_password ? { usuario_password: form.usuario_password } : {}),
                };
                const res = await axios.patch(`/api/prescriptores/${p.id_empresa}`, patchPayload);
                const updated = { ...p, ...res.data,
                    nombre_responsable: form.nombre_responsable,
                    apellidos_responsable: form.apellidos_responsable,
                };
                setP(updated);
                setEditing(false);
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
                if (onUpdated) onUpdated(updated);
            }
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.code === 'OFFER_ASSOCIATION') {
                setOfferAssocData(err.response.data.existing);
            } else {
                setError(err.response?.data?.error || 'Error al guardar cambios');
            }
        } finally {
            setLoading(false);
        }
    };

    // ─── Confirmar asociación manual ──────────────────────────────────────────
    const handleConfirmAssociation = async () => {
        if (!offerAssocData) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.post('/api/prescriptores/asociar-mi-red', { 
                instalador_id: offerAssocData.id_empresa 
            });
            if (onCreated) onCreated(res.data.prescriptor || res.data);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Error al vincular instalador');
            setOfferAssocData(null);
        } finally {
            setLoading(false);
        }
    };

    // ─── Toggle acceso ────────────────────────────────────────────────────────
    const accesoActivo = p?.usuarios?.activo === true;

    const handleToggleAcceso = async (nuevoEstado) => {
        const email = p?.email || p?.usuarios?.email;
        if (nuevoEstado && !email) {
            setError('Este partner no tiene email. Añade un email y guarda antes de activar el acceso.');
            return;
        }
        setTogglingAcceso(true);
        setError(null);
        try {
            await axios.patch(`/api/prescriptores/${p.id_empresa}/acceso`, { activar: nuevoEstado });
            // Refrescar datos del prescriptor desde el servidor
            const refreshed = await axios.get('/api/prescriptores');
            const updated = refreshed.data.find(x => x.id_empresa === p.id_empresa);
            if (updated) { setP(updated); if (onUpdated) onUpdated(updated); }
            if (nuevoEstado) {
                setSaved(true);
                setTimeout(() => setSaved(false), 4000);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Error al gestionar el acceso');
        } finally {
            setTogglingAcceso(false);
        }
    };

    if (!isOpen) return null;
    if (!isCreating && !p) return null;

    const displayName = isCreating ? 'NUEVO PARTNER' : (p.acronimo || p.razon_social || '?');
    const contactName = isCreating ? null : ([p.nombre_responsable || p.usuarios?.nombre, p.apellidos_responsable || p.usuarios?.apellidos]
        .filter(Boolean).join(' ') || null);

    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                        {/* Logo — clickeable en modo edición */}
                        <div
                            onClick={editing ? () => logoInputRef.current?.click() : undefined}
                            title={editing ? 'Cambiar logotipo' : undefined}
                            className={`w-14 h-14 rounded-xl border overflow-hidden shrink-0 relative group ${editing ? 'cursor-pointer border-brand/40' : 'border-white/10'}`}
                        >
                            {(editing ? form.logo_empresa : null) || (!isCreating && p?.logo_empresa) ? (
                                <img src={editing ? (form.logo_empresa || p?.logo_empresa) : p?.logo_empresa}
                                    alt="logo" className="w-full h-full object-contain p-1 bg-white/5" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 flex items-center justify-center">
                                    {isCreating ? (
                                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                    ) : (
                                        <span className="text-cyan-400 font-black text-sm">{displayName.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            )}
                            {editing && (
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-[8px] text-white font-black uppercase tracking-wider">Logo</span>
                                </div>
                            )}
                        </div>
                        {/* Input oculto para subir logo */}
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            onChange={handleLogoChange}
                            className="hidden"
                        />
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-black text-white uppercase tracking-wide">{displayName}</h2>
                                {!isCreating && (
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${TIPO_BADGE[p.tipo_empresa] || TIPO_BADGE.OTRO}`}>
                                        {p.tipo_empresa}
                                    </span>
                                )}
                            </div>
                            {!isCreating && p.cif && <p className="text-xs text-white/30 font-mono">{p.cif}</p>}
                            {isCreating && <p className="text-xs text-white/30">Sin acceso al portal hasta activar el toggle</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {saved && (
                            <span className="text-xs text-emerald-400 font-black uppercase tracking-widest animate-fade-in">
                                ✓ Guardado
                            </span>
                        )}

                        {/* Toggle acceso — en el header, solo ADMIN y solo para partners existentes */}
                        {isAdmin && !isCreating && (
                            <button
                                type="button"
                                onClick={() => handleToggleAcceso(!accesoActivo)}
                                disabled={togglingAcceso}
                                title={accesoActivo ? 'Revocar acceso al portal' : 'Dar acceso al portal'}
                                style={{ width: '44px', height: '24px' }}
                                className="relative shrink-0 rounded-full disabled:opacity-50 transition-all"
                            >
                                <div className={`w-full h-full rounded-full transition-all duration-300 ${accesoActivo ? 'bg-emerald-500' : 'bg-white/10 border border-white/10'}`}>
                                    <div className={`absolute top-[2px] bg-white rounded-full shadow transition-transform duration-300 ${accesoActivo ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
                                        style={{ width: '20px', height: '20px' }}></div>
                                </div>
                            </button>
                        )}

                        {!isCreating && !editing && isAdmin && (
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

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
                    )}

                    {/* ── VISTA ── */}
                    {!editing && p && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Datos de la Empresa</p>
                                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                    <FV label="Razón Social" value={p.razon_social} />
                                    <FV label="Acrónimo" value={p.acronimo} />
                                    <FV label="CIF / NIF" value={p.cif} mono />
                                    <FV label="Tipo" value={p.tipo_empresa} />
                                    <FV label="Email" value={p.email || p.usuarios?.email} lower />
                                    <FV label="Teléfono" value={p.tlf || p.usuarios?.tlf} />
                                    {isAdmin && (
                                        <>
                                            <FV label="Marca Principal" value={p.marca_referencia} />
                                            <FV label="Marca Secundaria" value={p.marca_secundaria} />
                                        </>
                                    )}

                                    {p.tipo_empresa === 'DISTRIBUIDOR' && form.instaladores_asociados?.length > 0 && (
                                        <div className="col-span-2">
                                            <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-1.5">Instaladores Asociados</p>
                                            <div className="flex flex-wrap gap-2">
                                                {form.instaladores_asociados.map(id => {
                                                    const inst = allInstaladores.find(x => x.id_empresa === id);
                                                    return (
                                                        <div key={id} className="flex items-center gap-2 bg-blue-500/5 border border-blue-500/10 rounded-lg px-2 py-1">
                                                            {inst?.logo_empresa && <img src={inst.logo_empresa} alt="" className="w-4 h-4 rounded object-contain bg-white/5" />}
                                                            <span className="text-[10px] font-bold text-blue-400/80 uppercase tracking-tight">
                                                                {inst?.acronimo || inst?.razon_social || '...'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {contactName && (
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Persona de Contacto</p>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="Nombre" value={contactName} />
                                        <FV label="Cargo" value={p.cargo} />
                                        {p.tiene_carnet_rite && <FV label="N.º Empresa RITE" value={p.numero_carnet_rite} mono />}
                                    </div>
                                </div>
                            )}

                            {/* Persona de Contacto Alternativa (Vista) */}
                            {p.contacto_alternativo_activo && (
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 flex items-center gap-2">
                                        Contacto para Notificaciones
                                        {p.contacto_notificaciones_activas && (
                                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase tracking-tighter">Activo</span>
                                        )}
                                    </p>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="Nombre Contacto" value={p.nombre_contacto} />
                                        <FV label="Teléfono" value={p.tlf_contacto} />
                                        <FV label="Email" value={p.email_contacto} lower />
                                    </div>
                                </div>
                            )}

                            {(p.ccaa || p.provincia || p.municipio || p.direccion) && (
                                <div className="space-y-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Dirección</p>
                                    <div className="p-4 bg-bkg-surface rounded-xl border border-white/[0.06] grid grid-cols-2 gap-x-6 gap-y-3">
                                        <FV label="CCAA" value={p.ccaa} />
                                        <FV label="Provincia" value={p.provincia} />
                                        <FV label="Municipio" value={p.municipio} />
                                        <FV label="CP" value={p.codigo_postal} mono />
                                        {p.direccion && <div className="col-span-2"><FV label="Dirección" value={p.direccion} /></div>}
                                    </div>
                                </div>
                            )}

                            <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest pt-2 border-t border-white/[0.04]">
                                Alta: {new Date(p.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                        </div>
                    )}

                    {/* ── EDICIÓN ── */}
                    {(editing || isCreating) && (
                        <div className="space-y-5">

                            {/* Toggle Autónomo / Empresa */}
                            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center">
                                <label className="flex items-center gap-4 cursor-pointer w-full">
                                    <div className="relative h-6 w-11 shrink-0">
                                        <input type="checkbox" checked={form.es_autonomo}
                                            onChange={e => upd({ es_autonomo: e.target.checked })}
                                            className="sr-only peer" />
                                        <div className="w-full h-full bg-white/10 border border-white/5 peer-focus:ring-2 peer-focus:ring-brand/50 rounded-full peer peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand shadow-inner"></div>
                                    </div>
                                    <div>
                                        <span className="font-black text-white text-xs uppercase tracking-wider block">Es Trabajador Autónomo</span>
                                        <span className="text-[10px] text-white/30 block mt-0.5">Marca esta opción si no actúas como empresa / sociedad</span>
                                    </div>
                                </label>
                            </div>

                            {/* Datos principales — cambian según autónomo/empresa */}
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">
                                    {form.es_autonomo ? 'Identidad del Profesional' : 'Información Mercantil'}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {form.es_autonomo ? (
                                        <>
                                            <FI label="Nombre" required>
                                                <Inp value={form.nombre_responsable} uppercase required
                                                    onChange={e => upd({ nombre_responsable: e.target.value })} />
                                            </FI>
                                            <FI label="Apellidos">
                                                <Inp value={form.apellidos_responsable} uppercase
                                                    onChange={e => upd({ apellidos_responsable: e.target.value })} />
                                            </FI>
                                            <FI label="NIF" required>
                                                <Inp value={form.cif} uppercase required onChange={e => upd({ cif: e.target.value })} />
                                            </FI>
                                            <FI label="Nombre Profesional / Acrónimo">
                                                <Inp value={form.acronimo} uppercase onChange={e => upd({ acronimo: e.target.value })} placeholder="NOMBRE COMERCIAL" />
                                            </FI>
                                        </>
                                    ) : (
                                        <>
                                            <div className="sm:col-span-2">
                                                <FI label="Razón Social" required>
                                                    <Inp value={form.razon_social} uppercase required
                                                        onChange={e => upd({ razon_social: e.target.value })} />
                                                </FI>
                                            </div>
                                            <FI label="Acrónimo">
                                                <Inp value={form.acronimo} uppercase onChange={e => upd({ acronimo: e.target.value })} />
                                            </FI>
                                            <FI label="CIF" required>
                                                <Inp value={form.cif} uppercase required onChange={e => upd({ cif: e.target.value })} />
                                            </FI>
                                        </>
                                    )}
                                    <FI label="Email">
                                        <Inp type="email" value={form.email} onChange={e => upd({ email: e.target.value.toLowerCase() })} />
                                    </FI>
                                    <FI label="Teléfono">
                                        <Inp value={form.tlf} onChange={e => upd({ tlf: e.target.value })} />
                                    </FI>
                                    {isAdmin ? (
                                        <FI label="Tipo / Rol">
                                            <Sel value={form.tipo_empresa} onChange={e => upd({ tipo_empresa: e.target.value })}>
                                                <option value="DISTRIBUIDOR">DISTRIBUIDOR</option>
                                                <option value="INSTALADOR">INSTALADOR</option>
                                                <option value="CERTIFICADOR">CERTIFICADOR</option>
                                                <option value="OTRO">OTRO</option>
                                            </Sel>
                                        </FI>
                                    ) : (
                                        <div className="hidden">
                                            <input type="hidden" value="INSTALADOR" />
                                        </div>
                                    )}
                                    
                                    {form.tipo_empresa === 'DISTRIBUIDOR' && (
                                        <div className="sm:col-span-2">
                                            <FI label="Instaladores Asociados (Multi-selección)">
                                                <div className="space-y-3">
                                                    {/* Lista de tags seleccionados */}
                                                    <div className="flex flex-wrap gap-2 min-h-[44px] p-2 bg-bkg-surface border border-white/[0.08] rounded-xl">
                                                        {form.instaladores_asociados?.length === 0 && (
                                                            <span className="text-white/20 text-xs italic px-2 py-1">Ningún instalador seleccionado</span>
                                                        )}
                                                        {form.instaladores_asociados?.map(id => {
                                                            const inst = allInstaladores.find(x => x.id_empresa === id);
                                                            return (
                                                                <div key={id} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2 py-1 pr-1.5 transition-all animate-scale-in">
                                                                    {inst?.logo_empresa && (
                                                                        <img src={inst.logo_empresa} alt="" className="w-4 h-4 rounded object-contain opacity-80 bg-white/10" />
                                                                    )}
                                                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-wider">
                                                                        {inst?.acronimo || inst?.razon_social || 'Desconocido'}
                                                                    </span>
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => upd({ instaladores_asociados: form.instaladores_asociados.filter(x => x !== id) })}
                                                                        className="ml-1 p-0.5 hover:bg-blue-500/20 rounded text-blue-400 transition-colors"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Selector de instaladores */}
                                                    <Sel 
                                                        value="" 
                                                        disabled={loadingInst}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val && !form.instaladores_asociados.includes(val)) {
                                                                upd({ instaladores_asociados: [...form.instaladores_asociados, val] });
                                                            }
                                                            e.target.value = ""; // Reset del selector
                                                        }}
                                                    >
                                                        <option value="">{loadingInst ? 'CARGANDO...' : '+ ASOCIAR INSTALADOR...'}</option>
                                                        {allInstaladores.filter(i => !form.instaladores_asociados.includes(i.id_empresa)).map(i => (
                                                            <option key={i.id_empresa} value={i.id_empresa}>
                                                                {i.acronimo || i.razon_social} ({i.cif || 'SIN CIF'})
                                                            </option>
                                                        ))}
                                                    </Sel>
                                                </div>
                                            </FI>
                                        </div>
                                    )}

                                    {isAdmin && (
                                        <div className="sm:col-span-2">
                                            <FI label="Marcas Aerotermia (Multi-selección)">
                                                <div className="space-y-3">
                                                    {/* Lista de tags seleccionados */}
                                                    <div className="flex flex-wrap gap-2 min-h-[44px] p-2 bg-bkg-surface border border-white/[0.08] rounded-xl">
                                                        {form.marcas_aerotermia?.length === 0 && (
                                                            <span className="text-white/20 text-xs italic px-2 py-1">Ninguna marca seleccionada</span>
                                                        )}
                                                        {form.marcas_aerotermia?.map(m => {
                                                            const marcaInfo = marcas.find(mi => mi.nombre === m);
                                                            return (
                                                                <div key={m} className="flex items-center gap-2 bg-brand/10 border border-brand/20 rounded-lg px-2 py-1 pr-1.5 transition-all animate-scale-in">
                                                                    {marcaInfo?.logo && (
                                                                        <img src={marcaInfo.logo} alt="" className="w-4 h-4 object-contain opacity-80" />
                                                                    )}
                                                                    <span className="text-[10px] font-black text-brand uppercase tracking-wider">{m}</span>
                                                                    <button 
                                                                        onClick={() => upd({ marcas_aerotermia: form.marcas_aerotermia.filter(x => x !== m) })}
                                                                        className="ml-1 p-0.5 hover:bg-brand/20 rounded text-brand transition-colors"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Selector de marcas */}
                                                    <Sel 
                                                        value="" 
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (val && !form.marcas_aerotermia.includes(val)) {
                                                                upd({ marcas_aerotermia: [...form.marcas_aerotermia, val] });
                                                            }
                                                            e.target.value = ""; // Reset del selector
                                                        }}
                                                    >
                                                        <option value="">+ AÑADIR MARCA...</option>
                                                        {marcas.filter(m => !form.marcas_aerotermia.includes(m.nombre)).map(m => (
                                                            <option key={m.nombre} value={m.nombre}>{m.nombre}</option>
                                                        ))}
                                                    </Sel>
                                                </div>
                                            </FI>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Persona de contacto — solo si es empresa */}
                            {!form.es_autonomo && (
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Persona de Contacto</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Nombre">
                                        <Inp value={form.nombre_responsable} uppercase onChange={e => upd({ nombre_responsable: e.target.value })} />
                                    </FI>
                                    <FI label="Apellidos">
                                        <Inp value={form.apellidos_responsable} uppercase onChange={e => upd({ apellidos_responsable: e.target.value })} />
                                    </FI>
                                    <FI label="Cargo">
                                        <Inp value={form.cargo} uppercase onChange={e => upd({ cargo: e.target.value })} placeholder="GERENTE / PROPIETARIO" />
                                    </FI>
                                    <FI label="N.º Empresa RITE">
                                        <Inp value={form.numero_carnet_rite} uppercase onChange={e => upd({ numero_carnet_rite: e.target.value })}
                                            disabled={!form.tiene_carnet_rite} placeholder="RITE-XXXXX" />
                                    </FI>
                                    <div className="sm:col-span-2 flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <div className="relative h-5 w-9 shrink-0">
                                                <input type="checkbox" checked={form.tiene_carnet_rite}
                                                    onChange={e => upd({ tiene_carnet_rite: e.target.checked })}
                                                    className="sr-only peer" />
                                                <div className="w-full h-full bg-white/10 border border-white/10 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Habilitada en Industria (RITE)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* RITE para autónomos */}
                            {form.es_autonomo && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Cargo / Especialidad">
                                        <Inp value={form.cargo} uppercase onChange={e => upd({ cargo: e.target.value })} placeholder="INSTALADOR / TÉCNICO" />
                                    </FI>
                                    <FI label="N.º Empresa RITE">
                                        <Inp value={form.numero_carnet_rite} uppercase onChange={e => upd({ numero_carnet_rite: e.target.value })}
                                            disabled={!form.tiene_carnet_rite} placeholder="RITE-XXXXX" />
                                    </FI>
                                    <div className="sm:col-span-2 flex items-center gap-3">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <div className="relative h-5 w-9 shrink-0">
                                                <input type="checkbox" checked={form.tiene_carnet_rite}
                                                    onChange={e => upd({ tiene_carnet_rite: e.target.checked })}
                                                    className="sr-only peer" />
                                                <div className="w-full h-full bg-white/10 border border-white/10 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Habilitada en Industria (RITE)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* --- SECCIÓN CONTACTO ALTERNATIVO (EDICIÓN) --- */}
                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Configuración de Notificaciones</p>
                                        <p className="text-[11px] text-white/20 mt-0.5">¿Deseas asignar una persona de contacto diferente?</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => upd({ contacto_alternativo_activo: !form.contacto_alternativo_activo })}
                                        style={{ width: '40px', height: '22px' }}
                                        className="relative shrink-0 rounded-full transition-all"
                                    >
                                        <div className={`w-full h-full rounded-full transition-all duration-300 ${form.contacto_alternativo_activo ? 'bg-brand' : 'bg-white/10 border border-white/10'}`}>
                                            <div className={`absolute top-[2px] bg-white rounded-full shadow transition-transform duration-300 ${form.contacto_alternativo_activo ? 'translate-x-[20px]' : 'translate-x-[2px]'}`}
                                                style={{ width: '16px', height: '16px' }}></div>
                                        </div>
                                    </button>
                                </div>

                                {form.contacto_alternativo_activo && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl animate-fade-in-up">
                                        <FI label="Nombre de Contacto" required>
                                            <Inp value={form.nombre_contacto} uppercase required placeholder="Ej: ISA, SU MUJER"
                                                onChange={e => upd({ nombre_contacto: e.target.value })} />
                                        </FI>
                                        <FI label="Teléfono de Contacto">
                                            <Inp value={form.tlf_contacto} placeholder="600 000 000"
                                                onChange={e => upd({ tlf_contacto: e.target.value })} />
                                        </FI>
                                        <FI label="Email de Contacto">
                                            <Inp type="email" value={form.email_contacto} placeholder="contacto@ejemplo.com"
                                                onChange={e => upd({ email_contacto: e.target.value.toLowerCase() })} />
                                        </FI>

                                        <div className="sm:col-span-2 pt-2">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative h-5 w-9 shrink-0">
                                                    <input type="checkbox" checked={form.contacto_notificaciones_activas}
                                                        onChange={e => upd({ contacto_notificaciones_activas: e.target.checked })}
                                                        className="sr-only peer" />
                                                    <div className="w-full h-full bg-white/10 border border-white/10 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60 transition-colors">Enviar notificaciones a este contacto</span>
                                                    <p className="text-[9px] text-white/20 -mt-0.5">Si se activa, el partner recibirá WhatsApp/Emails en estos datos en lugar de los principales.</p>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Dirección</p>
                                <DireccionEdit values={form} onChange={upd} />
                            </div>

                            {/* Contraseña — solo si tiene acceso activo */}
                            {accesoActivo && (
                                <div className="space-y-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Cambiar Contraseña</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl">
                                        <FI label="Nueva contraseña (opcional)">
                                            <Inp
                                                type="password"
                                                placeholder="Mín. 6 caracteres"
                                                value={form.usuario_password}
                                                onChange={e => upd({ usuario_password: e.target.value })}
                                                className="font-mono"
                                            />
                                        </FI>
                                        <FI label="Confirmar contraseña">
                                            <Inp
                                                type="password"
                                                placeholder="Repetir contraseña"
                                                value={form.usuario_confirm_password}
                                                onChange={e => upd({ usuario_confirm_password: e.target.value })}
                                                className={`font-mono ${form.usuario_password && form.usuario_confirm_password && form.usuario_password !== form.usuario_confirm_password ? 'border-red-500/50 focus:ring-red-500/30' : ''}`}
                                            />
                                            {form.usuario_password && form.usuario_confirm_password && form.usuario_password !== form.usuario_confirm_password && (
                                                <p className="text-[10px] text-red-400 font-bold mt-1 uppercase tracking-wider">No coinciden</p>
                                            )}
                                        </FI>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button type="button"
                                    onClick={() => { if (isCreating) { onClose(); } else { setEditing(false); setError(null); } }}
                                    className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white font-bold text-sm transition-all">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleSave} disabled={loading || (!form.es_autonomo && (!form.razon_social?.trim() || !form.cif?.trim())) || (form.es_autonomo && (!form.nombre_responsable?.trim() || !form.cif?.trim()))}
                                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-wider shadow-lg shadow-brand/20 transition-all disabled:opacity-50">
                                    {loading ? 'Guardando...' : isCreating ? 'Crear Partner' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Popup de Confirmación de Asociación */}
                {offerAssocData && (
                    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                        <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-in">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
                                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="text-white font-black uppercase tracking-wide mb-2">Instalador Homologado Detectado</h3>
                            <p className="text-sm text-white/60 mb-6 leading-relaxed">
                                Este instalador ya pertenece a la red de Instaladores homologados por <span className="text-white font-bold">BROKERGY</span>. 
                                <br/><br/>
                                ¿Quieres añadirlo a tu red de instaladores de confianza?
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setOfferAssocData(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/40 text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                >
                                    No, cancelar
                                </button>
                                <button
                                    onClick={handleConfirmAssociation}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                                >
                                    {loading ? 'VINCULANDO...' : 'SÍ, AÑADIR'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
