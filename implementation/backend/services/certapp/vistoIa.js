// ─── certapp/vistoIa.js — «Lo que ha visto la IA» (fase 5 de la ficha) ──────
//
// Fran (25/10/2026, «MEJORAS APP CEE»): muchas preguntas se resuelven con el
// Catastro y con la propia IA; antes de gastar el crédito, la IA mira y el
// certificador CONFIRMA. Esto es la parte que mira: las fotos de la obra (y
// Street View si no hay fachadas) con Gemini, y devuelve lo que VE con su
// origen. Lo del Catastro y la época lo deduce la pantalla (deduccionesCatastro,
// puro); aquí solo lo que hace falta ver.
//
// REGLA — no escribe en la obra: PROPONE. La pantalla lo mete en el formulario
// (aplicarDeducciones, que nunca pisa lo que contestó el certificador) y se
// guarda con el autoguardado. Así el servidor no compite con lo que se teclea.
// REGLA — gratis para el certificador pero con tope: CERTAPP_VISTO_IA_MAX_DIA
// por cuenta y día (15) y CERTAPP_VISTO_IA_MAX_OBRA por obra (6), contados en
// `certapp_eventos` (tipo VISTO_IA), más una reserva en memoria para que dos
// clics a la vez no pasen los dos. Sin nada que mirar, ni cuenta ni llama.
// Apagado con CERTAPP_VISTO_IA_ENABLED=false (503 amable).
//
// Contrato: docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const { llamarGemini, GEMINI_MODEL } = require('../placaOcrService');
const { cuestionario: logica } = require('./logica');
const { fallo, errorBd, numEnv, inicioDiaMadrid, evento } = require('./comun');

const SV_API = 'https://maps.googleapis.com/maps/api/streetview';
const MAX_FOTOS = 14;
const MAX_BYTES = 15 * 1024 * 1024;   // todo en línea en UNA petición a Gemini
// Cuántas fotos de cada apartado, en este orden (lo que más dice, primero).
const POR_SLOT = [
    ['FOTO_FACHADA_PRINCIPAL', 3], ['FOTO_FACHADAS', 3], ['FOTO_VENTANAS', 2], ['FOTO_CUBIERTA', 1],
    ['FOTO_PATIOS_INTERIORES', 1], ['FOTO_PLACA_CALDERA', 2], ['FOTO_CALDERA', 1],
    ['FOTO_PLACA_AEROTERMIA', 1], ['FOTO_AEROTERMIA', 1], ['FOTO_PLACA_TERMO', 1], ['FOTO_TERMO', 1],
    ['FOTO_AIRE_EXTERIOR', 1], ['FOTO_PLACAS_SOLARES', 1],
];
// Lo que se le pide que mire. Lo que no se ve en una foto (lo que linda, el
// sótano, el suelo) no: sale del Catastro o se pregunta.
const VISIBLES = [
    'tipo_edificio', 'plantas', 'cubierta', 'fachada', 'aislamiento_fachada', 'marco', 'vidrio', 'persianas',
    'calefaccion', 'tipo_caldera', 'emisor', 'marca_modelo_calefaccion', 'potencia_kw', 'anio_calefaccion',
    'acs', 'litros_termo', 'aire_acondicionado', 'num_aires', 'placas_fv',
];
const NUMEROS = new Set(['plantas', 'potencia_kw', 'anio_calefaccion', 'litros_termo', 'num_aires']);

const enVuelo = new Set();   // obras que se están mirando ahora mismo

const apagado = () => String(process.env.CERTAPP_VISTO_IA_ENABLED || '').trim().toLowerCase() === 'false';
const esImagen = (e) => /^image\//.test(e?.mime || e?.mimeType || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(e?.nombre || e?.name || '');
const mimeDe = (e) => (/^image\//.test(e?.mime || e?.mimeType || '') ? (e.mime || e.mimeType) : 'image/jpeg');

/** Cuántas veces ha mirado hoy esta cuenta, y cuántas esta obra. */
async function usos(cuentaId, obraId) {
    const [hoy, obra] = await Promise.all([
        supabase.from('certapp_eventos').select('id', { count: 'exact', head: true })
            .eq('cuenta_id', cuentaId).eq('tipo', 'VISTO_IA').gte('created_at', inicioDiaMadrid()),
        supabase.from('certapp_eventos').select('id', { count: 'exact', head: true })
            .eq('obra_id', obraId).eq('tipo', 'VISTO_IA'),
    ]);
    if (hoy.error) throw errorBd(hoy.error, 'usos de lo que ha visto la IA (día)');
    if (obra.error) throw errorBd(obra.error, 'usos de lo que ha visto la IA (obra)');
    return { hoy: hoy.count || 0, obra: obra.count || 0 };
}

/** Las fotos que se miran, por apartado y con tope. */
function elegirFotos(obra, SLOTS) {
    const uploads = obra.documentacion?.reforma_uploads || {};
    const out = [];
    for (const [id, n] of POR_SLOT) {
        const slot = SLOTS.find(s => s.id === id);
        for (const e of (Array.isArray(uploads[id]) ? uploads[id] : []).filter(x => x?.driveId && esImagen(x)).slice(0, n)) {
            if (out.length >= MAX_FOTOS) break;
            out.push({ driveId: e.driveId, mime: mimeDe(e), slot: id, label: slot?.label || id, placa: !!slot?.placa });
        }
    }
    return out;
}

/** Una foto de Street View mirando a la casa desde el panorama más cercano (o null). */
async function streetView(lat, lng) {
    const key = process.env.GOOGLE_MAPS_KEY;
    if (!key || !(Number(lat) && Number(lng))) return null;
    const meta = await (await fetch(`${SV_API}/metadata?location=${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}&radius=60&source=outdoor&key=${key}`,
        { signal: AbortSignal.timeout(15_000) })).json().catch(() => null);
    if (meta?.status !== 'OK' || !meta.location) return null;
    // Rumbo del panorama a la casa (aproximación plana: decenas de metros).
    const dy = Number(lat) - meta.location.lat;
    const dx = (Number(lng) - meta.location.lng) * Math.cos((Number(lat) * Math.PI) / 180);
    const heading = Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
    const r = await fetch(`${SV_API}?size=640x480&pano=${meta.pano_id}&heading=${heading}&fov=90&pitch=8&source=outdoor&return_error_code=true&key=${key}`,
        { signal: AbortSignal.timeout(20_000) });
    if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) return null;
    return { buffer: Buffer.from(await r.arrayBuffer()), mime: 'image/jpeg', fecha: meta.date || null };
}

/** Lo que se le cuenta a Gemini de la casa (sin datos personales). */
function contexto(obra, L) {
    const cat = obra.catastro || {};
    const c = { ...L.CUESTIONARIO_VACIO, ...(obra.cuestionario || {}) };
    const lineas = [];
    if (obra.anio_construccion) lineas.push(`Año de construcción: ${obra.anio_construccion}.`);
    if (obra.superficie_catastro) lineas.push(`Superficie: ${obra.superficie_catastro} m².`);
    if (cat.tipo) lineas.push(`Catastro: ${cat.tipo}${cat.plantas ? `, ${cat.plantas} planta(s)` : ''}.`);
    const cons = (cat.construcciones || []).map(x => `${String(x.tipo || '').toLowerCase()} ${x.superficie || ''} m² (planta ${x.planta})`);
    if (cons.length) lineas.push(`En la parcela: ${cons.join(', ')}.`);
    if (obra.zona_climatica) lineas.push(`Zona climática: ${obra.zona_climatica}.`);
    // Lo que contestó el certificador manda: no se le pide, solo se le cuenta.
    const suyas = L.DEDUCIBLES.filter(k => !c.origen?.[k] && !(c[k] == null || c[k] === '' || (Array.isArray(c[k]) && !c[k].length)));
    const resumen = L.resumenCuestionario({ ...obra, cuestionario: { ...c, origen: {} } })
        .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    return { texto: lineas.join('\n'), suyas, resumen };
}

function valoresPermitidos(L) {
    const lista = (l) => l.map(o => `${o.value} (${o.label})`).join(' | ');
    return [
        `tipo_edificio: ${lista(L.TIPOS_EDIFICIO)}`,
        `plantas: número de plantas sobre rasante de la vivienda`,
        `cubierta: ${lista(L.CUBIERTA)}`,
        `fachada: ${lista(L.FACHADA)}`,
        `aislamiento_fachada: SI solo si se ve aislada por fuera (SATE) | NO`,
        `marco: ${lista(L.MARCO)}`,
        `vidrio: ${lista(L.VIDRIO)} (el bajo emisivo casi nunca se ve: no lo digas sin una pegatina)`,
        `persianas: true | false`,
        `calefaccion: ${lista(L.CALEFACCION.filter(o => o.value !== 'no_tiene'))}`,
        `tipo_caldera: ${lista(L.TIPO_CALDERA.filter(o => o.value !== 'NO_SE'))} (de la placa o del modelo)`,
        `emisor: ${lista(L.EMISOR)} (si se ven radiadores en las fotos de dentro)`,
        `marca_modelo_calefaccion: «MARCA MODELO» tal como pone la placa`,
        `potencia_kw: potencia útil de calefacción en kW, de la placa`,
        `anio_calefaccion: año de fabricación, de la placa`,
        `acs: ${lista(L.ACS.filter(o => o.value !== 'no_tiene'))}`,
        `litros_termo: litros del termo, de su placa`,
        `aire_acondicionado: true si se ven unidades exteriores de aire | false`,
        `num_aires: cuántas unidades exteriores de aire se ven`,
        `placas_fv: ${lista(L.PLACAS_FV)} (fotovoltaicas en la cubierta)`,
    ].join('\n');
}

const PROMPT = (ctx, permitidos, etiquetas) => `Eres un técnico certificador energético en España. Miras las fotos de UNA vivienda para preparar su certificado de eficiencia energética con CE3X.

Di SOLO lo que se VE en las fotos o lo que pone una placa. Lo que no se vea, NO lo digas: no adivines por la época ni por lo habitual (eso ya lo pone otro).

La vivienda:
${ctx.texto || '(sin datos del Catastro)'}
${ctx.resumen.length ? `\nLo que ya ha contestado el certificador (no lo repitas; si una foto lo contradice claramente, ponlo en «dudas»):\n${ctx.resumen.join('\n')}` : ''}

Las imágenes van rotuladas: ${etiquetas.join(' · ')}. Una de «STREET VIEW» es desde la calle y puede enseñar también la casa de al lado: con ella, confianza «media» como mucho.

Devuelve en «datos» cada cosa que veas: «clave», «valor» (EXACTAMENTE uno de los permitidos; true/false; o el número), «confianza» (alta = se ve claro; media = casi seguro; baja = no estás seguro), «foto» (la etiqueta, p. ej. «FOTO 3») y «por_que» (12 palabras como mucho, en castellano llano: «se ven radiadores bajo la ventana»).

Que algo NO se vea no quiere decir que no esté: no digas que no hay aire acondicionado o placas solares solo porque no aparecen (pueden estar detrás o en otra cara del tejado). Dilo solo si se ve ENTERA la parte donde estarían.

Si en una foto SE VE algo pero dudas entre dos opciones que cambian el certificado (casa pareada o adosada, azotea o tejado, doble o simple vidrio…), en lugar de un dato pon una «duda»: una pregunta corta para el certificador, 2 o 3 «opciones» (cada una con su «label» y su «valor» permitido), la «foto» donde se ve y el «por_que». Lo que no sale en ninguna foto NO es una duda: no lo pongas.

Claves y valores permitidos:
${permitidos}`;

const SCHEMA = (claves) => ({
    type: 'OBJECT',
    properties: {
        datos: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    clave: { type: 'STRING', enum: claves },
                    valor: { type: 'STRING' },
                    confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
                    foto: { type: 'STRING', nullable: true },
                    por_que: { type: 'STRING', nullable: true },
                },
                required: ['clave', 'valor', 'confianza'],
            },
        },
        dudas: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    clave: { type: 'STRING', enum: claves },
                    pregunta: { type: 'STRING' },
                    opciones: {
                        type: 'ARRAY',
                        items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, valor: { type: 'STRING' } }, required: ['label', 'valor'] },
                    },
                    foto: { type: 'STRING', nullable: true },
                    por_que: { type: 'STRING', nullable: true },
                },
                required: ['clave', 'pregunta', 'opciones'],
            },
        },
    },
    required: ['datos', 'dudas'],
});

/** El texto de Gemini → el valor que admite la clave (o undefined). */
function convertir(k, bruto, L) {
    const s = String(bruto ?? '').trim();
    if (!s) return undefined;
    if (['persianas', 'aire_acondicionado'].includes(k)) {
        if (/^(true|s[ií]|yes)$/i.test(s)) return true;
        if (/^(false|no)$/i.test(s)) return false;
        return undefined;
    }
    if (k === 'aislamiento_fachada') return /^s[ií]$/i.test(s) ? 'SI' : /^no$/i.test(s) ? 'NO' : (L.valorValido(k, s.toUpperCase()) ? s.toUpperCase() : undefined);
    if (NUMEROS.has(k)) {
        const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
        if (!(n > 0)) return undefined;
        if (k === 'anio_calefaccion' && (n < 1950 || n > new Date().getFullYear())) return undefined;
        return String(Math.round(n * 10) / 10).replace('.', ',');
    }
    if (k === 'marca_modelo_calefaccion') return s.toUpperCase().slice(0, 120);
    // De una lista: el valor exacto, o el que case sin mayúsculas.
    for (const cand of [s, s.toUpperCase(), s.toLowerCase()]) if (L.valorValido(k, cand)) return cand;
    return undefined;
}

/**
 * Mira la obra. `dry`: no apunta el evento (los scripts de prueba).
 * @returns {{ at, propuesta: { valores, origen, notas, fotos }, dudas, fuentes, uso }}
 */
async function mirar(obra, cuenta, { dry = false } = {}) {
    if (apagado()) throw fallo(503, 'La IA no está disponible ahora mismo.', 'VISTO_IA_APAGADO');
    if (!process.env.GEMINI_API_KEY) throw fallo(503, 'La IA no está disponible ahora mismo.', 'VISTO_IA_SIN_CLAVE');
    const L = await logica();
    const at = new Date().toISOString();
    const vacio = { at, propuesta: { valores: {}, origen: {}, notas: {}, fotos: {} }, dudas: [], fuentes: { fotos: 0, streetview: false, placa: false } };

    const fotos = elegirFotos(obra, L.SLOTS);
    const fachadas = fotos.filter(f => f.slot === 'FOTO_FACHADA_PRINCIPAL' || f.slot === 'FOTO_FACHADAS').length;
    const conSV = !fachadas && !!process.env.GOOGLE_MAPS_KEY && Number(obra.lat) && Number(obra.lng);
    if (!fotos.length && !conSV) return vacio;   // nada que mirar: ni cuenta ni llama

    const maxDia = numEnv('CERTAPP_VISTO_IA_MAX_DIA', 15);
    const maxObra = numEnv('CERTAPP_VISTO_IA_MAX_OBRA', 6);
    if (enVuelo.has(obra.id)) throw fallo(409, 'Ya lo está mirando: espera unos segundos.', 'VISTO_IA_EN_CURSO');
    const u = await usos(cuenta.id, obra.id);
    if (u.hoy >= maxDia) throw fallo(429, `Hoy ya se ha mirado ${maxDia} veces en tu cuenta. Mañana vuelve a estar disponible; mientras, revisa los datos a mano.`, 'VISTO_IA_TOPE');
    if (u.obra >= maxObra) throw fallo(429, `Esta obra ya se ha mirado ${maxObra} veces. Revisa los datos a mano.`, 'VISTO_IA_TOPE_OBRA');

    enVuelo.add(obra.id);
    try {
        // Las imágenes, rotuladas («FOTO n · apartado»), con tope de bytes.
        const partes = [];
        const porEtiqueta = {};
        let bytes = 0;
        for (const f of fotos) {
            // eslint-disable-next-line no-await-in-loop
            const buffer = await driveService.getFileContent(f.driveId).catch(() => null);
            if (!buffer?.length || bytes + buffer.length > MAX_BYTES) continue;
            bytes += buffer.length;
            const etiqueta = `FOTO ${Object.keys(porEtiqueta).length + 1}`;
            porEtiqueta[etiqueta] = f;
            partes.push({ texto: `${etiqueta} · ${f.label}` }, { buffer, mimeType: f.mime });
        }
        let sv = null;
        if (conSV) {
            sv = await streetView(obra.lat, obra.lng).catch(() => null);
            if (sv) {
                porEtiqueta['STREET VIEW'] = { sv: true, label: 'Street View' };
                partes.push({ texto: `STREET VIEW · desde la calle${sv.fecha ? ` (${sv.fecha})` : ''}` }, { buffer: sv.buffer, mimeType: sv.mime });
            }
        }
        if (!partes.length) return vacio;

        const ctx = contexto(obra, L);
        const claves = VISIBLES.filter(k => !ctx.suyas.includes(k));
        if (!claves.length) return { ...vacio, fuentes: { fotos: Object.keys(porEtiqueta).filter(e => e !== 'STREET VIEW').length, streetview: !!sv, placa: fotos.some(f => f.placa) } };
        let gasto = null;
        const r = await llamarGemini(partes, {
            prompt: PROMPT(ctx, valoresPermitidos(L), Object.keys(porEtiqueta)),
            schema: SCHEMA(claves),
            etiqueta: 'certappVistoIa',
            deadline: 120_000,
            pensar: 2048,          // razonar, con tope (ver el aviso de llamarGemini)
            maxTokens: 6000,
            onUso: (x) => { gasto = x; },
        });

        const propuesta = { valores: {}, origen: {}, notas: {}, fotos: {} };
        const origenDe = (etq) => {
            const f = porEtiqueta[String(etq || '').trim().toUpperCase()];
            if (!f) return { origen: sv && !fotos.length ? 'STREETVIEW' : 'FOTO', driveId: null, sinFoto: true };
            if (f.sv) return { origen: 'STREETVIEW', driveId: null };
            return { origen: f.placa ? 'PLACA' : 'FOTO', driveId: f.driveId };
        };
        // Lo que «no se ve desde la calle» no es que no esté (detrás, la otra cara del tejado).
        const NO_POR_AUSENCIA = { aire_acondicionado: false, placas_fv: 'NO' };
        for (const d of Array.isArray(r?.datos) ? r.datos : []) {
            if (!claves.includes(d?.clave) || d.confianza === 'baja' || d.clave in propuesta.valores) continue;
            const v = convertir(d.clave, d.valor, L);
            if (v === undefined || !L.valorValido(d.clave, v)) continue;
            const o = origenDe(d.foto);
            if (o.origen === 'STREETVIEW' && NO_POR_AUSENCIA[d.clave] === v) continue;
            propuesta.valores[d.clave] = v;
            propuesta.origen[d.clave] = o.origen;
            if (d.por_que) propuesta.notas[d.clave] = String(d.por_que).slice(0, 200);
            if (o.driveId) propuesta.fotos[d.clave] = o.driveId;
        }
        const dudas = [];
        for (const d of Array.isArray(r?.dudas) ? r.dudas : []) {
            if (!claves.includes(d?.clave) || dudas.some(x => x.k === d.clave) || d.clave in propuesta.valores || dudas.length >= 6) continue;
            // Una duda es sobre algo que SE VE: sin su foto, es un «no lo veo» y sobra.
            if (origenDe(d.foto).sinFoto) continue;
            const opciones = (d.opciones || []).map(op => {
                const v = convertir(d.clave, op?.valor, L);
                return v === undefined ? null : { label: String(op.label || '').slice(0, 80), valores: { [d.clave]: v } };
            }).filter(op => op && op.label).slice(0, 4);
            if (opciones.length < 2) continue;
            dudas.push({
                id: `ia_${d.clave}`, k: d.clave, pregunta: String(d.pregunta || '').slice(0, 200),
                por_que: d.por_que ? String(d.por_que).slice(0, 300) : '', foto: origenDe(d.foto).driveId, opciones,
            });
        }
        const fuentes = { fotos: Object.keys(porEtiqueta).filter(e => e !== 'STREET VIEW').length, streetview: !!sv, placa: fotos.some(f => f.placa && Object.values(porEtiqueta).includes(f)) };
        if (!dry) {
            await evento(obra.id, cuenta.id, 'VISTO_IA',
                `La IA ha mirado ${[fuentes.fotos ? `${fuentes.fotos} foto(s)` : null, sv ? 'Street View' : null].filter(Boolean).join(' y ')}`,
                'IA', { fotos: fuentes.fotos, streetview: !!sv, datos: Object.keys(propuesta.valores).length, dudas: dudas.length, modelo: gasto?.modelo || GEMINI_MODEL, tokens: gasto });
        }
        return { at, propuesta, dudas, fuentes, uso: { hoy: u.hoy + 1, max_dia: maxDia } };
    } finally {
        enVuelo.delete(obra.id);
    }
}

module.exports = { mirar, convertir, elegirFotos, VISIBLES };
