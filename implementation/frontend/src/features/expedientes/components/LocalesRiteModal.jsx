import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CampoDecimal } from '../../../components/CampoDecimal';
import {
    TIPOS_LOCAL, MAX_LOCALES, etiquetaPlanta, estadoInicial, resolverLocales, paraGuardar,
    contar, sumarLocal, restarLocal, fijarM2, anadirPlanta, quitarPlanta,
} from '../logic/localesRite';

// Último paso antes de generar la Memoria RITE: qué estancias tiene la vivienda y
// en qué planta. De aquí sale la tabla «RESUMEN DE CARGAS TÉRMICAS POR LOCAL Y
// ELEMENTO INSTALADO», que antes era la misma plantilla de doce estancias para
// todas las casas. Viene rellena —lo guardado la última vez, o una propuesta según
// el tamaño de la vivienda— y se añaden o quitan estancias por planta.
//
// Portaleado a `body`: la ficha del expediente tiene ancestros con backdrop-blur y
// un `fixed` dentro se anclaría a ellos (regla 29.b).
export default function LocalesRiteModal({ isOpen, info, emisor, onCancel, onConfirm }) {
    const superficie = info?.superficie;
    const [estado, setEstado] = useState(() =>
        estadoInicial({ guardado: info?.guardado, superficie, plantas: info?.plantas }));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const r = useMemo(() => resolverLocales(estado, superficie), [estado, superficie]);
    const nLocales = r.plantas.reduce((s, p) => s + p.locales.length, 0);
    const excede = nLocales > MAX_LOCALES;

    if (!isOpen) return null;

    const conElementos = !/suelo|split|conducto/i.test(emisor || '');

    const confirmar = async () => {
        if (!nLocales) { setError('Añade al menos una estancia.'); return; }
        if (excede) { setError(`La tabla de la memoria admite ${MAX_LOCALES} estancias.`); return; }
        setSaving(true); setError(null);
        try {
            await onConfirm(paraGuardar(r));
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'No se pudieron guardar las estancias');
            setSaving(false);
        }
    };

    const restablecer = () => setEstado(estadoInicial({ guardado: null, superficie, plantas: info?.plantas }));

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => !saving && onCancel()}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 shrink-0">
                    <h2 className="text-lg font-black uppercase tracking-tight text-white">Estancias de la vivienda</h2>
                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                        Tabla de cargas térmicas de la Memoria RITE{superficie ? ` · ${fmt(superficie)} m² útiles` : ''}
                    </p>
                </div>

                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                    <p className="text-sm text-white/60 leading-relaxed">
                        {info?.guardado
                            ? 'Son las estancias que se usaron la última vez. '
                            : 'Es una propuesta según el tamaño de la vivienda: compruébala. '}
                        Añade o quita estancias en cada planta. La superficie se reparte sola;
                        si sabes la de alguna, escríbela y el resto se ajusta.
                    </p>

                    {r.plantas.map((p, iP) => {
                        const planta = estado.plantas[iP];
                        const m2Planta = p.locales.reduce((s, l) => s + (l.m2 || 0), 0);
                        return (
                            <div key={iP} className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                                    <div className="text-xs font-black uppercase tracking-widest text-white">
                                        {etiquetaPlanta(p.planta)}
                                        <span className="ml-2 text-white/35 font-bold normal-case tracking-normal">
                                            {p.locales.length} estancia{p.locales.length === 1 ? '' : 's'} · {fmt(m2Planta)} m²
                                        </span>
                                    </div>
                                    {estado.plantas.length > 1 && (
                                        <button type="button" disabled={saving}
                                            onClick={() => setEstado(quitarPlanta(estado, iP))}
                                            className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-red-400 transition-colors">
                                            Quitar planta
                                        </button>
                                    )}
                                </div>

                                {/* Contadores: cuántas de cada clase hay en ESTA planta. */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 py-3">
                                    {TIPOS_LOCAL.map(t => {
                                        const n = contar(planta, t.id);
                                        return (
                                            <div key={t.id}
                                                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${n ? 'border-brand/30 bg-brand/5' : 'border-white/[0.06]'}`}>
                                                <span className={`text-[11px] font-bold truncate ${n ? 'text-white' : 'text-white/40'}`}>{t.label}</span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button type="button" disabled={saving || !n}
                                                        onClick={() => setEstado(restarLocal(estado, iP, t.id))}
                                                        className="w-6 h-6 rounded-md border border-white/10 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-25 text-sm leading-none"
                                                        aria-label={`Quitar ${t.label}`}>−</button>
                                                    <span className={`w-5 text-center text-xs font-black ${n ? 'text-brand' : 'text-white/30'}`}>{n}</span>
                                                    <button type="button" disabled={saving}
                                                        onClick={() => setEstado(sumarLocal(estado, iP, t.id))}
                                                        className="w-6 h-6 rounded-md border border-white/10 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-25 text-sm leading-none"
                                                        aria-label={`Añadir ${t.label}`}>+</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Lo que va a salir en la tabla, con sus m². */}
                                {p.locales.length > 0 && (
                                    <div className="px-4 pb-3 space-y-1">
                                        {p.locales.map((l, iL) => (
                                            <div key={iL} className="flex items-center gap-3 text-[11px]">
                                                <span className="flex-1 font-bold text-white/80 truncate">{l.nombre}</span>
                                                <span className="w-8 text-center text-white/35">{l.orientacion}</span>
                                                <div className="flex items-center gap-1">
                                                    <CampoDecimal
                                                        valor={l.manual ? l.m2 : null}
                                                        placeholder={String(l.m2 ?? 0)}
                                                        onCambio={(v) => setEstado(fijarM2(estado, iP, iL, v))}
                                                        alVaciar={() => setEstado(fijarM2(estado, iP, iL, null))}
                                                        disabled={saving}
                                                        className={`w-16 px-2 py-1 rounded-md bg-white/[0.04] border text-right text-white text-[11px] ${l.manual ? 'border-brand/50' : 'border-white/10 placeholder:text-white/50'}`} />
                                                    <span className="text-white/35">m²</span>
                                                </div>
                                                <span className="w-12 text-[9px] font-black uppercase tracking-wider text-white/30">
                                                    {l.manual ? (
                                                        <button type="button" onClick={() => setEstado(fijarM2(estado, iP, iL, null))}
                                                            className="text-brand/80 hover:text-brand">auto</button>
                                                    ) : 'auto'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <div className="flex items-center justify-between gap-3">
                        <button type="button" disabled={saving} onClick={() => setEstado(anadirPlanta(estado))}
                            className="px-3 py-2 rounded-lg border border-dashed border-white/15 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/35 transition-all">
                            + Añadir planta
                        </button>
                        <button type="button" disabled={saving} onClick={restablecer}
                            className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white/70 transition-colors">
                            Volver a la propuesta
                        </button>
                    </div>

                    <p className="text-[11px] text-white/40 leading-relaxed">
                        {conElementos
                            ? 'La potencia de cada estancia sale de su superficie por el factor de la zona climática, y los elementos de radiador a razón de 100 W por elemento.'
                            : 'La potencia de cada estancia sale de su superficie por el factor de la zona climática. Con este emisor la columna de elementos queda en blanco.'}
                    </p>

                    {(r.avisos.length > 0 || excede) && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
                            {r.avisos.map((a, i) => <p key={i} className="text-[11px] text-amber-300">⚠ {a}</p>)}
                        </div>
                    )}
                    {error && <p className="text-[11px] text-red-400">❌ {error}</p>}
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3 shrink-0">
                    <button type="button" disabled={saving} onClick={onCancel}
                        className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                        Cancelar
                    </button>
                    <div className="flex items-center gap-4">
                        <span className="hidden sm:inline text-[10px] font-bold text-white/35">
                            {nLocales} estancia{nLocales === 1 ? '' : 's'} · {fmt(r.asignado)} de {fmt(r.total)} m²
                        </span>
                        <button type="button" disabled={saving || !nLocales || excede} onClick={confirmar}
                            className="px-5 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40">
                            {saving ? 'Guardando…' : 'Guardar y continuar →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function fmt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return (Math.round(v * 10) / 10).toLocaleString('es-ES');
}
