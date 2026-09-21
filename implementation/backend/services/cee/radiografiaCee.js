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
// ============================================================================

/**
 * LA ACUMULACIÓN DE ACS NO ESTÁ EN EL XML.
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
    VECTOR_A_COMBUSTIBLE,
    clasificarTipo,
    combustibleDeVector,
    norm,
    ACUMULACION_SOLO_EN_CEX,
};
