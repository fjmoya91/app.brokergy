import React, { useState, useMemo } from 'react';
import CeeDropZone from './CeeDropZone';
import { avisosCee, demandaDeCalculo, hayAvisosSerios } from './ceeAvisos';

/**
 * CeePrevioGate — Pantalla previa a "Nueva simulación" (SOLO ADMIN).
 *
 * Flujo:
 *   gate   → ¿qué certificados hay?  [Ninguno → onSkip()]  [Solo el anterior | Los dos]
 *   upload → una zona de suelta por certificado (.xml/.cex exacto o PDF/fotos por OCR)
 *   review → lo leído, editable, con los avisos cruzados → onDone({ inicial, final })
 *
 * Props:
 *   onSkip()                     — no hay CEE: simulación normal.
 *   onDone({ inicial, final })   — certificados listos para arrastrar a la simulación.
 *   onCancel()                   — cerrar toda la nueva simulación.
 *
 * La extracción NO vive aquí: es `ceeExtract.js` (compartida con CeeUploadModal). Esta
 * pantalla solo orquesta, cruza los dos certificados y deja corregir lo leído.
 */

const BRAND = '#FFA000';

// Componentes a nivel de módulo (NO definidos dentro del componente): si se definen
// dentro del cuerpo, React los trata como un tipo nuevo en cada render (cada tecla) y
// REMONTA el <input>, perdiendo el foco tras cada carácter.
function Shell({ children, onCancel }) {
    return (
        <div className="min-h-screen w-full flex flex-col items-center px-4 py-8 overflow-y-auto">
            <div className="w-full max-w-4xl">
                <div className="flex items-center justify-between mb-6">
                    <div className="text-2xl font-black tracking-tight">
                        <span className="text-white">BROKER</span><span style={{ color: BRAND }}>GY</span>
                    </div>
                    <button onClick={onCancel} className="text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        Cancelar
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, unit, type = 'text', wide }) {
    return (
        <div className={wide ? 'sm:col-span-2' : ''}>
            <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1 font-bold">{label}</label>
            <div className="flex items-center gap-2">
                <input
                    type={type}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
                />
                {unit && <span className="text-white/30 text-xs whitespace-nowrap">{unit}</span>}
            </div>
        </div>
    );
}

function ServRow({ label, servicio, onChange }) {
    return (
        <div className="grid grid-cols-2 gap-3 items-end">
            <Field label={`${label} — combustible`} value={servicio?.combustible} onChange={(v) => onChange('combustible', v)} />
            <Field label={`${label} — rend. estacional`} value={servicio?.rendimiento_estacional_pct} onChange={(v) => onChange('rendimiento_estacional_pct', v)} unit="%" type="number" />
        </div>
    );
}

/** Formulario completo de UN certificado. `set(ruta, valor)` con ruta tipo 'demandas.calefaccion_kwh_m2_ano'. */
function CeeForm({ data, set }) {
    if (!data) return null;
    return (
        <div className="space-y-5">
            <div>
                <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Identificación</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Referencia catastral" value={data.referencia_catastral} onChange={(v) => set('referencia_catastral', v)} wide />
                    <Field label="Dirección" value={data.identificacion?.direccion} onChange={(v) => set('identificacion.direccion', v)} wide />
                    <Field label="Municipio" value={data.identificacion?.municipio} onChange={(v) => set('identificacion.municipio', v)} />
                    <Field label="Provincia" value={data.identificacion?.provincia} onChange={(v) => set('identificacion.provincia', v)} />
                    <Field label="Código postal" value={data.identificacion?.cp} onChange={(v) => set('identificacion.cp', v)} />
                    <Field label="Zona climática" value={data.identificacion?.zona_climatica} onChange={(v) => set('identificacion.zona_climatica', v)} />
                    <Field label="Fecha del certificado" value={data.fecha_certificado} onChange={(v) => set('fecha_certificado', v)} />
                    <Field label="Superficie habitable" value={data.superficie_habitable_m2} onChange={(v) => set('superficie_habitable_m2', v)} unit="m²" type="number" />
                </div>
            </div>
            <div>
                <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Demandas y emisiones</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Demanda calefacción" value={data.demandas?.calefaccion_kwh_m2_ano} onChange={(v) => set('demandas.calefaccion_kwh_m2_ano', v)} unit="kWh/m²·año" type="number" />
                    <Field label="Demanda refrigeración" value={data.demandas?.refrigeracion_kwh_m2_ano} onChange={(v) => set('demandas.refrigeracion_kwh_m2_ano', v)} unit="kWh/m²·año" type="number" />
                    <Field label="ACS (litros/día)" value={data.acs_litros_dia} onChange={(v) => set('acs_litros_dia', v)} unit="l/día" type="number" />
                    <Field label="Emisiones calefacción" value={data.emisiones?.calefaccion} onChange={(v) => set('emisiones.calefaccion', v)} unit="kgCO₂/m²·año" type="number" />
                    <Field label="Emisiones ACS" value={data.emisiones?.acs} onChange={(v) => set('emisiones.acs', v)} unit="kgCO₂/m²·año" type="number" />
                    <Field label="Emisiones refrigeración" value={data.emisiones?.refrigeracion} onChange={(v) => set('emisiones.refrigeracion', v)} unit="kgCO₂/m²·año" type="number" />
                </div>
            </div>
            <div>
                <div className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Instalaciones</div>
                <div className="space-y-3">
                    <ServRow label="Calefacción" servicio={data.servicios?.calefaccion} onChange={(f, v) => set(`servicios.calefaccion.${f}`, v)} />
                    <ServRow label="ACS" servicio={data.servicios?.acs} onChange={(f, v) => set(`servicios.acs.${f}`, v)} />
                    <ServRow label="Refrigeración" servicio={data.servicios?.refrigeracion} onChange={(f, v) => set(`servicios.refrigeracion.${f}`, v)} />
                </div>
            </div>
        </div>
    );
}

/** Resumen compacto de un certificado (lo que se mira el 90 % de las veces). */
function CeeResumen({ data, tono }) {
    const color = tono === 'final' ? 'text-emerald-400' : 'text-amber-400';
    const filas = [
        ['Demanda calefacción', data.demandas?.calefaccion_kwh_m2_ano != null && data.demandas?.calefaccion_kwh_m2_ano !== '' ? `${data.demandas.calefaccion_kwh_m2_ano} kWh/m²·año` : '—'],
        ['Superficie', data.superficie_habitable_m2 ? `${data.superficie_habitable_m2} m²` : '—'],
        ['Emisiones cal. / ACS', `${data.emisiones?.calefaccion ?? '—'} / ${data.emisiones?.acs ?? '—'}`],
        ['Combustible calefacción', data.servicios?.calefaccion?.combustible || '—'],
        ['Fecha', data.fecha_certificado || '—'],
        ['Ref. catastral', data.referencia_catastral || '—'],
    ];
    return (
        <dl className="grid grid-cols-1 gap-y-2 text-xs">
            {filas.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-1.5">
                    <dt className="text-white/35 text-[10px] uppercase tracking-widest font-bold shrink-0">{k}</dt>
                    <dd className={`text-right truncate ${k.startsWith('Demanda') ? `font-bold ${color}` : 'text-white/75'}`}>{v}</dd>
                </div>
            ))}
        </dl>
    );
}

function AvisoCard({ aviso }) {
    const estilo = {
        alto: 'bg-red-500/10 border-red-500/40 text-red-200',
        medio: 'bg-amber-500/10 border-amber-500/40 text-amber-100',
        info: 'bg-sky-500/10 border-sky-500/30 text-sky-100',
    }[aviso.nivel] || 'bg-white/5 border-white/10 text-white/70';
    const icono = { alto: '⛔', medio: '⚠️', info: 'ℹ️' }[aviso.nivel] || '•';
    return (
        <div className={`rounded-2xl border px-4 py-3 ${estilo}`}>
            <div className="flex items-start gap-3">
                <span className="text-base leading-none mt-0.5">{icono}</span>
                <div className="min-w-0">
                    <div className="font-bold text-sm">{aviso.titulo}</div>
                    <p className="text-[12px] leading-relaxed opacity-85 mt-1">{aviso.detalle}</p>
                </div>
            </div>
        </div>
    );
}

export default function CeePrevioGate({ onSkip, onDone, onCancel }) {
    const [stage, setStage] = useState('gate');   // gate | upload | review
    const [modo, setModo] = useState('inicial');  // inicial | ambos
    const [inicial, setInicial] = useState(null);
    const [final, setFinal] = useState(null);
    const [editando, setEditando] = useState(false);

    const avisos = useMemo(() => avisosCee(inicial, final), [inicial, final]);
    const calculo = useMemo(() => demandaDeCalculo(inicial, final), [inicial, final]);
    const bloqueante = hayAvisosSerios(avisos);

    // Edición por ruta ('identificacion.direccion') sobre el certificado indicado.
    const setCampo = (cual) => (ruta, valor) => {
        const setter = cual === 'final' ? setFinal : setInicial;
        setter(prev => {
            if (!prev) return prev;
            const partes = ruta.split('.');
            const copia = { ...prev };
            let cursor = copia;
            for (let i = 0; i < partes.length - 1; i++) {
                cursor[partes[i]] = { ...(cursor[partes[i]] || {}) };
                cursor = cursor[partes[i]];
            }
            cursor[partes[partes.length - 1]] = valor;
            return copia;
        });
    };

    const intercambiar = () => { const a = inicial; setInicial(final); setFinal(a); };

    // ── Pantalla 1: ¿qué certificados hay? ──────────────────────────────────
    if (stage === 'gate') {
        const Opcion = ({ emoji, titulo, texto, onClick, destacado }) => (
            <button
                onClick={onClick}
                className={`text-left p-6 rounded-2xl border-2 transition-all hover:scale-[1.015] ${
                    destacado ? 'border-amber-500/60 bg-amber-500/[0.07]' : 'border-white/12 bg-white/[0.03] hover:border-white/25'
                }`}
            >
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="text-white font-bold text-base leading-tight mb-1.5">{titulo}</div>
                <p className="text-white/45 text-[12px] leading-relaxed">{texto}</p>
            </button>
        );
        return (
            <Shell onCancel={onCancel}>
                <div className="text-center mt-6 mb-10 animate-slide-down">
                    <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                        <span className="text-white">Nueva </span><span className="text-gradient">simulación</span>
                    </h1>
                    <p className="text-white/50 text-lg">Antes de empezar…</p>
                </div>
                <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-10 animate-fade-in">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 text-center">
                        ¿Qué certificados energéticos tienes?
                    </h2>
                    <p className="text-white/40 text-sm mb-8 uppercase tracking-widest text-center">
                        Con ellos usamos datos reales en vez de estimarlos
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Opcion
                            emoji="🚫"
                            titulo="Ninguno"
                            texto="No hay CEE todavía. Seguimos con la simulación estimada de siempre."
                            onClick={onSkip}
                        />
                        <Opcion
                            emoji="📑"
                            titulo="Solo el anterior a la obra"
                            texto="El CEE de la situación de partida. Usamos su demanda y su superficie reales."
                            onClick={() => { setModo('inicial'); setStage('upload'); }}
                        />
                        <Opcion
                            emoji="🏁"
                            titulo="Los dos — la obra ya está hecha"
                            texto="Anterior y posterior a la reforma. El ahorro deja de ser estimado y pasa a ser medido."
                            onClick={() => { setModo('ambos'); setStage('upload'); }}
                            destacado
                        />
                    </div>
                </div>
            </Shell>
        );
    }

    // ── Pantalla 2: carga (una zona por certificado) ────────────────────────
    if (stage === 'upload') {
        const ambos = modo === 'ambos';
        const puedeSeguir = !!inicial || !!final;
        return (
            <Shell onCancel={onCancel}>
                <div className="text-center mt-4 mb-8">
                    <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-3">
                        <span className="text-white">Cargar </span><span className="text-gradient">{ambos ? 'los certificados' : 'el certificado'}</span>
                    </h1>
                    <p className="text-white/50 text-sm md:text-base max-w-2xl mx-auto">
                        Sube el <b className="text-white/80">.xml</b> (lectura exacta) o el <b className="text-white/80">PDF</b> / <b className="text-white/80">fotos</b> y lo leemos con IA.
                        {ambos && ' Puedes cargarlos en cualquier orden.'}
                    </p>
                </div>

                <div className={`grid grid-cols-1 ${ambos ? 'md:grid-cols-2' : ''} gap-4`}>
                    <CeeDropZone
                        titulo="CEE inicial · antes de la obra"
                        subtitulo="La situación de partida de la vivienda."
                        tono="inicial"
                        data={inicial}
                        onLoaded={setInicial}
                        onClear={() => setInicial(null)}
                    />
                    {ambos && (
                        <CeeDropZone
                            titulo="CEE final · después de la obra"
                            subtitulo="El emitido una vez terminada la reforma."
                            tono="final"
                            data={final}
                            onLoaded={setFinal}
                            onClear={() => setFinal(null)}
                        />
                    )}
                </div>

                {ambos && inicial && final && (
                    <div className="mt-4 flex justify-center">
                        <button onClick={intercambiar} className="text-white/40 hover:text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4" /></svg>
                            Intercambiar inicial y final
                        </button>
                    </div>
                )}

                {avisos.length > 0 && (
                    <div className="mt-6 space-y-2">
                        {avisos.map(a => <AvisoCard key={a.codigo} aviso={a} />)}
                    </div>
                )}

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <button onClick={() => setStage('gate')} className="text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest">← Atrás</button>
                    <div className="flex items-center gap-4">
                        <button onClick={onSkip} className="text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest">Seguir sin CEE</button>
                        <button
                            disabled={!puedeSeguir}
                            onClick={() => setStage('review')}
                            className="px-8 py-3.5 rounded-xl font-black text-black text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{ backgroundColor: BRAND }}
                        >
                            Revisar datos →
                        </button>
                    </div>
                </div>
            </Shell>
        );
    }

    // ── Pantalla 3: revisión ────────────────────────────────────────────────
    const dosColumnas = !!inicial && !!final;
    return (
        <Shell onCancel={onCancel}>
            <div className="text-center mt-4 mb-6">
                <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-2">
                    <span className="text-white">Datos del </span><span className="text-gradient">{dosColumnas ? 'certificado inicial y final' : 'CEE'}</span>
                </h1>
                <p className="text-white/50 text-sm">Comprueba que está bien leído. Puedes corregir cualquier campo.</p>
            </div>

            {avisos.length > 0 && (
                <div className="mb-5 space-y-2">
                    {avisos.map(a => <AvisoCard key={a.codigo} aviso={a} />)}
                </div>
            )}

            {calculo.demanda > 0 && (
                <div className="mb-5 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-widest text-white/35 font-bold">La simulación arrancará con</div>
                    <div className="text-white text-sm">
                        <b className="text-amber-400">{calculo.demanda} kWh/m²·año</b>
                        <span className="text-white/40"> · {calculo.superficie ? `${calculo.superficie} m²` : 'superficie por confirmar'} · del CEE </span>
                        <b className={calculo.origen === 'final' ? 'text-emerald-400' : 'text-amber-400'}>{calculo.origen === 'final' ? 'FINAL' : 'INICIAL'}</b>
                    </div>
                </div>
            )}

            <div className={`grid grid-cols-1 ${dosColumnas ? 'lg:grid-cols-2' : ''} gap-4`}>
                {[['inicial', inicial], ['final', final]].filter(([, d]) => !!d).map(([cual, d]) => (
                    <div key={cual} className={`rounded-2xl border-2 p-5 bg-white/[0.02] ${cual === 'final' ? 'border-emerald-500/35' : 'border-amber-500/35'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className={`text-[11px] font-black uppercase tracking-widest ${cual === 'final' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                CEE {cual === 'final' ? 'final · después' : 'inicial · antes'}
                            </div>
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white/[0.06] text-white/50">
                                {d.source === 'xml' ? 'XML (exacto)' : 'OCR (IA)'}
                            </span>
                        </div>
                        {editando ? <CeeForm data={d} set={setCampo(cual)} /> : <CeeResumen data={d} tono={cual} />}
                    </div>
                ))}
            </div>

            <div className="mt-4 text-center">
                <button
                    onClick={() => setEditando(v => !v)}
                    className="text-white/40 hover:text-white text-[11px] font-black uppercase tracking-widest"
                >
                    {editando ? '↑ Ver resumen' : '✎ Editar todos los campos'}
                </button>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-between items-center">
                <button onClick={() => setStage('upload')} className="px-5 py-3 rounded-xl border border-white/15 text-white/70 hover:text-white text-sm font-bold uppercase tracking-widest">← Cargar otro</button>
                <button
                    onClick={() => onDone({ inicial, final })}
                    className={`px-8 py-3.5 rounded-xl font-black text-black text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] ${bloqueante ? 'opacity-80' : ''}`}
                    style={{ backgroundColor: BRAND }}
                >
                    {bloqueante ? 'Continuar de todos modos →' : 'Continuar con estos datos →'}
                </button>
            </div>
        </Shell>
    );
}
