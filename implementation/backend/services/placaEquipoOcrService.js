/**
 * placaEquipoOcrService — Lee las PLACAS de la bomba de calor INSTALADA.
 *
 * Gemelo de `placaOcrService` (del que reutiliza el cliente de Gemini: mismo
 * plazo, mismos reintentos, misma traza del gasto) para el otro extremo de la
 * obra. Allí se lee la caldera que se retira; aquí, la máquina que se pone.
 *
 * De estas placas sale el dato que MÁS veces bloquea un expediente: el **nº de
 * serie de la unidad exterior**, que va impreso en el CIFO, en el Anexo I y en
 * la memoria RITE, y sin el cual no se tramita la ayuda. Lleva meses en Drive —
 * el instalador lo sube a `FOTO_UNIDAD_EXTERIOR_PLACA` («la pegatina de la
 * máquina de fuera… de ahí sale el número de serie, y sin él no podemos
 * tramitar la ayuda»), que además está en `FULL_RES_SLOTS` precisamente para
 * que esos caracteres se lean— y se seguía tecleando a mano mirando la foto.
 *
 * ── REGLA: LA PLACA SE LEE SOLA ─────────────────────────────────────────────
 * Nada de fotos «de contexto» junto a la etiqueta. Medido sobre las placas de
 * 26RES080_66 (DAIKIN, «MFG.NO. : 1650773») y 26RES080_64 (PANASONIC, «SERIAL
 * NO. 5624802034»), tres vueltas por combinación y `temperature: 0`:
 *
 *                                 solo la placa   placa + foto del aparato
 *   26RES080_66 (etiqueta nítida)     3/3 ✓            0/3 ✗  lee 1802773
 *   26RES080_64 (en diagonal)         3/3 ✓            0/3 ✗  lee 5621802034
 *
 * Doce de doce con la placa sola; cero de seis en cuanto entra una segunda foto.
 * Y el fallo es de UN DÍGITO en medio del número, que es la peor forma de
 * fallar: el resultado parece bueno y nadie lo contrasta. Tampoco es azar que se
 * corrija repitiendo —sale igual las tres veces—, así que no vale con leer dos
 * veces y comparar.
 *
 * Por eso la foto del aparato entero solo se manda cuando NO HAY foto de la
 * placa, que es el único caso en que aporta algo (la marca). Una placa de bomba
 * de calor lleva la marca impresa —«Panasonic», «DAIKIN EUROPE N.V.»—, así que
 * no se pierde nada; y si no se leyera, la aporta el catálogo al casar el modelo.
 *
 * ⚠️ El mismo efecto es de esperar en `placaOcrService` (la caldera), que sí
 * manda hasta dos fotos de contexto a propósito, porque en una caldera antigua la
 * marca suele estar solo en el frontal. Ahí el equilibrio es otro y no se ha
 * tocado; lo que de aquel servicio se usa en este botón es sobre todo la
 * POTENCIA, que va en la línea literal y sí sobrevive al contexto.
 *
 * ── REGLA: UNA LECTURA POR UNIDAD, nunca las dos placas en la misma ──────────
 * La unidad exterior y la interior son dos aparatos con dos placas y dos nºs de
 * serie que se parecen mucho. Mandarlas juntas es pedirle al modelo que decida
 * cuál es cuál, y confundirlas escribe en el CIFO el nº de serie del aparato
 * que no es. No hace falta que lo decida: el SLOT del que sale cada foto ya lo
 * dice, así que se lee cada unidad por separado y el modelo solo transcribe.
 *
 * ── REGLA: el modelo solo LEE; el EQUIPO lo decide el catálogo ───────────────
 * De un modelo del catálogo cuelgan el SCOP, el SEER y la ficha técnica que se
 * adjunta al certificado. Emparejar «lo que pone la placa» con «qué equipo del
 * catálogo es» NO lo hace el modelo: lo hace `casarConCatalogo()`, que compara
 * códigos normalizados y —esto es lo importante— **con dos candidatos no elige
 * ninguno**. Adivinar el modelo es declarar el SCOP de otra máquina.
 *
 * ── Y el SCOP NO se calcula aquí ────────────────────────────────────────────
 * Este servicio devuelve el `aerotermia_db_id`. El SCOP lo resuelve quien
 * aplica, con las MISMAS funciones del desplegable (`getScopFromModel` /
 * `getScopSeason` de `calculation.js`), para que un equipo rellenado por la
 * placa y otro elegido a mano no puedan dar números distintos.
 */

const driveService = require('./driveService');
const reformaUploadService = require('./reformaUploadService');
const supabase = require('./supabaseClient');
const { llamarGemini, SUBCARPETA_DOCS, limpia } = require('./placaOcrService');

//: Cuántas fotos de CADA placa se mandan a leer. El slot es `multiple` porque se
//: suben varias perspectivas de la misma etiqueta; cada imagen se paga y con
//: tres ya se ha visto todo lo que hay en ella.
const MAX_PLACAS = Number(process.env.PLACA_EQUIPO_MAX_FOTOS) || 3;
//: Y una del aparato entero SOLO SI NO HAY PLACA. Ver «la placa se lee SOLA».
const MAX_CONTEXTO = 1;
//: Cuántos equipos del catálogo se ofrecen a elegir cuando el código casa con
//: varios. Una ud. INTERIOR se monta con muchas exteriores distintas —medido en
//: 26RES060_167: diez—, así que el tope tiene que dar para ese caso o la lista se
//: queda corta justo cuando más falta hace.
const MAX_CANDIDATOS = 12;

/** Las dos unidades que se leen, con el slot de su placa y el de su contexto. */
const UNIDADES = [
    {
        id: 'exterior',
        etiqueta: 'unidad exterior',
        slotPlaca: 'FOTO_UNIDAD_EXTERIOR_PLACA',
        slotContexto: 'FOTO_UNIDAD_EXTERIOR',
    },
    {
        id: 'interior',
        etiqueta: 'unidad interior',
        slotPlaca: 'FOTO_UNIDAD_INTERIOR_PLACA',
        slotContexto: 'FOTO_UNIDAD_INTERIOR',
    },
];

const promptDe = (u) => `Eres un lector de PLACAS DE CARACTERÍSTICAS de bombas de calor (aerotermia) instaladas en viviendas españolas. Te doy fotos de la etiqueta de datos de la ${u.etiqueta.toUpperCase()} y, a veces, del aparato entero.

Todas las fotos son de LA MISMA máquina: la ${u.etiqueta}. No mezcles datos de aparatos distintos.

DEVUELVE, transcribiendo literalmente lo que veas:
- marca: el fabricante (DAIKIN, PANASONIC, MITSUBISHI, LG, SAMSUNG, TOSHIBA, BAXI, VAILLANT, SAUNIER DUVAL, THERMOR, ARISTON, GIATSU, HAIER, GREE, FUJITSU, HITACHI, BOSCH…). Puede estar en el frontal del aparato y no en la etiqueta.
- modelo: el código de modelo TAL CUAL está impreso, con sus guiones y sufijos (p. ej. "EPGA16DAV37", "WH-MDC07J3E5", "GIA-K12BPT3R32", "RAV-GV1601ATP-E", "WH-ADC0309K3E5"). Es el campo rotulado "MODEL", "MODELO", "MODEL NAME", "TYPE" o "TIPO". Cópialo entero, sin quitarle nada.
- numero_serie: el número de serie / "MFG.NO." / "SERIAL No." / "S/N" / "Nº SERIE" / "SERIAL NUMBER", sin espacios. Es el que identifica ESTE aparato concreto, no el modelo. null si no se lee con claridad.
- serie_texto: la LÍNEA COMPLETA Y LITERAL donde aparece ese número, con su rótulo y sus separadores, tal como está impresa (p. ej. "MFG.NO. : 1650773", "SERIAL No. 5624802034"). Cópiala entera; no la resumas.
- potencia_kw: la potencia calorífica nominal en kW si la placa la declara ("HEATING CAPACITY", "Pot. calorífica", "CAPACITY"), como número con punto decimal. null si no aparece.
- refrigerante: el gas refrigerante si aparece ("R32", "R410A", "R290", "R134a"). null si no.
- codigo_barras: si la etiqueta lleva un código largo bajo un código de barras y NO es el nº de serie, cópialo; si no, null.
- anio: el año de fabricación (4 cifras) si aparece, si no null.

REGLAS:
- NO inventes ni completes caracteres que no se lean con claridad: es preferible null a un valor adivinado. Un nº de serie adivinado se imprime en un certificado y en una declaración responsable.
- El MODELO y el Nº DE SERIE son cosas distintas y están uno al lado del otro: el modelo se repite en todos los aparatos iguales, el nº de serie es único. No los intercambies.
- NO confundas el nº de serie con el código de artículo, el nº de homologación CE, el PIN, el código de barras ni el número de lote.
- Copia el modelo con TODOS sus guiones, puntos y sufijos de letra o número: "WH-MDC07J3E5-1" no es lo mismo que "WH-MDC07J3E5".`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        marca: { type: 'STRING', nullable: true },
        modelo: { type: 'STRING', nullable: true },
        numero_serie: { type: 'STRING', nullable: true },
        serie_texto: { type: 'STRING', nullable: true },
        potencia_kw: { type: 'NUMBER', nullable: true },
        refrigerante: { type: 'STRING', nullable: true },
        codigo_barras: { type: 'STRING', nullable: true },
        anio: { type: 'INTEGER', nullable: true },
    },
};

// ── El nº de serie, decidido por el código ───────────────────────────────────
// MEDIDO sobre la placa de 26RES080_66 (DAIKIN ERLA16DAV37, «MFG.NO. : 1650773»),
// tres vueltas por combinación y `temperature: 0`:
//
//   1 foto (solo la placa)     sin pedir la línea → 3/3 aciertos
//   2 fotos (placa + aparato)  sin pedir la línea → 0/3   lee «1802773»
//   2 fotos (placa + aparato)  PIDIENDO la línea  → 3/3 aciertos
//
// O sea: la foto de contexto —que hace falta, porque la MARCA va en el frontal y
// no en la etiqueta— desvía la atención del modelo justo sobre los dígitos, y el
// fallo es SISTEMÁTICO, no un azar que se corrija repitiendo. Pedir la línea
// entera con su rótulo lo arregla del todo: transcribir una cadena con contexto
// es una tarea distinta de aislar siete cifras.
//
// Es la MISMA regla que `placaOcrService` ya aplica a la potencia: el modelo copia
// la línea literal y el número lo saca el código. Y esa línea es además la
// EVIDENCIA que se le enseña a quien revisa, para contrastarla sin abrir la foto.

//: Lo que en una placa rotula el nº de serie. Se quita para quedarse con el valor.
const RE_ROTULO = /^.*?(?:mfg\.?\s*n[oº°]?\.?|serial\s*(?:n[oº°]?\.?|number)|s\/?n|n[º°]\s*(?:de\s*)?serie|seriennummer)\s*[:.\-]?\s*/i;

/**
 * El nº de serie que se escribe, a partir de la línea literal y del número que
 * el modelo aisló por su cuenta.
 *
 * Manda la LÍNEA, que es la transcripción con contexto. Si los dos coinciden no
 * hay nada que decir; si difieren se avisa, porque entonces una de las dos
 * lecturas es mala y quien revisa tiene que mirar la foto.
 *
 * @returns {{serie:string|null, texto:string|null, aviso:string|null}}
 */
function serieDesdeTexto(linea, suelto) {
    const limpiar = (v) => String(v || '').trim().replace(/\s+/g, '');
    const nSuelto = limpiar(suelto) || null;
    const bruto = String(linea || '').trim();
    if (!bruto) return { serie: nSuelto, texto: null, aviso: null };

    // ⚠️ NO se corta por el primer espacio. Un nº de serie puede venir escrito por
    // bloques y los espacios son suyos: la placa de 26RES080_79 pone
    // «S/N:1KK018 038JAP D8D5BJF 0134», y quedarse con «1KK018» deja el número a
    // un cuarto. Se toma todo lo que sigue al rótulo.
    const restoNorm = limpiar(bruto.replace(RE_ROTULO, ''));

    // Lo que cuenta es si las DOS lecturas dicen lo mismo, y para eso basta con
    // que el número aislado aparezca dentro de la línea. Cuando concuerdan manda el
    // aislado: es el mismo dato ya sin el rótulo ni lo que venga detrás.
    if (nSuelto && restoNorm.toUpperCase().includes(nSuelto.toUpperCase())) {
        return { serie: nSuelto, texto: bruto, aviso: null };
    }
    if (!nSuelto) return { serie: restoNorm || null, texto: bruto, aviso: null };
    if (!restoNorm) return { serie: nSuelto, texto: bruto, aviso: null };

    // Discrepan de verdad: una de las dos lecturas es mala y no se puede saber
    // cuál sin mirar la foto. Se propone la de la LÍNEA, que es la transcripción
    // con contexto, y se dice.
    return {
        serie: restoNorm, texto: bruto,
        aviso: `El nº de serie no se ha leído igual las dos veces: en la línea «${bruto}» pone `
            + `«${restoNorm}», pero el lector ha aislado «${nSuelto}». Se propone el de la línea — `
            + 'compruébalo en la foto antes de aplicarlo: va impreso en el CIFO y en el Anexo I.',
    };
}

// ── El cruce con el catálogo ─────────────────────────────────────────────────

//: Los códigos de modelo se escriben de mil formas entre la placa, el catálogo y
//: quien los teclea: "WH-MDC07J3E5", "WH MDC07J3E5", "whmdc07j3e5". Lo que los
//: identifica son sus letras y sus cifras, no sus separadores.
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

//: Los campos del catálogo contra los que se compara un código leído, en orden
//: de FUERZA: la ud. exterior es la que identifica el equipo (es la máquina que
//: lleva el compresor y la que el fabricante referencia), y `modelo_comercial`
//: es el último recurso porque a menudo es una frase ("Aquarea High Performance
//: Serie M R290 All in One") y no un código.
const CAMPOS = ['modelo_ud_exterior', 'modelo_ud_interior', 'modelo_conjunto', 'modelo_comercial'];

const SELECT_CATALOGO = 'id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, '
    + 'modelo_ud_interior, potencia_calefaccion, tipo, deposito_acs_incluido';

/**
 * ¿Casa un código leído con uno del catálogo?
 *
 * Exacto siempre. Y por PREFIJO solo cuando uno es el otro más un sufijo corto:
 * el catálogo guarda la Panasonic como `WH-MDC07J3E5` y su placa dice
 * `WH-MDC07J3E5-1`, que es el mismo aparato con la revisión detrás.
 *
 * ⚠️ Un código puramente NUMÉRICO no casa nunca por prefijo. THERMOR referencia
 * sus unidades exteriores con seis cifras (`526672`, `527038`): ahí un prefijo
 * emparejaría dos equipos distintos cuyo número empieza igual, y de paso podría
 * morder un trozo de nº de serie.
 */
function casan(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y || x.length < 4) return false;
    if (x === y) return true;
    if (/^\d+$/.test(x) || /^\d+$/.test(y)) return false;
    const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
    return corto.length >= 6 && largo.startsWith(corto) && largo.length - corto.length <= 2;
}

/**
 * Qué equipo del catálogo es el que dicen las placas.
 *
 * @param {object} ext  lo leído de la unidad exterior (puede ser null)
 * @param {object} int  lo leído de la unidad interior (puede ser null)
 * @returns {Promise<{modelo:object|null, por:string|null, candidatos:object[], aviso:string|null}>}
 */
async function casarConCatalogo(ext, int) {
    // Los códigos que se buscan, del más identificativo al menos. El de la ud.
    // exterior manda: es el que el fabricante usa para referenciar el equipo.
    const busquedas = [
        { codigo: ext?.modelo, de: 'el modelo de la unidad exterior' },
        { codigo: int?.modelo, de: 'el modelo de la unidad interior' },
    ].filter((b) => norm(b.codigo).length >= 4);

    if (!busquedas.length) {
        return { modelo: null, por: null, candidatos: [], aviso: null };
    }

    // El catálogo son 490 filas de campos cortos; se filtra por marca cuando se
    // ha leído una, y si no se trae entero. Nunca se pide `ficha_tecnica_partes`
    // ni ningún otro JSONB (regla 22).
    const marca = limpia(ext?.marca) || limpia(int?.marca) || null;
    let query = supabase.from('aerotermia').select(SELECT_CATALOGO);
    if (marca) query = query.ilike('marca', `%${String(marca).trim()}%`);
    let { data: filas, error } = await query;
    if (error) throw new Error(`No se pudo leer el catálogo de aerotermia: ${error.message}`);

    // Una marca que no case (la placa dice "PANASONIC CORPORATION", el catálogo
    // "PANASONIC") no puede dejar sin buscar: se reintenta sobre el catálogo
    // entero antes de darse por vencido.
    if (marca && !(filas || []).length) {
        const todo = await supabase.from('aerotermia').select(SELECT_CATALOGO);
        if (todo.error) throw new Error(`No se pudo leer el catálogo de aerotermia: ${todo.error.message}`);
        filas = todo.data;
    }

    for (const { codigo, de } of busquedas) {
        for (const campo of CAMPOS) {
            const hit = (filas || []).filter((f) => casan(codigo, f[campo]));
            if (!hit.length) continue;

            let finalistas = hit;
            let porQue = `${de} («${codigo}»)`;

            // DESEMPATE POR LA OTRA UNIDAD. Una misma unidad exterior se vende con
            // varias interiores —medido en 26RES080_66: el DAIKIN ERLA16DAV37 casa
            // con CINCO filas, que solo se diferencian en la interior—, así que sin
            // esto el cruce no sirve justo con la marca más común. Lo que distingue
            // esas filas es el otro código, y lo tenemos leído de su propia placa.
            if (finalistas.length > 1) {
                const otro = campo === 'modelo_ud_interior' ? ext?.modelo : int?.modelo;
                const contra = campo === 'modelo_ud_interior' ? 'modelo_ud_exterior' : 'modelo_ud_interior';
                const afinado = norm(otro) ? finalistas.filter((f) => casan(otro, f[contra])) : [];
                // Solo si deja EXACTAMENTE uno. Si no casa ninguno, la ambigüedad
                // sigue en pie: que la otra placa no cuadre con el catálogo no
                // autoriza a elegir por el usuario.
                if (afinado.length === 1) {
                    finalistas = afinado;
                    porQue = `el par de unidades («${codigo}» + «${otro}»)`;
                }
            }

            const ids = [...new Set(finalistas.map((f) => f.id))];
            if (ids.length > 1) {
                // REGLA — con dos candidatos NO se elige. De un modelo cuelgan el
                // SCOP y la ficha técnica que se adjunta al certificado: coger el
                // primero es declarar el rendimiento de otra máquina. Se devuelven
                // para que los elija una persona de un clic, que es la diferencia
                // entre un callejón sin salida y una elección.
                // El tope y el número que se anuncia tienen que ser el MISMO: decir
                // «casa con 10» y listar 8 deja al usuario buscando dos que no están.
                const ofrecidos = finalistas.slice(0, MAX_CANDIDATOS);
                const recortada = ids.length > ofrecidos.length;
                return {
                    modelo: null, por: null, candidatos: ofrecidos,
                    aviso: `«${codigo}» casa con ${ids.length} equipos del catálogo, que solo se `
                        + 'diferencian en la otra unidad. Elige cuál es: no se puede adivinar.'
                        + (recortada ? ` Se ofrecen los ${ofrecidos.length} primeros; si no está ahí, `
                            + 'elígelo en el desplegable de Instalación.' : ''),
                };
            }
            return {
                modelo: finalistas[0], por: porQue, candidatos: finalistas, aviso: null,
            };
        }
    }

    const leidos = busquedas.map((b) => `«${b.codigo}»`).join(' / ');
    return {
        modelo: null, por: null, candidatos: [],
        aviso: `${leidos} no está en el catálogo de aerotermia${marca ? ` de ${marca}` : ''}: `
            + 'el equipo se rellena con lo leído, pero el SCOP hay que elegirlo a mano '
            + '(o dar de alta el modelo en el catálogo).',
    };
}

// ── Las fotos, desde Drive ───────────────────────────────────────────────────

const IMG_EXT = /\.(jpe?g|png|webp|heic|heif|bmp|tiff?)$/i;
const esImagen = (f) => (f.mimeType || '').startsWith('image/') || IMG_EXT.test(f.name || '');
const mimeDe = (f) => ((f.mimeType || '').startsWith('image/') ? f.mimeType : 'image/jpeg');

/** Los ficheros de un slot que hay en la carpeta, por el MISMO criterio de nombre con que se subieron. */
function delSlot(ficheros, slot) {
    return ficheros
        .filter((f) => reformaUploadService.fileBelongsToSlot(f.name, slot))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
}

/**
 * Lee las placas de la bomba de calor que haya en la carpeta del expediente.
 *
 * Drive es la fuente de verdad de qué ficheros hay (regla 20): no se mira
 * `reforma_uploads`.
 *
 * @param {string} driveFolderId  carpeta del expediente
 * @returns {Promise<{unidades:object, fotos:object[], avisos:string[], sin_fotos:boolean}>}
 */
async function leerPlacasAerotermia(driveFolderId) {
    const avisos = [];
    if (!driveFolderId) return { unidades: {}, fotos: [], avisos: ['El expediente no tiene carpeta de Drive.'], sin_fotos: true };

    const subfolderId = await driveService.findSubfolderByName(driveFolderId, SUBCARPETA_DOCS);
    if (!subfolderId) return { unidades: {}, fotos: [], avisos: [`No existe la carpeta «${SUBCARPETA_DOCS}».`], sin_fotos: true };

    const ficheros = (await driveService.listFiles(subfolderId) || []).filter(esImagen);

    // Qué hay de cada unidad, ANTES de llamar a nadie: una unidad sin fotos no se
    // manda a leer. Cada llamada se paga, y una petición con cero imágenes solo
    // puede devolver una alucinación.
    const plan = UNIDADES.map((u) => {
        const placas = delSlot(ficheros, u.slotPlaca).slice(0, MAX_PLACAS);
        return {
            u,
            placas,
            // La placa se lee SOLA: la foto del aparato entero solo entra si no
            // hay etiqueta que leer (ver arriba — con ella el nº de serie salía
            // mal 6 de 6 veces).
            contexto: placas.length ? [] : delSlot(ficheros, u.slotContexto).slice(0, MAX_CONTEXTO),
        };
    }).filter((p) => p.placas.length || p.contexto.length);

    if (!plan.length) {
        return {
            unidades: {}, fotos: [], sin_fotos: true,
            avisos: ['No hay ninguna foto de la bomba de calor ni de sus placas en el expediente. '
                + 'Las sube el instalador desde su enlace, en «la pegatina de la máquina de fuera».'],
        };
    }

    // Falta justo la placa de la que sale el dato que imprimen el CIFO, el Anexo I
    // y la memoria RITE. Se dice aquí y no al generar el documento: aquí es donde
    // se puede hacer algo —pedírsela al instalador—, y sin este aviso el hueco se
    // queda sin explicación en medio de lo que sí se ha rellenado.
    if (!plan.some((p) => p.u.id === 'exterior')) {
        avisos.push('No hay foto de la placa de la UNIDAD EXTERIOR: su nº de serie es el que '
            + 'imprimen el CIFO y el Anexo I, y ése se queda sin rellenar. Pídesela al instalador '
            + '(«la pegatina de la máquina de fuera»); lo demás sí se ha leído.');
    }

    const unidades = {};
    const fotos = [];

    for (const { u, placas, contexto } of plan) {
        if (!placas.length) {
            avisos.push(`De la ${u.etiqueta} solo hay foto del aparato, no de su PLACA: `
                + 'el nº de serie casi seguro no se lee. Pídele al instalador la etiqueta de cerca.');
        }

        const imgs = [];
        for (const f of [...placas, ...contexto]) {
            // eslint-disable-next-line no-await-in-loop
            const buffer = await driveService.getFileContent(f.id).catch(() => null);
            if (buffer?.length) imgs.push({ name: f.name, buffer, mimeType: mimeDe(f) });
        }
        if (!imgs.length) {
            avisos.push(`Las fotos de la ${u.etiqueta} están en Drive pero no se han podido descargar.`);
            continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const bruto = await llamarGemini(imgs, {
            prompt: promptDe(u), schema: SCHEMA, etiqueta: `placaEquipo:${u.id}`,
        });

        // El nº de serie sale de la LÍNEA literal, no del número que el modelo
        // aisló: medido, con la foto de contexto delante se equivoca 3 de 3 veces
        // aislándolo y acierta 3 de 3 copiando la línea entera (ver arriba).
        const serie = serieDesdeTexto(bruto?.serie_texto, bruto?.numero_serie);
        if (serie.aviso) avisos.push(`${u.etiqueta}: ${serie.aviso}`);

        unidades[u.id] = {
            marca: limpia(bruto?.marca)?.toUpperCase() || null,
            modelo: limpia(bruto?.modelo)?.toUpperCase() || null,
            numero_serie: serie.serie || null,
            serie_texto: serie.texto,
            potencia_kw: Number(bruto?.potencia_kw) > 0 ? Number(bruto.potencia_kw) : null,
            refrigerante: limpia(bruto?.refrigerante)?.toUpperCase() || null,
            anio: Number(bruto?.anio) > 2000 && Number(bruto?.anio) <= new Date().getFullYear() + 1
                ? Number(bruto.anio) : null,
        };
        fotos.push(...imgs.map((i) => ({ name: i.name, unidad: u.id })));

        if (!unidades[u.id].numero_serie) {
            avisos.push(`En las fotos de la ${u.etiqueta} no se lee el nº de serie. `
                + 'Es el dato que va al CIFO y al Anexo I: compruébalo a mano.');
        }
    }

    return { unidades, fotos, avisos, sin_fotos: !Object.keys(unidades).length };
}

module.exports = {
    leerPlacasAerotermia, casarConCatalogo, casan, norm, serieDesdeTexto, UNIDADES,
};
