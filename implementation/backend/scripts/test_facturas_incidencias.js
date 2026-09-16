/**
 * Las dos reglas de las que depende que una incidencia de factura llegue a existir.
 * Sin BD, sin Drive y sin llamar a Gemini.
 *
 *   node implementation/backend/scripts/test_facturas_incidencias.js
 *
 * 1) SOLTAR DOS FACTURAS = DOS FACTURAS. `normalizeToPdf` se queda con el primer
 *    PDF (`files.find(isPdf)`), así que la segunda no se leía, no se subía a Drive
 *    y no dejaba rastro: desaparecía en silencio.
 *
 * 2) EL PUT NO BORRA LAS INCIDENCIAS. La vista del expediente reenvía
 *    `documentacion` entera desde la copia hidratada al abrirla; las incidencias
 *    registradas después (las de la factura que se acaba de subir) no están en esa
 *    copia, y un spread a secas las borraba. El aviso decía "3 incidencia(s)
 *    registrada(s)" y en el panel no había ninguna.
 */
const { agruparDocumentosFactura } = require('../utils/agruparFacturas');
const { mergeDocumentacion, CLAVES_PROTEGIDAS } = require('../utils/mergeDocumentacion');

let fallos = 0;
const ok = (cond, titulo, detalle = '') => {
    if (cond) { console.log(`  ✓ ${titulo}`); return; }
    fallos++;
    console.log(`  ✗ ${titulo}${detalle ? `\n      ${detalle}` : ''}`);
};

const pdf = (nombre) => ({ originalname: nombre, mimetype: 'application/pdf' });
const jpg = (nombre) => ({ originalname: nombre, mimetype: 'image/jpeg' });

console.log('\n1) Agrupado de lo que se suelta\n');

let g = agruparDocumentosFactura([pdf('202654.pdf'), pdf('202631.pdf')]);
ok(g.length === 2, 'DOS PDF sueltos son DOS facturas', `salieron ${g.length}`);
ok(g.every(x => x.length === 1), 'cada PDF va en su propio grupo');

g = agruparDocumentosFactura([pdf('unica.pdf')]);
ok(g.length === 1, 'UN PDF es UNA factura');

g = agruparDocumentosFactura([jpg('hoja1.jpg'), jpg('hoja2.jpg'), jpg('hoja3.jpg')]);
ok(g.length === 1 && g[0].length === 3,
    'varias FOTOS son páginas de UNA factura (no tres facturas)',
    `salieron ${g.length} grupo(s)`);

g = agruparDocumentosFactura([pdf('a.pdf'), jpg('b.jpg'), pdf('c.pdf'), jpg('d.jpg')]);
ok(g.length === 3, 'dos PDF + dos fotos son 3 facturas (los PDF sueltos y las fotos juntas)',
    `salieron ${g.length}`);
ok(g[2].length === 2, 'las fotos van al último grupo');

// Un fichero sin mimetype fiable (pasa con algunos navegadores) se reconoce por la
// extensión: si no, un PDF caería en el saco de las imágenes y se uniría a ellas.
g = agruparDocumentosFactura([{ originalname: 'FACTURA.PDF', mimetype: '' }, jpg('foto.jpg')]);
ok(g.length === 2, 'un PDF sin mimetype se reconoce por la extensión', `salieron ${g.length}`);

ok(agruparDocumentosFactura([]).length === 0, 'sin ficheros no hay grupos');
ok(agruparDocumentosFactura(null).length === 0, 'null no revienta');

console.log('\n2) El PUT del expediente no puede borrar incidencias\n');

ok(CLAVES_PROTEGIDAS.includes('incidencias'), '`incidencias` está en CLAVES_PROTEGIDAS');

// El caso real: se registran 3 incidencias de una factura y luego el módulo
// autoguarda (subir otra factura, tocar un campo, "Guardar Facturas") reenviando la
// copia que se hidrató al abrir la vista, donde solo había 1.
const enBd = {
    facturas: [{ numero_factura: '202654' }],
    incidencias: [
        { id: '1', texto: 'vieja', estado: 'ABIERTA' },
        { id: '2', texto: 'titular', estado: 'ABIERTA', ref: 'drive_a' },
        { id: '3', texto: 'fecha', estado: 'ABIERTA', ref: 'drive_a' },
        { id: '4', texto: 'alcance', estado: 'ABIERTA', ref: 'drive_b' },
    ],
};
const delNavegador = {
    facturas: [{ numero_factura: '202654' }, { numero_factura: '202631' }],
    incidencias: [{ id: '1', texto: 'vieja', estado: 'ABIERTA' }],   // la foto vieja
};

const m = mergeDocumentacion(enBd, delNavegador);
ok(m.incidencias.length === 4,
    'guardar facturas NO se lleva por delante las incidencias recién registradas',
    `quedaron ${m.incidencias.length} de 4`);
ok(m.incidencias.map(i => i.id).join(',') === '1,2,3,4', 'quedan las cuatro, en orden');
ok(m.facturas.length === 2, 'y la factura nueva sí se guarda');
ok(m.incidencias.filter(i => i.ref === 'drive_a').length === 2,
    'cada incidencia conserva de QUÉ factura es (`ref`)');

// Un expediente que nunca tuvo incidencias: lo que venga en el payload entra (no es
// destructivo) — así el MCP o una skill pueden sembrarlas la primera vez.
const m2 = mergeDocumentacion({ facturas: [] }, { incidencias: [{ id: 'x' }] });
ok(m2.incidencias?.length === 1, 'sin incidencias previas, las del payload entran');

// Y el resto de la fusión sigue funcionando igual.
const m3 = mergeDocumentacion({ cert_cifo_drive_link: 'viejo' }, { cert_cifo_drive_link: 'nuevo' });
ok(m3.cert_cifo_drive_link === 'nuevo' && !!m3.cert_cifo_drive_at,
    'lo que sí escribe el PUT se sigue actualizando y sellando');

console.log('\n3) El alta en LOTE no puede repetir ids\n');

// Las incidencias de una factura se registran juntas y `Date.now()` devuelve lo
// mismo para todas: el id es la clave con la que después se subsana o se borra, y
// con dos iguales se actuaría sobre la otra. Se replica aquí la fórmula de
// `nuevaIncidencia` (routes/expedientes.js) porque la ruta no se puede requerir
// sin levantar el servidor entero.
const ahora = Date.now();
const ids = [0, 1, 2, 3, 4, 5].map(i => `${ahora}_${i}_inc`);
ok(new Set(ids).size === ids.length, 'seis altas del mismo milisegundo dan seis ids distintos');

// Y la fórmula anterior (sin sufijo) los repetía: es lo que se está arreglando.
const idsViejos = [0, 1, 2].map(() => `${ahora}_inc`);
ok(new Set(idsViejos).size === 1, 'la fórmula anterior los repetía (por eso lleva sufijo)');

console.log('\n4) La factura anterior al CEE se mide contra la FIRMA, no contra el registro\n');

// El caso real (26RES080_59): factura del 09/07/2026 y CEE inicial REGISTRADO el
// 31/07. El registro es un tramite posterior a la firma del tecnico, asi que
// comparar contra el marcaba como GRAVE una factura emitida con el certificado ya
// en la mano. Y ahora es LEVE: la fecha de una factura no es la fecha de la obra
// -lo que declara la ejecucion es el CIFO, donde la comprobacion sigue siendo dura.
const { detectarIncidenciasFactura } = require('../services/facturaIncidencias');

const ocrFac = {
    numero_factura: 'T-260254', fecha_factura: '2026-07-09',
    totales: { base_imponible: 13490 },
    lineas: [{ partida: 'AEROTERMIA', descripcion: 'bomba de calor' }],
    emisor: {}, cliente: {},
};
const expBase = {
    numero_expediente: '26RES080_59', instalacion: {},
    documentacion: { fecha_registro_cee_inicial: '2026-07-31' },
};
const deFecha = (exp) => detectarIncidenciasFactura({ ocr: ocrFac, exp, op: {}, cliente: null, instalador: null })
    .filter(i => i.codigo === 'FECHA' && /CEE inicial/.test(i.titulo || ''));

// Firmado ANTES de la factura: el certificado ya existia, no hay nada que decir,
// aunque se registrara tres semanas despues.
ok(deFecha({ ...expBase, cee: { cee_inicial: { fechaFirma: '2026-06-30' } } }).length === 0,
    'firmado el 30/06 y registrado el 31/07: una factura del 09/07 NO es incidencia');

// La firma tambien se lee del campo de la rejilla y del espejo de `documentacion`.
ok(deFecha({ ...expBase, cee: { fecha_firma_cee_inicial: '2026-06-30' } }).length === 0,
    'la firma se lee de cee.fecha_firma_cee_inicial');
ok(deFecha({ ...expBase, documentacion: { ...expBase.documentacion, fecha_firma_cee_inicial: '2026-06-30' } }).length === 0,
    'la firma se lee del espejo de documentacion');

// Firmado DESPUES de la factura: eso si hay que mirarlo, pero como LEVE.
const anterior = deFecha({ ...expBase, cee: { cee_inicial: { fechaFirma: '2026-07-20' } } });
ok(anterior.length === 1 && anterior[0].severidad === 'LEVE',
    'factura anterior a la FIRMA: sale, y sale LEVE',
    `salieron ${anterior.length} con severidad ${anterior[0]?.severidad}`);
ok(/firmado el 20\/07\/2026/.test(anterior[0]?.texto || ''),
    'el texto cita la fecha de FIRMA, no la de registro', anterior[0]?.texto);

// Sin fecha de firma no hay otra referencia que el registro: se avisa igual, pero
// diciendo contra que se compara y como dejarlo resuelto.
const sinFirma = deFecha(expBase);
ok(sinFirma.length === 1 && sinFirma[0].severidad === 'LEVE',
    'sin fecha de firma se avisa contra el registro, tambien LEVE');
ok(/no consta la fecha de FIRMA/i.test(sinFirma[0]?.texto || ''),
    'y se dice que lo que falta es la fecha de firma');

// Sin ninguna de las dos fechas no se afirma nada.
ok(deFecha({ numero_expediente: '26RES080_59', instalacion: {}, documentacion: {} }).length === 0,
    'sin CEE inicial no se inventa la comparacion');


console.log('\n5) En un RES080 la obra la ejecutan VARIOS gremios\n');

// La bomba de calor la pone el instalador y las ventanas el carpintero: que la
// factura de la envolvente la emita otra empresa es lo normal. Marcarlo en GRAVE
// sacaba un aviso rojo en casi todas las facturas de envolvente de todos los
// RES080. En las fichas de sustitucion no hay tal reparto: la actuacion ES la
// bomba de calor, asi que ahi cualquier factura del expediente tiene que ser suya.
const instalExp = { razon_social: 'INSTOTERMA SL', cif: 'B45587151' };
const otraEmpresa = { nombre: 'TALLERES GALLEGO BECERRA C.B', nif: 'E13563895' };

const emisoresDe = (numeroExpediente, partidas) => detectarIncidenciasFactura({
    ocr: {
        numero_factura: '26/000391', fecha_factura: '2026-08-01',
        totales: { base_imponible: 553.53 },
        lineas: partidas.map(p => ({ partida: p, descripcion: p.toLowerCase() })),
        emisor: otraEmpresa, cliente: {},
    },
    exp: { numero_expediente: numeroExpediente, instalacion: {}, documentacion: {} },
    op: {}, cliente: null, instalador: instalExp,
}).filter(i => i.codigo === 'EMISOR');

ok(emisoresDe('26RES080_59', ['VENTANAS']).length === 0,
    'RES080: la factura de ventanas de otra empresa NO es incidencia');
ok(emisoresDe('26RES080_59', ['CUBIERTA', 'OBRA_CIVIL']).length === 0,
    'RES080: tampoco la de cubierta y obra civil');
ok(emisoresDe('26RES080_59', ['AEROTERMIA']).length === 1,
    'RES080: la de la BOMBA DE CALOR si, porque quien la instala firma el certificado');
ok(emisoresDe('26RES080_59', ['VENTANAS', 'AEROTERMIA']).length === 1,
    'RES080: una factura mixta con la termica dentro tambien salta');
ok(emisoresDe('26RES080_59', ['ACS']).length === 1,
    'RES080: el ACS cuenta como instalacion termica');
ok(emisoresDe('26RES060_10', ['VENTANAS']).length === 1,
    'RES060: cualquier factura de otra empresa sigue siendo incidencia');
ok(emisoresDe('26RES093_1', ['OBRA_CIVIL']).length === 1,
    'RES093: idem');


console.log(fallos ? `\n${fallos} comprobación(es) FALLA(N)\n` : '\nTodo correcto.\n');
process.exit(fallos ? 1 : 0);
