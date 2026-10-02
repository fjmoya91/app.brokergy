// ============================================================================
// ceeFinalDesdeMedida.js — el CEE FINAL a partir de la MEDIDA DE MEJORA del
// CEE inicial que ENTREGÓ el técnico.
//
// Es como se hace a mano: se abre el inicial del certificador —el que ya pasó
// la revisión, con su medida calculada por CE3X— y su «edificio mejorado» pasa
// a ser el certificado final. La envolvente, los datos, el técnico y las
// imágenes son los suyos, byte a byte. Lo monta el motor
// (`cee-engine/tools/cee_final.py`, ruta `/cex/final-desde-medida`); aquí se
// busca el fichero, se decide qué medida lleva el final y se guarda en Drive con
// la MISMA función que el botón de la envolvente (`guardarEnDrive`), así que
// sale como `{nº} - CEE FINAL_REVISAR.cex` en «1. CEE / CEE FINAL».
//
// REGLA — la instalación del final NO se recompone desde el expediente: es la
// de la medida del técnico, tal cual (ver la cabecera de `cee_final.py`). Eso es
// lo que distingue este camino del `.cex` final de la envolvente, que copia el
// borrador de la app y recompone la aerotermia desde la ficha.
// ⚠️ SALVO LA MÁQUINA: si el técnico declaró en su medida otro modelo u otro
// SCOP del que consta en el expediente, se escribe el del EXPEDIENTE
// (`equiposDelExpediente` → `corregir_equipos` del motor). Los porcentajes, las
// superficies y el slot siguen siendo los suyos.
//
// REGLA — la medida del FINAL se ELIGE de un catálogo, como en la envolvente:
//   · 'retirada'    → HIBRIDACIÓN: se retira el generador que quedó en apoyo y
//                     la bomba asume el 100 %. Solo existe si el fichero tiene
//                     un generador en apoyo; es la de por defecto cuando existe.
//   · 'autoconsumo' → la que la app propone siempre para un CEE final
//                     (`medidasCe3x`, importada): no si ya hay placas.
//
// REGLA — de momento solo RES060 y RES093. En un RES080 la medida del inicial
// toca la envolvente y el final tiene que llevar esa obra: es la fase 2 (el
// motor, además, se niega si la medida cambia la envolvente).
//
// Lo que NO puede hacer es CALCULAR: el `.xml` y el `.pdf` los genera CE3X al
// calificar. Por eso el fichero lleva `_REVISAR` (la rejilla no lo toma por la
// entrega del técnico) y se devuelve lo que CE3X DEBE dar al calificarlo —la
// foto del edificio mejorado que guardó al calcular la medida del inicial—
// para contrastarlo.
// ============================================================================

const cex = require('../ceeEnvolventeCex');
const revisionCex = require('./revisionCex');
const { fichaFromNumero } = require('../../utils/fichas');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';
const ESPERA_MS = Number(process.env.CEE_FINAL_ESPERA_MS || 90000);

//: Las fichas en las que el final sale solo. RES080 es la fase 2.
const FICHAS_CEE_FINAL = ['RES060', 'RES093'];

function error(status, mensaje) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

async function alMotor(bytes, datos) {
    const fd = new FormData();
    fd.append('fichero', new Blob([bytes]), 'inicial.cex');
    fd.append('datos', JSON.stringify(datos));
    let r;
    try {
        r = await fetch(`${MOTOR}/cex/final-desde-medida`, {
            method: 'POST', body: fd, signal: AbortSignal.timeout(ESPERA_MS),
        });
    } catch (e) {
        throw error(503, e.name === 'TimeoutError'
            ? 'El motor de CE3X ha tardado demasiado en montar el CEE final.'
            : 'El motor de CE3X no responde. ¿Está levantado el contenedor cee-engine?');
    }
    if (!r.ok) {
        const f = await r.json().catch(() => ({}));
        throw error(r.status === 422 ? 422 : 502, f.detail || 'No se ha podido montar el CEE final.');
    }
    return r;
}

/**
 * Las medidas que se pueden poner en el final, con cuál va marcada por defecto.
 */
async function catalogoFinal(ctx, analisis, params = {}) {
    const ret = analisis?.retirada || {};
    //: La justificación de la «Propuesta de secuencia temporal» (CE3X 3.1): el
    //: borrador de la retirada lo compone el motor y no la trae.
    const { justificacionMedida } = await cex.loadFichaCe3x();
    const catalogo = [{
        id: 'retirada',
        titulo: 'Retirar el generador en apoyo (bomba de calor al 100 %)',
        disponible: !!ret.posible,
        motivo: ret.posible ? null : ret.motivo,
        porDefecto: !!ret.posible,
        datos: ret.borrador ? { ...ret.borrador, ...justificacionMedida('retirada') } : null,
        //: Cómo queda la instalación de la medida, para enseñarla.
        equipos: ret.equipos || null,
    }];

    //: El autoconsumo es la medida que la app propone siempre a un CEE final:
    //: se importa de `medidasCe3x`, no se recompone aquí.
    try {
        const { medidasCe3x } = await cex.loadFichaCe3x();
        const trabajo = await cex.leerTrabajo(ctx.expediente.id).catch(() => null);
        //: En la 3.1 el autoconsumo va como «Generación renovable eléctrica»,
        //: MES A MES: los meses salen de PVGIS (lo guardado en la barra ⚡, o se
        //: pregunta aquí; cacheado 30 días por sitio).
        const pv = (analisis?.version_final || '3.1') === '3.1'
            ? await cex.pvgisParaAutoconsumo(ctx, trabajo?.ajustes) : {};
        const { catalogo: cat } = medidasCe3x({
            expediente: ctx.expediente, superficie: null, fase: 'final',
            modelos: ctx.modelos, textos: trabajo?.ajustes?.medidas_texto,
            autoconsumoKwh: trabajo?.ajustes?.autoconsumo_kwh,
            autoconsumoFv: pv.especifica || null,
        });
        const auto = (cat || []).find((m) => m.id === 'autoconsumo');
        if (auto) {
            //: El CEE del técnico ya declara placas (contribuciones energéticas):
            //: proponerlas como mejora describiría otra vivienda.
            const yaPlacas = !!analisis?.tiene_renovable;
            const disponible = auto.disponible && !yaPlacas;
            catalogo.push({
                id: 'autoconsumo',
                titulo: auto.titulo,
                disponible,
                motivo: yaPlacas
                    ? 'El CEE del técnico ya declara placas solares existentes: el autoconsumo no es una mejora que proponer.'
                    : auto.motivo,
                porDefecto: disponible && !ret.posible,
                datos: disponible ? auto.datos : null,
                nota: auto.nota || null,
            });
        }
    } catch (e) {
        console.warn('[cee-final] no se ha podido componer el autoconsumo:', e.message);
    }

    //: Las de ENVOLVENTE: aislar la cubierta o la fachada. Van con su solución
    //: constructiva y su espesor (se cambian en el popup, `params`), y el texto
    //: sale de ellos — fuente única con la pantalla (`medidasAislamiento.js`).
    //: Se proponen solas cuando no queda otra que proponer: en una vivienda con
    //: placas el autoconsumo no cabe, y un certificado sin medida no se emite.
    const { medidaAislamiento } = await cex.loadMedidasAislamiento();
    const autoDisponible = catalogo.some((m) => m.id === 'autoconsumo' && m.disponible);
    for (const elemento of ['cubierta', 'fachada']) {
        const id = `aislamiento_${elemento}`;
        const p = params?.[id] || {};
        const m = medidaAislamiento({
            elemento, solucion: p.solucion, espesorCm: p.espesor_cm, lambda: p.lambda,
            cerramientos: analisis?.cerramientos || [],
        });
        catalogo.push({
            ...m,
            porDefecto: elemento === 'cubierta' && m.disponible && !autoDisponible,
        });
    }
    return catalogo;
}

/**
 * El CEE final de un expediente. Sin `escribir`, solo el ANÁLISIS: qué medida
 * del inicial se usa, qué equipos lleva el final, qué debe dar al calificarlo y
 * qué medida se le puede poner. Con `escribir`, además lo deja en Drive.
 *
 * @param {object} ctx  el de `ceeEnvolventeCex.cargarExpediente`
 * @param {object} op
 * @param {boolean} [op.escribir]
 * @param {string}  [op.fechaEmision]  'AAAA-MM-DD' — sin ella, en blanco y se dice
 * @param {string}  [op.fechaVisita]
 * @param {string[]|null} [op.medidas] ids del catálogo; null = las de por defecto
 * @param {object}  [op.textos] { [id]: {nombre, caracteristicas, otros_datos} }
 * @param {object}  [op.params] { aislamiento_cubierta: {solucion, espesor_cm, lambda}, … }
 * @param {boolean} [op.guardarDrive] false = se monta el fichero pero NO se sube
 *        (el script lo usa para probar en seco con el fichero en la mano)
 * @param {string}  [op.version] '2.3' | '3.1' — la versión de CE3X del final. Sin
 *        decirla, la 3.1 (la vigente): el inicial del técnico puede estar hecho con
 *        la 2.3 y el final salir ya con la 3.1 — el motor lo convierte al copiarlo.
 */
async function prepararFinal(ctx, { escribir = false, fechaEmision = null, fechaVisita = null,
                                     medidas = null, textos = {}, params = {}, guardarDrive = true,
                                     version = null } = {}) {
    const exp = ctx?.expediente;
    if (!exp) throw error(404, 'Expediente no encontrado');
    if (cex.esCeeDirecto(exp) || cex.esOportunidad(exp)) {
        throw error(422, 'El CEE final desde la medida del inicial es de los expedientes CAE.');
    }
    const ficha = fichaFromNumero(exp.numero_expediente) || 'RES060';
    if (!FICHAS_CEE_FINAL.includes(ficha)) {
        throw error(422, `De momento el CEE final se genera solo en ${FICHAS_CEE_FINAL.join(' y ')}`
            + ` (este expediente es ${ficha}). En un RES080 la medida toca la envolvente: es la segunda fase.`);
    }
    if (exp.seguimiento?.cee_final === 'REGISTRADO') {
        throw error(409, 'El CEE final de este expediente ya está REGISTRADO: no se vuelve a generar.');
    }

    const entregado = await revisionCex.cexEntregado(ctx, 'inicial');
    if (!entregado) {
        throw error(409, 'No hay ningún .cex del técnico en «1. CEE / CEE INICIAL»: el final sale de '
            + 'la medida de mejora de ese fichero (el borrador «_REVISAR» de la app no vale: no está calculado).');
    }

    //: La máquina instalada la dice el EXPEDIENTE (decisión del usuario,
    //: 2026-09-30): si el técnico tecleó otra en su medida, el motor la corrige.
    const { equiposDelExpediente } = await cex.loadFichaCe3x();
    const equiposExpediente = equiposDelExpediente(exp, { modelos: ctx.modelos });

    //: La versión de CE3X del final. Lo que no es una de las dos no se manda: el
    //: motor rechazaría el fichero entero por una versión inventada.
    const versionCe3x = ['2.3', '3.1'].includes(String(version || '')) ? String(version) : null;
    const conVersion = versionCe3x ? { version_ce3x: versionCe3x } : {};

    const r1 = await alMotor(entregado.bytes, { solo_analizar: true, equipos_expediente: equiposExpediente,
                                                ...conVersion });
    const { analisis, avisos: avisosAnalisis = [] } = await r1.json();
    const catalogo = await catalogoFinal(ctx, analisis, params);

    const marcadas = Array.isArray(medidas)
        ? medidas.filter((id) => catalogo.some((m) => m.id === id))
        : catalogo.filter((m) => m.porDefecto).map((m) => m.id);

    const avisos = [...avisosAnalisis];
    if (entregado.varios) {
        avisos.push(`Hay varios .cex del técnico en CEE INICIAL: se usa el más reciente («${entregado.nombre}»).`);
    }
    //: Un final ya ENTREGADO por el técnico no se pisa (el nuestro lleva
    //: `_REVISAR`), pero generar otro encima confunde: se dice.
    const finalEntregado = await revisionCex.cexEntregado(ctx, 'final').catch(() => null);
    if (finalEntregado) {
        avisos.push(`El técnico YA ha entregado un CEE final («${finalEntregado.nombre}»): este no lo sustituye, `
            + 'se guarda aparte como _REVISAR.');
    }

    const base = {
        ficha,
        base: entregado.nombre,
        analisis,
        catalogo,
        marcadas,
        final_entregado: finalEntregado?.nombre || null,
        nombre: cex.nombreDelCex(exp, 'final'),
        carpeta: cex.faseDe('final').carpeta,
    };
    if (!escribir) return { ...base, avisos };

    // ── Escribirlo ───────────────────────────────────────────────────────────
    for (const id of marcadas) {
        const m = catalogo.find((x) => x.id === id);
        if (!m?.disponible) throw error(422, `La medida «${m?.titulo || id}» no se puede poner: ${m?.motivo || 'no está disponible'}`);
    }
    const conTexto = (m) => {
        const t = textos?.[m.id] || {};
        const datos = { ...m.datos };
        for (const k of ['nombre', 'caracteristicas', 'otros_datos']) {
            if (typeof t[k] === 'string' && (t[k].trim() || k === 'otros_datos')) datos[k] = t[k].trim();
        }
        return datos;
    };
    const retirada = catalogo.find((m) => m.id === 'retirada');
    const otras = catalogo.filter((m) => m.id !== 'retirada' && marcadas.includes(m.id));

    // La casilla «Recomendaciones para un uso eficiente» (solo CE3X 3.1). El
    // motor la pone SOLO si la del técnico está vacía: si escribió las suyas,
    // mandan las suyas. Aquí solo hay RES060/RES093: residencial.
    const { recomendacionesUso } = await cex.loadFichaCe3x();
    const r2 = await alMotor(entregado.bytes, {
        ...conVersion,
        equipos_expediente: equiposExpediente,
        retirar_previo: marcadas.includes('retirada'),
        retirada: marcadas.includes('retirada') ? conTexto(retirada) : null,
        medidas: otras.map(conTexto),
        informe: {
            fecha_emision: fechaEmision || null,
            fecha_visita: fechaVisita || null,
            recomendaciones: recomendacionesUso({ terciario: false }),
        },
    });
    const fichero = Buffer.from(await r2.arrayBuffer());
    let avisosMotor = [];
    try { avisosMotor = JSON.parse(r2.headers.get('X-Cee-Avisos') || '[]'); } catch { /* noop */ }

    const guardado = guardarDrive ? await cex.guardarEnDrive(ctx, fichero, 'final') : { ok: true, enSeco: true };
    if (!guardado.ok) throw error(502, `El CEE final se ha montado pero no se ha podido guardar en Drive: ${guardado.error}`);

    return {
        ...base,
        escrito: true,
        guardado,
        //: Con qué versión de CE3X ha salido: la dice el motor (es quien escribe
        //: la cabecera).
        version_ce3x: r2.headers.get('X-Cee-Version') || versionCe3x || null,
        bytes: fichero.length,
        fichero,
        medidas_final: [...(marcadas.includes('retirada') ? [conTexto(retirada).nombre] : []),
                        ...otras.map((m) => conTexto(m).nombre)],
        avisos: [...new Set([...avisos, ...avisosMotor])],
    };
}

module.exports = { prepararFinal, FICHAS_CEE_FINAL };
