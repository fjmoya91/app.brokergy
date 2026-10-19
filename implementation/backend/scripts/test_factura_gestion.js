// Prueba de punta a punta de la FACTURA DE GESTIÓN CAE (fase 7 del lote) contra una
// COPIA del libro de facturas. Lee un expediente REAL (solo lectura) y NO escribe en
// la BD: el sello de `documentacion.cobro` se queda en memoria. Ni WhatsApp ni email.
// Uso: node scripts/test_factura_gestion.js [nº expediente, por defecto 25RES060_26]
const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '..');
process.chdir(B);
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env'), quiet: true });
const { google } = require(path.join(B, 'node_modules/googleapis'));

const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const REAL = '1MaVmhOcjwPJZy4EavdlYwbXZ5t89FhBPTT4WIfU2z2k';
const NUM = process.argv[2] || '25RES060_26';

const ok = (c, m) => { if (!c) throw new Error('FALLO: ' + m); console.log('  ✓ ' + m); };

(async () => {
    let copiaId, carpetaId;
    try {
        console.log('0 · Copia de la hoja y carpeta de prueba');
        const tmp = await drive.files.create({ requestBody: { name: 'ZZ PRUEBA FACTURA GESTION (borrar)', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
        carpetaId = tmp.data.id;
        const cp = await drive.files.copy({ fileId: REAL, requestBody: { name: 'ZZ COPIA APP PPTO Y FACTURAS (borrar)', parents: [carpetaId] }, fields: 'id' });
        copiaId = cp.data.id;
        process.env.APPSHEET_FACTURAS_SHEET_ID = copiaId;
        process.env.APPSHEET_FACTURAS_FOLDER_ID = carpetaId;
        // Contabilidad, a la carpeta de prueba (se lee al cargar facturaContabilidad).
        process.env.CONTABILIDAD_FACTURAS_CAE_FOLDER_ID = carpetaId;

        const enviados = [];
        const stub = (file, mod) => { const p = require.resolve(path.join(B, file)); require.cache[p] = { id: p, filename: p, loaded: true, exports: mod }; };
        stub('services/whatsappService.js', { sendMedia: async (to, media, o) => { enviados.push({ canal: 'wa', to, filename: media.filename, caption: o.caption }); }, sendText: async () => {} });
        stub('services/emailService.js', { sendDocumentEmail: async (o) => { enviados.push({ canal: 'email', to: o.to }); }, sendMail: async () => {} });

        const supabase = require(path.join(B, 'services/supabaseClient'));
        const cobroService = require(path.join(B, 'services/cobroService'));
        // El sello, EN MEMORIA: nada se escribe en el expediente real.
        const { data: e0 } = await supabase.from('expedientes').select('id').eq('numero_expediente', NUM).maybeSingle();
        const base = await cobroService.cargarExpediente(e0.id);
        // La carpeta del expediente, también la de prueba: la real no se toca.
        base.oportunidades = { ...(base.oportunidades || {}), datos_calculo: { drive_folder_id: carpetaId } };
        let cobro = { ...(base.documentacion?.cobro || {}), factura_gestion: undefined, remesa: undefined, gestion_bonificada: undefined };
        const exp = () => ({ ...base, documentacion: { ...base.documentacion, cobro } });
        cobroService.sellar = async (_id, patch) => { cobro = { ...cobro, ...patch }; };
        cobroService.cargarExpediente = async () => exp();

        const fg = require(path.join(B, 'services/facturaGestionCae'));
        const pago = require(path.join(B, 'services/pagoClientesService'));

        console.log(`1 · Borrador de ${NUM}`);
        const b = await fg.borrador(exp());
        ok(!b.errorHoja, 'lee la copia del libro');
        ok(!b.bloqueo, 'se puede emitir');
        ok(b.lineas[0]?.articulo_id === '529a035b', 'artículo del catálogo: Gestión técnica y administrativa ayuda BONO ENERGÉTICO CAE');
        ok(b.total === 302.5 && b.neto === 250, '250,00 € + 21 % = 302,50 €');
        ok(!!b.destinatarios.cliente && !!b.destinatarios.instalador, 'ofrece cliente e instalador');

        console.log('2 · Emitir al INSTALADOR y enviar');
        const r = await fg.emitir(exp(), {
            destino: 'instalador', fecha: '2026-10-19',
            enviar: undefined,
        });
        ok(/^\d{2}ING_\d+$/.test(r.numero) && r.numero === b.proximoNumero, `número de la serie: ${r.numero}`);
        ok(!!r.pdf?.driveId, 'PDF guardado en la carpeta (de prueba)');
        ok(r.pdf.contabilidad?.ruta === 'FACTURAS VENTAS / 2026 / 10. OCTUBRE' && !!r.pdf.contabilidad.id,
            `copia en contabilidad: ${r.pdf.contabilidad?.ruta || r.pdf.contabilidad?.error} · ${r.pdf.contabilidad?.nombre}`);
        ok(!!r.pdf.expediente?.id, `copia en «5. FACTURAS» del expediente: ${r.pdf.expediente?.nombre || r.pdf.expediente?.error}`);
        const enDrive = async (id) => (await drive.files.get({ fileId: id, fields: 'parents, trashed' })).data;
        const cont = await enDrive(r.pdf.contabilidad.id);
        const mes = await enDrive(cont.parents[0]);
        const anio = await enDrive(mes.parents[0]);
        ok(anio.parents[0] === carpetaId, 'contabilidad colgada de la carpeta de prueba (año / mes)');
        fs.writeFileSync(path.join(process.env.TEMP || '.', `factura_gestion_prueba.pdf`), r.pdf.buffer);
        ok(cobro.factura_gestion?.numero === r.numero && cobro.factura_gestion.destino === 'instalador', 'registro en cobro.factura_gestion');
        ok(cobro.respuestas?.forma_pago === 'factura', 'fija la forma de pago en «factura» (la remesa no descuenta)');

        const fac = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'FACTURAS'!A:P" })).data.values;
        const filaF = fac.find(x => x[0] === cobro.factura_gestion.sheet_id);
        ok(filaF && filaF[1] === r.numero && filaF[2] === NUM, 'fila en FACTURAS con nº y expediente');
        const det = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'DETALLE FACTURA'!A:L", valueRenderOption: 'UNFORMATTED_VALUE' })).data.values;
        const filaD = det.find(x => x[1] === cobro.factura_gestion.sheet_id);
        ok(filaD && filaD[2] === '529a035b' && Number(filaD[4]) === 250, 'línea en DETALLE FACTURA con el artículo y 250 €');

        const env = await fg.enviar(exp(), { canales: ['whatsapp'], tlf: '600000000', mensaje: '' });
        ok(env.canalesOk.includes('whatsapp') && enviados[0]?.caption.includes(r.numero), 'envío por WhatsApp con el nº en el texto');
        ok(!/\d{2}RES\d{3}_\d+/.test(enviados[0].caption), 'al instalador no se le da el nº de expediente');
        console.log('\n----- mensaje -----\n' + enviados[0].caption + '\n-------------------');

        console.log('3 · Segunda emisión');
        let otra = null;
        try { await fg.emitir(exp(), { destino: 'cliente' }); } catch (e) { otra = e; }
        ok(otra?.status === 409, 'no se emite otra (409)');

        console.log('4 · Cobro y remesa');
        cobro = { ...cobro, completado_at: new Date().toISOString() };
        let p = await pago.pagoDeExpediente(exp());
        ok(!p.incluible && /factura/i.test(p.motivo || ''), 'sin cobrar la factura, fuera de la remesa');
        await fg.marcarPagada(exp(), true);
        const est = (await sheets.spreadsheets.values.get({ spreadsheetId: copiaId, range: "'FACTURAS'!A:P" })).data.values.find(x => x[0] === cobro.factura_gestion.sheet_id);
        ok(est[8] === 'PAGADA' && !!est[9], 'PAGADA y fecha de pago en la hoja');
        p = await pago.pagoDeExpediente(exp());
        ok(p.incluible && p.descuento === 0 && p.importe === p.bono, `entra en la remesa con la ayuda ÍNTEGRA (${p.importe} €)`);

        console.log('\n✅ Todo bien');
    } catch (e) {
        console.error('\n❌', e.message);
        process.exitCode = 1;
    } finally {
        for (const id of [copiaId, carpetaId].filter(Boolean)) {
            try { await drive.files.update({ fileId: id, requestBody: { trashed: true } }); } catch { /* */ }
        }
        console.log('(copia y carpeta de prueba a la papelera)');
        process.exit();
    }
})();
