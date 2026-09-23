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
const { ADDABLE_CONCEPTS } = require('./reformaUploadService');

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
                    // Qué ELEMENTO de obra es, cuando el expediente no tiene
                    // apartado donde ponerlo. Sin esto, una foto de una ventana en
                    // un RES060 se quedaba "sin clasificar" y ahí moría: el admin
                    // veía trece casillas vacías y ninguna pista de qué hacer.
                    concepto: { type: 'string' },
                    fase: { type: 'string' },
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
function construirPrompt(slots, conceptos = []) {
    const lista = slots.map(s => {
        const fase = s.fase === 'DESPUES' ? 'DESPUÉS de la obra' : 'ANTES de la obra';
        const varias = s.multiple ? ' [admite VARIAS fotos]' : '';
        return `- ${s.key} (${fase})${varias}: ${s.label}${s.help ? ` — ${s.help}` : ''}`;
    }).join('\n');

    const listaConceptos = conceptos.map(c => `- ${c.id}: ${c.label}`).join('\n');

    return `Eres el ayudante que ordena las fotos de una obra de rehabilitación energética
(sustitución de caldera por aerotermia, y a veces ventanas, cubierta o fachada).

Te paso VARIAS fotos en orden. Para CADA una, di a qué apartado de esta lista
corresponde. La lista es CERRADA: no inventes claves.

APARTADOS DE ESTE EXPEDIENTE:
${lista}

REGLAS:
1. Devuelve un elemento por foto, con "indice" empezando en 0 y EN EL MISMO ORDEN
   en que te las he pasado. Si te paso 5 fotos, devuelve 5 elementos.
2. ASIGNA el apartado siempre que reconozcas el objeto y haya uno que le
   corresponda, aunque la foto esté torcida, oscura o de cerca. Un apartado
   marcado [admite VARIAS fotos] acepta todas las perspectivas del mismo aparato:
   cinco fotos de la misma caldera van LAS CINCO a su apartado.
3. Deja slot = "" SOLO en dos casos: (a) no sabes qué es lo que sale, o (b) sabes
   qué es pero NINGÚN apartado de la lista le corresponde. No lo pongas donde no
   va: quien revisa detecta antes un hueco que un acierto falso.
4. Cuando dejes slot = "" porque no hay apartado (caso b), rellena "concepto" con
   el elemento de obra al que pertenece, de esta lista cerrada:
${listaConceptos}
   y "fase" con ANTES o DESPUES según la foto enseñe el estado previo o el
   resultado terminado. Si no encaja en ninguno, deja "concepto" vacío.
5. "que_se_ve": una frase MUY corta describiendo el objeto principal
   ("caldera mural de gas", "etiqueta de datos", "ventana de aluminio nueva").
6. "confianza": alta si no hay duda razonable; media si es lo más probable; baja
   solo si de verdad estás adivinando.

CÓMO DISTINGUIRLOS:
- Una ETIQUETA o PEGATINA con marca, modelo, potencia o número de serie es
  siempre un apartado de PLACA, aunque se vea parte del aparato alrededor.
  Mira de qué aparato es: si es una caldera de gas/gasóleo (tiene quemador,
  salida de humos, mandos de temperatura), es la placa de la CALDERA; si es una
  máquina de aerotermia (rejilla grande y ventilador, suele estar en el exterior),
  es la placa de la unidad EXTERIOR; si es un depósito cilíndrico o un aparato
  colgado dentro de la casa, la de la unidad INTERIOR.
- Una CALDERA es un aparato rectangular, casi siempre BLANCO, colgado en la pared
  (a veces de pie), con mandos o una pantallita delante y tubos de cobre por
  debajo. Cuenta como caldera su ENTORNO INMEDIATO: los tubos que salen de ella,
  el vaso de expansión (un depósito rojo o blanco redondeado), la bomba, las
  llaves de corte y el conducto de salida de humos. Todo eso documenta el sistema
  de calefacción actual y va al apartado de la caldera.
- La UNIDAD EXTERIOR de aerotermia es una caja metálica con un ventilador grande
  tras una rejilla, montada en fachada, terraza, patio o tejado.
- La UNIDAD INTERIOR es lo que va DENTRO de la vivienda: un armario o un depósito
  cilíndrico blanco, normalmente junto a tuberías y llaves de corte.
- "Caldera desmontada" es el HUECO que deja en la pared, o la caldera ya
  descolgada en el suelo o fuera de su sitio.
- La FACHADA desde la calle enseña el edificio entero, visto desde fuera y de
  lejos. No la confundas con el aislamiento de fachada (ahí hay andamio, placas
  de aislamiento o mortero) ni con un patio interior (paredes que rodean un
  espacio cerrado, casi siempre con tendedero o ventanas pequeñas).
- Una VENTANA fotografiada desde DENTRO de la casa (se ve la habitación, las
  cortinas, un radiador debajo) es el apartado de ventanas, no el de fachada.
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
    // Los elementos de obra que este expediente PODRÍA tener y no tiene: es lo que
    // permite decir "esto es una ventana, y aquí no hay dónde ponerla" en vez de
    // devolver un hueco mudo. La lista sale de ADDABLE_CONCEPTS —la misma del
    // botón "Añadir apartado de obra"—, así que lo que el modelo nombre se puede
    // activar tal cual.
    const yaVisibles = new Set(ofrecidos.map(s => s.key));
    const conceptos = ADDABLE_CONCEPTS
        .filter(c => c.slots.some(k => !yaVisibles.has(k)))
        .map(c => ({ id: c.id, label: c.label }));
    const idsConcepto = new Set(conceptos.map(c => c.id));
    const prompt = construirPrompt(ofrecidos, conceptos);

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
            // El CONCEPTO solo vale si no hay apartado: con slot asignado sobra, y
            // ofrecer "añadir ventanas" sobre una foto ya colocada confunde.
            const concepto = !def && idsConcepto.has(String(f.concepto || '').trim())
                ? String(f.concepto).trim() : null;
            salida[i] = {
                slot: def ? def.key : null,
                label: def ? def.label : null,
                que_se_ve: String(f.que_se_ve || '').slice(0, 120),
                confianza: ['alta', 'media', 'baja'].includes(f.confianza) ? f.confianza : 'baja',
                concepto,
                fase: concepto && String(f.fase || '').toUpperCase() === 'DESPUES' ? 'DESPUES' : 'ANTES',
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
        // Qué elemento de obra es, cuando este expediente no tiene dónde ponerlo.
        concepto: salida[i]?.concepto || null,
        concepto_label: salida[i]?.concepto
            ? (ADDABLE_CONCEPTS.find(c => c.id === salida[i].concepto)?.label || null)
            : null,
        fase: salida[i]?.fase || null,
    }));
}

module.exports = { clasificar, construirPrompt, MAX_POR_LLAMADA };
