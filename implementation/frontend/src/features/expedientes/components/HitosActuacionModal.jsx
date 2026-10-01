import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
    hitosActuacion, aclaracionSugerida, fechaEs, MOTIVOS_NO_INICIO, motivoNoInicio, ACLARACION_MAX,
} from '../logic/hitosActuacion';

// ─── HitosActuacionModal ─────────────────────────────────────────────────────
// Las fechas del CIFO, con TODO lo que las rodea a la vista: las facturas, las
// visitas y firmas de los dos CEE y las pruebas del RITE, en orden cronológico.
// Es donde se resuelve el requerimiento más repetido sobre fechas: una factura
// de ENTREGA DE MATERIAL o un ANTICIPO emitida antes de existir el CEE inicial,
// que con el criterio de siempre (el inicio es la primera factura) fijaba el
// inicio de la actuación antes del certificado de partida.
//
// Tres cosas se deciden aquí y las tres las decide una persona:
//   · qué facturas NO abren la actuación (se marca en su propia línea, que es
//     donde se ve que va antes que el CEE);
//   · si el inicio o el fin se fijan a mano (el override de siempre);
//   · la ACLARACIÓN que se imprime en el CIFO. Hay una redacción propuesta,
//     compuesta solo con los datos, y otra que puede redactar la IA con lo que
//     se le cuente del caso; ninguna se guarda sin pasar por aquí.
//
// El gesto es de DOS TIEMPOS: se marca y se ve el efecto (la cronología se
// recalcula al instante), y solo al pulsar Guardar se escribe.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (v) => (Number(v) ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : null);
const PARTIDA = {
    AEROTERMIA: 'aerotermia', ACS: 'ACS', EMISORES: 'emisores', VENTANAS: 'ventanas', CUBIERTA: 'cubierta',
    FACHADA: 'fachada', SUELO: 'suelo', FOTOVOLTAICA: 'fotovoltaica', OBRA_CIVIL: 'obra civil',
    MANO_OBRA: 'mano de obra', OTROS: 'otros',
};

// Orden de las cosas que caen el MISMO día: lo del certificador antes que la
// obra, y el inicio antes que la factura que lo abre, que se lee como su causa.
const ORDEN = { visita: 0, firma: 1, inicio: 2, factura: 3, pruebas: 4, fin: 5 };

export function HitosActuacionModal({ expediente, doc, readOnly = false, user, onGuardar, onClose }) {
    const facturasDoc = doc?.facturas || [];
    const [motivos, setMotivos] = useState(() => facturasDoc.map(f => motivoNoInicio(f)));
    const [inicioManual, setInicioManual] = useState(doc?.fecha_inicio_cifo_manual || '');
    const [finManual, setFinManual] = useState(doc?.fecha_fin_cifo_manual || '');
    const [aclaracion, setAclaracion] = useState(doc?.hitos_actuacion?.aclaracion || '');
    const [origenTexto, setOrigenTexto] = useState(doc?.hitos_actuacion?.origen || null);
    const [contexto, setContexto] = useState('');
    const [ia, setIa] = useState({ busy: false, aviso: null });
    const [guardando, setGuardando] = useState(false);

    // El expediente con lo marcado aquí: todo lo que se enseña sale de él, con la
    // MISMA función que imprime el CIFO. Así lo que se ve es lo que va a salir.
    const borradorDoc = useMemo(() => ({
        ...doc,
        facturas: facturasDoc.map((f, i) => ({ ...f, motivo_no_inicio: motivos[i] || null })),
        fecha_inicio_cifo_manual: inicioManual || null,
        fecha_fin_cifo_manual: finManual || null,
        hitos_actuacion: { aclaracion },
    }), [doc, facturasDoc, motivos, inicioManual, finManual, aclaracion]);
    const h = useMemo(() => hitosActuacion({ ...expediente, documentacion: borradorDoc }), [expediente, borradorDoc]);
    const hAuto = useMemo(() => hitosActuacion({
        ...expediente,
        documentacion: { ...borradorDoc, fecha_inicio_cifo_manual: null, fecha_fin_cifo_manual: null },
    }), [expediente, borradorDoc]);
    const propuesta = useMemo(() => aclaracionSugerida(h), [h]);

    const firmaIni = h.ceeInicial.firma;
    const inicioAntesCee = !!(h.inicio && firmaIni && h.inicio < firmaIni);

    // ── La cronología ────────────────────────────────────────────────────────
    const items = useMemo(() => {
        const l = [];
        h.facturas.forEach(f => {
            const orig = facturasDoc[f.idx] || {};
            l.push({ tipo: 'factura', fecha: f.fecha, f, importe: eur(orig.importe_sin_iva),
                partidas: (orig.partidas || []).map(p => PARTIDA[p] || String(p).toLowerCase()) });
        });
        if (h.ceeInicial.visita) l.push({ tipo: 'visita', fecha: h.ceeInicial.visita, fase: 'inicial' });
        if (h.ceeInicial.firma) l.push({ tipo: 'firma', fecha: h.ceeInicial.firma, fase: 'inicial' });
        if (h.ceeFinal.visita) l.push({ tipo: 'visita', fecha: h.ceeFinal.visita, fase: 'final' });
        if (h.ceeFinal.firma) l.push({ tipo: 'firma', fecha: h.ceeFinal.firma, fase: 'final' });
        if (h.pruebas) l.push({ tipo: 'pruebas', fecha: h.pruebas });
        if (h.inicio) l.push({ tipo: 'inicio', fecha: h.inicio });
        if (h.fin) l.push({ tipo: 'fin', fecha: h.fin });
        return l.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : ORDEN[a.tipo] - ORDEN[b.tipo]));
    }, [h, facturasDoc]);
    const sinFecha = facturasDoc.filter(f => !f?.fecha_factura);

    const origenTxt = (o) => !o ? '' : o.tipo === 'manual' ? 'fijada a mano'
        : o.tipo === 'factura' ? `de la factura ${o.numero ? `nº ${o.numero}` : 'sin número'}`
        : o.tipo === 'pruebas' ? 'de las pruebas del Certificado RITE' : '';

    // ── Lo que ya está generado ──────────────────────────────────────────────
    // Cambiar las fechas de un CIFO ya generado no toca el PDF: hay que
    // regenerarlo, y si ya está firmado, volver a pedir la firma. Se dice ANTES
    // de guardar, con las dos versiones.
    const guardadoIni = doc?.fecha_inicio_cifo ? String(doc.fecha_inicio_cifo).slice(0, 10) : null;
    const guardadoFin = doc?.fecha_fin_cifo ? String(doc.fecha_fin_cifo).slice(0, 10) : null;
    const cambianFechas = (guardadoIni && h.inicio && guardadoIni !== h.inicio) || (guardadoFin && h.fin && guardadoFin !== h.fin);
    const cambiaAclaracion = String(doc?.hitos_actuacion?.aclaracion || '').trim() !== aclaracion.trim();
    const cifoGenerado = !!doc?.cert_cifo_drive_link;
    const cifoFirmado = !!doc?.cert_cifo_signed_link;

    // El bloque de hitos va en una hoja de alto FIJO: una aclaración más larga que
    // el tope desbordaría la hoja. No se recorta sola —se cortaría a media frase en
    // un documento firmado—: se dice y no se deja guardar hasta acortarla.
    const demasiadoLarga = aclaracion.trim().length > ACLARACION_MAX;

    const setMotivo = (idx, m) => setMotivos(prev => prev.map((v, i) => (i === idx ? m : v)));

    const redactarIa = async () => {
        setIa({ busy: true, aviso: null });
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/hitos/aclaracion-ia`, {
                borrador: {
                    motivos: Object.fromEntries(motivos.map((m, i) => [i, m || null])),
                    fecha_inicio_cifo_manual: inicioManual || null,
                    fecha_fin_cifo_manual: finManual || null,
                },
                contexto,
            });
            if (data?.texto) { setAclaracion(data.texto); setOrigenTexto(data.origen || 'ia'); }
            setIa({ busy: false, aviso: data?.aviso || null });
        } catch (e) {
            setIa({ busy: false, aviso: e.response?.data?.error || 'No se ha podido redactar con la IA.' });
        }
    };

    const guardar = async () => {
        setGuardando(true);
        const texto = aclaracion.trim();
        const facturas = facturasDoc.map((f, i) => {
            const m = motivos[i] || null;
            if ((motivoNoInicio(f) || null) === m) return f;
            return { ...f, motivo_no_inicio: m };
        });
        try {
            await onGuardar({
                facturas,
                fecha_inicio_cifo_manual: inicioManual || null,
                fecha_fin_cifo_manual: finManual || null,
                hitos_actuacion: texto ? {
                    aclaracion: texto,
                    origen: origenTexto || 'manual',
                    por: user?.nombre || user?.email || null,
                    at: new Date().toISOString(),
                } : null,
            });
            onClose();
        } finally { setGuardando(false); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center max-md:items-end p-4 max-md:p-0 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-3xl max-h-[92vh] max-md:max-h-[94dvh] flex flex-col bg-bkg-surface border border-white/10 rounded-2xl max-md:rounded-b-none shadow-2xl overflow-hidden">
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.08]">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider">Hitos de la actuación</h3>
                        <p className="text-[11px] text-white/45 mt-1">
                            {expediente?.numero_expediente ? `${expediente.numero_expediente} · ` : ''}
                            Las fechas que declara el CIFO y las que las rodean. Se imprimen en el certificado, en la hoja de la instalación.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">×</button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                    {/* ── Cronología ── */}
                    <section>
                        <h4 className="text-[10px] font-black text-white/45 uppercase tracking-widest mb-2">Cronología</h4>
                        <ol className="relative border-l border-white/10 ml-2 space-y-2.5">
                            {items.map((it, k) => (
                                <ItemCronologia key={k} it={it} h={h} firmaIni={firmaIni} readOnly={readOnly}
                                    origenTxt={origenTxt} inicioAntesCee={inicioAntesCee}
                                    onMotivo={(m) => setMotivo(it.f.idx, m)} />
                            ))}
                        </ol>
                        {!items.length && <p className="text-[12px] text-white/40 italic">Todavía no hay ninguna fecha: ni facturas, ni pruebas del RITE, ni CEE.</p>}
                        {/* Lo que no consta NO se imprime: sin fechas de un CEE, su fila no
                            sale en el certificado. Se dice aquí para que no sorprenda al
                            abrir el PDF (y otra vez en la puerta de «Generar»). */}
                        {[['ceeInicial', 'inicial'], ['ceeFinal', 'final']].map(([k, fase]) => {
                            const c = h[k] || {};
                            const falta = [!c.visita && 'la visita del técnico', !c.firma && 'la firma'].filter(Boolean);
                            if (!falta.length) return null;
                            return (
                                <p key={k} className="text-[11px] text-white/40 mt-2 ml-2">
                                    CEE {fase}: sin {falta.join(' ni ')} todavía — {falta.length === 2
                                        ? 'su fila no saldrá en el certificado'
                                        : 'esa casilla saldrá vacía en el certificado'}.
                                    Se toma de la rejilla del CEE o de su .xml.
                                </p>
                            );
                        })}
                        {!h.pruebas && (
                            <p className="text-[11px] text-white/40 mt-2 ml-2">
                                Sin fecha de pruebas del Certificado RITE — esa casilla saldrá vacía en el certificado.
                            </p>
                        )}
                        {sinFecha.length > 0 && (
                            <p className="text-[11px] text-amber-300/80 mt-2">
                                {sinFecha.length === 1 ? 'Una factura no tiene' : `${sinFecha.length} facturas no tienen`} fecha y no cuenta{sinFecha.length === 1 ? '' : 'n'} para el inicio ni el fin: ponla en «Facturas de la obra».
                            </p>
                        )}
                    </section>

                    {/* ── Inicio y fin ── */}
                    <section>
                        <h4 className="text-[10px] font-black text-white/45 uppercase tracking-widest mb-2">Inicio y fin que declara el CIFO</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FechaCifo etiqueta="Inicio de la actuación" valor={h.inicio} auto={hAuto.inicio}
                                origen={origenTxt(h.inicioDe)} manual={inicioManual} setManual={setInicioManual}
                                readOnly={readOnly} alerta={inicioAntesCee ? `Anterior a la firma del CEE inicial (${fechaEs(firmaIni)})` : null}
                                ok={h.inicio && firmaIni && !inicioAntesCee ? `Posterior a la firma del CEE inicial (${fechaEs(firmaIni)})` : null} />
                            <FechaCifo etiqueta="Fin de la actuación" valor={h.fin} auto={hAuto.fin}
                                origen={origenTxt(h.finDe)} manual={finManual} setManual={setFinManual} readOnly={readOnly}
                                alerta={h.inicio && h.fin && h.fin < h.inicio ? 'Anterior al inicio' : null} />
                        </div>
                        <p className="text-[11px] text-white/35 mt-2 leading-snug">
                            Por defecto el inicio es la primera factura que abre la obra (o las pruebas del RITE, si son anteriores) y el fin, la última fecha.
                            Una factura marcada como entrega de material o anticipo no abre la obra, pero sigue siendo una factura del expediente.
                        </p>
                    </section>

                    {/* ── Aclaración ── */}
                    <section>
                        <div className="flex items-baseline justify-between gap-3 mb-2">
                            <h4 className="text-[10px] font-black text-white/45 uppercase tracking-widest">Aclaración que se imprime en el CIFO</h4>
                            <span className={`text-[10px] font-bold tabular-nums ${aclaracion.length > ACLARACION_MAX ? 'text-red-400' : 'text-white/30'}`}>
                                {aclaracion.length}/{ACLARACION_MAX}
                            </span>
                        </div>
                        <textarea
                            value={aclaracion}
                            onChange={e => { setAclaracion(e.target.value); setOrigenTexto('manual'); }}
                            readOnly={readOnly}
                            rows={4}
                            placeholder={h.anteriores.length
                                ? 'Explica por qué hay facturas anteriores al inicio (o usa la propuesta de abajo).'
                                : 'Opcional. Con estas fechas no hay ninguna factura anterior al inicio que explicar.'}
                            className="no-uppercase w-full bg-black/30 border border-white/15 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed text-white/85 placeholder:text-white/25 focus:border-brand/50 focus:outline-none"
                        />

                        {!readOnly && propuesta && propuesta !== aclaracion.trim() && (
                            <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <span className="text-[10px] font-black text-white/45 uppercase tracking-widest">Propuesta con los datos</span>
                                    <button onClick={() => { setAclaracion(propuesta); setOrigenTexto('propuesta'); setIa({ busy: false, aviso: null }); }}
                                        className="text-[10px] font-black uppercase tracking-widest text-brand hover:text-white transition-colors">
                                        Usar esta
                                    </button>
                                </div>
                                <p className="text-[12px] text-white/65 leading-relaxed">{propuesta}</p>
                            </div>
                        )}

                        {!readOnly && (
                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                                <input
                                    value={contexto}
                                    onChange={e => setContexto(e.target.value)}
                                    placeholder="Para la IA (opcional): qué pasó. P. ej. «la bomba quedó en el almacén del instalador hasta septiembre»"
                                    className="no-uppercase flex-1 min-w-0 bg-black/30 border border-white/15 rounded-xl px-3 py-2 text-[12px] text-white/80 placeholder:text-white/25 focus:border-brand/50 focus:outline-none"
                                />
                                <button onClick={redactarIa} disabled={ia.busy}
                                    className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand/15 border border-brand/40 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-bkg-deep transition-all disabled:opacity-50">
                                    {ia.busy
                                        ? <><span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Redactando…</>
                                        : <>✨ Redactar con IA</>}
                                </button>
                            </div>
                        )}
                        {demasiadoLarga && (
                            <p className="text-[11px] text-red-300/90 mt-2 leading-snug">
                                Se pasa del máximo ({aclaracion.trim().length} de {ACLARACION_MAX} caracteres): acórtala para poder guardar. El bloque va en una hoja de alto fijo del certificado.
                            </p>
                        )}
                        {ia.aviso && <p className="text-[11px] text-amber-300/85 mt-2 leading-snug">{ia.aviso}</p>}
                        <p className="text-[11px] text-white/35 mt-2 leading-snug">
                            La IA solo redacta: el texto que cite una fecha o una factura que no consta en el expediente se descarta. Revísalo antes de guardar —va en un documento que firma el instalador.
                        </p>
                    </section>
                </div>

                {/* Pie */}
                <div className="px-5 py-3.5 border-t border-white/[0.08] space-y-2.5 max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                    {cifoGenerado && (cambianFechas || cambiaAclaracion) && (
                        <p className="text-[11px] text-amber-300/90 leading-snug">
                            ⚠ El CIFO {cifoFirmado ? 'firmado' : 'generado'} lleva lo de antes
                            {cambianFechas ? ` (del ${fechaEs(guardadoIni) || '—'} al ${fechaEs(guardadoFin) || '—'})` : ''}.
                            Al guardar, vuelve a generarlo{cifoFirmado ? ' y pide que lo firmen otra vez' : ''}: el PDF no cambia solo.
                        </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white/80 transition-all">
                            {readOnly ? 'Cerrar' : 'Cancelar'}
                        </button>
                        {!readOnly && (
                            <button onClick={guardar} disabled={guardando || demasiadoLarga}
                                className="px-5 py-2 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50">
                                {guardando ? 'Guardando…' : 'Guardar'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function ItemCronologia({ it, h, firmaIni, readOnly, origenTxt, inicioAntesCee, onMotivo }) {
    const esHito = it.tipo === 'inicio' || it.tipo === 'fin';
    let punto = 'bg-white/30';
    let titulo = null;
    let detalle = null;
    let alerta = null;

    if (it.tipo === 'factura') {
        const { f } = it;
        const antesCee = !!(firmaIni && f.fecha < firmaIni);
        punto = f.motivo ? 'bg-amber-400' : antesCee ? 'bg-red-400' : 'bg-white/60';
        titulo = <>Factura {f.numero ? `nº ${f.numero}` : <span className="italic text-white/45">sin número</span>}</>;
        detalle = [it.importe, it.partidas.length ? it.partidas.join(', ') : null].filter(Boolean).join(' · ');
        if (f.motivo) alerta = { tono: 'text-amber-300/85', txt: `${MOTIVOS_NO_INICIO[f.motivo].label}: no abre la actuación` };
        else if (antesCee) alerta = { tono: 'text-red-300/90', txt: `Anterior a la firma del CEE inicial (${fechaEs(firmaIni)}). Si es una entrega de material o un anticipo, márcala.` };
    } else if (it.tipo === 'visita') {
        titulo = `Visita del técnico certificador · CEE ${it.fase}`;
        punto = 'bg-sky-400/70';
    } else if (it.tipo === 'firma') {
        titulo = `Firma del CEE ${it.fase}`;
        punto = 'bg-sky-400';
    } else if (it.tipo === 'pruebas') {
        titulo = 'Pruebas de la instalación · Certificado RITE';
        punto = 'bg-violet-400/80';
    } else if (it.tipo === 'inicio') {
        titulo = 'INICIO de la actuación';
        detalle = origenTxt(h.inicioDe);
        punto = inicioAntesCee ? 'bg-red-500' : 'bg-brand';
        if (inicioAntesCee) alerta = { tono: 'text-red-300/90', txt: `Anterior a la firma del CEE inicial (${fechaEs(firmaIni)})` };
    } else if (it.tipo === 'fin') {
        titulo = 'FIN de la actuación';
        detalle = origenTxt(h.finDe);
        punto = 'bg-brand';
    }

    return (
        <li className="ml-4">
            <span className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-bkg-surface ${punto}`} />
            <div className={`flex flex-wrap items-start gap-x-3 gap-y-1 ${esHito ? 'rounded-lg bg-brand/[0.07] border border-brand/20 px-2.5 py-1.5 -ml-1' : ''}`}>
                <span className="text-[12px] font-bold tabular-nums text-white/80 w-[84px] shrink-0">{fechaEs(it.fecha)}</span>
                <div className="flex-1 min-w-[180px]">
                    <div className={`text-[12px] ${esHito ? 'font-black text-white' : 'font-semibold text-white/80'}`}>{titulo}</div>
                    {detalle && <div className="text-[11px] text-white/40">{detalle}</div>}
                    {alerta && <div className={`text-[11px] mt-0.5 leading-snug ${alerta.tono}`}>{alerta.txt}</div>}
                </div>
                {it.tipo === 'factura' && (
                    <SelectorMotivo valor={it.f.motivo} onChange={onMotivo} readOnly={readOnly} />
                )}
            </div>
        </li>
    );
}

// Tres respuestas y siempre a la vista: marcar una factura es exactamente lo que
// se viene a hacer aquí, y un desplegable lo escondería detrás de un clic.
function SelectorMotivo({ valor, onChange, readOnly }) {
    const opciones = [
        { v: null, l: 'Abre la obra' },
        { v: 'MATERIAL', l: 'Material' },
        { v: 'ANTICIPO', l: 'Anticipo' },
    ];
    return (
        <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0 max-sm:w-full">
            {opciones.map(o => {
                const activo = (valor || null) === o.v;
                return (
                    <button key={o.l} type="button" disabled={readOnly} onClick={() => onChange(o.v)}
                        title={o.v ? `${MOTIVOS_NO_INICIO[o.v].label}: la factura no abre la actuación` : 'La fecha de esta factura puede abrir la actuación'}
                        className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors max-sm:flex-1 ${
                            activo
                                ? (o.v ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white')
                                : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                        } disabled:cursor-default`}>
                        {o.l}
                    </button>
                );
            })}
        </div>
    );
}

function FechaCifo({ etiqueta, valor, auto, origen, manual, setManual, readOnly, alerta, ok }) {
    return (
        <div className={`rounded-xl border p-3 ${alerta ? 'border-red-500/35 bg-red-500/[0.05]' : 'border-white/10 bg-white/[0.02]'}`}>
            <div className="text-[10px] font-black text-white/45 uppercase tracking-widest">{etiqueta}</div>
            <div className="text-lg font-black text-white tabular-nums mt-0.5">{fechaEs(valor) || '—'}</div>
            {origen && <div className="text-[11px] text-white/40">{origen}</div>}
            {alerta && <div className="text-[11px] text-red-300/90 mt-1">✗ {alerta}</div>}
            {!alerta && ok && <div className="text-[11px] text-emerald-300/80 mt-1">✓ {ok}</div>}
            {!readOnly && (
                <div className="flex items-center gap-2 mt-2.5">
                    <input type="date" value={manual || ''} onChange={e => setManual(e.target.value)}
                        className="flex-1 min-w-0 bg-black/30 border border-white/15 rounded-lg px-2 py-1.5 text-[12px] text-white/80 focus:border-brand/50 focus:outline-none" />
                    {manual
                        ? <button onClick={() => setManual('')} className="text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white whitespace-nowrap">
                            Automática{auto ? ` (${fechaEs(auto)})` : ''}
                          </button>
                        : <span className="text-[10px] text-white/30 whitespace-nowrap">Fijar a mano</span>}
                </div>
            )}
        </div>
    );
}

export default HitosActuacionModal;
