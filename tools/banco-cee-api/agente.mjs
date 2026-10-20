// ============================================================================
// agente.mjs — la skill `generar-cee-inicial` como agente propio sobre la API.
//
// Bucle de herramientas a mano (Messages API, beta por la limpieza de contexto
// y el respaldo ante rechazos), con:
//  · la skill ENTERA en el `system`, fija y en caché (se comparte entre pasadas
//    del mismo modelo si van seguidas);
//  · caché del historial con el punto de corte en el último mensaje;
//  · historial SOLO AÑADIDO (preserved thinking: no se reescribe nada);
//  · opcional: limpieza de resultados viejos en el servidor (`--recortar`);
//  · el coste se cuenta en cada vuelta con el `usage` y hay TOPE por pasada.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { DEFINICIONES, ejecutar, validar, SKILLS } from './herramientas.mjs';

//: $ por millón de tokens (API de Anthropic, 2026-10): entrada, escribir caché
//: (5 min = 1,25×), leer caché, salida. Lo que no esté aquí se cobra como Opus 4.8.
export const PRECIOS = {
    'claude-opus-5-5': { in: 4, cw: 5, cr: 0.2, out: 20 },
    'claude-sonnet-5-5': { in: 2, cw: 2.5, cr: 0.2, out: 10 },
    'claude-haiku-5-5': { in: 0.1, cw: 0.125, cr: 0.01, out: 0.5 },
    'claude-opus-4-8': { in: 5, cw: 6.25, cr: 0.5, out: 25 },
};
export const MODELOS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' };

export function coste(u, modelo) {
    const p = PRECIOS[modelo] || PRECIOS['claude-opus-4-8'];
    return ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.cw
        + (u.cache_read_input_tokens || 0) * p.cr + (u.output_tokens || 0) * p.out) / 1e6;
}

// ─── El prompt ───────────────────────────────────────────────────────────────

const MARCO = `# Banco de pruebas EN SECO

Haces lo que hace la skill \`generar-cee-inicial\` (va íntegra debajo), pero en un banco de pruebas, por la API y sin
persona delante. Lo que cambia respecto a la skill:

- No hay shell. Las órdenes de \`cee_inicial.js\` se lanzan con la herramienta \`cee_inicial\` (la clave del expediente la
  pone el arnés). Lo que en la skill es «ábrelo con Read» es \`ver_imagen\`, \`ver_pdf\`, \`leer_texto\` o
  \`hoja_contactos\`. El plan se escribe con \`escribir_fichero\` y se pasa como \`--plan plan.json\`.
- TODO va en seco: el arnés quita \`--escribir\` y \`--enviar\` y corta cualquier escritura en la BD y en Drive. No lo
  intentes. El último paso es \`aplicar\` con \`--plan plan.json --calificar\`, en seco.
- Sáltate el paso 0 (\`agente_ia.js empezar\`, título de la sesión, WhatsApp, \`documentar\`, \`renombrar\`): no hay nada
  que marcar ni a quién mandar. \`pedir-fotos\` solo en seco, y solo si de verdad faltan fotos de alguna pared.
- Si en «1. CEE / CEE INICIAL» ya hay un \`.cex\`, IGNÓRALO: haces el tuyo desde cero, como si el expediente acabara de
  llegar. No hay trabajo guardado.
- No hay a quién preguntar. Donde la skill dice PREGUNTAR, elige la opción que propondrías, sigue y apúntalo en
  \`preguntas\` de \`terminar\` (qué habrías preguntado y qué has supuesto).
- Si algo te impide seguir (sin carpeta de Drive, el motor o CE3X caídos), \`terminar\` con estado «parcial» y el porqué.
- El PRESUPUESTO («0. PRESUPUESTO» y \`DOC_PRESUPUESTO\` de «12.») y los demás PDF de la obra (el CEE anterior del
  cliente, planos) se ven con \`documentos_obra\` (listar → bajar) y se leen con \`ver_pdf\` como «texto». Míralo
  SIEMPRE antes del plan: de ahí sale la aerotermia de la medida (punto 1 y 18 de «Lo que hay que poner SIEMPRE»).
  La máquina que nombre se busca en el catálogo con \`catalogo_aerotermia\` (marca y potencia) y va al plan como
  \`aerotermia_id\`.
- Cada imagen cuesta: usa la hoja de contactos para decidir qué foto es de qué pared, abre en grande solo la que
  tengas que medir y recorta las placas.
- Termina SIEMPRE con \`terminar\` y el informe final de la skill («Lo que el informe final dice SIEMPRE»), con la ruta
  de la copia local del \`.cex\` en vez de enlaces de Drive.
- Las referencias de la skill que no van aquí se leen con \`leer_texto\`: skills/generar-cee-inicial/referencia/video.md
  y skills/generar-cee-inicial/referencia/alta-aerotermia.md.
`;

//: PRODUCCIÓN: lo mismo que la skill, por la API, escribiendo de verdad. Las
//: herramientas son las del banco; cambia que hay UN `aplicar --escribir` al final.
const MARCO_REAL = `# Producción: el CEE inicial por la API, DE VERDAD

Haces lo que hace la skill \`generar-cee-inicial\` (va íntegra debajo), por la API y sin persona delante. Esta vez
ESCRIBE: lo que dejes en Drive y en la app es lo que Fran va a revisar y firmar. Lo que cambia respecto a la skill:

- No hay shell. Las órdenes de \`cee_inicial.js\` se lanzan con la herramienta \`cee_inicial\` (la clave la pone el
  arnés). Lo que en la skill es «ábrelo con Read» es \`ver_imagen\`, \`ver_pdf\`, \`leer_texto\` o \`hoja_contactos\`.
  El plan se escribe con \`escribir_fichero\` y se pasa como \`--plan plan.json\`.
- El paso 0 (\`agente_ia.js empezar\`) ya lo ha hecho el arnés: el AGENTE IA está en la barra y la fase «en trabajo».
  No hay título de sesión, ni WhatsApp, ni \`documentar\`/\`renombrar\`.
- Orden de trabajo: TODO en seco hasta tener el plan bueno; \`aplicar --plan plan.json --calificar\` en seco y revisa la
  ficha, los avisos, la calificación y que NO salga «certificado incompleto». Corrige y repite en seco si hace falta.
  Solo entonces, UNA vez, \`aplicar --plan plan.json --escribir\`: sube el .cex, su XML y su PDF, el croquis y los
  documentos del Catastro, deja la fase «pendiente de revisión» y avisa al equipo. Si después tuvieras que relanzarlo
  para corregir algo menor, con \`--sin-aviso\`.
- \`--escribir\` SOLO vale en \`aplicar\`: el arnés lo quita de cualquier otra orden. \`--enviar\` no existe: \`pedir-fotos\`
  va en seco y su borrador, al informe. Si la aerotermia no está en el catálogo, no la des de alta: dilo en \`preguntas\`.
- Si en «1. CEE / CEE INICIAL» hay ya un \`.cex\` SIN \`_REVISAR\` (el de un técnico), PARA: \`terminar\` «parcial» y dilo.
  Un trabajo de envolvente ya guardado se respeta (lo dibujado a mano manda: ver «Rehacer el CEE tras una corrección»).
- No hay a quién preguntar. Donde la skill dice PREGUNTAR, elige la opción que propondrías, sigue y apúntalo en
  \`preguntas\` de \`terminar\`: le llega a Fran con el informe.
- El PRESUPUESTO («0. PRESUPUESTO» y \`DOC_PRESUPUESTO\` de «12.») y los demás PDF de la obra se ven con
  \`documentos_obra\` y se leen con \`ver_pdf\` («texto» primero). La máquina que nombre se busca con
  \`catalogo_aerotermia\` y va al plan como \`aerotermia_id\`.
- Cada imagen cuesta: hoja de contactos para elegir, en grande solo lo que haya que medir.
- Termina SIEMPRE con \`terminar\` y el informe final de la skill («Lo que el informe final dice SIEMPRE»), con los
  enlaces de Drive que imprime \`aplicar --escribir\`.
- Las referencias que no van aquí se leen con \`leer_texto\`: skills/generar-cee-inicial/referencia/video.md y
  skills/generar-cee-inicial/referencia/alta-aerotermia.md.
`;

const LECCIONES = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), 'lecciones.md');

export function sistema({ real = false } = {}) {
    const leer = f => fs.readFileSync(path.join(SKILLS, f), 'utf8');
    const lecciones = fs.existsSync(LECCIONES) ? `\n${fs.readFileSync(LECCIONES, 'utf8')}\n` : '';
    return [
        real ? MARCO_REAL : MARCO, lecciones,
        '\n\n---\n\n# La skill: skills/generar-cee-inicial/SKILL.md\n\n', leer('generar-cee-inicial/SKILL.md'),
        '\n\n---\n\n# skills/generar-cee-inicial/referencia/plan.md\n\n', leer('generar-cee-inicial/referencia/plan.md'),
        '\n\n---\n\n# skills/_comun/cee-incompleto.md\n\n', leer('_comun/cee-incompleto.md'),
    ].join('');
}

export function primerMensaje({ clave, dir, hoy }) {
    return `Genera el CEE inicial de ${clave}, con la aerotermia como medida de mejora, listo para una revisión breve `
        + `en la ventana de la envolvente y firmar. Hoy es ${hoy}. Carpeta de trabajo: ${dir}`;
}

// ─── El bucle ────────────────────────────────────────────────────────────────

const sinImagenes = (contenido) => JSON.parse(JSON.stringify(contenido, (k, v) =>
    (k === 'data' && typeof v === 'string' && v.length > 200 ? `<${v.length} b64>` : v)));

/**
 * Corre UNA pasada. Devuelve { estado, informe, preguntas, usage, coste, vueltas, ms, parada }.
 * `ctx`: { clave, dir, tmp, registro(o) }.
 */
export async function correrAgente({ modelo, ctx, esfuerzo = 'medium', topeUsd = 8, maxVueltas = 150,
    recortar = false, hoy, alGastar = () => {}, debeParar = null }) {
    const client = new Anthropic({ maxRetries: 4, timeout: 15 * 60_000 });
    const transcript = path.join(ctx.dir, 'transcript.jsonl');
    const apunta = o => fs.appendFileSync(transcript, JSON.stringify(o) + '\n');

    const system = [{ type: 'text', text: sistema({ real: !!ctx.real }), cache_control: { type: 'ephemeral' } }];
    const messages = [{ role: 'user', content: [{ type: 'text', text: primerMensaje({ clave: ctx.clave, dir: ctx.dir, hoy }) }] }];
    const total = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
    let gastado = 0, vueltas = 0, final = null, avisosSinHerramienta = 0;
    const t0 = Date.now();

    // El corte de caché va en el ÚLTIMO bloque del último mensaje; mover o quitar
    // marcas de caché no cuenta como editar el historial.
    const marcaCache = () => {
        for (const m of messages) for (const b of (Array.isArray(m.content) ? m.content : [])) delete b.cache_control;
        const ult = messages[messages.length - 1].content;
        ult[ult.length - 1].cache_control = { type: 'ephemeral' };
    };

    while (vueltas < maxVueltas) {
        // Una persona lo ha retirado desde la app (cola del PC): se para ANTES de
        // la siguiente llamada, que es la que cuesta.
        if (debeParar && await debeParar().catch(() => false)) {
            final = { estado: 'cancelado', informe: 'Parado a petición desde la app.' };
            break;
        }
        vueltas++;
        marcaCache();
        const betas = ['server-side-fallback-2026-07-01'];
        const params = {
            model: modelo, max_tokens: 32_000, system, tools: DEFINICIONES, messages,
            thinking: { type: 'adaptive', display: 'summarized' },
            output_config: { effort: esfuerzo },
            fallbacks: 'default',
        };
        if (recortar) {
            betas.push('context-management-2025-06-27');
            params.context_management = { edits: [{
                type: 'clear_tool_uses_20250919',
                trigger: { type: 'input_tokens', value: 110_000 },
                keep: { type: 'tool_uses', value: 6 },
                clear_at_least: { type: 'input_tokens', value: 40_000 },
                exclude_tools: ['escribir_fichero', 'terminar'],
            }] };
        }
        let resp;
        try {
            resp = await client.beta.messages.stream({ ...params, betas }).finalMessage();
        } catch (e) {
            apunta({ vuelta: vueltas, error: e.message, status: e.status });
            final = { estado: 'error', informe: `La API ha fallado: ${e.status || ''} ${e.message}` };
            break;
        }
        const u = resp.usage || {};
        for (const k of Object.keys(total)) total[k] += u[k] || 0;
        const c = coste(u, resp.model || modelo);
        gastado += c;
        alGastar(c, gastado);
        apunta({ vuelta: vueltas, modelo: resp.model, stop: resp.stop_reason, usage: u, coste: c,
            context_management: resp.context_management || null, content: sinImagenes(resp.content) });

        messages.push({ role: 'assistant', content: resp.content });

        if (resp.stop_reason === 'refusal') {
            final = { estado: 'error', informe: `Rechazo del modelo: ${JSON.stringify(resp.stop_details || {})}` };
            break;
        }
        if (gastado >= topeUsd) {
            final = { estado: 'tope', informe: `Parado por el TOPE de ${topeUsd} $ (gastado ${gastado.toFixed(2)} $).` };
            break;
        }
        if (resp.stop_reason === 'pause_turn') continue;

        const usos = resp.content.filter(b => b.type === 'tool_use');
        if (!usos.length) {
            if (++avisosSinHerramienta > 2) { final = { estado: 'parcial', informe: 'El agente ha dejado de usar herramientas sin llamar a terminar.' }; break; }
            messages.push({ role: 'user', content: [{ type: 'text', text: 'Sigue con la skill, o llama a `terminar` con el informe final.' }] });
            continue;
        }
        if (resp.stop_reason === 'max_tokens') {
            // La última llamada puede venir cortada: no se ejecuta nada de esta vuelta.
            messages.push({ role: 'user', content: usos.map(t => ({ type: 'tool_result', tool_use_id: t.id, is_error: true,
                content: 'Respuesta cortada por max_tokens: repite la llamada, más corta (el plan, por partes si hace falta).' })) });
            continue;
        }

        const resultados = [];
        for (const t of usos) {
            if (t.name === 'terminar') {
                final = { estado: t.input?.estado || 'hecho', informe: t.input?.informe || '', preguntas: t.input?.preguntas || [] };
                resultados.push({ type: 'tool_result', tool_use_id: t.id, content: 'Recibido.' });
                continue;
            }
            const malo = validar(t.name, t.input);
            if (malo) { resultados.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: malo }); continue; }
            try {
                const r = await ejecutar(ctx, t.name, t.input);
                resultados.push({ type: 'tool_result', tool_use_id: t.id, content: r });
            } catch (e) {
                resultados.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: String(e.message || e) });
            }
        }
        messages.push({ role: 'user', content: resultados });
        apunta({ vuelta: vueltas, resultados: sinImagenes(resultados) });
        if (final) break;
    }
    if (!final) final = { estado: 'tope', informe: `Parado a las ${maxVueltas} vueltas.` };
    return { ...final, modelo, usage: total, coste: gastado, vueltas, ms: Date.now() - t0 };
}
