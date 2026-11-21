// ─── Una obra con expediente, de SOLO LECTURA (prototipo «Obra») ─────────────
// Lo que enseña lo trae `GET /api/instalador-app/obras/:id` en lista blanca: ni
// margen, ni comisión, ni notas internas, ni enlaces de Drive (reglas 1, 102 y 218).
import React, { useEffect, useState } from 'react';
import { Icono, ChipQuien, BarraPasos, Esqueleto, AvisoError, eur, eurSigno, telHref, waHref, iconoDeTarea } from '../ui/piezas';
import { TEXTO_QUIEN } from '../logic/obras';
import { Destino, VERBO } from './Tarea';

/** WhatsApp de BROKERGY (el mismo que `DocsManager`). */
export const WA_BROKERGY = '34623926179';

const TEXTO_PASO = {
    1: 'Ya sabes cuánto bono le sale a tu cliente. Lo siguiente es enviarle la propuesta.',
    2: 'La propuesta está enviada. Esperamos a que tu cliente la acepte.',
    3: 'Tu cliente ha aceptado. Preparamos el certificado energético antes de la obra.',
    4: 'Con la obra hecha, reunimos los papeles y lo presentamos para cobrar el bono.',
    5: 'El bono está cobrado. Obra cerrada.',
};

export function CuentasCliente({ cuentas, compacta = false }) {
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
    return (
        <section className="ia-card filas" aria-labelledby="ia-cuentas-tit">
            <p id="ia-cuentas-tit" className="ia-eyebrow">Las cuentas de tu cliente</p>
            <p className="ia-cifra ia-display">{eur(cuentas.total)}</p>
            <p className="ia-cifra-p">es lo que le cuesta la obra con el bono y la deducción.</p>
            <div style={{ marginTop: 14 }}>{filas}</div>
            <p className="ia-nota">La deducción depende de su declaración de la Renta: es el máximo que puede aplicarse.</p>
        </section>
    );
}

const ICONO_TONO = { ok: 'ok', tu: 'aviso', nos: 'reloj' };

export function ObraView({ obraId, base, cargarDetalle, onVolver, onAbrirOportunidad }) {
    const [det, setDet] = useState(null);
    const [error, setError] = useState(false);
    const [intento, setIntento] = useState(0);
    useEffect(() => {
        let vivo = true;
        setError(false);
        cargarDetalle(obraId).then((d) => { if (vivo) setDet(d); }).catch(() => { if (vivo) setError(true); });
        return () => { vivo = false; };
    }, [obraId, cargarDetalle, intento]);

    const o = det || base;
    const tel = telHref(o?.telefono);
    const wa = waHref(o?.telefono);
    const tareas = o?.tareas || [];
    const [t1, ...otras] = tareas;
    const msgDudas = encodeURIComponent(`Hola, tengo una duda con la obra ${o?.numero_expediente || o?.id || ''} (${o?.cliente || ''}).`);

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
                            <Destino destino={t1.destino} onAbrirOportunidad={onAbrirOportunidad} className="ia-btn ia-btn-pri">
                                <Icono n={iconoDeTarea(t1.key)} size={22} /> {VERBO[t1.key] || 'Hacerlo'}
                            </Destino>
                            {otras.map((t) => (
                                <div key={t.key} className="ia-toca-otra">
                                    <div><b>{t.que}</b><span>Cuando puedas</span></div>
                                    <Destino destino={t.destino} onAbrirOportunidad={onAbrirOportunidad} className="ia-btn ia-btn-sec ia-btn-peq">
                                        {VERBO[t.key] || 'Hacerla'}
                                    </Destino>
                                </div>
                            ))}
                        </section>
                    )}

                    <CuentasCliente cuentas={o.cuentas} />

                    <section className="ia-card filas" aria-labelledby="ia-pf-tit">
                        <p id="ia-pf-tit" className="ia-eyebrow">Presupuesto y factura</p>
                        <dl className="ia-dl" style={{ marginTop: 8 }}>
                            <div className="primera"><dt>Tu presupuesto</dt><dd>{o.presupuesto?.importe ? `${eur(o.presupuesto.importe)}${o.presupuesto.estimado ? ' (estimado)' : ''}` : 'Sin presupuesto'}</dd></div>
                            {o.factura && (
                                <div><dt>Tu factura</dt><dd>{o.papeles?.find((p) => p.key === 'factura')?.estado || (o.factura.n ? 'Subida' : 'Sin hacer')}</dd></div>
                            )}
                            {o.cobrado && <div><dt>Bono</dt><dd className="v">Cobrado</dd></div>}
                        </dl>
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
                            {o.papeles.map((p, i) => (
                                <div key={p.key} className={`ia-fila${i === 0 ? ' primera' : ''}`} style={{ cursor: 'default' }}>
                                    <span className={`ia-baldosa c ${p.tono === 'ok' ? 'ok' : p.tono === 'tu' ? '' : 'nos'}`}>
                                        <Icono n={ICONO_TONO[p.tono]} size={20} />
                                    </span>
                                    <span className="ia-fila-txt">
                                        <b>{p.nombre}</b>
                                        <span className={p.tono === 'tu' ? 'tu' : undefined}>{p.estado}</span>
                                    </span>
                                </div>
                            ))}
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
