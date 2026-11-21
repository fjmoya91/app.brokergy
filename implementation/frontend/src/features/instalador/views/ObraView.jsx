// ─── Una obra con expediente (prototipo «Obra») ─────────────────────────────
// Lo que enseña lo trae `GET /api/instalador-app/obras/:id` en lista blanca: ni
// margen, ni comisión, ni notas internas, ni enlaces de Drive (reglas 1, 102 y 218).
// Fase 2: lo que le toca al instalador se HACE aquí, en su sitio (AccionesObra.jsx):
// el presupuesto, la factura, el certificado de la instalación, el RITE y las fotos y
// papeles. La acción abierta es una entrada más del historial (el «atrás» del móvil
// vuelve a la obra), y tras cada envío la obra y el Inicio se vuelven a pedir.
import React, { useEffect, useState } from 'react';
import { Icono, ChipQuien, BarraPasos, Esqueleto, AvisoError, eur, eurSigno, telHref, waHref, iconoDeTarea } from '../ui/piezas';
import { TEXTO_QUIEN } from '../logic/obras';
import { Destino, VERBO } from './Tarea';
import { useEnvio, PresupuestoAccion, FacturaAccion, TramitesAccion, DocsAccion } from './AccionesObra';

/** WhatsApp de BROKERGY (el mismo que `DocsManager`). */
export const WA_BROKERGY = '34623926179';

const TEXTO_PASO = {
    1: 'Ya sabes cuánto bono le sale a tu cliente. Lo siguiente es enviarle la propuesta.',
    2: 'La propuesta está enviada. Esperamos a que tu cliente la acepte.',
    3: 'Tu cliente ha aceptado. Preparamos el certificado energético antes de la obra.',
    4: 'Con la obra hecha, reunimos los papeles y lo presentamos para cobrar el bono.',
    5: 'El bono está cobrado. Obra cerrada.',
};

/** El nombre de pila para el titular («el bono que cobra Lucía»); una empresa, entera. */
function nombreCorto(cliente) {
    const c = String(cliente || '').trim();
    if (!c) return 'tu cliente';
    if (/\b(S\.?L\.?U?|S\.?A\.?|S\.?COOP|C\.?B\.?|SOCIEDAD|COMUNIDAD)\b/i.test(c)) return c;
    return c.split(/\s+/)[0];
}

export function CuentasCliente({ cuentas, compacta = false, cliente = null }) {
    if (!cuentas) return null;
    const filas = (
        <dl className="ia-dl">
            {cuentas.lineas.map((l, i) => (
                <div key={l.k} className={i === 0 ? 'primera' : undefined}>
                    <dt>{l.texto}</dt>
                    <dd className={l.eur < 0 ? 'v' : undefined}>{l.k === 'obra' ? eur(l.eur) : eurSigno(l.eur)}</dd>
                </div>
            ))}
            <div className="total">
                <dt>{compacta ? 'A tu cliente la obra le queda en' : 'La obra le queda en'}</dt>
                <dd>{eur(cuentas.total)}</dd>
            </div>
        </dl>
    );
    if (compacta) return filas;
    // La cifra protagonista es el BONO (fase 2, arreglo a): es lo que el instalador
    // le cuenta a su cliente; lo que le queda la obra cierra la tabla.
    const bono = Math.abs(cuentas.lineas.find((l) => l.k === 'bono')?.eur || 0);
    return (
        <section className="ia-card filas" aria-labelledby="ia-cuentas-tit">
            <p id="ia-cuentas-tit" className="ia-eyebrow">Las cuentas de tu cliente</p>
            <p className="ia-cifra ia-display">{eur(bono)}</p>
            <p className="ia-cifra-p">es el bono que cobra {nombreCorto(cliente)} por esta obra.</p>
            <div style={{ marginTop: 14 }}>{filas}</div>
            <p className="ia-nota">La deducción depende de su declaración de la Renta: es el máximo que puede aplicarse.</p>
        </section>
    );
}

const ICONO_TONO = { ok: 'ok', tu: 'aviso', nos: 'reloj' };

// Qué acción abre cada papel (si la hay) y cada tarea.
const ACCION_DE_PAPEL = { cifo: 'cifo', rite: 'rite', factura: 'factura' };
const TITULO_ACCION = {
    presupuesto: { t: 'Tu presupuesto', p: 'El que le diste a tu cliente. Lo ves aquí y, si cambia, subes el nuevo.' },
    factura: { t: 'La factura de la obra', p: 'Hazla o súbela aquí. La revisamos nosotros y te avisamos si falta algo.' },
    cifo: { t: 'Certificado y RITE', p: 'Lo que tienes que firmar y subir de esta obra, en un solo sitio.' },
    docs: { t: 'Fotos y papeles', p: 'Las fotos de la instalación terminada y los papeles de la obra. Lo que falta, arriba.' },
};
const grupoDe = (a) => (a === 'rite' || a === 'fm_decl' ? 'cifo' : a);

export function ObraView({ obraId, base, cargarDetalle, api, nonce = 0, accion = null, onAccion, onCambio, onVolver, onAbrirOportunidad }) {
    const [det, setDet] = useState(null);
    const [error, setError] = useState(false);
    const [intento, setIntento] = useState(0);
    const envio = useEnvio();
    useEffect(() => {
        let vivo = true;
        setError(false);
        cargarDetalle(obraId).then((d) => { if (vivo) setDet(d); }).catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [obraId, cargarDetalle, intento, nonce]);

    const o = det || base;
    const abrir = (a) => onAccion?.(typeof a === 'string' ? { tipo: 'accion', accion: a } : a);

    // ── Una acción abierta ──
    if (accion && o) {
        const g = grupoDe(accion.accion);
        const tit = TITULO_ACCION[g] || TITULO_ACCION.docs;
        let cuerpo = null;
        if (!det) cuerpo = error ? <AvisoError onReintentar={() => setIntento((n) => n + 1)} /> : <Esqueleto alto={200} n={2} />;
        else if (g === 'presupuesto') cuerpo = <PresupuestoAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio} />;
        else if (g === 'factura') cuerpo = <FacturaAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio} />;
        else if (g === 'cifo') cuerpo = o.es_instaladora
            ? <TramitesAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio} foco={accion.accion} />
            : <div className="ia-aviso">El certificado y el RITE los firma y sube la empresa que instala la obra.</div>;
        else cuerpo = <DocsAccion obra={o} api={api} />;
        return (
            <div className="ia-pagina estrecha" style={{ paddingTop: 0 }}>
                <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                    <button type="button" className="ia-volver" onClick={() => onAccion?.(null)}><Icono n="atras" size={22} /> La obra</button>
                    {o.numero_expediente && <span className="ia-pildora">{o.numero_expediente}</span>}
                </div>
                <div className="ia-accion-cab ia-entra">
                    <p className="ia-eyebrow">{o.cliente}</p>
                    <h1 className="ia-display">{tit.t}</h1>
                    <p>{tit.p}</p>
                </div>
                {cuerpo}
                {envio.overlay}
            </div>
        );
    }

    const tel = telHref(o?.telefono);
    const wa = waHref(o?.telefono);
    const tareas = o?.tareas || [];
    const [t1, ...otras] = tareas;
    const msgDudas = encodeURIComponent(`Hola, tengo una duda con la obra ${o?.numero_expediente || o?.id || ''} (${o?.cliente || ''}).`);
    const papelFactura = o?.papeles?.find((p) => p.key === 'factura');
    const facturaPendiente = !!o?.es_instaladora && papelFactura?.tono === 'tu';

    return (
        <div className="ia-pagina estrecha" style={{ paddingTop: 0 }}>
            <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> Obras</button>
                {o?.numero_expediente && <span className="ia-pildora">{o.numero_expediente}</span>}
            </div>
            {!o ? (error ? <AvisoError onReintentar={() => setIntento((n) => n + 1)} /> : <Esqueleto alto={160} n={3} />) : (
                <>
                    <div className="ia-ficha-cab ia-entra">
                        <p className="ia-eyebrow">{o.tipo}</p>
                        <h1 className="ia-display">{o.cliente}</h1>
                        {(o.direccion_completa || o.direccion) && <p>{o.direccion_completa || [o.direccion, o.municipio].filter(Boolean).join(' · ')}</p>}
                        {(tel || wa) && (
                            <div className="ia-dos">
                                {tel && <a className="ia-btn ia-btn-sec" href={tel}><Icono n="telefono" size={20} /> Llamar</a>}
                                {wa && <a className="ia-btn ia-btn-sec" href={wa} target="_blank" rel="noopener noreferrer"><Icono n="whatsapp" size={20} /> WhatsApp</a>}
                            </div>
                        )}
                    </div>

                    <section className="ia-card ia-paso ia-entra" aria-labelledby="ia-paso-tit">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <p className="ia-eyebrow">Por dónde va</p>
                            <ChipQuien quien={o.quien} />
                        </div>
                        <h2 id="ia-paso-tit" className="ia-display">Paso {o.paso} de 5 · {o.fase}</h2>
                        <BarraPasos paso={o.paso} grande etiquetas />
                        <p className="txt">{TEXTO_PASO[o.paso]}{!t1 && TEXTO_QUIEN[o.quien] ? <> <b>{TEXTO_QUIEN[o.quien]}</b></> : null}</p>
                    </section>

                    {t1 && (
                        <section className="ia-card toca ia-entra" aria-labelledby="ia-toca-h">
                            <p className="ia-eyebrow n">Te toca a ti · {tareas.length} {tareas.length === 1 ? 'cosa' : 'cosas'}</p>
                            <h2 id="ia-toca-h" className="ia-toca-h">{t1.que}</h2>
                            <Destino destino={t1.destino} onAbrirOportunidad={onAbrirOportunidad} onAccion={abrir} className="ia-btn ia-btn-pri">
                                <Icono n={iconoDeTarea(t1.key)} size={22} /> {VERBO[t1.key] || 'Hacerlo'}
                            </Destino>
                            {otras.map((t) => (
                                <div key={t.key} className="ia-toca-otra">
                                    <div><b>{t.que}</b><span>Cuando puedas</span></div>
                                    <Destino destino={t.destino} onAbrirOportunidad={onAbrirOportunidad} onAccion={abrir} className="ia-btn ia-btn-sec ia-btn-peq">
                                        {VERBO[t.key] || 'Hacerla'}
                                    </Destino>
                                </div>
                            ))}
                        </section>
                    )}

                    <CuentasCliente cuentas={o.cuentas} cliente={o.cliente} />

                    <section className="ia-card lista" aria-labelledby="ia-pf-tit">
                        <p id="ia-pf-tit" className="ia-eyebrow" style={{ padding: '0 12px 6px' }}>Presupuesto y factura</p>
                        <button type="button" className="ia-fila primera" onClick={() => abrir('presupuesto')}>
                            <span className="ia-baldosa"><Icono n="factura" size={22} /></span>
                            <span className="ia-fila-txt">
                                <b>Tu presupuesto</b>
                                <span>{o.presupuesto?.importe ? `${eur(o.presupuesto.importe)}${o.presupuesto.estimado ? ' · estimado' : ''}` : 'Sin presupuesto'}</span>
                            </span>
                            <span className="ia-link" style={{ textDecoration: 'none' }}>Ver</span>
                        </button>
                        {o.factura && (
                            <button type="button" className="ia-fila" onClick={() => abrir({ tipo: 'accion', accion: 'factura', modo: o.factura_modo })}>
                                <span className="ia-baldosa"><Icono n="factura" size={22} /></span>
                                <span className="ia-fila-txt">
                                    <b>Tu factura</b>
                                    <span className={facturaPendiente ? 'tu' : undefined}>{papelFactura?.estado || (o.factura.n ? 'Subida' : 'Sin hacer')}</span>
                                </span>
                                <span className="ia-link" style={{ textDecoration: 'none' }}>{facturaPendiente ? 'Hacerla' : 'Ver'}</span>
                            </button>
                        )}
                        {o.cobrado && (
                            <div className="ia-fila" style={{ cursor: 'default' }}>
                                <span className="ia-baldosa c ok"><Icono n="ok" size={20} /></span>
                                <span className="ia-fila-txt"><b>Bono</b><span>Cobrado</span></span>
                            </div>
                        )}
                    </section>

                    {(o.equipo || o.caldera_retirada) && (
                        <section className="ia-card filas" aria-labelledby="ia-eq-tit">
                            <p id="ia-eq-tit" className="ia-eyebrow">Equipo instalado</p>
                            <dl className="ia-dl" style={{ marginTop: 8 }}>
                                {o.equipo && <>
                                    <div className="primera"><dt>{o.equipo.titulo}</dt><dd>{[o.equipo.marca, o.equipo.modelo].filter(Boolean).join(' ')}</dd></div>
                                    <div><dt>Nº de serie</dt><dd className="mono">{o.equipo.serie || 'Falta'}</dd></div>
                                    {o.equipo.acs && <div><dt>Agua caliente</dt><dd>{[o.equipo.acs.marca, o.equipo.acs.modelo].filter(Boolean).join(' ')}</dd></div>}
                                </>}
                                {o.caldera_retirada && (
                                    <div className={o.equipo ? undefined : 'primera'}>
                                        <dt>Se quitó</dt>
                                        <dd>{[o.caldera_retirada.tipo || 'Caldera', o.caldera_retirada.combustible && `de ${String(o.caldera_retirada.combustible).toLowerCase()}`, o.caldera_retirada.marca].filter(Boolean).join(' ')}</dd>
                                    </div>
                                )}
                            </dl>
                        </section>
                    )}

                    {o.papeles?.length > 0 && (
                        <section className="ia-card lista" aria-labelledby="ia-pp-tit">
                            <p id="ia-pp-tit" className="ia-eyebrow" style={{ padding: '0 12px 6px' }}>Fotos y papeles · {o.papeles_listos} de {o.papeles.length} listos</p>
                            {o.papeles.map((p, i) => {
                                const a = o.es_instaladora || p.key === 'factura' ? ACCION_DE_PAPEL[p.key] : null;
                                const contenido = (
                                    <>
                                        <span className={`ia-baldosa c ${p.tono === 'ok' ? 'ok' : p.tono === 'tu' ? '' : 'nos'}`}>
                                            <Icono n={ICONO_TONO[p.tono]} size={20} />
                                        </span>
                                        <span className="ia-fila-txt">
                                            <b>{p.nombre}</b>
                                            <span className={p.tono === 'tu' ? 'tu' : undefined}>{p.estado}</span>
                                        </span>
                                        {a && <Icono n="chevron" size={20} className="ia-chev" />}
                                    </>
                                );
                                return a ? (
                                    <button key={p.key} type="button" className={`ia-fila${i === 0 ? ' primera' : ''}`}
                                        onClick={() => abrir(a === 'factura' ? { tipo: 'accion', accion: 'factura', modo: o.factura_modo } : a)}>{contenido}</button>
                                ) : (
                                    <div key={p.key} className={`ia-fila${i === 0 ? ' primera' : ''}`} style={{ cursor: 'default' }}>{contenido}</div>
                                );
                            })}
                            <button type="button" className="ia-fila" onClick={() => abrir('docs')}>
                                <span className="ia-baldosa"><Icono n="subir" size={22} /></span>
                                <span className="ia-fila-txt"><b>Fotos de la obra</b><span>Súbelas aquí y mira qué falta</span></span>
                                <Icono n="chevron" size={20} className="ia-chev" />
                            </button>
                        </section>
                    )}

                    <a className="ia-aviso" style={{ borderStyle: 'dashed', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}
                        href={`https://wa.me/${WA_BROKERGY}?text=${msgDudas}`} target="_blank" rel="noopener noreferrer">
                        <Icono n="whatsapp" size={22} style={{ flex: 'none', color: 'var(--tinta)' }} />
                        <span><b style={{ color: 'var(--tinta)' }}>¿Dudas con esta obra?</b> Escríbenos y te contestamos.</span>
                    </a>
                </>
            )}
        </div>
    );
}
