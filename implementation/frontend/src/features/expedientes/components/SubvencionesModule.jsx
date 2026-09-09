import React, { useEffect, useMemo, useState } from 'react';
import {
    BONO_SOCIAL_OPCIONES, BONO_NINGUNO,
    CATALOGO_SUBVENCIONES, SUBVENCION_OTRA, subvencionDelCatalogo,
    ESTADOS_CONCESION,
    leerSubvenciones, datosPrograma, faltantesSubvencion, importeEs,
} from '../logic/subvenciones';

// ─────────────────────────────────────────────────────────────────────────────
// SubvencionesModule — lo que el titular declara en el Anexo I sobre BONO SOCIAL
// y AYUDAS PÚBLICAS para esta misma actuación.
//
// Se declara AQUÍ una sola vez y lo leen los tres sitios que lo necesitan: el
// Anexo I que firma el cliente, la solicitud de verificación que se manda al
// verificador y el control de sobrefinanciación. Antes vivía en el estado local
// del popup del Anexo I y no sobrevivía a cerrarlo.
//
// REGLA — el ÓRGANO GESTOR, la DISPOSICIÓN REGULADORA y el AÑO no se teclean:
// salen del programa elegido. Son propiedades del Real Decreto que lo regula, no
// de este expediente, y a mano es donde se cuelan las erratas que luego no casan
// entre el Anexo I y la solicitud.
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({ label, value, onChange, readOnly = false, hint }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0">
                <span className="text-xs text-white/50 font-bold uppercase tracking-wider">{label}</span>
                {hint && <p className="text-[11px] text-white/25 mt-1 leading-snug">{hint}</p>}
            </div>
            <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5 shadow-inner shrink-0">
                {[{ v: true, l: 'SÍ' }, { v: false, l: 'NO' }].map(({ v, l }) => (
                    <button
                        key={l}
                        disabled={readOnly}
                        onClick={() => !readOnly && onChange(v)}
                        className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${
                            value === v ? 'bg-brand text-black shadow-lg' : 'text-white/20 hover:text-white/40'
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Field({ label, children, hint }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[10px] text-white/30 uppercase font-black tracking-widest ml-1">{label}</label>
            {children}
            {hint && <p className="text-[10px] text-white/25 ml-1 leading-snug">{hint}</p>}
        </div>
    );
}

const INPUT = 'w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-brand focus:outline-none transition-colors disabled:opacity-50';
// Los campos que vuelca el catálogo se enseñan pero no se editan: el expediente
// no puede contradecir al Real Decreto que regula el programa.
const INPUT_DERIVADO = 'w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white/60 text-sm cursor-default';

function SectionHeader({ title, sub }) {
    return (
        <div className="mb-5 pb-2 border-b border-white/5">
            <h4 className="text-sm font-black text-white uppercase tracking-widest">{title}</h4>
            {sub && <p className="text-[11px] text-white/30 mt-1">{sub}</p>}
        </div>
    );
}

export function SubvencionesModule({ expediente, onSave, onLiveUpdate, saving, readOnly = false }) {
    const [local, setLocal] = useState(() => leerSubvenciones(expediente));

    // Al cambiar de expediente hay que releer: el módulo se reusa entre fichas.
    useEffect(() => {
        setLocal(leerSubvenciones(expediente));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expediente?.id]);

    useEffect(() => {
        if (onLiveUpdate) onLiveUpdate({ ...expediente?.documentacion, subvenciones: local });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    const set = (patch) => setLocal(prev => ({ ...prev, ...patch }));
    const setAyuda = (patch) => setLocal(prev => ({ ...prev, ayuda: { ...prev.ayuda, ...patch } }));

    const programa = useMemo(() => datosPrograma(local), [local]);
    const esOtra = local.ayuda.catalogo_id === SUBVENCION_OTRA;
    const faltan = useMemo(
        () => faltantesSubvencion({ documentacion: { subvenciones: local } }),
        [local]
    );

    const tiposMarcados = local.bono_social.tipos || [];

    const toggleBono = (id) => {
        if (readOnly) return;
        setLocal(prev => {
            const actuales = prev.bono_social.tipos || [];
            const tipos = actuales.includes(id) ? actuales.filter(t => t !== id) : [...actuales, id];
            return { ...prev, bono_social: { percibe: tipos.length > 0, tipos } };
        });
    };

    const elegirPrograma = (id) => {
        if (readOnly) return;
        const cat = subvencionDelCatalogo(id);
        // Elegir del catálogo VUELCA los cuatro campos; "otra" los deja en blanco
        // para escribirlos, en vez de heredar los del programa anterior.
        setAyuda(cat
            ? { catalogo_id: id, denominacion: cat.denominacion, organo: cat.organo, disposicion: cat.disposicion, anio: cat.anio }
            : { catalogo_id: id, denominacion: '', organo: '', disposicion: '', anio: '' });
    };

    const dirty = JSON.stringify(local) !== JSON.stringify(leerSubvenciones(expediente));

    return (
        <div className="space-y-8">
            {/* ── Bono social ─────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    title="Bono social"
                    sub="Apartado 4 del Anexo I. Se pueden marcar varias; si no se marca ninguna, el Anexo I imprime «Ninguno de los anteriores»."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {BONO_SOCIAL_OPCIONES.filter(o => o.id !== BONO_NINGUNO).map(o => {
                        const on = tiposMarcados.includes(o.id);
                        return (
                            <button
                                key={o.id}
                                type="button"
                                disabled={readOnly}
                                onClick={() => toggleBono(o.id)}
                                className={`flex items-start gap-3 text-left px-4 py-3 rounded-xl border transition-all ${
                                    on ? 'border-brand/50 bg-brand/10' : 'border-white/5 bg-bkg-elevated hover:border-white/15'
                                } disabled:opacity-60`}
                            >
                                <span className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] font-black ${
                                    on ? 'bg-brand border-brand text-black' : 'border-white/20 text-transparent'
                                }`}>✓</span>
                                <span className={`text-[12px] leading-snug ${on ? 'text-white' : 'text-white/50'}`}>{o.label}</span>
                            </button>
                        );
                    })}
                </div>
                {tiposMarcados.length === 0 && (
                    <p className="text-[11px] text-white/30 mt-3">
                        Sin marcar nada, en el Anexo I se marca «Ninguno de los anteriores».
                    </p>
                )}
            </div>

            {/* ── Ayudas públicas ─────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    title="Ayudas o subvenciones públicas"
                    sub="Para ESTA misma actuación. Se declara en el Anexo I y viaja a la solicitud de verificación."
                />

                <Toggle
                    label="¿Se ha solicitado alguna ayuda?"
                    value={local.solicitada}
                    onChange={(v) => set({ solicitada: v })}
                    readOnly={readOnly}
                    hint="Por defecto NO. Marcar SÍ obliga a completar el programa, porque el verificador exige los datos de la ayuda."
                />

                {local.solicitada && (
                    <div className="mt-6 space-y-5 pl-4 border-l-2 border-brand/30">
                        <Field
                            label="Programa de ayuda"
                            hint="Al elegirlo se rellenan solos el órgano gestor, la disposición reguladora y el año."
                        >
                            <select
                                disabled={readOnly}
                                value={local.ayuda.catalogo_id || ''}
                                onChange={(e) => elegirPrograma(e.target.value)}
                                className={INPUT}
                            >
                                <option value="">— Selecciona el programa —</option>
                                {CATALOGO_SUBVENCIONES.map(s => (
                                    <option key={s.id} value={s.id}>{s.denominacion}</option>
                                ))}
                                <option value={SUBVENCION_OTRA}>Otra (autonómica, local… — se escribe a mano)</option>
                            </select>
                        </Field>

                        {esOtra && (
                            <Field label="Denominación del programa">
                                <textarea
                                    disabled={readOnly}
                                    rows={2}
                                    value={local.ayuda.denominacion || ''}
                                    onChange={(e) => setAyuda({ denominacion: e.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <Field label="Órgano gestor">
                                    {esOtra ? (
                                        <input disabled={readOnly} className={INPUT} value={local.ayuda.organo || ''}
                                            onChange={(e) => setAyuda({ organo: e.target.value })} />
                                    ) : (
                                        <div className={INPUT_DERIVADO}>{programa.organo || '—'}</div>
                                    )}
                                </Field>
                            </div>
                            <Field label="Año">
                                {esOtra ? (
                                    <input disabled={readOnly} className={INPUT} value={local.ayuda.anio || ''}
                                        onChange={(e) => setAyuda({ anio: e.target.value })} />
                                ) : (
                                    <div className={INPUT_DERIVADO}>{programa.anio || '—'}</div>
                                )}
                            </Field>
                        </div>

                        <Field label="Disposición reguladora">
                            {esOtra ? (
                                <input disabled={readOnly} className={INPUT} value={local.ayuda.disposicion || ''}
                                    onChange={(e) => setAyuda({ disposicion: e.target.value })} />
                            ) : (
                                <div className={INPUT_DERIVADO}>{programa.disposicion || '—'}</div>
                            )}
                        </Field>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Nº de expediente de la subvención">
                                <input disabled={readOnly} className={INPUT} placeholder="PR3-13-2024-00144"
                                    value={local.ayuda.num_expediente || ''}
                                    onChange={(e) => setAyuda({ num_expediente: e.target.value })} />
                            </Field>
                            <Field label="Estado de la concesión">
                                <select disabled={readOnly} className={INPUT} value={local.ayuda.estado || 'PENDIENTE'}
                                    onChange={(e) => setAyuda({ estado: e.target.value })}>
                                    {ESTADOS_CONCESION.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                                </select>
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Field label="Fecha de solicitud">
                                <input type="date" disabled={readOnly} className={INPUT}
                                    value={local.ayuda.fecha_solicitud || ''}
                                    onChange={(e) => setAyuda({ fecha_solicitud: e.target.value })} />
                            </Field>
                            <Field label="Fecha de resolución">
                                <input type="date" disabled={readOnly} className={INPUT}
                                    value={local.ayuda.fecha_resolucion || ''}
                                    onChange={(e) => setAyuda({ fecha_resolucion: e.target.value })} />
                            </Field>
                            <Field label="Cuantía (€)" hint="Obtenida, o esperada si sigue sin resolver.">
                                <input type="number" step="0.01" disabled={readOnly} className={INPUT}
                                    value={local.ayuda.cuantia_eur ?? ''}
                                    onChange={(e) => setAyuda({ cuantia_eur: e.target.value })} />
                            </Field>
                        </div>

                        <Field
                            label="¿Con cargo a fondos nacionales?"
                            hint="Lo pregunta la API del verificador. Los cuatro programas del catálogo son del Plan de Recuperación (fondos europeos Next Generation): compruébalo antes de enviar."
                        >
                            <select disabled={readOnly} className={INPUT} value={local.ayuda.fondo_nacional || 'no'}
                                onChange={(e) => setAyuda({ fondo_nacional: e.target.value })}>
                                <option value="no">No</option>
                                <option value="si">Sí</option>
                            </select>
                        </Field>

                        {faltan.length > 0 && (
                            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                                <p className="text-[11px] text-amber-300">
                                    Para poder declararla falta {faltan.join(', ')}. Una ayuda declarada a medias
                                    la pregunta el verificador igual que una no declarada.
                                </p>
                            </div>
                        )}

                        {Number(local.ayuda.cuantia_eur) > 0 && (
                            <p className="text-[11px] text-white/35">
                                Se declararán <b className="text-white/70">{importeEs(local.ayuda.cuantia_eur)} €</b> en
                                el Anexo I y en la solicitud de verificación. Recuerda comprobar que la ayuda más el
                                bono CAE no superan la inversión de la obra.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {!readOnly && dirty && (
                <div className="flex justify-end pt-2">
                    <button
                        onClick={() => onSave({ documentacion: { ...expediente?.documentacion, subvenciones: local } })}
                        disabled={saving}
                        className="px-6 py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-40 transition-all"
                    >
                        {saving ? 'Guardando…' : 'Guardar subvenciones'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default SubvencionesModule;
