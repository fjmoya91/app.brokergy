// ============================================================================
// xmlCeeV30.js (CommonJS) — el .xml del CEE en el esquema v3.0 (CE3X 3.1), lado
// backend.
//
// ⚠️ ESPEJO de la fuente ESM:
//     frontend/src/features/calculator/logic/xmlCeeV30.js
// Ahí está explicado QUÉ se lee y POR QUÉ (lo medido, lo que el v3.0 ya no dice
// y lo que trae de más). Este fichero existe porque `radiografiaCee` y
// `cifoService` lo necesitan SÍNCRONO, y desde CommonJS no se hace `require()`
// de un módulo ESM.
//
// REGLA — el cuerpo es el MISMO, carácter a carácter, desde la línea
// «¿Qué versión es?» hasta el final (sin los `export`).
// backend/scripts/test_xml_cee_v30.mjs lo comprueba y compara además lo que
// devuelven los dos. Si cambia la lectura, se cambia ALLÍ y se copia aquí.
// ============================================================================

// ─── ¿Qué versión es? ────────────────────────────────────────────────────────

/**
 * La versión que declara el propio fichero (`<DatosEnergeticosDelEdificio
 * version="3.0">`), o la que se deduce de su estructura si no la declara.
 * null si no parece un .xml de certificado.
 */
function versionXmlCee(texto) {
    if (!texto || typeof texto !== 'string') return null;
    const raiz = /<DatosEnergeticosDelEdificio\b([^>]*)>/i.exec(texto);
    if (raiz) {
        const v = /\bversion\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)/i.exec(raiz[1]);
        if (v) return v[1];
    }
    if (/<DatosEdificio[\s>]/i.test(texto) && /<Indicadores[\s>]/i.test(texto)) return '3.0';
    if (/<IdentificacionEdificio[\s>]/i.test(texto) || /<DatosDelCertificador[\s>]/i.test(texto)) return '2.0';
    return null;
}

/** ¿Es un .xml del esquema v3.0 (o posterior)? */
function esXmlCeeV30(texto) {
    const v = versionXmlCee(texto);
    return v !== null && parseFloat(v) >= 3;
}

// ─── Lectura del texto ───────────────────────────────────────────────────────
//
// Sin DOM porque esto también lo ejecuta el backend, donde `DOMParser` no
// existe. Se recorre el texto acotando SIEMPRE por el bloque padre: en el v3.0
// muchos nombres se repiten en sitios distintos (<Opaco> es el cerramiento en
// <Opacos> y la referencia a él dentro de cada <Hueco>; <Demanda>, <Calificacion>
// e <Indicadores> salen otra vez dentro de cada medida de mejora; <Marco> es una
// referencia dentro de <ConsHueco> y la definición dentro de <Construcciones>…).

const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * La apertura de `<tag>`, sin confundirla con una etiqueta VACÍA (`<tag/>`, que
 * CE3X 3.1 escribe para <EsFicticio/>, <Geometria/>, <ElementosInalterables/>…)
 * ni con otra que empiece igual (<Opaco> no es <Opacos>, <Generador> no es
 * <GeneradorElectrico>, <DatosCertificado> no es <DatosCertificador>).
 */
const abre = (tag) => `<${esc(tag)}(?:\\s+(?:[^>]*[^/>])?)?>`;

/** El contenido de todos los `<tag>…</tag>` de `xml`, en orden. */
function todos(xml, tag) {
    if (!xml) return [];
    const re = new RegExp(`${abre(tag)}([\\s\\S]*?)</${esc(tag)}\\s*>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
}

/** El contenido del primer `<tag>…</tag>` de `xml`, o null. */
function uno(xml, tag) {
    if (!xml) return null;
    const m = new RegExp(`${abre(tag)}([\\s\\S]*?)</${esc(tag)}\\s*>`, 'i').exec(xml);
    return m ? m[1] : null;
}

/** `xml` sin ninguno de sus `<tag>…</tag>` (ni sus `<tag/>`). */
function quita(xml, tag) {
    if (!xml) return '';
    return xml
        .replace(new RegExp(`${abre(tag)}[\\s\\S]*?</${esc(tag)}\\s*>`, 'gi'), '')
        .replace(new RegExp(`<${esc(tag)}\\s*/>`, 'gi'), '');
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function desescapa(s) {
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
        if (e[0] === '#') {
            const n = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(n) && n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : m;
        }
        const c = ENTIDADES[e.toLowerCase()];
        return c === undefined ? m : c;
    });
}

/** El texto de `<tag>` dentro de `xml`, desescapado. Vacío o ausente → null. */
function texto(xml, tag) {
    const b = uno(xml, tag);
    if (b === null) return null;
    const s = desescapa(b).trim();
    return s === '' ? null : s;
}

/**
 * El número de `<tag>`. Mismo convenio que los lectores del v2.0: **99999999.99**
 * es «no consta» en CE3X, no un valor.
 */
function numero(xml, tag) {
    const s = texto(xml, tag);
    if (s === null) return null;
    const v = Number(s.replace(',', '.'));
    return Number.isFinite(v) && v < 99999999 ? v : null;
}

const minus = (s) => String(s ?? '').trim().toLowerCase();
const redondea2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/**
 * El texto listo para recorrer:
 *  · fuera las IMÁGENES (<Imagen>, <Plano>): cientos de KB de base64 que no lee
 *    nadie y que harían más lenta cada búsqueda;
 *  · fuera los comentarios;
 *  · cada CDATA pasa a texto ESCAPADO. Dentro viene HTML («data:text/html,<h1>…»)
 *    que, leído a pelo, se confundiría con etiquetas del propio certificado.
 */
function prepara(xml) {
    let t = String(xml || '').replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
    t = quita(quita(t, 'Imagen'), 'Plano');
    return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        (_, c) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

// ─── Traducciones al idioma del v2.0 ─────────────────────────────────────────

/**
 * El rumbo del v3.0 → la palabra que escribía el v2.0. Contado sobre los 462
 * certificados del corpus: Norte, Sur, Este, Oeste con todas sus letras y los
 * intermedios abreviados en castellano (NE, NO, SE, SO).
 */
const RUMBO_V20 = {
    n: 'Norte', s: 'Sur', e: 'Este', w: 'Oeste',
    ne: 'NE', nw: 'NO', se: 'SE', sw: 'SO',
    h: 'Horizontal',
};

/**
 * La orientación de un OPACO tal como la escribía el v2.0, que en los que no
 * son fachada no ponía el rumbo sino lo que son. Medido en los 462 del corpus:
 * cubierta 533/533 y partición horizontal 283/283 → «Horizontal», partición
 * vertical 496/496 → «Vertical», suelo 412/412 → «Suelo», adiabático 542/542 →
 * vacío. El v3.0 da a todos ellos «H» (o un rumbo, en la partición vertical).
 * El tipo «Terreno» no existía en el v2.0: se deja con su rumbo.
 */
function orientacionOpacoV20(tipo, codigo) {
    switch (minus(tipo)) {
        case 'cubierta':
        case 'particioninteriorhorizontal': return 'Horizontal';
        case 'particioninteriorvertical': return 'Vertical';
        case 'suelo': return 'Suelo';
        case 'adiabatico': return '';
        default: {
            const c = minus(codigo);
            return RUMBO_V20[c] ?? (codigo ? String(codigo).trim() : '');
        }
    }
}

/** La orientación de un HUECO o lucernario: el rumbo en palabras (H → Horizontal). */
function orientacionHuecoV20(codigo) {
    const c = minus(codigo);
    return RUMBO_V20[c] ?? (codigo ? String(codigo).trim() : '');
}

/**
 * El <TipoDeEdificio> del v2.0 a partir de <Escala> + <Alcance> del v3.0. Los
 * nombres son LOS DEL ESQUEMA v2.0 (leídos del XSD que trae CE3X 2.3:
 * ViviendaUnifamiliar | BloqueDeViviendaCompleto | ViviendaIndividualEnBloque |
 * EdificioUsoTerciario | LocalUsoTerciario), que es lo que reconocen
 * `clasificarTipoEdificio`, `usoEdificio` y `tipoViviendaDeCee`.
 *
 * Una escala o un alcance que no se reconozca devuelve null — «no consta» —, que
 * NO es lo mismo que «es una vivienda».
 */
function tipoEdificioV20(escala, alcance) {
    const e = minus(escala).replace(/[^a-z]/g, '');
    const a = minus(alcance);
    if (!e) return null;
    if (e === 'viviendaunifamiliar') return 'ViviendaUnifamiliar';
    if (e === 'viviendabloque') {
        if (a === 'completo') return 'BloqueDeViviendaCompleto';
        if (a === 'parte') return 'ViviendaIndividualEnBloque';
        return null;
    }
    if (e === 'terciario') {
        if (a === 'completo') return 'EdificioUsoTerciario';
        if (a === 'parte') return 'LocalUsoTerciario';
        return null;
    }
    return null;
}

/**
 * El vector energético del v3.0 → la etiqueta del v2.0, que es la que entienden
 * los mapas de la app (`mapVectorEnergetico`, FACTORES_PASO, VECTOR_A_COMBUSTIBLE).
 * Son los OCHO vectores de <EnergiaFinalVectores> del v2.0 (los 462 del corpus
 * listan exactamente esos ocho).
 *
 * ⚠️ El v3.0 NO distingue la electricidad peninsular de la insular: ELECTRICIDAD.
 * Se lleva a la peninsular, que es como la app trata ya las cuatro del v2.0.
 *
 * MEDIOAMBIENTE (la energía del ambiente que capta una bomba de calor o un
 * captador) no es un combustible ni tenía vector en el v2.0, y RED1/RED2 (redes
 * de distrito) tampoco existían: no están aquí y se quedan con su nombre.
 */
const VECTOR_V30_A_V20 = {
    ELECTRICIDAD: 'ElectricidadPeninsular',
    GASNATURAL: 'GasNatural',
    GASOLEO: 'GasoleoC',
    GLP: 'GLP',
    CARBON: 'Carbon',
    BIOMASADENSIFICADA: 'BiomasaPellet',
    BIOMASA: 'BiomasaOtros',
    BIOCARBURANTE: 'Biocarburante',
};

/** Un vector del v3.0 normalizado a su clave (sin espacios y en mayúsculas). */
const claveVectorV30 = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** El vector del v3.0 con su nombre del v2.0 (o el suyo, si no lo tenía). null si no hay. */
function vectorV20(v) {
    const k = claveVectorV30(v);
    if (!k) return null;
    return VECTOR_V30_A_V20[k] || String(v).trim();
}

/** ¿Es la energía del AMBIENTE (no un combustible)? */
const esVectorAmbiente = (v) => claveVectorV30(v) === 'MEDIOAMBIENTE';

/**
 * La <NormativaEdificacion> del v3.0 → la <NormativaVigente> del v2.0. El v2.0
 * solo tenía cuatro valores y son los que escribía CE3X 2.3 (contados en los
 * 462: NBE-CT-79 230 · Anterior 161 · C.T.E. 58 · CTE 2013 13). En el par de
 * 26RES093_9, ANTE_NBE_CT_79 es «Anterior». Lo posterior (CTE_DB_HE_2019…) no
 * tenía casilla en el v2.0 y se devuelve tal cual.
 */
function normativaV20(n) {
    const k = String(n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const mapa = {
        ANTENBECT79: 'Anterior',
        NBECT79: 'NBE-CT-79',
        CTEDBHE2006: 'C.T.E.',
        CTEDBHE2013: 'CTE 2013',
    };
    return mapa[k] || (n ? String(n).trim() : null);
}

/**
 * La referencia catastral como la escribía el v2.0: una cadena, y si hay varias,
 * separadas por «, ».
 *
 * Régimen común (DGC): parcela (14) + inmueble (6) = la referencia de 20. En
 * Navarra (RRTN) el <Inmueble> YA es la referencia completa (20 posiciones,
 * según el propio esquema). En los registros forales vascos se concatena tal
 * cual, sin poder comprobarlo: la app no trabaja hoy con ninguno.
 */
function refCatastralV30(registro, refs) {
    const reg = String(registro ?? '').toUpperCase().trim();
    const una = (r) => {
        const p = (r.parcela || '').trim(), i = (r.inmueble || '').trim();
        if (reg === 'RRTN') return i || p || null;
        return (p + i) || null;
    };
    const lista = [...new Set((refs || []).map(una).filter(Boolean))];
    return lista.length ? lista.join(', ') : null;
}

/** «d/m/aaaa» o «dd/mm/aaaa» (el v3.0 admite las dos) → «aaaa-mm-dd», o null. */
function fechaV30AIso(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/**
 * La demanda TOTAL (kWh/m²·año) como la daba el v2.0 en <Demanda><EdificioObjeto>
 * <Global>: calefacción + ACS + refrigeración (462 de 462 en el corpus). El v3.0
 * no la escribe. Sin alguna de las tres, null: no se suma a medias.
 */
function sumaDemanda(d) {
    if (!d || d.cal === null || d.acs === null || d.ref === null) return null;
    return redondea2(d.cal + d.acs + d.ref);
}

/** Un texto «data:text/html,…» (descripciones, observaciones) en texto llano. */
function textoDeHtml(s) {
    if (s === null || s === undefined) return null;
    const t = desescapa(String(s).replace(/^\s*data:text\/html\s*,/i, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
        .replace(/<[^>]+>/g, ''))
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
    return t === '' ? null : t;
}

/** Los valores por servicio de un bloque de indicadores (<Cal>, <Ref>, <Acs>, <Ilu>, <Ven>, <Tot>). */
function porServicio(b) {
    return {
        cal: numero(b, 'Cal'), ref: numero(b, 'Ref'), acs: numero(b, 'Acs'),
        ilu: numero(b, 'Ilu'), ven: numero(b, 'Ven'), tot: numero(b, 'Tot'),
    };
}

/** Los límites de una escala (<A>…<F>, y <G> si viniera) → { A: n, … } o null. */
function escala(b) {
    if (!b) return null;
    const out = {};
    for (const letra of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
        const v = numero(b, letra);
        if (v !== null) out[letra] = v;
    }
    return Object.keys(out).length ? out : null;
}

/** Una letra de calificación A-G, o null. */
function letra(s) {
    const t = String(s ?? '').trim().toUpperCase();
    return /^[A-G]$/.test(t) ? t : null;
}

/** La lista de <PorDefecto> («Transmitancia Fshobst») en minúsculas. */
const listaPorDefecto = (s) => String(s ?? '').toLowerCase().split(/\s+/).filter(Boolean);

/**
 * El FACTOR SOLAR MODIFICADO del hueco, que es lo que el v2.0 llamaba
 * <FactorSolar>: F = (1 − FM)·g⊥ + FM·0,04·Um·α (CTE DB-HE).
 *
 * g⊥ es el del vidrio a incidencia normal (<Vidrio><FactorSolarNormal>; si no
 * está, el de <ConsHueco><FactorSolar>). Comprobado en los 10 huecos de
 * 26RES093_9: el v2.0 decía 0,61 (marco 20 %) y 0,13 (puerta, marco 90 %), y la
 * fórmula con g 0,75, Um 2,2 y α 0,75 da 0,6132 y 0,1344.
 *
 * ⚠️ No incluye protecciones solares (el factor de sombra se toma 1): en el
 * caso medido no las había. Sin todas las piezas → null, no un número a medias.
 */
function factorSolarModificado(cons, marco, vidrio) {
    if (!cons) return null;
    const ff = cons.ff;
    const g = vidrio && vidrio.factorSolarNormal !== null ? vidrio.factorSolarNormal : cons.factorSolar;
    if (ff === null || g === null || !marco || marco.transmitancia === null || marco.absortividad === null) return null;
    return redondea2((1 - ff) * g + ff * 0.04 * marco.transmitancia * marco.absortividad);
}

// ─── La lectura ──────────────────────────────────────────────────────────────

/**
 * Todo lo que la app lee de un certificado v3.0, ya traducido al idioma del
 * v2.0 donde había el mismo dato. Nunca lanza: lo que no está sale null o vacío.
 */
function leerXmlCeeV30(xmlString) {
    const t = prepara(xmlString);
    const raiz = uno(t, 'DatosEnergeticosDelEdificio') ?? t;

    // Las medidas de mejora traen sus PROPIOS <Indicadores> y <Calificacion>, y
    // <DatosPersonalizados> es contenido LIBRE (cualquier etiqueta): lo del
    // edificio se lee de lo que queda fuera de los dos. El esquema no fija el
    // orden de los bloques («interleave»), así que no basta con coger el primero
    // que aparezca.
    const bloqueMedidas = uno(raiz, 'MedidasMejora');
    const personal = uno(raiz, 'DatosPersonalizados');
    const base = quita(quita(raiz, 'MedidasMejora'), 'DatosPersonalizados');

    // ── Edificio ─────────────────────────────────────────────────────────────
    const edificioTodo = uno(base, 'DatosEdificio') || '';
    const refsBloque = uno(edificioTodo, 'ReferenciasCatastrales');
    // Los hijos DIRECTOS: <ElementosInalterables> lleva sus propios <Tipo> y
    // <Descripcion>, y la referencia catastral se lee aparte.
    const edificio = quita(quita(edificioTodo, 'ElementosInalterables'), 'ReferenciasCatastrales');
    const registro = texto(refsBloque, 'Registro');
    const referencias = todos(refsBloque, 'Ref').map((r) => ({
        registro,
        parcela: texto(r, 'Parcela'),
        inmueble: texto(r, 'Inmueble'),
        parte: texto(r, 'Parte'),
    }));
    const fechaConstruccion = texto(edificio, 'FechaConstruccion');
    const normativaV30 = texto(edificio, 'NormativaEdificacion');
    const alcance = texto(edificio, 'Alcance');

    // ── Certificado y certificador ───────────────────────────────────────────
    const certTodo = uno(base, 'DatosCertificado') || '';
    const procedimiento = uno(certTodo, 'Procedimiento');
    const cert = quita(certTodo, 'Procedimiento');
    const escalaCalif = texto(cert, 'Escala');
    const tipoCertificado = texto(cert, 'TipoCertificado');
    const certificador = uno(base, 'DatosCertificador') || '';
    const fechaCalificacion = texto(cert, 'FechaCalificacion');
    const fechaGeneracion = texto(cert, 'FechaGeneracion') ?? texto(personal, 'FechaGeneracion');

    // ── Modelo ───────────────────────────────────────────────────────────────
    const modelo = uno(base, 'Modelo') || '';
    const global = uno(modelo, 'Global') || '';
    const construcciones = uno(modelo, 'Construcciones') || '';

    const consPorId = new Map();
    for (const c of todos(construcciones, 'ConsHueco')) {
        const id = texto(c, 'Id');
        if (!id) continue;
        consPorId.set(id.toLowerCase(), {
            marco: (texto(c, 'Marco') || '').toLowerCase(),
            vidrio: (texto(c, 'Vidrio') || '').toLowerCase(),
            ff: numero(c, 'Ff'),
            factorSolar: numero(c, 'FactorSolar'),
            porDefecto: listaPorDefecto(texto(c, 'PorDefecto')),
        });
    }
    // <Marco> y <Vidrio> son a la vez la REFERENCIA dentro de cada <ConsHueco>
    // (solo un id) y la DEFINICIÓN (con su <Id>): se quedan las definiciones.
    const marcoPorId = new Map();
    for (const m of todos(construcciones, 'Marco')) {
        const id = texto(m, 'Id');
        if (id) marcoPorId.set(id.toLowerCase(), { transmitancia: numero(m, 'Transmitancia'), absortividad: numero(m, 'Absortividad') });
    }
    const vidrioPorId = new Map();
    for (const v of todos(construcciones, 'Vidrio')) {
        const id = texto(v, 'Id');
        if (id) vidrioPorId.set(id.toLowerCase(), { transmitancia: numero(v, 'Transmitancia'), factorSolarNormal: numero(v, 'FactorSolarNormal') });
    }

    // Huecos primero: hacen falta para devolver la superficie BRUTA de su opaco.
    const huecos = todos(uno(modelo, 'Huecos'), 'Hueco').map((h0) => {
        const h = quita(h0, 'Geometria');
        const nombreV30 = texto(h, 'Nombre');
        const cons = consPorId.get((texto(h, 'Construccion') || '').toLowerCase()) || null;
        const codigo = texto(h, 'Orientacion');
        return {
            id: (texto(h, 'Id') || '').toLowerCase() || null,
            // CE3X 3.1 cuelga un «-» al final del nombre del hueco; el v2.0 no.
            nombre: nombreV30 ? (nombreV30.replace(/\s*-\s*$/, '') || nombreV30) : null,
            nombreV30,
            tipo: texto(h, 'Tipo'),
            opaco: (texto(h, 'Opaco') || '').toLowerCase() || null,
            orientacion: orientacionHuecoV20(codigo),
            orientacionV30: codigo,
            superficie: numero(h, 'Superficie'),
            transmitancia: numero(h, 'Transmitancia'),
            factorSolar: factorSolarModificado(cons, cons ? marcoPorId.get(cons.marco) : null, cons ? vidrioPorId.get(cons.vidrio) : null),
            factorSolarVidrio: cons ? cons.factorSolar : null,
            porDefecto: [...new Set([...listaPorDefecto(texto(h, 'PorDefecto')), ...(cons ? cons.porDefecto : [])])],
        };
    });
    const huecosPorOpaco = new Map();
    for (const h of huecos) {
        if (!h.opaco || h.superficie === null) continue;
        huecosPorOpaco.set(h.opaco, (huecosPorOpaco.get(h.opaco) || 0) + h.superficie);
    }

    const opacos = todos(uno(modelo, 'Opacos'), 'Opaco').map((o0) => {
        const o = quita(o0, 'Geometria');
        const id = (texto(o, 'Id') || '').toLowerCase() || null;
        const tipo = texto(o, 'Tipo');
        const codigo = texto(o, 'Orientacion');
        const neta = numero(o, 'Superficie');
        const deHuecos = id ? (huecosPorOpaco.get(id) || 0) : 0;
        return {
            id,
            nombre: texto(o, 'Nombre'),
            tipo,
            contorno: texto(o, 'CondicionContorno'),
            orientacion: orientacionOpacoV20(tipo, codigo),
            orientacionV30: codigo,
            // BRUTA, como la del v2.0: la neta más la de sus huecos.
            superficie: neta === null ? null : redondea2(neta + deHuecos),
            superficieNeta: neta,
            transmitancia: numero(o, 'Transmitancia'),
            porDefecto: listaPorDefecto(texto(o, 'PorDefecto')),
        };
    });

    const puentes = todos(uno(modelo, 'PuentesTermicos'), 'PuenteTermico').map((p) => ({
        nombre: texto(p, 'Nombre'),
        tipo: texto(p, 'Tipo'),
        longitud: numero(p, 'Longitud'),
        transmitancia: numero(p, 'Transmitancia'),
        porDefecto: listaPorDefecto(texto(p, 'PorDefecto')),
    }));

    const sistemas = uno(modelo, 'Sistemas') || '';
    const generadores = todos(sistemas, 'Generador').map((g) => ({
        servicio: (texto(g, 'Servicio') || '').toUpperCase() || null,
        nombre: texto(g, 'Nombre'),
        tipo: texto(g, 'Tipo'),
        vector: texto(g, 'VectorEnergetico'),
        vectorV20: vectorV20(texto(g, 'VectorEnergetico')),
        potencia: numero(g, 'PotenciaNominal'),
        rendimientoNominal: numero(g, 'RendimientoNominal'),
        rendimientoEstacional: numero(g, 'RendimientoEstacional'),
        multiplicador: numero(g, 'Multiplicador'),
        // <EsFicticio/>: equipo de SUSTITUCIÓN que pone el programa, no uno real.
        ficticio: /<EsFicticio\b/i.test(g),
    }));
    const acumuladores = todos(sistemas, 'Acumulador').map((a) => ({
        nombre: texto(a, 'Nombre'),
        servicios: String(texto(a, 'Servicio') || '').toUpperCase().split(/\s+/).filter(Boolean),
        volumen: numero(a, 'Volumen'),             // m³ (según el esquema)
        multiplicador: numero(a, 'Multiplicador'),
    }));
    const espacios = todos(uno(modelo, 'Espacios'), 'Espacio').map((e) => ({
        nombre: texto(e, 'Nombre'),
        superficie: numero(e, 'Superficie'),
        volumen: numero(e, 'Volumen'),
        acondicionamiento: texto(e, 'NivelAcondicionamiento'),
    }));

    // ── Indicadores, escalas y calificación del EDIFICIO ─────────────────────
    const indicadores = uno(base, 'Indicadores') || '';
    const vectores = todos(uno(indicadores, 'EnergiaFinalVectores'), 'Vector').map((v) => ({
        nombre: texto(v, 'Nombre'),
        nombreV20: vectorV20(texto(v, 'Nombre')),
        ...porServicio(uno(v, 'Consumo')),
    }));
    const desglose = uno(uno(base, 'Tablas'), 'DesgloseEmisiones');
    const escalas = uno(base, 'Escalas');
    const calif = uno(base, 'Calificacion');

    // Las visitas: puede haber varias, y su fecha admite «d/m/aaaa».
    const visitas = todos(uno(base, 'InspeccionesObservaciones'), 'Visita')
        .map((v) => texto(v, 'Fecha')).filter(Boolean);
    // La PRIMERA (la más antigua): la que acredita que el técnico vio el
    // edificio antes de certificarlo. El v2.0 solo tenía una (<FechaVisita>).
    const visitasIso = visitas.map(fechaV30AIso).filter(Boolean).sort();

    const otros = uno(base, 'OtrosIndicadores');
    const volumenEspacios = espacios.reduce((s, e) => s + (e.volumen || 0), 0);

    return {
        version: versionXmlCee(String(xmlString || '')),
        identificacion: {
            nombre: texto(edificio, 'Descripcion'),
            direccion: texto(edificio, 'Direccion'),
            municipio: texto(edificio, 'Municipio'),
            provincia: texto(edificio, 'Provincia'),
            ccaa: texto(edificio, 'ComunidadAutonoma'),
            codigoPostal: texto(edificio, 'CodigoPostal'),
            zonaClimatica: texto(edificio, 'ZonaClimatica'),
            refCatastral: refCatastralV30(registro, referencias),
            referencias,
            fechaConstruccion,
            // Solo si es UN año: «1979-2005», «POST-2018» o «ANTE-1900» son tramos.
            anioConstruccion: /^\d{4}$/.test(fechaConstruccion || '') ? Number(fechaConstruccion) : null,
            normativa: normativaV20(normativaV30),
            normativaV30,
            alcance,
            uso: texto(edificio, 'Uso'),
            numUnidadesUso: numero(edificio, 'NumUnidadesUso'),
            plantasSobreRasante: numero(edificio, 'PlantasSobreRasante'),
            plantasBajoRasante: numero(edificio, 'PlantasBajoRasante'),
        },
        escala: escalaCalif,
        tipoEdificio: tipoEdificioV20(escalaCalif, alcance),
        superficieUtil: numero(edificio, 'SuperficieUtil'),
        // El v2.0 daba <VolumenEspacioHabitable>; el v3.0, <OtrosIndicadores><Volumen>
        // (en el par de 26RES093_9 son el mismo: 618,80 m³, la suma de sus espacios).
        volumen: numero(otros, 'Volumen') ?? (volumenEspacios > 0 ? redondea2(volumenEspacios) : null),
        demandaDiariaAcs: numero(global, 'DemandaDiariaAcs'),
        certificado: {
            tipo: tipoCertificado,
            // <AlcanceInformacionXML> del v2.0: solo «Existente» tiene equivalente seguro.
            alcanceV20: minus(tipoCertificado) === 'existente' ? 'CertificacionExistente' : tipoCertificado,
            procedimiento: procedimiento ? ([texto(procedimiento, 'Nombre'), texto(procedimiento, 'Version')].filter(Boolean).join(' ') || null) : null,
            fechaCalificacion,
            fechaGeneracion,
        },
        // Las fechas en ISO: la del certificado («en la que el inmueble obtiene
        // la calificación», que es la <Fecha> de <DatosDelCertificador> del v2.0),
        // la de generación del fichero y la de la primera visita.
        fechas: {
            calificacion: fechaV30AIso(fechaCalificacion),
            generacion: fechaV30AIso(fechaGeneracion),
            visita: visitasIso[0] || null,
        },
        certificador: {
            nif: texto(certificador, 'Nif'),
            nifEntidad: texto(certificador, 'NifEntidad'),
            nombre: texto(certificador, 'NombreApellidos'),
            razonSocial: texto(certificador, 'RazonSocial'),
            titulacion: texto(certificador, 'Titulacion'),
        },
        visitas,
        demanda: porServicio(uno(indicadores, 'Demanda')),
        energiaFinal: porServicio(uno(indicadores, 'EnergiaFinal')),
        epnr: porServicio(uno(indicadores, 'EnergiaPrimariaNoRenovable')),
        emisiones: porServicio(uno(indicadores, 'Emisiones')),
        vectores,
        desglose: {
            consumoElectrico: numero(desglose, 'ConsumoElectrico'),
            consumoOtros: numero(desglose, 'ConsumoOtros'),
            totalConsumoElectrico: numero(desglose, 'TotalConsumoElectrico'),
            totalConsumoOtros: numero(desglose, 'TotalConsumoOtros'),
        },
        calificacion: {
            epnr: letra(texto(uno(calif, 'EnergiaPrimariaNoRenovable'), 'Tot')),
            emisiones: letra(texto(uno(calif, 'Emisiones'), 'Tot')),
        },
        escalas: {
            epnr: escala(uno(uno(escalas, 'EnergiaPrimariaNoRenovable'), 'Tot')),
            emisiones: escala(uno(uno(escalas, 'Emisiones'), 'Tot')),
        },
        generadores,
        acumuladores,
        espacios,
        envolvente: { opacos, huecos, puentes },
        medidas: todos(bloqueMedidas, 'MedidaMejora').map((m) => {
            const ind = uno(m, 'Indicadores');
            return {
                nombre: texto(m, 'Nombre'),
                descripcion: textoDeHtml(texto(m, 'Descripcion')),
                coste: texto(m, 'CosteEstimado'),
                demanda: porServicio(uno(ind, 'Demanda')),
                epnr: porServicio(uno(ind, 'EnergiaPrimariaNoRenovable')),
            };
        }),
    };
}

// ─── Huecos y opacos para el certificado RES080 ──────────────────────────────

/**
 * La lista de huecos y opacos con la MISMA forma que `getHuecosFromXml` del
 * modal del RES080 y `parseHuecosFromXmlNode` de cifoService: los huecos con
 * `tipo: 'Hueco'` (los lucernarios no entran, como en el v2.0) y los opacos de
 * fachada, cubierta, suelo y particiones. Números a 0 si faltan y textos
 * «Desconocido(a)», que es lo que hacen aquellos dos con el v2.0.
 */
function huecosYOpacosV30(xmlString) {
    try {
        const { envolvente } = leerXmlCeeV30(xmlString);
        const n = (v) => (v === null || v === undefined ? 0 : v);
        const out = [];
        for (const h of envolvente.huecos) {
            if (minus(h.tipo) !== 'hueco') continue;
            out.push({
                nombre: h.nombre || 'Desconocido',
                tipo: 'Hueco',
                superficie: n(h.superficie),
                transmitancia: n(h.transmitancia),
                factorSolar: n(h.factorSolar),
                orientacion: h.orientacion || 'Desconocida',
            });
        }
        const TIPOS = ['fachada', 'cubierta', 'suelo', 'particioninteriorvertical', 'particioninteriorhorizontal'];
        for (const o of envolvente.opacos) {
            if (!TIPOS.includes(minus(o.tipo))) continue;
            out.push({
                nombre: o.nombre || 'Desconocido',
                tipo: o.tipo || 'Desconocido',
                superficie: n(o.superficie),
                transmitancia: n(o.transmitancia),
                orientacion: o.orientacion || 'Desconocida',
            });
        }
        return out;
    } catch {
        return [];
    }
}

module.exports = {
    versionXmlCee,
    esXmlCeeV30,
    RUMBO_V20,
    orientacionOpacoV20,
    orientacionHuecoV20,
    tipoEdificioV20,
    VECTOR_V30_A_V20,
    claveVectorV30,
    vectorV20,
    esVectorAmbiente,
    normativaV20,
    refCatastralV30,
    fechaV30AIso,
    sumaDemanda,
    leerXmlCeeV30,
    huecosYOpacosV30,
};
