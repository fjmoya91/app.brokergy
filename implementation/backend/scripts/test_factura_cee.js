// Prueba de punta a punta de la FACTURA contra una COPIA de la hoja.
// Nada toca el libro de facturas real ni la BD: el expediente es de mentira.
const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '..');
process.chdir(B);
// Uso: node scripts/test_factura_cee.js — hace una COPIA de la hoja de facturas,
// emite contra ella y la manda a la papelera. El libro real no se toca.
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env'), quiet: true });
const { google } = require(path.join(B, 'node_modules/googleapis'));

const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const REAL = '1MaVmhOcjwPJZy4EavdlYwbXZ5t89FhBPTT4WIfU2z2k';

const ok = (c, m) => { if (!c) throw new Error('FALLO: ' + m); console.log('  ✓ ' + m); };

(async () => {
    let copiaId, carpetaId;
    try {
        console.log('0 · Copia de la hoja y carpeta de prueba');
        const tmp = await drive.files.create({ requestBody: { name: 'ZZ PRUEBA FACTURA (borrar)', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
        carpetaId = tmp.data.id;
        const cp = await drive.files.copy({ fileId: REAL, requestBody: { name: 'ZZ COPIA APP PPTO Y FACTURAS (borrar)', parents: [carpetaId] }, fields: 'id' });
        copiaId = cp.data.id;
        process.env.APPSHEET_FACTURAS_SHEET_ID = copiaId;
        process.env.APPSHEET_FACTURAS_FOLDER_ID = carpetaId;
        console.log('   copia', copiaId);

        const enviados = [];
        const stub = (file, mod) => { const p = require.resolve(path.join(B, file)); require.cache[p] = { id: p, filename: p, loaded: true, exports: mod }; };
        stub('services/whatsappService.js', { sendMedia: async (to, media, o) => { enviados.push({ canal: 'wa', to, filename: media.filename, caption: o.caption }); }, sendText: async () => {} });
        stub('services/emailService.js', { sendDocumentEmail: async (o) => { enviados.push({ canal: 'email', to: o.to, subject: o.subject, adj: o.attachments.map(a => a.filename) }); } });
        const doc = {};
        const fila = {
            id: 'e2e', numero_expediente: '2026CEE_99', alcance: 'DOBLE', cobrado: false, drive_folder_id: null,
            documentacion: { oferta: { precio: 220, dto_pct: 0, tasa: 16.39, num_tasas: 2 } },
            cliente: { nombre_razon_social: 'PRUEBA', apellidos: 'E2E FACTURA', dni: '00000000T', direccion: 'CL DON SERGIO 12', codigo_postal: '13700', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', tlf: '600000000', email: 'prueba@example.com' },
            prescriptor: null,
        };
        stub('services/ceeDirectoService.js', {
            cargar: async () => ({ ...fila, documentacion: { ...fila.documentacion, facturas_emitidas: doc } }),
            mergeDoc: async (id, campo, v) => { Object.assign(doc, v); },
            anotarHistorial: async () => {},
            contactoCliente: (c) => ({ nombre: 'PRUEBA E2E', tlf: c.tlf, email: c.email }),
        });

        const hoja = require(path.join(B, 'services/facturaSheetService'));
        const svc = require(path.join(B, 'services/ceeFacturaService'));

        console.log('0b · Textos que la hoja tomaría por fórmula');
        const { texto, telefono } = hoja._internos;
        ok(telefono('+34 644 48 40 51') === '644484051', 'teléfono con +34 → 9 cifras (si no, #ERROR! en CLIENTES)');
        ok(texto('- nota') === "'- nota" && texto('Por políticas') === 'Por políticas', 'texto que empieza por - va literal; el resto intacto');

        console.log('1 · Borrador');
        const b = await svc.borrador('e2e');
        ok(!b.errorHoja, 'lee la hoja');
        ok(/^\d{2}ING_\d+$/.test(b.proximoNumero), `próximo número: ${b.proximoNumero}`);
        const [pref, nProx] = b.proximoNumero.split('_');
        const OCUPADO = b.proximoNumero, ESPERADO = `${pref}_${Number(nProx) + 1}`;
        ok(b.lineas.length === 2 && b.lineas[0].articulo_id === '1' && b.lineas[1].articulo_id === '7' && b.lineas[1].uds === 2, 'líneas por defecto: art. 1 (220) + art. 7 × 2');

        console.log(`2 · Simular que AppSheet se lleva el ${OCUPADO} entre medias (fila de otro)`);
        await sheets.spreadsheets.values.append({ spreadsheetId: copiaId, range: "'FACTURAS'!A1", valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [['zzzzzzzz', OCUPADO, 'OTRA APP']] } });

        console.log('3 · Emitir');
        const r = await svc.emitir('e2e', { destino: 'cliente', lineas: b.lineas, fecha: '2026-09-23', observaciones: b.observaciones });
        ok(r.numero === ESPERADO, `número reservado ${r.numero} (el ${OCUPADO} lo tenía otra fila)`);
        ok(r.total === 298.98, `total ${r.total}`);
        ok(!!r.pdf?.driveId && !r.errorPdf, `PDF: ${r.pdf?.nombre}`);
        ok(r.clienteCreadoEnHoja === true, 'cliente nuevo dado de alta en CLIENTES');

        console.log('4 · Lo escrito en la hoja, al lado de lo que escribe AppSheet');
        const F = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'FACTURAS'!A90:P200" })).data.values;
        const nuestra = F.find(x => x[1] === ESPERADO); const suya = F.find(x => x[1] === '26ING_75');
        console.log('   AppSheet:', JSON.stringify(suya)); console.log('   Nuestra :', JSON.stringify(nuestra));
        ok(nuestra[2] === '2026CEE_99' && nuestra[7] === '00000000T' && nuestra[8] === 'ENVIADA', 'expediente, NIF y estado');
        ok(nuestra[5] === '23/09/2026' && nuestra[6] === '23/10/2026', 'fecha y vencimiento (+30)');
        ok(nuestra[10] === '252,78' && nuestra[11] === '46,2' && nuestra[13] === '298,98', 'subtotal, IVA y total como números');
        ok(nuestra[15] === `/appsheet/data/APPPPTOYFACTURAS-92521152/FACTURAS/${ESPERADO} - PRUEBA E2E FACTURA.pdf`, 'ruta del PDF para AppSheet');
        const D = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'DETALLE FACTURA'!A175:L300" })).data.values;
        const lin = D.filter(x => x[1] === nuestra[0]);
        const suyas = D.filter(x => x[1] === suya[0]);
        console.log('   AppSheet:', JSON.stringify(suyas)); console.log('   Nuestras:', JSON.stringify(lin));
        ok(lin.length === 2, '2 líneas enlazadas por el id');
        ok(JSON.stringify(lin.map(x => x.slice(2))) === JSON.stringify([['1', '1', '220', '21%', '15%', '0%', '0', '220', '220', '46,2'], ['7', '2', '16,39', '0%', '15%', '0%', '0', '32,78', '32,78', '0']]),
            'líneas con la forma exacta de AppSheet (formato de la hoja incluido)');
        const C = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'CLIENTES'!A2:R" })).data.values;
        const cli = C.find(x => x[5] === '00000000T');
        ok(cli && cli[2] === 'PRUEBA E2E FACTURA' && cli[17] === 'TRANSFERENCIA', `ficha en CLIENTES: ${JSON.stringify(cli)}`);
        const pdfs = (await drive.files.list({ q: `'${carpetaId}' in parents and trashed=false and mimeType='application/pdf'`, fields: 'files(name)' })).data.files;
        ok(pdfs.some(p => p.name === `${ESPERADO} - PRUEBA E2E FACTURA.pdf`), 'PDF en la carpeta FACTURAS');

        console.log('5 · Segunda emisión sin confirmar → se para');
        let paro = null; try { await svc.emitir('e2e', { lineas: b.lineas, fecha: '2026-09-23' }); } catch (e) { paro = e; }
        ok(paro?.status === 409, `409: ${paro?.message}`);

        console.log('6 · Enviar');
        const e = await svc.enviar('e2e', ESPERADO, { canales: ['email', 'whatsapp'], email: 'prueba@example.com', tlf: '600000000' });
        ok(e.canalesOk.length === 2, 'sale por email y WhatsApp');
        const wa = enviados.find(x => x.canal === 'wa');
        ok(wa.filename === `${ESPERADO} - PRUEBA E2E FACTURA.pdf` && /298,98 €/.test(wa.caption) && /ES10 0182/.test(wa.caption), 'PDF + importe + IBAN');
        console.log('\n----- MENSAJE -----\n' + wa.caption + '\n-------------------');
        ok((await svc.pdfDe('e2e', ESPERADO)).buffer.length > 20000, 'el PDF archivado se vuelve a bajar');

        console.log('7 · Marcar cobrado → PAGADA en la hoja');
        await svc.sincronizarCobro('e2e', true, '2026-09-24T10:00:00Z');
        const F2 = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'FACTURAS'!A90:P200" })).data.values.find(x => x[1] === ESPERADO);
        ok(F2[8] === 'PAGADA' && F2[9] === '24/09/2026', `estado ${F2[8]}, pago ${F2[9]}`);

        console.log('\n✅ TODO CORRECTO');
    } catch (e) {
        console.error('\n✗', e.stack || e.message); process.exitCode = 1;
    } finally {
        if (carpetaId) { await drive.files.update({ fileId: carpetaId, requestBody: { trashed: true } }).catch(e => console.log('! limpieza', e.message)); console.log('\nCopia y carpeta de prueba a la PAPELERA'); }
        process.exit(process.exitCode || 0);
    }
})();
