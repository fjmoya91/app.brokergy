import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { WhatsappConnectModal } from '../../whatsapp/components/WhatsappConnectModal';

// ─── SolicitarFaltantesModal ─────────────────────────────────────────────────
// Checklist INTERACTIVO de todo lo pendiente del expediente (obligatorio incluido
// por defecto, opcional visible y marcable) + mensaje editable por destinatario
// —Cliente / Instalador—, mapeado a su flujo público correcto:
//   · IBAN + justificante + firma de anexos → /firmar-anexos/:id
//   · Certificado RITE → /subir-rite/:id     · CIFO firmado → /subir-cifo/:id
//   · Factura y fotos → /subir-docs?rol=…&need=… (solo los slots reclamados)
// Por ítem se puede: incluir/excluir del mensaje, cambiar de destinatario (fotos/
// factura) y marcar "No necesario" (persiste docs_overrides[slot].waived en BD,
// igual que desde el slot de fotos). El mensaje se regenera al tocar el checklist.
// El envío (WhatsApp/Email) queda registrado en el historial.

const RECIPIENTS = [
    { id: 'CLIENTE', key: 'cliente', label: 'Cliente' },
    { id: 'INSTALADOR', key: 'instalador', label: 'Instalador' },
];

function buildMessage({ nombre, numExp, acciones, obra, target }) {
    const saludo = `Hola${nombre ? ` ${nombre}` : ''} 👋`;
    // Para el instalador (lleva varias obras a la vez) indicamos cliente + dirección.
    const obraLine = (target === 'INSTALADOR' && obra && (obra.cliente || obra.direccion))
        ? `\n\n📍 Obra de *${obra.cliente || '—'}*${obra.direccion ? ` — ${obra.direccion}` : ''}\nExpediente ${numExp || ''}`
        : '';
    if (!acciones || acciones.length === 0) {
        return `${saludo}${obraLine}\n\nDe momento no hay nada pendiente${target === 'INSTALADOR' ? '' : ' por tu parte'} en el expediente ${numExp || ''}.\n\nBROKERGY — Ingeniería Energética`;
    }
    const intro = target === 'INSTALADOR'
        ? `Para avanzar con esta obra necesitamos lo siguiente:`
        : `Para avanzar con tu expediente ${numExp || ''} necesitamos lo siguiente:`;
    const blocks = acciones.map((a, i) => {
        // Si al instalador le relayamos una acción del cliente → tercera persona.
        const relay = target === 'INSTALADOR' && a.owner === 'CLIENTE';
        const titulo = relay ? (a.tituloRelay || a.titulo) : a.titulo;
        const nota = relay ? (a.notaRelay || a.nota) : a.nota;
        const items = (a.items || []).map(it => `   • ${it}`).join('\n');
        const notaStr = nota ? `\n${nota}` : '';
        const linkLine = relay ? `🔗 Enlace para el cliente: ${a.url}` : `👉 ${a.url}`;
        return `${i + 1}) ${titulo}:\n${items}${notaStr}\n${linkLine}`;
    }).join('\n\n');
    return `${saludo}${obraLine}\n\n${intro}\n\n${blocks}\n\nGracias.\nBROKERGY — Ingeniería Energética`;
}

// Compone las ACCIONES del mensaje a partir de los ítems marcados en el checklist
// (espejo del buildSolicitudAcciones del backend, pero dirigido por lo que el
// admin marca: incluir/excluir, destinatario por ítem y "no necesario").
function buildAccionesFromItems(allItems, owner, info) {
    const urls = info?.urls || {};
    const uploadBase = info?.uploadBase || null;
    const mine = (allItems || []).filter(it => it.incluido && !it.waived && it.owner === owner);
    const acciones = [];

    // Datos y firmas de anexos (siempre del CLIENTE). La secuencia "primero datos,
    // luego firma" viene del backend vía defaultIncluido: si el admin marca ambos,
    // se piden ambos (control explícito).
    const datos = mine.filter(it => it.tipo === 'dato');
    const firmas = mine.filter(it => it.tipo === 'firma' && it.flujo === 'firmar-anexos');
    if (datos.length) {
        acciones.push({
            owner: 'CLIENTE',
            titulo: 'Completa los datos que faltan',
            tituloRelay: 'El cliente debe aportar los datos que faltan',
            url: urls.firmarAnexos,
            items: datos.map(i => i.label),
            nota: 'Con estos datos preparamos tus anexos; después te llegará el enlace para firmarlos.',
            notaRelay: 'Con estos datos se preparan los anexos; después le llegará al cliente el enlace para firmarlos.',
        });
    }
    if (firmas.length) {
        acciones.push({
            owner: 'CLIENTE',
            titulo: 'Firma los anexos',
            tituloRelay: 'El cliente debe firmar los anexos',
            url: urls.firmarAnexos,
            items: firmas.map(i => i.label),
            nota: null, notaRelay: null,
        });
    }

    const rite = mine.find(it => it.flujo === 'subir-rite');
    if (rite) acciones.push({ owner, titulo: 'Sube el Certificado RITE', url: urls.subirRite, items: [rite.label], nota: null });

    // Subidas a /subir-docs (fotos + factura), agrupadas por fase de la obra.
    const subir = mine.filter(it => it.flujo === 'subir-docs');
    const antes = subir.filter(it => it.fase !== 'DESPUES');
    const despues = subir.filter(it => it.fase === 'DESPUES');
    const rol = owner === 'INSTALADOR' ? 'instalador' : 'cliente';
    if (antes.length && uploadBase) {
        acciones.push({
            owner,
            titulo: 'Sube las fotos del estado ANTES de la obra',
            tituloRelay: 'Fotos del estado ANTES de la obra',
            url: `${uploadBase}&rol=${rol}&need=${antes.map(i => i.slot || i.key).join(',')}`,
            items: antes.map(i => i.label),
            nota: null, notaRelay: null,
        });
    }
    if (despues.length && uploadBase) {
        const conFactura = despues.some(i => i.key === 'factura');
        const titulo = conFactura ? 'Sube la factura y las fotos de la instalación terminada' : 'Sube las fotos de la instalación terminada';
        acciones.push({
            owner,
            titulo,
            tituloRelay: conFactura ? 'Factura y fotos de la instalación terminada' : 'Fotos de la instalación terminada',
            url: `${uploadBase}&rol=${rol}&need=${despues.map(i => i.slot || i.key).join(',')}`,
            items: despues.map(i => i.label),
            nota: null, notaRelay: null,
        });
    }

    const cifo = mine.find(it => it.flujo === 'subir-cifo');
    if (cifo) acciones.push({ owner, titulo: 'Sube el Certificado CIFO firmado', url: urls.subirCifo, items: [cifo.label], nota: null });

    return acciones;
}

// Orden estable del checklist: primero lo activo (datos → firmas → docs → fotos,
// ANTES antes que DESPUÉS) y al final lo marcado "no necesario".
const TIPO_ORDER = { dato: 0, firma: 1, doc: 2, foto: 3 };
function sortItems(a, b) {
    if (!!a.waived !== !!b.waived) return a.waived ? 1 : -1;
    const t = (TIPO_ORDER[a.tipo] ?? 9) - (TIPO_ORDER[b.tipo] ?? 9);
    if (t !== 0) return t;
    const fa = a.fase === 'DESPUES' ? 1 : 0, fb = b.fase === 'DESPUES' ? 1 : 0;
    return fa - fb;
}

export function SolicitarFaltantesModal({ isOpen, onClose, expedienteId, numeroExpediente }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [active, setActive] = useState('CLIENTE');
    // Checklist interactivo: ítems pendientes con estado local
    // { ...pendiente, incluido: bool, owner: 'CLIENTE'|'INSTALADOR' }.
    const [items, setItems] = useState([]);
    const [messages, setMessages] = useState({ CLIENTE: '', INSTALADOR: '' });
    const [channels, setChannels] = useState({ CLIENTE: [], INSTALADOR: [] });
    // Destinatario editable (tlf/email): por defecto la persona de notificaciones,
    // pero el admin puede dirigirlo a otro número/correo.
    const [dest, setDest] = useState({ CLIENTE: { nombre: '', tlf: '', email: '' }, INSTALADOR: { nombre: '', tlf: '', email: '' } });
    // Contactos del instalador marcados como destinatarios (puede haber varios).
    const [selectedInstIds, setSelectedInstIds] = useState([]);
    const [showWaConnect, setShowWaConnect] = useState(false);
    const [sendPhase, setSendPhase] = useState(null); // null | 'sending' | 'done'
    const [sendOutcome, setSendOutcome] = useState({ ok: false, text: '', sentTo: [] });
    const [result, setResult] = useState({ CLIENTE: null, INSTALADOR: null });
    // "Trato todo con el instalador": al instalador se le piden también las cosas del cliente.
    const [todoAlInstalador, setTodoAlInstalador] = useState(false);

    useEffect(() => {
        if (!isOpen || !expedienteId) return;
        setLoading(true); setError(null); setResult({ CLIENTE: null, INSTALADOR: null }); setTodoAlInstalador(false);
        axios.get(`/api/expedientes/${expedienteId}/solicitud-info`)
            .then(({ data }) => {
                setInfo(data);
                // Checklist interactivo (backend nuevo). Si `pendientes` no viene
                // (backend antiguo), se cae a las acciones precalculadas del server.
                const pend = Array.isArray(data.pendientes) ? data.pendientes : null;
                const its = pend ? pend.map(p => ({ ...p, incluido: !!p.defaultIncluido, owner: p.ownerDefault || 'CLIENTE' })).sort(sortItems) : [];
                setItems(its);
                const accFor = (rid) => pend
                    ? buildAccionesFromItems(its, rid, data)
                    : ((data[RECIPIENTS.find(r => r.id === rid).key] || {}).acciones || []);
                const numExp = data.numero_expediente || numeroExpediente;
                const msgs = {}, chs = {}, dst = {};
                for (const r of RECIPIENTS) {
                    const c = data[r.key] || {};
                    msgs[r.id] = buildMessage({ nombre: c.nombre, numExp, acciones: accFor(r.id), obra: data.obra, target: r.id });
                    chs[r.id] = [c.tlf && 'whatsapp', c.email && 'email'].filter(Boolean);
                    dst[r.id] = { nombre: c.nombre || '', tlf: c.tlf || '', email: c.email || '' };
                }
                setMessages(msgs);
                setChannels(chs);
                setDest(dst);
                // Preseleccionar el contacto del instalador que coincide con el
                // destinatario por defecto (respeta el toggle de notificaciones); el
                // admin puede marcar más contactos manualmente.
                const insContacts = data.instalador?.contactos || [];
                const def = insContacts.find(c => (c.tlf && c.tlf === data.instalador?.tlf) || (c.email && c.email === data.instalador?.email)) || insContacts[0];
                setSelectedInstIds(def ? [def.id] : []);
                // Empezar en el destinatario que tenga pendientes.
                setActive(accFor('CLIENTE').length > 0 ? 'CLIENTE' : (accFor('INSTALADOR').length > 0 ? 'INSTALADOR' : 'CLIENTE'));
            })
            .catch(e => setError(e.response?.data?.error || 'No se pudo cargar la información de contacto.'))
            .finally(() => setLoading(false));
    }, [isOpen, expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const rk = RECIPIENTS.find(r => r.id === active)?.key;
    const c = info?.[rk] || {};
    const dst = dest[active] || { nombre: '', tlf: '', email: '' };
    // Con backend nuevo las acciones salen del checklist interactivo; si no hay
    // `pendientes` (backend antiguo) se usan las precalculadas del server.
    const legacy = !Array.isArray(info?.pendientes);
    const cliAcciones = legacy ? (info?.cliente?.acciones || []) : buildAccionesFromItems(items, 'CLIENTE', info);
    const insAcciones = legacy ? (info?.instalador?.acciones || []) : buildAccionesFromItems(items, 'INSTALADOR', info);
    // Acciones efectivas del destinatario activo (instalador puede englobar las del cliente).
    const acciones = (active === 'INSTALADOR' && todoAlInstalador)
        ? [...cliAcciones, ...insAcciones]
        : (active === 'CLIENTE' ? cliAcciones : insAcciones);
    const tabItems = items.filter(it => it.owner === active);
    const actChannels = channels[active] || [];
    const sinPendientes = !loading && acciones.length === 0;
    const puedeTodoInstalador = cliAcciones.length > 0;

    // ── Handlers del checklist: cualquier cambio regenera ambos mensajes ──
    const applyItems = (next) => {
        setItems(next);
        const numExp = info?.numero_expediente || numeroExpediente;
        const cliAcc = buildAccionesFromItems(next, 'CLIENTE', info);
        const insAcc = buildAccionesFromItems(next, 'INSTALADOR', info);
        setMessages({
            CLIENTE: buildMessage({ nombre: dest.CLIENTE?.nombre, numExp, acciones: cliAcc, obra: info?.obra, target: 'CLIENTE' }),
            INSTALADOR: buildMessage({ nombre: dest.INSTALADOR?.nombre, numExp, acciones: todoAlInstalador ? [...cliAcc, ...insAcc] : insAcc, obra: info?.obra, target: 'INSTALADOR' }),
        });
    };
    const toggleIncluido = (it) => { if (!it.waived) applyItems(items.map(x => x.key === it.key ? { ...x, incluido: !x.incluido } : x)); };
    const switchOwner = (it) => applyItems(items.map(x => x.key === it.key ? { ...x, owner: x.owner === 'CLIENTE' ? 'INSTALADOR' : 'CLIENTE' } : x));
    // "No necesario" PERSISTE en el expediente (docs_overrides[slot].waived), igual
    // que el botón del slot de fotos: deja de contar como pendiente en toda la app.
    const setWaive = async (it, waived) => {
        if (!info?.oportunidad_id) return;
        try {
            await axios.post(`/api/oportunidades/${info.oportunidad_id}/docs/${it.slot || it.key}/waive`, { waived });
            applyItems(items.map(x => x.key === it.key ? { ...x, waived, incluido: waived ? false : !!x.required } : x).sort(sortItems));
        } catch (e) {
            setResult(p => ({ ...p, [active]: { type: 'error', text: e.response?.data?.error || 'No se pudo guardar el cambio de "no necesario".' } }));
        }
    };

    // Destinatarios efectivos del tab activo. Para el INSTALADOR, si tiene contactos
    // configurados, se usan los marcados (varios); para el CLIENTE, el contacto único editable.
    const insContacts = info?.instalador?.contactos || [];
    const useInstChecklist = active === 'INSTALADOR' && insContacts.length > 0;
    const recipientsActive = useInstChecklist
        ? insContacts.filter(c => selectedInstIds.includes(c.id))
        : [{ nombre: dst.nombre, tlf: dst.tlf, email: dst.email }];
    const anyTlf = recipientsActive.some(r => r.tlf);
    const anyEmail = recipientsActive.some(r => r.email);
    const toggleInstContact = (id) => setSelectedInstIds(prev => {
        const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
        const first = insContacts.find(x => x.id === next[0]);
        if (first) setDest(p => ({ ...p, INSTALADOR: { ...p.INSTALADOR, nombre: first.nombre || p.INSTALADOR.nombre } }));
        return next;
    });

    const toggleChannel = (ch) => setChannels(prev => ({
        ...prev,
        [active]: prev[active].includes(ch) ? prev[active].filter(x => x !== ch) : [...prev[active], ch],
    }));

    // Activa/desactiva "pedir todo al instalador" y regenera su mensaje.
    const toggleTodoInstalador = () => {
        setTodoAlInstalador(prev => {
            const next = !prev;
            const numExp = info?.numero_expediente || numeroExpediente;
            const acc = next ? [...cliAcciones, ...insAcciones] : insAcciones;
            setMessages(m => ({ ...m, INSTALADOR: buildMessage({ nombre: dst.nombre, numExp, acciones: acc, obra: info?.obra, target: 'INSTALADOR' }) }));
            return next;
        });
    };

    // Regenera el mensaje del destinatario activo con el nombre/datos actuales
    // (no se hace automáticamente para no pisar ediciones manuales).
    const regenMessage = () => {
        const numExp = info?.numero_expediente || numeroExpediente;
        const acc = active === 'INSTALADOR'
            ? (todoAlInstalador ? [...cliAcciones, ...insAcciones] : insAcciones)
            : cliAcciones;
        setMessages(m => ({ ...m, [active]: buildMessage({ nombre: dest[active]?.nombre, numExp, acciones: acc, obra: info?.obra, target: active }) }));
    };

    // Barrido previo: si se envía por WhatsApp y NO está conectado, abrir la puerta
    // de conexión (pregunta + QR); al conectar, se envía automáticamente.
    const handleSend = async () => {
        const eff = actChannels.filter(ch => ch === 'whatsapp' ? anyTlf : anyEmail);
        if (!recipientsActive.length) { setResult(p => ({ ...p, [active]: { type: 'error', text: 'Selecciona al menos un destinatario.' } })); return; }
        if (!eff.length) { setResult(p => ({ ...p, [active]: { type: 'error', text: 'Indica un teléfono o email y selecciona el canal.' } })); return; }
        if (eff.includes('whatsapp')) {
            try {
                const { data } = await axios.get('/api/whatsapp/status');
                if (data?.state !== 'READY') { setShowWaConnect(true); return; }
            } catch { setShowWaConnect(true); return; }
        }
        doSend();
    };

    const doSend = async () => {
        setShowWaConnect(false);
        const eff = actChannels.filter(ch => ch === 'whatsapp' ? anyTlf : anyEmail);
        if (!recipientsActive.length || !eff.length) return;
        setSendPhase('sending');
        setResult(p => ({ ...p, [active]: null }));
        try {
            const asunto = `Documentación pendiente · Expediente ${info?.numero_expediente || numeroExpediente || ''}`.trim();
            const solicitado = acciones.flatMap(a => a.items || []);
            const sentTo = [];
            for (const r of recipientsActive) {
                const chans = eff.filter(ch => ch === 'whatsapp' ? !!r.tlf : !!r.email);
                if (!chans.length) continue;
                await axios.post(`/api/expedientes/${expedienteId}/solicitar-faltantes`, {
                    target: active,
                    channels: chans,
                    mensaje: messages[active],
                    tlf: r.tlf || null,
                    email: r.email || null,
                    nombre: r.nombre || null,
                    solicitado,
                    asunto,
                });
                sentTo.push(r.nombre || r.tlf || r.email);
            }
            if (!sentTo.length) {
                setSendOutcome({ ok: false, text: 'Ningún destinatario tiene el dato del canal elegido.', sentTo: [] });
            } else {
                setSendOutcome({ ok: true, text: '', sentTo });
            }
        } catch (e) {
            setSendOutcome({ ok: false, text: e.response?.data?.error || 'Error al enviar.', sentTo: [] });
        } finally {
            setSendPhase('done');
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4" onClick={() => { if (!sendPhase) onClose(); }}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Solicitar lo que falta</h3>
                        <p className="text-[10px] text-white/40">Mensaje + enlaces · Expediente <span className="text-brand font-bold">{info?.numero_expediente || numeroExpediente || ''}</span></p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all">
                        <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Selector de destinatario */}
                <div className="px-5 pt-4">
                    <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.03] rounded-xl border border-white/10">
                        {RECIPIENTS.map(r => {
                            const n = !legacy
                                ? items.filter(it => it.owner === r.id && it.incluido && !it.waived).length
                                : (info?.[r.key]?.acciones || []).length;
                            return (
                                <button key={r.id} onClick={() => setActive(r.id)}
                                    className={`py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${active === r.id ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/70'}`}>
                                    {r.label}
                                    {n > 0 && <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${active === r.id ? 'bg-black/20' : 'bg-amber-500/20 text-amber-400'}`}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Cuerpo */}
                <div className="p-5 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-white/40">
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">Cargando…</span>
                        </div>
                    ) : error ? (
                        <div className="px-4 py-3 rounded-xl border border-red-400/20 bg-red-500/[0.06] text-[12px] text-red-400">⚠️ {error}</div>
                    ) : (
                        <>
                            {/* Destinatario (editable) — por defecto la persona de notificaciones */}
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Destinatario</p>
                                <button type="button" onClick={regenMessage}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Regenerar mensaje
                                </button>
                            </div>
                            {useInstChecklist ? (
                                <div className="space-y-2 mb-4">
                                    {insContacts.map(c => {
                                        const on = selectedInstIds.includes(c.id);
                                        return (
                                            <button key={c.id} type="button" onClick={() => toggleInstContact(c.id)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                                    {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white truncate">{c.nombre || 'Contacto'}</span>
                                                        {c.tipo && <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.tipo}</span>}
                                                    </div>
                                                    <div className="text-[11px] text-white/40 truncate">{c.tlf || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    <p className="text-[9px] text-white/25">Puedes marcar varios contactos del instalador.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 mb-4">
                                    <input value={dst.nombre}
                                        onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], nombre: e.target.value } }))}
                                        placeholder="Nombre de a quién te diriges"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input value={dst.tlf}
                                            onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], tlf: e.target.value } }))}
                                            placeholder="Teléfono"
                                            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                        <input value={dst.email}
                                            onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], email: e.target.value } }))}
                                            placeholder="Email"
                                            className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                    </div>
                                    <p className="text-[9px] text-white/25">Cambia el nombre/teléfono para dirigirlo a otra persona y pulsa "Regenerar mensaje".</p>
                                </div>
                            )}

                            {/* Trato todo con el instalador → incluir lo del cliente */}
                            {active === 'INSTALADOR' && puedeTodoInstalador && (
                                <button type="button" onClick={toggleTodoInstalador}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-xl border text-left transition-all ${todoAlInstalador ? 'bg-brand/10 border-brand/30' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${todoAlInstalador ? 'bg-brand border-brand' : 'border-white/20'}`}>
                                        {todoAlInstalador && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${todoAlInstalador ? 'text-brand' : 'text-white/50'}`}>
                                        Pedir también lo del cliente (trato todo con el instalador)
                                    </span>
                                </button>
                            )}

                            {/* Checklist interactivo de pendientes (o resumen fijo con backend antiguo) */}
                            {!legacy ? (
                                tabItems.length === 0 ? (
                                    <div className="px-4 py-3 mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] text-[12px] text-emerald-300">
                                        ✓ No hay nada pendiente por parte {active === 'CLIENTE' ? 'del cliente' : 'del instalador'}.
                                    </div>
                                ) : (
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Qué se pide</p>
                                            <p className="text-[9px] text-white/25">✓ incluir · ⇄ destinatario · 🚫 no necesario</p>
                                        </div>
                                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                            {tabItems.map(it => {
                                                const otherLabel = it.owner === 'CLIENTE' ? 'Instalador' : 'Cliente';
                                                return (
                                                    <div key={it.key} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all ${it.waived ? 'border-white/5 bg-white/[0.01] opacity-60' : it.incluido ? 'border-brand/25 bg-brand/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
                                                        <button type="button" onClick={() => toggleIncluido(it)} disabled={it.waived}
                                                            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${it.waived ? 'border-white/10 cursor-not-allowed' : it.incluido ? 'border-brand bg-brand' : 'border-white/25 hover:border-white/50'}`}>
                                                            {it.incluido && !it.waived && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                        </button>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`text-[11px] font-bold ${it.waived ? 'text-white/35 line-through' : 'text-white/85'}`}>{it.label}</span>
                                                                {it.fase && <span className={`text-[8px] font-black px-1 py-0.5 rounded uppercase tracking-wider shrink-0 ${it.fase === 'DESPUES' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>{it.fase === 'DESPUES' ? 'Después' : 'Antes'}</span>}
                                                                {!it.required && !it.waived && <span className="text-[8px] font-black px-1 py-0.5 rounded uppercase tracking-wider bg-white/5 text-white/35 shrink-0">Opcional</span>}
                                                                {it.waived && <span className="text-[8px] font-black px-1 py-0.5 rounded uppercase tracking-wider bg-white/5 text-white/35 shrink-0">No necesario</span>}
                                                            </div>
                                                            {it.nota && !it.waived && <p className="text-[9px] text-amber-400/60 mt-0.5">{it.nota}</p>}
                                                        </div>
                                                        {it.flujo === 'subir-docs' && !it.waived && (
                                                            <button type="button" onClick={() => switchOwner(it)} title={`Pedírselo al ${otherLabel.toLowerCase()}`}
                                                                className="shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-1 rounded-lg border border-white/10 text-white/35 hover:text-white/70 hover:border-white/25 transition-all">
                                                                ⇄ {otherLabel}
                                                            </button>
                                                        )}
                                                        {it.tipo === 'foto' && (
                                                            <button type="button" onClick={() => setWaive(it, !it.waived)}
                                                                title={it.waived ? 'Volver a requerir esta documentación' : 'Marcar como no necesario (se guarda en el expediente)'}
                                                                className={`shrink-0 text-[10px] px-1.5 py-1 rounded-lg border transition-all ${it.waived ? 'border-emerald-400/25 text-emerald-400/80 hover:bg-emerald-500/10' : 'border-white/10 text-white/30 hover:text-red-400/80 hover:border-red-400/25'}`}>
                                                                {it.waived ? '↺' : '🚫'}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            ) : sinPendientes ? (
                                <div className="px-4 py-3 mb-1 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] text-[12px] text-emerald-300">
                                    ✓ No hay nada pendiente por parte {active === 'CLIENTE' ? 'del cliente' : 'del instalador'}.
                                </div>
                            ) : (
                                <div className="mb-4 space-y-1.5">
                                    {acciones.map((a, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px] text-white/55">
                                            <span className="text-brand font-black shrink-0">{i + 1}.</span>
                                            <span><strong className="text-white/75">{a.titulo}</strong> — {(a.items || []).join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Aviso de datos que completa Brokergy (cliente) */}
                            {active === 'CLIENTE' && (info?.cliente?.adminPendiente?.length > 0) && (
                                <p className="text-[10px] text-amber-400/70 mb-4">⚠️ Pendiente de completar por Brokergy (no se solicita al cliente): {info.cliente.adminPendiente.join(', ')}.</p>
                            )}

                            {/* Canales */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Enviar por</p>
                            <div className="flex gap-2 mb-4">
                                <button type="button" disabled={!anyTlf || sinPendientes} onClick={() => toggleChannel('whatsapp')}
                                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${actChannels.includes('whatsapp') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-white/5 text-white/30 hover:text-white/50'}`}>
                                    💬 WhatsApp
                                </button>
                                <button type="button" disabled={!anyEmail || sinPendientes} onClick={() => toggleChannel('email')}
                                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${actChannels.includes('email') ? 'bg-brand/10 border-brand/30 text-brand' : 'border-white/5 text-white/30 hover:text-white/50'}`}>
                                    ✉️ Email
                                </button>
                            </div>

                            {/* Mensaje editable */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Mensaje (editable)</p>
                            <textarea
                                value={messages[active]}
                                onChange={e => setMessages(prev => ({ ...prev, [active]: e.target.value }))}
                                rows={13}
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white/90 leading-relaxed focus:outline-none focus:border-brand/40 resize-y font-mono no-uppercase"
                            />

                            {result[active] && result[active].type === 'error' && (
                                <div className="mt-4 px-4 py-2.5 rounded-xl text-[12px] font-bold border bg-red-500/10 border-red-500/30 text-red-400">
                                    ⚠️ {result[active].text}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!loading && !error && (
                    <div className="p-5 border-t border-white/10 flex items-center justify-between gap-3">
                        <button onClick={() => navigator.clipboard?.writeText(messages[active])}
                            className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all">
                            Copiar mensaje
                        </button>
                        <button onClick={handleSend} disabled={sendPhase === 'sending' || !actChannels.length || sinPendientes}
                            className="flex-1 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {`Enviar a ${RECIPIENTS.find(r => r.id === active)?.label}`}
                        </button>
                    </div>
                )}
            </div>

                {/* ── Puerta de conexión de WhatsApp (conectar → autoenvío) ── */}
                <WhatsappConnectModal
                    isOpen={showWaConnect}
                    onClose={() => setShowWaConnect(false)}
                    onConnected={doSend}
                    actionLabel="Al conectar, la solicitud se enviará automáticamente."
                />

                {/* ── Overlay estándar de envío / resultado ── */}
                <SendActionOverlay
                    phase={sendPhase}
                    ok={sendOutcome.ok}
                    subtitle={`${info?.numero_expediente || numeroExpediente || ''} · ${active === 'CLIENTE' ? 'Cliente' : 'Instalador'}`}
                    items={sendOutcome.sentTo}
                    errorText={sendOutcome.text}
                    onClose={() => setSendPhase(null)}
                />
        </div>
    );
}

export default SolicitarFaltantesModal;
