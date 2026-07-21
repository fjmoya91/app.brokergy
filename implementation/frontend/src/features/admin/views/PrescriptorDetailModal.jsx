// PrescriptorDetailModal — Patrón idéntico a ClienteDetailModal
// Vista de datos + toggle de edición en línea, con toggle de acceso al portal
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { CertificadorResumenModal } from './CertificadorResumenModal';

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
    DISTRIBUIDOR:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    INSTALADOR:      'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    CERTIFICADOR:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    SUJETO_OBLIGADO: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    VERIFICADOR:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
    OTRO:            'bg-white/5 text-white/40 border-white/10',
};

// Color del badge de estado de expediente (mismo criterio que ExpedientesView)
function estadoBadgeClass(estado) {
    const s = (estado || '').toUpperCase();
    if (s.includes('FINALIZADO')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (s.includes('PTE') || s.includes('PENDIENTE')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (s.includes('CERTIFICADOR')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (s.includes('REVISADO') || s.includes('LISTO')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    return 'bg-white/5 text-white/40 border-white/10';
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────
// Etiqueta + valor (vista de lectura). Una sola tipografía para TODOS los valores
// (sin monoespaciado): misma fuente, peso y color. Robusto frente a desbordamiento:
// los valores largos (emails, direcciones) rompen línea en vez de salirse.
// El prop `mono` se mantiene por compatibilidad con las llamadas pero ya no cambia el estilo.
function FV({ label, value, mono = false, lower = false }) {
    if (value == null || value === '' || value === '--' || value === '—') return null;
    return (
        <div className="min-w-0">
            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">{label}</p>
            <p className={[
                'text-[13.5px] leading-snug font-semibold text-white/90',
                lower ? 'lowercase break-all' : 'uppercase break-words',
            ].join(' ')}>
                {value}
            </p>
        </div>
    );
}

// Icono de cabecera de sección (16px, hereda color por currentColor)
function SecIcon({ d }) {
    return (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={d} />
        </svg>
    );
}

// Panel de sección uniforme para la vista de lectura: cabecera con icono,
// título, regla degradada y un badge opcional alineado a la derecha.
function Section({ title, iconPath, badge, children, className = '' }) {
    return (
        <section className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 sm:px-5 py-4 ${className}`}>
            <div className="flex items-center gap-2.5 mb-4">
                {iconPath && (
                    <span className="grid place-items-center w-6 h-6 rounded-lg bg-white/[0.04] text-white/45 shrink-0">
                        <SecIcon d={iconPath} />
                    </span>
                )}
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-black text-white/45 whitespace-nowrap">{title}</h3>
                <span className="flex-1 h-px bg-gradient-to-r from-white/[0.08] to-transparent" />
                {badge}
            </div>
            {children}
        </section>
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
    const [loadingProv, setLoadingProv] = useState(false);
    const [loadingMuni, setLoadingMuni] = useState(false);

    // Normalizar CCAA al cargar (la BD puede tenerla en otra capitalización)
    useEffect(() => {
        if (!values.ccaa) return;
        const matched = CCAA_LIST.find(c => normalize(c) === normalize(values.ccaa));
        if (matched && matched !== values.ccaa) onChange({ ccaa: matched });
    }, [values.ccaa]);

    // Cargar provincias cuando cambia CCAA
    useEffect(() => {
        if (!values.ccaa) { setProvincias([]); setMunicipios([]); return; }
        setLoadingProv(true);
        axios.get('/api/geo/provincias', { params: { ccaa: values.ccaa } })
            .then(r => setProvincias(r.data))
            .catch(() => setProvincias([]))
            .finally(() => setLoadingProv(false));
    }, [values.ccaa]);

    // Cargar municipios cuando cambia provincia_cod
    useEffect(() => {
        if (!values.provincia_cod) { setMunicipios([]); return; }
        setLoadingMuni(true);
        axios.get('/api/geo/municipios', { params: { codprov: values.provincia_cod } })
            .then(r => setMunicipios(r.data))
            .catch(() => setMunicipios([]))
            .finally(() => setLoadingMuni(false));
    }, [values.provincia_cod]);

    // Derivar provincia_cod a partir del nombre guardado (partner existente)
    useEffect(() => {
        if (!values.provincia_cod && values.provincia) {
            const cod = getProvCodByNombre(values.provincia);
            if (cod) onChange({ provincia_cod: cod });
        }
    }, [values.provincia]);

    // Normalizar Provincia cuando cargue la lista (la BD puede tenerla en otra capitalización)
    useEffect(() => {
        if (loadingProv || provincias.length === 0 || !values.provincia_cod) return;
        const matchedProv = provincias.find(p => p.cod === values.provincia_cod);
        if (matchedProv && matchedProv.nombre !== values.provincia) onChange({ provincia: matchedProv.nombre });
    }, [provincias, loadingProv, values.provincia_cod]);

    // Normalizar Municipio cuando cargue la lista — el CSV se sirve en MAYÚSCULAS y la BD
    // puede tenerlo en otra capitalización (ej: "Solana (La)" vs "SOLANA (LA)"), lo que dejaba
    // el desplegable vacío. Casamos por nombre normalizado (sin tildes/mayúsculas).
    useEffect(() => {
        if (loadingMuni || municipios.length === 0 || !values.municipio) return;
        if (!municipios.includes(values.municipio)) {
            const normTarget = normalize(values.municipio);
            const match = municipios.find(m => normalize(m) === normTarget)
                || municipios.find(m => normalize(m).includes(normTarget))
                || municipios.find(m => normTarget.includes(normalize(m)));
            if (match && match !== values.municipio) onChange({ municipio: match });
        }
    }, [municipios, loadingMuni]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FI label="CCAA">
                <Sel value={values.ccaa || ''} onChange={e => onChange({ ccaa: e.target.value, provincia: '', provincia_cod: '', municipio: '' })}>
                    <option value="">— Selecciona CCAA —</option>
                    {CCAA_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </Sel>
            </FI>
            <FI label="Provincia">
                <Sel value={values.provincia_cod || ''} disabled={!values.ccaa || loadingProv}
                    onChange={e => { const o = e.target.options[e.target.selectedIndex]; onChange({ provincia: o.text, provincia_cod: o.value, municipio: '' }); }}>
                    <option value="">{loadingProv ? 'Cargando...' : '— Selecciona provincia —'}</option>
                    {provincias.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
                </Sel>
            </FI>
            <FI label="Municipio">
                <Sel value={values.municipio || ''} disabled={!values.provincia_cod || loadingMuni}
                    onChange={e => onChange({ municipio: e.target.value })}>
                    <option value="">{loadingMuni ? 'Cargando...' : '— Selecciona municipio —'}</option>
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
export function PrescriptorDetailModal({ isOpen, onClose, prescriptor: prescProp, onUpdated, onCreated, onNavigate }) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';
    // Las notas internas las ve y edita el equipo (ADMIN o TRABAJADOR), no el partner.
    const isStaff = isAdmin || user?.rol?.toUpperCase() === 'TRABAJADOR';
    // Un partner puede ver/editar SU PROPIA ficha (con campos capados: sin toggle
    // de acceso, sin tipo/rol, sin toggle de autónomo — esos solo los toca un admin).
    const isOwnProfile = !!user?.prescriptor_id && user?.prescriptor_id === prescProp?.id_empresa;
    const canEditProfile = isAdmin || isOwnProfile;

    // isCreating = abrimos el modal con {} (sin id_empresa)
    const isCreating = isOpen && !prescProp?.id_empresa;

    const [p, setP] = useState(null);
    const [editing, setEditing] = useState(false);
    const [showResumenCert, setShowResumenCert] = useState(false);
    const emptyForm = {
        razon_social: '', acronimo: '', cif: '', email: '', tlf: '', sitio_web: '',
        tipo_empresa: 'DISTRIBUIDOR', marca_referencia: '', marca_secundaria: '',
        tiene_carnet_rite: false, numero_carnet_rite: '', cargo: '',
        nombre_responsable: '', apellidos_responsable: '', nif_responsable: '', precio_referencia: '', codigo_identificacion: '',
        ccaa: '', provincia: '', provincia_cod: '', municipio: '',
        codigo_postal: '', direccion: '', es_autonomo: false, logo_empresa: '',
        marcas_aerotermia: [],
        instaladores_asociados: [],
        usuario_password: '', usuario_confirm_password: '',
        contacto_alternativo_activo: false,
        contactos_notificacion: [{ nombre: '', tlf: '', email: '', cargo: '' }],
        contacto_notificaciones_activas: false,
        // Técnico habilitado que firma las memorias (si es distinto del representante legal)
        tecnico_firmante_distinto: false,
        tecnico_firmante_nombre: '',
        tecnico_firmante_apellidos: '',
        tecnico_firmante_dni: '',
        tecnico_firmante_carnet_rite: '',
        // Landing white-label de captación de leads (/p/<slug>)
        landing_slug: '',
        landing_activa: false,
        landing_color_primary: '',
        landing_titulo: '',
        landing_subtitulo: '',
        landing_telefono_contacto: '',
        landing_email_contacto: '',
        // Escaparate público de instaladores (instaladores.brokergy.es)
        marketplace_slug: '',
        visible_marketplace: false,
        descripcion_publica: '',
        especialidades: [],
        google_place_id: '',
        notas: '',
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
    const [expedientes, setExpedientes] = useState([]);
    const [loadingExpedientes, setLoadingExpedientes] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);
    const logoInputRef = useRef(null);

    // ─── Landing white-label ───────────────────────────────────────────────────
    const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$/;
    const slugValido = !form.landing_slug || SLUG_RE.test(form.landing_slug);
    const landingBase = typeof window !== 'undefined' ? window.location.origin : 'https://app.brokergy.es';

    // ─── Escaparate público de instaladores ────────────────────────────────────
    const MKT_SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,78}[a-z0-9])$/;
    const mktSlugValido = !form.marketplace_slug || MKT_SLUG_RE.test(form.marketplace_slug);
    const marketplaceBase = typeof window !== 'undefined' && window.location.hostname === 'app.brokergy.es'
        ? 'https://instaladores.brokergy.es/escaparate'
        : `${landingBase}/escaparate`;
    const [mktLinkCopied, setMktLinkCopied] = useState(false);
    const copyMarketplaceLink = (slug) => {
        try {
            navigator.clipboard?.writeText(`${marketplaceBase}/${slug}`);
            setMktLinkCopied(true);
            setTimeout(() => setMktLinkCopied(false), 2000);
        } catch { /* clipboard no disponible */ }
    };
    // Refrescar YA las cifras del escaparate (normalmente cada 6h).
    const [mktRefreshing, setMktRefreshing] = useState(false);
    const [mktRefreshed, setMktRefreshed] = useState(false);
    const refreshEscaparate = async () => {
        setMktRefreshing(true); setMktRefreshed(false);
        try {
            await axios.post('/api/prescriptores/marketplace/refresh');
            setMktRefreshed(true); setTimeout(() => setMktRefreshed(false), 3000);
        } catch { /* noop */ } finally { setMktRefreshing(false); }
    };
    const copyLandingLink = (slug) => {
        const url = `${landingBase}/p/${slug}`;
        try {
            navigator.clipboard?.writeText(url);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch { /* clipboard no disponible */ }
    };

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

    // Cargar expedientes en los que ha participado el instalador (trazabilidad)
    useEffect(() => {
        if (!isOpen || !p?.id_empresa || p.tipo_empresa !== 'INSTALADOR') {
            setExpedientes([]);
            return;
        }
        // Expedientes son INTERNOS de Brokergy: la trazabilidad solo es para ADMIN.
        if (!isAdmin) {
            setExpedientes([]);
            return;
        }
        setLoadingExpedientes(true);
        axios.get(`/api/prescriptores/${p.id_empresa}/expedientes`)
            .then(r => setExpedientes(r.data || []))
            .catch(err => { console.error('Error cargando expedientes del instalador:', err); setExpedientes([]); })
            .finally(() => setLoadingExpedientes(false));
    }, [isOpen, p?.id_empresa, p?.tipo_empresa, isAdmin, user?.prescriptor_id]);

    const handleOpenExpediente = (exp) => {
        if (onNavigate) {
            onNavigate('expedientes', { expediente_id: exp.id });
            onClose();
        } else {
            // Fallback: deep link ?exp= (App lo resuelve por id o numero_expediente)
            window.location.assign(`/?exp=${encodeURIComponent(exp.numero_expediente || exp.id)}`);
        }
    };

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
        setForm(prev => {
            // Si es el mismo prescriptor (ej: tras un guardado), conservar los instaladores ya cargados.
            // Si cambia de prescriptor, resetear a [] para que el otro useEffect los cargue.
            const sameId = prev._prescriptorId === p.id_empresa;
            return {
                _prescriptorId:       p.id_empresa,
                razon_social:         p.razon_social || '',
                acronimo:             p.acronimo || '',
                cif:                  p.cif || '',
                email:                p.email || p.usuarios?.email || '',
                tlf:                  p.tlf || p.usuarios?.tlf || '',
                sitio_web:            p.sitio_web || '',
                tipo_empresa:         p.tipo_empresa || 'INSTALADOR',
                marca_referencia:     p.marca_referencia || '',
                marca_secundaria:     p.marca_secundaria || '',
                tiene_carnet_rite:    p.tiene_carnet_rite || false,
                numero_carnet_rite:   p.numero_carnet_rite || '',
                cargo:                p.cargo || '',
                nombre_responsable:   p.nombre_responsable || p.usuarios?.nombre || '',
                apellidos_responsable:p.apellidos_responsable || p.usuarios?.apellidos || '',
                nif_responsable:      p.nif_responsable || '',
                precio_referencia:    p.precio_referencia ?? '',
                codigo_identificacion: p.codigo_identificacion ?? '',
                ccaa:                 p.ccaa || '',
                provincia:            p.provincia || '',
                provincia_cod:        cod,
                municipio:            p.municipio || '',
                codigo_postal:        p.codigo_postal || '',
                direccion:            p.direccion || '',
                es_autonomo:          p.es_autonomo || false,
                logo_empresa:         p.logo_empresa || '',
                marcas_aerotermia:    p.marca_referencia ? p.marca_referencia.split(',').map(m => m.trim().toUpperCase()) : [],
                instaladores_asociados: sameId ? prev.instaladores_asociados : [],
                usuario_password:     '',
                usuario_confirm_password: '',
                contacto_alternativo_activo: p.contacto_alternativo_activo || false,
                contactos_notificacion: (() => {
                    const arr = Array.isArray(p.contactos_notificacion) ? p.contactos_notificacion : [];
                    if (arr.length) return arr.map(c => ({ nombre: c.nombre || '', tlf: c.tlf || '', email: c.email || '', cargo: c.cargo || '' }));
                    // Migración: si solo hay el contacto plano antiguo, sembrar el array con él.
                    if (p.nombre_contacto || p.tlf_contacto || p.email_contacto) {
                        return [{ nombre: p.nombre_contacto || '', tlf: p.tlf_contacto || '', email: p.email_contacto || '', cargo: '' }];
                    }
                    return [{ nombre: '', tlf: '', email: '', cargo: '' }];
                })(),
                contacto_notificaciones_activas: p.contacto_notificaciones_activas || false,
                tecnico_firmante_distinto:    p.tecnico_firmante_distinto || false,
                tecnico_firmante_nombre:      p.tecnico_firmante_nombre || '',
                tecnico_firmante_apellidos:   p.tecnico_firmante_apellidos || '',
                tecnico_firmante_dni:         p.tecnico_firmante_dni || '',
                tecnico_firmante_carnet_rite: p.tecnico_firmante_carnet_rite || '',
                landing_slug:                 p.landing_slug || '',
                landing_activa:               p.landing_activa || false,
                landing_color_primary:        p.landing_color_primary || '',
                landing_titulo:               p.landing_titulo || '',
                landing_subtitulo:            p.landing_subtitulo || '',
                landing_telefono_contacto:    p.landing_telefono_contacto || '',
                landing_email_contacto:       p.landing_email_contacto || '',
                marketplace_slug:             p.marketplace_slug || '',
                visible_marketplace:          p.visible_marketplace || false,
                descripcion_publica:          p.descripcion_publica || '',
                especialidades:               Array.isArray(p.especialidades) ? p.especialidades : [],
                google_place_id:              p.google_place_id || '',
                notas:                       p.notas || '',
            };
        });
    }, [p]);

    const upd = useCallback((patch) => setForm(f => ({ ...f, ...patch })), []);

    // ─── Gestión de la lista de contactos de notificación ──────────────────────
    const updContacto = (i, patch) => setForm(f => ({
        ...f,
        contactos_notificacion: (f.contactos_notificacion || []).map((c, idx) => idx === i ? { ...c, ...patch } : c),
    }));
    const addContacto = () => setForm(f => ({
        ...f,
        contactos_notificacion: [...(f.contactos_notificacion || []), { nombre: '', tlf: '', email: '', cargo: '' }],
    }));
    const removeContacto = (i) => setForm(f => {
        const next = (f.contactos_notificacion || []).filter((_, idx) => idx !== i);
        return { ...f, contactos_notificacion: next.length ? next : [{ nombre: '', tlf: '', email: '', cargo: '' }] };
    });

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
                sitio_web:             form.sitio_web.trim() || null,
                tipo_empresa:          form.tipo_empresa,
                marca_referencia:      form.marcas_aerotermia?.length > 0 ? form.marcas_aerotermia.join(',') : null,
                marca_secundaria:      null,
                tiene_carnet_rite:     form.tiene_carnet_rite,
                numero_carnet_rite:    form.numero_carnet_rite.trim() || null,
                cargo:                 form.cargo.trim() || null,
                nombre_responsable:    form.nombre_responsable.trim() || null,
                apellidos_responsable: form.apellidos_responsable.trim() || null,
                nif_responsable:       form.nif_responsable.trim().toUpperCase() || null,
                precio_referencia:     (form.precio_referencia === '' || form.precio_referencia == null) ? null : Number(form.precio_referencia),
                codigo_identificacion: form.codigo_identificacion?.trim() || null,
                ccaa:                  form.ccaa || null,
                provincia:             form.provincia || null,
                municipio:             form.municipio || null,
                codigo_postal:         form.codigo_postal.trim() || null,
                direccion:             form.direccion.trim() || null,
                es_autonomo:           form.es_autonomo,
                logo_empresa:          form.logo_empresa || null,
                instaladores_asociados: form.tipo_empresa === 'DISTRIBUIDOR' ? form.instaladores_asociados : [],
                contacto_alternativo_activo: form.contacto_alternativo_activo,
                contactos_notificacion: (form.contactos_notificacion || [])
                    .map(c => ({ nombre: (c.nombre || '').trim(), tlf: (c.tlf || '').trim(), email: (c.email || '').trim().toLowerCase(), cargo: (c.cargo || '').trim() }))
                    .filter(c => c.nombre || c.tlf || c.email),
                contacto_notificaciones_activas: form.contacto_notificaciones_activas,
                tecnico_firmante_distinto:    form.tecnico_firmante_distinto,
                tecnico_firmante_nombre:      form.tecnico_firmante_nombre.trim() || null,
                tecnico_firmante_apellidos:   form.tecnico_firmante_apellidos.trim() || null,
                tecnico_firmante_dni:         form.tecnico_firmante_dni.trim().toUpperCase() || null,
                tecnico_firmante_carnet_rite: form.tecnico_firmante_carnet_rite.trim() || null,

                // Landing white-label — branding editable por el propio partner.
                landing_color_primary:        form.landing_color_primary.trim() || null,
                landing_titulo:               form.landing_titulo.trim() || null,
                landing_subtitulo:            form.landing_subtitulo.trim() || null,
                landing_telefono_contacto:    form.landing_telefono_contacto.trim() || null,
                landing_email_contacto:       form.landing_email_contacto.trim().toLowerCase() || null,
                // Notas internas: el backend solo las acepta de ADMIN/TRABAJADOR.
                ...(isStaff ? { notas: form.notas.trim() || null } : {}),
                // slug + activación SOLO las envía el admin (backend también lo refuerza).
                ...(isAdmin ? {
                    landing_slug:   form.landing_slug.trim().toLowerCase() || null,
                    landing_activa: !!form.landing_activa,
                } : {}),

                // Escaparate de instaladores: publicación/consentimiento SOLO admin.
                ...(isAdmin ? {
                    marketplace_slug:     form.marketplace_slug.trim().toLowerCase() || null,
                    visible_marketplace:  !!form.visible_marketplace,
                    descripcion_publica:  form.descripcion_publica.trim() || null,
                    especialidades:       form.especialidades || [],
                    google_place_id:      form.google_place_id.trim() || null,
                } : {}),

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

    // Sujeto Obligado / Verificador = entidades CAE: sin marcas ni RITE; el responsable
    // de la sección principal es el REPRESENTANTE LEGAL (no una persona de contacto).
    const isEntidadCae = form.tipo_empresa === 'SUJETO_OBLIGADO' || form.tipo_empresa === 'VERIFICADOR';
    // Las marcas de aerotermia solo aplican a distribuidores/instaladores.
    const tieneMarcas = form.tipo_empresa === 'DISTRIBUIDOR' || form.tipo_empresa === 'INSTALADOR';

    return (
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-2xl my-8 shadow-2xl">

                {/* Header. El botón de cerrar va SIEMPRE arriba a la derecha: antes vivía
                    en la fila de acciones y, al no caber, bajaba junto a «Editar». */}
                <div className="relative p-6 border-b border-white/[0.06]">
                    <button
                        onClick={onClose}
                        title="Cerrar"
                        className="absolute top-4 right-4 p-2 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="flex items-center gap-3 min-w-0 pr-12">
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
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-black text-white uppercase tracking-wide leading-tight">{displayName}</h2>
                                {!isCreating && (
                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${TIPO_BADGE[p.tipo_empresa] || TIPO_BADGE.OTRO}`}>
                                        {p.tipo_empresa}
                                    </span>
                                )}
                            </div>
                            {!isCreating && p.cif && <p className="text-[11px] text-white/35 font-semibold mt-0.5 tracking-wide">{p.cif}</p>}
                            {isCreating && <p className="text-xs text-white/30 mt-0.5">Sin acceso al portal hasta activar el toggle</p>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mt-4">
                        {saved && (
                            <span className="text-xs text-emerald-400 font-black uppercase tracking-widest animate-fade-in">
                                ✓ Guardado
                            </span>
                        )}

                        {/* Toggle acceso — en el header, solo ADMIN y solo para partners existentes.
                            Un interruptor suelto no decía qué activaba: ahora lleva etiqueta. */}
                        {isAdmin && !isCreating && (
                            <button
                                type="button"
                                onClick={() => handleToggleAcceso(!accesoActivo)}
                                disabled={togglingAcceso}
                                title={accesoActivo
                                    ? 'Revocar el acceso: no podrá entrar en la app'
                                    : 'Dar acceso: podrá entrar en la app con su email'}
                                className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border disabled:opacity-50 transition-all ${
                                    accesoActivo
                                        ? 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20'
                                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                                }`}
                            >
                                <span className="relative shrink-0 block" style={{ width: '36px', height: '20px' }}>
                                    <span className={`block w-full h-full rounded-full transition-all duration-300 border border-orange-500 ${accesoActivo ? 'bg-orange-500' : 'bg-transparent'}`}>
                                        <span className={`absolute top-[2px] rounded-full shadow transition-transform duration-300 ${accesoActivo ? 'bg-white translate-x-[18px]' : 'bg-orange-500 translate-x-[2px]'}`}
                                            style={{ width: '16px', height: '16px' }}></span>
                                    </span>
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${accesoActivo ? 'text-orange-400' : 'text-white/35'}`}>
                                    {togglingAcceso
                                        ? 'Guardando…'
                                        : (accesoActivo ? 'Acceso a la app activo' : 'Sin acceso a la app')}
                                </span>
                            </button>
                        )}

                        {/* Seguimiento de los CEE que tiene asignados este certificador. */}
                        {!isCreating && !editing && p?.tipo_empresa === 'CERTIFICADOR' && (
                            <button onClick={() => setShowResumenCert(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 17v-6h13M9 7h13M4 7h.01M4 12h.01M4 17h.01" />
                                </svg>
                                Ver resumen
                            </button>
                        )}

                        {!isCreating && !editing && canEditProfile && (
                            <button onClick={() => setEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest hover:bg-brand/20 transition-all">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Editar
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>
                    )}

                    {/* ── VISTA ── */}
                    {!editing && p && (
                        <div className="space-y-4">
                            <Section title="Datos de la Empresa" iconPath="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                    <FV label="Razón Social" value={p.razon_social} />
                                    <FV label="Acrónimo" value={p.acronimo} />
                                    <FV label="CIF / NIF" value={p.cif} mono />
                                    <FV label="Tipo" value={p.tipo_empresa} />
                                    <FV label="Email" value={p.email || p.usuarios?.email} lower />
                                    <FV label="Teléfono" value={p.tlf || p.usuarios?.tlf} />
                                    {p.sitio_web && (
                                        <div className="min-w-0">
                                            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">Página Web</p>
                                            <a href={/^https?:\/\//i.test(p.sitio_web) ? p.sitio_web : `https://${p.sitio_web}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-[13.5px] leading-snug font-semibold text-cyan-400 hover:text-cyan-300 lowercase break-all underline decoration-cyan-400/30 hover:decoration-cyan-300 transition-colors">
                                                {p.sitio_web}
                                            </a>
                                        </div>
                                    )}
                                    {isAdmin && (
                                        <>
                                            <FV label="Marca Principal" value={p.marca_referencia} />
                                            <FV label="Marca Secundaria" value={p.marca_secundaria} />
                                        </>
                                    )}

                                    {p.tipo_empresa === 'DISTRIBUIDOR' && form.instaladores_asociados?.length > 0 && (
                                        <div className="col-span-1 sm:col-span-2">
                                            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1.5">Instaladores Asociados</p>
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
                            </Section>

                            {contactName && (
                                <Section title={isEntidadCae ? 'Representante Legal' : 'Persona de Contacto'} iconPath="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="Nombre" value={contactName} />
                                        {p.tipo_empresa === 'INSTALADOR' && <FV label="NIF / DNI" value={p.nif_responsable} mono />}
                                        <FV label="Cargo" value={p.cargo} />
                                        {p.tiene_carnet_rite && <FV label="N.º Empresa RITE" value={p.numero_carnet_rite} mono />}
                                    </div>
                                </Section>
                            )}

                            {/* Técnico Firmante de Memorias (Vista) */}
                            {p.tecnico_firmante_distinto && (
                                <Section title="Técnico Firmante de Memorias" iconPath="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="Nombre" value={[p.tecnico_firmante_nombre, p.tecnico_firmante_apellidos].filter(Boolean).join(' ') || null} />
                                        <FV label="DNI" value={p.tecnico_firmante_dni} mono />
                                        <FV label="N.º Carnet RITE" value={p.tecnico_firmante_carnet_rite} mono />
                                    </div>
                                </Section>
                            )}

                            {/* Contactos para Notificaciones (Vista) */}
                            {p.contacto_alternativo_activo && (() => {
                                const lista = (Array.isArray(p.contactos_notificacion) && p.contactos_notificacion.length)
                                    ? p.contactos_notificacion
                                    : ((p.nombre_contacto || p.tlf_contacto || p.email_contacto)
                                        ? [{ nombre: p.nombre_contacto, tlf: p.tlf_contacto, email: p.email_contacto }]
                                        : []);
                                if (!lista.length) return null;
                                return (
                                    <Section
                                        title={lista.length > 1 ? 'Contactos para Notificaciones' : 'Contacto para Notificaciones'}
                                        iconPath="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                        badge={p.contacto_notificaciones_activas && (
                                            <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">Activo</span>
                                        )}
                                    >
                                        <div className="space-y-2.5">
                                            {lista.map((c, i) => (
                                                <div key={i} className="p-3 bg-black/20 rounded-xl border border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                                                    <FV label="Nombre" value={c.nombre} />
                                                    <FV label="Teléfono" value={c.tlf} mono />
                                                    <div className="sm:col-span-2"><FV label="Email" value={c.email} lower /></div>
                                                </div>
                                            ))}
                                        </div>
                                    </Section>
                                );
                            })()}

                            {(p.ccaa || p.provincia || p.municipio || p.direccion) && (
                                <Section title="Dirección" iconPath="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                        <FV label="CCAA" value={p.ccaa} />
                                        <FV label="Provincia" value={p.provincia} />
                                        <FV label="Municipio" value={p.municipio} />
                                        <FV label="CP" value={p.codigo_postal} mono />
                                        {p.direccion && <div className="col-span-1 sm:col-span-2"><FV label="Dirección" value={p.direccion} /></div>}
                                    </div>
                                </Section>
                            )}

                            {/* Landing de captación de leads (white-label) */}
                            {(p.tipo_empresa === 'INSTALADOR' || p.tipo_empresa === 'DISTRIBUIDOR') && (
                                <Section
                                    title="Landing de Captación"
                                    iconPath="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                                    badge={p.landing_slug && (
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${p.landing_activa ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                            {p.landing_activa ? 'Activa' : 'Inactiva'}
                                        </span>
                                    )}
                                >
                                    {p.landing_slug ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 min-w-0 truncate text-sm text-cyan-400 font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/[0.06]">
                                                    {landingBase}/p/{p.landing_slug}
                                                </code>
                                                <button type="button" onClick={() => copyLandingLink(p.landing_slug)}
                                                    title="Copiar enlace"
                                                    className="shrink-0 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-all">
                                                    {linkCopied ? '✓ Copiado' : 'Copiar'}
                                                </button>
                                                <a href={`${landingBase}/p/${p.landing_slug}`} target="_blank" rel="noopener noreferrer"
                                                    title="Abrir landing en nueva pestaña"
                                                    className="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                </a>
                                            </div>
                                            {!p.landing_activa && (
                                                <p className="text-[11px] text-amber-400/70">La landing está desactivada: el enlace devuelve 404 hasta que un administrador la active.</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-white/25 italic">
                                            {isAdmin ? 'Sin landing configurada. Pulsa «Editar» para asignar un enlace.' : 'Sin landing configurada. Pídele a Brokergy que te active tu enlace de captación.'}
                                        </p>
                                    )}
                                </Section>
                            )}

                            {/* Escaparate público de instaladores (instaladores.brokergy.es) — solo ADMIN */}
                            {isAdmin && p.tipo_empresa === 'INSTALADOR' && (
                                <Section
                                    title="Escaparate de Instaladores"
                                    iconPath="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    badge={p.marketplace_slug && (
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${p.visible_marketplace ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                            {p.visible_marketplace ? 'Publicado' : 'Sin publicar'}
                                        </span>
                                    )}
                                >
                                    {p.marketplace_slug ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 min-w-0 truncate text-sm text-amber-400 font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/[0.06]">
                                                    {marketplaceBase}/{p.marketplace_slug}
                                                </code>
                                                <button type="button" onClick={() => copyMarketplaceLink(p.marketplace_slug)}
                                                    title="Copiar enlace"
                                                    className="shrink-0 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-all">
                                                    {mktLinkCopied ? '✓ Copiado' : 'Copiar'}
                                                </button>
                                                <a href={`${marketplaceBase}/${p.marketplace_slug}`} target="_blank" rel="noopener noreferrer"
                                                    title="Abrir ficha pública en nueva pestaña"
                                                    className="shrink-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white transition-all">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                </a>
                                            </div>
                                            {!p.visible_marketplace && (
                                                <p className="text-[11px] text-amber-400/70">Sin publicar: no aparece en el escaparate hasta que actives «Publicar en el escaparate» (en Editar).</p>
                                            )}
                                            {p.visible_marketplace && p.marketplace_consent_at && (
                                                <p className="text-[11px] text-white/25">Publicado · consentimiento registrado el {new Date(p.marketplace_consent_at).toLocaleDateString('es-ES')}.</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-white/25 italic">Sin ficha en el escaparate. Pulsa «Editar» para asignarle un enlace y publicarla.</p>
                                    )}
                                    <div className="mt-3 flex items-center gap-2">
                                        <button type="button" onClick={refreshEscaparate} disabled={mktRefreshing}
                                            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-amber-500/30 transition-all disabled:opacity-50">
                                            {mktRefreshing ? 'Actualizando…' : mktRefreshed ? '✓ Actualizado' : '↻ Actualizar cifras ahora'}
                                        </button>
                                        <span className="text-[10px] text-white/25">Las cifras (instalaciones, ayuda media) se recalculan solas cada 6 h.</span>
                                    </div>
                                </Section>
                            )}

                            {/* Expedientes en los que ha participado como instaladora asignada.
                                INTERNO de Brokergy: solo ADMIN (un distribuidor no debe verlos). */}
                            {isAdmin && p.tipo_empresa === 'INSTALADOR' && (
                                <Section
                                    title="Expedientes Asignados"
                                    iconPath="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                    badge={expedientes.length > 0 && (
                                        <span className="text-[9px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                                            {expedientes.length}
                                        </span>
                                    )}
                                >
                                    {loadingExpedientes ? (
                                        <p className="text-xs text-white/30 italic px-1 py-2">Cargando expedientes...</p>
                                    ) : expedientes.length === 0 ? (
                                        <p className="text-xs text-white/25 italic px-1 py-2">
                                            Este instalador aún no está asignado a ningún expediente.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {expedientes.map(exp => (
                                                <button
                                                    key={exp.id}
                                                    type="button"
                                                    onClick={() => handleOpenExpediente(exp)}
                                                    className="w-full flex items-center justify-between gap-3 p-3 bg-bkg-surface rounded-xl border border-white/[0.06] hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] transition-all text-left group"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white font-mono truncate group-hover:text-cyan-400 transition-colors">
                                                            {exp.numero_expediente || '—'}
                                                        </p>
                                                        {(exp.cliente_nombre || exp.cliente_municipio) && (
                                                            <p className="text-[11px] text-white/40 truncate mt-0.5 uppercase">
                                                                {exp.cliente_nombre || 'Sin cliente'}
                                                                {exp.cliente_municipio ? ` · ${exp.cliente_municipio}` : ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {exp.estado && (
                                                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-1 rounded border ${estadoBadgeClass(exp.estado)}`}>
                                                                {exp.estado}
                                                            </span>
                                                        )}
                                                        <svg className="w-4 h-4 text-white/20 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </Section>
                            )}

                            {/* Notas internas del equipo. El backend no se las envía al partner. */}
                            {isStaff && (
                                <Section title="Notas internas" iconPath="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                                    {p.notas
                                        ? <p className="text-[12px] text-white/70 leading-relaxed whitespace-pre-wrap normal-case">{p.notas}</p>
                                        : <p className="text-[11px] text-white/25">Sin notas. Pulsa «Editar» para añadirlas.</p>}
                                </Section>
                            )}

                            <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest text-center pt-1">
                                Alta: {new Date(p.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    )}

                    {/* ── EDICIÓN ── */}
                    {(editing || isCreating) && (
                        <div className="space-y-5">

                            {/* Toggle Autónomo / Empresa — SOLO ADMIN (el partner no cambia su naturaleza jurídica) */}
                            {isAdmin && (
                            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl flex items-center">
                                <label className="flex items-center gap-4 cursor-pointer w-full">
                                    <div className="relative h-6 w-11 shrink-0">
                                        <input type="checkbox" checked={form.es_autonomo}
                                            onChange={e => upd({ es_autonomo: e.target.checked })}
                                            className="sr-only peer" />
                                        <div className="w-full h-full bg-transparent border border-orange-500 peer-focus:ring-2 peer-focus:ring-brand/50 rounded-full peer peer-checked:after:translate-x-[20px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner"></div>
                                    </div>
                                    <div>
                                        <span className="font-black text-white text-xs uppercase tracking-wider block">Es Trabajador Autónomo</span>
                                        <span className="text-[10px] text-white/30 block mt-0.5">Marca esta opción si no actúas como empresa / sociedad</span>
                                    </div>
                                </label>
                            </div>
                            )}

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
                                    <div className="sm:col-span-2">
                                        <FI label="Página Web">
                                            <Inp type="url" value={form.sitio_web} placeholder="https://www.ejemplo.es"
                                                onChange={e => upd({ sitio_web: e.target.value })} />
                                        </FI>
                                    </div>
                                    {isAdmin ? (
                                        <FI label="Tipo / Rol">
                                            <Sel value={form.tipo_empresa} onChange={e => upd({ tipo_empresa: e.target.value })}>
                                                <option value="DISTRIBUIDOR">DISTRIBUIDOR</option>
                                                <option value="INSTALADOR">INSTALADOR</option>
                                                <option value="CERTIFICADOR">CERTIFICADOR</option>
                                                <option value="SUJETO_OBLIGADO">SUJETO OBLIGADO</option>
                                                <option value="VERIFICADOR">VERIFICADOR</option>
                                                <option value="OTRO">OTRO</option>
                                            </Sel>
                                        </FI>
                                    ) : (
                                        <div className="hidden">
                                            <input type="hidden" value="INSTALADOR" />
                                        </div>
                                    )}

                                    {form.tipo_empresa === 'SUJETO_OBLIGADO' && (
                                        <FI label="Precio de Referencia (€/MWh)">
                                            <Inp type="number" value={form.precio_referencia} onChange={e => upd({ precio_referencia: e.target.value })} placeholder="Ej: 175" />
                                        </FI>
                                    )}
                                    {form.tipo_empresa === 'SUJETO_OBLIGADO' && (
                                        <FI label="Código identificación (MITERD)">
                                            <Inp value={form.codigo_identificacion} uppercase onChange={e => upd({ codigo_identificacion: e.target.value })} placeholder="SO-A13035266" />
                                        </FI>
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

                                    {isAdmin && tieneMarcas && (
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
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">{isEntidadCae ? 'Representante Legal' : 'Persona de Contacto'}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Nombre">
                                        <Inp value={form.nombre_responsable} uppercase onChange={e => upd({ nombre_responsable: e.target.value })} />
                                    </FI>
                                    <FI label="Apellidos">
                                        <Inp value={form.apellidos_responsable} uppercase onChange={e => upd({ apellidos_responsable: e.target.value })} />
                                    </FI>
                                    {(form.tipo_empresa === 'INSTALADOR' || isEntidadCae) && (
                                        <FI label={form.tipo_empresa === 'SUJETO_OBLIGADO' ? 'NIF/NIE del Representante (firma RES060)' : 'NIF / DNI del Representante'}>
                                            <Inp value={form.nif_responsable} uppercase onChange={e => upd({ nif_responsable: e.target.value })} placeholder="00000000X" />
                                        </FI>
                                    )}
                                    {!isEntidadCae && (<>
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
                                                <div className="w-full h-full bg-transparent border border-orange-500 rounded-full peer peer-checked:bg-orange-500 peer-checked:after:translate-x-[16px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Habilitada en Industria (RITE)</span>
                                        </label>
                                    </div>
                                    </>)}
                                </div>
                            </div>
                            )}

                            {/* Técnico firmante de memorias — cualquier INSTALADOR (autónomo o empresa) */}
                            {form.tipo_empresa === 'INSTALADOR' && (
                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Técnico Firmante de Memorias</p>
                                        <p className="text-[11px] text-white/20 mt-0.5">¿El técnico que firma las memorias es distinto del representante legal?</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => upd({ tecnico_firmante_distinto: !form.tecnico_firmante_distinto })}
                                        style={{ width: '40px', height: '22px' }}
                                        className="relative shrink-0 rounded-full transition-all"
                                    >
                                        <div className={`w-full h-full rounded-full transition-all duration-300 border border-orange-500 ${form.tecnico_firmante_distinto ? 'bg-orange-500' : 'bg-transparent'}`}>
                                            <div className={`absolute top-[2px] rounded-full shadow transition-transform duration-300 ${form.tecnico_firmante_distinto ? 'bg-white translate-x-[20px]' : 'bg-orange-500 translate-x-[2px]'}`}
                                                style={{ width: '16px', height: '16px' }}></div>
                                        </div>
                                    </button>
                                </div>

                                {form.tecnico_firmante_distinto && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl animate-fade-in-up">
                                        <FI label="Nombre" required>
                                            <Inp value={form.tecnico_firmante_nombre} uppercase placeholder="NOMBRE DEL TÉCNICO"
                                                onChange={e => upd({ tecnico_firmante_nombre: e.target.value })} />
                                        </FI>
                                        <FI label="Apellidos" required>
                                            <Inp value={form.tecnico_firmante_apellidos} uppercase placeholder="APELLIDOS"
                                                onChange={e => upd({ tecnico_firmante_apellidos: e.target.value })} />
                                        </FI>
                                        <FI label="DNI" required>
                                            <Inp value={form.tecnico_firmante_dni} uppercase placeholder="00000000X"
                                                onChange={e => upd({ tecnico_firmante_dni: e.target.value })} />
                                        </FI>
                                        <FI label="N.º Carnet RITE" required>
                                            <Inp value={form.tecnico_firmante_carnet_rite} uppercase placeholder="RITE-XXXXX"
                                                onChange={e => upd({ tecnico_firmante_carnet_rite: e.target.value })} />
                                        </FI>
                                    </div>
                                )}
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
                                                <div className="w-full h-full bg-transparent border border-orange-500 rounded-full peer peer-checked:bg-orange-500 peer-checked:after:translate-x-[16px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
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
                                        <div className={`w-full h-full rounded-full transition-all duration-300 border border-orange-500 ${form.contacto_alternativo_activo ? 'bg-orange-500' : 'bg-transparent'}`}>
                                            <div className={`absolute top-[2px] rounded-full shadow transition-transform duration-300 ${form.contacto_alternativo_activo ? 'bg-white translate-x-[20px]' : 'bg-orange-500 translate-x-[2px]'}`}
                                                style={{ width: '16px', height: '16px' }}></div>
                                        </div>
                                    </button>
                                </div>

                                {form.contacto_alternativo_activo && (
                                    <div className="space-y-3 animate-fade-in-up">
                                        {(form.contactos_notificacion || []).map((c, i) => (
                                            <div key={i} className="relative p-4 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
                                                {(form.contactos_notificacion.length > 1) && (
                                                    <button type="button" onClick={() => removeContacto(i)} title="Eliminar contacto"
                                                        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                )}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <FI label="Nombre de Contacto" required={i === 0}>
                                                        <Inp value={c.nombre} uppercase placeholder="Ej: VICTORIA"
                                                            onChange={e => updContacto(i, { nombre: e.target.value })} />
                                                    </FI>
                                                    <FI label="Cargo">
                                                        <Inp value={c.cargo} uppercase placeholder="Ej: GESTOR CAE"
                                                            onChange={e => updContacto(i, { cargo: e.target.value })} />
                                                    </FI>
                                                    <FI label="Teléfono de Contacto">
                                                        <Inp value={c.tlf} placeholder="600 000 000"
                                                            onChange={e => updContacto(i, { tlf: e.target.value })} />
                                                    </FI>
                                                    <FI label="Email de Contacto">
                                                        <Inp type="email" value={c.email} placeholder="contacto@ejemplo.com"
                                                            onChange={e => updContacto(i, { email: e.target.value.toLowerCase() })} />
                                                    </FI>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Añadir otro contacto */}
                                        <button type="button" onClick={addContacto}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-brand hover:border-brand/40 hover:bg-brand/5 transition-all text-[11px] font-black uppercase tracking-widest">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                                            Añadir otro contacto
                                        </button>

                                        {/* Toggle global: dirigir las notificaciones a estos contactos */}
                                        <div className="pt-1">
                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                <div className="relative h-5 w-9 shrink-0">
                                                    <input type="checkbox" checked={form.contacto_notificaciones_activas}
                                                        onChange={e => upd({ contacto_notificaciones_activas: e.target.checked })}
                                                        className="sr-only peer" />
                                                    <div className="w-full h-full bg-transparent border border-orange-500 rounded-full peer peer-checked:bg-orange-500 peer-checked:after:translate-x-[16px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/60 transition-colors">Enviar notificaciones a estos contactos</span>
                                                    <p className="text-[9px] text-white/20 -mt-0.5">Si se activa, las notificaciones (WhatsApp/Email) se dirigirán a estos contactos en lugar de a los principales. Al enviar podrás elegir a cuáles.</p>
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

                            {/* Landing de captación de leads (white-label) — INSTALADOR / DISTRIBUIDOR */}
                            {(form.tipo_empresa === 'INSTALADOR' || form.tipo_empresa === 'DISTRIBUIDOR') && (
                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Landing de Captación de Leads</p>
                                    <p className="text-[11px] text-white/20 mt-0.5">
                                        Enlace propio para redes sociales. Los leads que entren por aquí se registran automáticamente atribuidos a este partner.
                                    </p>
                                </div>

                                {/* Enlace (slug) + activación: SOLO ADMIN */}
                                {isAdmin ? (
                                    <div className="space-y-3">
                                        <FI label="Enlace (slug)">
                                            <div className="flex items-stretch rounded-xl border border-white/[0.08] overflow-hidden focus-within:ring-2 focus-within:ring-brand/40 focus-within:border-brand/40 transition-all">
                                                <span className="flex items-center px-3 text-[11px] text-white/30 font-mono bg-white/[0.03] border-r border-white/[0.06] whitespace-nowrap">{landingBase}/p/</span>
                                                <input
                                                    value={form.landing_slug}
                                                    onChange={e => upd({ landing_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                                    placeholder="ism"
                                                    style={{ textTransform: 'lowercase' }}
                                                    className="flex-1 min-w-0 bg-bkg-surface px-3 py-2.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none"
                                                />
                                            </div>
                                            {!slugValido && (
                                                <p className="text-[10px] text-red-400 font-bold mt-1 uppercase tracking-wider">Mín. 3 caracteres: minúsculas, números y guiones, sin empezar/terminar en guión.</p>
                                            )}
                                        </FI>

                                        <label className={`flex items-center gap-3 ${form.landing_slug && slugValido ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                                            <div className="relative h-5 w-9 shrink-0">
                                                <input type="checkbox" checked={form.landing_activa}
                                                    disabled={!form.landing_slug || !slugValido}
                                                    onChange={e => upd({ landing_activa: e.target.checked })}
                                                    className="sr-only peer" />
                                                <div className="w-full h-full bg-transparent border border-orange-500 rounded-full peer peer-checked:bg-orange-500 peer-checked:after:translate-x-[16px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Landing activa</span>
                                                <p className="text-[9px] text-white/20 -mt-0.5">Si está desactivada, el enlace devuelve 404. Requiere un slug válido.</p>
                                            </div>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-[11px] text-white/30">
                                        {form.landing_slug
                                            ? <>Tu enlace: <code className="text-cyan-400 font-mono">{landingBase}/p/{form.landing_slug}</code>{!form.landing_activa && ' (inactivo)'}</>
                                            : 'Brokergy debe asignarte el enlace. Puedes personalizar el branding abajo.'}
                                    </div>
                                )}

                                {/* Branding — editable por el propio partner */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Título de la landing">
                                        <Inp value={form.landing_titulo} onChange={e => upd({ landing_titulo: e.target.value })} placeholder="Calcula tu ayuda para cambiar a aerotermia" className="no-uppercase" />
                                    </FI>
                                    <FI label="Subtítulo">
                                        <Inp value={form.landing_subtitulo} onChange={e => upd({ landing_subtitulo: e.target.value })} placeholder="Subvenciones y ahorro garantizado" className="no-uppercase" />
                                    </FI>
                                    <FI label="Teléfono de contacto (cliente final)">
                                        <Inp value={form.landing_telefono_contacto} onChange={e => upd({ landing_telefono_contacto: e.target.value })} placeholder="600 000 000" />
                                    </FI>
                                    <FI label="Email de contacto (cliente final)">
                                        <Inp type="email" value={form.landing_email_contacto} onChange={e => upd({ landing_email_contacto: e.target.value.toLowerCase() })} placeholder="contacto@empresa.com" />
                                    </FI>
                                    <FI label="Color principal">
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={form.landing_color_primary || '#f59e0b'}
                                                onChange={e => upd({ landing_color_primary: e.target.value })}
                                                className="h-[42px] w-12 shrink-0 rounded-xl bg-bkg-surface border border-white/[0.08] cursor-pointer p-1" />
                                            <Inp value={form.landing_color_primary} onChange={e => upd({ landing_color_primary: e.target.value })} placeholder="#F59E0B" className="font-mono" />
                                        </div>
                                    </FI>
                                </div>
                                <p className="text-[10px] text-white/20">El logotipo de la landing es el mismo logo del partner (arriba). Si dejas un campo vacío, se usa el branding por defecto de Brokergy.</p>
                            </div>
                            )}

                            {/* Escaparate público de instaladores — SOLO ADMIN (consentimiento + curación manual) */}
                            {isAdmin && form.tipo_empresa === 'INSTALADOR' && (
                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Escaparate de Instaladores</p>
                                    <p className="text-[11px] text-white/20 mt-0.5">
                                        Ficha pública en instaladores.brokergy.es. Al publicar se geolocaliza solo (si falta) y aparece en el mapa. Nunca se muestran datos personales de clientes.
                                    </p>
                                </div>

                                <FI label="Enlace (slug)">
                                    <div className="flex items-stretch rounded-xl border border-white/[0.08] overflow-hidden focus-within:ring-2 focus-within:ring-brand/40 focus-within:border-brand/40 transition-all">
                                        <span className="flex items-center px-3 text-[11px] text-white/30 font-mono bg-white/[0.03] border-r border-white/[0.06] whitespace-nowrap">{marketplaceBase}/</span>
                                        <input
                                            value={form.marketplace_slug}
                                            onChange={e => upd({ marketplace_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                            placeholder="mi-empresa"
                                            style={{ textTransform: 'lowercase' }}
                                            className="flex-1 min-w-0 bg-bkg-surface px-3 py-2.5 text-white text-sm font-mono placeholder:text-white/20 focus:outline-none"
                                        />
                                    </div>
                                    {!mktSlugValido && (
                                        <p className="text-[10px] text-red-400 font-bold mt-1 uppercase tracking-wider">Mín. 3 caracteres: minúsculas, números y guiones, sin empezar/terminar en guión.</p>
                                    )}
                                </FI>

                                <label className={`flex items-center gap-3 ${form.marketplace_slug && mktSlugValido ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                                    <div className="relative h-5 w-9 shrink-0">
                                        <input type="checkbox" checked={form.visible_marketplace}
                                            disabled={!form.marketplace_slug || !mktSlugValido}
                                            onChange={e => upd({ visible_marketplace: e.target.checked })}
                                            className="sr-only peer" />
                                        <div className="w-full h-full bg-transparent border border-amber-500 rounded-full peer peer-checked:bg-amber-500 peer-checked:after:translate-x-[16px] peer-checked:after:bg-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-amber-500 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Publicar en el escaparate</span>
                                        <p className="text-[9px] text-white/20 -mt-0.5">Solo actívalo si el instalador ha dado su consentimiento. Requiere un enlace válido.</p>
                                    </div>
                                </label>

                                <FI label="Descripción pública (opcional)">
                                    <textarea
                                        value={form.descripcion_publica}
                                        onChange={e => upd({ descripcion_publica: e.target.value })}
                                        rows={3}
                                        maxLength={1000}
                                        placeholder="Frase que verá el cliente en la ficha (si la dejas vacía se usa una por defecto)…"
                                        className="w-full bg-bkg-surface rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 border border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all resize-none no-uppercase"
                                    />
                                </FI>

                                <FI label="Especialidades (separadas por coma)">
                                    <Inp
                                        value={(form.especialidades || []).join(', ')}
                                        onChange={e => upd({ especialidades: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                        placeholder="Aerotermia, Reforma energética"
                                        className="no-uppercase"
                                    />
                                </FI>

                                <FI label="Google Place ID (opcional)">
                                    <Inp value={form.google_place_id} onChange={e => upd({ google_place_id: e.target.value.trim() })} placeholder="ChIJ…" className="font-mono" />
                                    <p className="text-[9px] text-white/20 mt-1">Habilita el botón «Escribe una reseña en Google» en la ficha pública.</p>
                                </FI>
                            </div>
                            )}

                            {/* Notas internas — para cualquier tipo de partner (instalador,
                                certificador, S.O., verificador). El partner no las ve. */}
                            {isStaff && (
                            <div className="pt-4 border-t border-white/5 space-y-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Notas internas</p>
                                    <p className="text-[11px] text-white/20 mt-0.5">Solo para el equipo de Brokergy: acuerdos, incidencias, avisos. El partner no las ve.</p>
                                </div>
                                <textarea
                                    value={form.notas}
                                    onChange={e => upd({ notas: e.target.value })}
                                    rows={4}
                                    placeholder="Ej.: factura siempre a fin de mes. Contactar con Jesús, no con el técnico."
                                    className="w-full bg-bkg-surface px-3 py-2.5 text-white text-sm rounded-xl border border-white/[0.08] placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none normal-case"
                                />
                            </div>
                            )}

                            {/* Contraseña — solo si tiene acceso activo */}
                            {accesoActivo && (
                                <div className="space-y-3">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Cambiar Contraseña</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl">
                                        <FI label="Nueva contraseña (opcional)">
                                            <div className="relative">
                                                <Inp
                                                    type={showNewPwd ? 'text' : 'password'}
                                                    placeholder="Mín. 6 caracteres"
                                                    value={form.usuario_password}
                                                    onChange={e => upd({ usuario_password: e.target.value })}
                                                    className="font-mono pr-9"
                                                />
                                                <button type="button" onClick={() => setShowNewPwd(v => !v)} tabIndex={-1} aria-label={showNewPwd ? 'Ocultar' : 'Mostrar'} className="absolute inset-y-0 right-2.5 flex items-center text-brand/50 hover:text-brand transition-colors">
                                                    {showNewPwd ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    )}
                                                </button>
                                            </div>
                                        </FI>
                                        <FI label="Confirmar contraseña">
                                            <div className="relative">
                                                <Inp
                                                    type={showConfirmPwd ? 'text' : 'password'}
                                                    placeholder="Repetir contraseña"
                                                    value={form.usuario_confirm_password}
                                                    onChange={e => upd({ usuario_confirm_password: e.target.value })}
                                                    className={`font-mono pr-9 ${form.usuario_password && form.usuario_confirm_password && form.usuario_password !== form.usuario_confirm_password ? 'border-red-500/50 focus:ring-red-500/30' : ''}`}
                                                />
                                                <button type="button" onClick={() => setShowConfirmPwd(v => !v)} tabIndex={-1} aria-label={showConfirmPwd ? 'Ocultar' : 'Mostrar'} className="absolute inset-y-0 right-2.5 flex items-center text-brand/50 hover:text-brand transition-colors">
                                                    {showConfirmPwd ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                    )}
                                                </button>
                                            </div>
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
                                <button type="button" onClick={handleSave} disabled={loading || !slugValido || (!form.es_autonomo && (!form.razon_social?.trim() || !form.cif?.trim())) || (form.es_autonomo && (!form.nombre_responsable?.trim() || !form.cif?.trim()))}
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

            <CertificadorResumenModal
                isOpen={showResumenCert}
                onClose={() => setShowResumenCert(false)}
                prescriptorId={p?.id_empresa}
                certificadorNombre={p?.razon_social || p?.acronimo}
            />
        </div>
    );
}
