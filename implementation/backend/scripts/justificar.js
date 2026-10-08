// Herramientas de la skill `justificar-expediente`: llevar a la app lo que manda
// el instalador al terminar la obra (facturas, certificado y memoria RITE, fotos)
// y dejar preparados los documentos para firma, por las MISMAS rutas y funciones
// que usa una persona en la pantalla.
//
//   node scripts/justificar.js estado 26RES060_178          qué tiene y qué le falta (solo lee)
//   node scripts/justificar.js api POST api/expedientes/<id>/facturas/ocr --file files=a.pdf --out r.json
//   node scripts/justificar.js fotos --plan fotos.json [--escribir]
//   node scripts/justificar.js anexos 26RES060_178 [anexo1,cesion] [--escribir]
//   node scripts/justificar.js bajar <driveId|enlace> salida.pdf
//
// `api` llama a la API de la app con la sesión del ROBOT (cuenta CLAUDE, la de
// claude_propuesta.js) contra CLAUDE_ROBOT_APP_URL o https://app.brokergy.es: es
// la pantalla sin la pantalla (OCR de facturas, certificado RITE, placas, PUT del
// expediente o del cliente…). La ruta puede ir sin «/» inicial: Git Bash convierte
// «/api/...» en una ruta de Windows.
//
// `fotos` coloca cada fichero en su apartado con `subirFicherosASlot` (la del
// gestor), validando contra el checklist REAL de esa obra; a diferencia de
// `alta_oportunidad.js documentar`, pone NOMBRE a lo que va a «Otros».
//
// `anexos` abre el expediente en un Chrome sin pantalla como CLAUDE →
// Documentación → «Generar» del Anexo I y del Convenio → «Guardar en Drive». El
// Anexo I y el Convenio solo los compone el navegador (como la propuesta, regla
// 103). NO pulsa ningún botón de envío. En seco hace captura y no guarda.
//
// Sin --escribir, `fotos` y `anexos` no tocan nada.
const path = require('path');
const fs = require('fs');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const { abrirSesionRobot, cerrarSesionRobot, claveSesionNavegador } = require('../utils/sesionRobot');

const APP = process.env.CLAUDE_ROBOT_APP_URL || 'https://app.brokergy.es';
const SALIDA = path.join(__dirname, '../scratch/justificar');
const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic', '.mp4': 'video/mp4' };
const args = process.argv.slice(2);
const orden = args[0];
const ESCRIBIR = args.includes('--escribir');
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function expedientePorNumero(num) {
    const { data, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, estado, oportunidad_id, cliente_id, instalador_asociado_id, instalacion, documentacion')
        .eq('numero_expediente', String(num || '').toUpperCase()).maybeSingle();
    if (error || !data) throw new Error(`No existe el expediente «${num}».`);
    return data;
}

// ─── api ─────────────────────────────────────────────────────────────────────
async function llamar(sesion, metodo, ruta, { json, files } = {}) {
    const headers = { Authorization: `Bearer ${sesion.access_token}` };
    let body;
    if (files?.length) {
        const fd = new FormData();
        for (const { campo, fichero } of files) {
            fd.append(campo, new Blob([fs.readFileSync(fichero)], { type: MIME[path.extname(fichero).toLowerCase()] || 'application/octet-stream' }), path.basename(fichero));
        }
        body = fd;
    } else if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
    }
    const r = await fetch(APP + (ruta.startsWith('/') ? ruta : `/${ruta}`), { method: metodo, headers, body });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    return { status: r.status, data };
}

async function api() {
    const [, metodo, ruta, ...resto] = args;
    if (!metodo || !ruta) throw new Error('Uso: api MÉTODO ruta [--json f.json] [--file campo=ruta] [--out salida.json]');
    const files = []; let json; let out;
    for (let i = 0; i < resto.length; i++) {
        if (resto[i] === '--json') json = JSON.parse(fs.readFileSync(resto[++i], 'utf8'));
        else if (resto[i] === '--file') { const [campo, ...p] = resto[++i].split('='); files.push({ campo, fichero: p.join('=') }); }
        else if (resto[i] === '--out') out = resto[++i];
    }
    const sesion = await abrirSesionRobot();
    try {
        const res = await llamar(sesion, metodo.toUpperCase(), ruta, { json, files });
        const txt = JSON.stringify(res, null, 1);
        if (out) { fs.writeFileSync(out, txt); console.log(`HTTP ${res.status} → ${out}`); } else console.log(txt);
        if (res.status >= 400) process.exitCode = 1;
    } finally { await cerrarSesionRobot(sesion); }
}

// ─── estado ──────────────────────────────────────────────────────────────────
async function estado() {
    const exp = await expedientePorNumero(args[1]);
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const { data: op } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, ficha, prescriptor_id, instalador_asociado_id, price:datos_calculo->inputs->>caePriceClient, rate:datos_calculo->inputs->>cae_client_rate, folder:datos_calculo->>drive_folder_id')
        .eq('id', exp.oportunidad_id).single();
    const { data: cli } = await supabase.from('clientes')
        .select('nombre_razon_social, apellidos, dni, email, tlf, direccion, codigo_postal, municipio, numero_cuenta, copropietarios')
        .eq('id_cliente', exp.cliente_id).maybeSingle();
    const linea = (k, v) => console.log(`  ${k.padEnd(28)} ${v}`);
    console.log(`\n${exp.numero_expediente} · ${exp.estado} · ${op.ficha || ''} · ${op.id_oportunidad}`);
    console.log('\nCLIENTE / CEDENTES');
    linea('Titular', `${cli?.nombre_razon_social || ''} ${cli?.apellidos || ''} · ${cli?.dni || 'SIN DNI'} · ${cli?.email || 'SIN EMAIL'} · ${cli?.tlf || 'sin tlf'}`);
    linea('Domicilio', [cli?.direccion, cli?.codigo_postal, cli?.municipio].filter(Boolean).join(', '));
    linea('Cuenta', cli?.numero_cuenta ? `…${String(cli.numero_cuenta).slice(-4)}` : 'SIN CUENTA');
    for (const p of cli?.copropietarios || []) linea(p.cedente ? 'Copropietario CEDENTE' : 'Copropietario', `${p.nombre} ${p.apellidos} · ${p.dni || 'sin DNI'}${p.cuota_pct ? ` · ${p.cuota_pct} %` : ''}`);
    console.log('\nINSTALADOR');
    const instId = inst.instalador_id || exp.instalador_asociado_id;
    const { data: pres } = instId ? await supabase.from('prescriptores').select('razon_social, cif').eq('id_empresa', instId).maybeSingle() : { data: null };
    linea('Empresa', pres ? `${pres.razon_social} · ${pres.cif}` : 'SIN INSTALADOR');
    linea('FK expediente / oportunidad', `${exp.instalador_asociado_id ? 'sí' : 'NO'} / ${op.instalador_asociado_id ? 'sí' : 'NO'}`);
    console.log('\nEQUIPOS');
    const c = inst.caldera_antigua_cal || {}; const a = inst.aerotermia_cal || {}; const s = inst.aerotermia_acs || {};
    linea('Caldera que se retira', `${c.marca || '—'} ${c.modelo || ''} · serie ${c.numero_serie || '—'} · ${c.rendimiento_id || '—'}`);
    linea('Calefacción nueva', `${a.marca || '—'} ${a.modelo || ''} (cat. ${a.aerotermia_db_id ?? '—'}) · serie ${a.numero_serie || '—'} · SCOP ${a.scop ?? '—'} ${a.scop_temporada || ''} · ${inst.tipo_emisor || ''}`);
    linea('ACS', inst.cambio_acs === false ? 'fuera del alcance' : (inst.misma_aerotermia_acs !== false
        ? 'la misma máquina' : `${s.marca || '—'} ${s.modelo || ''} (cat. ${s.aerotermia_db_id ?? '—'}) · serie ${s.numero_serie || '—'} · SCOPdhw ${s.scop ?? '—'}`));
    console.log('\nFACTURAS');
    const fs_ = doc.facturas || [];
    for (const f of fs_) linea(`nº ${f.numero_factura || '?'}`, `${f.fecha_factura || '—'} · ${eur(f.importe_sin_iva)} € s/IVA · ${f.emisor_nombre || ''} · ${f.validada ? 'validada' : 'SIN VALIDAR'} · ${f.drive_link ? 'PDF' : 'SIN PDF'}`);
    linea('Inversión (Σ bases)', `${eur(fs_.reduce((t, f) => t + (Number(f.importe_sin_iva) || 0), 0))} €`);
    console.log('\nRITE Y FECHAS');
    linea('Certificado RITE', doc.cert_rite_drive_link ? `sí · pruebas ${doc.fecha_pruebas_cert_instalacion || '—'} · firma ${doc.fecha_firma_cert_instalacion || '—'}` : 'NO');
    linea('Memoria RITE (firmada)', doc.cert_rite_signed_link ? 'sí' : 'no');
    const { calcCifo } = await import(require('url').pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/calcCifo.js')).href);
    const f = calcCifo(doc);
    linea('Inicio · fin (CIFO)', `${f.inicio || '—'} · ${f.fin || '—'}${doc.fecha_inicio_cifo_manual ? ' (inicio a mano)' : ''}`);
    console.log('\nECONOMÍA (la del expediente)');
    try {
        const { CEE_ECO_SELECT, rebuildCee } = require('../utils/ceeEcoFields');
        const { data: raw } = await supabase.from('expedientes').select(`id, numero_expediente, documentacion, instalacion, oportunidad_id, ${CEE_ECO_SELECT}`).eq('id', exp.id).single();
        const { data: opFull } = await supabase.from('oportunidades').select('id, ficha, datos_calculo').eq('id', exp.oportunidad_id).single();
        const fin = await require('../services/expedienteFinancialsNode').computeExpedienteFinancialsNode(rebuildCee(raw), opFull);
        const precio = inst.economico_override?.cae_client_rate ?? (parseFloat(op.rate) || null);
        linea('Ahorro', `${Math.round(fin.savingsKwh).toLocaleString('es-ES')} kWh/año`);
        linea('Bono CAE cliente', `${eur(fin.cae)} €`);
        linea('Precio al cliente', precio != null ? `${precio} €/MWh${inst.economico_override?.cae_client_rate != null ? ' (fijado en Económico)' : ''}`
            : `SIN PRECIO PROPIO → respaldo 95 €/MWh (la propuesta dijo ${op.price || '—'} €/MWh)`);
    } catch (e) { linea('Economía', `no se pudo calcular: ${e.message}`); }
    console.log('\nDOCUMENTOS PARA FIRMA');
    for (const [k, l] of [['anexo_i', 'Anexo I'], ['anexo_cesion', 'Convenio de Cesión'], ['cert_cifo', 'CIFO'], ['anexo_fotografico', 'Anexo Fotográfico']]) {
        linea(l, `${doc[`${k}_drive_link`] ? 'borrador' : 'SIN GENERAR'}${doc[`${k}_signed_link`] ? ' · FIRMADO' : ''}`);
    }
    console.log('\nFOTOS (apartados de la obra)');
    const reformaUpload = require('../services/reformaUploadService');
    const { data: opp } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', exp.oportunidad_id).single();
    const checklist = await reformaUpload.checklistForOportunidad(opp);
    const up = opp.datos_calculo?.reforma_uploads || {};
    // Facturas y RITE no: viven en `documentacion` (arriba), no en `reforma_uploads`.
    for (const sl of checklist.filter(x => /^FOTO_/.test(x.key))) {
        const n = Array.isArray(up[sl.key]) ? up[sl.key].length : 0;
        linea(sl.key, `${n || '—'}${n ? '' : (sl.fase === 'DESPUES' ? '  ← falta' : '')}`);
    }
}

// ─── fotos ───────────────────────────────────────────────────────────────────
async function fotos() {
    const fPlan = opcion('--plan');
    if (!fPlan) throw new Error('Uso: fotos --plan plan.json [--escribir]');
    const plan = JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const base = path.resolve(path.dirname(path.resolve(fPlan)), plan.base || '.');
    const exp = await expedientePorNumero(plan.obra);
    const reformaUpload = require('../services/reformaUploadService');
    const alta = require('../utils/altaOportunidad');
    const { data: opp0 } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', exp.oportunidad_id).single();
    const porKey = new Map((await reformaUpload.checklistForOportunidad(opp0)).map(s => [s.key, s]));
    const grupos = new Map();
    for (const f of plan.fotos || []) {
        const def = porKey.get(f.slot);
        if (!def) throw new Error(`«${f.slot}» no es un apartado de ${plan.obra} (mira «estado»).`);
        const ruta = path.resolve(base, f.fichero);
        if (!fs.existsSync(ruta)) throw new Error(`No existe ${ruta}`);
        const k = `${f.slot}|${f.label || ''}`;
        if (!grupos.has(k)) grupos.set(k, { def, label: f.label || null, rutas: [] });
        grupos.get(k).rutas.push(ruta);
        console.log(`  ${path.basename(ruta).slice(0, 50).padEnd(50)} → ${f.slot}${f.label ? ` «${f.label}»` : ''}`);
    }
    if (!ESCRIBIR) { console.log('\nEN SECO. Repite con --escribir.'); return; }
    const resumen = [];
    // En serie, un grupo por apartado: el índice _N se calcula con lo que ya hay.
    for (const { def, label, rutas } of grupos.values()) {
        // eslint-disable-next-line no-await-in-loop
        const { data: opp } = await supabase.from('oportunidades').select('id, datos_calculo').eq('id', opp0.id).single();
        // eslint-disable-next-line no-await-in-loop
        const { subidas, fallidas } = await reformaUpload.subirFicherosASlot({
            oportunidadUuid: opp.id, datosCalculo: opp.datos_calculo || {}, slotDef: def, label,
            archivos: rutas.map(r => ({ originalname: path.basename(r), mimetype: alta.mimeDeFichero(r), buffer: fs.readFileSync(r) })),
            subidoPor: 'admin',
        });
        for (const s of subidas) console.log(`  ✓ ${def.key} → ${s.name}`);
        for (const x of fallidas) console.log(`  ✗ ${def.key}: ${x.error}`);
        if (subidas.length) resumen.push(`${subidas.length} en «${def.label}»${label ? ` (${label})` : ''}`);
    }
    if (resumen.length) await alta.anotarAlta(supabase, opp0.id, { texto: `📸 ${plan.nota || 'Fotos de la obra colocadas'}: ${resumen.join(' · ')}.`, meta: null });
}

// ─── anexos (Anexo I y Convenio desde la pantalla) ──────────────────────────
async function anexos() {
    const exp = await expedientePorNumero(args[1]);
    const docsArg = args[2] && !args[2].startsWith('--') ? args[2] : 'anexo1,cesion';
    const DOCS = docsArg.split(',');
    fs.mkdirSync(SALIDA, { recursive: true });
    const foto = async (page, n) => { const f = path.join(SALIDA, `${exp.numero_expediente}-${n}.png`); try { await page.screenshot({ path: f }); } catch { /* */ } return f; };
    const sesion = await abrirSesionRobot();
    const puppeteer = require(path.join(__dirname, '../node_modules/puppeteer'));
    const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1440, height: 1000 } });
    try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument((h, k, v) => { if (location.hostname === h && !localStorage.getItem(k)) localStorage.setItem(k, v); },
            new URL(APP).hostname, claveSesionNavegador(), JSON.stringify(sesion));
        const dialogos = [];
        page.on('dialog', async (d) => { dialogos.push(d.message()); console.log(`  [aviso de la app] ${d.message()}`); await d.accept(); });
        page.on('pageerror', e => console.log(`  [error de la página] ${e.message.slice(0, 160)}`));

        const abrirDocumentacion = async () => {
            await page.goto(`${APP}/?exp=${exp.id}`, { waitUntil: 'networkidle2', timeout: 90000 });
            const tab = await page.waitForSelector('xpath/.//button[contains(., "Documentación") and not(ancestor::nav)]', { timeout: 90000 })
                .catch(async () => { throw new Error(`No aparece la pestaña Documentación (captura: ${await foto(page, '0-expediente')})`); });
            // La pestaña recuerda su estado: si ya está abierta, pulsarla la pliega.
            const hayFila = () => page.waitForSelector('xpath/.//p[normalize-space()="Anexo I"]', { timeout: 8000 }).then(() => true).catch(() => false);
            let ok = await hayFila();
            for (let i = 0; !ok && i < 2; i++) { await tab.click(); ok = await hayFila(); }
            if (!ok) throw new Error(`No aparece la fila «Anexo I» (captura: ${await foto(page, '0-expediente')})`);
            await espera(2500);
        };
        const pulsarGenerar = async (titulo) => {
            const [b] = await page.$$(`xpath/.//p[normalize-space()="${titulo}"]/ancestor::div[contains(@class,"justify-between")][1]//button[contains(.,"Generar") or contains(.,"Generado")]`);
            if (!b) throw new Error(`No encuentro el botón «Generar» de «${titulo}».`);
            await b.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await b.click();
        };
        // La puerta «Datos faltantes» (o avisos) NO se salta: se enseña y se vuelve.
        const puertaValidacion = async (n) => {
            const v = await page.$('xpath/.//*[contains(text(),"Generar de todos modos")]');
            if (!v) return false;
            const txt = await page.evaluate(() => document.body.innerText);
            const i = txt.search(/DATOS FALTANTES|faltan los siguientes/i);
            console.log(`  ⚠ La app pide datos antes de generar:\n${txt.slice(i, i + 500).replace(/\n{2,}/g, '\n')}`);
            console.log(`  captura: ${await foto(page, `${n}-faltan`)}`);
            const [volver] = await page.$$('xpath/.//button[normalize-space()="Volver" or normalize-space()="VOLVER"]');
            if (volver) { await volver.click(); await espera(800); }
            return true;
        };
        const guardar = async (n, titulo) => {
            await page.waitForSelector('button[title="Guardar en Drive"]', { timeout: 60000 })
                .catch(async () => { throw new Error(`No se abrió el popup de ${titulo} (captura: ${await foto(page, `${n}-error`)})`); });
            await espera(6000);   // el impreso oficial se rellena y se pinta
            const cab = await page.evaluate(() => [...document.querySelectorAll('.fixed h2, .fixed p')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 4).join(' | '));
            console.log(`  popup: ${cab.slice(0, 300)}`);
            console.log(`  captura: ${await foto(page, `${n}-popup`)}`);
            if (!ESCRIBIR) return;
            const antes = dialogos.length;
            await page.click('button[title="Guardar en Drive"]');
            const t0 = Date.now();
            while (dialogos.length === antes && Date.now() - t0 < 120000) await espera(500);
            if (dialogos.length === antes) console.log('  ⚠ sin confirmación de la app en 2 min: compruébalo en Documentación.');
        };

        if (DOCS.includes('anexo1')) {
            console.log('\n── ANEXO I');
            await abrirDocumentacion();
            await pulsarGenerar('Anexo I');
            await espera(1500);
            if (!(await puertaValidacion('anexo1'))) await guardar('anexo1', 'Anexo I');
        }
        if (DOCS.includes('cesion')) {
            console.log('\n── CONVENIO DE CESIÓN');
            await abrirDocumentacion();
            await pulsarGenerar('Anexo Cesión de Ahorro');
            await espera(1200);
            // Puerta «¿La obra está finalizada?»: con facturas, sí (se guarda en el expediente).
            const terminada = (exp.documentacion?.facturas || []).length > 0;
            const [op] = await page.$$(`xpath/.//*[contains(text(),"${terminada ? 'Sí, la obra está terminada' : 'Todavía no, está en obra'}")]`);
            if (op) { console.log(`  puerta: «${terminada ? 'Sí, la obra está terminada' : 'Todavía no, está en obra'}»`); await op.click(); await espera(1500); }
            if (!(await puertaValidacion('cesion'))) await guardar('cesion', 'Convenio');
        }
        if (!ESCRIBIR) console.log('\nEN SECO: no se ha guardado nada. Repite con --escribir.');
        else console.log('\nComprueba con «estado» que los dos borradores quedan enlazados.');
    } finally {
        await browser.close().catch(() => {});
        await cerrarSesionRobot(sesion);
    }
}

// ─── bajar ───────────────────────────────────────────────────────────────────
async function bajar() {
    const [, idOEnlace, salida] = args;
    if (!idOEnlace || !salida) throw new Error('Uso: bajar <driveId|enlace> salida');
    const m = String(idOEnlace).match(/\/d\/([A-Za-z0-9_-]+)/) || String(idOEnlace).match(/[?&]id=([A-Za-z0-9_-]+)/);
    const buf = await require('../services/driveService').getFileContent(m ? m[1] : idOEnlace);
    fs.writeFileSync(salida, buf);
    console.log(`${salida} (${buf.length} bytes)`);
}

(async () => {
    try {
        if (orden === 'estado') await estado();
        else if (orden === 'api') await api();
        else if (orden === 'fotos') await fotos();
        else if (orden === 'anexos') await anexos();
        else if (orden === 'bajar') await bajar();
        else { console.log('Uso: estado <nº> | api MÉTODO ruta … | fotos --plan p.json [--escribir] | anexos <nº> [anexo1,cesion] [--escribir] | bajar <id> <salida>'); process.exitCode = 2; }
    } catch (e) {
        console.error(`✗ ${e.message}`);
        process.exitCode = 1;
    }
    // Los servicios de la app dejan temporizadores vivos (Drive, WhatsApp).
    setTimeout(() => process.exit(process.exitCode || 0), 300).unref();
})();
