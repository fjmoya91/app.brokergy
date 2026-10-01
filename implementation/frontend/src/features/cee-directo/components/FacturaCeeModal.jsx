import { useState, useEffect, useMemo, useRef } from 'react';
import { VistaPreviaA4 } from './VistaPreviaA4';
import axios from 'axios';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { CanalChip } from '../../../components/CanalChip';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { useModal } from '../../../context/ModalContext';
import {
    buildFacturaCeeHtml, totalesFactura, mensajeFactura, fmtEur,
    hoyIso, sumarDias, isoAEs,
} from '../logic/facturaCee';

// ─────────────────────────────────────────────────────────────────────────────
// FACTURA de un CEE directo.
//
// Tres momentos en el mismo popup:
//   1 · PREPARAR — a quién, líneas del catálogo de la hoja, fechas, con vista
//       previa del PDF (el número que se ve es el que TOCARÍA ahora: se reserva
//       al emitir, no antes).
//   2 · EMITIR   — el backend toma el siguiente número del libro de facturas de
//       la hoja de AppSheet, escribe su fila y genera el PDF.
//   3 · ENVIAR   — el PDF por email y/o WhatsApp, con el mensaje a la vista.
// El envío se prepara YA en el paso 1 (a quién, por dónde y el texto): así el
// botón es «Emitir y enviar» y la factura sale al cliente en el mismo gesto.
// El nº de la factura no existe hasta emitir: el mensaje enseña el que TOCARÍA
// y, si al emitir sale otro, se sustituye antes de enviar.
// Con facturas ya emitidas se abre en la lista: verlas, reenviarlas o rehacer
// un PDF que no llegó a generarse (mismo número).
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';
const lbl = 'block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2';
const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40';

const CAMPOS_DESTINO = [
    ['razon_social', 'Nombre o razón social', 'col-span-2'],
    ['cif', 'NIF / CIF', ''],
    ['tlf', 'Teléfono', ''],
    ['direccion', 'Dirección', 'col-span-2'],
    ['cp', 'C.P.', ''],
    ['municipio', 'Municipio', ''],
    ['provincia', 'Provincia', ''],
    ['email', 'Email', 'col-span-2'],
];

export function FacturaCeeModal({ isOpen, onClose, expedienteId, onCambio }) {
    const { showConfirm } = useModal();
    const [datos, setDatos] = useState(null);
    const [cargaError, setCargaError] = useState(null);
    const [vista, setVista] = useState('preparar');      // preparar | emitida
    const [actual, setActual] = useState(null);          // factura emitida en pantalla

    const [destino, setDestino] = useState('cliente');
    const [cliente, setCliente] = useState({});
    const [editCliente, setEditCliente] = useState(false);
    const [lineas, setLineas] = useState([]);
    const [fecha, setFecha] = useState(hoyIso());
    const [venc, setVenc] = useState(sumarDias(hoyIso(), 30));
    const [vencTocado, setVencTocado] = useState(false);
    const [obs, setObs] = useState('');
    const [preview, setPreview] = useState(false);

    const [email, setEmail] = useState('');
    const [tlf, setTlf] = useState('');
    const [usaEmail, setUsaEmail] = useState(true);
    const [usaWa, setUsaWa] = useState(true);
    const [waReady, setWaReady] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [mensajeTocado, setMensajeTocado] = useState(false);
    const [verMensaje, setVerMensaje] = useState(false);
    const [nuevaFecha, setNuevaFecha] = useState(null);   // { numero, fecha } mientras se cambia la fecha de una emitida

    const [fase, setFase] = useState(null);
    const [res, setRes] = useState({ ok: false, items: [], text: '', titulo: '' });
    const emitiendo = useRef(false);

    const cargar = async () => {
        setCargaError(null);
        try {
            const { data } = await axios.get(`${API}/${expedienteId}/factura`, { timeout: 60000 });
            setDatos(data);
            const d = data.destinoDefecto || 'cliente';
            setDestino(d);
            setCliente(data.destinatarios?.[d] || {});
            setLineas(data.lineas || []);
            setObs(data.observaciones || '');
            const ult = data.emitidas?.[data.emitidas.length - 1];
            if (ult) { setActual(ult); setVista('emitida'); prepararEnvio(data, ult); }
            else { setVista('preparar'); prepararEnvioDestino(data, d); }
            return data;
        } catch (err) {
            setCargaError(err.response?.data?.error || 'No se pudo preparar la factura');
            return null;
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setDatos(null); setFecha(hoyIso()); setVenc(sumarDias(hoyIso(), 30)); setVencTocado(false);
        setEditCliente(false); setMensajeTocado(false); setVerMensaje(true); setFase(null);
        cargar();
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, expedienteId]);

    const prepararEnvio = (d, fac) => {
        const k = d?.contactos?.[fac.destino] || d?.contactos?.cliente || {};
        setEmail(k.email || fac.cliente?.email || '');
        setTlf(k.tlf || fac.cliente?.tlf || '');
        setUsaEmail(!!(k.email || fac.cliente?.email));
        setUsaWa(!!(k.tlf || fac.cliente?.tlf));
        setMensajeTocado(false);
    };

    // Antes de emitir: a quién se le mandaría según a quién se factura.
    const prepararEnvioDestino = (d, dest) => {
        const k = d?.contactos?.[dest] || {};
        const c = d?.destinatarios?.[dest] || {};
        const em = k.email || c.email || '';
        const tl = k.tlf || c.tlf || '';
        setEmail(em); setTlf(tl);
        setUsaEmail(!!em); setUsaWa(!!tl);
    };

    const elegirDestino = (d) => {
        setDestino(d);
        setCliente(datos?.destinatarios?.[d] || {});
        setEditCliente(false);
        prepararEnvioDestino(datos, d);
    };

    const totales = useMemo(() => totalesFactura(lineas), [lineas]);
    const articulos = datos?.articulos || [];

    const setLinea = (i, patch) => setLineas(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    const elegirArticulo = (i, id) => {
        const a = articulos.find(x => String(x.id) === String(id));
        if (!a) return;
        setLinea(i, { articulo_id: a.id, descripcion: a.nombre, precio: a.importe, ivaPct: Math.round(a.iva * 10000) / 100 });
    };

    const payloadPdf = (numero) => ({
        numero, fecha: isoAEs(fecha), vencimiento: isoAEs(venc),
        cliente, lineas, expediente: datos?.expediente?.numero, observaciones: obs,
    });

    const faltaNif = !String(cliente.cif || '').trim();
    const faltaNombre = !String(cliente.razon_social || '').trim();
    const motivo = faltaNombre ? 'Falta a quién se factura'
        : faltaNif ? 'Falta el NIF/CIF'
        : !(totales.total > 0) ? 'La factura no tiene importe'
        : lineas.some(l => !String(l.descripcion || '').trim()) ? 'Hay una línea sin concepto'
        : datos?.errorHoja ? 'No se puede leer el libro de facturas'
        : null;

    // El mensaje que saldría al emitir (con el nº que tocaría ahora).
    const contactoDestino = datos?.contactos?.[destino] || {};
    const mensajeDe = (numero) => mensajeFactura({
        nombre: contactoDestino.nombre || cliente.razon_social, numero, total: totales.total,
        expediente: datos?.expediente?.numero, esEmpresa: contactoDestino.esEmpresa ?? !!cliente.esEmpresa, lineas,
    });
    const numeroPrevisto = datos?.proximoNumero || '';
    const canEmailPrev = usaEmail && /\S+@\S+\.\S+/.test(email);
    const canWaPrev = usaWa && waReady && tlf.replace(/\D/g, '').length >= 9;
    const enviarAlEmitir = vista === 'preparar' && (canEmailPrev || canWaPrev);

    const emitir = async () => {
        if (emitiendo.current || motivo) return;
        const hay = datos?.emitidas || [];
        const canalesEnvio = enviarAlEmitir ? [...(canEmailPrev ? ['email'] : []), ...(canWaPrev ? ['whatsapp'] : [])] : [];
        const aQuien = [canWaPrev ? `WhatsApp (${tlf.trim()})` : null, canEmailPrev ? `email (${email.trim()})` : null].filter(Boolean).join(' y ');
        const texto = `Se emite con el siguiente número del libro de facturas${datos?.proximoNumero ? ` (ahora mismo, ${datos.proximoNumero})` : ''} por ${fmtEur(totales.total)} a ${cliente.razon_social}.`
            + (canalesEnvio.length ? `\n\nEn cuanto se emita, se envía con el mensaje por ${aQuien}.` : '\n\nNo se envía a nadie: no hay ningún canal marcado.')
            + '\n\nUn número de factura emitido no se puede borrar: si hay un error, se corrige con una factura rectificativa.'
            + (hay.length ? `\n\n⚠️ Este expediente ya tiene la factura ${hay.map(f => f.numero).join(', ')}.` : '');
        const conEnvio = canalesEnvio.length > 0;
        if (!(await showConfirm(texto, conEnvio ? 'Emitir y enviar la factura' : 'Emitir la factura', 'warning', { confirmar: conEnvio ? 'Emitir y enviar' : 'Emitir' }))) return;
        // Se congela AHORA lo revisado: el mensaje y a quién va.
        const mensajeRevisado = mensajeTocado ? mensaje : null;
        const emailEnvio = email.trim(), tlfEnvio = tlf.trim();
        const titulo = conEnvio ? 'emitirEnviar' : 'emitir';

        emitiendo.current = true;
        setRes({ ok: false, items: [], text: '', titulo });
        setFase('sending');
        try {
            const { data } = await axios.post(`${API}/${expedienteId}/factura`, {
                destino, cliente, lineas, fecha, vencimiento: venc, observaciones: obs, otraMas: hay.length > 0,
            }, { timeout: 180000 });
            const items = [
                { texto: `Factura ${data.numero} · ${fmtEur(data.total)} anotada en la hoja de facturas`, tono: 'ok' },
                data.pdf ? { texto: `PDF guardado: ${data.pdf.nombre}`, tono: 'ok' }
                    : { texto: `El PDF no se pudo generar (${data.errorPdf}). La factura está emitida: rehazlo desde aquí.`, tono: 'aviso' },
                ...(data.clienteCreadoEnHoja ? [{ texto: 'Cliente dado de alta en la hoja (no estaba)', tono: 'ok' }] : []),
            ];
            let enviadoOk = true;
            if (conEnvio) {
                if (!data.pdf) {
                    enviadoOk = false;
                    items.push({ texto: 'No se ha enviado: sin PDF no hay nada que adjuntar. Genera el PDF y envíala desde aquí.', tono: 'aviso' });
                } else {
                    // Si el nº que enseñaba el mensaje no es el que ha salido, se corrige.
                    const final = mensajeRevisado == null ? mensajeDe(data.numero)
                        : (numeroPrevisto && numeroPrevisto !== data.numero ? mensajeRevisado.split(numeroPrevisto).join(data.numero) : mensajeRevisado);
                    try {
                        const { data: env } = await axios.post(`${API}/${expedienteId}/factura/${encodeURIComponent(data.numero)}/enviar`, {
                            canales: canalesEnvio, email: emailEnvio, tlf: tlfEnvio, mensaje: final,
                        }, { timeout: 180000 });
                        for (const [k, r] of Object.entries(env.resultados || {})) {
                            const canal = k === 'email' ? 'Email' : 'WhatsApp';
                            items.push({ texto: r.ok ? `${canal} → ${r.to}` : `${canal}: ${r.error}`, tono: r.ok ? 'ok' : 'aviso' });
                        }
                        enviadoOk = (env.canalesOk?.length || 0) > 0;
                        if (!enviadoOk) items.push({ texto: 'La factura está emitida pero no ha salido por ningún canal: reenvíala desde aquí.', tono: 'aviso' });
                    } catch (e) {
                        enviadoOk = false;
                        items.push({ texto: `La factura está emitida pero no se pudo enviar (${e.response?.data?.error || e.message}). Reenvíala desde aquí.`, tono: 'aviso' });
                    }
                }
            }
            setRes({ ok: true, items, text: '', titulo: conEnvio && !enviadoOk ? 'emitirSinEnviar' : titulo });
            setFase('done');
            const d = await cargar();
            const fac = d?.emitidas?.find(f => f.numero === data.numero);
            if (fac) { setActual(fac); setVista('emitida'); prepararEnvio(d, fac); }
            onCambio?.();
        } catch (err) {
            setRes({ ok: false, items: [], text: err.response?.data?.error || err.message, titulo });
            setFase('done');
        } finally {
            emitiendo.current = false;
        }
    };

    const verPdf = async (fac) => {
        try {
            const r = await axios.get(`${API}/${expedienteId}/factura/${encodeURIComponent(fac.numero)}/pdf`, { responseType: 'blob', timeout: 120000 });
            window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
        } catch {
            setRes({ ok: false, items: [], text: 'No se pudo abrir el PDF', titulo: 'pdf' }); setFase('done');
        }
    };

    const rehacerPdf = async (fac) => {
        setRes({ ok: false, items: [], text: '', titulo: 'pdf' }); setFase('sending');
        try {
            await axios.post(`${API}/${expedienteId}/factura/${encodeURIComponent(fac.numero)}/pdf`, {}, { timeout: 180000 });
            setRes({ ok: true, items: [{ texto: `PDF de ${fac.numero} generado`, tono: 'ok' }], text: '', titulo: 'pdf' }); setFase('done');
            const d = await cargar();
            const f = d?.emitidas?.find(x => x.numero === fac.numero); if (f) setActual(f);
        } catch (err) {
            setRes({ ok: false, items: [], text: err.response?.data?.error || err.message, titulo: 'pdf' }); setFase('done');
        }
    };

    // Cambiar la fecha de una factura YA emitida: mismo número, la hoja se
    // corrige, el PDF se rehace y el viejo se retira. Lo enviado lleva la fecha
    // anterior, así que se recuerda reenviarla.
    const cambiarFecha = async () => {
        if (!nuevaFecha?.fecha) return;
        const { numero, fecha: f } = nuevaFecha;
        setRes({ ok: false, items: [], text: '', titulo: 'fecha' }); setFase('sending');
        try {
            const { data } = await axios.post(`${API}/${expedienteId}/factura/${encodeURIComponent(numero)}/fecha`, { fecha: f }, { timeout: 180000 });
            const items = [
                { texto: `Fecha de ${numero}: ${isoAEs(data.fecha)} · vence el ${isoAEs(data.vencimiento)}`, tono: 'ok' },
                data.pdf
                    ? { texto: 'PDF rehecho con la nueva fecha; el anterior se ha retirado', tono: 'ok' }
                    : { texto: `El PDF no se pudo rehacer (${data.errorPdf}). Genéralo desde aquí.`, tono: 'aviso' },
                ...(data.avisos || []).map(t => ({ texto: t, tono: 'aviso' })),
                ...(data.yaEnviada ? [{ texto: 'El cliente tiene la factura con la fecha anterior: reenvíasela.', tono: 'aviso' }] : []),
            ];
            setRes({ ok: true, items, text: '', titulo: 'fecha' }); setFase('done');
            setNuevaFecha(null);
            const d = await cargar();
            const fac = d?.emitidas?.find(x => x.numero === numero);
            if (fac) { setActual(fac); setVista('emitida'); prepararEnvio(d, fac); }
            onCambio?.();
        } catch (err) {
            setRes({ ok: false, items: [], text: err.response?.data?.error || err.message, titulo: 'fecha' }); setFase('done');
        }
    };

    const contacto = actual ? (datos?.contactos?.[actual.destino] || {}) : {};
    const mensajeAuto = actual ? mensajeFactura({
        nombre: contacto.nombre || actual.cliente?.razon_social, numero: actual.numero, total: actual.total,
        expediente: datos?.expediente?.numero, esEmpresa: contacto.esEmpresa, lineas: actual.lineas || [],
    }) : '';

    const canEmail = usaEmail && /\S+@\S+\.\S+/.test(email);
    const canWa = usaWa && waReady && tlf.replace(/\D/g, '').length >= 9;

    const enviar = async () => {
        if (!actual || !(canEmail || canWa)) return;
        setRes({ ok: false, items: [], text: '', titulo: 'enviar' }); setFase('sending');
        try {
            const { data } = await axios.post(`${API}/${expedienteId}/factura/${encodeURIComponent(actual.numero)}/enviar`, {
                canales: [...(canEmail ? ['email'] : []), ...(canWa ? ['whatsapp'] : [])],
                email: email.trim(), tlf: tlf.trim(), mensaje: mensajeTocado ? mensaje : null,
            }, { timeout: 180000 });
            const items = Object.entries(data.resultados || {}).map(([k, r]) => ({
                texto: r.ok ? `${k === 'email' ? 'Email' : 'WhatsApp'} → ${r.to}` : `${k === 'email' ? 'Email' : 'WhatsApp'}: ${r.error}`,
                tono: r.ok ? 'ok' : 'aviso',
            }));
            setRes({ ok: data.canalesOk?.length > 0, items, text: data.canalesOk?.length ? '' : 'No salió por ningún canal', titulo: 'enviar' });
            setFase('done');
            const d = await cargar();
            const f = d?.emitidas?.find(x => x.numero === actual.numero); if (f) setActual(f);
            onCambio?.();
        } catch (err) {
            setRes({ ok: false, items: [], text: err.response?.data?.error || err.message, titulo: 'enviar' }); setFase('done');
        }
    };

    if (!isOpen) return null;

    const mensajeVisible = mensajeTocado ? mensaje : (vista === 'preparar' ? mensajeDe(numeroPrevisto) : mensajeAuto);

    const titulos = {
        emitir: ['Emitiendo la factura…', '¡Factura emitida!', 'No se pudo emitir'],
        emitirEnviar: ['Emitiendo y enviando la factura…', '¡Factura emitida y enviada!', 'No se pudo emitir'],
        emitirSinEnviar: ['Emitiendo y enviando la factura…', 'Factura emitida · sin enviar', 'No se pudo emitir'],
        enviar: ['Enviando la factura…', '¡Factura enviada!', 'No se pudo enviar'],
        pdf: ['Generando el PDF…', 'PDF listo', 'No se pudo generar el PDF'],
        fecha: ['Cambiando la fecha y rehaciendo el PDF…', 'Fecha cambiada', 'No se pudo cambiar la fecha'],
    }[res.titulo || 'emitir'];

    return (
        <>
            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6">
                <div className="bg-bkg-surface border border-white/10 w-full md:max-w-3xl md:rounded-2xl rounded-t-3xl max-h-[92dvh] flex flex-col">

                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">
                                {vista === 'emitida' && actual ? `Factura ${actual.numero}` : 'Nueva factura'}
                                {datos?.expediente?.numero && <span className="text-white/30 font-mono normal-case tracking-normal"> · {datos.expediente.numero}</span>}
                            </h2>
                            <p className="text-[11px] text-white/35 mt-0.5">
                                {vista === 'emitida'
                                    ? 'Emitida en el libro de facturas (hoja de AppSheet). Desde aquí se ve y se envía.'
                                    : 'Se numera con la serie del libro de facturas de la hoja de AppSheet, la misma que usa la otra app.'}
                            </p>
                        </div>
                        <button onClick={onClose} aria-label="Cerrar" className="shrink-0 w-11 h-11 -mr-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
                    </div>

                    {!datos ? (
                        <div className="px-5 py-12 text-center text-[11px] text-white/40">
                            {cargaError
                                ? <><div className="text-red-300 mb-3">{cargaError}</div><button onClick={cargar} className="underline">Reintentar</button></>
                                : 'Leyendo el libro de facturas…'}
                        </div>
                    ) : (
                        <div className="overflow-y-auto px-5 py-5 space-y-6">

                            {/* ── Emitidas ───────────────────────── */}
                            {datos.emitidas?.length > 0 && (
                                <section>
                                    <label className={lbl}>Facturas de este expediente</label>
                                    <div className="space-y-1.5">
                                        {datos.emitidas.map(f => (
                                            <div key={f.numero}
                                                className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border ${actual?.numero === f.numero && vista === 'emitida' ? 'border-brand/40 bg-brand/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
                                                <button onClick={() => { setActual(f); setVista('emitida'); prepararEnvio(datos, f); }} className="min-h-[36px] font-mono text-brand text-sm font-bold">{f.numero}</button>
                                                <span className="text-[11px] text-white/50">{isoAEs(f.fecha)} · {fmtEur(f.total)} · {f.cliente?.razon_social}</span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${f.estado === 'PAGADA' ? 'text-emerald-400 border-emerald-500/25' : 'text-amber-400 border-amber-500/25'}`}>{f.estado === 'PAGADA' ? 'Pagada' : 'Pendiente de pago'}</span>
                                                {f.envios?.length > 0 && <span className="text-[10px] text-white/30">enviada {f.envios.length}×</span>}
                                                <div className="ml-auto flex gap-1.5">
                                                    <button onClick={() => setNuevaFecha(nuevaFecha?.numero === f.numero ? null : { numero: f.numero, fecha: f.fecha })}
                                                        title="Cambiar la fecha de la factura (mismo número; se rehace el PDF)"
                                                        className="min-h-[36px] px-2 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">📅 Fecha</button>
                                                    {f.pdf
                                                        ? <button onClick={() => verPdf(f)} className="min-h-[36px] px-2 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white">📄 PDF</button>
                                                        : <button onClick={() => rehacerPdf(f)} className="min-h-[36px] px-2 text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200">⚠ Generar el PDF</button>}
                                                </div>
                                                {nuevaFecha?.numero === f.numero && (
                                                    <div className="basis-full flex flex-wrap items-end gap-2 pt-2 mt-1 border-t border-white/10">
                                                        <div>
                                                            <label className={lbl}>Nueva fecha de {f.numero}</label>
                                                            <input type="date" value={nuevaFecha.fecha || ''} onChange={e => setNuevaFecha({ numero: f.numero, fecha: e.target.value })}
                                                                className="min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-white text-base md:text-sm" />
                                                        </div>
                                                        <button onClick={cambiarFecha} disabled={!nuevaFecha.fecha || nuevaFecha.fecha === f.fecha}
                                                            className="min-h-[40px] px-4 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40">
                                                            Cambiar y rehacer el PDF
                                                        </button>
                                                        <button onClick={() => setNuevaFecha(null)} className="min-h-[40px] px-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">Cancelar</button>
                                                        <p className="basis-full text-[11px] text-white/45">
                                                            Conserva el número {f.numero}. Se corrige en el libro de facturas, el vencimiento se desplaza lo mismo y el PDF viejo se retira.
                                                            {f.envios?.length > 0 && ' Ya se le envió: después habrá que reenviársela.'}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {vista === 'emitida' && (
                                        <button onClick={() => { setVista('preparar'); setActual(null); }}
                                            className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white">
                                            + Emitir otra factura
                                        </button>
                                    )}
                                </section>
                            )}

                            {vista === 'preparar' && (
                                <>
                                    {datos.errorHoja && (
                                        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300">
                                            No se puede leer la hoja de facturas: {datos.errorHoja}. Sin ella no se puede numerar la factura.
                                        </div>
                                    )}

                                    {/* ── A quién ─────────────────────── */}
                                    <section>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className={`${lbl} mb-0`}>Facturar a</label>
                                            {datos.destinatarios?.partner && (
                                                <div className="flex rounded-lg border border-white/10 overflow-hidden">
                                                    {[['cliente', 'Cliente'], ['partner', 'Partner']].map(([k, t]) => (
                                                        <button key={k} onClick={() => elegirDestino(k)}
                                                            className={`px-3 min-h-[36px] text-[10px] font-black uppercase tracking-widest ${destino === k ? 'bg-brand/15 text-brand' : 'text-white/40 hover:text-white'}`}>{t}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {!editCliente ? (
                                            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 flex items-start justify-between gap-3">
                                                <div className="text-[12px] text-white/60 leading-relaxed min-w-0">
                                                    <div className="text-white font-bold">{cliente.razon_social || <span className="text-amber-300">Sin nombre</span>}</div>
                                                    <div>{cliente.cif ? `NIF ${cliente.cif}` : <span className="text-amber-300">Sin NIF/CIF — obligatorio en una factura</span>}</div>
                                                    <div className="text-white/40">{[cliente.direccion, [cliente.cp, cliente.municipio].filter(Boolean).join(' '), cliente.provincia].filter(Boolean).join(', ') || 'Sin dirección'}</div>
                                                </div>
                                                <button onClick={() => setEditCliente(true)} className="shrink-0 min-h-[36px] px-2 -mr-2 text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand">Editar</button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {CAMPOS_DESTINO.map(([k, t, cls]) => (
                                                    <div key={k} className={cls}>
                                                        <label className="block text-[10px] text-white/35 mb-1">{t}</label>
                                                        <input value={cliente[k] || ''} onChange={e => setCliente(c => ({ ...c, [k]: e.target.value }))}
                                                            type={k === 'email' ? 'email' : k === 'tlf' ? 'tel' : 'text'} inputMode={k === 'cp' ? 'numeric' : undefined}
                                                            className={`${inp} ${k === 'email' ? 'no-uppercase' : ''}`} />
                                                    </div>
                                                ))}
                                                <p className="col-span-2 text-[11px] text-white/30">Solo cambia esta factura: la ficha del cliente no se toca.</p>
                                            </div>
                                        )}
                                    </section>

                                    {/* ── Líneas ──────────────────────── */}
                                    <section>
                                        <label className={lbl}>Conceptos <span className="text-white/20 normal-case font-normal tracking-normal">— del catálogo de la hoja · precios sin IVA</span></label>
                                        <div className="space-y-2">
                                            {lineas.map((l, i) => {
                                                const c = totales.lineas[i];
                                                return (
                                                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                                                        {/* El concepto se LEE entero: en un <select> de 300 px se
                                                            cortaba en "REALIZACIÓN DE CERTIFIC…" y no se sabía cuál era.
                                                            El select va invisible ENCIMA, así que tocar el texto abre el
                                                            selector nativo del móvil, que es donde mejor se elige. */}
                                                        <div className="flex gap-2">
                                                            <label className="relative flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 min-h-[44px] cursor-pointer focus-within:border-brand/40">
                                                                <span className={`flex-1 min-w-0 text-sm leading-snug normal-case ${l.descripcion ? 'text-white' : 'text-white/35'}`}>
                                                                    {l.descripcion || 'Elige un concepto del catálogo'}
                                                                </span>
                                                                <span className="shrink-0 text-white/35 text-xs" aria-hidden>▾</span>
                                                                <select value={l.articulo_id ?? ''} onChange={e => elegirArticulo(i, e.target.value)}
                                                                    aria-label="Concepto" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                                                                    {!articulos.some(a => String(a.id) === String(l.articulo_id)) && <option value={l.articulo_id ?? ''}>{l.descripcion || '— Elige un artículo —'}</option>}
                                                                    {articulos.map(a => <option key={a.id} value={a.id}>{a.nombre} · {fmtEur(a.importe)}</option>)}
                                                                </select>
                                                            </label>
                                                            <button onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))}
                                                                className="shrink-0 w-11 min-h-[44px] rounded-xl border border-white/10 text-white/40 hover:text-red-300" title="Quitar la línea" aria-label="Quitar la línea">✕</button>
                                                        </div>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            <div><label className="block text-[10px] text-white/35 mb-1 whitespace-nowrap">Uds</label>
                                                                <CampoDecimal valor={l.uds} onCambio={n => setLinea(i, { uds: n })} className={inp} /></div>
                                                            <div><label className="block text-[10px] text-white/35 mb-1 whitespace-nowrap">Precio €</label>
                                                                <CampoDecimal valor={l.precio} onCambio={n => setLinea(i, { precio: n })} className={inp} /></div>
                                                            <div><label className="block text-[10px] text-white/35 mb-1 whitespace-nowrap">% Dto</label>
                                                                <CampoDecimal valor={l.dtoPct} onCambio={n => setLinea(i, { dtoPct: Math.min(100, n) })} alVaciar={() => setLinea(i, { dtoPct: 0 })} className={inp} /></div>
                                                            <div><label className="block text-[10px] text-white/35 mb-1 whitespace-nowrap">% IVA</label>
                                                                <CampoDecimal valor={l.ivaPct} onCambio={n => setLinea(i, { ivaPct: n })} alVaciar={() => setLinea(i, { ivaPct: 0 })} className={inp} /></div>
                                                        </div>
                                                        <div className="text-right text-[11px] text-white/40 font-mono">{fmtEur(c?.subtotal)} + IVA {fmtEur(c?.iva)} = <span className="text-white/70">{fmtEur((c?.subtotal || 0) + (c?.iva || 0))}</span></div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <button onClick={() => setLineas(ls => [...ls, { articulo_id: null, descripcion: '', uds: 1, precio: 0, dtoPct: 0, ivaPct: 21 }])}
                                            className="mt-2 w-full min-h-[40px] rounded-xl border border-dashed border-white/15 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                                            + Añadir concepto
                                        </button>
                                        <div className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                                            <span className="text-[11px] text-white/45">Neto {fmtEur(totales.neto)} + IVA {fmtEur(totales.iva)}</span>
                                            <span className="text-lg font-black text-brand font-mono">{fmtEur(totales.total)}</span>
                                        </div>
                                    </section>

                                    {/* ── Fechas y observaciones ──────── */}
                                    <section className="grid grid-cols-2 gap-3">
                                        <div><label className={lbl}>Fecha</label>
                                            <input type="date" value={fecha} className={inp}
                                                onChange={e => { setFecha(e.target.value); if (!vencTocado && e.target.value) setVenc(sumarDias(e.target.value, datos.vencimientoDias || 30)); }} /></div>
                                        <div><label className={lbl}>Vencimiento</label>
                                            <input type="date" value={venc} className={inp} onChange={e => { setVenc(e.target.value); setVencTocado(true); }} /></div>
                                        <div className="col-span-2">
                                            <label className={lbl}>Observaciones <span className="text-white/20 normal-case font-normal tracking-normal">— el nº de expediente se añade solo</span></label>
                                            <textarea value={obs} rows={2} onChange={e => setObs(e.target.value)}
                                                className="no-uppercase w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-brand/40 resize-none" />
                                        </div>
                                    </section>
                                </>
                            )}

                            {(vista === 'preparar' || (vista === 'emitida' && actual)) && (
                                <section>
                                    <label className={lbl}>
                                        {vista === 'preparar' ? 'Enviar al emitir' : `Enviar la factura ${actual.numero}`}
                                        {vista === 'preparar' && <span className="text-white/20 normal-case font-normal tracking-normal"> — sale con el PDF adjunto en cuanto se emita</span>}
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email" className={`${inp} no-uppercase`} />
                                        <input value={tlf} onChange={e => setTlf(e.target.value)} type="tel" placeholder="móvil (WhatsApp)" className={inp} />
                                    </div>
                                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02]">
                                        <button type="button" onClick={() => setVerMensaje(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                                            <span className="text-[11px] text-white/50 line-clamp-1">{verMensaje ? 'Mensaje que recibirá' : mensajeVisible.split('\n').filter(Boolean).slice(1, 2).join(' ')}</span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-brand/70 shrink-0 ml-3">{verMensaje ? 'Ocultar' : 'Ver / editar el mensaje'}</span>
                                        </button>
                                        {verMensaje && (
                                            <div className="px-4 pb-4">
                                                <textarea value={mensajeVisible} rows={13}
                                                    onChange={e => { setMensaje(e.target.value); setMensajeTocado(true); }}
                                                    className="no-uppercase w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-[13px] leading-relaxed text-white/80 focus:outline-none focus:border-brand/40 resize-y" />
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                                    {vista === 'preparar' && numeroPrevisto && (
                                                        <span className="text-[11px] text-white/30">El nº {numeroPrevisto} es el que toca ahora; si al emitir sale otro, se corrige solo.</span>
                                                    )}
                                                    {mensajeTocado && <button type="button" className="text-[11px] text-white/30 underline" onClick={() => setMensajeTocado(false)}>Volver al automático</button>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {/* ── Barra inferior ─────────────────────────── */}
                    {datos && (
                        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                            {vista === 'preparar' ? (
                                <>
                                <div className="flex flex-wrap gap-2">
                                    <CanalChip canal="whatsapp" nombre="WhatsApp" activo={usaWa}
                                        disponible={!!waReady && tlf.replace(/\D/g, '').length >= 9}
                                        detalle={tlf} motivo={waReady === false ? 'WhatsApp desconectado' : 'Sin teléfono'}
                                        onClick={() => setUsaWa(v => !v)} bloqueado={!!fase} />
                                    <CanalChip canal="email" nombre="Email" activo={usaEmail} disponible={/\S+@\S+\.\S+/.test(email)}
                                        detalle={email} motivo="Sin email" onClick={() => setUsaEmail(v => !v)} bloqueado={!!fase} />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setPreview(true)} disabled={!lineas.length}
                                        className="flex-1 md:flex-none md:px-5 min-h-[44px] rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/55 hover:text-white transition-colors disabled:opacity-30">
                                        Vista previa
                                    </button>
                                    <button onClick={emitir} disabled={!!motivo || !!fase}
                                        className="flex-[2] md:flex-1 min-h-[44px] rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors">
                                        {motivo || `${enviarAlEmitir ? 'Emitir y enviar' : 'Emitir factura'} · ${fmtEur(totales.total)}`}
                                    </button>
                                </div>
                                </>
                            ) : actual && (
                                <>
                                    <div className="flex flex-wrap gap-2">
                                        <CanalChip canal="email" nombre="Email" activo={usaEmail} disponible={/\S+@\S+\.\S+/.test(email)}
                                            detalle={email} motivo="Sin email" onClick={() => setUsaEmail(v => !v)} bloqueado={!!fase} />
                                        <CanalChip canal="whatsapp" nombre="WhatsApp" activo={usaWa}
                                            disponible={!!waReady && tlf.replace(/\D/g, '').length >= 9}
                                            detalle={tlf} motivo={waReady === false ? 'WhatsApp desconectado' : 'Sin teléfono'}
                                            onClick={() => setUsaWa(v => !v)} bloqueado={!!fase} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => (actual.pdf ? verPdf(actual) : rehacerPdf(actual))}
                                            className="flex-1 md:flex-none md:px-5 min-h-[44px] rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/55 hover:text-white transition-colors">
                                            {actual.pdf ? 'Ver PDF' : 'Generar el PDF'}
                                        </button>
                                        <button onClick={enviar} disabled={!(canEmail || canWa) || !!fase}
                                            className="flex-[2] md:flex-1 min-h-[44px] rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors">
                                            {(canEmail || canWa) ? `${actual.envios?.length ? 'Reenviar' : 'Enviar'} factura ${actual.numero}` : 'Marca un canal con destinatario'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {preview && (
                <VistaPreviaA4 titulo="Vista previa de la factura" onClose={() => setPreview(false)}
                    rotulo={`Vista previa · el nº ${datos?.proximoNumero ? `(${datos.proximoNumero}) ` : ''}se reserva al emitir`}
                    html={buildFacturaCeeHtml(payloadPdf(datos?.proximoNumero || 'BORRADOR'))} />
            )}

            <SendActionOverlay
                phase={fase}
                ok={res.ok}
                subtitle={actual ? `Factura ${actual.numero}` : `${datos?.expediente?.numero || ''}`}
                items={res.items}
                errorText={res.text}
                sendingTitle={titulos[0]}
                okTitle={titulos[1]}
                errorTitle={titulos[2]}
                onClose={() => setFase(null)}
            />
        </>
    );
}

export default FacturaCeeModal;
