import React, { useState } from 'react';
import axios from 'axios';
import { firmanteCifo, firmanteMemoriaRite, firmanteIncompleto } from '../logic/instaladorPendientes';
import { PrescriptorDetailModal } from '../../admin/views/PrescriptorDetailModal';

// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN FIRMA CADA DOCUMENTO, en el momento de mandarlos a firmar.
//
// No es la misma persona, y esa es toda la cuestión:
//   · el CERTIFICADO CIFO lo firma quien REPRESENTA a la empresa;
//   · la MEMORIA RITE la firma quien está HABILITADO ante Industria, que puede
//     ser un técnico con su propio carné.
// En un autónomo suelen coincidir; en una empresa, casi nunca. Mandar los dos
// documentos "al instalador" sin mirar esto es cómo acababan firmados por quien
// no podía firmarlos.
//
// Si la ficha no lo declara, se asume la persona de contacto — y eso se dice en
// ámbar, con el botón para arreglarlo ahí mismo: el envío es el último momento
// en que alguien va a mirar este dato.
//
// REGLA — lo que falta se PIDE AQUÍ, no se manda a la ficha. Si no consta quién
// firma, la propia tarjeta trae el formulario (nombre, apellidos, DNI y, en la
// memoria, el carné si firma un técnico con carné propio) y se guarda en la
// ficha del instalador por `PATCH /prescriptores/:id/firmantes`, que solo toca
// esos campos. Y si se está ASUMIENDO la persona de contacto, un clic la declara.
// ─────────────────────────────────────────────────────────────────────────────

const FIRMANTE_DE = {
    cifo: { titulo: 'Firma el Certificado CIFO', resolver: firmanteCifo },
    rite: { titulo: 'Firma la Memoria RITE', resolver: firmanteMemoriaRite },
};

// ── Dónde se escribe el firmante de cada documento ─────────────────────────
// Los MISMOS campos que leen `firmanteCifo` / `firmanteMemoriaRite`: si se
// escribiera en otro sitio, el documento seguiría diciendo que no consta.
//   · autónomo            → él mismo (nombre_responsable / nif_responsable)
//   · CIFO en una empresa → representante legal (representante_distinto)
//   · memoria RITE        → representante legal, o un TÉCNICO con carné propio
const MAPA = {
    responsable: { nombre: 'nombre_responsable', apellidos: 'apellidos_responsable', dni: 'nif_responsable' },
    representante: { nombre: 'representante_nombre', apellidos: 'representante_apellidos', dni: 'representante_dni', flag: 'representante_distinto' },
    tecnico: { nombre: 'tecnico_firmante_nombre', apellidos: 'tecnico_firmante_apellidos', dni: 'tecnico_firmante_dni', carnet: 'tecnico_firmante_carnet_rite', flag: 'tecnico_firmante_distinto' },
};

// A quién se declara por defecto para ese documento.
function destinoPorDefecto(k, p) {
    if (p.es_autonomo) return 'responsable';
    if (k === 'rite' && p.tecnico_firmante_distinto) return 'tecnico';
    return 'representante';
}

function valoresDe(destino, p) {
    const m = MAPA[destino];
    return {
        nombre: p[m.nombre] || '',
        apellidos: p[m.apellidos] || '',
        dni: p[m.dni] || '',
        carnet: m.carnet ? (p[m.carnet] || '') : '',
    };
}

function camposAGuardar(destino, v) {
    const m = MAPA[destino];
    const out = { [m.nombre]: v.nombre, [m.apellidos]: v.apellidos, [m.dni]: v.dni };
    if (m.carnet) out[m.carnet] = v.carnet;
    if (m.flag) out[m.flag] = true;
    return out;
}

export function FirmantesEnvio({ docs = [], pres = {}, onFichaActualizada,
    opcionesCifo = [], firmanteCifo: firmanteCifoRolSel = null, onFirmanteCifo = null }) {
    // Ficha recargada tras editarla: el bloque tiene que decir la verdad en
    // cuanto se guarda, sin esperar a que el padre recargue el expediente.
    const [fichaLocal, setFichaLocal] = useState(null);
    const [ficha, setFicha] = useState(null);        // ficha abierta para editar
    const [abriendo, setAbriendo] = useState(false);
    // Formulario en línea por documento: { [k]: { destino, v: {nombre, apellidos, dni, carnet} } }
    const [form, setForm] = useState({});
    const [guardando, setGuardando] = useState(null);   // k que se está guardando
    const [errorForm, setErrorForm] = useState({});

    const p = fichaLocal || pres;
    const lista = docs.filter(k => FIRMANTE_DE[k]);
    if (!lista.length) return null;

    const recargar = async () => {
        if (!p?.id_empresa) return null;
        try {
            const { data } = await axios.get(`/api/prescriptores/${p.id_empresa}`);
            setFichaLocal(data);
            return data;
        } catch { return null; }   // se queda la ficha anterior
    };

    // PrescriptorDetailModal NO carga por id: hace `setP(prescriptor)` con lo que
    // se le pase. Con media ficha abriría un formulario vacío y guardaría nulos
    // encima de los datos buenos, así que se trae entera antes de abrirla.
    const abrirFicha = async () => {
        if (abriendo) return;
        if (!p?.id_empresa) { setFicha(p); return; }
        setAbriendo(true);
        try {
            const { data } = await axios.get(`/api/prescriptores/${p.id_empresa}`);
            setFicha(data);
        } catch {
            setFicha(p);
        } finally {
            setAbriendo(false);
        }
    };

    // Al cerrar se relee la ficha y se le pasa al popup: con ella genera el
    // documento con el firmante NUEVO, sin tener que cerrar y reabrir el envío.
    const cerrarFicha = async () => {
        setFicha(null);
        const fresca = await recargar();
        if (fresca) onFichaActualizada?.(fresca);
    };

    const abrirForm = (k, destino = destinoPorDefecto(k, p)) => {
        setErrorForm(e => ({ ...e, [k]: null }));
        setForm(prev => ({ ...prev, [k]: { destino, v: valoresDe(destino, p) } }));
    };
    const cerrarForm = (k) => setForm(prev => { const n = { ...prev }; delete n[k]; return n; });
    // Al cambiar de "representante" a "técnico" se conserva lo ya tecleado.
    const cambiarDestino = (k, destino) => setForm(prev => {
        const v = prev[k]?.v || {};
        const tecleado = (v.nombre || v.apellidos || v.dni) ? { nombre: v.nombre, apellidos: v.apellidos, dni: v.dni } : {};
        return { ...prev, [k]: { destino, v: { ...valoresDe(destino, p), ...tecleado } } };
    });
    const setValor = (k, campo, valor) =>
        setForm(prev => ({ ...prev, [k]: { ...prev[k], v: { ...prev[k].v, [campo]: valor } } }));

    const guardar = async (k, cambios) => {
        if (!p?.id_empresa) { setErrorForm(e => ({ ...e, [k]: 'Esta ficha no tiene identificador: edítala desde la ficha.' })); return; }
        setGuardando(k);
        setErrorForm(e => ({ ...e, [k]: null }));
        try {
            const { data } = await axios.patch(`/api/prescriptores/${p.id_empresa}/firmantes`, cambios);
            // La ruta devuelve la fila entera: se usa como ficha nueva, y el popup
            // la recibe para generar el documento con el firmante ya puesto.
            const fresca = { ...p, ...data };
            setFichaLocal(fresca);
            onFichaActualizada?.(fresca);
            cerrarForm(k);
        } catch (e) {
            setErrorForm(er => ({ ...er, [k]: e.response?.data?.error || e.message || 'No se pudo guardar' }));
        } finally {
            setGuardando(null);
        }
    };

    const guardarForm = (k) => {
        const f = form[k];
        const v = f?.v || {};
        if (!String(v.nombre || '').trim() || !String(v.dni || '').trim()) {
            setErrorForm(e => ({ ...e, [k]: 'Pon al menos el nombre y el DNI de quien firma.' }));
            return;
        }
        if (f.destino === 'tecnico' && !String(v.carnet || '').trim()) {
            setErrorForm(e => ({ ...e, [k]: 'Un técnico con carné propio firma con ese carné: indícalo.' }));
            return;
        }
        guardar(k, camposAGuardar(f.destino, v));
    };

    // "Sí, firma esta persona": la persona de contacto pasa a estar DECLARADA como
    // representante legal, con sus mismos datos. Un clic, sin teclear nada.
    const confirmarContacto = (k) => guardar(k, camposAGuardar('representante', valoresDe('responsable', p)));

    const inputCls = 'w-full min-w-0 bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/50 transition-all';

    // Se pinta con una función y NO como componente (<Formulario />): definido
    // dentro del render, un componente nuevo en cada tecla remontaría los inputs
    // y el cursor saltaría fuera del campo a cada letra.
    const formulario = (k) => {
        const f = form[k];
        if (!f) return null;
        const ocupado = guardando === k;
        return (
            <div className="mt-2 space-y-2">
                {/* En la memoria, la firma puede ser del representante o de un técnico
                    con su propio carné: son campos distintos de la ficha. */}
                {k === 'rite' && !p.es_autonomo && (
                    <div className="flex gap-1.5">
                        {[['representante', 'Representante legal'], ['tecnico', 'Técnico con carné propio']].map(([d, et]) => (
                            <button key={d} type="button" onClick={() => cambiarDestino(k, d)}
                                className={`flex-1 py-1.5 rounded-lg border text-[9.5px] font-black uppercase tracking-wider transition-all ${f.destino === d ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 text-white/40 hover:text-white'}`}>
                                {et}
                            </button>
                        ))}
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className={inputCls} placeholder="Nombre" value={f.v.nombre}
                        onChange={e => setValor(k, 'nombre', e.target.value)} />
                    <input className={inputCls} placeholder="Apellidos" value={f.v.apellidos}
                        onChange={e => setValor(k, 'apellidos', e.target.value)} />
                    <input className={inputCls} placeholder="DNI / NIE" value={f.v.dni}
                        onChange={e => setValor(k, 'dni', e.target.value)} />
                </div>
                {f.destino === 'tecnico' && (
                    <input className={inputCls} placeholder="Nº de carné RITE del técnico" value={f.v.carnet}
                        onChange={e => setValor(k, 'carnet', e.target.value)} />
                )}
                {errorForm[k] && <p className="text-[10.5px] text-red-400">{errorForm[k]}</p>}
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-white/30 leading-snug">
                        Se guarda en la ficha de {p.razon_social || 'el instalador'} y vale para los próximos envíos.
                    </p>
                    <div className="flex gap-1.5 shrink-0">
                        <button type="button" onClick={() => cerrarForm(k)} disabled={ocupado}
                            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/40 text-[9.5px] font-black uppercase tracking-wider hover:text-white disabled:opacity-40">
                            Cancelar
                        </button>
                        <button type="button" onClick={() => guardarForm(k)} disabled={ocupado}
                            className="px-3 py-1.5 rounded-lg bg-brand text-black text-[9.5px] font-black uppercase tracking-wider hover:brightness-110 disabled:opacity-50">
                            {ocupado ? 'Guardando…' : 'Guardar firmante'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                    {lista.length > 1 ? 'Quién firma cada documento' : 'Quién lo firma'}
                </p>
                <button type="button" onClick={abrirFicha} disabled={abriendo}
                    title={`Editar la ficha de ${p.razon_social || 'el instalador'}`}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                    {abriendo ? '…' : 'Editar ficha'}
                </button>
            </div>

            {lista.map(k => {
                const { titulo, resolver } = FIRMANTE_DE[k];
                // CIFO con DOS empresas: se ELIGE cuál lo firma. El documento no
                // lo dice (su recuadro va en blanco), así que no hay una respuesta
                // correcta que deducir: la pone quien envía.
                if (k === 'cifo' && opcionesCifo.length > 1) {
                    return (
                        <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                            <p className="text-[9.5px] uppercase tracking-wider font-bold text-white/35 mb-2">
                                {titulo} <span className="text-white/20 normal-case tracking-normal">· elige quién</span>
                            </p>
                            <div className="space-y-1.5">
                                {opcionesCifo.map(o => {
                                    const on = o.rol === firmanteCifoRolSel;
                                    return (
                                        <button key={o.rol} type="button" onClick={() => onFirmanteCifo?.(o.rol)}
                                            className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                            <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${on ? 'border-brand' : 'border-white/20'}`}>
                                                {on && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[12px] font-bold text-white leading-snug truncate">{o.empresa}</span>
                                                <span className="block text-[10px] text-white/40">
                                                    {o.etiqueta}{o.nif ? ` · ${o.nif}` : ''}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-white/30 leading-snug mt-2">
                                El certificado no lleva el nombre impreso: lo pone el certificado electrónico de quien lo firme.
                            </p>
                        </div>
                    );
                }
                const f = resolver(p);
                const sinDatos = firmanteIncompleto(f);
                const aviso = sinDatos || !f.declarado;
                const abierto = !!form[k];
                const ocupado = guardando === k;
                return (
                    <div key={k} className={`rounded-xl border px-3 py-2 ${aviso ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-[9.5px] uppercase tracking-wider font-bold text-white/35">{titulo}</p>
                            {!sinDatos && !abierto && (
                                <button type="button" onClick={() => abrirForm(k)}
                                    className="shrink-0 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors">
                                    Cambiar
                                </button>
                            )}
                        </div>
                        {sinDatos ? (
                            <>
                                <p className="text-[11px] text-amber-300/90 leading-snug mt-0.5">
                                    <b>No consta quién lo firma.</b> Dilo aquí{k === 'cifo' ? ` (${p.es_autonomo ? 'el propio autónomo' : 'el representante legal de la empresa'})` : ''}: sin él, saldría sin firmante.
                                </p>
                                {!abierto && (
                                    <button type="button" onClick={() => abrirForm(k)}
                                        className="mt-2 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[9.5px] font-black uppercase tracking-wider hover:bg-brand hover:text-black transition-all">
                                        Indicar quién firma
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-[12px] font-bold text-white leading-snug mt-0.5">
                                    {f.nombre}
                                    {f.dni ? <span className="text-white/40 font-medium"> · {f.dni}</span> : null}
                                </p>
                                <p className="text-[10px] text-white/40">
                                    {f.etiqueta}{f.carnet ? ` · Carné ${f.carnet}` : ''}
                                </p>
                                {!f.declarado && !abierto && (
                                    <>
                                        <p className="text-[10.5px] text-amber-300/90 leading-snug mt-1">
                                            Nadie ha declarado quién firma: se está asumiendo la persona de contacto.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            <button type="button" onClick={() => confirmarContacto(k)} disabled={ocupado}
                                                className="px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/40 text-brand text-[9.5px] font-black uppercase tracking-wider hover:bg-brand hover:text-black transition-all disabled:opacity-50">
                                                {ocupado ? 'Guardando…' : `Sí, firma ${f.nombre.split(' ')[0]}`}
                                            </button>
                                            <button type="button" onClick={() => abrirForm(k)} disabled={ocupado}
                                                className="px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-[9.5px] font-black uppercase tracking-wider hover:text-white transition-all disabled:opacity-50">
                                                Firma otra persona
                                            </button>
                                        </div>
                                        {errorForm[k] && <p className="text-[10.5px] text-red-400 mt-1">{errorForm[k]}</p>}
                                    </>
                                )}
                            </>
                        )}
                        {formulario(k)}
                    </div>
                );
            })}

            {/* La ficha va ENCIMA del envío: los popups van a z-[300]/[9999] y la
                ficha a z-[300], así que sin este envoltorio quedaría debajo. Un
                `relative z-…` crea contexto de apilamiento sin transform (con
                transform, su `position: fixed` dejaría de anclarse al viewport). */}
            {ficha && (
                <div className="relative z-[10000]">
                    <PrescriptorDetailModal
                        isOpen
                        prescriptor={ficha}
                        onClose={cerrarFicha}
                        onUpdated={recargar}
                    />
                </div>
            )}
        </div>
    );
}

export default FirmantesEnvio;
