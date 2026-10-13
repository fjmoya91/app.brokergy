import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { IconoWhatsapp } from './IconoWhatsapp';
import { UltimosMensajesWhatsapp } from './UltimosMensajesWhatsapp';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { enlaceChat } from '../../../utils/iconosCanal';

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP SIN CONTESTAR — los chats cuyo último mensaje es del otro y llevan
// más de X horas sin respuesta, con quién es en la app (cliente y su obra,
// partner o nadie todavía). Lo que se escapa en WhatsApp es justo esto: lo leído
// en el móvil y dejado «para luego». Backend: services/whatsappBandeja.js.
//
// «Ya está» lo quita PARA TODO EL EQUIPO hasta su siguiente mensaje.
// ─────────────────────────────────────────────────────────────────────────────

const TIPO = { image: '📷 Foto', video: '🎬 Vídeo', document: '📄 Documento', ptt: '🎤 Nota de voz', audio: '🎵 Audio',
    sticker: '🙂 Sticker', location: '📍 Ubicación', vcard: '👤 Contacto', multi_vcard: '👥 Contactos', album: '🖼️ Álbum' };
const GRUPOS = [['cliente', 'Clientes'], ['partner', 'Partners'], ['nadie', 'Sin ficha en la app']];
const HORAS = [1, 2, 6, 24];

const espera = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`);
const enlaceObra = (o) => (o.tipo === 'cee' ? `/?cee=${encodeURIComponent(o.id)}`
    : o.tipo === 'oportunidad' ? `/?op=${encodeURIComponent(o.codigo)}` : `/?exp=${encodeURIComponent(o.codigo)}`);

function partirNombre(s) {
    const p = String(s || '').replace(/[^\p{L}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const corte = p.length >= 4 ? 2 : 1;
    return { nombre: p.slice(0, corte).join(' ').toUpperCase(), apellidos: p.slice(corte).join(' ').toUpperCase() };
}

export function WhatsappSinContestar() {
    const [horas, setHoras] = useState(2);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [abierto, setAbierto] = useState(false);
    const [verChat, setVerChat] = useState(null);
    const [alta, setAlta] = useState(null);
    const [verCortesia, setVerCortesia] = useState(false);

    const pedir = useCallback((h) => {
        axios.get('/api/whatsapp/bandeja/sin-contestar', { params: { horas: h }, timeout: 60000 })
            .then(r => { setDatos(r.data); setError(null); })
            .catch(err => {
                setDatos(null);
                setError(err.response?.status === 403 ? null : (err.response?.data?.error || 'No se han podido leer los chats.'));
            })
            .finally(() => setCargando(false));
    }, []);
    useEffect(() => { pedir(horas); }, [pedir, horas]);
    const recargar = () => { setCargando(true); pedir(horas); };

    const atendido = async (c) => {
        setDatos(d => (d ? {
            ...d, chats: d.chats.filter(x => x.clave !== c.clave),
            total: d.total - (c.cortesia ? 0 : 1), cortesia: (d.cortesia || 0) - (c.cortesia ? 1 : 0),
        } : d));
        try {
            await axios.post('/api/whatsapp/bandeja/atendido', { clave: c.clave, hasta_t: c.desde });
        } catch (err) {
            setError(err.response?.data?.error || 'No se ha podido marcar.');
            recargar();
        }
    };

    if (!datos && !error && !cargando) return null;
    const n = datos?.total ?? null;
    // Los de cortesía («Perfecto», «gracias») no esperan nada: van aparte y plegados.
    const chats = (datos?.chats || []).filter(c => !c.cortesia);
    const cortesias = (datos?.chats || []).filter(c => c.cortesia);

    const fila = (c) => {
                                    const ficha = c.clientes?.[0];
                                    const titulo2 = ficha?.nombre || c.partner?.nombre || c.nombre_whatsapp || c.telefono || 'Sin nombre';
                                    const largo = c.horas >= 24;
                                    return (
                                        <div key={c.clave} className="rounded-xl bg-bkg-surface/60 border border-white/[0.06] px-3 py-2.5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm text-white font-medium truncate">{titulo2}</div>
                                                    <div className="text-[11px] text-white/40 truncate">
                                                        {[c.nombre_whatsapp && c.nombre_whatsapp !== titulo2 ? `«${c.nombre_whatsapp}»` : null,
                                                            c.telefono, ficha && ficha.via !== 'titular' ? ficha.via : null,
                                                            c.partner && ficha ? `partner ${c.partner.nombre}` : null,
                                                            c.archivado ? 'archivado' : null].filter(Boolean).join(' · ')}
                                                    </div>
                                                </div>
                                                <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${largo ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                                    {espera(c.horas)}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 text-[12px] text-white/70 line-clamp-2 break-words">
                                                {TIPO[c.tipo] ? <span className="text-white/50">{TIPO[c.tipo]}{c.texto ? ' · ' : ''}</span> : null}
                                                {c.texto || (TIPO[c.tipo] ? '' : '…')}
                                            </div>
                                            {(c.clientes || []).flatMap(f => f.obras || []).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {(c.clientes || []).flatMap(f => f.obras || []).map(o => (
                                                        <a key={`${o.tipo}-${o.codigo}`} href={enlaceObra(o)}
                                                            className="px-1.5 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[10px] font-bold text-white/60 hover:text-brand hover:border-brand/40">
                                                            {o.codigo}{o.estado ? ` · ${String(o.estado).toLowerCase()}` : ''}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-end gap-3 mt-2">
                                                <button type="button" onClick={() => setVerChat(v => (v === c.clave ? null : c.clave))}
                                                    className="min-h-[32px] text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white">
                                                    {verChat === c.clave ? 'Ocultar' : 'Mensajes'}
                                                </button>
                                                {c.quien === 'nadie' && c.telefono && (
                                                    <button type="button" onClick={() => setAlta({ ...partirNombre(c.nombre_whatsapp), tlf: String(c.telefono).replace(/^34(?=\d{9}$)/, '') })}
                                                        className="min-h-[32px] text-[10px] font-black uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300">
                                                        Dar de alta
                                                    </button>
                                                )}
                                                {enlaceChat(c.telefono) && (
                                                    <a href={enlaceChat(c.telefono)} target="_blank" rel="noopener noreferrer"
                                                        className="min-h-[32px] inline-flex items-center text-[10px] font-black uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300">
                                                        Contestar
                                                    </a>
                                                )}
                                                <button type="button" onClick={() => atendido(c)}
                                                    title="Ya se le ha atendido (o no pide respuesta): que no salga hasta que vuelva a escribir"
                                                    className="min-h-[32px] px-2.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">
                                                    Ya está
                                                </button>
                                            </div>
                                            {verChat === c.clave && c.telefono && (
                                                <div className="mt-2 pt-2 border-t border-white/[0.06]">
                                                    <UltimosMensajesWhatsapp telefono={c.telefono} idCliente={ficha?.id_cliente || null} quien={titulo2} n={6} />
                                                </div>
                                            )}
                                        </div>
                                    );
    };

    return (
        <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04]">
            <button type="button" onClick={() => setAbierto(v => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left">
                <IconoWhatsapp className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="flex-1 min-w-0 text-[11px] font-black uppercase tracking-widest text-emerald-200/90">
                    WhatsApp sin contestar
                    <span className="normal-case font-normal tracking-normal text-white/35"> · más de {horas} h</span>
                </span>
                {cargando && !datos ? <span className="text-[11px] text-white/35">…</span>
                    : error ? <span className="text-[11px] text-amber-300/80">!</span>
                    : <span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${n ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/5 text-white/40'}`}>{n}</span>}
                <span className="text-white/30 text-xs">{abierto ? '▲' : '▼'}</span>
            </button>

            {abierto && (
                <div className="px-3 sm:px-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-white/35">Esperando más de</span>
                        {HORAS.map(h => (
                            <button key={h} type="button" onClick={() => { setCargando(true); setHoras(h); }}
                                className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${h === horas ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-white/40 hover:text-white'}`}>
                                {h} h
                            </button>
                        ))}
                        <button type="button" onClick={recargar} disabled={cargando}
                            className="ml-auto min-h-[30px] px-2.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white disabled:opacity-30">
                            {cargando ? 'Leyendo…' : 'Actualizar'}
                        </button>
                    </div>
                    {error && <p className="text-[11px] text-amber-300/80">{error}</p>}
                    {datos && !chats.length && <p className="text-[11px] text-white/40 py-2">Nadie espera respuesta desde hace más de {horas} h. 👌</p>}

                    {GRUPOS.map(([q, titulo]) => {
                        const lista = chats.filter(c => c.quien === q);
                        if (!lista.length) return null;
                        return (
                            <div key={q} className="space-y-1.5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-white/35">{titulo} · {lista.length}</div>
                                {lista.map(fila)}
                            </div>
                        );
                    })}
                    {cortesias.length > 0 && (
                        <div className="space-y-1.5">
                            <button type="button" onClick={() => setVerCortesia(v => !v)}
                                className="min-h-[30px] text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white">
                                Solo agradecen o dan el ok · {cortesias.length} {verCortesia ? '▲' : '▼'}
                            </button>
                            {verCortesia && cortesias.map(fila)}
                        </div>
                    )}
                    {datos && (datos.atendidos > 0 || datos.sinCargar > 0) && (
                        <p className="text-[10px] text-white/30">
                            {datos.atendidos > 0 ? `${datos.atendidos} marcado${datos.atendidos === 1 ? '' : 's'} «Ya está» (vuelven si escriben otra vez). ` : ''}
                            {datos.sinCargar > 0 ? `${datos.sinCargar} chat${datos.sinCargar === 1 ? '' : 's'} sin su último mensaje cargado en WhatsApp: no se pueden comprobar.` : ''}
                        </p>
                    )}
                </div>
            )}
            {createPortal(
                <ClienteFormModal isOpen={!!alta} onClose={() => setAlta(null)} initialData={alta || undefined}
                    onSuccess={() => { setAlta(null); recargar(); }} />,
                document.body,
            )}
        </div>
    );
}

export default WhatsappSinContestar;
