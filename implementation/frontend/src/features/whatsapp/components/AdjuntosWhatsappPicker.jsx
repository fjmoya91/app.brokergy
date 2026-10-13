import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// «BUSCAR EN SU WHATSAPP»: los documentos y fotos que el cliente (o su persona
// de contacto) nos ha mandado por WhatsApp en los últimos 60 días, para elegir
// el que falta —el justificante del banco, el DNI…— sin pedírselo otra vez.
//
// Lee la conversación de cada teléfono de la ficha con chat (solo lectura) y
// devuelve un `File` del adjunto elegido: quien lo usa lo sube por su camino
// de siempre (el del justificante lo LEE y comprueba IBAN y titular).
// ─────────────────────────────────────────────────────────────────────────────

const VIA = { titular: 'titular', 'persona de contacto': 'contacto', copropietario: 'copropietario' };
const fecha = (t) => new Date(t * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

export function AdjuntosWhatsappPicker({ idCliente, titulo = 'Buscar en su WhatsApp', onElegir, onClose }) {
    const [estado, setEstado] = useState({ cargando: true, error: null, items: [], leidos: [] });
    const [bajando, setBajando] = useState(null);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const { data } = await axios.get(`/api/whatsapp/contactos/cliente/${idCliente}`, { timeout: 45000 });
                const conChat = (data?.telefonos || []).filter(t => t.con_chat);
                const items = [];
                const leidos = [];
                // De uno en uno: el servidor los lee en fila de todos modos.
                for (const t of conChat) {
                    try {
                        const r = await axios.post('/api/whatsapp/conversacion', { telefono: t.telefono, dias: 60 }, { timeout: 90000 });
                        leidos.push(t);
                        for (const m of r.data?.mensajes || []) {
                            if (!m.descargable || !['image', 'document'].includes(m.tipo)) continue;
                            items.push({ ...m, via: t.via, quien: t.nombre_agenda || t.pushname || t.telefono });
                        }
                    } catch { /* ese chat no se ha podido leer: se siguen los demás */ }
                }
                items.sort((a, b) => b.t - a.t);
                if (vivo) setEstado({ cargando: false, error: null, items, leidos });
            } catch (err) {
                if (vivo) setEstado({ cargando: false, error: err.response?.data?.error || 'No se ha podido leer su WhatsApp.', items: [], leidos: [] });
            }
        })();
        return () => { vivo = false; };
    }, [idCliente]);

    const bajar = async (m) => {
        const r = await axios.get('/api/whatsapp/conversacion/adjunto', { params: { msg: m.id }, responseType: 'blob', timeout: 120000 });
        const nombre = decodeURIComponent(r.headers['x-nombre-archivo'] || '') || m.nombre_archivo || `whatsapp_${m.t}`;
        return new File([r.data], nombre, { type: r.data.type || m.mimetype || 'application/octet-stream' });
    };
    const ver = async (m) => {
        try { const f = await bajar(m); window.open(URL.createObjectURL(f), '_blank', 'noopener'); }
        catch { alert('No se ha podido abrir el adjunto.'); }
    };
    const usar = async (m) => {
        setBajando(m.id);
        try { const f = await bajar(m); onElegir?.(f); onClose?.(); }
        catch { alert('No se ha podido bajar el adjunto.'); }
        finally { setBajando(null); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[400] bg-black/75 backdrop-blur-md flex items-end md:items-center justify-center md:p-6">
            <div className="bg-bkg-deep border border-white/[0.08] w-full md:max-w-xl md:rounded-2xl rounded-t-3xl max-h-[88dvh] flex flex-col">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">{titulo}</h2>
                        <p className="text-[11px] text-white/35 mt-0.5">Documentos y fotos que nos ha mandado por WhatsApp en los últimos 60 días.</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="shrink-0 w-11 h-11 -mr-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white text-xl leading-none">×</button>
                </div>
                <div className="overflow-y-auto px-5 py-4 space-y-2">
                    {estado.cargando && <p className="text-[11px] text-white/35">Leyendo sus chats… (puede tardar unos segundos)</p>}
                    {estado.error && <p className="text-[11px] text-amber-300/80">{estado.error}</p>}
                    {!estado.cargando && !estado.error && !estado.items.length && (
                        <p className="text-[11px] text-white/35 py-4 text-center">
                            {estado.leidos.length ? 'No nos ha mandado ningún documento ni foto en los últimos 60 días.' : 'Ninguno de sus teléfonos tiene conversación con nosotros.'}
                        </p>
                    )}
                    {estado.items.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-2.5">
                            <div className="min-w-0">
                                <div className="text-sm text-white truncate normal-case">
                                    {m.tipo === 'document' ? '📄' : '📷'} {m.nombre_archivo || m.texto || (m.tipo === 'document' ? 'Documento' : 'Foto')}
                                </div>
                                <div className="text-[11px] text-white/35 truncate normal-case">
                                    {fecha(m.t)} · {m.de_mi ? 'enviado por nosotros' : `de ${m.quien} (${VIA[m.via] || m.via})`}{m.texto && m.nombre_archivo ? ` · «${m.texto.slice(0, 60)}»` : ''}
                                </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                                <button type="button" onClick={() => ver(m)} className="min-h-[36px] text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white">Ver</button>
                                <button type="button" onClick={() => usar(m)} disabled={!!bajando}
                                    className="min-h-[36px] px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40">
                                    {bajando === m.id ? '…' : 'Usar este'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default AdjuntosWhatsappPicker;
