/**
 * serieDePlaca — El NÚMERO DE SERIE de una placa, decidido por el CÓDIGO.
 *
 * Lo comparten los dos lectores de placas —la caldera que se retira
 * (`placaOcrService`) y la bomba de calor que se pone (`placaEquipoOcrService`)—,
 * porque el problema es el mismo y el dato es el que más pesa: el nº de serie va
 * impreso en el CIFO, en el Anexo I y en la memoria RITE.
 *
 * ── REGLA: el modelo LEE; qué es el nº de serie lo decide el código ─────────
 * Se le pide al modelo su nº de serie Y, aparte, TODOS los códigos largos que vea
 * con su rótulo y dónde están (junto a un código de barras, un QR, en la tabla).
 * Con eso el código decide, y de forma reproducible:
 *
 *   1. lo que el lector propone, salvo que sea un código de PRODUCTO, un EAN, el
 *      propio MODELO o uno de los EJEMPLOS del prompt;
 *   2. si no, lo rotulado como nº de serie («SN», «MFG.NO.», «Nº fabricación»…);
 *   3. si no, lo impreso SIN RÓTULO junto a un código de barras o un QR.
 *
 * ── Por qué existe (medido el 30/09/2026 sobre 37 placas de ud. exterior) ────
 * El prompt anterior decía que el texto bajo un código de barras NUNCA era el nº
 * de serie, y en muchas marcas lo es: la LASIAN AERIA HT 12 de 26RES093_11 lo
 * lleva así, sin rótulo («8D00260116160057»), y las Aerosun bajo un QR
 * («IN2601309004-053»). Salían en blanco. Y al revés: en las Sime el lector
 * cogía el «CODICE 8119208» de la tabla, que es el código de ARTÍCULO —el mismo en
 * todas las máquinas del modelo—, en vez de la pegatina «SN: 540J0268…».
 *
 * ⚠️ NINGÚN PROMPT PUEDE LLEVAR UN Nº DE SERIE REAL DE EJEMPLO. Medido: con un
 * ejemplo realista en el prompt, el modelo lo DEVOLVIÓ como nº de serie de otra
 * máquina (26RES060_151 salió con el de 26RITE_001, y con razonamiento activado
 * pasó en tres placas más). Los ejemplos van como marcadores evidentes
 * (`EJEMPLOS_SERIE`) y el código rechaza cualquier lectura que coincida con uno.
 */

//: Los ejemplos que llevan los prompts. Son marcadores a propósito —ninguna placa
//: los trae— y por eso una lectura que coincida con uno es una copia del prompt,
//: nunca un dato. Se interpolan en el texto desde aquí para que la lista y el
//: prompt no puedan divergir.
const EJEMPLOS_SERIE = ['1234567', 'ABC0123456789', 'XY1234567-001'];

//: Un rótulo de nº de serie, en los idiomas en que llegan las placas (español,
//: inglés, francés, italiano, alemán). «Nº de fabricación» y «Matricola» son el nº
//: de serie en las calderas.
const RE_SERIE = new RegExp([
    'mfg\\.?\\s*n',
    'serial',
    '\\bs\\s*[\\/.]\\s*n\\b', '\\bsn\\b',
    's[eé]rie',                       // nº serie, n° de série, número de serie, ser.
    '\\bser\\.?\\s*n',
    'seriennummer', 'serien[\\s-]*nr',
    'matr(?:\\.|icola|[íi]cula)',
    // Nº fabricación, N. Fabric. — pero NO «N.R.I. FABRICANTE», que es el
    // registro del fabricante y va en muchas placas de caldera justo debajo.
    'fabric(?!ant)',
    'fabr\\.?\\s*-?\\s*nr',
].join('|'), 'i');

//: Un rótulo de código de PRODUCTO: lo mismo en todas las máquinas del modelo, o
//: un registro/certificado. Nunca el nº de serie.
const RE_PRODUCTO = new RegExp([
    '\\bcod(?:e|ice|igo|\\.|\\b)', 'c[óo]d(?:igo|\\.|\\b)', 'артикул',
    '\\bart(?:\\.|[íi]culo|icle|ikel|\\b)', '\\bref(?:\\.|erencia|erence|\\b)',
    '\\bp\\s*\\/\\s*n\\b', 'part\\s*n', '\\bitem\\b', '\\bean\\b', '\\bupc\\b',
    '\\btipo\\b', '\\btype\\b', 'homolog', 'certificad', 'registro', 'contrase[ñn]a',
    '\\bpin\\b', '\\blot(?:e|\\b)', 'batch', 'n\\.?\\s*r\\.?\\s*i\\b', '\\bmodel',
].join('|'), 'i');

//: Lo que rotula el nº de serie, para quitarlo y quedarse con el valor. El último
//: caso es un «N»/«Nº» suelto AL PRINCIPIO seguido de cifras («N 18247»): en las
//: placas gastadas el º no se lee.
const RE_QUITA_ROTULO = /^.*?(?:mfg\.?\s*n[oº°]?\.?|serial\s*(?:n[oº°]?\.?|number|nr\.?)?|s\s*[/.]?\s*n\b|(?:n[º°o]?\.?|n[úu]m(?:ero|\.)?)\s*(?:de\s*|di\s*)?(?:s[eé]rie|fabric(?!ant)(?:aci[óo]n|\.)?)(?:\s*(?:y|e)\s*a[ñn]o)?|ser\.?\s*n\.?|seriennummer|matr(?:\.|icola|[íi]cula)|^\s*n[º°o]?\.?\s+(?=\d))\s*[:.\-]?\s*/i;

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const sinEspacios = (v) => String(v || '').trim().replace(/\s+/g, '');

/**
 * ¿Es un código de producto GTIN (EAN-13, EAN-8 o UPC-A)?
 *
 * Solo cifras —con los espacios con que se imprimen bajo las barras—, 8, 12 o 13,
 * con su dígito de control bien. Va bajo el código de barras del PRODUCTO y es el
 * mismo en todas las máquinas del modelo. Un nº de serie numérico pasa la suma de
 * control una vez de cada diez, así que quien llama solo lo usa sobre lo que NO
 * va rotulado como nº de serie.
 */
function esGtin(texto) {
    const d = String(texto || '').replace(/[\s-]/g, '');
    if (!/^\d+$/.test(d) || ![8, 12, 13].includes(d.length)) return false;
    const cuerpo = d.slice(0, -1);
    const suma = [...cuerpo].reverse().reduce((s, c, i) => s + Number(c) * (i % 2 ? 1 : 3), 0);
    return (10 - (suma % 10)) % 10 === Number(d[d.length - 1]);
}

/** Compatibilidad: así se llamaba cuando solo miraba el EAN-13. */
function esEan13(texto) {
    const t = String(texto || '').trim();
    if (!t || RE_SERIE.test(t)) return false;
    return String(t).replace(/[\s-]/g, '').length === 13 && esGtin(t);
}

/**
 * El nº de serie a partir de la LÍNEA literal y del número que el modelo aisló.
 *
 * Manda la línea, que es la transcripción con contexto. Si los dos coinciden no
 * hay nada que decir; si difieren se avisa. ⚠️ NO se corta por el primer espacio:
 * un nº de serie puede ir por bloques («S/N:1KK018 038JAP D8D5BJF 0134»).
 *
 * @returns {{serie:string|null, texto:string|null, aviso:string|null}}
 */
function serieDesdeTexto(linea, suelto) {
    // El número aislado también llega a veces con su rótulo pegado («Número
    // fabricación 2-88-00058»): se le quita igual que a la línea.
    const nSuelto = sinEspacios(String(suelto || '').replace(RE_QUITA_ROTULO, '')) || null;
    const bruto = String(linea || '').trim();
    if (!bruto) return { serie: nSuelto, texto: null, aviso: null };

    const restoNorm = sinEspacios(bruto.replace(RE_QUITA_ROTULO, ''));
    if (nSuelto && restoNorm.toUpperCase().includes(nSuelto.toUpperCase())) {
        return { serie: nSuelto, texto: bruto, aviso: null };
    }
    // El aislado lleva delante un rótulo de una a tres letras que la línea separa
    // («N18247» frente a «N 18247»): es la misma lectura, sin el rótulo.
    if (nSuelto && restoNorm && nSuelto.toUpperCase().endsWith(restoNorm.toUpperCase())
        && /^[A-Za-zºª°.]{1,3}$/.test(nSuelto.slice(0, nSuelto.length - restoNorm.length))) {
        return { serie: restoNorm, texto: bruto, aviso: null };
    }
    if (!nSuelto) return { serie: restoNorm || null, texto: bruto, aviso: null };
    if (!restoNorm) return { serie: nSuelto, texto: bruto, aviso: null };
    return {
        serie: restoNorm, texto: bruto,
        aviso: `El nº de serie no se ha leído igual las dos veces: en la línea «${bruto}» pone `
            + `«${restoNorm}», pero el lector ha aislado «${nSuelto}». Se propone el de la línea — `
            + 'compruébalo en la foto antes de aplicarlo: va impreso en el CIFO y en el Anexo I.',
    };
}

/**
 * Qué es un código leído: 'serie' | 'producto' | 'modelo' | 'ejemplo' | 'barras' |
 * 'suelto' | 'invalido'.
 */
function claseDe({ valor, texto, rotulo, junto_a: junto }, modelo) {
    const n = norm(valor);
    if (n.length < 4 || n.length > 40 || !/\d/.test(n)) return 'invalido';
    if (EJEMPLOS_SERIE.some((e) => norm(e) === n)) return 'ejemplo';
    if (modelo && norm(modelo) === n) return 'modelo';
    const rot = `${rotulo || ''} ${texto || ''}`;
    if (RE_SERIE.test(rot)) return 'serie';
    if (RE_PRODUCTO.test(rotulo || '') || esGtin(texto || valor)) return 'producto';
    if (/barras|barcode|qr/i.test(String(junto || ''))) return 'barras';
    return 'suelto';
}

/**
 * El nº de serie de UNA lectura del modelo.
 *
 * @param {object} bruto  { numero_serie, serie_texto, serie_junto_a, codigos:[{texto, rotulo, junto_a}] }
 * @param {{modelo?:string}} [ctx]  el modelo leído, para no tomarlo por nº de serie
 * @returns {{serie:string|null, texto:string|null, origen:string|null, aviso:string|null}}
 */
function elegirSerie(bruto, { modelo = null } = {}) {
    const b = bruto || {};
    const avisos = [];
    const codigos = (Array.isArray(b.codigos) ? b.codigos : [])
        .filter((c) => c && String(c.texto || '').trim())
        .map((c) => {
            const texto = String(c.texto).trim();
            const valor = sinEspacios(texto.replace(RE_QUITA_ROTULO, ''));
            const item = { valor, texto, rotulo: String(c.rotulo || '').trim(), junto_a: c.junto_a || null };
            return { ...item, clase: claseDe(item, modelo) };
        });

    // Los valores que la PROPIA placa rotula como código de producto. Si el lector
    // propone uno de ellos como nº de serie —pasa: la Sime de 26RES060_170 salió
    // con «SN: 8119208», que es su «CODICE 8119208»—, no es un nº de serie.
    const deProducto = new Set(codigos.filter((c) => c.clase === 'producto').map((c) => norm(c.valor)));

    // 1 · Lo que propone el lector.
    const s = serieDesdeTexto(b.serie_texto, b.numero_serie);
    if (s.serie) {
        // La línea literal hace de rótulo: si lo que la encabeza es de un código de
        // producto («N.R.I. FABRICANTE: 20-17338-SS», «Cód. iden. tipo…»), lo es.
        const item = { valor: s.serie, texto: s.texto || s.serie, rotulo: s.texto || '', junto_a: b.serie_junto_a };
        const clase = claseDe(item, modelo);
        if (clase === 'ejemplo') {
            avisos.push(`Lo leído como nº de serie («${s.serie}») es el EJEMPLO del lector, no un dato `
                + 'de esta placa: se descarta.');
        } else if (clase === 'producto' || deProducto.has(norm(s.serie))) {
            avisos.push(`Lo leído como nº de serie («${s.texto || s.serie}») es un código de PRODUCTO `
                + '(el mismo en todas las máquinas del modelo), no el nº de serie: se descarta.');
        } else if (clase === 'modelo') {
            avisos.push(`Lo leído como nº de serie («${s.serie}») es el MODELO: se descarta.`);
        } else if (clase !== 'invalido') {
            return {
                serie: s.serie, texto: s.texto, aviso: [...avisos, s.aviso].filter(Boolean).join(' ') || null,
                origen: /barras|barcode|qr/i.test(String(b.serie_junto_a || '')) && !RE_SERIE.test(s.texto || '')
                    ? 'barras' : 'lector',
            };
        }
    }

    // 2 · Lo rotulado como nº de serie.  3 · Lo impreso sin rótulo junto a unas
    // barras o un QR — en muchas marcas ES el nº de serie, y no lleva rótulo.
    const elegido = codigos.find((c) => c.clase === 'serie' && !deProducto.has(norm(c.valor)))
        || codigos.find((c) => c.clase === 'barras' && !deProducto.has(norm(c.valor)));
    if (elegido) {
        return {
            serie: elegido.valor,
            texto: elegido.rotulo && !elegido.texto.toUpperCase().includes(elegido.rotulo.toUpperCase())
                ? `${elegido.rotulo} ${elegido.texto}` : elegido.texto,
            origen: elegido.clase === 'serie' ? 'rotulo' : 'barras',
            aviso: avisos.join(' ') || null,
        };
    }
    return { serie: null, texto: null, origen: null, aviso: avisos.join(' ') || null };
}

/**
 * Junta DOS lecturas independientes del mismo nº de serie (dos modelos distintos).
 *
 * Repetir la MISMA lectura no sirve —falla igual las dos veces—, pero dos modelos
 * distintos se equivocan en sitios distintos: cuando coinciden, casi siempre
 * aciertan, y cuando discrepan es justo donde hay un carácter dudoso (una racha de
 * ceros, un 5 que parece un 6). Ahí NO se elige por el usuario: se proponen las dos
 * y la decide una persona mirando la foto.
 *
 * @param {object} a  elegirSerie() de la lectura principal (o null si falló)
 * @param {object} b  elegirSerie() de la otra (o null si falló)
 * @returns {{serie, texto, origen, confirmada:boolean, dudosa:boolean, alternativas:object[], aviso:string|null}}
 */
function combinarSeries(a, b) {
    const va = a?.serie || null;
    const vb = b?.serie || null;
    const aviso = (...x) => x.filter(Boolean).join(' ') || null;
    if (!va && !vb) {
        return { serie: null, texto: null, origen: null, confirmada: false, dudosa: false, alternativas: [], aviso: aviso(a?.aviso, b?.aviso) };
    }
    if (va && vb && norm(va) === norm(vb)) {
        return { ...a, confirmada: true, dudosa: false, alternativas: [], aviso: a.aviso || null };
    }
    if (!va || !vb) {
        // Solo una de las dos lo ha encontrado. Se propone —suele ser la que lo ha
        // visto en una pegatina aparte—, sin dar por confirmado.
        const x = va ? a : b;
        return { ...x, confirmada: false, dudosa: false, alternativas: [], aviso: x.aviso || null };
    }
    return {
        ...a, confirmada: false, dudosa: true,
        alternativas: [
            { serie: va, texto: a.texto || va },
            { serie: vb, texto: b.texto || vb },
        ],
        aviso: `Dos lecturas del nº de serie no coinciden: «${va}» y «${vb}». No se escribe `
            + 'solo: elige cuál es mirando la foto — va impreso en el CIFO y en el Anexo I.',
    };
}

/**
 * Las instrucciones del nº de serie que llevan los DOS prompts. Una sola copia:
 * son la parte que más se equivoca y no puede decir cosas distintas según la placa.
 */
function reglasSerie({ codigos = true } = {}) {
    const [e1, e2, e3] = EJEMPLOS_SERIE;
    const lista = codigos ? `
- codigos: los DEMÁS códigos alfanuméricos de 6 o más caracteres que se lean en la etiqueta o en las pegatinas junto a ella (el de debajo de cada código de barras o QR, el código de artículo, el EAN, el de registro…), cada uno con "texto" (tal cual), "rotulo" (el que lo acompaña: "SN", "CODE", "CODICE", "Código", "Art.", "Cód. iden. tipo", "Registro de tipo", o "" si no lleva) y "junto_a" ("codigo_barras", "qr", "tabla" u "otro"). NO incluyas el modelo, potencias, presiones, medidas ni fechas.` : '';
    return `- numero_serie: el NÚMERO DE SERIE de ESTE aparato concreto, sin espacios y SIN su rótulo. null si no se lee con claridad.
- serie_texto: la LÍNEA LITERAL donde aparece, con su rótulo si lo lleva ("MFG.NO. : ${e1}", "SN: ${e2}", "Nº fabricación ${e1}"). Si va solo, sin rótulo, junto a un código de barras o un QR, copia solo el número.
- serie_junto_a: dónde está: "rotulo" (en una línea rotulada como nº de serie), "codigo_barras", "qr" u "otro".${lista}

DÓNDE ESTÁ EL Nº DE SERIE — es lo que más se confunde:
- A menudo NO está en la tabla de características sino en una PEGATINA APARTE con un código de barras o un QR, con el número impreso debajo o al lado, con o sin «SN:» delante (p. ej. "${e3}" bajo un QR). Si ninguna línea de la placa está rotulada como nº de serie, ESE número impreso junto a las barras o al QR es el nº de serie.
- Si una línea está rotulada «SN», «S/N», «SERIAL», «SERIAL No.», «MFG.NO.», «Nº SERIE», «N° de série», «Matricola», «Nº de fabricación» o «N. Fabric.», ésa manda.
- NO son el nº de serie: el «CODE»/«CODICE»/«Código»/«Art.»/«Ref.» de la tabla (el código de ARTÍCULO, igual en todas las máquinas del modelo), el EAN del producto (13 cifras agrupadas 1-6-6 bajo otro código de barras, a menudo en la misma pegatina), el nº de homologación CE (0063…, 0085…), el «Registro de tipo» (FAC-…), el «Cód. iden. tipo», el PIN ni el lote.
- Copia cada carácter tal cual y cuenta los ceros UNO A UNO: una racha de ceros ("000") es donde más se falla.
- La foto puede estar girada: léela igual.
- NO inventes ni completes caracteres: mejor null que un número adivinado, que se imprime en un certificado. Los ejemplos de estas instrucciones NO son datos de ninguna placa: no los copies.`;
}

//: El trozo de esquema del nº de serie. Se añade a las propiedades de cada lector.
//: ⚠️ La lista de `codigos` va SOLO en la lectura del modelo nuevo: al de siempre
//: pedirle «todos los códigos» lo mete en BUCLE (medido el 30/09/2026: 10 de 43
//: placas de caldera acababan en una ristra de saltos de línea hasta el tope), y
//: sin ella no lo hacía nunca. Así que ése lee lo de antes y hace de CONTRASTE.
const SCHEMA_SERIE_BASE = {
    numero_serie: { type: 'STRING', nullable: true },
    serie_texto: { type: 'STRING', nullable: true },
    serie_junto_a: { type: 'STRING', nullable: true },
};
const SCHEMA_SERIE = {
    numero_serie: { type: 'STRING', nullable: true },
    serie_texto: { type: 'STRING', nullable: true },
    serie_junto_a: { type: 'STRING', nullable: true },
    codigos: {
        type: 'ARRAY',
        items: {
            type: 'OBJECT',
            properties: {
                texto: { type: 'STRING' },
                rotulo: { type: 'STRING', nullable: true },
                junto_a: { type: 'STRING', nullable: true },
            },
            required: ['texto'],
        },
    },
};

module.exports = {
    EJEMPLOS_SERIE, RE_SERIE, RE_PRODUCTO, SCHEMA_SERIE, SCHEMA_SERIE_BASE,
    norm, esGtin, esEan13, serieDesdeTexto, claseDe, elegirSerie, combinarSeries, reglasSerie,
};
