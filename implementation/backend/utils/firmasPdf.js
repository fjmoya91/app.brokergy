// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN ha firmado un PDF — leído del PROPIO FICHERO, sin llamar a nadie.
//
// El Sujeto Obligado devuelve las fichas y el Anexo I firmados con certificado y
// sin tocar el nombre. Para poder registrarlos hay que saber DOS cosas: que llevan
// firma de verdad y de quién es. Las dos están dentro del PDF:
//
//   · el diccionario de firma (`/Type /Sig`) trae `/SubFilter`, `/M` (fecha) y
//     `/Contents`, que es un PKCS#7 (CAdES) en hexadecimal;
//   · dentro de ese PKCS#7 van los CERTIFICADOS y los `SignerInfo`. El nombre y el
//     NIF del firmante son el `subject` de su certificado.
//
// REGLA — esto NO dice que una firma sea VÁLIDA. No se comprueba la cadena de
// confianza, ni la revocación, ni que la firma la hiciera de verdad esa clave: eso
// lo hace Autofirma o el validador del Ministerio. Aquí se LEE quién dice el
// certificado que firma, que es lo que hace falta para clasificar un fichero y
// ponerle nombre. Lo que se afirma es "el PDF declara N firmas y éstos son sus
// nombres", nunca "la firma es válida".
//
// Lo que SÍ se comprueba, desde el 18/09/2026, es lo contrario y es más estrecho:
// que la firma **cubra este documento** (`integridadDeFirma`, más abajo). Es un
// hecho que se puede afirmar con el fichero en la mano —el `messageDigest` del
// firmante contra el hash de lo que hay hoy— y es lo que separa una firma de
// verdad de una que se ve en pantalla pero que ningún lector aceptará.
//
// REGLA — sin dependencias nuevas y sin modelos de IA. Es un recorrido TLV de DER
// (~200 líneas) sobre unos pocos KB: milisegundos y coste cero. Meter una llamada
// a un LLM para leer un nombre que está escrito en el fichero sería pagar por algo
// que el propio PDF ya dice, y encima sin garantía de que lo lea igual dos veces.
//
// El `/Name` del diccionario también trae un nombre, pero lo escribe la aplicación
// que firma y es libre: manda siempre el CERTIFICADO, y el declarado se guarda
// aparte solo como pista.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Recorrido DER (tag-length-value) ────────────────────────────────────────
// Devuelve null en cuanto algo no encaja: un PKCS#7 que no se puede recorrer se
// trata como "no he podido leerlo", nunca como "no hay firma".
function tlv(buf, off) {
    if (off + 1 >= buf.length) return null;
    const tag = buf[off];
    let i = off + 1;
    let len = buf[i++];
    if (len & 0x80) {
        const n = len & 0x7f;
        if (n === 0 || n > 4 || i + n > buf.length) return null;  // indefinida o absurda
        len = 0;
        for (let k = 0; k < n; k++) len = (len * 256) + buf[i++];
    }
    const vEnd = i + len;
    if (vEnd > buf.length) return null;
    return { tag, vStart: i, vEnd, next: vEnd };
}

function hijos(buf, nodo) {
    const out = [];
    let off = nodo.vStart;
    while (off < nodo.vEnd) {
        const t = tlv(buf, off);
        if (!t) break;
        out.push(t);
        off = t.next;
    }
    return out;
}

const esSeq = (n) => n && (n.tag === 0x30 || n.tag === 0x31);   // SEQUENCE o SET
const bytes = (buf, n) => buf.subarray(n.vStart, n.vEnd);
const hex = (buf, n) => bytes(buf, n).toString('hex');

// Busca recursivamente el primer nodo cuyo contenido sea el OID dado.
const OID_SIGNED_DATA = Buffer.from('2a864886f70d010702', 'hex');   // 1.2.840.113549.1.7.2

// Atributos del `subject` que interesan (RFC 4519 / certificados españoles).
const ATRIBUTOS = {
    '550403': 'cn',
    '550404': 'apellidos',
    '550405': 'serialNumber',      // FNMT: "IDCES-12345678A"
    '55040a': 'organizacion',
    '55042a': 'nombre',            // givenName
    '550461': 'orgId',             // organizationIdentifier: "VATES-A13035266"
    '550441': 'pseudonimo',
};

// Un DirectoryString puede venir en cinco codificaciones distintas.
function texto(buf, nodo) {
    const b = bytes(buf, nodo);
    if (nodo.tag === 0x1e) {       // BMPString (UTF-16BE)
        let s = '';
        for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
        return s;
    }
    if (nodo.tag === 0x0c) return b.toString('utf8');           // UTF8String
    return b.toString('latin1');                                 // Printable / IA5 / Teletex
}

// Name ::= SEQUENCE OF SET OF SEQUENCE { type OID, value }
function leerNombreX500(buf, nodo) {
    const out = {};
    for (const rdn of hijos(buf, nodo)) {
        for (const par of hijos(buf, rdn)) {
            const campos = hijos(buf, par);
            if (campos.length < 2 || campos[0].tag !== 0x06) continue;
            const clave = ATRIBUTOS[hex(buf, campos[0])];
            if (!clave || out[clave]) continue;    // el primero gana (los certificados no repiten)
            out[clave] = texto(buf, campos[1]).trim();
        }
    }
    return out;
}

/**
 * Certificate ::= SEQ { TBSCertificate, algo, firma }
 * TBSCertificate ::= SEQ { [0] version?, serial, algo, issuer, validez, subject, … }
 */
function leerCertificado(buf, nodo) {
    if (!esSeq(nodo)) return null;
    const partes = hijos(buf, nodo);
    if (!partes.length || !esSeq(partes[0])) return null;
    const tbs = hijos(buf, partes[0]);
    let i = 0;
    if (tbs[i] && tbs[i].tag === 0xa0) i++;                 // versión (explícita, opcional)
    const serial = tbs[i] && tbs[i].tag === 0x02 ? hex(buf, tbs[i]).replace(/^0+/, '') : null;
    i++;
    i++;                                                     // algoritmo de firma
    const issuer = tbs[i]; i++;
    i++;                                                     // validez
    const subject = tbs[i];
    if (!issuer || !subject) return null;
    return {
        serial,
        issuerDer: hex(buf, issuer),
        subjectDer: hex(buf, subject),
        subject: leerNombreX500(buf, subject),
    };
}

/**
 * Lee los firmantes de un PKCS#7 / CAdES.
 *
 * El certificado del FIRMANTE se localiza por el `issuerAndSerialNumber` de su
 * `SignerInfo`. Si la firma se identifica por `subjectKeyIdentifier` (no trae
 * serie), se cae a una regla determinista: el certificado HOJA es el único cuyo
 * `subject` no es el `issuer` de ningún otro del conjunto — las CA de la cadena sí
 * lo son. Nunca se elige "el primero", que en la mitad de los certificados
 * españoles es la raíz.
 */
function leerPkcs7(der) {
    const raiz = tlv(der, 0);
    if (!raiz || !esSeq(raiz)) return null;
    const nivel1 = hijos(der, raiz);
    if (!nivel1.length || nivel1[0].tag !== 0x06 || !bytes(der, nivel1[0]).equals(OID_SIGNED_DATA)) return null;
    const explicito = nivel1[1];
    if (!explicito) return null;
    const sd = hijos(der, explicito)[0];
    if (!esSeq(sd)) return null;

    const partes = hijos(der, sd);
    const certs = [];
    let signerInfos = null;
    for (const p of partes) {
        if (p.tag === 0xa0) {                       // [0] IMPLICIT certificates
            for (const c of hijos(der, p)) {
                const cert = leerCertificado(der, c);
                if (cert) certs.push(cert);
            }
        } else if (p.tag === 0x31) {                // SET OF SignerInfo (el último SET)
            signerInfos = p;
        }
    }
    if (!signerInfos) return null;

    const hoja = () => {
        const emisores = new Set(certs.map(c => c.issuerDer));
        return certs.find(c => !emisores.has(c.subjectDer)) || null;
    };

    const firmantes = [];
    for (const si of hijos(der, signerInfos)) {
        if (!esSeq(si)) continue;
        const campos = hijos(der, si);
        const sid = campos[1];
        let cert = null;
        if (sid && esSeq(sid)) {
            const ias = hijos(der, sid);
            const serial = ias[1] && ias[1].tag === 0x02 ? hex(der, ias[1]).replace(/^0+/, '') : null;
            const issuerDer = ias[0] ? hex(der, ias[0]) : null;
            cert = certs.find(c => c.serial === serial && c.issuerDer === issuerDer)
                || certs.find(c => c.serial === serial) || null;
        }
        if (!cert) cert = hoja();
        firmantes.push(cert ? cert.subject : null);
    }
    return firmantes;
}

// ─── Qué DOCUMENTO dice la firma que firmó ───────────────────────────────────
// El `SignerInfo` lleva, entre sus atributos firmados, el `messageDigest`: el hash
// de los bytes que el firmante tenía delante. Comparándolo con el hash de los bytes
// que el PDF tiene HOY se sabe si el documento es el que se firmó o se ha tocado
// después — que es exactamente lo que denuncia un lector con "el rango de bytes de
// la firma no es válido".
//
// Sigue sin ser una verificación de VALIDEZ: no se comprueba la cadena de
// confianza, ni la revocación, ni que la firma la hiciera de verdad ese
// certificado (eso exige su clave pública y es trabajo del validador oficial). Lo
// que se afirma aquí es más estrecho y más duro: "la firma NO cubre este
// documento", que es un hecho comprobable con el fichero en la mano.
const OID_MESSAGE_DIGEST = '2a864886f70d010904';   // 1.2.840.113549.1.9.4
const HASHES = {
    '2b0e03021a': 'sha1',
    '608648016503040204': 'sha224',
    '608648016503040201': 'sha256',
    '608648016503040202': 'sha384',
    '608648016503040203': 'sha512',
};

/**
 * Por cada SignerInfo: qué hash usa y qué digest del documento declara.
 * Devuelve [] si el PKCS#7 no se puede recorrer — "no he sabido leerlo", que no
 * es lo mismo que "está mal".
 */
function leerDigestsPkcs7(der) {
    const raiz = tlv(der, 0);
    if (!raiz || !esSeq(raiz)) return [];
    const nivel1 = hijos(der, raiz);
    if (!nivel1.length || nivel1[0].tag !== 0x06 || !bytes(der, nivel1[0]).equals(OID_SIGNED_DATA)) return [];
    const explicito = nivel1[1];
    if (!explicito) return [];
    const sd = hijos(der, explicito)[0];
    if (!esSeq(sd)) return [];

    // El SET OF SignerInfo es el ÚLTIMO SET del SignedData: los anteriores son
    // `digestAlgorithms` y, si viene, el de CRLs.
    const partes = hijos(der, sd);
    let signerInfos = null;
    for (const p of partes) if (p.tag === 0x31) signerInfos = p;
    if (!signerInfos) return [];

    const out = [];
    for (const si of hijos(der, signerInfos)) {
        if (!esSeq(si)) continue;
        const campos = hijos(der, si);
        // SignerInfo ::= SEQ { version, sid, digestAlgorithm, [0] signedAttrs?, … }
        const algo = campos[2] && esSeq(campos[2]) ? hijos(der, campos[2])[0] : null;
        const algoritmo = algo && algo.tag === 0x06 ? HASHES[hex(der, algo)] || null : null;

        let messageDigest = null;
        const signedAttrs = campos.find(c => c.tag === 0xa0);
        if (signedAttrs) {
            for (const attr of hijos(der, signedAttrs)) {
                if (!esSeq(attr)) continue;
                const ac = hijos(der, attr);
                if (!ac.length || ac[0].tag !== 0x06 || hex(der, ac[0]) !== OID_MESSAGE_DIGEST) continue;
                const valores = ac[1] ? hijos(der, ac[1]) : [];
                const octeto = valores.find(v => v.tag === 0x04);
                if (octeto) messageDigest = hex(der, octeto);
            }
        }
        out.push({ algoritmo, messageDigest });
    }
    return out;
}

// Lo que sobra tras la última firma: un `%%EOF` con sus saltos de línea es normal
// (el propio firmante lo escribe al cerrar la revisión); cualquier otra cosa son
// bytes añadidos DESPUÉS de firmar.
const SOLO_CIERRE = /^[\s\r\n]*(%%EOF[\s\r\n]*)?$/;

/**
 * ¿La firma `d` cubre este documento?
 *
 * @returns {{ ok: boolean|null, cubreHasta: number|null, problemas: string[], algoritmo: string|null }}
 *   `ok: null` = no se ha podido comprobar (y eso NO se cuenta como rota: ver
 *   la regla de `leerFirmasPdf`).
 */
function integridadDeFirma(buffer, txt, d, cubreMaximo) {
    const problemas = [];
    const total = buffer.length;
    const br = d.byteRange;

    if (!br) {
        return { ok: null, cubreHasta: null, algoritmo: null, problemas: ['la firma no declara su rango de bytes'] };
    }
    const [ini1, len1, ini2, len2] = br;
    const cubreHasta = ini2 + len2;

    // 1. El hueco del /ByteRange tiene que ser EXACTAMENTE el `<…>` de la firma.
    //    Si no lo es, el rango describe otro fichero: es el caso del PDF que vuelve
    //    alterado de un trayecto que le cambió bytes por el camino.
    if (ini1 !== 0 || ini1 + len1 !== d.contentsIni || ini2 !== d.contentsFin) {
        problemas.push('el rango de bytes de la firma no encaja con el documento (se ha alterado después de firmarlo)');
    }

    // 2. Truncamiento: la firma declara más fichero del que hay.
    if (cubreHasta > total) {
        problemas.push(`el documento está incompleto: la firma cubre ${cubreHasta} bytes y el fichero tiene ${total}`);
    } else if (cubreHasta === cubreMaximo && cubreHasta < total
        // Lo que sobra se mira ACOTADO: un `slice` del sobrante de un CIFO de 9 MB
        // copiaría 9 MB para leer cuatro caracteres. Y pasado ese tamaño ya no hay
        // nada que interpretar — un cierre de PDF no ocupa 2 KB.
        && (total - cubreHasta > 2048 || !SOLO_CIERRE.test(txt.slice(cubreHasta, cubreHasta + 2048)))) {
        // 3. Bytes añadidos tras la ÚLTIMA firma. Una firma anterior que no llega al
        //    final es lo normal en un PDF con varias (cada una cierra su revisión y
        //    la siguiente escribe detrás), así que solo se mira la que llega más lejos.
        problemas.push(`hay ${total - cubreHasta} bytes escritos después de la firma (se ha modificado el documento tras firmarlo)`);
    }

    // 4. El hash de lo firmado contra el hash de lo que hay hoy.
    let algoritmo = null;
    if (!problemas.length) {
        let digests = [];
        try { digests = leerDigestsPkcs7(d.der); } catch (_) { digests = []; }
        const conDigest = digests.find(x => x.messageDigest && x.algoritmo);
        if (conDigest) {
            algoritmo = conDigest.algoritmo;
            try {
                const firmado = Buffer.concat([
                    buffer.subarray(ini1, ini1 + len1),
                    buffer.subarray(ini2, cubreHasta),
                ]);
                const actual = require('crypto').createHash(conDigest.algoritmo).update(firmado).digest('hex');
                if (actual !== conDigest.messageDigest.toLowerCase()) {
                    problemas.push('el contenido del documento no es el que se firmó (el resumen criptográfico no coincide)');
                }
            } catch (_) {
                // Un algoritmo que este Node no soporta no convierte la firma en rota.
                return { ok: null, cubreHasta, algoritmo, problemas };
            }
        } else {
            // Sin messageDigest legible no se puede afirmar nada del contenido; lo que
            // sí se ha comprobado (rango y truncamiento) ya ha pasado.
            return { ok: null, cubreHasta, algoritmo: null, problemas };
        }
    }

    return { ok: problemas.length === 0, cubreHasta, algoritmo, problemas };
}

// ─── Los diccionarios de firma del PDF ───────────────────────────────────────
// Se localizan por su `/Contents<…>`: es lo único que siempre está y siempre es
// un blob largo en hexadecimal. Las demás claves del diccionario (`/SubFilter`,
// `/M`, `/Name`) viven pegadas a él, así que se buscan en una ventana acotada
// alrededor — el orden de las claves cambia según quién firme.
const VENTANA = 2500;

function diccionariosDeFirma(txt) {
    const out = [];
    const re = /\/Contents\s*<([0-9A-Fa-f\s]{400,})>/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
        const crudo = m[1].replace(/\s+/g, '');
        if (!/^3082|^3081|^30/.test(crudo)) continue;         // el PKCS#7 es un SEQUENCE DER
        const antes = txt.slice(Math.max(0, m.index - VENTANA), m.index);
        const despues = txt.slice(re.lastIndex, re.lastIndex + VENTANA);
        const contexto = antes + despues;
        // Offsets EN BYTES del blob dentro del fichero. `txt` es latin1, así que un
        // carácter es un byte y la posición del string ES el offset — de eso vive la
        // comprobación del /ByteRange (ver `integridadDeFirma`).
        const contentsIni = m.index + m[0].indexOf('<');       // el propio '<'
        const contentsFin = re.lastIndex;                      // justo tras el '>'
        const br = contexto.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
        out.push({
            der: Buffer.from(crudo.replace(/(00)+$/, '').length % 2 ? crudo.slice(0, -1) : crudo, 'hex'),
            subfiltro: (contexto.match(/\/SubFilter\s*\/([A-Za-z0-9.]+)/) || [])[1] || null,
            nombreDeclarado: (contexto.match(/\/Name\s*\(([^)]*)\)/) || [])[1] || null,
            fecha: (contexto.match(/\/M\s*\(D:(\d{14})/) || [])[1] || null,
            contentsIni,
            contentsFin,
            byteRange: br ? [Number(br[1]), Number(br[2]), Number(br[3]), Number(br[4])] : null,
        });
    }
    return out;
}

const esPdf = (b) => Buffer.isBuffer(b) && b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

// "D:20260908143012" → 08/09/2026
function fechaLegible(m) {
    if (!m) return null;
    return `${m.slice(6, 8)}/${m.slice(4, 6)}/${m.slice(0, 4)}`;
}

// El nombre que se le enseña a una persona: los certificados españoles escriben
// el CN de tres maneras ("APELLIDOS NOMBRE - NIF …", "NOMBRE APELLIDOS", o el
// pseudónimo), así que se compone de givenName+surname cuando existen y se cae al
// CN limpio de la coletilla del NIF.
function nombreFirmante(subject) {
    if (!subject) return null;
    const compuesto = [subject.nombre, subject.apellidos].filter(Boolean).join(' ').trim();
    if (compuesto) return compuesto;
    return String(subject.cn || '').replace(/\s*[-–]\s*(NIF|DNI|NIE).*$/i, '').trim() || null;
}

// El NIF viaja en `serialNumber` ("IDCES-06282551D") o dentro del propio CN.
function nifFirmante(subject) {
    if (!subject) return null;
    const fuentes = [subject.serialNumber, subject.cn, subject.pseudonimo].filter(Boolean).join(' ');
    const m = fuentes.match(/\b([XYZ]?\d{7,8}[A-Z])\b/i);
    return m ? m[1].toUpperCase() : null;
}

// Un PDF entero cierra con `%%EOF`. Se busca en la COLA y no se exige que sea el
// último byte: hay PDFs con relleno detrás que se abren perfectamente (mismo
// criterio que `pdfIncompleto` en el frontend, que hace esta guardia antes de
// llamar a Autofirma).
const pdfCompleto = (txt) => txt.slice(-4096).includes('%%EOF');

/**
 * Lee las firmas electrónicas de un PDF y comprueba que cubren el documento.
 *
 * @param {Buffer} buffer
 * @returns {{
 *   esPdf: boolean, firmada: boolean, completo: boolean, n: number,
 *   firmantes: Array<{ nombre: string|null, nif: string|null, organizacion: string|null,
 *                      cn: string|null, subfiltro: string|null, nombreDeclarado: string|null,
 *                      fecha: string|null, leido: boolean,
 *                      integridad: { ok: boolean|null, problemas: string[], algoritmo: string|null } }>,
 *   integridad: { ok: boolean|null, rota: boolean, comprobadas: number, problemas: string[] },
 *   avisos: string[],
 * }}
 *
 * REGLA — `rota` solo es true cuando se ha PODIDO comprobar y NO cuadra. Lo que no
 * se sabe leer sale como `ok: null`, nunca como rota: un falso positivo aquí para
 * un expediente que está bien, y lo que se para es una firma buena.
 */
function leerFirmasPdf(buffer) {
    const salida = {
        esPdf: esPdf(buffer), firmada: false, completo: false, n: 0, firmantes: [],
        integridad: { ok: null, rota: false, comprobadas: 0, problemas: [] },
        avisos: [],
    };
    if (!salida.esPdf) return salida;

    const txt = buffer.toString('latin1');
    salida.completo = pdfCompleto(txt);
    if (!salida.completo) {
        salida.integridad.rota = true;
        salida.integridad.ok = false;
        salida.integridad.problemas.push('el PDF está incompleto: le falta el final del fichero');
    }
    const dicts = diccionariosDeFirma(txt);
    if (!dicts.length) {
        // Puede haber un `/ByteRange` sin que se haya podido aislar el blob: entonces
        // el PDF SÍ está firmado y lo que falla es la lectura. Decirlo es lo que
        // separa "no está firmado" de "no he sabido leer la firma".
        if (/\/ByteRange/.test(txt) && /\/Type\s*\/Sig\b/.test(txt)) {
            salida.firmada = true;
            salida.avisos.push('El PDF declara una firma pero no se ha podido leer su certificado.');
        }
        return salida;
    }

    // Una firma que no llega al final del fichero es lo NORMAL cuando hay varias:
    // cada una cierra su revisión y la siguiente escribe detrás. Por eso solo se le
    // exige llegar al final a la que llega más lejos.
    const cubreMaximo = Math.max(...dicts.map(d => (d.byteRange ? d.byteRange[2] + d.byteRange[3] : 0)));

    for (const d of dicts) {
        const integridad = integridadDeFirma(buffer, txt, d, cubreMaximo);
        salida.integridad.problemas.push(...integridad.problemas);
        if (integridad.ok === true) salida.integridad.comprobadas++;
        if (integridad.ok === false) salida.integridad.rota = true;

        let subjects = null;
        try { subjects = leerPkcs7(d.der); } catch (_) { subjects = null; }
        if (!subjects || !subjects.length) {
            salida.firmantes.push({
                nombre: d.nombreDeclarado || null, nif: null, organizacion: null, cn: null,
                subfiltro: d.subfiltro, nombreDeclarado: d.nombreDeclarado,
                fecha: fechaLegible(d.fecha), leido: false, integridad,
            });
            salida.avisos.push('Una de las firmas no se ha podido leer del certificado; se usa el nombre que declara el PDF.');
            continue;
        }
        for (const s of subjects) {
            salida.firmantes.push({
                nombre: nombreFirmante(s) || d.nombreDeclarado || null,
                nif: nifFirmante(s),
                organizacion: s?.organizacion || null,
                cn: s?.cn || null,
                subfiltro: d.subfiltro,
                nombreDeclarado: d.nombreDeclarado,
                fecha: fechaLegible(d.fecha),
                leido: !!s,
                integridad,
            });
        }
    }
    salida.n = salida.firmantes.length;
    salida.firmada = salida.n > 0;
    // Los problemas se repiten cuando varias firmas fallan por lo mismo: se agrupan
    // (regla del informe que no repite el mismo aviso por cada elemento).
    salida.integridad.problemas = [...new Set(salida.integridad.problemas)];
    if (salida.integridad.ok !== false) {
        salida.integridad.ok = salida.integridad.rota ? false
            : (salida.integridad.comprobadas > 0 ? true : null);
    }
    return salida;
}

// ─── Comparar un firmante con la persona que se ESPERA ───────────────────────
// Sin tildes, en mayúsculas y por palabras: el certificado escribe "MOYA LOPEZ
// FRANCISCO JAVIER" y la base de datos "Francisco Javier Moya López".
const normalizarNombre = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const nifIgual = (a, b) => {
    const n = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return !!n(a) && n(a) === n(b);
};

/**
 * ¿Firma esta persona? El NIF es prueba; el nombre, indicio.
 *
 * Con NIF en el certificado y NIF esperado, manda el NIF y punto. Si no lo hay se
 * comparan las PALABRAS del nombre: todas las del esperado (de 3 letras o más)
 * tienen que estar en el certificado, en cualquier orden. Un "Pedro" que aparezca
 * dentro de "Pedro José" cuenta; un apellido que no está, no.
 *
 * @returns {{ coincide: boolean, por: 'nif'|'nombre'|null, motivo: string|null }}
 */
function firmanteCoincide(firmante, esperado = {}) {
    if (!firmante) return { coincide: false, por: null, motivo: 'sin firmante' };
    if (esperado.nif && firmante.nif) {
        return nifIgual(esperado.nif, firmante.nif)
            ? { coincide: true, por: 'nif', motivo: null }
            : { coincide: false, por: 'nif', motivo: `el certificado es de ${firmante.nif}, no de ${esperado.nif}` };
    }
    const esperadas = normalizarNombre(esperado.nombre).split(' ').filter(w => w.length >= 3);
    if (!esperadas.length) return { coincide: false, por: null, motivo: 'no consta a quién esperar' };
    const enCert = normalizarNombre([firmante.nombre, firmante.cn, firmante.nombreDeclarado].filter(Boolean).join(' '));
    const faltan = esperadas.filter(w => !enCert.includes(w));
    return faltan.length
        ? { coincide: false, por: 'nombre', motivo: `el certificado dice "${firmante.nombre || firmante.cn}"` }
        : { coincide: true, por: 'nombre', motivo: null };
}

module.exports = {
    leerFirmasPdf,
    firmanteCoincide,
    normalizarNombre,
    // Exportados para las pruebas
    leerPkcs7,
    diccionariosDeFirma,
    leerDigestsPkcs7,
    integridadDeFirma,
};
