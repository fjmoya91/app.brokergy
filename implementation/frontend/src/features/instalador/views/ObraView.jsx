// ─── Una obra (prototipo «Obra») ────────────────────────────────────────────
// La MISMA ficha para toda obra, tenga o no expediente (Fran, 21/11/2026: «cuando
// pulso sobre una de mis obras me lleva a la vista de la oportunidad… hay que darle
// una vuelta para ver todo, la factura, etc.»). Antes, una obra sin expediente —la
// mitad de las de RCA— se abría en la calculadora de siempre.
//
// Lo que enseña lo trae `GET /api/instalador-app/obras/:id` en lista blanca: ni
// margen, ni comisión, ni notas internas, ni enlaces de Drive (reglas 1, 102 y 218).
// «Todo lo de esta obra» es UNA lista, de la propuesta al cobro, que arma el servidor
// (`caminoDeObra` en utils/appInstalador.js): lo hecho, lo que le toca, lo que
// llevamos nosotros y lo que aún no toca. Cada fila con `accion` se abre aquí mismo.
// Fase 2: lo que le toca al instalador se HACE aquí, en su sitio (AccionesObra.jsx):
// la propuesta, el presupuesto, la factura, el certificado de la instalación, el RITE
// y las fotos. La acción abierta es una entrada más del historial (el «atrás» del
// móvil vuelve a la obra), y tras cada envío la obra y el Inicio se vuelven a pedir.
import React, { useEffect, useState } from 'react';
import { Icono, ChipQuien, BarraPasos, Esqueleto, AvisoError, eur, eurSigno, telHref, waHref, iconoDeTarea } from '../ui/piezas';
import { TEXTO_QUIEN } from '../logic/obras';
import { Destino, VERBO } from './Tarea';
import { useEnvio, PropuestaAccion, PresupuestoAccion, FacturaAccion, TramitesAccion, DocsAccion } from './AccionesObra';

/** WhatsApp de BROKERGY (el mismo que `DocsManager`). */
export const WA_BROKERGY = '34623926179';

const TEXTO_PASO = {
    1: 'Ya sabes cuánto bono le sale a tu cliente. Ahora preparamos la propuesta y te la mandamos.',
    2: 'La propuesta está enviada. Falta que tu cliente la acepte.',
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

// «Caldera de gasóleo OTRA»: la marca de relleno del alta no se enseña.
const marcaQueSeEnseña = (m) => (/^(otr[ao]s?|desconocid[ao]|sin marca|n\/?a|-+)$/i.test(String(m || '').trim()) ? null : m);
const ICONO_TONO = { ok: 'ok', tu: 'aviso', nos: 'reloj', luego: 'reloj' };
const ICONO_INFO = { fotos: 'camara' };

const TITULO_ACCION = {
    propuesta: { t: 'La propuesta', p: 'La que recibe tu cliente con su bono. La ves aquí y se la pasas con un toque.' },
    presupuesto: { t: 'Tu presupuesto', p: 'El que le diste a tu cliente. Lo ves aquí y, si cambia, subes el nuevo.' },
    factura: { t: 'La factura de la obra', p: 'Hazla o súbela aquí. La revisamos nosotros y te avisamos si falta algo.' },
    cifo: { t: 'Certificado y RITE', p: 'Lo que tienes que firmar y subir de esta obra, en un solo sitio.' },
    docs: { t: 'Fotos y papeles', p: 'Las fotos de la instalación terminada y los papeles de la obra. Lo que falta, arriba.' },
};
const grupoDe = (a) => (a === 'rite' || a === 'fm_decl' ? 'cifo' : a);

export function ObraView({ obraId, base, cargarDetalle, api, nonce = 0, accion = null, onAccion, onCambio, onVolver, onAbrirOportunidad, onMiPagina, onHacerPresupuesto, onAbrirPresupuesto }) {
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
        else if (g === 'propuesta') cuerpo = <PropuestaAccion obra={o} api={api} onCambio={onCambio} waBrokergy={WA_BROKERGY} />;
        else if (g === 'factura' && !o.con_expediente) cuerpo = <div className="ia-aviso">La factura se hace cuando la obra esté terminada. Te avisamos aquí cuando toque.</div>;
        else if (g === 'cifo' && !o.con_expediente) cuerpo = <div className="ia-aviso">El certificado de la instalación y el RITE se firman y se suben al terminar la obra. Te avisamos aquí cuando toque.</div>;
        else if (g === 'presupuesto') cuerpo = <PresupuestoAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio}
            onHacerAqui={onHacerPresupuesto ? () => onHacerPresupuesto(o) : null} onAbrirHecho={onAbrirPresupuesto} />;
        else if (g === 'factura') cuerpo = <FacturaAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio} />;
        else if (g === 'cifo') cuerpo = o.es_instaladora
            ? <TramitesAccion obra={o} api={api} alSubir={envio.alSubir} onCambio={onCambio} foco={accion.accion} />
            : <div className="ia-aviso">El certificado y el RITE los firma y sube la empresa que instala la obra.</div>;
        else cuerpo = <DocsAccion obra={o} api={api} alSubir={envio.alSubir} onMiPagina={onMiPagina} />;
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
    const papeles = o?.papeles || [];
    const abrirPapel = (p) => abrir(p.accion === 'factura' ? { tipo: 'accion', accion: 'factura', modo: o.factura_modo } : p.accion);
    const instalado = (o?.paso || 0) >= 4 && !o?.equipo?.previsto;
    const hibrida = /hibridaci/i.test(o?.tipo || '');

    // En el PC (fase 5, 22/11/2026, Fran: «no se está aprovechando toda la pantalla y se tiene
    // que hacer demasiado scroll»): dos columnas — lo que se HACE a la izquierda (por dónde va,
    // lo que te toca y todo lo de la obra) y las CIFRAS a la derecha (cuentas, equipo). En el
    // móvil, los envoltorios no existen (`display: contents`) y el orden es el de siempre.
    return (
        <div className="ia-pagina pc" style={{ paddingTop: 0 }}>
            <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> Obras</button>
                {o?.numero_expediente && <span className="ia-pildora">{o.numero_expediente}</span>}
            </div>
            {!o ? (error ? <AvisoError onReintentar={() => setIntento((n) => n + 1)} /> : <Esqueleto alto={160} n={3} />) : (
                <>
                    <div className="ia-ficha-cab ia-pc-cabecera ia-entra">
                        <div className="ia-pc-cabecera-txt">
                            <p className="ia-eyebrow">{o.tipo}</p>
                            <h1 className="ia-display">{o.cliente}</h1>
                            {(o.direccion_completa || o.direccion) && <p>{o.direccion_completa || [o.direccion, o.municipio].filter(Boolean).join(' · ')}</p>}
                        </div>
                        {(tel || wa) && (
                            <div className="ia-dos">
                                {tel && <a className="ia-btn ia-btn-sec" href={tel}><Icono n="telefono" size={20} /> Llamar</a>}
                                {wa && <a className="ia-btn ia-btn-sec" href={wa} target="_blank" rel="noopener noreferrer"><Icono n="whatsapp" size={20} /> WhatsApp</a>}
                            </div>
                        )}
                    </div>

                    <div className="ia-pc-dos">
                    <div className="ia-pc-main">
                    <div className={`ia-of-arriba${t1 ? ' dos' : ''}`}>
                    <section className="ia-card ia-paso ia-entra" aria-labelledby="ia-paso-tit">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                            <p className="ia-eyebrow">Por dónde va</p>
                            <ChipQuien quien={o.quien} />
                        </div>
                        <h2 id="ia-paso-tit" className="ia-display">Paso {o.paso} de 5 · {o.fase}</h2>
                        <BarraPasos paso={o.paso} grande etiquetas />
                        <p className="txt">{o.paso === 2 && o.quien === 'tu' ? 'Te hemos mandado la propuesta a ti. Falta que se la pases a tu cliente y que la acepte.' : TEXTO_PASO[o.paso]}{!t1 && TEXTO_QUIEN[o.quien] ? <> <b>{TEXTO_QUIEN[o.quien]}</b></> : null}</p>
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
                    </div>

                    {papeles.length > 0 ? (
                        <section className="ia-card lista" aria-labelledby="ia-pp-tit">
                            <div className="ia-todo-cab">
                                <p id="ia-pp-tit" className="ia-eyebrow">Todo lo de esta obra</p>
                                {o.papeles_total > 0 && <span>{o.papeles_listos} de {o.papeles_total} listos</span>}
                            </div>
                            <div className="ia-of-filas">
                            {papeles.map((p, i) => {
                                const contenido = (
                                    <>
                                        <span className={`ia-baldosa c ${p.tono === 'ok' ? 'ok' : p.tono === 'tu' || p.tono === 'info' ? '' : p.tono === 'luego' ? 'luego' : 'nos'}`}>
                                            <Icono n={p.tono === 'info' ? (ICONO_INFO[p.key] || 'subir') : ICONO_TONO[p.tono]} size={20} />
                                        </span>
                                        <span className="ia-fila-txt">
                                            <b className={p.tono === 'luego' ? 'luego' : undefined}>{p.nombre}</b>
                                            <span className={p.tono === 'tu' ? 'tu' : undefined}>{p.estado}</span>
                                        </span>
                                        {p.accion && <Icono n="chevron" size={20} className="ia-chev" />}
                                    </>
                                );
                                return p.accion ? (
                                    <button key={p.key} type="button" className={`ia-fila${i === 0 ? ' primera' : ''}`} onClick={() => abrirPapel(p)}>{contenido}</button>
                                ) : (
                                    <div key={p.key} className={`ia-fila${i === 0 ? ' primera' : ''}`} style={{ cursor: 'default' }}>{contenido}</div>
                                );
                            })}
                            </div>
                        </section>
                    ) : !det && !error ? <Esqueleto alto={220} n={1} /> : null}
                    </div>

                    <div className="ia-pc-lado">
                    <CuentasCliente cuentas={o.cuentas} cliente={o.cliente} />

                    {(o.equipo || o.caldera_retirada) && (
                        <section className="ia-card filas" aria-labelledby="ia-eq-tit">
                            <p id="ia-eq-tit" className="ia-eyebrow">{instalado ? 'Equipo instalado' : 'Equipo previsto'}</p>
                            <dl className="ia-dl" style={{ marginTop: 8 }}>
                                {o.equipo && <>
                                    <div className="primera"><dt>{o.equipo.titulo}</dt><dd>{[o.equipo.marca, o.equipo.modelo].filter(Boolean).join(' ') || 'Por decidir'}</dd></div>
                                    {instalado && <div><dt>Nº de serie</dt><dd className="mono">{o.equipo.serie || 'Falta'}</dd></div>}
                                    {o.equipo.acs && <div><dt>Agua caliente</dt><dd>{[o.equipo.acs.marca, o.equipo.acs.modelo].filter(Boolean).join(' ')}</dd></div>}
                                    {!o.equipo.acs && !instalado && <div><dt>Agua caliente</dt><dd>{o.equipo.con_acs ? 'Con la aerotermia' : 'No se cambia'}</dd></div>}
                                </>}
                                {o.caldera_retirada && (
                                    <div className={o.equipo ? undefined : 'primera'}>
                                        <dt>{hibrida ? 'Caldera' : instalado ? 'Se quitó' : 'Se quita'}</dt>
                                        <dd>{[o.caldera_retirada.tipo || 'Caldera', o.caldera_retirada.combustible && `de ${String(o.caldera_retirada.combustible).toLowerCase()}`, marcaQueSeEnseña(o.caldera_retirada.marca)].filter(Boolean).join(' ')}</dd>
                                    </div>
                                )}
                            </dl>
                        </section>
                    )}

                    {o.se_puede_corregir && onAbrirOportunidad && (
                        <button type="button" className="ia-aviso ia-corregir" onClick={() => onAbrirOportunidad(o.id)}>
                            <Icono n="firma" size={22} style={{ flex: 'none', color: 'var(--tinta)' }} />
                            <span><b style={{ color: 'var(--tinta)' }}>¿Ha cambiado algo?</b> Corrige el cálculo: la caldera, el equipo o el presupuesto.</span>
                            <Icono n="chevron" size={20} className="ia-chev" />
                        </button>
                    )}

                    <a className="ia-aviso" style={{ borderStyle: 'dashed', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}
                        href={`https://wa.me/${WA_BROKERGY}?text=${msgDudas}`} target="_blank" rel="noopener noreferrer">
                        <Icono n="whatsapp" size={22} style={{ flex: 'none', color: 'var(--tinta)' }} />
                        <span><b style={{ color: 'var(--tinta)' }}>¿Dudas con esta obra?</b> Escríbenos y te contestamos.</span>
                    </a>
                    </div>
                    </div>
                </>
            )}
        </div>
    );
}
