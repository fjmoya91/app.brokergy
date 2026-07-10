import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de seguimiento del CERTIFICADOR.
//
// Una fila por expediente asignado, con el punto exacto en que está cada CEE
// (inicial y final) y la fecha en que se registró. Sirve al equipo interno (desde
// la ficha del certificador) y al propio certificador (desde su panel), que la usa
// para saber qué CEE puede facturar ya. No muestra importes.
// ─────────────────────────────────────────────────────────────────────────────

// Fases del CEE, en el orden real del ciclo de vida (ver CLAUDE.md).
const FASES = ['PTE_ENVIO_CERT', 'ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION', 'PRESENTADO', 'PTE_REVISION', 'REVISADO', 'REGISTRADO'];

const ETIQUETAS = {
    PTE_ENVIO_CERT: 'Pte. encargo',
    ASIGNADO: 'Asignado',
    EN_TRABAJO: 'En trabajo',
    PTE_PRESENTACION: 'Pte. presentar',
    PRESENTADO: 'Presentado',
    PTE_REVISION: 'En revisión',
    REVISADO: 'Visto bueno',
    REGISTRADO: 'Registrado',
};

// De quién depende avanzar. Es lo que convierte la tabla en algo accionable.
const RESPONSABLE = {
    PTE_ENVIO_CERT: 'BROKERGY',
    ASIGNADO: 'CERTIFICADOR',
    EN_TRABAJO: 'CERTIFICADOR',
    PTE_PRESENTACION: 'CERTIFICADOR',
    PRESENTADO: 'BROKERGY',
    PTE_REVISION: 'BROKERGY',
    REVISADO: 'CERTIFICADOR',
    REGISTRADO: null,
};

const tonoFase = (fase) => {
    if (fase === 'REGISTRADO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (fase === 'REVISADO') return 'bg-brand/10 text-brand border-brand/30';
    if (fase === 'PTE_REVISION' || fase === 'PRESENTADO') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (fase === 'PTE_ENVIO_CERT') return 'bg-white/[0.04] text-white/30 border-white/10';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
};

const Badge = ({ fase }) => (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border whitespace-nowrap ${tonoFase(fase)}`}>
        {ETIQUETAS[fase] || fase}
    </span>
);

const fmtFecha = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d) ? null : d.toLocaleDateString('es-ES');
};

// La fase que bloquea es la del CEE inicial mientras no esté registrado.
const faseActivaDe = (r) => (r.cee_inicial !== 'REGISTRADO' ? r.cee_inicial : r.cee_final);

// Búsqueda insensible a tildes (misma convención que el resto de buscadores).
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Descarga un CSV que Excel abre directamente: separador ';' (locale es-ES) y BOM
// UTF-8 para que no rompa las tildes.
const descargarCsv = (filas, nombreFichero) => {
    const CABECERAS = ['Expediente', 'Cliente', 'Dirección', 'Municipio', 'Provincia', 'Estado', 'CEE inicial', 'Fecha registro CEE inicial', 'CEE final', 'Fecha registro CEE final', 'Falta'];
    const celda = (v) => {
        const s = (v ?? '').toString();
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [CABECERAS.join(';')];
    for (const r of filas) {
        const fase = faseActivaDe(r);
        lineas.push([
            r.numero_expediente, r.cliente_nombre, r.direccion, r.cliente_municipio, r.cliente_provincia,
            r.estado, ETIQUETAS[r.cee_inicial] || r.cee_inicial, fmtFecha(r.fecha_registro_cee_inicial) || '',
            ETIQUETAS[r.cee_final] || r.cee_final, fmtFecha(r.fecha_registro_cee_final) || '',
            RESPONSABLE[fase] || 'COMPLETO',
        ].map(celda).join(';'));
    }
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreFichero;
    a.click();
    URL.revokeObjectURL(url);
};

export function CertificadorResumenModal({ isOpen, onClose, prescriptorId, certificadorNombre }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [busqueda, setBusqueda] = useState('');
    const [faseIni, setFaseIni] = useState('');       // filtro por fase del CEE inicial
    const [faseFin, setFaseFin] = useState('');       // filtro por fase del CEE final
    const [responsable, setResponsable] = useState(''); // BROKERGY | CERTIFICADOR | COMPLETO

    useEffect(() => {
        if (!isOpen || !prescriptorId) return;
        setLoading(true);
        setError(null);
        setBusqueda(''); setFaseIni(''); setFaseFin(''); setResponsable('');
        axios.get(`/api/prescriptores/${prescriptorId}/expedientes-certificador`)
            .then(r => setRows(r.data || []))
            .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los expedientes.'))
            .finally(() => setLoading(false));
    }, [isOpen, prescriptorId]);

    const visibles = useMemo(() => rows.filter(r => {
        if (faseIni && r.cee_inicial !== faseIni) return false;
        if (faseFin && r.cee_final !== faseFin) return false;
        if (responsable) {
            const resp = RESPONSABLE[faseActivaDe(r)] || 'COMPLETO';
            if (resp !== responsable) return false;
        }
        if (busqueda.trim()) {
            const q = norm(busqueda);
            const heno = norm([r.numero_expediente, r.cliente_nombre, r.direccion, r.cliente_municipio, r.estado].join(' '));
            if (!heno.includes(q)) return false;
        }
        return true;
    }), [rows, faseIni, faseFin, responsable, busqueda]);

    const stats = useMemo(() => ({
        total: rows.length,
        enCertificador: rows.filter(r => RESPONSABLE[faseActivaDe(r)] === 'CERTIFICADOR').length,
        iniRegistrados: rows.filter(r => r.cee_inicial === 'REGISTRADO').length,
        finRegistrados: rows.filter(r => r.cee_final === 'REGISTRADO').length,
    }), [rows]);

    // Lo que el certificador puede facturar ya: CEE registrados dentro del filtro.
    const facturables = useMemo(
        () => visibles.filter(r => r.cee_inicial === 'REGISTRADO').length
            + visibles.filter(r => r.cee_final === 'REGISTRADO').length,
        [visibles]
    );

    const hayFiltro = !!(busqueda.trim() || faseIni || faseFin || responsable);

    if (!isOpen) return null;

    const selectCls = 'bg-bkg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 focus:outline-none focus:border-brand/40';

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-6xl max-h-[88vh] flex flex-col shadow-2xl">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 p-6 border-b border-white/[0.06]">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Seguimiento de certificados</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">{certificadorNombre || 'Certificador'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => descargarCsv(visibles, `certificados-${(certificadorNombre || 'certificador').replace(/[^\w-]+/g, '_')}.csv`)}
                            disabled={!visibles.length}
                            className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            title="Descarga las filas que se ven ahora mismo"
                        >
                            ↓ Excel ({visibles.length})
                        </button>
                        <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors" title="Cerrar">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Contadores */}
                {!loading && !error && rows.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-6 pt-5">
                        {[
                            { label: 'Expedientes', value: stats.total, color: 'text-white' },
                            { label: 'En su tejado', value: stats.enCertificador, color: 'text-amber-400' },
                            { label: 'CEE inicial registrado', value: `${stats.iniRegistrados}/${stats.total}`, color: 'text-emerald-400' },
                            { label: 'CEE final registrado', value: `${stats.finRegistrados}/${stats.total}`, color: 'text-emerald-400' },
                            { label: hayFiltro ? 'Facturables (filtro)' : 'Facturables', value: facturables, color: 'text-brand' },
                        ].map(s => (
                            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
                                <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filtros */}
                {!loading && !error && rows.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
                        <input
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar expediente, cliente, dirección…"
                            className="flex-1 min-w-[220px] bg-bkg-surface border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                        />
                        <select value={faseIni} onChange={e => setFaseIni(e.target.value)} className={selectCls}>
                            <option value="">CEE inicial: todos</option>
                            {FASES.map(f => <option key={f} value={f}>{ETIQUETAS[f]}</option>)}
                        </select>
                        <select value={faseFin} onChange={e => setFaseFin(e.target.value)} className={selectCls}>
                            <option value="">CEE final: todos</option>
                            {FASES.map(f => <option key={f} value={f}>{ETIQUETAS[f]}</option>)}
                        </select>
                        <select value={responsable} onChange={e => setResponsable(e.target.value)} className={selectCls}>
                            <option value="">Falta: todos</option>
                            <option value="CERTIFICADOR">Certificador</option>
                            <option value="BROKERGY">Brokergy</option>
                            <option value="COMPLETO">Completo</option>
                        </select>
                        {hayFiltro && (
                            <button
                                onClick={() => { setBusqueda(''); setFaseIni(''); setFaseFin(''); setResponsable(''); }}
                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors"
                            >✕ Limpiar</button>
                        )}
                    </div>
                )}

                {/* Tabla */}
                <div className="flex-1 overflow-auto custom-scrollbar px-6 py-4">
                    {loading && <p className="text-center text-white/30 text-xs py-10">Cargando expedientes…</p>}
                    {error && <p className="text-center text-red-400 text-xs py-10">{error}</p>}
                    {!loading && !error && rows.length === 0 && (
                        <p className="text-center text-white/30 text-xs py-10">Este certificador no tiene expedientes asignados.</p>
                    )}

                    {!loading && !error && visibles.length > 0 && (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-bkg-deep">
                                <tr className="border-b border-white/[0.06]">
                                    {['Expediente', 'Cliente', 'Estado', 'CEE inicial', 'Registrado', 'CEE final', 'Registrado', 'Falta'].map((h, i) => (
                                        <th key={`${h}-${i}`} className="pb-2 text-[9px] font-black uppercase tracking-widest text-white/25 whitespace-nowrap pr-4">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map(r => {
                                    const fase = faseActivaDe(r);
                                    const responsableFila = RESPONSABLE[fase];
                                    const fIni = fmtFecha(r.fecha_registro_cee_inicial);
                                    const fFin = fmtFecha(r.fecha_registro_cee_final);
                                    return (
                                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors align-top">
                                            <td className="py-2.5 pr-4">
                                                <span className="text-[11px] font-bold text-white whitespace-nowrap">{r.numero_expediente}</span>
                                                {r.prioridad === 'URGENTE' && <span className="ml-2 text-[9px] font-black text-red-400">⚠</span>}
                                            </td>
                                            <td className="py-2.5 pr-4 max-w-[260px]">
                                                <span className="text-[11px] text-white/60">{r.cliente_nombre || '—'}</span>
                                                {/* La dirección de la instalación es donde el certificador hace la visita. */}
                                                {r.direccion && <span className="block text-[9px] text-white/30 leading-snug">{r.direccion}</span>}
                                                {r.cliente_municipio && <span className="block text-[9px] text-white/25">{r.cliente_municipio}</span>}
                                            </td>
                                            <td className="py-2.5 pr-4"><span className="text-[10px] text-white/40 whitespace-nowrap">{r.estado}</span></td>
                                            <td className="py-2.5 pr-4"><Badge fase={r.cee_inicial} /></td>
                                            <td className="py-2.5 pr-4">
                                                {fIni
                                                    ? <span className="text-[10px] text-white/50 whitespace-nowrap">{fIni}</span>
                                                    : <span className="text-[10px] text-white/15">—</span>}
                                            </td>
                                            <td className="py-2.5 pr-4"><Badge fase={r.cee_final} /></td>
                                            <td className="py-2.5 pr-4">
                                                {fFin
                                                    ? <span className="text-[10px] text-white/50 whitespace-nowrap">{fFin}</span>
                                                    : <span className="text-[10px] text-white/15">—</span>}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {responsableFila
                                                    ? <span className={`text-[10px] font-black uppercase tracking-wider ${responsableFila === 'CERTIFICADOR' ? 'text-amber-400' : 'text-white/30'}`}>{responsableFila}</span>
                                                    : <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Completo</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {!loading && !error && rows.length > 0 && visibles.length === 0 && (
                        <p className="text-center text-white/30 text-xs py-10">Ningún expediente coincide con el filtro.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CertificadorResumenModal;
