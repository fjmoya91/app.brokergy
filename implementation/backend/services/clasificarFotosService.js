// ============================================================================
// clasificarFotosService — a QUÉ apartado va cada foto que se suelta de golpe.
// ----------------------------------------------------------------------------
// El admin recibe las fotos de una obra como llegan: veinte imágenes de un chat
// de WhatsApp, con nombres tipo `IMG-20260919-WA0007.jpg`. Colocarlas era abrir
// veinte casillas y soltar veinte veces, mirando cada foto para acordarse de si
// era la unidad exterior o la interior.
//
// Aquí se sueltan todas juntas y un modelo PROPONE el apartado de cada una. El
// reparto de siempre:
//
//   · el MODELO mira la foto y dice qué se ve,
//   · el CÓDIGO decide si eso es un destino válido — la clave propuesta tiene
//     que estar en el checklist REAL de ese expediente; cualquier otra cosa se
//     descarta y la foto queda "sin clasificar",
//   · la PERSONA confirma. Nada se sube hasta que alguien pulsa.
//
// No escribe en Drive ni en la BD: solo lee las imágenes y devuelve la
// propuesta. Subir sigue siendo el mismo camino de siempre (`subirFicherosASlot`).
//
// Coste medido con `gemini-2.5-flash` sobre fotos reducidas a 768 px: ~260-400
// tokens de entrada por foto, así que una tanda de 20 ronda **un céntimo**.
// ============================================================================

const { llamarGemini } = require('./placaOcrService');

// Una tanda por llamada. Con más, el modelo empieza a confundir el orden de las
// imágenes con el de las respuestas, que es el único hilo que las ata.
const MAX_POR_LLAMADA = 12;
// Pensar aquí SÍ hace falta (no es transcribir: es reconocer un aparato en su
// contexto), y el plazo se estira en consecuencia — ver la regla del plazo en
// `paredOcrService`.
const DEADLINE_MS = 120000;

const SCHEMA = {
    type: 'object',
    properties: {
        fotos: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    indice: { type: 'integer' },
                    slot: { type: 'string' },
                    que_se_ve: { type: 'string' },
                    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
                },
                required: ['indice', 'slot', 'que_se_ve', 'confianza'],
            },
        },
    },
    required: ['fotos'],
};

/**
 * El prompt lleva DENTRO la lista de apartados de ESTE expediente, con su
 * ayuda: no hay un catálogo genérico que envejezca por su cuenta, y un apartado
 * que el alcance ha podado ni siquiera se le ofrece.
 */
function construirPrompt(slots) {
    const lista = slots.map(s => {
        const fase = s.fase === 'DESPUES' ? 'DESPUÉS de la obra' : 'ANTES de la obra';
        return `- ${s.key} (${fase}): ${s.label}${s.help ? ` — ${s.help}` : ''}`;
    }).join('\n');

    return `Eres el ayudante que ordena las fotos de una obra de rehabilitación energética
(sustitución de caldera por aerotermia, y a veces ventanas, cubierta o fachada).

Te paso VARIAS fotos en orden. Para CADA una, di a qué apartado de esta lista
corresponde. La lista es CERRADA: no inventes claves.

APARTADOS DE ESTE EXPEDIENTE:
${lista}

REGLAS:
1. Devuelve un elemento por foto, con "indice" empezando en 0 y EN EL MISMO ORDEN
   en que te las he pasado. Si te paso 5 fotos, devuelve 5 elementos.
2. Si una foto no encaja con claridad en ningún apartado, pon slot = "" (cadena
   vacía). Es preferible dejarla sin clasificar a colocarla donde no va: quien
   revisa detecta antes un hueco que un acierto falso.
3. "que_se_ve": una frase MUY corta describiendo el objeto principal
   ("caldera mural de gas", "etiqueta de datos", "ventana de aluminio nueva").
4. "confianza": alta solo si no hay ninguna duda razonable.

CÓMO DISTINGUIRLOS:
- Una ETIQUETA o PEGATINA con marca, modelo, potencia o número de serie es
  siempre un apartado de PLACA, aunque se vea parte del aparato alrededor.
  Mira de qué aparato es: si es una caldera de gas/gasóleo (tiene quemador,
  salida de humos, mandos de temperatura), es la placa de la CALDERA; si es una
  máquina de aerotermia (rejilla grande y ventilador, suele estar en el exterior),
  es la placa de la unidad EXTERIOR; si es un depósito cilíndrico o un aparato
  colgado dentro de la casa, la de la unidad INTERIOR.
- La UNIDAD EXTERIOR de aerotermia es una caja metálica con un ventilador grande
  tras una rejilla, montada en fachada, terraza, patio o tejado.
- La UNIDAD INTERIOR es lo que va DENTRO de la vivienda: un armario o un depósito
  cilíndrico blanco, normalmente junto a tuberías y llaves de corte.
- Una CALDERA antigua es un aparato colgado en la pared (o de pie) con salida de
  humos, mandos y, casi siempre, tubos de cobre por debajo.
- "Caldera desmontada" es el HUECO que deja en la pared, o la caldera ya
  descolgada en el suelo o fuera de su sitio.
- Las fotos de la FACHADA desde la calle enseñan el edificio entero; no las
  confundas con la obra de aislamiento de fachada (ahí se ve andamio, placas de
  aislamiento o mortero).
- En una HIBRIDACIÓN se ven LAS DOS máquinas (caldera antigua y equipo nuevo)
  unidas por tuberías.
- Si la foto es de un PAPEL (factura, presupuesto, certificado), va al apartado de
  documento que corresponda, no a uno de foto.`;
}

/** Trocea la lista en tandas del tamaño máximo por llamada. */
function trocear(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

/**
 * Propone a qué apartado va cada imagen.
 *
 * @param {Array<{buffer: Buffer, mimeType: string, nombre: string}>} imagenes
 * @param {Array} slots  checklist del expediente (el REAL, con su alcance)
 * @returns {Promise<Array<{indice, slot, label, que_se_ve, confianza}>>}
 *          Un elemento por imagen, en el mismo orden. `slot: null` = sin clasificar.
 */
async function clasificar(imagenes, slots) {
    const validos = new Map(slots.map(s => [s.key, s]));
    // Un apartado "Otros" no se propone nunca: es el cajón de lo que no encaja, y
    // proponerlo sería vestir de acierto un "no lo sé".
    const ofrecidos = slots.filter(s => !s.named && !s.existing);
    const prompt = construirPrompt(ofrecidos);

    const salida = new Array(imagenes.length).fill(null);
    let base = 0;
    for (const tanda of trocear(imagenes, MAX_POR_LLAMADA)) {
        let lectura;
        try {
            lectura = await llamarGemini(
                tanda.map(i => ({ buffer: i.buffer, mimeType: i.mimeType })),
                { prompt, schema: SCHEMA, etiqueta: 'clasificarFotos', pensar: true, deadline: DEADLINE_MS }
            );
        } catch (e) {
            // Una tanda que falla deja sus fotos SIN CLASIFICAR, no tira la
            // pantalla: se colocan a mano, que es lo que se hacía antes.
            console.warn('[clasificarFotos] tanda sin leer:', e.message);
            base += tanda.length;
            continue;
        }
        for (const f of (lectura?.fotos || [])) {
            const i = base + Number(f.indice);
            if (!Number.isInteger(i) || i < base || i >= base + tanda.length) continue;
            const def = validos.get(String(f.slot || '').trim());
            salida[i] = {
                slot: def ? def.key : null,
                label: def ? def.label : null,
                que_se_ve: String(f.que_se_ve || '').slice(0, 120),
                confianza: ['alta', 'media', 'baja'].includes(f.confianza) ? f.confianza : 'baja',
            };
        }
        base += tanda.length;
    }

    return imagenes.map((img, i) => ({
        indice: i,
        nombre: img.nombre,
        slot: salida[i]?.slot || null,
        label: salida[i]?.label || null,
        que_se_ve: salida[i]?.que_se_ve || '',
        confianza: salida[i]?.confianza || 'baja',
    }));
}

module.exports = { clasificar, construirPrompt, MAX_POR_LLAMADA };
