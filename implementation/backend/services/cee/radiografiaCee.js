// ============================================================================
// radiografiaCee.js — QUÉ DICE un certificado, sin juzgarlo todavía.
//
// Lee el `.xml` que entrega el certificador y devuelve los HECHOS: qué
// generadores declara, con qué combustible, qué demanda, qué superficie, qué
// envolvente y qué medidas de mejora. No decide si está bien: eso es
// `revisionCee.js`, que cruza estos hechos con lo que el expediente dice que
// tenía que haber. Mismo reparto que `placaOcrService` ↔ `elegirPotencia`.
//
// POR QUÉ NO SE USA `parseCeeXml`
// -------------------------------
// Aquél vive en el frontend y va con `DOMParser`, que en Node NO EXISTE: allí
// devuelve vacío EN SILENCIO (es el gotcha que ya obligó a escribir
// `leerCalificacionesDeTexto` para la calificación de emisiones, regla 52). Y
// además no saca el NOMBRE ni el TIPO de cada generador, que es justo lo que se
// mira al revisar. Aquí se recorre el texto acotando por el nodo padre, que es
// lo que hace falta porque varios nombres se repiten en sitios distintos
// (`<Global>` es un número en `<Consumo>` y una LETRA en `<Calificacion>`).
//
// MEDIDO sobre los 462 certificados reales de `data/real_cases_xml`:
//   · los 462 llevan <InstalacionesTermicas> y <InstalacionesACS>
//   · 459 llevan <GeneradoresDeCalefaccion>; los 3 que no, son viviendas sin
//     calefacción — no es un fichero roto (ver regla 8.d)
//   · 266 llevan <MedidasDeMejora>
//   · <Tipo> es un enum cerrado de 11 valores y <VectorEnergetico> de 6
//   · NINGUNO declara la acumulación de ACS: no está en el XML (ver abajo)
//
// DOS ESQUEMAS (2026-10-02)
// -------------------------
// Todo lo anterior es el v2.0, el de CE3X 2.3. Desde el 01/10/2026 los técnicos
// exportan con CE3X 3.1, que escribe el v3.0: otras etiquetas y otra estructura.
// `radiografiaXml` mira la versión y, si es la 3.0, lee con `xmlCeeV30.js` y
// devuelve LA MISMA radiografía, con las mismas claves (ver
// `radiografiaXmlV30`). Lo que el v3.0 no dice sale `null`, explicado en su
// sitio. El camino del v2.0 no se ha tocado.
// ============================================================================

const v30 = require('./xmlCeeV30');

/**
 * LA ACUMULACIÓN DE ACS NO ESTÁ EN EL XML v2.0.
 *
 * Se buscó en los 462 ficheros cualquier nodo con "acumul", "volum", "deposit"
 * o "inercia": el único que aparece es `<VolumenEspacioHabitable>`, que es el
 * volumen de la vivienda. Así que «¿la caldera tiene acumulación para el ACS?»
 * —uno de los puntos que se revisan a ojo— NO se puede contestar con el `.xml`:
 * hay que abrir el `.cex`, donde sí vive (slot del equipo, regla 48.b).
 *
 * Por eso la radiografía lo deja explícitamente en `null` y el informe dice que
 * no se ha podido comprobar, en vez de callarse: un punto que se omite en
 * silencio se lee como un punto que está bien.
 *
 * ⚠️ El v3.0 SÍ la trae (<Sistemas><Acumulador>): con él la radiografía la da
 * como lista —vacía si no declara ninguno— y no como `null`.
 */
const ACUMULACION_SOLO_EN_CEX = true;

// ─── Lectura del fichero ─────────────────────────────────────────────────────

/**
 * Texto de un `.xml` de CE3X.
 *
 * ⚠️ Los 462 DECLARAN `encoding="UTF-8"` y varios están en realidad en
 * ISO-8859-1: decodificados como UTF-8, «Caldera Estándar» sale con un carácter
 * de reemplazo y deja de casar con el enum. Se prueba UTF-8 estricto y se cae a
 * latin-1, que nunca falla.
 */
function textoDeXml(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { return buf.toString('latin1'); }
}

// ─── Recorrido del texto, acotando por el padre ──────────────────────────────

const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El contenido del primer `<tag>…</tag>` que haya dentro de `xml`. */
function bloque(xml, tag) {
    const m = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'i').exec(xml || '');
    return m ? m[1] : null;
}

/** Todos los `<tag>…</tag>` de `xml`, en orden. */
function bloques(xml, tag) {
    const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(xml || '')) !== null) out.push(m[1]);
    return out;
}

/** El texto de `<tag>` dentro de `xml`, ya desescapado. */
function texto(xml, tag) {
    const v = bloque(xml, tag);
    if (v === null) return null;
    const s = v
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
    return s === '' ? null : s;
}

/**
 * El número de `<tag>`.
 *
 * ⚠️ CE3X escribe **99999999.99** donde el dato NO CONSTA (se ve en
 * `<RendimientoNominal>` y en `<NumeroDePlantasSobreRasante>` de casi todos los
 * ficheros del corpus). Tomarlo por un valor daría una caldera de cien millones
 * de kW y una vivienda de cien millones de plantas.
 */
function numero(xml, tag) {
    const s = texto(xml, tag);
    if (s === null) return null;
    const v = Number(String(s).replace(',', '.'));
    if (!Number.isFinite(v) || v >= 99999999) return null;
    return v;
}

// ─── Enums de CE3X (LEÍDOS del corpus, no deducidos) ─────────────────────────

/**
 * Qué es cada `<Tipo>`. Las cadenas salen de contar el corpus; una que no esté
 * aquí NO se clasifica —se devuelve `null` y el informe lo dice—, porque
 * adivinar si un generador desconocido quema combustible es justo lo que no
 * puede hacer una comprobación que da o quita el visto bueno.
 */
const TIPOS_GENERADOR = {
    'caldera estandar': { familia: 'caldera', combustion: true },
    'caldera condensacion': { familia: 'caldera', combustion: true },
    'caldera de biomasa': { familia: 'caldera', combustion: true },
    'caldera electrica': { familia: 'electrico', combustion: false },
    'efecto joule': { familia: 'electrico', combustion: false },
    'bomba de calor': { familia: 'bomba', combustion: false },
    'bomba de calor - caudal ref. variable': { familia: 'bomba', combustion: false },
    'maquina frigorifica': { familia: 'frio', combustion: false },
    'maquina frigorifica - caudal ref. variable': { familia: 'frio', combustion: false },
    'bomba de varias velocidades': { familia: 'auxiliar', combustion: false },
    'bomba de caudal constante': { familia: 'auxiliar', combustion: false },
    'ventilador de caudal constante': { familia: 'auxiliar', combustion: false },
};

/** `<VectorEnergetico>` → el combustible con el que lo nombra el expediente. */
const VECTOR_A_COMBUSTIBLE = {
    electricidadpeninsular: 'electricidad',
    electricidadbaleares: 'electricidad',
    electricidadcanarias: 'electricidad',
    electricidadceutaymelilla: 'electricidad',
    gasnatural: 'gas_natural',
    gasoleoc: 'gasoleo',
    glp: 'glp',
    carbon: 'carbon',
    biomasapellet: 'pellets',
    biomasapellete: 'pellets',
    biomasaotros: 'biomasa',
    biocarburante: 'biocarburante',
};

/**
 * De dónde sale un dato, según CE3X.
 *
 * ⚠️ **En el `.xml` NO existe «Conocido»**: los tres valores que escribe son
 * `PorDefecto`, `Estimado` y `Usuario`, y `Usuario` ES el «Conocido
 * (Ensayado/justificado)» del programa. Contado sobre los 462 certificados
 * (29.780 apariciones) y verificado por contraste: las bombas de calor —que en
 * el `.cex` se declaran «Conocido», 132 de 138 (regla 48.b)— llevan `Usuario`
 * en 618 de 769, y las calderas estándar `Estimado` en 392 de 394.
 *
 * Buscar la cadena «Conocido» en el XML no encuentra nada, y de ahí a concluir
 * que ningún certificado justifica sus transmitancias hay un paso.
 */
const MODO_CONOCIDO = 'Usuario';
const MODOS_OBTENCION = ['PorDefecto', 'Estimado', 'Usuario'];

/** Cómo se lee cada modo en castellano, para el informe. */
const MODO_ES = {
    usuario: 'conocido (justificado)',
    estimado: 'estimado',
    pordefecto: 'por defecto',
};

/** Sin tildes, en minúscula y con los espacios colapsados. */
const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** ¿Ese modo es el «Conocido» de CE3X? */
const esConocido = (modo) => norm(modo) === norm(MODO_CONOCIDO);

/**
 * Una fecha `dd/mm/aaaa` de CE3X, en ISO. `//` es «no consta» — lo escriben 18
 * de los 462 en `<FechaVisita>`, y tomarlo por una fecha da un disparate.
 */
function fechaCe3x(v) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function clasificarTipo(tipo) {
    return TIPOS_GENERADOR[norm(tipo)] || null;
}

function combustibleDeVector(vector) {
    return VECTOR_A_COMBUSTIBLE[norm(vector).replace(/[^a-z]/g, '')] || null;
}

// ─── Los generadores ─────────────────────────────────────────────────────────

function leerGenerador(xml, servicio) {
    const clase = clasificarTipo(texto(xml, 'Tipo'));
    const vector = texto(xml, 'VectorEnergetico');
    //: El XML da el rendimiento como fracción (0.67 = 67 %, 1.26 = 126 %); se
    //: normaliza a porcentaje para poder compararlo con la tabla del Anexo VIII,
    //: que es como lo mira una persona. Mismo criterio que `parseCeeXml`.
    const rendimiento = numero(xml, 'RendimientoEstacional');
    return {
        servicio,
        nombre: texto(xml, 'Nombre'),
        tipo: texto(xml, 'Tipo'),
        tipo_conocido: clase !== null,
        familia: clase ? clase.familia : null,
        es_combustion: clase ? clase.combustion : null,
        vector,
        combustible: combustibleDeVector(vector),
        potencia_kw: numero(xml, 'PotenciaNominal'),
        rendimiento_pct: rendimiento === null ? null : Math.round(rendimiento * 1000) / 10,
        modo_obtencion: texto(xml, 'ModoDeObtencion'),
    };
}

// ─── La envolvente ───────────────────────────────────────────────────────────

/**
 * Los cerramientos, con su nombre, superficie y transmitancia.
 *
 * El NOMBRE es la clave con la que después se casa el mismo elemento entre el
 * CEE inicial y el posterior: es lo que permite decir QUÉ ventana se cambia
 * (ver `compararEnvolventes`), que en un RES080 es el punto que se revisa.
 */
function leerEnvolvente(xml) {
    const huecos = [];
    const opacos = [];
    const puentes = [];
    for (const el of bloques(xml, 'Elemento')) {
        //: ⚠️ Un HUECO no lleva `<ModoDeObtencion>`: lleva
        //: `<ModoDeObtencionTransmitancia>` y `<ModoDeObtencionFactorSolar>`,
        //: uno por dato. Medido: los 5.618 huecos del corpus son así, y buscar
        //: el nodo genérico en ellos devuelve null siempre.
        const esHueco = norm(texto(el, 'Tipo')) === 'hueco';
        const modo = esHueco
            ? texto(el, 'ModoDeObtencionTransmitancia')
            : texto(el, 'ModoDeObtencion');
        const item = {
            nombre: texto(el, 'Nombre') || '(sin nombre)',
            tipo: texto(el, 'Tipo'),
            superficie: numero(el, 'Superficie'),
            transmitancia: numero(el, 'Transmitancia'),
            orientacion: texto(el, 'Orientacion'),
            modo_obtencion: modo,
            //: El JUICIO («¿está justificada?») se deja calculado aquí porque
            //: depende de un enum del fichero, no del expediente: quien consuma
            //: la radiografía no tiene por qué saber que «Usuario» es Conocido.
            transmitancia_conocida: modo === null ? null : esConocido(modo),
        };
        if (esHueco) {
            item.factor_solar = numero(el, 'FactorSolar');
            item.modo_factor_solar = texto(el, 'ModoDeObtencionFactorSolar');
            huecos.push(item);
        } else if (item.superficie !== null) {
            opacos.push(item);
        } else {
            //: Sin superficie y con `<Longitud>`: es un PUENTE TÉRMICO (contorno
            //: de hueco, caja de persiana, encuentros, pilares). No se mezclan
            //: con los cerramientos: son 21.441 de los 32.952 `<Elemento>` del
            //: corpus y ahogarían cualquier recuento de fachadas.
            puentes.push({ ...item, longitud: numero(el, 'Longitud') });
        }
    }
    return { huecos, opacos, puentes };
}

// ─── La radiografía ──────────────────────────────────────────────────────────

/**
 * Los HECHOS de un certificado. No juzga nada.
 *
 * @param {Buffer|string} contenido  el `.xml` tal cual
 * @returns {object} radiografía; `null` en los campos que el fichero no declara
 */
function radiografiaXml(contenido) {
    const xml = textoDeXml(contenido);
    if (!/<DatosEnergeticosDelEdificio/i.test(xml)) {
        throw new Error('Esto no es el .xml de un certificado de eficiencia energética (falta <DatosEnergeticosDelEdificio>).');
    }
    //: El de CE3X 3.1 se lee por su cuenta y sale con la MISMA forma.
    if (v30.esXmlCeeV30(xml)) return radiografiaXmlV30(xml);

    const ident = bloque(xml, 'IdentificacionEdificio') || '';
    const geom = bloque(xml, 'DatosGeneralesyGeometria') || '';
    const term = bloque(xml, 'InstalacionesTermicas') || '';
    const demanda = bloque(xml, 'Demanda') || '';
    const dem = bloque(demanda, 'EdificioObjeto') || demanda;
    const calif = bloque(xml, 'Calificacion') || '';

    const generadores = {
        calefaccion: bloques(bloque(term, 'GeneradoresDeCalefaccion') || '', 'Generador')
            .map((g) => leerGenerador(g, 'calefaccion')),
        acs: bloques(bloque(term, 'InstalacionesACS') || '', 'Instalacion')
            .map((g) => leerGenerador(g, 'acs')),
        refrigeracion: bloques(bloque(term, 'GeneradoresDeRefrigeracion') || '', 'Generador')
            .map((g) => leerGenerador(g, 'refrigeracion')),
    };

    //: ⚠️ `<Global>` existe en los dos sitios: dentro de `<Calificacion>` es una
    //: LETRA y fuera es un número. Por eso se acota por el bloque del indicador.
    const letra = (indicador) => {
        const b = bloque(calif, indicador);
        const v = b ? texto(b, 'Global') : null;
        return v && /^[A-G]$/i.test(v) ? v.toUpperCase() : null;
    };

    //: `<DatosDelCertificador>`: QUIÉN firma el certificado y CON QUÉ FECHA.
    //: Los 462 lo llevan con sus 13 campos. ⚠️ Su `<Fecha>` NO es
    //: `<FechaGeneracion>` —difieren en 115 de 462—: aquélla es la fecha del
    //: certificado y ésta, cuándo se guardó el fichero.
    const cert = bloque(xml, 'DatosDelCertificador') || '';

    return {
        fichero: {
            procedimiento: texto(ident, 'Procedimiento'),
            alcance: texto(ident, 'AlcanceInformacionXML'),
            generado: fechaCe3x(texto(xml, 'FechaGeneracion')),
        },
        certificador: {
            nif: texto(cert, 'NIF'),
            nif_entidad: texto(cert, 'NIFEntidad'),
            nombre: texto(cert, 'NombreyApellidos'),
            razon_social: texto(cert, 'RazonSocial'),
            titulacion: texto(cert, 'Titulacion'),
        },
        fechas: {
            certificado: fechaCe3x(texto(cert, 'Fecha')),
            //: `//` es «no consta»: 18 de los 462 no declaran visita.
            visita: fechaCe3x(texto(xml, 'FechaVisita')),
        },
        identificacion: {
            ref_catastral: texto(ident, 'ReferenciaCatastral'),
            direccion: texto(ident, 'Direccion'),
            municipio: texto(ident, 'Municipio'),
            provincia: texto(ident, 'Provincia'),
            ccaa: texto(ident, 'ComunidadAutonoma'),
            codigo_postal: texto(ident, 'CodigoPostal'),
            zona_climatica: texto(ident, 'ZonaClimatica'),
            tipo_edificio: texto(ident, 'TipoDeEdificio'),
            normativa: texto(ident, 'NormativaVigente'),
            anio_construccion: numero(ident, 'AnoConstruccion'),
        },
        geometria: {
            superficie_habitable: numero(geom, 'SuperficieHabitable'),
            volumen: numero(geom, 'VolumenEspacioHabitable'),
            plantas: numero(geom, 'NumeroDePlantasSobreRasante'),
            demanda_diaria_acs_litros: numero(geom, 'DemandaDiariaACS'),
        },
        demanda: {
            calefaccion: numero(dem, 'Calefaccion'),
            refrigeracion: numero(dem, 'Refrigeracion'),
            acs: numero(dem, 'ACS'),
        },
        generadores,
        //: Ver ACUMULACION_SOLO_EN_CEX: el XML no lo dice, y callarlo sería peor.
        acumulacion_acs: null,
        calificacion: {
            epnr: letra('EnergiaPrimariaNoRenovable'),
            emisiones: letra('EmisionesCO2'),
        },
        medidas: bloques(bloque(xml, 'MedidasDeMejora') || '', 'Medida').map((m) => ({
            nombre: texto(m, 'Nombre'),
            descripcion: texto(m, 'Descripcion'),
            coste_estimado: numero(m, 'CosteEstimado'),
            demanda_global: numero(bloque(m, 'Demanda') || '', 'Global'),
            epnr_global: numero(bloque(m, 'EnergiaPrimariaNoRenovable') || '', 'Global'),
        })),
        envolvente: leerEnvolvente(xml),
    };
}

// ─── La radiografía del v3.0 (CE3X 3.1) ──────────────────────────────────────

/** `<Servicio>` de un generador del v3.0 → la lista de `generadores` (la del v2.0). */
const SERVICIO_V30 = { CAL: 'calefaccion', ACS: 'acs', REF: 'refrigeracion' };

/**
 * Qué es cada `<Tipo>` de generador del v3.0. El esquema lo fija como un enum de
 * 16 valores (TIPO_GENERADOR); aquí están los que se saben leer, contrastados
 * con el par v2.0 / v3.0 del mismo edificio (26RES093_9: «Caldera Estándar» →
 * CalderaConvencional, «Bomba de Calor - Caudal Ref. Variable» →
 * ExpansionDirectaAireAgua, «Efecto Joule» → CalderaElectrica) y con los
 * ejemplos oficiales de CE3X 3.1.
 *
 * Mismo criterio que la tabla del v2.0: lo que no está —CalderaGenerica,
 * Absorcion, RedDistrito, RendimientoConstante, MotorCombustionInterna, Otro—
 * NO se clasifica, y la revisión dice que lo tiene que mirar una persona.
 *
 * ⚠️ El v3.0 no separa una bomba de calor de una máquina SOLO de frío (las dos
 * son ExpansionDirecta…): en refrigeración todas salen `bomba`. La familia que
 * se revisa es la de la calefacción, donde eso no pasa.
 */
const TIPOS_GENERADOR_V30 = {
    calderaconvencional: { familia: 'caldera', combustion: true },
    calderabajatemperatura: { familia: 'caldera', combustion: true },
    calderacondensacion: { familia: 'caldera', combustion: true },
    calderabiomasa: { familia: 'caldera', combustion: true },
    calderaacsconvencional: { familia: 'caldera', combustion: true },
    calderaelectrica: { familia: 'electrico', combustion: false },
    calefaccionelectrica: { familia: 'electrico', combustion: false },
    expansiondirectaaireaire: { familia: 'bomba', combustion: false },
    expansiondirectaaireagua: { familia: 'bomba', combustion: false },
    bdcaguaagua: { familia: 'bomba', combustion: false },
};

function clasificarTipoV30(tipo) {
    return TIPOS_GENERADOR_V30[norm(tipo).replace(/[^a-z]/g, '')] || null;
}

/**
 * Lo único que el v3.0 dice del modo de obtención: qué va POR DEFECTO. Si no lo
 * marca, puede ser «Estimado» o «Conocido» y el fichero no lo distingue — en el
 * par de 26RES093_9 los dos salen igual —, así que el modo queda en `null`
 * («no consta»), nunca en uno de los dos.
 */
const modoV30 = (porDefecto, propiedad) => ((porDefecto || []).includes(propiedad) ? 'PorDefecto' : null);

function generadorV30(g) {
    const clase = clasificarTipoV30(g.tipo);
    const r = g.rendimientoEstacional;
    return {
        servicio: SERVICIO_V30[g.servicio] || null,
        nombre: g.nombre,
        tipo: g.tipo,
        tipo_conocido: clase !== null,
        familia: clase ? clase.familia : null,
        es_combustion: clase ? clase.combustion : null,
        //: Con el nombre del v2.0 (GasoleoC, ElectricidadPeninsular…), que es el
        //: que entiende VECTOR_A_COMBUSTIBLE.
        vector: g.vectorV20,
        combustible: combustibleDeVector(g.vectorV20),
        potencia_kw: g.potencia,
        rendimiento_pct: r === null ? null : Math.round(r * 1000) / 10,
        //: El v3.0 no dice cómo se obtuvo el rendimiento de un generador.
        modo_obtencion: null,
    };
}

function envolventeV30(env) {
    const huecos = [];
    const opacos = [];
    const puentes = [];
    const itemDe = (e, modo) => ({
        nombre: e.nombre || '(sin nombre)',
        tipo: e.tipo,
        superficie: e.superficie,
        transmitancia: e.transmitancia,
        //: '' (adiabático) → null, como el `texto()` del v2.0.
        orientacion: e.orientacion || null,
        modo_obtencion: modo,
        transmitancia_conocida: modo === null ? null : esConocido(modo),
    });
    for (const o of env.opacos) opacos.push(itemDe(o, modoV30(o.porDefecto, 'transmitancia')));
    for (const h of env.huecos) {
        if (norm(h.tipo) === 'hueco') {
            const item = itemDe(h, modoV30(h.porDefecto, 'transmitancia'));
            item.factor_solar = h.factorSolar;
            item.modo_factor_solar = modoV30(h.porDefecto, 'factorsolar');
            huecos.push(item);
        } else {
            //: Un LUCERNARIO va con los opacos y sin modo, detrás de ellos: es
            //: lo que hace `leerEnvolvente` con el v2.0, donde no llevaba
            //: <ModoDeObtencion> y tenía superficie.
            opacos.push(itemDe(h, null));
        }
    }
    for (const p of env.puentes) {
        const modo = modoV30(p.porDefecto, 'transmitancia');
        puentes.push({
            nombre: p.nombre || '(sin nombre)',
            tipo: p.tipo,
            superficie: null,
            transmitancia: p.transmitancia,
            orientacion: null,
            modo_obtencion: modo,
            transmitancia_conocida: modo === null ? null : esConocido(modo),
            longitud: p.longitud,
        });
    }
    return { huecos, opacos, puentes };
}

/**
 * La radiografía de un `.xml` v3.0, con la MISMA forma que la del v2.0. De dónde
 * sale cada dato está en `xmlCeeV30.js`; aquí, lo que cambia de significado:
 *
 *  · `fechas.certificado` ← <DatosCertificado><FechaCalificacion>, «la fecha en
 *    la que el inmueble obtiene la calificación»: la <Fecha> de
 *    <DatosDelCertificador> del v2.0. `fechas.visita` ← la PRIMERA <Visita>.
 *  · `generadores` sin los FICTICIOS (<EsFicticio/>, los de sustitución que pone
 *    CE3X cuando no hay ese servicio): el v2.0 no los escribía, y contarlos
 *    declararía un equipo que no está instalado.
 *  · `acumulacion_acs`: el v2.0 no la traía (`null`); el v3.0 sí, y sale como
 *    lista de los depósitos que sirven al ACS — vacía si no declara ninguno.
 *  · `envolvente`: superficie BRUTA de los opacos, orientación en palabras y
 *    nombres de hueco sin el «-» final, como en el v2.0. El modo de obtención
 *    solo se sabe cuando va POR DEFECTO.
 *  · `medidas[].coste_estimado` y `.demanda_global`: el v3.0 da el coste como
 *    TRAMO («10000-25000») y no da el total de la demanda de la medida (en el
 *    v2.0 tampoco era una suma fija: solo cuadraba en 227 de 301) → `null`.
 *  · `identificacion.anio_construccion`: `null` si <FechaConstruccion> es un
 *    tramo («1979-2005»). `geometria.plantas` ← <PlantasSobreRasante>.
 */
function radiografiaXmlV30(xml) {
    const x = v30.leerXmlCeeV30(xml);
    const generadores = { calefaccion: [], acs: [], refrigeracion: [] };
    for (const g of x.generadores) {
        if (g.ficticio) continue;
        const s = SERVICIO_V30[g.servicio];
        if (s) generadores[s].push(generadorV30(g));
    }
    return {
        fichero: {
            procedimiento: x.certificado.procedimiento,
            alcance: x.certificado.alcanceV20,
            generado: x.fechas.generacion,
        },
        certificador: {
            nif: x.certificador.nif,
            nif_entidad: x.certificador.nifEntidad,
            nombre: x.certificador.nombre,
            razon_social: x.certificador.razonSocial,
            titulacion: x.certificador.titulacion,
        },
        fechas: {
            certificado: x.fechas.calificacion,
            visita: x.fechas.visita,
        },
        identificacion: {
            ref_catastral: x.identificacion.refCatastral,
            direccion: x.identificacion.direccion,
            municipio: x.identificacion.municipio,
            provincia: x.identificacion.provincia,
            ccaa: x.identificacion.ccaa,
            codigo_postal: x.identificacion.codigoPostal,
            zona_climatica: x.identificacion.zonaClimatica,
            tipo_edificio: x.tipoEdificio,
            normativa: x.identificacion.normativa,
            anio_construccion: x.identificacion.anioConstruccion,
        },
        geometria: {
            superficie_habitable: x.superficieUtil,
            volumen: x.volumen,
            plantas: x.identificacion.plantasSobreRasante,
            demanda_diaria_acs_litros: x.demandaDiariaAcs,
        },
        demanda: {
            calefaccion: x.demanda.cal,
            refrigeracion: x.demanda.ref,
            acs: x.demanda.acs,
        },
        generadores,
        acumulacion_acs: x.acumuladores
            .filter((a) => a.servicios.includes('ACS'))
            .map((a) => ({
                nombre: a.nombre,
                //: El esquema da el volumen en m³.
                volumen_l: a.volumen === null ? null : Math.round(a.volumen * 1000),
                unidades: a.multiplicador ?? 1,
                servicios: a.servicios.map((s) => SERVICIO_V30[s] || s.toLowerCase()),
            })),
        calificacion: {
            epnr: x.calificacion.epnr,
            emisiones: x.calificacion.emisiones,
        },
        medidas: x.medidas.map((m) => ({
            nombre: m.nombre,
            descripcion: m.descripcion,
            coste_estimado: null,
            demanda_global: null,
            epnr_global: m.epnr.tot,
        })),
        envolvente: envolventeV30(x.envolvente),
    };
}

// ─── Comparar dos fases ──────────────────────────────────────────────────────

/**
 * Qué cerramientos CAMBIAN entre dos certificados, casándolos por su nombre.
 *
 * Es la respuesta determinista a «¿se indica qué ventanas se sustituyen?» de un
 * RES080. El `<Nombre>` de la medida de mejora es texto libre —medido: los 266
 * ficheros que la llevan escriben ahí cosas como «CEE FINAL.cex» o «MAE 1»— así
 * que leerlo no prueba nada. Lo que sí prueba es que la U de ESE hueco baje.
 *
 * @param {number} tol  holgura relativa; por debajo son redondeos del .cex
 */
function compararEnvolventes(inicial, posterior, tol = 0.02) {
    const cambia = (a, b) => a !== null && b !== null && Math.abs(b - a) > Math.abs(a) * tol;
    const comparar = (listaA, listaB) => {
        const porNombre = new Map(listaB.map((e) => [norm(e.nombre), e]));
        const cambiados = [];
        const soloEnInicial = [];
        for (const a of listaA) {
            const clave = norm(a.nombre);
            const b = porNombre.get(clave);
            if (!b) { soloEnInicial.push(a); continue; }
            porNombre.delete(clave);
            if (cambia(a.transmitancia, b.transmitancia) || cambia(a.superficie, b.superficie)) {
                //: El `tipo` viaja con el cambio, no solo el nombre: es lo que
                //: dice si lo que ha cambiado es una CUBIERTA o una FACHADA, y
                //: sin él quien lo consuma no puede cruzarlo con lo que declara
                //: la pestaña Envolvente del expediente.
                cambiados.push({
                    nombre: a.nombre,
                    tipo: a.tipo,
                    u_antes: a.transmitancia,
                    u_despues: b.transmitancia,
                    sup_antes: a.superficie,
                    sup_despues: b.superficie,
                });
            }
        }
        return {
            cambiados,
            solo_en_inicial: soloEnInicial,
            solo_en_posterior: [...porNombre.values()],
        };
    };
    return {
        huecos: comparar(inicial.envolvente.huecos, posterior.envolvente.huecos),
        opacos: comparar(inicial.envolvente.opacos, posterior.envolvente.opacos),
    };
}

module.exports = {
    radiografiaXml,
    compararEnvolventes,
    textoDeXml,
    MODO_CONOCIDO,
    MODOS_OBTENCION,
    MODO_ES,
    esConocido,
    fechaCe3x,
    TIPOS_GENERADOR,
    TIPOS_GENERADOR_V30,
    VECTOR_A_COMBUSTIBLE,
    clasificarTipo,
    clasificarTipoV30,
    combustibleDeVector,
    norm,
    ACUMULACION_SOLO_EN_CEX,
};
