import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BOILER_EFFICIENCIES, getScopFromModel, getScopSeason, getScopAcsFromModel, calculateHybridization, resolveHybridInputs, HYBRID_METHODS } from '../../calculator/logic/calculation';
import { PROVINCE_CODE_TO_CCAA, PROVINCE_CODE_TO_NAME } from '../utils/docGenerators';
import { withScopAplicado, cloneAero, potenciaTotal, countUnidades, scopPropioUnidad1, scopAplicado, tipoEquipoNuevo, datosAcumulador, EQUIPO_NUEVO, RENDIMIENTO_JOULE } from '../logic/aerotermiaUnits';
import { EMITTER_OPTIONS, getEmitterTemp } from '../logic/cifoDoc';
import { esTer100 } from '../logic/ter100';

// Lista de emisores: fuente única en logic/cifoDoc.js (la misma que imprimen el
// CIFO y el RES080). Las unidades AIRE-AIRE (splits / conductos) solo se ofrecen
// en expedientes RES080 — ver `emitterOptionsFor`.
function emitterOptionsFor(numeroExpediente) {
    const esRes080 = String(numeroExpediente || '').includes('RES080');
    return EMITTER_OPTIONS.filter(o => !o.aire || esRes080);
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

// normalizeData (backend) guarda los strings en MAYÚSCULAS, así que el valor
// persistido ("CASTILLA-LA MANCHA") no coincide con el value del <select>
// ("Castilla-La Mancha") y el desplegable aparece vacío. Buscamos el valor
// canónico case-insensitive, igual que se hace con tipo_emisor.
function matchCcaaCase(value) {
    if (!value) return value;
    return CCAA_LIST.find(c => c.toLowerCase() === String(value).toLowerCase()) || value;
}

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
const TIPO_EQUIPO_OPTIONS = [
    { value: 'Caldera', label: 'Caldera' },
    { value: 'Termo eléctrico', label: 'Termo eléctrico' },
    { value: 'Bomba de calor', label: 'Bomba de calor' },
    { value: 'Otro', label: 'Otro' },
];

function CalderaSection({ title, data, onChange, readOnly }) {
    const rendimientoOptions = BOILER_EFFICIENCIES.map(b => ({
        value: b.id,
        label: `${b.label} (η=${b.value})`
    }));

    return (
        <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-black text-amber-400/80 uppercase tracking-wider">{title}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Tipo de equipo existente
                    </label>
                    <select
                        value={data?.tipo_equipo ?? 'Caldera'}
                        onChange={v => onChange({ ...data, tipo_equipo: v.target.value })}
                        disabled={readOnly}
                        className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand/50 appearance-none"
                    >
                        {TIPO_EQUIPO_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-white/40 uppercase tracking-wider font-bold">
                        <svg className="w-3 h-3 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Marca equipo antiguo
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

// ─── ACS FUERA DEL ALCANCE CAE: equipo nuevo que NO computa ───────────────────
// Caso real (RES060): una caldera de gasoil daba calefacción + ACS; se instala
// aerotermia SOLO para calefacción y el ACS pasa a un termo eléctrico. El termo
// NO es actuación CAE (efecto Joule: no genera ahorro elegible), pero tiene que
// quedar reflejado en los certificados y en la memoria RITE.
//
// Se guarda en el MISMO nodo `aerotermia_acs` con tipo_equipo_nuevo = 'termo_electrico'.
// Con `cambio_acs = false` la fórmula de ahorro lo ignora por completo: se pasa
// dacs = 0 y changeAcs = false (ver calculateSavings), así que no computa.
function AcsFueraAlcanceSection({ data, onChange, readOnly }) {
    const hayTermo = tipoEquipoNuevo(data) === EQUIPO_NUEVO.TERMO;

    const setTermo = (val) => {
        if (!val) {
            // Volver a "se mantiene la existente": se limpia el nodo entero para no
            // dejar rastros de un equipo nuevo que no existe.
            onChange({ aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' });
            return;
        }
        onChange({
            aerotermia_db_id: null,
            tipo_equipo_nuevo: EQUIPO_NUEVO.TERMO,
            es_acumulador: false,
            marca: '', modelo: '', numero_serie: '', litros: null,
            modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '',
            url_eprel: null, url_keymark: null, url_ficha: null,
            metodo_scop: null,
            equipos_extra: [],
            scop: RENDIMIENTO_JOULE,
        });
    };

    const set = (patch) => onChange({ ...data, ...patch });

    return (
        <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-black text-white/50 uppercase tracking-wider">Equipo nuevo de ACS (fuera del alcance CAE)</h4>
            <Toggle
                label="¿Se instala un termo eléctrico nuevo para el ACS?"
                value={hayTermo}
                onChange={setTermo}
                readOnly={readOnly}
            />
            {hayTermo && (
                <>
                    <div className="flex items-start gap-2 bg-amber-500/[0.07] border border-amber-500/25 rounded-lg px-3 py-2">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex-shrink-0">No computa</span>
                        <span className="text-[10px] text-white/45 leading-relaxed">
                            Efecto Joule · rendimiento 1. No genera ahorro CAE: queda fuera de la fórmula del certificado y solo se refleja como información de la instalación.
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                            label="Marca (opcional)"
                            value={data?.marca ?? ''}
                            onChange={v => set({ marca: v })}
                            readOnly={readOnly}
                            placeholder="Si no se conoce, en blanco"
                        />
                        <Field
                            label="Modelo (opcional)"
                            value={data?.modelo ?? ''}
                            onChange={v => set({ modelo: v })}
                            readOnly={readOnly}
                            placeholder="Si no se conoce, en blanco"
                        />
                        <Field
                            label="Número de serie (opcional)"
                            value={data?.numero_serie ?? ''}
                            onChange={v => set({ numero_serie: v })}
                            readOnly={readOnly}
                            placeholder="Si no se conoce, en blanco"
                        />
                        <Field
                            label="Litros de acumulación (opcional)"
                            type="number"
                            value={data?.litros ?? ''}
                            onChange={v => set({ litros: v })}
                            readOnly={readOnly}
                            placeholder="Ej: 100"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Calentamiento de agua de piscina (AE_CAP · ficha TER100) ─────────────────
// Tercer sumando del ahorro en TER100, y el que casi nunca aplica: nace SIEMPRE
// desactivado y se habilita a mano. Mientras `activa` sea false no entra en la
// fórmula (D_CAP no suma) ni se imprime en el certificado.
//
// El SCOP_pwh se introduce A MANO desde la ficha técnica del equipo: no sale del
// catálogo `aerotermia` (que trae SCOP de calefacción y η de ACS, no de piscina)
// ni se interpola por temperatura de impulsión — el Anexo VII de la ficha da un
// coeficiente estacional propio para el calentamiento de piscinas.
function PiscinaSection({ data, onChange, readOnly }) {
    const piscina = data || {};
    const equipo = piscina.equipo || {};
    const set = (patch) => onChange({ ...piscina, ...patch });
    const setEquipo = (patch) => onChange({ ...piscina, equipo: { ...equipo, ...patch } });

    return (
        <div className="bg-slate-950/80 border border-cyan-500/20 p-5 rounded-2xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 bg-cyan-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
            <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Calentamiento de agua de piscina · AE_CAP</span>
                    <span className="text-[10px] text-white/35">Tercer sumando del ahorro en TER100. Casi nunca aplica: actívalo solo si la actuación calienta el agua de una piscina.</span>
                </div>
                <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => !readOnly && set({ activa: !piscina.activa })}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl transition-all duration-300 border text-xs font-black uppercase tracking-tight ${
                        piscina.activa
                            ? 'bg-cyan-500 text-bkg-deep border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                            : 'text-slate-500 border-white/10 hover:text-white'
                    } disabled:cursor-default`}
                >
                    {piscina.activa ? 'Piscina incluida' : 'Incluir piscina'}
                </button>
            </div>

            {piscina.activa && (
                <div className="space-y-3 relative z-10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field
                            label="D_CAP — Demanda anual de piscina (kWh/año)"
                            type="number"
                            value={piscina.demanda_kwh ?? ''}
                            onChange={v => set({ demanda_kwh: v })}
                            readOnly={readOnly}
                            placeholder="Según la instalación existente o el Anexo III del Pliego IDAE"
                        />
                        <Field
                            label="SCOP_pwh — Rendimiento estacional en piscina (W/W)"
                            type="number"
                            value={piscina.scop ?? ''}
                            onChange={v => set({ scop: v })}
                            readOnly={readOnly}
                            placeholder="De la ficha técnica del equipo"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Marca del equipo" value={equipo.marca ?? ''} onChange={v => setEquipo({ marca: v })} readOnly={readOnly} />
                        <Field label="Modelo" value={equipo.modelo ?? ''} onChange={v => setEquipo({ modelo: v })} readOnly={readOnly} />
                        <Field label="Número de serie" value={equipo.numero_serie ?? ''} onChange={v => setEquipo({ numero_serie: v })} readOnly={readOnly} />
                    </div>
                    {!(parseFloat(piscina.demanda_kwh) > 0 && parseFloat(piscina.scop) > 0) && (
                        <div className="flex items-start gap-2 bg-amber-500/[0.07] border border-amber-500/25 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex-shrink-0">Falta dato</span>
                            <span className="text-[10px] text-white/45 leading-relaxed">
                                Sin D_CAP y SCOP_pwh el sumando de piscina vale 0: no aporta ahorro al expediente ni se puede justificar en el certificado.
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Enlaces de referencia del equipo elegido ─────────────────────────────────
// La ficha técnica del catálogo es EXACTAMENTE el documento que el backend copia a
// Drive y fusiona como anexo del CIFO para justificar el SCOP (ver
// cifoService.ensureScopAnnexes), y el enlace EPREL es el que se imprime en la
// justificación cuando el método es EPREL / depósito en conjunto. Se muestran aquí
// para poder ABRIRLOS Y CONFIRMAR LOS DATOS sin salir del expediente → siempre en
// pestaña nueva (target="_blank"), nunca navegando en la actual.
//
// Origen del enlace: primero el catálogo vivo (`model`, la fila de `aerotermia`) y,
// si el catálogo ya no lo trae, el snapshot guardado en el expediente
// (`url_ficha` / `url_eprel` / `url_keymark`), que es lo que leen los documentos.
function EquipoRefLinks({ model, data, metodoScop = null }) {
    const ficha   = model?.ficha_tecnica || data?.url_ficha   || null;
    const eprel   = model?.eprel         || data?.url_eprel   || null;
    const keymark = model?.url_keymark   || data?.url_keymark || null;

    // Qué documento justifica el SCOP según el método:
    //   calefacción → 'ficha' | 'eprel'
    //   ACS         → 'ficha' | 'conjunto' (η_wh de EPREL) | 'independiente' (COP de la ficha)
    const metodo = metodoScop || 'ficha';
    const justifica = (metodo === 'eprel' || metodo === 'conjunto') ? 'eprel' : 'ficha';

    const links = [
        { id: 'ficha',   label: 'Ficha técnica', url: ficha },
        { id: 'eprel',   label: 'EPREL',         url: eprel },
        { id: 'keymark', label: 'KEYMARK',       url: keymark },
    ].filter(l => l.url);

    // Solo avisamos de que falta el justificante cuando TENEMOS la fila del catálogo:
    // mientras el catálogo carga (o si la marca no casa) `model` es undefined y un
    // aviso ahí sería una falsa alarma.
    const faltaJustificante = !!metodoScop && !!model && (justifica === 'ficha' ? !ficha : !eprel);

    if (!links.length && !faltaJustificante) return null;

    return (
        <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-1.5">
                {links.map(l => {
                    const esJustificante = metodoScop && l.id === justifica;
                    return (
                        <a
                            key={l.id}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={esJustificante
                                ? `${l.label} — es el documento que justifica el SCOP en el anexo del CIFO. Se abre en una pestaña nueva.`
                                : `${l.label} — se abre en una pestaña nueva.`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                                esJustificante
                                    ? 'bg-brand/15 border-brand/40 text-brand hover:bg-brand/25'
                                    : 'bg-bkg-elevated border-white/10 text-white/45 hover:text-white hover:border-white/25'
                            }`}
                        >
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {l.label}
                            {esJustificante && <span className="font-bold normal-case tracking-normal opacity-70">· justifica el SCOP</span>}
                        </a>
                    );
                })}
            </div>
            {faltaJustificante && (
                <p className="text-[10px] text-amber-400/90 font-semibold">
                    ⚠ El catálogo no tiene {justifica === 'ficha' ? 'ficha técnica' : 'enlace EPREL'} para este modelo:
                    el CIFO no podrá adjuntarla como justificación del SCOP. Añádela en el módulo Aerotermia.
                </p>
            )}
        </div>
    );
}

// ─── Sección Aerotermia Nueva ─────────────────────────────────────────────────
function AerotermiaSection({ title, data, onChange, marcas, modelosPorMarca, tipoEmisor, zona = 'D3', isAcs = false, readOnly = false, calData = null }) {
    // Zona climática REAL de la instalación (la de la oportunidad). El Anexo III de
    // la ficha RES060 la equipara a la temporada europea del Rgto. 813/2013: A3-D3
    // → cálidas, E1 → medias. De ahí sale qué columna del catálogo se aplica, así
    // que NO puede quedarse en un 'D3' por defecto: en E1 tocaría el SCOP medio.
    const zonaCE = zona || 'D3';
    const brandOptions = marcas.map(m => ({ value: m.nombre, label: m.nombre, logo: m.logo, acronimo: m.nombre }));
    const availableModels = data?.marca ? (modelosPorMarca[data.marca.toUpperCase()] || []) : [];
    // La etiqueta principal es el nombre comercial + potencia, pero muchos modelos
    // comparten nombre y potencia (p. ej. dos "All in One 16 kW" con unidad exterior
    // distinta: WH-UD16HE5 vs WH-UD16HE8). Se muestra la referencia de la ud. exterior
    // (y la interior) como sublínea para poder distinguirlos y filtrar por ella.
    const modelOptions = availableModels.map(m => {
        // Línea 1: nombre comercial + potencia. Línea 2 (co-protagonista, resaltada):
        // la unidad exterior, que es la referencia de la placa. El par comercial +
        // ud. exterior es lo que evita equivocarse al elegir entre modelos gemelos.
        const ext = m.modelo_ud_exterior ? `Ud. ext: ${m.modelo_ud_exterior}` : '';
        const int = m.modelo_ud_interior ? `int: ${m.modelo_ud_interior}` : '';
        const sub = [ext, int].filter(Boolean).join('  ·  ');
        return {
            value: String(m.id),
            label: `${m.modelo_comercial || m.modelo_conjunto || ''}${m.potencia_calefaccion ? ` · ${m.potencia_calefaccion} kW` : ''}`,
            sublabel: sub || (m.modelo_conjunto ? `Conjunto: ${m.modelo_conjunto}` : ''),
        };
    });

    // Tipo del equipo NUEVO: solo la columna de ACS admite algo que no sea una
    // bomba de calor (acumulador o termo eléctrico). Ver logic/aerotermiaUnits.js.
    const tipoNuevo = isAcs ? tipoEquipoNuevo(data) : EQUIPO_NUEVO.BDC;
    const esTermo = tipoNuevo === EQUIPO_NUEVO.TERMO;
    const esAcumulador = tipoNuevo === EQUIPO_NUEVO.ACUMULADOR;

    // El input de litros de acumulación ACS solo aplica si el modelo de ACS
    // seleccionado lleva depósito incluido (deposito_acs_incluido = true). El termo
    // eléctrico SIEMPRE acumula, y el acumulador ES un depósito: ahí el campo va
    // suelto (opcional).
    const selectedModel = availableModels.find(m => String(m.id) === String(data?.aerotermia_db_id));
    const showLitros = isAcs && (esTermo || esAcumulador || !!selectedModel?.deposito_acs_incluido);

    // ── ACUMULADOR de ACS ─────────────────────────────────────────────────────
    // El depósito NO está en el catálogo de aerotermia: marca, modelo y nº de serie
    // son datos suyos y se escriben a mano (opcionales). Lo que sí sale del catálogo
    // es el SCOP_dhw, porque quien calienta el depósito es la BOMBA DE CALOR DE
    // CALEFACCIÓN: se calcula por Anexo VI sobre SU COP A7/55 y se justifica con SU
    // ficha técnica. Por eso la sección de ACS recibe `calData`.
    const calModel = (isAcs && calData?.marca)
        ? ((modelosPorMarca[calData.marca.toUpperCase()] || []).find(m => String(m.id) === String(calData.aerotermia_db_id)) || null)
        : null;

    // ── Instalación EN CASCADA ────────────────────────────────────────────────
    // `data.equipos_extra` guarda las unidades 2..N. Todo cambio pasa por emit(),
    // que recalcula el SCOP APLICADO (el MENOR de las unidades) y lo deja en
    // `data.scop` — el campo que leen el CIFO, las fichas RES y el cálculo de
    // ahorro. Ver logic/aerotermiaUnits.js.
    const emit = (next) => onChange(withScopAplicado(next));

    // Datos PROPIOS del depósito acumulador. Los nodos guardados antes de que fueran
    // manuales arrastran los de la BdC de calefacción (aún apuntan al catálogo): se
    // muestran vacíos, igual que hacen los documentos. Ver logic/aerotermiaUnits.js.
    const acum = datosAcumulador(data);
    // Escribir cualquiera de los tres datos convierte el nodo en manual: se sueltan
    // las referencias al catálogo para que no reaparezcan en el CIFO.
    const emitAcumulador = (patch) => emit({
        ...data,
        aerotermia_db_id: null,
        modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '',
        marca: acum.marca, modelo: acum.modelo, numero_serie: acum.serie,
        ...patch,
    });

    const extras = Array.isArray(data?.equipos_extra) ? data.equipos_extra : [];
    const nUnidades = countUnidades(data);
    const scopPropio = scopPropioUnidad1(data);
    const scopMin = scopAplicado(data);

    // Añadir equipo: hereda marca/modelo/SCOP de la unidad 1 (el caso normal en
    // cascada es repetir el mismo equipo) y deja el nº de serie vacío, que es
    // siempre distinto y obligatorio en CIFO / Anexo I / memoria RITE.
    const handleAddEquipo = () => {
        emit({
            ...data,
            equipos_extra: [...extras, {
                aerotermia_db_id: data?.aerotermia_db_id ?? null,
                marca: data?.marca || '',
                modelo: data?.modelo || '',
                modelo_ud_exterior: data?.modelo_ud_exterior || '',
                modelo_ud_interior: data?.modelo_ud_interior || '',
                modelo_conjunto: data?.modelo_conjunto || '',
                scop: scopPropio ?? null,
                potencia: data?.potencia ?? 0,
                metodo_scop: data?.metodo_scop || 'ficha',
                numero_serie: '',
            }],
        });
    };

    const handleRemoveEquipo = (idx) => {
        emit({ ...data, equipos_extra: extras.filter((_, i) => i !== idx) });
    };

    const handleExtraChange = (idx, patch) => {
        emit({ ...data, equipos_extra: extras.map((u, i) => (i === idx ? { ...u, ...patch } : u)) });
    };

    // Cambio de modelo en una unidad extra: mismo lookup en el catálogo que la
    // unidad 1, para que arrastre ud. exterior, SCOP y potencia reales.
    const handleExtraModeloChange = (idx, idStr) => {
        const found = availableModels.find(m => String(m.id) === String(idStr));
        if (!found) {
            handleExtraChange(idx, { aerotermia_db_id: null, modelo: '', modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '', scop: null });
            return;
        }
        const method = extras[idx]?.metodo_scop || data?.metodo_scop || 'ficha';
        const scop = isAcs
            ? getScopAcsFromModel(found, zonaCE, method)
            : getScopFromModel(found, zonaCE, getEmitterTemp(tipoEmisor), method);
        handleExtraChange(idx, {
            // Temporada de la que sale ese SCOP: viaja con el número (ver abajo).
            scop_temporada: isAcs ? null : getScopSeason(found, zonaCE, getEmitterTemp(tipoEmisor), method),
            aerotermia_db_id: found.id,
            modelo: found.modelo_comercial || found.modelo_conjunto || found.modelo_exterior || '',
            modelo_ud_exterior: found.modelo_ud_exterior || '',
            modelo_ud_interior: found.modelo_ud_interior || '',
            modelo_conjunto: found.modelo_conjunto || '',
            potencia: found.potencia_calefaccion || found.potencia_nominal_35 || 0,
            scop,
        });
    };

    const handleMarcaChange = (brand) => {
        emit({ ...data, marca: brand, aerotermia_db_id: null, modelo: '', modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '', scop: null, metodo_scop: 'ficha' });
    };

    const handleModeloChange = (idStr) => {
        const hexId = String(idStr);
        const found = availableModels.find(m => String(m.id) === hexId);
        
        if (found) {
            const method = data?.metodo_scop || 'ficha';
            let scop;
            if (isAcs) {
                scop = getScopAcsFromModel(found, zonaCE, method);
            } else {
                const temp = getEmitterTemp(tipoEmisor);
                scop = getScopFromModel(found, zonaCE, temp, method);
            }

            emit({
                ...data,
                // La TEMPORADA de referencia del SCOP se sella junto al valor: el
                // Cb del RES093 calcula la carga de diseño con las horas
                // equivalentes de esa misma temporada, y el CIFO la declara. Se
                // guarda aquí, en el mismo sitio y con los mismos argumentos que
                // el número, para que no puedan divergir.
                scop_temporada: isAcs ? null : getScopSeason(found, zonaCE, getEmitterTemp(tipoEmisor), method),
                aerotermia_db_id: found.id,
                modelo: found.modelo_comercial || found.modelo_conjunto || found.modelo_exterior || '',
                // Snapshot de las referencias del catálogo en el expediente: el CIFO y
                // demás documentos leen de aquí, no del catálogo. La ud. exterior es la
                // que figura en la placa de las fotos → debe viajar con el expediente.
                modelo_ud_exterior: found.modelo_ud_exterior || '',
                modelo_ud_interior: found.modelo_ud_interior || '',
                modelo_conjunto: found.modelo_conjunto || '',
                scop,
                potencia: found.potencia_calefaccion || found.potencia_nominal_35 || 0,
                metodo_scop: method,
                url_eprel: found.eprel,
                url_keymark: found.url_keymark,
                url_ficha: found.ficha_tecnica,
                // Solo en ACS: precargar litros desde el catálogo del modelo (litros_acs)
                // si lleva depósito; si no, limpiarlo. Editable como override en el expediente.
                ...(isAcs ? { litros: found.deposito_acs_incluido ? (found.litros_acs ?? '') : null } : {})
            });
        } else {
            emit({ ...data, aerotermia_db_id: null, modelo: '', modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '', scop: null });
        }
    };

    const handleMethodChange = (method) => {
        // En un acumulador el SCOP_dhw sale del equipo de CALEFACCIÓN (es quien
        // calienta el depósito); en el resto, del modelo elegido en esta columna.
        const found = esAcumulador ? calModel : availableModels.find(m => String(m.id) === String(data?.aerotermia_db_id));
        if (found) {
            let scop;
            if (isAcs) {
                scop = getScopAcsFromModel(found, zonaCE, method);
            } else {
                const temp = getEmitterTemp(tipoEmisor);
                scop = getScopFromModel(found, zonaCE, temp, method);
            }
            emit({
                ...data,
                metodo_scop: method,
                scop,
                scop_temporada: isAcs ? null : getScopSeason(found, zonaCE, getEmitterTemp(tipoEmisor), method),
                // El enlace EPREL/KEYMARK/ficha se persiste también al cambiar de
                // método (no solo al elegir modelo): el certificado los lee del
                // snapshot del expediente, no del catálogo. Sin esto, poner método
                // 'eprel' deja url_eprel en null y el enlace no se imprime en el CIFO.
                url_eprel: found.eprel ?? data?.url_eprel ?? null,
                url_keymark: found.url_keymark ?? data?.url_keymark ?? null,
                url_ficha: found.ficha_tecnica ?? data?.url_ficha ?? null,
            });
        } else {
            emit({ ...data, metodo_scop: method });
        }
    };

    // Tipo de equipo NUEVO (solo columna ACS). Tres casos:
    //   · BdC         → bomba de calor aerotérmica del catálogo (caso normal).
    //   · Acumulador  → el depósito lo calienta la propia BdC de calefacción (no
    //                   hay BdC dedicada para ACS): cálculo por Anexo VI y el CIFO
    //                   lo imprime como "Acumulador ACS" con serie "No aplica".
    //   · Termo       → resistencia eléctrica (efecto Joule): NO está en el
    //                   catálogo de aerotermia y su rendimiento es 1 por
    //                   definición, así que marca/modelo pasan a texto libre
    //                   (opcionales) y no hay SCOP que justificar.
    const handleTipoNuevoChange = (tipo) => {
        const prev = tipoEquipoNuevo(data);
        if (tipo === prev) return;

        if (tipo === EQUIPO_NUEVO.TERMO) {
            emit({
                ...data,
                tipo_equipo_nuevo: EQUIPO_NUEVO.TERMO,
                es_acumulador: false,
                // Se sueltan TODAS las referencias del catálogo: si quedaran, el
                // CIFO/RES080 imprimiría la ficha técnica de una aerotermia que no
                // se ha instalado.
                aerotermia_db_id: null,
                marca: '', modelo: '',
                modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '',
                url_eprel: null, url_keymark: null, url_ficha: null,
                metodo_scop: null,
                equipos_extra: [],
                scop_propio: null,
                scop: RENDIMIENTO_JOULE,
                potencia: null,
            });
            return;
        }

        // Al salir del termo o del acumulador, marca/modelo/serie eran texto libre
        // (del termo o del depósito) → no valen para el catálogo. Se limpian para
        // obligar a elegir el equipo real.
        const base = (prev === EQUIPO_NUEVO.TERMO || prev === EQUIPO_NUEVO.ACUMULADOR)
            ? {
                ...data,
                marca: '', modelo: '', numero_serie: '', litros: null,
                aerotermia_db_id: null, scop: null, scop_propio: null,
            }
            : data;

        if (tipo === EQUIPO_NUEVO.ACUMULADOR) {
            // El acumulador no es un equipo del catálogo: se sueltan TODAS las
            // referencias (marca, modelo, unidades, nº de serie) porque a partir de
            // aquí esos tres datos son los del DEPÓSITO y se escriben a mano.
            // El SCOP_dhw sí se calcula: lo calienta la BdC de CALEFACCIÓN, así que
            // sale de su COP A7/55 por el Anexo VI, y su ficha técnica es la que lo
            // justifica en el CIFO.
            const scop = calModel
                ? getScopAcsFromModel(calModel, zonaCE, 'independiente')
                : base?.scop ?? null;
            emit({
                ...base,
                tipo_equipo_nuevo: EQUIPO_NUEVO.ACUMULADOR,
                es_acumulador: true,
                metodo_scop: 'independiente',
                scop,
                scop_propio: null,
                aerotermia_db_id: null,
                marca: '', modelo: '', numero_serie: '',
                modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '',
                equipos_extra: [],
                ...(calModel ? {
                    url_eprel: calModel.eprel ?? null,
                    url_keymark: calModel.url_keymark ?? null,
                    url_ficha: calModel.ficha_tecnica ?? null,
                } : {}),
            });
            return;
        }

        emit({
            ...base,
            tipo_equipo_nuevo: EQUIPO_NUEVO.BDC,
            es_acumulador: false,
            metodo_scop: base?.metodo_scop || 'ficha',
        });
    };

    return (
        <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] space-y-3">
            <h4 className="text-xs font-black text-brand/80 uppercase tracking-wider">
                {esTermo ? (isAcs ? 'Equipo Nuevo — ACS' : title) : title}
            </h4>

            {/* Tipo de equipo nuevo (solo ACS): no siempre se instala aerotermia. */}
            {isAcs && (
                <div className="space-y-1">
                    <label className="block text-[10px] text-brand/50 uppercase tracking-wider font-bold">
                        Tipo de equipo nuevo de ACS
                    </label>
                    <div className="flex flex-wrap gap-1 bg-bkg-elevated p-1 rounded-lg border border-white/5">
                        {[
                            { id: EQUIPO_NUEVO.BDC,        label: 'Bomba de calor' },
                            { id: EQUIPO_NUEVO.ACUMULADOR, label: 'Acumulador ACS' },
                            { id: EQUIPO_NUEVO.TERMO,      label: 'Termo eléctrico' },
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => !readOnly && handleTipoNuevoChange(t.id)}
                                disabled={readOnly}
                                className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    tipoNuevo === t.id
                                        ? 'bg-brand text-bkg-deep'
                                        : 'text-white/40 hover:text-white disabled:opacity-50'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {esAcumulador && (
                        <p className="text-[10px] text-white/30">
                            El depósito lo calienta la BdC de calefacción y su SCOP<sub>dhw</sub> sale del Anexo VI sobre el COP de ese equipo. Marca, modelo y nº de serie son los del DEPÓSITO y se escriben a mano: si se rellenan salen en el CIFO y en el Anexo I; si se dejan en blanco, el CIFO imprime «No aplica» y el Anexo I no declara nº de serie de la ud. interior.
                        </p>
                    )}
                    {esTermo && (
                        <div className="flex items-start gap-2 bg-amber-500/[0.07] border border-amber-500/25 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex-shrink-0">No computa</span>
                            <span className="text-[10px] text-white/45 leading-relaxed">
                                Resistencia eléctrica: rendimiento = 1 (efecto Joule). No es actuación elegible, así que el ACS sale de la fórmula de ahorro y solo se refleja como información en el certificado. Marca, modelo y nº de serie son opcionales.
                            </span>
                        </div>
                    )}
                </div>
            )}

            {!esTermo && !esAcumulador && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SearchableSelect
                    label="Marca"
                    options={brandOptions}
                    value={data?.marca ?? ''}
                    onChange={handleMarcaChange}
                    disabled={readOnly}
                    searchPlaceholder="Buscar marca..."
                />
                <SearchableSelect
                    label="Modelo"
                    options={modelOptions}
                    value={String(data?.aerotermia_db_id ?? '')}
                    onChange={handleModeloChange}
                    disabled={readOnly || !data?.marca}
                    showAvatar={false}
                    searchPlaceholder="Buscar por nombre o referencia (p. ej. UD16HE5)..."
                    placeholder={data?.marca ? '— Selecciona —' : '— Elige marca primero —'}
                />
            </div>
            )}

            {/* Termo eléctrico: no está en el catálogo de aerotermia → marca y modelo
                a mano y OPCIONALES (muchas veces solo se sabe que es un termo). */}
            {esTermo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                        label="Marca (opcional)"
                        value={data?.marca ?? ''}
                        onChange={v => emit({ ...data, marca: v })}
                        readOnly={readOnly}
                        placeholder="Si no se conoce, en blanco"
                    />
                    <Field
                        label="Modelo (opcional)"
                        value={data?.modelo ?? ''}
                        onChange={v => emit({ ...data, modelo: v })}
                        readOnly={readOnly}
                        placeholder="Si no se conoce, en blanco"
                    />
                </div>
            )}

            {/* Acumulador ACS: el depósito tampoco está en el catálogo de aerotermia
                → marca, modelo y nº de serie son SUYOS y se escriben a mano. Son
                opcionales: si no se declaran, ni el CIFO ni el Anexo I los inventan. */}
            {esAcumulador && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                        label="Marca del depósito (opcional)"
                        value={acum.marca}
                        onChange={v => emitAcumulador({ marca: v })}
                        readOnly={readOnly}
                        placeholder="Si no se conoce, en blanco"
                    />
                    <Field
                        label="Modelo del depósito (opcional)"
                        value={acum.modelo}
                        onChange={v => emitAcumulador({ modelo: v })}
                        readOnly={readOnly}
                        placeholder="Si no se conoce, en blanco"
                    />
                </div>
            )}

            {/* Confirmación del equipo elegido: la ud. exterior es la referencia de la
                placa que debe coincidir con las fotos y viaja al CIFO. Editable como
                override por si el catálogo no la trae o es incorrecta. */}
            {!esTermo && !esAcumulador && data?.aerotermia_db_id && (
                <div className="bg-brand/[0.06] border border-brand/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        <span className="text-[10px] font-black text-brand uppercase tracking-widest">Equipo seleccionado</span>
                    </div>
                    <div>
                        <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">
                            Modelo unidad exterior <span className="text-white/25 normal-case tracking-normal">· debe coincidir con la foto de la placa</span>
                        </label>
                        <input
                            type="text"
                            value={data?.modelo_ud_exterior ?? ''}
                            onChange={e => emit({ ...data, modelo_ud_exterior: e.target.value.toUpperCase() })}
                            readOnly={readOnly}
                            placeholder="Ej: WH-UD16HE5"
                            className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm font-mono tracking-wide focus:outline-none ${
                                readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-brand/30 focus:border-brand/60'
                            }`}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {data?.modelo_ud_interior && (
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-white/30 uppercase tracking-wider font-bold text-[9px] flex-shrink-0">Ud. interior:</span>
                                <span className="text-white/70 font-mono truncate">{data.modelo_ud_interior}</span>
                            </div>
                        )}
                        {data?.modelo_conjunto && (
                            <div className="flex items-center gap-1.5 min-w-0 sm:col-span-2">
                                <span className="text-white/30 uppercase tracking-wider font-bold text-[9px] flex-shrink-0">Conjunto:</span>
                                <span className="text-white/50 truncate">{data.modelo_conjunto}</span>
                            </div>
                        )}
                    </div>
                    {!data?.modelo_ud_exterior && (
                        <p className="text-[10px] text-amber-400/90 font-semibold">⚠ Este modelo no tiene referencia de unidad exterior en el catálogo. Escríbela a mano para que aparezca en el CIFO.</p>
                    )}
                    {/* Documentación del equipo: la ficha técnica/EPREL que acabará
                        justificando el SCOP en el anexo del CIFO. Abrir en pestaña
                        nueva para confirmar los datos sin perder el expediente. */}
                    <EquipoRefLinks
                        model={selectedModel}
                        data={data}
                        metodoScop={data?.metodo_scop || 'ficha'}
                    />
                </div>
            )}

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs text-brand/40 uppercase tracking-wider font-bold">
                    <svg className="w-3 h-3 text-brand/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Número de serie{(esTermo || esAcumulador) && <span className="text-white/25 normal-case tracking-normal"> · opcional</span>}
                </label>
                <input
                    type="text"
                    value={esAcumulador ? acum.serie : (data?.numero_serie ?? '')}
                    onChange={v => (esAcumulador
                        ? emitAcumulador({ numero_serie: v.target.value })
                        : emit({ ...data, numero_serie: v.target.value }))}
                    readOnly={readOnly}
                    placeholder={esAcumulador ? 'Del depósito. Si no lo tiene, en blanco' : (esTermo ? 'Si no se conoce, en blanco' : '')}
                    className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                        readOnly ? 'border-white/5 text-white/40 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                    }`}
                />
            </div>

            <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs text-brand/40 uppercase tracking-wider font-bold">
                    <svg className="w-3.5 h-3.5 text-brand/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {esTermo ? 'Rendimiento' : 'SCOP (rendimiento)'}
                </label>
                <div className="space-y-2">
                    {esTermo ? (
                        // Efecto Joule: el rendimiento es 1 por definición, no se edita
                        // ni se justifica con ficha técnica.
                        <div className="flex items-center justify-between gap-2 bg-brand/[0.06] border border-brand/20 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-black text-brand uppercase tracking-widest">
                                Efecto Joule · rendimiento fijo
                            </span>
                            <span className="text-sm font-mono font-bold text-white">1,00</span>
                        </div>
                    ) : isAcs ? (
                        // ACS: 3 opciones de método
                        <div className="flex flex-wrap gap-1 bg-bkg-elevated p-1 rounded-lg border border-white/5">
                            {[
                                { id: 'ficha',       label: 'Ficha Técnica' },
                                { id: 'conjunto',    label: 'Dep. Conjunto (Anexo IV)' },
                                { id: 'independiente', label: 'Dep. Independiente (Anexo VI)' },
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
                    ) : (
                        // Calefacción: 2 opciones sin cambios
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
                    )}
                    {/* Aviso si faltan datos para el método ACS seleccionado. En un
                        acumulador el dato hay que buscarlo en el modelo de la BdC de
                        CALEFACCIÓN, que es la que calienta el depósito. */}
                    {isAcs && !esTermo && (() => {
                        const method = data?.metodo_scop || 'ficha';
                        const found = esAcumulador ? calModel : availableModels.find(m => String(m.id) === String(data?.aerotermia_db_id));
                        if (!found) {
                            return esAcumulador
                                ? <p className="text-[10px] text-amber-400/90 font-semibold">⚠ Elige primero el equipo de calefacción: el SCOP<sub>dhw</sub> del acumulador se calcula desde su COP. Mientras tanto, escribe el SCOP a mano.</p>
                                : null;
                        }
                        if (method === 'conjunto' && !found.eta_acs_calida && !found.eta_acs_media) {
                            return <p className="text-[10px] text-amber-400/90 font-semibold">⚠ El modelo no tiene η ACS (eta_acs_calida / eta_acs_media). Rellena esos campos en la base de datos de aerotermia.</p>;
                        }
                        if (method === 'independiente' && !found.cop_a7_55) {
                            return <p className="text-[10px] text-amber-400/90 font-semibold">⚠ El modelo no tiene COP A7/55. Rellena ese campo en la base de datos de aerotermia.</p>;
                        }
                        return null;
                    })()}
                    {!esTermo && (
                        <input
                            type="number"
                            step="0.01"
                            value={scopPropio ?? ''}
                            onChange={e => emit({ ...data, scop: e.target.value, scop_propio: e.target.value })}
                            readOnly={readOnly}
                            className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                                readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                            }`}
                            placeholder={esAcumulador ? 'Anexo VI sobre el COP de la BdC de calefacción' : 'Se obtiene del modelo'}
                        />
                    )}
                    {/* En cascada el SCOP que entra en la fórmula de ahorro es el MENOR
                        de todas las unidades (criterio conservador: nunca sobreestima
                        el ahorro declarado). Se recalcula solo. */}
                    {nUnidades > 1 && (
                        <div className="flex items-center justify-between gap-2 bg-brand/[0.06] border border-brand/20 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-black text-brand uppercase tracking-widest">
                                SCOP aplicado · el menor de {nUnidades} uds.
                            </span>
                            <span className="text-sm font-mono font-bold text-white">
                                {scopMin != null ? Number(scopMin).toFixed(2).replace('.', ',') : '—'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* ── EQUIPOS ADICIONALES (instalación en cascada) ────────────────── */}
            {extras.map((u, idx) => (
                <div key={idx} className="bg-bkg-elevated/40 rounded-xl p-3 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                            Equipo {idx + 2} · cascada
                        </span>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => handleRemoveEquipo(idx)}
                                className="text-[10px] font-bold uppercase tracking-wider text-red-400/70 hover:text-red-400 transition-colors"
                            >
                                ✕ Quitar
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <SearchableSelect
                            label="Marca"
                            options={brandOptions}
                            value={u?.marca ?? ''}
                            onChange={(brand) => handleExtraChange(idx, { marca: brand, aerotermia_db_id: null, modelo: '', modelo_ud_exterior: '', modelo_ud_interior: '', modelo_conjunto: '', scop: null })}
                            disabled={readOnly}
                            searchPlaceholder="Buscar marca..."
                        />
                        <SearchableSelect
                            label="Modelo"
                            options={(u?.marca ? (modelosPorMarca[u.marca.toUpperCase()] || []) : []).map(m => ({
                                value: String(m.id),
                                label: `${m.modelo_comercial || m.modelo_conjunto || ''}${m.potencia_calefaccion ? ` · ${m.potencia_calefaccion} kW` : ''}`,
                                sublabel: [m.modelo_ud_exterior ? `Ud. ext: ${m.modelo_ud_exterior}` : '', m.modelo_ud_interior ? `int: ${m.modelo_ud_interior}` : ''].filter(Boolean).join('  ·  '),
                            }))}
                            value={String(u?.aerotermia_db_id ?? '')}
                            onChange={(idStr) => handleExtraModeloChange(idx, idStr)}
                            disabled={readOnly || !u?.marca}
                            showAvatar={false}
                            searchPlaceholder="Buscar por nombre o referencia..."
                            placeholder={u?.marca ? '— Selecciona —' : '— Elige marca primero —'}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">
                                Modelo ud. exterior
                            </label>
                            <input
                                type="text"
                                value={u?.modelo_ud_exterior ?? ''}
                                onChange={e => handleExtraChange(idx, { modelo_ud_exterior: e.target.value.toUpperCase() })}
                                readOnly={readOnly}
                                placeholder="Ej: WH-UD16HE5"
                                className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm font-mono tracking-wide focus:outline-none ${
                                    readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                                }`}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-brand/50 uppercase tracking-wider mb-1 font-bold">
                                Número de serie <span className="text-amber-400/70">· obligatorio</span>
                            </label>
                            <input
                                type="text"
                                value={u?.numero_serie ?? ''}
                                onChange={e => handleExtraChange(idx, { numero_serie: e.target.value })}
                                readOnly={readOnly}
                                className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                                    readOnly ? 'border-white/5 text-white/60 cursor-not-allowed'
                                        : (u?.numero_serie ? 'border-white/10 focus:border-brand/50' : 'border-amber-500/40 focus:border-amber-400')
                                }`}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1 font-bold">SCOP de este equipo</label>
                        <input
                            type="number"
                            step="0.01"
                            value={u?.scop ?? ''}
                            onChange={e => handleExtraChange(idx, { scop: e.target.value })}
                            readOnly={readOnly}
                            placeholder="Se obtiene del modelo"
                            className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                                readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                            }`}
                        />
                    </div>

                    {/* Misma documentación para las unidades en cascada: sin badge de
                        justificación, porque el SCOP del CIFO se justifica con la
                        unidad 1 (el aplicado es el MENOR, ver aerotermiaUnits.js). */}
                    <EquipoRefLinks
                        model={(u?.marca ? (modelosPorMarca[u.marca.toUpperCase()] || []) : []).find(m => String(m.id) === String(u?.aerotermia_db_id))}
                        data={u}
                    />
                </div>
            ))}

            {/* Añadir equipo: solo tiene sentido con la unidad 1 ya elegida, porque
                el equipo nuevo hereda su marca/modelo/SCOP. En ACS no aplica si es
                un mero acumulador ni un termo (no hay BdC que poner en cascada). */}
            {!readOnly && !esAcumulador && !esTermo && (
                <button
                    type="button"
                    onClick={handleAddEquipo}
                    disabled={!data?.aerotermia_db_id && !data?.marca}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-brand/30 text-brand/80 text-[11px] font-black uppercase tracking-widest hover:bg-brand/[0.06] hover:border-brand/50 hover:text-brand transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title={!data?.aerotermia_db_id && !data?.marca ? 'Elige primero el equipo principal' : 'Instalación en cascada: añade otra unidad'}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    Añadir equipo (cascada)
                </button>
            )}

            {showLitros && (
                <div className="space-y-1">
                    <label className="flex items-center gap-1.5 text-xs text-brand/40 uppercase tracking-wider font-bold">
                        <svg className="w-3.5 h-3.5 text-brand/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12a7 7 0 1014 0c0-3-2.5-6-7-10-4.5 4-7 7-7 10z" />
                        </svg>
                        Litros de acumulación ACS
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={data?.litros ?? ''}
                        onChange={e => emit({ ...data, litros: e.target.value })}
                        readOnly={readOnly}
                        placeholder="Ej: 200"
                        className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                            readOnly ? 'border-white/5 text-white/60 cursor-not-allowed' : 'border-white/10 focus:border-brand/50'
                        }`}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Combobox con búsqueda ────────────────────────────────────────────────────
function SearchableSelect({ value, onChange, options, label, placeholder = '— Selecciona —', searchPlaceholder = 'Buscar...', disabled = false, showAvatar = true, dropUp = false }) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const containerRef = React.useRef(null);
    const inputRef = React.useRef(null);

    const selected = options.find(o => String(o.value) === String(value));
    const filtered = query
        ? options.filter(o => `${o.label} ${o.sublabel || ''}`.toLowerCase().includes(query.toLowerCase()))
        : options;

    React.useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    React.useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleOpen = () => {
        if (disabled) return;
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleSelect = (optValue) => {
        onChange(optValue);
        setOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            {label && <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>}
            <button
                type="button"
                onClick={handleOpen}
                disabled={disabled}
                className={`w-full flex items-center justify-between bg-bkg-elevated border rounded-lg px-3 py-2 text-sm outline-none transition-all text-left ${
                    disabled
                        ? 'border-white/5 text-white/60 cursor-not-allowed'
                        : 'border-white/10 text-white cursor-pointer focus:border-brand/50'
                }`}
            >
                {selected ? (
                    <span className="flex items-center gap-2 min-w-0">
                        {showAvatar && (
                            <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5 border border-white/10">
                                {selected.logo
                                    ? <img src={selected.logo} alt="" className="w-full h-full object-contain" />
                                    : <span className="text-[8px] font-black text-white/40">{(selected.acronimo || selected.label || '?').slice(0, 2).toUpperCase()}</span>
                                }
                            </span>
                        )}
                        <span className="flex flex-col min-w-0">
                            <span className="truncate">{selected.label}</span>
                            {selected.sublabel && <span className="text-[11px] text-brand/80 font-mono font-semibold truncate leading-tight">{selected.sublabel}</span>}
                        </span>
                    </span>
                ) : (
                    <span className="text-white/30">{placeholder}</span>
                )}
                <svg className={`w-4 h-4 ml-2 flex-shrink-0 text-white/20 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className={`absolute z-50 w-full bg-bkg-elevated border border-white/10 rounded-xl shadow-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                    <div className="p-2 border-b border-white/5">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-brand/40"
                        />
                    </div>
                    <ul className="max-h-52 overflow-y-auto">
                        <li
                            onClick={() => handleSelect('')}
                            className="px-3 py-2 text-sm text-white/30 hover:bg-white/5 cursor-pointer"
                        >
                            {placeholder}
                        </li>
                        {filtered.length === 0 && (
                            <li className="px-3 py-2 text-xs text-white/20 italic">Sin resultados</li>
                        )}
                        {filtered.map(o => {
                            const isActive = String(value) === String(o.value);
                            const initials = (o.acronimo || o.label || '?').slice(0, 2).toUpperCase();
                            return (
                                <li
                                    key={o.value}
                                    onClick={() => handleSelect(o.value)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                        isActive ? 'bg-brand/20' : 'hover:bg-white/5'
                                    }`}
                                >
                                    {/* Logo o avatar de iniciales */}
                                    {showAvatar && (
                                        <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center overflow-hidden bg-white/5 border border-white/10">
                                            {o.logo
                                                ? <img src={o.logo} alt="" className="w-full h-full object-contain" />
                                                : <span className="text-[9px] font-black text-white/40">{initials}</span>
                                            }
                                        </div>
                                    )}
                                    <span className="flex flex-col min-w-0">
                                        <span className={`text-sm truncate ${isActive ? 'text-brand font-semibold' : 'text-white/70'}`}>
                                            {o.label}
                                        </span>
                                        {o.sublabel && <span className="text-[11px] text-brand/70 font-mono font-semibold truncate leading-tight">{o.sublabel}</span>}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function InstalacionModule({ expediente, onSave, onLiveUpdate, saving, readOnly = false }) {
    const [marcas, setMarcas] = useState([]);
    const [modelosPorMarca, setModelosPorMarca] = useState({});
    const [prescriptores, setPrescriptores] = useState([]);
    const [fetchingUtm, setFetchingUtm] = useState(false);
    // Override manual de las coordenadas UTM. Por defecto las coords van bloqueadas
    // (se rellenan desde el Catastro vía la RC), pero en parcelas grandes el punto
    // del Catastro no cae sobre la vivienda y hay que poder corregirlas a mano.
    const [editCoords, setEditCoords] = useState(false);
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

        caldera_antigua_cal: { tipo_equipo: 'Caldera', marca: '', modelo: '', numero_serie: '', rendimiento_id: 'default' },
        misma_caldera_acs: true,
        caldera_antigua_acs: { tipo_equipo: 'Caldera', marca: '', modelo: '', numero_serie: '', rendimiento_id: 'default' },
        aerotermia_cal: { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' },
        potencia_bomba: '',
        // Base del % de cobertura para el Cb: 'demanda' (P. de diseño) o 'caldera'
        // (potencia nominal de la caldera existente, que se introduce a mano).
        hibridacion_metodo: HYBRID_METHODS.DEMANDA,
        potencia_caldera: '',
        // Alcance sobre la CALEFACCIÓN. En RES060/RES093 es siempre sí (la actuación
        // ES el cambio de la caldera de calefacción); en TER100 puede haber una
        // sustitución que solo alcance el ACS o la piscina.
        cambio_calefaccion: true,
        cambio_acs: true,
        misma_aerotermia_acs: true,
        aerotermia_acs: { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' },
        // AE_CAP de la ficha TER100. Siempre desactivada por defecto.
        piscina: { activa: false, demanda_kwh: null, scop: null, equipo: { marca: '', modelo: '', numero_serie: '' } },
        instalador_id: null,
        ...(expediente?.instalacion || {}),
        // Normalizar a minúsculas por retrocompatibilidad con datos guardados en mayúsculas por normalizeData
        tipo_emisor: ((expediente?.instalacion?.tipo_emisor) || 'suelo_radiante').toLowerCase(),
        // Normalizar CCAA guardada en mayúsculas por normalizeData al casing del <select>
        ccaa: matchCcaaCase(expediente?.instalacion?.ccaa),
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
            setEditCoords(false);
            const inst = expediente?.instalacion || {};
            setLocal({
                misma_direccion: true,
                cambio_calefaccion: true,
                cambio_acs: true,
                misma_aerotermia_acs: true,
                hibridacion: false,
                potencia_bomba: 0,
                hibridacion_metodo: HYBRID_METHODS.DEMANDA,
                potencia_caldera: '',
                piscina: { activa: false, demanda_kwh: null, scop: null, equipo: { marca: '', modelo: '', numero_serie: '' } },
                ...inst,
                // Normalizar a minúsculas por retrocompatibilidad con datos guardados en mayúsculas
                tipo_emisor: (inst.tipo_emisor || 'suelo_radiante').toLowerCase(),
                // Normalizar CCAA guardada en mayúsculas por normalizeData al casing del <select>
                ccaa: matchCcaaCase(inst.ccaa),
            });
        }
    }, [expediente?.id]);

    const opDatos = expediente?.oportunidades?.datos_calculo || {};
    // Zona climática del CTE de la instalación. El Anexo III de la ficha la equipara
    // a la temporada europea del Rgto. 813/2013 (A3-D3 → cálidas · E1 → medias), y de
    // ahí sale la columna de SCOP del catálogo. Antes se pasaba `zona_climatica` del
    // modelo, columna que NO existe en la tabla `aerotermia`: siempre caía en 'D3' y
    // un expediente en E1 acababa con el SCOP de clima cálido.
    const zonaInstalacion = (opDatos.zona || opDatos.inputs?.zona || 'D3').toUpperCase();
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

    // Obtiene del Catastro (a partir de una RC) SOLO las coordenadas UTM y las
    // vuelca en el estado. Para parcelas grandes donde el punto del Catastro no
    // cae sobre la vivienda (botón "Recalcular desde Catastro").
    const fetchUtmFromRC = async (rc) => {
        if (!rc) return null;
        setFetchingUtm(true);
        try {
            const { data } = await axios.get(`/api/catastro/property-data?rc=${encodeURIComponent(rc)}`);
            const x = String(data?.utm?.x || data?.coordX || '');
            const y = String(data?.utm?.y || data?.coordY || '');
            setLocal(p => ({ ...p, coord_x: x, coord_y: y }));
            return data;
        } catch {
            return null;
        } finally {
            setFetchingUtm(false);
        }
    };

    // Normaliza la respuesta del Catastro a los campos partidos de la dirección de
    // la INSTALACIÓN (la vivienda de la RC). La CCAA no la da el Catastro: se deriva
    // del código de provincia.
    const catastroToAddress = (data) => {
        if (!data) return null;
        const provCode = String(data.provinceCode || '').padStart(2, '0');
        return {
            direccion: data.street || data.address || '',
            codigo_postal: data.postalCode || '',
            municipio: data.municipality || '',
            provincia: data.province || PROVINCE_CODE_TO_NAME[provCode] || '',
            provincia_cod: provCode || '',
            ccaa: PROVINCE_CODE_TO_CCAA[provCode] || '',
            coord_x: String(data?.utm?.x || data?.coordX || ''),
            coord_y: String(data?.utm?.y || data?.coordY || ''),
        };
    };

    // Autorellena los campos partidos de la dirección de la instalación desde el
    // Catastro por la RC (calle/CP/municipio/provincia/CCAA + UTM). Es la dirección
    // de la vivienda del Catastro — la misma capturada en la oportunidad — y NUNCA
    // el domicilio del cliente. Se usa al marcar "dirección distinta" y como cacheo.
    const fillAddressFromCatastro = async (rc) => {
        if (!rc) return null;
        setFetchingUtm(true);
        try {
            const { data } = await axios.get(`/api/catastro/property-data?rc=${encodeURIComponent(rc)}`);
            const addr = catastroToAddress(data);
            if (!addr) return null;
            setLocal(p => ({
                ...p,
                ...Object.fromEntries(Object.entries(addr).filter(([, v]) => v)),
            }));
            return addr;
        } catch {
            return null;
        } finally {
            setFetchingUtm(false);
        }
    };

    // Auto-obtención (1 sola vez por expediente) de la dirección de la instalación
    // desde el Catastro para expedientes antiguos que no la tengan cacheada, y
    // persistencia en `inst`. Así los documentos dejan de caer en la dirección del
    // cliente. Solo cuando es editable (admin) y hay RC pero falta la dirección.
    const autoAddrTriedRef = React.useRef(null);
    useEffect(() => {
        const expId = expediente?.id;
        if (readOnly || !expId) return;
        if (autoAddrTriedRef.current === expId) return;

        const inst0 = expediente?.instalacion || {};
        const dc = expediente?.oportunidades?.datos_calculo || {};
        const opIn = { ...dc, ...(dc.inputs || {}) };
        const yaTieneDir = !!(inst0.direccion || opIn.direccion || opIn.address);
        const rc = inst0.ref_catastral || expediente?.oportunidades?.ref_catastral || '';
        if (yaTieneDir || !rc) return;

        autoAddrTriedRef.current = expId;
        (async () => {
            const addr = await fillAddressFromCatastro(rc);
            if (!addr) return;
            const patch = {
                ...inst0,
                ref_catastral: inst0.ref_catastral || rc,
                ...Object.fromEntries(Object.entries(addr).filter(([, v]) => v)),
            };
            if (onSave) onSave({ instalacion: patch });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expediente?.id, readOnly]);

    const handleMismaDireccionChange = async (val) => {
        if (val) {
            // "Misma dirección": sin dirección custom. Los documentos usarán la
            // dirección de la oportunidad/Catastro. Limpiamos los campos partidos y
            // refrescamos las UTM desde la RC.
            const rc = opRC;
            setEditCoords(false);
            setLocal(p => ({
                ...p, misma_direccion: true, ref_catastral: rc,
                coord_x: '', coord_y: '',
                direccion: '', codigo_postal: '', municipio: '', provincia: '', provincia_cod: '', ccaa: '',
            }));
            await fetchUtmFromRC(rc);
        } else {
            // "Dirección distinta": autorellenamos los campos de dirección desde el
            // Catastro (la dirección de la instalación, la misma capturada en la
            // oportunidad). Quedan editables por si hay que corregirlos a mano.
            const rc = local.ref_catastral || opRC;
            setLocal(p => ({ ...p, misma_direccion: false }));
            await fillAddressFromCatastro(rc);
        }
    };

    const handleTipoEmisorChange = (tipo_emisor) => {
        const temp = getEmitterTemp(tipo_emisor);
        setLocal(p => {
            // Recalcula el SCOP de UNA unidad según el nuevo emisor.
            const recalcUnidad = (u, scopKeys) => {
                if (!u?.aerotermia_db_id) return u;
                const modelos = modelosPorMarca[u.marca?.toUpperCase()] || [];
                const found = modelos.find(m => m.id === u.aerotermia_db_id);
                if (!found) return u;
                const scop = getScopFromModel(found, zonaInstalacion, temp);
                // El emisor cambia la temperatura de impulsión y con ella la columna
                // del catálogo: un modelo puede tener dato de clima cálido a 35 °C y
                // no a 55 °C. La temporada se vuelve a sellar con el SCOP nuevo.
                const scop_temporada = getScopSeason(found, zonaInstalacion, temp);
                return { ...u, scop_temporada, ...Object.fromEntries(scopKeys.map(k => [k, scop])) };
            };
            // En cascada hay que recalcular TODAS las unidades y volver a derivar el
            // SCOP aplicado (el menor), no solo el de la unidad 1.
            const recalcScop = (aero) => {
                if (!aero) return aero;
                const extras = Array.isArray(aero.equipos_extra) ? aero.equipos_extra : [];
                const base = recalcUnidad(aero, extras.length ? ['scop', 'scop_propio'] : ['scop']);
                if (!extras.length) return base;
                const unidades = extras.map(u => recalcUnidad(u, ['scop']));
                // En cascada el SCOP aplicado es el MENOR de las unidades. Basta con
                // que una no tenga dato de clima cálido para no poder declarar la
                // temporada cálida en el conjunto.
                const todasCalido = [base, ...unidades].every(u => u?.scop_temporada === 'calido');
                return withScopAplicado({
                    ...base,
                    scop_temporada: todasCalido ? 'calido' : 'medio',
                    equipos_extra: unidades,
                });
            };
            const newCal = recalcScop(p.aerotermia_cal);
            const newAcs = p.misma_aerotermia_acs ? cloneAero(newCal) : recalcScop(p.aerotermia_acs);
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
            setLocal(p => ({ ...p, misma_aerotermia_acs: true, aerotermia_acs: cloneAero(p.aerotermia_cal) }));
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
                aerotermia_acs: cloneAero(p.aerotermia_cal),
            }));
        } else {
            setLocal(p => ({ ...p, cambio_acs: false }));
        }
    };

    // TER100 (terciario) admite que la actuación NO alcance la calefacción (solo ACS
    // y/o piscina). En RES060/RES093 la actuación ES el cambio de la caldera de
    // calefacción, así que ahí el toggle no se ofrece y `cambio_calefaccion` es true.
    const esTerciario = esTer100(expediente);

    const handleCambioCalefaccionChange = (val) => {
        // Si se saca la calefacción del alcance, el ACS pasa a tener sus propios
        // equipos: copiar los de calefacción dejaría de tener sentido.
        setLocal(p => val
            ? { ...p, cambio_calefaccion: true }
            : { ...p, cambio_calefaccion: false, cambio_acs: true, misma_aerotermia_acs: false });
    };

    const prescriptorOptions = prescriptores
        .filter(i => i.tipo_empresa === 'INSTALADOR')
        .map(i => ({
            value: i.id_empresa,
            label: `${i.razon_social || i.acronimo || 'Sin nombre'} ${i.cif ? `(${i.cif})` : ''}`,
            logo: i.logo_empresa || null,
            acronimo: i.acronimo || null,
        }));

    // 1. Extraer demanda con precisión técnica (Prioridad CEE Final > Oportunidad)
    const ceeFinal = expediente?.cee?.cee_final || {};
    const superficie = parseFloat(ceeFinal.superficieHabitable) || parseFloat(opDatos.surface) || 0;
    const demandAnnual = (parseFloat(ceeFinal.demandaCalefaccion) || 0) * superficie || parseFloat(opDatos.Q_net) || 0;

    // Misma cadena de fallback (expediente → oportunidad) que usan el CIFO y las
    // fichas, para que lo que se ve aquí sea lo que sale en los documentos.
    const hybridInputs = resolveHybridInputs(local, opDatos);
    const hybridizationRes = local.hibridacion ? calculateHybridization({
        demandAnnual: demandAnnual,
        zone: opDatos.zona || 'D3',
        ...hybridInputs
    }) : null;
    const esCoberturaPorCaldera = hybridInputs.method === HYBRID_METHODS.CALDERA;

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
                            <SelectField label="Municipio" value={local.municipio} onChange={v => setLocal(prev => ({ ...prev, municipio: v }))} options={(local.municipio && !municipios.includes(local.municipio) ? [local.municipio, ...municipios] : municipios).map(m => ({ value: m, label: m }))} loading={loadingGeo.muni} readOnly={readOnly || !local.provincia_cod} />
                            <Field label="Código Postal" value={local.codigo_postal} onChange={v => setLocal(prev => ({ ...prev, codigo_postal: v }))} placeholder="Ej: 28001" readOnly={readOnly} />
                            <div className="sm:col-span-2"><Field label="Dirección de la instalación" value={local.direccion} onChange={v => setLocal(prev => ({ ...prev, direccion: v }))} placeholder="Calle, número, piso..." readOnly={readOnly} /></div>
                        </div>
                    )}

                    <div className="pt-2 border-t border-white/5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Field label="Referencia Catastral" value={local.ref_catastral} onChange={v => setLocal(p => ({ ...p, ref_catastral: v }))} readOnly={readOnly || local.misma_direccion} />
                            <Field label={fetchingUtm ? 'Coordenada X (obteniendo...)' : 'Coordenada X (UTM)'} value={local.coord_x} onChange={v => setLocal(p => ({ ...p, coord_x: v }))} readOnly={readOnly || (local.misma_direccion && !editCoords)} placeholder="Ej: 482304" />
                            <Field label={fetchingUtm ? 'Coordenada Y (obteniendo...)' : 'Coordenada Y (UTM)'} value={local.coord_y} onChange={v => setLocal(p => ({ ...p, coord_y: v }))} readOnly={readOnly || (local.misma_direccion && !editCoords)} placeholder="Ej: 4361303" />
                        </div>

                        {/* Editar coordenadas a mano: en parcelas grandes el punto del Catastro
                            puede no caer sobre la vivienda. Solo aplica cuando se usa la misma
                            dirección que el cliente (si no, las coords ya son editables). */}
                        {!readOnly && local.misma_direccion && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditCoords(e => !e)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                                        editCoords
                                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                            : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:border-white/20'
                                    }`}
                                >
                                    {editCoords ? (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            Bloquear coordenadas
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            Editar coordenadas manualmente
                                        </>
                                    )}
                                </button>

                                {editCoords && (
                                    <button
                                        type="button"
                                        onClick={() => fetchUtmFromRC(local.ref_catastral || opRC)}
                                        disabled={fetchingUtm}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border bg-white/5 text-white/50 border-white/10 hover:text-white hover:border-white/20 disabled:opacity-50 disabled:cursor-wait"
                                    >
                                        <svg className={`w-3.5 h-3.5 ${fetchingUtm ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        {fetchingUtm ? 'Recalculando...' : 'Recalcular desde Catastro'}
                                    </button>
                                )}

                                <span className="text-[10px] text-white/30">
                                    {editCoords
                                        ? 'Coordenadas desbloqueadas. Ajústalas si el punto del Catastro no coincide con la vivienda (parcelas grandes).'
                                        : 'Coordenadas obtenidas del Catastro por la referencia catastral.'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── PREGUNTA CALEFACCIÓN (solo TER100) ──
                    En el terciario la sustitución puede alcanzar solo el ACS o solo la
                    piscina, así que el alcance sobre calefacción es una pregunta real. */}
                {esTerciario && (
                    <div className={`bg-slate-900 border p-4 rounded-xl ${readOnly ? 'border-white/5 opacity-80' : 'border-brand/20'}`}>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-white uppercase tracking-widest">¿Se va a actuar sobre la calefacción?</span>
                            <div className="flex items-center gap-2 p-1 bg-slate-950/50 rounded-xl border border-slate-700/50">
                                <button
                                    onClick={() => !readOnly && handleCambioCalefaccionChange(true)}
                                    disabled={readOnly}
                                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                                        local.cambio_calefaccion !== false
                                            ? (readOnly ? 'bg-brand/40 text-bkg-deep border-brand/40' : 'bg-brand text-bkg-deep border-brand')
                                            : 'text-white/20 border-transparent hover:text-white'
                                    }`}
                                >SÍ</button>
                                <button
                                    onClick={() => !readOnly && handleCambioCalefaccionChange(false)}
                                    disabled={readOnly}
                                    className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all border ${
                                        local.cambio_calefaccion === false
                                            ? (readOnly ? 'bg-amber-900 text-amber-300 border-amber-800' : 'bg-amber-500 text-bkg-deep border-amber-400')
                                            : 'text-white/20 border-transparent hover:text-white'
                                    }`}
                                >NO</button>
                            </div>
                        </div>
                        {local.cambio_calefaccion === false && (
                            <p className="text-[10px] text-amber-400/70 mt-2">
                                AE_C queda fuera de la fórmula: el ahorro saldrá solo del ACS y/o del calentamiento de piscina.
                            </p>
                        )}
                    </div>
                )}

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

                {/* ── ACS EXISTENTE (cuando NO se actúa sobre el ACS) ── */}
                {!local.cambio_acs && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black text-brand/70 uppercase tracking-widest px-2 py-0.5 rounded bg-brand/10 border border-brand/20">ACS — no se actúa</span>
                            <span className="text-[10px] text-white/40">El ACS queda fuera del alcance CAE: no entra en la fórmula de ahorro. Indica la instalación existente y, si se sustituye por un termo eléctrico, decláralo abajo.</span>
                        </div>
                        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                            <CalderaSection
                                title="Instalación ACS existente"
                                data={local.caldera_antigua_acs}
                                readOnly={readOnly}
                                onChange={v => setLocal(p => ({ ...p, caldera_antigua_acs: v, misma_caldera_acs: false }))}
                            />
                            {/* Caso RES060: la caldera de gasoil daba calefacción + ACS, se
                                pone aerotermia solo para calefacción y el ACS pasa a termo. */}
                            <AcsFueraAlcanceSection
                                data={local.aerotermia_acs}
                                readOnly={readOnly}
                                onChange={v => setLocal(p => ({ ...p, aerotermia_acs: v, misma_aerotermia_acs: false }))}
                            />
                        </div>
                    </div>
                )}

                {/* ── TIPO EMISOR ── */}
                <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06]">
                    <SelectField
                        label="Tipo de emisor (calefacción)"
                        value={local.tipo_emisor}
                        onChange={handleTipoEmisorChange}
                        options={emitterOptionsFor(expediente?.numero_expediente)}
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
                                // La potencia de bomba que alimenta la hibridación (RES093)
                                // es la TOTAL instalada: en cascada, la suma de las unidades.
                                const total = potenciaTotal(v);
                                const next = {
                                    ...p,
                                    aerotermia_cal: v,
                                    potencia_bomba: total || v.potencia || p.potencia_bomba
                                };
                                if (p.misma_aerotermia_acs) next.aerotermia_acs = cloneAero(v);
                                // Acumulador: su SCOP_dhw se calcula (Anexo VI) sobre el
                                // COP de ESTA bomba, así que cambiar el equipo de
                                // calefacción lo recalcula. Si no, quedaría el del
                                // equipo anterior y el CIFO saldría con un SCOP que su
                                // propia justificación no reproduce.
                                else if (tipoEquipoNuevo(p.aerotermia_acs) === EQUIPO_NUEVO.ACUMULADOR) {
                                    const model = (modelosPorMarca[(v.marca || '').toUpperCase()] || [])
                                        .find(m => String(m.id) === String(v.aerotermia_db_id));
                                    if (model) {
                                        next.aerotermia_acs = {
                                            ...p.aerotermia_acs,
                                            scop: getScopAcsFromModel(model, zonaInstalacion, p.aerotermia_acs?.metodo_scop || 'independiente'),
                                            url_eprel: model.eprel ?? null,
                                            url_keymark: model.url_keymark ?? null,
                                            url_ficha: model.ficha_tecnica ?? null,
                                        };
                                    }
                                }
                                return next;
                            });
                        }}
                        marcas={marcas}
                        modelosPorMarca={modelosPorMarca}
                        tipoEmisor={local.tipo_emisor}
                        zona={zonaInstalacion}
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
                            zona={zonaInstalacion}
                            isAcs={true}
                            // El acumulador lo calienta la BdC de calefacción: de ahí
                            // sale su SCOP_dhw (Anexo VI) y su ficha justificante.
                            calData={local.aerotermia_cal}
                        />
                    )}
                </div>

                {/* ── PISCINA (AE_CAP · solo TER100) ── */}
                {esTerciario && (
                    <PiscinaSection
                        data={local.piscina}
                        onChange={v => setLocal(p => ({ ...p, piscina: v }))}
                        readOnly={readOnly}
                    />
                )}

                {/* ── HIBRIDACIÓN ──
                    No aplica en TER100: la ficha del terciario no contempla el
                    coeficiente de cobertura por bivalencia (Cb), así que el bloque se
                    oculta para no ofrecer un dato que su fórmula ignora. */}
                <div className={`bg-slate-950/80 border border-brand/20 p-5 rounded-2xl space-y-4 shadow-2xl relative overflow-hidden group ${esTerciario ? 'hidden' : ''}`}>
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

                            {/* Base del % de cobertura para el Cb: potencia de diseño (demanda /
                                horas eq.) o potencia nominal de la caldera existente. La tabla
                                de bivalencia del Anexo III es la misma en ambos casos. */}
                            {local.hibridacion && (
                                <div className="flex flex-col gap-2 animate-in slide-in-from-left duration-500">
                                    <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest pl-1">Base de la cobertura</span>
                                    <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-white/5">
                                        {[
                                            { id: HYBRID_METHODS.DEMANDA, label: 'Demanda' },
                                            { id: HYBRID_METHODS.CALDERA, label: 'P. Caldera' },
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setLocal(p => ({ ...p, hibridacion_metodo: opt.id }))}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                                    hybridInputs.method === opt.id
                                                        ? 'bg-amber-500 text-bkg-deep border-amber-400'
                                                        : 'text-slate-500 border-transparent hover:text-white'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {local.hibridacion && esCoberturaPorCaldera && (
                                <div className="flex flex-col gap-2 animate-in slide-in-from-left duration-500">
                                    <span className="text-[10px] font-black text-amber-500/60 uppercase tracking-widest pl-1">P. Caldera (kW)</span>
                                    <div className="p-0.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            className="w-24 bg-transparent border-none text-amber-400 font-black text-sm px-3 py-2 focus:outline-none placeholder:text-amber-500/30 tabular-nums font-mono"
                                            value={local.potencia_caldera || ''}
                                            onChange={e => setLocal(prev => ({ ...prev, potencia_caldera: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {local.hibridacion && hybridizationRes && (
                             <div className="bg-slate-900/60 p-4 rounded-xl border border-white/5 flex items-center gap-8 pr-8 max-md:flex-col max-md:items-start max-md:gap-4 max-md:pr-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 max-md:w-full">
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
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                            {/* H_HE: horas anuales equivalentes en modo activo — Rgto. (UE) 813/2013 */}
                                            {esCoberturaPorCaldera ? 'P. Caldera' : 'H(HE) modo activo'}
                                        </p>
                                        <p className="text-sm font-black text-white leading-none tabular-nums font-mono">
                                            {esCoberturaPorCaldera
                                                ? hybridizationRes.boilerPower.toFixed(2)
                                                : hybridizationRes.hHE}
                                            <span className="text-[10px] text-white/30 ml-1 font-sans">{esCoberturaPorCaldera ? 'kW' : 'h'}</span>
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
                    <div>
                        <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">Seleccionar Instalador</label>
                        <SearchableSelect
                            value={local.instalador_id || ''}
                            onChange={v => setLocal(p => ({ ...p, instalador_id: v || null }))}
                            options={prescriptorOptions}
                            placeholder="— Selecciona instalador —"
                            searchPlaceholder="Buscar instalador..."
                            dropUp
                            disabled={readOnly}
                        />
                    </div>
                    {/* Si el instalador no está habilitado en Industria, la Memoria RITE,
                        el Certificado y el CIFO salen a nombre del instalador habilitado
                        que firma por él (se configura en su ficha de la Red de
                        Prescriptores). Se avisa aquí para que no sorprenda en el PDF. */}
                    {(() => {
                        const sel = prescriptores.find(i => i.id_empresa === local.instalador_id);
                        if (!sel || sel.tiene_carnet_rite) return null;
                        const firmante = prescriptores.find(i => i.id_empresa === sel.instalador_rite_id);
                        return (
                            <div className={`rounded-lg px-3 py-2 border text-[11px] leading-relaxed ${firmante
                                ? 'bg-amber-500/5 border-amber-500/20 text-amber-300/80'
                                : 'bg-red-500/5 border-red-500/20 text-red-300/80'}`}>
                                {firmante ? (
                                    <>No habilitado en Industria. La Memoria RITE, el Certificado y el CIFO
                                    saldrán a nombre de <b>{firmante.razon_social || firmante.acronimo}</b>.</>
                                ) : (
                                    <>⚠️ No habilitado en Industria y <b>sin instalador firmante asignado</b>.
                                    Asígnalo en su ficha de la Red de Prescriptores o no se podrán generar
                                    la Memoria RITE ni el certificado.</>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
