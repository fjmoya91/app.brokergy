import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { CampoDecimal } from '../../../components/CampoDecimal';
import {
    MESES, MONTAJES, ORIENTACIONES, PERDIDAS_POR_DEFECTO, claveConsulta, especificaValida,
    fmtNum, kwpPara, mensualDe, nombreOrientacion, paramsPvgis, produccionDe, tsvMensual,
} from '../logic/produccionFv';

// ─── ProduccionFotovoltaica.jsx ──────────────────────────────────────────────
// La producción de una instalación fotovoltaica EN ESTA VIVIENDA, de PVGIS, con
// sus dos preguntas en la misma tarjeta:
//
//   · «con N kWp, ¿cuánto produce, al año y mes a mes?»
//   · «para declarar X kWh/año, ¿cuántos kWp hacen falta aquí?»
//
// Son la misma regla de tres (`produccionFv.js`): se teclea en el campo que se
// sabe y el otro se deduce. Los doce meses son los que pide CE3X en
// «Generación renovable eléctrica» (Autoconsumo mensual, kWh/mes) y SUMAN EXACTO
// el total, así que se copian tal cual.
//
// REGLA — PVGIS se pregunta al ABRIR, no al pintar. La barra ⚡ sale en cada
// fase de cada CEE que se abre, y no hace falta preguntarle a un servicio
// externo por cada expediente que alguien mira: solo cuando se quiere el dato.
// Lo preguntado se recuerda durante la sesión (`RECUERDO`) y el backend lo
// guarda 30 días, así que volver a abrirlo es instantáneo.
//
// REGLA — sin tejado conocido, los ángulos ÓPTIMOS del sitio. Es lo que se
// supone en una medida de mejora; si se conocen la inclinación y la orientación
// del tejado, se ponen en «Tejado» y PVGIS recalcula.

const RECUERDO = new Map();      // claveConsulta → respuesta de /api/pvgis/produccion

async function pedirPvgis(ubicacion, params) {
    const clave = claveConsulta(ubicacion, params);
    if (RECUERDO.has(clave)) return RECUERDO.get(clave);
    const { data } = await axios.get('/api/pvgis/produccion', {
        params: { ...ubicacion, ...paramsPvgis(params) },
        timeout: 60000,
    });
    RECUERDO.set(clave, data);
    return data;
}

const fmtKwp = (n) => fmtNum(n, 2);

function useCopiar() {
    const [copiado, setCopiado] = useState(null);
    const copiar = async (texto, clave) => {
        try {
            await navigator.clipboard.writeText(String(texto));
            setCopiado(clave);
            setTimeout(() => setCopiado(c => (c === clave ? null : c)), 1600);
        } catch { setCopiado('__fallo__'); setTimeout(() => setCopiado(null), 2500); }
    };
    return [copiado, copiar];
}

/**
 * @param {object}   ubicacion      `{lat,lon}` · `{utm_x,utm_y[,huso]}` · `{rc}`
 * @param {number}   [kwhObjetivo]  el máximo declarable del CEE (kWh/año)
 * @param {number}   [kwhDeclarado] lo que de verdad se declara (el 90 %, o lo tecleado)
 * @param {number}   [kwpExistente] potencia de unas placas que YA tiene la vivienda
 * @param {Function} [onUsar]       ({kwh, kwp, mensual, especifica}) → usar el resultado
 * @param {string}   [textoUsar]    rótulo del botón de `onUsar`
 */
export function ProduccionFotovoltaica({ ubicacion, kwhObjetivo = null, kwhDeclarado = null,
                                         kwpExistente = null, onUsar = null,
                                         textoUsar = 'Usar estos kWh', className = '' }) {
    const [params, setParams] = useState({ inclinacion: null, orientacion: 0,
                                           perdidas: PERDIDAS_POR_DEFECTO, montaje: 'free' });
    const [verTejado, setVerTejado] = useState(false);
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [copiado, copiar] = useCopiar();

    // Qué campo manda: el que se ha tecleado el último. Arranca por la potencia
    // si la vivienda ya tiene placas (la pregunta es cuánto producen) y si no
    // por la energía (la pregunta es cuántos kWp hacen falta para declararla).
    const [manda, setManda] = useState(kwpExistente > 0 ? 'kwp' : 'kwh');
    const [kwp, setKwp] = useState(kwpExistente > 0 ? Number(kwpExistente) : null);
    const [kwh, setKwh] = useState(
        Number(kwhDeclarado) > 0 ? Math.round(Number(kwhDeclarado))
            : (Number(kwhObjetivo) > 0 ? Math.round(Number(kwhObjetivo)) : null));

    const clave = claveConsulta(ubicacion, params);
    const [intento, setIntento] = useState(0);
    // Lo que se pregunta se lee de una referencia: `ubicacion` llega como objeto
    // nuevo en cada render del padre y `params` va ya dentro de `clave`.
    // Se actualiza en un efecto (no durante el render) y va declarado ANTES que
    // el de la consulta, así que en el mismo commit ya trae lo último.
    const pedido = useRef({ ubicacion, params, hayDatos: false });
    useEffect(() => { pedido.current = { ubicacion, params, hayDatos: !!datos }; });
    useEffect(() => {
        const { ubicacion: u, params: p, hayDatos } = pedido.current;
        if (!u) return undefined;
        let vivo = true;
        // Freno: los ángulos se teclean, y cada tecla sería una consulta.
        const t = setTimeout(async () => {
            setCargando(true); setError(null);
            try {
                const d = await pedirPvgis(u, p);
                if (vivo) setDatos(d);
            } catch (e) {
                if (!vivo) return;
                setError(e.response?.data?.error
                    || (e.code === 'ECONNABORTED' ? 'PVGIS no ha respondido a tiempo.' : null)
                    || 'No se ha podido preguntar a PVGIS.');
            } finally { if (vivo) setCargando(false); }
        }, hayDatos ? 600 : 0);
        return () => { vivo = false; clearTimeout(t); };
    }, [clave, intento]);

    const esp = especificaValida(datos) ? datos : null;

    // La pareja kWp / kWh y los meses, según qué campo mande.
    const calc = useMemo(() => {
        if (!esp) return null;
        if (manda === 'kwp') {
            const p = produccionDe(esp, kwp);
            return p ? { kwp: p.kwp, kwh: p.anual, mensual: p.mensual } : null;
        }
        const k = kwpPara(esp, kwh);
        const m = mensualDe(esp, kwh);
        return k && m ? { kwp: k, kwh: Math.round(Number(kwh)), mensual: m } : null;
    }, [esp, manda, kwp, kwh]);

    const pasaDelMaximo = calc && Number(kwhObjetivo) > 0 && calc.kwh > Number(kwhObjetivo) + 0.5;

    const ponKwh = (n) => { setManda('kwh'); setKwh(n > 0 ? n : null); };
    const ponKwp = (n) => { setManda('kwp'); setKwp(n > 0 ? n : null); };
    const reintentar = () => setIntento(i => i + 1);

    const atajos = [
        Number(kwhObjetivo) > 0 && { id: 'max', texto: `Máximo · ${fmtNum(kwhObjetivo)} kWh`,
            hace: () => ponKwh(Math.round(Number(kwhObjetivo))),
            activo: manda === 'kwh' && Math.round(Number(kwh)) === Math.round(Number(kwhObjetivo)) },
        Number(kwhDeclarado) > 0 && Math.round(Number(kwhDeclarado)) !== Math.round(Number(kwhObjetivo))
            && { id: 'decl', texto: `Lo declarado · ${fmtNum(kwhDeclarado)} kWh`,
                 hace: () => ponKwh(Math.round(Number(kwhDeclarado))),
                 activo: manda === 'kwh' && Math.round(Number(kwh)) === Math.round(Number(kwhDeclarado)) },
        Number(kwpExistente) > 0 && { id: 'fv', texto: `Placas de la vivienda · ${fmtKwp(kwpExistente)} kWp`,
            hace: () => ponKwp(Number(kwpExistente)),
            activo: manda === 'kwp' && Number(kwp) === Number(kwpExistente) },
    ].filter(Boolean);

    const optimos = params.inclinacion === null;
    const campo = 'rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] font-mono '
        + 'text-white focus:border-brand/60 outline-none max-md:py-2 max-md:text-base';

    return (
        <div className={`rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 max-md:p-2.5 ${className}`}>
            {/* Cabecera: qué es, de dónde sale y con qué tejado */}
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                        ☀️ Producción fotovoltaica en esta vivienda · PVGIS
                    </p>
                    {esp ? (
                        <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                            <b className="font-mono text-white/80">{fmtNum(esp.anual)}</b> kWh por kWp al año
                            {' · '}{optimos ? 'ángulos óptimos: ' : ''}inclinación {fmtNum(esp.inclinacion)}°
                            {' · '}orientación {nombreOrientacion(esp.orientacion)} ({fmtNum(esp.orientacion)}°)
                            {' · '}pérdidas {fmtNum(esp.perdidas)} %
                        </p>
                    ) : !error && (
                        <p className="mt-0.5 text-[11px] text-white/40">
                            {cargando ? 'Preguntando a PVGIS…' : 'Sin datos todavía.'}
                        </p>
                    )}
                </div>
                <button type="button" onClick={() => setVerTejado(v => !v)}
                        className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-black uppercase
                                    tracking-widest max-md:px-3 max-md:py-2 ${verTejado
                            ? 'border-brand/50 text-brand' : 'border-white/10 text-white/50 hover:text-white'}`}>
                    ⚙ Tejado{optimos ? '' : ' ✓'}
                </button>
            </div>

            {verTejado && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06]
                                bg-white/[0.02] p-2.5 md:grid-cols-4">
                    <label className="col-span-2 flex items-center gap-2 text-[11px] text-white/60 md:col-span-4">
                        <input type="checkbox" checked={optimos}
                               onChange={(e) => setParams(p => ({ ...p,
                                   inclinacion: e.target.checked ? null : (esp?.inclinacion ?? 30),
                                   orientacion: e.target.checked ? 0 : (esp?.orientacion ?? 0) }))}
                               className="h-3.5 w-3.5 accent-[var(--brand-primary)]" />
                        Ángulos óptimos del sitio (si aún no se sabe en qué tejado irán)
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-white/40">
                        Inclinación (°)
                        <CampoDecimal valor={params.inclinacion ?? ''} disabled={optimos}
                                      onCambio={(n) => setParams(p => ({ ...p, inclinacion: Math.min(90, n) }))}
                                      className={`${campo} disabled:opacity-40`} />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-white/40">
                        Orientación
                        <select value={ORIENTACIONES.some(o => o.valor === params.orientacion) ? params.orientacion : ''}
                                disabled={optimos}
                                onChange={(e) => setParams(p => ({ ...p, orientacion: Number(e.target.value) }))}
                                className={`${campo} no-uppercase disabled:opacity-40`}>
                            {!ORIENTACIONES.some(o => o.valor === params.orientacion) && (
                                <option value="">{fmtNum(params.orientacion)}°</option>
                            )}
                            {ORIENTACIONES.map(o => (
                                <option key={o.valor} value={o.valor}>{o.etiqueta} ({o.valor}°)</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-white/40">
                        Montaje
                        <select value={params.montaje}
                                onChange={(e) => setParams(p => ({ ...p, montaje: e.target.value }))}
                                className={`${campo} no-uppercase`}>
                            {MONTAJES.map(m => <option key={m.id} value={m.id}>{m.etiqueta}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-white/40">
                        Pérdidas (%)
                        <CampoDecimal valor={params.perdidas}
                                      onCambio={(n) => n < 100 && setParams(p => ({ ...p, perdidas: n }))}
                                      className={campo} />
                    </label>
                </div>
            )}

            {error && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30
                                bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-300">
                    <span className="flex-1 min-w-[200px]">{error}</span>
                    <button type="button" onClick={reintentar}
                            className="rounded-md border border-red-400/40 px-2 py-1 text-[9px] font-black
                                       uppercase tracking-widest hover:text-white">
                        Reintentar
                    </button>
                </div>
            )}

            {esp && (
                <>
                    {/* La regla de tres: se teclea el que se sabe */}
                    <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-white/40">
                            Potencia pico
                            <span className="flex items-center gap-1.5">
                                <CampoDecimal valor={manda === 'kwp' ? (kwp ?? '') : (calc?.kwp ?? '')}
                                              onCambio={ponKwp} alVaciar={() => ponKwp(null)}
                                              aria-label="kWp"
                                              className={`${campo} w-24 ${manda === 'kwp' ? 'border-brand/60 text-brand' : ''}`} />
                                <span className="text-[11px] font-bold normal-case text-white/40">kWp</span>
                            </span>
                        </label>
                        <span className="pb-2 text-white/30" aria-hidden>⇄</span>
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase tracking-widest text-white/40">
                            Energía
                            <span className="flex items-center gap-1.5">
                                <CampoDecimal valor={manda === 'kwh' ? (kwh ?? '') : (calc?.kwh ?? '')}
                                              onCambio={ponKwh} alVaciar={() => ponKwh(null)}
                                              aria-label="kWh al año"
                                              className={`${campo} w-28 ${manda === 'kwh' ? 'border-brand/60 text-brand' : ''}`} />
                                <span className="text-[11px] font-bold normal-case text-white/40">kWh/año</span>
                            </span>
                        </label>
                        {atajos.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pb-1">
                                {atajos.map(a => (
                                    <button key={a.id} type="button" onClick={a.hace}
                                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold
                                                        max-md:py-1.5 ${a.activo
                                                ? 'border-brand/60 bg-brand/10 text-brand'
                                                : 'border-white/10 text-white/50 hover:border-white/30 hover:text-white'}`}>
                                        {a.texto}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {calc && (
                        <p className="mt-2 text-[11.5px] leading-snug text-white/60">
                            {manda === 'kwh'
                                ? <>Para {fmtNum(calc.kwh)} kWh/año hacen falta unos <b className="text-white">{fmtKwp(calc.kwp)} kWp</b>
                                    {' '}<span className="text-white/35">({fmtNum(calc.kwh)} ÷ {fmtNum(esp.anual, 2)} kWh/kWp)</span></>
                                : <>{fmtKwp(calc.kwp)} kWp producen <b className="text-white">{fmtNum(calc.kwh)} kWh/año</b>
                                    {' '}<span className="text-white/35">({fmtKwp(calc.kwp)} × {fmtNum(esp.anual, 2)} kWh/kWp)</span></>}
                        </p>
                    )}
                    {pasaDelMaximo && (
                        <p className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5
                                      text-[11px] leading-snug text-amber-200/90">
                            Produce más de lo que consume el edificio: como autoconsumo solo se pueden declarar
                            {' '}{fmtNum(kwhObjetivo)} kWh/año (el máximo del CEE); el resto se vierte a la red.
                        </p>
                    )}

                    {/* Los doce meses: los que pide CE3X, sumando exacto */}
                    {calc && (
                        <div className="mt-3">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
                                    Mes a mes (kWh/mes) · pulsa un mes para copiarlo
                                </p>
                                <span className="text-[10px] text-white/35">
                                    total <b className="font-mono text-white/70">{fmtNum(calc.mensual.reduce((a, b) => a + b, 0))}</b>
                                </span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-12">
                                {calc.mensual.map((v, i) => (
                                    <button key={MESES[i]} type="button" onClick={() => copiar(v, `m${i}`)}
                                            title={`Copiar ${MESES[i]}: ${v}`}
                                            className={`flex flex-col items-center rounded-md border px-1 py-1.5
                                                        transition-colors ${copiado === `m${i}`
                                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                                : 'border-white/[0.07] bg-white/[0.03] hover:border-brand/40'}`}>
                                        <span className="text-[9px] font-bold uppercase text-white/40">{MESES[i]}</span>
                                        <span className="font-mono text-[12px] font-bold text-white/85">
                                            {copiado === `m${i}` ? '✓' : fmtNum(v)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <BotonCopiar onClick={() => copiar(calc.kwp.toFixed(2), 'kwp')} hecho={copiado === 'kwp'}>
                                    Copiar kWp
                                </BotonCopiar>
                                <BotonCopiar onClick={() => copiar(String(calc.kwh), 'kwh')} hecho={copiado === 'kwh'}>
                                    Copiar kWh/año
                                </BotonCopiar>
                                <BotonCopiar onClick={() => copiar(tsvMensual(calc.mensual), 'todos')} hecho={copiado === 'todos'}>
                                    Copiar los 12 meses
                                </BotonCopiar>
                                {onUsar && (
                                    <button type="button"
                                            onClick={() => onUsar({ kwh: calc.kwh, kwp: calc.kwp, mensual: calc.mensual, especifica: esp })}
                                            className="ml-auto rounded-lg border border-brand/50 bg-brand/10 px-2.5 py-1
                                                       text-[9px] font-black uppercase tracking-widest text-brand
                                                       hover:bg-brand/20 max-md:px-3 max-md:py-2">
                                        {textoUsar}
                                    </button>
                                )}
                                {copiado === '__fallo__' && (
                                    <span className="text-[10px] text-amber-300">No se ha podido copiar: selecciónalo a mano.</span>
                                )}
                            </div>
                        </div>
                    )}

                    <p className="mt-2.5 text-[10px] leading-relaxed text-white/30">
                        {esp.ubicacion
                            ? <>En {fmtNum(esp.ubicacion.lat, 4)}, {fmtNum(esp.ubicacion.lon, 4)} ({esp.ubicacion.origen})</>
                            : null}
                        {' · '}{esp.fuente}
                        {esp.base_radiacion ? ` · ${esp.base_radiacion}` : ''}
                        {esp.anios ? ` ${esp.anios[0]}-${esp.anios[1]}` : ''}
                        {' · '}sistema conectado a red, módulos de silicio cristalino. Los meses siguen la curva
                        de producción de PVGIS; el autoconsumo de un mes no puede pasar de lo que se consume ese mes.
                    </p>
                </>
            )}
        </div>
    );
}

function BotonCopiar({ onClick, hecho, children }) {
    return (
        <button type="button" onClick={onClick}
                className={`rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest
                            whitespace-nowrap max-md:px-3 max-md:py-2 ${hecho
                    ? 'border-emerald-500/40 text-emerald-400'
                    : 'border-white/10 text-white/55 hover:border-white/30 hover:text-white'}`}>
            {hecho ? '✓ Copiado' : children}
        </button>
    );
}

export default ProduccionFotovoltaica;
