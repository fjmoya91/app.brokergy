// ============================================================================
// herramientas.mjs — lo que el agente del banco puede hacer, y nada más.
//
// Son las MISMAS órdenes de `cee_inicial.js` que usa la skill, lanzadas con
// `seco.cjs` delante (BD y Drive sin escritura, CEE del técnico oculto), más lo
// que en Claude Code hacía `Read`: mirar una foto, un PDF o un texto. Todo
// queda dentro de la carpeta de trabajo de la pasada; la skill se puede leer.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..', '..');
export const BACK = path.join(RAIZ, 'implementation', 'backend');
export const SKILLS = path.join(RAIZ, 'skills');
const SECO = path.join(AQUI, 'seco.cjs');
const IMAGEN = path.join(AQUI, 'imagen.py');

//: Órdenes de cee_inicial.js que el agente puede lanzar (todas en seco).
const ORDENES = ['estado', 'placas', 'fotos', 'paredes', 'catastro', 'leer-pared', 'streetview',
    'video', 'pedir-fotos', 'eprel', 'keymark', 'alta-aerotermia', 'aplicar', 'listo'];
const SIN_CLAVE = new Set(['eprel', 'keymark', 'alta-aerotermia']);
const CON_OUT = new Set(['fotos', 'paredes', 'catastro', 'streetview', 'eprel', 'keymark', 'listo']);
//: Lo que nunca pasa: escribir, enviar y lo que vuelve a pagar una lectura.
//: `listo` también, SOLO en seco: califica con CE3X y deja los canónicos en la
//: carpeta de trabajo (`--out`); subirlos es de la sesión, con el «sí» de Fran.
const PROHIBIDAS = ['--escribir', '--enviar', '--refrescar', '--refrescar-catastro', '--actualizar', '--forzar'];
const OPC_RUTA = new Set(['--plan', '--archivo', '--json', '--out', '--ficha', '--eprel-fiche',
    '--eprel-label', '--anexo', '--cex']);

const MAX_SALIDA = 30_000;
const RUIDO = /^(\[wwa\]|\[dotenv|\[Email\]|Loading Climate Data|Climate Service:)/;

export const DEFINICIONES = [
    {
        name: 'cee_inicial',
        description: 'Lanza una orden de implementation/backend/scripts/cee_inicial.js sobre el expediente de esta pasada, '
            + 'SIEMPRE en seco (el arnés quita --escribir/--enviar y corta cualquier escritura). La clave del expediente '
            + 'la pone el arnés: no la repitas en argumentos (salvo en eprel/keymark/alta-aerotermia, que no llevan clave). '
            + '--out se pone solo en la carpeta de trabajo. Las rutas de --plan, --json, --archivo… son relativas a la '
            + 'carpeta de trabajo. `listo` (tras `aplicar`) lo califica con CE3X 3.2, calcula las medidas y deja en '
            + 'listo/ el .cex/.xml/.pdf con su nombre canónico, como quedarían para firmar; si avisa de que la copia local '
            + 'no es la de Drive, repítelo con --cex <la «copia local» que imprimió aplicar>. '
            + 'Devuelve la salida del script (recortada a ~30.000 caracteres).',
        input_schema: {
            type: 'object',
            properties: {
                orden: { type: 'string', enum: ORDENES },
                argumentos: { type: 'array', items: { type: 'string' },
                    description: 'Opciones tras la clave, p. ej. ["--pared","FBE1","--fotos","1abc,2def"] o ["--plan","plan.json","--calificar"].' },
            },
            required: ['orden'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'ver_imagen',
        description: 'Mira una imagen de la carpeta de trabajo (foto, plano.png, satelite.png, fotograma…), reducida. '
            + 'lado_max entre 400 y 1600 (por defecto 1200; más lado = más tokens). recorte en fracciones "x0,y0,x1,y1" '
            + 'para ampliar una zona (una placa, una ventana).',
        input_schema: {
            type: 'object',
            properties: {
                ruta: { type: 'string' },
                lado_max: { type: 'integer', minimum: 400, maximum: 1600 },
                recorte: { type: 'string', description: 'Fracciones de la imagen: "0.2,0.1,0.6,0.5".' },
            },
            required: ['ruta'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'hoja_contactos',
        description: 'Une varias imágenes en UNA hoja numerada (más barato que abrirlas de una en una). Para elegir qué foto es de qué pared.',
        input_schema: {
            type: 'object',
            properties: {
                rutas: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 24 },
                columnas: { type: 'integer', minimum: 1, maximum: 6 },
            },
            required: ['rutas'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'ver_pdf',
        description: 'Mira páginas de un PDF de la carpeta de trabajo (p. ej. catastro/croquis_por_plantas.pdf o un presupuesto), como imágenes.',
        input_schema: {
            type: 'object',
            properties: {
                ruta: { type: 'string' },
                paginas: { type: 'string', description: '"1", "1-2", "1,3" o "todas" (máx. 8).' },
                lado_max: { type: 'integer', minimum: 600, maximum: 1600 },
                como: { type: 'string', enum: ['imagen', 'texto'],
                    description: '«texto» saca el texto del PDF (mucho más barato: un presupuesto se lee así); «imagen» por defecto.' },
            },
            required: ['ruta'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'documentos_obra',
        description: 'Los DOCUMENTOS de la obra en Drive que no son fotos: el presupuesto («0. PRESUPUESTO») y los PDF de '
            + '«12. DOCUMENTOS PARA CEE» (presupuesto, CEE anterior del cliente, planos). «listar» dice cuáles hay con su id; '
            + '«bajar» deja uno en docs/ de la carpeta de trabajo para leerlo con ver_pdf (como texto o como imagen).',
        input_schema: {
            type: 'object',
            properties: {
                accion: { type: 'string', enum: ['listar', 'bajar'] },
                id: { type: 'string', description: 'El id de Drive que dio «listar» (solo para «bajar»).' },
            },
            required: ['accion'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'catalogo_aerotermia',
        description: 'Busca en el CATÁLOGO de aerotermia de la app (solo lectura) por marca, trozo de modelo y/o potencia '
            + '(±1,5 kW). Úsalo SIEMPRE que el presupuesto nombre una máquina, aunque no dé el código exacto, antes de '
            + 'caer en la aerotermia genérica. Devuelve id, modelo, potencia, SCOP y si está validada.',
        input_schema: {
            type: 'object',
            properties: {
                marca: { type: 'string' },
                texto: { type: 'string', description: 'Trozo del modelo comercial o del conjunto, p. ej. "30AWH" o "EBLA".' },
                potencia_kw: { type: 'number' },
            },
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'leer_texto',
        description: 'Lee un fichero de texto (JSON, md, txt) de la carpeta de trabajo o de la skill (skills/…), p. ej. '
            + 'skills/generar-cee-inicial/referencia/video.md o placas.json.',
        input_schema: {
            type: 'object',
            properties: {
                ruta: { type: 'string' },
                desde_linea: { type: 'integer', minimum: 1 },
                lineas: { type: 'integer', minimum: 1, maximum: 2000 },
            },
            required: ['ruta'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'listar',
        description: 'Lista una carpeta (por defecto la de trabajo), dos niveles, con tamaños.',
        input_schema: {
            type: 'object',
            properties: { ruta: { type: 'string' } },
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'escribir_fichero',
        description: 'Escribe un fichero en la carpeta de trabajo (el plan.json, un datos.json…). Devuelve su ruta.',
        input_schema: {
            type: 'object',
            properties: {
                nombre: { type: 'string', description: 'Nombre relativo a la carpeta de trabajo, p. ej. "plan.json".' },
                contenido: { type: 'string' },
            },
            required: ['nombre', 'contenido'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
    {
        name: 'terminar',
        description: 'Termina la pasada con el INFORME FINAL de la skill. Llámala tras el `aplicar … --calificar` bueno, o si no se puede seguir.',
        input_schema: {
            type: 'object',
            properties: {
                estado: { type: 'string', enum: ['hecho', 'parcial', 'imposible'] },
                informe: { type: 'string' },
                preguntas: { type: 'array', items: { type: 'string' },
                    description: 'Lo que habrías preguntado a Fran y qué has supuesto en su lugar.' },
            },
            required: ['estado', 'informe'],
            additionalProperties: false,
        },
        eager_input_streaming: true,
    },
];

// ─── Utilidades ──────────────────────────────────────────────────────────────

const igual = (a, b) => a.toLowerCase() === b.toLowerCase();
function dentro(ruta, base) {
    const r = path.resolve(ruta);
    const b = path.resolve(base);
    return igual(r, b) || r.toLowerCase().startsWith(b.toLowerCase() + path.sep);
}

/** Una ruta que puede venir relativa a la carpeta de trabajo, o absoluta. */
function resolver(ctx, ruta, { leerSkill = false } = {}) {
    if (!ruta) throw new Error('Falta la ruta.');
    let r = String(ruta).replace(/^["']|["']$/g, '');
    if (/^skills[\\/]/i.test(r)) r = path.join(RAIZ, r);
    const abs = path.isAbsolute(r) ? path.resolve(r) : path.resolve(ctx.dir, r);
    if (dentro(abs, ctx.dir)) return abs;
    if (leerSkill && dentro(abs, SKILLS)) return abs;
    throw new Error(`Fuera de la carpeta de trabajo: ${ruta}`);
}

function recortar(texto) {
    const limpio = texto.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
        .filter(l => !RUIDO.test(l.trim())).join('\n');
    if (limpio.length <= MAX_SALIDA) return limpio;
    return `${limpio.slice(0, 20_000)}\n\n[… ${limpio.length - 30_000} caracteres recortados por el arnés …]\n\n${limpio.slice(-10_000)}`;
}

function lanzar(cmd, args, { cwd, env, ms }) {
    return new Promise((resolve) => {
        const p = spawn(cmd, args, { cwd, env, windowsHide: true });
        let out = '';
        const t = setTimeout(() => { out += `\n[arnés: tiempo agotado a los ${ms / 1000} s]`; p.kill(); }, ms);
        p.stdout.on('data', d => { out += d; });
        p.stderr.on('data', d => { out += d; });
        p.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
        p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: `${out}\n${e.message}` }); });
    });
}

async function python(ctx, args) {
    // -P y no -I: con -I no ve el Pillow instalado para el usuario. Las fotos
    // (bajadas de Drive) van como ARGUMENTOS y el directorio es el del banco.
    const { code, out } = await lanzar('python', ['-P', IMAGEN, ...args],
        { cwd: AQUI, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, ms: 120_000 });
    if (code !== 0) throw new Error(`imagen.py: ${out.slice(-800)}`);
    return JSON.parse(out.trim().split(/\r?\n/).pop());
}

function bloqueImagen(ruta) {
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(ruta).toString('base64') } };
}

let contador = 0;
const tmpImg = ctx => path.join(ctx.dir, '_vistas', `${Date.now()}_${++contador}.jpg`);

// ─── Ejecutores ──────────────────────────────────────────────────────────────

async function ceeInicial(ctx, { orden, argumentos = [] }) {
    if (!ORDENES.includes(orden)) throw new Error(`Orden no permitida: ${orden}`);
    const args = [];
    let hayOut = false;
    for (let i = 0; i < argumentos.length; i++) {
        const a = String(argumentos[i]);
        const nombre = a.split('=')[0];
        // En PRODUCCIÓN (`ctx.real`) solo `aplicar` escribe: es el paso que sube el
        // .cex, lo califica y avisa al equipo, como en la skill. Lo demás, igual que en seco.
        if (ctx.real && nombre === '--escribir' && orden === 'aplicar') { args.push(a); continue; }
        if (PROHIBIDAS.includes(nombre)) continue; // en seco: se quita sin más
        if (igual(a, ctx.clave)) continue;         // la clave la pone el arnés
        if (OPC_RUTA.has(nombre)) {
            if (nombre === '--out') hayOut = true;
            const valor = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argumentos[++i];
            if (valor === undefined) throw new Error(`${nombre} sin valor`);
            // --ficha "f.pdf:1,3|Nombre" y --anexo: la ruta es lo de antes de ':' o '|'.
            const m = String(valor).match(/^(.*?\.(pdf|json|mp4|mov|jpg|jpeg|png))(.*)$/i);
            const ruta = m ? m[1] : String(valor);
            args.push(nombre, resolver(ctx, ruta) + (m ? m[3] : ''));
            continue;
        }
        args.push(a);
    }
    if (CON_OUT.has(orden) && !hayOut) args.push('--out', path.join(ctx.dir,
        orden === 'eprel' || orden === 'keymark' || orden === 'listo' ? orden : 'trabajo'));
    const final = SIN_CLAVE.has(orden) ? [orden, ...args] : [orden, ctx.clave, ...args];
    const env = {
        ...process.env,
        TEMP: ctx.tmp, TMP: ctx.tmp,                 // la caché del script, nueva en cada pasada
        BANCO_LOG_SECO: path.join(ctx.dir, 'seco.log'),
    };
    const t0 = Date.now();
    // En producción, sin `seco.cjs`: el agente ve el expediente tal cual (trabajo guardado
    // incluido) y `aplicar --escribir` puede escribir. Sin `--escribir` las órdenes no escriben.
    const preload = ctx.real ? [] : ['-r', SECO];
    const { code, out } = await lanzar('node', [...preload, 'scripts/cee_inicial.js', ...final],
        { cwd: BACK, env, ms: 20 * 60_000 });
    ctx.registro({ tipo: 'orden', orden: final, codigo: code, ms: Date.now() - t0, bytes: out.length });
    return `$ node scripts/cee_inicial.js ${final.map(x => (/\s/.test(x) ? `"${x}"` : x)).join(' ')}\n`
        + `(código ${code}, ${Math.round((Date.now() - t0) / 1000)} s)\n\n${recortar(out)}`;
}

async function verImagen(ctx, { ruta, lado_max = 1200, recorte }) {
    const src = resolver(ctx, ruta);
    if (!fs.existsSync(src)) throw new Error(`No existe: ${ruta}`);
    const dst = tmpImg(ctx);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const [r] = await python(ctx, ['foto', src, dst, String(lado_max), ...(recorte ? [recorte] : [])]);
    return [bloqueImagen(dst), { type: 'text', text: `${path.relative(ctx.dir, src)} · ${r.ancho}×${r.alto}` }];
}

async function hojaContactos(ctx, { rutas, columnas = 4 }) {
    const srcs = rutas.map(r => resolver(ctx, r));
    const dst = tmpImg(ctx);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    await python(ctx, ['hoja', dst, '420', String(columnas), ...srcs]);
    const leyenda = srcs.map((s, i) => `${i + 1}. ${path.relative(ctx.dir, s)}`).join('\n');
    return [bloqueImagen(dst), { type: 'text', text: leyenda }];
}

async function documentosObra(ctx, { accion, id }) {
    const args = accion === 'bajar'
        ? ['bajar', ctx.clave, String(id || ''), path.join(ctx.dir, 'docs')]
        : ['listar', ctx.clave];
    const { code, out } = await lanzar('node', ['-r', SECO, path.join(AQUI, 'docs_obra.cjs'), ...args],
        { cwd: BACK, env: { ...process.env, BANCO_LOG_SECO: path.join(ctx.dir, 'seco.log') }, ms: 180_000 });
    ctx.registro({ tipo: 'documentos', args, codigo: code });
    return salida(code, out);
}

async function catalogoAerotermia(ctx, filtros) {
    const { code, out } = await lanzar('node', ['-r', SECO, path.join(AQUI, 'catalogo.cjs'), JSON.stringify(filtros || {})],
        { cwd: BACK, env: { ...process.env, BANCO_LOG_SECO: path.join(ctx.dir, 'seco.log') }, ms: 60_000 });
    ctx.registro({ tipo: 'catalogo', filtros, codigo: code });
    return salida(code, out);
}

//: 3221226505 es el aviso de Windows al cerrar node con Supabase abierto: el
//: resultado ya está impreso, así que no es un fallo.
const salida = (code, out) => (code === 0 || code === 3221226505
    ? recortar(out) : `(falló, código ${code})\n${recortar(out)}`);

async function verPdf(ctx, { ruta, paginas = '1', lado_max = 1400, como = 'imagen' }) {
    const src = resolver(ctx, ruta);
    if (como === 'texto') {
        const [r] = await python(ctx, ['texto', src, paginas]);
        const util = String(r.texto || '').replace(/--- página \d+ de \d+ ---/g, '').trim();
        if (util.length < 40) return 'Este PDF no trae texto (es un escaneo): míralo con como «imagen».';
        return recortar(r.texto);
    }
    const dir = path.join(ctx.dir, '_vistas', `pdf_${Date.now()}`);
    const r = await python(ctx, ['pdf', src, dir, String(lado_max), paginas]);
    return [...r.map(p => bloqueImagen(p.ruta)),
        { type: 'text', text: r.map(p => `página ${p.pagina} de ${p.de}`).join(' · ') }];
}

function leerTexto(ctx, { ruta, desde_linea = 1, lineas = 400 }) {
    const src = resolver(ctx, ruta, { leerSkill: true });
    const todas = fs.readFileSync(src, 'utf8').split(/\r?\n/);
    const trozo = todas.slice(desde_linea - 1, desde_linea - 1 + lineas).join('\n');
    return `${path.basename(src)} · líneas ${desde_linea}-${Math.min(todas.length, desde_linea - 1 + lineas)} de ${todas.length}\n\n${recortar(trozo)}`;
}

function listar(ctx, { ruta } = {}) {
    const base = ruta ? resolver(ctx, ruta, { leerSkill: true }) : ctx.dir;
    const out = [];
    const recorre = (d, nivel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === '_vistas') continue;
            const p = path.join(d, e.name);
            const rel = path.relative(base, p);
            if (e.isDirectory()) { out.push(`${rel}/`); if (nivel < 2) recorre(p, nivel + 1); }
            else out.push(`${rel}  ${Math.round(fs.statSync(p).size / 1024)} KB`);
            if (out.length > 400) return;
        }
    };
    recorre(base, 1);
    return out.join('\n') || '(vacía)';
}

function escribirFichero(ctx, { nombre, contenido }) {
    const dst = resolver(ctx, nombre);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, contenido, 'utf8');
    if (/\.json$/i.test(dst)) {
        try { JSON.parse(contenido); } catch (e) { return `Escrito ${dst}, PERO no es JSON válido: ${e.message}`; }
    }
    return `Escrito ${dst} (${contenido.length} caracteres)`;
}

const EJECUTORES = {
    cee_inicial: ceeInicial, ver_imagen: verImagen, hoja_contactos: hojaContactos, ver_pdf: verPdf,
    documentos_obra: documentosObra, catalogo_aerotermia: catalogoAerotermia,
    leer_texto: leerTexto, listar, escribir_fichero: escribirFichero,
};

/** Comprueba la entrada contra su esquema (con streaming ansioso puede llegar cortada). */
export function validar(nombre, entrada) {
    const def = DEFINICIONES.find(d => d.name === nombre);
    if (!def) return `Herramienta desconocida: ${nombre}`;
    if (!entrada || typeof entrada !== 'object') return 'Entrada vacía o no es un objeto.';
    for (const k of def.input_schema.required || []) {
        if (entrada[k] === undefined || entrada[k] === null) return `Falta «${k}».`;
    }
    for (const [k, v] of Object.entries(entrada)) {
        const p = def.input_schema.properties[k];
        if (!p) return `Campo no admitido: «${k}».`;
        if (p.type === 'string' && typeof v !== 'string') return `«${k}» tiene que ser texto.`;
        if (p.type === 'array' && !Array.isArray(v)) return `«${k}» tiene que ser una lista.`;
        if (p.type === 'integer' && !Number.isInteger(v)) return `«${k}» tiene que ser un entero.`;
        if (p.type === 'number' && typeof v !== 'number') return `«${k}» tiene que ser un número.`;
        if (p.enum && !p.enum.includes(v)) return `«${k}» no es uno de ${p.enum.join(', ')}.`;
    }
    return null;
}

/** Ejecuta UNA llamada y devuelve el `content` de su tool_result. */
export async function ejecutar(ctx, nombre, entrada) {
    const f = EJECUTORES[nombre];
    if (!f) throw new Error(`Herramienta desconocida: ${nombre}`);
    const r = await f(ctx, entrada);
    return typeof r === 'string' ? r : r;
}
