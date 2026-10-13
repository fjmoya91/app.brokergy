import { useState, useEffect } from 'react';
import axios from 'axios';
import { IconoWhatsapp } from './IconoWhatsapp';
import { UltimosMensajesWhatsapp } from './UltimosMensajesWhatsapp';
import { enlaceChat } from '../../../utils/iconosCanal';

// ─────────────────────────────────────────────────────────────────────────────
// El WHATSAPP del cliente en su ficha: cada teléfono (titular, persona de
// contacto, copropietarios) con el NOMBRE con el que está guardado en la agenda
// y el que se ha puesto él, para reconocerlo —y buscarlo: el backend deja ese
// texto en `clientes.whatsapp_nombres`, que es lo que mira el buscador de
// Clientes—. Desde cada uno se abre el chat o se ven sus últimos mensajes.
//
// Solo equipo interno (ruta staffOnly); con WhatsApp desconectado lo dice en
// una línea y la ficha sigue igual.
// ─────────────────────────────────────────────────────────────────────────────

const VIA = { titular: 'Titular', 'persona de contacto': 'Contacto', copropietario: 'Copropietario' };

const verTlf = (t) => (/^\d{9}$/.test(t) ? t.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : t);

export function WhatsappCliente({ idCliente, nombreCliente = '', notifAlContacto = false }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [abierto, setAbierto] = useState(null);   // teléfono con los mensajes desplegados

    useEffect(() => {
        if (!idCliente) return undefined;
        let vivo = true;
        axios.get(`/api/whatsapp/contactos/cliente/${idCliente}`, { timeout: 45000 })
            .then(r => { if (vivo) { setDatos(r.data); setError(null); } })
            .catch(err => { if (vivo) setError(err.response?.status === 403 ? null : (err.response?.data?.error || 'No se ha podido leer su WhatsApp.')); });
        return () => { vivo = false; };
    }, [idCliente]);

    if (!datos && !error) {
        return <div className="min-h-[40px] rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />;
    }
    if (error) return <p className="text-[11px] text-amber-300/80">{error}</p>;
    const telefonos = datos?.telefonos || [];
    if (!telefonos.length) return <p className="text-[11px] text-white/30">La ficha no tiene teléfono.</p>;

    return (
        <div className="space-y-2">
            {telefonos.map(t => {
                const avisos = notifAlContacto ? t.via === 'persona de contacto' : t.via === 'titular';
                return (
                    <div key={t.telefono} className={`rounded-xl border px-3 py-2.5 ${t.en_whatsapp ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex items-start gap-2">
                                <IconoWhatsapp className={`w-4 h-4 mt-0.5 shrink-0 ${t.en_whatsapp ? 'text-emerald-400' : 'text-white/20'}`} />
                                <div className="min-w-0">
                                    <div className="text-sm text-white font-medium truncate normal-case">
                                        {t.en_whatsapp ? (t.nombre_agenda || t.pushname || 'Sin nombre guardado') : 'No está en tu WhatsApp'}
                                    </div>
                                    <div className="text-[11px] text-white/40 truncate normal-case">
                                        {[VIA[t.via] || t.via, verTlf(t.telefono),
                                            t.pushname && t.pushname !== t.nombre_agenda ? `se llama «${t.pushname}»` : null,
                                            t.en_whatsapp && !t.en_agenda ? 'sin guardar en la agenda' : null]
                                            .filter(Boolean).join(' · ')}
                                        {avisos && <span className="ml-1.5 text-emerald-400/80">· avisos aquí</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                                {t.con_chat && (
                                    <button type="button" onClick={() => setAbierto(a => (a === t.telefono ? null : t.telefono))}
                                        className="min-h-[32px] text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white">
                                        {abierto === t.telefono ? 'Ocultar' : 'Mensajes'}
                                    </button>
                                )}
                                {enlaceChat(t.numero || t.telefono) && (
                                    <a href={enlaceChat(t.numero || t.telefono)} target="_blank" rel="noopener noreferrer"
                                        className="min-h-[32px] inline-flex items-center text-[10px] font-black uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300">
                                        Abrir chat
                                    </a>
                                )}
                            </div>
                        </div>
                        {abierto === t.telefono && (
                            <div className="mt-2 pt-2 border-t border-white/[0.06]">
                                <UltimosMensajesWhatsapp telefono={t.telefono} idCliente={idCliente}
                                    quien={t.nombre_agenda || t.pushname || nombreCliente} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default WhatsappCliente;
