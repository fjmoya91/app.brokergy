import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { fireSuccessConfetti } from '../../expedientes/utils/successConfetti';
import { postEmail } from '../../../utils/emailFallback';
import { CanalChip, CanalMiniChip, avisoCanales } from '../../../components/CanalChip';
// Fichas para CORREGIR los datos de contacto sin salir del envío. Son las mismas
// que se abren desde Clientes / Red de Prescriptores: aquí no hay un formulario
// paralelo que pueda guardar cosas distintas.
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';
import { PrescriptorDetailModal } from '../../admin/views/PrescriptorDetailModal';
// A QUIÉN dentro del partner. La MISMA fila y el MISMO reparto que los popups
// del expediente: es lo último que se mira antes de pulsar, y no puede estar
// escrito de dos formas distintas según por dónde se envíe.
import { ContactoPickRow, NotaVariosDestinatarios } from '../../expedientes/components/ContactoPickRow';
import { priorizarPorRol, avisoReparto } from '../../expedientes/utils/docContacts';

// ─────────────────────────────────────────────────────────────────────────────
// Envío unificado de la PROPUESTA al cliente — homogéneo con EnviarAnexosModal /
// Notificar-Validar certificador:
//   1. Elegir destinatario(s): Cliente / Distribuidor / Instalador / Otro.
//   2. Previsualizar/editar el mensaje (se usa como cuerpo del email y caption de WhatsApp).
//   3. Elegir canal: Email, WhatsApp o ambos.
//   4. Overlay de envío con estado por canal + confeti de papeles al terminar.
// Reutiliza los endpoints existentes: /api/pdf/generate, /api/pdf/send-proposal,
// /api/whatsapp/send-media. El PDF es el mismo para todos (se genera una vez).
// ─────────────────────────────────────────────────────────────────────────────

const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;
const MODE_ORDER = ['CLIENTE', 'PARTNER', 'INSTALADOR', 'OTRO'];
// La propuesta es asunto COMERCIAL: dentro de un partner la recibe quien lleva la
// obra con el cliente, no quien firma los certificados (regla del reparto).
const ROL_PROPUESTA = 'comercial';


// ── Nota adicional: se inserta en el cuerpo tras el "resumen de ayudas".
//    Cada línea se envuelve en *...* por separado: WhatsApp (y el email, que
//    convierte *texto* → <b>) NO aplican negrita a través de saltos de línea,
//    así que un único par de asteriscos alrededor de un bloque multipárrafo
//    saldría literal. Idempotente: stripNote quita la nota previa (bloque de
//    líneas en negrita que arranca en "*Nota adicional:") antes de recomponer.
const isBoldLine = (l) => /^\*.*\*$/.test(l.trim());
const stripNote = (msg) => {
    const lines = (msg || '').split('\n');
    const start = lines.findIndex(l => /^\*Nota adicional:/.test(l.trim()));
    if (start < 0) return (msg || '').replace(/\s+$/, '');
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l === '' || isBoldLine(l)) end = i; else break;
    }
    lines.splice(start, end - start + 1);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
};
const composeNote = (base, note) => {
    const clean = stripNote(base);
    const t = (note || '').trim();
    if (!t) return clean;
    // Negrita línea a línea (cada párrafo no vacío). El "label" va pegado a la
    // primera línea con contenido; las líneas en blanco se conservan.
    let labeled = false;
    const block = t.split('\n').map(line => {
        const l = line.trim().replace(/^\*+|\*+$/g, '').trim();
        if (!l) return '';
        if (!labeled) { labeled = true; return `*Nota adicional: ${l}*`; }
        return `*${l}*`;
    }).join('\n');
    const lines = clean.split('\n');
    const resumenIdx = lines.findIndex(l => /Resumen total de las ayudas/i.test(l));
    if (resumenIdx >= 0) { lines.splice(resumenIdx + 1, 0, '', block); return lines.join('\n'); }
    const anchorIdx = lines.findIndex(l => /^(Quedo a|En caso de conformidad|Para avanzar|Siguientes pasos)/i.test(l.trim()));
    if (anchorIdx >= 0) { lines.splice(anchorIdx, 0, block, ''); return lines.join('\n'); }
    return `${clean}\n\n${block}`;
};

export function EnviarPropuestaModal({
    isOpen, onClose,
    numexpte,
    candidates = [],            // [{ mode, label, sublabel, email, phone }]
    buildDefaultMessage,        // (mode, name) => string
    getPdfHtml,                 // () => html (para el PDF de WhatsApp)
    getEmailHtml,               // () => html (para el PDF del email)
    buildSummaryData,           // (mode, name) => summaryData (plantilla email)
    expedienteId,               // id_oportunidad (para marcar ENVIADA)
    versionInfo,                // { versiones[], siguiente, vigente } — lo carga el padre
    onVersionRegistrada,        // (entrada) => void — refresca la marca del documento
    proposalResult,             // result de la calculadora (importes que se sellan por versión)
    proposalInputs,             // inputs (inversión)
    onSent,                     // (results) => void  (opcional)
    ceeComparisonAvailable = false, // el cliente aportó CEE → ofrecer la variante comparativa
    includeCee = false,             // controlado por el padre (ProposalModal): toggle comparativa CEE
    onIncludeCeeChange,             // (bool) => void — sincroniza el toggle con el PDF
    onContactoActualizado,          // () => void — el padre relee los contactos tras editarlos
}) {
    const [selectedModes, setSelectedModes] = useState([]);
    // Qué PERSONAS de cada empresa van marcadas: { PARTNER: ['c0','c1'], … }.
    // Mientras un modo no tenga entrada propia manda su `defaultIds` (el que le
    // toca por rol), así que abrir el popup y no tocar nada envía a quien
    // corresponde sin haber tenido que decidir nada.
    const [personasSel, setPersonasSel] = useState({});
    // Por dónde le llega a CADA UNO. Al comercial se le manda por WhatsApp, que
    // es donde lee, y a administración por email: sin esto había que enviar dos
    // veces —una con cada canal— y en la segunda vuelta el otro lo recibía
    // repetido. Mientras un destinatario no tenga entrada propia, recibe por
    // todos los canales para los que tenga dato.
    const [canalPorDest, setCanalPorDest] = useState({});
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [channels, setChannels] = useState({ email: true, whatsapp: true });
    // Un canal apagado puede serlo por DOS motivos muy distintos: porque el
    // usuario lo ha apagado, o porque el destinatario de turno no tenía con qué
    // (el cliente por defecto suele venir sin teléfono ni email). Solo el primero
    // debe sobrevivir a un cambio de destinatario; el segundo tiene que volver a
    // encenderse solo cuando el nuevo contacto sí tiene el dato. Sin esto había
    // que bajar a marcar el canal a mano y ENVIAR parecia roto.
    const channelTouched = useRef({ email: false, whatsapp: false });
    const [message, setMessage] = useState('');
    const [extraNote, setExtraNote] = useState('');
    const [noteInMessage, setNoteInMessage] = useState(true);
    const [waReady, setWaReady] = useState(null);
    const [status, setStatus] = useState(null);
    const [sendPhase, setSendPhase] = useState(null);   // null | 'sending' | 'done'
    const [sendResults, setSendResults] = useState([]);
    const [busy, setBusy] = useState(false);
    // Ficha abierta encima del envío para corregir un contacto.
    //   · cliente     → { tipo:'cliente', id }        (ClienteDetailModal carga por id)
    //   · prescriptor → { tipo:'prescriptor', ficha } (PrescriptorDetailModal NO carga
    //     por id: hace `setP(prescriptor)` con lo que le pases, así que hay que
    //     traerle la ficha ENTERA o abriría un formulario vacío y guardaría nulos
    //     encima de los datos buenos).
    const [editando, setEditando] = useState(null);
    const [abriendoFicha, setAbriendoFicha] = useState(null);   // mode en curso

    const abrirFicha = async (cand) => {
        const ent = cand.entidad;
        if (!ent || abriendoFicha) return;
        if (ent.tipo === 'cliente') { setEditando({ tipo: 'cliente', id: ent.id }); return; }
        setAbriendoFicha(cand.mode);
        try {
            const { data } = await axios.get(`/api/prescriptores/${ent.id}`);
            setEditando({ tipo: 'prescriptor', ficha: data });
        } catch {
            setStatus({ ok: false, text: 'No se pudo abrir la ficha del contacto.' });
        } finally {
            setAbriendoFicha(null);
        }
    };
    const userEditedRef = useRef(false);

    const hasOtro = true; // siempre permitimos un contacto manual

    // Los ids de las personas marcadas de una empresa (o los que le tocan).
    const idsDe = (mode, estado = personasSel) => {
        const cand = candidates.find(c => c.mode === mode);
        if (!cand?.personas?.length) return [];
        return estado[mode] ?? (cand.defaultIds?.length ? cand.defaultIds : [cand.personas[0].id]);
    };

    // Un modo puede dar VARIOS destinatarios: el cliente es una persona, pero un
    // partner son las personas de su ficha que se hayan marcado.
    const resolveContacts = (mode, estado = personasSel) => {
        if (mode === 'OTRO') {
            return [{ mode: 'OTRO', label: (manualContact.name || '').trim() || 'Otro contacto', sublabel: 'Manual', email: (manualContact.email || '').trim(), phone: (manualContact.phone || '').trim() }];
        }
        const cand = candidates.find(c => c.mode === mode);
        if (!cand) return [{ mode, label: mode, email: '', phone: '' }];
        if (!cand.personas?.length) return [cand];
        const ids = idsDe(mode, estado);
        return cand.personas.filter(p => ids.includes(p.id)).map(p => ({
            mode, personaId: p.id,
            label: p.label,
            // `saludo`: cómo se le llama en el mensaje. Al canal general de una
            // sociedad no se le saluda por el nombre de nadie.
            saludo: p.saludo || (p.general ? '' : p.label),
            sublabel: p.sublabel, org: cand.org || cand.label,
            email: p.email || '', phone: p.phone || '',
            roles: p.roles || [], general: !!p.general,
            entidad: cand.entidad || null,
        }));
    };
    // Compatibilidad con lo que solo necesita uno (el mensaje por defecto).
    const resolveContact = (mode) => resolveContacts(mode)[0] || { mode, label: mode, email: '', phone: '' };
    const saludoDe = (c) => (c?.saludo !== undefined ? c.saludo : c?.label) || '';

    // ── Canal POR destinatario ───────────────────────────────────────────────
    // La clave no puede ser el nombre ni el email (se repiten y se editan): es el
    // modo + la persona dentro de él, que es lo que identifica la fila.
    const claveDest = (c) => `${c.mode}:${c.personaId || ''}`;
    const puedeCanal = (c, canal) => canal === 'email' ? !!c.email : phoneValid(c.phone);
    const canalDe = (c, estado = canalPorDest) => {
        const g = estado[claveDest(c)];
        return {
            email: puedeCanal(c, 'email') && (g ? g.email !== false : true),
            whatsapp: puedeCanal(c, 'whatsapp') && (g ? g.whatsapp !== false : true),
        };
    };
    const toggleCanalDest = (c, canal) => {
        if (!puedeCanal(c, canal)) return;
        const k = claveDest(c);
        const actual = canalDe(c);
        setCanalPorDest(prev => ({
            ...prev,
            [k]: { email: canal === 'email' ? !actual.email : actual.email, whatsapp: canal === 'whatsapp' ? !actual.whatsapp : actual.whatsapp },
        }));
    };

    // Destinatario principal (para el mensaje por defecto): el de mayor prioridad seleccionado.
    const primaryMode = MODE_ORDER.find(m => selectedModes.includes(m)) || (candidates[0]?.mode || 'CLIENTE');

    // Quién encabeza un grupo: el del ROL. Es quien va en el "Para" del correo,
    // así que es a quien tiene que saludar el mensaje — marcar al compañero "para
    // que se entere" no puede cambiar el saludo.
    const principalDe = (mode, estado = personasSel) =>
        priorizarPorRol(resolveContacts(mode, estado), ROL_PROPUESTA)[0] || null;

    const applyDefaultMessage = (modes, ceeFlag = includeCee, estado = personasSel) => {
        if (userEditedRef.current) return;
        const pm = MODE_ORDER.find(m => modes.includes(m)) || (candidates[0]?.mode || 'CLIENTE');
        const c = principalDe(pm, estado);
        let base = buildDefaultMessage ? buildDefaultMessage(pm, saludoDe(c), { cee: ceeFlag }) : '';
        if (noteInMessage && extraNote.trim()) base = composeNote(base, extraNote);
        setMessage(base);
    };

    // Toggle "Incluir comparativa CEE": sincroniza con el PDF (padre) y regenera el mensaje.
    const toggleIncludeCee = () => {
        const next = !includeCee;
        if (onIncludeCeeChange) onIncludeCeeChange(next);
        const pm = MODE_ORDER.find(m => selectedModes.includes(m)) || (candidates[0]?.mode || 'CLIENTE');
        const c = principalDe(pm);
        let base = buildDefaultMessage ? buildDefaultMessage(pm, saludoDe(c), { cee: next }) : '';
        if (noteInMessage && extraNote.trim()) base = composeNote(base, extraNote);
        userEditedRef.current = false;
        setMessage(base);
    };

    // Nota adicional: refleja en la previsualización (mensaje del destinatario
    // principal) y mantiene el bloque sincronizado al teclear / togglear.
    const handleNoteChange = (val) => {
        setExtraNote(val);
        if (noteInMessage) setMessage(prev => composeNote(prev, val));
    };
    const toggleNoteInMessage = () => {
        setNoteInMessage(prev => {
            const next = !prev;
            setMessage(m => next ? composeNote(m, extraNote) : stripNote(m));
            return next;
        });
    };

    // Inicialización al abrir
    useEffect(() => {
        if (!isOpen) return;
        const start = candidates.some(c => c.mode === 'CLIENTE') ? ['CLIENTE'] : (candidates[0] ? [candidates[0].mode] : []);
        userEditedRef.current = false;
        setSelectedModes(start);
        setPersonasSel({});
        setCanalPorDest({});
        setManualContact({ name: '', phone: '', email: '' });
        setExtraNote('');
        setNoteInMessage(true);
        const sel = start.flatMap(m => resolveContacts(m, {}));
        channelTouched.current = { email: false, whatsapp: false };
        setChannels({ email: sel.some(c => c.email), whatsapp: sel.some(c => phoneValid(c.phone)) });
        const pm = MODE_ORDER.find(m => start.includes(m)) || (candidates[0]?.mode || 'CLIENTE');
        const pc = principalDe(pm, {});
        // includeCee lo controla el padre (ProposalModal); usamos su valor para el mensaje inicial.
        const initCee = !!ceeComparisonAvailable && !!includeCee;
        setMessage(buildDefaultMessage ? buildDefaultMessage(pm, saludoDe(pc), { cee: initCee }) : '');
        setStatus(null);
        setSendPhase(null);
        setSendResults([]);
        setBusy(false);
        setWaReady(null);
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Editar la ficha desde aquí puede añadir o quitar personas, y los ids son
    // posicionales: los que ya no existan se descartan, o la empresa se quedaría
    // marcada sin nadie detrás y sin que se vea por qué.
    useEffect(() => {
        if (!isOpen) return;
        setPersonasSel(prev => {
            let cambia = false;
            const next = {};
            for (const [mode, ids] of Object.entries(prev)) {
                const cand = candidates.find(c => c.mode === mode);
                const vivos = (ids || []).filter(id => cand?.personas?.some(p => p.id === id));
                if (vivos.length !== (ids || []).length) cambia = true;
                if (vivos.length) next[mode] = vivos;
            }
            return cambia ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidates]);

    // El estado de WhatsApp se consultaba UNA sola vez, al abrir. La sesión del
    // servidor se cae y vuelve sola (cada deploy la reinicia y tarda ~5 min en
    // reconectar), así que el canal se quedaba muerto hasta cerrar y reabrir el
    // modal — con WhatsApp ya disponible. Se reintenta SOLO mientras conste
    // caído, y se para en cuanto vuelve: no es un polling permanente.
    useEffect(() => {
        if (!isOpen || waReady !== false) return;
        const t = setInterval(() => {
            axios.get('/api/whatsapp/status')
                .then(r => { if (r.data?.ready) setWaReady(true); })
                .catch(() => { });
        }, 10000);
        return () => clearInterval(t);
    }, [isOpen, waReady]);

    if (!isOpen) return null;

    // Los grupos son la unidad de envío: un modo = una empresa (o el cliente), y
    // dentro pueden ir varias personas — el correo sale UNA vez con copia real.
    const grupos = selectedModes.map(m => resolveContacts(m)).filter(l => l.length);
    const selectedContacts = grupos.flat();
    const contactPhoneValid = selectedContacts.some(c => phoneValid(c.phone));
    const canEmail = selectedContacts.some(c => c.email);
    // El chip de la barra es el interruptor MAESTRO; los de cada fila dicen a
    // quién le llega por ahí. Lo que se cuenta es lo que va a salir de verdad —
    // "2 con email" cuando a uno le has quitado el correo es un recuento falso.
    const nEmail = selectedContacts.filter(c => canalDe(c).email).length;
    const nPhone = selectedContacts.filter(c => canalDe(c).whatsapp).length;
    const willEmail = channels.email && nEmail > 0;
    const willWhatsapp = channels.whatsapp && nPhone > 0 && waReady !== false;
    const avisoPie = avisoCanales({
        nDest: selectedContacts.length, canEmail, hayTelefono: contactPhoneValid,
        waReady, willEmail, willWhatsapp,
    });

    // Un canal se ofrece si ALGUIEN de la selección tiene con qué. Se recalcula
    // igual se cambie de empresa o de persona dentro de ella: sin esto, marcar al
    // compañero que sí tiene móvil dejaba WhatsApp apagado y ENVIAR parecía roto.
    const ajustarCanales = (modes, estado) => {
        const sel = modes.flatMap(m => resolveContacts(m, estado));
        const hayEmail = sel.some(c => c.email);
        const hayTlf = sel.some(c => phoneValid(c.phone));
        setChannels(ch => ({
            email: hayEmail ? (channelTouched.current.email ? ch.email : true) : false,
            whatsapp: hayTlf ? (channelTouched.current.whatsapp ? ch.whatsapp : true) : false,
        }));
    };

    const toggleMode = (mode) => {
        const next = selectedModes.includes(mode) ? selectedModes.filter(x => x !== mode) : [...selectedModes, mode];
        // Al volver a marcar una empresa de la que se habían desmarcado todas sus
        // personas, vuelve la que le toca: un modo marcado sin nadie detrás es un
        // destinatario que no existe.
        let estado = personasSel;
        if (next.includes(mode) && !idsDe(mode).length) {
            const cand = candidates.find(c => c.mode === mode);
            if (cand?.personas?.length) {
                estado = { ...personasSel };
                delete estado[mode];
                setPersonasSel(estado);
            }
        }
        setSelectedModes(next);
        applyDefaultMessage(next, includeCee, estado);
        ajustarCanales(next, estado);
    };

    // Marcar/desmarcar una PERSONA dentro de una empresa. Quedarse sin ninguna
    // desmarca la empresa entera, y marcar una vuelve a marcarla.
    const togglePersona = (mode, id) => {
        const actuales = idsDe(mode);
        const ids = actuales.includes(id) ? actuales.filter(x => x !== id) : [...actuales, id];
        const estado = { ...personasSel, [mode]: ids };
        setPersonasSel(estado);
        const modes = ids.length
            ? (selectedModes.includes(mode) ? selectedModes : [...selectedModes, mode])
            : selectedModes.filter(m => m !== mode);
        setSelectedModes(modes);
        applyDefaultMessage(modes, includeCee, estado);
        ajustarCanales(modes, estado);
    };
    const toggleChannel = (ch) => {
        channelTouched.current[ch] = true;
        setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));
    };

    const exitAndClose = () => { setSendPhase(null); if (onClose) onClose(); };

    // Los dos canales de UNA fila. Solo se pintan en un destinatario MARCADO: en
    // uno que no lo está no deciden nada y convertirían la lista en un panel de
    // interruptores donde lo primero que hay que contestar es a quién se le manda.
    const ChipsCanal = ({ c }) => {
        const ca = canalDe(c);
        const tlf = puedeCanal(c, 'whatsapp');
        return (
            <div className="flex items-center gap-1.5 shrink-0">
                <CanalMiniChip canal="email" activo={ca.email} disponible={puedeCanal(c, 'email')}
                    motivo="sin email" bloqueado={busy} onClick={() => toggleCanalDest(c, 'email')} />
                <CanalMiniChip canal="whatsapp" activo={ca.whatsapp} disponible={tlf && waReady !== false}
                    motivo={!tlf ? 'sin teléfono' : 'WhatsApp no conectado'} bloqueado={busy}
                    onClick={() => toggleCanalDest(c, 'whatsapp')} />
            </div>
        );
    };

    // Quien está marcado y no recibe por ningún canal. No se le desmarca solo —la
    // marca la puso una persona— pero callarlo sería enviar creyendo que le llega.
    const sinCanal = selectedContacts.filter(c => {
        const ca = canalDe(c);
        return !(ca.email && channels.email) && !(ca.whatsapp && channels.whatsapp && waReady !== false);
    });

    // ── Orquestador de envío ─────────────────────────────────────────────────
    const handleSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!selectedContacts.length) { setStatus({ ok: false, text: 'Selecciona al menos un destinatario.' }); return; }
        if (!doEmail && !doWa) { setStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }

        setStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        setBusy(true);

        // ── El PDF se genera UNA vez y se ARCHIVA antes de salir ────────────
        // Se registra la versión primero para que lo que queda guardado sea
        // byte a byte lo que recibe el cliente. Antes cada canal rasterizaba su
        // propio HTML (el del email lleva otro envoltorio), así que el adjunto
        // del correo y el de WhatsApp ni siquiera eran el mismo documento.
        let pdfBase64 = null, pdfGenError = null, versionOut = null;
        const baseFileName = (expedienteId || numexpte || 'Propuesta').toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
        let filename = `Propuesta_Brokergy_${baseFileName}.pdf`;
        try {
            if (expedienteId) {
                const reg = await axios.post(`/api/oportunidades/${expedienteId}/propuesta/version`, {
                    html: getPdfHtml(),
                    destinatarios: selectedContacts.map(c => ({ modo: c.mode, label: c.label, email: c.email, telefono: c.phone })),
                    canales: [doEmail && 'email', doWa && 'whatsapp'].filter(Boolean),
                    versionImpresa: versionInfo?.siguiente || 1,
                    result: proposalResult || null,
                    inputs: proposalInputs || null,
                }, { timeout: 120000 });
                versionOut = reg.data || null;
                pdfBase64 = versionOut?.pdfBase64 || null;
                if (versionOut?.fileName) filename = versionOut.fileName;
            } else {
                // Simulación sin guardar: no hay oportunidad que versionar, pero
                // el PDF sigue haciendo falta para poder enviarlo.
                const gen = await axios.post('/api/pdf/generate', { html: getPdfHtml() }, { timeout: 90000 });
                pdfBase64 = gen.data?.pdf || null;
            }
            if (!pdfBase64) throw new Error('No se pudo generar el PDF de la propuesta');
        } catch (err) {
            pdfBase64 = null;
            pdfGenError = err.response?.data?.message || err.response?.data?.error || err.message;
        }
        const waPdf = pdfBase64, waGenError = pdfGenError;

        const emailHtml = doEmail ? getEmailHtml() : null;
        const out = [];
        let clienteOk = false;

        // Sin PDF no sale nada. Mandar una propuesta que no queda archivada es
        // justo el agujero que este flujo cierra: mismo criterio que el CIFO,
        // donde un fallo al guardar el borrador aborta el envío.
        if (!pdfBase64) {
            setSendResults([]);
            setStatus({ ok: false, text: `No se pudo preparar el PDF de la propuesta: ${pdfGenError || 'error desconocido'}. No se ha enviado nada.` });
            setSendPhase('done');
            setBusy(false);
            return;
        }

        // Mensaje POR destinatario: el que encabeza el modo principal usa el texto
        // editado en la caja; el resto regenera el suyo (el cliente recibe el de
        // cliente, el partner el de partner, y cada persona su propio saludo). La
        // nota adicional se inserta en todos si está marcada.
        const principalPrimary = principalDe(primaryMode);
        const messageFor = (c) => {
            const esElDeLaCaja = c.mode === primaryMode
                && (!c.personaId || c.personaId === principalPrimary?.personaId);
            const base = esElDeLaCaja
                ? stripNote(message)
                : (buildDefaultMessage ? buildDefaultMessage(c.mode, saludoDe(c)) : stripNote(message));
            return noteInMessage ? composeNote(base, extraNote) : base;
        };

        for (const grupo of grupos) {
            const mode = grupo[0].mode;
            // ── EMAIL: UNO por empresa, con copia real ──────────────────────
            // Dos personas de la misma empresa reciben el mismo correo, no dos
            // correos idénticos: así quien tiene que contestar ve que su
            // compañero está en el hilo y no se responde por duplicado.
            const conEmail = priorizarPorRol(grupo, ROL_PROPUESTA).filter(c => canalDe(c).email);
            if (doEmail && conEmail.length) {
                const principal = conEmail[0];
                const copia = conEmail.slice(1).map(c => c.email);
                const msg = messageFor(principal);
                const nombre = saludoDe(principal) || principal.label;
                try {
                    await postEmail('/api/pdf/send-proposal', {
                        // `html` sigue yendo: alimenta la vista web pública y el
                        // paso a ENVIADA. El ADJUNTO, en cambio, es el PDF ya
                        // archivado — el mismo que va por WhatsApp.
                        html: emailHtml,
                        pdfBase64,
                        to: principal.email,
                        cc: copia.length ? copia : undefined,
                        userName: nombre,
                        summaryData: {
                            ...(buildSummaryData ? buildSummaryData(mode, nombre) : { id: numexpte }),
                            version: versionOut?.version || null,
                        },
                        customMessage: msg,
                    }, undefined, { timeout: 90000 });   // 3º arg = showConfirm; el config va en el 4º
                    out.push({
                        channel: 'email', status: 'ok',
                        text: `${principal.label} → ${principal.email}${copia.length ? ` (+${copia.length} en copia)` : ''}`,
                    });
                    if (mode === 'CLIENTE') clienteOk = true;
                } catch (err) {
                    out.push({ channel: 'email', status: 'fail', text: `${principal.label}: ${err.response?.data?.message || err.response?.data?.error || err.message}` });
                }
            }
            // ── WHATSAPP: no tiene copia, así que va uno a cada persona ─────
            for (const c of grupo) {
                if (!doWa || !canalDe(c).whatsapp) continue;
                if (!waPdf) {
                    out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${waGenError || 'No se pudo generar el PDF'}` });
                    continue;
                }
                try {
                    await axios.post('/api/whatsapp/send-media', {
                        phone: String(c.phone).replace(/[^0-9]/g, ''),
                        caption: messageFor(c),
                        media: { base64: waPdf, filename, mimetype: 'application/pdf' },
                        asDocument: true,
                    });
                    out.push({ channel: 'whatsapp', status: 'ok', text: `${c.label} → ${c.phone}` });
                    if (mode === 'CLIENTE') clienteOk = true;
                } catch (err) {
                    out.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ${err.response?.data?.error || err.message}` });
                }
            }
        }

        const anyOk = out.some(r => r.status === 'ok');

        // Sellar en la versión a quién llegó de verdad y por dónde. Hasta aquí
        // no se sabía: el registro se crea ANTES de enviar (para archivar el PDF
        // exacto) y algún canal puede fallar. También deja la línea legible en
        // el historial, que antes solo decía "ENVIADA" sin destinatario ni canal.
        if (versionOut?.version && expedienteId) {
            try {
                await axios.patch(`/api/oportunidades/${expedienteId}/propuesta/version/${versionOut.version}`, {
                    envios: out,
                    cambios: versionOut.cambios || '',
                });
            } catch (e) { /* no romper el envío por el sellado */ }
            if (onVersionRegistrada) {
                onVersionRegistrada({ v: versionOut.version, fecha: new Date().toISOString(), drive_link: versionOut.driveLink || null, envios: out });
            }
        }

        // Marcar la oportunidad como ENVIADA si la propuesta llegó al cliente.
        if (clienteOk && expedienteId) {
            try { await axios.patch(`/api/oportunidades/${expedienteId}/estado`, { nuevo_estado: 'ENVIADA' }); } catch (e) { /* no romper */ }
        }

        // Guardar la nota adicional en el historial del expediente (siempre que
        // exista, vaya o no en el mensaje). Se registra como comentario.
        if (extraNote.trim() && expedienteId) {
            try { await axios.post(`/api/oportunidades/${expedienteId}/comentarios`, { comentario: `📝 Nota de la propuesta: ${extraNote.trim()}` }); } catch (e) { /* no romper */ }
        }

        setSendResults(out);
        setStatus({ ok: anyOk, text: out.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        setBusy(false);
        if (anyOk) { fireSuccessConfetti(); if (onSent) onSent(out); }
    };

    const sending = busy && sendPhase === 'sending';

    // ── Aviso de reenvío ────────────────────────────────────────────────────
    // Se dice a QUIÉN y CUÁNDO se envió la última, no solo "ya se envió": el
    // dato que hace falta antes de escribir el mensaje es si la persona que
    // tienes delante es la misma que ya la recibió.
    const avisoVersion = (() => {
        const v = versionInfo?.vigente;
        if (!v?.v) return null;
        const fecha = v.fecha ? new Date(v.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
        const quien = [...new Set((v.destinatarios || []).map(d => d.label).filter(Boolean))].join(', ');
        return `La versión ${v.v} se envió${fecha ? ` el ${fecha}` : ''}${quien ? ` a ${quien}` : ''}.`;
    })();

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg md:max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar propuesta</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{numexpte || 'Propuesta'}</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                    {/* Aviso de REENVÍO — antes de pulsar, no después. Saber que
                        el cliente ya tiene una propuesta encima de la mesa cambia
                        lo que se le escribe en el mensaje. */}
                    {avisoVersion && (
                        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-amber-300/90">Esto es un reenvío</p>
                            <p className="text-[12px] text-white/70 mt-1 leading-relaxed">{avisoVersion}</p>
                            <p className="text-[11px] text-white/45 mt-1.5">
                                Saldrá como <strong className="text-white/70">versión {versionInfo?.siguiente}</strong>, marcada en el propio documento y archivada en Drive.
                            </p>
                        </div>
                    )}

                    {/* Destinatarios */}
                    <div>
                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatarios</label>
                        <p className="text-[9px] text-white/25 px-1 mb-2">Puedes marcar varios.</p>
                        <div className="space-y-2">
                            {candidates.map(c => {
                                const on = selectedModes.includes(c.mode);
                                // Con VARIAS personas en la ficha, la tarjeta es la EMPRESA y
                                // debajo se elige a quién. Con una sola (o ninguna), la tarjeta
                                // ES esa persona: una lista de un elemento solo añade un clic.
                                const elegidos = on ? resolveContacts(c.mode) : [];
                                const varias = (c.personas?.length || 0) > 1;
                                const cab = varias ? null : (resolveContacts(c.mode)[0] || c);
                                const sinDatos = cab ? (!cab.phone && !cab.email) : false;
                                // Si lo único marcado es el canal general de la empresa, se
                                // DICE: un desvío silencioso al teléfono de la centralita es
                                // justo lo que el reparto por rol viene a evitar.
                                const soloGeneral = elegidos.length === 1 && elegidos[0].general;
                                const aviso = soloGeneral ? avisoReparto(c.ficha, ROL_PROPUESTA, elegidos[0]) : null;
                                return (
                                    // La fila NO puede ser un solo <button>: dentro va otro
                                    // (editar la ficha) y un botón no puede anidar botones.
                                    <div key={c.mode}
                                        className={`w-full rounded-xl border transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                        <div className="flex items-center gap-3 p-3">
                                            <button type="button" onClick={() => toggleMode(c.mode)}
                                                className="flex items-center gap-3 min-w-0 flex-1 text-left">
                                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                                    {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white truncate">{varias ? (c.org || c.label) : cab.label}</span>
                                                        <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.sublabel}</span>
                                                    </div>
                                                    {varias ? (
                                                        // Quién recibe, sin desplegar nada: es la pregunta
                                                        // que contesta la tarjeta.
                                                        <div className={`text-[11px] truncate ${on && !elegidos.length ? 'text-amber-400/80' : 'text-white/40'}`}>
                                                            {on
                                                                ? (elegidos.length ? `A ${elegidos.map(p => p.label).join(', ')}` : 'Nadie marcado — elige abajo a quién')
                                                                : `${c.personas.length} personas · marca para elegir`}
                                                        </div>
                                                    ) : (<>
                                                        {/* La empresa, cuando el destinatario es una persona dentro de ella */}
                                                        {cab.org && cab.org !== cab.label && (
                                                            <div className="text-[11px] text-white/50 truncate">{cab.org}</div>
                                                        )}
                                                        <div className={`text-[11px] truncate ${sinDatos ? 'text-amber-400/80' : 'text-white/40'}`}>
                                                            {cab.phone || 'sin teléfono'}{cab.email ? ` · ${cab.email}` : (cab.phone ? '' : ' · sin email')}
                                                        </div>
                                                    </>)}
                                                </div>
                                            </button>
                                            {/* Por dónde le llega A ÉL. Con varias personas los chips van en
                                                cada una, que es donde se decide. */}
                                            {on && !varias && cab && <ChipsCanal c={cab} />}
                                            {/* Corregir sus datos sin salir del envío. Sin ficha guardada
                                                (una simulación sin cliente) no hay nada que abrir: para eso
                                                está "Otro contacto…". */}
                                            {c.entidad && (
                                                <button type="button" onClick={() => abrirFicha(c)} disabled={!!abriendoFicha}
                                                    title={`Editar los datos de ${c.org || c.label}`}
                                                    className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${sinDatos
                                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                                        : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}>
                                                    {abriendoFicha === c.mode ? '…' : (sinDatos ? 'Añadir datos' : 'Editar')}
                                                </button>
                                            )}
                                        </div>
                                        {/* A QUIÉN de la empresa. Solo con el modo marcado: la lista
                                            entera de personas de todos los partners a la vez sería un
                                            muro, y lo que se decide primero es si se le manda o no. */}
                                        {varias && on && (
                                            <div className="px-3 pb-3 pt-0 space-y-1.5">
                                                {c.personas.map(p => {
                                                    const marcado = elegidos.find(x => x.personaId === p.id);
                                                    return (
                                                        // La fila es un <button>, así que los chips van FUERA de
                                                        // ella (un botón no puede anidar botones), no dentro del
                                                        // componente compartido con los popups del expediente.
                                                        <div key={p.id} className="flex items-center gap-2">
                                                            <ContactoPickRow contacto={p} rol={ROL_PROPUESTA} className="flex-1 min-w-0"
                                                                on={!!marcado} onClick={() => togglePersona(c.mode, p.id)} />
                                                            {marcado && <ChipsCanal c={marcado} />}
                                                        </div>
                                                    );
                                                })}
                                                {/* La nota dice lo que va a pasar, así que cuenta los canales
                                                    de CADA UNO: a quien le hayas quitado el correo no puede
                                                    aparecer "en copia". Se le pasa la lista con el email
                                                    vaciado en vez de tocar el componente compartido. */}
                                                <NotaVariosDestinatarios rol={ROL_PROPUESTA}
                                                    seleccionados={elegidos.map(x => ({ ...x, email: canalDe(x).email ? x.email : '' }))}
                                                    email={channels.email && elegidos.some(x => canalDe(x).email)}
                                                    whatsapp={willWhatsapp && elegidos.filter(x => canalDe(x).whatsapp).length > 1} />
                                                {aviso && <p className="text-[10px] text-amber-400/70 leading-relaxed">{aviso}</p>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {hasOtro && (
                                <div className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${selectedModes.includes('OTRO') ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                    <button type="button" onClick={() => toggleMode('OTRO')}
                                        className="flex items-center gap-3 min-w-0 flex-1 text-left">
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedModes.includes('OTRO') ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                            {selectedModes.includes('OTRO') && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </span>
                                        <span className="text-sm font-bold text-white">Otro contacto…</span>
                                    </button>
                                    {selectedModes.includes('OTRO') && <ChipsCanal c={resolveContact('OTRO')} />}
                                </div>
                            )}
                            {selectedModes.includes('OTRO') && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
                                    <input value={manualContact.name} onChange={e => setManualContact(m => ({ ...m, name: e.target.value }))} placeholder="Nombre" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input value={manualContact.phone} onChange={e => setManualContact(m => ({ ...m, phone: e.target.value }))} placeholder="Teléfono" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                    <input type="email" value={manualContact.email} onChange={e => setManualContact(m => ({ ...m, email: e.target.value }))} placeholder="Email" className="w-full min-w-0 no-uppercase bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                </div>
                            )}
                        </div>
                        {/* Marcado y sin canal = no recibe nada. No se le desmarca solo,
                            pero tampoco puede pasar inadvertido al pulsar ENVIAR. */}
                        {!!sinCanal.length && (
                            <p className="mt-2 text-[10px] text-amber-400/80 leading-relaxed">
                                ⚠ {sinCanal.map(c => c.label).join(', ')} {sinCanal.length === 1 ? 'no recibirá' : 'no recibirán'} la propuesta: sin canal marcado.
                            </p>
                        )}
                        <p className="mt-1.5 text-[9px] text-white/25">
                            Los dos botones de cada destinatario eligen si le llega por email, por WhatsApp o por los dos.
                        </p>
                    </div>

                    {/* Toggle: comparativa CEE aportado (solo si el cliente aportó CEE) */}
                    {ceeComparisonAvailable && (
                        <button type="button" onClick={toggleIncludeCee}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${includeCee ? 'bg-amber-500/10 border-amber-500/30' : 'bg-bkg-elevated border-white/5 hover:border-white/15'}`}>
                            <span className="flex items-center gap-2 text-left">
                                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m4 10V11m4 6V4M4 21h16" /></svg>
                                <span className="text-[11px] font-bold text-white/80">Incluir comparativa CEE <span className="text-white/35 font-normal">— con tu CEE vs. CEE nuevo BROKERGY</span></span>
                            </span>
                            <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest shrink-0 ${includeCee ? 'text-brand' : 'text-white/30'}`}>
                                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${includeCee ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {includeCee && <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                {includeCee ? 'Incluida' : 'Añadir'}
                            </span>
                        </button>
                    )}

                    {/* Mensaje (previsualización editable) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Mensaje (email / WhatsApp)</label>
                            {userEditedRef.current && (
                                <button type="button" onClick={() => { userEditedRef.current = false; applyDefaultMessage(selectedModes); }}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors">↻ Restablecer</button>
                            )}
                        </div>
                        <textarea
                            value={message}
                            onChange={e => { userEditedRef.current = true; setMessage(e.target.value); }}
                            rows={10}
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                        <p className="mt-1.5 text-[9px] text-white/25">Se usa como cuerpo del email y como mensaje de WhatsApp. Edítalo libremente.</p>
                    </div>

                    {/* Nota adicional */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Nota adicional</label>
                            <button type="button" onClick={toggleNoteInMessage}
                                className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${noteInMessage ? 'text-brand' : 'text-white/30 hover:text-white/60'}`}>
                                <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${noteInMessage ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                    {noteInMessage && <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </span>
                                Añadir al mensaje
                            </button>
                        </div>
                        <textarea
                            value={extraNote}
                            onChange={e => handleNoteChange(e.target.value)}
                            rows={3}
                            placeholder="Ej: En la parte que indica comercio, debemos justificar con fotos y vídeos que realmente es una vivienda."
                            className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                        />
                        <p className="mt-1.5 text-[9px] text-white/25">
                            {noteInMessage
                                ? 'Se inserta en el mensaje tras el resumen de ayudas y se guarda en las notas del expediente.'
                                : 'Solo se guarda en las notas del expediente (no se envía en el mensaje).'}
                        </p>
                    </div>

                    {status && !sendPhase && (
                        <p className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.ok ? '✅' : '❌'} {status.text}</p>
                    )}
                </div>

                {/* Footer — los canales viven AQUÍ, pegados a ENVIAR: es la última
                    decisión y la única que habilita el botón. */}
                <div className="px-5 py-3.5 bg-white/[0.02] border-t border-white/[0.07] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <CanalChip
                            canal="email" nombre="Email"
                            activo={willEmail} disponible={canEmail}
                            detalle={nEmail === 1 ? 'a 1 destinatario' : `a ${nEmail} destinatarios`} motivo="sin email"
                            onClick={() => toggleChannel('email')}
                        />
                        <CanalChip
                            canal="whatsapp" nombre="WhatsApp"
                            activo={willWhatsapp} disponible={contactPhoneValid && waReady !== false}
                            detalle={nPhone === 1 ? 'a 1 destinatario' : `a ${nPhone} destinatarios`}
                            motivo={!contactPhoneValid ? 'sin teléfono' : 'no conectado'}
                            onClick={() => toggleChannel('whatsapp')}
                        />
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                        {/* Con canal, el recuento; sin canal, POR QUÉ no se puede
                            enviar: un botón apagado sin explicación se lee como
                            una avería (ver avisoCanales). */}
                        <span className={`text-[9px] font-bold uppercase tracking-widest whitespace-nowrap ${(!willEmail && !willWhatsapp) ? 'text-amber-400/80' : 'text-white/25'}`}>
                            {avisoPie || `${selectedContacts.length} dest.`}
                        </span>
                        <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Cerrar</button>
                        <button onClick={handleSend} disabled={busy || !selectedContacts.length || (!willEmail && !willWhatsapp)}
                            title={avisoPie || 'Enviar'}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {sending
                                ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                            {sending ? 'Enviando…' : 'Enviar'}
                        </button>
                    </div>
                </div>

                {/* ── OVERLAY DE ENVÍO: enviando → enviado, estado por canal ── */}
                {sendPhase && (() => {
                    const anyOk = sendResults.some(r => r.status === 'ok');
                    const hasFail = sendResults.some(r => r.status === 'fail');
                    const allGood = anyOk && !hasFail;
                    const done = sendPhase === 'done';
                    const tone = !done ? 'brand' : (allGood ? 'emerald' : (anyOk ? 'amber' : 'red'));
                    const glow = { brand: 'bg-brand/20', emerald: 'bg-emerald-500/25', amber: 'bg-amber-500/20', red: 'bg-red-500/20' }[tone];
                    const chMeta = {
                        email: { name: 'Email', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                        whatsapp: { name: 'WhatsApp', path: 'M12 2a10 10 0 00-8.94 14.46L2 22l5.7-1.5A10 10 0 1012 2z' },
                    };
                    const statusMeta = {
                        ok: { color: 'emerald', label: 'Enviado', icon: 'M5 13l4 4L19 7' },
                        fail: { color: 'red', label: 'Error', icon: 'M6 18L18 6M6 6l12 12' },
                    };
                    return (
                        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
                            <div className="relative w-full max-w-md bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                                <div className={`absolute -top-28 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none ${glow}`} />
                                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                                    {!done ? (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
                                                <span className="absolute inset-4 rounded-full bg-brand/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                                                <div className="relative w-16 h-16 rounded-full bg-brand/15 border border-brand/40 flex items-center justify-center">
                                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ animation: 'float 1.8s ease-in-out infinite' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando propuesta…</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
                                            <div className="mt-6 w-full space-y-2">
                                                {willEmail && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-brand shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando email…</span>
                                                    </div>
                                                )}
                                                {willWhatsapp && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando WhatsApp…</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-6 text-[10px] text-white/25 uppercase tracking-widest font-bold">No cierres esta ventana</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className={`absolute inset-0 rounded-full animate-ping ${tone === 'emerald' ? 'bg-emerald-500/20' : tone === 'amber' ? 'bg-amber-500/20' : 'bg-red-500/20'}`} />
                                                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center border-2 ${tone === 'emerald' ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400' : tone === 'amber' ? 'bg-amber-500/15 border-amber-400/50 text-amber-400' : 'bg-red-500/15 border-red-400/50 text-red-400'}`}>
                                                    <svg className="w-10 h-10 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={anyOk ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Propuesta enviada!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
                                            <div className="mt-6 w-full space-y-2">
                                                {sendResults.map((r, i) => {
                                                    const cm = chMeta[r.channel]; const sm = statusMeta[r.status] || statusMeta.fail;
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${sm.color === 'emerald' ? 'bg-emerald-500/[0.06] border-emerald-400/25' : 'bg-red-500/[0.06] border-red-400/25'}`}>
                                                            <svg className="w-5 h-5 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={cm.path} /></svg>
                                                            <div className="min-w-0 flex-1 text-left">
                                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">{cm.name}</div>
                                                                <div className="text-[10px] text-white/45 truncate">{r.text}</div>
                                                            </div>
                                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider shrink-0 ${sm.color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={sm.icon} /></svg>
                                                                {sm.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-7 w-full flex flex-col gap-2">
                                                <button onClick={exitAndClose} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">Cerrar</button>
                                                <button onClick={() => setSendPhase(null)} className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Seguir aquí</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* ── FICHA DEL CONTACTO, ENCIMA DEL ENVÍO ──────────────────────────
                El popup de envío va a z-[9999] y las fichas a z-[300]: sin este
                envoltorio quedarían DEBAJO y no se verían. Un `relative z-…` crea
                contexto de apilamiento y sube todo lo que lleva dentro; no lleva
                transform, así que el `position: fixed` de la ficha se sigue
                anclando al viewport (el problema de SendActionOverlay).

                El envío NO se cierra: al cerrar la ficha se releen los contactos
                (`onContactoActualizado`) y el canal se enciende solo si ya hay
                email o teléfono — sin rehacer el mensaje que estuvieras editando. */}
            {editando && (
                <div className="relative z-[10000]">
                    {editando.tipo === 'cliente' ? (
                        <ClienteDetailModal
                            isOpen
                            clienteId={editando.id}
                            onClose={() => { setEditando(null); onContactoActualizado?.(); }}
                            onUpdated={() => onContactoActualizado?.()}
                        />
                    ) : (
                        <PrescriptorDetailModal
                            isOpen
                            prescriptor={editando.ficha}
                            onClose={() => { setEditando(null); onContactoActualizado?.(); }}
                            onUpdated={() => onContactoActualizado?.()}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

export default EnviarPropuestaModal;
