// El XML que sube el certificador → la app hace el PDF oficial (31/10/2026).
// Sin BD, sin Drive y sin el servicio de verdad: un xml2cert de mentira en local.
//   node scripts/test_certapp_xml_a_pdf.js   (desde implementation/backend)
// Ver docs/conocimiento/certificadores-app/el-pdf-del-xml-en-el-servidor.md
const http = require('http');
const path = require('path');
const B = path.join(__dirname, '..');
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

let fallos = 0;
let total = 0;
function ok(cond, texto) {
    total++;
    if (!cond) fallos++;
    console.log(`${cond ? '✓' : '✗'} ${texto}`);
}

const XML = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<DatosEnergeticosDelEdificio version="3.0"><Calificacion/></DatosEnergeticosDelEdificio>');
const PDF = Buffer.from('%PDF-1.7\n%prueba\n');

// El xml2cert de mentira: contesta lo que diga `respuesta`.
let respuesta = { status: 200, cuerpo: { pdf: PDF.toString('base64'), log: '', codigo: 0 } };
let recibido = null;
const falso = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', d => trozos.push(d));
    req.on('end', () => {
        recibido = { url: req.url, tipo: req.headers['content-type'], cuerpo: Buffer.concat(trozos) };
        res.writeHead(respuesta.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(respuesta.cuerpo));
    });
});

(async () => {
    await new Promise(r => falso.listen(0, '127.0.0.1', r));
    process.env.XML2CERT_URL = `http://127.0.0.1:${falso.address().port}/`;
    const cexAPdf = require(path.join(B, 'services/cee/cexAPdf'));

    // ── cexAPdf con XML2CERT_URL: el servicio del servidor ──────────────────
    ok(cexAPdf.disponiblePdf().ok && cexAPdf.disponiblePdf().via === 'servidor', 'con XML2CERT_URL hay generador del PDF (también fuera de Windows)');
    let p = await cexAPdf.pdfDeXml(XML);
    ok(p.ok && !p.marcaDeAgua && Buffer.compare(p.pdf, PDF) === 0 && p.version === '3.0', 'XML válido → el PDF que hace el servicio, sin marca');
    ok(recibido?.url === '/pdf' && /xml/.test(recibido.tipo) && Buffer.compare(recibido.cuerpo, XML) === 0, 'se le manda el XML tal cual a /pdf');

    respuesta = { status: 200, cuerpo: { pdf: PDF.toString('base64'), log: '2026-10-31T07:42:13Z  WARN XML incorrecto "Z:\\\\tmp\\\\cee.xml:3:15: error: element \\"DatosRaros\\" not allowed here"', codigo: 0 } };
    p = await cexAPdf.pdfDeXml(XML);
    ok(p.ok && p.marcaDeAgua && p.avisos.some(a => /DatosRaros/.test(a)), 'el .log del servicio se lee igual que el de Windows: no valida → marca de agua y el motivo');
    const v = await cexAPdf.validarXml(XML);
    ok(!v.ok && v.comprobado && v.errores.some(a => /DatosRaros/.test(a)), 'validarXml (la última puerta antes de subir un calificado) también pregunta al servicio');

    respuesta = { status: 200, cuerpo: { pdf: null, log: 'ERROR algo muy roto', salida: 'typst: unclosed delimiter', codigo: 1 } };
    p = await cexAPdf.pdfDeXml(XML);
    ok(!p.ok && !p.noDisponible && /algo muy roto/.test(p.error), 'sin PDF (inviable) → error con el motivo, y NO «no disponible»');

    respuesta = { status: 503, cuerpo: { error: 'demasiadas conversiones en cola' } };
    p = await cexAPdf.pdfDeXml(XML);
    ok(!p.ok && p.noDisponible && /ocupado/.test(p.error), 'servicio ocupado (503) → noDisponible');

    const huecos = await cexAPdf.pdfDeXml(Buffer.from(XML.toString().replace('<Calificacion/>', '<Descripcion>SEER de ___</Descripcion>')));
    ok(!huecos.ok && /«___»/.test(huecos.error), 'un hueco «___» se para antes de llamar al servicio');

    await new Promise(r => falso.close(r));
    p = await cexAPdf.pdfDeXml(XML);
    ok(!p.ok && p.noDisponible && /no responde/.test(p.error), 'servicio caído → noDisponible (como sin CE3X), no «XML malo»');
    const vCaido = await cexAPdf.validarXml(XML);
    ok(vCaido.ok && !vCaido.comprobado, 'servicio caído: validarXml no bloquea (sin comprobar), como antes en el VPS');

    // ── firma.subirDefinitivo con un XML ────────────────────────────────────
    const supabase = require(path.join(B, 'services/supabaseClient'));
    const driveService = require(path.join(B, 'services/driveService'));
    const drive = require(path.join(B, 'services/certapp/drive'));
    const cex = require(path.join(B, 'services/ceeEnvolventeCex'));
    const cargarXmlCee = require(path.join(B, 'services/cee/cargarXmlCee'));
    const crm = require(path.join(B, 'services/certapp/crm'));
    const vistoBueno = require(path.join(B, 'services/certapp/vistoBueno'));
    const firma = require(path.join(B, 'services/certapp/firma'));

    let guardados = [], updates = [], cargas = [], rpcs = [], anulados = 0, alCrm = 0, compartida = 0, creada = 0, conPdf = null;
    let hayCarpeta = true;
    supabase.rpc = async (nombre) => { rpcs.push(nombre); return { data: null, error: null }; };
    supabase.from = (tabla) => {
        const q = { _tabla: tabla, _patch: null, _eq: {} };
        q.insert = async () => ({ error: null });
        q.update = (patch) => { q._patch = patch; return q; };
        q.eq = (k, val) => { q._eq[k] = val; return q; };
        q.select = async () => { updates.push({ tabla, patch: q._patch, eq: q._eq }); return { data: [{ estado: q._patch?.estado }], error: null }; };
        return q;
    };
    driveService.findFileByName = async () => null;
    driveService.archiveExistingToOld = async () => {};
    driveService.saveFileToFolder = async (carpeta, nombre, mime) => { guardados.push({ carpeta, nombre, mime }); return { id: `id-${nombre}` }; };
    drive.carpetaCeeSiExiste = async () => (hayCarpeta ? 'cee-1' : null);
    drive.asegurarCarpetaObra = async (o) => { creada++; hayCarpeta = true; o.drive_folder_id = 'obra-1'; return { ok: true, id: 'obra-1' }; };
    drive.compartirConCertificador = async () => { compartida++; return { ok: true }; };
    cex.cargarExpediente = async (id) => ({ expediente: { id } });
    cargarXmlCee.cargarXmlEnApp = async (ctx, fase, buf, { escribir }) => {
        cargas.push(escribir);
        return escribir ? { cargado: true } : { omitido: 'en seco', parsed: { epnrLetra: 'E', emisionesLetra: 'D' } };
    };
    crm.enviarDefinitivoAsync = () => { alCrm++; };
    vistoBueno.anularSiOtraReceta = async (id, huella, { motivo }) => { anulados++; return !!motivo; };
    cexAPdf.pdfDeXml = async () => conPdf;

    const reset = () => { guardados = []; updates = []; cargas = []; rpcs = []; anulados = 0; alCrm = 0; compartida = 0; creada = 0; hayCarpeta = true; };
    const obraDe = (estado, extra = {}) => ({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', cuenta_id: 'c1', numero_expediente: '2026EXT_9', estado, drive_folder_id: 'obra-1', ...extra });
    const cuenta = { id: 'c1', email: 'tecnico@example.com' };
    const subir = (obra, buffer = XML) => firma.subirDefinitivo(obra, cuenta, { buffer, originalname: 'cee.xml' }).catch(e => e);

    // Válido, LISTO: XML + PDF en «1. CEE», cargado, sigue LISTO.
    reset();
    conPdf = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: false, avisos: [] };
    let r = await subir(obraDe('LISTO'));
    ok(r.ok && r.tipo === 'xml' && r.pdf === '2026EXT_9 - CEE.pdf' && r.estado === 'LISTO', 'LISTO + XML válido → guarda el XML y hace `{nº} - CEE.pdf`; sigue LISTO (por firmar)');
    ok(guardados.map(g => g.nombre).join('|') === '2026EXT_9 - CEE.xml|2026EXT_9 - CEE.pdf' && guardados.every(g => g.carpeta === 'cee-1'),
        'los dos van a «1. CEE» con su nombre definitivo');
    ok(cargas.join(',') === 'false,true' && alCrm === 1 && anulados === 1, 'se lee en seco, se carga de verdad, va al CRM y anula el visto bueno de BROKERGY');
    ok(!updates.length, 'LISTO no cambia de estado');

    // BORRADOR: sin carpeta → se crea; pasa a LISTO, se comparte, sin créditos.
    reset();
    hayCarpeta = false;
    r = await subir(obraDe('BORRADOR', { drive_folder_id: null }));
    ok(r.ok && r.estado === 'LISTO' && creada === 1 && compartida === 1, 'BORRADOR + XML → crea la carpeta, pasa a LISTO y la comparte');
    const u = updates.find(x => x.tabla === 'certapp_obras');
    ok(u?.patch?.estado === 'LISTO' && u.patch.listo_at && u.patch.entregado_at && u.eq.estado === 'BORRADOR', 'el paso a LISTO es condicional (solo si seguía en BORRADOR)');
    ok(!updates.some(x => /credito/i.test(x.tabla)) && !rpcs.some(n => /credito/i.test(n)), 'no gasta créditos');

    // VALIDADO: lo firmado era el PDF anterior → vuelve a LISTO.
    reset();
    r = await subir(obraDe('VALIDADO'));
    ok(r.ok && r.estado === 'LISTO' && updates[0]?.patch?.validado_at === null && updates[0].eq.estado === 'VALIDADO', 'VALIDADO + XML nuevo → vuelve a LISTO (hay que firmar el PDF nuevo)');

    // No valida (marca de agua): nada guardado (regla 140).
    reset();
    conPdf = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: true, avisos: ['element "X" not allowed here'] };
    r = await subir(obraDe('LISTO'));
    ok(r.status === 422 && r.code === 'XML_NO_VALIDA' && /certificado incompleto/.test(r.message) && r.extra?.motivos?.length === 1,
        'XML que no valida → 422 XML_NO_VALIDA con los motivos');
    ok(!guardados.length && cargas.join(',') === 'false' && !alCrm && !anulados, 'y no se guarda, no se carga ni se manda nada');

    // Sin generador: 503, nada guardado.
    reset();
    conPdf = { ok: false, noDisponible: true, error: 'no responde' };
    r = await subir(obraDe('LISTO'));
    ok(r.status === 503 && r.code === 'PDF_NO_DISPONIBLE' && !guardados.length, 'sin generador → 503 PDF_NO_DISPONIBLE y nada guardado');

    // CE3X 2.3: no.
    reset();
    conPdf = { ok: false, version: '2.0', error: 'XML v2.0' };
    r = await subir(obraDe('LISTO'));
    ok(r.status === 422 && r.code === 'XML_CE3X_ANTIGUO' && !guardados.length, 'XML de CE3X 2.3 → 422 (se hace con la 3.2)');

    // Encargo de BROKERGY sin aceptar, en BORRADOR: no.
    reset();
    conPdf = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: false, avisos: [] };
    r = await subir(obraDe('BORRADOR', { seguimiento: { crm: { id: 'x', encargo: { estado: 'PENDIENTE' } } } }));
    ok(r.status === 409 && r.code === 'ENCARGO_SIN_ACEPTAR' && !guardados.length, 'encargo de BROKERGY sin aceptar → 409, como «Pedir el certificado»');

    // En BORRADOR solo el XML; en preparación, nada.
    reset();
    r = await subir(obraDe('BORRADOR'), PDF);
    ok(r.status === 409 && r.code === 'ESTADO_NO_FIRMABLE', 'BORRADOR + PDF → 409 (antes de pedirlo solo vale el XML)');
    r = await subir(obraDe('EN_PREPARACION'));
    ok(r.status === 409 && r.code === 'ESTADO_NO_FIRMABLE' && !guardados.length, 'EN_PREPARACION → 409 (lo está haciendo la app)');

    console.log(`\n${total - fallos}/${total} bien${fallos ? ` · ${fallos} MAL` : ''}`);
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
