// El técnico sube el XML por su enlace (/subir-cee, /subir-cee-directo) → el
// servidor hace el PDF oficial y lo deja en la casilla del PDF (31/10/2026).
// Sin BD, sin Drive y sin xml2cert: todo de mentira.
//   node scripts/test_subida_cee_pdf_del_xml.js   (desde implementation/backend)
// Ver docs/conocimiento/certificadores-app/el-pdf-del-xml-en-el-servidor.md
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

const XML = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<DatosEnergeticosDelEdificio version="3.0"><Calificacion>E</Calificacion></DatosEnergeticosDelEdificio>\n');
const OTRO = Buffer.from(XML.toString().replace('>E<', '>D<'));
const PDF = Buffer.from('%PDF-1.7\n%el oficial\n');

/** Un PDF que lleva `xml` dentro, como el de xml2cert. */
async function pdfCon(xml) {
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage();
    if (xml) await doc.attach(xml, 'cee.xml', { mimeType: 'application/xml' });
    return Buffer.from(await doc.save());
}

(async () => {
    const cexAPdf = require(path.join(B, 'services/cee/cexAPdf'));

    // ── xmlDelPdf / mismoXml ─────────────────────────────────────────────────
    ok(cexAPdf.mismoXml(await cexAPdf.xmlDelPdf(await pdfCon(XML)), XML), 'xmlDelPdf saca el XML que el PDF lleva dentro');
    ok(!cexAPdf.mismoXml(await cexAPdf.xmlDelPdf(await pdfCon(OTRO)), XML), 'y distingue el de otro XML');
    ok(await cexAPdf.xmlDelPdf(await pdfCon(null)) === null && await cexAPdf.xmlDelPdf(Buffer.from('nada')) === null, 'sin XML dentro, o sin PDF → null');
    ok(cexAPdf.mismoXml(XML.toString().replace(/\n/g, '\r\n'), `﻿${XML}`), 'mismoXml no distingue el fin de línea de Windows ni el BOM');

    // ── los stubs ────────────────────────────────────────────────────────────
    const supabase = require(path.join(B, 'services/supabaseClient'));
    const ceeUploadService = require(path.join(B, 'services/ceeUploadService'));
    const driveService = require(path.join(B, 'services/driveService'));
    const revisionTecnico = require(path.join(B, 'services/cee/revisionTecnico'));
    const ceeDirectoUploads = require(path.join(B, 'services/ceeDirectoUploadService'));
    const svcCeeDirecto = require(path.join(B, 'services/ceeDirectoService'));
    const ceeDirectoProceso = require(path.join(B, 'services/ceeDirectoProceso'));
    const { subirCae, subirCeeDirecto } = require(path.join(B, 'services/cee/subidaCeePublica'));

    let exp = null, subidas = [], updates = [], conPdf = null, llamadasPdf = 0, actual = null, contenidoActual = null, factura = 0, guardados = [];
    supabase.from = () => {
        const q = { _patch: null };
        q.select = () => q;
        q.update = (patch) => { q._patch = patch; return q; };
        q.eq = () => q;
        q.maybeSingle = async () => ({ data: exp, error: null });
        q.then = (res) => { if (q._patch) updates.push(q._patch); return Promise.resolve({ error: null }).then(res); };
        return q;
    };
    ceeUploadService.resolveDriveFolderId = async () => 'raiz-1';
    ceeUploadService.uploadCeeFile = async (raiz, fase, num, slot) => {
        subidas.push(slot);
        return { link: `https://drive/${slot}`, id: `id-${slot}`, fileName: `${num} – CEE INICIAL${slot === 'pdf' ? '_fdo.pdf' : `.${slot}`}` };
    };
    ceeUploadService.scanCeeSection = async () => (actual ? { pdf: actual } : {});
    driveService.getFileContent = async () => contenidoActual;
    revisionTecnico.olvidar = () => {};
    cexAPdf.pdfDeXml = async () => { llamadasPdf++; return conPdf; };

    const valido = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: false, avisos: [] };
    const reset = (extra = {}) => {
        exp = { id: 'e1', numero_expediente: '26RES060_999', seguimiento: {}, cee: { docs_validados: { inicial_xml: true, inicial_pdf: true } }, ...extra };
        subidas = []; updates = []; llamadasPdf = 0; actual = null; contenidoActual = null; factura = 0; guardados = [];
        conPdf = valido;
    };
    const sube = (opts = {}) => subirCae({ expedienteId: 'e1', fase: 'inicial', slot: 'xml', buffer: XML, mimetype: 'text/xml', pdfDelXml: true, ...opts }).catch(e => e);

    // ── CAE (/subir-cee) ─────────────────────────────────────────────────────
    reset();
    let r = await sube();
    ok(r.success && subidas.join('|') === 'xml|pdf' && r.pdf_oficial?.hecho && !r.pdf_oficial.sustituido, 'XML válido → se guarda el XML y el PDF oficial va a la casilla del PDF');
    const cee = updates[0]?.cee;
    ok(cee?.cee_files?.inicial?.xml === 'https://drive/xml' && cee.cee_files.inicial.pdf === 'https://drive/pdf', 'los dos enlaces quedan en cee_files (una sola escritura)');
    ok(!cee.docs_validados.inicial_xml && !cee.docs_validados.inicial_pdf, 'y las dos casillas vuelven a ámbar (lo validado era otro fichero)');

    reset();
    actual = { id: 'pdf-1', name: '26RES060_999 – CEE INICIAL_fdo.pdf' };
    contenidoActual = await pdfCon(XML);
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml' && r.pdf_oficial?.conservado === actual.name, 'si el PDF que ya hay lleva ESTE XML (el suyo, firmado o no), no se toca');
    ok(updates[0]?.cee?.docs_validados?.inicial_pdf === true, 'y su validación se respeta');

    reset();
    actual = { id: 'pdf-1', name: '26RES060_999 – CEE INICIAL_fdo.pdf' };
    contenidoActual = await pdfCon(OTRO);
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml|pdf' && r.pdf_oficial?.sustituido === actual.name, 'si era de OTRO XML, se pone el oficial (el anterior pasa a OLD) y se dice');

    reset();
    actual = { id: 'pdf-1', name: 'raro.pdf' };
    contenidoActual = Buffer.from('no es un pdf');
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml|pdf' && r.pdf_oficial?.hecho, 'si el que había no se puede leer, también se pone el oficial');

    reset();
    conPdf = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: true, avisos: ['element "Opaco" incomplete; missing required element "Construccion"'] };
    r = await sube();
    ok(r.status === 422 && r.codigo === 'XML_NO_VALIDA' && /certificado incompleto/.test(r.message) && r.motivos?.[0]?.includes('Construccion'),
        'XML que no valida → 422 XML_NO_VALIDA con los motivos del .log');
    ok(!subidas.length && !updates.length, 'y no se guarda nada (regla 140)');

    reset();
    conPdf = { ok: false, version: '3.0', avisos: [], error: 'el XML tiene un hueco «___» sin completar' };
    r = await sube();
    ok(r.status === 422 && r.motivos?.[0]?.includes('___') && !subidas.length, 'un hueco «___» → 422 con el motivo');

    reset();
    conPdf = { ok: false, noDisponible: true, error: 'no responde' };
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml' && r.pdf_oficial === null && /vuelve a subirlo/.test(r.aviso_pdf), 'sin generador → el XML se guarda como siempre, sin PDF, y se dice');

    reset();
    conPdf = { ok: false, version: '2.0', error: 'XML v2.0' };
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml' && r.pdf_oficial === null && !r.aviso_pdf, 'XML de CE3X 2.3 → se guarda como siempre (su PDF lo saca la 2.3)');

    reset();
    conPdf = { ok: false, noEsCee: true, error: 'no es el XML de un certificado energético' };
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml' && /no parece el XML/.test(r.aviso_pdf), 'un XML que no es de un certificado → se guarda como antes y se avisa');

    reset({ seguimiento: { cee_inicial: 'REGISTRADO' } });
    r = await sube();
    ok(r.success && subidas.join('|') === 'xml' && !llamadasPdf, 'fase ya REGISTRADA → no se hace PDF ni se valida: lo presentado no se toca');

    reset();
    r = await sube({ pdfDelXml: false });
    ok(r.success && subidas.join('|') === 'xml' && !llamadasPdf && !('pdf_oficial' in r), 'sin pdfDelXml (la app de certificadores, las skills) → como siempre');

    reset();
    r = await sube({ slot: 'cex', buffer: Buffer.from('cex') });
    ok(r.success && subidas.join('|') === 'cex' && !llamadasPdf, 'otra casilla (.cex) → no hace PDF');

    // ── CEE directo (/subir-cee-directo) ────────────────────────────────────
    let fila = null;
    svcCeeDirecto.cargar = async () => fila;
    svcCeeDirecto.guardar = async (id, patch) => { guardados.push(patch); };
    svcCeeDirecto.anotarHistorial = async () => {};
    ceeDirectoUploads.uploadFile = async (row, fase, slot) => { subidas.push(slot); return { link: `https://drive/${slot}`, id: `id-${slot}`, fileName: `${row.numero_expediente} – CEE${slot === 'pdf' ? '_fdo.pdf' : `.${slot}`}` }; };
    ceeDirectoUploads.scanSection = async () => (actual ? { pdf: actual } : {});
    ceeDirectoProceso.revisarFacturaAsync = () => { factura++; };
    const subeDirecto = (opts = {}) => subirCeeDirecto({ id: 'd1', fase: 'inicial', slot: 'xml', buffer: XML, mimetype: 'text/xml', pdfDelXml: true, ...opts }).catch(e => e);

    reset();
    fila = { id: 'd1', numero_expediente: '2026CEE_99', drive_folder_id: 'raiz-d', seguimiento: {}, cee: {} };
    r = await subeDirecto();
    ok(r.success && subidas.join('|') === 'xml|pdf' && r.pdf_oficial?.hecho, 'CEE directo: XML válido → XML y PDF oficial');
    ok(guardados[0]?.cee?.cee_files?.inicial?.pdf === 'https://drive/pdf' && !factura, 'el PDF oficial NO cuenta como «PDF firmado»: no toca el paso de la factura');

    reset();
    fila = { id: 'd1', numero_expediente: '2026CEE_99', drive_folder_id: 'raiz-d', seguimiento: {}, cee: {} };
    conPdf = { ok: true, version: '3.0', pdf: PDF, marcaDeAgua: true, avisos: ['falta algo'] };
    r = await subeDirecto();
    ok(r.status === 422 && r.codigo === 'XML_NO_VALIDA' && !subidas.length && !guardados.length, 'CEE directo: XML que no valida → 422 y nada guardado');

    reset();
    fila = { id: 'd1', numero_expediente: '2026CEE_99', drive_folder_id: 'raiz-d', seguimiento: { cee_inicial: 'REGISTRADO' }, cee: {} };
    r = await subeDirecto();
    ok(r.success && subidas.join('|') === 'xml' && !llamadasPdf, 'CEE directo REGISTRADO → no se toca el PDF');

    console.log(`\n${total - fallos}/${total} bien${fallos ? ` · ${fallos} MAL` : ''}`);
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
