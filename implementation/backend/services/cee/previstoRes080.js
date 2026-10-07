// ============================================================================
// previstoRes080.js — el CEE PREVISTO de un RES080 y su medida en el INICIAL.
//
// En un RES080 se hacen DOS certificados antes de la obra: el INICIAL (la casa
// como está) y el PREVISTO (la casa con TODA la obra hecha: la aerotermia, los
// aires, las ventanas, el aislamiento). El previsto se mete en el inicial como su
// medida de mejora —«Nuevo Edificio Definido por el Usuario»— y su XML se carga
// en la app como el del CEE FINAL, que es de donde sale el ahorro del RES080
// hasta que haya un final de verdad. Es como se venía haciendo a mano (medido
// sobre 19 RES080: Eladio, Laura Millán, Diego Rubio, Natalia Ramos…).
//
//   1. `pedirPrevisto`  → el motor COPIA el inicial y le cambia lo de la obra
//                         (`cee-engine/tools/previsto.py`, POST /cex/previsto).
//   2. CE3X lo califica (`cexAPdf.calificarCex`).
//   3. `cexAPdf.ponerPrevistoComoMedida` → el inicial con el previsto dentro, con
//      los textos de `textosDelPrevisto`, calculado, con su XML y su PDF.
//   4. `cargarComoFinal` → el XML del previsto en `cee.cee_final` / `xml_final`.
//
// REGLA — la medida del inicial ES el previsto: los equipos del previsto salen de
// las MISMAS medidas de la ficha (`ficha.medidas`, las de `medidasCe3x`) y el
// motor los escribe con la MISMA función que escribe una medida
// (`instalaciones_de_medida`). No pueden declarar dos obras distintas.
//
// REGLA — ventilación 0,53 ren/h y masa de las particiones «Ligera», siempre; una
// ventana nueva sin ficha, U marco 1,3 · U vidrio 1,3 · g 0,43 · 20 % de marco ·
// permeabilidad 3 (decisiones del usuario, 2026-10-06). La U de lo que se AÍSLA
// no se supone NUNCA: la dice una persona (la skill la pregunta).
//
// REGLA — el previsto NO es un certificado: no se registra ni se firma. Al
// cargarlo como CEE final NO se le ponen fechas de visita ni de firma (las que
// trae son las del inicial copiado) ni se toca el seguimiento.
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
const PARSER = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'features',
    'calculator', 'logic', 'xmlCeeParser.js');

//: Lo de una ventana nueva sin ficha (2026-10-06).
const VENTANA_DEFECTO = { u_marco: 1.3, u_vidrio: 1.3, g: 0.43, porc_marco: 20, permeabilidad: 3 };
const VENTILACION = 0.53;
const MASA = 'Ligera';
//: Vida útil de una medida que toca la envolvente (como en los RES080 del corpus).
const VIDA_UTIL_ENVOLVENTE = 30;

const ELEMENTO = { fachada: 'las fachadas', cubierta: 'la cubierta', suelo: 'el suelo', particion: 'las particiones' };
const dec = (n, d = 2) => String(Math.round(Number(n) * 10 ** d) / 10 ** d).replace('.', ',');
const unir = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/** Los equipos del previsto: los de las medidas de la ficha, sin las placas. */
function equiposDelPrevisto(ficha, previsto = {}) {
    const ids = Array.isArray(previsto.medidas) ? previsto.medidas : null;
    const medidas = (ficha?.medidas || []).filter((m, i) => !ids || ids.includes(m.id) || ids.includes(i));
    const equipos = [];
    for (const m of medidas) {
        for (const eq of m.instalaciones || []) {
            if (eq.slot === 'renovable' && !previsto.con_placas) continue;
            if (!equipos.some(e => e.nombre === eq.nombre && e.slot === eq.slot)) equipos.push(eq);
        }
    }
    return { medidas, equipos };
}

/** Las ventanas del plan (`ventanas`) en la forma del motor (`huecos`). */
function huecosDelPrevisto(previsto = {}) {
    return (previsto.ventanas || []).map((v) => ({
        que: v.que ?? 'cambia',
        u_marco: v.u_marco ?? VENTANA_DEFECTO.u_marco,
        u_vidrio: v.u_vidrio ?? VENTANA_DEFECTO.u_vidrio,
        g: v.g ?? VENTANA_DEFECTO.g,
        ...(v.porc_marco != null ? { porc_marco: v.porc_marco } : {}),
        permeabilidad: v.permeabilidad ?? VENTANA_DEFECTO.permeabilidad,
    }));
}

/** Lo que el motor recibe en `datos`: la ficha del inicial con los equipos de
 *  la medida y el bloque `previsto`. */
function datosParaMotor(ficha, previsto = {}) {
    const { equipos } = equiposDelPrevisto(ficha, previsto);
    for (const a of previsto.aislamiento || []) {
        if (a.u == null && (a.lambda == null || a.espesor == null)) {
            throw new Error('Aislamiento sin U: la U de lo que se aísla la dice una persona '
                + '(o lambda + espesor del aislante). No se supone.');
        }
    }
    return {
        ...ficha,
        medidas: [],
        instalaciones: equipos,
        previsto: {
            ventilacion: previsto.ventilacion ?? VENTILACION,
            masa_particiones: previsto.masa_particiones || MASA,
            huecos: huecosDelPrevisto(previsto),
            aislamiento: (previsto.aislamiento || []).map(a => ({
                que: a.que ?? 'cambia', elementos: a.elementos || [],
                modo: a.u != null ? 'u' : 'lambda',
                ...(a.u != null ? { u: a.u } : { lambda: a.lambda, espesor: a.espesor }),
            })),
        },
    };
}

/** El motor escribe el previsto copiando el inicial. */
async function pedirPrevisto(inicial, datos, { ms = 180_000 } = {}) {
    const fd = new FormData();
    fd.append('fichero', new Blob([inicial]), 'inicial.cex');
    fd.append('datos', JSON.stringify(datos));
    const r = await fetch(`${MOTOR}/cex/previsto`, { method: 'POST', body: fd, signal: AbortSignal.timeout(ms) });
    if (!r.ok) {
        const f = await r.json().catch(() => ({}));
        throw new Error(`El motor no ha escrito el previsto: ${f.detail || r.status}`);
    }
    return {
        buffer: Buffer.from(await r.arrayBuffer()),
        avisos: JSON.parse(r.headers.get('X-Cee-Avisos') || '[]'),
        hechos: JSON.parse(r.headers.get('X-Cee-Previsto') || '{"huecos":[],"cerramientos":[]}'),
    };
}

/**
 * Los textos de la medida «Nuevo edificio» del inicial: nombre, características,
 * otros datos, justificación, inversión y vida útil. Lo que diga el plan manda;
 * si no, se compone con los textos de las medidas de la ficha (los de la
 * aerotermia ya son los de siempre) y con lo que de verdad ha cambiado el motor
 * (`hechos`), que dice cuántas ventanas y qué cerramientos con su U.
 */
function textosDelPrevisto({ ficha, previsto = {}, hechos = {}, expediente = null }) {
    const { medidas } = equiposDelPrevisto(ficha, previsto);
    const partesNombre = [];
    const partesTexto = [];
    const justif = [];
    for (const m of medidas) {
        if (m.nombre) partesNombre.push(String(m.nombre));
        if (m.caracteristicas) partesTexto.push(String(m.caracteristicas).trim().replace(/\.$/, ''));
        if (m.justificacion) justif.push(String(m.justificacion).trim().replace(/\.$/, ''));
    }
    const huecos = hechos.huecos || [];
    if (huecos.length) {
        const v = (previsto.ventanas || [])[0] || {};
        const um = v.u_marco ?? VENTANA_DEFECTO.u_marco;
        const uv = v.u_vidrio ?? VENTANA_DEFECTO.u_vidrio;
        const g = v.g ?? VENTANA_DEFECTO.g;
        const pm = v.permeabilidad ?? VENTANA_DEFECTO.permeabilidad;
        //: Las puertas se llaman P1, P2… (`nombreHueco` de la vista).
        const np = huecos.filter(n => /^P\d/i.test(String(n))).length;
        const nv = huecos.length - np;
        const cuantos = unir([
            nv ? (nv === 1 ? 'una ventana' : `${nv} ventanas`) : null,
            np ? (np === 1 ? 'una puerta' : `${np} puertas`) : null,
        ].filter(Boolean));
        partesNombre.push(np && !nv ? 'SUSTITUCIÓN DE PUERTAS' : 'SUSTITUCIÓN DE VENTANAS');
        partesTexto.push(`sustitución de ${cuantos} por carpintería nueva`
            + `${v.descripcion ? ` (${v.descripcion})` : ''} con marco de U = ${dec(um)} W/m²K, `
            + `vidrio de U = ${dec(uv)} W/m²K y factor solar ${dec(g)}, y permeabilidad al aire de `
            + `${dec(pm, 1)} m³/h·m²`);
        justif.push('La sustitución de las ventanas reduce las pérdidas por transmisión y por infiltraciones');
    }
    const cer = hechos.cerramientos || [];
    if (cer.length) {
        const reglas = previsto.aislamiento || [];
        const nombres = [...new Set(reglas.flatMap(a => (a.elementos || []).map(e => ELEMENTO[e] || e)))];
        partesNombre.push(`AISLAMIENTO DE ${nombres.length ? unir(nombres.map(n => n.replace(/^(la|el|las|los) /, ''))).toUpperCase() : 'LA ENVOLVENTE'}`);
        for (const a of reglas) {
            const els = (a.elementos || []).map(e => ELEMENTO[e] || e);
            const u = a.u != null ? Number(a.u) : null;
            partesTexto.push(`aislamiento térmico de ${els.length ? unir(els) : 'la envolvente'}`
                + (a.descripcion ? ` con ${a.descripcion}`
                    : (a.lambda ? ` con aislante de conductividad ${dec(a.lambda, 3)} W/m·K y ${dec(a.espesor * 100, 1)} cm de espesor` : ''))
                + (u ? `, hasta una transmitancia de U = ${dec(u)} W/m²K` : ''));
        }
        justif.push('El aislamiento de la envolvente reduce la demanda de calefacción y refrigeración, y se ejecuta antes que el cambio del generador para dimensionarlo con la demanda ya reducida');
    }
    const inputs = expediente?.oportunidades?.datos_calculo?.inputs
        || expediente?.oportunidad?.datos_calculo?.inputs || {};
    const facturas = (expediente?.documentacion?.facturas || [])
        .reduce((s, f) => s + (Number(f?.importe_sin_iva) || 0), 0);
    const inversionDefecto = facturas
        || ((Number(inputs.presupuesto) || 0) + (Number(inputs.presupuestoEnvolvente) || 0))
        || medidas.reduce((s, m) => s + (Number(m.inversion) || 0), 0);
    const tocaEnvolvente = huecos.length > 0 || cer.length > 0;
    const vidas = medidas.map(m => Number(m.vida_util) || 0);
    return {
        nombre: previsto.nombre || partesNombre.join(' + ') || 'CEE PREVISTO',
        caracteristicas: previsto.caracteristicas
            || (partesTexto.length ? `Se propone como medida de mejora ${unir(partesTexto.map(conArticulo))}.` : ''),
        otros: previsto.otros || (medidas[0]?.otros_datos || ''),
        justificacion: previsto.justificacion || (justif.length ? `${justif.join('. ')}.` : ''),
        inversion: previsto.inversion ?? (inversionDefecto || null),
        vida_util: previsto.vida_util ?? (tocaEnvolvente ? VIDA_UTIL_ENVOLVENTE : (Math.max(0, ...vidas) || 15)),
        coste_mantenimiento: 0,
    };
}

/** «Sustitución de…» → «la sustitución de…»: las partes se encadenan en UNA
 *  frase, como las escriben los certificadores («Se propone como medida de
 *  mejora la sustitución de la caldera… y el aislamiento de…»). */
function conArticulo(t) {
    const s = String(t || '').trim();
    const m = s.charAt(0).toLowerCase() + s.slice(1);
    if (/^(la|el|las|los|una|un) /.test(m)) return m;
    if (/^(sustituci|instalaci|hibridaci|incorporaci|colocaci|renovaci|mejora)/.test(m)) return `la ${m}`;
    if (/^(aislamiento|cambio|trasdosado)/.test(m)) return `el ${m}`;
    return m;
}

/** El XML del previsto leído con el MISMO lector que la pantalla (`parseCeeXml`).
 *  Solo el v3.0 (CE3X 3.1): ese camino no usa el DOM, y aquí no hay navegador. */
async function leerXml(xmlTexto) {
    const { parseCeeXml } = await import(pathToFileURL(PARSER).href);
    const { esXmlCeeV30 } = await import(pathToFileURL(path.join(path.dirname(PARSER), 'xmlCeeV30.js')).href);
    if (!esXmlCeeV30(xmlTexto)) throw new Error('el XML del previsto no es de CE3X 3.1 (esquema v3.0)');
    const habia = globalThis.DOMParser;
    // Solo para la comprobación de «XML roto» que hace antes de leer el v3.0.
    if (!habia) globalThis.DOMParser = class { parseFromString() { return { querySelector: () => null }; } };
    try { return parseCeeXml(xmlTexto); } finally { if (!habia) delete globalThis.DOMParser; }
}

/**
 * El XML del previsto en la app como el del CEE FINAL: `cee.cee_final` (lo que
 * lee el cálculo del ahorro RES080) y `cee.xml_final`, más los combustibles —
 * lo mismo que «Cargar CEE» con el `.xml`, salvo las FECHAS: el previsto no se
 * visita ni se firma. Por la RPC de siempre (`setCeeField`), clave a clave.
 */
async function cargarComoFinal(ctx, xmlTexto, nombre) {
    const cex = require('../ceeEnvolventeCex');
    const parsed = await leerXml(xmlTexto);
    parsed._fileName = nombre;
    parsed._previsto = true;
    await cex.setCeeField(ctx.expediente, 'cee_final', parsed);
    await cex.setCeeField(ctx.expediente, 'xml_final', xmlTexto);
    if (parsed.combustibleACS) await cex.setCeeField(ctx.expediente, 'comb_acs_final', parsed.combustibleACS);
    if (parsed.combustibleCalefaccion) await cex.setCeeField(ctx.expediente, 'comb_cal_final', parsed.combustibleCalefaccion);
    return parsed;
}

/** `{nº} - CEE PREVISTO_REVISAR.cex`: el `_REVISAR` lo aparta de la rejilla
 *  (`matchSlot`), igual que al borrador del inicial. */
function nombrePrevisto(expediente) {
    return `${expediente?.numero_expediente || 'EXPEDIENTE'} - CEE PREVISTO_REVISAR.cex`;
}

/**
 * El previsto en `1. CEE / CEE INICIAL`, junto al inicial (es donde lo dejaban
 * los RES080 hechos a mano). Lo que hubiera con ese nombre va a OLD: nunca se
 * borra el trabajo de nadie.
 */
async function guardarPrevisto(ctx, buffer) {
    const cex = require('../ceeEnvolventeCex');
    const driveService = require('../driveService');
    if (!ctx.driveFolderId && !cex.esCeeDirecto(ctx.expediente)) {
        return { ok: false, error: 'el expediente no tiene carpeta de Drive' };
    }
    try {
        const { id: carpeta, link } = await cex.carpetaFase(ctx, 'inicial');
        if (!carpeta) throw new Error('no se ha podido resolver la carpeta del CEE inicial');
        const nombre = nombrePrevisto(ctx.expediente);
        const previo = await driveService.findFileByName(carpeta, nombre);
        let archivado = null;
        if (previo) archivado = await driveService.archiveExistingToOld(carpeta, previo, nombre);
        const g = await driveService.saveFileToFolder(carpeta, nombre, 'application/octet-stream',
            buffer, { throwOnError: true });
        if (!g?.id) throw new Error('Drive no ha devuelto el fichero');
        return { ok: true, nombre, link: g.link, driveId: g.id, archivado,
                 carpeta_link: link || `https://drive.google.com/drive/folders/${carpeta}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = {
    VENTANA_DEFECTO, VENTILACION, MASA,
    equiposDelPrevisto, datosParaMotor, pedirPrevisto, textosDelPrevisto, leerXml, cargarComoFinal,
    nombrePrevisto, guardarPrevisto,
};
