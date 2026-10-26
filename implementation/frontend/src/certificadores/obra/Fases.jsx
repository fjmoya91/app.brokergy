// ─── Fases — la ficha de una obra en BORRADOR, por fases ───────────────────
// Ver obra/fasesFicha.js. Una fase por pantalla (`?fase=<id>` en la URL, para que el
// «atrás» del móvil funcione), la barra de progreso arriba, «Siguiente» abajo
// (en el móvil, fijo al pie) y lo ya hecho plegado en una línea con «Cambiar».
// «Siguiente» apunta la fase en `cuestionario.fases_ok` (se guarda con lo
// demás) y lleva a la primera sin hacer. Al salir de las fotos se escribe lo
// deducido del Catastro con su origen y se pasa a pedir el certificado: la fase
// «Lo que ha visto la IA» se quitó el 26/10/2026 (Fran: «nos la podemos saltar;
// las skills deben ser capaces ya de sacar eso adelante»).
// LAS FOTOS, SIEMPRE A MANO (26/10/2026, pensando en la visita con el móvil): desde
// cualquier fase, la cámara de la barra de abajo (en el PC, «Fotos» arriba) lleva a
// la fase de fotos, y allí una barra fija «Ir a…» baja a cada foto, con ✓ las hechas
// (IndiceSecciones + fotosDeLaFase).
import { useEffect, useMemo } from 'react';
import {
    MEDIDAS, PROPOSITOS, medidasSugeridas, propositosDe, resumenCuestionario,
} from '../logic/cuestionario';
import { navegar, useRuta } from '../router';
import { IcoAtras, IcoCamara, IcoCheck, IcoFlecha, Spinner } from '../ui/Iconos';
import { IncidenciasObra } from '../incidencias/Incidencias';
import { estadoDe, obraParaBarrido } from './comun';
import { FASES, FASE_POR_ID, faltaEnFase, faseActual, fotosDeLaFase, resumenFase } from './fasesFicha';
import { FaseFotos } from './FaseFotos';
import { IndiceSecciones } from './IndiceSecciones';
import { PedirCertificado } from './Generar';
import { PASO_POR_ID } from './pasos';
import { Inmueble, Opcion, Pregunta, Titular } from './Pregunta';
import { conDeducciones } from './useVistoIa';

function Guardado({ g, onReintentar }) {
    if (g.estado === 'guardando') return <span className="ca-guardado"><Spinner size={12} /> Guardando…</span>;
    if (g.estado === 'pendiente') return <span className="ca-guardado">Sin guardar…</span>;
    if (g.estado === 'error') {
        return (
            <span className="ca-guardado ca-guardado-error" role="status">
                No se ha guardado. <button type="button" className="ca-link" onClick={onReintentar}>Reintentar</button>
            </span>
        );
    }
    return <span className="ca-guardado"><IcoCheck size={13} /> Guardado</span>;
}

/** Lo que dice el Catastro, en corto (lo que la IA ya sabe sin preguntar). */
function CatastroResumen({ obra }) {
    const cat = obra?.catastro || {};
    const cons = Array.isArray(cat.construcciones) ? cat.construcciones : [];
    const casa = /sin divisi[oó]n horizontal/i.test(cat.tipo || '') ? 'Casa (parcela sin división horizontal)'
        : /divisi[oó]n horizontal/i.test(cat.tipo || '') ? 'En un edificio con varias viviendas' : null;
    const usos = cons.map(x => `${String(x.tipo || '').toLowerCase()} ${x.superficie ? `${x.superficie} m²` : ''}`.trim());
    return (
        <dl className="ca-dl ca-crema" style={{ padding: '6px 14px', borderRadius: 16, marginBottom: 16 }}>
            <div><dt>Referencia catastral</dt><dd className="ca-mono">{obra?.ref_catastral || '—'}</dd></div>
            {casa && <div><dt>Según el Catastro</dt><dd>{casa}</dd></div>}
            {usos.length > 0 && <div><dt>En la parcela</dt><dd>{usos.join(' · ')}</dd></div>}
            {cat.plantas ? <div><dt>Plantas</dt><dd>{cat.plantas}</dd></div> : null}
            <div><dt>Zona climática</dt><dd>{obra?.zona_climatica || '—'}</dd></div>
        </dl>
    );
}

/** Fase 3: para qué es (varios) y lo que eso pone de mejora. */
function FasePara({ ctx }) {
    const { form, setC, setCampo, editable } = ctx;
    const lista = propositosDe(form);
    const tocar = (v) => {
        const nueva = lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v];
        setC('propositos', nueva);
        setCampo('proposito', nueva[0] || '');
    };
    const medidas = medidasSugeridas(form.cuestionario, lista).map(m => MEDIDAS.find(x => x.value === m)?.label || m);
    return (
        <div>
            <p className="ca-preg-ayuda" style={{ marginTop: 0 }}>Marca todos los que sean: decide las medidas de mejora que llevará.</p>
            <div className="ca-opts ca-opts-pc2" role="group" aria-label="Para qué es el certificado" style={{ marginTop: 12 }}>
                {PROPOSITOS.map(o => (
                    <Opcion key={o.value} cuadrada sel={lista.includes(o.value)} label={o.label} sub={o.sub} disabled={!editable}
                        onClick={() => tocar(o.value)} />
                ))}
            </div>
            {lista.includes('IRPF_REFORMA') && (
                <div style={{ marginTop: 18 }}>
                    <Pregunta p={PASO_POR_ID.medidas.preguntas.find(q => q.k === 'reforma_que')} ctx={ctx} pasoId="medidas" />
                </div>
            )}
            {lista.length > 0 && (
                <p className="ca-peq" style={{ marginTop: 14 }}>
                    Llevará como mejora: <b>{medidas.join(' · ')}</b>. Las puedes cambiar al final.
                </p>
            )}
        </div>
    );
}

/** Una fase ya hecha (o saltada), plegada en una línea. */
function FasePlegada({ f, form, obra, slots, hecha, onAbrir }) {
    const r = resumenFase(f.id, form, obra, slots);
    return (
        <button type="button" className={`ca-fase-plegada${hecha ? '' : ' ca-fase-pend'}`} onClick={onAbrir}>
            <span className="ca-paso-n">{hecha ? <IcoCheck size={14} strokeWidth={3} /> : FASE_POR_ID[f.id].n}</span>
            <span><b>{f.titulo}</b><small>{r || (hecha ? '' : 'Sin hacer')}</small></span>
            <span className="ca-link">Cambiar</span>
        </button>
    );
}

export function Fases({ o, id, movil }) {
    const { obra, form, slots } = o;
    const { query } = useRuta();
    const pedida = query.get('fase');
    const actual = FASE_POR_ID[pedida] ? pedida : faseActual(form);
    const idx = FASES.findIndex(f => f.id === actual);
    const ok = form.cuestionario.fases_ok || [];
    const resumen = useMemo(() => resumenCuestionario(obraParaBarrido(obra, form, slots)), [obra, form, slots]);
    // En la fase de fotos, el índice «Ir a…» de cada foto (la visita no va siempre en orden).
    const indiceFotos = useMemo(() => (actual === 'fotos'
        ? fotosDeLaFase(form, slots).map(f => ({ id: `slot-${f.id}`, label: f.label, hecho: f.hecho }))
        : []), [actual, form, slots]);

    const ctx = {
        form, obra, slots, editable: o.editable,
        setCampo: o.setCampo, setC: o.setC, setCuestionario: o.setCuestionario, setTitular: o.setTitular, setDecision: o.setDecision,
        subir: o.subir, quitar: o.quitar, subiendo: o.subiendo, docsError: o.docsError, recargarDocs: o.recargarDocs,
        usarFachada: o.usarFachada,
    };
    const falta = faltaEnFase(actual, form, obra);
    const abrir = (fid) => navegar(`/obra/${id}?fase=${fid}`);

    const siguiente = () => {
        if (falta) return;
        const nuevas = [...new Set([...ok, actual])];
        if (actual === 'fotos') {
            // Sin la fase 5: lo deducido del Catastro (tipo de vivienda, plantas…) se
            // escribe ya, con su origen, y lo demás lo saca la IA de las fotos.
            const { cuestionario } = conDeducciones(obra, form, slots);
            o.setCuestionario(() => ({ ...cuestionario, fases_ok: nuevas }));
        } else {
            o.setCuestionario(c => ({ ...c, fases_ok: nuevas }));
        }
        const sig = FASES.find(f => !nuevas.includes(f.id))?.id || 'generar';
        navegar(`/obra/${id}?fase=${sig}`);
    };
    const atras = () => { if (idx > 0) navegar(`/obra/${id}?fase=${FASES[idx - 1].id}`); };

    // La barra fija del móvil sube los botones flotantes.
    const conBarra = movil && actual !== 'generar';
    useEffect(() => {
        if (!conBarra) return undefined;
        document.documentElement.style.setProperty('--ca-inf', '78px');
        return () => { document.documentElement.style.removeProperty('--ca-inf'); };
    }, [conBarra]);

    const t = form.titular || {};
    const titulo = [t.nombre, t.apellidos].filter(Boolean).join(' ') || form.direccion || obra.numero_expediente || 'Obra';
    const direccion = [form.direccion, [form.codigo_postal, form.municipio].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const f = FASE_POR_ID[actual];

    let contenido = null;
    if (actual === 'inmueble') contenido = <><CatastroResumen obra={obra} /><Inmueble ctx={ctx} /></>;
    else if (actual === 'titular') contenido = <Titular ctx={ctx} />;
    else if (actual === 'proposito') contenido = <FasePara ctx={ctx} />;
    else if (actual === 'fotos') contenido = <FaseFotos ctx={ctx} obraId={id} />;
    else contenido = <PedirCertificado ctx={ctx} guardar={o.guardar} onIr={abrir} onHecho={() => o.cargar({ silencioso: true })} />;

    // A las fotos desde cualquier fase (Fran: «en la visita, en cualquier momento
    // debes poder ir a la foto de la fachada o de la caldera»). «Atrás» del móvil vuelve.
    const aFotos = actual !== 'fotos' ? () => abrir('fotos') : null;
    const botones = actual !== 'generar' && (
        <>
            <button type="button" className="ca-btn ca-btn-sec" onClick={atras} disabled={idx === 0} aria-label="Fase anterior"><IcoAtras /></button>
            {movil && aFotos && <button type="button" className="ca-btn ca-btn-sec" onClick={aFotos} aria-label="Ir a las fotos"><IcoCamara /></button>}
            <button type="button" className="ca-btn ca-btn-pri" onClick={siguiente} disabled={!!falta}>
                Siguiente <IcoFlecha />
            </button>
        </>
    );

    return (
        <div className={movil ? 'ca-col' : 'ca-col-fases'}>
            <header className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <div className="ca-fila-top">
                    <p className="ca-eyebrow" style={{ margin: 0 }}>
                        {obra.numero_expediente || 'Obra nueva'}{!movil && <> · <span className={`ca-chip ${estadoDe(obra.estado).chip}`}>{estadoDe(obra.estado).label}</span></>}
                    </p>
                    <span className="ca-fila-top-der">
                        {aFotos && (!movil || actual === 'generar') && (
                            <button type="button" className="ca-btn ca-btn-sec ca-btn-peq ca-btn-fotos" onClick={aFotos}>
                                <IcoCamara size={16} /> Fotos
                            </button>
                        )}
                        <Guardado g={o.guardado} onReintentar={o.guardar} />
                    </span>
                </div>
                <h1 className={`ca-display ${movil ? 'ca-h2' : 'ca-h1'}`} style={{ margin: '8px 0 0' }}>{titulo}</h1>
                {direccion && <p className="ca-sub" style={{ marginTop: 4 }}>{direccion}</p>}
                <ol className="ca-fases-barra" aria-label="Fases">
                    {FASES.map(x => (
                        <li key={x.id} className={`${ok.includes(x.id) ? 'ca-fb-hecha' : ''}${x.id === actual ? ' ca-fb-act' : ''}`}>
                            <button type="button" onClick={() => abrir(x.id)} aria-current={x.id === actual ? 'step' : undefined} aria-label={`${FASE_POR_ID[x.id].n}. ${x.titulo}`}>
                                <i />{!movil && <span>{x.titulo}</span>}
                            </button>
                        </li>
                    ))}
                </ol>
                {movil && <p className="ca-peq" style={{ margin: '8px 0 0' }}>Fase {f.n} de {FASES.length} · {f.titulo}</p>}
            </header>

            {FASES.slice(0, idx).map(x => (
                <FasePlegada key={x.id} f={x} form={form} obra={obra} slots={slots} hecha={ok.includes(x.id)} onAbrir={() => abrir(x.id)} />
            ))}

            {indiceFotos.length > 1 && <IndiceSecciones items={indiceFotos} etiqueta="Ir a una foto" />}

            <section className="ca-card ca-pad ca-fase ca-in-2" key={actual}>
                <p className="ca-eyebrow" style={{ margin: 0 }}>Fase {f.n} de {FASES.length}</p>
                <h2 className="ca-display ca-h2" style={{ margin: '4px 0 0' }}>{f.titulo}</h2>
                <p className="ca-sub" style={{ marginTop: 2 }}>{f.sub}</p>
                <div style={{ marginTop: 18 }}>{contenido}</div>
                {falta && <p className="ca-peq ca-falta" role="status">{falta}</p>}
                {!movil && botones && <div className="ca-btns ca-btns-nav">{botones}</div>}
            </section>

            {FASES.slice(idx + 1).filter(x => ok.includes(x.id)).map(x => (
                <FasePlegada key={x.id} f={x} form={form} obra={obra} slots={slots} hecha onAbrir={() => abrir(x.id)} />
            ))}

            {resumen.length > 0 && (
                <details className="ca-card ca-pad ca-resumen" style={{ marginTop: 12 }}>
                    <summary>Lo que va a leer la IA</summary>
                    <dl className="ca-dl" style={{ marginTop: 10 }}>
                        {resumen.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                    </dl>
                </details>
            )}
            <IncidenciasObra obraId={id} numero={obra.numero_expediente} className="ca-stack" />
            <p className="ca-peq" style={{ textAlign: 'center', marginTop: 14 }}>Se guarda solo mientras rellenas.</p>

            {conBarra && (
                <div className="ca-inf">
                    <div className="ca-inf-in">{botones}</div>
                </div>
            )}
        </div>
    );
}

export default Fases;
