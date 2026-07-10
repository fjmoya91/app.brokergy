import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Resumen de seguimiento del CERTIFICADOR.
//
// Una fila por expediente asignado, con el punto exacto en que está cada CEE
// (inicial y final). Sirve tanto al equipo interno (desde la ficha del
// certificador) como al propio certificador (desde su panel). No muestra
// importes: el certificador no ve dinero.
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

export function CertificadorResumenModal({ isOpen, onClose, prescriptorId, certificadorNombre }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [soloPendientes, setSoloPendientes] = useState(false);

    useEffect(() => {
        if (!isOpen || !prescriptorId) return;
        setLoading(true);
        setError(null);
        axios.get(`/api/prescriptores/${prescriptorId}/expedientes-certificador`)
            .then(r => setRows(r.data || []))
            .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los expedientes.'))
            .finally(() => setLoading(false));
    }, [isOpen, prescriptorId]);

    // Un expediente está "cerrado" para el certificador cuando el CEE final está
    // registrado. Hasta entonces algo queda por hacer, aunque no sea suyo.
    const visibles = useMemo(
        () => (soloPendientes ? rows.filter(r => r.cee_final !== 'REGISTRADO') : rows),
        [rows, soloPendientes]
    );

    const stats = useMemo(() => ({
        total: rows.length,
        enCertificador: rows.filter(r => {
            const fase = r.cee_inicial !== 'REGISTRADO' ? r.cee_inicial : r.cee_final;
            return RESPONSABLE[fase] === 'CERTIFICADOR';
        }).length,
        iniRegistrados: rows.filter(r => r.cee_inicial === 'REGISTRADO').length,
        finRegistrados: rows.filter(r => r.cee_final === 'REGISTRADO').length,
    }), [rows]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-5xl max-h-[88vh] flex flex-col shadow-2xl">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 p-6 border-b border-white/[0.06]">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Seguimiento de certificados</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">{certificadorNombre || 'Certificador'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0" title="Cerrar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Contadores */}
                {!loading && !error && rows.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-5">
                        {[
                            { label: 'Expedientes', value: stats.total, color: 'text-white' },
                            { label: 'En su tejado', value: stats.enCertificador, color: 'text-amber-400' },
                            { label: 'CEE inicial registrado', value: `${stats.iniRegistrados}/${stats.total}`, color: 'text-emerald-400' },
                            { label: 'CEE final registrado', value: `${stats.finRegistrados}/${stats.total}`, color: 'text-emerald-400' },
                        ].map(s => (
                            <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
                                <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Filtro */}
                {!loading && !error && rows.length > 0 && (
                    <div className="px-6 pt-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} className="w-4 h-4 accent-brand" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Solo los que tienen algo pendiente</span>
                        </label>
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
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    {['Expediente', 'Cliente', 'Estado', 'CEE inicial', 'CEE final', 'Falta'].map(h => (
                                        <th key={h} className="pb-2 text-[9px] font-black uppercase tracking-widest text-white/25 whitespace-nowrap pr-4">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map(r => {
                                    // La fase que bloquea es la del CEE inicial mientras no esté registrado.
                                    const faseActiva = r.cee_inicial !== 'REGISTRADO' ? r.cee_inicial : r.cee_final;
                                    const responsable = RESPONSABLE[faseActiva];
                                    return (
                                        <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                            <td className="py-2.5 pr-4">
                                                <span className="text-[11px] font-bold text-white whitespace-nowrap">{r.numero_expediente}</span>
                                                {r.prioridad === 'URGENTE' && <span className="ml-2 text-[9px] font-black text-red-400">⚠</span>}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                <span className="text-[11px] text-white/60">{r.cliente_nombre || '—'}</span>
                                                {r.cliente_municipio && <span className="block text-[9px] text-white/25">{r.cliente_municipio}</span>}
                                            </td>
                                            <td className="py-2.5 pr-4"><span className="text-[10px] text-white/40 whitespace-nowrap">{r.estado}</span></td>
                                            <td className="py-2.5 pr-4"><Badge fase={r.cee_inicial} /></td>
                                            <td className="py-2.5 pr-4"><Badge fase={r.cee_final} /></td>
                                            <td className="py-2.5 pr-4">
                                                {responsable
                                                    ? <span className={`text-[10px] font-black uppercase tracking-wider ${responsable === 'CERTIFICADOR' ? 'text-amber-400' : 'text-white/30'}`}>{responsable}</span>
                                                    : <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Completo</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {!loading && !error && rows.length > 0 && visibles.length === 0 && (
                        <p className="text-center text-emerald-400/70 text-xs py-10">Todo registrado. No queda nada pendiente.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CertificadorResumenModal;
