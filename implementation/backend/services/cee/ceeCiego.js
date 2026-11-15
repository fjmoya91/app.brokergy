'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// El CEE «A CIEGAS» de una OPORTUNIDAD: un CEE hecho por programa —solo con la
// referencia catastral, sin IA, sin fotos, sin persona— calificado con CE3X 3.2
// en el PC. Su cifra va APARTE de la de la calculadora, la ve solo el equipo
// interno y NO cambia nada de lo que se ofrece (Fran, 26/10/2026: «no debe
// sustituir al cálculo actual: será una funcionalidad más hasta que podamos
// validarlo»). Lo medido y el diseño:
//   docs/conocimiento/calculo/cee-a-ciegas-prueba-con-18-expedientes.md
//   docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md
//
// Recorrido (el de la Fase 0, «v2»):
//   1. `/envolvente` del motor con la RC y las construcciones elegidas.
//   2. Se aceptan SOLAS las dos propuestas que el motor hace a una persona —los
//      cuerpos casados con una construcción NO vivienda y el `croquis_propuesto`—
//      y se vuelve a medir. SOLO para esta cifra: no se guarda en `envolvente_cee`
//      (en la ventana, regla 48.j, eso se avisa y nunca se quita solo).
//   3. 12 % de huecos en cada fachada al aire; `componerFicha` con la caldera de la
//      oportunidad, el técnico por defecto, fechas de hoy y sin medidas de mejora.
//   4. CE3X 3.2 lo califica en una carpeta temporal y del XML se leen la demanda de
//      calefacción y la superficie útil. NADA va a Drive (un `.cex` en «1. CEE» se
//      tomaría por el del técnico, regla 48).
//   5. El bono a ciegas sale de las MISMAS funciones que la calculadora sobre una
//      COPIA de los inputs (`inputsConDemandaCiega`); `datos_calculo.result` no se toca.
//
// REGLA — se guarda en `datos_calculo.estimacion_ciega`, FUERA de `inputs` para
// que ningún cálculo la lea, y solo ESCALARES. El guardado de la calculadora la
// conserva de la BD (como `envolvente_cee`) y a un partner no se le devuelve.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../supabaseClient');
const cex = require('../ceeEnvolventeCex');
const cexAPdf = require('./cexAPdf');
require('../../utils/esmSinExtension');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
const FRONT = path.join(__dirname, '../../../frontend/src');
const esm = f => import(pathToFileURL(path.join(FRONT, f)).href);

/** El técnico de por defecto de `cee_inicial.js`: CE3X no califica sin uno y no mueve la demanda. */
const TECNICO_POR_DEFECTO = 'c05b23c1-aa81-4a9a-bd6b-b59cb65775c5';
/** Huecos por fachada al aire: el GLA por defecto de la calculadora para una unifamiliar. */
const GLA = 0.12;
/** CE3X no califica sin foto y plano: va una NEUTRA (misma demanda, medido en 26RES060_189 y _245). */
const IMAGEN_NEUTRA = path.join(__dirname, '../../plantillas/cee-ciego/imagen-neutra.jpg');
/** Los `.cex` y XML se quedan en el PC por si hay que mirarlos (no se entregan a nadie). */
const CARPETA_TRABAJO = path.join(os.tmpdir(), 'brokergy-cee-ciego');
const AVISO_M2 = 300;

const valor = (x) => (x && typeof x === 'object' ? x.value : x);
const r1 = (n) => Math.round(n * 10) / 10;

async function alMotor(ruta, cuerpo) {
    const r = await fetch(`${MOTOR}${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(240_000),
    });
    if (!r.ok) throw new Error(`motor ${ruta}: ${(await r.json().catch(() => ({}))).detail || r.status}`);
    return r;
}

/** Lo que pondría quien NO ha visto la casa: el 12 % de cada fachada al aire, y la entrada a la calle. */
function senaladoACiegas(geo) {
    const fachadas = geo.plantas.flatMap(p => p.muros).filter(m => !m.fuera && m.tipo === 'FACHADA');
    const huecos = [];
    for (const m of fachadas) {
        const area = (Number(valor(m.superficie)) || 0) * GLA;
        if (area < 0.5) continue;
        huecos.push({ id: `V${huecos.length + 1}`, cerramiento: m.id, ancho: +(area / 1.2).toFixed(2), alto: 1.2,
            tipo: 'Ventana', de: 'A CIEGAS' });
    }
    const entrada = fachadas.find(m => m.subtipo === 'CALLE' && m.nivel === 0) || fachadas[0];
    return { huecos, entrada: entrada ? { valor: entrada.id, de: 'A CIEGAS' } : null, medianeras_como_particion: [] };
}

/** La demanda del EDIFICIO: la primera `<Demanda>` va en `<Indicadores>` (las de las medidas, después). */
function demandaDelXml(xml) {
    const t = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml);
    const bloque = (t.match(/<Indicadores>[\s\S]*?<Demanda>([\s\S]*?)<\/Demanda>/i) || [])[1] || '';
    const num = (tag, s = bloque) => {
        const m = s.match(new RegExp(`<${tag}>\\s*([\\d.,-]+)\\s*</${tag}>`, 'i'));
        return m ? parseFloat(m[1].replace(',', '.')) : null;
    };
    return { cal: num('Cal'), sup: num('SuperficieUtil', t) };
}

/** La oportunidad, solo lo que hace falta (regla 22: nunca `datos_calculo` entero). */
async function leerOportunidad(clave) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    const { data, error } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, ficha, ref_catastral, estado:datos_calculo->>estado, '
            + 'inputs:datos_calculo->inputs, ahorro:datos_calculo->result->savings->>savingsKwh, '
            + 'bono:datos_calculo->result->financials->>caeBonus, q_net:datos_calculo->result->>Q_net, '
            + 'previa:datos_calculo->estimacion_ciega')
        .eq(esUuid ? 'id' : 'id_oportunidad', clave)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw Object.assign(new Error(`No se ha podido leer la oportunidad: ${error.message}`), { status: 503 });
    return data || null;
}

/** La geometría v2 (v1 + las dos propuestas del motor), con lo que se ha quitado dicho. */
async function geometriaV2(rc, construcciones) {
    // Catastro en serie y por la caché del motor: primero sin salir; si no la tiene, una vez fuera.
    let geo;
    try {
        geo = await (await alMotor('/envolvente', { referencia_catastral: rc, offline: true, construcciones })).json();
    } catch {
        geo = await (await alMotor('/envolvente', { referencia_catastral: rc, offline: false, construcciones })).json();
    }
    const fuera = (geo.cuerpos || [])
        .filter(c => c.construccion && c.construccion.habitable !== true && c.habitable !== true).map(c => c.id);
    const croquis = (geo.croquis_propuesto || [])
        .flatMap(p => (p.trazos || []).map(t => ({ nivel: p.nivel, uso: t.uso, poligono: t.poligono })));
    if (fuera.length || croquis.length) {
        geo = await (await alMotor('/envolvente', { referencia_catastral: rc, offline: true, construcciones,
            cuerpos_excluidos: fuera, croquis, croquis_ajustar: false })).json();
    }
    const planta = (n) => (Number(n) === 0 ? 'planta baja' : Number(n) < 0 ? `sótano ${-n}` : `planta ${n}`);
    return { geo, cuerposFuera: fuera.length,
        croquis: croquis.map(t => `${String(t.uso).toLowerCase()} en ${planta(t.nivel)}`).join(', ') };
}

/**
 * Calcula la cifra a ciegas de UNA oportunidad. Solo en el PC (CE3X es de Windows).
 * @param {string} clave  uuid o `id_oportunidad`
 * @param {object} [o]
 * @param {boolean} [o.escribir]  sin él, solo dice lo que guardaría
 * @param {boolean} [o.forzar]    rehacerla aunque la huella no haya cambiado
 * @returns {{ id_oportunidad, omitido?, estimacion?, escrito }}
 */
async function calcularCiega(clave, { escribir = false, forzar = false } = {}) {
    const op = await leerOportunidad(clave);
    if (!op) throw Object.assign(new Error(`No existe la oportunidad ${clave}.`), { status: 404 });
    const inputs = op.inputs || {};
    const ec = await esm('features/calculator/logic/estimacionCiega.js');
    const salida = { id_oportunidad: op.id_oportunidad, escrito: false };

    const motivo = ec.motivoNoElegible({ ficha: op.ficha, inputs, estado: op.estado, rc: op.ref_catastral });
    if (motivo) return { ...salida, omitido: motivo };
    const rc = op.ref_catastral || inputs.rc;
    const huella = ec.huellaCiega(inputs, rc);
    if (!forzar && op.previa?.huella === huella) return { ...salida, omitido: 'ya está hecha con estos datos', estimacion: op.previa };

    // ── El CEE ───────────────────────────────────────────────────────────────
    const ctx = await cex.cargarExpediente(op.id, 'op');
    if (!ctx) throw new Error('No se ha podido cargar la oportunidad como expediente.');
    ctx.certificador = await cex.leerCertificador(TECNICO_POR_DEFECTO);
    const hoy = new Date().toISOString().slice(0, 10);
    ctx.expediente = { ...ctx.expediente, cee: { ...(ctx.expediente.cee || {}),
        fecha_firma_cee_inicial: hoy, fecha_visita_cee_inicial: hoy } };
    const construcciones = await cex.construccionesElegidas(op.id, 'op');
    const { geo, cuerposFuera, croquis } = await geometriaV2(rc, construcciones);
    const envolvente = senaladoACiegas(geo);
    const { ficha } = await cex.componerFicha(ctx, { geometria: geo.geometria, envolvente, ajustes: {},
        medidas: [], conImagenes: false, fase: 'inicial' });
    const neutra = fs.readFileSync(IMAGEN_NEUTRA).toString('base64');
    ficha.generales.foto_edificio = { valor: neutra, de: 'A CIEGAS: imagen neutra' };
    ficha.generales.plano_situacion = { valor: neutra, de: 'A CIEGAS: imagen neutra' };
    // La zona HE4 (solar del ACS) no mueve la demanda de calefacción; fuera de las
    // provincias comprobadas sale sin determinar y el motor no escribe el `.cex`.
    if (!ficha.generales.zona_climatica_he4?.valor) {
        ficha.generales.zona_climatica_he4 = { valor: 'III', de: 'A CIEGAS: no mueve la demanda de calefacción' };
    }
    const bytes = Buffer.from(await (await alMotor('/cex', { geometria: geo.geometria, datos: ficha })).arrayBuffer());
    const cal = await cexAPdf.calificarCex(bytes, { medidas: false, pdf: false, ajustarAutoconsumo: false });
    fs.mkdirSync(CARPETA_TRABAJO, { recursive: true });
    fs.writeFileSync(path.join(CARPETA_TRABAJO, `${op.id_oportunidad}.cex`), bytes);
    if (cal.xml) fs.writeFileSync(path.join(CARPETA_TRABAJO, `${op.id_oportunidad}.xml`), cal.xml);
    if (!cal.xml) throw new Error(`CE3X no lo califica: ${(cal.error || 'sin XML').slice(0, 300)}`);
    const d = demandaDelXml(cal.xml);
    if (!(d.cal > 0) || !(d.sup > 0)) throw new Error('El XML no trae la demanda de calefacción o la superficie.');

    // ── El bono, con las funciones de la calculadora y sobre una COPIA ─────────
    const { computeFullCalculatorResult } = await esm('features/landing/data/landingCalculation.js');
    const conCiega = (dem) => computeFullCalculatorResult(ec.inputsConDemandaCiega(inputs, { demanda: dem, superficie: d.sup }));
    const resCiega = conCiega(d.cal);
    const resPrudente = conCiega(d.cal * ec.COEF_PRUDENTE);
    const ahorroCiega = Number(resCiega?.savings?.savingsKwh) || 0;
    const ahorroCalc = Number(op.ahorro) || 0;

    // ── ¿Vale? La superficie la confirma una PERSONA, y el motor tiene que casar con ella ──
    const avisos = [];
    if (d.sup > AVISO_M2) avisos.push(`más de ${AVISO_M2} m²`);
    if (cuerposFuera) avisos.push(`quita ${cuerposFuera} cuerpo(s) que Catastro no da como vivienda`);
    if (croquis) avisos.push(`resta del croquis propuesto: ${croquis}`);
    // Foto del día: la pantalla lo vuelve a evaluar con la confirmación de ahora (`lecturaCiega`).
    const motivoNoValida = ec.motivoNoValida({ superficie: r1(d.sup) }, ec.superficieConfirmadaVigente(inputs));

    const estimacion = {
        version: ec.VERSION_CIEGA,
        demanda_ciega: r1(d.cal),
        superficie: r1(d.sup),
        coef: ec.COEF_PRUDENTE,
        demanda_prudente: r1(d.cal * ec.COEF_PRUDENTE),
        ahorro_kwh: Math.round(ahorroCiega),
        bono: Math.round(Number(resCiega?.financials?.caeBonus) || 0),
        bono_prudente: Math.round(Number(resPrudente?.financials?.caeBonus) || 0),
        // Lo que decía la calculadora ese día, para el contraste con el CEE real.
        ahorro_calculadora: Math.round(ahorroCalc),
        bono_calculadora: Math.round(Number(op.bono) || 0),
        ratio: ahorroCalc > 0 ? Math.round(ahorroCiega / ahorroCalc * 100) / 100 : null,
        // Demanda de calefacción TOTAL (kWh/año): la que se compara con el CEE real (`contraste`).
        q_ciega: Math.round(d.cal * d.sup),
        q_calculadora: Number(op.q_net) > 0 ? Math.round(Number(op.q_net)) : null,
        superficie_simulada: ec.superficieSimulada(inputs),
        rc, huella,
        huecos: envolvente.huecos.length,
        cuerpos_fuera: cuerposFuera,
        avisos: avisos.join(' · ') || null,
        valida: !motivoNoValida,
        motivo_no_valida: motivoNoValida,
        calificado_at: new Date().toISOString(),
        equipo: os.hostname(),
    };
    if (!escribir) return { ...salida, estimacion };
    await guardarEstimacion(op.id, estimacion);
    return { ...salida, estimacion, escrito: true };
}

/**
 * Escribe `datos_calculo.estimacion_ciega`. No hay RPC para una clave suelta de
 * `datos_calculo` (como `result` o el historial): se relee justo antes y se
 * escribe solo esa clave sobre lo leído (el mismo patrón que `cargarCeeOportunidad`).
 */
async function guardarEstimacion(oportunidadId, estimacion) {
    const { data, error } = await supabase.from('oportunidades')
        .select('datos_calculo').eq('id', oportunidadId).maybeSingle();
    if (error) throw new Error(error.message);
    const dc = data?.datos_calculo || {};
    const { error: eUp } = await supabase.from('oportunidades')
        .update({ datos_calculo: { ...dc, estimacion_ciega: estimacion } }).eq('id', oportunidadId);
    if (eUp) throw new Error(`No se ha podido guardar la estimación a ciegas: ${eUp.message}`);
}

/**
 * Las oportunidades de captación viva que piden su cifra a ciegas: elegibles y sin
 * ella, o con la huella cambiada. Lo usa el barrido del PC (`cee_ciego.js barrer`).
 */
//: Solo los campos de `inputs` que deciden si entra y su huella (regla 22).
const CAMPOS_HUELLA = ['rc', 'tipo', 'sector', 'isReforma', 'superficieCalefactable', 'superficie',
    'boilerId', 'fuelType', 'zona', 'anio'];

async function pendientes({ limite = 200 } = {}) {
    const sel = CAMPOS_HUELLA.map(k => `i_${k}:datos_calculo->inputs->>${k}`).join(', ');
    const { data, error } = await supabase.from('oportunidades')
        .select(`id, id_oportunidad, ficha, ref_catastral, estado:datos_calculo->>estado, ${sel}, `
            + 'i_construcciones_elegidas:datos_calculo->inputs->construcciones_elegidas, '
            + 'cee_origen:datos_calculo->inputs->cee_previo->>origen, '
            + 'cee_dem:datos_calculo->inputs->cee_previo->>superficie_habitable_m2, '
            + 'xml_sup:datos_calculo->inputs->xmlDemandData->>superficieHabitable, '
            + 'huella:datos_calculo->estimacion_ciega->>huella')
        .in('ficha', ['RES060', 'RES093'])
        .in('datos_calculo->>estado', ['LEAD', 'PTE ENVIAR', 'EN CURSO'])
        .order('updated_at', { ascending: false }).limit(limite);
    if (error) throw Object.assign(new Error(error.message), { status: 503 });
    const ec = await esm('features/calculator/logic/estimacionCiega.js');
    const out = [];
    for (const o of data || []) {
        const inputs = Object.fromEntries(CAMPOS_HUELLA.map(k => [k, o[`i_${k}`]]));
        inputs.construcciones_elegidas = o.i_construcciones_elegidas;
        // Que HAYA un CEE es lo que cuenta, no qué dice.
        if (o.cee_origen || o.cee_dem) inputs.cee_previo = true;
        if (o.xml_sup) inputs.xmlDemandData = true;
        if (ec.motivoNoElegible({ ficha: o.ficha, inputs, estado: o.estado, rc: o.ref_catastral })) continue;
        if (o.huella === ec.huellaCiega(inputs, o.ref_catastral)) continue;
        out.push({ id: o.id, id_oportunidad: o.id_oportunidad, rehacer: !!o.huella });
    }
    return out;
}

module.exports = { calcularCiega, pendientes, guardarEstimacion, demandaDelXml, senaladoACiegas, CARPETA_TRABAJO };
