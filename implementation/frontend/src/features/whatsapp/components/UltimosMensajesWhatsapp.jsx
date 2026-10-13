import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { enlaceChat } from '../../../utils/iconosCanal';

// ─────────────────────────────────────────────────────────────────────────────
// Los ÚLTIMOS mensajes del chat con un teléfono, para ver el contexto sin salir
// de la ficha (cliente o expediente). Solo LECTURA: no se marca nada como leído
// ni se abre ningún chat (backend: whatsappConversacion.leerConversacion con
// `ultimos`, un lote como mucho).
//
// Desde aquí, además:
//  · una NOTA DE VOZ se transcribe (Gemini) y se puede guardar en las notas del cliente;
//  · una TARJETA DE CONTACTO se da de alta como cliente (si su número no está ya);
//  · un adjunto se abre.
// ─────────────────────────────────────────────────────────────────────────────

const ICONO_TIPO = { image: '📷 Foto', video: '🎬 Vídeo', document: '📄 Documento', ptt: '🎤 Nota de voz', audio: '🎵 Audio',
    sticker: '🙂 Sticker', location: '📍 Ubicación', vcard: '👤 Contacto', multi_vcard: '👥 Contactos', revoked: '🚫 Eliminado', album: '🖼️ Álbum' };

const hora = (t) => {
    const d = new Date(t * 1000);
    const hoy = new Date();
    const mismoDia = d.toDateString() === hoy.toDateString();
    return mismoDia
        ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

function partirNombre(s) {
    const p = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const corte = p.length >= 4 ? 2 : 1;
    return { nombre: p.slice(0, corte).join(' '), apellidos: p.slice(corte).join(' ') };
}

export function UltimosMensajesWhatsapp({ telefono, idCliente = null, n = 8, quien = '' }) {
    const [estado, setEstado] = useState({ cargando: true, error: null, mensajes: [], sinChat: false });
    const [transcripciones, setTranscripciones] = useState({});   // msgId → { cargando, texto, error, guardado }
    const [alta, setAlta] = useState(null);                      // initialData para ClienteFormModal
    const [avisoAlta, setAvisoAlta] = useState(null);

    const cargar = useCallback(() => {
        axios.post('/api/whatsapp/conversacion', { telefono, dias: 60, ultimos: n }, { timeout: 60000 })
            .then(r => setEstado({ cargando: false, error: null, mensajes: r.data?.mensajes || [], sinChat: false }))
            .catch(err => {
                const st = err.response?.status;
                if (st === 404) setEstado({ cargando: false, error: null, mensajes: [], sinChat: true });
                else setEstado({ cargando: false, error: err.response?.data?.error || 'No se ha podido leer el chat.', mensajes: [], sinChat: false });
            });
    }, [telefono, n]);
    useEffect(() => { cargar(); }, [cargar]);

    const abrirAdjunto = async (m) => {
        try {
            const r = await axios.get('/api/whatsapp/conversacion/adjunto', { params: { msg: m.id }, responseType: 'blob', timeout: 120000 });
            window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
        } catch {
            alert('No se ha podido abrir el adjunto. Vuelve a abrir la ficha y prueba otra vez.');
        }
    };

    const transcribir = async (m) => {
        setTranscripciones(t => ({ ...t, [m.id]: { cargando: true } }));
        try {
            const r = await axios.post('/api/whatsapp/conversacion/transcribir', { msg: m.id }, { timeout: 120000 });
            setTranscripciones(t => ({ ...t, [m.id]: { texto: r.data?.texto || '' } }));
        } catch (err) {
            setTranscripciones(t => ({ ...t, [m.id]: { error: err.response?.data?.error || 'No se ha podido transcribir.' } }));
        }
    };

    const aNotas = async (m) => {
        const tr = transcripciones[m.id];
        if (!tr?.texto || !idCliente) return;
        const de = m.de_mi ? 'nuestro' : (quien ? `de ${quien}` : 'del cliente');
        try {
            await axios.post('/api/whatsapp/conversacion/a-notas', {
                id_cliente: idCliente, texto: `Audio de WhatsApp ${de} (${hora(m.t)}): ${tr.texto}`,
            });
            setTranscripciones(t => ({ ...t, [m.id]: { ...tr, guardado: true } }));
        } catch (err) {
            setTranscripciones(t => ({ ...t, [m.id]: { ...tr, error: err.response?.data?.error || 'No se ha podido guardar.' } }));
        }
    };

    // Una tarjeta de contacto: antes de abrir el alta se mira si ese número ya
    // tiene ficha — darlo de alta dos veces es justo lo que hay que evitar.
    const darDeAlta = async (k) => {
        setAvisoAlta(null);
        const tel = (k.telefonos || [])[0];
        if (!tel) return;
        try {
            const r = await axios.get('/api/whatsapp/contactos/buscar', { params: { q: tel.slice(-9) } });
            const ya = (r.data?.contactos || []).flatMap(c => c.clientes || []);
            if (ya.length) { setAvisoAlta(`Ese número ya está en la app: ${ya.map(x => x.nombre).join(', ')}.`); return; }
        } catch { /* sin WhatsApp: se deja dar de alta igual, el formulario avisa por DNI */ }
        const d = tel.replace(/\D/g, '');
        const { nombre, apellidos } = partirNombre(k.nombre);
        setAlta({ nombre_razon_social: nombre.toUpperCase(), apellidos: apellidos.toUpperCase(), tlf: d.length === 11 && d.startsWith('34') ? d.slice(2) : d });
    };

    if (estado.cargando) return <p className="text-[11px] text-white/30 py-2">Leyendo el chat…</p>;
    if (estado.error) return <p className="text-[11px] text-amber-300/80 py-2">{estado.error}</p>;
    if (estado.sinChat) return <p className="text-[11px] text-white/30 py-2">No hay conversación con este número.</p>;
    if (!estado.mensajes.length) return <p className="text-[11px] text-white/30 py-2">Sin mensajes en los últimos 60 días.</p>;

    return (
        <div className="space-y-1.5 py-1">
            {estado.mensajes.map(m => {
                const tr = transcripciones[m.id];
                const audio = m.tipo === 'ptt' || m.tipo === 'audio';
                return (
                    <div key={m.id} className={`flex ${m.de_mi ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-snug ${m.de_mi
                            ? 'bg-emerald-500/[0.10] border border-emerald-500/20 text-white/85'
                            : 'bg-white/[0.04] border border-white/[0.08] text-white/80'}`}>
                            {m.tipo !== 'chat' && (
                                <div className="text-[11px] text-white/50 mb-0.5">
                                    {ICONO_TIPO[m.tipo] || m.tipo}{m.nombre_archivo ? ` · ${m.nombre_archivo}` : ''}
                                </div>
                            )}
                            {m.texto && <div className="whitespace-pre-wrap break-words">{m.texto.length > 600 ? `${m.texto.slice(0, 600)}…` : m.texto}</div>}
                            {(m.contactos || []).map((k, i) => (
                                <div key={i} className="mt-1 flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate">{k.nombre || 'Sin nombre'} · {(k.telefonos || []).join(', ')}</span>
                                    <button type="button" onClick={() => darDeAlta(k)}
                                        className="shrink-0 min-h-[28px] px-2 rounded-md border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/10">
                                        Dar de alta
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center justify-end gap-2 mt-1">
                                {m.descargable && !audio && (
                                    <button type="button" onClick={() => abrirAdjunto(m)} className="text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand">Ver</button>
                                )}
                                {audio && m.descargable && !tr?.texto && (
                                    <button type="button" onClick={() => transcribir(m)} disabled={tr?.cargando}
                                        className="text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand disabled:opacity-40">
                                        {tr?.cargando ? 'Transcribiendo…' : 'Transcribir'}
                                    </button>
                                )}
                                <span className="text-[10px] text-white/30">{hora(m.t)}</span>
                            </div>
                            {tr?.texto && (
                                <div className="mt-1.5 pt-1.5 border-t border-white/10">
                                    <div className="italic text-white/75 whitespace-pre-wrap">«{tr.texto}»</div>
                                    <div className="flex justify-end gap-3 mt-1">
                                        <button type="button" onClick={() => navigator.clipboard?.writeText(tr.texto)}
                                            className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Copiar</button>
                                        {idCliente && (
                                            <button type="button" onClick={() => aNotas(m)} disabled={tr.guardado}
                                                className="text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand disabled:text-emerald-300/70">
                                                {tr.guardado ? '✓ En las notas' : 'Guardar en notas'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {tr?.error && <div className="mt-1 text-[11px] text-amber-300/80">{tr.error}</div>}
                        </div>
                    </div>
                );
            })}
            {avisoAlta && <p className="text-[11px] text-amber-300/80">{avisoAlta}</p>}
            <div className="flex justify-between items-center pt-1">
                <button type="button" onClick={() => { setEstado(e => ({ ...e, cargando: true })); cargar(); }}
                    className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white">Actualizar</button>
                {enlaceChat(telefono) && (
                    <a href={enlaceChat(telefono)} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-black uppercase tracking-widest text-emerald-300/80 hover:text-emerald-300">Abrir el chat</a>
                )}
            </div>
            {createPortal(
                <ClienteFormModal isOpen={!!alta} onClose={() => setAlta(null)} initialData={alta || undefined}
                    onSuccess={() => { setAlta(null); setAvisoAlta('Dado de alta.'); }} />,
                document.body,
            )}
        </div>
    );
}

export default UltimosMensajesWhatsapp;
