import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { buildEquipoFicha } from '../logic/equipoFicha';
import { buildCe3xFinal } from '../logic/ce3xFinal';
import { getUnidades } from '../logic/aerotermiaUnits';

// ─── DATOS DEL EQUIPO — la chuleta para teclear el CEE en CE3X ────────────────
// El certificado de eficiencia energética se rellena a mano en CE3X mirando la
// app. Antes había que recorrer el expediente entero: marca y modelo en
// Instalación, SCOP en el bloque de rendimiento, SEER solo en el catálogo del
// modelo, superficie y demanda en el CEE. Eso es donde se cuelan los errores de
// transcripción, que luego rompen el ahorro declarado.
//
// Aquí está todo junto y CADA CAMPO SE COPIA CON UN CLIC: se pega en CE3X sin
// teclear, que es lo que de verdad evita la errata. El contenido lo decide
// `equipoFicha.js`; este componente solo lo pinta.
//
// El SEER vive en el CATÁLOGO del modelo, no en el expediente: por eso hay un
// fetch a /api/aerotermia/:id. Si el catálogo no lo trae, el campo sale marcado
// como pendiente en vez de en blanco — un hueco silencioso se copia sin darse
// cuenta.

function Campo({ campo, onCopy, copiado, onGuardar }) {
    const falta = !campo.valor;
    const [valor, setValor] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const editable = falta && campo.editable && onGuardar;

    const guardar = async () => {
        const n = parseFloat(String(valor).replace(',', '.'));
        if (!(n > 0)) { setError('Escribe un número mayor que 0.'); return; }
        setGuardando(true); setError(null);
        try {
            await onGuardar(campo.editable, n);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se pudo guardar.');
            setGuardando(false);
        }
    };

    return (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-colors ${
            falta ? 'border-amber-500/25 bg-amber-500/[0.05]'
                  : 'border-white/8 bg-white/[0.03] hover:border-brand/30'
        }`}>
            <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{campo.label}</div>
                {falta ? (
                    <div className="text-[12px] text-amber-400/90 font-semibold mt-0.5">
                        No consta en el expediente
                    </div>
                ) : (
                    <div className={`text-white mt-0.5 break-words ${
                        campo.mono ? 'font-mono text-[13px] tracking-wide' : 'text-[13px]'
                    } ${campo.destacado ? 'font-black text-brand' : 'font-semibold'}`}>
                        {campo.valor}
                    </div>
                )}
                {campo.nota && (
                    <div className="text-[10px] text-white/35 mt-0.5">{campo.nota}</div>
                )}
                {editable && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={valor}
                            onChange={e => { setValor(e.target.value); setError(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') guardar(); }}
                            disabled={guardando}
                            placeholder={`Ej: 4,60`}
                            className="w-24 bg-bkg-elevated border border-amber-500/40 rounded-md px-2 py-1 text-white text-[12px] font-mono focus:outline-none focus:border-brand/60 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onClick={guardar}
                            disabled={guardando}
                            className="px-2 py-1 rounded-md bg-brand text-bkg-deep text-[9px] font-black uppercase tracking-widest disabled:opacity-50"
                        >
                            {guardando ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                )}
                {error && <div className="text-[10px] text-red-400 mt-1">{error}</div>}
            </div>
            {!falta && (
                <button
                    type="button"
                    onClick={() => onCopy(campo.valor)}
                    title="Copiar"
                    className={`flex-shrink-0 mt-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors ${
                        copiado ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-white/5 text-white/40 hover:bg-brand/20 hover:text-brand'
                    }`}
                >
                    {copiado ? '✓' : 'Copiar'}
                </button>
            )}
        </div>
    );
}

export function EquipoInfoModal({ isOpen, onClose, expediente }) {
    const [modelos, setModelos] = useState({});
    const [cargando, setCargando] = useState(false);
    const [copiado, setCopiado] = useState(null);

    // El SEER y el resto de la ficha del modelo están en el catálogo, no en el
    // expediente: se traen al abrir (y solo al abrir).
    useEffect(() => {
        if (!isOpen) return;
        const inst = expediente?.instalacion || {};
        const ids = [...new Set(
            [...getUnidades(inst.aerotermia_cal), ...getUnidades(inst.aerotermia_acs)]
                .map(u => u?.aerotermia_db_id).filter(Boolean)
        )];
        if (!ids.length) return;
        let cancelado = false;
        setCargando(true);
        (async () => {
            const out = {};
            await Promise.all(ids.map(async (id) => {
                try {
                    const { data } = await axios.get(`/api/aerotermia/${id}`);
                    if (data) out[id] = data;
                } catch { /* el modelo puede haberse borrado del catálogo */ }
            }));
            if (cancelado) return;
            setModelos(out);
            setCargando(false);
        })();
        return () => { cancelado = true; };
    }, [isOpen, expediente?.id]);

    const { secciones } = useMemo(
        () => (isOpen ? buildEquipoFicha(expediente, { modelos }) : { secciones: [] }),
        [isOpen, expediente, modelos]
    );

    const copiar = async (texto, clave) => {
        try {
            await navigator.clipboard.writeText(String(texto));
            setCopiado(clave ?? texto);
            setTimeout(() => setCopiado(null), 1400);
        } catch { /* contexto no seguro: el usuario lo selecciona a mano */ }
    };

    // Guardar un dato que faltaba. El SEER es del MODELO, así que va al CATÁLOGO
    // (`PATCH /api/aerotermia/:id/datos-rite`, la misma ruta que usa el encargo del
    // CEE final): se teclea UNA vez y sirve para todos los expedientes que lleven
    // ese equipo. La respuesta trae la fila actualizada, con lo que la ficha se
    // recalcula sola y el campo pasa de ámbar a copiable sin recargar nada.
    const guardarDato = async ({ modeloId }, valor) => {
        const { data } = await axios.patch(`/api/aerotermia/${modeloId}/datos-rite`, { seer: valor });
        setModelos(prev => ({ ...prev, [modeloId]: { ...(prev[modeloId] || {}), ...(data || { seer: valor }) } }));
    };

    // "Copiar todo" reutiliza el MISMO texto que se le manda al certificador por
    // WhatsApp: si aquí se redactara aparte, cada uno acabaría diciendo una cosa.
    const copiarBloque = () => {
        const { bloque } = buildCe3xFinal(expediente, { modelos });
        if (bloque) copiar(bloque, '__bloque__');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>

                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10">
                    <div className="min-w-0">
                        <h3 className="text-white font-black text-base uppercase tracking-wide">Datos del equipo</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            Para teclear el Certificado de Eficiencia Energética (CE3X). Cada campo se copia con un clic.
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="flex-shrink-0 text-white/40 hover:text-white text-xl leading-none px-2">×</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {cargando && (
                        <p className="text-[11px] text-white/40">Cargando las fichas del catálogo (SEER, potencias)…</p>
                    )}

                    {!secciones.length && !cargando && (
                        <p className="text-[12px] text-amber-400/90">
                            El expediente todavía no tiene equipo nuevo declarado: rellena marca y modelo en Instalación.
                        </p>
                    )}

                    {secciones.map(sec => (
                        <div key={sec.id}>
                            <div className="flex items-baseline gap-2 mb-2">
                                <h4 className="text-[11px] font-black uppercase tracking-widest text-brand">{sec.titulo}</h4>
                            </div>
                            {sec.subtitulo && (
                                <p className="text-[10.5px] text-white/40 mb-2 leading-relaxed">{sec.subtitulo}</p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {sec.campos.map((c, i) => (
                                    <Campo key={`${sec.id}_${i}`} campo={c}
                                           copiado={copiado === `${sec.id}_${i}`}
                                           onCopy={(v) => copiar(v, `${sec.id}_${i}`)}
                                           onGuardar={guardarDato} />
                                ))}
                            </div>
                            {sec.enlaces?.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {sec.enlaces.map(e => (
                                        <a key={e.url} href={e.url} target="_blank" rel="noreferrer"
                                           className="px-2.5 py-1 rounded-md bg-brand/10 border border-brand/25 text-brand text-[10px] font-bold uppercase tracking-widest hover:bg-brand/20">
                                            {e.label} ↗
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/10">
                    <span className="text-[10px] text-white/30">
                        Sale del expediente y del catálogo. Si algo no consta, se dice: no se inventa.
                    </span>
                    <div className="flex items-center gap-2">
                        {!!secciones.length && (
                            <button type="button" onClick={copiarBloque}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest hover:bg-white/10">
                                {copiado === '__bloque__' ? '✓ Copiado' : 'Copiar todo'}
                            </button>
                        )}
                        <button type="button" onClick={onClose}
                                className="px-4 py-1.5 rounded-lg bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EquipoInfoModal;
