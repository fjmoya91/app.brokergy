import { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../../context/AuthContext';
import { getRoleFlags } from '../../../../utils/roleFlags';
import SendActionOverlay from '../../../../components/SendActionOverlay';
import { Ico, eur, entero, ErrorApi, AvisoFx, DialogoFx, errorDeApi, tonoDeApi } from '../../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// El paquete para la gestoría: «ENTREGA GESTORÍA / {AAAA-Tn (mes-mes)}» con las carpetas 01-06,
// los PDF renombrados (E-01, R-01, O-01, AE-01, AG-01…) y el libro Excel de ocho hojas.
//
// - «Ver el plan» = `POST /trimestre/:t/paquete?seco=1`: NO escribe nada. Deja claro qué se
//   COPIA y qué YA ESTÁ (en el T3, 56 de 59 ya estaban: lo hecho a mano no se duplica).
// - «Montarlo en Drive» (sin `seco`) ESCRIBE en el Drive de PRODUCCIÓN: crea las carpetas que
//   falten, COPIA los PDF (nunca mueve ni borra) y sube el libro (sin pisar el que haya). Se
//   confirma con el plan a la vista y se sigue con SendActionOverlay. Solo ADMIN con sesión.
// - Lo que falta (`faltan`) se agrupa por mensaje: 35 «sin leer» son una línea, no 35.
// ─────────────────────────────────────────────────────────────────────────────

/** «X.pdf: sin leer, va al paquete…» ×35 → una línea con los 35 nombres dentro. */
function agrupar(faltan) {
    const grupos = new Map();
    for (const f of faltan || []) {
        const m = /^(.+?\.(?:pdf|xlsx?|jpe?g|png)): (.+)$/i.exec(f.texto || '');
        const clave = m ? `${f.tono}|${m[2]}` : `${f.tono}|${f.texto}`;
        if (!grupos.has(clave)) grupos.set(clave, { tono: f.tono, texto: m ? m[2] : f.texto, nombres: [] });
        if (m) grupos.get(clave).nombres.push(m[1]);
    }
    return [...grupos.values()].sort((a, b) => ({ rojo: 0, ambar: 1 }[a.tono] ?? 2) - ({ rojo: 0, ambar: 1 }[b.tono] ?? 2));
}
const mayus = (s) => String(s || '').replace(/^./, c => c.toUpperCase());

function Carpeta({ nombre, ficheros, soloCopiar }) {
    const copiar = ficheros.filter(f => f.accion === 'COPIAR').length;
    const ya = ficheros.length - copiar;
    const vistos = soloCopiar ? ficheros.filter(f => f.accion === 'COPIAR') : ficheros;
    if (soloCopiar && !copiar) return null;
    return (
        <details className="fx-pq-carpeta" open={copiar > 0 && copiar <= 12}>
            <summary>
                <Ico n="derecha" size={16} className="fx-pq-flecha" />
                <Ico n="carpeta" size={18} />
                <span>{nombre}</span>
                <span className="fx-pq-n">
                    {copiar > 0 && <span className="fx-chip fx-chip-tinta">{entero(copiar)} se copian</span>}
                    {ya > 0 && <span className="fx-chip fx-chip-ok">{entero(ya)} ya están</span>}
                    {!ficheros.length && <span className="fx-chip fx-chip-gris">vacía</span>}
                </span>
            </summary>
            {vistos.length > 0 && (
                <ul className="fx-pq-fich">
                    {vistos.map(f => (
                        <li key={`${f.carpeta}/${f.nombre}`}>
                            <span>
                                {f.nombre}
                                <small>{f.accion === 'YA_ESTA' && f.esta_como && f.esta_como !== f.nombre ? `Ya está como «${f.esta_como}»` : f.origen?.ruta ? `De ${f.origen.ruta}` : ''}</small>
                            </span>
                            <span className={`fx-chip ${f.accion === 'COPIAR' ? 'fx-chip-tinta' : 'fx-chip-ok'}`}>{f.accion === 'COPIAR' ? 'Se copia' : 'Ya está'}</span>
                        </li>
                    ))}
                </ul>
            )}
        </details>
    );
}

export function PaqueteGestoria({ t, etiqueta }) {
    const { user } = useAuth();
    const { isAdmin } = getRoleFlags(user);
    const [plan, setPlan] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [soloCopiar, setSoloCopiar] = useState(false);
    const [confirmar, setConfirmar] = useState(false);
    const [ov, setOv] = useState({ phase: null });

    const verPlan = async () => {
        setCargando(true); setError(null);
        try {
            const { data } = await axios.post(`/api/facturacion/trimestre/${encodeURIComponent(t)}/paquete?seco=1`);
            setPlan(data);
        } catch (err) { setError(errorDeApi(err)); }
        finally { setCargando(false); }
    };

    const montar = async () => {
        setConfirmar(false);
        setOv({ phase: 'sending', subtitle: plan?.carpeta || etiqueta });
        try {
            const { data } = await axios.post(`/api/facturacion/trimestre/${encodeURIComponent(t)}/paquete`);
            const errores = data?.errores || [];
            const link = isAdmin ? data?.libro?.link : null;
            setOv({
                phase: 'done', ok: true, subtitle: data?.carpeta || plan?.carpeta,
                items: [
                    `${entero(data?.copiados || 0)} ${data?.copiados === 1 ? 'PDF copiado' : 'PDF copiados'} a sus carpetas`,
                    ...(data?.ya_estan ? [{ texto: `${entero(data.ya_estan)} ya estaban: no se han tocado`, tono: 'info' }] : []),
                    ...(data?.libro?.nombre ? [`Libro «${data.libro.nombre}» subido`] : []),
                    ...(errores.length ? [{ texto: `${entero(errores.length)} no se pudieron copiar: ${errores.slice(0, 3).map(e => e.nombre).join(', ')}${errores.length > 3 ? '…' : ''}`, tono: 'aviso' }] : []),
                ],
                accion: link ? { etiqueta: 'Abrir el libro', onClick: () => window.open(link, '_blank', 'noopener') } : null,
            });
            setPlan(p => (p ? { ...p, carpeta_existe: true } : p));
        } catch (err) {
            setOv({ phase: 'done', ok: false, subtitle: plan?.carpeta || etiqueta, errorText: errorDeApi(err).texto });
        }
    };

    // ── antes de ver el plan ──
    if (!plan) {
        return (
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">Paquete para la gestoría · {etiqueta}</div>
                        <h3 className="fx-display fx-h3">Lo mismo que el T3 hecho a mano, <span className="fx-mark">sin montarlo</span></h3>
                    </div>
                </div>
                <p className="fx-sub">
                    En «ENTREGA GESTORÍA» se prepara la carpeta del trimestre: 01-03 de la sociedad (emitidas, recibidas por actividad, tickets y tasas), 04-05 del autónomo y 06 con los extractos, cada PDF con su prefijo (E-01, R-01, AE-01…), y el libro Excel de ocho hojas.
                </p>
                <p className="fx-nombre-fiscal">Primero se enseña el plan, sin escribir nada: qué se copia y qué ya está.</p>
                {error && <ErrorApi error={error} que="el plan del paquete" onReintentar={verPlan} className="fx-ph-error" />}
                {cargando && <p className="fx-espera-txt" style={{ marginTop: 14 }}><Ico n="reintentar" size={18} className="fx-spin" />Comparando con lo que ya hay en Drive… (unos 15 s)</p>}
                <div className="fx-pq-acc">
                    <button type="button" className="fx-btn fx-btn-pri" onClick={verPlan} disabled={cargando}>
                        <Ico n="lista" size={18} />{cargando ? 'Preparando el plan…' : 'Ver el plan'}
                    </button>
                </div>
            </article>
        );
    }

    // ── con el plan delante ──
    const fich = plan.ficheros || [];
    const carpetas = [...new Set([...(plan.carpetas || []), ...fich.map(f => f.carpeta)])];
    // Solo se pintan las carpetas «hoja» (las que tienen ficheros) y las vacías sin subcarpetas.
    const hojas = carpetas.filter(c => fich.some(f => f.carpeta === c) || !carpetas.some(o => o !== c && o.startsWith(`${c}/`)));
    const faltan = agrupar(plan.faltan);
    const hayQueEscribir = (plan.copiar || 0) > 0 || !plan.carpeta_existe || !!plan.libro?.nombre;

    return (
        <div className={`fx-pila${cargando ? ' fx-recargando' : ''}`}>
            <article className="fx-card fx-pad fx-in" style={{ '--i': 1 }}>
                <div className="fx-card-cab">
                    <div>
                        <div className="fx-eyebrow">El plan · en seco, sin escribir nada</div>
                        <h3 className="fx-display fx-h3">
                            {plan.copiar ? <>Se copian <span className="fx-mark">{entero(plan.copiar)}</span>, ya están {entero(plan.ya_estan || 0)}</> : <>Ya está <span className="fx-mark">todo</span>: no hay nada que copiar</>}
                        </h3>
                        <p className="fx-nombre-fiscal"><Ico n="carpeta" size={14} /> {plan.carpeta}{plan.carpeta_existe ? '' : ' · se crea'}</p>
                    </div>
                    <span className="fx-pildora">estimado</span>
                </div>
                <div className="fx-pq-res">
                    <div className="fx-pq-dato"><span>Se copian</span><b>{entero(plan.copiar || 0)}</b><small>PDF a sus carpetas (no se mueve nada)</small></div>
                    <div className="fx-pq-dato"><span>Ya están</span><b>{entero(plan.ya_estan || 0)}</b><small>en el paquete, con este u otro número</small></div>
                    <div className="fx-pq-dato"><span>Libro Excel</span><b>{entero(plan.libro?.hojas?.length || 0)} hojas</b><small>{plan.libro?.nombre}{plan.libro?.pisaria ? ' · pisaría uno' : ''}</small></div>
                    <div className="fx-pq-dato"><span>Modelo 303 · sociedad</span><b>{eur(plan.m303?.sl || 0)}</b><small>Autónomo {eur(plan.m303?.autonomo || 0)} · 111 {eur(plan.m111 || 0)}</small></div>
                </div>
                {faltan.length > 0 && (
                    <div className="fx-pila" style={{ marginTop: 16 }}>
                        {faltan.map(g => (
                            <AvisoFx key={`${g.tono}|${g.texto}`} tono={tonoDeApi(g.tono)}>
                                {g.nombres.length > 1 ? (<>
                                    <b>{entero(g.nombres.length)} ficheros:</b> {g.texto}.
                                    <details style={{ marginTop: 6 }}>
                                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver cuáles</summary>
                                        <ul className="fx-gs-av" style={{ color: 'inherit', marginTop: 6 }}>{g.nombres.map(nm => <li key={nm}>{nm}</li>)}</ul>
                                    </details>
                                </>) : g.nombres.length === 1 ? <><b>{g.nombres[0]}</b>: {g.texto}</> : mayus(g.texto)}
                            </AvisoFx>
                        ))}
                    </div>
                )}
            </article>

            <article className="fx-card fx-pad fx-in" style={{ '--i': 2 }}>
                <div className="fx-graf-cab">
                    <div>
                        <div className="fx-eyebrow">Carpetas y ficheros</div>
                        <h3 className="fx-display fx-h3">{entero(fich.length)} piezas en {entero(hojas.length)} carpetas</h3>
                    </div>
                    <div className="fx-seg" role="group" aria-label="Qué ficheros ver">
                        <button type="button" aria-pressed={!soloCopiar} onClick={() => setSoloCopiar(false)}>Todo</button>
                        <button type="button" aria-pressed={soloCopiar} onClick={() => setSoloCopiar(true)} disabled={!plan.copiar}>Solo lo que se copia</button>
                    </div>
                </div>
                <div className="fx-pq-carpetas">
                    {hojas.map(c => <Carpeta key={c} nombre={c} ficheros={fich.filter(f => f.carpeta === c)} soloCopiar={soloCopiar} />)}
                </div>
                <div className="fx-pq-acc">
                    <button type="button" className="fx-btn fx-btn-sec" onClick={verPlan} disabled={cargando}>
                        <Ico n="reintentar" size={18} className={cargando ? 'fx-spin' : ''} />{cargando ? 'Mirando otra vez…' : 'Volver a mirar'}
                    </button>
                    {isAdmin && hayQueEscribir && (
                        <button type="button" className="fx-btn fx-btn-pri" onClick={() => setConfirmar(true)} disabled={cargando}>
                            <Ico n="carpeta" size={18} />Montarlo en Drive
                        </button>
                    )}
                </div>
                {error && <ErrorApi error={error} que="el plan del paquete" onReintentar={verPlan} className="fx-ph-error" />}
            </article>

            {confirmar && (
                <DialogoFx antetitulo={`Paquete · ${etiqueta}`} titulo="¿Montarlo en Drive?" onClose={() => setConfirmar(false)}
                    pie={<>
                        <button type="button" className="fx-btn fx-btn-sec" onClick={() => setConfirmar(false)} data-autofoco>Cancelar</button>
                        <button type="button" className="fx-btn fx-btn-pri" onClick={montar}><Ico n="carpeta" size={18} />Montarlo</button>
                    </>}>
                    <AvisoFx tono="ambar">
                        <b>Escribe en el Drive de producción</b>, en «{plan.carpeta}».
                    </AvisoFx>
                    <dl className="fx-filas">
                        <div className="fx-fila"><dt>Carpetas<small>{plan.carpeta_existe ? 'la del trimestre ya existe' : 'se crea la del trimestre'}</small></dt><dd>{entero(carpetas.length)}</dd></div>
                        <div className="fx-fila"><dt>PDF que se COPIAN<small>nunca se mueve ni se borra nada</small></dt><dd>{entero(plan.copiar || 0)}</dd></div>
                        <div className="fx-fila"><dt>Ya están<small>no se tocan</small></dt><dd>{entero(plan.ya_estan || 0)}</dd></div>
                        <div className="fx-fila"><dt>Libro Excel<small>{plan.libro?.nombre}{plan.libro?.pisaria ? '' : ' · no pisa el que haya'}</small></dt><dd>1</dd></div>
                    </dl>
                    <p className="fx-nombre-fiscal">Las cifras del libro son estimadas: lo presenta la gestoría.</p>
                </DialogoFx>
            )}
            <SendActionOverlay phase={ov.phase} ok={ov.ok} subtitle={ov.subtitle} items={ov.items || []} errorText={ov.errorText} accion={ov.accion}
                icon="upload" sendingTitle="Montando el paquete en Drive…" okTitle="Paquete montado" errorTitle="No se pudo montar"
                onClose={() => setOv({ phase: null })} />
        </div>
    );
}

export default PaqueteGestoria;
