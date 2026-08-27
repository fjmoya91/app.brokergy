import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { FirmarCifoCard } from '../components/FirmarCifoCard';
import { SubirRiteCard } from '../components/SubirRiteCard';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// /instalador/:id — TODO lo que el instalador tiene que hacer en esta obra, en
// un solo sitio: firmar el Certificado CIFO y devolvernos la legalización RITE.
//
// Antes eran dos enlaces (/subir-cifo y /subir-rite) enviados en dos mensajes
// distintos para dos tareas que se hacen del tirón. Un enlace por tarea es un
// enlace que se pierde: el instalador abre el primero, resuelve lo que ve, y de
// lo otro no se entera nadie hasta que alguien lo reclama por teléfono.
//
// REGLA — solo se enseña lo que QUEDA. Lo ya recibido baja a una línea con su
// ✓: es la prueba de que llegó (que es lo primero que se pregunta), pero no
// puede ocupar el sitio de lo que falta.
//
// REGLA — la superficie de cada tarea es la MISMA que la de su página suelta
// (FirmarCifoCard / SubirRiteCard). Si aquí se firmara distinto que allí, un
// CIFO rechazado se podría volver a firmar por el camino que no comprueba.
// ─────────────────────────────────────────────────────────────────────────────

const TAREAS = {
    cifo: {
        titulo: 'Firmar el Certificado CIFO',
        resumen: 'Se firma aquí mismo con tu certificado electrónico.',
        hechoTexto: 'Certificado CIFO firmado — recibido',
        icono: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
    },
    rite: {
        titulo: 'Registrar el RITE y enviarnos el certificado',
        resumen: 'Sube el certificado tramitado (y la memoria firmada).',
        hechoTexto: 'Legalización RITE — recibida',
        icono: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
};

export function SubirInstaladorView({ expedienteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [abierta, setAbierta] = useState(null);   // tarea desplegada

    const load = () => axios.get(`${API_URL}/instalador/${expedienteId}`)
        .then(r => {
            setInfo(r.data);
            // Se abre sola la primera que quede pendiente: con una sola tarea, el
            // instalador no tiene que pulsar nada para empezar.
            const pend = (r.data.tareas || []).filter(t => !t.hecho);
            setAbierta(prev => (prev && pend.some(t => t.key === prev)) ? prev : (pend[0]?.key || null));
        })
        .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));

    useEffect(() => { load(); }, [expedienteId]);

    if (!info && !loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando expediente...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <DynamicNetworkBackground />
                <div className="w-full max-w-md relative z-10 bg-bkg-surface border border-white/[0.06] rounded-[2.5rem] p-10 text-center backdrop-blur-xl">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Enlace no válido</h2>
                    <p className="text-white/40 text-sm leading-relaxed">{loadError}</p>
                    <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10 text-white/20 text-[10px] uppercase font-bold tracking-widest">
                        Si crees que esto es un error, contacta con Brokergy
                    </div>
                </div>
            </div>
        );
    }

    const tareas = info.tareas || [];
    const pendientes = tareas.filter(t => !t.hecho);
    const hechas = tareas.filter(t => t.hecho);
    const todoHecho = tareas.length > 0 && pendientes.length === 0;

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />

            <div className="w-full max-w-lg relative z-10 px-4 py-10">
                <div className="text-center mb-8 relative">
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Tu obra en</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">BROKERGY</span>
                    </h1>
                    <p className="text-white/60 text-sm relative z-10">
                        {todoHecho
                            ? 'No queda nada pendiente por tu parte. Gracias.'
                            : pendientes.length > 1
                                ? `Quedan ${pendientes.length} cosas por tu parte. Las dos se resuelven aquí.`
                                : 'Queda una cosa por tu parte.'}
                    </p>
                </div>

                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    {/* Datos del expediente */}
                    <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del expediente</p>
                        {[
                            ['Expediente', info.numero_expediente, 'text-brand font-mono'],
                            ['Cliente', info.cliente, 'text-white/80'],
                            ['Instalación', info.direccion, 'text-white/80'],
                            ['Instalador', info.instalador, 'text-white/80'],
                        ].filter(([, v]) => v).map(([label, value, cls]) => (
                            <div key={label} className="flex items-start justify-between gap-4">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold shrink-0 pt-0.5">{label}</span>
                                <span className={`text-sm font-bold text-right ${cls}`}>{value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="p-6 sm:p-8 space-y-4">
                        {todoHecho && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Todo recibido!</h2>
                                <p className="text-white/50 text-sm leading-relaxed">
                                    Tenemos todo lo tuyo del expediente <strong className="text-brand">{info.numero_expediente}</strong>. Seguimos nosotros con la tramitación.
                                </p>
                                <p className="text-white/20 text-xs mt-6">Puedes cerrar esta ventana.</p>
                            </div>
                        )}

                        {/* PENDIENTES — una tarjeta desplegable por tarea */}
                        {pendientes.map((t, i) => {
                            const meta = TAREAS[t.key];
                            const open = abierta === t.key;
                            return (
                                <div key={t.key} className={`rounded-2xl border transition-all ${open ? 'border-brand/30 bg-brand/[0.03]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
                                    <button
                                        type="button"
                                        onClick={() => setAbierta(open ? null : t.key)}
                                        className="w-full flex items-center gap-4 p-5 text-left"
                                    >
                                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${open ? 'bg-brand/15 border-brand/40 text-brand' : 'bg-white/5 border-white/10 text-white/40'}`}>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={meta.icono} /></svg>
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/25 mb-0.5">
                                                {pendientes.length > 1 ? `Tarea ${i + 1} de ${pendientes.length}` : 'Pendiente'}
                                            </span>
                                            <span className="block text-sm font-black text-white leading-tight">{meta.titulo}</span>
                                            <span className="block text-[11px] text-white/40 mt-0.5">{t.aviso || meta.resumen}</span>
                                        </span>
                                        <svg className={`w-5 h-5 shrink-0 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {open && (
                                        <div className="px-5 pb-5 pt-1 animate-fade-in">
                                            {t.key === 'cifo'
                                                ? <FirmarCifoCard expedienteId={expedienteId} info={{ ...info, bloqueado: t.bloqueado, rechazo: t.rechazo }} onDone={load} />
                                                : <SubirRiteCard expedienteId={expedienteId} info={t} onDone={load} pideMemoria={!!t.pide_memoria} />}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* YA RECIBIDO — una línea, no una tarjeta */}
                        {hechas.map(t => (
                            <div key={t.key} className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/15">
                                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                <span className="text-[11px] font-bold text-emerald-300/80 uppercase tracking-wider">{TAREAS[t.key].hechoTexto}</span>
                            </div>
                        ))}

                        {!tareas.length && (
                            <p className="text-center text-white/40 text-sm py-6">
                                Ahora mismo no hay nada pendiente por tu parte en este expediente.
                            </p>
                        )}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
