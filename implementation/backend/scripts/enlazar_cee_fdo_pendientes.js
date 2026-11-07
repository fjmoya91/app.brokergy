// ─── enlazar_cee_fdo_pendientes.js ───────────────────────────────────────────
// Expedientes CAE con el CEE FIRMADO (`…_fdo.pdf`) en su carpeta de Drive y SIN
// enlazar en su hueco (`cee.cee_files[fase].pdf`), o enlazado a OTRO fichero (el
// PDF sin firmar, o una versión que ya está en OLD).
//
// Por qué: hasta el 07/11/2026 `ceeFirmaService.guardarCertificado` (firmar_cee.js y
// la página pública de firma) subía el `_fdo.pdf` sin enlazarlo, y `validar-cee`
// copia a «10. EXPEDIENTE CAE» lo ENLAZADO: el lote salía sin el firmado
// (26RES060_126 y _228, auditoría del 06/11/2026).
//
// Se separan en dos grupos, porque no se arreglan igual:
//   A · FIRMADO POR LA APP — el expediente tiene el sello `cee.firma_cee_{fase}`
//       (solo lo escribe `guardarCertificado`) y el `_fdo` lleva el nombre canónico
//       `{nº} – CEE {FASE}_fdo.pdf`. Es el fallo: se enlaza tal cual.
//   B · HEREDADOS — sin sello o con otro nombre (migraciones, AppSheet, subidas a
//       mano a Drive: `CEE INICIAL_fdo.pdf`, `…_SIM_fdo.pdf`, el de otro nº…). No
//       los dejó así este fallo y hay que mirar cuál es el bueno: solo se listan.
//
//   node scripts/enlazar_cee_fdo_pendientes.js                    # en seco: solo lista
//   node scripts/enlazar_cee_fdo_pendientes.js --expediente 26RES060_228
//   node scripts/enlazar_cee_fdo_pendientes.js --escribir         # enlaza SOLO el grupo A (PRODUCCIÓN)
//   node scripts/enlazar_cee_fdo_pendientes.js --escribir --expediente <nº> --forzar   # uno del B, revisado a mano
//
// Con --escribir enlaza por `ceeFirmaService.enlazarPdfEnSuHueco` (RPC de clave; si
// el hueco estaba validado vuelve a ámbar). NO valida ni copia a «10. EXPEDIENTE
// CAE»: eso se hace después validando el hueco en la app.
//
// ⚠️ `driveService.listFiles` devuelve [] si Drive falla: un expediente que no sale
// puede ser un fallo de lectura. Los que no tienen carpeta se cuentan aparte.

require('dotenv').config();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const ESCRIBIR = flag('escribir');
const SOLO = valor('expediente');
const FORZAR = flag('forzar') && !!SOLO;   // el grupo B solo de uno en uno y con nombre

const FASES = [['inicial', 'CEE INICIAL'], ['final', 'CEE FINAL']];
const idDe = (link) => {
    const m = String(link || '').match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(link || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
};

async function expedientes() {
    const out = [];
    for (let desde = 0; ; desde += 500) {
        let q = supabase.from('expedientes')
            .select('id, numero_expediente, oportunidad_id, estado, ficheros:cee->cee_files, validados:cee->docs_validados, '
                + 'sello_inicial:cee->firma_cee_inicial->>at, sello_final:cee->firma_cee_final->>at')
            .order('numero_expediente').range(desde, desde + 499);
        if (SOLO) q = q.eq('numero_expediente', SOLO);
        const { data, error } = await q;
        if (error) throw new Error(`Supabase: ${error.message}`);
        out.push(...data);
        if (data.length < 500) break;
    }
    return out;
}

// La carpeta, por el MISMO criterio que `ceeUploadService.resolveDriveFolderId`,
// pero proyectando solo las claves (nunca `datos_calculo` entero, regla 22).
async function carpetas(exps) {
    const ids = [...new Set(exps.map(e => e.oportunidad_id).filter(Boolean))];
    const porOp = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('oportunidades')
            .select('id, a:datos_calculo->>drive_folder_id, b:datos_calculo->inputs->>drive_folder_id, c:datos_calculo->>drive_folder_link')
            .in('id', ids.slice(i, i + 100));
        if (error) throw new Error(`Supabase: ${error.message}`);
        for (const o of data) {
            const m = String(o.c || '').match(/folders\/([A-Za-z0-9_-]+)/);
            porOp.set(o.id, { a: o.a, b: o.b, c: m ? m[1] : null });
        }
    }
    return (e) => { const o = porOp.get(e.oportunidad_id) || {}; return o.a || o.b || o.c || null; };
}

const linea = (h) => `${h.numero.padEnd(14)} ${h.fase.padEnd(7)} ${h.hueco.padEnd(44).slice(0, 44)} `
    + `${h.validado ? 'VALIDADO (el otro)' : 'sin validar'.padEnd(18)} · ${h.fdo} (${h.fdoFecha}) · ${h.estado || ''}`;

(async () => {
    const exps = await expedientes();
    const carpetaDe = await carpetas(exps);
    console.log(`${exps.length} expedientes · ${ESCRIBIR ? 'ESCRIBIENDO (producción)' : 'EN SECO'}\n`);

    const hallados = [];
    let sinCarpeta = 0, sinCee = 0;
    for (const e of exps) {
        const raiz = carpetaDe(e);
        if (!raiz) { sinCarpeta++; continue; }
        const cee = await driveService.findSubfolderByName(raiz, '1. CEE');
        if (!cee) { sinCee++; continue; }
        for (const [fase, rotulo] of FASES) {
            const sub = await driveService.findSubfolderByName(cee, rotulo);
            if (!sub) continue;
            const files = (await driveService.listFiles(sub))
                .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
            const canonico = `${e.numero_expediente} – ${rotulo}_fdo.pdf`;
            const fdo = files.find(f => f.name === canonico) || files.find(f => /_fdo\.pdf$/i.test(f.name));
            if (!fdo) continue;
            const enlace = e.ficheros?.[fase]?.pdf || null;
            const enlazadoId = idDe(enlace);
            if (enlazadoId === fdo.id) continue;
            let aQue = null;
            if (enlace) {
                aQue = files.find(f => f.id === enlazadoId)?.name || null;
                if (!aQue && enlazadoId) {
                    try { aQue = (await driveService.getFileMetadata(enlazadoId))?.name || '?'; } catch { aQue = '?'; }
                }
            }
            const sello = e[`sello_${fase}`] || null;
            hallados.push({
                id: e.id, numero: e.numero_expediente, estado: e.estado, fase,
                fdo: fdo.name, fdoFecha: (fdo.modifiedTime || '').slice(0, 10), link: fdo.webViewLink,
                hueco: enlace ? `OTRO: ${aQue || enlace}` : 'VACÍO',
                validado: !!e.validados?.[`${fase}_pdf`],
                sello: sello ? sello.slice(0, 10) : null,
                grupo: sello && fdo.name === canonico ? 'A' : 'B',
            });
        }
    }

    const A = hallados.filter(h => h.grupo === 'A');
    const B = hallados.filter(h => h.grupo === 'B');
    console.log(`A · FIRMADOS POR LA APP sin enlazar (el fallo; se enlazan con --escribir): ${A.length}`);
    for (const h of A) console.log('  ' + linea(h) + ` · firmado en la app el ${h.sello}`);
    console.log(`\nB · HEREDADOS (sin sello de la app o con otro nombre; solo se listan): ${B.length}`);
    for (const h of B) console.log('  ' + linea(h));

    if (ESCRIBIR) {
        const { enlazarPdfEnSuHueco } = require('../services/ceeFirmaService');
        const aEnlazar = FORZAR ? hallados : A;
        console.log(`\nEnlazando ${aEnlazar.length}…`);
        for (const h of aEnlazar) {
            const r = await enlazarPdfEnSuHueco(h.id, h.fase, h.link);
            console.log(`  ${h.numero} ${h.fase} → ${r.ok ? 'ENLAZADO (falta VALIDARLO en la app)' : `FALLO: ${r.error}`}`);
        }
    }

    console.log(`\nTotal: ${hallados.length} huecos (A ${A.length} · B ${B.length}). Sin carpeta de Drive: ${sinCarpeta} · sin «1. CEE»: ${sinCee}.`);
    if (!ESCRIBIR && hallados.length) console.log('EN SECO: nada escrito.');
    if (flag('json')) console.log(JSON.stringify(hallados.map(({ id, link, ...h }) => h), null, 2));
    process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
