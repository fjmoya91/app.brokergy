/**
 * La ACLARACIÓN sobre las fechas del CIFO, redactada por la IA — pero con los
 * datos del expediente y NADA más.
 *
 * El CIFO declara un inicio de actuación y el verificador lo cruza con las
 * facturas y con el CEE inicial. Cuando la primera factura es una entrega de
 * material o un anticipo, la aclaración explica por qué esa fecha no es la del
 * inicio. La redacción de partida la compone el código (`aclaracionSugerida`,
 * frontend/.../logic/hitosActuacion.js); esto es la segunda vuelta: una redacción
 * más natural que puede incorporar lo que el usuario cuente del caso ("la bomba
 * quedó en el almacén del instalador hasta septiembre").
 *
 * REGLA — la máquina REDACTA; los DATOS los pone el expediente. Se le pasan las
 * fechas y facturas que constan y se le prohíbe añadir ninguna otra. Y el código
 * lo COMPRUEBA: un texto que cite una fecha o un nº de factura que el expediente
 * no tiene se descarta, y se devuelve la redacción del código diciéndolo. En un
 * certificado firmado por el instalador no puede colarse una fecha inventada.
 *
 * REGLA — esto PROPONE, no guarda. El texto vuelve al popup, que es donde una
 * persona lo lee y decide si lo usa.
 *
 * Coste: un párrafo de entrada y otro de salida, sin imágenes — del orden de
 * 0,0003 € por redacción con gemini-2.5-flash.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { llamarGemini } = require('./placaOcrService');

// «nº» → «número» en lo que se le pasa a la IA: con el símbolo de ordinal se
// queda en bucle (ver `redactar`). El texto que vuelve se queda con «número».
const sinOrdinal = (t) => String(t || '').replace(/\bn\.?\s?º\s*/g, 'número ');

let _hitosPromise = null;
function cargarHitos() {
    if (!_hitosPromise) {
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/hitosActuacion.js')).href;
        _hitosPromise = import(url);
    }
    return _hitosPromise;
}

const SCHEMA = {
    type: 'OBJECT',
    properties: { texto: { type: 'STRING' } },
    required: ['texto'],
};

/**
 * Aplica al expediente lo que el usuario tiene marcado en el popup y aún no ha
 * guardado: qué facturas no abren la actuación y las fechas fijadas a mano. Solo
 * esas tres cosas — el resto sale de la BD, no del navegador.
 */
function conBorrador(exp, borrador = {}) {
    const doc = { ...(exp.documentacion || {}) };
    if (borrador.motivos && typeof borrador.motivos === 'object') {
        doc.facturas = (doc.facturas || []).map((f, i) => {
            const m = borrador.motivos[i];
            if (m === undefined) return f;
            return { ...f, motivo_no_inicio: m ? String(m).toUpperCase() : null };
        });
    }
    for (const k of ['fecha_inicio_cifo_manual', 'fecha_fin_cifo_manual']) {
        if (k in borrador) doc[k] = borrador[k] || null;
    }
    return { ...exp, documentacion: doc };
}

// Los nº de factura que cita un texto: «nº 26/000417», «n.º A-12» o «número
// 26/000417» (que es como se le pide escribirlo a la IA, ver abajo). El º es
// OBLIGATORIO en la abreviatura —con una "o" normal, «no supone» se leía como la
// factura «supone»— y lo citado tiene que llevar algún DÍGITO: «el número de
// registro» no cita ninguna factura.
function facturasCitadas(texto) {
    const t = String(texto || '');
    const out = [];
    const re = /(?:n\.?\s?[º°]|n[úu]mero)\s*([A-Z0-9][A-Z0-9/\-.]*[A-Z0-9])/gi;
    let m;
    while ((m = re.exec(t))) {
        const antes = t.charAt(m.index - 1);
        if (antes && /[a-záéíóúñ0-9]/i.test(antes)) continue;   // dentro de otra palabra
        if (!/\d/.test(m[1])) continue;
        out.push(m[1]);
    }
    return out;
}

function hechos(h, fechaEs, MOTIVOS) {
    const l = [];
    for (const f of h.facturas) {
        l.push(`- Factura ${f.numero ? `número ${f.numero}` : 'sin número'} de fecha ${fechaEs(f.fecha)}`
            + (f.motivo ? ` — marcada como ${MOTIVOS[f.motivo].corto} (NO abre la actuación)` : ''));
    }
    if (h.pruebas) l.push(`- Pruebas de la instalación (Certificado de Instalación Térmica): ${fechaEs(h.pruebas)}`);
    if (h.ceeInicial.visita) l.push(`- Visita del técnico certificador para el CEE inicial: ${fechaEs(h.ceeInicial.visita)}`);
    if (h.ceeInicial.firma) l.push(`- Firma del certificado de eficiencia energética inicial: ${fechaEs(h.ceeInicial.firma)}`);
    if (h.ceeFinal.visita) l.push(`- Visita del técnico certificador para el CEE final: ${fechaEs(h.ceeFinal.visita)}`);
    if (h.ceeFinal.firma) l.push(`- Firma del certificado de eficiencia energética final: ${fechaEs(h.ceeFinal.firma)}`);
    if (h.inicio) l.push(`- Fecha de INICIO de la actuación que declara el certificado: ${fechaEs(h.inicio)}`);
    if (h.fin) l.push(`- Fecha de FIN de la actuación que declara el certificado: ${fechaEs(h.fin)}`);
    return l.join('\n');
}

/** El encargo a la IA. Aparte para poder leerlo y probarlo sin llamar a nadie. */
function componerPrompt({ h, propuesta, nota, fechaEs, MOTIVOS_NO_INICIO, ACLARACION_MAX }) {
    return `Redacta la «Aclaración sobre las fechas» de un Certificado de Instalación (CIFO) de una actuación de ahorro de energía (programa de Certificados de Ahorro Energético, CAE). La aclaración se imprime en el propio certificado, que firma la empresa instaladora, justo debajo de la tabla de hitos.

Para qué sirve: quien revisa el certificado compara la fecha de inicio de la actuación con las facturas y con el certificado de eficiencia energética inicial. Una factura emitida antes del inicio (porque es la entrega del material o un anticipo) necesita una explicación breve y sobria.

HECHOS — los ÚNICOS datos que puedes usar:
${hechos(h, fechaEs, MOTIVOS_NO_INICIO)}
${nota ? `\nLO QUE CUENTA EL USUARIO SOBRE EL CASO (úsalo solo si no contradice los hechos):\n${nota}\n` : ''}
PROPUESTA DE PARTIDA (compuesta con los hechos; puedes mejorar su redacción):
«${sinOrdinal(propuesta) || '(sin propuesta)'}»

REGLAS:
- Un solo párrafo de dos o tres frases, entre 200 y ${ACLARACION_MAX - 60} caracteres (nunca más de ${ACLARACION_MAX}). Tono formal, sobrio e impersonal (tercera persona). Sin saludos ni encabezados.
- No escribas NINGUNA fecha, importe, nombre, número de factura ni circunstancia que no esté en los hechos o en lo que cuenta el usuario. Fechas en formato dd/mm/aaaa.
- Escribe «factura número 26/000417», con la palabra «número»: no uses la abreviatura con el símbolo de ordinal.
- No valores el cumplimiento de ninguna norma ni garantices nada. El texto dice qué es cada factura anterior al inicio y cuándo se inicia la ejecución de la actuación.
- Si el usuario cuenta algo del caso que ayude a entenderlo (por qué se facturó antes, dónde quedó el material hasta la obra), incorpóralo en UNA frase sobria, sin añadir fechas. Si lo que cuenta incluye una fecha que no está en los hechos, o contradice los hechos, no lo uses.
- Si la firma del CEE inicial es POSTERIOR al inicio, no digas que el inicio es posterior al certificado.
- No menciones a BROKERGY, al verificador, a requerimientos ni a este encargo.

Devuelve solo el texto de la aclaración.`;
}

/**
 * @returns {Promise<{ texto, origen: 'ia'|'propuesta'|'vacia', aviso: string|null }>}
 */
async function redactar({ expediente, borrador, contexto }) {
    const { hitosActuacion, aclaracionSugerida, fechasAjenas, datosCitables, fechaEs,
        MOTIVOS_NO_INICIO, ACLARACION_MAX } = await cargarHitos();
    const h = hitosActuacion(conBorrador(expediente, borrador));
    const propuesta = aclaracionSugerida(h);
    const nota = String(contexto || '').trim().slice(0, 600);

    if (!h.anteriores.length && !nota) {
        return { texto: '', origen: 'vacia',
            aviso: 'Con estas fechas no hay ninguna factura anterior al inicio: no hay nada que aclarar. Si quieres una aclaración igualmente, cuéntale a la IA qué debe explicar.' };
    }

    const prompt = componerPrompt({ h, propuesta, nota, fechaEs, MOTIVOS_NO_INICIO, ACLARACION_MAX });

    // Una redacción de un párrafo son ~120 tokens: el tope de 600 deja margen de
    // sobra y corta rápido un BUCLE. Medido el 30/09/2026: en modo JSON y sin
    // razonar, gemini-2.5-flash se quedaba emitiendo saltos de línea al llegar al
    // símbolo «º» de «nº» (por eso se le pide «número»). Si aun así se corta, se
    // reintenta UNA vez con más temperatura, como las lecturas de placas.
    let texto = '';
    const pedir = (temperatura) => llamarGemini([], {
        prompt, schema: SCHEMA, etiqueta: 'aclaracionFechas',
        deadline: 30000, maxTokens: 600, temperatura,
    });
    try {
        let r;
        try { r = await pedir(0.2); } catch (e) {
            if (!/tope de salida|bucle/i.test(e.message)) throw e;
            r = await pedir(0.6);
        }
        texto = String(r?.texto || '').replace(/\s+/g, ' ').trim().replace(/^«|»$/g, '');
    } catch (e) {
        console.warn('[aclaracionFechas] la IA no respondió:', e.message);
        return { texto: propuesta, origen: 'propuesta',
            aviso: `No se ha podido redactar con la IA (${e.message}). Te dejo la redacción compuesta con los datos.` };
    }

    // ── Lo que la IA NO puede aportar: fechas y facturas que no constan ──────
    const ajenas = fechasAjenas(texto, h);
    const { facturas } = datosCitables(h);
    const facturasAjenas = facturasCitadas(texto).filter(n => !facturas.has(n));
    if (!texto || ajenas.length || facturasAjenas.length || texto.length > ACLARACION_MAX) {
        const porque = !texto ? 'ha devuelto un texto vacío'
            : ajenas.length ? `citaba ${ajenas.length === 1 ? 'una fecha' : 'fechas'} que no constan en el expediente (${ajenas.join(', ')})`
            : facturasAjenas.length ? `citaba ${facturasAjenas.length === 1 ? 'una factura que no consta' : 'facturas que no constan'} en el expediente (${facturasAjenas.join(', ')})`
            : `se pasaba del largo máximo (${texto.length} de ${ACLARACION_MAX} caracteres)`;
        console.warn(`[aclaracionFechas] redacción descartada: ${porque}`);
        return { texto: propuesta, origen: 'propuesta',
            aviso: `La redacción de la IA se ha descartado porque ${porque}. Te dejo la compuesta con los datos.` };
    }
    return { texto, origen: 'ia', aviso: null };
}

module.exports = { redactar, conBorrador, facturasCitadas, componerPrompt };
