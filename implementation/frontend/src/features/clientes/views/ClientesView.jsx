import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { ClienteFormModal } from '../components/ClienteFormModal';
import { ClienteDetailModal } from '../components/ClienteDetailModal';
import { ExpedienteAccesos } from '../../expedientes/components/ExpedienteAccesos';
import { fichaColor } from '../../expedientes/logic/expedienteTaxonomia';
import {
    TIPOS_CLIENTE, ESTADOS_CLIENTE, ORDEN_ESTADOS_CLIENTE,
    etiquetasCliente, estadoCliente, detalleEstado, puntoCliente,
} from '../logic/clientesEtiquetas';

// El CEE directo es el otro negocio: color propio, que no se confunda con
// ninguna ficha (TER100 ya es cian).
const CEE_COLOR = 'bg-violet-500/10 text-violet-400 border-violet-500/20';
const colorTipo = (t) => (t === 'CEE' ? CEE_COLOR : fichaColor(t).badge);

function TipoChip({ etiqueta }) {
    const { tipo, propuesta, abiertos } = etiqueta;
    const title = propuesta
        ? `${tipo}: solo presupuestado (oportunidad sin expediente)`
        : abiertos > 0 ? `${tipo}: ${abiertos} en curso` : `${tipo}: cerrado`;
    return (
        <span title={title}
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${colorTipo(tipo)} ${propuesta ? 'border-dashed opacity-70' : ''}`}>
            {tipo}
        </span>
    );
}

function FiltroChip({ activo, onClick, children, className = '' }) {
    return (
        <button type="button" onClick={onClick}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                activo ? `${className || 'bg-brand/15 text-brand border-brand/40'} ring-1 ring-white/20`
                       : 'bg-white/[0.02] text-white/40 border-white/[0.06] hover:text-white/70 hover:border-white/20'}`}>
            {children}
        </button>
    );
}

function Badge({ children, color = 'default' }) {
    const colors = {
        default: 'bg-white/5 text-white/50 border-white/10',
        brand: 'bg-brand/10 text-brand border-brand/20',
        green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        violet: CEE_COLOR,
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border ${colors[color]}`}>
            {children}
        </span>
    );
}

const CLAVE_FILTROS = 'brokergy.clientes.filtros';
const SIN_PARTNER = '__directo__';
const partnerDe = (c) => c.prescriptor_id
    ? { id: c.prescriptor_id, label: c.prescriptores?.acronimo || c.prescriptores?.razon_social || 'Partner' }
    : { id: SIN_PARTNER, label: 'Directo (sin partner)' };

// Exporta a CSV EXACTAMENTE lo que se está viendo (filtros y búsqueda incluidos):
// un botón que exporta "todo" mientras la pantalla enseña otra cosa es la forma
// más fácil de mandar el fichero equivocado. `;` y BOM, o Excel en español abre
// una sola columna y se come los acentos.
function exportarCsv(filas) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Nombre', 'Apellidos', 'DNI/CIF', 'Email', 'Teléfono', 'Municipio', 'Provincia',
        'Partner', 'Estado', 'Estado del expediente', 'Tipos', 'Expedientes', 'CEE directos', 'Oportunidades sin expediente', 'Alta'];
    const lineas = [cab.map(esc).join(';')];
    for (const c of filas) {
        const conExp = new Set((c.expedientes || []).map(e => e.oportunidad_id).filter(Boolean));
        lineas.push([
            c.nombre_razon_social, c.apellidos, c.dni, c.email, c.tlf, c.municipio, c.provincia,
            c.prescriptor_id ? partnerDe(c).label : '',
            ESTADOS_CLIENTE[c._estado]?.label || '',
            c._punto ? `${c._punto.numero} · ${c._punto.estado || '—'}` : '',
            c._tipos.map(t => t.propuesta ? `${t.tipo} (propuesta)` : t.tipo).join(', '),
            (c.expedientes || []).map(e => `${e.numero_expediente} (${e.estado || '—'})`).join(', '),
            (c.cee_directos || []).map(x => `${x.numero_expediente} (${x.estado || '—'})`).join(', '),
            (c.oportunidades || []).filter(o => !conExp.has(o.id)).map(o => `${o.id_oportunidad} (${o.estado || '—'})`).join(', '),
            c.created_at ? new Date(c.created_at).toLocaleDateString('es-ES') : '',
        ].map(esc).join(';'));
    }
    const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export function ClientesView({ 
    onNavigate,
    onLoadOpportunity, 
    initialSelectedId, 
    onClearInitialSelection,
    returnToExpediente,
    onReturnToExpediente
}) {
    const { user } = useAuth();
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [clienteToDelete, setClienteToDelete] = useState(null);
    const [clienteDetail, setClienteDetail] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    // Fallo al abrir la carpeta (Drive o local) de un expediente desde la fila.
    const [accesoError, setAccesoError] = useState(null);
    // Filtros de tipo (ficha / CEE) y de estado del cliente. null = todos.
    // Se RECUERDAN en este navegador (un filtro que se pierde al cambiar de
    // pestaña hay que volver a ponerlo cada vez). Es una comodidad de pantalla:
    // si el almacenamiento falla, se arranca sin filtros y ya está.
    const filtrosGuardados = useMemo(() => {
        try { return JSON.parse(localStorage.getItem(CLAVE_FILTROS) || '{}') || {}; } catch { return {}; }
    }, []);
    const [filtroTipo, setFiltroTipo] = useState(filtrosGuardados.tipo || null);
    const [filtroEstado, setFiltroEstado] = useState(filtrosGuardados.estado || null);
    const [filtroPartner, setFiltroPartner] = useState(filtrosGuardados.partner || null);
    useEffect(() => {
        try {
            localStorage.setItem(CLAVE_FILTROS, JSON.stringify({ tipo: filtroTipo, estado: filtroEstado, partner: filtroPartner }));
        } catch { /* navegador sin almacenamiento */ }
    }, [filtroTipo, filtroEstado, filtroPartner]);
    const hayFiltro = !!(filtroTipo || filtroEstado || filtroPartner);
    const limpiarFiltros = () => { setFiltroTipo(null); setFiltroEstado(null); setFiltroPartner(null); setCurrentPage(1); };
    const itemsPerPage = 15;

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/clientes');
            setClientes(res.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching clientes:', err);
            setError('Error al cargar los clientes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientes();
    }, []);

    // Efecto para abrir el detalle automáticamente si viene una selección inicial
    useEffect(() => {
        if (initialSelectedId && clientes.length > 0) {
            const found = clientes.find(c => c.id_cliente === initialSelectedId);
            if (found) {
                setClienteDetail(found);
                onClearInitialSelection?.();
            }
        }
    }, [initialSelectedId, clientes, onClearInitialSelection]);

    const handleDelete = async () => {
        if (!clienteToDelete) return;
        setDeleting(true);
        try {
            await axios.delete(`/api/clientes/${clienteToDelete.id_cliente}`);
            setClientes(prev => prev.filter(c => c.id_cliente !== clienteToDelete.id_cliente));
            setClienteToDelete(null);
        } catch (err) {
            console.error('Error eliminando cliente:', err);
            setError('Error al eliminar el cliente.');
        } finally {
            setDeleting(false);
        }
    };

    // Filtrado — insensible a tildes y por PALABRAS sueltas: "carmen d" encuentra
    // a "MARÍA DEL CARMEN …" aunque el texto exacto no aparezca seguido, y da igual
    // en qué campo esté cada palabra (nombre, apellidos, municipio…).
    const norm = s => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const tokens = norm(searchTerm).split(/\s+/).filter(Boolean);
    // Etiquetas y estado se calculan UNA vez por cliente y se usan para las dos
    // cosas: pintar la fila y filtrar. Así el filtro no puede traer una fila que
    // en pantalla diga otra cosa.
    const enriquecidos = useMemo(() => clientes.map(c => ({
        ...c,
        _tipos: etiquetasCliente(c),
        _estado: estadoCliente(c),
        _punto: puntoCliente(c),
    })), [clientes]);

    // ¿Pasa el cliente los filtros, salvo el de la dimensión que se está
    // contando? Así cada recuento dice cuántos saldrían al pulsar ESE chip con
    // los otros dos filtros tal y como están.
    const pasa = (c, salvo) =>
        (salvo === 'tipo' || !filtroTipo || c._tipos.some(t => t.tipo === filtroTipo))
        && (salvo === 'estado' || !filtroEstado || c._estado === filtroEstado)
        && (salvo === 'partner' || !filtroPartner || partnerDe(c).id === filtroPartner);

    const cuentaTipos = {}, cuentaEstados = {}, cuentaPartners = {};
    const partners = new Map(); // id -> etiqueta
    for (const c of enriquecidos) {
        if (pasa(c, 'tipo')) for (const t of c._tipos) cuentaTipos[t.tipo] = (cuentaTipos[t.tipo] || 0) + 1;
        if (pasa(c, 'estado')) cuentaEstados[c._estado] = (cuentaEstados[c._estado] || 0) + 1;
        const pa = partnerDe(c);
        partners.set(pa.id, pa.label);
        if (pasa(c, 'partner')) cuentaPartners[pa.id] = (cuentaPartners[pa.id] || 0) + 1;
    }
    // Directo (sin partner) al final; los demás por orden alfabético.
    const opcionesPartner = [...partners.entries()]
        .sort(([a, la], [b, lb]) => (a === SIN_PARTNER) - (b === SIN_PARTNER) || la.localeCompare(lb, 'es'));

    const filtered = enriquecidos.filter(c => {
        if (!pasa(c, null)) return false;
        if (!tokens.length) return true;
        const hay = norm([
            c.nombre_razon_social, c.apellidos, c.email, c.dni, c.tlf,
            c.municipio, c.provincia, c.prescriptores?.acronimo,
            // Buscar también por nº de expediente, de CEE o de oportunidad.
            ...(c.expedientes || []).map(e => e.numero_expediente),
            ...(c.cee_directos || []).map(x => x.numero_expediente),
            ...(c.oportunidades || []).map(o => o.id_oportunidad),
        ].filter(Boolean).join(' '));
        // Los teléfonos se guardan con o sin espacios ("677 052 554"): para un
        // token puramente numérico se compara también contra el texto sin separadores.
        const hayPlano = hay.replace(/[\s.\-/]/g, '');
        return tokens.every(t => hay.includes(t) || (/^[\d+]+$/.test(t) && hayPlano.includes(t)));
    });

    // Paginación
    const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ── */}
            <div className="px-6 sm:px-10 pt-8 pb-5 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 relative">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-brand/[0.03] rounded-full blur-[100px] pointer-events-none"></div>
                <div className="max-sm:self-start">
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/40">Clientes</h1>
                    <p className="text-[10px] text-brand uppercase tracking-[0.3em] mt-1 font-black">
                        {clientes.length} registro{clientes.length !== 1 ? 's' : ''} registrados
                    </p>
                </div>

                {/* ── Buscador (centrado en la cabecera para que el listado suba) ── */}
                <div className="flex-1 flex justify-center w-full sm:w-auto max-sm:order-last">
                    <div className="relative w-full max-w-xl group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <div className="relative flex items-center">
                            <svg className="absolute left-4 w-4 h-4 text-white/20 group-focus-within:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, email, DNI..."
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                className="w-full bg-bkg-surface border border-white/[0.06] rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/5 transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {returnToExpediente && (
                        <button
                            onClick={onReturnToExpediente}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-amber-500/20 transition-all group"
                        >
                            <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 8.959 8.959 0 01-9 9" />
                            </svg>
                            Volver al Expediente
                        </button>
                    )}
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-xl shadow-brand/10 hover:shadow-brand/30 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Nuevo Cliente
                    </button>
                </div>
            </div>

            {/* ── Filtros por estado y por tipo ── */}
            {!loading && clientes.length > 0 && (
                <div className="px-6 sm:px-10 pb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em] mr-1">Estado</span>
                        <FiltroChip activo={!filtroEstado} onClick={() => { setFiltroEstado(null); setCurrentPage(1); }}>Todos</FiltroChip>
                        {ORDEN_ESTADOS_CLIENTE.filter(e => cuentaEstados[e] || filtroEstado === e).map(e => (
                            <FiltroChip key={e} activo={filtroEstado === e} className={ESTADOS_CLIENTE[e].pill}
                                onClick={() => { setFiltroEstado(filtroEstado === e ? null : e); setCurrentPage(1); }}>
                                {ESTADOS_CLIENTE[e].label} <span className="opacity-60">{cuentaEstados[e] || 0}</span>
                            </FiltroChip>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em] mr-1">Tipo</span>
                        <FiltroChip activo={!filtroTipo} onClick={() => { setFiltroTipo(null); setCurrentPage(1); }}>Todos</FiltroChip>
                        {TIPOS_CLIENTE.filter(t => cuentaTipos[t] || filtroTipo === t).map(t => (
                            <FiltroChip key={t} activo={filtroTipo === t} className={colorTipo(t)}
                                onClick={() => { setFiltroTipo(filtroTipo === t ? null : t); setCurrentPage(1); }}>
                                {t} <span className="opacity-60">{cuentaTipos[t] || 0}</span>
                            </FiltroChip>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em] mr-1">Partner</span>
                        <select
                            value={filtroPartner || ''}
                            onChange={e => { setFiltroPartner(e.target.value || null); setCurrentPage(1); }}
                            className={`bg-bkg-surface border rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest focus:outline-none ${
                                filtroPartner ? 'border-brand/40 text-brand' : 'border-white/[0.06] text-white/50'}`}>
                            <option value="">Todos</option>
                            {opcionesPartner.map(([id, label]) => (
                                <option key={id} value={id}>{label} · {cuentaPartners[id] || 0}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-3 ml-auto">
                        {hayFiltro && (
                            <>
                                <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">
                                    {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
                                </span>
                                <button type="button" onClick={limpiarFiltros}
                                    className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/80">
                                    ✕ Quitar filtros
                                </button>
                            </>
                        )}
                        <button type="button" onClick={() => exportarCsv(filtered)} disabled={!filtered.length}
                            title="Descarga en CSV los clientes que se están viendo (con los filtros y la búsqueda aplicados)"
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/[0.08] text-white/50 hover:text-white hover:border-white/25 transition-all disabled:opacity-30">
                            ⬇ Exportar {filtered.length}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Contenido ── */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pt-1 pb-6">
                {loading && (
                    <div className="flex items-center justify-center py-20 text-white/30">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm uppercase tracking-widest font-bold">Cargando...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm mb-4">
                        {error}
                    </div>
                )}

                {accesoError && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs mb-4 flex items-center justify-between gap-3">
                        <span>{accesoError}</span>
                        <button onClick={() => setAccesoError(null)} className="text-amber-400/60 hover:text-amber-300 font-black">✕</button>
                    </div>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <p className="text-white/30 text-xs uppercase tracking-widest font-bold">
                            {searchTerm || hayFiltro ? 'Sin resultados para tu búsqueda' : 'No hay clientes registrados'}
                        </p>
                        {!searchTerm && !hayFiltro && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="mt-4 px-4 py-2 bg-brand/10 border border-brand/20 text-brand text-xs font-black uppercase tracking-widest rounded-lg hover:bg-brand/20 transition-all"
                            >
                                Crear primer cliente
                            </button>
                        )}
                    </div>
                )}

                {!loading && paginated.length > 0 && (
                    <div className="space-y-2">
                        {paginated.map(cliente => (
                            <div
                                key={cliente.id_cliente}
                                onClick={() => setClienteDetail(cliente)}
                                className="bg-bkg-surface border border-white/[0.04] rounded-[1.25rem] p-5 hover:border-brand/40 hover:bg-bkg-elevated transition-all group cursor-pointer relative overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-brand/0 via-brand/20 to-brand/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    {/* Avatar inicial */}
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand/20 to-brand/5 border border-brand/20 flex items-center justify-center flex-shrink-0">
                                        <span className="text-brand font-black text-sm">
                                            {(cliente.nombre_razon_social || '?').charAt(0).toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Info principal */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-white font-black text-sm truncate">
                                                {cliente.nombre_razon_social}
                                                {cliente.apellidos && ` ${cliente.apellidos}`}
                                            </span>
                                            {cliente.dni && <Badge>{cliente.dni}</Badge>}
                                            {cliente.prescriptores?.acronimo && (
                                                <Badge color="brand">{cliente.prescriptores.acronimo}</Badge>
                                            )}
                                            {cliente._tipos.map(t => <TipoChip key={t.tipo} etiqueta={t} />)}
                                            {cliente.oportunidades?.length > 0 ? (
                                                <Badge color="green">
                                                    {cliente.oportunidades[0].id_oportunidad} · {cliente.oportunidades[0].referencia_cliente}
                                                </Badge>
                                            ) : cliente.cee_directos?.length > 0 ? (
                                                <Badge color="violet">
                                                    {cliente.cee_directos[0].numero_expediente} · {cliente.cee_directos[0].nombre}
                                                </Badge>
                                            ) : (
                                                <Badge>SIN ASIGNAR</Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-white/30">
                                            {cliente.email && <span>{cliente.email}</span>}
                                            {cliente.tlf && <span>{cliente.tlf}</span>}
                                            {(cliente.municipio || cliente.provincia) && (
                                                <span>{[cliente.municipio, cliente.provincia].filter(Boolean).join(', ')}</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Accesos directos al expediente (app · Drive · carpeta local).
                                        Solo ADMIN y solo si el cliente tiene expediente: son internos y
                                        los enlaces de Drive no se le sirven a un partner (regla 1).
                                        Se apunta al MÁS RECIENTE, que es el que se está trabajando. */}
                                    {isAdmin && cliente.expedientes?.length > 0 && (
                                        <ExpedienteAccesos
                                            expedienteId={cliente.expedientes[0].id}
                                            numero={cliente.expedientes[0].numero_expediente}
                                            onAbrirApp={() => onNavigate('expedientes', { expediente_id: cliente.expedientes[0].id })}
                                            onError={setAccesoError}
                                            className="flex-shrink-0"
                                        />
                                    )}
                                    {/* Los mismos tres accesos para su CEE directo más reciente,
                                        contra SUS rutas (/api/cee-directos): son otra tabla y el
                                        mismo UUID no vale en las dos. Con los dos negocios a la
                                        vez van los dos grupos, separados y rotulados. */}
                                    {isAdmin && cliente.cee_directos?.length > 0 && (
                                        <div className={`flex items-center gap-1.5 flex-shrink-0 ${cliente.expedientes?.length ? 'sm:pl-2 sm:border-l sm:border-white/[0.06]' : ''}`}>
                                            <span className="text-[8px] font-black uppercase tracking-widest text-violet-400/70">CEE</span>
                                            <ExpedienteAccesos
                                                apiBase="/api/cee-directos"
                                                expedienteId={cliente.cee_directos[0].id}
                                                numero={cliente.cee_directos[0].numero_expediente}
                                                onAbrirApp={() => onNavigate('cee-directos', { cee_id: cliente.cee_directos[0].id })}
                                                onError={setAccesoError}
                                            />
                                        </div>
                                    )}

                                    {/* Estado del cliente, con el detalle de cada cosa al pasar el ratón. */}
                                    {cliente._estado !== 'SIN_ASIGNAR' && (
                                        <span title={detalleEstado(cliente)}
                                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border flex-shrink-0 ${ESTADOS_CLIENTE[cliente._estado].pill}`}>
                                            {ESTADOS_CLIENTE[cliente._estado].label}
                                            {/* En qué punto está lo que se le tramita: el estado del
                                                expediente (o de la oportunidad, si es una propuesta). */}
                                            {cliente._punto?.estado && (
                                                <span className="ml-1.5 pl-1.5 border-l border-white/20 opacity-80 normal-case tracking-normal font-bold">
                                                    {cliente._punto.estado}
                                                    {cliente._punto.otros > 0 && <span className="opacity-70"> +{cliente._punto.otros}</span>}
                                                </span>
                                            )}
                                        </span>
                                    )}

                                    {/* Fecha */}
                                    <div className="text-[10px] text-white/20 font-bold uppercase tracking-widest flex-shrink-0">
                                        {new Date(cliente.created_at).toLocaleDateString('es-ES')}
                                    </div>

                                    {/* Acciones */}
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setClienteToDelete(cliente); }}
                                            className="max-sm:opacity-100 opacity-0 group-hover:opacity-100 max-sm:self-end p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                                            title="Eliminar cliente"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            ← Anterior
                        </button>
                        <span className="text-xs text-white/30 font-bold uppercase tracking-widest px-3">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/20 text-xs font-bold transition-all disabled:opacity-30"
                        >
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>

            {/* Modal ver/editar cliente */}
            <ClienteDetailModal
                isOpen={!!clienteDetail}
                onClose={() => setClienteDetail(null)}
                cliente={clienteDetail}
                onOpenOportunidad={onLoadOpportunity}
                onOpenExpediente={(exp) => onNavigate('expedientes', { expediente_id: exp.id })}
                onUpdated={(updated) => {
                    setClientes(prev => prev.map(c => c.id_cliente === updated.id_cliente ? { ...c, ...updated } : c));
                    setClienteDetail(null);
                }}
            />

            {/* Modal crear cliente */}
            <ClienteFormModal
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                onSuccess={() => {
                    setShowForm(false);
                    fetchClientes();
                }}
            />

            {/* Modal confirmar eliminación */}
            {clienteToDelete && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl max-w-sm w-full p-6 shadow-2xl">
                        <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-white font-black text-center uppercase tracking-widest mb-2">Eliminar Cliente</h3>
                        <p className="text-white/40 text-sm text-center mb-6">
                            ¿Estás seguro de que quieres eliminar a{' '}
                            <strong className="text-white">{clienteToDelete.nombre_razon_social}</strong>?
                            Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setClienteToDelete(null)}
                                className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white font-bold text-sm transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                                {deleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
