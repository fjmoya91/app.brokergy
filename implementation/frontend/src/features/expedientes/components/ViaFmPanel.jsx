import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { GENERADORES_FM, avisosDocumentoFm } from '../logic/documentosFm';
import { cifrasViaFm, FM_PRESENTACION } from '../logic/convenioFm';
import { getClientCaeRate } from '../utils/docGenerators';
import { AvisoEsperaFmModal } from './AvisoEsperaFmModal';

const eur0 = (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString('es-ES', { useGrouping: true })} €` : '—');
const kwh0 = (v) => (v > 0 ? `${Math.round(v).toLocaleString('es-ES', { useGrouping: true })} kWh/año` : '—');

// Una de las tres cifras de arriba (vigente · FM · lo que gana el cliente).
function Cifra({ titulo, valor, sub, tono = 'neutro' }) {
    const c = tono === 'fm' ? 'border-brand/40 bg-brand/[0.08]' : tono === 'gana' ? 'border-emerald-500/30 bg-emerald-500/[0.07]' : tono === 'pierde' ? 'border-amber-500/30 bg-amber-500/[0.07]' : 'border-white/10 bg-white/[0.02]';
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${c}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{titulo}</p>
            <p className="text-base font-black text-white mt-0.5">{valor}</p>
            {sub && <p className="text-[10px] text-white/40 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ViaFmPanel — la VÍA DEL FACTOR MULTIPLICADOR de un expediente RES060 / RES093
// (Resolución BOE-A-2026-23367, en vigor el 08/11/2026).
//
// Tres cosas, y nada del cálculo del bono (eso es del motor, `calculateRes060FM`):
//   1. En qué vía va y el botón para cambiarla. La vía FM tiene SERIE PROPIA
//      (26RES060FM_N, decisión de Fran 07/11/2026): cambiar de vía RENUMERA, por
//      eso se confirma enseñando el número que deja.
//   2. Los datos que deciden QUÉ documentos pide la ficha (tipología, vulnerable,
//      caldera en preinstalación, baja tensión, facturas de la luz…). Se
//      autoguardan en `documentacion.via_fm` por su ruta dedicada.
//   3. Los 13 puntos del apartado 3 de la ficha (y los del vulnerable), cada uno
//      con QUIÉN lo aporta y su ESTADO. Lo que se SUBE tiene su apartado en el
//      gestor de Documentación (mismo `slot`); lo que ya cubre otro documento del
//      expediente (Anexo I/A, CIFO, Convenio…) se lee de ahí.
//   4. Los que GENERA la app para firmar (declaración de la tipología, informado
//      F/G, oferta de mantenimiento, Anexo B): «Generar» los maqueta con
//      logic/documentosFm.js y guarda el PDF (POST /:id/via-fm/documento/:genera).
//      NO se envían desde aquí: el cliente los encuentra en su enlace de firma,
//      junto al Anexo A y al Convenio, y el instalador en el suyo, junto al CIFO.
//
// Fuente de la lógica: backend `utils/viaFm.js` (la ruta `GET /:id/via-fm` la
// devuelve ya resuelta). Detalle y porqué:
// docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ─────────────────────────────────────────────────────────────────────────────

const AUTOSAVE_MS = 900;
const INPUT = 'w-full bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:border-brand focus:outline-none transition-colors disabled:opacity-50';

const fechaEs = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

const ESTADO_CHIP = {
    firmado: { t: 'Firmado', c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    aportado: { t: 'Aportado', c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    registrado: { t: 'Registrado', c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    sin_clausula: { t: 'Firmado SIN la cláusula FM', c: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    borrador: { t: 'Generado · sin firmar', c: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
    pendiente: { t: 'Pendiente', c: 'bg-amber-500/10 text-amber-300/80 border-amber-500/20' },
};
const DONDE_SE_FIRMA = {
    cliente: 'lo firma el cliente en su enlace de firma, junto al Anexo A y el Convenio',
    instalador: 'lo firma el instalador en su enlace, junto al CIFO',
};
const QUIEN = { cliente: 'Cliente', instalador: 'Instalador', brokergy: 'Brokergy' };

function Opciones({ label, hint, value, onChange, opciones, disabled }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2 max-md:flex-col max-md:gap-2">
            <div className="min-w-0">
                <span className="text-xs text-white/60 font-bold">{label}</span>
                {hint && <p className="text-[11px] text-white/30 mt-0.5 leading-snug">{hint}</p>}
            </div>
            <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5 shrink-0 flex-wrap">
                {opciones.map((o) => (
                    <button
                        key={String(o.v)}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(o.v)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                            value === o.v ? 'bg-brand text-black shadow' : 'text-white/30 hover:text-white/60'
                        }`}
                    >
                        {o.l}
                    </button>
                ))}
            </div>
        </div>
    );
}

const SI_NO = [{ v: true, l: 'SÍ' }, { v: false, l: 'NO' }];
const SI_NO_NS = [{ v: true, l: 'SÍ' }, { v: false, l: 'NO' }, { v: null, l: 'SIN SABER' }];

// Vista previa del documento tal y como saldrá (la misma maqueta que se guarda).
function VistaPreviaFm({ titulo, html, onCerrar }) {
    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onCerrar]);
    const hojas = Math.max(1, (html.match(/class="fm-page"/g) || []).length);
    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-bkg-surface border border-white/10 rounded-2xl w-full max-w-[880px] max-h-[94vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
                    <p className="text-sm font-black text-white truncate">{titulo}</p>
                    <button type="button" onClick={onCerrar} className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest bg-white/10 text-white hover:bg-white/20">Cerrar</button>
                </div>
                <div className="flex-1 overflow-auto bg-neutral-500/30 p-4">
                    <iframe title={titulo} srcDoc={html} className="block mx-auto bg-white shadow-xl" style={{ width: 794, height: 1122 * hojas + 8, border: 0 }} />
                </div>
            </div>
        </div>,
        document.body,
    );
}

/** kWh/año de un CEE simulado (RES080_FM). Vacío = null (se estima). */
function KwhSim({ label, hint, value, onChange }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2 max-md:flex-col max-md:gap-2">
            <div className="min-w-0">
                <span className="text-xs text-white/60 font-bold">{label}</span>
                <p className="text-[11px] text-white/30 mt-0.5 leading-snug">{hint}</p>
            </div>
            <input type="number" min="0" step="1" className={`${INPUT} md:max-w-[160px] tabular-nums`} placeholder="kWh/año"
                value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} />
        </div>
    );
}

export function ViaFmPanel({ expedienteId, expediente = null, results = null, onNumeroCambiado }) {
    const { showConfirm, showAlert } = useModal();
    const [vista, setVista] = useState(null);         // { titulo, html }
    const [avisoAbierto, setAvisoAbierto] = useState(false);
    const [generando, setGenerando] = useState(null); // el `genera` en curso
    const [via, setVia] = useState(null);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [cambiando, setCambiando] = useState(false);
    const [guardado, setGuardado] = useState(null); // 'guardando' | 'ok' | 'error'
    const timer = useRef(null);
    const ultimo = useRef(null);

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/via-fm`);
            setVia(data);
            setDatos(data.contexto?.datos || {});
            ultimo.current = JSON.stringify(data.contexto?.datos || {});
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
    }, [expedienteId]);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => () => clearTimeout(timer.current), []);

    const guardar = useCallback(async (nuevos) => {
        const json = JSON.stringify(nuevos);
        if (json === ultimo.current) return;
        setGuardado('guardando');
        try {
            const { data } = await axios.put(`/api/expedientes/${expedienteId}/via-fm/datos`, nuevos);
            ultimo.current = json;
            if (data?.via) setVia(data.via);
            setGuardado('ok');
        } catch (e) {
            setGuardado('error');
        }
    }, [expedienteId]);

    const datosRef = useRef(null);
    datosRef.current = datos;
    const cambiar = (patch) => {
        const nuevos = { ...datosRef.current, ...patch };
        datosRef.current = nuevos;
        setDatos(nuevos);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => guardar(nuevos), AUTOSAVE_MS);
    };

    const cambiarVia = async () => {
        if (!via) return;
        const activar = !via.activa;
        const num = via.numero_expediente;
        const ficha = num.includes('RES093') ? 'RES093' : num.includes('RES080') ? 'RES080' : 'RES060';
        const destino = activar ? num.replace(/^(\d{2})(RES060|RES080|RES093)_\d+$/, `$1${ficha}FM_…`) : num.replace(/^(\d{2})(RES060|RES080|RES093)FM_\d+$/, `$1${ficha}_…`);
        const ok = await showConfirm(
            activar
                ? `El expediente pasa a la vía del FACTOR MULTIPLICADOR (${via.contexto?.fichaOficial?.codigo}).\n\nLa vía FM tiene su propia serie: ${num} pasará a ser ${destino} (el siguiente libre). Se renombra la carpeta de Drive y queda en el historial. Los documentos ya generados con el número antiguo hay que volver a generarlos.`
                : `El expediente vuelve a la vía VIGENTE.\n\n${num} pasará a ser ${destino} (el siguiente libre de la serie normal). Los datos de la vía FM se conservan por si vuelve.`,
            activar ? 'Pasar a la vía FM' : 'Volver a la vía vigente',
            'warning',
            { confirmar: activar ? 'Pasar a la vía FM' : 'Volver a la vigente', cancelar: 'No cambiar' },
        );
        if (!ok) return;
        setCambiando(true);
        try {
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/via-fm`, { activar });
            if (data?.via) { setVia(data.via); setDatos(data.via.contexto?.datos || {}); ultimo.current = JSON.stringify(data.via.contexto?.datos || {}); }
            onNumeroCambiado?.(data);
            showAlert(data.sinCambios ? 'El expediente ya estaba en esa vía.' : `Nuevo número: ${data.newNumber} (antes ${data.oldNumber}).`, 'Vía cambiada', 'success');
        } catch (e) {
            showAlert(e.response?.data?.error || e.message, 'No se ha cambiado la vía', 'error');
        } finally {
            setCambiando(false);
        }
    };

    // Maqueta el documento con los datos de AHORA (los del panel, aunque el
    // autoguardado no haya salido aún) y el expediente abierto.
    const maquetar = (d) => GENERADORES_FM[d.genera]?.(expediente, via?.contexto || {}, datosRef.current || {});
    const verDocumento = (d) => {
        const html = maquetar(d);
        if (html) setVista({ titulo: d.label, html });
    };
    const generarDocumento = async (d) => {
        if (!expediente) return;
        if (d.estado === 'firmado' && !(await showConfirm(
            'Este documento ya está FIRMADO en su apartado. Si lo vuelves a generar, el borrador nuevo sustituye al anterior y habrá que firmarlo otra vez; el firmado no se borra.',
            'Volver a generar', 'warning', { confirmar: 'Generar de nuevo', cancelar: 'No' },
        ))) return;
        setGenerando(d.genera);
        try {
            // Lo del panel, guardado antes: el documento y los datos tienen que decir lo mismo.
            clearTimeout(timer.current);
            await guardar(datosRef.current || {});
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/via-fm/documento/${d.genera}`, { html: maquetar(d) });
            if (data?.via) setVia(data.via);
            const donde = d.firma === 'instalador' ? 'El instalador lo verá en su enlace, junto al CIFO.' : 'El cliente lo verá en su enlace de firma.';
            showAlert(`Guardado en «6. ANEXOS CAE» como «${data.fichero}». ${donde} No se ha enviado nada.`, 'Documento generado', 'success');
        } catch (e) {
            showAlert(e.response?.data?.error || e.message, 'No se ha generado', 'error');
        } finally {
            setGenerando(null);
        }
    };

    // El aviso de esperar al 15/01/2027 se apunta en los datos de la vía en cuanto sale.
    const apuntarAviso = async (aviso) => {
        clearTimeout(timer.current);
        const nuevos = { ...datosRef.current, aviso_espera: aviso };
        datosRef.current = nuevos;
        setDatos(nuevos);
        await guardar(nuevos);
    };

    if (error) return <p className="text-sm text-amber-300">No se pudo leer la vía FM: {error}</p>;
    if (!via || !datos) return <p className="text-sm text-white/40">Cargando la vía del factor multiplicador…</p>;
    if (!via.admite) return <p className="text-sm text-white/40">La vía del factor multiplicador solo existe para RES060, RES080 y RES093.</p>;

    const ctx = via.contexto || {};
    const hib = !!ctx.hibridacion;
    // RES080_FM: rehabilitación profunda. No lleva caldera retirada, BT, mantenimiento ni -S;
    // sí los kWh de los dos CEE SIMULADOS mientras no estén sus CEE.
    const reh = !!ctx.rehabilitacion;
    const bloque = ctx.tipologia?.clase === 'bloque';
    const vh = via.vivienda_habitual;
    const docs = via.documentos || [];
    const pendientes = docs.filter((d) => d.required && !['firmado', 'aportado', 'registrado'].includes(d.estado)).length;
    const facturas = Array.isArray(datos.facturas_luz) ? datos.facturas_luz : [];
    const setFactura = (i, patch) => cambiar({ facturas_luz: facturas.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
    // Las dos cifras (las de la pestaña Económico): lo que decide si merece la pena pasar.
    const cifras = expediente && results ? cifrasViaFm(expediente, results, { rateMwh: getClientCaeRate(expediente).rate }) : null;
    const hayCifras = !!cifras && (cifras.fm.kwh > 0 || cifras.general.kwh > 0);
    const gana = cifras?.gana;
    const aprox = cifras?.estimada ? '≈ ' : '';
    const aviso = datos.aviso_espera;
    const respuesta = datos.espera_cliente || null;

    return (
        <div className="space-y-8">
            {/* 1 · La vía */}
            <div className={`rounded-2xl border p-5 ${via.activa ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
                <div className="flex items-start justify-between gap-4 max-md:flex-col">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{via.activa ? 'Va por la vía del factor multiplicador' : 'Va por la vía vigente'}</p>
                        <p className="text-lg font-black text-white mt-1">
                            {via.numero_expediente}
                            {via.activa && <span className="ml-2 text-brand">{ctx.fichaOficial?.codigo}</span>}
                        </p>
                        <p className="text-[12px] text-white/50 mt-1 leading-snug">{via.activa ? ctx.fichaOficial?.titulo : `Si pasa a la vía FM, su ficha sería la ${ctx.fichaOficial?.codigo}: ${ctx.fichaOficial?.titulo}.`}</p>
                        {hib && ctx.fichaOficial?.sinZona && <p className="text-[11px] text-amber-300 mt-2">No consta la zona climática: se toma la ficha de la zona D. Revisa la zona en la simulación.</p>}
                        {via.activa && !reh && <p className="text-[11px] text-white/40 mt-2">El CEE inicial se sigue haciendo, como plan B: la vía FM no lo pide (punto 11 solo exige el posterior).</p>}
                    </div>
                    <div className="shrink-0 text-right max-md:text-left">
                        <button
                            type="button"
                            onClick={cambiarVia}
                            disabled={cambiando || !!via.bloqueo}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${
                                via.activa ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-brand text-black hover:brightness-110'
                            }`}
                        >
                            {cambiando ? 'Cambiando…' : via.activa ? 'Volver a la vía vigente' : 'Pasar a la vía FM'}
                        </button>
                        {via.bloqueo && <p className="text-[11px] text-amber-300 mt-2 max-w-xs">{via.bloqueo}</p>}
                        {!via.bloqueo && <p className="text-[10px] text-white/30 mt-2 max-w-xs">Cambiar de vía cambia el número (serie propia).</p>}
                    </div>
                </div>

                {/* Las dos cifras, para decidir de un vistazo */}
                {hayCifras && (
                    <div className="mt-4 grid grid-cols-3 gap-2 max-md:grid-cols-1">
                        <Cifra titulo={`Vía vigente · ${cifras.fichaGeneral}`} valor={`${aprox}${eur0(cifras.general.eur)}`} sub={kwh0(cifras.general.kwh)} />
                        <Cifra titulo={`Vía FM · ${ctx.fichaOficial?.codigo || 'FM'}`} valor={`${aprox}${eur0(cifras.fm.eur)}`} sub={kwh0(cifras.fm.kwh)} tono="fm" />
                        <Cifra
                            titulo="El cliente gana con la FM"
                            valor={gana == null ? '—' : `${aprox}${gana >= 0 ? '+' : '−'}${eur0(Math.abs(gana))}`}
                            sub={gana != null && cifras.general.eur > 0 ? `${gana >= 0 ? '+' : ''}${Math.round((gana / cifras.general.eur) * 100)} % · se presenta desde el 15/01/2027` : null}
                            tono={gana > 0 ? 'gana' : gana != null ? 'pierde' : 'neutro'}
                        />
                    </div>
                )}
                {hayCifras && cifras.estimada && (
                    <p className="mt-2 text-[11px] text-white/40">
                        ≈ Cifras estimadas con la simulación: el expediente aún no tiene CEE. La definitiva la da el CEE.
                        {cifras.acs ? ' La simulación no lleva el ACS por la aerotermia: la cifra FM supone que se añade un depósito.' : ''}
                    </p>
                )}
                {hayCifras && cifras.bloquea.length > 0 && (
                    <div className="mt-2 text-[11px] text-amber-300 space-y-0.5">{cifras.bloquea.map((b) => <p key={b}>⚠ {b}</p>)}</div>
                )}

                {/* Proponérselo al cliente ANTES de cambiar: esperar al 15/01/2027 */}
                {!via.activa && (
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-start justify-between gap-4 max-md:flex-col">
                        <div className="min-w-0 text-[12px] text-white/60 leading-snug">
                            <p className="font-bold text-white/80">¿Se lo proponemos al cliente?</p>
                            <p className="text-[11px] text-white/40 mt-0.5">
                                La vía FM se presenta desde el {FM_PRESENTACION.desdeTxt}: si el cliente acepta esperar, se pasa el expediente a la FM.
                                {aviso?.at ? ` Propuesta enviada el ${fechaEs(aviso.at)}${aviso.a?.length ? ` a ${aviso.a.join(', ')}` : ''}.` : ''}
                            </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2 max-md:items-start">
                            <button type="button" onClick={() => setAvisoAbierto(true)} disabled={!expediente}
                                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white/10 text-white hover:bg-white/20 disabled:opacity-40">
                                {aviso?.at ? 'Volver a proponérselo' : 'Proponer esperar al FM'}
                            </button>
                            <div className="flex bg-bkg-elevated p-1 rounded-xl border border-white/5">
                                {[{ v: 'acepta', l: 'ACEPTA' }, { v: 'rechaza', l: 'NO QUIERE' }, { v: null, l: 'SIN RESPUESTA' }].map((o) => (
                                    <button key={String(o.v)} type="button" onClick={() => cambiar({ espera_cliente: o.v })}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${respuesta === o.v ? 'bg-brand text-black shadow' : 'text-white/30 hover:text-white/60'}`}>
                                        {o.l}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {!via.activa && respuesta === 'acepta' && (
                    <p className="mt-3 text-[12px] text-emerald-300 font-bold">El cliente acepta esperar: pulsa «Pasar a la vía FM» y genera los documentos de abajo.</p>
                )}
            </div>
            <AvisoEsperaFmModal
                isOpen={avisoAbierto}
                onClose={() => setAvisoAbierto(false)}
                expediente={expediente}
                cifras={cifras}
                onEnviado={apuntarAviso}
            />

            {/* 2 · Lo que decide qué se pide */}
            <div>
                <div className="mb-3 pb-2 border-b border-white/5 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Lo que decide qué documentos pide</h4>
                    <span className="text-[10px] text-white/30">
                        {guardado === 'guardando' ? 'Guardando…' : guardado === 'ok' ? 'Guardado' : guardado === 'error' ? <span className="text-amber-300">No se ha guardado</span> : ''}
                    </span>
                </div>
                <div className="divide-y divide-white/5">
                    <Opciones
                        label={reh ? "Tipología (fija el f_M)" : "Tipología (punto 1, la declara el instalador)"}
                        hint={`Ahora: ${ctx.tipologia?.label}${ctx.tipologia?.de === 'simulacion' ? ' (de la simulación)' : ''}. Cambia la de la simulación solo si la declaración del instalador dice otra cosa.`}
                        value={datos.tipologia || null}
                        onChange={(v) => cambiar({ tipologia: v })}
                        opciones={[{ v: null, l: 'LA DE LA SIMULACIÓN' }, { v: 'unifamiliar', l: 'UNIFAMILIAR' }, { v: 'piso', l: 'PISO' }, { v: 'bloque', l: 'CENTRALIZADO' }]}
                    />
                    {reh && (
                        <>
                            <KwhSim label="EF_simBC · CEE simulado con SOLO la bomba (doc. 11)" hint="Energía final (kWh/año) del edificio de antes con solo la caldera cambiada por la bomba. Vacío: se estima desde el CEE inicial y el final, y la cifra sale «≈»." value={datos.ef_sim_bc} onChange={(v) => cambiar({ ef_sim_bc: v })} />
                            <KwhSim label="EF_simRest · CEE simulado con TODO menos la bomba (doc. 10)" hint="Energía final (kWh/año) con la envolvente nueva y la caldera de antes. Vacío: se estima." value={datos.ef_sim_rest} onChange={(v) => cambiar({ ef_sim_rest: v })} />
                        </>
                    )}
                    {!reh && <Opciones label="Consumidor vulnerable (ficha -S)" hint="Bono social a su nombre. Pide el Anexo B y la documentación del apartado 5." value={!!datos.vulnerable} onChange={(v) => cambiar({ vulnerable: v })} opciones={SI_NO} />}
                    {!reh && datos.vulnerable && (
                        <>
                            <Opciones label="Vive de alquiler o cedida" hint="Pide el contrato y el compromiso de 2 años del arrendatario." value={!!datos.inquilino} onChange={(v) => cambiar({ inquilino: v })} opciones={SI_NO} />
                            {bloque && <Opciones label="Edificio centralizado con otros pisos" hint="Pide el certificado del presidente de la comunidad con las cuotas." value={!!datos.centralizado_mixto} onChange={(v) => cambiar({ centralizado_mixto: v })} opciones={SI_NO} />}
                        </>
                    )}
                    {!hib && !reh && (
                        <Opciones label="¿Se desmonta la caldera?" hint="NO = queda en preinstalación (no hibridada): el instalador justifica que la bomba cubre toda la demanda." value={datos.caldera_retirada ?? null} onChange={(v) => cambiar({ caldera_retirada: v })} opciones={SI_NO_NS} />
                    )}
                    {reh ? null : hib ? (
                        <Opciones label="¿Se cambia también la caldera?" hint="Pide las fichas técnicas de la caldera nueva y de la bomba (punto 13 de la hibridación)." value={!!datos.caldera_nueva} onChange={(v) => cambiar({ caldera_nueva: v })} opciones={SI_NO} />
                    ) : (
                        <Opciones label="¿Aumenta la potencia eléctrica?" hint="SÍ pide el certificado de baja tensión con el aumento (punto 9)." value={datos.bt_aplica ?? null} onChange={(v) => cambiar({ bt_aplica: v })} opciones={SI_NO_NS} />
                    )}
                    {!bloque && (
                        <Opciones label={`Vivienda habitual (punto ${reh ? 3 : 4})`} hint="Facturas de la luz del invierno anterior, o la curva de consumo horario firmada por la distribuidora." value={datos.vivienda_habitual || 'facturas'} onChange={(v) => cambiar({ vivienda_habitual: v })} opciones={[{ v: 'facturas', l: 'FACTURAS' }, { v: 'curva', l: 'CURVA HORARIA' }]} />
                    )}
                    {!reh && <><Opciones
                        label="Oferta de mantenimiento (punto 8)"
                        hint="La casilla que sale marcada en el documento. Sin decidir, las dos van en blanco y el propietario la marca a mano (solo en papel)."
                        value={datos.mantenimiento || null}
                        onChange={(v) => cambiar({ mantenimiento: v })}
                        opciones={[{ v: 'acepta', l: 'LA ACEPTA' }, { v: 'desiste', l: 'DESISTE' }, { v: null, l: 'SIN DECIDIR' }]}
                    />
                    <div className="flex items-start justify-between gap-4 py-2 max-md:flex-col max-md:gap-2">
                        <div className="min-w-0">
                            <span className="text-xs text-white/60 font-bold">Importe de la oferta de mantenimiento</span>
                            <p className="text-[11px] text-white/30 mt-0.5 leading-snug">Como se escribe en el documento («180 €/año, IVA incluido»). Vacío: una línea para completarlo a mano.</p>
                        </div>
                        <input className={`${INPUT} md:max-w-[260px]`} placeholder="180 €/año, IVA incluido" value={datos.mantenimiento_importe || ''} onChange={(e) => cambiar({ mantenimiento_importe: e.target.value })} />
                    </div></>}
                    {!reh && datos.vulnerable && (
                        <>
                            <Opciones
                                label="Anexo B · casilla que marca"
                                hint="Familia numerosa con la renta de vulnerable, de vulnerable severo, o no es familia numerosa. Sin decidir: en blanco, se marca a mano."
                                value={datos.anexo_b_casilla || null}
                                onChange={(v) => cambiar({ anexo_b_casilla: v })}
                                opciones={[{ v: 'renta', l: 'F.N. VULNERABLE' }, { v: 'severo', l: 'F.N. SEVERO' }, { v: 'no_fn', l: 'NO ES F.N.' }, { v: null, l: 'SIN DECIDIR' }]}
                            />
                            <Opciones
                                label="Anexo B · quién es el consumidor vulnerable"
                                hint="Por defecto, el titular. Si el bono social es de otra persona (el inquilino, por ejemplo), sus datos."
                                value={!!datos.vulnerable_persona}
                                onChange={(v) => cambiar({ vulnerable_persona: v ? { nombre: '', nif: '', domicilio: '', telefono: '', email: '' } : null })}
                                opciones={[{ v: false, l: 'EL TITULAR' }, { v: true, l: 'OTRA PERSONA' }]}
                            />
                            {datos.vulnerable_persona && (
                                <div className="grid grid-cols-2 gap-2 py-2 max-md:grid-cols-1">
                                    {[['nombre', 'Nombre y apellidos'], ['nif', 'NIF/NIE'], ['domicilio', 'Domicilio'], ['telefono', 'Teléfono'], ['email', 'Correo electrónico']].map(([k, ph]) => (
                                        <input key={k} className={INPUT} placeholder={ph} value={datos.vulnerable_persona?.[k] || ''}
                                            onChange={(e) => cambiar({ vulnerable_persona: { ...datos.vulnerable_persona, [k]: e.target.value } })} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* 2.b · Facturas de la luz */}
            {!bloque && (datos.vivienda_habitual || 'facturas') === 'facturas' && vh && (
                <div>
                    <div className="mb-3 pb-2 border-b border-white/5">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Facturas de la luz · {fechaEs(vh.periodo?.desde)} a {fechaEs(vh.periodo?.hasta)}</h4>
                        <p className="text-[11px] text-white/30 mt-1">
                            Del 1 de noviembre al 31 de marzo del invierno anterior a la obra{via.inicio_obra ? ` (empieza el ${fechaEs(via.inicio_obra)}, primera factura)` : ' (sin facturas de obra: se toma el invierno pasado)'}. Sin huecos, un solo CUPS, la dirección del Catastro y más de 75 kWh/mes de media.
                        </p>
                    </div>
                    <div className="space-y-2">
                        {facturas.map((f, i) => (
                            <div key={i} className="grid grid-cols-[1fr_1fr_90px_1.4fr_auto_auto] gap-2 items-center max-md:grid-cols-2">
                                <input type="date" className={INPUT} value={f.desde || ''} onChange={(e) => setFactura(i, { desde: e.target.value || null })} title="Desde" />
                                <input type="date" className={INPUT} value={f.hasta || ''} onChange={(e) => setFactura(i, { hasta: e.target.value || null })} title="Hasta" />
                                <input type="number" min="0" className={INPUT} placeholder="kWh" value={f.kwh ?? ''} onChange={(e) => setFactura(i, { kwh: e.target.value === '' ? null : Number(e.target.value) })} />
                                <input className={INPUT} placeholder="CUPS (ES…)" value={f.cups || ''} onChange={(e) => setFactura(i, { cups: e.target.value })} />
                                <select className={INPUT} value={f.misma_direccion === true ? 'si' : f.misma_direccion === false ? 'no' : ''} onChange={(e) => setFactura(i, { misma_direccion: e.target.value === 'si' ? true : e.target.value === 'no' ? false : null })} title="¿Dirección de suministro = la catastral?">
                                    <option value="">¿Dirección?</option>
                                    <option value="si">Dirección OK</option>
                                    <option value="no">Otra dirección</option>
                                </select>
                                <button type="button" onClick={() => cambiar({ facturas_luz: facturas.filter((_, j) => j !== i) })} className="px-2 text-white/30 hover:text-white" title="Quitar">✕</button>
                            </div>
                        ))}
                        <button type="button" onClick={() => cambiar({ facturas_luz: [...facturas, { desde: null, hasta: null, kwh: null, cups: facturas[0]?.cups || null, misma_direccion: null }] })}
                            className="px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white/5 text-white/60 hover:bg-white/10">
                            + Añadir factura
                        </button>
                    </div>
                    <div className={`mt-4 rounded-xl border px-4 py-3 text-[12px] ${vh.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-200'}`}>
                        <p className="font-bold">
                            {vh.ok ? `Cumple el punto ${reh ? 3 : 4}` : `Todavía no cumple el punto ${reh ? 3 : 4}`}
                            {vh.mediaMensual != null && ` · media ${vh.mediaMensual} kWh/mes`}
                            {vh.cups && ` · CUPS ${vh.cups}`}
                        </p>
                        {vh.avisos?.length > 0 && <ul className="mt-1 list-disc pl-5 space-y-0.5">{vh.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
                        <p className="mt-1 text-white/40">Las facturas en PDF se suben al apartado «FM {reh ? 3 : 4} · Vivienda habitual» de Documentación; aquí solo se apuntan sus datos para comprobarlos.</p>
                    </div>
                </div>
            )}

            {via.facturas_fuera_de_plazo?.length > 0 && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200">
                    <p className="font-bold">Facturas de la obra fuera de la ventana del FM (posteriores al 22/03/2026 y anteriores al 01/12/2027):</p>
                    <ul className="mt-1 list-disc pl-5">{via.facturas_fuera_de_plazo.map((f, i) => <li key={i}>{f.numero || 'sin nº'} · {fechaEs(f.fecha)}</li>)}</ul>
                </div>
            )}

            {/* 3 · Los documentos de la ficha */}
            <div>
                <div className="mb-3 pb-2 border-b border-white/5 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Documentos que pide la ficha {ctx.fichaOficial?.codigo}</h4>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${pendientes ? 'text-amber-300' : 'text-emerald-300'}`}>{pendientes ? `${pendientes} pendientes` : 'Todo aportado'}</span>
                </div>
                {!via.activa && <p className="text-[11px] text-white/40 mb-3">Vista previa: esto es lo que pediría si pasa a la vía FM. Mientras no pase, el gestor de Documentación no los pide.</p>}
                <div className="space-y-1.5">
                    {docs.map((d) => {
                        const chip = ESTADO_CHIP[d.estado] || ESTADO_CHIP.pendiente;
                        return (
                            <div key={d.key} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                                <span className="w-10 shrink-0 text-[11px] font-black text-brand/80 pt-0.5">{d.punto}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] text-white leading-snug">
                                        {d.label}
                                        {!d.required && <span className="ml-2 text-[10px] text-white/30 uppercase font-bold">si aplica</span>}
                                    </p>
                                    <p className="text-[11px] text-white/35 leading-snug mt-0.5">{d.help}{d.condicion ? ` ${d.condicion}` : ''}</p>
                                    <p className="text-[10px] text-white/30 mt-1 uppercase tracking-wider font-bold">
                                        {QUIEN[d.quien] || d.quien}
                                        {d.genera
                                            ? ` · lo genera la app · ${DONDE_SE_FIRMA[d.firma] || 'se firma en su enlace'}`
                                            : d.slot ? ' · se sube en Documentación' : d.cubre ? ' · lo cubre un documento del expediente' : ''}
                                    </p>
                                    {d.genera && (
                                        <div className="mt-2 space-y-1.5">
                                            {d.borrador?.at && (
                                                <p className="text-[11px] text-sky-300/80">
                                                    Generado el {fechaEs(d.borrador.at)}{d.borrador.signed_at ? ` · firmado el ${fechaEs(d.borrador.signed_at)}` : ''}. El borrador está en «6. ANEXOS CAE»; el firmado, en su apartado de Documentación.
                                                </p>
                                            )}
                                            {via.activa && expediente && avisosDocumentoFm(d.genera, expediente, ctx, datos).map((a) => (
                                                <p key={a} className="text-[11px] text-amber-300/90">· {a}</p>
                                            ))}
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" disabled={!expediente} onClick={() => verDocumento(d)}
                                                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40">
                                                    Ver
                                                </button>
                                                {via.activa && (
                                                    <button type="button" disabled={!expediente || !!generando} onClick={() => generarDocumento(d)}
                                                        className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-brand text-black hover:brightness-110 disabled:opacity-40">
                                                        {generando === d.genera ? 'Generando…' : d.borrador?.at ? 'Volver a generar' : 'Generar para firmar'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${chip.c}`}>{chip.t}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {vista && <VistaPreviaFm titulo={vista.titulo} html={vista.html} onCerrar={() => setVista(null)} />}
        </div>
    );
}

export default ViaFmPanel;
