#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El BUZÓN de firmados del S.O. (services/firmadosSoCorreo.js): qué correo cuenta
 * y qué dice el aviso. Sin base de datos, sin buzón y sin red: funciones puras.
 * Lo que hace con los correos reales, en seco: scripts/probar_firmados_correo.js
 *
 *   node scripts/test_firmados_correo.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
const { codigosLote, nombresPdf, contactosSo, esDelSo, textoAviso } = require('../services/firmadosSoCorreo');

let fallos = 0;
const ok = (cond, texto) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${texto}`);
    if (!cond) fallos++;
};

console.log('\n🔎 De qué lote es el correo');
ok(codigosLote('RV: Anexo I · Listado Cesión + Fichas RES — Brokergy (LOTE-2025-012)').join() === 'LOTE-2025-012',
    'el código sale del asunto');
ok(codigosLote('re: firmar oferta (lote-2025-009)').join() === 'LOTE-2025-009', 'en minúscula también, y se devuelve en mayúscula');
ok(codigosLote('Lotes 010 y 011', 'LOTE-2025-010 y LOTE-2025-011').length === 2,
    'si nombra dos lotes se ve (y el buzón no elige: lo ignora)');
ok(codigosLote('RE: CONTESTACIÓN A REQUERIMIENTO MITECO').length === 0, 'sin código no hay lote');

console.log('\n🔎 ¿Trae PDF? (se mira la estructura, sin bajar el correo)');
const estructura = {
    type: 'multipart/mixed', childNodes: [
        { type: 'multipart/related', childNodes: [{ type: 'text/html' }, { type: 'image/png', parameters: { name: 'image001.png' } }] },
        { type: 'application/pdf', dispositionParameters: { filename: '2. Anexo I LOTE-2025-012.pdf' } },
        { type: 'application/octet-stream', parameters: { name: '25RES060_79 - Ficha RES060.pdf' } },
    ],
};
ok(nombresPdf(estructura).length === 2, 'cuenta el application/pdf y el octet-stream que se llama .pdf, no la firma en imagen');
ok(nombresPdf({ type: 'text/plain' }).length === 0, 'un correo sin adjuntos no trae PDF');

console.log('\n🔎 ¿Es del S.O. de ese lote?');
const so = contactosSo({
    email: 'contacto@so-ejemplo.es',
    contactos_notificacion: JSON.stringify([{ email: 'Firmante@so-ejemplo.es' }, { email: 'gestor.ejemplo@gmail.com' }]),
});
ok(esDelSo('firmante@so-ejemplo.es', so), 'un contacto de la ficha (sin importar mayúsculas)');
ok(esDelSo('companero@so-ejemplo.es', so), 'otra persona del mismo dominio de la empresa');
ok(esDelSo('gestor.ejemplo@gmail.com', so), 'un contacto con correo gratuito, por su dirección exacta');
ok(!esDelSo('otro@gmail.com', so), 'pero el dominio gratuito NO vale para cualquiera');
ok(!esDelSo('alguien@otra-empresa.es', so), 'quien no es del S.O. no cuenta (aunque el correo traiga sus firmas)');

console.log('\n🔎 El aviso dice lo registrado, lo que hay que mirar y lo que falta');
const correo = { de: 'Firmante <firmante@so-ejemplo.es>', fecha: '2026-10-17T08:39:58Z', asunto: 'RV: Anexo I (LOTE-2025-012)' };
const aviso = textoAviso(correo, {
    codigo: 'LOTE-2025-012',
    resultados: [
        { fichero: '25RES060_79 - Ficha RES060.pdf', expediente: '25RES060_79', registrado: true, estado: 'listo', avisos: [] },
        { fichero: '2. Anexo I LOTE-2025-012.pdf', etiqueta: 'Anexo I', registrado: false, estado: 'revisar', avisos: ['El Anexo I debe llevar DOS firmas.'] },
        { fichero: '25RES060_85 - Ficha RES060.pdf', expediente: '25RES060_85', registrado: false, estado: 'ya_registrado', avisos: [] },
        { fichero: '25RES060_88 - Ficha RES060_rev1.pdf', expediente: '25RES060_88', registrado: false, estado: 'anterior', avisos: ['Llegó antes.'] },
    ],
    pendientes: [{ etiqueta: 'Anexo I' }],
});
ok(/hay que revisar 1/.test(aviso.titulo), 'el título dice que hay algo que revisar');
ok(/Registrados \(1\): 25RES060_79/.test(aviso.texto), 'lo registrado, por su nº de expediente');
ok(/DOS firmas/.test(aviso.texto), 'lo que no se registró, con su motivo');
ok(/Ya estaban registrados: 1/.test(aviso.texto), 'lo que ya estaba se cuenta, sin alarma');
ok(/ronda de firma anterior.*25RES060_88/.test(aviso.texto), 'una versión vieja se nombra, sin pedir que se revise');
ok(/Sigue faltando: Anexo I/.test(aviso.texto), 'y lo que sigue faltando en el lote');

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : '\n✅ Todo correcto');
process.exit(fallos ? 1 : 0);
