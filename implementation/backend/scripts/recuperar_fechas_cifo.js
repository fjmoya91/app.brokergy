#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RECUPERAR las fechas de la actuación LEYÉNDOLAS del CIFO ya firmado.
 *
 * EL PROBLEMA (medido el 2026-09-07): 15 de los 24 expedientes en
 * "DOC. COMPLETA APPSHEET" tienen el CIFO firmado y, sin embargo,
 * `documentacion.fecha_inicio_cifo` / `fecha_fin_cifo` vacías. No es que el dato
 * no exista: está IMPRESO en el propio certificado, bajo "HITOS DE LA ACTUACIÓN".
 * Sin él no hay año de actuación, y el año de actuación es el criterio con el que
 * se agrupan los lotes — así que esos expedientes no se pueden empaquetar aunque
 * su documentación esté completa.
 *
 * NO ES OCR y no cuesta nada: estos CIFO llevan capa de texto (se generaron, no
 * se escanearon), así que la lectura es DETERMINISTA con PyMuPDF y se puede
 * reproducir. Si algún PDF no la tuviera, no se adivina: se dice y se salta.
 *
 * REGLA — solo se rellenan HUECOS. Una fecha ya escrita no se pisa nunca: de
 * ella cuelgan el inicio y el fin de actuación del CIFO y del Anexo, y puede
 * haberla puesto una persona a la vista del certificado.
 *
 * USO:
 *   node scripts/recuperar_fechas_cifo.js                          # dry-run
 *   node scripts/recuperar_fechas_cifo.js --execute
 *   node scripts/recuperar_fechas_cifo.js --estado "PENDIENTE REVISAR EXPTE"
 *   node scripts/recuperar_fechas_cifo.js --exp 25RES060_74
 *
 * SALIDA: scripts/fechas_cifo[_dryrun].csv — una fila por expediente, con las
 * dos fechas leídas y de qué fichero salieron.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const { google } = require('googleapis');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const EXECUTE = flag('--execute') || flag('--apply');
const SOLO_EXP = opt('--exp');
const ESTADO = opt('--estado') || 'DOC. COMPLETA APPSHEET';
const PY = process.env.PYTHON_BIN || 'python';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

const idDeLink = (link) => {
    const m = String(link || '').match(/\/file\/d\/([A-Za-z0-9_-]+)/) || String(link || '').match(/[?&]id=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
};

// dd/mm/aaaa → aaaa-mm-dd. Se pide y se lee como TEXTO y se convierte aquí:
// dejar que otro lo interprete es como se cuela un mes por un día.
function aISO(dmy) {
    const m = String(dmy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, d, mes, a] = m;
    const iso = `${a}-${mes}-${d}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(dt.getTime())) return null;
    if (+a < 2020 || +a > new Date().getFullYear() + 1) return null; // fuera de rango: no es una fecha de obra
    return iso;
}

// El texto del CIFO imprime, seguidos, el rótulo y su valor:
//   HITOS DE LA ACTUACIÓN / Fecha de inicio / 06/11/2025 / Fecha de fin / 06/11/2025
// ⚠️ Hay CIFO exportados desde Google Docs que intercalan ESPACIOS DE ANCHO CERO
// entre las letras (`F​e​c​h​a`): a la vista son idénticos y
// ninguna búsqueda literal casa. Se limpian antes de buscar — medido en
// 26RES060_108, que sin esto salía como "no encuentro los HITOS".
const PY_SCRIPT = `
import sys, re, json, fitz
t = "".join(p.get_text() for p in fitz.open(sys.argv[1]))
t = re.sub(r"[\\u200b\\u200c\\u200d\\ufeff\\u00ad]", "", t)
if len(t.strip()) < 200:
    print(json.dumps({"error": "sin capa de texto"})); sys.exit()
m = re.search(r"Fecha\\s+de\\s+inicio\\s*[\\r\\n]+\\s*(\\d{2}/\\d{2}/\\d{4})\\s*[\\r\\n]+\\s*Fecha\\s+de\\s+fin\\s*[\\r\\n]+\\s*(\\d{2}/\\d{2}/\\d{4})", t)
print(json.dumps({"inicio": m.group(1), "fin": m.group(2)} if m else {"error": "no encuentro los HITOS DE LA ACTUACION"}))
`;

function leerFechas(pdfPath) {
    try {
        const out = execFileSync(PY, ['-c', PY_SCRIPT, pdfPath], { encoding: 'utf8', timeout: 60000 });
        return JSON.parse(out.trim().split(/\r?\n/).pop());
    } catch (e) {
        return { error: `no se pudo leer el PDF (${String(e.message).slice(0, 80)})` };
    }
}

(async function main() {
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se escribirán fechas en Supabase.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la tabla te convenza.\n');

    let q = supabase.from('expedientes')
        .select('numero_expediente, oportunidad_id, cifo:documentacion->>cert_cifo_signed_link, ini:documentacion->>fecha_inicio_cifo, fin:documentacion->>fecha_fin_cifo')
        .order('numero_expediente');
    q = SOLO_EXP ? q.eq('numero_expediente', SOLO_EXP) : q.eq('estado', ESTADO);
    const { data: filas, error } = await q;
    if (error) { console.error('✗ Supabase:', error.message); process.exit(1); }

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cifo-'));
    const csv = [['expediente', 'inicio_leido', 'fin_leido', 'resultado', 'detalle'].join(';')];
    let escritos = 0, saltados = 0;

    for (const f of filas) {
        const num = f.numero_expediente;
        if (!f.cifo) { console.log(`· ${num.padEnd(14)} —  sin CIFO firmado`); saltados++; csv.push([num, '', '', 'SIN CIFO', ''].join(';')); continue; }
        if (f.ini && f.fin) { console.log(`· ${num.padEnd(14)} ✓  ya tiene fechas (${f.ini} → ${f.fin}), no se tocan`); saltados++; csv.push([num, '', '', 'YA TENIA', `${f.ini} → ${f.fin}`].join(';')); continue; }

        const id = idDeLink(f.cifo);
        if (!id) { console.log(`· ${num.padEnd(14)} ✗  el enlace del CIFO no trae id`); saltados++; csv.push([num, '', '', 'ERROR', 'enlace sin id'].join(';')); continue; }

        const pdf = path.join(dir, `${num}.pdf`);
        try {
            const r = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' });
            fs.writeFileSync(pdf, Buffer.from(r.data));
        } catch (e) {
            console.log(`· ${num.padEnd(14)} ✗  no se pudo bajar el CIFO (${e.message})`);
            saltados++; csv.push([num, '', '', 'ERROR', 'descarga'].join(';')); continue;
        }

        const leido = leerFechas(pdf);
        if (leido.error) { console.log(`· ${num.padEnd(14)} ✗  ${leido.error}`); saltados++; csv.push([num, '', '', 'NO LEIDO', leido.error].join(';')); continue; }

        const ini = aISO(leido.inicio), fin = aISO(leido.fin);
        if (!ini || !fin) { console.log(`· ${num.padEnd(14)} ✗  fechas no válidas (${leido.inicio} / ${leido.fin})`); saltados++; csv.push([num, leido.inicio, leido.fin, 'NO VALIDO', ''].join(';')); continue; }
        if (fin < ini) { console.log(`· ${num.padEnd(14)} ✗  el fin (${fin}) es anterior al inicio (${ini}) — lo miras tú`); saltados++; csv.push([num, ini, fin, 'INCOHERENTE', ''].join(';')); continue; }

        // Solo los huecos: si una de las dos ya estaba, esa no se toca.
        const aEscribir = [];
        if (!f.ini) aEscribir.push(['fecha_inicio_cifo', ini]);
        if (!f.fin) aEscribir.push(['fecha_fin_cifo', fin]);

        console.log(`· ${num.padEnd(14)} ${ini} → ${fin}   (${aEscribir.map(x => x[0]).join(', ')})`);
        if (!EXECUTE) { csv.push([num, ini, fin, 'SIMULADO', aEscribir.map(x => x[0]).join(' ')].join(';')); escritos++; continue; }

        let fallo = null;
        for (const [campo, valor] of aEscribir) {
            const { error: e } = await supabase.rpc('set_expediente_doc_field', {
                p_oportunidad_id: f.oportunidad_id, p_field: campo, p_value: valor,
            });
            if (e) { fallo = e.message; break; }
        }
        if (fallo) { console.log(`    ✗ Supabase: ${fallo}`); saltados++; csv.push([num, ini, fin, 'ERROR', fallo].join(';')); }
        else { console.log('    ✓ escritas'); escritos++; csv.push([num, ini, fin, 'ESCRITO', aEscribir.map(x => x[0]).join(' ')].join(';')); }
    }

    const salida = path.join(__dirname, EXECUTE ? 'fechas_cifo.csv' : 'fechas_cifo_dryrun.csv');
    fs.writeFileSync(salida, '﻿' + csv.join('\n'), 'utf8');

    console.log('\n─────────────────────────────────────────────');
    console.log(`${EXECUTE ? 'Escritos' : 'Se escribirían'}: ${escritos}   ·   saltados: ${saltados}`);
    console.log(`CSV: ${salida}`);
    if (!EXECUTE) console.log('\nRevisa el CSV y, si te convence, repite con --execute.');
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
