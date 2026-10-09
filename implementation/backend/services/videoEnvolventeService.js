/**
 * videoEnvolventeService — Lee un VÍDEO de la vivienda y dice qué huecos hay y
 * a qué dan, con el SEGUNDO exacto en que se ve cada uno.
 *
 * Gemelo de `paredOcrService`, que hace lo mismo con una FOTO de una fachada.
 * Existe porque muchas veces el cliente no manda fotos de las paredes: manda un
 * vídeo andando por la casa — es lo que le pide el apartado `VIDEO_VIVIENDA`
 * («camina despacio por las habitaciones enseñando las ventanas»).
 *
 * ── LO MEDIDO: el vídeo casi siempre es de DENTRO ───────────────────────────
 * Sobre los vídeos reales de 26RES060_OP205, _OP208 y _OP215 (06/10/2026): los
 * tres recorren las habitaciones por dentro; ninguno rodea la casa por fuera.
 * Así que la pregunta no es «qué ventanas tiene esta fachada» sino «a qué pared
 * EXTERIOR da cada ventana que se ve desde dentro». Eso NO se ve en la imagen:
 * se deduce de lo que se ve POR la ventana (la calle con casas enfrente, un
 * patio de paredes blancas) y de en qué planta está. Por eso a cada hueco se le
 * pide `da_a` y `que_se_ve`, y quien decide la pared es el código
 * (`utils/videoEnvolvente.js`) — y cuando no se puede decidir, se PREGUNTA al
 * propietario por WhatsApp (`cee_inicial.js pedir-fotos`).
 *
 * ── REGLA: el modelo describe; la PARED la decide el código ─────────────────
 * Al modelo NO se le da el plano. Si supiera que hay «una fachada a la calle y
 * dos a un patio», encajaría lo que ve en eso, y un vídeo que no enseña la
 * fachada trasera acabaría con ventanas inventadas ahí. Se le piden hechos
 * observables con su segundo: qué se ve, en qué planta, qué se ve por cada
 * ventana, lo que dice la persona que graba.
 *
 * ── REGLA: el SEGUNDO es lo que hace verificable la lectura ─────────────────
 * Cada hueco viaja con su `t`, y de ahí sale su FOTOGRAMA (el más nítido en
 * ±0,7 s, `cee_inicial_video.py`). Lo que se le enseña a una persona —y lo que
 * se pega al hueco en la envolvente— es ese fotograma, no la palabra del modelo.
 *
 * ── REGLA: medidas, solo ORIENTATIVAS y con su REFERENCIA ───────────────────
 * Desde dentro casi nunca hay en el mismo plano una puerta de entrada con la que
 * poner la escala (la regla de `paredOcrService`). Lo que sí suele haber es una
 * PUERTA DE PASO (2,03 m de hoja) o un radiador al lado. Se le pide al modelo
 * la medida con la referencia que ha usado, la valida el código
 * (`medidaPlausible`) y, si no cuadra, se cae a la de por defecto de la ventana
 * de la envolvente. Todo nace `dudoso`: lo confirma el certificador.
 *
 * ── REGLA: el vídeo va a la File API y se BORRA al terminar ─────────────────
 * Un vídeo de 50 MB no cabe en una petición en línea (tope de 20 MB). Se sube a
 * la File API de Gemini, se lee y se borra — Google lo borraría a las 48 h, pero
 * es un vídeo del interior de la casa de un cliente y no tiene por qué esperar.
 * La key es la del proyecto de PAGO (CLAUDE.md, «La API de Gemini va en NIVEL DE
 * PAGO»): con el nivel gratuito, el contenido podría usarse para entrenar.
 *
 * ⚠️ VA CON `pensar`, como la lectura de fachadas: inventariar un recorrido es
 * razonar, y con el presupuesto a cero las lecturas que razonan se cuelgan.
 */

const placaOcr = require('./placaOcrService');
const { llamarGemini, limpia } = placaOcr;

const API = 'https://generativelanguage.googleapis.com';

//: El modelo de la lectura del vídeo; se puede probar otro sin tocar código.
//: Por defecto `gemini-3.6-flash`: medido sobre 26RES060_OP205 y _OP208, sitúa
//: bien las PLANTAS (ve la escalera y que se ha subido), no se inventa medidas
//: sin referencia y tarda la mitad (38-52 s frente a 70-90 s del 2.5).
const MODELO = process.env.VIDEO_OCR_MODELO || 'gemini-3.6-flash';

//: Un recorrido de 4 minutos son ~70.000 tokens de entrada y el modelo piensa
//: mucho: el plazo de una placa (45 s) no da ni para empezar.
const DEADLINE_MS = Number(process.env.VIDEO_OCR_TIMEOUT_MS) || 420_000;

//: Tope de duración total que se manda a leer. A 1 fotograma por segundo (lo que
//: muestrea Gemini) son ~300 tokens por segundo con el audio: 15 minutos son
//: ~270.000 tokens y unos 0,10 €. Más que eso no es un recorrido, es un rodaje.
const MAX_SEGUNDOS = Number(process.env.VIDEO_OCR_MAX_SEGUNDOS) || 900;

//: Lo que se espera a que Google procese el vídeo subido (estado ACTIVE).
const ESPERA_ACTIVO_MS = 180_000;

const MIME_POR_EXT = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mov', qt: 'video/mov',
    '3gp': 'video/3gpp', avi: 'video/avi', mkv: 'video/x-matroska', webm: 'video/webm',
    mpg: 'video/mpg', mpeg: 'video/mpeg', wmv: 'video/wmv',
};

/** El tipo MIME que entiende Gemini. `video/quicktime` lo da Drive; Gemini quiere `video/mov`. */
function mimeVideo(nombre, mime) {
    const m = String(mime || '').toLowerCase();
    if (m === 'video/quicktime') return 'video/mov';
    if (m.startsWith('video/')) return m;
    const ext = String(nombre || '').toLowerCase().split('.').pop();
    return MIME_POR_EXT[ext] || null;
}

const esVideo = (f) => !!mimeVideo(f?.name || f?.nombre, f?.mimeType || f?.mimetype);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── La File API de Gemini ───────────────────────────────────────────────────

function clave() {
    const k = process.env.GEMINI_API_KEY;
    if (!k) throw new Error('Falta GEMINI_API_KEY en el entorno.');
    return k;
}

/**
 * Sube un fichero a la File API (subida «resumable» en dos pasos) y espera a que
 * Google lo deje ACTIVO. Devuelve `{ name, uri, mimeType }`.
 */
async function subirAGemini(buffer, mimeType, nombre) {
    const k = clave();
    const ini = await fetch(`${API}/upload/v1beta/files`, {
        method: 'POST',
        headers: {
            'x-goog-api-key': k,
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(buffer.length),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json',
        },
        // El nombre visible NO lleva el del cliente: el fichero vive unos minutos
        // en Google y no necesita decir de quién es.
        body: JSON.stringify({ file: { display_name: `brokergy-video-${Date.now().toString(36)}` } }),
        signal: AbortSignal.timeout(60_000),
    });
    const url = ini.headers.get('x-goog-upload-url');
    if (!ini.ok || !url) {
        throw new Error(`Gemini no acepta la subida del vídeo «${nombre}» (${ini.status}): `
            + `${(await ini.text()).slice(0, 200)}`);
    }
    const sub = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Length': String(buffer.length),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: buffer,
        signal: AbortSignal.timeout(600_000),
    });
    const datos = await sub.json().catch(() => null);
    const f = datos?.file;
    if (!sub.ok || !f?.name) {
        throw new Error(`No se ha podido subir el vídeo «${nombre}» a Gemini (${sub.status}).`);
    }
    // Google procesa el vídeo antes de poder leerlo (PROCESSING → ACTIVE).
    const fin = Date.now() + ESPERA_ACTIVO_MS;
    let estado = f;
    while (estado.state !== 'ACTIVE') {
        if (estado.state === 'FAILED') {
            await borrarDeGemini(f.name);
            throw new Error(`Gemini no ha podido procesar el vídeo «${nombre}» (formato no admitido).`);
        }
        if (Date.now() > fin) {
            await borrarDeGemini(f.name);
            throw new Error(`Gemini no ha terminado de procesar «${nombre}» en ${ESPERA_ACTIVO_MS / 1000} s.`);
        }
        await dormir(2500);
        const r = await fetch(`${API}/v1beta/${f.name}`, {
            headers: { 'x-goog-api-key': k }, signal: AbortSignal.timeout(30_000),
        });
        estado = await r.json().catch(() => ({}));
    }
    return { name: f.name, uri: estado.uri || f.uri, mimeType };
}

/** Borra el fichero de la File API. Nunca lanza: un fallo aquí no puede tumbar la lectura. */
async function borrarDeGemini(name) {
    if (!name) return;
    try {
        await fetch(`${API}/v1beta/${name}`, {
            method: 'DELETE', headers: { 'x-goog-api-key': clave() },
            signal: AbortSignal.timeout(30_000),
        });
    } catch (e) {
        console.warn(`[videoEnvolvente] no se ha podido borrar ${name} de Gemini: ${e.message}`);
    }
}

// ── El prompt ───────────────────────────────────────────────────────────────

const PROMPT = `Eres un tecnico certificador energetico. Te mando uno o varios VIDEOS que ha grabado el propietario de una vivienda espanola para que podamos hacer su certificado de eficiencia energetica sin ir a verla. Normalmente camina por DENTRO de la casa ensenando las habitaciones y sus ventanas; a veces graba tambien la casa por FUERA.

Tu trabajo es INVENTARIAR los HUECOS DE LA ENVOLVENTE: las ventanas, balconeras, puertas a la calle o al patio y lucernarios por los que la vivienda da al EXTERIOR. Para cada uno quiero el SEGUNDO del video en que mejor se ve y A QUE DA.

QUE ES UN HUECO DE LA ENVOLVENTE (y que NO lo es):
- SI: ventanas, balconeras (ventana que llega al suelo y da a un balcon o terraza), la puerta de entrada de la vivienda, puertas de cristal que dan a un patio, jardin o terraza, lucernarios o claraboyas en el techo que dan al cielo.
- NO: puertas de paso entre habitaciones, puertas de armario, la puerta que da a un garaje, trastero o cochera DE LA PROPIA CASA, ventanas que dan a otra habitacion o a un pasillo interior, espejos, cuadros, pantallas.
- Si la MISMA ventana aparece varias veces (vuelves a pasar por la habitacion, o la ves primero desde dentro y luego desde fuera), es UN solo hueco: anotala una vez y usa "repetido_de" en las demas apariciones solo si la anotas otra vez.

PARA CADA HUECO DEVUELVE:
- id: "H1", "H2"... en el orden en que aparecen.
- video: el numero del video (1, 2...) tal como te los rotulo.
- t: el MOMENTO del video en que el hueco se ve MEJOR (mas de frente, entero, quieto y bien iluminado), como texto "MM:SS" -el mismo formato de las marcas de tiempo del video, p. ej. "01:07"; para mas precision "01:07.5"-. Es el fotograma que vamos a sacar del video, asi que elige bien.
- desde: "interior" si se ve desde dentro de la casa, "exterior" si se ve desde la calle o el patio.
- estancia: el id de la estancia (de la lista "estancias") si se ve desde dentro; null si se ve desde fuera.
- fachada: el id de la fachada (de la lista "fachadas") si se ve desde fuera; null si no.
- planta: la planta en la que esta: 0 la planta baja (a ras de calle), 1 la primera, 2 la segunda, -1 un semisotano. Deducelo del recorrido (si se han subido escaleras), de lo que se ve por la ventana (a ras de suelo o desde altura) y de lo que diga la persona. null si no se puede saber.
- tipo: "ventana", "balconera", "puerta_entrada", "puerta_patio" (puerta de cristal a patio, jardin o terraza), "puerta_garaje" (puerta del garaje vista desde la calle) o "lucernario".
- da_a: lo que hay al otro lado: "calle" (una via publica: se ven la acera, coches, casas de enfrente), "patio" (un espacio cerrado entre paredes, a cielo abierto, de esta casa o compartido), "jardin" (jardin o parcela de la propia casa, sin paredes cerca), "terraza" (una terraza o una cubierta transitable de la propia casa), "cielo" (lucernario), "interior" (otra habitacion o un espacio cubierto: entonces NO es de la envolvente, no lo incluyas), o null si no se ve que hay al otro lado.
- que_se_ve: una frase con lo que se ve por el hueco o alrededor que justifique da_a ("casas de enfrente y una acera", "patio estrecho de paredes blancas con tendedero", "la calle desde una planta alta"). null si no se ve nada.
- posicion: donde esta en la pared, mirando la pared desde DENTRO de la estancia: "izquierda", "centro" o "derecha". null si no se distingue.
- ancho_m, alto_m: lo que mide el hueco (marco incluido) estimado con una referencia que este en la MISMA pared o a su lado: una puerta de paso interior mide 2,03 m de alto y 0,72 a 0,82 m de ancho; la puerta de entrada 2,05 m de alto; un radiador de aluminio tiene elementos de 8 cm; la altura de una habitacion suele ser de 2,50 a 2,70 m. Si no hay ninguna referencia fiable, null en los dos.
- medida_referencia: la referencia que has usado ("la puerta de paso de la derecha, en la misma pared"). null si no has dado medida.
- hojas: cuantas hojas tiene. null si no se distingue.
- material_marco: "aluminio", "pvc", "madera", "acero" o null.
- acristalamiento: "monolitico", "doble" o null si no se puede afirmar.
- persiana: true si tiene persiana o se ve su cajon; false si claramente no tiene; null si no se ve.
- reja: true, false o null.
- repetido_de: el id del hueco del que es una repeticion, o null.
- descripcion: una frase corta que permita reconocerlo en el fotograma ("ventana de dos hojas con cortina del dormitorio grande").

ADEMAS DEVUELVE:
- tipo_recorrido: "interior", "exterior", "mixto" o "no_es_una_vivienda".
- calidad: "buena", "regular" o "mala" (video movido, oscuro, a contraluz) y calidad_nota con el motivo.
- estancias: las habitaciones que se recorren: id ("E1"...), nombre ("salon", "cocina", "dormitorio 1", "bano", "pasillo"...), planta (como arriba), video, t_desde y t_hasta (como texto "MM:SS").
- fachadas: las paredes EXTERIORES de la casa que se ven desde fuera: id ("F1"...), video, t (el momento "MM:SS" en que se ve mas entera y de frente), da_a (a que da esa fachada: "calle", "patio", "jardin", "terraza"), tiene_entrada (true si en ella esta la puerta de entrada), plantas_visibles, encuadre ("completa" si se ve de esquina a esquina y del suelo al tejado, "parcial" si no), descripcion. Lista vacia si el video es solo de dentro.
- plantas_recorridas: las plantas que aparecen (lista de enteros).
- recorrido_completo: true si parece que se ensenan TODAS las habitaciones de esas plantas, false si se ve claramente que faltan, null si no se puede saber.
- narracion: lo que DICE la persona que graba y sirva para el certificado (que habitacion es, a que da una ventana, que se ha cambiado, que hay detras), con su video y su momento "MM:SS". Lista vacia si no habla o no dice nada util.
- no_se_ve: lo que falta para poder hacer el certificado y que el video no ensena (p. ej. "no se ve ninguna fachada desde fuera", "no se entra en la planta de arriba", "la ventana del bano solo se ve de refilon"). Frases cortas.
- observaciones: lo que anotaria un certificador (cerramientos rehabilitados, toldos, persianas, si hay aire acondicionado, radiadores...). Texto corto o null.

REGLAS:
- CUENTA lo que ves, no lo que esperarias ver. No inventes ventanas que no aparecen.
- Las marcas de tiempo son sobre CADA video por separado, empezando en "00:00", y SIEMPRE como texto "MM:SS". Ninguna puede pasar de lo que dura su video.
- Si dudas de a que da un hueco, pon da_a null y explica en que_se_ve lo que se ve: es mejor un null que un dato adivinado, porque de ahi sale en que pared de la casa se pone la ventana.
- Si dudas entre "doble" y "monolitico", pon null.`;

const H = (props, req = []) => ({ type: 'OBJECT', properties: props, ...(req.length ? { required: req } : {}) });
const S = (nullable = true) => ({ type: 'STRING', nullable });
const N = (nullable = true) => ({ type: 'NUMBER', nullable });
const I = (nullable = true) => ({ type: 'INTEGER', nullable });
const B = (nullable = true) => ({ type: 'BOOLEAN', nullable });

const SCHEMA = H({
    tipo_recorrido: S(false),
    calidad: S(),
    calidad_nota: S(),
    plantas_recorridas: { type: 'ARRAY', items: { type: 'INTEGER' } },
    recorrido_completo: B(),
    estancias: { type: 'ARRAY', items: H({
        id: S(false), nombre: S(), planta: I(), video: I(), t_desde: S(), t_hasta: S(),
    }, ['id']) },
    fachadas: { type: 'ARRAY', items: H({
        id: S(false), video: I(), t: S(), da_a: S(), tiene_entrada: B(), plantas_visibles: I(),
        encuadre: S(), descripcion: S(),
    }, ['id']) },
    huecos: { type: 'ARRAY', items: H({
        id: S(false), video: I(), t: S(), desde: S(), estancia: S(), fachada: S(), planta: I(),
        tipo: S(), da_a: S(), que_se_ve: S(), posicion: S(), ancho_m: N(), alto_m: N(),
        medida_referencia: S(), hojas: I(), material_marco: S(), acristalamiento: S(),
        persiana: B(), reja: B(), repetido_de: S(), descripcion: S(),
    }, ['id', 'tipo']) },
    narracion: { type: 'ARRAY', items: H({ video: I(), t: S(), texto: S() }) },
    no_se_ve: { type: 'ARRAY', items: { type: 'STRING' } },
    observaciones: S(),
}, ['tipo_recorrido', 'huecos']);

// ── Lo determinista: limpiar lo que devuelve el modelo ──────────────────────

const TIPOS = new Set(['ventana', 'balconera', 'puerta_entrada', 'puerta_patio', 'puerta_garaje', 'lucernario']);
const DA_A = new Set(['calle', 'patio', 'jardin', 'terraza', 'cielo', 'interior']);
const minus = (s) => (limpia(s) ? String(limpia(s)).toLowerCase().trim() : null);
const numero = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const entero = (x) => (Number.isInteger(Number(x)) && x !== null && x !== '' ? Number(x) : null);
const dos = (x) => Math.round(x * 100) / 100;

/**
 * Una marca de tiempo del modelo, en SEGUNDOS.
 *
 * Se le pide «MM:SS» porque es como Gemini rotula el vídeo por dentro. Pedida
 * como número la mezclaba: medido en 26RES060_OP208 (vídeo de 3:56), devolvió
 * estancias en el «352» y el «300» —que eran 3:52 y 3:00 escritos sin los dos
 * puntos— y los huecos de la planta baja acabaron todos recortados al final.
 * Por eso aquí se entiende «MM:SS», «H:MM:SS» y, si llega un número a pelo, se
 * toma por segundos SOLO si cabe en el vídeo; si no cabe pero leído como MMSS
 * sí, se lee así (es el error de arriba); si no, null.
 */
function segundosDe(x, duracion = null) {
    if (x === null || x === undefined || x === '') return null;
    const s = String(x).trim().replace(',', '.');
    if (s.includes(':')) {
        const partes = s.split(':').map(Number);
        if (partes.some((p) => !Number.isFinite(p) || p < 0)) return null;
        return partes.reduce((acc, p) => acc * 60 + p, 0);
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    const d = Number(duracion);
    if (!(d > 0) || n <= d) return n;
    const mm = Math.floor(n / 100), ss = n - mm * 100;
    if (ss < 60 && mm * 60 + ss <= d) return mm * 60 + ss;
    return null;
}

//: Lo que puede medir un hueco de verdad, por tipo [ancho min, ancho max, alto
//: min, alto max]. Fuera de esto la estimación del modelo no es una medida: es
//: una referencia mal elegida, y se cae a la de por defecto.
const RANGOS = {
    ventana: [0.3, 4.0, 0.3, 2.4],
    balconera: [0.6, 4.0, 1.7, 2.7],
    puerta_entrada: [0.7, 2.6, 1.9, 2.8],
    puerta_patio: [0.7, 4.5, 1.9, 2.8],
    puerta_garaje: [2.0, 6.0, 1.9, 3.5],
    lucernario: [0.3, 8.0, 0.3, 8.0],
};

/** ¿La medida que propone el modelo es plausible para ese tipo de hueco? */
function medidaPlausible(tipo, ancho, alto) {
    const r = RANGOS[tipo] || RANGOS.ventana;
    const a = numero(ancho), h = numero(alto);
    if (!(a > 0) || !(h > 0)) return false;
    return a >= r[0] && a <= r[1] && h >= r[2] && h <= r[3];
}

/**
 * Lo que devuelve el modelo, ya limpio: ids únicos, segundos dentro de la
 * duración del vídeo, tipos y «da a» de la lista cerrada, y las repeticiones
 * fuera. Nunca lanza: lo que no se entiende se descarta y se DICE en `avisos`.
 *
 * @param {Object} lectura  la respuesta del modelo
 * @param {Array}  videos   [{ duracion_s }] en el MISMO orden en que se mandaron
 */
function normalizar(lectura, videos = []) {
    const avisos = [];
    const durDe = (v) => numero(videos[(entero(v) || 1) - 1]?.duracion_s);
    const segundo = (v, t) => {
        const d = durDe(v);
        const x = segundosDe(t, d);
        if (x === null) return null;
        // Una marca que se pasa del final no se RECORTA: un hueco al final del
        // vídeo enseñaría el fotograma de otra cosa. Se descarta y se dice.
        if (d > 0 && x > d + 0.5) return null;
        return d > 0 ? Math.min(x, Math.max(0, d - 0.2)) : x;
    };
    const videoOk = (v) => {
        const n = entero(v) || 1;
        return n >= 1 && n <= Math.max(1, videos.length) ? n : 1;
    };

    const estancias = (lectura?.estancias || []).map((e, i) => ({
        id: limpia(e.id) || `E${i + 1}`,
        nombre: limpia(e.nombre),
        planta: entero(e.planta),
        video: videoOk(e.video),
        t_desde: segundosDe(e.t_desde, durDe(e.video)),
        t_hasta: segundosDe(e.t_hasta, durDe(e.video)),
    }));

    const fachadas = (lectura?.fachadas || []).map((f, i) => ({
        id: limpia(f.id) || `F${i + 1}`,
        video: videoOk(f.video),
        t: segundo(f.video, f.t),
        da_a: DA_A.has(minus(f.da_a)) ? minus(f.da_a) : null,
        tiene_entrada: f.tiene_entrada === true,
        plantas_visibles: entero(f.plantas_visibles),
        encuadre: minus(f.encuadre) === 'completa' ? 'completa' : 'parcial',
        descripcion: limpia(f.descripcion),
    }));

    const vistos = new Set();
    const huecos = [];
    for (const [i, h] of (lectura?.huecos || []).entries()) {
        const id = limpia(h.id) && !vistos.has(limpia(h.id)) ? limpia(h.id) : `H${i + 1}`;
        vistos.add(id);
        if (limpia(h.repetido_de)) continue;              // una repetición no es otro hueco
        const tipo = TIPOS.has(minus(h.tipo)) ? minus(h.tipo) : 'ventana';
        const da_a = DA_A.has(minus(h.da_a)) ? minus(h.da_a) : null;
        if (da_a === 'interior') {
            avisos.push(`${id} (${limpia(h.descripcion) || tipo}) da a un espacio interior: no es de la envolvente.`);
            continue;
        }
        const t = segundo(h.video, h.t);
        if (t === null) {
            avisos.push(`${id} viene sin segundo del vídeo: no se puede sacar su fotograma.`);
        }
        // Sin la REFERENCIA con la que se ha medido, el número no vale: es un
        // tamaño «típico» puesto por el modelo, que es lo mismo que el de por
        // defecto pero con apariencia de medida (2.5-flash dio 1,4 × 2,0 a tres
        // balconeras con la persiana bajada y la referencia en blanco).
        const plausible = medidaPlausible(tipo, h.ancho_m, h.alto_m);
        const medida = plausible && !!limpia(h.medida_referencia);
        if (!medida && (numero(h.ancho_m) || numero(h.alto_m))) {
            avisos.push(`${id}: la medida estimada (${numero(h.ancho_m)} × ${numero(h.alto_m)} m) `
                + (plausible ? 'no dice con qué referencia se ha medido'
                             : `no es plausible para una ${tipo.replace('_', ' ')}`)
                + '; se usa la de por defecto.');
        }
        huecos.push({
            id,
            video: videoOk(h.video),
            t,
            desde: minus(h.desde) === 'exterior' ? 'exterior' : 'interior',
            estancia: limpia(h.estancia),
            fachada: limpia(h.fachada),
            planta: entero(h.planta),
            tipo,
            da_a,
            que_se_ve: limpia(h.que_se_ve),
            posicion: ['izquierda', 'centro', 'derecha'].includes(minus(h.posicion)) ? minus(h.posicion) : null,
            ancho: medida ? dos(Number(h.ancho_m)) : null,
            alto: medida ? dos(Number(h.alto_m)) : null,
            medida_referencia: medida ? limpia(h.medida_referencia) : null,
            hojas: entero(h.hojas),
            material_marco: minus(h.material_marco),
            acristalamiento: minus(h.acristalamiento),
            persiana: typeof h.persiana === 'boolean' ? h.persiana : null,
            reja: typeof h.reja === 'boolean' ? h.reja : null,
            descripcion: limpia(h.descripcion),
        });
    }

    return {
        tipo_recorrido: minus(lectura?.tipo_recorrido) || 'interior',
        calidad: minus(lectura?.calidad),
        calidad_nota: limpia(lectura?.calidad_nota),
        plantas_recorridas: (lectura?.plantas_recorridas || []).map(entero).filter((x) => x !== null),
        recorrido_completo: typeof lectura?.recorrido_completo === 'boolean' ? lectura.recorrido_completo : null,
        estancias,
        fachadas,
        huecos,
        narracion: (lectura?.narracion || [])
            .map((n) => ({ video: videoOk(n.video), t: segundosDe(n.t, durDe(n.video)), texto: limpia(n.texto) }))
            .filter((n) => n.texto),
        no_se_ve: (lectura?.no_se_ve || []).map(limpia).filter(Boolean),
        observaciones: limpia(lectura?.observaciones),
        avisos,
    };
}

// ── La SEGUNDA lectura: cada fotograma, con otro modelo ─────────────────────
//
// El modelo del vídeo se equivoca de una forma concreta: con la persiana bajada
// AFIRMA a qué da la ventana (medido en 26RES060_OP208: tres balconeras «dan a
// un patio» con la persiana cerrada). Repetir la lectura con el mismo modelo no
// lo arregla —falla igual—; mirarlo con OTRO, sobre el fotograma quieto, sí: es
// el mismo principio que el nº de serie de las placas (`leerDosVeces`). Si las
// dos lecturas no dicen lo mismo, `da_a` queda en null y el hueco, dudoso.
// De paso devuelve la CAJA del hueco en el fotograma: es la marca que se pinta
// sobre él en la ventana de la envolvente.

const MODELO_FOTOGRAMAS = process.env.VIDEO_OCR_MODELO_FOTOGRAMAS || placaOcr.GEMINI_MODEL;
const MAX_FOTOGRAMAS = 16;

const PROMPT_FOTOGRAMAS = `Eres un tecnico certificador energetico. Te mando FOTOGRAMAS sacados de un video de una vivienda, cada uno rotulado con un codigo ("H3"). En cada uno deberia verse UN hueco de la fachada (ventana, balconera, puerta a la calle o al patio, o lucernario), descrito en su rotulo.

Para CADA fotograma devuelve:
- id: el codigo del rotulo.
- se_ve_el_hueco: true si el hueco descrito se ve en el fotograma, false si no.
- es_hueco_exterior: true si es un hueco de la fachada o de la cubierta (da al exterior), false si es una puerta de paso, un espejo, un armario o da a otra habitacion.
- se_ve_el_exterior: true SOLO si a traves del hueco (o alrededor, si se ve desde fuera) se ve lo que hay al otro lado; false si la persiana, el estor o la cortina estan bajados, el cristal es translucido o esta quemado por la luz.
- da_a: "calle", "patio", "jardin", "terraza", "cielo" o null. SOLO si se_ve_el_exterior es true; si no, null.
- evidencia: lo que se ve que justifica da_a ("acera y fachadas de enfrente", "pared blanca a 3 m y tendedero"), o null.
- box_2d: la caja del hueco (marco incluido) como [ymin, xmin, ymax, xmax], enteros de 0 a 1000 sobre la imagen. null si no se ve.

REGLAS: no adivines a que da un hueco que no deja ver el exterior: null. Es mejor null que un dato inventado.`;

const SCHEMA_FOTOGRAMAS = H({
    fotogramas: { type: 'ARRAY', items: H({
        id: S(false), se_ve_el_hueco: B(), es_hueco_exterior: B(), se_ve_el_exterior: B(),
        da_a: S(), evidencia: S(), box_2d: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true },
    }, ['id']) },
}, ['fotogramas']);

/** Una caja [ymin, xmin, ymax, xmax] 0-1000 → { x, y, ancho, alto } en fracciones (la de las marcas). */
function cajaMarca(box) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const [y0, x0, y1, x1] = box.map(Number);
    if ([y0, x0, y1, x1].some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
    if (!(x1 > x0) || !(y1 > y0)) return null;
    const r = (v) => Math.round(v) / 1000;
    return { x: r(x0), y: r(y0), ancho: r(x1 - x0), alto: r(y1 - y0) };
}

/**
 * Lee los fotogramas de los huecos con el segundo modelo.
 *
 * @param {Array} fotos [{ id, descripcion, buffer, mimeType }]
 * @returns {Promise<Object>} { [id]: { se_ve_el_hueco, es_hueco_exterior, se_ve_el_exterior, da_a, evidencia, box } }
 */
async function confirmarFotogramas(fotos, { modelo = MODELO_FOTOGRAMAS } = {}) {
    const out = {};
    for (let i = 0; i < fotos.length; i += MAX_FOTOGRAMAS) {
        const lote = fotos.slice(i, i + MAX_FOTOGRAMAS);
        const partes = [];
        for (const f of lote) {
            partes.push({ texto: `FOTOGRAMA ${f.id}: ${f.descripcion || 'hueco'}` });
            partes.push({ buffer: f.buffer, mimeType: f.mimeType || 'image/jpeg' });
        }
        const r = await llamarGemini(partes, {
            prompt: PROMPT_FOTOGRAMAS,
            schema: SCHEMA_FOTOGRAMAS,
            etiqueta: 'videoEnvolvente:fotogramas',
            pensar: true,
            deadline: 180_000,
            modelo,
            maxTokens: 30_000,
        });
        for (const x of r?.fotogramas || []) {
            const id = limpia(x.id);
            if (!id || !lote.some((f) => f.id === id)) continue;
            const ve = x.se_ve_el_exterior === true;
            out[id] = {
                se_ve_el_hueco: x.se_ve_el_hueco !== false,
                es_hueco_exterior: x.es_hueco_exterior !== false,
                se_ve_el_exterior: ve,
                da_a: ve && DA_A.has(minus(x.da_a)) ? minus(x.da_a) : null,
                evidencia: limpia(x.evidencia),
                box: cajaMarca(x.box_2d),
            };
        }
    }
    return { lecturas: out, modelo };
}

/**
 * Junta las DOS lecturas de cada hueco. Pura: la prueba el test.
 *
 * - Las dos dicen lo mismo → se queda, `da_a_fuente: 'las dos lecturas'`.
 * - El fotograma no deja ver el exterior y el vídeo sí dice algo → se queda lo
 *   del vídeo, marcado (`'solo el vídeo'`): el modelo del vídeo ve más de un
 *   fotograma y pudo verlo con la persiana subida en otro momento. Cuenta menos.
 * - Las dos dicen cosas DISTINTAS → null: no se decide la pared.
 * - El fotograma dice que no es un hueco exterior → se descarta y se dice.
 */
function reconciliar(huecos, lecturas) {
    const avisos = [];
    const out = [];
    for (const h of huecos) {
        const f = lecturas?.[h.id];
        if (!f) { out.push({ ...h, da_a_fuente: h.da_a ? 'solo el vídeo' : null }); continue; }
        if (f.se_ve_el_hueco && f.es_hueco_exterior === false) {
            avisos.push(`${h.id} (${h.descripcion || h.tipo}): en su fotograma no es un hueco de la fachada; se descarta.`);
            continue;
        }
        let daA = h.da_a, fuente = h.da_a ? 'solo el vídeo' : null;
        if (f.da_a && h.da_a && f.da_a === h.da_a) fuente = 'las dos lecturas';
        else if (f.da_a && !h.da_a) { daA = f.da_a; fuente = 'el fotograma'; }
        else if (f.da_a && h.da_a && f.da_a !== h.da_a) {
            avisos.push(`${h.id}: el vídeo dice que da a «${h.da_a}» y su fotograma, a «${f.da_a}»: queda sin decidir.`);
            daA = null; fuente = 'discrepan';
        } else if (h.da_a && f.se_ve_el_hueco && !f.se_ve_el_exterior) {
            // El hueco SE VE y no deja ver el exterior (persiana bajada, estor,
            // cristal translúcido): lo que dijo el vídeo no tiene con qué
            // sostenerse. Medido en 26RES060_197: la ventana del salón «daba a la
            // calle» con la persiana bajada, y su pared real no tiene calle.
            daA = null; fuente = 'no se ve el exterior';
        }
        out.push({
            ...h,
            da_a: daA,
            da_a_fuente: fuente,
            evidencia: f.evidencia || h.que_se_ve,
            box: f.se_ve_el_hueco ? f.box : null,
            se_ve_en_fotograma: f.se_ve_el_hueco,
        });
    }
    return { huecos: out, avisos };
}

// ── El AUDIO: lo que DICE quien graba, literal y con su minuto ──────────────
//
// La lectura del vídeo ya «oye» (Gemini recibe la pista de sonido), pero solo
// devuelve un resumen de lo que le parece útil (`narracion`), sin ligarlo a
// ningún hueco, y quien escribe el plan no oye nada: ve fotogramas. Medido en
// 26RES060_226 (09/10/2026): la propietaria grabó los patios por FUERA diciendo
// «este sería un patio de luces con dos ventanas, que son dos baños, y la puerta
// del pasillo», y la lectura dejó esas ventanas «dudosas» entre 20 fachadas.
// Lo que se dice es la otra mitad del vídeo: dice A QUÉ da una ventana cuando la
// imagen no lo deja ver (persiana bajada, desde fuera sin referencia), y lo dice
// quien vive en la casa. Por eso el audio se saca APARTE
// (`cee_inicial_video.py audio`) y se TRANSCRIBE LITERAL con el segundo de cada
// frase; el código lo cruza con el segundo de cada hueco (`utils/videoEnvolvente`,
// `conLoDicho`) y la hoja de contactos lo lleva como subtítulos.
//
// REGLA — se TRANSCRIBE, no se interpreta: el modelo copia lo que se dice y
// marca solo lo que la frase NOMBRA (huecos, «da a», planta, habitación). Qué
// hueco es y en qué pared va lo sigue decidiendo el código.

//: El modelo que transcribe. Transcribir no es razonar: el de las placas, sin pensar.
const MODELO_AUDIO = process.env.VIDEO_AUDIO_MODELO || placaOcr.GEMINI_MODEL;
//: Hasta este tamaño el audio va EN LÍNEA (el tope de una petición son 20 MB);
//: más grande, por la File API.
const MAX_AUDIO_EN_LINEA = 14 * 1024 * 1024;

const PROMPT_AUDIO = `Te mando el SONIDO de un video que ha grabado el propietario de una vivienda espanola ensenando su casa (por dentro, por fuera o los patios) para que hagamos su certificado de eficiencia energetica. TRANSCRIBE LITERALMENTE todo lo que se dice, frase a frase, con el momento en que empieza y acaba cada frase.

PARA CADA FRASE DEVUELVE:
- t: cuando EMPIEZA, como texto "MM:SS" (p. ej. "00:41"; para mas precision "00:41.5").
- t_fin: cuando ACABA, como texto "MM:SS".
- texto: lo que se dice, LITERAL, en espanol. No resumas, no corrijas, no completes. Lo que no se entienda: [inaudible].
- habla: "propietario" si habla quien graba; "otra" si es otra persona.
- menciona: SOLO lo que la frase DICE EXPLICITAMENTE (si no lo dice, null o lista vacia; NO lo deduzcas de lo que esperarias):
  - huecos: los huecos que nombra ("ventana", "balcon", "balconera", "puerta", "puerta_patio", "lucernario", "paves"...).
  - cuantos: cuantos huecos dice que hay ("dos ventanas" -> 2), o null.
  - da_a: a que dice que dan esos huecos o donde dice que esta: "calle", "patio", "jardin" (parcela, corral, huerto), "terraza", o null. Un "patio de luces" o un "patio interior" es "patio". "La fachada" o "la de delante" es "calle" SOLO si dice que da a la calle.
  - planta: la planta de la que habla (0 la baja, 1 la primera, 2 la segunda), o null si no lo dice.
  - estancia: la habitacion que nombra ("bano", "cocina", "salon", "dormitorio", "pasillo"...), o null.

ADEMAS: sin_voz true si no se dice nada (solo ruido, viento o musica).

REGLAS: las marcas de tiempo empiezan en "00:00" y nunca pasan de lo que dura el sonido. No inventes: es mejor null que un dato que no se ha dicho.`;

const SCHEMA_AUDIO = H({
    sin_voz: B(),
    frases: { type: 'ARRAY', items: H({
        t: S(false), t_fin: S(), texto: S(false), habla: S(),
        menciona: { ...H({
            huecos: { type: 'ARRAY', items: { type: 'STRING' } },
            cuantos: I(), da_a: S(), planta: I(), estancia: S(),
        }), nullable: true },
    }, ['t', 'texto']) },
}, ['frases']);

/**
 * La transcripción, ya limpia: segundos dentro de la duración, frases vacías o
 * «[inaudible]» fuera, «da a» de la lista cerrada y ordenadas por su segundo.
 * Pura: la prueba el test. Nunca lanza.
 */
function normalizarTranscripcion(bruto, duracion = null) {
    const d = numero(duracion);
    const frases = [];
    for (const f of bruto?.frases || []) {
        const texto = limpia(f?.texto);
        if (!texto || /^\[?\s*inaudible\s*\]?\.?$/i.test(texto)) continue;
        const t = segundosDe(f.t, d);
        // Una frase que «empieza» después del final es una marca mal puesta: fuera.
        if (t === null || (d > 0 && t > d + 0.5)) continue;
        let tf = segundosDe(f.t_fin, d);
        // Sin final (o al revés), lo que se tarda en decirla: ~0,35 s por palabra.
        if (tf === null || tf < t) tf = t + Math.min(6, Math.max(1.5, texto.split(/\s+/).length * 0.35));
        if (d > 0) tf = Math.min(tf, d);
        const m = f.menciona || {};
        const da = minus(m.da_a);
        frases.push({
            t: dos(t), t_fin: dos(tf), texto,
            habla: minus(f.habla) === 'otra' ? 'otra' : 'propietario',
            menciona: {
                huecos: (m.huecos || []).map(minus).filter(Boolean),
                cuantos: entero(m.cuantos),
                da_a: DA_A.has(da) && !['interior', 'cielo'].includes(da) ? da : null,
                planta: entero(m.planta),
                estancia: limpia(m.estancia),
            },
        });
    }
    frases.sort((a, b) => a.t - b.t);
    return { frases, sin_voz: !frases.length };
}

/**
 * Transcribe lo que se dice en el vídeo.
 *
 * @param {Object} fuente  `{ audio: { buffer, mimeType } }` (la pista sacada con
 *   `cee_inicial_video.py audio`) o, si no se pudo sacar, `{ video: { buffer,
 *   mimeType, nombre } }`: Gemini oye la pista del propio vídeo (cuesta más).
 * @returns {Promise<Object>} `{ frases, sin_voz, bruto, modelo, at, de }`
 */
async function transcribir(fuente, { duracion_s = null, modelo = MODELO_AUDIO } = {}) {
    const a = fuente?.audio;
    const v = fuente?.video;
    if (!a?.buffer && !v?.buffer) throw new Error('No hay sonido que transcribir.');
    let subido = null;
    try {
        let parte;
        if (a?.buffer && a.buffer.length <= MAX_AUDIO_EN_LINEA) {
            parte = { buffer: a.buffer, mimeType: a.mimeType || 'audio/aac' };
        } else if (a?.buffer) {
            subido = await subirAGemini(a.buffer, a.mimeType || 'audio/aac', 'audio');
            parte = { fileUri: subido.uri, mimeType: subido.mimeType };
        } else {
            const mime = mimeVideo(v.nombre, v.mimeType);
            if (!mime) throw new Error(`«${v.nombre}» no es un vídeo que se pueda oír.`);
            subido = await subirAGemini(v.buffer, mime, v.nombre);
            parte = { fileUri: subido.uri, mimeType: subido.mimeType };
        }
        const dur = numero(duracion_s);
        const r = await llamarGemini([{ texto: `SONIDO${dur ? ` (dura ${Math.round(dur)} s)` : ''}:` }, parte], {
            prompt: PROMPT_AUDIO,
            schema: SCHEMA_AUDIO,
            etiqueta: 'videoEnvolvente:audio',
            deadline: 240_000,
            modelo,
            maxTokens: 30_000,
        });
        return { ...normalizarTranscripcion(r, dur), bruto: r, modelo, at: new Date().toISOString(),
                 de: a?.buffer ? 'audio' : 'video' };
    } finally {
        if (subido) await borrarDeGemini(subido.name);
    }
}

// ── Lo que se llama desde fuera ─────────────────────────────────────────────

/**
 * Lee uno o varios vídeos de la misma vivienda en UNA sola lectura (así el
 * modelo puede reconocer la misma ventana en dos vídeos).
 *
 * @param {Array} videos [{ buffer, mimeType, nombre, duracion_s }]
 * @returns {Promise<Object>} la lectura normalizada + `modelo`, `at`
 */
async function analizarVideos(videos, { modelo = MODELO } = {}) {
    if (!videos?.length) throw new Error('No hay ningún vídeo que leer.');
    const total = videos.reduce((s, v) => s + (numero(v.duracion_s) || 0), 0);
    if (total > MAX_SEGUNDOS) {
        throw new Error(`Los vídeos suman ${Math.round(total)} s y el tope es ${MAX_SEGUNDOS} s `
            + '(VIDEO_OCR_MAX_SEGUNDOS). Elige los que enseñan la casa.');
    }
    const subidos = [];
    try {
        for (const v of videos) {
            const mime = mimeVideo(v.nombre, v.mimeType);
            if (!mime) throw new Error(`«${v.nombre}» no es un vídeo que se pueda leer.`);
            subidos.push(await subirAGemini(v.buffer, mime, v.nombre));
        }
        const partes = [];
        subidos.forEach((s, i) => {
            const v = videos[i];
            const dur = numero(v.duracion_s);
            partes.push({ texto: `VIDEO ${i + 1}${dur ? ` (dura ${Math.round(dur)} s)` : ''}:` });
            partes.push({ fileUri: s.uri, mimeType: s.mimeType });
        });
        const lectura = await llamarGemini(partes, {
            prompt: PROMPT,
            schema: SCHEMA,
            etiqueta: 'videoEnvolvente',
            pensar: true,
            deadline: DEADLINE_MS,
            modelo,
            maxTokens: 60_000,
        });
        // `bruto` es lo que dijo el modelo tal cual: quien lo cachee puede volver
        // a normalizarlo cuando cambien las reglas sin volver a pagar la lectura.
        return { ...normalizar(lectura, videos), bruto: lectura, modelo, at: new Date().toISOString() };
    } finally {
        for (const s of subidos) await borrarDeGemini(s.name);
    }
}

module.exports = {
    analizarVideos,
    confirmarFotogramas,
    reconciliar,
    transcribir,
    normalizarTranscripcion,
    cajaMarca,
    normalizar,
    segundosDe,
    medidaPlausible,
    mimeVideo,
    esVideo,
    subirAGemini,
    borrarDeGemini,
    RANGOS,
    PROMPT,
    SCHEMA,
    MODELO,
    MODELO_FOTOGRAMAS,
    MODELO_AUDIO,
    PROMPT_AUDIO,
};
