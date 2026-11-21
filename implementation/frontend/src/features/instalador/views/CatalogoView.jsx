// ─── Catálogo (fase 4, prototipos «Catalogo» y «Modelo») ─────────────────────
// La aerotermia de SUS marcas (las de `marcas_autorizadas`, el mismo filtro de
// siempre) con la tarifa del distribuidor que carga BROKERGY por Excel y SU precio
// (el que pone él y usa en sus presupuestos). Un equipo sin tarifa dice «Sin tarifa
// todavía», nunca un 0. Sin marcas asignadas no se ve NINGÚN equipo (lo más
// prudente): se le dice que nos escriba. Nada de márgenes, comisiones, distribuidor
// ni enlaces: la ficha técnica se pide por el proxy y se pinta dentro (HojasPdf).
// «Calcular una obra con este equipo» abre la Nueva simulación con el equipo
// elegido y su precio como presupuesto de la aerotermia (`onCalcular`).
import React, { useEffect, useMemo, useState } from 'react';
import { Icono, Buscador, Esqueleto, AvisoError, sinTildes } from '../ui/piezas';
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

function pasa(e, q) {
    if (!q) return true;
    const texto = sinTildes([e.marca, e.nombre, e.ref, e.referencias?.conjunto, e.referencias?.exterior, e.referencias?.interior,
        kw(e.potencia_kw), e.potencia_kw && `${e.potencia_kw}kw`, e.uso].filter(Boolean).join(' '));
    const plano = texto.replace(/[\s-]/g, '');
    return sinTildes(q).split(/\s+/).filter(Boolean).every((t) => texto.includes(t) || plano.includes(t.replace(/-/g, '')));
}

// ── La lista ─────────────────────────────────────────────────────────────────
export function CatalogoView({ datos, cargando, error, onReintentar, onAbrir }) {
    const memoria = useVistaGuardada('instalador-catalogo');
    const [q, setQ] = useState(memoria.q ?? '');
    const [marca, setMarca] = useState(memoria.marca ?? '');
    useGuardarVista('instalador-catalogo', { q, marca });
    const equipos = datos?.equipos || [];
    const marcas = datos?.marcas || [];
    const marcaVale = marca && marcas.includes(marca) ? marca : '';
    const vistos = useMemo(() => equipos.filter((e) => (!marcaVale || e.marca === marcaVale) && pasa(e, q)), [equipos, marcaVale, q]);
    const lista = useScrollLista('instalador-catalogo', false, !cargando && vistos.length > 0);

    return (
        <div ref={lista.ancla} className="ia-pagina estrecha">
            <div className="ia-hola ia-entra">
                <h1 className="ia-display">Catálogo</h1>
                <p>Aerotermia de tus marcas, con su tarifa</p>
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
                    <Buscador valor={q} onCambio={setQ} placeholder="Busca por modelo o potencia" etiqueta="Buscar equipo" />
                    {marcas.length > 1 && (
                        <div className="ia-filtros" role="group" aria-label="Filtrar por marca">
                            <button type="button" className="ia-filtro" aria-pressed={!marcaVale} onClick={() => setMarca('')}>Todas</button>
                            {marcas.map((m) => (
                                <button key={m} type="button" className="ia-filtro" aria-pressed={marcaVale === m} onClick={() => setMarca(m)}>{nombreMarca(m)}</button>
                            ))}
                        </div>
                    )}
                    {vistos.length === 0 ? (
                        <p className="ia-nada">{equipos.length ? 'No hay ningún equipo con eso. Si te falta un modelo, dínoslo y lo damos de alta.' : 'Todavía no hay equipos de tus marcas. Dínoslo y los damos de alta.'}</p>
                    ) : (
                        <section aria-label="Equipos" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {vistos.map((e) => <TarjetaEquipo key={e.id} e={e} onClick={() => { lista.recordar(); onAbrir(e); }} />)}
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function TarjetaEquipo({ e, onClick }) {
    const t = precio(e.tarifa?.precio);
    const s = scop(e.scop_suelo);
    return (
        <button type="button" className="ia-eq ia-entra" onClick={onClick}>
            <span className="ia-eq-a">
                <span>
                    <span className="ia-eyebrow">{nombreMarca(e.marca)}</span>
                    <b>{e.nombre}</b>
                    {e.ref && <span className="ia-eq-ref">{e.ref}</span>}
                </span>
                <span className="ia-eq-tarifa">
                    {t ? <><b>{t}</b><span>tarifa sin IVA</span></> : <span className="sin">Sin tarifa todavía</span>}
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

// ── La ficha de un equipo ────────────────────────────────────────────────────
export function EquipoView({ id, base, api, onVolver, onCalcular, onCambio }) {
    const [estado, setEstado] = useState({ datos: null, error: false });
    const [intento, setIntento] = useState(0);
    const [hoja, setHoja] = useState(false);
    const [papel, setPapel] = useState(null); // el papel abierto
    const envio = useEnvio();
    useEffect(() => {
        let vivo = true;
        api.equipo(id).then((d) => { if (vivo) setEstado({ datos: d, error: false }); })
            .catch(() => { if (vivo) setEstado((s) => ({ datos: s.datos, error: !s.datos })); });
        return () => { vivo = false; };
    }, [api, id, intento]);
    const e = estado.datos || base;
    const t = precio(e?.tarifa?.precio);
    const tuyo = precio(e?.tu_precio);
    const mes = mesDe(e?.tarifa?.desde);

    const guardar = async (valor) => {
        await envio.alSubir({ enviando: 'Guardando tu precio…', ok: 'Precio guardado', subtitulo: 'Es el que usaremos en tus presupuestos con este equipo.' })(() => api.guardarPrecio(id, valor));
        setHoja(false); setIntento((k) => k + 1); onCambio?.();
    };
    const quitar = async () => {
        await envio.alSubir({ enviando: 'Quitando tu precio…', ok: 'Listo', subtitulo: 'Usaremos la tarifa del distribuidor.' })(() => api.quitarPrecio(id));
        setHoja(false); setIntento((k) => k + 1); onCambio?.();
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
        <div className="ia-pagina estrecha" style={{ paddingTop: 0 }}>
            <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> Catálogo</button>
            </div>
            {!e ? (estado.error ? <AvisoError onReintentar={() => setIntento((k) => k + 1)} /> : <Esqueleto alto={160} n={3} />) : (
                <>
                    <div className="ia-eq-cab ia-entra">
                        <p className="ia-eyebrow n">{nombreMarca(e.marca)} · aerotermia</p>
                        <h1 className="ia-display">{e.nombre}</h1>
                        {e.ref && <p className="ref">{e.ref}</p>}
                    </div>

                    <section className="ia-card ia-eq-precio ia-entra" aria-labelledby="ia-eq-tarifa">
                        <p id="ia-eq-tarifa" className="ia-eyebrow">Tarifa del distribuidor</p>
                        {t ? (
                            <>
                                <p className="ia-cifra ia-display" style={{ margin: '8px 0 6px' }}>{t.replace(/ €$/, '')}<small> €</small></p>
                                <p className="ia-pequeno" style={{ margin: 0 }}>Sin IVA{mes ? ` · desde ${mes}` : ''}</p>
                            </>
                        ) : (
                            <>
                                <p className="ia-display ia-eq-sin">Sin tarifa todavía</p>
                                <p className="ia-pequeno" style={{ margin: '6px 0 0' }}>En cuanto el distribuidor nos la pase, saldrá aquí. Mientras, puedes poner tu precio.</p>
                            </>
                        )}
                        <div className="ia-eq-tuyo">
                            <div>
                                <span>Tu precio en los presupuestos</span>
                                {tuyo ? <b>{tuyo} <small style={{ fontSize: 13, fontWeight: 600, color: 'var(--gris)' }}>sin IVA</small></b>
                                    : <b className="falta">{t ? 'El de la tarifa' : 'Sin poner'}</b>}
                            </div>
                            <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={() => setHoja(true)}>Cambiar</button>
                        </div>
                    </section>

                    {lineas.length > 0 && (
                        <section className="ia-card filas ia-entra" aria-labelledby="ia-eq-hace">
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

                    <section className="ia-card filas ia-entra" aria-labelledby="ia-eq-papeles">
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

                    {onCalcular && (
                        <button type="button" className="ia-btn ia-btn-pri" onClick={() => onCalcular(e)}>
                            <Icono n="mas" size={22} grosor={2.4} /> Calcular una obra con este equipo
                        </button>
                    )}
                </>
            )}
            {hoja && e && <HojaPrecio e={e} tarifa={t} onCerrar={() => setHoja(false)} onGuardar={guardar} onQuitar={e.tu_precio != null ? quitar : null} />}
            {envio.overlay}
        </div>
    );
}

// ── La hoja «Tu precio» ──────────────────────────────────────────────────────
function HojaPrecio({ e, tarifa, onCerrar, onGuardar, onQuitar }) {
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
            <form className="ia-hoja" role="dialog" aria-modal="true" aria-label="Tu precio" onSubmit={enviar}>
                <div className="ia-hoja-asa" />
                <p className="ia-eyebrow" style={{ padding: '4px 4px 6px' }}>Tu precio · {e.nombre}</p>
                <label className="ia-campo">
                    <span>Precio del equipo, sin IVA</span>
                    <input className="ia-precio" type="text" inputMode="decimal" autoComplete="off" value={valor} autoFocus
                        onChange={(ev) => { setValor(ev.target.value); setAviso(''); }} placeholder={tarifa ? tarifa.replace(' €', '') : '6900'} />
                    <small>{tarifa ? `La tarifa del distribuidor es ${tarifa}. Lo que pongas aquí es lo que usaremos en tus presupuestos.` : 'Lo que pongas aquí es lo que usaremos en tus presupuestos.'} Solo lo ves tú.</small>
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
