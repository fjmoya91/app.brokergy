/**
 * paredOcrService — Lee una FOTO DE UN CERRAMIENTO y dice qué hay en él.
 *
 * Dos trabajos distintos, y por eso dos prompts:
 *
 *   · FACHADA (`leerFachada`)  → CUÁNTOS huecos hay en esa pared y dónde caen.
 *     Es el dato que hoy está en blanco: el certificador los cuenta a ojo sobre
 *     una foto que ya lleva meses en Drive, y si no la mira, la pared se queda
 *     con los huecos que sabe Catastro — o sea, ninguno.
 *   · HUECO (`leerHueco`)      → QUÉ ES esa ventana: carpintería, acristalamiento,
 *     persiana, tipo de apertura. Nada de eso lo sabe Catastro y todo ello se
 *     teclea en CE3X.
 *
 * ── REGLA: el modelo NO da metros. Los metros los pone el código ─────────────
 * Una foto no tiene escala, y un metraje inventado por un modelo acaba siendo
 * una superficie de huecos dentro de un certificado sin que nadie sepa de dónde
 * salió. Al modelo se le piden CAJAS (`box_2d`, el formato de detección en el
 * que está calibrado) y los metros los pone `aMetros()`.
 *
 * ── REGLA: la escala es la PUERTA DE ENTRADA, no el ancho de la pared ────────
 * Esto es lo contrario de lo que parece, y está medido sobre la fachada de
 * 26RES060_186 (10,94 m). Dos motivos:
 *
 *   1. La fachada NUNCA ocupa el encuadre exacto. Hay cielo, acera, la casa del
 *      vecino. Tomar el ancho de la foto por el ancho de la pared mete un error
 *      de escala que nadie puede acotar.
 *   2. El modelo SOBREESTIMA las cajas de forma sistemática (~1,5×: dio la
 *      puerta a 0,117 × 0,371 cuando en la imagen es 0,082 × 0,223). Pero lo
 *      hace de forma CONSISTENTE, así que las proporciones ENTRE huecos sí son
 *      buenas — y una referencia que está DENTRO de la misma foto cancela ese
 *      sesgo entero.
 *
 * Con la puerta como referencia (2,05 m de alto), la ventana de esa fachada sale
 * a 1,39 m de ancho y 1,37 m de alto por dos caminos independientes, que es
 * exactamente lo que se ve. Con el ancho de la pared salía a 2,4 m.
 *
 * ── REGLA: el largo de la pared VALIDA, no escala ───────────────────────────
 * Es el dato duro que tiene la app —lo midió el motor sobre la cartografía— y
 * por eso sirve para lo que sirve un dato duro: comprobar. Si los huecos leídos
 * suman más que la pared, o si el ancho de fachada que sale de la escala no se
 * parece a lo que midió el motor, la lectura no vale y se dice. Mismo criterio
 * que contrastar la suma de un informe de verificación con el total que él mismo
 * declara.
 *
 * ── REGLA: lo leído nace DUDOSO ─────────────────────────────────────────────
 * Ni la mejor lectura de una foto en perspectiva es un metro. `dudoso` es el
 * estado ámbar que la pantalla YA tiene, que el titular YA cuenta («6 con medida
 * por confirmar») y que YA se cierra con un clic en «✓ OK». No hace falta un
 * estado nuevo: hace falta que esto entre por el que existe.
 *
 * Gemelo de `placaOcrService`, del que reutiliza el cliente de Gemini entero
 * (`llamarGemini`): mismo proveedor, `temperature: 0` y los mismos reintentos
 * ante 429/500/503. Y como allí, LAS FOTOS VAN COMO FOTOS: una fachada no es un
 * documento, y meterla en un PDF la recomprime justo donde está el detalle que se
 * busca.
 *
 * ⚠️ Lo ÚNICO en lo que se separa de él: aquí el modelo PIENSA. Ver la nota de
 * `PENSAR`, que no es una preferencia — con el presupuesto a cero esta lectura no
 * responde nunca.
 */

const placaOcr = require('./placaOcrService');
const { llamarGemini, limpia } = placaOcr;

//: Lo que mide de alto la puerta de entrada de una vivienda, y la referencia de
//: escala de toda esta lectura: el hueco de obra es de 2,10 y la hoja, de 2,03.
//: Se usa el ALTO y no el ancho porque el alto casi no varía, mientras que el
//: ancho va de 0,80 a 1,40 según sea de una hoja o de dos.
const PUERTA_ALTO_M = 2.05;

//: Cuánto puede alejarse el ancho de fachada que sale de la escala respecto al
//: que midió el motor antes de dar la lectura por mala. Es holgado a propósito:
//: la perspectiva de una foto tomada desde la acera de enfrente acorta los
//: extremos, así que un 35 % es ruido normal y un 80 % es que algo no cuadra.
const DISCREPANCIA_AVISO = 0.35;

//: Un hueco más pequeño que esto en una fachada no es un hueco: es un respiradero,
//: una caja de contadores o un reflejo. No se propone su medida.
const HUECO_MINIMO_M = 0.35;

//: Tope de fotos por lectura. Cada imagen se paga, y con tres tomas de la misma
//: fachada ya se ha visto todo lo que hay en ella.
const MAX_FOTOS = Number(process.env.PARED_OCR_MAX_FOTOS) || 3;

//: ⚠️ ESTA LECTURA VA CON `pensar`. Los demas lectores de la casa transcriben —una
//: placa se lee, no se razona— y por eso van con `thinkingBudget: 0`. Inventariar
//: una fachada es otra cosa: hay que separar los huecos del fondo, decidir cuales
//: son de ESTA pared y estimar proporciones. Y con el presupuesto a cero eso no
//: sale «peor»: la peticion **NO RESPONDE NUNCA**. Medido sobre la fachada de
//: 26RES060_186 — 240 s colgada, y 13,3 s con `pensar`. No es lentitud, es un
//: bloqueo, asi que no se arregla subiendo el plazo.
//: Coste medido: entrada 1.099 · salida 516 · pensamiento 2.148 tokens ≈ 0,006 €.
const PENSAR = true;

//: Y por eso su propio plazo: pensar 2.000 tokens no cabe en los 45 s con los que
//: se lee una etiqueta.
const DEADLINE_MS = Number(process.env.PARED_OCR_TIMEOUT_MS) || 90_000;

// ── El prompt de la FACHADA ─────────────────────────────────────────────────

const PROMPT_FACHADA = `Eres un tecnico certificador energetico mirando la foto de UNA fachada de una vivienda espanola. Tu trabajo es INVENTARIAR los huecos (ventanas y puertas) que se ven en ella.

TE DIGO QUE PARED ES. Fijate solo en esa pared: si en la foto se ve ademas otra fachada del mismo edificio en escorzo, o la casa del vecino, NO cuentes sus huecos.

DEVUELVE:
- encuadre: "completa" si en la foto se ve la pared de lado a lado (las dos esquinas del edificio, o el final del pano); "parcial" si esta cortada por algun lado o solo se ve un trozo; "no_es_una_fachada" si la foto no muestra una fachada (un interior, una caldera, un documento, un plano).
- plantas_visibles: cuantas plantas del edificio se ven en la foto (1, 2, 3...). null si no se distingue.
- huecos: la lista de huecos que ves, ORDENADOS DE IZQUIERDA A DERECHA y, dentro de cada columna, de abajo arriba. Para cada uno:
  - tipo: "ventana" o "puerta". Puerta es solo la de paso: la de entrada de personas, la del garaje, o la que da a una terraza a ras de suelo. Un ventanal acristalado hasta el suelo es "ventana".
  - box_2d: la caja que lo encierra, como [ymin, xmin, ymax, xmax] con valores enteros de 0 a 1000 sobre la imagen. Encierra SOLO EL HUECO -el marco y el vidrio-, no el dintel, ni el alfeizar, ni la reja si sobresale por delante, ni el cajon de la persiana si va por fuera.
  - es_entrada: true SOLO en la puerta de entrada de personas a la vivienda, y solo si se ve entera de suelo a dintel. En todos los demas huecos, false. Como mucho una puede ser true.
  - planta: en que planta esta, 0 para la planta baja (la que esta a ras de calle), 1 para la primera, etc.
  - material_marco: "aluminio", "pvc", "madera", "acero", "mixto" o null si no se distingue.
  - acristalamiento: "monolitico" (un solo vidrio), "doble" (se ve el canto de la camara en el borde del vidrio, o el perfil es grueso), "triple", o null si no se puede afirmar.
  - persiana: true si tiene persiana o se ve su cajon, false si claramente no la tiene, null si no se ve.
  - descripcion: una frase corta que permita reconocerlo ("ventana de dos hojas con reja, a la izquierda de la puerta", "ventanuco del bano").
- fachada_box_2d: la caja del PANO DE FACHADA de esa pared, en el mismo formato [ymin, xmin, ymax, xmax] de 0 a 1000: de esquina a esquina del edificio y del suelo al alero. null si no se ve entera.
- observaciones: lo que un certificador anotaria de esa fachada (material aparente, si hay toldos, rejas, si parece rehabilitada, si hay una parte anadida). Texto corto o null.

REGLAS:
- CUENTA lo que ves, no lo que esperarias ver. Si una ventana queda tapada por un arbol o un coche, no la inventes; y si ves media, cuentala y deja su box_2d fuera.
- Las cajas son sobre el ENCUADRE COMPLETO de la foto, no sobre el edificio.
- NO devuelvas metros ni centimetros en ningun campo.
- Si dudas entre "doble" y "monolitico", pon null: de ese dato cuelga la transmitancia del hueco.`;

const SCHEMA_FACHADA = {
    type: 'OBJECT',
    properties: {
        encuadre: { type: 'STRING' },
        plantas_visibles: { type: 'INTEGER', nullable: true },
        huecos: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    tipo: { type: 'STRING' },
                    box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
                    es_entrada: { type: 'BOOLEAN', nullable: true },
                    planta: { type: 'INTEGER', nullable: true },
                    material_marco: { type: 'STRING', nullable: true },
                    acristalamiento: { type: 'STRING', nullable: true },
                    persiana: { type: 'BOOLEAN', nullable: true },
                    descripcion: { type: 'STRING', nullable: true },
                },
                required: ['tipo'],
            },
        },
        fachada_box_2d: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true },
        observaciones: { type: 'STRING', nullable: true },
    },
    required: ['encuadre', 'huecos'],
};

// ── El prompt de UN HUECO ───────────────────────────────────────────────────

const PROMPT_HUECO = `Eres un tecnico certificador energetico mirando el primer plano de UNA ventana o puerta de una vivienda espanola. Tienes que describirla como la describirias para teclearla en CE3X.

DEVUELVE:
- tipo: "ventana" o "puerta".
- hojas: cuantas hojas tiene (1, 2, 3...). null si no se distingue.
- apertura: "practicable", "corredera", "oscilobatiente", "abatible", "fija" o null.
- material_marco: "aluminio", "pvc", "madera", "acero", "mixto" o null.
- rotura_puente_termico: true solo si SE VE la evidencia (junta de poliamida visible en el canto del perfil, perfil partido, o el fabricante lo rotula). false si es un perfil de aluminio fino y continuo, claramente antiguo, sin rotura. null si no se puede afirmar.
- rotura_evidencia: la frase que justifica lo anterior, o null.
- acristalamiento: "monolitico", "doble", "triple" o null.
- acristalamiento_evidencia: que te hace decirlo (p. ej. "se ve el canto de la camara en el borde del vidrio", "el perfil tiene 4 cm de espesor"), o null.
- persiana: true / false / null.
- cajon_persiana: true si el cajon de la persiana esta a la vista por dentro o por fuera, false, o null.
- reja: true / false / null.
- proporcion: la relacion ANCHO / ALTO del hueco tal como se ve, con dos decimales (una ventana mas ancha que alta da mas de 1). null si la foto esta muy escorzada.
- medida_texto: si en la foto hay un metro, una cinta metrica, un flexometro o una anotacion con las medidas, copiala LITERALMENTE tal como se lee. null si no hay ninguna.
- estado: "bueno", "deteriorado" o null - si se ve madera podrida, condensacion permanente entre vidrios, perfiles deformados.
- observaciones: texto corto o null.

REGLAS:
- NO inventes: es preferible null a un valor adivinado. De la carpinteria y del acristalamiento cuelga la transmitancia que se escribe en el certificado.
- NO des medidas en metros salvo que esten ESCRITAS en la foto, y entonces copialas en medida_texto tal cual.
- Si la foto no es de una ventana ni de una puerta, devuelve tipo null y dilo en observaciones.`;

const SCHEMA_HUECO = {
    type: 'OBJECT',
    properties: {
        tipo: { type: 'STRING', nullable: true },
        hojas: { type: 'INTEGER', nullable: true },
        apertura: { type: 'STRING', nullable: true },
        material_marco: { type: 'STRING', nullable: true },
        rotura_puente_termico: { type: 'BOOLEAN', nullable: true },
        rotura_evidencia: { type: 'STRING', nullable: true },
        acristalamiento: { type: 'STRING', nullable: true },
        acristalamiento_evidencia: { type: 'STRING', nullable: true },
        persiana: { type: 'BOOLEAN', nullable: true },
        cajon_persiana: { type: 'BOOLEAN', nullable: true },
        reja: { type: 'BOOLEAN', nullable: true },
        proporcion: { type: 'NUMBER', nullable: true },
        medida_texto: { type: 'STRING', nullable: true },
        estado: { type: 'STRING', nullable: true },
        observaciones: { type: 'STRING', nullable: true },
    },
};

// ── De proporciones a metros: lo determinista ───────────────────────────────

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const dos = (x) => Math.round(x * 100) / 100;
//: Milesimas: es la resolucion con la que el modelo da las cajas (0-1000) y la
//: que hace falta para dibujar una marca sobre la foto sin que baile.
const red = (x) => Math.round(x * 1000) / 1000;
const fmt = (n) => Number(n).toFixed(2).replace('.', ',');

/**
 * Una caja `[ymin, xmin, ymax, xmax]` de 0-1000 pasada a fracciones del encuadre.
 *
 * Devuelve `null` en cuanto algo no cuadra: una caja invertida, fuera de rango o
 * con menos de cuatro numeros no es una deteccion, es ruido — y de aqui sale una
 * medida que va a un certificado.
 */
function caja(box) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const [y0, x0, y1, x1] = box.map(num);
    if ([y0, x0, y1, x1].some((v) => v === null || v < 0 || v > 1000)) return null;
    const ancho = (x1 - x0) / 1000;
    const alto = (y1 - y0) / 1000;
    if (!(ancho > 0) || !(alto > 0)) return null;
    return { ancho, alto, x: (x0 + x1) / 2000, y: (y0 + y1) / 2000 };
}

/**
 * La escala, en metros por unidad de encuadre.
 *
 * Sale de la PUERTA DE ENTRADA y solo de ella: ver la regla de la cabecera. Su
 * ALTO es 2,05 m con muy poca variacion, y como esta DENTRO de la misma imagen,
 * cancela el sesgo con el que el modelo agranda todas las cajas por igual.
 *
 * Del alto se deduce el ancho con la relacion de aspecto: la foto tiene los
 * mismos metros por pixel en las dos direcciones.
 */
function escalas(lectura, pared, aspecto) {
    const out = { ancho: null, alto: null, de: [], puerta: null };
    const asp = num(aspecto);

    const entrada = (lectura.huecos || []).find((h) => h.es_entrada === true && caja(h.box_2d));
    const c = entrada ? caja(entrada.box_2d) : null;
    if (!c) return out;

    out.puerta = c;
    out.alto = PUERTA_ALTO_M / c.alto;
    if (asp > 0) out.ancho = out.alto * asp;
    out.de.push(`la puerta de entrada, que mide ${fmt(PUERTA_ALTO_M)} m de alto`);
    return out;
}

/**
 * Contrasta la escala contra el DATO DURO: lo que el motor midio de esa pared.
 *
 * Si el ancho de fachada que sale de la escala no se parece al que esta medido
 * sobre la cartografia, la lectura no vale para medir. No se corrige ni se
 * promedia: se dice, porque quien firma tiene que saberlo.
 */
function contraste(esc, lectura, pared) {
    const largo = num(pared?.largo);
    const f = caja(lectura?.fachada_box_2d);
    if (!(esc.ancho > 0) || !(largo > 0) || !f) return null;

    const estimado = esc.ancho * f.ancho;
    const desvio = Math.abs(estimado - largo) / largo;
    return {
        desvio,
        estimado,
        avisa: desvio > DISCREPANCIA_AVISO,
        texto: `por la escala de la puerta, esta fachada mediria ${fmt(estimado)} m de `
             + `ancho, y el motor la midio en ${fmt(largo)} m (un ${(desvio * 100).toFixed(0)} % `
             + 'de diferencia). La foto esta escorzada: las medidas son orientativas.',
    };
}

/**
 * Los huecos leidos, ya en metros donde se puede.
 *
 * Lo que NO se puede convertir sale igual, sin medidas: un hueco contado vale
 * aunque no se pueda medir, y esconderlo seria perder lo unico que la foto
 * siempre aporta.
 */
function aMetros(lectura, pared = {}, aspecto = null) {
    const esc = escalas(lectura, pared, aspecto);
    const altoPared = num(pared?.alto);
    const avisos = [];

    const c = contraste(esc, lectura, pared);
    if (c?.avisa) avisos.push(c.texto);

    const huecos = (lectura.huecos || []).map((h, i) => {
        const tipo = String(h.tipo || '').toLowerCase() === 'puerta' ? 'puerta' : 'ventana';
        const b = caja(h.box_2d);

        let ancho = esc.ancho && b ? dos(esc.ancho * b.ancho) : null;
        let alto = esc.alto && b ? dos(esc.alto * b.alto) : null;

        // Un hueco no puede ser mas alto que la planta en la que esta.
        if (alto && altoPared > 0 && alto > altoPared) alto = null;
        if (ancho !== null && ancho < HUECO_MINIMO_M) ancho = null;
        if (alto !== null && alto < HUECO_MINIMO_M) alto = null;

        return {
            i,
            tipo,
            ancho,
            alto,
            es_entrada: h.es_entrada === true,
            planta: h.planta ?? null,
            x_rel: b ? Math.round(b.x * 100) / 100 : null,
            // DONDE ESTA en la foto, en fracciones del encuadre. No sirve para
            // medir —de eso ya se ha ocupado la escala— pero es lo que deja
            // SENALADO sobre la imagen cual de las ventanas es V1: el modelo ya
            // lo ha mirado, y tirarlo obligaria a atarlas a mano una por una.
            box: b ? { x: red(b.x - b.ancho / 2), y: red(b.y - b.alto / 2),
                       ancho: red(b.ancho), alto: red(b.alto) } : null,
            material_marco: limpia(h.material_marco),
            acristalamiento: limpia(h.acristalamiento),
            persiana: typeof h.persiana === 'boolean' ? h.persiana : null,
            descripcion: limpia(h.descripcion),
            // De donde sale su medida, para poder ensenarlo junto al numero.
            de: (ancho || alto) && esc.de.length
                ? `estimado de la foto a partir de ${esc.de[0]}`
                : null,
        };
    });

    // La suma no puede pasar del largo de la pared: si pasa, la escala esta mal
    // y las medidas no valen —aunque el CONTEO siga valiendo—.
    const largo = num(pared?.largo);
    const suma = huecos.reduce((s, h) => s + (h.ancho || 0), 0);
    if (largo > 0 && suma > largo) {
        avisos.push(`los huecos leidos suman ${fmt(suma)} m de ancho y la pared mide `
            + `${fmt(largo)} m: la escala no cuadra, asi que se propone solo cuantos `
            + 'huecos hay, sin medidas.');
        for (const h of huecos) { h.ancho = null; h.alto = null; h.de = null; }
    }

    if (lectura.encuadre === 'parcial') {
        avisos.push('la foto no coge la fachada entera, asi que puede haber huecos '
            + 'fuera del encuadre. Se cuenta lo que se ve.');
    }
    if (!esc.alto) {
        avisos.push('en esta foto no se ve entera la puerta de entrada, que es lo unico '
            + 'con lo que se puede poner la escala. Se propone CUANTOS huecos hay, no '
            + 'cuanto miden.');
    } else if (!esc.ancho) {
        avisos.push('no se ha podido medir la foto, asi que solo hay altos.');
    }

    return { huecos, avisos, escala: esc.de, contraste: c };
}

// ── Lo que se llama desde fuera ─────────────────────────────────────────────

function prepara(fotos) {
    const buenas = (fotos || [])
        .filter((f) => String(f.mimeType || f.mimetype || '').startsWith('image/') && f.buffer?.length)
        .slice(0, MAX_FOTOS)
        .map((f) => ({
            name: f.name || f.originalname,
            buffer: f.buffer,
            mimeType: f.mimeType || f.mimetype,
        }));
    if (!buenas.length) {
        throw Object.assign(new Error('Hace falta al menos una FOTO para leerla.'), { status: 400 });
    }
    return buenas;
}

/**
 * Lee una fachada y propone que huecos tiene.
 *
 * @param {Array}  fotos  imagenes con {buffer, mimeType}
 * @param {Object} pared  { nombre, orientacion, largo, alto } — lo que el motor
 *                        ya midio de ese cerramiento
 * @param {Object} opts   { aspecto } relacion ancho/alto en pixeles de la foto
 */
async function leerFachada(fotos, pared = {}, opts = {}) {
    const imagenes = prepara(fotos);
    const contexto = `\n\nLA PARED QUE TIENES QUE INVENTARIAR es «${pared.nombre || '?'}»`
        + `${pared.orientacion && pared.orientacion !== '—' ? `, orientada al ${pared.orientacion}` : ''}`
        + `${pared.largo ? `, de ${fmt(pared.largo)} m de ancho` : ''}`
        + `${pared.alto ? ` y ${fmt(pared.alto)} m de altura de planta` : ''}.`;

    const lectura = await llamarGemini(imagenes, {
        prompt: PROMPT_FACHADA + contexto,
        schema: SCHEMA_FACHADA,
        etiqueta: 'paredOcr:fachada',
        pensar: PENSAR,
        deadline: DEADLINE_MS,
    });

    if (lectura.encuadre === 'no_es_una_fachada') {
        return {
            ambito: 'pared',
            encuadre: lectura.encuadre,
            ventanas: 0,
            puertas: 0,
            huecos: [],
            avisos: ['esta foto no parece una fachada. Compruebala antes de adjuntarla '
                   + 'a la pared: lo que se adjunta aqui explica por que el cerramiento '
                   + 'se ha clasificado como esta.'],
            observaciones: limpia(lectura.observaciones),
            modelo: placaOcr.GEMINI_MODEL,
            at: new Date().toISOString(),
        };
    }

    const { huecos, avisos, escala, contraste: c } = aMetros(lectura, pared, num(opts.aspecto));
    return {
        ambito: 'pared',
        encuadre: lectura.encuadre,
        plantas_visibles: lectura.plantas_visibles ?? null,
        ventanas: huecos.filter((h) => h.tipo === 'ventana').length,
        puertas: huecos.filter((h) => h.tipo === 'puerta').length,
        huecos,
        escala,
        contraste: c ? { desvio: c.desvio, avisa: c.avisa } : null,
        observaciones: limpia(lectura.observaciones),
        avisos,
        modelo: placaOcr.GEMINI_MODEL,
        at: new Date().toISOString(),
    };
}

/** Lee el primer plano de UN hueco y dice que es. */
async function leerHueco(fotos, hueco = {}) {
    const imagenes = prepara(fotos);
    const contexto = hueco.nombre
        ? `\n\nEs el hueco «${hueco.nombre}»`
          + `${hueco.cerramiento ? ` del cerramiento ${hueco.cerramiento}` : ''}.`
        : '';
    const l = await llamarGemini(imagenes, {
        prompt: PROMPT_HUECO + contexto,
        schema: SCHEMA_HUECO,
        etiqueta: 'paredOcr:hueco',
        pensar: PENSAR,
        deadline: DEADLINE_MS,
    });
    const bool = (x) => (typeof x === 'boolean' ? x : null);
    return {
        ambito: 'hueco',
        tipo: limpia(l.tipo),
        hojas: l.hojas ?? null,
        apertura: limpia(l.apertura),
        material_marco: limpia(l.material_marco),
        rotura_puente_termico: bool(l.rotura_puente_termico),
        rotura_evidencia: limpia(l.rotura_evidencia),
        acristalamiento: limpia(l.acristalamiento),
        acristalamiento_evidencia: limpia(l.acristalamiento_evidencia),
        persiana: bool(l.persiana),
        cajon_persiana: bool(l.cajon_persiana),
        reja: bool(l.reja),
        proporcion: num(l.proporcion),
        medida_texto: limpia(l.medida_texto),
        estado: limpia(l.estado),
        observaciones: limpia(l.observaciones),
        // Lo unico con lo que se puede PROPONER una medida desde un primer plano
        // es una cinta metrica dentro de la foto: no hay nada mas con lo que
        // poner la escala.
        avisos: l.medida_texto
            ? []
            : ['de un primer plano no salen medidas: no hay nada en la foto con lo que '
             + 'poner la escala. Lo que se lee aqui es QUE ES el hueco, no cuanto mide.'],
        modelo: placaOcr.GEMINI_MODEL,
        at: new Date().toISOString(),
    };
}

module.exports = {
    leerFachada,
    leerHueco,
    // Para las pruebas de lo determinista, que es donde esta el riesgo.
    aMetros,
    escalas,
    contraste,
    PUERTA_ALTO_M,
    HUECO_MINIMO_M,
    DISCREPANCIA_AVISO,
    MAX_FOTOS,
    // Para poder bisecar cuando una lectura no convence: casi siempre el
    // problema no es el codigo, es lo que se le ha pedido al modelo.
    PROMPT_FACHADA,
    PROMPT_HUECO,
    SCHEMA_FACHADA,
    SCHEMA_HUECO,
};
