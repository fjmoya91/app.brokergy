/**
 * Presupuestos con N PARTIDAS (pestaña Facturación): líneas desde el catálogo,
 * lo que arrastran, suplidos, totales, mensaje, PDF paginado y la factura que
 * hereda las partidas. Sin BD ni red.
 *
 *   node implementation/backend/scripts/test_presupuesto_partidas.mjs
 */
import assert from 'assert';
import * as L from '../../frontend/src/features/facturacion/logic/presupuesto.js';
import * as O from '../../frontend/src/features/cee-directo/logic/ofertaCee.js';
import * as F from '../../frontend/src/features/cee-directo/logic/facturaCee.js';

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

// Un trozo del catálogo, como lo deja sembrar_articulos.js.
const TASA = { id: 't1', appsheet_id: '7', nombre: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha', precio: 16.39, iva_pct: 0, suplido: true };
const CEE = { id: 'c1', appsheet_id: '2', nombre: 'Certificado de Eficiencia Energética, incluida su presentación en Industria', precio: 150, iva_pct: 21, genera: 'CEE_UNICO', arrastra: [{ articulo_id: 't1', uds: 1 }] };
const DOBLE = { id: 'c2', appsheet_id: '1', nombre: 'Certificado de Eficiencia Energética inicial y final, incluida su presentación en Industria', precio: 220, iva_pct: 21, genera: 'CEE_DOBLE', arrastra: [{ articulo_id: 't1', uds: 2 }] };
const FV = { id: 'f1', nombre: 'Legalización de instalación solar fotovoltaica', precio: 0, iva_pct: 21, variantes: [{ id: 'vivienda', nombre: 'Vivienda unifamiliar', precio: 350 }, { id: 'nave', nombre: 'Nave industrial', precio: 450 }] };
const CAT = [TASA, CEE, DOBLE, FV];

t('el CEE arrastra su tasa, colgada de él', () => {
    const ls = L.lineasDeArticulo(CEE, CAT);
    assert.equal(ls.length, 2);
    assert.equal(ls[1].arrastrada_de, ls[0].key);
    assert.equal(ls[1].suplido, true); assert.equal(ls[1].ivaPct, 0);
    assert.equal(ls[0].genera, 'CEE_UNICO'); assert.equal(ls[0].appsheet_id, '2');
});

t('sin arrastre, solo la suya; el doble trae DOS tasas', () => {
    assert.equal(L.lineasDeArticulo(CEE, CAT, { sinArrastre: true }).length, 1);
    assert.equal(L.lineasDeArticulo(DOBLE, CAT)[1].uds, 2);
});

t('la variante pone su precio y su nombre en el concepto', () => {
    const [l] = L.lineasDeArticulo(FV, CAT, { varianteId: 'nave' });
    assert.equal(l.precio, 450);
    assert.equal(l.descripcion, 'Legalización de instalación solar fotovoltaica — Nave industrial');
    assert.equal(L.varianteDe(FV, 'NAVE INDUSTRIAL').id, 'nave');   // por nombre, sin mayúsculas
});

t('el caso de Fran: CEE + tasa + legalización FV en nave = 742,39 €', () => {
    const ls = [...L.lineasDeArticulo(CEE, CAT), ...L.lineasDeArticulo(FV, CAT, { varianteId: 'nave' })];
    const r = L.totalesLineas(ls);
    assert.equal(r.neto, 616.39); assert.equal(r.iva, 126); assert.equal(r.total, 742.39);
    assert.equal(r.suplidos, 16.39);
    assert.equal(L.alcanceDeLineas(ls), 'UNICO');
});

t('un suplido no lleva IVA ni descuento aunque se lo pongan', () => {
    const c = L.calcularLinea({ precio: 16.39, uds: 2, dtoPct: 50, ivaPct: 21, suplido: true });
    assert.equal(c.iva, 0); assert.equal(c.descuento, 0); assert.equal(c.importe, 32.78);
});

t('el IVA se redondea POR LÍNEA (como AppSheet y la factura)', () => {
    // 3 × 0,35 € al 21 %: por línea 0,07 + 0,07 + 0,07 = 0,21; sobre la suma, 0,22.
    const r = L.totalesLineas([0, 1, 2].map(() => ({ descripcion: 'x', uds: 1, precio: 0.35, ivaPct: 21 })));
    assert.equal(r.iva, 0.21);
});

t('descuento: va a la base y se cuenta aparte', () => {
    const r = L.totalesLineas([{ descripcion: 'x', uds: 1, precio: 200, dtoPct: 10, ivaPct: 21 }]);
    assert.equal(r.descuento, 20); assert.equal(r.neto, 180); assert.equal(r.total, 217.8);
});

t('sin certificado no abre expediente', () => {
    assert.equal(L.alcanceDeLineas(L.lineasDeArticulo(FV, CAT, { varianteId: 'vivienda' })), null);
    assert.equal(L.alcanceDeLineas([...L.lineasDeArticulo(CEE, CAT), ...L.lineasDeArticulo(DOBLE, CAT)]), 'DOBLE');
});

t('saneado: tira las vacías, acota textos y el máximo de líneas, y no inventa genera', () => {
    const ls = L.sanearLineas([
        { descripcion: '  ', precio: 10 },
        { descripcion: 'a'.repeat(400), detalle: 'b'.repeat(800), precio: '12,5', uds: '2', genera: 'OTRA' },
        ...Array.from({ length: 70 }, (_, i) => ({ descripcion: `l${i}`, precio: 1 })),
    ]);
    assert.equal(ls.length, L.MAX_LINEAS);
    assert.equal(ls[0].descripcion.length, 300); assert.equal(ls[0].detalle.length, 600);
    assert.equal(ls[0].precio, 12.5); assert.equal(ls[0].uds, 2); assert.equal(ls[0].genera, null);
});

t('el buscador entiende sin tildes y pone primero lo que empieza así', () => {
    const r = L.buscarArticulos(CAT, 'legalizacion');
    assert.equal(r[0].id, 'f1');
    assert.ok(L.buscarArticulos(CAT, 'nave').some(a => a.id === 'f1'));   // por la variante
    assert.equal(L.buscarArticulos(CAT, 'certificado')[0].nombre.startsWith('Certificado'), true);
});

t('la oferta antigua (sin líneas) sigue dando lo mismo', () => {
    assert.equal(O.totalesOferta({ alcance: 'DOBLE' }).total, 298.98);
    assert.equal(O.tieneLineas({ alcance: 'UNICO' }), false);
});

t('con líneas, la plantilla usa las partidas (totales y concepto)', () => {
    const ls = [...L.lineasDeArticulo(CEE, CAT), ...L.lineasDeArticulo(FV, CAT, { varianteId: 'nave' })];
    const o = { lineas: ls };
    assert.equal(O.totalesOferta(o).total, 742.39);
    assert.equal(O.totalesOferta(o).tasas, 16.39);
    assert.match(O.conceptoOferta(o), /legalización de instalación solar fotovoltaica/i);
    // Solo certificados: la frase de siempre.
    assert.equal(O.conceptoOferta({ lineas: L.lineasDeArticulo(CEE, CAT) }), O.conceptoOferta({ alcance: 'UNICO' }));
});

t('el mensaje enumera las partidas (no las tasas) y dice si abre expediente', () => {
    const ls = [...L.lineasDeArticulo(CEE, CAT), ...L.lineasDeArticulo(FV, CAT, { varianteId: 'nave' })];
    const msg = O.mensajeOferta({ nombre: 'JUAN PÉREZ', numero: 'P-26ING_40', total: 742.39, tasas: 16.39, url: 'https://x/aceptar-cee/abc', partidas: L.partidasDe(ls), abreCee: true });
    assert.match(msg, /¡Hola Juan!/);
    assert.match(msg, /• Legalización de instalación solar fotovoltaica — Nave industrial/);
    assert.doesNotMatch(msg, /• Tasa/);
    assert.match(msg, /IVA y tasas incluidos/);
    assert.match(msg, /abrimos tu expediente/);
    const sinCee = O.mensajeOferta({ numero: 'P-26ING_41', total: 544.5, tasas: 0, url: 'u', partidas: ['Legalización'], abreCee: false });
    assert.match(sinCee, /nos ponemos en marcha/); assert.match(sinCee, /\(IVA incluido\)/);
});

t('PDF: 25 partidas salen en varias hojas de alto fijo, con el detalle en gris', () => {
    const ls = Array.from({ length: 25 }, (_, i) => ({ descripcion: `Partida ${i + 1} con un concepto de longitud normal`, detalle: i === 0 ? 'Nave de 1.200 m² en el polígono' : '', uds: 1, precio: 100, ivaPct: 21 }));
    const html = O.buildOfertaCeeHtml({ numero: 'P-26ING_40', lineas: ls }, { cliente: { nombre_razon_social: 'CLIENTE' }, firmaUrl: 'https://x' });
    const hojas = (html.match(/class="sheet"/g) || []).length;
    assert.ok(hojas >= 2, `hojas: ${hojas}`);
    assert.match(html, /Nave de 1\.200 m² en el polígono/);
    assert.match(html, /Partida 25 /);
    assert.doesNotMatch(html, /fonts\.googleapis/);
});

t('PDF: pocas partidas caben en UNA hoja', () => {
    const html = O.buildOfertaCeeHtml({ numero: 'P-26ING_40', lineas: L.lineasDeArticulo(CEE, CAT) }, { cliente: {}, firmaUrl: 'x' });
    assert.equal((html.match(/class="sheet"/g) || []).length, 1);
});

t('PDF: las observaciones son el texto libre del cliente y la política de entrega sale siempre, una vez', () => {
    const lineas = L.lineasDeArticulo(CEE, CAT);
    const veces = (html, s) => html.split(s).length - 1;
    const sinObs = O.buildOfertaCeeHtml({ numero: 'P-26ING_41', lineas }, { cliente: {}, firmaUrl: 'x' });
    assert.equal(veces(sinObs, '>Observaciones<'), 0);
    assert.equal(veces(sinObs, 'Por política de empresa'), 1);
    // Las filas de antes del 25/10/2026 guardaban la política como observaciones: no se repite.
    const antigua = O.buildOfertaCeeHtml({ numero: 'P-26ING_39', lineas, observaciones: O.CONDICIONES_PRESUPUESTO }, { cliente: {}, firmaUrl: 'x' });
    assert.equal(veces(antigua, '>Observaciones<'), 0);
    assert.equal(veces(antigua, 'Por política de empresa'), 1);
    const conObs = O.buildOfertaCeeHtml({ numero: 'P-26ING_42', lineas, observaciones: 'Visita el <martes>.\nTrae las facturas.' }, { cliente: {}, firmaUrl: 'x' });
    assert.equal(veces(conObs, '>Observaciones<'), 1);
    assert.match(conObs, /Visita el &lt;martes&gt;\.\nTrae las facturas\./);
    assert.equal(veces(conObs, 'Por política de empresa'), 1);
    assert.equal(O.observacionesCliente(`  ${O.CONDICIONES_PRESUPUESTO} `), '');
    assert.equal(O.observacionesCliente(null), '');
});

t('la factura de un CEE nacido de un presupuesto hereda sus partidas y sus artículos de AppSheet', () => {
    const ls = L.sanearLineas([...L.lineasDeArticulo(CEE, CAT), ...L.lineasDeArticulo(FV, CAT, { varianteId: 'nave' })]);
    const fac = F.lineasPorDefecto({ alcance: 'UNICO', documentacion: { oferta: { lineas: ls } } }, []);
    assert.equal(fac.length, 3);
    assert.equal(fac[0].articulo_id, '2');        // el CEE
    assert.equal(fac[1].articulo_id, '7');        // su tasa, por su id de AppSheet
    assert.equal(fac[2].articulo_id, null);       // la FV no existe en la hoja
    assert.equal(fac[2].precio, 450);
});

console.log(`\n${ok} comprobaciones OK`);
