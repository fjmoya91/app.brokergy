// App de certificadores — piezas sin BD ni red: tokens, nombres, barrido, saneado.
//   node scripts/test_certapp_unidad.js   (desde implementation/backend)
// Ver docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
const path = require('path');
const B = path.join(__dirname, '..');
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

let fallos = 0;
let total = 0;
function ok(cond, texto) {
    total++;
    if (!cond) fallos++;
    console.log(`${cond ? '✓' : '✗'} ${texto}`);
}

(async () => {
    const tokens = require(path.join(B, 'services/certapp/tokens'));
    const cuenta = '11111111-2222-3333-4444-555555555555';

    // ── Tokens de cuenta ────────────────────────────────────────────────────
    const t = tokens.firmarCuenta('a', cuenta, 'nonce1');
    const d = tokens.leerCuenta(t);
    ok(d && d.tipo === 'a' && d.cuentaId === cuenta, 'el token de activar se lee (tipo y cuenta)');
    ok(tokens.verificarCuenta(d, 'nonce1').ok, 'el token vale con su nonce');
    ok(!tokens.verificarCuenta(d, 'nonce2').ok && tokens.verificarCuenta(d, 'nonce2').motivo === 'firma', 'rotado el nonce, el token deja de valer (un solo uso)');
    const manipulado = t.replace(/\.(\d+)\./, (m, n) => `.${Number(n) + 99999}.`);
    ok(!tokens.verificarCuenta(tokens.leerCuenta(manipulado), 'nonce1').ok, 'alargar la caducidad a mano rompe la firma');
    const otraCuenta = t.replace(cuenta, '99999999-2222-3333-4444-555555555555');
    ok(!tokens.verificarCuenta(tokens.leerCuenta(otraCuenta), 'nonce1').ok, 'cambiar la cuenta rompe la firma');
    const caducado = tokens.firmarCuenta('r', cuenta, 'n', -60_000 * 5);
    ok(tokens.verificarCuenta(tokens.leerCuenta(caducado), 'n').motivo === 'caducado', 'un token caducado dice «caducado»');
    const comoRecuperar = 'r' + t.slice(1);
    ok(!tokens.verificarCuenta(tokens.leerCuenta(comoRecuperar), 'nonce1').ok, 'un token de activar no vale como de recuperar');
    ok(tokens.leerCuenta('basura') === null && tokens.leerCuenta('') === null, 'un token mal formado no se lee');

    // ── Ficheros (miniaturas y descargas) ──────────────────────────────────
    const obra = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const f = tokens.firmarFichero(obra, 'driveABC123456');
    ok(tokens.verificarFichero(obra, 'driveABC123456', f), 'la firma de un fichero vale');
    ok(!tokens.verificarFichero(obra, 'driveOTRO123456', f), 'no vale para otro fichero');
    ok(!tokens.verificarFichero('aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', 'driveABC123456', f), 'no vale para otra obra');
    ok(f === tokens.firmarFichero(obra, 'driveABC123456'), 'la URL es estable dentro de la hora (cacheable)');
    ok(!tokens.verificarFichero(obra, 'driveABC123456', tokens.firmarFichero(obra, 'driveABC123456', -3 * 3600_000)), 'una firma caducada no vale');

    // ── Carpetas de Drive ───────────────────────────────────────────────────
    const drive = require(path.join(B, 'services/certapp/drive'));
    ok(drive.nombreCarpetaCuenta({ nombre: 'Ana', apellidos: 'García López', email: 'Ana@Ejemplo.ES' }) === 'GARCÍA LÓPEZ, ANA · ana@ejemplo.es', 'carpeta de la cuenta: «APELLIDOS, NOMBRE · email»');
    ok(drive.nombreCarpetaCuenta({ email: 'x@y.es' }) === 'x@y.es', 'carpeta de la cuenta sin nombre: el email');
    ok(drive.nombreCarpetaObra({ numero_expediente: '2026EXT_7', nombre: 'Juan / Pérez' }) === '2026EXT_7 - JUAN PÉREZ', 'carpeta de la obra: «{nº} - NOMBRE», sin barras');
    ok(drive.SUB_CEE === '1. CEE' && drive.SUB_DOCS === '4. DOCUMENTACIÓN PARA CEE', 'subcarpetas = las de los CEE directos');

    // ── Ficheros de la entrega ─────────────────────────────────────────────
    const { elegirFicheros } = require(path.join(B, 'services/certapp/entrega'));
    const e = elegirFicheros([
        { id: '1', name: '2026EXT_7 - CEE_REVISAR.cex' }, { id: '2', name: '2026EXT_7 - CEE_REVISAR_OLD1.cex' },
        { id: '3', name: '2026EXT_7 - CEE_REVISAR.pdf' }, { id: '4', name: '2026EXT_7 - CEE INICIAL_CROQUIS.pdf' },
        { id: '5', name: '2026EXT_7 - CEE_REVISAR.xml' },
    ], '2026EXT_7');
    ok(e.cex?.id === '1' && e.pdf?.id === '3' && e.croquis?.id === '4' && e.xml?.id === '5', 'entrega: elige .cex, PDF, croquis y XML (no el _OLD)');

    // ── La lógica del cuestionario, la MISMA que el navegador ──────────────
    const { cuestionario } = require(path.join(B, 'services/certapp/logica'));
    const L = await cuestionario();
    ok(typeof L.barrido === 'function' && Array.isArray(L.SLOTS), 'el servidor carga cuestionario.js (ESM)');
    const vacia = L.barrido({}, null);
    ok(!vacia.listo && vacia.bloqueantes.some(b => b.id === 'ref_catastral'), 'barrido de una obra vacía: bloquea');
    const completa = {
        ref_catastral: '1234567VK1234N0001AB', direccion: 'CALLE X 1', municipio: 'TOLEDO', superficie_catastro: 90,
        titular: { nombre: 'Juan' }, proposito: 'COMPRAVENTA',
        cuestionario: { tipo_edificio: 'UNIFAMILIAR_AISLADA', colinda_no_calefactado: false, calefaccion: 'gas', acs: 'misma_caldera' },
    };
    const b = L.barrido(completa, null);
    ok(b.listo, `barrido de una obra completa: listo (bloqueantes: ${b.bloqueantes.map(x => x.id).join(',') || 'ninguno'})`);
    const saneado = L.sanearCuestionario({ calefaccion: 'gas', inventado: 'x', notas: 'a'.repeat(5000), fotos_decision: { CALDERA: 'GENERICA', MALO: 'GENERICA' } });
    ok(!('inventado' in saneado) && saneado.notas.length === 2000 && saneado.fotos_decision.CALDERA === 'GENERICA' && !saneado.fotos_decision.MALO, 'sanearCuestionario quita lo desconocido y recorta');
    const placa = L.SLOTS.find(s => s.id === 'FOTO_PLACA_CALDERA');
    ok(`${placa.label.toUpperCase()} 1.jpg` === 'PLACA DE LA CALDERA 1.jpg', 'nombre de la foto: «PLACA DE LA CALDERA 1.jpg»');

    // ── Titular saneado ─────────────────────────────────────────────────────
    const obras = require(path.join(B, 'services/certapp/obras'));
    const tit = obras.sanearTitular({ nombre: '  Juan  ', nif: '12.345.678-z', email: 'MAL', telefono: '600 000 000', hack: '<script>', es_empresa: true });
    ok(tit.nombre === 'Juan' && tit.nif === '12345678Z' && !tit.email && !('hack' in tit) && tit.es_empresa === true, 'titular: recorta, normaliza el NIF, quita el email malo y lo desconocido');
    const pub = obras.obraParaCertificador({ id: 'x', portal_token: 'secreto', drive_folder_id: 'd', drive_folder_link: 'l', cee: { xml: 'x' }, documentacion: { reforma_uploads: { A: [] }, interno: 1 } });
    ok(!pub.portal_token && !pub.drive_folder_id && !pub.cee && !pub.documentacion.interno && pub.documentacion.reforma_uploads, 'la obra del certificador no lleva token, carpeta ni el cee interno');

    // ── La cuenta pública ───────────────────────────────────────────────────
    const { cuentaPublica } = require(path.join(B, 'services/certapp/comun'));
    const cp = cuentaPublica({ id: 'c', email: 'a@b.es', auth_user_id: 'u', prefs: { pwd_nonce: 'n' }, drive_folder_id: 'd', creditos: 3 });
    ok(!('auth_user_id' in cp) && !('prefs' in cp) && !('drive_folder_id' in cp) && cp.creditos === 3, 'GET /me: la cuenta sin internos (ni auth_user_id, ni prefs, ni carpeta)');

    // ── Asistente: historial capado ────────────────────────────────────────
    const asis = require(path.join(B, 'services/certapp/asistente'));
    const h = asis.limpiarHistorial(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(5000) })).concat([{ role: 'user', content: '¿y?' }]));
    ok(h.length <= 12 && h.every(m => m.content.length <= 2000 * 2 + 2) && h[h.length - 1].role === 'user', 'asistente: ≤12 mensajes, ≤2.000 caracteres, acaba en pregunta');
    ok(Math.abs(asis.costeUsd('claude-haiku-5-5', { input_tokens: 1e6, output_tokens: 1e6 }) - 0.60) < 1e-9, 'asistente: el coste sale de la tabla PRECIOS');
    const ini = new Date(asis.inicioDiaMadrid(new Date('2026-07-15T21:30:00Z')));
    ok(ini.toISOString() === '2026-07-15T22:00:00.000Z' || ini.toISOString() === '2026-07-14T22:00:00.000Z', `asistente: el día se cuenta desde la medianoche de Madrid (${ini.toISOString()})`);
    process.env.CERTAPP_ASISTENTE_ENABLED = 'false';
    try { await asis.preguntar({ cuenta: { id: cuenta }, mensajes: [{ role: 'user', content: 'hola' }] }); ok(false, 'asistente apagado: 503'); }
    catch (err) { ok(err.status === 503 && err.code === 'ASISTENTE_APAGADO', 'asistente apagado: 503 amable'); }
    ok(!/brokergy/i.test(asis.SISTEMA), 'el prompt del asistente no nombra a BROKERGY');

    // ── Tipos por los BYTES (#1) ────────────────────────────────────────────
    const tipos = require(path.join(B, 'services/certapp/tipos'));
    const relleno = Buffer.alloc(64, 0);
    const bytes = (cabeza) => Buffer.concat([Buffer.isBuffer(cabeza) ? cabeza : Buffer.from(cabeza, 'latin1'), relleno]);
    const ftyp = (marca) => bytes(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${marca}`, 'latin1')]));
    const JPG = bytes(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    const casosTipo = [
        [JPG, 'jpg'], [bytes(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'png'],
        [bytes('RIFF\x00\x00\x00\x00WEBPVP8 '), 'webp'], [ftyp('heic'), 'heic'], [ftyp('mif1'), 'heif'],
        [ftyp('qt  '), 'mov'], [ftyp('isom'), 'mp4'], [bytes('%PDF-1.7\n'), 'pdf'],
        [bytes("S'CEXv2.3 Residencial'\np0\n"), 'cex'], [bytes("S'CE3Xv3.2 Residencial'\np0\n"), 'cex'],
        [Buffer.from('<?xml version="1.0"?><DatosEnergeticosDelEdificio><IdentificacionEdificio/></DatosEnergeticosDelEdificio>'), 'xml'],
    ];
    ok(casosTipo.every(([b, ext]) => tipos.detectar(b)?.ext === ext), `tipos: jpg, png, webp, heic, mov, mp4, pdf, .cex y XML de CEE se reconocen por los bytes [${casosTipo.map(([b]) => tipos.detectar(b)?.ext).join(',')}]`);
    const malos = [
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>'),
        Buffer.from('<!doctype html><html><script>alert(1)</script></html>'),
        Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
        Buffer.from('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><DatosEnergeticosDelEdificio>&e;</DatosEnergeticosDelEdificio>'),
        Buffer.from('<?xml version="1.0"?><DatosEnergeticosDelEdificio><script>alert(1)</script></DatosEnergeticosDelEdificio>'),
        Buffer.from('GIF89a' + 'x'.repeat(40)), Buffer.from('function(){alert(1)}' + ' '.repeat(40)),
    ];
    ok(malos.every(b => tipos.detectar(b) === null), 'tipos: SVG, HTML, XML con script/entidades, GIF y JS NO se reconocen (no entran)');
    const SL = Object.fromEntries(L.SLOTS.map(s => [s.id, s]));
    const CEX = bytes("S'CEXv2.3 Residencial'\np0\n");
    ok(tipos.motivoTipo(SL.FOTO_FACHADA_PRINCIPAL, tipos.detectar(bytes('%PDF-1.7')), 'certificador') && !tipos.motivoTipo(SL.FOTO_FACHADA_PRINCIPAL, tipos.detectar(JPG), 'certificador'),
        'tipos: en un apartado de fotos solo fotos');
    ok(tipos.motivoTipo(SL.VIDEO_VIVIENDA, tipos.detectar(JPG), 'certificador') && !tipos.motivoTipo(SL.VIDEO_VIVIENDA, tipos.detectar(ftyp('qt  ')), 'certificador'),
        'tipos: en el vídeo solo MP4 o MOV');
    ok(!tipos.motivoTipo(SL.DOC_CEE_EXISTENTE, tipos.detectar(CEX), 'certificador') && tipos.motivoTipo(SL.DOC_CEE_EXISTENTE, tipos.detectar(CEX), 'cliente')
        && !tipos.motivoTipo(SL.DOC_CEE_EXISTENTE, tipos.detectar(bytes('%PDF-1.7')), 'cliente'),
        'tipos (#7): el .cex lo sube el certificador; el propietario, en DOC_*, solo PDF o fotos');
    const docs = require(path.join(B, 'services/certapp/docs'));
    const svgComoJpg = { originalname: 'foto.jpg', mimetype: 'image/jpeg', size: 200, buffer: malos[0] };
    ok(docs.revisarFichero(SL.FOTO_FACHADA_PRINCIPAL, svgComoJpg, 'certificador').motivo, 'un SVG con nombre y mimetype de JPEG se rechaza (manda el contenido)');
    ok(docs.revisarFichero(SL.DOC_CEE_EXISTENTE, { originalname: 'a.cex', size: CEX.length, buffer: CEX }, 'cliente').motivo
        && docs.revisarFichero(SL.DOC_CEE_EXISTENTE, { originalname: 'a.cex', size: CEX.length, buffer: CEX }, 'certificador').tipo?.ext === 'cex',
        'docs: el .cex desde el portal se rechaza; desde el certificador entra como .cex');

    // ── Cabeceras de /fichero y /thumb (#1) ────────────────────────────────
    const resFalsa = () => { const h = {}; return { h, set: (k, v) => { h[k.toLowerCase()] = v; } }; };
    const rSvg = resFalsa(); tipos.cabecerasFichero(rSvg, { mime: 'image/svg+xml', nombre: 'x.svg' });
    const rHtml = resFalsa(); tipos.cabecerasFichero(rHtml, { mime: 'text/html', nombre: 'x.html' });
    const rPdf = resFalsa(); tipos.cabecerasFichero(rPdf, { mime: 'application/pdf', nombre: 'CEE.pdf' });
    const seguras = (r) => r.h['x-content-type-options'] === 'nosniff' && /default-src 'none'/.test(r.h['content-security-policy'] || '') && /sandbox/.test(r.h['content-security-policy'] || '');
    ok([rSvg, rHtml].every(r => r.h['content-type'] === 'application/octet-stream' && /^attachment;/.test(r.h['content-disposition'])) && seguras(rSvg) && seguras(rHtml),
        'cabeceras: SVG o HTML de Drive salen como descarga octet-stream, con nosniff y CSP sandbox');
    ok(rPdf.h['content-type'] === 'application/pdf' && /^inline;/.test(rPdf.h['content-disposition']) && seguras(rPdf), 'cabeceras: el PDF en línea, también con nosniff y CSP sandbox');
    const disp = tipos.disposicion('attachment', 'a"b\\c\r\nSet-Cookie: x.pdf');
    ok(!/[\r\n]/.test(disp) && !/a"b/.test(disp) && !/\\/.test(disp), 'Content-Disposition: sin comillas, barras ni saltos de línea del nombre');

    // ── Firmas distintas para miniatura y fichero (#6) ─────────────────────
    const fm = tokens.firmarMiniatura(obra, 'driveABC123456');
    ok(tokens.verificarMiniatura(obra, 'driveABC123456', fm) && !tokens.verificarFichero(obra, 'driveABC123456', fm), 'la firma de la miniatura no vale para descargar el fichero');
    ok(!tokens.verificarMiniatura(obra, 'driveABC123456', f), 'ni la del fichero para la miniatura');

    // ── Token del formulario de la beta (#3) ───────────────────────────────
    const ahora = Date.now();
    const ft = tokens.firmarFormulario(ahora - 10_000);
    ok(tokens.verificarFormulario(ft, ahora).ok, 'form_token de hace 10 s: vale');
    ok(tokens.verificarFormulario(tokens.firmarFormulario(ahora - 1000), ahora).motivo === 'pronto', 'form_token de hace 1 s: «pronto» (un bot que envía al momento)');
    ok(tokens.verificarFormulario(tokens.firmarFormulario(ahora - 3 * 3600_000), ahora).motivo === 'caducado', 'form_token de hace 3 h: «caducado»');
    const ftFalso = ft.replace(/\.[0-9a-f]{32}$/, `.${'0'.repeat(32)}`);
    const ftViejo = ft.replace(/^\d+/, (s) => String(Number(s) - 7200));
    ok(tokens.verificarFormulario(ftFalso, ahora).motivo === 'firma' && tokens.verificarFormulario(ftViejo, ahora).motivo === 'firma', 'form_token inventado o con la hora cambiada: «firma»');
    ok(tokens.verificarFormulario('basura').motivo === 'formato' && tokens.verificarFormulario(undefined).motivo === 'formato', 'form_token ausente o mal formado: «formato»');

    // ── Sin CERTAPP_TOKEN_SECRET en producción: cerrado (#8) ───────────────
    const { spawnSync } = require('child_process');
    const hijo = (secreto) => spawnSync(process.execPath, ['-e', `
        const t = require(${JSON.stringify(path.join(B, 'services/certapp/tokens'))});
        try { t.firmarFichero('a', 'b'); console.log('FIRMA'); } catch (e) { console.log('ERR', e.status, e.code); }`],
    { env: { ...process.env, NODE_ENV: 'production', CERTAPP_TOKEN_SECRET: secreto, SUPABASE_SERVICE_ROLE_KEY: 'no-debe-usarse' }, encoding: 'utf8' });
    const sin = hijo('');
    ok(/ERR 503 CERTAPP_SIN_SECRETO/.test(sin.stdout) && /CERTAPP_TOKEN_SECRET/.test(sin.stderr), 'producción sin CERTAPP_TOKEN_SECRET: 503 al firmar y aviso al arrancar (nunca una clave del repo)');
    ok(/FIRMA/.test(hijo('x'.repeat(64)).stdout), 'producción con CERTAPP_TOKEN_SECRET: firma');

    // ── IP de verdad (#3) ───────────────────────────────────────────────────
    const { ipDe, limitador, unaVez } = require(path.join(B, 'services/certapp/comun'));
    const req = (peer, h = {}) => ({ socket: { remoteAddress: peer }, headers: h });
    ok(ipDe(req('172.18.0.5', { 'x-real-ip': '83.1.2.3', 'x-forwarded-for': '1.1.1.1, 83.1.2.3' })) === '83.1.2.3', 'IP: detrás de nginx (peer de la red de Docker) manda X-Real-IP');
    ok(ipDe(req('::ffff:127.0.0.1', { 'x-forwarded-for': '1.2.3.4' })) === '::ffff:127.0.0.1', 'IP: X-Forwarded-For se ignora (lo escribe el cliente)');
    ok(ipDe(req('83.9.9.9', { 'x-real-ip': '1.2.3.4' })) === '83.9.9.9', 'IP: X-Real-IP de un peer público no se cree');
    ok(ipDe(req('10.0.0.2', { 'x-real-ip': '<script>' })) === '10.0.0.2', 'IP: un X-Real-IP que no es una IP no se usa');

    // ── Limitadores en memoria (#3) ────────────────────────────────────────
    const lim = limitador(2, 50);
    ok(lim('a') && lim('a') && !lim('a') && lim('b'), 'limitador: 2 por ventana y por clave');
    await new Promise(r => setTimeout(r, 70));
    lim.limpiar();
    ok(lim.claves() === 0 && lim('a'), 'limitador: la limpieza periódica suelta las claves vencidas');
    const una = unaVez(1000);
    ok(una('t1') && !una('t1'), 'unaVez: un form_token solo se usa una vez');
    una.liberar('t1');
    ok(una('t1'), 'unaVez: si el envío falla (400/503), se libera y se puede reenviar');

    // ── Beta (#3, #4) ───────────────────────────────────────────────────────
    const beta = require(path.join(B, 'services/certapp/beta'));
    const ns = beta.nombreSeguro('Ana <a href="https://malo.es/x">pincha aquí</a> ' + 'x'.repeat(100));
    ok(!/[<>:/."=]/.test(ns) && ns.length <= 60 && ns.startsWith('Ana'), `nombre saneado para el email: sin enlaces ni signos («${ns.slice(0, 30)}…»)`);
    ok(beta.nombreSeguro("María-José O'Neil Núñez") === "María-José O'Neil Núñez", 'nombre saneado: respeta tildes, guiones y apóstrofos');
    const fila = beta.filaDe({ nombre: 'Ana', email: 'ANA@x.es', consentimiento: true, web: '', form_token: ft, turnstile_token: 't' }, { ip: '83.1.2.3', userAgent: 'UA' });
    ok(fila.email === 'ana@x.es' && !('form_token' in fila.respuestas) && !('web' in fila.respuestas) && !('turnstile_token' in fila.respuestas) && fila.ip_hash && !fila.ip_hash.includes('83.1'),
        'beta: la fila sin honeypot ni tokens, la IP solo como huella');
    const av = (n) => beta.avisosQueTocan(n);
    ok(av(1).whatsapp === 'uno' && av(10).whatsapp === 'uno' && av(11).whatsapp === 'agrupado' && av(12).whatsapp === null && av(25).whatsapp === 'resumen',
        'beta: un WhatsApp por alta hasta 10 al día; luego uno que lo dice y uno cada 25');
    ok(av(40).email && !av(41).email && !av(null).email && av(null).whatsapp === null, 'beta: tope de 40 emails de confirmación al día; sin poder contar, nada');

    // ── Portal del propietario: caduca a los 30 días (#6) ──────────────────
    const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
    ok(obras.portalVigente({ portal_token: 'x', portal_token_at: hace(29) }) && !obras.portalVigente({ portal_token: 'x', portal_token_at: hace(31) }),
        'portal: vale 30 días desde que se creó o rotó');
    ok(!obras.portalVigente({ portal_token: 'x', portal_token_at: null }) && !obras.portalVigente({ portal_token: null, portal_token_at: hace(1) }), 'portal: sin fecha o sin token, no vale');
    ok(!('portal_token_at' in obras.obraParaCertificador({ id: 'x', portal_token_at: hace(1) })), 'la obra del certificador no lleva la fecha del token');
    try { obras.exigirBorrador({ estado: 'EN_PREPARACION' }); ok(false, 'obra pedida: 409 OBRA_CERRADA'); }
    catch (err) { ok(err.status === 409 && err.code === 'OBRA_CERRADA', 'obra pedida: 409 OBRA_CERRADA (#2-B)'); }

    // ── Cupo del asistente reservado ANTES de llamar (#8) ──────────────────
    const dia = '2026-10-24T00:00:00.000Z';
    const k1 = asis.reservarCupo('cuenta-x', 0, 2, dia);
    const k2 = asis.reservarCupo('cuenta-x', 0, 2, dia);
    ok(k1 && k2 && asis.reservarCupo('cuenta-x', 0, 2, dia) === null, 'asistente: dos preguntas a la vez no se saltan el cupo (la reserva cuenta antes de llamar)');
    asis.devolverCupo(k2);
    ok(asis.reservarCupo('cuenta-x', 0, 2, dia) !== null, 'asistente: si la llamada falla, la reserva se devuelve');

    // ── Miniaturas: tamaños acotados (#8) ──────────────────────────────────
    ok([1, 99999, 'abc', undefined].every(s => drive.TAMANOS_MINI.includes(drive.tamanoMini(s))), 'miniaturas: el tamaño pedido se lleva a uno de 3 (la caché no crece con ?sz=)');

    // ── Avisos: en seco por defecto ─────────────────────────────────────────
    delete process.env.CERTAPP_AVISOS_ENABLED;
    const avisos = require(path.join(B, 'services/certapp/avisos'));
    const r = await avisos.avisarPersona({ email: 'nadie@example.com', telefono: '600000000' }, { asunto: 'prueba', texto: 'hola', whatsapp: 'hola' });
    ok(r.seco === true && r.canales.length === 0, 'sin CERTAPP_AVISOS_ENABLED no sale nada (en seco)');

    console.log(`\n${total - fallos}/${total} correctas`);
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
