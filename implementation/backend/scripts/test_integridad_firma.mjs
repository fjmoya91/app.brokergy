#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * La comprobación de que una firma electrónica CUBRE el documento.
 *
 *   node scripts/test_integridad_firma.mjs
 *
 * Sin BD, sin Drive y sin red. Se construye un PDF firmado de laboratorio —con su
 * PKCS#7 en DER de verdad, su /ByteRange y su messageDigest bien calculado— y se
 * le hacen encima las averías que se han visto en producción:
 *
 *   · un byte cambiado dentro del documento  → el resumen deja de cuadrar
 *   · el fichero truncado                    → la firma cubre bytes que ya no están
 *   · bytes escritos detrás de la firma      → se ha tocado tras firmar
 *
 * El contraste contra los ficheros REALES lo da `barrer_integridad_firmas.js`:
 * aquí se comprueba que la avería se detecta, allí que lo bueno no se marca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createRequire } from 'module';
import { createHash } from 'crypto';
const require = createRequire(import.meta.url);
const { leerFirmasPdf, leerDigestsPkcs7 } = require('../utils/firmasPdf.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

// ─── DER a mano: lo justo para un PKCS#7 que declare un messageDigest ────────
const len = (n) => {
    if (n < 0x80) return Buffer.from([n]);
    const b = []; let v = n;
    while (v > 0) { b.unshift(v & 0xff); v >>= 8; }
    return Buffer.from([0x80 | b.length, ...b]);
};
const tlv = (tag, ...partes) => {
    const v = Buffer.concat(partes.map(p => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
    return Buffer.concat([Buffer.from([tag]), len(v.length), v]);
};
const SEQ = (...p) => tlv(0x30, ...p);
const SET = (...p) => tlv(0x31, ...p);
const OID = (hex) => tlv(0x06, Buffer.from(hex, 'hex'));
const INT = (n) => tlv(0x02, Buffer.from([n]));
const OCT = (buf) => tlv(0x04, buf);
const CTX = (n, ...p) => tlv(0xa0 | n, ...p);

const OID_SIGNED_DATA = '2a864886f70d010702';
const OID_DATA = '2a864886f70d010701';
const OID_SHA256 = '608648016503040201';
const OID_MESSAGE_DIGEST = '2a864886f70d010904';

/** PKCS#7 mínimo que declara `digest` como el resumen del documento firmado. */
function pkcs7ConDigest(digestHex) {
    const signerInfo = SEQ(
        INT(1),
        SEQ(SEQ(), INT(1)),                                    // sid (issuerAndSerialNumber, vacío)
        SEQ(OID(OID_SHA256)),                                  // digestAlgorithm
        CTX(0,                                                 // [0] signedAttrs
            SEQ(OID(OID_MESSAGE_DIGEST), SET(OCT(Buffer.from(digestHex, 'hex')))),
        ),
        SEQ(OID('2a864886f70d010101')),                        // signatureAlgorithm
        OCT(Buffer.alloc(8)),                                  // signature
    );
    const signedData = SEQ(
        INT(1),
        SET(SEQ(OID(OID_SHA256))),
        SEQ(OID(OID_DATA)),
        SET(signerInfo),
    );
    return SEQ(OID(OID_SIGNED_DATA), CTX(0, signedData));
}

/**
 * PDF de laboratorio con una firma cuyo /ByteRange y messageDigest son correctos.
 * Se monta en dos pasadas porque el hueco de la firma tiene que estar ya en su
 * sitio para poder calcular el hash de lo que queda fuera — exactamente el mismo
 * baile que hace una aplicación de firma de verdad.
 */
function pdfFirmado({ relleno = 'contenido del documento' } = {}) {
    const HUECO = 4096;                                        // bytes del <…> en hex
    const cabecera = `%PDF-1.7\n% ${relleno}\n`;
    // Los marcadores miden lo MISMO que su reemplazo (8), o el ByteRange
    // describiría posiciones que se han movido al escribirlo.
    const antes = `${cabecera}1 0 obj\n<< /Type /Sig /SubFilter /ETSI.CAdES.detached /Name (LABORATORIO) /M (D:20260918120000) /ByteRange [0 @@@@@@1 @@@@@@2 @@@@@@3] /Contents <`;
    const despues = `>\n>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n`;

    // Los tres números del ByteRange dependen de su propia longitud, así que se
    // fijan a un ancho constante rellenando con espacios.
    const ancho = (n) => String(n).padEnd(7, ' ');
    const ini = antes.length - 1;                              // posición del '<' (va al final de `antes`)
    const fin = ini + 1 + HUECO + 1;                           // tras el '>'
    const largo = despues.length - 1;                          // `despues` empieza por el '>'
    const cabeceraFinal = antes
        .replace('@@@@@@1', ancho(ini))
        .replace('@@@@@@2', ancho(fin))
        .replace('@@@@@@3', ancho(largo));
    // El reemplazo no cambia la longitud si los marcadores caben en el ancho fijo.
    if (cabeceraFinal.length !== antes.length) throw new Error('el relleno del ByteRange descuadra');

    // Lo FIRMADO es todo menos el hueco, delimitadores incluidos: el '<' y el '>'
    // quedan fuera del ByteRange.
    const firmado = Buffer.concat([
        Buffer.from(cabeceraFinal.slice(0, -1), 'latin1'),
        Buffer.from(despues.slice(1), 'latin1'),
    ]);
    const digest = createHash('sha256').update(firmado).digest('hex');

    const der = pkcs7ConDigest(digest).toString('hex');
    const relleno0 = der.padEnd(HUECO, '0');
    if (relleno0.length !== HUECO) throw new Error('el PKCS#7 no cabe en el hueco');

    return Buffer.from(`${cabeceraFinal}${relleno0}>${despues.slice(1)}`, 'latin1');
}

console.log('\n── El PKCS#7 se recorre y declara su digest ──');
{
    const der = pkcs7ConDigest('ab'.repeat(32));
    const d = leerDigestsPkcs7(der);
    ok(d.length === 1, 'un SignerInfo');
    ok(d[0].algoritmo === 'sha256', `algoritmo sha256 (dice: ${d[0].algoritmo})`);
    ok(d[0].messageDigest === 'ab'.repeat(32), 'el messageDigest se lee entero');
}

console.log('\n── Un documento firmado INTACTO pasa ──');
const bueno = pdfFirmado();
{
    const r = leerFirmasPdf(bueno);
    ok(r.esPdf && r.completo, 'es un PDF completo');
    ok(r.firmada && r.n === 1, `lleva 1 firma (n=${r.n})`);
    ok(r.integridad.ok === true, 'la firma cubre el documento');
    ok(r.integridad.rota === false, 'no se marca como rota');
    ok(r.integridad.problemas.length === 0, `sin problemas (${r.integridad.problemas.join(' · ') || '—'})`);
}

console.log('\n── Un byte cambiado DENTRO del documento se detecta ──');
{
    const tocado = Buffer.from(bueno);
    const pos = tocado.indexOf('contenido del documento');
    tocado[pos] = 'C'.charCodeAt(0);                           // 'c' → 'C'
    const r = leerFirmasPdf(tocado);
    ok(r.firmada, 'la firma sigue ahí (por eso el PDF "parece" firmado)');
    ok(r.integridad.rota === true, 'ROTA');
    ok(r.integridad.problemas.some(p => /no es el que se firmó/.test(p)),
        `lo dice por el resumen: "${r.integridad.problemas[0]}"`);
}

console.log('\n── Un PDF TRUNCADO se detecta ──');
{
    const r = leerFirmasPdf(bueno.subarray(0, bueno.length - 20));
    ok(r.completo === false, 'le falta el final');
    ok(r.integridad.rota === true, 'ROTA');
    ok(r.integridad.problemas.some(p => /incompleto/.test(p)), 'se dice que está incompleto');
}

console.log('\n── Bytes escritos DESPUÉS de la firma se detectan ──');
{
    const r = leerFirmasPdf(Buffer.concat([bueno, Buffer.from('\n1 0 obj\n<< /Alterado true >>\n%%EOF\n')]));
    ok(r.integridad.rota === true, 'ROTA');
    ok(r.integridad.problemas.some(p => /después de la firma/.test(p)),
        `se dice qué ha pasado: "${r.integridad.problemas.find(p => /después/.test(p))}"`);
}

console.log('\n── Un cierre limpio detrás NO es una alteración ──');
{
    // Un `%%EOF` con sus saltos de línea lo escribe el propio firmante al cerrar.
    const r = leerFirmasPdf(Buffer.concat([bueno, Buffer.from('\r\n%%EOF\n')]));
    ok(r.integridad.rota === false, 'no se marca como rota');
}

console.log('\n── Un PDF SIN firma no es un PDF roto ──');
{
    const r = leerFirmasPdf(Buffer.from('%PDF-1.4\nun escaneo\n%%EOF\n'));
    ok(r.firmada === false, 'no lleva firma electrónica');
    ok(r.integridad.rota === false, 'y eso NO lo convierte en roto');
    ok(r.integridad.ok === null, 'no se afirma nada de su integridad');
}

console.log('\n── Lo que no se puede leer NO se cuenta como roto ──');
{
    // Firma cuyo PKCS#7 no es recorrible: el rango sigue cuadrando, pero del
    // contenido no se puede afirmar nada.
    const sinDer = Buffer.from(bueno.toString('latin1').replace(/<3082|<3081|<30/, '<ff'), 'latin1');
    const r = leerFirmasPdf(sinDer);
    ok(r.integridad.rota === false, 'no se marca como rota');
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
