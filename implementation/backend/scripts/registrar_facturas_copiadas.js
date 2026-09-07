#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGISTRAR las facturas que la reconciliación dejó en "5. FACTURAS" sin dar de
 * alta, y LEERLAS con el mismo OCR que usa la app.
 *
 * `reconciliar_migrados.js` copia los PDF de facturas pero NO crea la fila a
 * propósito: una fila de factura lleva importe, y de la suma de importes salen la
 * inversión del Anexo y el tope de sobrefinanciación. Resultado medido el
 * 2026-09-07: 18 de los 24 expedientes en "DOC. COMPLETA APPSHEET" tenían los PDF
 * en Drive y CERO facturas registradas, así que la app decía que no había ninguna.
 *
 * Esto NO se salta ese cuidado: hace exactamente lo que hace la app cuando la
 * factura entra por el enlace público del cliente —
 *   `append_expediente_factura` (fila en blanco, idempotente por drive_id)
 *   + `facturaAutoOcr.leerYCompletar` (rellena Nº, fecha, base imponible y
 *     partidas, y deja la fila marcada `ocr_pendiente_revision`)
 * — reutilizando esas dos funciones, no una copia de ellas. La cifra queda
 * PROPUESTA y con su aviso en el modal de Facturas hasta que una persona la mire.
 *
 * NO levanta incidencias: eso sigue siendo del modal del admin (regla del
 * facturaAutoOcr).
 *
 * QUÉ SE EXCLUYE, y por qué importa:
 *   · el PDF COMBINADO ("{nº} - FACTURAS.pdf"): se construye A PARTIR de las
 *     facturas registradas. Darlo de alta como una más duplicaría la inversión
 *     entera del expediente, que es justo el fallo que ya nos costó un disgusto.
 *   · la subcarpeta OLD: son las versiones archivadas al reemplazar una factura.
 *
 * COSTE: ~0,002 € y ~11 s por factura (Gemini 2.5 Flash, nivel de pago).
 *
 * USO:
 *   node scripts/registrar_facturas_copiadas.js                 # dry-run: solo lista
 *   node scripts/registrar_facturas_copiadas.js --execute
 *   node scripts/registrar_facturas_copiadas.js --exp 25RES060_82
 *   node scripts/registrar_facturas_copiadas.js --sin-ocr       # da de alta sin leer
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const facturaAutoOcr = require('../services/facturaAutoOcr');
const { google } = require('googleapis');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const EXECUTE = flag('--execute') || flag('--apply');
const SIN_OCR = flag('--sin-ocr');
// Lee cada candidata SIN escribir nada, para decidir con el CONTENIDO y no con el
// nombre del fichero. Hace falta porque en "5. FACTURAS" no hay solo facturas:
// medido el 2026-09-07 sobre 41 PDF, había justificantes de transferencia, el
// mismo documento duplicado ("Copy of…", "_unlocked", "_scanned") y hasta la
// factura del CERTIFICADOR a Brokergy. Darlas de alta a bulto inflaría la
// inversión del Anexo, que es la cifra que viaja al verificador.
const CLASIFICAR = flag('--clasificar');
// Registra SOLO los drive_id que liste ese CSV (el de --clasificar, ya depurado).
// Es el modo bueno: sin él, --execute da de alta todo lo que haya en la carpeta,
// y en la carpeta hay duplicados, la misma factura leída con IVA y facturas que
// no son de la obra.
const DESDE = opt('--desde');
const SOLO_EXP = opt('--exp');
const ESTADO = opt('--estado') || 'DOC. COMPLETA APPSHEET';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** drive_id permitidos, leídos de la última columna del CSV de --desde. */
const PERMITIDOS = (() => {
    if (!DESDE) return null;
    const texto = fs.readFileSync(DESDE, 'utf8').replace(/^﻿/, '');
    const ids = new Set();
    for (const l of texto.split(/\r?\n/)) {
        const c = l.trim().split(';');
        const id = (c[c.length - 1] || '').trim();
        if (/^[A-Za-z0-9_-]{20,}$/.test(id)) ids.add(id);
    }
    if (!ids.size) { console.error(`✗ ${DESDE} no trae ningún drive_id en la última columna.`); process.exit(1); }
    return ids;
})();

/** El combinado NO es una factura: se genera a partir de las registradas. */
const esCombinado = (nombre) => /(^|[-\s])FACTURAS(\s*COMBINADAS)?\.pdf$/i.test(String(nombre || '').trim());

async function pdfsDeFacturas(raizId) {
    const { data: subs } = await drive.files.list({
        q: `'${raizId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name)', pageSize: 100,
    });
    const carpeta = (subs.files || []).find(f => /5\.\s*FACTURA/i.test(f.name));
    if (!carpeta) return { carpeta: null, ficheros: [] };

    const { data } = await drive.files.list({
        q: `'${carpeta.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size)', pageSize: 200,
    });
    // Solo el primer nivel: lo que cuelga de OLD son versiones sustituidas.
    const ficheros = (data.files || []).filter(f => f.mimeType === 'application/pdf');
    return { carpeta: carpeta.name, ficheros };
}

/** Lee un PDF con el MISMO OCR del admin, sin escribir nada. */
async function leerSinEscribir(fileId, nombre) {
    const ceeOcrService = require('../services/ceeOcrService');
    const facturaOcrService = require('../services/facturaOcrService');
    const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const { pdf } = await ceeOcrService.normalizeToPdf([
        { buffer: Buffer.from(r.data), originalname: nombre, mimetype: 'application/pdf' },
    ]);
    return facturaOcrService.extractFacturaFromPdf(pdf);
}

/**
 * NIF de los certificadores. En "5. FACTURAS" aparece su factura A BROKERGY
 * (numeración AP…, 60 € de honorario + tasas): no es de la obra y sumarla
 * ensucia la inversión del Anexo. Mismo criterio que `verificarEmisor` en la
 * conciliación del certificador: se busca por NIF y solo entre CERTIFICADOR,
 * porque el NIF de Brokergy también sale en esa factura (es quien la recibe).
 */
let NIFS_CERTIFICADOR = new Set();
async function cargarCertificadores() {
    const { data } = await supabase.from('prescriptores')
        .select('razon_social, cif').eq('tipo_empresa', 'CERTIFICADOR');
    NIFS_CERTIFICADOR = new Set((data || []).map(p => String(p.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean));
    return (data || []).map(p => p.razon_social);
}

/**
 * Qué es este documento, a la vista de lo leído. NO decide nada por su cuenta:
 * marca, y la última palabra es de una persona.
 */
function dictaminar(ocr, vistas) {
    const num = String(ocr?.numero_factura || '').trim();
    // El prompt deja `base_imponible` a null cuando la factura solo imprime un
    // total sin desglose (y hace bien: no se calcula la base a ojo). Para decidir
    // si esto es una factura vale cualquiera de los dos.
    const base = ocr?.totales?.base_imponible;
    const importe = Number.isFinite(base) ? base : ocr?.totales?.total;
    const emisor = String(ocr?.emisor?.nombre || '').trim();
    const nif = String(ocr?.emisor?.nif || '').trim().toUpperCase();
    const partidas = [...new Set((ocr?.lineas || []).map(l => String(l?.partida || '').toUpperCase()).filter(Boolean))];

    const r = (veredicto, motivo) => ({ veredicto, motivo, num, base: importe, emisor, nif, partidas });
    const nifPlano = nif.replace(/[^A-Z0-9]/g, '');

    if (!num && !(Number.isFinite(importe) && importe > 0)) return r('NO ES FACTURA', 'sin nº y sin importe (¿justificante de pago?)');
    if (/brokergy/i.test(emisor)) return r('NO ES DE LA OBRA', `la emite ${emisor}`);
    if (nifPlano && NIFS_CERTIFICADOR.has(nifPlano)) return r('NO ES DE LA OBRA', `la emite el CERTIFICADOR (${emisor}) a Brokergy`);

    // (a) el mismo documento, dos veces: mismo nº y mismo importe.
    const clave = `${num}|${Number(importe || 0).toFixed(2)}`;
    if (num && vistas.has(clave)) return r('DUPLICADA', `mismo nº e importe que "${vistas.get(clave)}"`);

    // (b) el mismo documento leído DOS VECES, una por la base y otra por el total
    // CON IVA. Es el caso que ningún nombre de fichero delata: llegan como
    // "Pago factura…" o "justificanteTransferencia.pdf" y parecen otra cosa.
    // Medido el 2026-09-07: cinco casos, y en los cinco el cociente da 1,21 al
    // céntimo. Sin esta comprobación se duplicaba la inversión del expediente.
    if (Number.isFinite(importe) && importe > 0) {
        for (const [k, fichero] of vistas) {
            const otro = Number(k.split('|')[1]);
            if (!otro) continue;
            const ratio = Math.max(importe, otro) / Math.min(importe, otro);
            if (Math.abs(ratio - 1.21) < 0.005) {
                return r('DUPLICADA', `es "${fichero}" leída ${importe > otro ? 'con' : 'sin'} IVA (${otro} ↔ ${importe})`);
            }
        }
    }
    if (num) vistas.set(clave, ocr.__fichero);

    // Placas solares: la ficha cubre sustituir el generador de combustión por una
    // bomba de calor, no una instalación fotovoltaica. Fuera de la inversión del
    // Anexo — ver la memoria `project_solar_fuera_inversion_cae`.
    if (partidas.length && partidas.every(p => p === 'FOTOVOLTAICA')) return r('FUERA DE ALCANCE', 'fotovoltaica / autoconsumo: no es la actuación de la ficha');
    if (partidas.includes('FOTOVOLTAICA')) return r('REVISAR', 'mezcla fotovoltaica con la actuación: incidencia de ALCANCE');
    return r('FACTURA', '');
}

(async function main() {
    if (CLASIFICAR) return clasificar();
    console.log(EXECUTE
        ? `⚠️  MODO EJECUCIÓN: se darán de alta facturas${SIN_OCR ? '' : ' y se leerán con OCR (~0,002 €/factura)'}.\n`
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la lista te convenza.\n');

    let q = supabase.from('expedientes')
        .select('numero_expediente, oportunidad_id, facturas:documentacion->facturas')
        .order('numero_expediente');
    q = SOLO_EXP ? q.eq('numero_expediente', SOLO_EXP) : q.eq('estado', ESTADO);
    const { data: filas, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    const csv = [['expediente', 'fichero', 'accion', 'numero', 'fecha', 'base_imponible'].join(';')];
    let altas = 0, leidas = 0, saltadas = 0;

    for (const f of filas) {
        const num = f.numero_expediente;
        const { data: op } = await supabase.from('oportunidades')
            .select('folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
            .eq('id', f.oportunidad_id).maybeSingle();
        const raiz = op?.folder || op?.folder_inputs;
        if (!raiz) { console.log(`· ${num.padEnd(14)} ✗ sin carpeta de Drive`); continue; }

        const { ficheros } = await pdfsDeFacturas(raiz);
        const yaRegistradas = new Set((f.facturas || []).map(x => x?.drive_id).filter(Boolean));
        let candidatas = ficheros.filter(x => !esCombinado(x.name) && !yaRegistradas.has(x.id));
        if (PERMITIDOS) candidatas = candidatas.filter(x => PERMITIDOS.has(x.id));
        const combinados = ficheros.filter(x => esCombinado(x.name)).length;

        if (!ficheros.length) { console.log(`· ${num.padEnd(14)} —  sin PDF en "5. FACTURAS"`); continue; }
        console.log(`· ${num.padEnd(14)} ${candidatas.length} por registrar   (${ficheros.length} PDF · ${yaRegistradas.size} ya registradas · ${combinados} combinado)`);

        for (const fich of candidatas) {
            if (!EXECUTE) {
                console.log(`    + ${fich.name}`);
                csv.push([num, fich.name, 'SIMULADO', '', '', ''].join(';'));
                altas++; continue;
            }

            const link = await driveService.getWebViewLink(fich.id);
            const { error: eAlta } = await supabase.rpc('append_expediente_factura', {
                p_oportunidad_id: f.oportunidad_id,
                p_factura: { numero_factura: '', fecha_factura: null, importe_sin_iva: 0, drive_link: link, drive_id: fich.id, origen: 'popup' },
            });
            if (eAlta) { console.log(`    ✗ ${fich.name} — alta: ${eAlta.message}`); saltadas++; continue; }
            altas++;

            if (SIN_OCR) { console.log(`    + ${fich.name}   (sin leer)`); csv.push([num, fich.name, 'ALTA', '', '', ''].join(';')); continue; }

            // Mismo camino que la subida del cliente: leer y completar la fila.
            const r = await drive.files.get({ fileId: fich.id, alt: 'media' }, { responseType: 'arraybuffer' });
            await facturaAutoOcr.leerYCompletar({
                oportunidadId: f.oportunidad_id,
                driveId: fich.id,
                buffer: Buffer.from(r.data),
                originalname: fich.name,
                mimetype: 'application/pdf',
            });

            // Releer la fila para dejar en el CSV lo que de verdad quedó escrito.
            const { data: tras } = await supabase.from('expedientes')
                .select('facturas:documentacion->facturas').eq('oportunidad_id', f.oportunidad_id).maybeSingle();
            const fila = (tras?.facturas || []).find(x => x?.drive_id === fich.id) || {};
            const leida = fila.numero_factura || fila.importe_sin_iva;
            if (leida) leidas++;
            console.log(`    + ${fich.name}\n        ${fila.numero_factura || '(sin nº)'} · ${fila.fecha_factura || '(sin fecha)'} · ${fila.importe_sin_iva ?? '—'} € (base)`);
            csv.push([num, fich.name, 'ALTA+OCR', fila.numero_factura || '', fila.fecha_factura || '', fila.importe_sin_iva ?? ''].join(';'));

            await sleep(1200); // no encadenar peticiones a Gemini sin respirar
        }
    }

    const salida = path.join(__dirname, EXECUTE ? 'facturas_registradas.csv' : 'facturas_registradas_dryrun.csv');
    fs.writeFileSync(salida, '﻿' + csv.join('\n'), 'utf8');

    console.log('\n─────────────────────────────────────────────');
    console.log(`${EXECUTE ? 'Dadas de alta' : 'Se darían de alta'}: ${altas}${EXECUTE && !SIN_OCR ? `   ·   leídas por OCR: ${leidas}` : ''}   ·   fallidas: ${saltadas}`);
    console.log(`CSV: ${salida}`);
    if (EXECUTE) console.log('\n⚠️  Las cifras quedan PROPUESTAS (ocr_pendiente_revision): revísalas en el modal de Facturas.');
    else console.log('\nRevisa la lista y, si te convence, repite con --execute.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });

/** Pasada de SOLO LECTURA: dice qué es cada PDF y no escribe nada en ningún sitio. */
async function clasificar() {
    console.log('🔎 CLASIFICAR: se leen los PDF con OCR y NO se escribe nada.\n');
    const certs = await cargarCertificadores();
    console.log(`Certificadores conocidos (sus facturas NO son de la obra): ${certs.join(', ') || '-'}`+'\n');

    let q = supabase.from('expedientes')
        .select('numero_expediente, oportunidad_id, facturas:documentacion->facturas')
        .order('numero_expediente');
    q = SOLO_EXP ? q.eq('numero_expediente', SOLO_EXP) : q.eq('estado', ESTADO);
    const { data: filas, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    const csv = [['expediente', 'fichero', 'veredicto', 'motivo', 'numero', 'fecha', 'base_imponible', 'emisor', 'nif', 'partidas', 'drive_id'].join(';')];
    const cuenta = {};
    // El OCR devuelve razones sociales con SALTO DE LINEA dentro. Escritas tal
    // cual parten la fila en dos y el CSV deja de poder leerse, que es justo el
    // fichero con el que se decide que se registra. Se sanean salto y separador.
    const limpio = (v) => String(v == null ? '' : v).replace(/[\r\n;]+/g, ' ').trim();

    for (const f of filas) {
        const num = f.numero_expediente;
        const { data: op } = await supabase.from('oportunidades')
            .select('folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
            .eq('id', f.oportunidad_id).maybeSingle();
        const raiz = op?.folder || op?.folder_inputs;
        if (!raiz) continue;

        const { ficheros } = await pdfsDeFacturas(raiz);
        const yaRegistradas = new Set((f.facturas || []).map(x => x?.drive_id).filter(Boolean));
        const candidatas = ficheros.filter(x => !esCombinado(x.name) && !yaRegistradas.has(x.id));
        if (!candidatas.length) continue;

        console.log(`· ${num}`);
        const vistas = new Map();
        for (const fich of candidatas) {
            let d;
            try {
                const ocr = await leerSinEscribir(fich.id, fich.name);
                ocr.__fichero = fich.name;
                d = dictaminar(ocr, vistas);
                d.fecha = ocr?.fecha_factura || '';
            } catch (e) {
                d = { veredicto: 'ERROR', motivo: String(e.message).slice(0, 90), num: '', base: '', emisor: '', nif: '', partidas: [], fecha: '' };
            }
            cuenta[d.veredicto] = (cuenta[d.veredicto] || 0) + 1;
            const marca = { 'FACTURA': '✓', 'DUPLICADA': '≡', 'NO ES FACTURA': '✗', 'NO ES DE LA OBRA': '✗', 'FUERA DE ALCANCE': '✗', 'REVISAR': '?', 'ERROR': '!' }[d.veredicto] || ' ';
            console.log(`    ${marca} ${d.veredicto.padEnd(16)} ${fich.name}`);
            console.log(`        ${d.num || '(sin nº)'} · ${d.fecha || '(sin fecha)'} · ${d.base ?? '—'} € · ${d.emisor || '(sin emisor)'}${d.partidas.length ? ` · ${d.partidas.join(',')}` : ''}${d.motivo ? `\n        → ${d.motivo}` : ''}`);
            csv.push([num, fich.name, d.veredicto, d.motivo, d.num, d.fecha, d.base ?? '', d.emisor, d.nif, d.partidas.join(' '), fich.id].map(limpio).join(';'));
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    const salida = path.join(__dirname, 'facturas_clasificadas.csv');
    fs.writeFileSync(salida, '﻿' + csv.join('\n'), 'utf8');
    console.log('\n─────────────────────────────────────────────');
    for (const [k, v] of Object.entries(cuenta).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
    console.log(`\nCSV: ${salida}`);
    console.log('Borra del CSV lo que no deba registrarse y pásalo con --pares (o dime y lo hago yo).');
}
