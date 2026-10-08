import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// RELATIVO también en desarrollo (como PresentarEncargoView). Vite proxea /api.
const API_URL = '/api/public/presentar-pendientes';

// ─────────────────────────────────────────────────────────────────────────────
// PresentarPendientesView — /presentar/pendientes?token=
//
// La BANDEJA de quien presenta los CEE por encargo nuestro (Eva), sin cuenta:
// todo lo que tiene pendiente de presentar, ordenado por lo que corre más prisa.
// Cada fila abre su encargo. Lo ya presentado NO sale (lo filtra el backend).
// Ver services/presentacionCeeService.js (bandejaPublica).
//
// REGLA — lo que corre prisa se VE: el plazo de un mes sale en ámbar a falta de
// una semana y en rojo vencido. Ni un importe.
// ─────────────────────────────────────────────────────────────────────────────
const fechaCorta = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };
const hace = (iso) => {
    if (!iso) return '';
    const dias = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000));
    return dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
};

export function PresentarPendientesView({ token }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(API_URL, { params: { token } });
            setDatos(data);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo abrir la lista.');
        } finally {
            setCargando(false);
        }
    }, [token]);

    useEffect(() => { cargar(); }, [cargar]);

    const pendientes = datos?.pendientes || [];
    const nombre = String(datos?.nombre || '').split(/\s+/)[0];

    return (
        <div className="min-h-screen bg-bkg-deep flex items-start justify-center p-4 md:p-8">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-6">
                    <img src="/logo.png" alt="BROKERGY" className="h-9 mx-auto mb-4 opacity-90"
                         onError={e => { e.currentTarget.style.display = 'none'; }} />
                    <h1 className="text-lg font-black text-white uppercase tracking-widest">CEE pendientes de presentar</h1>
                    {nombre && <p className="text-[11px] text-white/40 normal-case mt-1">Hola {nombre}: esto es lo que tienes encargado.</p>}
                </div>

                {cargando && <p className="text-[12px] text-white/40 normal-case text-center">Cargando…</p>}
                {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-4 text-[12px] text-red-300 normal-case leading-snug">{error}</div>
                )}

                {datos && (
                    <div className="space-y-6">
                        <section>
                            <div className="flex items-baseline justify-between mb-2 px-1">
                                <h2 className="text-[11px] font-black text-white uppercase tracking-widest">Pendientes</h2>
                                <span className="text-[11px] text-white/40 normal-case">{pendientes.length}</span>
                            </div>
                            {pendientes.length === 0 ? (
                                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] px-5 py-4 text-[12px] text-emerald-300 normal-case">
                                    ✓ No tienes nada pendiente de presentar. ¡Gracias!
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {pendientes.map((p, i) => <FilaPendiente key={`${p.numero}-${p.fase}-${i}`} p={p} />)}
                                </div>
                            )}
                        </section>

                        <p className="text-[10px] text-white/25 normal-case text-center leading-snug">
                            Este enlace es personal: no lo compartas. Cada encargo te llega también por correo con sus ficheros.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function FilaPendiente({ p }) {
    const q = p.plazo?.quedan;
    const tono = q == null ? 'neutro' : q < 0 ? 'rojo' : q <= 7 ? 'ambar' : 'neutro';
    const caja = {
        rojo: 'border-red-500/35 bg-red-500/[0.06]',
        ambar: 'border-amber-500/35 bg-amber-500/[0.05]',
        neutro: 'border-white/[0.08] bg-white/[0.03]',
    }[tono];
    const plazoTxt = p.plazo
        ? (q < 0 ? `Plazo vencido el ${fechaCorta(p.plazo.limite)}`
            : q === 0 ? 'Último día de plazo: hoy'
                : `Hasta el ${fechaCorta(p.plazo.limite)} · quedan ${q} día${q === 1 ? '' : 's'}`)
        : 'Plazo: un mes desde la emisión';
    const colorPlazo = { rojo: 'text-red-300', ambar: 'text-amber-300', neutro: 'text-white/45' }[tono];

    return (
        <a href={p.enlace || '#'}
           className={`group flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-colors hover:border-brand/50 ${caja}`}>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] text-white normal-case truncate">
                    <b>{p.numero}</b> · {p.faseLabel}
                </div>
                {p.cliente && <div className="text-[11px] text-white/55 normal-case truncate mt-0.5">{p.cliente}</div>}
                <div className="text-[10px] normal-case mt-1 leading-snug">
                    <span className={colorPlazo}>{plazoTxt}</span>
                    {p.enviado_at && <span className="text-white/30"> · enviado {hace(p.enviado_at)}</span>}
                </div>
            </div>
            <span className="shrink-0 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-brand/15 text-brand group-hover:bg-brand group-hover:text-black transition-colors">
                Abrir
            </span>
        </a>
    );
}

export default PresentarPendientesView;
