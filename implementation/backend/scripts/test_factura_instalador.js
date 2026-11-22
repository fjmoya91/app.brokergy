// Test de la FACTURA hecha en la app en la plantilla del instalador
// (services/facturaInstaladorService.js). Sin red: Supabase, Drive y la subida
// van con dobles, así que no escribe nada en ningún sitio.
//   node implementation/backend/scripts/test_factura_instalador.js
const path = require('path');
const assert = require('assert');

const svcPath = path.join(__dirname, '../services/facturaInstaladorService.js');
const llamadas = [];
const doble = (rel, exp) => { require.cache[require.resolve(path.join(__dirname, '..', rel))] = { exports: exp, loaded: true }; };

const SLOT = [{ driveId: 'VIEJA' }, { driveId: 'OTRA' }, { driveId: 'NUEVA' }];
doble('services/supabaseClient.js', {
    // La 2.ª lectura (tras subir la nueva) pide solo el apartado, con alias `slot`.
    from: () => ({ select: (cols) => ({ eq: () => ({ maybeSingle: async () => ({ data: /slot:/.test(cols) ? { slot: SLOT } : { id: 'OP', id_oportunidad: 'X', datos_calculo: { reforma_uploads: { DOC_FACTURAS: SLOT.slice(0, 2) } } } }) }) }) }),
    rpc: async (n, a) => { llamadas.push([n, a]); return { error: null }; },
});
doble('services/driveService.js', { deleteFile: async (id) => llamadas.push(['deleteFile', id]) });
doble('services/reformaUploadService.js', {
    checklistForOportunidad: async () => [{ key: 'DOC_FACTURAS', label: 'Facturas', multiple: true }],
    removeFacturaFromExpediente: async (u, id) => llamadas.push(['removeFactura', id]),
    subirFicherosASlot: async (o) => { llamadas.push(['subir', o.slotDef.key, o.archivos[0].originalname, o.subidoPor]); return { subidas: [{ link: 'L', driveId: 'NUEVA' }], fallidas: [] }; },
    addFacturaToExpediente: async (u, l, id) => llamadas.push(['addFactura', id]),
});
doble('services/uploadNotifier.js', { registrarSubida: (o) => llamadas.push(['aviso', o.subidoPor]) });
doble('services/facturaIncidencias.js', { desgloseFactura: ({ ocr }) => [...new Set(ocr.lineas.map(l => l.partida))].map(p => ({ partida: p, importe: ocr.lineas.filter(l => l.partida === p).reduce((s, l) => s + l.importe_total, 0), computa: true })) });

const svc = require(svcPath);
let ok = 0;
const t = (n, f) => Promise.resolve(f()).then(() => { ok++; console.log('✓', n); });

const L = [{ texto: 'BOMBA', partida: 'AEROTERMIA' }, { texto: 'INTERACUMULADOR', partida: 'ACS' }, { texto: 'DESMONTAJE', partida: 'OBRA_CIVIL' }];
const cfg = { iva_pct: 21, fecha: { formato: 'largo' } };

(async () => {
    await t('importes en español: «6.000» son miles, «300,50» decimales, «6000.5» decimal', () => {
        const { calculo, errores } = svc.calcular({ numero: '44/26', fecha: '2026-11-16', partidas: [{ precio: '6.000' }, { cantidad: '2', precio: '300,50' }, { precio: '' }] }, { lineas: L, cfg, fechaMinima: '2026-11-12', hoy: '2026-11-17' });
        assert.deepStrictEqual(errores, []);
        assert.deepStrictEqual(calculo.lineas.map(l => l.importe), [6000, 601, 0]);
        assert.strictEqual(calculo.base, 6601);
        assert.strictEqual(calculo.fechaTxt, '16 de noviembre de 2026');
        assert.strictEqual(svc.calcular({ numero: '1', fecha: '2026-11-16', partidas: [{ precio: '6000.5' }] }, { lineas: L, cfg, hoy: '2026-11-17' }).calculo.base, 6000.5);
    });
    await t('el IVA redondea como la página (7.100,50 → 1.491,11)', () => {
        const { calculo } = svc.calcular({ numero: '1', fecha: '2026-11-16', partidas: [{ precio: 7100.5 }] }, { lineas: L, cfg, hoy: '2026-11-17' });
        assert.strictEqual(calculo.iva, 1491.11);
        assert.strictEqual(calculo.total, 8591.61);
    });
    await t('fecha: posterior al registro del CEE inicial y no futura; nº y precio de la bomba obligatorios', () => {
        const e = svc.calcular({ numero: '', fecha: '2026-11-12', partidas: [{}, { precio: 50 }] }, { lineas: L, cfg, fechaMinima: '2026-11-12', hoy: '2026-11-17' }).errores.join(' | ');
        assert.match(e, /número/); assert.match(e, /posterior al 12\/11\/2026/); assert.match(e, /bomba de calor/);
        assert.match(svc.calcular({ numero: '1', fecha: '2026-11-20', partidas: [{ precio: 1 }] }, { lineas: L, cfg, hoy: '2026-11-17' }).errores.join(), /posterior a hoy/);
    });
    await t('partida de cada línea del consejo', () => {
        assert.strictEqual(svc.partidaDe('Suministro … bomba de calor … ACS', 0), 'AEROTERMIA');
        assert.strictEqual(svc.partidaDe('Suministro e instalación de interacumulador de ACS', 1), 'ACS');
        assert.strictEqual(svc.partidaDe('Desmontaje y retirada de la caldera existente.', 2), 'OBRA_CIVIL');
    });
    await t('REFORMA (RES080): lo de la envolvente que añade va a su partida; en una sustitución, no', () => {
        const R = { reforma: true };
        assert.strictEqual(svc.partidaDe('Sustitución de ventanas por carpintería de PVC', 3, R), 'VENTANAS');
        assert.strictEqual(svc.partidaDe('Aislamiento de la cubierta con lana mineral', 3, R), 'CUBIERTA');
        assert.strictEqual(svc.partidaDe('Aislamiento de fachada por el exterior (SATE)', 3, R), 'FACHADA');
        assert.strictEqual(svc.partidaDe('Instalación fotovoltaica de 4 kWp', 3, R), 'FOTOVOLTAICA');
        assert.strictEqual(svc.partidaDe('Soporte de la unidad exterior en fachada', 3), 'OBRA_CIVIL');
        const { calculo, errores } = svc.calcular(
            { numero: '7/26', fecha: '2026-11-16', conceptos: ['BOMBA', 'DESMONTAJE', 'Sustitución de ventanas de PVC'], partidas: [{ precio: 9000 }, { precio: 300 }, { precio: 4000 }] },
            { lineas: [L[0], L[2]], cfg, hoy: '2026-11-17', reforma: true });
        assert.deepStrictEqual(errores, []);
        assert.deepStrictEqual(calculo.lineas.map(l => l.partida), ['AEROTERMIA', 'OBRA_CIVIL', 'VENTANAS']);
    });
    const ctx = {
        exp: { id: 'E', numero_expediente: '26RES060_999', oportunidad_id: 'OP', instalacion: {}, documentacion: {} },
        op: { ficha: 'RES060', inputs: {} }, instalador: { razon_social: 'INSTALADOR', cif: 'B00000000' },
        generada: { drive_id: 'VIEJA', validada: false },
    };
    const { calculo } = svc.calcular({ numero: '44/26', fecha: '2026-11-16', partidas: [{ precio: 6000 }, { precio: 800 }, { precio: 150 }] }, { lineas: L, cfg, hoy: '2026-11-17' });
    await t('la fila lleva lo mismo que rellena el OCR, con origen «generada» y sin revisión de OCR', () => {
        const p = svc.patchFila(calculo, ctx);
        assert.strictEqual(p.numero_factura, '44/26'); assert.strictEqual(p.fecha_factura, '2026-11-16');
        assert.strictEqual(p.importe_sin_iva, 6950); assert.strictEqual(p.importe_con_iva, 8409.5); assert.strictEqual(p.iva_pct, 21);
        assert.strictEqual(p.emisor_nombre, 'INSTALADOR'); assert.strictEqual(p.emisor_nif, 'B00000000');
        assert.deepStrictEqual(p.partidas, ['AEROTERMIA', 'ACS', 'OBRA_CIVIL']);
        assert.strictEqual(p.desglose.length, 3);
        assert.strictEqual(p.origen, 'generada'); assert.strictEqual(p.ocr_pendiente_revision, false);
        assert.strictEqual(p.generada.partidas.length, 3);
    });
    await t('en seco no llama a nada', async () => {
        llamadas.length = 0;
        const r = await svc.guardarFactura({ ctx, calculo, buffer: Buffer.from('%PDF'), escribir: false });
        assert.strictEqual(r.enSeco, true); assert.strictEqual(r.fileName, '26RES060_999 - Factura 44-26.pdf');
        assert.strictEqual(llamadas.length, 0);
    });
    await t('al guardar: sube a DOC_FACTURAS como el instalador, crea y rellena la fila, y DESPUÉS retira la anterior; avisa', async () => {
        llamadas.length = 0;
        await svc.guardarFactura({ ctx, calculo, buffer: Buffer.from('%PDF') });
        const nombres = llamadas.map(l => l[0]);
        assert.deepStrictEqual(nombres, ['subir', 'addFactura', 'update_expediente_factura_by_driveid', 'deleteFile', 'reforma_replace_slot', 'removeFactura', 'aviso']);
        assert.deepStrictEqual(llamadas[0].slice(1), ['DOC_FACTURAS', '26RES060_999 - Factura 44-26.pdf', 'instalador']);
        assert.strictEqual(llamadas[2][1].p_drive_id, 'NUEVA');
        assert.deepStrictEqual(llamadas[4][1].p_array, [{ driveId: 'OTRA' }, { driveId: 'NUEVA' }], 'el apartado conserva la nueva');
        assert.strictEqual(llamadas[6][1], 'instalador');
    });
    await t('una anterior VALIDADA también se sustituye (puede tener errores) y la nueva vuelve a revisión', async () => {
        llamadas.length = 0;
        const r = await svc.guardarFactura({ ctx: { ...ctx, generada: { drive_id: 'VIEJA', validada: true, numero_factura: '40/26' } }, calculo, buffer: Buffer.from('%PDF') });
        assert.ok(llamadas.some(l => l[0] === 'deleteFile' && l[1] === 'VIEJA'));
        assert.strictEqual(r.patch.validada, undefined);
        assert.deepStrictEqual(r.sustituye.map(f => [f.numero, f.validada]), [['40/26', true]]);
    });
    await t('sustituye a una factura SUBIDA solo si se elige (por su referencia, nunca por su enlace)', async () => {
        const subida = { drive_id: 'OTRA', numero_factura: '44/26', origen: 'popup+ocr' };
        const c2 = { ...ctx, generada: null, subidas: [subida] };
        llamadas.length = 0;
        await svc.guardarFactura({ ctx: c2, calculo, buffer: Buffer.from('%PDF') });
        assert.ok(!llamadas.some(l => l[0] === 'deleteFile'), 'sin elegirla, no se toca');
        llamadas.length = 0;
        const r = await svc.guardarFactura({ ctx: c2, calculo, buffer: Buffer.from('%PDF'), sustituir: svc.refFactura(subida) });
        assert.deepStrictEqual(llamadas.filter(l => l[0] === 'deleteFile').map(l => l[1]), ['OTRA']);
        assert.deepStrictEqual(r.patch.generada.sustituye.map(f => f.numero), ['44/26']);
        assert.strictEqual(svc.refFactura(subida).length, 12);
        assert.ok(!svc.refFactura(subida).includes('OTRA'));
    });
    await t('PRECIO TOTAL: va en la 1.ª línea con cantidad 1, el resto sin importe; sin total, error', () => {
        const { calculo: c, errores } = svc.calcular({ numero: '38', fecha: '2026-11-16', modo: 'total', total: '16.836', partidas: [{ precio: 5 }] }, { lineas: L, cfg, hoy: '2026-11-17' });
        assert.deepStrictEqual(errores, []);
        assert.deepStrictEqual(c.lineas.map(l => [l.cantidad, l.importe]), [[1, 16836], [null, 0], [null, 0]]);
        assert.strictEqual(c.base, 16836); assert.strictEqual(c.total, 20371.56); assert.strictEqual(c.modo, 'total');
        assert.match(svc.calcular({ numero: '38', fecha: '2026-11-16', modo: 'total', total: '' }, { lineas: L, cfg, hoy: '2026-11-17' }).errores.join(), /precio total/);
        assert.strictEqual(svc.patchFila(c, ctx).generada.modo, 'total');
    });
    await t('CONCEPTOS editados: la partida sigue a su sitio, una vacía se quita (los precios siguen a su línea), las añadidas por su texto', () => {
        const { calculo: c, errores } = svc.calcular({
            numero: '38', fecha: '2026-11-16',
            conceptos: ['BOMBA CORREGIDA', '', 'DESMONTAJE', 'SUMINISTRO DE RADIADORES NUEVOS'],
            partidas: [{ precio: 100 }, { precio: 999 }, { precio: 30 }, { precio: 7 }],
        }, { lineas: L, cfg, hoy: '2026-11-17' });
        assert.deepStrictEqual(errores, []);
        assert.deepStrictEqual(c.lineas.map(l => [l.texto, l.partida, l.importe]), [
            ['BOMBA CORREGIDA', 'AEROTERMIA', 100], ['DESMONTAJE', 'OBRA_CIVIL', 30], ['SUMINISTRO DE RADIADORES NUEVOS', 'EMISORES', 7]]);
        assert.strictEqual(c.conceptosCambiados, true);
        assert.deepStrictEqual(svc.patchFila(c, ctx).generada.conceptos, ['BOMBA CORREGIDA', 'DESMONTAJE', 'SUMINISTRO DE RADIADORES NUEVOS']);
        assert.match(svc.calcular({ numero: '1', fecha: '2026-11-16', conceptos: ['  '], partidas: [{ precio: 1 }] }, { lineas: L, cfg, hoy: '2026-11-17' }).errores.join(), /primera línea/);
        assert.match(svc.calcular({ numero: '1', fecha: '2026-11-16', conceptos: ['X'.repeat(701)], partidas: [{ precio: 1 }] }, { lineas: L, cfg, hoy: '2026-11-17' }).errores.join(), /demasiado largo/);
        const igual = svc.calcular({ numero: '1', fecha: '2026-11-16', conceptos: L.map(l => l.texto), partidas: [{ precio: 1 }] }, { lineas: L, cfg, hoy: '2026-11-17' }).calculo;
        assert.strictEqual(igual.conceptosCambiados, false);
        assert.strictEqual(svc.patchFila(igual, ctx).generada.conceptos, undefined);
    });
    // ── El Word con TABLA (plantilla de RCA del 18/11/2026), sobre un XML mínimo ──
    await t('Word con tabla: cliente en todos sus cuadros, una fila por línea + la del inmueble, importes en blanco', async () => {
        const { rellenarDocumentoTabla } = require('../services/facturaWordService');
        const run = (t) => `<w:r><w:rPr><w:b/></w:rPr><w:t>${t}</w:t></w:r>`;
        const p = (t) => `<w:p>${t ? run(t) : ''}</w:p>`;
        const cliente = (et) => p(et) + p('ANTERIOR NOMBRE') + p('CALLE VIEJA 1') + p('00000 PUEBLO') + p('NIF: 0000');
        const celda = (t, borde = '<w:bottom w:val="single" w:sz="10"/>') => `<w:tc><w:tcPr><w:tcBorders>${borde}</w:tcBorders></w:tcPr>${p(t)}</w:tc>`;
        const fila = (cs, alto = '') => `<w:tr>${alto}${cs.join('')}</w:tr>`;
        const xml = '<w:body>'
            + `<w:txbxContent>${p('FACTURA')}${p('Número: ')}${p('Fecha: ')}</w:txbxContent>`
            + `<w:txbxContent>${cliente('Cliente:')}${cliente('liente:')}</w:txbxContent>`
            + '<w:tbl>' + fila(['CANTIDAD', 'CONCEPTO', 'PRECIO', 'IMPORTE', ''].map(x => celda(x)), '<w:trPr><w:tblHeader/></w:trPr>')
            + fila(['', '', '', '', ''].map(x => celda(x)), '<w:trPr><w:trHeight w:val="8800"/></w:trPr>') + '</w:tbl>'
            + '<w:tbl>' + fila(['Importe factura', 'I.V.A.', 'TOTAL FACTURA'].map(x => celda(x))) + '</w:tbl></w:body>';
        const { xml: out, cambios } = rellenarDocumentoTabla(xml, {
            clienteNombre: 'Ana Pérez', clienteDomicilio: 'CL MAYOR 1\n13000 Ciudad Real\nNIF: 00000000T',
            concepto: ['BOMBA DE CALOR', 'DESMONTAJE'], inmueble: 'CL MAYOR 1', refCatastral: 'RC1', observaciones: 'Observaciones: IRPF',
        });
        assert.deepStrictEqual([cambios.cliente, cambios.numero, cambios.fecha, cambios.tabla, cambios.filas], [2, 1, 1, 1, 3]);
        assert.ok(!out.includes('ANTERIOR NOMBRE') && !out.includes('CALLE VIEJA'), 'el cliente de la plantilla no queda ni oculto');
        assert.strictEqual(out.split('Ana Pérez').length - 1, 2);
        for (const s of ['BOMBA DE CALOR', 'DESMONTAJE', 'INMUEBLE: CL MAYOR 1', 'REF. CATASTRAL: RC1', 'Observaciones: IRPF']) assert.ok(out.includes(s), s);
        const lineas = out.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)[0].match(/<w:tr>[\s\S]*?<\/w:tr>/g);
        assert.strictEqual(lineas.length, 4); // cabecera + 2 líneas + inmueble
        assert.ok(!/single/.test(lineas[1]) && /single/.test(lineas[3]), 'solo la última fila cierra el cuadro');
        // La fila de cuerpo de la plantilla tiene ALTO MÍNIMO (llena la hoja): las de concepto
        // van sin alto y la última se queda con lo que falta hasta él.
        assert.ok(!/trHeight/.test(lineas[1]) && !/trHeight/.test(lineas[2]), 'las líneas, sin alto');
        const resto = Number(lineas[3].match(/trHeight w:val="(\d+)"/)[1]);
        assert.ok(resto > 7000 && resto < 8800, `la última, el resto hasta 8800 (${resto})`);
        assert.ok(out.includes('Importe factura') && !/\d,\d{2}/.test(out), 'los importes, en blanco');
    });
    console.log(`\n${ok} comprobaciones OK`);
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
