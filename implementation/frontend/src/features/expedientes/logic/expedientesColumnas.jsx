// ============================================================================
// expedientesColumnas.jsx — QUÉ COLUMNAS tiene el listado de expedientes
// ============================================================================
// REGLA — las columnas son una LISTA DECLARATIVA, no N bloques de JSX copiados.
// Antes la cabecera, la fila de filtros y las celdas eran tres sitios distintos
// alineados A MANO por posición: para añadir una columna había que tocar los
// tres y acertar con el orden, y el `hidden lg:table-cell` de una celda tenía
// que coincidir con el de su cabecera o la tabla se descuadraba entera. Aquí
// cada columna se declara UNA vez —rótulo, ancho, filtro, valor y pintado— y de
// ahí salen la cabecera, los filtros, las celdas, el orden y el CSV.
//
// REGLA — `valor()` es lo que la columna DICE, y `render()` cómo lo enseña. El
// orden y la exportación usan `valor`, así que una columna que solo defina el
// pintado se podrá ver pero no ordenar ni exportar: las dos cosas van juntas.
//
// REGLA — quién puede ver una columna se declara en `roles`, y el backend lo
// repite. La lista es una comodidad de pantalla, nunca el control de acceso.
// ============================================================================

import React from 'react';
import { getCCAA, getCifoYear, fichaColor, FICHAS } from './expedienteTaxonomia';
import { SUBESTADO_LABELS, daysSince, fmtDate } from './seguimientoTime';

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Las ocho fases del CEE, en el orden del ciclo de vida (ver CLAUDE.md).
export const FASES_CEE = [
    'PTE_ENVIO_CERT', 'ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION',
    'PRESENTADO', 'PTE_REVISION', 'REVISADO', 'REGISTRADO',
];

// ─── Quién EJECUTA la obra ───────────────────────────────────────────────────
// REGLA — UNA cascada, y la del listado coincide con la de la ficha. El primer
// escalón es el campo que se edita en Instalación (`instalacion.instalador_id`),
// que es lo que se ve al abrir el expediente; si la columna dijera otra cosa
// que la ficha sería peor que no tener columna. Los otros dos existen porque
// con el primero solo, 98 de 267 expedientes saldrían vacíos TENIENDO
// instalador: hay 80 que solo lo declaran en la columna del expediente (los
// migrados) y otros tantos que lo heredan de su oportunidad.
//
// Lo heredado se MARCA (`heredado`) y la celda lo atenúa: es el instalador que
// consta, pero la ficha de Instalación no lo declara — y eso es justo lo que
// hay que corregir ahí.
export function instaladorDe(exp) {
    const propio = exp?.instalacion?.instalador_id;
    if (propio) return { id: String(propio), heredado: false };
    const op = exp?.oportunidades || {};
    const heredado = exp?.instalador_asociado_id || op.instalador_asociado_id || op.prescriptor_id;
    return heredado ? { id: String(heredado), heredado: true } : { id: null, heredado: false };
}

export const nombrePrescriptor = (p) =>
    p ? (p.acronimo || p.razon_social || '—') : null;

// ─── Controles compartidos de la fila de filtros ─────────────────────────────
// Estaban escritos ocho veces con las mismas clases y una coma de diferencia.
const Sel = ({ value, onChange, activo, children, title }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value)}
        title={title}
        className={`bg-transparent text-[10px] font-black uppercase tracking-wider focus:outline-none transition-colors cursor-pointer w-full p-0 appearance-none ${
            activo ? 'text-brand' : 'text-white/40 hover:text-brand'
        }`}
    >
        {children}
    </select>
);
const Opt = ({ value, children }) => (
    <option value={value} className="bg-bkg-deep text-white">{children}</option>
);

const Vacio = () => <span className="text-white/20 text-xs">—</span>;

const fmtEur = (v) => v == null ? null : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtMwh = (kwh) => kwh == null ? null : `${(kwh / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`;

// Dirección de la actuación: en los expedientes MIGRADOS el cliente no la tiene
// y vive en los inputs de la oportunidad (mismo criterio que el buscador).
const ubicacion = (exp) => {
    const inputs = exp.oportunidades?.datos_calculo?.inputs || {};
    return {
        direccion: inputs.direccion || inputs.address || exp.clientes?.direccion || '',
        municipio: inputs.municipio || exp.clientes?.municipio || '',
        provincia: inputs.provincia_nombre || exp.clientes?.provincia || '',
    };
};

export const GRUPOS = ['Identificación', 'Ubicación', 'Estado y fases', 'Gente', 'Economía', 'Fechas'];

// ============================================================================
// EL REGISTRO
// ============================================================================
// fija      → no se puede quitar (sin nº de expediente la fila no se identifica)
// roles     → quién puede encenderla; ausente = todos los que ven el listado
// valor     → texto/número para ORDENAR y EXPORTAR (null = celda vacía)
// render    → JSX de la celda; por defecto, el `valor` en texto plano
// filtro    → JSX de la fila de filtros (null = esa columna no filtra)
// match     → si devuelve false, la fila se descarta
// ============================================================================
export const COLUMNAS = [
    {
        key: 'expediente',
        label: 'Número Expediente',
        grupo: 'Identificación',
        fija: true,
        ancho: 360,
        pad: 'px-5',
        valor: (exp) => exp.numero_expediente || exp.id_oportunidad_ref || exp.oportunidades?.id_oportunidad || '',
        render: (exp) => {
            const { direccion, municipio } = ubicacion(exp);
            const texto = [direccion, municipio].filter(Boolean).join(', ');
            return (
                <div className="flex flex-col">
                    {exp.prioridad && exp.prioridad !== 'NORMAL' && (
                        <span className={`self-start inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border mb-1 ${
                            exp.prioridad === 'URGENTE' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                            {exp.prioridad === 'URGENTE' ? '⚠ ' : '● '}{exp.prioridad}
                        </span>
                    )}
                    <span className="font-mono text-brand text-xs font-bold">
                        {exp.numero_expediente || exp.id_oportunidad_ref || exp.oportunidades?.id_oportunidad || '—'}
                        {exp.clientes && ` - ${exp.clientes.nombre_razon_social} ${exp.clientes.apellidos || ''}`.toUpperCase()}
                    </span>
                    {exp.oportunidades?.referencia_cliente && (
                        <div className="text-white/40 text-[10px] mt-0.5 truncate max-w-[220px] font-medium uppercase tracking-wider">
                            {exp.oportunidades.referencia_cliente}
                        </div>
                    )}
                    {texto && (
                        <div className="text-white/25 text-[10px] mt-0.5 truncate max-w-[260px] font-medium uppercase tracking-wider">{texto}</div>
                    )}
                </div>
            );
        },
        // La PRIORIDAD se filtra desde aquí porque se pinta aquí (la chapa va sobre
        // el nº de expediente). No es una columna propia: sería una casilla más
        // para un dato que ya está a la vista.
        filtro: (ctx) => (
            <Sel value={ctx.filtros.prioridad} onChange={v => ctx.setFiltro('prioridad', v)} activo={ctx.filtros.prioridad !== 'ALL'}>
                <Opt value="ALL">PRIORIDAD</Opt>
                <Opt value="URGENTE">URGENTE</Opt>
                <Opt value="ALTA">ALTA</Opt>
                <Opt value="NORMAL">NORMAL</Opt>
            </Sel>
        ),
        match: (exp, ctx) => ctx.filtros.prioridad === 'ALL' || (exp.prioridad || 'NORMAL') === ctx.filtros.prioridad,
        filtroActivo: (ctx) => ctx.filtros.prioridad !== 'ALL' && { label: 'Prioridad', value: ctx.filtros.prioridad },
        limpiar: (ctx) => ctx.setFiltro('prioridad', 'ALL'),
    },
    {
        key: 'cliente',
        label: 'Cliente',
        grupo: 'Identificación',
        ancho: 180,
        valor: (exp) => exp.clientes ? `${exp.clientes.nombre_razon_social || ''} ${exp.clientes.apellidos || ''}`.trim() : '',
        render: (exp) => {
            const n = exp.clientes ? `${exp.clientes.nombre_razon_social || ''} ${exp.clientes.apellidos || ''}`.trim() : '';
            if (!n) return <Vacio />;
            return (
                <div className="flex flex-col leading-tight">
                    <span className="text-white/70 text-[11px] font-bold uppercase tracking-wide truncate">{n}</span>
                    {exp.clientes?.dni && <span className="text-white/25 text-[9px] font-mono">{exp.clientes.dni}</span>}
                </div>
            );
        },
    },
    {
        key: 'telefono',
        label: 'Teléfono',
        grupo: 'Identificación',
        ancho: 120,
        valor: (exp) => exp.clientes?.tlf || '',
        render: (exp) => exp.clientes?.tlf
            ? <a href={`tel:${exp.clientes.tlf}`} onClick={e => e.stopPropagation()} className="text-white/60 hover:text-brand text-[11px] font-mono">{exp.clientes.tlf}</a>
            : <Vacio />,
    },
    {
        key: 'ref_catastral',
        label: 'Ref. catastral',
        grupo: 'Identificación',
        ancho: 180,
        valor: (exp) => exp.instalacion?.ref_catastral || exp.oportunidades?.ref_catastral || '',
        render: (exp) => {
            const rc = exp.instalacion?.ref_catastral || exp.oportunidades?.ref_catastral;
            return rc ? <span className="text-white/50 text-[10px] font-mono break-all">{rc}</span> : <Vacio />;
        },
    },
    {
        key: 'ccaa',
        label: 'Comunidad Autónoma',
        grupo: 'Ubicación',
        ancho: 140,
        pad: 'px-5',
        valor: (exp) => getCCAA(exp),
        render: (exp) => <span className="text-white/50 text-xs font-medium uppercase tracking-wider">{getCCAA(exp)}</span>,
        filtro: (ctx) => (
            <Sel value={ctx.filtros.ccaa} onChange={v => ctx.setFiltro('ccaa', v)} activo={ctx.filtros.ccaa !== 'ALL'}>
                <Opt value="ALL">TODAS LAS CCAA</Opt>
                {ctx.listas.ccaa.map(c => <Opt key={c} value={c}>{c}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => ctx.filtros.ccaa === 'ALL' || getCCAA(exp) === ctx.filtros.ccaa,
        filtroActivo: (ctx) => ctx.filtros.ccaa !== 'ALL' && { label: 'CCAA', value: ctx.filtros.ccaa },
        limpiar: (ctx) => ctx.setFiltro('ccaa', 'ALL'),
    },
    {
        key: 'municipio',
        label: 'Municipio',
        grupo: 'Ubicación',
        ancho: 150,
        valor: (exp) => ubicacion(exp).municipio,
        render: (exp) => {
            const { municipio } = ubicacion(exp);
            return municipio
                ? <span className="text-white/50 text-[11px] uppercase tracking-wide truncate">{municipio}</span>
                : <Vacio />;
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros.municipio} onChange={v => ctx.setFiltro('municipio', v)} activo={ctx.filtros.municipio !== 'ALL'}>
                <Opt value="ALL">TODOS</Opt>
                {ctx.listas.municipios.map(m => <Opt key={m} value={m}>{m}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => ctx.filtros.municipio === 'ALL' || norm(ubicacion(exp).municipio) === norm(ctx.filtros.municipio),
        filtroActivo: (ctx) => ctx.filtros.municipio !== 'ALL' && { label: 'Municipio', value: ctx.filtros.municipio },
        limpiar: (ctx) => ctx.setFiltro('municipio', 'ALL'),
    },
    {
        key: 'provincia',
        label: 'Provincia',
        grupo: 'Ubicación',
        ancho: 130,
        valor: (exp) => ubicacion(exp).provincia,
        render: (exp) => {
            const { provincia } = ubicacion(exp);
            return provincia
                ? <span className="text-white/50 text-[11px] uppercase tracking-wide truncate">{provincia}</span>
                : <Vacio />;
        },
    },
    {
        key: 'estado',
        label: 'Estado',
        grupo: 'Estado y fases',
        ancho: 156,
        valor: (exp) => exp.estado || 'PTE. CEE INICIAL',
        render: (exp, ctx) => (
            <select
                value={exp.estado || 'PTE. CEE INICIAL'}
                onClick={e => e.stopPropagation()}
                onChange={e => ctx.onStatusChange(exp.id, e.target.value, e)}
                className={`text-[9px] font-black uppercase tracking-wider border cursor-pointer focus:outline-none transition-colors appearance-none text-center w-full max-w-[170px] rounded-lg px-2 py-1 leading-tight ${
                    exp.estado === 'FINALIZADO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    exp.estado?.includes('REQUERIMIENTO') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    exp.estado?.startsWith('ENVIADO') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                    'bg-white/5 text-white/50 border-white/10'
                }`}
            >
                {/* Estado no listado: lo pintamos igual, para que el <select> no caiga
                    a su primera opción y muestre 'PTE. CEE INICIAL' en un avanzado. */}
                {exp.estado && !ctx.estados.includes(exp.estado) && <Opt value={exp.estado}>{exp.estado}</Opt>}
                {ctx.estados.map(st => <Opt key={st} value={st}>{st}</Opt>)}
            </select>
        ),
        filtro: (ctx) => (
            <div className="relative group">
                <select
                    // Con multi-selección, el desplegable actúa como atajo a UN estado
                    // (o a ninguno). Para sumar varios se usan los chips de arriba.
                    value={ctx.statusSel.size === 1 ? [...ctx.statusSel][0] : 'ALL'}
                    onChange={e => ctx.setStatusSel(e.target.value === 'ALL' ? new Set() : new Set([e.target.value]))}
                    className="bg-transparent text-[10px] font-black text-brand uppercase tracking-wider focus:outline-none transition-colors cursor-pointer w-full p-0 pr-4 appearance-none"
                >
                    <Opt value="ALL">{ctx.statusSel.size > 1 ? `${ctx.statusSel.size} ESTADOS (CHIPS)` : 'TODOS LOS ESTADOS'}</Opt>
                    {ctx.estados.map(st => <Opt key={st} value={st}>{st}</Opt>)}
                </select>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                    <svg className="w-3 h-3 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
        ),
    },
    {
        key: 'ficha',
        label: 'Ficha',
        grupo: 'Estado y fases',
        ancho: 80,
        valor: (exp, ctx) => ctx.fin(exp).ficha,
        render: (exp, ctx) => {
            const f = ctx.fin(exp).ficha;
            return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${fichaColor(f).badge}`}>{f}</span>;
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros.ficha} onChange={v => ctx.setFiltro('ficha', v)} activo={FICHAS.includes(ctx.filtros.ficha)}>
                <Opt value="ALL">TODAS</Opt>
                {FICHAS.map(f => <Opt key={f} value={f}>{f}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => ctx.filtros.ficha === 'ALL' || ctx.fin(exp).ficha === ctx.filtros.ficha,
        filtroActivo: (ctx) => ctx.filtros.ficha !== 'ALL' && { label: 'Ficha', value: ctx.filtros.ficha },
        limpiar: (ctx) => ctx.setFiltro('ficha', 'ALL'),
    },
    ...['inicial', 'final'].map(fase => ({
        key: `fase_cee_${fase}`,
        label: `CEE ${fase}`,
        grupo: 'Estado y fases',
        ancho: 150,
        roles: ['ADMIN', 'TRABAJADOR', 'CERTIFICADOR'],
        valor: (exp) => SUBESTADO_LABELS[exp.seguimiento?.[`cee_${fase}`]] || '',
        render: (exp) => {
            const f = exp.seguimiento?.[`cee_${fase}`];
            if (!f) return <Vacio />;
            const dias = daysSince(exp.seguimiento?.[`cee_${fase}_desde`]);
            return (
                <div className="flex flex-col leading-tight">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${
                        f === 'REGISTRADO' ? 'text-emerald-400'
                        : f === 'PTE_REVISION' || f === 'PRESENTADO' ? 'text-amber-400'
                        : f === 'PTE_ENVIO_CERT' ? 'text-white/30'
                        : 'text-white/60'
                    }`}>
                        {SUBESTADO_LABELS[f] || f}
                    </span>
                    {/* "Desde cuándo" es lo que convierte la fase en una tarea: una
                        fase sin antigüedad no dice si está en marcha o parada. */}
                    {dias != null && f !== 'REGISTRADO' && (
                        <span className={`text-[9px] ${dias > 15 ? 'text-red-400/70' : 'text-white/25'}`}>hace {dias} d</span>
                    )}
                </div>
            );
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros[`fase_${fase}`]} onChange={v => ctx.setFiltro(`fase_${fase}`, v)} activo={ctx.filtros[`fase_${fase}`] !== 'ALL'}>
                <Opt value="ALL">TODAS LAS FASES</Opt>
                {FASES_CEE.map(f => <Opt key={f} value={f}>{SUBESTADO_LABELS[f] || f}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => {
            const v = ctx.filtros[`fase_${fase}`];
            return v === 'ALL' || (exp.seguimiento?.[`cee_${fase}`] || 'PTE_ENVIO_CERT') === v;
        },
        filtroActivo: (ctx) => ctx.filtros[`fase_${fase}`] !== 'ALL' && {
            label: `CEE ${fase}`, value: SUBESTADO_LABELS[ctx.filtros[`fase_${fase}`]] || ctx.filtros[`fase_${fase}`],
        },
        limpiar: (ctx) => ctx.setFiltro(`fase_${fase}`, 'ALL'),
    })),
    {
        key: 'incidencias',
        label: 'Incidencias',
        grupo: 'Estado y fases',
        ancho: 110,
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp) => exp.incidencias_abiertas || 0,
        render: (exp) => {
            const n = exp.incidencias_abiertas || 0;
            const g = exp.incidencias_graves_abiertas || 0;
            if (!n) return <span className="text-emerald-400/40 text-xs">✓</span>;
            return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-black ${
                    g > 0 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                    {n} abierta{n > 1 ? 's' : ''}{g > 0 ? ` · ${g} grave${g > 1 ? 's' : ''}` : ''}
                </span>
            );
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros.incidencias} onChange={v => ctx.setFiltro('incidencias', v)} activo={ctx.filtros.incidencias !== 'ALL'}>
                <Opt value="ALL">TODAS</Opt>
                <Opt value="CON">CON INCIDENCIAS</Opt>
                <Opt value="GRAVES">SOLO GRAVES</Opt>
                <Opt value="SIN">SIN INCIDENCIAS</Opt>
            </Sel>
        ),
        match: (exp, ctx) => {
            const v = ctx.filtros.incidencias;
            if (v === 'ALL') return true;
            if (v === 'CON') return (exp.incidencias_abiertas || 0) > 0;
            if (v === 'GRAVES') return (exp.incidencias_graves_abiertas || 0) > 0;
            return (exp.incidencias_abiertas || 0) === 0;
        },
        filtroActivo: (ctx) => ctx.filtros.incidencias !== 'ALL' && { label: 'Incidencias', value: ctx.filtros.incidencias },
        limpiar: (ctx) => ctx.setFiltro('incidencias', 'ALL'),
    },
    {
        key: 'lote',
        label: 'Lote',
        grupo: 'Estado y fases',
        ancho: 150,
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp) => exp.lote?.codigo || '',
        render: (exp) => exp.lote?.codigo
            ? (
                <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-mono font-black text-indigo-400">{exp.lote.codigo}</span>
                    <span className="text-white/25 text-[9px] uppercase tracking-wide truncate">{exp.lote.estado}</span>
                </div>
            )
            : <span className="text-white/20 text-[10px] uppercase tracking-wider">Sin lote</span>,
        filtro: (ctx) => (
            <Sel value={ctx.filtros.lote} onChange={v => ctx.setFiltro('lote', v)} activo={ctx.filtros.lote !== 'ALL'}>
                <Opt value="ALL">TODOS</Opt>
                <Opt value="NONE">SIN LOTE</Opt>
                <Opt value="ANY">EN ALGÚN LOTE</Opt>
                {ctx.listas.lotes.map(c => <Opt key={c} value={c}>{c}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => {
            const v = ctx.filtros.lote;
            if (v === 'ALL') return true;
            if (v === 'NONE') return !exp.lote_id;
            if (v === 'ANY') return !!exp.lote_id;
            return exp.lote?.codigo === v;
        },
        filtroActivo: (ctx) => ctx.filtros.lote !== 'ALL' && {
            label: 'Lote',
            value: ctx.filtros.lote === 'NONE' ? 'Sin lote' : ctx.filtros.lote === 'ANY' ? 'En algún lote' : ctx.filtros.lote,
        },
        limpiar: (ctx) => ctx.setFiltro('lote', 'ALL'),
    },
    {
        key: 'certificador',
        label: 'Certificador',
        grupo: 'Gente',
        ancho: 140,
        roles: ['ADMIN'],
        valor: (exp, ctx) => nombrePrescriptor(ctx.porId(exp.cee?.certificador_id)) || '',
        render: (exp, ctx) => {
            const cert = ctx.porId(exp.cee?.certificador_id);
            if (!cert) return <Vacio />;
            const initials = (cert.acronimo || cert.razon_social || '?').substring(0, 2).toUpperCase();
            return (
                <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${fichaColor(ctx.fin(exp).ficha).chip}`}>{initials}</div>
                    <span className="text-[10px] font-medium text-white/60 truncate max-w-[110px] leading-tight">
                        {cert.razon_social || cert.acronimo}
                    </span>
                </div>
            );
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros.certificador} onChange={v => ctx.setFiltro('certificador', v)} activo={ctx.filtros.certificador !== 'ALL'}>
                <Opt value="ALL">TODOS LOS TÉCNICOS</Opt>
                <Opt value="NONE">SIN ASIGNAR</Opt>
                {ctx.listas.certificadores.map(c => (
                    <Opt key={c.id_empresa} value={c.id_empresa}>{c.razon_social || c.acronimo}</Opt>
                ))}
            </Sel>
        ),
        match: (exp, ctx) => {
            const v = ctx.filtros.certificador;
            if (v === 'ALL') return true;
            if (v === 'NONE') return !exp.cee?.certificador_id;
            return String(exp.cee?.certificador_id) === String(v);
        },
        filtroActivo: (ctx) => ctx.filtros.certificador !== 'ALL' && {
            label: 'Certificador',
            value: ctx.filtros.certificador === 'NONE'
                ? 'Sin asignar'
                : (nombrePrescriptor(ctx.porId(ctx.filtros.certificador)) || ctx.filtros.certificador),
        },
        limpiar: (ctx) => ctx.setFiltro('certificador', 'ALL'),
    },
    {
        key: 'instalador',
        label: 'Instalador',
        grupo: 'Gente',
        ancho: 160,
        // Quién ejecuta la obra es dato COMERCIAL: el certificador no lo ve
        // (regla 48.d). El backend lo repite capándolo de la respuesta.
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp, ctx) => nombrePrescriptor(ctx.porId(instaladorDe(exp).id)) || '',
        render: (exp, ctx) => {
            const { id, heredado } = instaladorDe(exp);
            const p = ctx.porId(id);
            if (!p) return <Vacio />;
            return (
                <div
                    className="flex flex-col leading-tight"
                    title={heredado
                        ? 'Heredado de la oportunidad — la ficha de Instalación no lo declara'
                        : (p.razon_social || '')}
                >
                    <span className={`text-[11px] font-bold uppercase tracking-wide truncate ${heredado ? 'text-white/35 italic' : 'text-white/70'}`}>
                        {p.acronimo || p.razon_social}
                    </span>
                    {p.acronimo && p.razon_social && (
                        <span className="text-white/25 text-[9px] uppercase tracking-wide truncate">{p.razon_social}</span>
                    )}
                </div>
            );
        },
        filtro: (ctx) => (
            <Sel value={ctx.filtros.instalador} onChange={v => ctx.setFiltro('instalador', v)} activo={ctx.filtros.instalador !== 'ALL'}>
                <Opt value="ALL">TODOS LOS INSTALADORES</Opt>
                <Opt value="NONE">SIN INSTALADOR</Opt>
                {ctx.listas.instaladores.map(i => (
                    <Opt key={i.id_empresa} value={i.id_empresa}>{i.acronimo || i.razon_social}</Opt>
                ))}
            </Sel>
        ),
        match: (exp, ctx) => {
            const v = ctx.filtros.instalador;
            if (v === 'ALL') return true;
            const { id } = instaladorDe(exp);
            if (v === 'NONE') return !id;
            return String(id) === String(v);
        },
        filtroActivo: (ctx) => ctx.filtros.instalador !== 'ALL' && {
            label: 'Instalador',
            value: ctx.filtros.instalador === 'NONE'
                ? 'Sin instalador'
                : (nombrePrescriptor(ctx.porId(ctx.filtros.instalador)) || ctx.filtros.instalador),
        },
        limpiar: (ctx) => ctx.setFiltro('instalador', 'ALL'),
    },
    {
        key: 'metricas',
        label: '⚡ € ▲',
        etiquetaPicker: 'Ahorro · Bono · Margen (juntos)',
        grupo: 'Economía',
        ancho: 116,
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp, ctx) => ctx.fin(exp).cae,
        cabecera: () => (
            <div className="flex items-center gap-1.5">
                <span className="text-blue-400/60">⚡</span>
                <span className="text-emerald-400/60">€</span>
                <span className="text-cyan-400/60">▲</span>
            </div>
        ),
        render: (exp, ctx) => {
            const fin = ctx.fin(exp);
            if (fin.savingsKwh === null && fin.cae === null && fin.profit === null) return <Vacio />;
            const fila = (icono, color, texto) => (
                <div className="flex items-center gap-2">
                    <span className={`text-[8px] ${color}/50 w-3 text-center shrink-0`}>{icono}</span>
                    <span className={`text-[11px] font-black ${color} font-mono tabular-nums`}>{texto || '—'}</span>
                </div>
            );
            return (
                <div className="flex flex-col gap-0.5">
                    {fila('⚡', 'text-blue-400', fmtMwh(fin.savingsKwh))}
                    {fila('€', 'text-emerald-400', fmtEur(fin.cae))}
                    {fila('▲', 'text-cyan-400', fmtEur(fin.profit))}
                </div>
            );
        },
    },
    {
        key: 'ahorro',
        label: 'Ahorro',
        grupo: 'Economía',
        ancho: 110,
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp, ctx) => ctx.fin(exp).savingsKwh,
        render: (exp, ctx) => {
            const v = ctx.fin(exp).savingsKwh;
            return v == null ? <Vacio /> : <span className="text-[11px] font-black text-blue-400 font-mono tabular-nums">{fmtMwh(v)}</span>;
        },
    },
    {
        key: 'cae',
        label: 'Bono CAE',
        grupo: 'Economía',
        ancho: 110,
        roles: ['ADMIN', 'TRABAJADOR'],
        valor: (exp, ctx) => ctx.fin(exp).cae,
        render: (exp, ctx) => {
            const v = ctx.fin(exp).cae;
            return v == null ? <Vacio /> : <span className="text-[11px] font-black text-emerald-400 font-mono tabular-nums">{fmtEur(v)}</span>;
        },
    },
    {
        key: 'margen',
        label: 'Margen',
        grupo: 'Economía',
        ancho: 110,
        // El margen Brokergy no lo ve ni el TRABAJADOR: el backend ya lo capa
        // (stripBrokergyMargin), esto solo evita ofrecer una columna vacía.
        roles: ['ADMIN'],
        valor: (exp, ctx) => ctx.fin(exp).profit,
        render: (exp, ctx) => {
            const v = ctx.fin(exp).profit;
            return v == null ? <Vacio /> : <span className="text-[11px] font-black text-cyan-400 font-mono tabular-nums">{fmtEur(v)}</span>;
        },
    },
    {
        key: 'anio',
        label: 'Año Act.',
        grupo: 'Fechas',
        ancho: 80,
        valor: (exp) => getCifoYear(exp),
        render: (exp) => getCifoYear(exp) ? (
            <div className="flex flex-col gap-0.5">
                <span className="text-white/70 text-xs font-black">{getCifoYear(exp)}</span>
                <span className="text-white/25 text-[9px]">{new Date(exp.fecha_fin_cifo).toLocaleDateString('es-ES')}</span>
            </div>
        ) : <Vacio />,
        filtro: (ctx) => (
            <Sel value={ctx.filtros.anio} onChange={v => ctx.setFiltro('anio', v)} activo={ctx.filtros.anio !== 'ALL'}>
                <Opt value="ALL">TODOS LOS AÑOS</Opt>
                {ctx.listas.anios.map(y => <Opt key={y} value={y}>{y}</Opt>)}
            </Sel>
        ),
        match: (exp, ctx) => ctx.filtros.anio === 'ALL' || getCifoYear(exp) === parseInt(ctx.filtros.anio),
        filtroActivo: (ctx) => ctx.filtros.anio !== 'ALL' && { label: 'Año', value: ctx.filtros.anio },
        limpiar: (ctx) => ctx.setFiltro('anio', 'ALL'),
    },
    {
        key: 'actualizado',
        label: 'Actualizado',
        grupo: 'Fechas',
        ancho: 110,
        valor: (exp) => exp.updated_at || '',
        render: (exp) => {
            const d = daysSince(exp.updated_at);
            if (d == null) return <Vacio />;
            return (
                <div className="flex flex-col leading-tight">
                    <span className={`text-[11px] font-bold ${d > 30 ? 'text-amber-400/70' : 'text-white/50'}`}>
                        {d === 0 ? 'hoy' : `hace ${d} d`}
                    </span>
                    <span className="text-white/25 text-[9px]">{fmtDate(exp.updated_at)}</span>
                </div>
            );
        },
    },
    {
        key: 'creado',
        label: 'Creado',
        grupo: 'Fechas',
        ancho: 100,
        valor: (exp) => exp.created_at || '',
        render: (exp) => fmtDate(exp.created_at)
            ? <span className="text-white/40 text-[11px]">{fmtDate(exp.created_at)}</span>
            : <Vacio />,
    },
];

// La columna de acciones va aparte: es la única que no describe un dato del
// expediente, siempre se pinta la última y nunca se puede quitar.
export const COLUMNA_ACCIONES = {
    key: 'acciones',
    label: 'Acciones',
    fija: true,
    ancho: 88,
    align: 'text-right',
};

export const COLUMNAS_POR_KEY = Object.fromEntries(COLUMNAS.map(c => [c.key, c]));

/** ¿Puede este usuario ver esta columna? `roles` ausente = todos. */
export const puedeVer = (col, rol) => !col.roles || col.roles.includes(rol);

// ─── Vistas de fábrica ───────────────────────────────────────────────────────
// Un preset es solo una lista de keys: no hay nada que mantener aparte. El
// primero reproduce EXACTAMENTE la tabla de siempre, para que nadie se
// encuentre la pantalla cambiada sin haberla cambiado.
export const PRESETS = [
    {
        id: 'operativa',
        nombre: 'Operativa',
        descripcion: 'La de siempre',
        cols: ['expediente', 'ccaa', 'estado', 'ficha', 'certificador', 'metricas', 'anio'],
    },
    {
        id: 'seguimiento',
        nombre: 'Seguimiento CEE',
        descripcion: 'En qué fase está cada certificado y desde cuándo',
        cols: ['expediente', 'estado', 'fase_cee_inicial', 'fase_cee_final', 'certificador', 'actualizado'],
    },
    {
        id: 'economica',
        nombre: 'Económica',
        descripcion: 'Ahorro, bono y margen por separado, con su lote',
        cols: ['expediente', 'ficha', 'ahorro', 'cae', 'margen', 'lote', 'anio'],
    },
    {
        id: 'cartera',
        nombre: 'Cartera',
        descripcion: 'Quién trae la obra y a quién llamar',
        cols: ['expediente', 'cliente', 'telefono', 'instalador', 'municipio', 'estado'],
    },
];

export const COLUMNAS_POR_DEFECTO = PRESETS[0].cols;

/** Texto plano de una celda — el CSV exporta lo que la columna DICE. */
export function valorTexto(col, exp, ctx) {
    const v = col.valor ? col.valor(exp, ctx) : null;
    if (v == null) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    return String(v);
}
