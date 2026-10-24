// Pruebas del flujo «¿te ha llegado?» → reseña → documentación para la Renta
// (24/10/2026). No escribe nada: textos, resumen de la Renta y enlace corto.
//
//   node implementation/backend/scripts/test_recepcion_cobro.js

const path = require('path');
const { pathToFileURL } = require('url');
const corto = require('../services/enlaceCorto');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };
const nb = (s) => String(s).replace(/ /g, ' ');

(async () => {
    const form = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href);
    const guia = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/guiaIrpf.js')).href);

    // 1. Recordatorio
    const r = form.componerMensajeRecordatorioCobro({ nombre: 'Antonio', importe: 3030.62, enlace: 'https://app.brokergy.es/r/ABCDEFGH' });
    ok(nb(r.whatsapp).startsWith('Hola, Antonio 👋 ¿Te ha llegado ya el ingreso de tu Bono CAE (3.030,62 €)?'), 'recordatorio: pregunta con el importe');
    ok(r.whatsapp.includes('https://app.brokergy.es/r/ABCDEFGH') && r.email.includes('https://app.brokergy.es/r/ABCDEFGH'), 'recordatorio: lleva el enlace en WhatsApp y email');
    ok(/Renta/.test(r.whatsapp) && /Renta/.test(r.asunto), 'recordatorio: ofrece la documentación para la Renta');
    const rt = form.componerMensajeRecordatorioCobro({ nombre: 'Juan', importe: 1000, enlace: 'x', tercero: true, titular: 'Ana Pérez' });
    ok(rt.whatsapp.includes('Os ha llegado') && rt.whatsapp.includes('Ana Pérez'), 'recordatorio: a la persona de contacto se le habla de vosotros y del titular');

    // 2. Petición de reseña (la idea de Fran) y que no prometa nada a cambio
    const p = form.textoPeticionResena();
    ok(p.titulo && p.cuerpo && p.boton && p.hecho && p.gracias, 'reseña: trae todos sus textos');
    ok(/familias/i.test(p.cuerpo) && /(sale adelante|salen adelante)/i.test(p.cuerpo), 'reseña: la idea de Fran (familias en su situación · sale adelante)');
    ok(!/(a cambio|desbloque|para acceder|si nos dejas)/i.test(`${p.cuerpo} ${p.boton}`), 'reseña: no condiciona nada a la reseña');
    ok(/vuestr|os /i.test(form.textoPeticionResena({ tercero: true }).cuerpo), 'reseña: variante de vosotros');

    // 3. Campaña de la Renta
    const c = form.componerMensajeCampanaRenta({ nombre: 'María', enlace: 'https://app.brokergy.es/r/ZZZZZZZZ', anio: 2026, conResena: true, enlaceResena: 'https://g.page/x' });
    ok(c.whatsapp.includes('Renta 2026') && c.whatsapp.includes('/r/ZZZZZZZZ') && c.whatsapp.includes('https://g.page/x'), 'campaña: año, enlace y reseña');
    ok(!form.componerMensajeCampanaRenta({ nombre: 'M', enlace: 'x', anio: 2026, conResena: false, enlaceResena: 'https://g.page/x' }).whatsapp.includes('g.page'), 'campaña: sin reseña a quien ya la dejó');

    // 4. Resumen de la Renta para el portal (mismos rótulos LITERALES que la guía)
    const g = {
        puede: true, modalidad: '60', vivienda: { refCatastral: '1234567VJ1213S0001AB' },
        obras: [{ nif: 'B00000000', nombre: 'INSTALACIONES EJEMPLO SL' }], total: 10405, anio: 2026,
        certificados: { anterior: { fecha: '2026-05-04', consumo: 516.03, letra: 'G' }, posterior: { fecha: '2026-06-09', consumo: 22.23, letra: 'A' } },
    };
    const rs = guia.resumenRentaCliente(g);
    ok(rs.puede && rs.pct === 60 && rs.ruta[rs.ruta.length - 1] === guia.MODALIDADES['60'].opcionRenta, 'renta: 60 % y la opción LITERAL de Renta Web');
    ok(rs.filas.some(f => f.k === 'Referencia catastral' && f.v === '1234567VJ1213S0001AB'), 'renta: referencia catastral');
    ok(rs.filas.some(f => /NIF\/NIE de quien ha realizado las obras \(1\)/.test(f.k) && f.v.startsWith('B00000000')), 'renta: NIF de la obra');
    ok(rs.certificados.anterior.letra === 'G' && rs.certificados.posterior.letra === 'A' && rs.certificados.anterior.fecha === '04/05/2026', 'renta: certificados antes/después');
    ok(guia.resumenRentaCliente({ puede: false, motivo: 'X' }).puede === false, 'renta: sin deducción no se inventa una');

    // 5. Enlace corto
    const cod = corto.nuevoCodigo();
    ok(cod.length === corto.LARGO && corto.valido(cod), `enlace corto: código válido (${cod})`);
    ok(!/[01OIL]/.test(Array.from({ length: 50 }, () => corto.nuevoCodigo()).join('')), 'enlace corto: sin caracteres confundibles');
    ok(!corto.valido('ABC') && !corto.valido('ABCDEFG0') && !corto.valido('abcdefgh'), 'enlace corto: rechaza códigos mal formados');
    ok(corto.rutaDe('https://app.brokergy.es/cobro/x/recibido?token=1') === '/cobro/x/recibido?token=1', 'enlace corto: guarda la RUTA, sin dominio');
    let rechaza = false;
    try { corto.rutaDe('https://evil.com//otro.com'); } catch { rechaza = true; }
    ok(rechaza, 'enlace corto: nunca redirige fuera de la app (//)');

    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
