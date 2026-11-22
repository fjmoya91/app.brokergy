// ─── Catálogo (fase 4, prototipos «Catalogo» y «Modelo») ─────────────────────
// La aerotermia de SUS marcas (las de su FICHA, leídas en cada petición) con la tarifa
// de CADA distribuidor al que le compra y SU precio (el que pone él y usa en sus
// presupuestos). Un equipo sin tarifa dice «Sin tarifa todavía», nunca un 0. Sin
// marcas no se ve NINGÚN equipo (lo más prudente): se le dice que nos escriba. Nada
// de márgenes, comisiones ni enlaces: la ficha técnica se pide por el proxy y se pinta
// dentro (HojasPdf).
// 22/11/2026 (Fran): «que le aparezcan las marcas, tipo nuestro catálogo… si selecciona
// un modelo, su tabla de precios con los distribuidores con los que trabaja, que pueda
// elegir de quién lo va a comprar y pedírselo al comercial». La lista arranca en los
// LOGOS de sus marcas; la ficha enseña un precio por distribuidor, «Se lo compro a»
// (se recuerda por modelo) y «Pedir a…» (VE el mensaje entero antes de mandarlo; lo
// manda BROKERGY al comercial, con copia a él). Ver catalogo-por-distribuidor.md.
// «Calcular una obra con este equipo» abre la Nueva simulación con el equipo elegido y
// su precio como presupuesto de la aerotermia (`onCalcular`).
import React, { useEffect, useMemo, useState } from 'react';
import { Icono, Buscador, Esqueleto, AvisoError, sinTildes, useHojaTeclado } from '../ui/piezas';
import { useEnvio, HojasPdf } from './AccionesObra';
import { useVistaGuardada, useGuardarVista, useScrollLista } from '../../../utils/memoriaVista';

/** «6.900 €» o «6.899,50 €»: los céntimos solo si los hay (una tarifa no se redondea). */
export function precio(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return null;
    const [ent, dec] = v.toFixed(2).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec === '00' ? `${miles} €` : `${miles},${dec} €`;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (iso) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    return m ? `${MESES[Number(m[2]) - 1]} de ${m[1]}` : null;
};
const scop = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n).toFixed(2).replace('.', ',') : null);
const kw = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? `${String(Math.round(Number(n) * 100) / 100).replace('.', ',')} kW` : null);
const nombreMarca = (m) => String(m || '').trim();
/** Las marcas llegan como { nombre, logo, equipos } (antes, texto suelto). */
const tarjetaMarca = (m) => (typeof m === 'string' ? { nombre: m, logo: null, equipos: null } : m);

function pasa(e, q) {
    if (!q) return true;
    const texto = sinTildes([e.marca, e.nombre, e.ref, e.referencias?.conjunto, e.referencias?.exterior, e.referencias?.interior,
        kw(e.potencia_kw), e.potencia_kw && `${e.potencia_kw}kw`, e.uso].filter(Boolean).join(' '));
    const plano = texto.replace(/[\s-]/g, '');
    return sinTildes(q).split(/\s+/).filter(Boolean).every((t) => texto.includes(t) || plano.includes(t.replace(/-/g, '')));
}

function LogoMarca({ m, grande = false }) {
    const [roto, setRoto] = useState(false);
    return (
        <span className={`ia-mc-logo${grande ? ' g' : ''}`} aria-hidden="true">
            {m.logo && !roto ? <img src={m.logo} alt="" onError={() => setRoto(true)} /> : <span>{nombreMarca(m.nombre)}</span>}
        </span>
    );
}

// ── La lista: primero los LOGOS de sus marcas; dentro, sus equipos ───────────
export function CatalogoView({ datos, cargando, error, onReintentar, onAbrir }) {
    const memoria = useVistaGuardada('instalador-catalogo');
    const [q, setQ] = useState(memoria.q ?? '');
    const [marca, setMarca] = useState(memoria.marca ?? '');
    useGuardarVista('instalador-catalogo', { q, marca });
    const equipos = datos?.equipos || [];
    const marcas = useMemo(() => (datos?.marcas || []).map(tarjetaMarca), [datos]);
    const unaSola = marcas.length === 1;
    const marcaVale = unaSola ? marcas[0].nombre : (marca && marcas.some((m) => m.nombre === marca) ? marca : '');
    const enMarca = marcas.find((m) => m.nombre === marcaVale) || null;
    // Con una marca elegida se ven sus equipos; sin elegir, los logos (y al buscar, de todas).
    const verEquipos = !!marcaVale || !!q.trim();
    const vistos = useMemo(() => equipos.filter((e) => (!marcaVale || e.marca === marcaVale) && pasa(e, q)), [equipos, marcaVale, q]);
    const lista = useScrollLista('instalador-catalogo', false, !cargando && (verEquipos ? vistos.length > 0 : marcas.length > 0));
    const sinProveedores = datos && !datos.sin_marcas && Array.isArray(datos.proveedores) && datos.proveedores.length === 0;

    return (
        <div ref={lista.ancla} className="ia-pagina pc">
            {enMarca && !unaSola ? (
                <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                    <button type="button" className="ia-volver" onClick={() => setMarca('')}><Icono n="atras" size={22} /> Marcas</button>
                </div>
            ) : null}
            <div className="ia-hola ia-entra">
                {enMarca ? (
                    <div className="ia-mc-cab"><LogoMarca m={enMarca} grande /><h1 className="ia-display">{nombreMarca(enMarca.nombre)}</h1></div>
                ) : <h1 className="ia-display">Catálogo</h1>}
                <p>{enMarca ? 'Sus equipos, con el precio de tus distribuidores' : 'Las marcas con las que trabajas, con la tarifa de tus distribuidores'}</p>
            </div>
            {cargando ? <Esqueleto alto={128} n={4} /> : error ? (
                <AvisoError onReintentar={onReintentar} texto="Es un fallo nuestro y pasajero. Tu catálogo sigue ahí: vuelve a intentarlo en un momento." />
            ) : datos?.sin_marcas ? (
                <div className="ia-card"><div className="ia-vacio">
                    <b>Aún no tienes marcas en tu catálogo</b>
                    <p>Dinos qué marcas de aerotermia instalas y te las ponemos aquí con su tarifa.</p>
                </div></div>
            ) : (
                <>
                    <div className="ia-pc-buscar"><Buscador valor={q} onCambio={setQ} placeholder={enMarca ? `Busca en ${nombreMarca(enMarca.nombre)} por modelo o potencia` : 'Busca por modelo o potencia'} etiqueta="Buscar equipo" /></div>
                    {sinProveedores && (
                        <p className="ia-aviso" style={{ margin: 0 }}>Todavía no sabemos a qué distribuidores les compras: dínoslo y te ponemos aquí sus tarifas.</p>
                    )}
                    {!verEquipos ? (
                        <section aria-label="Tus marcas" className="ia-mc-rejilla">
                            {marcas.map((m) => (
                                <button key={m.nombre} type="button" className="ia-mc ia-entra" onClick={() => { setMarca(m.nombre); setQ(''); }}
                                    aria-label={`${nombreMarca(m.nombre)}: ${m.equipos ? `${m.equipos} ${m.equipos === 1 ? 'equipo' : 'equipos'}` : 'sin equipos todavía'}`}>
                                    <LogoMarca m={m} />
                                    <span className="ia-mc-pie">
                                        <b>{nombreMarca(m.nombre)}</b>
                                        <small>{m.equipos ? `${m.equipos} ${m.equipos === 1 ? 'equipo' : 'equipos'}` : 'Sin equipos todavía'}</small>
                                    </span>
                                </button>
                            ))}
                        </section>
                    ) : vistos.length === 0 ? (
                        <p className="ia-nada">{equipos.some((e) => !marcaVale || e.marca === marcaVale) ? 'No hay ningún equipo con eso. Si te falta un modelo, dínoslo y lo damos de alta.' : 'Todavía no hay equipos de esta marca. Dínoslo y los damos de alta.'}</p>
                    ) : (
                        <section aria-label="Equipos" className="ia-eq-rejilla">
                            {vistos.map((e) => <TarjetaEquipo key={e.id} e={e} conMarca={!marcaVale} onClick={() => { lista.recordar(); onAbrir(e); }} />)}
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function TarjetaEquipo({ e, conMarca, onClick }) {
    const t = precio(e.tarifa?.precio);
    const s = scop(e.scop_suelo);
    const n = (e.tarifas || []).length;
    const de = e.tarifa?.distribuidor
        ? (e.tarifa.elegida ? `de ${e.tarifa.distribuidor}` : n > 1 ? `la mejor de ${n}` : `de ${e.tarifa.distribuidor}`)
        : 'tarifa sin IVA';
    return (
        <button type="button" className="ia-eq ia-entra" onClick={onClick}>
            <span className="ia-eq-a">
                <span>
                    {conMarca && <span className="ia-eyebrow">{nombreMarca(e.marca)}</span>}
                    <b>{e.nombre}</b>
                    {e.ref && <span className="ia-eq-ref">{e.ref}</span>}
                </span>
                <span className="ia-eq-tarifa">
                    {t ? <><b>{t}</b><span>{de}</span></> : <span className="sin">Sin tarifa todavía</span>}
                </span>
            </span>
            <span className="ia-eq-chips">
                {kw(e.potencia_kw) && <span className="ia-eq-chip">{kw(e.potencia_kw)}</span>}
                {e.uso && <span className="ia-eq-chip">{e.uso}</span>}
                {s && <span className="ia-eq-chip v">SCOP {s}</span>}
                {e.acs_corto && e.acs_corto !== 'Sin agua caliente' && <span className="ia-eq-chip">{e.acs_corto}</span>}
                {e.tu_precio != null && <span className="ia-eq-chip n">Tu precio {precio(e.tu_precio)}</span>}
            </span>
        </button>
    );
}

/** Una fila por distribuidor al que compra: los que tienen tarifa (la más barata primero) y luego los que no. */
function filasDistribuidores(e, proveedores) {
    const conTarifa = (e?.tarifas || []).map((t) => ({ id: t.distribuidor_id, nombre: t.distribuidor, precio: t.precio, desde: t.desde }));
    const ya = new Set(conTarifa.map((f) => f.id));
    const sin = (proveedores || []).filter((p) => !ya.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre, precio: null, desde: null }));
    return [...conTarifa, ...sin];
}

// ── La ficha de un equipo ────────────────────────────────────────────────────
export function EquipoView({ id, base, proveedores: provBase, api, onVolver, onCalcular, onCambio }) {
    const [estado, setEstado] = useState({ datos: null, error: false });
    const [intento, setIntento] = useState(0);
    const [hoja, setHoja] = useState(false);
    const [pedido, setPedido] = useState(false);
    const [papel, setPapel] = useState(null); // el papel abierto
    const [eligiendo, setEligiendo] = useState(null); // distribuidor que se está guardando
    const [avisoCompra, setAvisoCompra] = useState('');
    const envio = useEnvio();
    useEffect(() => {
        let vivo = true;
        api.equipo(id).then((d) => { if (vivo) setEstado({ datos: d, error: false }); })
            .catch(() => { if (vivo) setEstado((s) => ({ datos: s.datos, error: !s.datos })); });
        return () => { vivo = false; };
    }, [api, id, intento]);
    const e = estado.datos || base;
    const proveedores = estado.datos?.proveedores || provBase || [];
    const filas = filasDistribuidores(e, proveedores);
    const barata = filas.length > 1 && filas[0].precio != null && filas.filter((f) => f.precio != null).length > 1 ? filas[0].id : null;
    const t = precio(e?.tarifa?.precio);
    const tuyo = precio(e?.tu_precio);
    const compro = e?.compro_a || null;
    const paraPedir = compro || e?.tarifa?.distribuidor_id || filas[0]?.id || null;
    const nombreDe = (d) => filas.find((f) => f.id === d)?.nombre || 'tu distribuidor';

    const elegir = async (dist) => {
        if (dist === compro || eligiendo) return;
        setEligiendo(dist); setAvisoCompra('');
        try {
            await api.compra(id, dist);
            setEstado((s) => (s.datos ? { ...s, datos: { ...s.datos, compro_a: dist } } : s));
            setIntento((k) => k + 1); onCambio?.();
        } catch (err) {
            setAvisoCompra(err?.response?.data?.error || 'No se ha podido guardar. Vuelve a intentarlo.');
        } finally { setEligiendo(null); }
    };
    const guardar = async (valor) => {
        await envio.alSubir({ enviando: 'Guardando tu precio…', ok: 'Precio guardado', subtitulo: 'Es el que usaremos en tus presupuestos con este equipo.' })(() => api.guardarPrecio(id, valor));
        setHoja(false); setIntento((k) => k + 1); onCambio?.();
    };
    const quitar = async () => {
        await envio.alSubir({ enviando: 'Quitando tu precio…', ok: 'Listo', subtitulo: 'Usaremos la tarifa del distribuidor.' })(() => api.quitarPrecio(id));
        setHoja(false); setIntento((k) => k + 1); onCambio?.();
    };
    const mandar = async (body, previa) => {
        const r = await envio.alSubir({
            enviando: `Mandando el pedido a ${previa.comercial || previa.distribuidor}…`,
            alAcabar: (res) => (res?.en_seco
                ? { ok: 'Pedido preparado (sin enviar)', subtitulo: 'Estamos en pruebas: el mensaje no ha salido. Te avisamos cuando los pedidos estén activos.' }
                : {
                    ok: 'Pedido enviado',
                    subtitulo: `Le ha llegado a ${res?.comercial || res?.distribuidor}${res?.copia_a_ti ? ' y a ti te hemos mandado copia por WhatsApp' : ''}.`,
                    items: (res?.canales || []).map((c) => ({ texto: `Por ${c}`, tono: 'ok' })),
                }),
        })(() => api.pedido(id, body));
        setPedido(false);
        return r;
    };

    const lineas = e ? [
        ['Sirve para', e.uso],
        ['Cómo se monta', e.montaje],
        ['Potencia de calefacción', kw(e.potencia_kw)],
        ['Potencia de frío', kw(e.potencia_frio_kw)],
        ['Con suelo radiante', scop(e.scop_suelo) && `SCOP ${scop(e.scop_suelo)}`, 'v'],
        ['Con radiadores', scop(e.scop_radiadores) && `SCOP ${scop(e.scop_radiadores)}`],
        ['Agua caliente', e.acs],
        ['Gas refrigerante', e.refrigerante],
    ].filter((l) => l[1]) : [];

    return (
        // En el PC (fase 5, 22/11/2026): el nombre a lo ancho y, debajo, lo que hace y sus
        // papeles a la izquierda; la tarifa, tu precio y «Calcular» a la derecha. En el móvil
        // los envoltorios no existen y `order` deja el orden de siempre (precio, lo que hace,
        // papeles, calcular).
        <div className="ia-pagina pc medio" style={{ paddingTop: 0 }}>
            <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> {e?.marca ? nombreMarca(e.marca) : 'Catálogo'}</button>
            </div>
            {!e ? (estado.error ? <AvisoError onReintentar={() => setIntento((k) => k + 1)} /> : <Esqueleto alto={160} n={3} />) : (
                <>
                    <div className="ia-eq-cab ia-entra">
                        <p className="ia-eyebrow n">{nombreMarca(e.marca)} · aerotermia</p>
                        <h1 className="ia-display">{e.nombre}</h1>
                        {e.ref && <p className="ref">{e.ref}</p>}
                    </div>

                    <div className="ia-pc-dos">
                    <div className="ia-pc-lado" style={{ order: 2 }}>
                    <section className="ia-card ia-eq-precio ia-entra" style={{ order: 2 }} aria-labelledby="ia-eq-tarifa">
                        <p id="ia-eq-tarifa" className="ia-eyebrow">{filas.length > 1 ? 'Precio de tus distribuidores' : 'Tarifa del distribuidor'}</p>
                        {filas.length === 0 ? (
                            <>
                                <p className="ia-display ia-eq-sin">Sin tarifa todavía</p>
                                <p className="ia-pequeno" style={{ margin: '6px 0 0' }}>Dinos a qué distribuidores les compras y te ponemos aquí su tarifa. Mientras, puedes poner tu precio.</p>
                            </>
                        ) : (
                            <>
                                {filas.length > 1 && <p className="ia-pequeno" style={{ margin: '6px 0 4px' }}>Sin IVA. Marca a quién se lo compras: lo recordamos para este modelo.</p>}
                                <div className="ia-dist" role="radiogroup" aria-label="Se lo compro a">
                                    {filas.map((f, i) => {
                                        const marcado = compro ? compro === f.id : (filas.length === 1);
                                        const mes = mesDe(f.desde);
                                        return (
                                            <button key={f.id} type="button" role="radio" aria-checked={marcado} disabled={!!eligiendo}
                                                className={`ia-dist-f${i === 0 ? ' primera' : ''}${marcado ? ' si' : ''}`} onClick={() => elegir(f.id)}>
                                                <span className="ia-dist-o" aria-hidden="true">{marcado && <Icono n="ok" size={16} grosor={3} />}</span>
                                                <span className="ia-dist-n">
                                                    <b>{f.nombre}</b>
                                                    <small>{eligiendo === f.id ? 'Guardando…' : marcado && compro ? 'Se lo compras a este' : f.precio != null ? `Sin IVA${mes ? ` · desde ${mes}` : ''}` : 'Sin tarifa de este modelo'}</small>
                                                </span>
                                                <span className="ia-dist-p">
                                                    {f.precio != null ? <b>{precio(f.precio)}</b> : <span className="sin">—</span>}
                                                    {barata === f.id && <span className="ia-eq-chip v">Más barato</span>}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {avisoCompra && <p className="ia-pequeno" role="alert" style={{ color: 'var(--ambar-txt)', margin: '6px 0 0' }}>{avisoCompra}</p>}
                                {paraPedir && (
                                    <button type="button" className="ia-btn ia-btn-pri" style={{ marginTop: 14, width: '100%' }} onClick={() => setPedido(true)}>
                                        <Icono n="enviar" size={20} grosor={2.2} /> Pedir a {nombreDe(paraPedir)}
                                    </button>
                                )}
                            </>
                        )}
                        <div className="ia-eq-tuyo">
                            <div>
                                <span>Tu precio en los presupuestos</span>
                                {tuyo ? <b>{tuyo} <small style={{ fontSize: 13, fontWeight: 600, color: 'var(--gris)' }}>sin IVA</small></b>
                                    : <b className="falta">{t ? `El de ${e.tarifa?.distribuidor || 'la tarifa'}` : 'Sin poner'}</b>}
                            </div>
                            <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={() => setHoja(true)}>Cambiar</button>
                        </div>
                    </section>
                    {onCalcular && (
                        <button type="button" className={`ia-btn ${paraPedir ? 'ia-btn-sec' : 'ia-btn-pri'}`} style={{ order: 5 }} onClick={() => onCalcular(e)}>
                            <Icono n="mas" size={22} grosor={2.4} /> Calcular una obra con este equipo
                        </button>
                    )}
                    </div>

                    <div className="ia-pc-main" style={{ order: 1 }}>
                    {lineas.length > 0 && (
                        <section className="ia-card filas ia-entra" style={{ order: 3 }} aria-labelledby="ia-eq-hace">
                            <p id="ia-eq-hace" className="ia-eyebrow">Lo que hace</p>
                            <dl className="ia-dl" style={{ marginTop: 8 }}>
                                {lineas.map(([dt, dd, tono], i) => (
                                    <div key={dt} className={i === 0 ? 'primera' : undefined}>
                                        <dt>{dt}</dt><dd style={tono === 'v' ? { color: 'var(--verde-txt)' } : undefined}>{dd}</dd>
                                    </div>
                                ))}
                            </dl>
                            {e.clima_scop === 'medio' && (e.scop_suelo || e.scop_radiadores) && (
                                <p className="ia-pequeno" style={{ margin: '8px 0 0' }}>SCOP en clima medio: el del clima cálido no está en su ficha.</p>
                            )}
                        </section>
                    )}

                    <section className="ia-card filas ia-entra" style={{ order: 4 }} aria-labelledby="ia-eq-papeles">
                        <p id="ia-eq-papeles" className="ia-eyebrow">Sus papeles</p>
                        {(e.papeles || []).length ? (e.papeles || []).map((p, i) => (
                            <React.Fragment key={p.id}>
                                <button type="button" className={`ia-eq-papel${i === 0 ? ' primera' : ''}`} aria-expanded={papel === p.id}
                                    onClick={() => setPapel((x) => (x === p.id ? null : p.id))}>
                                    <span className="ico" aria-hidden="true"><Icono n="factura" size={20} /></span>
                                    <span className="txt">
                                        <b>{p.nombre}</b>
                                        <small>{p.incluye?.length ? `La del fabricante, con ${p.incluye.length > 1 ? `${p.incluye.slice(0, -1).join(', ')} y ${p.incluye[p.incluye.length - 1]}` : p.incluye[0]}` : 'La del fabricante, en PDF'}</small>
                                    </span>
                                    <span className="ver">{papel === p.id ? 'Cerrar' : 'Ver'}</span>
                                </button>
                                {papel === p.id && (
                                    <HojasPdf clave={`${id}-${p.id}`} cargar={() => api.fichaEquipo(id)} nombre={`${e.nombre} - ficha tecnica.pdf`} />
                                )}
                            </React.Fragment>
                        )) : <p className="ia-nada" style={{ margin: '8px 0 4px', padding: 0, textAlign: 'left' }}>Todavía no tenemos su ficha técnica. Si la tienes, mándanosla.</p>}
                    </section>
                    </div>
                    </div>
                </>
            )}
            {hoja && e && <HojaPrecio e={e} tarifa={t} onCerrar={() => setHoja(false)} onGuardar={guardar} onQuitar={e.tu_precio != null ? quitar : null} />}
            {pedido && e && <HojaPedido e={e} filas={filas} inicial={paraPedir} api={api} onCerrar={() => setPedido(false)} onMandar={mandar} />}
            {envio.overlay}
        </div>
    );
}

// ── La hoja «Tu precio» ──────────────────────────────────────────────────────
function HojaPrecio({ e, tarifa, onCerrar, onGuardar, onQuitar }) {
    const hojaRef = useHojaTeclado(onCerrar);
    const [valor, setValor] = useState(e.tu_precio != null ? String(e.tu_precio).replace('.', ',') : '');
    const [aviso, setAviso] = useState('');
    const num = (() => {
        const s = String(valor).trim().replace(/\s|€/g, '');
        const limpio = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '');
        const n = Number(limpio);
        return Number.isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) / 100 : null;
    })();
    const enviar = async (ev) => {
        ev.preventDefault();
        if (num == null) { setAviso('Escribe el precio en euros, sin IVA (por ejemplo 6900).'); return; }
        try { await onGuardar(num); } catch { /* el popup ya dice qué ha pasado */ }
    };
    return (
        <div className="ia-velo" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
            <form ref={hojaRef} className="ia-hoja" role="dialog" aria-modal="true" aria-label="Tu precio" onSubmit={enviar}>
                <div className="ia-hoja-asa" />
                <p className="ia-eyebrow" style={{ padding: '4px 4px 6px' }}>Tu precio · {e.nombre}</p>
                <label className="ia-campo">
                    <span>Precio del equipo, sin IVA</span>
                    <input className="ia-precio" type="text" inputMode="decimal" autoComplete="off" value={valor} autoFocus
                        onChange={(ev) => { setValor(ev.target.value); setAviso(''); }} placeholder={tarifa ? tarifa.replace(' €', '') : '6900'} />
                    <small>{tarifa ? `La tarifa de ${e.tarifa?.distribuidor || 'tu distribuidor'} es ${tarifa}. Lo que pongas aquí es lo que usaremos en tus presupuestos.` : 'Lo que pongas aquí es lo que usaremos en tus presupuestos.'} Solo lo ves tú.</small>
                    {aviso && <small className="mal" role="alert">{aviso}</small>}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    <button type="submit" className="ia-btn ia-btn-pri">Guardar mi precio</button>
                    {onQuitar && <button type="button" className="ia-btn ia-btn-sec" onClick={() => onQuitar().catch(() => {})}>Quitar mi precio y usar la tarifa</button>}
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>Volver</button>
                </div>
            </form>
        </div>
    );
}

/** El texto de WhatsApp con sus *negritas*, pintado tal cual llegará. */
function MensajeWa({ texto }) {
    return (
        <div className="ia-wa" aria-label="El mensaje que se manda">
            {String(texto || '').split('\n').map((l, i) => (
                <p key={i}>{l ? l.split(/(\*[^*\n]+\*)/g).map((t, j) => (/^\*[^*]+\*$/.test(t) ? <b key={j}>{t.slice(1, -1)}</b> : <React.Fragment key={j}>{t}</React.Fragment>)) : ' '}</p>
            ))}
        </div>
    );
}

// ── La hoja «Pedir a …»: datos → el mensaje entero → mandarlo ────────────────
function HojaPedido({ e, filas, inicial, api, onCerrar, onMandar }) {
    const hojaRef = useHojaTeclado(onCerrar);
    const [dist, setDist] = useState(inicial);
    const [cantidad, setCantidad] = useState(1);
    const [obra, setObra] = useState('');
    const [nota, setNota] = useState('');
    const [previa, setPrevia] = useState(null);   // { mensaje, comercial, distribuidor, canales_posibles, copia_a_ti }
    const [leyendo, setLeyendo] = useState(false);
    const [aviso, setAviso] = useState('');
    const cuerpo = () => ({ distribuidor_id: dist, cantidad, obra: obra.trim() || undefined, nota: nota.trim() || undefined });
    const verMensaje = async (ev) => {
        ev?.preventDefault();
        setAviso(''); setLeyendo(true);
        try { setPrevia(await api.pedido(e.id, { ...cuerpo(), previa: true })); }
        catch (err) { setAviso(err?.response?.data?.error || 'No hemos podido preparar el pedido. Vuelve a intentarlo.'); }
        finally { setLeyendo(false); }
    };
    const mandar = async () => { try { await onMandar(cuerpo(), previa); } catch { /* el popup ya dice qué ha pasado */ } };
    const nombreDist = filas.find((f) => f.id === dist)?.nombre || 'tu distribuidor';
    const canales = previa?.canales_posibles || [];

    return (
        <div className="ia-velo" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
            <form ref={hojaRef} className="ia-hoja ia-hoja-alta" role="dialog" aria-modal="true" aria-label={`Pedir a ${nombreDist}`} onSubmit={verMensaje}>
                <div className="ia-hoja-asa" />
                <p className="ia-eyebrow" style={{ padding: '4px 4px 6px' }}>Pedido · {e.nombre}</p>
                {!previa ? (
                    <>
                        {filas.length > 1 && (
                            <fieldset className="ia-campo">
                                <legend>A quién se lo pides</legend>
                                <div className="ia-filtros" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
                                    {filas.map((f) => (
                                        <button key={f.id} type="button" className="ia-filtro" aria-pressed={dist === f.id} onClick={() => setDist(f.id)}>
                                            {f.nombre}{f.precio != null ? ` · ${precio(f.precio)}` : ''}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                        <div className="ia-campo" style={{ marginTop: 12 }}>
                            <span id="ia-ped-cant">Cuántos</span>
                            <div className="ia-cant" role="group" aria-labelledby="ia-ped-cant">
                                <button type="button" className="ia-btn ia-btn-sec" aria-label="Uno menos" disabled={cantidad <= 1} onClick={() => setCantidad((n) => Math.max(1, n - 1))}>−</button>
                                <output aria-live="polite">{cantidad}</output>
                                <button type="button" className="ia-btn ia-btn-sec" aria-label="Uno más" disabled={cantidad >= 50} onClick={() => setCantidad((n) => Math.min(50, n + 1))}>+</button>
                            </div>
                        </div>
                        <label className="ia-campo" style={{ marginTop: 12 }}>
                            <span>Para qué obra <small style={{ fontWeight: 600 }}>(si quieres)</small></span>
                            <input type="text" value={obra} maxLength={60} autoComplete="off" onChange={(ev) => setObra(ev.target.value)} placeholder="Ej.: 26RES060_187 o Casa de Juan" />
                        </label>
                        <label className="ia-campo" style={{ marginTop: 12 }}>
                            <span>Algo más para el comercial <small style={{ fontWeight: 600 }}>(si quieres)</small></span>
                            <textarea rows={2} value={nota} maxLength={500} onChange={(ev) => setNota(ev.target.value)} placeholder="Ej.: lo necesito para el jueves" />
                        </label>
                        {aviso && <p className="ia-pequeno" role="alert" style={{ color: 'var(--ambar-txt)', margin: '10px 0 0' }}>{aviso}</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                            <button type="submit" className="ia-btn ia-btn-pri" disabled={leyendo || !dist}>{leyendo ? 'Preparando…' : 'Ver el mensaje'}</button>
                            <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>Volver</button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="ia-pequeno" style={{ margin: '0 4px 10px' }}>
                            Esto es lo que le llegará a <b>{previa.comercial || previa.distribuidor}</b>{previa.comercial ? ` (${previa.distribuidor})` : ''}
                            {canales.length ? ` por ${canales.join(' y por ')}` : ''}, desde BROKERGY.{previa.copia_a_ti ? ' A ti te mandamos copia por WhatsApp.' : ''}
                        </p>
                        <MensajeWa texto={previa.mensaje} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                            <button type="button" className="ia-btn ia-btn-pri" onClick={mandar}><Icono n="enviar" size={20} grosor={2.2} /> Mandar el pedido</button>
                            <button type="button" className="ia-btn ia-btn-sec" onClick={() => setPrevia(null)}>Cambiar algo</button>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
}
