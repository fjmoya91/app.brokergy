// ─── El EQUIPO del presupuesto: de mi catálogo, otra marca o genérico (22/11/2026) ─────────
// Fran: «la selección de los modelos de aerotermia y marca, que filtre por marca y por modelo o
// si quiere poner uno genérico también. Pero que sean fáciles de elegir o quitar y cambiar».
// Tres maneras, una arriba de otra a un toque:
//   · Mi catálogo — sus marcas en fichas (con el número de modelos), un buscador por modelo o
//     kW y la lista a un toque. Elegido, se queda en una tarjeta con «Cambiar» y «Quitar».
//   · Otra marca — marca y modelo escritos (la marca sugiere las de su catálogo).
//   · Genérico — sin marca ni modelo: la línea dice «bomba de calor aire-agua de X kW».
// El catálogo es el SUYO (`/catalogo`, solo sus marcas, regla 234/240) y solo vale para la
// aerotermia: el agua caliente y el aire acondicionado se escriben o van genéricos.
import React, { useMemo, useState } from 'react';
import { Icono } from '../ui/piezas';
import { filtrarEquipos, equipoDelCatalogo } from '../logic/presupuestoApp';

const VER = 8; // los que se ven de entrada; el resto, con «Ver los N»

const titulo = (s) => String(s || '').trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const kw = (v) => (v != null && v !== '' ? `${String(v).replace('.', ',')} kW` : '');

function FilaEquipo({ x, onClick, elegido = false }) {
    return (
        <button type="button" className={`ia-pe-fila${elegido ? ' sel' : ''}`} onClick={onClick} aria-pressed={elegido ? 'true' : undefined}>
            <span className="ia-pe-kw" aria-hidden="true">{x.potencia_kw != null ? <>{String(x.potencia_kw).replace('.', ',')}<small>kW</small></> : '—'}</span>
            <span className="ia-pe-txt">
                <b>{x.nombre}</b>
                <small>{[titulo(x.marca), x.ref, x.acs_corto].filter(Boolean).join(' · ')}</small>
            </span>
            <Icono n={elegido ? 'ok' : 'chevron'} size={20} grosor={elegido ? 2.6 : 2} />
        </button>
    );
}

/**
 * `modo`: 'catalogo' | 'mano' | 'generico' (el que se ve). `equipo`: el de la obra.
 * `catalogo`: lo de `/catalogo` ({ marcas, equipos }). `onModo(m)` y `onEquipo(cambio)`.
 */
export function ElegirEquipo({ tipo, modo, equipo, catalogo, onModo, onEquipo }) {
    const equipos = catalogo?.equipos || [];
    const conCatalogo = tipo === 'aerotermia' && equipos.length > 0;
    const marcas = useMemo(() => {
        const cuenta = new Map();
        equipos.forEach((e) => { if (e.marca) cuenta.set(e.marca, (cuenta.get(e.marca) || 0) + 1); });
        return [...cuenta.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }, [equipos]);
    const elegido = equipo?.aerotermia_id ? equipos.find((x) => String(x.id) === String(equipo.aerotermia_id)) || null : null;
    const [marca, setMarca] = useState(() => (marcas.length === 1 ? marcas[0].nombre : ''));
    const [q, setQ] = useState('');
    const [todos, setTodos] = useState(false);
    const [cambiando, setCambiando] = useState(false);
    const lista = useMemo(() => filtrarEquipos(equipos, { marca, q }), [equipos, marca, q]);
    const vistos = todos ? lista : lista.slice(0, VER);

    const elegir = (x) => { onEquipo(equipoDelCatalogo(x)); setCambiando(false); setQ(''); setTodos(false); };
    const quitar = () => { onEquipo({ aerotermia_id: null, marca: '', modelo: '', potencia_kw: '' }); setCambiando(false); };
    const aModo = (m) => {
        if (m === modo) return;
        if (m === 'generico') onEquipo({ aerotermia_id: null, marca: '', modelo: '' });
        // A «Otro modelo», lo del catálogo queda escrito para retocarlo; el id solo se suelta al
        // teclear (así, volver a «Mi catálogo» sin tocar nada lo encuentra elegido).
        else if (m === 'catalogo' && !equipo?.aerotermia_id) onEquipo({ marca: '', modelo: '' });
        onModo(m);
        setCambiando(false);
    };

    const pestanas = [
        conCatalogo && { k: 'catalogo', t: 'Mi catálogo' },
        { k: 'mano', t: conCatalogo ? 'Otro modelo' : 'Marca y modelo' },
        { k: 'generico', t: 'Genérico' },
    ].filter(Boolean);

    return (
        <div className="ia-pe">
            <div className="ia-pe-modos" role="radiogroup" aria-label="Cómo pones el equipo">
                {pestanas.map((p) => (
                    <button key={p.k} type="button" role="radio" aria-checked={modo === p.k ? 'true' : 'false'} className={modo === p.k ? 'sel' : ''} onClick={() => aModo(p.k)}>{p.t}</button>
                ))}
            </div>

            {modo === 'catalogo' && (
                <>
                    {equipo?.aerotermia_id && (
                        <div className="ia-pe-elegido">
                            <span className="ia-pe-kw grande" aria-hidden="true">{elegido?.potencia_kw != null ? <>{String(elegido.potencia_kw).replace('.', ',')}<small>kW</small></> : <Icono n="catalogo" size={20} />}</span>
                            <div>
                                <span className="ia-eyebrow n">{titulo(equipo.marca)}</span>
                                <b>{elegido?.nombre || equipo.modelo}</b>
                                <small>{[elegido?.ref || equipo.modelo, elegido?.uso].filter(Boolean).join(' · ')}</small>
                            </div>
                            <div className="ia-pe-elegido-acc">
                                <button type="button" className="ia-btn ia-btn-sec ia-btn-peq" onClick={() => { setCambiando((v) => !v); setMarca(elegido?.marca || ''); }} aria-expanded={cambiando}>{cambiando ? 'Dejarlo' : 'Cambiar'}</button>
                                <button type="button" className="ia-link" onClick={quitar}>Quitar</button>
                            </div>
                        </div>
                    )}
                    {(!equipo?.aerotermia_id || cambiando) && (
                        <>
                            {marcas.length > 1 && (
                                <div className="ia-pe-marcas" role="group" aria-label="Marca">
                                    <button type="button" className="ia-filtro peq" aria-pressed={!marca ? 'true' : 'false'} onClick={() => { setMarca(''); setTodos(false); }}>Todas <span>{equipos.length}</span></button>
                                    {marcas.map((m) => (
                                        <button key={m.nombre} type="button" className="ia-filtro peq" aria-pressed={marca === m.nombre ? 'true' : 'false'}
                                            onClick={() => { setMarca(marca === m.nombre ? '' : m.nombre); setTodos(false); }}>{titulo(m.nombre)} <span>{m.n}</span></button>
                                    ))}
                                </div>
                            )}
                            <label className="ia-pe-buscar">
                                <Icono n="buscar" size={20} />
                                <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setTodos(false); }} placeholder="Modelo o kW (p. ej. 8 kW)" aria-label="Busca el modelo" autoComplete="off" enterKeyHint="search" />
                                {q && <button type="button" className="ia-pe-borrar" aria-label="Borrar la búsqueda" onClick={() => setQ('')}>×</button>}
                            </label>
                            {lista.length ? (
                                <div className="ia-pe-lista" role="list" aria-label={`${lista.length} ${lista.length === 1 ? 'equipo' : 'equipos'}`}>
                                    {vistos.map((x) => <FilaEquipo key={x.id} x={x} elegido={String(x.id) === String(equipo?.aerotermia_id)} onClick={() => elegir(x)} />)}
                                    {lista.length > VER && !todos && (
                                        <button type="button" className="ia-pe-mas" onClick={() => setTodos(true)}>Ver los {lista.length}</button>
                                    )}
                                </div>
                            ) : (
                                <div className="ia-pe-nada">
                                    <span>No hay ninguno con eso{marca ? ` en ${titulo(marca)}` : ''}.</span>
                                    <button type="button" className="ia-link" onClick={() => aModo('mano')}>Escribirlo a mano</button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {modo === 'mano' && (
                <>
                    <div className="ia-pr-fila2 mitad">
                        <label className="ia-campo">
                            <span>Marca</span>
                            <input type="text" list={marcas.length ? 'ia-pe-marcas-l' : undefined} value={equipo?.marca || ''} autoComplete="off" autoCapitalize="characters"
                                onChange={(e) => onEquipo({ marca: e.target.value, aerotermia_id: null })} />
                        </label>
                        <label className="ia-campo">
                            <span>Modelo</span>
                            <input type="text" value={equipo?.modelo || ''} autoComplete="off" autoCapitalize="characters" onChange={(e) => onEquipo({ modelo: e.target.value, aerotermia_id: null })} />
                        </label>
                    </div>
                    {marcas.length > 0 && <datalist id="ia-pe-marcas-l">{marcas.map((m) => <option key={m.nombre} value={m.nombre} />)}</datalist>}
                    {(equipo?.marca || equipo?.modelo) && (
                        <button type="button" className="ia-link" style={{ alignSelf: 'flex-start' }} onClick={() => onEquipo({ marca: '', modelo: '', aerotermia_id: null })}>Borrar marca y modelo</button>
                    )}
                </>
            )}

            {modo === 'generico' && (
                <p className="ia-pe-nota">Sale sin marca ni modelo: «{tipo === 'acs' ? 'bomba de calor para agua caliente sanitaria' : tipo === 'aire' ? 'equipo de aire acondicionado con bomba de calor' : 'bomba de calor aire-agua (aerotermia)'}{tipo !== 'acs' && equipo?.potencia_kw ? `, de ${kw(equipo.potencia_kw)}` : ''}». Pon al menos {tipo === 'acs' ? 'los litros' : 'la potencia'}.</p>
            )}

            <div className="ia-pr-fila2 mitad">
                {tipo === 'acs' ? (
                    <label className="ia-campo"><span>Litros{modo === 'generico' ? '' : ' (opcional)'}</span>
                        <input type="text" inputMode="numeric" value={equipo?.litros ?? ''} onChange={(e) => onEquipo({ litros: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                    </label>
                ) : (
                    <label className="ia-campo"><span>Potencia en kW{modo === 'generico' ? '' : ' (opcional)'}</span>
                        <input type="text" inputMode="decimal" value={equipo?.potencia_kw ?? ''} onChange={(e) => onEquipo({ potencia_kw: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) })} />
                    </label>
                )}
            </div>
        </div>
    );
}
