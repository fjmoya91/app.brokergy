// Prueba SIN red ni BD de la factura de VENTA DEL AHORRO de un cliente EMPRESA
// (logic/facturaVentaAhorro.js + paraRemesa de services/facturaVentaAhorro.js).
//   node implementation/backend/scripts/test_factura_venta_ahorro.mjs
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const v = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/lotes/logic/facturaVentaAhorro.js')).href);
const cee = await import(pathToFileURL(path.join(aqui, '../../frontend/src/features/cee-directo/logic/facturaCee.js')).href);
process.env.SUPABASE_URL ||= 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x'; process.env.SUPABASE_KEY ||= 'x';
const require = createRequire(import.meta.url);

let fallos = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✅' : '  ❌'} ${msg}`); if (!c) fallos++; };

console.log('Líneas y totales');
const l1 = v.lineasVentaAhorro({ bono: 8115.7, kwh: 81157, expediente: '26RES080_60' });
const t1 = cee.totalesFactura(l1);
ok(l1.length === 1 && t1.neto === 8115.7 && t1.iva === 1704.3 && t1.total === 9820, `26RES080_60: 8.115,70 + 21 % = 9.820,00 (${t1.total})`);
ok(/81\.157 kWh/.test(l1[0].detalle), 'el detalle dice los kWh verificados');
const l2 = v.lineasVentaAhorro({ bono: 8115.7, descuento: 250 });
const t2 = cee.totalesFactura(l2);
ok(t2.neto === 7865.7 && t2.total === Math.round(7865.7 * 1.21 * 100) / 100, `con descuento de gestión la base va neta (${t2.neto} → ${t2.total})`);
ok(/250,00/.test(l2[0].detalle), 'y el detalle cuenta el descuento');
ok(cee.totalesFactura(v.lineasVentaAhorro({ bono: 1000, ivaPct: 0 })).total === 1000, 'IVA 0 % (no sujeta)');
ok(cee.totalesFactura(v.lineasVentaAhorro({ bono: 1000, ivaPct: null })).iva === 210, 'IVA sin dar = 21 %, nunca 0 por un null');
// La Parroquia (25TER100_1): 305.781 kWh a 0,105 → 32.107,01 + 6.742,47 = 38.849,48
const tp = cee.totalesFactura(v.lineasVentaAhorro({ bono: 32107.01, kwh: 305781 }));
ok(tp.iva === 6742.47 && tp.total === 38849.48, `cuadra con la factura de la Parroquia (${tp.total})`);

console.log('Numeración (serie AF por proveedor)');
ok(v.siguienteNumero([], 2026) === 'AF-2026-001', 'primera del año');
ok(v.siguienteNumero(['AF-2026-001', 'AF-2025-007', 'AF-2026-003'], 2026) === 'AF-2026-004', 'sigue a la mayor del año, ignora otros años');

console.log('Acuerdo, observaciones y mensajes');
const ac = v.textoAcuerdo({ razonSocial: 'LA XANTIPA CB', cif: 'E26753236', representante: 'ALMUDENA X', dniRepresentante: '1X' }).join(' ');
ok(/artículo 5/.test(ac) && /acepte/.test(ac) && /serie específica/.test(ac), 'el acuerdo dice art. 5, cómo se acepta y la serie');
ok(/FACTURACIÓN POR EL DESTINATARIO/.test(v.observacionesVenta({ modo: 'autofactura', expediente: 'X' })), 'la autofactura lleva la mención del art. 6.1.m');
ok(!/DESTINATARIO/.test(v.observacionesVenta({ modo: 'cliente', expediente: 'X' })), 'el modelo para el cliente no');
const enlace = 'https://app.brokergy.es/factura-ahorro/abc?token=t';
const mA = v.mensajeVentaAhorro({ modo: 'autofactura', total: 9820, base: 8115.7, ivaPct: 21, expediente: 'X', enlace });
ok(mA.trim().endsWith(enlace) && /👉/.test(mA), 'autofactura: el enlace va al FINAL con su 👉');
ok(!/\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(mA), 'no promete fecha');
const mC = v.mensajeVentaAhorro({ modo: 'cliente', total: 9820, base: 8115.7, ivaPct: 21, expediente: 'X' });
ok(/B19350222/.test(mC) && /modelo/.test(mC), 'cliente: a nombre de quién y el modelo');

console.log('Las dos opciones, explicadas (formulario de cobro y su página)');
const bq = v.bloqueFacturaVenta();
ok(bq.id === 'factura_venta' && bq.obligatorio && bq.opciones.map(o => o.value).join() === 'autofactura,cliente', 'la pregunta: obligatoria, autofactura o «la emito yo»');
ok(bq.opciones[0].recomendada && /aceptar un acuerdo/.test(bq.opciones[0].sub), 'la autofactura va recomendada y dice qué tiene que hacer');
ok(bq.explicacion.autofactura.length === 4 && /art\. 5/.test(bq.explicacion.autofactura[0].texto) && /gestoría/.test(bq.explicacion.autofactura[3].texto), 'se explica en 4 pasos: base legal … y que la registre su gestoría');
ok(/vendéis el ahorro/.test(bq.ayuda), 'y por qué una empresa tiene que facturar');
const filas = v.datosFacturaCliente({ base: 8115.7, ivaPct: 21, kwh: 81157, expediente: '26RES080_60' });
const dato = (c) => filas.find(f => f.campo.startsWith(c))?.valor;
ok(dato('A nombre') === 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL' && dato('CIF') === 'B19350222', 'los datos: a nombre de quién y su CIF');
ok((dato('Base').replace(/\s/g, ' ') === '8.115,70 €' && dato('IVA').replace(/\s/g, ' ') === '1.704,30 €' && dato('Total').replace(/\s/g, ' ') === '9.820,00 €'), 'base, IVA y total cuadran (9.820,00 €)');
ok(/26RES080_60/.test(dato('Concepto')) && /81\.157 kWh/.test(dato('Concepto')), 'el concepto lleva el expediente y los kWh');
const mC2 = v.mensajeVentaAhorro({ modo: 'cliente', total: 9820, base: 8115.7, ivaPct: 21, iva: 1704.3, kwh: 81157, expediente: '26RES080_60', enlace });
ok(/\*Base imponible:\* 8\.115,70\s€/.test(mC2) && /\*Total:\* 9\.820,00\s€/.test(mC2) && /Dirección/.test(mC2), 'el WhatsApp de «la emito yo» lleva los DATOS escritos, campo a campo');
ok(mC2.trim().endsWith(enlace) && /Sube aquí/.test(mC2), 'y el enlace para subirla, al final');
ok(/autofactura/.test(mA) && /gestoría/.test(mA) && /1\. Aceptáis el acuerdo/.test(mA), 'el de la autofactura explica qué es y los pasos');
ok(!/💶/.test(mA + mC2), 'sin el emoji del importe (solo el 👉 del enlace, como el cobro)');
ok(v.leerImporte('9.820,00') === 9820 && v.leerImporte('9820.00') === 9820 && v.leerImporte('9820,5') === 9820.5 && v.leerImporte('') === null, 'el total que escribe: «9.820,00», «9820.00»…');

console.log('¿Entra en la remesa?');
const fv = require('../services/facturaVentaAhorro.js');
const exp = (es_empresa, factura_venta) => ({ clientes: { es_empresa }, documentacion: { cobro: { factura_venta } } });
ok(fv.paraRemesa(exp(false, null)).aplica === false, 'un particular, como siempre');
ok(fv.paraRemesa(exp(true, null)).lista === false, 'empresa sin factura: fuera');
ok(/sin aceptar/.test(fv.paraRemesa(exp(true, { estado: 'PENDIENTE_ACEPTACION', numero: 'AF-2026-001' })).motivo), 'autofactura sin aceptar: fuera, con su motivo');
const ac2 = fv.paraRemesa(exp(true, { estado: 'ACEPTADA', numero: 'AF-2026-001', neto: 8115.7, total: 9820 }));
ok(ac2.lista && ac2.total === 9820, 'aceptada: entra por el TOTAL con IVA');
ok(fv.paraRemesa(exp(true, { estado: 'NO_PROCEDE' })).sinFactura === true, '«no procede»: entra sin factura');
ok(v.ventaListaParaPagar({ estado: 'RECIBIDA' }) && !v.ventaListaParaPagar({ estado: 'RECHAZADA' }), 'recibida sí, rechazada no');

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ Todo bien');
process.exit(fallos ? 1 : 0);
