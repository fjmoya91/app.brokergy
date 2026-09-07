import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { VentanaModeloModal } from '../components/VentanaModeloModal';
import {
    aperturaCorta, faltaEnMarco, faltaEnCristal, enumerar, num,
} from '../../expedientes/logic/ventanasCatalogo';

// ============================================================================
// VentanasView — el catálogo de marcos y vidrios, en su propia pestaña.
// ----------------------------------------------------------------------------
// Gemelo de la vista de Aerotermia. Lo que importa aquí no es listar: es ver de
// un vistazo QUÉ MODELOS ESTÁN INCOMPLETOS, porque un modelo sin Uf no
// autorrellena nada y un modelo sin ficha deja el certificado RES080 con un
// anexo en blanco. Por eso la primera columna de la fila es lo que le falta y
// hay un filtro "solo los incompletos".
// ============================================================================

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const casa = (t, q) => norm(q).split(/\s+/).filter(Boolean).every(p => norm(t).includes(p));
const fmt = (v) => { const n = num(v); return n === null ? '—' : String(n).replace('.', ','); };

const TABS = [
    { id: 'marcos',    label: 'Marcos',    hint: 'Perfil del sistema — su Uf' },
    { id: 'cristales', label: 'Cristales', hint: 'Capa y composición — su Ug y factor solar' },
];

export function VentanasView() {
    const [tipo, setTipo] = useState('marcos');
    const [filas, setFilas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const [soloIncompletos, setSoloIncompletos] = useState(false);
    const [modal, setModal] = useState(null);      // { tipo, modelo|null }
    const [borrando, setBorrando] = useState(null);

    const esMarco = tipo === 'marcos';

    const cargar = async (t = tipo) => {
        setCargando(true); setError(null);
        try {
            const { data } = await axios.get(`/api/ventanas/${t}`);
            setFilas(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido leer el catálogo');
            setFilas([]);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => { cargar(tipo); /* eslint-disable-next-line */ }, [tipo]);

    const conFalta = useMemo(() => filas.map(f => ({
        ...f, _falta: esMarco ? faltaEnMarco(f) : faltaEnCristal(f),
    })), [filas, esMarco]);

    const visibles = useMemo(() => conFalta.filter(f => {
        if (soloIncompletos && f._falta.length === 0) return false;
        if (!q.trim()) return true;
        return casa(esMarco
            ? [f.marca, f.serie, f.apertura, f.material, f.notas].join(' ')
            : [f.fabricante, f.gama, f.composicion, f.notas].join(' '), q);
    }), [conFalta, q, soloIncompletos, esMarco]);

    // Mientras carga, `filas` son todavía las del OTRO catálogo: contarlas con el
    // criterio nuevo daba un "22 sin completar" que parpadeaba y era mentira.
    const incompletos = cargando ? 0 : conFalta.filter(f => f._falta.length > 0).length;

    const borrar = async (fila) => {
        setBorrando(fila.id);
        try {
            await axios.delete(`/api/ventanas/${tipo}/${fila.id}`);
            setFilas(prev => prev.filter(f => f.id !== fila.id));
        } catch (e) {
            alert('❌ ' + (e.response?.data?.error || 'No se ha podido eliminar'));
        } finally {
            setBorrando(null);
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Catálogo de ventanas</h1>
                    <p className="text-xs text-white/35 mt-1 max-w-2xl leading-snug">
                        De aquí salen el Uf del marco y el Ug y el factor solar del vidrio de cada RES080, y las
                        fichas técnicas que el certificado adjunta como anexo. La <b className="text-white/60">marca</b> es
                        el fabricante del sistema (Cortizo, Kömmerling…), nunca la carpintería que monta la ventana:
                        ésa va en el expediente.
                    </p>
                </div>
                <button
                    onClick={() => setModal({ tipo, modelo: null })}
                    className="px-5 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 active:scale-95 transition-all">
                    + Añadir {esMarco ? 'marco' : 'vidrio'}
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => { setTipo(t.id); setQ(''); }}
                            title={t.hint}
                            className={`px-5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                                tipo === t.id ? 'bg-brand text-black' : 'text-white/25 hover:text-white/50'
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <input
                    value={q} onChange={e => setQ(e.target.value)}
                    placeholder={esMarco ? 'Buscar marca, serie, material…' : 'Buscar gama, composición…'}
                    className="flex-1 min-w-[200px] h-11 bg-bkg-elevated border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none focus:border-brand/40 no-uppercase"
                />

                {incompletos > 0 && (
                    <button onClick={() => setSoloIncompletos(v => !v)}
                        className={`h-11 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${
                            soloIncompletos
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-white/[0.03] border-white/10 text-white/40 hover:text-white/70'
                        }`}>
                        {incompletos} sin completar
                    </button>
                )}
            </div>

            {cargando && <div className="py-16 text-center text-sm text-white/30">Cargando catálogo…</div>}
            {error && <div className="py-6 text-center text-sm text-red-400">{error}</div>}

            {!cargando && !error && (
                <div className="bg-bkg-surface border border-white/5 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] text-white/30 uppercase font-black tracking-widest border-b border-white/5">
                                    <th className="text-left px-5 py-3">{esMarco ? 'Marca' : 'Fabricante'}</th>
                                    <th className="text-left px-5 py-3">{esMarco ? 'Serie' : 'Gama'}</th>
                                    <th className="text-left px-5 py-3">{esMarco ? 'Apertura' : 'Composición'}</th>
                                    {esMarco
                                        ? <><th className="text-left px-5 py-3">Material</th>
                                            <th className="text-right px-5 py-3">Uf</th></>
                                        : <><th className="text-right px-5 py-3">Ug</th>
                                            <th className="text-right px-5 py-3">g</th></>}
                                    <th className="text-center px-5 py-3">Ficha</th>
                                    <th className="text-left px-5 py-3">Estado</th>
                                    <th className="px-5 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.length === 0 && (
                                    <tr><td colSpan={8} className="px-5 py-12 text-center text-white/25 text-xs">
                                        {q.trim() || soloIncompletos ? 'Nada casa con ese filtro.' : 'El catálogo está vacío.'}
                                    </td></tr>
                                )}
                                {visibles.map(f => (
                                    <tr key={f.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3 font-black text-white">{esMarco ? f.marca : f.fabricante}</td>
                                        <td className="px-5 py-3 text-white/80">{esMarco ? f.serie : f.gama}</td>
                                        <td className="px-5 py-3 text-white/45">{esMarco ? aperturaCorta(f.apertura) : f.composicion}</td>
                                        {esMarco ? (
                                            <>
                                                <td className="px-5 py-3 text-white/45">{f.material || '—'}</td>
                                                <td className="px-5 py-3 text-right font-black text-brand tabular-nums">{fmt(f.uf)}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-5 py-3 text-right font-black text-brand tabular-nums">{fmt(f.ug)}</td>
                                                <td className="px-5 py-3 text-right font-black text-brand tabular-nums">{fmt(f.factor_solar)}</td>
                                            </>
                                        )}
                                        <td className="px-5 py-3 text-center">
                                            {f.ficha_tecnica
                                                ? <a href={f.ficha_tecnica} target="_blank" rel="noreferrer"
                                                     className="text-emerald-400/80 hover:text-emerald-300 font-black text-xs">Ver</a>
                                                : <span className="text-white/15 text-xs">—</span>}
                                        </td>
                                        <td className="px-5 py-3">
                                            {f._falta.length > 0
                                                ? <span className="text-[11px] text-amber-300/90">Falta {enumerar(f._falta)}</span>
                                                : (f.validado
                                                    ? <span className="text-[11px] text-emerald-400/70">Verificado</span>
                                                    : <span className="text-[11px] text-white/30">Sin verificar</span>)}
                                        </td>
                                        <td className="px-5 py-3 text-right whitespace-nowrap">
                                            <button onClick={() => setModal({ tipo, modelo: f })}
                                                className="text-[11px] font-black uppercase text-white/40 hover:text-brand transition-colors">
                                                Editar
                                            </button>
                                            <button onClick={() => borrar(f)} disabled={borrando === f.id}
                                                className="ml-4 text-[11px] font-black uppercase text-white/15 hover:text-red-400 transition-colors disabled:opacity-40">
                                                {borrando === f.id ? '…' : 'Borrar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {modal && (
                <VentanaModeloModal
                    tipo={modal.tipo}
                    modelo={modal.modelo}
                    onClose={() => setModal(null)}
                    onGuardado={() => cargar(tipo)}
                />
            )}
        </div>
    );
}
