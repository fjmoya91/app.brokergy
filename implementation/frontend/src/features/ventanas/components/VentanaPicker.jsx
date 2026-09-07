import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
    marcoLabel, cristalLabel, aperturaLabel, faltaEnMarco, faltaEnCristal, enumerar, num,
} from '../../expedientes/logic/ventanasCatalogo';

// ============================================================================
// VentanaPicker — elegir un marco o un vidrio DEL CATÁLOGO.
// ----------------------------------------------------------------------------
// Sustituye a los desplegables de texto libre que guardaban sus opciones en el
// `localStorage` del navegador: lo que uno escribía no lo veía nadie más, y por
// eso el mismo sistema acababa escrito de cinco maneras.
//
// REGLA — lo que FALTA se dice en la fila del modelo, no al elegirlo. La mitad
// de los marcos de aluminio del Drive tienen ficha pero no imprimen el Uf. Ese
// modelo se ofrece igual —su ficha ya es media función— pero la fila lo avisa
// antes de pulsarlo, y al elegirlo aparece el campo para teclearlo: se rellena
// una vez, con la ficha delante, y queda para todos los expedientes que vengan.
//
// REGLA — se busca sin tildes y por palabras sueltas. "planitherm 16" tiene que
// encontrar "PLANITHERM 4S · 4 (16 AIRE) 4"; escribir la composición exacta con
// sus paréntesis no lo hace nadie.
// ============================================================================

const norm = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Todas las palabras del filtro tienen que aparecer en algún sitio de la fila. */
function casa(texto, filtro) {
    const t = norm(texto);
    return norm(filtro).split(/\s+/).filter(Boolean).every(p => t.includes(p));
}

const fmt = (v, sufijo = '') => {
    const n = num(v);
    return n === null ? null : `${String(n).replace('.', ',')}${sufijo}`;
};

export function VentanaPicker({
    tipo,               // 'marcos' | 'cristales'
    valorId,            // id de la fila elegida (o null)
    resumen,            // qué enseñar cuando no hay id: lo que declara el expediente
    onElegir,           // (fila) => void
    onCrear,            // () => void  — abre el modal de alta
    onEditar,           // (fila) => void
    readOnly = false,
    recargarToken,      // cambia para forzar una recarga del catálogo
}) {
    const [abierto, setAbierto] = useState(false);
    const [filas, setFilas] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const boxRef = useRef(null);

    const esMarco = tipo === 'marcos';

    const cargar = async () => {
        setCargando(true); setError(null);
        try {
            const { data } = await axios.get(`/api/ventanas/${tipo}`);
            setFilas(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido leer el catálogo');
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [tipo, recargarToken]);

    // Cerrar al pulsar fuera. La lista es un popover: sin esto se queda abierta
    // encima del resto del formulario.
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto]);

    const elegida = useMemo(() => filas.find(f => f.id === valorId) || null, [filas, valorId]);

    const visibles = useMemo(() => {
        if (!q.trim()) return filas;
        return filas.filter(f => casa(
            esMarco
                ? [f.marca, f.serie, f.apertura, f.material, f.notas].join(' ')
                : [f.fabricante, f.gama, f.composicion, f.notas].join(' '),
            q
        ));
    }, [filas, q, esMarco]);

    const falta = elegida ? (esMarco ? faltaEnMarco(elegida) : faltaEnCristal(elegida)) : [];

    const etiqueta = elegida
        ? (esMarco ? marcoLabel(elegida) : cristalLabel(elegida))
        : (resumen || null);

    const cifras = elegida
        ? (esMarco
            ? [fmt(elegida.uf, ' W/m²K') && `Uf ${fmt(elegida.uf, ' W/m²K')}`, elegida.material].filter(Boolean)
            : [fmt(elegida.ug, ' W/m²K') && `Ug ${fmt(elegida.ug, ' W/m²K')}`, fmt(elegida.factor_solar) && `g ${fmt(elegida.factor_solar)}`].filter(Boolean))
        : [];

    return (
        <div className="relative" ref={boxRef}>
            <button
                type="button"
                disabled={readOnly}
                onClick={() => setAbierto(o => !o)}
                className={`w-full text-left bg-bkg-elevated border rounded-xl px-4 py-2.5 min-h-[44px] transition-all ${
                    readOnly ? 'border-white/5 text-white/20 cursor-default'
                             : 'border-white/10 text-white hover:border-white/20 focus:border-brand/40'
                }`}
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-bold truncate">
                            {etiqueta || <span className="text-white/25">— Elegir del catálogo —</span>}
                        </div>
                        {cifras.length > 0 && (
                            <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider mt-0.5">
                                {cifras.join(' · ')}
                            </div>
                        )}
                        {!elegida && etiqueta && (
                            <div className="text-[10px] text-amber-400/70 font-bold uppercase tracking-wider mt-0.5">
                                Escrito a mano · sin modelo del catálogo
                            </div>
                        )}
                    </div>
                    {!readOnly && (
                        <svg className="w-4 h-4 shrink-0 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    )}
                </div>
            </button>

            {/* Lo que le falta al modelo elegido, con la salida para corregirlo.
                Va FUERA del desplegable: hay que verlo sin abrir nada, porque es
                lo que impide que el certificado salga con el hueco en blanco. */}
            {elegida && falta.length > 0 && (
                <div className="mt-1.5 flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                    <span>⚠</span>
                    <span className="flex-1">
                        A este modelo le falta {enumerar(falta)}.
                        {!readOnly && (
                            <button type="button" onClick={() => onEditar?.(elegida)}
                                className="ml-1 underline font-bold hover:text-amber-200">
                                Completarlo en el catálogo
                            </button>
                        )}
                    </span>
                </div>
            )}
            {elegida && falta.length === 0 && !elegida.validado && (
                <div className="mt-1.5 text-[10px] text-white/30 uppercase font-bold tracking-wider">
                    Sin verificar · comprueba el dato contra la ficha
                </div>
            )}

            {abierto && !readOnly && (
                <div className="absolute z-40 mt-2 w-full min-w-[320px] bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-white/5">
                        <input
                            autoFocus
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder={esMarco ? 'Buscar marca, serie…' : 'Buscar gama, composición…'}
                            className="w-full bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand/40 no-uppercase"
                        />
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                        {cargando && <div className="px-4 py-6 text-center text-xs text-white/30">Cargando catálogo…</div>}
                        {error && <div className="px-4 py-6 text-center text-xs text-red-400">{error}</div>}
                        {!cargando && !error && visibles.length === 0 && (
                            <div className="px-4 py-6 text-center text-xs text-white/30">
                                {q.trim() ? 'Ningún modelo casa con esa búsqueda.' : 'El catálogo está vacío.'}
                            </div>
                        )}
                        {visibles.map(f => {
                            const fal = esMarco ? faltaEnMarco(f) : faltaEnCristal(f);
                            const vals = esMarco
                                ? [fmt(f.uf) && `Uf ${fmt(f.uf)}`, f.material].filter(Boolean)
                                : [fmt(f.ug) && `Ug ${fmt(f.ug)}`, fmt(f.factor_solar) && `g ${fmt(f.factor_solar)}`].filter(Boolean);
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => { onElegir?.(f); setAbierto(false); setQ(''); }}
                                    className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors border-l-2 ${
                                        f.id === valorId ? 'border-brand bg-brand/5' : 'border-transparent'
                                    }`}
                                >
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-sm font-bold text-white truncate">
                                            {esMarco ? `${f.marca} ${f.serie}` : cristalLabel(f)}
                                        </span>
                                        <span className="text-[10px] font-black text-brand/70 shrink-0 tabular-nums">
                                            {vals.join(' · ')}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-white/30 uppercase font-bold tracking-wider mt-0.5 flex items-center gap-2">
                                        {esMarco ? aperturaLabel(f.apertura) : f.fabricante}
                                        {f.ficha_tecnica && <span className="text-emerald-400/60">· con ficha</span>}
                                        {fal.length > 0 && <span className="text-amber-400/70">· falta {enumerar(fal)}</span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-2 border-t border-white/5 flex items-center gap-2">
                        <button type="button"
                            onClick={() => { setAbierto(false); onCrear?.(); }}
                            className="flex-1 px-3 py-2 rounded-lg bg-brand/10 text-brand text-[11px] font-black uppercase tracking-wider hover:bg-brand/20 transition-colors">
                            + Añadir un modelo
                        </button>
                        {elegida && (
                            <button type="button"
                                onClick={() => { setAbierto(false); onEditar?.(elegida); }}
                                className="px-3 py-2 rounded-lg bg-white/5 text-white/50 text-[11px] font-black uppercase tracking-wider hover:text-white transition-colors">
                                Editar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
