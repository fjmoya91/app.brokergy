import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Seguimiento de certificados de un CERTIFICADOR.
//
// Una fila por expediente asignado, con el punto exacto en que está cada CEE
// (inicial y final) y la fecha en que se registró. Es la MISMA superficie en dos
// sitios, para que Brokergy y el certificador miren siempre la misma tabla:
//
//   · `CertificadorResumenPanel` → embebido en el panel de expedientes del propio
//     certificador (sus filas abren el expediente).
//   · `CertificadorResumenModal` → popup desde la ficha del certificador, para el
//     equipo interno.
//
// No muestra importes: el certificador no ve dinero (ver `roleFlags`).
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

// Qué se espera exactamente de quien bloquea. Sin esto, "CERTIFICADOR" no dice
// si toca visitar, presentar o registrar.
const SIGUIENTE_PASO = {
    PTE_ENVIO_CERT: 'Brokergy debe enviarte el encargo',
    ASIGNADO: 'Acepta el encargo y programa la visita',
    EN_TRABAJO: 'Visita y mediciones en curso',
    PTE_PRESENTACION: 'Sube el .cex firmado',
    PRESENTADO: 'Brokergy está revisando el CEE',
    PTE_REVISION: 'Brokergy está revisando el CEE',
    REVISADO: 'Tienes el visto bueno: registra en Industria',
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

// Días que un expediente lleva parado esperando al certificador.
const diasDesde = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

// La fase que bloquea es la del CEE inicial mientras no esté registrado.
const faseActivaDe = (r) => (r.cee_inicial !== 'REGISTRADO' ? r.cee_inicial : r.cee_final);

// Mismos códigos y mismo orden que la tabla del panel de administración.
const PRIORITY_ORDER = { URGENTE: 0, ALTA: 1, NORMAL: 2 };

// Franja de color a la izquierda de la fila, como en el panel de administración.
const bordePrioridad = (p) => {
    if (p === 'URGENTE') return 'border-l-2 border-l-red-500/70 hover:bg-red-500/[0.03]';
    if (p === 'ALTA') return 'border-l-2 border-l-amber-500/70 hover:bg-amber-500/[0.03]';
    return '';
};

const BadgePrioridad = ({ prioridad }) => {
    if (!prioridad || prioridad === 'NORMAL') return null;
    const esUrgente = prioridad === 'URGENTE';
    return (
        <span className={`ml-2 inline-block px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border whitespace-nowrap ${
            esUrgente ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        }`}>
            {esUrgente ? '⚠ ' : '● '}{prioridad}
        </span>
    );
};

const FILAS_POR_PAGINA = 10;

// Búsqueda insensible a tildes (misma convención que el resto de buscadores).
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Descarga un CSV que Excel abre directamente: separador ';' (locale es-ES) y BOM
// UTF-8 para que no rompa las tildes.
const descargarCsv = (filas, nombreFichero) => {
    const CABECERAS = ['Expediente', 'Prioridad', 'Cliente', 'Dirección', 'Municipio', 'Provincia', 'Estado', 'CEE inicial', 'Fecha registro CEE inicial', 'CEE final', 'Fecha registro CEE final', 'Falta', 'Siguiente paso'];
    const celda = (v) => {
        const s = (v ?? '').toString();
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = [CABECERAS.join(';')];
    for (const r of filas) {
        const fase = faseActivaDe(r);
        lineas.push([
            r.numero_expediente, r.prioridad || 'NORMAL', r.cliente_nombre, r.direccion, r.cliente_municipio, r.cliente_provincia,
            r.estado, ETIQUETAS[r.cee_inicial] || r.cee_inicial, fmtFecha(r.fecha_registro_cee_inicial) || '',
            ETIQUETAS[r.cee_final] || r.cee_final, fmtFecha(r.fecha_registro_cee_final) || '',
            RESPONSABLE[fase] || 'COMPLETO', SIGUIENTE_PASO[fase] || 'Sin acciones pendientes',
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

/**
 * Tabla + contadores + filtros + exportación. `onOpenExpediente` la hace navegable
 * (se usa en el panel del certificador); sin ella las filas no son clicables.
 */
export function CertificadorResumenPanel({ prescriptorId, certificadorNombre, onOpenExpediente, embedded = false }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [busqueda, setBusqueda] = useState('');
    const [faseIni, setFaseIni] = useState('');         // filtro por fase del CEE inicial
    const [faseFin, setFaseFin] = useState('');         // filtro por fase del CEE final
    const [responsable, setResponsable] = useState(''); // BROKERGY | CERTIFICADOR | COMPLETO
    const [prioridad, setPrioridad] = useState('');     // URGENTE | ALTA | NORMAL

    // Paginación: 10 filas por página, con opción de verlas todas y hacer scroll.
    const [pagina, setPagina] = useState(1);
    const [verTodos, setVerTodos] = useState(false);

    useEffect(() => {
        if (!prescriptorId) return;
        setLoading(true);
        setError(null);
        setBusqueda(''); setFaseIni(''); setFaseFin(''); setResponsable(''); setPrioridad('');
        setPagina(1); setVerTodos(false);
        axios.get(`/api/prescriptores/${prescriptorId}/expedientes-certificador`)
            .then(r => setRows(r.data || []))
            .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar los expedientes.'))
            .finally(() => setLoading(false));
    }, [prescriptorId]);

    const visibles = useMemo(() => {
        const filtradas = rows.filter(r => {
            if (faseIni && r.cee_inicial !== faseIni) return false;
            if (faseFin && r.cee_final !== faseFin) return false;
            if (prioridad && (r.prioridad || 'NORMAL') !== prioridad) return false;
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
        });

        // La PRIORIDAD manda, como en el panel de administración: urgentes arriba.
        // Después, lo que espera por el certificador; y dentro de cada grupo, lo más
        // antiguo primero (es lo que más tiempo lleva parado). Lo completo, al final.
        const peso = (r) => {
            const resp = RESPONSABLE[faseActivaDe(r)];
            if (resp === 'CERTIFICADOR') return 0;
            if (resp === 'BROKERGY') return 1;
            return 2;
        };
        return filtradas.sort((a, b) =>
            (PRIORITY_ORDER[a.prioridad] ?? 2) - (PRIORITY_ORDER[b.prioridad] ?? 2)
            || peso(a) - peso(b)
            || new Date(a.created_at) - new Date(b.created_at)
        );
    }, [rows, faseIni, faseFin, responsable, prioridad, busqueda]);

    // El Excel exporta SIEMPRE el filtro completo, no solo la página que se ve.
    const paginas = Math.max(1, Math.ceil(visibles.length / FILAS_POR_PAGINA));
    const paginaActual = Math.min(pagina, paginas);
    const enPantalla = verTodos
        ? visibles
        : visibles.slice((paginaActual - 1) * FILAS_POR_PAGINA, paginaActual * FILAS_POR_PAGINA);

    // Cualquier cambio de filtro devuelve a la primera página.
    useEffect(() => { setPagina(1); }, [faseIni, faseFin, responsable, prioridad, busqueda]);

    const stats = useMemo(() => ({
        total: rows.length,
        enCertificador: rows.filter(r => RESPONSABLE[faseActivaDe(r)] === 'CERTIFICADOR').length,
        iniRegistrados: rows.filter(r => r.cee_inicial === 'REGISTRADO').length,
        finRegistrados: rows.filter(r => r.cee_final === 'REGISTRADO').length,
    }), [rows]);

    // Lo que se puede facturar ya: CEE registrados dentro del filtro.
    const facturables = useMemo(
        () => visibles.filter(r => r.cee_inicial === 'REGISTRADO').length
            + visibles.filter(r => r.cee_final === 'REGISTRADO').length,
        [visibles]
    );

    const hayFiltro = !!(busqueda.trim() || faseIni || faseFin || responsable || prioridad);
    const limpiar = () => { setBusqueda(''); setFaseIni(''); setFaseFin(''); setResponsable(''); setPrioridad(''); };

    const selectCls = 'bg-bkg-surface border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 focus:outline-none focus:border-brand/40';

    const exportar = () => descargarCsv(visibles, `certificados-${(certificadorNombre || 'certificador').replace(/[^\w-]+/g, '_')}.csv`);

    return (
        <div className={`flex flex-col min-h-0 gap-4 ${embedded ? '' : 'flex-1 px-6 py-5'}`}>
            {/* Contadores */}
            {!loading && !error && rows.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        // `filtro` hace la tarjeta clicable: aplica ese filtro en la tabla.
                        { label: 'Expedientes', value: stats.total, color: 'text-white', filtro: limpiar },
                        { label: 'Esperan por ti', value: stats.enCertificador, color: 'text-amber-400', filtro: () => { limpiar(); setResponsable('CERTIFICADOR'); } },
                        { label: 'CEE inicial registrado', value: `${stats.iniRegistrados}/${stats.total}`, color: 'text-emerald-400', filtro: () => { limpiar(); setFaseIni('REGISTRADO'); } },
                        { label: 'CEE final registrado', value: `${stats.finRegistrados}/${stats.total}`, color: 'text-emerald-400', filtro: () => { limpiar(); setFaseFin('REGISTRADO'); } },
                        { label: hayFiltro ? 'Facturables (filtro)' : 'Facturables', value: facturables, color: 'text-brand' },
                    ].map(s => (
                        <button
                            key={s.label}
                            type="button"
                            onClick={s.filtro}
                            disabled={!s.filtro}
                            title={s.filtro ? 'Filtrar la tabla por esto' : undefined}
                            className={`text-left p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-colors ${s.filtro ? 'hover:border-white/20 hover:bg-white/[0.05] cursor-pointer' : 'cursor-default'}`}
                        >
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
                            <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
                        </button>
                    ))}
                </div>
            )}

            {/* Filtros + exportación */}
            {!loading && !error && rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar expediente, cliente, dirección…"
                        className="flex-1 min-w-[220px] bg-bkg-surface border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                    />
                    <select
                        value={prioridad}
                        onChange={e => setPrioridad(e.target.value)}
                        className={`${selectCls} ${prioridad === 'URGENTE' ? 'text-red-400 border-red-500/30' : prioridad === 'ALTA' ? 'text-amber-400 border-amber-500/30' : ''}`}
                    >
                        <option value="">Prioridad: todas</option>
                        <option value="URGENTE">Urgente</option>
                        <option value="ALTA">Alta</option>
                        <option value="NORMAL">Normal</option>
                    </select>
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
                        <button onClick={limpiar} className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors">
                            ✕ Limpiar
                        </button>
                    )}
                    <button
                        onClick={exportar}
                        disabled={!visibles.length}
                        className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-30 transition-all"
                        title={hayFiltro
                            ? `Descarga los ${visibles.length} expedientes del filtro actual (todas las páginas)`
                            : 'Descarga todos los expedientes (todas las páginas)'}
                    >
                        ↓ Excel ({visibles.length}{hayFiltro ? ' filtrados' : ''})
                    </button>
                </div>
            )}

            {/* Tabla. Al "ver todos" se acota la altura para que el scroll sea de la
                tabla y no de la página entera (la cabecera se queda pegada arriba). */}
            <div className={`flex-1 min-h-0 overflow-auto custom-scrollbar ${verTodos ? 'max-h-[60vh]' : ''}`}>
                {loading && <p className="text-center text-white/30 text-xs py-10">Cargando expedientes…</p>}
                {error && <p className="text-center text-red-400 text-xs py-10">{error}</p>}
                {!loading && !error && rows.length === 0 && (
                    <p className="text-center text-white/30 text-xs py-10">No hay expedientes asignados.</p>
                )}

                {!loading && !error && visibles.length > 0 && (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-bkg-deep z-10">
                            <tr className="border-b border-white/[0.06]">
                                {['Expediente', 'Cliente', 'Estado', 'CEE inicial', 'Registrado', 'CEE final', 'Registrado', 'Siguiente paso'].map((h, i) => (
                                    <th key={`${h}-${i}`} className="pb-2 text-[9px] font-black uppercase tracking-widest text-white/25 whitespace-nowrap pr-4">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {enPantalla.map(r => {
                                const fase = faseActivaDe(r);
                                const responsableFila = RESPONSABLE[fase];
                                const fIni = fmtFecha(r.fecha_registro_cee_inicial);
                                const fFin = fmtFecha(r.fecha_registro_cee_final);
                                // Solo tiene sentido avisar de la espera si la pelota es del certificador.
                                const dias = responsableFila === 'CERTIFICADOR' ? diasDesde(r.created_at) : null;
                                const borde = bordePrioridad(r.prioridad);
                                return (
                                    <tr
                                        key={r.id}
                                        onClick={onOpenExpediente ? () => onOpenExpediente(r.id) : undefined}
                                        className={`border-b border-white/[0.03] transition-colors align-top ${borde || (onOpenExpediente ? 'hover:bg-white/[0.04]' : 'hover:bg-white/[0.02]')} ${onOpenExpediente ? 'cursor-pointer' : ''}`}
                                    >
                                        <td className="py-2.5 pr-4 pl-2">
                                            <span className="text-[11px] font-bold text-white whitespace-nowrap">{r.numero_expediente}</span>
                                            <BadgePrioridad prioridad={r.prioridad} />
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
                                            {fIni ? <span className="text-[10px] text-white/50 whitespace-nowrap">{fIni}</span> : <span className="text-[10px] text-white/15">—</span>}
                                        </td>
                                        <td className="py-2.5 pr-4"><Badge fase={r.cee_final} /></td>
                                        <td className="py-2.5 pr-4">
                                            {fFin ? <span className="text-[10px] text-white/50 whitespace-nowrap">{fFin}</span> : <span className="text-[10px] text-white/15">—</span>}
                                        </td>
                                        <td className="py-2.5 pr-4 max-w-[220px]">
                                            {responsableFila ? (
                                                <>
                                                    <span className={`block text-[10px] font-black uppercase tracking-wider ${responsableFila === 'CERTIFICADOR' ? 'text-amber-400' : 'text-white/30'}`}>
                                                        {responsableFila}
                                                    </span>
                                                    <span className="block text-[9px] text-white/30 leading-snug">{SIGUIENTE_PASO[fase]}</span>
                                                    {dias > 30 && <span className="block text-[9px] text-red-400/70">Lleva {dias} días abierto</span>}
                                                </>
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Completo</span>
                                            )}
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

            {/* Paginación. Solo aparece si hay más filas de las que caben en una página. */}
            {!loading && !error && visibles.length > FILAS_POR_PAGINA && (
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/25">
                        {verTodos
                            ? `Mostrando los ${visibles.length}`
                            : `Mostrando ${enPantalla.length} de ${visibles.length}`}
                    </p>

                    <div className="flex items-center gap-2">
                        {!verTodos && (
                            <>
                                <button
                                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                                    disabled={paginaActual === 1}
                                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                >‹ Anterior</button>

                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                    Página {paginaActual} de {paginas}
                                </span>

                                <button
                                    onClick={() => setPagina(p => Math.min(paginas, p + 1))}
                                    disabled={paginaActual === paginas}
                                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                                >Siguiente ›</button>
                            </>
                        )}

                        <button
                            onClick={() => { setVerTodos(v => !v); setPagina(1); }}
                            className="px-2.5 py-1.5 rounded-lg border border-brand/20 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 transition-colors"
                        >
                            {verTodos ? 'Paginar' : `Ver todos (${visibles.length})`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function CertificadorResumenModal({ isOpen, onClose, prescriptorId, certificadorNombre }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-6xl max-h-[88vh] flex flex-col shadow-2xl">
                <div className="relative flex items-start justify-between gap-4 p-6 border-b border-white/[0.06]">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Seguimiento de certificados</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">{certificadorNombre || 'Certificador'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0" title="Cerrar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <CertificadorResumenPanel
                    prescriptorId={prescriptorId}
                    certificadorNombre={certificadorNombre}
                />

            </div>
        </div>
    );
}

export default CertificadorResumenModal;
