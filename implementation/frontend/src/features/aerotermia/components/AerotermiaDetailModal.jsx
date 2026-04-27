import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// ── Helpers de formato ──────────────────────────────────────────────────────
function fmt(val) {
    if (val === null || val === undefined || val === '') return '—';
    return Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-componentes de formulario ───────────────────────────────────────────
function FI({ label, children, required }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}
function Inp({ className = '', uppercase, ...props }) {
    return (
        <input
            {...props}
            className={`bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-[13px] placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10 transition-all ${uppercase ? 'uppercase' : ''} ${className}`}
            onChange={e => {
                if (uppercase && props.onChange) {
                    const synth = { ...e, target: { ...e.target, value: e.target.value.toUpperCase() } };
                    props.onChange(synth);
                } else if (props.onChange) {
                    props.onChange(e);
                }
            }}
        />
    );
}
function Sel({ children, ...props }) {
    return (
        <select
            {...props}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-[13px] focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10 transition-all"
        >
            {children}
        </select>
    );
}
function DataRow({ label, value, highlight }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">{label}</span>
            <span className={`text-[13px] font-black ${highlight ? 'text-brand' : 'text-white'}`}>{value}</span>
        </div>
    );
}
function NumRow({ label, value }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <span className="text-[11px] text-white/30 font-bold">{label}</span>
            <span className="text-[13px] font-black text-white tabular-nums">{fmt(value)}</span>
        </div>
    );
}

// ── Componente principal ────────────────────────────────────────────────────
const EMPTY = {
    marca: '', modelo_comercial: '', tipo: 'BIBLOCK',
    potencia_calefaccion: '', modelo_conjunto: '', modelo_ud_exterior: '',
    modelo_ud_interior: '', deposito_acs_incluido: false,
    scop_cal_calido_35: '', scop_cal_calido_55: '',
    scop_cal_medio_35: '', scop_cal_medio_55: '',
    scop_dhw_calido: '', scop_dhw_medio: '',
    seer: '', eta_calida_35: '', eta_calida_55: '',
    eta_media_35: '', eta_media_55: '',
    eta_acs_calida: '', eta_acs_media: '',
    cop_a7_55: '', eprel: '', ficha_tecnica: '', 
    url_keymark: '', is_validated: false, logo_marca: null,
};

export function AerotermiaDetailModal({ isOpen, equipo: equipoProp, isNew = false, onClose, onUpdated, onCreated }) {
    const [editing, setEditing] = useState(false);
    const [equipo, setEquipo] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [techOpen, setTechOpen] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const logoInputRef = useRef(null);

    // Sincronizar cuando cambia el equipo o se abre en modo nuevo
    useEffect(() => {
        if (!isOpen) return;
        setIsDuplicating(false);
        if (isNew) {
            setEditing(true);
            setEquipo(null);
            setForm(EMPTY);
            setTechOpen(false);
            setError(null);
        } else if (equipoProp) {
            setEditing(false);
            setEquipo(equipoProp);
            setForm(toForm(equipoProp));
            setTechOpen(false);
            setError(null);
        }
    }, [isOpen, equipoProp?.id, isNew]);

    function toForm(e) {
        const s = (v) => (v !== null && v !== undefined ? String(v) : '');
        return {
            marca:                 s(e.marca),
            modelo_comercial:      s(e.modelo_comercial),
            tipo:                  s(e.tipo) || 'BIBLOCK',
            potencia_calefaccion:  s(e.potencia_calefaccion),
            modelo_conjunto:       s(e.modelo_conjunto),
            modelo_ud_exterior:    s(e.modelo_ud_exterior),
            modelo_ud_interior:    s(e.modelo_ud_interior),
            deposito_acs_incluido: !!e.deposito_acs_incluido,
            scop_cal_calido_35:    s(e.scop_cal_calido_35),
            scop_cal_calido_55:    s(e.scop_cal_calido_55),
            scop_cal_medio_35:     s(e.scop_cal_medio_35),
            scop_cal_medio_55:     s(e.scop_cal_medio_55),
            scop_dhw_calido:       s(e.scop_dhw_calido),
            scop_dhw_medio:        s(e.scop_dhw_medio),
            seer:                  s(e.seer),
            eta_calida_35:         s(e.eta_calida_35),
            eta_calida_55:         s(e.eta_calida_55),
            eta_media_35:          s(e.eta_media_35),
            eta_media_55:          s(e.eta_media_55),
            eta_acs_calida:        s(e.eta_acs_calida),
            eta_acs_media:         s(e.eta_acs_media),
            cop_a7_55:             s(e.cop_a7_55),
            eprel:                 s(e.eprel),
            ficha_tecnica:         s(e.ficha_tecnica),
            url_keymark:           s(e.url_keymark),
            is_validated:          !!e.is_validated,
            logo_marca:            e.logo_marca || null,
        };
    }

    function upd(patch) { setForm(f => ({ ...f, ...patch })); }

    function handleLogoChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => upd({ logo_marca: ev.target.result });
        reader.readAsDataURL(file);
    }

    async function handleSave() {
        if (!form.marca?.trim()) { setError('La marca es obligatoria.'); return; }
        
        // Validación de duplicado exacto
        if (isDuplicating && equipo && 
            form.marca.toUpperCase() === equipo.marca?.toUpperCase() && 
            form.modelo_comercial === equipo.modelo_comercial) {
            if (!window.confirm('Estás guardando un equipo con el mismo nombre y marca que el original. ¿Deseas continuar?')) {
                return;
            }
        }

        setError(null);
        setLoading(true);
        try {
            const payload = buildPayload(form);
            // Si es nuevo O estamos duplicando, usamos POST (crear)
            if (isNew || isDuplicating) {
                const res = await axios.post('/api/aerotermia', payload);
                if (onCreated) onCreated(res.data);
                // Si duplicábamos, cerramos o actualizamos estado
                if (isDuplicating) onClose(); 
            } else {
                const res = await axios.put(`/api/aerotermia/${equipo.id}`, payload);
                if (onUpdated) onUpdated(res.data);
            }
        } catch (err) {
            console.error('Error guardando equipo:', err);
            setError(err.response?.data?.error || 'Error al guardar el equipo.');
        } finally {
            setLoading(false);
        }
    }

    function buildPayload(f) {
        const n = (v) => (v !== '' && v !== null && v !== undefined ? parseFloat(String(v).replace(',', '.')) : null);
        const s = (v) => (String(v || '').trim() || null);
        return {
            marca:                 s(f.marca)?.toUpperCase(),
            modelo_comercial:      s(f.modelo_comercial),
            tipo:                  s(f.tipo),
            potencia_calefaccion:  n(f.potencia_calefaccion),
            modelo_conjunto:       s(f.modelo_conjunto),
            modelo_ud_exterior:    s(f.modelo_ud_exterior),
            modelo_ud_interior:    s(f.modelo_ud_interior),
            deposito_acs_incluido: !!f.deposito_acs_incluido,
            scop_cal_calido_35:    n(f.scop_cal_calido_35),
            scop_cal_calido_55:    n(f.scop_cal_calido_55),
            scop_cal_medio_35:     n(f.scop_cal_medio_35),
            scop_cal_medio_55:     n(f.scop_cal_medio_55),
            scop_dhw_calido:       n(f.scop_dhw_calido),
            scop_dhw_medio:        n(f.scop_dhw_medio),
            seer:                  n(f.seer),
            eta_calida_35:         n(f.eta_calida_35),
            eta_calida_55:         n(f.eta_calida_55),
            eta_media_35:          n(f.eta_media_35),
            eta_media_55:          n(f.eta_media_55),
            eta_acs_calida:        n(f.eta_acs_calida),
            eta_acs_media:         n(f.eta_acs_media),
            cop_a7_55:             n(f.cop_a7_55),
            eprel:                 s(f.eprel),
            ficha_tecnica:         s(f.ficha_tecnica),
            url_keymark:           s(f.url_keymark),
            is_validated:          !!f.is_validated,
            logo_marca:            f.logo_marca || null,
        };
    }

    if (!isOpen) return null;
    if (!isNew && !equipo) return null;

    const displayMarca = isNew ? 'NUEVO EQUIPO' : (equipo.marca || '—');
    const displayModelo = isNew ? '' : (equipo.modelo_comercial || '');
    const logo = editing ? form.logo_marca : equipo?.logo_marca;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
            onMouseDown={e => e.stopPropagation()}>
            <div className="bg-bkg-deep border border-white/[0.08] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-slide-up">

                {/* ── Header ── */}
                <div className="p-6 pb-4 border-b border-white/[0.06] flex items-start gap-4">
                    {/* Logo */}
                    <div
                        className={`w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0 ${editing ? 'cursor-pointer hover:border-brand/40 hover:bg-brand/5 transition-all group' : ''}`}
                        onClick={() => editing && logoInputRef.current?.click()}
                        title={editing ? 'Haz clic para cambiar el logo' : ''}
                    >
                        {logo ? (
                            <img src={logo} alt="logo" className="w-full h-full object-contain p-1.5" />
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                {editing ? (
                                    <svg className="w-6 h-6 text-white/20 group-hover:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                ) : (
                                    <span className="text-white/20 font-black text-xl">{displayMarca.charAt(0)}</span>
                                )}
                            </div>
                        )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />

                    {/* Título */}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">{displayMarca}</span>
                            {!isNew && equipo?.tipo && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded-md text-white/40">
                                    {equipo.tipo}
                                </span>
                            )}
                            {!isNew && equipo?.potencia_calefaccion && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-amber-400">
                                    {fmt(equipo.potencia_calefaccion)} kW
                                </span>
                            )}
                        </div>
                        <p className="text-white font-black text-base truncate">{displayModelo || (isNew ? 'Rellena los datos del equipo' : '—')}</p>
                        {!isNew && (
                            <div className="flex items-center gap-2 mt-1">
                                {(editing ? form.is_validated : equipo?.is_validated) ? (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Revisada e Importada
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-black text-amber-400/50 uppercase tracking-widest bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 transition-colors">
                                        Pendiente de Revisión
                                    </span>
                                )}
                                <p className="text-white/30 text-[11px] truncate">{equipo?.modelo_conjunto || ''}</p>
                            </div>
                        )}
                    </div>

                    {/* Acciones header */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                        {editing && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl mr-2">
                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest leading-none">Validada</span>
                                <label className="relative inline-flex items-center cursor-pointer scale-75 origin-right">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={form.is_validated}
                                        onChange={e => upd({ is_validated: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 after:shadow-sm"></div>
                                </label>
                            </div>
                        )}
                        {!isNew && !editing && !isDuplicating && (
                            <>
                                <button
                                    onClick={() => {
                                        setEditing(true);
                                        setIsDuplicating(true);
                                        // Mantenemos los datos actuales en el form
                                        setError(null);
                                    }}
                                    className="px-4 py-2 bg-brand/5 border border-brand/20 rounded-xl text-brand hover:bg-brand/10 font-black text-[11px] uppercase tracking-widest transition-all hide-on-mobile"
                                >
                                    Duplicar
                                </button>
                                <button
                                    onClick={() => setEditing(true)}
                                    className="px-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-brand/40 font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    Editar
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => { if (editing && !isNew) { setEditing(false); setForm(toForm(equipo)); setError(null); } else { onClose(); } }}
                            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Cuerpo (scrollable) ── */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
                    )}

                    {/* ═══ VISTA (solo lectura) ═══ */}
                    {!editing && equipo && (
                        <>
                            {/* Identificación */}
                            <div className="space-y-0">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-3">Identificación</p>
                                <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl px-4 divide-y divide-white/[0.04]">
                                    <DataRow label="Marca"             value={equipo.marca || '—'} highlight />
                                    <DataRow label="Modelo Comercial"  value={equipo.modelo_comercial || '—'} />
                                    <DataRow label="Tipo"              value={equipo.tipo || '—'} />
                                    <DataRow label="Potencia (kW)"     value={fmt(equipo.potencia_calefaccion)} highlight />
                                    <DataRow label="Depósito ACS"      value={equipo.deposito_acs_incluido ? 'Sí' : 'No'} />
                                    <DataRow label="Modelo Conjunto"   value={equipo.modelo_conjunto || '—'} />
                                    <DataRow label="Ud. Exterior"      value={equipo.modelo_ud_exterior || '—'} />
                                    <DataRow label="Ud. Interior"      value={equipo.modelo_ud_interior || '—'} />
                                </div>
                            </div>

                            {/* Referencias */}
                            {(equipo.eprel || equipo.ficha_tecnica || equipo.url_keymark) && (
                                <div className="space-y-0">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-3">Referencias</p>
                                    <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl px-4 divide-y divide-white/[0.04]">
                                        {equipo.eprel && (
                                            <div className="flex items-center justify-between py-2.5">
                                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">EPREL</span>
                                                <a href={equipo.eprel} target="_blank" rel="noopener noreferrer"
                                                    className="text-sky-400 text-[11px] font-black hover:underline max-w-[220px] truncate"
                                                    onClick={e => e.stopPropagation()}>
                                                    Ver en EPREL →
                                                </a>
                                            </div>
                                        )}
                                        {equipo.ficha_tecnica && (
                                            <div className="flex items-center justify-between py-2.5">
                                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Ficha Técnica</span>
                                                <a href={equipo.ficha_tecnica} target="_blank" rel="noopener noreferrer"
                                                    className="text-sky-400 text-[11px] font-black hover:underline max-w-[220px] truncate"
                                                    onClick={e => e.stopPropagation()}>
                                                    Descargar FT →
                                                </a>
                                            </div>
                                        )}
                                        {equipo.url_keymark && (
                                            <div className="flex items-center justify-between py-2.5">
                                                <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">KEYMARK</span>
                                                <a href={equipo.url_keymark} target="_blank" rel="noopener noreferrer"
                                                    className="text-emerald-400 text-[11px] font-black hover:underline max-w-[220px] truncate"
                                                    onClick={e => e.stopPropagation()}>
                                                    Certificado Keymark →
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Datos Técnicos — colapsable */}
                            <div className="space-y-0">
                                <button
                                    onClick={() => setTechOpen(o => !o)}
                                    className="w-full flex items-center justify-between group"
                                >
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 group-hover:text-white/60 transition-colors">
                                        Datos Técnicos de Eficiencia
                                    </p>
                                    <svg className={`w-4 h-4 text-white/20 group-hover:text-white/40 transition-all ${techOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {techOpen && (
                                    <div className="mt-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl px-4 divide-y divide-white/[0.03]">
                                        <div className="py-3">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-2">SCOPcal Calefacción</p>
                                            <NumRow label="Clima Cálido 35°" value={equipo.scop_cal_calido_35} />
                                            <NumRow label="Clima Cálido 55°" value={equipo.scop_cal_calido_55} />
                                            <NumRow label="Clima Medio 35°"  value={equipo.scop_cal_medio_35} />
                                            <NumRow label="Clima Medio 55°"  value={equipo.scop_cal_medio_55} />
                                        </div>
                                        <div className="py-3">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-2">SCOPdhw ACS</p>
                                            <NumRow label="Clima Cálido" value={equipo.scop_dhw_calido} />
                                            <NumRow label="Clima Medio"  value={equipo.scop_dhw_medio} />
                                        </div>
                                        <div className="py-3">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-2">SEER / COP</p>
                                            <NumRow label="SEER"      value={equipo.seer} />
                                            <NumRow label="COP A7/55" value={equipo.cop_a7_55} />
                                        </div>
                                        <div className="py-3">
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-2">η Eficiencia Estacional</p>
                                            <NumRow label="η Cálida 35°"  value={equipo.eta_calida_35} />
                                            <NumRow label="η Cálida 55°"  value={equipo.eta_calida_55} />
                                            <NumRow label="η Media 35°"   value={equipo.eta_media_35} />
                                            <NumRow label="η Media 55°"   value={equipo.eta_media_55} />
                                            <NumRow label="η ACS Cálida"  value={equipo.eta_acs_calida} />
                                            <NumRow label="η ACS Media"   value={equipo.eta_acs_media} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ═══ EDICIÓN / NUEVO ═══ */}
                    {editing && (
                        <div className="space-y-6">
                            {/* Identificación */}
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Identificación</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FI label="Marca" required>
                                        <Inp value={form.marca} uppercase onChange={e => upd({ marca: e.target.value })} placeholder="PANASONIC" />
                                    </FI>
                                    <FI label="Tipo">
                                        <Sel value={form.tipo} onChange={e => upd({ tipo: e.target.value })}>
                                            <option value="BIBLOCK">BIBLOCK</option>
                                            <option value="MONOBLOCK">MONOBLOCK</option>
                                            <option value="SPLIT">SPLIT</option>
                                            <option value="OTRO">OTRO</option>
                                        </Sel>
                                    </FI>
                                    <div className="sm:col-span-2">
                                        <FI label="Modelo Comercial">
                                            <Inp value={form.modelo_comercial} onChange={e => upd({ modelo_comercial: e.target.value })} placeholder="Aquarea High Performance..." />
                                        </FI>
                                    </div>
                                    <FI label="Potencia Calefacción (kW)">
                                        <Inp type="number" step="0.5" value={form.potencia_calefaccion} onChange={e => upd({ potencia_calefaccion: e.target.value })} placeholder="12" />
                                    </FI>
                                    <FI label="Depósito ACS Incluido">
                                        <div className="flex items-center h-[42px]">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <div className="relative h-6 w-11 shrink-0">
                                                    <input type="checkbox" checked={form.deposito_acs_incluido}
                                                        onChange={e => upd({ deposito_acs_incluido: e.target.checked })}
                                                        className="sr-only peer" />
                                                    <div className="w-full h-full bg-white/10 border border-white/5 rounded-full peer peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand" />
                                                </div>
                                                <span className="text-[11px] font-black uppercase tracking-widest text-white/40">
                                                    {form.deposito_acs_incluido ? 'Sí' : 'No'}
                                                </span>
                                            </label>
                                        </div>
                                    </FI>
                                    <div className="sm:col-span-2">
                                        <FI label="Modelo Conjunto">
                                            <Inp value={form.modelo_conjunto} onChange={e => upd({ modelo_conjunto: e.target.value })} placeholder="KIT-ADC12HE5C-CL con Radiadores..." />
                                        </FI>
                                    </div>
                                    <FI label="Modelo Ud. Exterior">
                                        <Inp value={form.modelo_ud_exterior} uppercase onChange={e => upd({ modelo_ud_exterior: e.target.value })} />
                                    </FI>
                                    <FI label="Modelo Ud. Interior">
                                        <Inp value={form.modelo_ud_interior} uppercase onChange={e => upd({ modelo_ud_interior: e.target.value })} />
                                    </FI>
                                </div>
                            </div>

                            {/* Referencias */}
                            <div className="space-y-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Referencias</p>
                                <div className="grid grid-cols-1 gap-3">
                                    <FI label="URL EPREL">
                                        <Inp type="url" value={form.eprel} onChange={e => upd({ eprel: e.target.value })} placeholder="https://eprel.ec.europa.eu/..." />
                                    </FI>
                                    <FI label="URL Ficha Técnica">
                                        <Inp type="url" value={form.ficha_tecnica} onChange={e => upd({ ficha_tecnica: e.target.value })} placeholder="https://drive.google.com/..." />
                                    </FI>
                                    <FI label="URL KEYMARK">
                                        <Inp type="url" value={form.url_keymark} onChange={e => upd({ url_keymark: e.target.value })} placeholder="https://keymark.eu/..." />
                                    </FI>
                                </div>
                            </div>

                            {/* Datos Técnicos — colapsable en edición */}
                            <div className="space-y-0">
                                <button
                                    type="button"
                                    onClick={() => setTechOpen(o => !o)}
                                    className="w-full flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl group hover:border-white/10 transition-all"
                                >
                                    <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 group-hover:text-white/60 transition-colors">
                                        Datos Técnicos de Eficiencia
                                    </span>
                                    <svg className={`w-4 h-4 text-white/20 group-hover:text-white/40 transition-all ${techOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {techOpen && (
                                    <div className="mt-3 p-4 bg-white/[0.02] border border-white/[0.04] rounded-2xl space-y-4">
                                        {/* SCOPcal */}
                                        <div>
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-3">SCOPcal Calefacción</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FI label="Cálido 35°"><Inp type="number" step="0.001" value={form.scop_cal_calido_35} onChange={e => upd({ scop_cal_calido_35: e.target.value })} /></FI>
                                                <FI label="Cálido 55°"><Inp type="number" step="0.001" value={form.scop_cal_calido_55} onChange={e => upd({ scop_cal_calido_55: e.target.value })} /></FI>
                                                <FI label="Medio 35°"><Inp type="number" step="0.001" value={form.scop_cal_medio_35} onChange={e => upd({ scop_cal_medio_35: e.target.value })} /></FI>
                                                <FI label="Medio 55°"><Inp type="number" step="0.001" value={form.scop_cal_medio_55} onChange={e => upd({ scop_cal_medio_55: e.target.value })} /></FI>
                                            </div>
                                        </div>
                                        {/* SCOPdhw */}
                                        <div>
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-3">SCOPdhw ACS</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FI label="Cálido"><Inp type="number" step="0.001" value={form.scop_dhw_calido} onChange={e => upd({ scop_dhw_calido: e.target.value })} /></FI>
                                                <FI label="Medio"><Inp type="number" step="0.001" value={form.scop_dhw_medio} onChange={e => upd({ scop_dhw_medio: e.target.value })} /></FI>
                                            </div>
                                        </div>
                                        {/* SEER / COP */}
                                        <div>
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-3">SEER / COP</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FI label="SEER"><Inp type="number" step="0.001" value={form.seer} onChange={e => upd({ seer: e.target.value })} /></FI>
                                                <FI label="COP A7/55"><Inp type="number" step="0.001" value={form.cop_a7_55} onChange={e => upd({ cop_a7_55: e.target.value })} /></FI>
                                            </div>
                                        </div>
                                        {/* η eficiencia */}
                                        <div>
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-3">η Eficiencia Estacional</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <FI label="η Cálida 35°"><Inp type="number" step="0.001" value={form.eta_calida_35} onChange={e => upd({ eta_calida_35: e.target.value })} /></FI>
                                                <FI label="η Cálida 55°"><Inp type="number" step="0.001" value={form.eta_calida_55} onChange={e => upd({ eta_calida_55: e.target.value })} /></FI>
                                                <FI label="η Media 35°"><Inp type="number" step="0.001" value={form.eta_media_35} onChange={e => upd({ eta_media_35: e.target.value })} /></FI>
                                                <FI label="η Media 55°"><Inp type="number" step="0.001" value={form.eta_media_55} onChange={e => upd({ eta_media_55: e.target.value })} /></FI>
                                                <FI label="η ACS Cálida"><Inp type="number" step="0.001" value={form.eta_acs_calida} onChange={e => upd({ eta_acs_calida: e.target.value })} /></FI>
                                                <FI label="η ACS Media"><Inp type="number" step="0.001" value={form.eta_acs_media} onChange={e => upd({ eta_acs_media: e.target.value })} /></FI>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                {editing && (
                    <div className="p-6 pt-4 border-t border-white/[0.06] flex items-center gap-3">
                        {!isNew && (
                            <button
                                type="button"
                                onClick={() => { setEditing(false); setForm(toForm(equipo)); setError(null); }}
                                className="px-5 py-2.5 rounded-xl border border-white/10 text-white/50 hover:text-white font-black text-[11px] uppercase tracking-widest transition-all"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={loading || !form.marca?.trim()}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest shadow-lg shadow-brand/20 hover:shadow-brand/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
                        >
                            {loading ? 'Guardando...' : (isNew ? 'Crear Equipo' : (isDuplicating ? 'Crear Duplicado' : 'Guardar Cambios'))}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
