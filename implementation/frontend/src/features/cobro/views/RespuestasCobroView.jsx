/**
 * RespuestasCobroView — la bandeja del formulario de confirmación de cobro.
 *
 * Es lo que antes se miraba en Tally: quién ha contestado, qué ha dicho y a quién
 * hay que llamar. Con dos diferencias que justifican traerlo dentro: aquí cada
 * fila abre su expediente, y la marca de "ya contactado" se queda.
 *
 * REGLA — arranca en los INTERESADOS, no en todo. La lista completa es para
 * analizar y se pide con el conmutador; la de trabajo es la de quien ha pedido
 * algo. Abrirla entera convertiría una lista de llamadas en un inventario, que es
 * lo que hace que se deje de mirar.
 *
 * REGLA — el CSV sale de lo que estás VIENDO (filtro y búsqueda incluidos). Un
 * botón que exporta "todo" mientras la pantalla enseña otra cosa es la forma más
 * fácil de mandar el fichero equivocado.
 */

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const fechaCorta = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return '—'; }
};

// Búsqueda insensible a tildes, como el resto de buscadores de la app
// (ver project_busqueda_sin_tildes).
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function RespuestasCobroView({ onNavigate }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [soloInteresados, setSoloInteresados] = useState(true);
    const [q, setQ] = useState('');
    const [filtroLead, setFiltroLead] = useState(null);   // 'tarifa' | 'solar' | 'fiscalidad'
    const [marcando, setMarcando] = useState(null);

    const cargar = () => {
        axios.get('/api/expedientes/cobro/respuestas')
            .then(r => setDatos(r.data))
            .catch(e => setError(e.response?.data?.error || 'No se han podido cargar las respuestas.'));
    };
    useEffect(cargar, []);

    const filas = useMemo(() => {
        let f = datos?.filas || [];
        if (soloInteresados) f = f.filter(x => x.leads.length);
        if (filtroLead) f = f.filter(x => x.leads.some(l => l.id === filtroLead));
        if (q.trim()) {
            const t = norm(q);
            f = f.filter(x => norm(x.cliente).includes(t)
                || norm(x.numero_expediente).includes(t)
                || norm(x.tlf).includes(t)
                || norm(x.email).includes(t));
        }
        return f;
    }, [datos, soloInteresados, filtroLead, q]);

    const marcar = async (fila) => {
        setMarcando(fila.id);
        try {
            await axios.post(`/api/expedientes/${fila.id}/cobro/contactado`, { quitar: !!fila.contactado });
            cargar();
        } catch (e) { /* la lista se recarga igual; un fallo aquí no rompe nada */ }
        finally { setMarcando(null); }
    };

    const descargarCsv = () => {
        const bloques = datos?.bloques || [];
        const cab = ['Expediente', 'Cliente', 'Teléfono', 'Email', 'Fecha',
            ...bloques.map(b => b.titulo), 'Forma de pago', 'Interesado en', 'Contactado'];
        // El punto y coma es el separador que Excel en español espera; con comas
        // abre todo en una sola columna y hay que explicarle a alguien por qué.
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lineas = [cab.map(esc).join(';')];
        for (const f of filas) {
            lineas.push([
                f.numero_expediente, f.cliente, f.tlf, f.email, fechaCorta(f.fecha),
                ...bloques.map(b => f.etiquetas?.[b.id] || ''),
                f.etiquetas?.forma_pago || '',
                f.leads.map(l => l.texto).join(' · '),
                f.contactado ? `Sí (${fechaCorta(f.contactado.at)})` : 'No',
            ].map(esc).join(';'));
        }
        // BOM: sin él, Excel se come los acentos de "Teléfono" y de los nombres.
        const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `respuestas-cobro-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (error) {
        return <div className="p-6 text-red-300 text-sm">{error}</div>;
    }
    if (!datos) {
        return <div className="p-6 text-white/40 text-xs font-black uppercase tracking-widest">Cargando respuestas…</div>;
    }

    const bloques = datos.bloques || [];

    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* ── Cabecera ────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Venta cruzada</h2>
                    <p className="text-white/40 text-xs mt-1 max-w-xl leading-snug">
                        Lo que contestan los clientes al confirmar sus datos de cobro. Los que han pedido algo
                        salen primero: son las llamadas pendientes.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={descargarCsv}
                    disabled={!filas.length}
                    className="shrink-0 px-4 py-2.5 rounded-xl border border-brand/30 text-brand text-[11px] font-black uppercase tracking-widest hover:bg-brand/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Descarga lo que estás viendo, con el filtro y la búsqueda aplicados"
                >
                    ⬇ Descargar CSV ({filas.length})
                </button>
            </div>

            {/* ── Conmutador + filtros ────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center p-1 bg-bkg-surface/60 rounded-xl border border-white/[0.06]">
                    {[
                        { v: true, label: `Interesados (${datos.interesados})` },
                        { v: false, label: `Todas (${datos.total})` },
                    ].map(o => (
                        <button
                            key={String(o.v)}
                            type="button"
                            onClick={() => { setSoloInteresados(o.v); if (o.v === false) setFiltroLead(null); }}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                                soloInteresados === o.v ? 'bg-brand text-bkg-deep' : 'text-white/35 hover:text-white'
                            }`}
                        >{o.label}</button>
                    ))}
                </div>

                {/* Filtro por tipo de interés: cada campaña se trabaja por separado
                    (quien llama por tarifas no llama por placas el mismo día). */}
                {soloInteresados && bloques.map(b => (
                    <button
                        key={b.id}
                        type="button"
                        onClick={() => setFiltroLead(filtroLead === b.id ? null : b.id)}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                            filtroLead === b.id
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : 'bg-white/[0.03] text-white/35 border-white/10 hover:text-white'
                        }`}
                    >{b.icono} {b.titulo}</button>
                ))}

                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Buscar cliente, expediente, teléfono…"
                    className="flex-1 min-w-[200px] bg-bkg-elevated border border-white/10 focus:border-brand/50 rounded-xl px-3 py-2 text-white text-sm outline-none no-uppercase"
                />
            </div>

            {/* ── Lista ───────────────────────────────────────────────────── */}
            {!filas.length ? (
                <div className="p-8 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                    <p className="text-white/40 text-sm">
                        {datos.total === 0
                            ? 'Todavía no ha contestado nadie. Las respuestas aparecen aquí en cuanto el primer cliente confirme sus datos de cobro.'
                            : 'Nada con ese filtro.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filas.map(f => (
                        <div key={f.id}
                             className={`rounded-2xl border p-4 transition-colors ${
                                 f.contactado
                                     ? 'border-white/[0.05] bg-white/[0.015] opacity-70'
                                     : 'border-white/[0.08] bg-white/[0.03]'
                             }`}>
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => onNavigate?.('expedientes', { expediente_id: f.id })}
                                            className="text-white font-black text-sm hover:text-brand transition-colors"
                                            title="Abrir el expediente"
                                        >{f.cliente || 'Cliente'}</button>
                                        <span className="text-white/25 text-[11px] font-mono">{f.numero_expediente}</span>
                                        {/* Un cambio de cuenta se ve desde aquí: quien abre esta
                                            lista está mirando pagos. */}
                                        {f.iban_cambiado && (
                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                                ⚠ Cambió el nº de cuenta
                                            </span>
                                        )}
                                    </div>
                                    {/* Teléfono y email PULSABLES: se abre esta lista para llamar. */}
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px]">
                                        {f.tlf && <a href={`tel:${f.tlf}`} className="text-brand/80 hover:text-brand">📞 {f.tlf}</a>}
                                        {f.tlf && <a href={`https://wa.me/${String(f.tlf).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-emerald-400/80 hover:text-emerald-300">WhatsApp</a>}
                                        {f.email && <a href={`mailto:${f.email}`} className="text-white/40 hover:text-white no-uppercase">{f.email}</a>}
                                        <span className="text-white/25">Contestó el {fechaCorta(f.fecha)}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => marcar(f)}
                                    disabled={marcando === f.id}
                                    className={`shrink-0 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${
                                        f.contactado
                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                            : 'bg-white/[0.03] text-white/40 border-white/10 hover:text-white hover:border-white/25'
                                    }`}
                                    title={f.contactado ? `Contactado el ${fechaCorta(f.contactado.at)} por ${f.contactado.por || '—'}` : 'Marcar como contactado'}
                                >
                                    {f.contactado ? '✓ Contactado' : 'Marcar contactado'}
                                </button>
                            </div>

                            {/* Lo que pidió, primero y destacado. */}
                            {!!f.leads.length && (
                                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                                    {f.leads.map(l => (
                                        <span key={l.id} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-brand/10 text-brand border border-brand/25">
                                            {l.icono} {l.texto}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Y el resto de lo contestado, en gris: saber que ya tiene
                                gestor ahorra la llamada igual que saber que la quiere. */}
                            <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-white/30">
                                {bloques.map(b => f.etiquetas?.[b.id] && !f.leads.some(l => l.id === b.id) && (
                                    <span key={b.id}>{b.icono} {f.etiquetas[b.id]}</span>
                                ))}
                                {f.etiquetas?.forma_pago && <span>💳 {f.etiquetas.forma_pago}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default RespuestasCobroView;
