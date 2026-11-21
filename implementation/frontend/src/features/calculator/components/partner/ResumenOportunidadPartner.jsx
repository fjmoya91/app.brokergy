import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { CSS_OPORTUNIDAD_PARTNER } from './estiloOportunidadPartner';
import { RequisitosFmModal } from './RequisitosFmModal';
import { ofrecerRevision } from '../../logic/revisionPartner';
import { SolicitarRevisionModal } from './SolicitarRevisionModal';

// ─────────────────────────────────────────────────────────────────────────────
// La OPORTUNIDAD vista por el PARTNER (Fran, 16/11/2026: rediseño de Claude Design
// aceptado con «las tres cosas»). Arriba de la calculadora, con la piel «carta de
// pago» (regla 164): dónde y de quién, en qué paso va, UNA cifra (el bono), la
// deducción del IRPF, la vía del FACTOR MULTIPLICADOR aparte y nunca sumada (con
// su popup de requisitos), con qué se ha calculado y UNA acción: la propuesta.
// El formulario de siempre sigue debajo para corregir datos.
//
// 17/11/2026 (Fran: «mucho espacio en blanco al lado del importe»): el bono va en
// DOS tarjetas paralelas con lo que tiene al lado (la vía FM, la opción 2 de la
// reforma o, si no hay, las cuentas), la acción arriba a la derecha y, con el bono
// por debajo de 3.000 €, «Solicitar revisión» (`POST /:id/peticion-revision`): se
// encarga el CEE inicial a la IA y su XML pasa la simulación a cálculo real.
//
// Solo cifras que el partner ya recibe: el bono y el IRPF de `result.financials`
// y el € de la vía FM de `result.financialsRes060FC`, que su navegador calcula
// con el precio FM al cliente (ya no se le quita, financialScrub). Ni MWh ni
// `via_fm`. La comisión NO va aquí: sus claves son margen y no le llegan.
// ─────────────────────────────────────────────────────────────────────────────

// Con el punto de miles también en 4 cifras («2.640 €»): `Intl` en es-ES no lo pone.
const eur = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
const num = (n, d = 0) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }).format(Number(n) || 0);

const PASOS = ['Simulación', 'Propuesta enviada', 'Aceptada', 'Expediente'];

/** Paso del recorrido (0..3) y la frase de debajo, por el estado y el expediente. */
export function pasoOportunidad(estado, expediente) {
    if (expediente) return { i: 3, texto: `Ya es el expediente ${expediente.numero_expediente}: lo llevamos nosotros.` };
    const e = String(estado || '').toUpperCase();
    if (e === 'ACEPTADA') return { i: 2, texto: 'Aceptada: le pedimos al cliente lo que falte para el CEE.' };
    if (e === 'PRE-ACEPTADO') return { i: 1, texto: 'El cliente ha dicho que sí: falta que la acepte con el enlace.' };
    if (e === 'ENVIADA') return { i: 1, texto: 'Propuesta enviada: falta que el cliente la acepte.' };
    if (e === 'RECHAZADA') return { i: 1, texto: 'El cliente la ha rechazado.' };
    return { i: 0, texto: 'Falta enviar la propuesta al cliente.' };
}

const COMBUSTIBLE = {
    gas_natural: 'gas natural', gas: 'gas natural', glp: 'propano', propano: 'propano', gasoleo: 'gasóleo',
    carbon: 'carbón', lena: 'leña', pellets: 'pellets', biomasa: 'biomasa', electrica: 'eléctrica', electricidad: 'eléctrica',
};

function titularConMunicipio(direccion, municipio) {
    const d = String(direccion || '').trim();
    const m = String(municipio || '').trim();
    if (!d) return <>Oportunidad</>;
    const k = m ? d.toUpperCase().indexOf(m.toUpperCase()) : -1;
    if (k < 0) return <>{d}</>;
    return <>{d.slice(0, k)}<span className="po-mark">{d.slice(k, k + m.length)}</span>{d.slice(k + m.length)}</>;
}

/**
 * Las cuentas del cliente, línea a línea, con las MISMAS cifras de `calculateFinancials`
 * (las del «Coste final» de Resultados y de la propuesta). El total es la suma de lo
 * que se imprime, redondeado a euros, para que la cuenta cuadre a la vista (regla 156).
 */
export function cuentasCliente(f) {
    const r = (n) => Math.round(Number(n) || 0);
    const obra = r(f?.presupuestoTotal ?? f?.presupuesto);
    if (!(obra > 0)) return null;
    const lineas = [
        { k: 'obra', texto: 'Presupuesto de la obra', eur: obra },
        { k: 'bono', texto: 'Bono CAE', eur: -r(f.caeBonus) },
    ];
    if (r(f.irpfCaeAmount) > 0) lineas.push({ k: 'irpfbono', texto: 'IRPF a pagar por el bono', eur: r(f.irpfCaeAmount) });
    if (r(f.irpfDeduction) > 0) lineas.push({ k: 'irpf', texto: 'Deducción del IRPF', nota: 'estimada, en su declaración', eur: -r(f.irpfDeduction) });
    if (r(f.caeMaintenanceCost) > 0) lineas.push({ k: 'gestion', texto: 'Gestión del expediente', eur: r(f.caeMaintenanceCost) });
    const total = Math.max(0, lineas.reduce((s, l) => s + l.eur, 0));
    return { obra, lineas, total };
}

const signo = (n) => (n < 0 ? `− ${eur(-n)}` : `+ ${eur(n)}`);

function ListaCuentas({ cuentas }) {
    return (
        <ul>
            {cuentas.lineas.map(l => (
                <li key={l.k} className={l.k === 'obra' ? 'obra' : ''}>
                    <span>{l.texto}{l.nota ? <small> · {l.nota}</small> : null}</span>
                    <b>{l.k === 'obra' ? eur(l.eur) : signo(l.eur)}</b>
                </li>
            ))}
        </ul>
    );
}

// La deducción llega con la renta, no al acabar la obra: el total lo dice.
function TotalCuentas({ cuentas }) {
    const conIrpf = cuentas.lineas.some(l => l.k === 'irpf');
    return (
        <div className="po-total">
            <span>La obra le queda en{conIrpf && <small>tras la deducción en su declaración de la renta</small>}</span>
            <strong>{eur(cuentas.total)}</strong>
        </div>
    );
}

// Iconos de trazo (24 × 24), heredan el color del texto.
const Ico = ({ d, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICO_SUBIR = <><path d="M12 15V4" /><path d="M7 9l5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>;
const ICO_OK = <path d="M5 12.5l4.5 4.5L19 7.5" />;
const ICO_FALTA = <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></>;
const ICO_LUPA = <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>;
const ICO_RELOJ = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
const ICO_FLECHA = <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>;

export function ResumenOportunidadPartner({ inputs = {}, result, expediente = null, sinGuardar = false, formularioAbierto = false, onAccion, onCorregir }) {
    const [verFm, setVerFm] = useState(false);
    // Las peticiones se llevan aquí y no en `inputs`: tocar `inputs` marcaría la
    // oportunidad como «con cambios sin guardar» y obligaría a guardar para el PDF.
    const [peticion, setPeticion] = useState(inputs.peticion_fm || null);
    const [revision, setRevision] = useState(inputs.peticion_revision || null);
    const [pidiendo, setPidiendo] = useState(false);
    const [errRevision, setErrRevision] = useState(null);
    const [verRevision, setVerRevision] = useState(false);

    // Con reforma, la opción que imprime la propuesta (regla 25): solo reforma, o las dos.
    const dual = !!(inputs.isReforma && result?.financialsRes080);
    const soloReforma = dual && inputs.comparativaReforma === false;
    const f = (soloReforma ? result.financialsRes080 : result?.financials) || {};
    const segunda = dual && !soloReforma ? result.financialsRes080 : null;
    const bono = Number(f.caeBonus) || 0;
    const irpf = Number(f.irpfDeduction) || 0;
    const cuentas = cuentasCliente(f);
    const cuentas2 = segunda ? cuentasCliente(segunda) : null;
    const paso = pasoOportunidad(inputs.estado, expediente);
    const accion = (a) => () => onAccion?.(a);
    const conCee = !!(inputs.cee_previo || inputs.xmlDemandData);

    // ── La vía del FACTOR MULTIPLICADOR: «hasta X €», EN LUGAR DE (nunca sumada) ──
    const fc = result?.res060fc || null;
    const fmEur = Math.round(Number(result?.financialsRes060FC?.caeBonus) || 0);
    const bloquea = fc?.elegible === false ? ((fc.avisos || []).find(a => a.tono === 'bloquea')?.texto || 'Esta obra no cumple los requisitos.') : null;
    const conFm = !!fc && !inputs.isReforma && fmEur > Math.round(bono);
    const ratio = bono > 0 && fmEur > 0 ? fmEur / bono : 0;
    const ratioTexto = ratio >= 1.15 ? `×${num(ratio, 1)}` : null;

    // ── «Solicitar revisión»: bono < 3.000 € sin el CEE de la vivienda (regla 161) ──
    const conRevision = ofrecerRevision(inputs, bono, expediente) || (!!revision && !conCee && !expediente);
    const fechaRevision = revision?.at ? new Date(revision.at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : null;
    const pedirRevision = async () => {
        if (pidiendo || !inputs.id_oportunidad) return;
        setPidiendo(true); setErrRevision(null);
        try {
            const { data } = await axios.post(`/api/oportunidades/${encodeURIComponent(inputs.id_oportunidad)}/peticion-revision`, {});
            setRevision(data?.peticion_revision || { at: new Date().toISOString() });
            setVerRevision(false);
        } catch (e) {
            if (e?.response?.data?.code === 'YA_PEDIDA') { setRevision({ at: new Date().toISOString() }); setVerRevision(false); }
            else setErrRevision(e?.response?.data?.error || 'No se ha podido pedir. Vuelve a intentarlo.');
        } finally {
            setPidiendo(false);
        }
    };

    // ── Con qué se ha calculado ──
    const placa = inputs.placa_caldera || null;
    const sup = Number(inputs.superficieCalefactable || inputs.superficie) || 0;
    const caldera = placa?.marca
        ? [`${placa.marca}${placa.modelo ? ` ${placa.modelo}` : ''}`, COMBUSTIBLE[placa.combustible] || placa.combustible,
           placa.anio, placa.potencia_kw ? `${num(placa.potencia_kw, 1)} kW` : null].filter(Boolean).join(' · ')
        : (COMBUSTIBLE[inputs.fuelType] ? `Caldera de ${COMBUSTIBLE[inputs.fuelType]}` : 'La caldera de hoy');
    const equipo = result?.selectedModel?.marca ? `${result.selectedModel.marca} ${result.selectedModel.modelo || ''}`.trim() : 'Aerotermia';
    const presu = Number(inputs.presupuesto) || 0;
    const instala = [equipo, inputs.changeAcs === false ? 'solo calefacción' : 'con agua caliente',
        presu > 0 ? `${eur(presu)}${inputs.presupuestoEstimado ? ' (estimado)' : ''}` : null].filter(Boolean).join(' · ');

    const conAccion = !expediente && String(inputs.estado || '').toUpperCase() !== 'ACEPTADA';
    const etiquetaAccion = ['ENVIADA', 'PRE-ACEPTADO'].includes(String(inputs.estado || '').toUpperCase())
        ? 'Volver a enviar la propuesta' : 'Ver y enviar la propuesta';
    // Con la revisión pedida y sin resolver, la acción naranja NO es enviar la propuesta
    // (saldría con la cifra estimada, lo que el popup le acaba de desaconsejar): es
    // mandarnos las fotos de fachadas y ventanas, que afinan el CEE. La propuesta
    // sigue a mano, en secundario.
    const esperandoRevision = conAccion && !!revision && !conCee && !revision.resuelta_at;
    const accionFotos = esperandoRevision && !!onAccion && !!inputs.id_oportunidad;

    const fechaPeticion = peticion?.at ? new Date(peticion.at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : null;

    // La tarjeta de AL LADO del bono: la vía FM, la opción 2 de la reforma o, si no
    // hay ninguna, las cuentas del cliente (así el bono nunca se queda solo en una fila).
    const ladoFm = conFm;
    const ladoOpcion2 = !ladoFm && !!segunda;
    const ladoCuentas = !ladoFm && !ladoOpcion2 && !!cuentas;

    return (
        <section className="po" aria-label="Resumen de la oportunidad">
            <style>{CSS_OPORTUNIDAD_PARTNER}</style>
            <div className="po-filete" />
            <div className="po-in">
                <div className="po-cab">
                    <div style={{ minWidth: 0 }}>
                        <p className="po-eti">{inputs.isReforma ? 'Reforma con aerotermia' : inputs.hibridacion ? 'Hibridación con aerotermia' : 'Caldera → aerotermia'}</p>
                        <h1 className="po-h1">{titularConMunicipio(inputs.direccion, inputs.municipio)}</h1>
                        {inputs.referenciaCliente && <p className="po-sub">{inputs.referenciaCliente}</p>}
                    </div>
                    {/* El estado ya lo dicen los pasos: aquí solo el nº, para hablar de ella. */}
                    {inputs.id_oportunidad && (
                        <div className="po-chips"><span className="po-chip">{inputs.id_oportunidad}</span></div>
                    )}
                </div>

                <ol className="po-barras" aria-label={`Paso ${paso.i + 1} de ${PASOS.length}`}>
                    {PASOS.map((p, i) => (
                        <li key={p} className={i < paso.i ? 'hecho' : i === paso.i ? 'ahora' : ''} aria-current={i === paso.i ? 'step' : undefined}>
                            <span aria-hidden="true" />{p}
                        </li>
                    ))}
                </ol>

                {sinGuardar && (
                    <div className="po-guardar" role="status">
                        <p>Has cambiado datos y aún no están guardados.</p>
                        <button type="button" className="po-btn2" onClick={accion('guardar')}>Guardar cambios</button>
                    </div>
                )}

                <div className="po-grid">
                    <div className="po-col">
                        {/* ── Arriba, DOS tarjetas en paralelo: el bono y lo que va a su lado ── */}
                        <div className={`po-par${ladoFm || ladoOpcion2 || ladoCuentas ? '' : ' solo'}`}>
                            <div className="po-card po-bono">
                                <p className="po-eti">{dual ? (soloReforma ? 'Bono CAE · con reforma' : 'Opción 1 · solo aerotermia') : 'Bono CAE para tu cliente'}</p>
                                <p className="po-cifra">{eur(bono)}</p>
                                <p className="po-cifra-sub">
                                    {conCee ? 'Con el CEE de la vivienda · ' : conFm ? 'Vía normal · ' : ''}Se cobra al justificar la obra
                                </p>
                                {conCee && revision?.resuelta_at && (
                                    <p className="po-revisada"><Ico d={ICO_OK} size={14} />Revisado con el certificado · antes, {eur(revision.bono_antes)} estimado</p>
                                )}

                                {conRevision && (
                                    <div className={`po-rev${revision ? ' pedida' : ''}`}>
                                        {revision ? (
                                            <>
                                                <span className="po-rev-ico"><Ico d={ICO_RELOJ} /></span>
                                                <div>
                                                    <p className="po-rev-t">Revisión pedida{fechaRevision ? ` el ${fechaRevision}` : ''}</p>
                                                    <p className="po-rev-x">Estamos haciendo el CEE de la vivienda. Cuando esté, la cifra de aquí se actualiza con datos reales.</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div>
                                                    <p className="po-rev-t">¿Puede salir más?</p>
                                                    <p className="po-rev-x">Este bono está estimado sin el certificado energético de la vivienda. Pide que lo revisemos: hacemos el CEE y lo recalculamos con datos reales.</p>
                                                </div>
                                                <button type="button" className="po-btn2 po-btn-ico" onClick={() => { setErrRevision(null); setVerRevision(true); }} disabled={pidiendo || sinGuardar}
                                                    title={sinGuardar ? 'Guarda antes los cambios' : undefined}>
                                                    <Ico d={ICO_LUPA} size={16} />{pidiendo ? 'Pidiendo…' : 'Solicitar revisión'}
                                                </button>
                                                {sinGuardar && <p className="po-rev-x" style={{ gridColumn: '1 / -1' }}>Guarda antes los cambios para pedirla.</p>}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {ladoFm && (
                                <div className={`po-fm${bloquea ? ' apagado' : ''}`}>
                                    <div className="po-fm-cab">
                                        <p className="po-fm-eti">Con factor multiplicador</p>
                                        {ratioTexto && !bloquea && <span className="po-x">{ratioTexto}</span>}
                                    </div>
                                    {/* Si algo lo impide, no se enseña una cifra que no se puede pedir. */}
                                    {!bloquea && <p className="po-fm-cifra"><small>hasta</small>{eur(fmEur)}</p>}
                                    {!bloquea && <p className="po-fm-enlugar">en lugar de {eur(bono)}, no además</p>}
                                    {!bloquea && (
                                        <p className="t">
                                            Se presenta a partir del 15/01/2027 y hay cupo.
                                            {fc.dcalFuente === 'simulacion' ? ' Estimado hasta tener el CEE.' : ''}
                                        </p>
                                    )}
                                    {fc.acsSupuesto && !bloquea && (
                                        <p className="po-aviso">Solo si la aerotermia da también el agua caliente: añade el depósito de ACS al presupuesto.</p>
                                    )}
                                    <div className="po-fm-pie">
                                        {bloquea ? (
                                            <p className="t">Ahora mismo no se puede pedir. {bloquea.charAt(0).toUpperCase() + bloquea.slice(1)}</p>
                                        ) : peticion ? (
                                            <>
                                                <p className="t"><strong>Pedido{fechaPeticion ? ` el ${fechaPeticion}` : ''}.</strong> Lo revisamos y te decimos por qué vía va.</p>
                                                <button type="button" className="po-btn2" onClick={() => setVerFm(true)}>Ver o cambiar las respuestas</button>
                                            </>
                                        ) : (
                                            <button type="button" className="po-btn2 po-btn-ico" onClick={() => setVerFm(true)}>¿Cumple tu cliente? Compruébalo<Ico d={ICO_FLECHA} size={16} /></button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {ladoOpcion2 && (
                                <div className="po-card po-bono">
                                    <p className="po-eti">Opción 2 · aerotermia y reforma</p>
                                    <p className="po-cifra">{eur(segunda.caeBonus)}</p>
                                    <p className="po-cifra-sub">Bono CAE con la reforma · se cobra al justificar la obra</p>
                                </div>
                            )}

                            {ladoCuentas && (
                                <div className="po-card po-cuentas">
                                    <p className="po-eti">Las cuentas de tu cliente</p>
                                    <ListaCuentas cuentas={cuentas} />
                                    <TotalCuentas cuentas={cuentas} />
                                </div>
                            )}
                        </div>

                        {/* ── Debajo, las cuentas a lo ancho (cuando al lado del bono va otra cosa) ── */}
                        {!ladoCuentas && cuentas && (
                            <div className="po-card po-cuentas ancha">
                                <p className="po-eti">Las cuentas de tu cliente{cuentas2 ? ' · opción 1' : ''}</p>
                                <div className="po-ecuacion">
                                    <ListaCuentas cuentas={cuentas} />
                                    <TotalCuentas cuentas={cuentas} />
                                </div>
                                {cuentas2 && (
                                    <>
                                        <p className="po-eti" style={{ marginTop: 18 }}>Opción 2 · aerotermia y reforma</p>
                                        <div className="po-ecuacion">
                                            <ListaCuentas cuentas={cuentas2} />
                                            <TotalCuentas cuentas={cuentas2} />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {!cuentas && irpf > 0 && (
                            <div className="po-card"><div className="po-fila" style={{ margin: 0, padding: 0, border: 0 }}><span>Deducción del IRPF estimada</span><strong>hasta {eur(irpf)}</strong></div></div>
                        )}

                        {/* La documentación, a la izquierda: así las dos columnas acaban a la par. */}
                        <div className="po-card po-doc">
                            <div>
                            <p className="po-eti">Documentación</p>
                            <ul className="po-docs">
                                <li className={placa ? 'ok' : 'falta'}><Ico d={placa ? ICO_OK : ICO_FALTA} size={16} />{placa ? 'Placa de la caldera' : 'Sin foto de la placa'}</li>
                                <li className={presu > 0 && !inputs.presupuestoEstimado ? 'ok' : 'falta'}>
                                    <Ico d={presu > 0 && !inputs.presupuestoEstimado ? ICO_OK : ICO_FALTA} size={16} />
                                    {presu > 0 && !inputs.presupuestoEstimado ? 'Presupuesto' : 'Presupuesto estimado'}
                                </li>
                            </ul>
                            <p className="po-nota">Lo de las paredes y fachadas se lo pedimos al cliente cuando acepte, sin volver a pedirle la caldera.</p>
                            </div>
                            {onAccion && inputs.id_oportunidad && (
                                <button type="button" className="po-subir" onClick={accion('fotos')}>
                                    <span className="po-subir-ico"><Ico d={ICO_SUBIR} size={20} /></span>
                                    <span><b>Subir fotos o documentos</b><small>Desde el móvil o el ordenador</small></span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="po-col">
                        {/* ── La acción, ARRIBA a la derecha: qué toca ahora y el botón ── */}
                        <div className="po-card po-accion">
                            <p className="po-eti">Siguiente paso</p>
                            {esperandoRevision ? (
                                <>
                                    <p className="po-accion-t">Estamos revisando el bono con el certificado de la vivienda.</p>
                                    <p className="po-nota" style={{ marginTop: 6 }}>Te avisamos por WhatsApp cuando esté. Mientras, si tienes fotos de las fachadas y las ventanas, mándanoslas: el certificado sale más ajustado.</p>
                                </>
                            ) : (
                                <p className="po-accion-t">{paso.texto}</p>
                            )}
                            {conAccion && onAccion && (
                                <div className="po-solo-pc" style={{ marginTop: 14 }}>
                                    {accionFotos ? (
                                        <>
                                            <button type="button" className="po-btn po-btn-ico" onClick={accion('fotos')}><Ico d={ICO_SUBIR} size={18} />Subir fotos de la vivienda</button>
                                            <button type="button" className="po-btn2" style={{ width: '100%', marginTop: 8 }} onClick={accion('pdf')}>Ver la propuesta (cifra estimada)</button>
                                        </>
                                    ) : (
                                        <button type="button" className="po-btn" onClick={accion('pdf')}>{etiquetaAccion}</button>
                                    )}
                                </div>
                            )}
                            {onAccion && (
                                <div className="po-sec">
                                    <button type="button" onClick={accion('tabla')}>Imagen resumen</button>
                                    {inputs.id_oportunidad && <button type="button" onClick={accion('historial')}>Historial</button>}
                                </div>
                            )}
                        </div>

                        <div className="po-card po-datos">
                            <p className="po-eti" style={{ padding: '10px 14px 0' }}>Con esto hemos calculado</p>
                            <div className="po-dato"><div style={{ minWidth: 0 }}><p className="po-eti">La vivienda</p><b>{sup ? `${num(sup)} m² con calefacción` : 'Sin superficie'}{inputs.zona ? ` · zona climática ${inputs.zona}` : ''}</b></div></div>
                            <div className="po-dato"><div style={{ minWidth: 0 }}><p className="po-eti">Caldera de hoy{placa?.marca ? ' · de la placa' : ''}</p><b>{caldera}</b></div></div>
                            <div className="po-dato"><div style={{ minWidth: 0 }}><p className="po-eti">Lo que se instala</p><b>{instala}</b></div></div>
                            {onCorregir && (
                                <div className="po-dato">
                                    {formularioAbierto
                                        ? <span className="po-nota" style={{ margin: 0 }}>Corrige los datos más abajo: las cifras se recalculan solas.</span>
                                        : <button type="button" className="po-link" onClick={onCorregir}>¿Algo no cuadra? Corregir datos</button>}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            {/* La barra del móvil, portaleada a body (regla 29.b): un ancestro con
                `transform` o `backdrop-filter` la anclaría a él y no a la pantalla.
                Con «Corregir datos» abierto se quita: allí manda «Guardar cambios». */}
            {conAccion && onAccion && !formularioAbierto && createPortal(
                <div className="po po-barra-movil" style={{ borderRadius: 0, margin: 0, boxShadow: 'none', background: undefined }}>
                    <style>{CSS_OPORTUNIDAD_PARTNER}</style>
                    {accionFotos
                        ? <button type="button" className="po-btn po-btn-ico" onClick={accion('fotos')}><Ico d={ICO_SUBIR} size={18} />Subir fotos de la vivienda</button>
                        : <button type="button" className="po-btn" onClick={accion('pdf')}>{etiquetaAccion}</button>}
                </div>,
                document.body
            )}

            <SolicitarRevisionModal
                abierto={verRevision}
                onCerrar={() => setVerRevision(false)}
                onConfirmar={pedirRevision}
                onSubirFotos={onAccion && inputs.id_oportunidad ? () => { setVerRevision(false); onAccion('fotos'); } : null}
                enviando={pidiendo}
                error={errRevision}
                bonoTexto={eur(bono)}
            />

            <RequisitosFmModal
                abierto={verFm}
                onCerrar={() => setVerFm(false)}
                idOportunidad={inputs.id_oportunidad || null}
                peticion={peticion}
                onPedido={setPeticion}
                ratioTexto={ratio >= 1.9 && ratio <= 2.15 ? 'el doble' : ratio >= 2.85 && ratio <= 3.15 ? 'el triple' : 'más'}
            />
        </section>
    );
}
