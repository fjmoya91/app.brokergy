// ─── El ASISTENTE de la ENVOLVENTE ────────────────────────────────────────────
//
// Se le dice, con texto o con la voz, lo que está mal en el plano («la V3 no va en
// la FB1 sino en la FB3, y es de PVC», «el garaje llega hasta el final de la
// vivienda», «quita la medida de autoconsumo») y devuelve OPERACIONES: una lista
// corta, validada por esquema, que el navegador aplica con las MISMAS funciones
// que los botones de la ventana. Claude no reescribe el trabajo ni lo ve entero.
//
// Por qué así y no de otra forma (2026-10-27, lo pidió Fran: «con la llave de
// Claude y gastando los menos tokens posibles»):
//   - Lo que viaja es un RESUMEN COMPACTO del plano (una línea por pared, con sus
//     huecos; una por zona; una por medida), que compone el navegador
//     (`logic/asistenteEnvolvente.js`): ~1-3 k tokens frente a los 100-300 k del
//     trabajo entero.
//   - Las instrucciones y el esquema son FIJOS y van con caché; lo variable (el
//     resumen y lo dicho) va detrás del último punto de caché.
//   - Primero Haiku 5.5 sin razonamiento (0,10 $/0,50 $ por millón). Solo si no
//     está seguro, si su salida no se lee, o si el navegador no ha podido casar lo
//     que propuso con el plano (`reintento`), se repite con Sonnet 5.5.
//   - Cada petición apunta sus tokens y su coste en
//     `scratch/asistente-envolvente/consumo.jsonl`.
//
// No escribe NADA: ni BD, ni Drive. Aplicar y regenerar el `.cex` lo hace la
// ventana tras el «Sí» de la persona, por el camino de siempre.

const fs = require('fs');
const path = require('path');
const AnthropicMod = require('@anthropic-ai/sdk');

const Anthropic = AnthropicMod.default || AnthropicMod;

const MODELO_BARATO = process.env.ASISTENTE_ENV_MODELO || 'claude-haiku-5-5';
const MODELO_MAYOR = process.env.ASISTENTE_ENV_MODELO_MAYOR || 'claude-sonnet-5-5';
const MAX_CHARS_TEXTO = 2000;
const MAX_CHARS_RESUMEN = 24_000;
const MAX_TOKENS_SALIDA = 1500;
const DIR_CONSUMO = path.join(__dirname, '..', 'scratch', 'asistente-envolvente');

// $ por millón: entrada, salida, lectura de caché (mismos que el asistente de la app).
const PRECIOS = {
    'claude-sonnet-5-5': [2, 10, 0.20],
    'claude-haiku-5-5': [0.10, 0.50, 0.01],
    'claude-opus-5-5': [4, 20, 0.20],
};

let cliente = null;
function anthropic() {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!cliente) cliente = new Anthropic({ maxRetries: 2, timeout: 60_000 });
    return cliente;
}

// ─── Lo FIJO: instrucciones y esquema (cacheados) ─────────────────────────────

const INSTRUCCIONES = `Eres el asistente de la ventana de la ENVOLVENTE de BROKERGY, donde un certificador energético corrige el plano de una vivienda antes de generar su certificado (.cex de CE3X). Te dicen, a menudo DICTADO por voz, lo que está mal. Tú NO editas nada: devuelves OPERACIONES que la ventana aplica después de que la persona diga «Sí».

Recibes el RESUMEN del plano con identificadores estables:
- PLANTAS: P0, P1… con su nombre.
- PAREDES: una línea por pared: nombre (FBE1, MBN2, PBS1…), tipo (FACHADA, MEDIANERA, PARTICION…), rumbo (N, NE, E…), largo, planta y sus HUECOS (V1, V2… ventanas; P1… puertas) con medidas ancho×alto (? = sin confirmar), marco, vidrio y persiana. «apartada» = no cuenta en la envolvente.
- ZONAS: lo que no es vivienda dentro de una planta (Z1 GARAJE…), con su caja y, por cada lado (N, S, E, O), cuántos metros le faltan hasta el borde de la planta.
- MEDIDAS DE MEJORA: el catálogo, con su id, si está puesta [x] o no [ ], y las no disponibles con su motivo.
- Los valores admitidos.
Puede venir también «PARED SELECCIONADA»: la que la persona tiene abierta; «esta pared», «aquí» o «esta ventana» se refieren a ella.

Operaciones (cada una lleva TODOS sus campos; lo que no cambia va como "igual" o 0, según se indica):
- mover_hueco {hueco, pared}: el hueco pasa a esa pared con sus medidas y su carpintería.
- carpinteria {hueco, marco, vidrio, persiana}: marco y vidrio con un valor admitido o "igual"; persiana "si", "no" o "igual".
- medida_hueco {hueco, ancho, alto}: en metros; 0 = no cambia.
- anadir_hueco {pared, tipo, ancho, alto, marco}: tipo "ventana" o "puerta"; ancho/alto 0 si no se han dicho; marco "igual" = el de la casa.
- quitar_hueco {hueco}.
- cambiar_pared {pared, tipo, rumbo, apartar}: tipo FACHADA (al exterior), MEDIANERA (al vecino), PARTICION (a un garaje o local sin calefactar) o "igual"; rumbo N, NE, E, SE, S, SO, O, NO o "igual"; apartar "si" (no cuenta en la envolvente), "no" (vuelve) o "igual".
- ajustar_zona {zona, lado, hasta_borde, metros}: alarga o encoge una zona existente por un lado N/S/E/O; hasta_borde true la lleva hasta el final de la planta por ese lado («llega hasta el final de la vivienda», «hasta el fondo»); si no, metros (negativo = encoger).
- nueva_zona {planta, uso, lado, fondo}: lo que no es vivienda (GARAJE, ALMACEN, ESPACIO NO HABITABLE, PORCHE) pegado a un lado de la planta, con todo su ancho y ese fondo en metros.
- quitar_zona {zona}: vuelve a contar como vivienda.
- medidas {fase, poner, quitar}: fase "inicial" o "final"; ids del catálogo.

Reglas:
1. Usa SOLO los nombres que salen en el resumen. El dictado deforma: «efe be uno» = FB1; «uve tres» = V3; «pe uno» = P1; «PC», «PCE» o «pe ce» como marco = PVC; «climalit» o «doble acristalamiento» = Doble; «bajo emisivo» = Doble bajo emisivo; «aluminio» = Metálico sin RPT, salvo que digan «rotura de puente térmico» o «RPT» (Metálico con RPT). Si dicen «FB3» y solo hay UNA pared que empiece por FB y acabe en 3 (FBE3), es esa; si hay dos (FBE1 y FBO1), PREGUNTA cuál nombrando las dos. «E3», «N1», «la este tres» (sin las dos letras de delante) = la única pared que acaba así (FBE3, FBN1).
2. NO pidas confirmación de lo que está claro: la pantalla enseña el cambio en palabras y la persona lo acepta con un «Sí». Pregunta SOLO si hay dos opciones reales o falta un dato que cambia el resultado (hacia qué lado, qué planta, qué pared). Entonces: operaciones vacías y una "pregunta" corta con las opciones reales del resumen. Lo que no existe no se inventa. NUNCA preguntes por medidas, marco ni vidrio de un hueco nuevo: van 0 y "igual" y la pantalla lo deja «por confirmar».
3. Lo que no se ha dicho no se toca. Una operación por cosa y en el orden en que se dicen: mover y cambiar el marco son DOS (mover_hueco y carpinteria).
4. En PLURAL, una operación por hueco: «las ventanas de FBE1 son de PVC» = una carpinteria por cada ventana (V…) de FBE1, las puertas no; «todas las ventanas de la casa» = las de todas las paredes. «Hay otra igual» o «son dos» = anadir_hueco con las medidas y el marco de la que se nombra.
5. Medidas en metros con punto decimal: «uno veinte por uno diez» o «1,20 x 1,10» = ancho 1.2, alto 1.1 (primero el ancho). Un número mayor de 20 son centímetros: «ciento veinte por ciento diez» = 1.2 × 1.1.
6. Qué es una pared: «da a la calle», «al patio», «al exterior» = FACHADA; «da al vecino», «pegada a la casa de al lado», «medianera» = MEDIANERA; «da al garaje», «a la cochera», «al trastero», «a un local sin calefacción» = PARTICION; «no existe», «es una valla», «es un muro del patio», «no es de la casa» = apartar "si". Una pared que pasa a FACHADA sin rumbo en el resumen: rumbo "igual" (la pantalla le pone el de fuera de la planta). Una VENTANA o PUERTA en una pared MEDIANERA o PARTICION significa que esa pared da al exterior: cambiar_pared {pared, FACHADA, igual, igual} y después los anadir_hueco; no preguntes.
7. Zonas: «el garaje llega hasta el final», «hasta el fondo» = ajustar_zona hasta_borde por el lado al que le faltan metros; si le faltan por DOS lados y nada dice cuál, PREGUNTA nombrando los lados y los metros; si solo a uno le faltan, es ese. «El garaje es más pequeño / no llega hasta…» = metros negativos. «Ya no es garaje», «es vivienda» = quitar_zona. Si no hay zona de ese uso, pregunta dónde está y cuánto fondo tiene, o usa nueva_zona si lo dicen.
8. Medidas de mejora: casa lo dicho con el id o el título del catálogo («placas», «paneles solares», «fotovoltaica» = autoconsumo; «bomba de calor» = aerotermia). Una no disponible no se pone: dilo en la pregunta con su motivo.
9. Si el texto trae «LO QUE PIDIÓ», «TU PREGUNTA» y «SU RESPUESTA», es la contestación a tu pregunta: haz lo que pidió con ese dato. «Sí», «vale», «eso» = lo que proponías en la pregunta.
10. "entendido": una frase corta en castellano con los nombres reales. "seguro": false si has tenido que suponer algo importante. "pregunta": "" si no hay.
11. Nada de importes, de cambiar el tipo de edificio ni de cosas fuera de la envolvente: dilo en "pregunta" y no devuelvas operaciones.
12. Si es una PREGUNTA sobre el plano y no un cambio («¿cuántas ventanas tiene FBO1?», «¿qué paredes dan al vecino?»), contéstala en "entendido" con los datos del resumen, sin operaciones y con "pregunta" vacía. «Genera el CEE» o «regenéralo» no es una operación: la ventana lo hace sola tras aplicar.

Ejemplos (con un plano en el que hay FBE1 con V1 y V2, FBE2, FBO1, MBN1, Z1 GARAJE al que le faltan «E 6.0 m · N 0.0 m · S 0.0 m · O 0.0 m», y aerotermia [x], autoconsumo [ ]):
- «la uve dos va en la efe be e dos y es de pe ce» → mover_hueco {V2, FBE2} + carpinteria {V2, PVC, igual, igual}.
- «las ventanas de FBE1 tienen persiana y son de aluminio con rotura» → carpinteria {V1, Metálico con RPT, igual, si} + carpinteria {V2, Metálico con RPT, igual, si}.
- «el garaje llega hasta el fondo» → ajustar_zona {Z1, E, true, 0} (solo al este le faltan metros).
- «la V1 está en la FB1» → pregunta: «¿FBE1 o FBO1?», sin operaciones.
- «esta pared da a la cochera» (PARED SELECCIONADA: FBE2) → cambiar_pared {FBE2, PARTICION, igual, igual}.
- «falta una ventana de ciento veinte por ciento diez en FBE2» → anadir_hueco {FBE2, ventana, 1.2, 1.1, igual}.
- «pon las placas y quita la bomba de calor» → medidas {inicial, [autoconsumo], [aerotermia]}.
- «E2 tiene una ventana y una puerta que sale al patio, y FBO1 otra ventana» (FBE2 es MEDIANERA) → cambiar_pared {FBE2, FACHADA, igual, igual} + anadir_hueco {FBE2, ventana, 0, 0, igual} + anadir_hueco {FBE2, puerta, 0, 0, igual} + anadir_hueco {FBO1, ventana, 0, 0, igual}.`;

// Una forma por operación, con TODOS sus campos obligatorios y «sin cambio»
// dicho con un valor ("igual" o 0). Medido el 27/10/2026: con un solo objeto de
// 21 campos opcionales la API tardaba más de 90 s en compilar la gramática (y
// con los 21 a `null`, 400: no admite más de 16 uniones).
const op = (nombre, campos) => ({
    type: 'object', additionalProperties: false,
    required: ['op', ...Object.keys(campos)],
    properties: { op: { type: 'string', enum: [nombre] }, ...campos },
});
const TXT = { type: 'string' };
const NUM = { type: 'number' };
const ENUM = (...v) => ({ type: 'string', enum: v });
const LADO = ENUM('N', 'S', 'E', 'O');
const ESQUEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['entendido', 'seguro', 'pregunta', 'operaciones'],
    properties: {
        entendido: TXT,
        seguro: { type: 'boolean' },
        pregunta: TXT,
        operaciones: {
            type: 'array',
            items: { anyOf: [
                op('mover_hueco', { hueco: TXT, pared: TXT }),
                op('carpinteria', { hueco: TXT, marco: TXT, vidrio: TXT, persiana: ENUM('si', 'no', 'igual') }),
                op('medida_hueco', { hueco: TXT, ancho: NUM, alto: NUM }),
                op('anadir_hueco', { pared: TXT, tipo: ENUM('ventana', 'puerta'), ancho: NUM, alto: NUM, marco: TXT }),
                op('quitar_hueco', { hueco: TXT }),
                op('cambiar_pared', { pared: TXT, tipo: ENUM('FACHADA', 'MEDIANERA', 'PARTICION', 'igual'),
                                      rumbo: ENUM('N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'igual'),
                                      apartar: ENUM('si', 'no', 'igual') }),
                op('ajustar_zona', { zona: TXT, lado: LADO, hasta_borde: { type: 'boolean' }, metros: NUM }),
                op('nueva_zona', { planta: TXT, uso: ENUM('GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE', 'PORCHE'),
                                   lado: LADO, fondo: NUM }),
                op('quitar_zona', { zona: TXT }),
                op('medidas', { fase: ENUM('inicial', 'final'), poner: { type: 'array', items: TXT },
                                quitar: { type: 'array', items: TXT } }),
            ] },
        },
    },
};

/**
 * De la forma del ESQUEMA a la que valida el navegador
 * (`logic/asistenteEnvolvente.js` → `validarOperaciones`): los «sin cambio»
 * («igual», "", 0) se quitan y `carpinteria`/`medida_hueco` son `cambiar_hueco`.
 */
function limpiarOperaciones(ops) {
    const vale = (x) => x !== undefined && x !== null && x !== '' && x !== 'igual';
    const siNo = (x) => (x === 'si' ? true : x === 'no' ? false : undefined);
    const quita = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
    return (Array.isArray(ops) ? ops : []).slice(0, 20).map((o) => {
        switch (o?.op) {
        case 'mover_hueco': return { op: o.op, hueco: o.hueco, pared: o.pared };
        case 'carpinteria': return quita({ op: 'cambiar_hueco', hueco: o.hueco,
                                           marco: vale(o.marco) ? o.marco : undefined,
                                           vidrio: vale(o.vidrio) ? o.vidrio : undefined,
                                           persiana: siNo(o.persiana) });
        case 'medida_hueco': return quita({ op: 'cambiar_hueco', hueco: o.hueco,
                                            ancho: o.ancho > 0 ? o.ancho : undefined,
                                            alto: o.alto > 0 ? o.alto : undefined });
        case 'anadir_hueco': return quita({ op: o.op, pared: o.pared, tipo: o.tipo,
                                            ancho: o.ancho > 0 ? o.ancho : undefined,
                                            alto: o.alto > 0 ? o.alto : undefined,
                                            marco: vale(o.marco) ? o.marco : undefined });
        case 'quitar_hueco': return { op: o.op, hueco: o.hueco };
        case 'cambiar_pared': return quita({ op: o.op, pared: o.pared,
                                             tipo: vale(o.tipo) ? o.tipo : undefined,
                                             rumbo: vale(o.rumbo) ? o.rumbo : undefined,
                                             apartar: siNo(o.apartar) });
        case 'ajustar_zona': return quita({ op: o.op, zona: o.zona, lado: o.lado,
                                            hasta_borde: o.hasta_borde || undefined,
                                            metros: o.hasta_borde ? undefined : o.metros });
        case 'nueva_zona': return { op: o.op, planta: o.planta, uso: o.uso, lado: o.lado, fondo: o.fondo };
        case 'quitar_zona': return { op: o.op, zona: o.zona };
        case 'medidas': return { op: o.op, fase: o.fase, poner: o.poner || [], quitar: o.quitar || [] };
        default: return null;
        }
    }).filter(Boolean);
}

// ─── Coste y consumo ──────────────────────────────────────────────────────────

function usoDe(r) {
    const u = r?.usage || {};
    return {
        entrada: u.input_tokens || 0,
        salida: u.output_tokens || 0,
        cache_lectura: u.cache_read_input_tokens || 0,
        cache_escritura: u.cache_creation_input_tokens || 0,
    };
}

function costeUsd(modelo, uso) {
    const p = PRECIOS[modelo];
    if (!p) return null;
    const [ent, sal, lec] = p;
    return (uso.entrada * ent + uso.cache_escritura * ent * 1.25 + uso.cache_lectura * lec + uso.salida * sal) / 1e6;
}

function apuntarConsumo(linea) {
    try {
        fs.mkdirSync(DIR_CONSUMO, { recursive: true });
        fs.appendFileSync(path.join(DIR_CONSUMO, 'consumo.jsonl'), `${JSON.stringify(linea)}\n`);
    } catch (e) { console.warn('[asistente-envolvente] no se pudo apuntar el consumo:', e.message); }
}

function mensajeDeError(e) {
    if (e instanceof Anthropic.AuthenticationError) return 'La clave de la API de Anthropic no vale (ANTHROPIC_API_KEY).';
    if (e instanceof Anthropic.PermissionDeniedError) return 'La clave de la API no tiene permiso para este modelo.';
    if (e instanceof Anthropic.RateLimitError) return 'La API de Anthropic va saturada ahora mismo; prueba en un minuto.';
    if (e instanceof Anthropic.APIConnectionError) return 'No hay conexión con la API de Anthropic.';
    if (e instanceof Anthropic.APIError) return `La API de Anthropic ha fallado (${e.status ?? 'sin código'}).`;
    return `Algo ha fallado: ${e.message}`;
}

// ─── La llamada ───────────────────────────────────────────────────────────────

/** Una vuelta con UN modelo. Devuelve { salida|null, uso, modelo, ms, stop }. */
async function preguntar(c, modelo, resumen, texto, nota) {
    const esHaiku = /haiku/.test(modelo);
    const t0 = Date.now();
    const r = await c.messages.create({
        model: modelo,
        max_tokens: MAX_TOKENS_SALIDA,
        // Sin razonamiento: es casar nombres y rellenar campos. En Haiku se
        // apaga con `disabled`; Sonnet 5.5 no lo admite y va `between_tools`
        // (sin herramientas, no piensa).
        thinking: esHaiku ? { type: 'disabled' } : { type: 'between_tools' },
        output_config: { effort: esHaiku ? 'low' : 'medium',
                         format: { type: 'json_schema', schema: ESQUEMA } },
        system: [{ type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } }],
        messages: [{
            role: 'user',
            content: `RESUMEN DEL PLANO\n${resumen}\n\nLO QUE DICE LA PERSONA\n${texto}`
                + (nota ? `\n\nOJO: ${nota}` : ''),
        }],
    });
    const ms = Date.now() - t0;
    const bloque = (r.content || []).find(b => b.type === 'text');
    let salida = null;
    if (r.stop_reason !== 'refusal' && r.stop_reason !== 'max_tokens' && bloque?.text) {
        try { salida = JSON.parse(bloque.text); } catch { salida = null; }
    }
    return { salida, uso: usoDe(r), modelo, ms, stop: r.stop_reason };
}

/**
 * Interpreta lo dicho sobre el plano.
 *
 * `reintento` lo manda el navegador cuando las operaciones del primer intento no
 * casaban con el plano (un nombre que no existe…): se va directo al modelo mayor
 * con el motivo delante.
 *
 * Devuelve { ok, entendido, seguro, pregunta, operaciones, modelo, uso, coste_usd }.
 */
async function interpretar({ texto, resumen, reintento = null, quien = null, obra = null }) {
    const c = anthropic();
    if (!c) return { ok: false, status: 503, error: 'Falta la clave de la API de Anthropic (ANTHROPIC_API_KEY) en el servidor.' };
    const dicho = String(texto || '').trim().slice(0, MAX_CHARS_TEXTO);
    if (!dicho) return { ok: false, status: 400, error: 'No se ha dicho nada.' };
    const res = String(resumen || '').slice(0, MAX_CHARS_RESUMEN);
    if (!res) return { ok: false, status: 400, error: 'Falta el resumen del plano.' };

    const vueltas = [];
    try {
        let v = reintento ? null : await preguntar(c, MODELO_BARATO, res, dicho, null);
        if (v) vueltas.push(v);
        // Al modelo mayor: si el barato no ha dado nada legible, o no está
        // seguro y tampoco pregunta (si pregunta, la pregunta es la respuesta).
        const flojo = !v || !v.salida || (v.salida.seguro === false && !v.salida.pregunta);
        if (flojo) {
            v = await preguntar(c, MODELO_MAYOR, res, dicho,
                                reintento ? `en el intento anterior: ${String(reintento).slice(0, 400)}` : null);
            vueltas.push(v);
        }
        const uso = vueltas.reduce((a, x) => ({
            entrada: a.entrada + x.uso.entrada, salida: a.salida + x.uso.salida,
            cache_lectura: a.cache_lectura + x.uso.cache_lectura,
            cache_escritura: a.cache_escritura + x.uso.cache_escritura,
        }), { entrada: 0, salida: 0, cache_lectura: 0, cache_escritura: 0 });
        const coste = vueltas.reduce((a, x) => a + (costeUsd(x.modelo, x.uso) || 0), 0);
        apuntarConsumo({
            fecha: new Date().toISOString(), obra, quien, texto: dicho.slice(0, 300),
            reintento: !!reintento, chars_resumen: res.length,
            vueltas: vueltas.map(x => ({ modelo: x.modelo, ms: x.ms, stop: x.stop, ...x.uso,
                                         coste_usd: costeUsd(x.modelo, x.uso) })),
            coste_usd: Math.round(coste * 1e6) / 1e6,
            operaciones: v?.salida?.operaciones?.length ?? null,
        });
        if (!v?.salida) {
            return { ok: false, status: 502, error: 'No he entendido la respuesta del modelo. Dilo de otra forma.' };
        }
        return {
            ok: true,
            entendido: String(v.salida.entendido || '').slice(0, 400),
            seguro: v.salida.seguro !== false,
            pregunta: String(v.salida.pregunta || '').trim().slice(0, 600) || null,
            operaciones: limpiarOperaciones(v.salida.operaciones),
            modelo: v.modelo,
            uso, coste_usd: Math.round(coste * 1e6) / 1e6,
        };
    } catch (e) {
        console.error('[asistente-envolvente]', e?.status || '', e?.message || e);
        return { ok: false, status: 502, error: mensajeDeError(e) };
    }
}

module.exports = { interpretar, ESQUEMA, INSTRUCCIONES, _limpiarOperaciones: limpiarOperaciones };
