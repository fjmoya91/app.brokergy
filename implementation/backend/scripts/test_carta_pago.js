// Pruebas de la CARTA DE PAGO del Bono CAE (cartaPagoService). No escribe nada:
// renderiza con datos de ejemplo y con un caso extremo, y comprueba el control de
// calidad (1 página, cabe, sin variables sueltas, enlace de la reseña).
//
//   node implementation/backend/scripts/test_carta_pago.js [carpeta-de-salida]
//
// Deja los PDF en la carpeta indicada (por defecto, el temporal del sistema) para
// mirarlos a ojo contra el diseño.

const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const carta = require('../services/cartaPagoService');

const salida = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'carta-pago-'));
let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

(async () => {
    // 1. La plantilla declara exactamente las variables del servicio.
    const enPlantilla = [...new Set((carta.plantilla().match(/\{\{\s*(\w+)\s*\}\}/g) || []).map(v => v.replace(/[{}\s]/g, '')))].sort();
    ok(JSON.stringify(enPlantilla) === JSON.stringify([...carta.VARIABLES].sort()), `variables de la plantilla = las del servicio (${enPlantilla.length})`);
    ok(!/fonts\.(googleapis|gstatic)\.com/.test(carta.plantilla()), 'la plantilla no pide nada a Google Fonts');

    // 2. Escapado y variables que faltan.
    const html = carta.rellenar('<p>{{a}}</p>', { a: '<script>x</script> & "y"' });
    ok(html === '<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;y&quot;</p>', 'escapa el HTML de las variables');
    let error = null;
    try { carta.rellenar('{{a}} {{b}}', { a: 'x', b: '  ' }); } catch (e) { error = e; }
    ok(error && /b/.test(error.message), 'una variable vacía es un error, no un hueco');

    // 3. Los datos del encargo.
    const ejemplo = carta.datosEjemplo();
    const r1 = await carta.renderizar(carta.rellenar(carta.plantilla(), ejemplo), { resenaUrl: ejemplo.resena_url });
    fs.writeFileSync(path.join(salida, 'CARTA_PAGO_EJEMPLO.pdf'), r1.pdf);
    ok(!r1.fallos.length, `ejemplo: pasa el control de calidad ${r1.fallos.join(' · ')}`);
    ok(r1.medidas.paginas === 1, `ejemplo: 1 página (${r1.medidas.paginas})`);
    ok(r1.medidas.alto <= 1123, `ejemplo: cabe (${r1.medidas.alto} px)`);
    ok(!r1.medidas.recortadas.length, 'ejemplo: ningún dato recortado');

    // 4. Caso extremo: nombre y dirección muy largos, importe de 6 cifras, dos cuentas.
    const extremo = {
        ...ejemplo,
        nombre_saludo: 'María de los Remedios Inmaculada',
        titular_nombre: 'MARÍA DE LOS REMEDIOS INMACULADA FERNÁNDEZ-CABALLERO DE LA SANTÍSIMA TRINIDAD',
        vivienda_direccion: 'CALLE DEL GENERAL ESPARTERO Y DUQUE DE LA VICTORIA, 123 ESC 2 PL 4 PT B · SAN LORENZO DE CALATRAVA',
        instalador: 'INSTALACIONES TÉRMICAS Y FONTANERÍA HERMANOS MARTÍNEZ DE LA MANCHA SOCIEDAD LIMITADA',
        importe: '123.456,78',
        ahorro_kwh: '1.234.567',
        cuenta_abono: carta.cuentaAbono(['1234', '5678']),
    };
    const r2 = await carta.renderizar(carta.rellenar(carta.plantilla(), extremo), { resenaUrl: extremo.resena_url });
    fs.writeFileSync(path.join(salida, 'CARTA_PAGO_EXTREMO.pdf'), r2.pdf);
    ok(!r2.fallos.length, `extremo: pasa el control de calidad ${r2.fallos.join(' · ')}`);
    ok(r2.medidas.paginas === 1, `extremo: sigue en 1 página (${r2.medidas.paginas})`);
    ok(r2.medidas.recortadas.length > 0, `extremo: recorta con elipsis lo que no cabe (${r2.medidas.recortadas.length} celdas)`);

    // 5. El control de calidad SALTA: sin el enlace de la reseña.
    const r3 = await carta.renderizar(carta.rellenar(carta.plantilla(), ejemplo), { resenaUrl: 'https://example.org/otra' });
    ok(r3.fallos.some(f => /reseña/.test(f)), 'el control de calidad detecta que falta el enlace');

    // 6. Los textos del envío: la cuenta solo por sus 4 últimas cifras.
    const { componerMensajeCartaPago } = await import(require('url').pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href);
    const t = componerMensajeCartaPago({ nombre: 'Antonio', importe: 1370, ultimos4: ['1234'], numero: 'CP-2026-0001', enlace: carta.RESENA_URL_DEFECTO });
    ok(t.whatsapp.replace(/ /g, ' ').startsWith('Hola, Antonio 👋 Ya te hemos transferido tu Bono CAE de 1.370,00 €.'), 'WhatsApp: el texto del encargo');
    ok(t.email.includes('en la cuenta terminada en 1234') && t.email.includes(carta.RESENA_URL_DEFECTO), 'email: cuenta (4 cifras) y reseña');
    const tx = componerMensajeCartaPago({ nombre: 'Antonio', importe: 3030.62, ultimos4: ['6077'], numero: 'CP-2026-0001', expediente: '25RES060_29', enlace: carta.RESENA_URL_DEFECTO });
    ok(tx.asunto.replace(/ /g, ' ') === '25RES060_29 · Tu Bono CAE de 3.030,62 € ya está en tu cuenta', `asunto: el nº de expediente delante (${tx.asunto})`);
    const tp = componerMensajeCartaPago({ nombre: 'Juan', importe: 1000, ultimos4: ['1234'], numero: 'CP-2026-0002', enlace: carta.RESENA_URL_DEFECTO, partner: true });
    ok(!tp.whatsapp.includes('reseña') && !tp.email.includes('1234'), 'al partner: ni reseña ni cuenta');

    // 7. El EMAIL de diseño.
    const crypto = require('crypto');
    const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    const publico = path.join(__dirname, '../../frontend/public/email/carta-pago');
    ok(carta.EMAIL_IMAGENES.every(f => hash(path.join(carta.EMAIL_IMG_DIR, f)) === hash(path.join(publico, f))),
        'imágenes del email: la copia del backend = la que sirve nginx');
    const datosEmail = { ...ejemplo, iban_ultimos4: '1234', assets_url: 'https://app.brokergy.es/email/carta-pago' };
    const email = carta.rellenar(carta.emailPlantilla(), datosEmail);
    ok(!/\{\{/.test(email) && email.includes('Nº CP-2026-0001') && email.includes(ejemplo.resena_url), 'email: todas las variables sustituidas');
    ok(carta.sinAutoenlace('C/ HUERTO PEDRERO, 20').replace(/‌/g, '') === 'C/ HUERTO PEDRERO, 20'
        && /2‌0/.test(carta.sinAutoenlace('20')), 'email: la dirección lleva el invisible que evita el enlace de Gmail, y se lee igual');
    const conCid = carta.conImagenesCid(email, datosEmail.assets_url);
    ok(!conCid.html.includes(datosEmail.assets_url) && conCid.attachments.length === carta.EMAIL_IMAGENES.length
        && carta.EMAIL_IMAGENES.every(f => email.includes(`/${f}"`)),
        `email: usa sus ${carta.EMAIL_IMAGENES.length} imágenes y, sin alojar, van todas como CID`);
    const td = componerMensajeCartaPago({ nombre: 'María', importe: 1370, ultimos4: ['1234'], numero: 'CP-2026-0001', expediente: 'EXP-0001', enlace: carta.RESENA_URL_DEFECTO, detalle: ejemplo });
    ok(td.email.includes('DETALLE DEL PAGO') && td.email.includes('Instalador: INSTALACIONES EJEMPLO SL') && td.email.includes(ejemplo.resena_url),
        'email: el texto plano cuenta lo mismo que el HTML');

    console.log(`\nPDF en ${salida}`);
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
