// ─── Estancias.jsx — las estancias de la vivienda, rápido o con radiadores ───
// Regla 245. El nombre, la orientación y los m² de cada estancia los pone
// `logic/localesRite.js`, la MISMA del popup del CRM (LocalesRiteModal) y del
// backend (`proponerEstancias`): aquí no se reparte nada a mano.
//
// Modo EXTENDIDO (solo con radiadores): cada estancia lleva sus ELEMENTOS de
// radiador y, si se quiere, los W por elemento (100 por defecto, de 30 a 400).
// La potencia por estancia NO se calcula aquí: la da el servidor en «Revisar»
// (`tablaEstancias`, espejo de `cargas_desde_locales` del generador). Una tercera
// copia del cálculo acabaría enseñando una tabla y firmando otra.
//
// Sin estado propio: lo que se edita se deriva de `estancias` (lo guardado) y cada
// cambio devuelve la forma de `datos.estancias` ya resuelta.
// ─────────────────────────────────────────────────────────────────────────────
import {
    TIPOS_LOCAL, MAX_LOCALES, etiquetaPlanta, proponerLocales, resolverLocales, paraGuardar,
    sumarLocal, fijarM2, anadirPlanta, quitarPlanta,
} from '../../features/expedientes/logic/localesRite';
import { Aviso } from '../../certificadores/ui/piezas';
import { IcoMas, IcoX } from '../../certificadores/ui/Iconos';

const ID_TIPOS = new Set(TIPOS_LOCAL.map(t => t.id));
const LABEL = Object.fromEntries(TIPOS_LOCAL.map(t => [t.id, t.label]));
export const esRadiadores = (emisor) => !emisor || emisor === 'radiadores_convencionales';

/** Lo guardado → el estado que manejan las operaciones de localesRite (con los elementos). */
function aEstado(estancias) {
    return {
        plantas: (estancias?.plantas || []).map(p => ({
            planta: String(p.planta ?? '0'),
            locales: (p.locales || []).filter(l => ID_TIPOS.has(String(l.tipo || '').toLowerCase())).map(l => ({
                tipo: String(l.tipo).toLowerCase(), manual: !!l.manual, m2: l.manual ? l.m2 : null,
                elementos: l.elementos || null, w_elemento: l.w_elemento || null,
            })),
        })),
    };
}

/** El estado → la forma de `datos.estancias` (nombres, orientación y m² resueltos; los elementos, en su sitio). */
function resolver(estado, superficie, modo, wElemento) {
    const r = resolverLocales(estado, superficie);
    const planos = estado.plantas.flatMap(p => p.locales);
    let k = 0;
    const plantas = paraGuardar(r).plantas.map(p => ({
        ...p,
        locales: p.locales.map(l => {
            const o = planos[k++] || {};
            const extra = {};
            if (o.elementos) extra.elementos = o.elementos;
            if (o.w_elemento) extra.w_elemento = o.w_elemento;
            return { ...l, ...extra };
        }),
    }));
    return { estancias: { modo, w_elemento: wElemento, plantas }, avisos: r.avisos };
}

const entero = (v, max) => {
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
};

export default function Estancias({ estancias, superficie, plantasVivienda, emisor, onChange }) {
    const modo = estancias?.modo === 'extendido' ? 'extendido' : 'rapido';
    const wDef = Number(estancias?.w_elemento) || 100;
    const rad = esRadiadores(emisor);
    const extendido = modo === 'extendido' && rad;
    const estado = aEstado(estancias);
    const n = estado.plantas.reduce((s, p) => s + p.locales.length, 0);
    const { avisos } = resolver(estado, superficie, modo, wDef);

    const emitir = (nuevo, m = modo, w = wDef) => onChange(resolver(nuevo, superficie, m, w).estancias);
    const cambiarLocal = (ip, il, cambios) => emitir({
        plantas: estado.plantas.map((p, i) => i !== ip ? p : { ...p, locales: p.locales.map((l, j) => j !== il ? l : { ...l, ...cambios }) }),
    });
    const quitarLocal = (ip, il) => emitir({
        plantas: estado.plantas.map((p, i) => i !== ip ? p : { ...p, locales: p.locales.filter((_, j) => j !== il) }),
    });

    if (!n && !estado.plantas.length) {
        return (
            <div>
                <p className="ca-txt">
                    Te proponemos las estancias por la superficie{superficie ? <> (<b>{superficie} m²</b>, {plantasVivienda || 1} {Number(plantasVivienda) > 1 ? 'plantas' : 'planta'})</> : ''} y luego las ajustas: añadir, quitar o poner los m² de alguna.
                </p>
                {!superficie && <div style={{ marginTop: 12 }}><Aviso titulo="Falta la superficie">Ponla en «Vivienda» (o tráela del Catastro) para repartirla entre las estancias.</Aviso></div>}
                <div className="ca-btns">
                    <button type="button" className="ca-btn ca-btn-pri" disabled={!superficie}
                        onClick={() => emitir(proponerLocales({ superficie, plantas: plantasVivienda }))}>Proponer las estancias</button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="ca-opts ca-opts-2" style={{ marginTop: 4 }} role="radiogroup" aria-label="Cómo se calculan">
                {[
                    ['rapido', 'Rápido', 'Por la superficie de cada estancia'],
                    ['extendido', 'Con radiadores', 'Elementos de cada radiador'],
                ].map(([id, t, d]) => (
                    <button key={id} type="button" role="radio" aria-checked={modo === id}
                        className={`ca-opt${modo === id ? ' ca-opt-sel' : ''}`} disabled={id === 'extendido' && !rad}
                        onClick={() => emitir(estado, id)}>
                        <span><b>{t}</b><small>{d}</small></span>
                    </button>
                ))}
            </div>
            {!rad && <p className="ca-peq" style={{ marginTop: 8 }}>Con suelo radiante, splits o conductos la potencia va por superficie: el modo «con radiadores» solo vale para radiadores.</p>}
            {extendido && (
                <label className="ca-campo" htmlFor="rt-wdef">
                    <span className="ca-label">W por elemento (toda la vivienda)</span>
                    <div className="ca-sufijo">
                        <input id="rt-wdef" className="ca-input" inputMode="numeric" value={estancias?.w_elemento ?? 100}
                            onChange={e => emitir(estado, modo, entero(e.target.value, 400) || 100)} />
                        <span>W</span>
                    </div>
                    <span className="ca-ayuda" style={{ display: 'block' }}>100 W deja margen con aluminio de 600 mm. Puedes cambiarlo en una estancia concreta (de 30 a 400 W).</span>
                </label>
            )}

            {estado.plantas.map((p, ip) => {
                const guardada = estancias.plantas[ip] || { locales: [] };
                return (
                    <div className="rt-planta" key={`${p.planta}-${ip}`}>
                        <div className="rt-planta-cab">
                            <b>{etiquetaPlanta(p.planta)}</b>
                            {estado.plantas.length > 1 && (
                                <button type="button" className="ca-link ca-link-gris" onClick={() => emitir(quitarPlanta(estado, ip))}>Quitar planta</button>
                            )}
                        </div>
                        {p.locales.map((l, il) => {
                            const g = guardada.locales?.[il] || {};
                            return (
                                <div className="rt-local" key={il}>
                                    <div className="rt-local-nom" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <b>{g.nombre || LABEL[l.tipo]}</b>
                                            <small>{g.orientacion && g.orientacion !== '-' ? `Orientación ${g.orientacion} · ` : ''}{l.manual ? 'm² puestos a mano' : 'm² repartidos'}</small>
                                        </div>
                                        <button type="button" className="ca-icobtn" style={{ width: 36, height: 36 }} aria-label={`Quitar ${g.nombre || LABEL[l.tipo]}`}
                                            onClick={() => quitarLocal(ip, il)}><IcoX size={16} /></button>
                                    </div>
                                    <div className="rt-local-campos" style={extendido ? { gridTemplateColumns: '1fr 1fr 1fr' } : undefined}>
                                        <label className="rt-mini">
                                            <span>m²</span>
                                            <input className="ca-input" inputMode="decimal" value={l.manual ? String(l.m2 ?? '') : ''}
                                                placeholder={g.m2 != null ? String(g.m2) : ''}
                                                onChange={e => emitir(fijarM2(estado, ip, il, e.target.value.trim() === '' ? null : e.target.value))} />
                                        </label>
                                        {extendido && (
                                            <>
                                                <label className="rt-mini">
                                                    <span>Elementos</span>
                                                    <input className="ca-input" inputMode="numeric" value={l.elementos || ''} placeholder="—"
                                                        onChange={e => cambiarLocal(ip, il, { elementos: entero(e.target.value, 200) })} />
                                                </label>
                                                <label className="rt-mini">
                                                    <span>W/elem.</span>
                                                    <input className="ca-input" inputMode="numeric" value={l.w_elemento || ''} placeholder={String(wDef)}
                                                        onChange={e => cambiarLocal(ip, il, { w_elemento: entero(e.target.value, 400) })} />
                                                </label>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div className="rt-anadir">
                            {TIPOS_LOCAL.map(t => (
                                <button key={t.id} type="button" disabled={n >= MAX_LOCALES} onClick={() => emitir(sumarLocal(estado, ip, t.id))}>+ {t.label}</button>
                            ))}
                        </div>
                    </div>
                );
            })}

            <div className="ca-btns ca-btns-2">
                <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" style={{ width: '100%' }} onClick={() => emitir(anadirPlanta(estado))}>
                    <IcoMas size={16} /> Añadir planta
                </button>
                <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" style={{ width: '100%' }}
                    onClick={() => emitir(proponerLocales({ superficie, plantas: plantasVivienda }))}>Volver a proponer</button>
            </div>
            <p className="ca-peq" style={{ marginTop: 10 }}>{n} de {MAX_LOCALES} estancias (lo que cabe en la tabla oficial). Deja los m² vacíos para repartir la superficie sola.</p>
            {avisos.length > 0 && <div style={{ marginTop: 10 }}><Aviso titulo="Ojo">{avisos.join(' ')}</Aviso></div>}
        </div>
    );
}
