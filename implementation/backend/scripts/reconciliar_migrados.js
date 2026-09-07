#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RECONCILIACIÓN de los expedientes MIGRADOS: traer su documentación del Drive
 * antiguo a la carpeta de la app, y enlazar los documentos en sus slots.
 *
 * EL PROBLEMA (medido el 2026-09-04 sobre producción): al migrar desde AppSheet
 * se creó la fila en Supabase y una carpeta en el árbol nuevo con el esqueleto de
 * 13 subcarpetas… y NADA dentro. La documentación real (CEE visado, anexos
 * firmados, facturas, RITE, planos) sigue viviendo en la carpeta del árbol viejo
 * — `RES060 › 5. REVISADO LISTOS PARA VERIFICAR`, `RES080 › 01. EN CURSO`, etc.
 * Así, la app dice que al expediente le falta todo y el trabajo se repite o se
 * le pide al cliente algo que ya tenemos.
 *
 * QUÉ HACE, por expediente:
 *   1. Empareja su carpeta ORIGEN en el árbol viejo por NÚMERO DE EXPEDIENTE.
 *   2. FUSIONA origen → destino respetando la estructura 0–12 (no duplica
 *      subcarpetas: las busca por nombre normalizado y las reutiliza).
 *   3. ENLAZA en `documentacion` los documentos que reconoce SIN AMBIGÜEDAD.
 *
 * QUÉ **NO** HACE, a propósito (ver las tres reglas de más abajo):
 *   · No registra filas de FACTURA — eso es dinero, y lo confirma una persona.
 *   · No enlaza el CERTIFICADO RITE — de él depende poder emitir el CIFO.
 *   · No mueve la carpeta vieja a "OLD MIGRADOS" — eso es un paso aparte, cuando
 *     hayas dado el visto bueno a lo copiado.
 *
 * USO:
 *   node scripts/reconciliar_migrados.js                     # dry-run (no toca NADA)
 *   node scripts/reconciliar_migrados.js --execute           # copia y enlaza
 *   node scripts/reconciliar_migrados.js --exp 25RES060_92   # uno solo (repetible)
 *   node scripts/reconciliar_migrados.js --estado "DOC. COMPLETA APPSHEET"
 *   node scripts/reconciliar_migrados.js --anio 25           # solo los de 2025
 *   node scripts/reconciliar_migrados.js --solo-enlaces      # no copia, solo enlaza
 *   node scripts/reconciliar_migrados.js --incluir-plantillas
 *   node scripts/reconciliar_migrados.js --limit 3
 *
 * SALIDA: tres CSV en scripts/ (sufijo `_dryrun` mientras no se pase --execute):
 *   reconciliacion_resumen.csv     una fila por expediente
 *   reconciliacion_ficheros.csv    una fila por fichero (copiado / ya estaba / omitido)
 *   reconciliacion_huerfanas.csv   carpetas viejas que no casan con ningún expediente
 *
 * IDEMPOTENTE: se salta el fichero cuyo nombre ya existe en el destino y solo
 * escribe un enlace si el slot está VACÍO. Volver a lanzarlo debe dar 0 copias.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { google } = require('googleapis');
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

// ─── Árbol ANTIGUO de trabajo. Son las dos carpetas que cuelgan del Drive viejo
// y dentro de las cuales están los subestados ("3. EN CURSO", "5. REVISADO…").
// Se barren TODOS sus subestados salvo los "OLD MIGRADOS", que son el cementerio
// de lo ya traído: buscar ahí devolvería carpetas que ya no son el origen vivo.
const RAICES_ANTIGUAS = [
    { nombre: 'RES060', id: process.env.OLD_TREE_RES060 || '1DzlwVxmHfLsFdUoLdo9d0_PPEv3kFZ20' },
    { nombre: 'RES080', id: process.env.OLD_TREE_RES080 || '1E4p95E4YHvc0Xi1pPNYafhjlnJcfwrub' },
];
const ES_CEMENTERIO = (nombre) => /OLD\s+MIGRADOS/i.test(nombre || '');

const ESTADOS_DIANA = ['PENDIENTE REVISAR EXPTE', 'DOC. COMPLETA APPSHEET'];

// ─── Argumentos ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const EXECUTE = flag('--execute') || flag('--apply');
const SOLO_ENLACES = flag('--solo-enlaces');
const INCLUIR_PLANTILLAS = flag('--incluir-plantillas');
const SOLO_EXP = opt('--exp');
const SOLO_ESTADO = opt('--estado');
const SOLO_ANIO = opt('--anio');
const LIMIT = parseInt(opt('--limit'), 10) || null;
// Solo con --exp: la carpeta origen la das tú (id pelado o enlace pegado del
// navegador). Para los expedientes renumerados, donde el número de la carpeta
// vieja ya no es el del expediente.
const ORIGEN_FORZADO = (() => {
    const v = opt('--origen');
    if (!v) return null;
    const m = String(v).match(/(?:folders\/|[?&]id=)([A-Za-z0-9_-]{20,})/);
    const id = m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(v.trim()) ? v.trim() : null);
    if (!id) { console.error('✗ --origen no parece un id ni un enlace de carpeta de Drive.'); process.exit(1); }
    if (!opt('--exp')) { console.error('✗ --origen solo tiene sentido junto a --exp.'); process.exit(1); }
    return id;
})();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Cliente de Drive propio ─────────────────────────────────────────────────
// driveService.listFiles no pagina (se queda en los 100 primeros) y no trae
// `size` ni `modifiedTime`, que aquí hacen falta para decidir duplicados y para
// desempatar dos versiones del mismo documento. El resto de operaciones
// (copyFile, getOrCreateSubfolderNormalized) sí se reutilizan tal cual.
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function listChildren(folderId) {
    const out = [];
    let pageToken = null;
    do {
        const { data } = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)',
            pageSize: 200,
            pageToken,
        });
        out.push(...(data.files || []));
        pageToken = data.nextPageToken || null;
    } while (pageToken);
    return out;
}
const esCarpeta = (f) => f.mimeType === 'application/vnd.google-apps.folder';

// ─── Número de expediente ────────────────────────────────────────────────────
// Se compara SIN NINGÚN separador, solo letras y dígitos: el mismo número se
// escribe de varias formas ("25RES060_92", "25RES060 92", "25RES060-92") según
// quién bautizara la carpeta. Es el mismo criterio que `normNum` en el OCR de
// lotes, y por el que allí tres de cinco expedientes salían como inexistentes.
const normNum = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Extrae el número canónico del título de una carpeta vieja
// ("25RES060_92 - LUIS MIGUEL (ISM)" → "25RES060_92").
// Devuelve null para las que nunca tuvieron número ("_XX", "_00"): esas no
// pueden emparejarse con nada y van al CSV de huérfanas para que las mires tú.
function numeroDeCarpeta(titulo) {
    const m = String(titulo || '').match(/\b(\d{2})\s*(RES\d{3}|TER\d{3})\s*[_\s-]\s*(\d{1,4}|XX|00)\b/i);
    if (!m) return null;
    const n = m[3].toUpperCase();
    if (n === 'XX' || n === '00') return null;
    if (parseInt(n, 10) === 0) return null;
    return `${m[1]}${m[2].toUpperCase()}_${parseInt(n, 10)}`;
}

// ─── Mapa de subcarpetas: nombre en la carpeta VIEJA → nombre canónico nuevo ──
// La plantilla vieja es casi la misma, pero no del todo: las carpetas más
// antiguas llaman "{nº} - EXPEDIENTE CAE" a lo que hoy es "10. EXPEDIENTE CAE",
// y algunas traen la sección del CEE sin numerar.
const SUBCARPETAS_CANONICAS = [
    '0. PRESUPUESTO', '1. CEE', '2. FOTOS Y VIDEOS', '3. FICHAS TÉCNICAS Y CERTIFICACIONES',
    '4. OTRA DOCUMENTACION', '5. FACTURAS', '6. ANEXOS CAE', '7. LEGALIZACION RITE',
    '8. RESOLUCION', '9. PAGO A CLIENTE', '10. EXPEDIENTE CAE', '11. REQUERIMIENTO',
    '12. DOCUMENTOS PARA CEE',
];
// Los diacríticos se quitan con \p{Diacritic}, no con un rango de caracteres
// literales: escritos a pelo son marcas combinantes que cualquier editor que
// normalice el fichero a NFC se llevaría por delante — y entonces "FICHAS
// TÉCNICAS" dejaría de casar con "FICHAS TECNICAS" sin que nadie lo notara.
const normNombre = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');

function carpetaCanonica(nombreViejo) {
    const n = normNombre(nombreViejo);
    const exacta = SUBCARPETAS_CANONICAS.find(c => normNombre(c) === n);
    if (exacta) return exacta;
    // "24RES060_XX - EXPEDIENTE CAE" y similares
    if (/expedientecae$/.test(n)) return '10. EXPEDIENTE CAE';
    if (/^ceeinicial$|^ceefinal$/.test(n)) return null;   // van dentro de "1. CEE", no en la raíz
    return null;   // subcarpeta desconocida: se recrea con su propio nombre
}

// ─── Ficheros que NO son del expediente ──────────────────────────────────────
// Herramientas y plantillas comerciales que la carpeta vieja arrastra por copia:
// ~7 MB por expediente que no dicen nada del caso y solo llenan la carpeta nueva.
// Se listan en el CSV como "omitido" para que se vea que existen. Con
// --incluir-plantillas se copian igualmente.
const NO_COPIAR = [
    /^CALCULADORA FICHAS CAEs/i,
    /^PLANTILLA RESUMEN AYUDAS BROKERGY/i,
    /^RESUMEN AYUDAS BROKERGY/i,
    /^AYUDA BONO ENERG/i,
    /^test\.txt$/i,
];
const esPrescindible = (nombre) => !INCLUIR_PLANTILLAS && NO_COPIAR.some(re => re.test(nombre));

// ─── Clasificador de documentos → slot de `documentacion` ────────────────────
// REGLA: el nombre del fichero es una PISTA, no una declaración. Solo se enlaza
// cuando hay UN único candidato para el slot; con dos (pasa: 25RES060_92 tiene
// la Cesión como "_fdo_fdo" y como "- FIRMADO") no se enlaza ninguno y se avisa.
// Enlazar el equivocado es peor que no enlazar: el que se manda a firmar y el
// que viaja al verificador salen de aquí.
//
// Los patrones se aplican SIEMPRE sobre el nombre normalizado (minúsculas y sin
// tildes). Escrito contra el nombre crudo, `/cesion/` no casaba con el fichero
// real "Anexo cesión ahorros_fdo_fdo.pdf" de 25RES060_59 — y ese documento se
// habría quedado sin enlazar sin que nadie lo notara.
const sinTildes = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// El separador que sigue al nombre del documento es `_` tan a menudo como un
// espacio ("ANEXO I_fdo.pdf"), y `_` es carácter de palabra: con `\b` no hay
// frontera ahí y el Anexo I firmado de 25RES060_59 no casaba con nada.
//
// "Firmado" se escribió de tres formas a lo largo de estos dos años y las tres
// están vivas en las carpetas: `_fdo`, ` fdo` (24RES060_14 - ANEXO I_v2 fdo.pdf)
// y `_signed` (26RES060_102 - ANEXO I_signed.pdf, 25RES060_85 - CERTIF
// INSTALADOR_rev1_signed.pdf). Reconocer solo la primera colaba el documento
// FIRMADO en el slot del borrador — y el borrador es lo que sirve el enlace de
// firma, así que se le habría vuelto a pedir la firma de algo ya firmado.
const firmado = (n) => /[_\s-](fdo|signed)|firmad/.test(sinTildes(n));
const CLASIFICADORES = [
    { test: (n) => /anexo[\s_-]*i(?![a-z])/.test(n) && !/cesion/.test(n),
      slot: (n) => firmado(n) ? 'anexo_i_signed_link' : 'anexo_i_drive_link' },
    { test: (n) => /cesion/.test(n),
      slot: (n) => firmado(n) ? 'anexo_cesion_signed_link' : 'anexo_cesion_drive_link' },
    { test: (n) => /certif[\s_-]*instalador|certificado[\s_-]*cifo|(^|[^a-z])cifo([^a-z]|$)/.test(n),
      slot: (n) => firmado(n) ? 'cert_cifo_signed_link' : 'cert_cifo_drive_link' },
    { test: (n) => /anexo[\s_-]*fotograf/.test(n),
      slot: (n) => firmado(n) ? 'anexo_fotografico_signed_link' : 'anexo_fotografico_drive_link' },
    { test: (n) => /ficha[\s_-]*res[\s_-]*060/.test(n), slot: () => 'ficha_res060_drive_link' },
    { test: (n) => /ficha[\s_-]*res[\s_-]*093/.test(n), slot: () => 'ficha_res093_drive_link' },
    { test: (n) => /certificado[\s_-]*reforma[\s_-]*res[\s_-]*080|ficha[\s_-]*res[\s_-]*080/.test(n),
      slot: () => 'ficha_res080_drive_link' },
    // El COMBINADO de facturas (un único PDF "{nº} - FACTURAS.pdf"), no las
    // facturas sueltas: aquél es un documento, éstas son importes (ver abajo).
    { test: (n) => /-\s*facturas\.pdf$/.test(n), slot: () => 'facturas_combined_link' },
];

// Solo PDFs. Un Google Doc nativo ("… - CERTIF INSTALADOR", sin extensión) es el
// borrador editable con el que se montó el documento, no el documento que se firma.
function clasificar(nombre, mimeType) {
    if (mimeType !== 'application/pdf') return null;
    const n = sinTildes(nombre);
    for (const c of CLASIFICADORES) if (c.test(n)) return c.slot(n);
    return null;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
const csvCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function escribirCsv(nombre, cabecera, filas) {
    const sufijo = EXECUTE ? '' : '_dryrun';
    const ruta = path.join(__dirname, `${nombre}${sufijo}.csv`);
    const cuerpo = [cabecera, ...filas].map(f => f.map(csvCell).join(';')).join('\n');
    fs.writeFileSync(ruta, '﻿' + cuerpo, 'utf8');   // BOM: para que Excel lea los acentos
    return ruta;
}

// ─── Índice del árbol antiguo ────────────────────────────────────────────────
async function indexarArbolAntiguo() {
    const porNumero = new Map();   // numeroCanonico → [ {id, titulo, estado, raiz} ]
    const huerfanas = [];          // carpetas sin número reconocible

    for (const raiz of RAICES_ANTIGUAS) {
        const subestados = (await listChildren(raiz.id)).filter(esCarpeta);
        for (const est of subestados) {
            if (ES_CEMENTERIO(est.name)) continue;
            const carpetas = (await listChildren(est.id)).filter(esCarpeta);
            for (const c of carpetas) {
                const num = numeroDeCarpeta(c.name);
                const fila = { id: c.id, titulo: c.name, estado: est.name, raiz: raiz.nombre };
                if (!num) { huerfanas.push(fila); continue; }
                const k = normNum(num);
                if (!porNumero.has(k)) porNumero.set(k, []);
                porNumero.get(k).push(fila);
            }
            await sleep(60);
        }
    }
    return { porNumero, huerfanas };
}

// ─── De dónde NO se sacan candidatos a enlazar ───────────────────────────────
// "10. EXPEDIENTE CAE" guarda una COPIA de cada documento validado (es la carpeta
// de auditoría), "11. REQUERIMIENTO" las versiones que viajaron en un
// requerimiento, y las "OLD" las versiones archivadas. Los mismos ficheros salían
// por partida doble y TODOS los slots quedaban como "2 candidatos, enlázalo tú":
// medido en 25RES060_92, ninguno de sus cuatro documentos se enlazaba. Los
// ficheros se copian igual — lo que no hacen es competir por el slot, que apunta
// siempre al de trabajo ("6. ANEXOS CAE", "5. FACTURAS").
const esCopiaDeArchivo = (ruta) => /(^|\/)(10\.\s*EXPEDIENTE CAE|11\.\s*REQUERIMIENTO|OLD)(\/|$)/i.test(ruta);

// ─── Fusión de una carpeta origen en la carpeta destino ──────────────────────
// Recursiva y NO destructiva: nunca borra ni mueve nada del origen. Si el
// destino ya tiene un fichero con ese nombre, se salta (idempotencia).
async function fusionar(origenId, destinoId, ruta, ctx) {
    const hijos = await listChildren(origenId);
    const enDestino = destinoId ? await listChildren(destinoId) : [];
    const nombresDestino = new Map(enDestino.map(f => [normNombre(f.name), f]));

    // Los ficheros SUELTOS en la raíz de la carpeta vieja (planos, capturas, el PDF
    // del catastro, informes de auditoría) no tienen sitio en la raíz de la carpeta
    // nueva, que solo contiene las 13 subcarpetas: dejarlos ahí es justo el desorden
    // que esto viene a arreglar. Van a "4. OTRA DOCUMENTACION".
    let destinoFich = destinoId, nombresFich = nombresDestino, rutaFich = ruta;
    if (ruta === '' && destinoId) {
        const otraId = await driveService.findSubfolderByNameNormalized(destinoId, '4. OTRA DOCUMENTACION');
        if (otraId) {
            destinoFich = otraId;
            rutaFich = '/4. OTRA DOCUMENTACION';
            nombresFich = new Map((await listChildren(otraId)).map(f => [normNombre(f.name), f]));
        }
    }

    for (const h of hijos) {
        if (esCarpeta(h)) {
            const canon = carpetaCanonica(h.name);
            const nombreDestino = canon || h.name;
            let subDestinoId = nombresDestino.get(normNombre(nombreDestino))?.id || null;
            if (!subDestinoId) {
                if (!EXECUTE) {
                    // En dry-run no se crea nada: se recorre el origen para poder
                    // contar y listar lo que se copiaría, con destino "(nueva)".
                    ctx.ficheros.push([ctx.exp, `${ruta}/${nombreDestino}`, '(carpeta)', '', 'se crearía', '']);
                    await fusionar(h.id, null, `${ruta}/${nombreDestino}`, ctx);
                    continue;
                }
                subDestinoId = await driveService.getOrCreateSubfolderNormalized(destinoId, nombreDestino);
            }
            await fusionar(h.id, subDestinoId, `${ruta}/${nombreDestino}`, ctx);
            continue;
        }

        // Fichero
        if (esPrescindible(h.name)) {
            ctx.ficheros.push([ctx.exp, rutaFich, h.name, h.mimeType, 'omitido (plantilla/herramienta)', '']);
            continue;
        }
        const anotarCandidato = (link) => {
            if (esCopiaDeArchivo(rutaFich)) return;
            ctx.candidatos.push({ nombre: h.name, mimeType: h.mimeType, link, ruta: rutaFich, modifiedTime: h.modifiedTime });
        };
        const yaEsta = nombresFich.get(normNombre(h.name));
        if (yaEsta) {
            ctx.ficheros.push([ctx.exp, rutaFich, h.name, h.mimeType, 'ya estaba', yaEsta.webViewLink || '']);
            anotarCandidato(yaEsta.webViewLink);
            continue;
        }
        if (!EXECUTE || !destinoFich) {
            ctx.ficheros.push([ctx.exp, rutaFich, h.name, h.mimeType, 'se copiaría', '']);
            anotarCandidato(null);
            ctx.copiados++;
            continue;
        }
        const copia = await driveService.copyFile(h.id, destinoFich, h.name);
        if (!copia) {
            ctx.ficheros.push([ctx.exp, rutaFich, h.name, h.mimeType, 'ERROR al copiar', '']);
            ctx.errores++;
        } else {
            ctx.ficheros.push([ctx.exp, rutaFich, h.name, h.mimeType, 'copiado', copia.link]);
            anotarCandidato(copia.link);
            ctx.copiados++;
        }
        await sleep(120);   // sin ráfagas contra la API de Drive
    }
}

// ─── Programa ────────────────────────────────────────────────────────────────
(async function main() {
    if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
        console.error('✗ Falta GOOGLE_OAUTH_REFRESH_TOKEN en el .env.');
        process.exit(1);
    }
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se copiarán ficheros en Drive y se escribirán enlaces en Supabase.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando el CSV te convenza.\n');

    // 1) Expedientes diana
    let q = supabase.from('expedientes')
        .select('id, numero_expediente, estado, oportunidad_id, documentacion')
        .order('numero_expediente');
    if (SOLO_EXP) q = q.eq('numero_expediente', SOLO_EXP);
    else q = q.in('estado', SOLO_ESTADO ? [SOLO_ESTADO] : ESTADOS_DIANA);
    const { data: expedientes, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    let lista = expedientes || [];
    if (SOLO_ANIO) lista = lista.filter(e => String(e.numero_expediente).startsWith(SOLO_ANIO));
    if (LIMIT) lista = lista.slice(0, LIMIT);
    console.log(`Expedientes a reconciliar: ${lista.length}\n`);

    // 2) Carpetas de destino (viven en datos_calculo de la oportunidad)
    const opIds = [...new Set(lista.map(e => e.oportunidad_id).filter(Boolean))];
    const { data: ops } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
        .in('id', opIds);
    const destinoDe = new Map((ops || []).map(o => [o.id, o.folder || o.folder_inputs || null]));

    // 3) Índice del árbol antiguo
    console.log('Indexando el Drive antiguo (RES060 + RES080)…');
    const { porNumero, huerfanas } = await indexarArbolAntiguo();
    console.log(`  ${porNumero.size} carpetas con número · ${huerfanas.length} sin número\n`);

    const filasResumen = [];
    const filasFicheros = [];
    const emparejadas = new Set();
    let totalCopiados = 0, totalEnlaces = 0, totalErrores = 0;

    for (const exp of lista) {
        const num = exp.numero_expediente;
        const destinoId = destinoDe.get(exp.oportunidad_id);
        // El origen se puede FORZAR (--exp X --origen <id|enlace>) porque hubo
        // renumeraciones: la carpeta de 26RES060_100 se llama "25RES060_100 …" y la
        // de 25RES080_15, "25RES060_15 …". Ahí el número no empareja y la identidad
        // la pone una persona, no una conjetura por nombre de cliente.
        const origenes = ORIGEN_FORZADO
            ? [{ id: ORIGEN_FORZADO, titulo: '(origen forzado a mano)', estado: '—', raiz: '—' }]
            : (porNumero.get(normNum(num)) || []);

        if (!destinoId) {
            filasResumen.push([num, exp.estado, 'SIN CARPETA DESTINO', origenes.map(o => o.titulo).join(' | '), 0, 0, '', 'El expediente no tiene carpeta en el árbol nuevo: hay que crearla o ADOPTAR la vieja (paso aparte).']);
            console.log(`· ${num.padEnd(14)} SIN CARPETA DESTINO`);
            continue;
        }
        if (origenes.length === 0) {
            filasResumen.push([num, exp.estado, 'SIN ORIGEN', '', 0, 0, '', 'No hay carpeta con ese número en el Drive antiguo (puede estar ya en OLD MIGRADOS, o renumerada).']);
            console.log(`· ${num.padEnd(14)} sin carpeta origen`);
            continue;
        }
        if (origenes.length > 1) {
            filasResumen.push([num, exp.estado, 'ORIGEN AMBIGUO', origenes.map(o => `${o.raiz}/${o.estado}/${o.titulo}`).join(' | '), 0, 0, '', 'Hay VARIAS carpetas viejas con este número: elige tú cuál es antes de copiar.']);
            console.log(`· ${num.padEnd(14)} ⚠ ${origenes.length} carpetas origen — no se toca`);
            continue;
        }

        const origen = origenes[0];
        emparejadas.add(origen.id);
        const ctx = { exp: num, ficheros: [], candidatos: [], copiados: 0, errores: 0 };

        if (!SOLO_ENLACES) {
            await fusionar(origen.id, destinoId, '', ctx);
        } else {
            // Solo enlazar: se leen los ficheros que YA están en el destino. Se
            // aplica el mismo filtro de copias de auditoría que en la fusión.
            const escanear = async (fid, ruta) => {
                for (const f of await listChildren(fid)) {
                    if (esCarpeta(f)) { await escanear(f.id, `${ruta}/${f.name}`); continue; }
                    if (esCopiaDeArchivo(ruta)) continue;
                    ctx.candidatos.push({ nombre: f.name, mimeType: f.mimeType, link: f.webViewLink, ruta, modifiedTime: f.modifiedTime });
                }
            };
            await escanear(destinoId, '');
        }
        filasFicheros.push(...ctx.ficheros);
        totalCopiados += ctx.copiados;
        totalErrores += ctx.errores;

        // ─── Enlazado de slots ───────────────────────────────────────────────
        // Solo huecos, solo sin ambigüedad. `documentacion` se escribe con la RPC
        // set_expediente_doc_field (jsonb_set sobre UNA clave): un update del
        // objeto entero pisaría lo que otro endpoint hubiera escrito entretanto.
        const doc = exp.documentacion || {};
        const porSlot = new Map();
        for (const c of ctx.candidatos) {
            const slot = clasificar(c.nombre, c.mimeType);
            if (!slot) continue;
            if (!porSlot.has(slot)) porSlot.set(slot, []);
            porSlot.get(slot).push(c);
        }

        const enlazados = [];
        const avisos = [];
        for (const [slot, cands] of porSlot) {
            if (doc[slot]) { avisos.push(`${slot}: ya enlazado, no se toca`); continue; }
            if (cands.length > 1) {
                // Con la RUTA delante: el mismo nombre aparece en dos subcarpetas más
                // de una vez, y sin ella no se puede elegir sin abrir Drive.
                const cuales = cands.map(c => `${c.ruta || '/'}/${c.nombre}`).join(' / ');
                avisos.push(`${slot}: ${cands.length} candidatos (${cuales}) — enlázalo tú`);
                continue;
            }
            const link = cands[0].link;
            // En dry-run el fichero aún no existe en el destino, así que no hay
            // enlace que escribir; se cuenta igualmente para que el total del
            // resumen no diga "0 enlaces" mientras las líneas dicen otra cosa.
            if (!link) { enlazados.push(`${slot} (se enlazaría: ${cands[0].nombre})`); totalEnlaces++; continue; }
            if (EXECUTE) {
                const { error: e } = await supabase.rpc('set_expediente_doc_field', {
                    p_oportunidad_id: exp.oportunidad_id, p_field: slot, p_value: link,
                });
                if (e) { avisos.push(`${slot}: ERROR al escribir (${e.message})`); totalErrores++; continue; }
            }
            enlazados.push(`${slot} ← ${cands[0].nombre}`);
            totalEnlaces++;
        }

        // ─── Lo que se copia pero NO se registra, y por qué ──────────────────
        // REGLA — las FACTURAS no se dan de alta aquí. Una fila de factura lleva
        // importe, y de la suma de importes salen la inversión del Anexo y el tope
        // de sobrefinanciación. El fichero queda en "5. FACTURAS"; darlo de alta
        // se hace desde el modal de Facturas, que lo lee con OCR y lo confirma
        // una persona.
        const facturas = ctx.candidatos.filter(c => /5\. FACTURAS/i.test(c.ruta) && c.mimeType === 'application/pdf'
            && !/-\s*facturas\.pdf$/i.test(c.nombre));
        if (facturas.length) avisos.push(`${facturas.length} PDF en 5. FACTURAS copiados SIN registrar (hazlo desde el modal de Facturas)`);

        // REGLA — el CERTIFICADO RITE tampoco se enlaza solo. `cert_rite_drive_link`
        // significa "certificado RITE aportado", y con él la app da vía libre para
        // emitir el CIFO. En las carpetas viejas se llama de cualquier forma
        // ("CERTIFICADO CALEFACCION (3).pdf") y no se distingue del borrador de la
        // Memoria: es exactamente la confusión que hubo que deshacer en 13
        // expedientes. Se copia y se avisa; lo enlaza una persona, o el OCR de RITE.
        const rite = ctx.candidatos.filter(c => /7\. LEGALIZACION RITE/i.test(c.ruta) && c.mimeType === 'application/pdf');
        if (rite.length && !doc.cert_rite_drive_link) {
            avisos.push(`RITE: ${rite.length} PDF en 7. LEGALIZACION RITE sin enlazar (${rite.map(r => r.nombre).join(' / ')})`);
        }

        filasResumen.push([
            num, exp.estado, EXECUTE ? 'OK' : 'SIMULADO',
            `${origen.raiz}/${origen.estado}/${origen.titulo}`,
            ctx.copiados, enlazados.length,
            enlazados.join(' | '), avisos.join(' | '),
        ]);
        console.log(`· ${num.padEnd(14)} ${String(ctx.copiados).padStart(3)} fich · ${enlazados.length} enlaces${avisos.length ? '  ⚠ ' + avisos.length : ''}`);
    }

    // 4) Carpetas viejas que nadie reclama
    const filasHuerfanas = [
        ...huerfanas.map(h => [h.raiz, h.estado, h.titulo, 'SIN NÚMERO', `https://drive.google.com/drive/folders/${h.id}`]),
        ...[...porNumero.entries()].flatMap(([, arr]) => arr
            .filter(c => !emparejadas.has(c.id))
            .map(c => [c.raiz, c.estado, c.titulo, 'con número, sin expediente reconciliado', `https://drive.google.com/drive/folders/${c.id}`])),
    ];

    const r1 = escribirCsv('reconciliacion_resumen',
        ['expediente', 'estado', 'resultado', 'carpeta_origen', 'ficheros', 'enlaces', 'enlazado', 'avisos'], filasResumen);
    const r2 = escribirCsv('reconciliacion_ficheros',
        ['expediente', 'ruta_destino', 'fichero', 'mime', 'accion', 'enlace'], filasFicheros);
    const r3 = escribirCsv('reconciliacion_huerfanas',
        ['arbol', 'subestado', 'carpeta', 'motivo', 'enlace'], filasHuerfanas);

    console.log(`\n─────────────────────────────────────────────`);
    console.log(`${EXECUTE ? 'Copiados' : 'Se copiarían'}: ${totalCopiados} ficheros`);
    console.log(`${EXECUTE ? 'Enlazados' : 'Se enlazarían'}: ${totalEnlaces} slots`);
    if (totalErrores) console.log(`Errores: ${totalErrores}`);
    console.log(`Carpetas viejas sin reconciliar: ${filasHuerfanas.length}`);
    console.log(`\nCSV:\n  ${r1}\n  ${r2}\n  ${r3}`);
    if (!EXECUTE) console.log('\nRevisa el resumen y, si te convence, repite con --execute.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
