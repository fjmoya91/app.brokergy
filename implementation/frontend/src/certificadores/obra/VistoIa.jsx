// ─── VistoIa — la fase 5: «Lo que ha visto la IA» ───────────────────────────
// Fran (25/10/2026): «antes de generar el CE, una vez que la IA actúa, le vuelva
// a preguntar al certificador para confirmar». GRATIS y ANTES de gastar el
// crédito:
//   · lo del Catastro, la época y lo habitual (deduccionesCatastro: puro, sin red)
//     se enseña ya aplicado;
//   · la IA mira las fotos, Street View y la placa (POST /obras/:id/visto-ia,
//     con tope por cuenta y día) y propone más;
//   · cada dato dice de dónde sale y tiene «Cambiar»; lo dudoso va ARRIBA como
//     una pregunta corta.
// Lo deducido se ESCRIBE en el cuestionario al confirmar (fasesFicha.js → Fases), no
// al pintar: abrir la fase no guarda nada.
// Ordenado como CE3X (PESTANAS_CE3X): una línea por elemento, no por pregunta.
import { useMemo, useState } from 'react';
import { haceCuanto } from '../api';
import { ORIGENES, contestar } from '../logic/cuestionario';
import { Aviso } from '../ui/piezas';
import { IcoAlerta, IcoChispa, IcoRecargar, Spinner } from '../ui/Iconos';
import { PESTANAS_CE3X, PREGUNTA_POR_CLAVE, elementosVisibles, lineaElemento } from './fasesFicha';
import { Pregunta } from './Pregunta';
import { conDeducciones } from './useVistoIa';

function fotoDe(slots, driveId) {
    if (!driveId) return null;
    for (const lista of Object.values(slots || {})) {
        const f = (lista || []).find(x => (x.driveId || x.id) === driveId);
        if (f) return f;
    }
    return null;
}

function Duda({ d, ctx, onResponder }) {
    const foto = fotoDe(ctx.slots, d.foto);
    return (
        <div className="ca-duda">
            {foto?.thumb && <img src={foto.thumb} alt="" className="ca-duda-foto" loading="lazy" />}
            <div style={{ minWidth: 0 }}>
                <b>{d.pregunta}</b>
                {d.por_que && <small>{d.por_que}</small>}
                <div className="ca-chips" style={{ marginTop: 10 }}>
                    {d.opciones.map(o => (
                        <button key={o.label} type="button" className="ca-chipbtn" disabled={!ctx.editable} onClick={() => onResponder(d, o)}>
                            {o.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Un elemento de CE3X (la cubierta, los huecos, un equipo…) en una línea; «Cambiar» abre sus preguntas. */
function Elemento({ el, ctx }) {
    const [abierto, setAbierto] = useState(false);
    const c = ctx.form.cuestionario;
    const l = lineaElemento(el, c);
    const o = l.origen === 'TU' ? null : ORIGENES[l.origen];
    return (
        <li className="ca-dato">
            <div className="ca-dato-fila">
                <span className="ca-dato-txt">
                    <small>{el.titulo}</small>
                    <b className={l.texto ? '' : 'ca-dato-vacio'}>{l.texto || 'Sin dato: CE3X pondrá lo de su año'}</b>
                    {l.notas.length > 0 && <em>{l.notas.join(' ')}</em>}
                </span>
                <span className={`ca-origen${o ? (l.supuesto ? ' ca-origen-supuesto' : '') : l.origen ? ' ca-origen-tu' : ' ca-origen-no'}`}>
                    {o ? o.label : l.origen ? 'Tú' : 'Por defecto'}
                </span>
                {ctx.editable && (
                    <button type="button" className="ca-link" onClick={() => setAbierto(a => !a)}>
                        {abierto ? 'Listo' : l.texto ? 'Cambiar' : 'Ponerlo'}
                    </button>
                )}
            </div>
            {abierto && (
                <div className="ca-dato-preg ca-stack" style={{ gap: 14 }}>
                    {el.claves.map(k => <Pregunta key={k} p={PREGUNTA_POR_CLAVE[k]} ctx={ctx} />)}
                    <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" style={{ alignSelf: 'flex-start' }} onClick={() => setAbierto(false)}>Listo</button>
                </div>
            )}
        </li>
    );
}

/**
 * @param ctx  el de la ficha (form, slots, setC, setCuestionario, editable…)
 * @param ia   el de useVistoIa (mirar, mirando, error)
 */
export function VistoIa({ ctx, ia }) {
    const { obra, form, slots, setCuestionario } = ctx;
    // Lo que se enseña: lo guardado + lo deducido del Catastro (sin guardarlo aún).
    const { cuestionario: cv, dudas: dudasCatastro } = useMemo(() => conDeducciones(obra, form, slots), [obra, form, slots]);
    const ctxVista = useMemo(() => ({ ...ctx, form: { ...form, cuestionario: cv } }), [ctx, form, cv]);
    const v = cv.visto_ia || {};
    const f = v.fuentes || {};

    // Las dudas de la IA primero; las del Catastro, si no hay ya una de la IA sobre lo mismo.
    // Una duda contestada por él (valor sin origen) ya no sale.
    const contestadaPorEl = (k) => {
        const val = cv[k];
        return !(val == null || val === '' || (Array.isArray(val) && !val.length)) && !cv.origen?.[k];
    };
    const dudasIa = (v.dudas || []).filter(d => !contestadaPorEl(d.k));
    const dudas = [...dudasIa, ...dudasCatastro.filter(d => !dudasIa.some(x => x.k === d.k))];

    const responder = (d, opcion) => {
        setCuestionario(q => {
            const n = contestar(q, opcion.valores);
            if (!n.visto_ia) return n;
            return { ...n, visto_ia: { ...n.visto_ia, dudas: (n.visto_ia.dudas || []).filter(x => x.id !== d.id) } };
        });
    };

    const fuentes = [
        f.fotos ? `${f.fotos} ${f.fotos === 1 ? 'foto' : 'fotos'}` : null,
        f.streetview ? 'Street View' : null,
        f.placa ? 'la placa' : null,
    ].filter(Boolean);

    return (
        <div className="ca-stack">
            <div className="ca-crema ca-ia-estado">
                {ia.mirando ? (
                    <><Spinner /> <span><b>Mirando las fotos, Street View y las placas…</b><small>Suele tardar medio minuto. No gasta tu certificado.</small></span></>
                ) : v.at ? (
                    <>
                        <span className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoChispa size={16} /></span>
                        <span>
                            <b>{fuentes.length ? `Ha mirado ${fuentes.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : 'No había fotos que mirar'}</b>
                            <small>{haceCuanto(v.at)} · lo que no se ve, del Catastro y de su año</small>
                        </span>
                        {ctx.editable && <button type="button" className="ca-link" onClick={ia.mirar}><IcoRecargar size={13} /> Volver a mirar</button>}
                    </>
                ) : (
                    <>
                        <span className="ca-ico-tile ca-tile-crema" aria-hidden="true"><IcoChispa size={16} /></span>
                        <span><b>Esto sale del Catastro y de su año</b><small>Que la IA mire también las fotos y Street View: gratis.</small></span>
                        {ctx.editable && <button type="button" className="ca-btn ca-btn-sec ca-btn-peq" onClick={ia.mirar}><IcoChispa size={16} /> Mirar las fotos</button>}
                    </>
                )}
            </div>
            {ia.error && <Aviso tono="ambar" icono={IcoAlerta} titulo="No ha podido mirar">{ia.error}</Aviso>}

            {dudas.length > 0 && (
                <section>
                    <h3 className="ca-sec" style={{ marginTop: 0 }}>{dudas.length === 1 ? 'Una duda' : `${dudas.length} dudas`}</h3>
                    <div className="ca-stack" style={{ gap: 10 }}>
                        {dudas.map(d => <Duda key={d.id || d.k} d={d} ctx={ctxVista} onResponder={responder} />)}
                    </div>
                </section>
            )}

            {PESTANAS_CE3X.map(t => {
                const elementos = elementosVisibles(t, cv);
                if (!elementos.length) return null;
                return (
                    <section key={t.id}>
                        <h3 className="ca-sec">{t.titulo}</h3>
                        <ul className="ca-datos">
                            {elementos.map(el => <Elemento key={el.id} el={el} ctx={ctxVista} />)}
                        </ul>
                    </section>
                );
            })}
            <p className="ca-peq">
                En el orden de CE3X. Nada de esto gasta tu certificado; «Por defecto» = CE3X pondrá el valor de su año. Cuando lo veas bien, confirma.
            </p>
        </div>
    );
}

export default VistoIa;
