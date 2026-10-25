// ─── FaseFotos — la fase 4: las fotos, en el orden de la visita ─────────────
// Fran (25/10/2026): primero fachadas, ventanas por dentro y cubierta; luego los
// equipos, UNA pregunta cada vez: «¿Con qué se calienta?» → al elegir, la
// pregunta se PLIEGA (queda lo elegido y «Cambiar») y salen la foto del equipo
// y la de su placa con «la subo ahora / después / genérico». Igual con el agua
// caliente, el aire acondicionado y las placas solares. La siguiente pregunta
// aparece cuando se contesta la anterior: así no hay scroll.
// Sin visita: lo mismo para subir de la galería, o el enlace al propietario.
import { useState } from 'react';
import { ORIGENES, SLOTS, estadoEquipos, slotsAplicables } from '../logic/cuestionario';
import { Aviso } from '../ui/piezas';
import { IcoCamara, IcoCheck, IcoChevron } from '../ui/Iconos';
import { BloqueEquipo, EnlacePropietario, SlotFoto } from './Fotos';
import { textoRespuesta } from './fasesFicha';
import { PASO_POR_ID, contestada, valorDe } from './pasos';
import { Pregunta } from './Pregunta';

const pregunta = (paso, k) => PASO_POR_ID[paso].preguntas.find(q => q.k === k);

/**
 * Una pregunta de opción única que se PLIEGA al contestarla (arreglo 6 del Word):
 * queda lo elegido con «Cambiar». Si el dato lo dedujo la IA, se dice de dónde.
 */
export function Plegable({ p, ctx, titulo }) {
    const [abierta, setAbierta] = useState(false);
    const v = valorDe(p, ctx.form);
    // Lo que se escribe (un número) no se pliega: se plegaría a la primera tecla.
    const seElige = ['opciones', 'sino', 'chips'].includes(p.tipo);
    if (seElige && contestada(p, ctx.form) && !abierta) {
        const o = ORIGENES[ctx.form.cuestionario?.origen?.[p.k]];
        return (
            <div className="ca-elegida">
                <span className="ca-ico-tile ca-tile-verde" aria-hidden="true"><IcoCheck size={16} /></span>
                <span>
                    <small>{titulo || p.titulo}</small>
                    <b>{textoRespuesta(p, v)}</b>
                    {o && <span className="ca-origen">{o.label}</span>}
                </span>
                {ctx.editable && <button type="button" className="ca-link" onClick={() => setAbierta(true)}>Cambiar</button>}
            </div>
        );
    }
    return <Pregunta p={p} ctx={ctx} onElegido={() => setAbierta(false)} />;
}

/** El bloque de fotos de un equipo, si aplica. */
function Equipo({ equipo, ctx, visita, guiaId }) {
    const e = estadoEquipos(ctx.form.cuestionario, ctx.slots).find(x => x.equipo === equipo);
    if (!e) return null;
    return <BloqueEquipo e={e} ctx={ctx} visita={visita} guiaId={guiaId} />;
}

export function FaseFotos({ ctx, obraId }) {
    const { form, slots, editable, setCampo } = ctx;
    const c = form.cuestionario;
    const visita = form.en_vivienda === true;
    const aplican = slotsAplicables(c);
    const conFotos = (id) => (slots?.[id] || []).length > 0;
    const guiaId = visita && editable ? aplican.find(s => !s.documento && !s.video && !conFotos(s.id))?.id : null;
    const slot = (id) => (aplican.some(s => s.id === id) ? SLOTS.find(s => s.id === id) : null);
    const vivienda = ['FOTO_FACHADA_PRINCIPAL', 'FOTO_FACHADAS', 'FOTO_PATIOS_INTERIORES', 'FOTO_VENTANAS', 'FOTO_CUBIERTA', 'VIDEO_VIVIENDA'].map(slot).filter(Boolean);
    const docs = aplican.filter(s => s.documento);

    // Los equipos, uno tras otro: el siguiente aparece al contestar el anterior.
    const pCal = pregunta('calefaccion', 'calefaccion');
    const pAcs = pregunta('acs', 'acs');
    const pTermo = pregunta('acs', 'termo_extra');
    const pLitros = pregunta('acs', 'litros_termo');
    const pAire = pregunta('refrigeracion', 'aire_acondicionado');
    const pNumAires = pregunta('refrigeracion', 'num_aires');
    const pPlacas = pregunta('renovables', 'placas_fv');
    const pKwp = pregunta('renovables', 'kwp');
    const hecha = (p) => contestada(p, form);
    const conBombaAire = c.calefaccion === 'bomba_aire';
    const eqCal = { gas: 'CALDERA', glp: 'CALDERA', gasoleo: 'CALDERA', biomasa: 'CALDERA', carbon: 'CALDERA', aerotermia: 'AEROTERMIA', bomba_aire: 'AIRE' }[c.calefaccion];
    const eqAcs = { termo: 'TERMO', calentador: 'TERMO', solar: 'SOLAR' }[c.acs] || (c.acs === 'aerotermia' && c.calefaccion !== 'aerotermia' ? 'AEROTERMIA' : null);
    const verAcs = hecha(pCal);
    const verAire = verAcs && hecha(pAcs);
    const verPlacas = verAire && (conBombaAire || hecha(pAire));

    return (
        <div className="ca-stack">
            {editable && (
                <div className="ca-chips" role="radiogroup" aria-label="¿Estás en la vivienda?">
                    <button type="button" role="radio" aria-checked={visita} className={`ca-chipbtn${visita ? ' ca-chipbtn-sel' : ''}`}
                        onClick={() => setCampo('en_vivienda', true)}>Estoy en la vivienda</button>
                    <button type="button" role="radio" aria-checked={form.en_vivienda === false} className={`ca-chipbtn${form.en_vivienda === false ? ' ca-chipbtn-sel' : ''}`}
                        onClick={() => setCampo('en_vivienda', false)}>Lo hago con fotos</button>
                </div>
            )}
            {editable && visita && (
                <Aviso tono="info" icono={IcoCamara} titulo="Visita guiada">
                    Ve en este orden: te marcamos en naranja la siguiente foto. «Hacer foto» abre la cámara trasera.
                </Aviso>
            )}
            {editable && form.en_vivienda === false && <EnlacePropietario obraId={obraId} form={form} />}

            <section>
                <h3 className="ca-sec" style={{ marginTop: 0 }}>La casa por fuera y por dentro</h3>
                {vivienda.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={visita} guia={guiaId === s.id} />)}
            </section>

            <section>
                <h3 className="ca-sec">Los equipos</h3>
                <div className="ca-stack" style={{ gap: 12 }}>
                    <Plegable p={pCal} ctx={ctx} titulo="Calefacción" />
                    {eqCal && <Equipo equipo={eqCal} ctx={ctx} visita={visita} guiaId={guiaId} />}

                    {verAcs && <Plegable p={pAcs} ctx={ctx} titulo="Agua caliente" />}
                    {verAcs && c.acs === 'misma_caldera' && <Plegable p={pTermo} ctx={ctx} titulo="Termo eléctrico además" />}
                    {verAcs && (c.acs === 'termo' || c.termo_extra === true) && <Plegable p={pLitros} ctx={ctx} titulo="Litros del termo" />}
                    {verAcs && (eqAcs || c.termo_extra === true) && <Equipo equipo={eqAcs || 'TERMO'} ctx={ctx} visita={visita} guiaId={guiaId} />}

                    {verAire && !conBombaAire && <Plegable p={pAire} ctx={ctx} titulo="Aire acondicionado" />}
                    {verAire && c.aire_acondicionado === true && <Plegable p={pNumAires} ctx={ctx} titulo="Aparatos de aire" />}
                    {verAire && c.aire_acondicionado === true && !conBombaAire && <Equipo equipo="AIRE" ctx={ctx} visita={visita} guiaId={guiaId} />}

                    {verPlacas && <Plegable p={pPlacas} ctx={ctx} titulo="Placas fotovoltaicas" />}
                    {verPlacas && c.placas_fv === 'SI' && <Plegable p={pKwp} ctx={ctx} titulo="Potencia de las placas" />}
                    {verPlacas && c.placas_fv === 'SI' && c.acs !== 'solar' && <Equipo equipo="SOLAR" ctx={ctx} visita={visita} guiaId={guiaId} />}
                </div>
            </section>

            {docs.length > 0 && (
                <details className="ca-plegado">
                    <summary>
                        <span><b>Planos, certificado anterior y otros</b><small>Opcional: si los tienes, ayudan.</small></span>
                        <IcoChevron size={16} />
                    </summary>
                    <div style={{ marginTop: 10 }}>
                        {docs.map(s => <SlotFoto key={s.id} slot={s} ctx={ctx} visita={false} />)}
                    </div>
                </details>
            )}
        </div>
    );
}

export default FaseFotos;
