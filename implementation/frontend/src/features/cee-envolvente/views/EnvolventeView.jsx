import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { PlanoPlanta } from '../components/PlanoPlanta';
import { PanelPared } from '../components/PanelPared';
import { usePlanoEnvolvente } from '../logic/usePlanoEnvolvente';

// ─────────────────────────────────────────────────────────────────────────────
// Envolvente térmica — la superficie del certificador.
//
// De la referencia catastral sale el plano de cada planta habitable con sus
// paredes ya clasificadas y medidas. Él señala por dónde se entra, dice qué
// ventanas y puertas hay en cada pared, y se lleva el .cex para abrirlo en
// CE3X con todo puesto.
//
// El reparto es el de siempre: la GEOMETRÍA la mide el motor (contenedor
// Python), y aquí no se calcula ni un metro — solo se enseña y se recoge lo
// que el motor no puede saber. Ver `backend/routes/ceeEnvolvente.js`.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-envolvente';

export function EnvolventeView({ expediente, onAviso }) {
    const id = expediente?.id;
    // La RC vive en distinto sitio segun el negocio. Mismo orden que usan los
    // anexos (AnexoIModal, AnexoCesionModal): lo que ya funciona, no se cambia.
    const rc = (expediente?.instalacion?.ref_catastral
        || expediente?.ref_catastral
        || expediente?.cliente?.referencia_catastral
        || expediente?.referencia_catastral
        || expediente?.oportunidad?.rc
        || '').trim();

    const [geo, setGeo] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [generando, setGenerando] = useState(false);
    const [avisos, setAvisos] = useState(null);

    const plano = usePlanoEnvolvente(geo, id);
    const { plantas, muros, entrada, sel, resumen, setEntrada, setSel } = plano;

    // Traer la geometría es CARO: son varias peticiones a Catastro en serie,
    // nunca en ráfaga. No se dispara sola al abrir la pestaña — la pide él.
    async function traerGeometria() {
        if (!rc) { setError('Este expediente no tiene referencia catastral.'); return; }
        setCargando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/${id}/geometria`,
                { referencia_catastral: rc });
            setGeo(data);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo construir la envolvente.');
        } finally {
            setCargando(false);
        }
    }

    async function generarCex() {
        setGenerando(true); setError(null); setAvisos(null);
        try {
            const r = await axios.post(`${API}/${id}/cex`, {
                geometria: geo.geometria,
                datos: plano.fichaParaElMotor(expediente),
                nombre: expediente?.numero_expediente
                    ? `${expediente.numero_expediente} - CEE INICIAL` : null,
            }, { responseType: 'blob' });

            descargar(r.data, cabeceraNombre(r.headers) || 'expediente.cex');
            setAvisos(leerJson(r.headers['x-cee-avisos']));
            onAviso?.('.cex generado. Ábrelo con CE3X y revisa los avisos.');
        } catch (e) {
            // 422 = el motor NO ha escrito el fichero a propósito. Es una
            // respuesta, no una caída: lleva dentro qué le falta.
            const texto = await textoDeBlob(e.response?.data);
            setError(texto || 'No se pudo generar el .cex.');
        } finally {
            setGenerando(false);
        }
    }

    if (!geo) {
        return (
            <Arranque rc={rc} cargando={cargando} error={error}
                      onTraer={traerGeometria} />
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <Cabecera resumen={resumen} entrada={entrada}
                      onCambiarEntrada={() => setEntrada(null)} />

            {!entrada && <PasoEntrada />}

            {error && <Franja tono="red">{error}</Franja>}
            {avisos?.length > 0 && <Avisos lista={avisos} />}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {plantas.map(p => (
                        <PlanoPlanta key={p.nombre} planta={p} plano={plano} />
                    ))}
                </div>
                <PanelPared plano={plano} />
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={generarCex}
                    disabled={!entrada || generando}
                    className="rounded-xl bg-brand px-5 py-3 text-xs font-black uppercase
                               tracking-widest text-black disabled:opacity-40
                               disabled:cursor-not-allowed hover:brightness-110">
                    {generando ? 'Generando…' : '⚡ Generar .cex'}
                </button>
                <span className="text-[11px] text-white/40">
                    {entrada ? 'Se descarga y se abre con CE3X.'
                             : 'Señala primero por dónde se entra.'}
                </span>
            </div>
        </div>
    );
}

// ─── Trozos de pantalla ──────────────────────────────────────────────────────

function Arranque({ rc, cargando, error, onTraer }) {
    return (
        <div className="flex flex-col items-start gap-4 py-6">
            <div>
                <h3 className="text-lg font-black tracking-tight">Envolvente térmica</h3>
                <p className="mt-1 max-w-xl text-sm text-white/50">
                    De la referencia catastral sale el plano de cada planta con sus
                    fachadas, medianeras y particiones ya medidas y orientadas. Tú
                    pones las ventanas y te llevas el <code>.cex</code> para CE3X.
                </p>
            </div>
            {rc
                ? <code className="rounded-md border border-white/10 bg-white/[0.03]
                                    px-2 py-1 text-[11px] text-white/70">{rc}</code>
                : <Franja tono="amber">
                      Este expediente no tiene referencia catastral. Ponla en la ficha
                      y vuelve.
                  </Franja>}
            {error && <Franja tono="red">{error}</Franja>}
            <button
                onClick={onTraer}
                disabled={!rc || cargando}
                className="rounded-xl bg-brand px-5 py-3 text-xs font-black
                           uppercase tracking-widest text-black disabled:opacity-40
                           hover:brightness-110">
                {cargando ? 'Midiendo el edificio…' : 'Traer la envolvente'}
            </button>
            {cargando && (
                <p className="text-[11px] text-white/40">
                    Son varias consultas a Catastro, en serie y con pausa. Tarda
                    entre veinte segundos y un minuto.
                </p>
            )}
        </div>
    );
}

function Cabecera({ resumen, entrada, onCambiarEntrada }) {
    const tiras = [
        { n: resumen.medidos, t: 'medidos', c: 'text-emerald-400' },
        { n: resumen.dudosos, t: 'dudosos', c: 'text-amber-400' },
        { n: resumen.sinTocar, t: 'paredes sin tocar', c: 'text-white/40' },
        { n: resumen.m2Hueco, t: 'm² de hueco', c: 'text-white' },
    ];
    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="grid flex-1 grid-cols-2 sm:grid-cols-4 gap-2">
                {tiras.map(x => (
                    <div key={x.t}
                         className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                        <div className={`text-xl font-black tabular-nums ${x.c}`}>{x.n}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.09em] text-white/40">
                            {x.t}
                        </div>
                    </div>
                ))}
            </div>
            {entrada && (
                <button onClick={onCambiarEntrada}
                        className="rounded-lg border border-white/10 px-3 py-2 text-[11px]
                                   text-white/60 hover:text-white hover:border-white/25">
                    ◆ entrada: <b className="text-brand">{entrada}</b> · cambiar
                </button>
            )}
        </div>
    );
}

function PasoEntrada() {
    return (
        <Franja tono="amber">
            <b>¿Por dónde se entra a la casa?</b> Pulsa la pared de la puerta. Las
            <b className="text-brand"> naranjas</b> son las que dan a la calle,
            que es lo corriente — pero <b>vale cualquiera</b>.
            <span className="mt-1 block text-[11px] text-white/45">
                Catastro dice el nombre de la calle pero no qué pared da a ella, y el
                punto que devuelve es el centro de la parcela, no el portal. Y una
                puerta metida en un retranqueo sale como patio. Por eso se señala.
            </span>
        </Franja>
    );
}

function Avisos({ lista }) {
    return (
        <details className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-4 py-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-amber-300">
                Lo que no es una medida ({lista.length})
            </summary>
            <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-amber-100/80">
                {lista.map((a, i) => <li key={i}>· {a}</li>)}
            </ul>
        </details>
    );
}

function Franja({ tono, children }) {
    const estilo = {
        red: 'border-red-500/30 bg-red-500/[0.07] text-red-300',
        amber: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200',
    }[tono];
    return (
        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${estilo}`}>
            {children}
        </div>
    );
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

function cabeceraNombre(headers) {
    const cd = headers?.['content-disposition'] || '';
    return cd.match(/filename="([^"]+)"/)?.[1] || null;
}

function leerJson(texto) {
    try { return JSON.parse(texto); } catch { return null; }
}

/** El 422 llega como blob porque pedimos blob: hay que abrirlo para leerlo. */
async function textoDeBlob(blob) {
    if (!blob) return null;
    try { return JSON.parse(await blob.text())?.error || null; } catch { return null; }
}

export default EnvolventeView;
