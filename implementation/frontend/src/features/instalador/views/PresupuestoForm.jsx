// ─── El PRESUPUESTO que el instalador hace para su cliente (22/11/2026) ─────────────────
// Fran (beta RCA): «igual que hay simulación y factura, que pueda hacer un presupuesto con la
// MISMA plantilla que su factura… el texto predefinido y editable, lo más fácil posible».
// UNA pantalla que se va rellenando sola, de arriba abajo: el cliente, la obra, lo que
// incluye (el texto de `logic/presupuesto.js`, el mismo que imprime el servidor), el precio
// y el número. Al lado (PC) o en una hoja (móvil), el PDF DE VERDAD que compone el servidor
// con su plantilla (`POST /presupuestos/vista-previa`, el mismo retardo que la factura),
// pintado con la `VistaPrevia` de FacturaObraView.
//
// REGLA — mientras el instalador no toque las líneas, se regeneran solas al cambiar la obra;
// en cuanto las toca, ya no se pisan: se avisa y se ofrece volver al texto recomendado.
// REGLA — guardar va con el popup de la casa (SendActionOverlay); un 400 o un 409 del
// servidor cierra el popup y el error se pone JUNTO A SU CAMPO (el número repetido, con el
// que sugiere el servidor a un toque).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { VistaPrevia } from '../../public/views/FacturaObraView';
import {
    TIPOS_OBRA, COMBUSTIBLES, EMISORES, extrasDe, calcularPresupuesto, eur, conceptosDe, MAX_LINEAS, MAX_CONCEPTO, tipoDe,
} from '../logic/presupuesto';
import {
    estadoInicial, entradaDe, conceptosVisibles, extrasAlCambiarObra, erroresPorCampo, clienteDeFicha, tieneDireccion,
    CLIENTE_VACIO,
} from '../logic/presupuestoApp';
import { Icono, Esqueleto, AvisoError, sinTildes, nombrePropio, telefonoBonito, useHojaTeclado } from '../ui/piezas';

const RETARDO_PREVIA = 650; // el mismo que la factura

/** El popup de guardar. Si el error es «de un campo» (400/409) se cierra y lo cuenta el campo. */
export function useGuardado() {
    const [st, setSt] = useState(null);
    const correr = async (textos, fn, { subtitulo, alCampo } = {}) => {
        setSt({ phase: 'sending', ok: false, textos });
        try {
            const r = await fn();
            setSt({ phase: 'done', ok: true, textos, subtitulo: subtitulo ? subtitulo(r) : textos.subtitulo });
            return r;
        } catch (e) {
            if (alCampo && alCampo(e)) setSt(null);
            else setSt({ phase: 'done', ok: false, textos, error: e?.response?.data?.error || (e?.response ? 'No se ha podido hacer. Inténtalo en un momento.' : 'Sin conexión: inténtalo cuando vuelva la cobertura.') });
            throw e;
        }
    };
    const overlay = st ? (
        <SendActionOverlay phase={st.phase} ok={st.ok} icon={st.textos.icon || 'upload'}
            sendingTitle={st.textos.enviando} okTitle={st.textos.ok} errorTitle={st.textos.error || 'No se ha podido'}
            subtitle={st.ok ? (st.subtitulo || '') : ''} errorText={st.error || ''} onClose={() => setSt(null)} />
    ) : null;
    return { correr, overlay };
}

const filtrarClientes = (lista, q) => {
    const t = sinTildes(q);
    if (!t) return [];
    const cifras = t.replace(/\D/g, '');
    return (lista || []).filter((c) => {
        const pajar = sinTildes([c.nombre_razon_social, c.apellidos, c.municipio].filter(Boolean).join(' '));
        return t.split(/\s+/).every((w) => pajar.includes(w)) || (cifras.length >= 3 && String(c.tlf || '').replace(/\D/g, '').includes(cifras));
    }).slice(0, 6);
};
const nombreDe = (c) => nombrePropio([c?.nombre, c?.apellidos].filter(Boolean).join(' ')) || 'Sin nombre';

function Campo({ etiqueta, error, ayuda, children, className = '' }) {
    return (
        <label className={`ia-campo${error ? ' mal' : ''} ${className}`}>
            <span>{etiqueta}</span>
            {children}
            {error ? <small className="mal" role="alert">{error}</small> : ayuda ? <small>{ayuda}</small> : null}
        </label>
    );
}
const Chip = ({ activo, onClick, children, peq = false }) => (
    <button type="button" className={`ia-filtro${peq ? ' peq' : ''}`} aria-pressed={activo ? 'true' : 'false'} onClick={onClick}>{children}</button>
);
const Seccion = ({ n, titulo, hecho, children, id }) => (
    <section className="ia-card ia-pr-sec" aria-labelledby={id}>
        <h2 id={id}><span className="ia-pr-n" aria-hidden="true">{n}</span>{titulo}{hecho && <span className="ok" aria-label="Hecho"><Icono n="ok" size={20} grosor={2.6} /></span>}</h2>
        {children}
    </section>
);

/** Móvil: el PDF en una hoja (con teclado: foco dentro, Escape, foco devuelto). */
function HojaPdf({ pdf, cargando, total, onCerrar }) {
    const ref = useHojaTeclado(onCerrar);
    return (
        <div className="ia-velo" onPointerDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.fondo = '1'; }}
            onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1') onCerrar(); e.currentTarget.dataset.fondo = ''; }}>
            <div ref={ref} className="ia-hoja ia-pr-hoja" role="dialog" aria-modal="true" aria-label="Así queda el presupuesto">
                <div className="ia-pr-hoja-cab">
                    <div><p className="ia-eyebrow n">Así queda</p><b>{total}</b></div>
                    <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={onCerrar}>Seguir rellenando</button>
                </div>
                <div className="ia-pr-hoja-cuerpo">
                    {pdf ? <VistaPrevia pdf={pdf} cargando={cargando} etiqueta="Vista previa del presupuesto" />
                        : <div className="ia-hojas-estado">{cargando ? 'Componiendo el PDF…' : 'Rellena el cliente y el precio y aquí lo verás tal cual sale.'}</div>}
                </div>
            </div>
        </div>
    );
}

/**
 * modo: 'nuevo' · 'editar' (con `id` y `entrada`) · 'duplicar' (con `entrada`; nº nuevo).
 * desde: { cliente (ficha del CRM), obra (id de la oportunidad) } — lo que ya viene puesto.
 */
export function PresupuestoForm({ api, modo = 'nuevo', id = null, entrada = null, desde = null, onGuardado, onVolver, volverTexto = 'Presupuestos' }) {
    const [opciones, setOpciones] = useState(null);
    const [falloCarga, setFalloCarga] = useState(false);
    const [intento, setIntento] = useState(0);
    const [f, setF] = useState(null);
    const [clientes, setClientes] = useState(null);
    const [catalogo, setCatalogo] = useState(null);
    const [q, setQ] = useState('');
    const [errores, setErrores] = useState({ general: [] });
    const [faltan, setFaltan] = useState([]);
    const [previa, setPrevia] = useState(null);
    const [previaCargando, setPreviaCargando] = useState(false);
    const [desborda, setDesborda] = useState(false);
    const [verHoja, setVerHoja] = useState(false);
    const guardado = useGuardado();
    const montado = useRef(true);
    useEffect(() => () => { montado.current = false; }, []);

    const obraDesde = desde?.obra || entrada?.obra?.oportunidad || null;
    const clienteDesde = desde?.cliente || null;
    useEffect(() => {
        let vivo = true;
        setFalloCarga(false);
        api.presupuestoNuevo({ obra: obraDesde, cliente: clienteDesde?.id_cliente || null })
            .then((o) => {
                if (!vivo) return;
                setOpciones(o || {});
                const ent = modo === 'editar' ? entrada
                    : modo === 'duplicar' && entrada ? { ...entrada, numero: o?.numero || '', fecha: o?.fecha || entrada.fecha } : null;
                setF((prev) => {
                    if (prev) return prev;
                    const st = estadoInicial({ opciones: o || {}, entrada: ent, cliente: clienteDesde });
                    // Hecho desde una obra: queda ligado a ella aunque el servidor no lo devuelva puesto.
                    if (obraDesde && !st.obra.oportunidad) st.obra = { ...st.obra, oportunidad: obraDesde };
                    return st;
                });
            })
            .catch(() => {
                if (!vivo) return;
                // Cambiando uno ya hecho, se puede seguir sin las opciones (el nº y lo demás ya están).
                if (modo === 'editar' && entrada) { setOpciones({}); setF((prev) => prev || estadoInicial({ entrada })); } else setFalloCarga(true);
            });
        return () => { vivo = false; };
    }, [api, intento]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        let vivo = true;
        api.clientes().then((l) => { if (vivo) setClientes(Array.isArray(l) ? l : []); }).catch(() => { if (vivo) setClientes([]); });
        api.catalogo?.().then((c) => { if (vivo) setCatalogo(c?.equipos || []); }).catch(() => { if (vivo) setCatalogo([]); });
        return () => { vivo = false; };
    }, [api]);

    const conceptos = f ? conceptosVisibles(f) : [];
    const ent = useMemo(() => (f ? entradaDe(f) : null), [f]);
    const calc = useMemo(() => (ent ? calcularPresupuesto({ conceptos: ent.conceptos, modo: ent.modo, total: ent.total, partidas: ent.partidas, iva_pct: ent.iva_pct, con_iva: ent.con_iva }) : null), [ent]);
    const auto = f ? conceptosDe(f.obra) : [];
    const autoCambio = !!(f?.conceptosMano && f.autoAlEditar && JSON.stringify(f.autoAlEditar) !== JSON.stringify(auto));

    // La vista previa: el PDF de verdad, pedido un rato después de dejar de teclear.
    const clavePrevia = ent ? JSON.stringify(ent) : '';
    useEffect(() => {
        if (!ent) return undefined;
        const t = setTimeout(() => {
            setPreviaCargando(true);
            api.presupuestoVistaPrevia(ent)
                .then((r) => { if (!montado.current) return; setPrevia(r?.pdf || null); setDesborda(!!r?.desborda); })
                .catch(() => { /* sin vista previa se puede seguir */ })
                .finally(() => { if (montado.current) setPreviaCargando(false); });
        }, RETARDO_PREVIA);
        return () => clearTimeout(t);
    }, [clavePrevia]); // eslint-disable-line react-hooks/exhaustive-deps

    if (falloCarga) return <div className="ia-pagina estrecha"><Volver onVolver={onVolver} texto={volverTexto} /><AvisoError onReintentar={() => setIntento((n) => n + 1)} /></div>;
    if (!f) return <div className="ia-pagina estrecha"><Volver onVolver={onVolver} texto={volverTexto} /><Esqueleto alto={160} n={3} /></div>;

    // ── Cambiar el estado ──
    const pon = (cambio) => setF((x) => ({ ...x, ...cambio }));
    const ponCliente = (k, v) => setF((x) => ({ ...x, cliente: { ...x.cliente, [k]: v } }));
    const ponObra = (cambio, recalcularExtras = false) => setF((x) => {
        const obra = { ...x.obra, ...cambio };
        if (recalcularExtras) obra.extras = extrasAlCambiarObra(obra, x.extrasTocados);
        return { ...x, obra };
    });
    const ponEquipo = (cambio) => setF((x) => ({ ...x, obra: { ...x.obra, equipo: { ...x.obra.equipo, ...cambio } } }));
    const ponDir = (k, v) => setF((x) => ({ ...x, dir: { ...x.dir, [k]: v } }));
    const elegirCliente = (c) => {
        const ficha = clienteDeFicha(c);
        const { id: cid, ...datos } = ficha;
        setF((x) => ({ ...x, cliente_id: cid, cliente: { ...CLIENTE_VACIO, ...datos }, clienteModo: 'elegido', misma: tieneDireccion(datos) ? x.misma : false }));
        setQ('');
        setErrores((e) => ({ ...e, cliente: null }));
    };
    const clienteNuevo = () => {
        const t = q.trim();
        const digitos = t.replace(/\D/g, '');
        setF((x) => ({ ...x, cliente_id: null, clienteModo: 'nuevo', cliente: { ...CLIENTE_VACIO, ...(digitos.length >= 9 && digitos.length === t.replace(/[\s+]/g, '').length ? { tlf: t } : { nombre: t }) } }));
        setQ('');
    };
    const tocarExtra = (def) => setF((x) => {
        const ya = (x.obra.extras || []).find((e) => e.clave === def.clave);
        const extras = ya ? x.obra.extras.filter((e) => e.clave !== def.clave) : [...(x.obra.extras || []), def.litros ? { clave: def.clave, litros: def.litros } : { clave: def.clave }];
        return { ...x, extrasTocados: true, obra: { ...x.obra, extras } };
    });
    const litrosExtra = (clave, v) => setF((x) => ({ ...x, obra: { ...x.obra, extras: x.obra.extras.map((e) => (e.clave === clave ? { ...e, litros: v.replace(/\D/g, '').slice(0, 4) } : e)) } }));
    // Las líneas: al tocar una, se quedan como están (ya no se regeneran solas).
    const lineasMano = (fn) => setF((x) => {
        const actuales = conceptosVisibles(x);
        const { lineas, partidas } = fn([...actuales], [...x.partidas]);
        return { ...x, conceptosMano: lineas, partidas, autoAlEditar: x.autoAlEditar || conceptosDe(x.obra) };
    });
    const editarLinea = (i, v) => lineasMano((l, p) => { l[i] = v.slice(0, MAX_CONCEPTO); return { lineas: l, partidas: p }; });
    const quitarLinea = (i) => lineasMano((l, p) => { l.splice(i, 1); p.splice(i, 1); return { lineas: l, partidas: p }; });
    const anadirLinea = () => lineasMano((l, p) => { l.push(''); return { lineas: l, partidas: p }; });
    const recomendado = () => pon({ conceptosMano: null, autoAlEditar: null });
    const ponPartida = (i, k, v) => setF((x) => { const p = [...x.partidas]; p[i] = { ...(p[i] || {}), [k]: v }; return { ...x, partidas: p }; });

    // ── Lo que se ve ──
    const o = f.obra;
    const tipo = tipoDe(o);
    const extras = extrasDe(tipo);
    const elegidos = new Set((o.extras || []).map((e) => e.clave));
    const encontrados = filtrarClientes(clientes, q);
    const catMarcas = [...new Set((catalogo || []).map((x) => x.marca).filter(Boolean))];
    const tq = sinTildes(`${o.equipo.marca} ${o.equipo.modelo}`);
    const sugerencias = tipo === 'aerotermia' && catalogo?.length && !o.equipo.aerotermia_id
        ? catalogo.filter((x) => {
            const pajar = sinTildes(`${x.marca} ${x.nombre} ${x.ref || ''}`);
            return tq ? tq.split(/\s+/).filter(Boolean).every((w) => pajar.includes(w)) : true;
        }).slice(0, 4)
        : [];
    const usarEquipo = (x) => ponEquipo({ aerotermia_id: x.id, marca: x.marca || '', modelo: x.ref || x.nombre || '', potencia_kw: o.equipo.potencia_kw || x.potencia_kw || '' });
    const totalTxt = calc && calc.total > 0 ? eur(calc.total) : '—';
    const clienteListo = f.clienteModo === 'elegido' || (f.clienteModo === 'nuevo' && f.cliente.nombre.trim());
    const dirCliente = tieneDireccion(f.cliente);
    const precioListo = !!calc && calc.total > 0;

    const guardar = async () => {
        const falta = [];
        if (!clienteListo) falta.push('el cliente');
        if (!f.numero.trim()) falta.push('el número');
        if (!f.fecha) falta.push('la fecha');
        if (calc?.errores?.length) falta.push(...calc.errores.map((m) => m.replace(/\.$/, '').toLowerCase()));
        setFaltan(falta);
        if (falta.length) return;
        setErrores({ general: [] });
        const ok = modo === 'editar' ? '¡Presupuesto cambiado!' : '¡Presupuesto guardado!';
        try {
            const r = await guardado.correr(
                { enviando: 'Guardando el presupuesto…', ok, subtitulo: 'Ya lo puedes descargar o mandártelo por WhatsApp para pasárselo a tu cliente.' },
                () => (modo === 'editar' ? api.guardarPresupuesto(id, ent) : api.crearPresupuesto(ent)),
                {
                    alCampo: (e) => {
                        const st = e?.response?.status;
                        if (st !== 400 && st !== 409) return false;
                        const porCampo = erroresPorCampo(e);
                        if (montado.current) setErrores(porCampo);
                        return true;
                    },
                },
            );
            onGuardado?.(r?.presupuesto || r, { nuevo: modo !== 'editar' });
        } catch { /* el popup o el campo ya lo cuentan */ }
    };

    const titulo = modo === 'editar' ? `Cambiar el presupuesto ${f.numero || ''}`.trim() : modo === 'duplicar' ? 'Otro presupuesto igual' : 'Nuevo presupuesto';
    return (
        <div className="ia-pagina ancha" style={{ paddingTop: 0 }}>
            <Volver onVolver={onVolver} texto={volverTexto} />
            <div className="ia-accion-cab ia-entra">
                <p className="ia-eyebrow">{opciones?.emisor?.nombre || 'Tu presupuesto'}</p>
                <h1 className="ia-display">{titulo}</h1>
                <p>Rellena de arriba abajo. El texto sale solo y lo puedes cambiar; a la derecha ves el PDF tal cual le llega a tu cliente.</p>
            </div>

            <div className="ia-pr-dos">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                    {/* 1 · El cliente */}
                    <Seccion n={1} titulo="El cliente" hecho={clienteListo} id="ia-pr-cli">
                        {f.clienteModo === 'elegido' ? (
                            <>
                                <div className="ia-pr-elegido">
                                    <span className="ia-baldosa nos c" aria-hidden="true"><Icono n="clientes" size={18} /></span>
                                    <div>
                                        <b>{nombreDe(f.cliente)}</b>
                                        <span>{[f.cliente.tlf && telefonoBonito(f.cliente.tlf), f.cliente.municipio && nombrePropio(f.cliente.municipio)].filter(Boolean).join(' · ') || 'Sin teléfono ni pueblo en su ficha'}</span>
                                    </div>
                                    <button type="button" className="ia-link" onClick={() => pon({ clienteModo: 'buscar', cliente_id: null })}>Cambiar</button>
                                </div>
                                {!dirCliente && <p className="ia-pequeno" style={{ margin: 0 }}>Su ficha no tiene dirección: pon abajo la de la obra.</p>}
                            </>
                        ) : f.clienteModo === 'nuevo' ? (
                            <>
                                <div className="ia-pr-fila2 mitad">
                                    <Campo etiqueta="Nombre"><input type="text" value={f.cliente.nombre} onChange={(e) => ponCliente('nombre', e.target.value)} autoComplete="off" /></Campo>
                                    <Campo etiqueta="Apellidos"><input type="text" value={f.cliente.apellidos} onChange={(e) => ponCliente('apellidos', e.target.value)} autoComplete="off" /></Campo>
                                </div>
                                <div className="ia-pr-fila2 mitad">
                                    <Campo etiqueta="Teléfono"><input type="tel" inputMode="tel" value={f.cliente.tlf} onChange={(e) => ponCliente('tlf', e.target.value)} autoComplete="off" /></Campo>
                                    <Campo etiqueta="DNI (si lo tienes)"><input type="text" value={f.cliente.dni} onChange={(e) => ponCliente('dni', e.target.value.toUpperCase())} autoComplete="off" /></Campo>
                                </div>
                                <Campo etiqueta="Dirección" error={errores.direccion}><input type="text" value={f.cliente.direccion} onChange={(e) => ponCliente('direccion', e.target.value)} autoComplete="off" placeholder="Calle y número" /></Campo>
                                <div className="ia-pr-fila2">
                                    <Campo etiqueta="C. P."><input type="text" inputMode="numeric" value={f.cliente.codigo_postal} onChange={(e) => ponCliente('codigo_postal', e.target.value.replace(/\D/g, '').slice(0, 5))} autoComplete="off" /></Campo>
                                    <Campo etiqueta="Pueblo"><input type="text" value={f.cliente.municipio} onChange={(e) => ponCliente('municipio', e.target.value)} autoComplete="off" /></Campo>
                                </div>
                                <button type="button" className="ia-link" style={{ alignSelf: 'flex-start' }} onClick={() => pon({ clienteModo: 'buscar' })}>Mejor busco entre mis clientes</button>
                            </>
                        ) : (
                            <>
                                <Campo etiqueta="Busca entre tus clientes" error={errores.cliente && f.clienteModo === 'buscar' ? errores.cliente : null}>
                                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, apellido o teléfono" autoComplete="off" enterKeyHint="search" />
                                </Campo>
                                {(q.trim() || clientes?.length === 0) && (
                                    <div className="ia-pr-lista" role="list">
                                        {encontrados.map((c) => (
                                            <button key={c.id_cliente} type="button" role="listitem" onClick={() => elegirCliente(c)}>
                                                <span><b>{nombrePropio([c.nombre_razon_social, c.apellidos].filter(Boolean).join(' '))}</b>
                                                    <small>{[c.tlf && telefonoBonito(c.tlf), c.municipio && nombrePropio(c.municipio)].filter(Boolean).join(' · ')}</small></span>
                                            </button>
                                        ))}
                                        <button type="button" role="listitem" className="nuevo" onClick={clienteNuevo}>
                                            <Icono n="mas" size={20} grosor={2.4} /> <span><b>Cliente nuevo{q.trim() ? `: ${q.trim()}` : ''}</b><small>Lo damos de alta al guardar</small></span>
                                        </button>
                                    </div>
                                )}
                                {!q.trim() && clientes?.length > 0 && (
                                    <button type="button" className="ia-link" style={{ alignSelf: 'flex-start' }} onClick={clienteNuevo}>Es un cliente nuevo</button>
                                )}
                            </>
                        )}
                        {errores.cliente && f.clienteModo !== 'buscar' && <div className="ia-aviso tu" role="alert">{errores.cliente}</div>}
                    </Seccion>

                    {/* 2 · La obra */}
                    <Seccion n={2} titulo="La obra" id="ia-pr-obra">
                        <div className="ia-chips" role="group" aria-label="Qué obra es">
                            {TIPOS_OBRA.map((t) => <Chip key={t.clave} activo={tipo === t.clave} onClick={() => ponObra({ tipo: t.clave }, true)}>{t.texto}</Chip>)}
                        </div>
                        {tipo === 'aerotermia' && (
                            <>
                                <fieldset className="ia-campo">
                                    <legend>La caldera que se quita</legend>
                                    <div className="ia-chips">
                                        {COMBUSTIBLES.map((c) => <Chip key={c.clave} peq activo={o.caldera?.combustible === c.clave} onClick={() => ponObra({ caldera: { combustible: c.clave } }, true)}>{c.texto}</Chip>)}
                                    </div>
                                </fieldset>
                                <fieldset className="ia-campo">
                                    <legend>¿La aerotermia da también el agua caliente?</legend>
                                    <div className="ia-chips">
                                        <Chip peq activo={o.acs} onClick={() => ponObra({ acs: true })}>Sí</Chip>
                                        <Chip peq activo={!o.acs} onClick={() => ponObra({ acs: false })}>No, solo calefacción</Chip>
                                    </div>
                                </fieldset>
                                <fieldset className="ia-campo">
                                    <legend>Va conectada a</legend>
                                    <div className="ia-chips">
                                        {EMISORES.map((x) => <Chip key={x.clave} peq activo={(o.emisor || 'radiadores') === x.clave} onClick={() => ponObra({ emisor: x.clave })}>{x.texto}</Chip>)}
                                    </div>
                                </fieldset>
                            </>
                        )}
                        {tipo === 'otro' ? (
                            <Campo etiqueta="¿Qué obra es?" ayuda="Una línea por cada cosa que incluye: así sale en el presupuesto.">
                                <textarea rows={4} value={o.descripcion} onChange={(e) => ponObra({ descripcion: e.target.value })} />
                            </Campo>
                        ) : (
                            <>
                                <div className="ia-pr-fila2 mitad">
                                    <Campo etiqueta="Marca">
                                        <input type="text" list={catMarcas.length ? 'ia-pr-marcas' : undefined} value={o.equipo.marca} autoComplete="off"
                                            onChange={(e) => ponEquipo({ marca: e.target.value, aerotermia_id: null })} />
                                    </Campo>
                                    <Campo etiqueta="Modelo">
                                        <input type="text" value={o.equipo.modelo} autoComplete="off" onChange={(e) => ponEquipo({ modelo: e.target.value, aerotermia_id: null })} />
                                    </Campo>
                                </div>
                                {catMarcas.length > 0 && <datalist id="ia-pr-marcas">{catMarcas.map((m) => <option key={m} value={m} />)}</datalist>}
                                {sugerencias.length > 0 && (
                                    <div className="ia-pr-lista" aria-label="De tu catálogo">
                                        {sugerencias.map((x) => (
                                            <button key={x.id} type="button" onClick={() => usarEquipo(x)}>
                                                <span className="ia-baldosa c" aria-hidden="true"><Icono n="catalogo" size={16} /></span>
                                                <span><b>{[x.marca, x.nombre].filter(Boolean).join(' · ')}</b><small>{[x.ref, x.potencia_kw && `${x.potencia_kw} kW`].filter(Boolean).join(' · ')} · de tu catálogo</small></span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {o.equipo.aerotermia_id && <p className="ia-pequeno" style={{ margin: 0 }}>De tu catálogo. Si lo cambias a mano, se queda como lo escribas.</p>}
                                <div className="ia-pr-fila2 mitad">
                                    {tipo === 'acs' ? (
                                        <Campo etiqueta="Litros (opcional)"><input type="text" inputMode="numeric" value={o.equipo.litros} onChange={(e) => ponEquipo({ litros: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Campo>
                                    ) : (
                                        <Campo etiqueta="Potencia en kW (opcional)"><input type="text" inputMode="decimal" value={o.equipo.potencia_kw} onChange={(e) => ponEquipo({ potencia_kw: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) })} /></Campo>
                                    )}
                                </div>
                            </>
                        )}
                        <label className="ia-permiso">
                            <input type="checkbox" checked={f.misma && dirCliente} disabled={!dirCliente} onChange={(e) => pon({ misma: e.target.checked })} />
                            <span>La obra es en la misma dirección del cliente{dirCliente ? <><br /><span className="ia-pequeno">{[f.cliente.direccion, [f.cliente.codigo_postal, f.cliente.municipio].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span></> : null}</span>
                        </label>
                        {!(f.misma && dirCliente) && (
                            <>
                                <Campo etiqueta="Dirección de la obra" error={f.clienteModo === 'elegido' ? errores.direccion : null}>
                                    <input type="text" value={f.dir.direccion} onChange={(e) => ponDir('direccion', e.target.value)} placeholder="Calle y número" autoComplete="off" />
                                </Campo>
                                <div className="ia-pr-fila2">
                                    <Campo etiqueta="C. P."><input type="text" inputMode="numeric" value={f.dir.codigo_postal} onChange={(e) => ponDir('codigo_postal', e.target.value.replace(/\D/g, '').slice(0, 5))} autoComplete="off" /></Campo>
                                    <Campo etiqueta="Pueblo"><input type="text" value={f.dir.municipio} onChange={(e) => ponDir('municipio', e.target.value)} autoComplete="off" /></Campo>
                                </div>
                            </>
                        )}
                        {extras.length > 0 && (
                            <fieldset className="ia-campo">
                                <legend>¿Qué más lleva?</legend>
                                <div className="ia-chips">
                                    {extras.map((x) => {
                                        const sel = (o.extras || []).find((e) => e.clave === x.clave);
                                        return (
                                            <span key={x.clave} className="ia-pr-extra">
                                                <Chip peq activo={elegidos.has(x.clave)} onClick={() => tocarExtra(x)}>{x.etiqueta}</Chip>
                                                {sel && x.litros && (
                                                    <span className="ia-pr-litros">
                                                        <input type="text" inputMode="numeric" aria-label={`Litros: ${x.etiqueta}`} value={sel.litros ?? ''} onChange={(e) => litrosExtra(x.clave, e.target.value)} /> l
                                                    </span>
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        )}
                    </Seccion>

                    {/* 3 · Lo que incluye */}
                    <Seccion n={3} titulo="Lo que incluye" id="ia-pr-lineas">
                        <p className="ia-pequeno" style={{ margin: 0, fontSize: 14 }}>
                            {f.conceptosMano ? 'Lo has cambiado tú: así se queda aunque cambies la obra.' : 'Sale solo con lo que has marcado arriba. Puedes cambiar cualquier línea.'}
                        </p>
                        {autoCambio && (
                            <div className="ia-aviso tu ia-aviso-fila" role="status">
                                <span>Has cambiado la obra, pero estas líneas las tocaste tú y no las cambio.</span>
                                <button type="button" className="ia-link" onClick={recomendado}>Poner el texto nuevo</button>
                            </div>
                        )}
                        {conceptos.map((t, i) => (
                            <div key={i} className="ia-pr-linea">
                                <textarea aria-label={`Línea ${i + 1}`} value={t} rows={i === 0 ? 4 : 2} onChange={(e) => editarLinea(i, e.target.value)} />
                                <div className="ia-pr-linea-pie">
                                    {f.modo === 'partidas' ? (
                                        <span className="ia-pr-partida">
                                            <label>Cant.<input className="c" type="text" inputMode="decimal" value={f.partidas[i]?.cantidad ?? ''} placeholder="1" onChange={(e) => ponPartida(i, 'cantidad', e.target.value)} /></label>
                                            <label>Precio<input className="p" type="text" inputMode="decimal" value={f.partidas[i]?.precio ?? ''} placeholder="0,00" onChange={(e) => ponPartida(i, 'precio', e.target.value)} /></label>
                                        </span>
                                    ) : <span>{i === 0 ? 'Aquí va el precio de toda la obra' : `Línea ${i + 1}`}</span>}
                                    {conceptos.length > 1 && <button type="button" className="ia-link" onClick={() => quitarLinea(i)}>Quitar</button>}
                                </div>
                            </div>
                        ))}
                        {errores.conceptos && <div className="ia-aviso tu" role="alert">{errores.conceptos}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                            {conceptos.length < MAX_LINEAS && <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={anadirLinea}><Icono n="mas" size={18} /> Añadir una línea</button>}
                            {f.conceptosMano && <button type="button" className="ia-link" onClick={recomendado}>Volver al texto recomendado</button>}
                        </div>
                    </Seccion>

                    {/* 4 · El precio */}
                    <Seccion n={4} titulo="El precio" hecho={precioListo} id="ia-pr-precio">
                        <div className="ia-chips" role="group" aria-label="Cómo pones el precio">
                            <Chip activo={f.modo === 'total'} onClick={() => pon({ modo: 'total' })}>Un precio para todo</Chip>
                            <Chip activo={f.modo === 'partidas'} onClick={() => pon({ modo: 'partidas' })}>Por partidas</Chip>
                        </div>
                        {f.modo === 'total' ? (
                            <Campo etiqueta={f.con_iva ? 'Precio de toda la obra, con el IVA' : 'Precio de toda la obra, sin IVA'} error={errores.precio}>
                                <input type="text" className="ia-precio" inputMode="decimal" value={f.total} placeholder="0,00" onChange={(e) => pon({ total: e.target.value.replace(/[^\d.,]/g, '') })} />
                            </Campo>
                        ) : (
                            <>
                                <p className="ia-pequeno" style={{ margin: 0, fontSize: 14 }}>Pon la cantidad y el precio en cada línea de arriba{f.con_iva ? ' (con el IVA)' : ' (sin IVA)'}. La que no tenga precio sale sin importe.</p>
                                {errores.precio && <div className="ia-aviso tu" role="alert">{errores.precio}</div>}
                            </>
                        )}
                        <label className="ia-permiso">
                            <input type="checkbox" checked={f.con_iva} onChange={(e) => pon({ con_iva: e.target.checked })} />
                            <span>El precio que pongo ya lleva el IVA</span>
                        </label>
                        <fieldset className="ia-campo">
                            <legend>IVA</legend>
                            <div className="ia-chips">
                                <Chip peq activo={f.iva_pct === 21} onClick={() => pon({ iva_pct: 21 })}>21 %</Chip>
                                <Chip peq activo={f.iva_pct === 10} onClick={() => pon({ iva_pct: 10 })}>10 % (vivienda)</Chip>
                            </div>
                        </fieldset>
                        <div className="ia-pr-totales" aria-live="polite">
                            <div className="fila"><span>Importe</span><b>{calc ? eur(calc.base) : '—'}</b></div>
                            <div className="fila"><span>IVA {f.iva_pct} %</span><b>{calc ? eur(calc.iva) : '—'}</b></div>
                            <div className="total"><span>Total</span><b>{totalTxt}</b></div>
                        </div>
                    </Seccion>

                    {/* 5 · Número y fecha */}
                    <Seccion n={5} titulo="Número y fecha" id="ia-pr-datos">
                        <div className="ia-pr-fila2 mitad">
                            <Campo etiqueta="Nº de presupuesto" error={errores.numero}>
                                <input type="text" value={f.numero} onChange={(e) => pon({ numero: e.target.value.slice(0, 30) })} autoComplete="off" />
                            </Campo>
                            <Campo etiqueta="Fecha" error={errores.fecha}>
                                <input type="date" value={f.fecha} onChange={(e) => pon({ fecha: e.target.value })} />
                            </Campo>
                        </div>
                        {errores.sugerido && (
                            <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" style={{ alignSelf: 'flex-start' }}
                                onClick={() => { pon({ numero: errores.sugerido }); setErrores((e) => ({ ...e, numero: null, sugerido: null })); }}>
                                Usar el {errores.sugerido}
                            </button>
                        )}
                        <Campo etiqueta="Validez (días)">
                            <input type="number" min="1" max="365" inputMode="numeric" value={f.validez_dias ?? ''} onChange={(e) => pon({ validez_dias: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                        </Campo>
                        <Campo etiqueta="Nota al pie" ayuda="Sale debajo de los totales.">
                            <textarea rows={2} value={f.notas} onChange={(e) => pon({ notas: e.target.value.slice(0, 400) })} />
                        </Campo>
                    </Seccion>

                    {desborda && <div className="ia-aviso tu" role="status">El texto ya no cabe en una hoja. Acorta alguna línea o quita una.</div>}
                    {errores.general?.length > 0 && <div className="ia-aviso tu" role="alert">{errores.general.join(' ')}</div>}

                    <div className="ia-pr-guardar">
                        {faltan.length > 0 && <div className="ia-aviso tu" role="alert"><b>Falta:</b> {faltan.join(', ')}.</div>}
                        <div className="fila">
                            <button type="button" className="ia-pr-ver" onClick={() => setVerHoja(true)} aria-haspopup="dialog">
                                Ver PDF<b>{totalTxt}</b>
                            </button>
                            <button type="button" className="ia-btn ia-btn-pri" onClick={guardar}>
                                <Icono n="ok" size={22} grosor={2.4} /> {modo === 'editar' ? 'Guardar los cambios' : 'Guardar el presupuesto'}
                            </button>
                        </div>
                    </div>
                </div>

                <aside className="ia-pr-lado" aria-label="Así queda el presupuesto">
                    {previa ? <VistaPrevia pdf={previa} cargando={previaCargando} etiqueta="Vista previa del presupuesto" />
                        : <div className="ia-hojas"><div className="ia-hojas-estado">{previaCargando ? 'Componiendo el PDF…' : 'Aquí verás el presupuesto tal cual sale, con tu plantilla.'}</div></div>}
                </aside>
            </div>

            {verHoja && <HojaPdf pdf={previa} cargando={previaCargando} total={totalTxt} onCerrar={() => setVerHoja(false)} />}
            {guardado.overlay}
        </div>
    );
}

function Volver({ onVolver, texto }) {
    return (
        <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
            <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> {texto}</button>
        </div>
    );
}
