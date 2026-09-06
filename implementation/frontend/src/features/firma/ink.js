/**
 * ink.js - PORT literal de `ScannerApp/src/renderer/lib/ink.ts` (2026-09-06).
 *
 * Es una COPIA, no una reinterpretacion: la fisica de la tinta esta depurada en
 * ScannerApp contra firmas reales y aqui no se toca. Si alli se corrige algo, se
 * vuelve a portar - no se parchea este fichero por su cuenta, o la firma de la
 * app y la de ScannerApp dejan de parecer la misma mano.
 *
 * En brokergy solo se usa la PLUMA (ver SignaturePad.jsx): al cliente no se le
 * pregunta con que firma. Los otros dos instrumentos se conservan porque cada
 * uno se define por contraste con los demas, y quitarlos obligaria a reescribir
 * los comentarios que explican por que la pluma es como es.
 *
 * Tinta sobre papel: bolígrafo, pluma y rotulador.
 *
 * Una firma hecha con el ratón es una mala imitación de un boli: una polilínea
 * de ancho constante a la que le faltan justo las cosas por las que el ojo
 * distingue la tinta de una línea de ordenador. Aquí los mismos puntos se
 * pintan como los deja una punta de verdad sobre el papel:
 *
 *  - la punta suelta menos tinta cuanto más rápido va, así que el trazo
 *    adelgaza y aclara con la velocidad, y se empasta donde la mano frena;
 *  - la tinta se mete una fracción de milímetro en la fibra del papel, así que
 *    el borde está difuminado, nunca es un contorno vectorial;
 *  - el papel TIENE GRANO: la punta pinta las crestas y se salta los valles, así
 *    que el relleno está picado y el borde sale mellado (ver `erode`);
 *  - la punta se LEVANTA al terminar el rasgo, y el trazo muere afilado;
 *  - en una esquina cerrada la mano frena y la tinta se empasta;
 *  - un boli que lleva un rato levantado arranca seco;
 *  - el depósito no es uniforme y en una curva rápida la bola patina.
 *
 * Cuánto de cada cosa lo dice el INSTRUMENTO, que no es un cambio de color: un
 * plumín es plano y engorda o adelgaza según la DIRECCIÓN del rasgo, y un
 * rotulador es ancho, plano de densidad y no patina nunca. Ver `INSTRUMENTS`.
 *
 * Todo se pinta como huellas solapadas con composición `darken` sobre una hoja
 * blanca OPACA: mínimo por canal, así que una huella que pasa dos veces por el
 * mismo punto NO lo oscurece el doble — que es lo que hace que un `lineTo`
 * translúcido parezca un rotulador de mala calidad. La hoja se queda blanca y
 * el alfa se recupera al exportar (ver `extractInk`).
 */

const TAU = Math.PI * 2;


/**
 * Un INSTRUMENTO, campo a campo (era el `interface Instrument` de ScannerApp).
 * El comentario va DELANTE del campo que explica.
 *
 * - `key` (string)
 * - `label` (string)
 *   Cómo se llama su tinta en pantalla ("tinta azul de bolígrafo").
 * - `tinta` (string)
 * - `ink` (Rgb)
 *   Multiplica el radio que se elige en el selector de punta.
 * - `size` (number)
 * - `densityMax` (number)
 * - `densityMin` (number)
 *   Cuánto adelgaza con la velocidad (0-1).
 * - `thinning` (number)
 *   Tinta acumulada en los bordes del trazo. Sólo la bola la empuja.
 * - `rails` (number)
 *   Cuánto se come el grano del papel (0 = la tinta lo inunda).
 * - `grain` (number)
 *   Dónde acaba el núcleo opaco de la huella, en fracción del radio.
 * - `core` (number)
 *   Plumín plano: orientación de su filo y cuánto adelgaza en ese eje.
 * - `nib` ({ angle: number; thin: number } | null)
 *   Empastado en las esquinas.
 * - `pooling` (number)
 *   Qué queda del grosor al levantar la punta (1 = corte limpio).
 * - `taper` (number)
 *   Probabilidad de que un rasgo arranque seco.
 * - `dry` (number)
 *   Probabilidad de patinazo por tramo, a velocidad.
 * - `skip` (number)
 *   Microtemblor, en fracción del radio.
 * - `wobble` (number)
 */

/**
 * Los tres instrumentos.
 *
 * El **bolígrafo** es viscoso: deposita poco, patina, deja los bordes del trazo
 * más cargados que el centro y el grano del papel se le nota mucho.
 *
 * La **pluma** es líquida: inunda la fibra, así que va casi opaca y sin grano ni
 * patinazos. Lo que la define es que el plumín es PLANO — el grosor no lo manda
 * la velocidad sino la DIRECCIÓN del rasgo — y que empasta mucho al frenar.
 *
 * El **rotulador** es ancho, plano de densidad y de borde blando; no adelgaza
 * apenas y termina de golpe, porque la punta de fieltro no se levanta afilada.
 */
export const INSTRUMENTS = [
    {
        key: 'boligrafo',
        label: 'Bolígrafo',
        tinta: 'tinta azul de bolígrafo',
        ink: { r: 17, g: 53, b: 148 },
        size: 1,
        densityMax: 0.96,
        densityMin: 0.76,
        thinning: 0.3,
        rails: 0.07,
        grain: 0.28,
        core: 0.8,
        nib: null,
        pooling: 1,
        taper: 0.34,
        dry: 0.45,
        skip: 0.02,
        wobble: 0.09,
    },
    {
        key: 'pluma',
        label: 'Pluma',
        tinta: 'tinta azul negra de pluma',
        ink: { r: 18, g: 38, b: 96 },
        size: 1.15,
        densityMax: 0.99,
        densityMin: 0.88,
        thinning: 0.12,
        rails: 0,
        grain: 0.12,
        core: 0.86,
        // Filo a 45°, que es como cae un plumín en una mano diestra: los
        // rasgos que lo cruzan salen gruesos y los que lo siguen, finos.
        nib: { angle: Math.PI / 4, thin: 0.42 },
        pooling: 1.7,
        taper: 0.26,
        dry: 0.15,
        skip: 0.004,
        wobble: 0.06,
    },
    {
        key: 'rotulador',
        label: 'Rotulador',
        tinta: 'tinta azul de rotulador',
        ink: { r: 30, g: 74, b: 186 },
        size: 2.3,
        densityMax: 0.99,
        densityMin: 0.95,
        thinning: 0.06,
        rails: 0,
        grain: 0.16,
        core: 0.7,
        nib: null,
        pooling: 0.4,
        taper: 0.85,
        dry: 0,
        skip: 0,
        wobble: 0.05,
    },
];

export const DEFAULT_INSTRUMENT = INSTRUMENTS[0];



// -------------------------------------------------------------- utilidades

/** PRNG determinista: rehacer un trazo tiene que dar los mismos píxeles. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Catmull-Rom: la curva pasa por los puntos, sin tirones en los empalmes. */
function spline(p0, p1, p2, p3, u) {
    const u2 = u * u;
    const u3 = u2 * u;
    return 0.5 * ((2 * p1) +
        (-p0 + p2) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/**
 * Cuánto cierra el trazo en este punto, de 0 (recto) a 1 (vuelve sobre sí).
 * Por debajo de unos 40° no cuenta: son las curvas normales de la escritura.
 */
function corner(p0, p1, p2) {
    const ax = p1.x - p0.x, ay = p1.y - p0.y;
    const bx = p2.x - p1.x, by = p2.y - p1.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 0.01 || lb < 0.01) return 0;
    const cos = clamp((ax * bx + ay * by) / (la * lb), -1, 1);
    return clamp((Math.acos(cos) - 0.7) / 1.4, 0, 1);
}

/** Blanco mezclado con la tinta del instrumento según la densidad. */
function inkChannel(ink, density) {
    const d = clamp(density, 0, 1);
    return {
        r: Math.round(255 + (ink.r - 255) * d),
        g: Math.round(255 + (ink.g - 255) * d),
        b: Math.round(255 + (ink.b - 255) * d),
    };
}

// ------------------------------------------------------------------ huella
//
// Una huella por densidad, cacheada: en una firma se pintan varios miles y
// crear un degradado radial en cada una cuesta más que dibujarla.
//
// El NÚCLEO es opaco (por eso el `darken` no acumula) y sólo el borde exterior
// se desvanece con alfa: es la tinta metiéndose en la fibra del papel.

const DENSITY_STEPS = 48;
const sprites = new Map();

function dabSprite(tool, density, radius) {
    const step = Math.round(clamp(density, 0, 1) * DENSITY_STEPS);
    const key = `${tool.key}|${step}|${radius}`;
    const cached = sprites.get(key);
    if (cached) return cached;

    // El radio entra en la clave y cambia con el tamaño de la ventana, así que
    // redimensionar con el panel abierto va generando juegos nuevos. Al pasarse
    // se tira la caché entera: reconstruir una huella no cuesta casi nada.
    if (sprites.size > 400) sprites.clear();

    const size = radius * 2 + 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const c = radius + 1;
    const { r, g, b } = inkChannel(tool.ink, step / DENSITY_STEPS);
    const rgb = `${r},${g},${b}`;
    // El difuminado es la tinta metiéndose en la fibra: décimas de milímetro,
    // no un aerógrafo. Con una orla ancha, casi un tercio del trazo se
    // transparenta y la línea entera se ve descolorida.
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, radius);
    gradient.addColorStop(0, `rgba(${rgb},1)`);
    gradient.addColorStop(tool.core, `rgba(${rgb},1)`);
    gradient.addColorStop(tool.core + (1 - tool.core) * 0.6, `rgba(${rgb},0.55)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, TAU);
    ctx.fill();

    sprites.set(key, canvas);
    return canvas;
}

// ------------------------------------------------------------- grano del papel
//
// El papel no es liso: la punta pinta las crestas de la fibra y se salta los
// valles. Es lo que separa un trazo de tinta de una banda de color con los dos
// bordes paralelos — sin esto, por bien que varíe el grosor, sigue leyéndose
// como una línea de ordenador.
//
// Se aplica como una pasada de `lighten` (máximo por canal) con una trama fija
// anclada al lienzo: sobre el blanco no hace nada y sobre la tinta abre los
// poros. Al ser un máximo contra una trama que no se mueve, repasar dos veces
// la misma zona da el mismo resultado, así que se puede aplicar por tramos
// según se dibuja.

let noiseTile = null;
const paperTiles = new Map();
// WeakMap y no Map: la clave es el CONTEXTO de un lienzo que muere con el panel
// de firma. Con un mapa fuerte, cada vez que se abre «Firmar a mano» quedaba
// retenido un lienzo de 10-13 MB que ya no se puede recolectar.
const paperPatterns = new WeakMap();

const PAPER_SIZE = 256;

/** Ruido de dos escalas, sin teñir: la fibra fina y los grumos. */
function buildNoise() {
    if (noiseTile) return noiseTile;
    const rnd = mulberry32(20260904);
    const octave = (grid) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = grid;
        const ctx = canvas.getContext('2d');
        const raw = ctx.createImageData(grid, grid);
        for (let i = 0; i < grid * grid; i++) {
            const v = Math.floor(rnd() * 256);
            raw.data[i * 4] = raw.data[i * 4 + 1] = raw.data[i * 4 + 2] = v;
            raw.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(raw, 0, 0);
        return canvas;
    };

    noiseTile = document.createElement('canvas');
    noiseTile.width = noiseTile.height = PAPER_SIZE;
    const ctx = noiseTile.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Con una sola escala, el picado sale con un tamaño de mota único y se lee
    // como una trama, no como papel.
    ctx.drawImage(octave(64), 0, 0, PAPER_SIZE, PAPER_SIZE);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(octave(22), 0, 0, PAPER_SIZE, PAPER_SIZE);
    ctx.globalAlpha = 1;
    // Un pelo de desenfoque: el papel no tiene esquinas.
    ctx.filter = 'blur(0.7px)';
    ctx.drawImage(noiseTile, 0, 0);
    ctx.filter = 'none';
    return noiseTile;
}

function buildPaperTile(tool) {
    const key = `${tool.key}`;
    const cached = paperTiles.get(key);
    if (cached) return cached;

    const tile = document.createElement('canvas');
    tile.width = tile.height = PAPER_SIZE;
    const ctx = tile.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(buildNoise(), 0, 0);

    // Cada píxel de la trama guarda el TECHO DE TINTA de ese punto del papel:
    // un color de la propia recta blanco→tinta. Con `lighten` (máximo), donde
    // el techo es la tinta pura no pasa nada, y donde baja, el trazo se aclara
    // hasta ese techo — sin salirse de la recta.
    //
    // La trama NO puede ser gris: `max(tinta, gris)` dessatura el azul y el
    // trazo tira a gris violáceo, que es justo lo que no queremos.
    //
    // Y PICA la tinta, no la borra: en el peor valle del papel queda más de la
    // mitad. Con un techo bajo, el relleno se ve translúcido.
    const image = ctx.getImageData(0, 0, PAPER_SIZE, PAPER_SIZE);
    for (let i = 0; i < PAPER_SIZE * PAPER_SIZE; i++) {
        const v = image.data[i * 4];
        const lift = clamp((v - 158) / 97, 0, 1);
        const ceiling = 1 - Math.pow(lift, 1.3) * tool.grain;
        const { r, g, b } = inkChannel(tool.ink, ceiling);
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    paperTiles.set(key, tile);
    return tile;
}

function patternFor(ctx, tool) {
    let byTool = paperPatterns.get(ctx);
    if (!byTool) {
        byTool = new Map();
        paperPatterns.set(ctx, byTool);
    }
    const cached = byTool.get(tool.key);
    if (cached) return cached;
    const pattern = ctx.createPattern(buildPaperTile(tool), 'repeat');
    if (pattern) byTool.set(tool.key, pattern);
    return pattern;
}

/**
 * Pasa el grano por toda la hoja de una vez. Para repintar: sale mucho más
 * barato que tramo a tramo y da lo mismo, porque es un máximo contra una trama
 * anclada al lienzo.
 */
export function applyPaperGrain(ctx, tool) {
    const pattern = patternFor(ctx, tool);
    if (!pattern) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
}

// ------------------------------------------------------------------ pincel

const SPEED_FULL = 2.5;      // px/ms a partir de los cuales el trazo va al mínimo
const TAIL = 7;              // px sobre los que la punta se levanta al terminar
const DRY_START = 11;        // px que tarda una punta seca en soltar tinta

export class InkBrush {
    pts = [];
    speeds = [];
    painted = 0;
    speed = 0;
    smooth = null;
    skip = 0;
    dabs = 0;
    /** La punta se coge inclinada: un lado raílea más que el otro. */
    /** Este rasgo arranca seco (la punta llevaba un rato levantada). */
    /** Recorrido acumulado del rasgo: de aquí salen el arranque y el temblor. */
    travel = 0;

    constructor(ctx, options = {}) {
        this.ctx = ctx;
        this.tool = options.instrument ?? DEFAULT_INSTRUMENT;
        this.radius = (options.radius ?? 1.6) * this.tool.size;
        this.scale = options.scale ?? 2;
        this.rnd = mulberry32(options.seed ?? 1);
        this.tilt = 0.8 + this.rnd() * 0.4;
        this.dry = this.rnd() < this.tool.dry;
        this.phase = this.rnd() * 100;
        this.grain = options.grain ?? true;
        // Resolución de la huella en píxeles de dispositivo, con margen para el
        // radio máximo (el empastado de las paradas lo agranda un 15%).
        this.spriteRadius = Math.max(6, Math.ceil(this.radius * 1.3 * this.scale) + 2);
    }

    /** La punta aterriza: deja un punto, como el boli al apoyarlo. */
    down(point) {
        this.smooth = { x: point.x, y: point.y };
        this.pts = [point];
        this.speeds = [0];
        this.speed = 0;
        this.painted = 0;
        this.travel = 0;
        // Una punta en uso deja una gota al apoyar; una que llevaba un rato
        // levantada tarda un centímetro en soltar tinta.
        if (!this.dry) {
            this.dab(point.x, point.y, this.radius * 1.08, this.tool.densityMax);
            this.erode(point.x - this.radius * 1.5, point.y - this.radius * 1.5,
                point.x + this.radius * 1.5, point.y + this.radius * 1.5);
        }
    }

    move(point) {
        if (!this.pts.length) return this.down(point);

        // Suavizado de entrada: el ratón da coordenadas enteras y sin esto el
        // trazo sale escalonado a poco que se vaya despacio.
        const s = this.smooth;
        s.x += (point.x - s.x) * 0.62;
        s.y += (point.y - s.y) * 0.62;

        const previous = this.pts[this.pts.length - 1];
        const dx = s.x - previous.x;
        const dy = s.y - previous.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.7) return;   // ruido de la mano parada

        const dt = Math.max(1, point.t - previous.t);
        const raw = distance / dt;
        this.speed = this.speed * 0.6 + raw * 0.4;

        this.pts.push({ x: s.x, y: s.y, pressure: point.pressure, t: point.t });
        this.speeds.push(this.speed);
        this.flush(false);
    }

    /** Cierra el trazo pintando lo que quedaba pendiente de vecinos. */
    up() {
        this.flush(true);
        this.pts = [];
        this.speeds = [];
        this.smooth = null;
    }

    // ------------------------------------------------------------ interno

    /**
     * Un segmento sólo se puede pintar cuando ya existe el punto siguiente al
     * siguiente (la curva necesita los cuatro), así que en vivo va un punto por
     * detrás del cursor. Al levantar se pinta el resto.
     */
    flush(final) {
        const n = this.pts.length;
        const last = (final ? n - 2 : n - 3);
        for (let k = this.painted; k <= last; k++) this.segment(k, final && k === last);
        if (last >= this.painted) this.painted = last + 1;
    }

    segment(k, isLast) {
        const pts = this.pts;
        const tool = this.tool;
        const p0 = pts[k - 1] ?? pts[k];
        const p1 = pts[k];
        const p2 = pts[k + 1];
        const p3 = pts[k + 2] ?? p2;
        if (!p1 || !p2) return;

        const v1 = this.speeds[k] ?? 0;
        const v2 = this.speeds[k + 1] ?? v1;

        // La bola patina en las curvas rápidas: raro, corto y sólo a velocidad.
        if (this.skip <= 0 && v2 > 1.5 && this.rnd() < tool.skip) {
            this.skip = 2 + Math.floor(this.rnd() * 4);
        }

        const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const spacing = Math.max(0.32, this.radius * 0.24);
        const steps = Math.max(2, Math.ceil(length / spacing));

        // Esquina cerrada: ahí la mano frena y la tinta se empasta. El ángulo se
        // mide entre lo que traía el trazo y lo que va a hacer.
        const pool = corner(p0, p1, p2) * tool.pooling;

        let previousX = spline(p0.x, p1.x, p2.x, p3.x, 0);
        let previousY = spline(p0.y, p1.y, p2.y, p3.y, 0);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 1; i <= steps; i++) {
            const u = i / steps;
            const rawX = spline(p0.x, p1.x, p2.x, p3.x, u);
            const rawY = spline(p0.y, p1.y, p2.y, p3.y, u);

            const tx = rawX - previousX;
            const ty = rawY - previousY;
            const advance = Math.hypot(tx, ty);
            this.travel += advance;

            const v = v1 + (v2 - v1) * u;
            const k1 = clamp(v / SPEED_FULL, 0, 1);

            let radius = this.radius * (1 - tool.thinning * k1);
            let density = tool.densityMax - (tool.densityMax - tool.densityMin) * Math.pow(k1, 0.8);

            // Plumín plano: el grosor lo manda la DIRECCIÓN del rasgo, no la
            // velocidad. Es lo que distingue una pluma de todo lo demás.
            if (tool.nib && advance > 0.001) {
                const relative = Math.atan2(ty, tx) - tool.nib.angle;
                radius *= tool.nib.thin + (1 - tool.nib.thin) * Math.abs(Math.sin(relative));
            }

            // Un lápiz sí dice cuánto aprieta la mano; el ratón, no.
            const pressure = p1.pressure ?? p2.pressure;
            if (pressure != null) {
                radius *= 0.7 + 0.6 * pressure;
                density *= 0.72 + 0.56 * pressure;
            }

            // Empastado de la esquina, más fuerte justo al entrar en ella.
            if (pool > 0) {
                const at = pool * (1 - u);
                radius *= 1 + 0.2 * at;
                density += 0.1 * at;
            }

            // Arranque seco: la punta no suelta tinta hasta rodar un poco.
            if (this.dry) {
                const wet = clamp(this.travel / DRY_START, 0, 1);
                density *= 0.55 + 0.45 * wet;
                radius *= 0.8 + 0.2 * wet;
            }

            // La punta se levanta: el final del rasgo muere afilado, no cortado.
            // Un rotulador no lo hace: el fieltro deja el corte a escuadra.
            if (isLast && tool.taper < 1) {
                const left = clamp((length * (1 - u)) / TAIL, 0, 1);
                radius *= tool.taper + (1 - tool.taper) * left;
                density *= 0.68 + 0.32 * left;
            }

            // El caudal de tinta sube y baja a lo largo del rasgo: pasajes más
            // cargados y otros más pálidos. Es lo que se nota a tamaño real —
            // el grano del papel, a ese tamaño, el ojo lo promedia.
            //
            // Ojo: todo esto MULTIPLICA, así que un vaivén amplio no oscila
            // alrededor del valor — lo baja de media y agua el trazo entero.
            density *= 0.96 + 0.05 * Math.sin(this.travel * 0.021 + this.phase);
            density *= 0.98 + 0.02 * Math.sin(this.travel * 0.115 + this.phase * 3);
            // Y la propia punta no suelta igual de un punto al siguiente.
            this.dabs++;
            density *= 0.98 + 0.02 * this.rnd();

            if (this.skip > 0) {
                density *= 0.28;
                radius *= 0.9;
                this.skip--;
            }

            density = clamp(density, 0, 1);

            // Microtemblor de la mano: sin él la línea es demasiado perfecta y
            // vuelve a leerse como una curva calculada. Décimas de píxel.
            let x = rawX;
            let y = rawY;
            let nx = 0, ny = 0;
            if (advance > 0.001) {
                nx = -ty / advance;
                ny = tx / advance;
                const wobble = this.radius * tool.wobble *
                    (Math.sin(this.travel * 0.13 + this.phase) +
                        0.6 * Math.sin(this.travel * 0.041 + this.phase * 2));
                x += nx * wobble;
                y += ny * wobble;
            }

            this.dab(x, y, radius, density);

            // Los raíles: la bola empuja la tinta hacia los lados y deja los
            // bordes del trazo más cargados que el centro. Es lo que distingue
            // un bolígrafo de una línea dibujada, así que va aparte — con la
            // mezcla por mínimo, un anillo dentro de la propia huella teñiría
            // también el interior al pasar la huella siguiente. Ni la pluma ni
            // el rotulador los tienen: no hay bola que empuje nada.
            if (tool.rails > 0 && (nx || ny) && radius > 0.8) {
                const offset = radius * 0.52;
                const edge = radius * 0.46;
                this.dab(x + nx * offset, y + ny * offset, edge,
                    clamp(density + tool.rails * this.tilt, 0, 1));
                this.dab(x - nx * offset, y - ny * offset, edge,
                    clamp(density + tool.rails / this.tilt, 0, 1));
            }

            const reach = radius * 1.6;
            if (x - reach < minX) minX = x - reach;
            if (y - reach < minY) minY = y - reach;
            if (x + reach > maxX) maxX = x + reach;
            if (y + reach > maxY) maxY = y + reach;

            previousX = rawX;
            previousY = rawY;
        }

        if (maxX > minX) this.erode(minX, minY, maxX, maxY);
    }

    dab(x, y, radius, density) {
        const sprite = dabSprite(this.tool, density, this.spriteRadius);
        const size = radius * 2;
        this.ctx.drawImage(sprite, x - radius, y - radius, size, size);
    }

    /**
     * El grano del papel, sobre lo que se acaba de pintar.
     *
     * Va por tramos y no de una vez al final porque tiene que verse mientras se
     * firma. Puede repetirse sobre lo ya tramado sin acumular: es un máximo
     * contra una trama fija, no una capa que se suma.
     */
    erode(x0, y0, x1, y1) {
        if (!this.grain || this.tool.grain <= 0) return;
        const pattern = patternFor(this.ctx, this.tool);
        if (!pattern) return;
        const s = this.scale;
        const ctx = this.ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighten';
        ctx.fillStyle = pattern;
        ctx.fillRect(Math.floor(x0 * s), Math.floor(y0 * s),
            Math.ceil((x1 - x0) * s) + 1, Math.ceil((y1 - y0) * s) + 1);
        ctx.restore();
    }
}

// ---------------------------------------------------------------- exportar


/**
 * Convierte la hoja blanca en un PNG con fondo transparente, recortado a la
 * firma.
 *
 * Todo píxel pintado es una mezcla exacta de blanco y tinta —también los que
 * ha aclarado el grano del papel, que va tintado a propósito—, así que el alfa
 * se recupera invirtiendo esa mezcla: canal rojo, que es el que más recorrido
 * tiene entre 255 y la tinta. Así se conserva la variación de densidad: el
 * trazo rápido sigue saliendo más claro que el lento, en vez de aplanarse todo
 * a un azul plano.
 *
 * @param padding margen alrededor de la firma, en px de dispositivo.
 */
export function extractInk(canvas, tool, padding = 16) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return null;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const source = ctx.getImageData(0, 0, width, height).data;

    const span = 255 - tool.ink.r;
    const alpha = new Float32Array(width * height);
    let minX = width, minY = height, maxX = -1, maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const a = clamp((255 - source[index * 4]) / span, 0, 1);
            alpha[index] = a;
            if (a > 0.05) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < 0) return null;   // hoja en blanco

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    const out = document.createElement('canvas');
    out.width = cropWidth;
    out.height = cropHeight;
    const outCtx = out.getContext('2d');
    const image = outCtx.createImageData(cropWidth, cropHeight);

    for (let y = 0; y < cropHeight; y++) {
        for (let x = 0; x < cropWidth; x++) {
            const from = (y + minY) * width + (x + minX);
            const to = (y * cropWidth + x) * 4;
            image.data[to] = tool.ink.r;
            image.data[to + 1] = tool.ink.g;
            image.data[to + 2] = tool.ink.b;
            image.data[to + 3] = Math.round(alpha[from] * 255);
        }
    }

    outCtx.putImageData(image, 0, 0);
    return {
        dataUrl: out.toDataURL('image/png'),
        width: cropWidth,
        height: cropHeight,
        instrument: tool,
    };
}
