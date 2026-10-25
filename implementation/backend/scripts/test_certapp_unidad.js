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
    // Lo que sube el certificador convive con lo nuestro: gana el MÁS RECIENTE.
    const t0 = '2026-10-25T10:00:00Z', t1 = '2026-10-25T11:00:00Z', t2 = '2026-10-25T12:00:00Z';
    const e2 = elegirFicheros([
        { id: 'a', name: '2026EXT_7 - CEE_REVISAR.pdf', modifiedTime: t0 }, { id: 'b', name: '2026EXT_7 - CEE.pdf', modifiedTime: t1 },
        { id: 'c', name: '2026EXT_7 - CEE_fdo.pdf', modifiedTime: t2 }, { id: 'd', name: 'CATASTRO 1234567.pdf', modifiedTime: t2 },
        { id: 'e', name: '2026EXT_7 - CEE_REVISAR.xml', modifiedTime: t0 }, { id: 'f', name: '2026EXT_7 - CEE.xml', modifiedTime: t1 },
    ], '2026EXT_7');
    ok(e2.pdf?.id === 'b' && e2.xml?.id === 'f', 'entrega: de cada clase gana el más reciente (el definitivo que sube el certificador)');
    ok(e2.firmado?.id === 'c', 'entrega: el firmado posterior al PDF vale');
    ok(!['c', 'd'].includes(e2.pdf?.id), 'entrega: el PDF del certificado no es el firmado ni un PDF sin «CEE» (el del Catastro)');
    const e3 = elegirFicheros([
        { id: 'c', name: '2026EXT_7 - CEE_fdo.pdf', modifiedTime: t0 }, { id: 'b', name: '2026EXT_7 - CEE_REVISAR.pdf', modifiedTime: t1 },
    ], '2026EXT_7');
    ok(e3.pdf?.id === 'b' && e3.firmado === null, 'entrega: un firmado ANTERIOR al PDF actual no cuenta (se regeneró después)');

    // ── Los mensajes: uno de encargo y uno de «listo» ───────────────────────
    const obraMsg = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', numero_expediente: '2026EXT_7', titular: { nombre: 'Carmen', apellidos: 'Díaz' },
        direccion: 'CALLE MAYOR 1', municipio: 'Tomelloso', cee: { cee_inicial: { epnrLetra: 'E', emisionesLetra: 'D' } } };
    const cuentaMsg = { nombre: 'Laura', apellidos: 'Gómez', email: 'laura@example.com' };
    const enc = require(path.join(B, 'services/certapp/ia')).textoEncargo(obraMsg, cuentaMsg, { iaAuto: true });
    ok(/Encargo de CEE · 2026EXT_7/.test(enc) && /Certificador: Laura Gómez/.test(enc) && /Cliente: Carmen Díaz/.test(enc) && !/IA automática/.test(enc),
        'encargo: un mensaje con el nº, el certificador y el cliente (sin partes del proceso)');
    const listo = require(path.join(B, 'services/certapp/entrega')).textoListoEquipo(obraMsg, cuentaMsg);
    ok(/listo para revisar · 2026EXT_7/.test(listo) && /consumo E · emisiones D/.test(listo) && /envolvente/i.test(listo) && !/drive\.google/.test(listo),
        'listo: el nº, la calificación y la envolvente, sin enlaces de Drive');

    // ── La calificación en el PC: solo vale si aparece la marca ────────────
    const pc = require(path.join(B, 'scripts/asistente_pc'));
    const os = require('os');
    const logOk = path.join(os.tmpdir(), `calext-ok-${process.pid}.log`);
    const logMal = path.join(os.tmpdir(), `calext-mal-${process.pid}.log`);
    require('fs').writeFileSync(logOk, `calificado\n${pc.MARCA_CALIFICADA} 2026EXT_7\n`);
    require('fs').writeFileSync(logMal, 'CE3X no responde\n');
    ok(pc._resultadoCalificarExt(logOk).ok === true, 'PC: con la marca @@CALIFICADA_OK la calificación vale');
    ok(pc._resultadoCalificarExt(logMal).ok === false && /CE3X no responde/.test(pc._resultadoCalificarExt(logMal).texto), 'PC: sin la marca, falla y cuenta por qué');
    ok(pc._resultadoCalificarExt(logOk, 'cortado a los 20 min').ok === false, 'PC: cortado por tiempo no vale aunque haya marca');
    require('fs').rmSync(logOk, { force: true }); require('fs').rmSync(logMal, { force: true });
    let lanzo = null;
    try { pc.encolarCalificarExt({ numero: '26RES060_187' }); } catch (err) { lanzo = err; }
    ok(lanzo && /no es el número/.test(lanzo.message), 'PC: solo se encarga calificar una obra EXT');

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

    // ── Fotos opcionales con «Ahora no» y genérico con la antigüedad de CE3X (25/10/2026) ──
    const so = L.sanearCuestionario({
        fotos_omitidas: ['FOTO_VENTANAS', 'FOTO_VENTANAS', 'FOTO_FACHADA_PRINCIPAL', 'FOTO_PLACA_AIRE', 'NO_EXISTE'],
        fotos_decision: { AIRE: 'GENERICA', CALDERA: 'GENERICA' },
        fotos_antiguedad: { AIRE: 'ENTRE_1994_2013', CALDERA: 'ANTERIOR_1994', AEROTERMIA: 'DEL_1900' },
    });
    ok(so.fotos_omitidas.join() === 'FOTO_VENTANAS', '«Ahora no»: solo apartados opcionales, sin repetir (ni la fachada principal ni una placa)');
    ok(so.fotos_antiguedad.AIRE === 'ENTRE_1994_2013' && !('CALDERA' in so.fotos_antiguedad) && !('AEROTERMIA' in so.fotos_antiguedad),
        'antigüedad del genérico: solo bombas de calor y con las opciones de CE3X');
    ok(L.omitirFoto({}, 'FOTO_CUBIERTA').fotos_omitidas.join() === 'FOTO_CUBIERTA' && L.omitirFoto({ fotos_omitidas: ['FOTO_CUBIERTA'] }, 'FOTO_CUBIERTA', false).fotos_omitidas.length === 0
        && L.omitirFoto({}, 'FOTO_PLACA_CALDERA').fotos_omitidas.length === 0, 'omitirFoto marca y desmarca, y no deja omitir una placa');
    ok(L.placaDe('AIRE') === 'la placa del aire acondicionado' && L.placaDe('CALDERA') === 'la placa de la caldera' && L.placaDe('SOLAR') === 'una foto de las placas solares',
        'placaDe: «del aire acondicionado», nunca «de el»');
    ok(L.genericosDe(so).join(' | ') === 'el aire acondicionado (antigüedad en CE3X: entre 1994 y 2013) | la caldera', 'genericosDe: con la antigüedad al generador');
    const solar = L.estadoEquipos({ placas_fv: 'SI' }, { FOTO_PLACAS_SOLARES: [{ id: 'x' }] }).find(e => e.equipo === 'SOLAR');
    ok(solar?.completo === true, 'las placas solares (sin apartado de placa) quedan completas con su foto');
    const cv = { calefaccion: 'gas', fotos_omitidas: ['FOTO_CALDERA'], fotos_decision: {} };
    const conFachadas = { FOTO_FACHADA_PRINCIPAL: [{ id: 'a' }], FOTO_FACHADAS: [{ id: 'b' }] };
    ok(L.siguienteDeLaVisita(L.slotsAplicables(cv), cv, conFachadas) === 'FOTO_PLACA_CALDERA', 'visita guiada: se salta lo dejado con «Ahora no»');
    const cd = { ...cv, fotos_decision: { CALDERA: 'DESPUES' } };
    ok(L.siguienteDeLaVisita(L.slotsAplicables(cd), cd, conFachadas) === 'FOTO_VENTANAS', 'visita guiada: y la placa que se sube luego o va con un genérico');

    // ── «Lo que ha visto la IA» con el guion de CE3X: una línea por elemento ──
    // Las pantallas importan sin extensión (como Vite): el mismo gancho que test_alta_oportunidad.js.
    require('node:module').registerHooks({
        resolve(specifier, context, nextResolve) {
            try { return nextResolve(specifier, context); } catch (e) {
                if (!/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
                return nextResolve(`${specifier}.js`, context);
            }
        },
    });
    const FF = await import(require('url').pathToFileURL(path.join(B, '..', 'frontend/src/certificadores/obra/fasesFicha.js')).href);
    ok(FF.PESTANAS_CE3X.map(t => t.titulo).join(' · ') === 'Datos generales · Envolvente térmica · Instalaciones', 'fase 5: las pestañas de CE3X, en su orden');
    const ce = {
        tipo_edificio: 'UNIFAMILIAR_AISLADA', plantas: '2', cubierta: 'INCLINADA', aislamiento_cubierta: '', calefaccion: 'gasoleo', emisor: 'RADIADORES',
        acs: 'misma_caldera', aire_acondicionado: true, num_aires: '3', colinda_no_calefactado: true, colindantes: ['GARAJE'],
        fotos_decision: { AIRE: 'GENERICA' }, fotos_antiguedad: { AIRE: 'ANTERIOR_1994' }, origen: { cubierta: 'HABITUAL', plantas: 'CATASTRO' },
    };
    const inst = FF.elementosVisibles(FF.PESTANAS_CE3X[2], ce);
    ok(inst[0].titulo === 'Equipo mixto de calefacción y ACS', 'fase 5: caldera que también da el agua → «Equipo mixto de calefacción y ACS»');
    const refri = FF.lineaElemento(inst.find(e => e.id === 'refrigeracion'), ce);
    ok(refri.texto === '3 aparatos · equipo genérico (anterior a 1994)' && refri.origen === 'TU', `fase 5: el aire, con sus aparatos y la antigüedad del genérico («${refri.texto}»)`);
    const cub = FF.lineaElemento(FF.elementosVisibles(FF.PESTANAS_CE3X[1], ce).find(e => e.id === 'cubierta'), ce);
    ok(cub.origen === 'HABITUAL' && cub.supuesto, 'fase 5: un supuesto en el elemento se ve como supuesto');
    const part = FF.lineaElemento(FF.elementosVisibles(FF.PESTANAS_CE3X[1], ce).find(e => e.id === 'particion'), ce);
    ok(/^Linda con garaje/i.test(part.texto) && !/algo sin calefacción/.test(part.texto), `fase 5: la partición dice con qué linda, sin repetir el «sí» («${part.texto}»)`);

    // ── Barrido que no frena (Fran, 25/10/2026) y lo deducido ───────────────
    // Solo bloquean ref. catastral, dirección, titular y «para qué»; lo demás lo
    // completa la IA y sale como aviso.
    const minima = { ref_catastral: '1234567VK1234N0001AB', direccion: 'CALLE X 1', municipio: 'TOLEDO', titular: { nombre: 'Juan' }, cuestionario: { propositos: ['COMPRAVENTA'] } };
    const bm = L.barrido(minima, null);
    ok(bm.listo && bm.avisos.some(a => a.id === 'tipo_edificio'), `barrido: con ref., dirección, titular y «para qué» ya se puede pedir (bloqueantes: ${bm.bloqueantes.map(x => x.id).join(',') || 'ninguno'})`);
    ok(!L.barrido({ ...minima, cuestionario: {} }, null).listo, 'barrido: sin «para qué» bloquea');
    ok(L.propositosDe({ proposito: 'ALQUILER' })[0] === 'ALQUILER' && L.propositosDe({ cuestionario: { propositos: ['IRPF_AEROTERMIA', 'MALO'] } }).join() === 'IRPF_AEROTERMIA',
        '«para qué»: la lista del cuestionario (sin lo desconocido) o, si no hay, la columna');
    const sv = L.sanearCuestionario({
        propositos: ['COMPRAVENTA', 'X'], fases_ok: ['inmueble', 'otra'],
        cubierta: 'INCLINADA', origen: { cubierta: 'CATASTRO', fachada: 'FOTO', calefaccion: 'INVENTADO' },
        visto_ia: { at: '2026-10-25T10:00:00Z', dudas: [{ id: 'd', k: 'vidrio', pregunta: '¿?', opciones: [{ label: 'Doble', valores: { vidrio: 'DOBLE', hack: 1 } }, { label: 'Mala', valores: { vidrio: 'NO_EXISTE' } }] }], fotos: { cubierta: 'ab' } },
    });
    ok(sv.propositos.join() === 'COMPRAVENTA' && sv.fases_ok.join() === 'inmueble', 'saneado: «para qué» y fases solo con valores conocidos');
    ok(sv.origen.cubierta === 'CATASTRO' && !('fachada' in sv.origen) && !('calefaccion' in sv.origen), 'saneado: el origen solo de una clave CON valor y con un origen que existe');
    ok(sv.visto_ia.dudas[0].opciones.length === 1 && !('hack' in sv.visto_ia.dudas[0].opciones[0].valores) && !sv.visto_ia.fotos.cubierta,
        'saneado: las dudas de la IA sin valores inválidos ni claves raras; ids de foto con forma');
    const casa = {
        anio_construccion: 1978, cuestionario: { calefaccion: 'gasoleo' },
        catastro: { tipo: 'Parcela construida sin división horizontal', plantas: 1, construcciones: [{ tipo: 'VIVIENDA', planta: '00', superficie: 118 }, { tipo: 'APARCAMIENTO', planta: '00', superficie: 28 }] },
    };
    const dc = L.deduccionesCatastro(casa);
    ok(dc.valores.plantas === '1' && dc.origen.plantas === 'CATASTRO' && dc.valores.cubierta === 'INCLINADA' && dc.valores.vidrio === 'SIMPLE' && dc.origen.vidrio === 'EPOCA',
        'deducciones: casa de 1978 → 1 planta (Catastro), tejado (lo habitual), vidrio simple (su época)');
    ok(dc.dudas.some(d => d.k === 'tipo_edificio') && dc.dudas.some(d => d.k === 'colinda_no_calefactado'), 'deducciones: pregunta qué casa es y si el garaje está pegado');
    ok(dc.valores.emisor === 'RADIADORES' && dc.valores.acs === 'misma_caldera', 'deducciones: con caldera, radiadores y el agua caliente de la misma caldera (lo habitual)');
    const conSuya = L.aplicarDeducciones({ cubierta: 'PLANA' }, dc);
    ok(conSuya.cubierta === 'PLANA' && !conSuya.origen?.cubierta, 'deducciones: lo que contestó el certificador no se pisa nunca');
    const conSv = L.aplicarDeducciones({ ...casa.cuestionario }, { valores: { tipo_edificio: 'UNIFAMILIAR_ADOSADA', vidrio: 'DOBLE' }, origen: { tipo_edificio: 'STREETVIEW', vidrio: 'STREETVIEW' }, notas: {} });
    const dc2 = L.deduccionesCatastro({ ...casa, cuestionario: conSv });
    ok(dc2.dudas.some(d => d.k === 'tipo_edificio'), 'deducciones: lo que solo «parece» desde Street View se sigue preguntando');
    ok(L.aplicarDeducciones(conSv, dc2).vidrio === 'DOBLE', 'deducciones: lo de su época no pisa lo visto en Street View');
    ok(!('cubierta' in L.contestar({ cubierta: 'INCLINADA', origen: { cubierta: 'CATASTRO' } }, { cubierta: 'PLANA' }).origen), 'contestar: lo contestado pierde el origen (pasa a ser suyo)');

    // ── «Lo que ha visto la IA»: convertir lo que dice Gemini ──────────────
    const vistoIa = require(path.join(B, 'services/certapp/vistoIa'));
    ok(vistoIa.convertir('persianas', 'sí', L) === true && vistoIa.convertir('aire_acondicionado', 'false', L) === false, 'visto IA: sí/no → true/false');
    ok(vistoIa.convertir('potencia_kw', '24,5 kW', L) === '24,5' && vistoIa.convertir('anio_calefaccion', '1890', L) === undefined, 'visto IA: números con coma; un año imposible se descarta');
    ok(vistoIa.convertir('cubierta', 'inclinada', L) === 'INCLINADA' && vistoIa.convertir('acs', 'MISMA_CALDERA', L) === 'misma_caldera' && vistoIa.convertir('marco', 'PLASTICO', L) === undefined,
        'visto IA: valores de lista sin importar mayúsculas; uno que no existe, fuera');
    const elegidas = vistoIa.elegirFotos({ documentacion: { reforma_uploads: {
        FOTO_FACHADA_PRINCIPAL: Array.from({ length: 6 }, (_, i) => ({ driveId: `f${i}`, mime: 'image/jpeg' })),
        VIDEO_VIVIENDA: [{ driveId: 'v', mime: 'video/mp4' }], FOTO_PLACA_CALDERA: [{ driveId: 'p', nombre: 'placa.HEIC' }],
    } } }, L.SLOTS);
    ok(elegidas.length === 4 && elegidas.filter(f => f.slot === 'FOTO_FACHADA_PRINCIPAL').length === 3 && elegidas.some(f => f.driveId === 'p' && f.placa) && !elegidas.some(f => f.driveId === 'v'),
        'visto IA: 3 fotos de fachada como mucho, la placa (marcada) y ningún vídeo');

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
    const tabla = await asis.tablaCe3x();
    ok(/Muro de fachada: antes de 1980 2,38 \(168 kg\/m²\)/.test(tabla) && /E1 → Z/.test(tabla), 'asistente: lleva la tabla de U por defecto de CE3X (muro antes de 1980 = 2,38)');
    const ctxObra = await asis.contextoObra({ numero_expediente: '2026EXT_9', estado: 'BORRADOR', anio_construccion: 1995, zona_climatica: 'E1', cuestionario: {} }, 'obra');
    ok(/muro de fachada 1,4/.test(ctxObra) && /zona NBE Z/.test(ctxObra), 'asistente: en una obra de 1995 en E1, las U que le tocan (zona NBE Z)');
    ok(/menú/.test(await asis.contextoObra(null, 'menu')), 'asistente: sin obra, sabe que está en el menú');
    const env = asis.resumenEnvolvente({ huecos: { F1N1: [{ tipo: 'ventana', ancho: 1, alto: 1.2, nombre: 'V1' }, { tipo: 'puerta', ancho: 0.9, alto: 2.1, nombre: 'P1' }] }, tipos: { PV1: 'FACHADA' } });
    ok(/1 ventanas \(1,2 m²\) y 1 puertas \(1,89 m²\) en 1 paredes/.test(env) && /PV1 → fachada/.test(env), 'asistente: en la envolvente, lo dibujado (huecos, m² y paredes cambiadas)');
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
    const fila = beta.filaDe({ nombre: 'Ana', email: 'ANA@x.es', consentimiento: true, acepta_condiciones: true, web: '', form_token: ft, turnstile_token: 't' }, { ip: '83.1.2.3', userAgent: 'UA' });
    ok(fila.email === 'ana@x.es' && !('form_token' in fila.respuestas) && !('web' in fila.respuestas) && !('turnstile_token' in fila.respuestas) && fila.ip_hash && !fila.ip_hash.includes('83.1'),
        'beta: la fila sin honeypot ni tokens, la IP solo como huella');
    // Alta directa (24/10/2026): sin aceptar las condiciones no hay alta; con la lista de espera de antes, no se piden
    try { beta.filaDe({ nombre: 'Ana', email: 'ana@x.es', consentimiento: true }); ok(false, 'beta: sin condiciones, 400 FALTA_CONDICIONES'); }
    catch (err) { ok(err.status === 400 && err.code === 'FALTA_CONDICIONES', 'beta: sin condiciones, 400 FALTA_CONDICIONES'); }
    process.env.CERTAPP_ALTA_DIRECTA = 'false';
    ok(!!beta.filaDe({ nombre: 'Ana', email: 'ana@x.es', consentimiento: true }).email, 'beta: con CERTAPP_ALTA_DIRECTA=false (lista de espera) no se piden las condiciones');
    delete process.env.CERTAPP_ALTA_DIRECTA;
    // «Nombre y apellidos» en un campo → nombre | apellidos en la cuenta
    const { partirNombre } = require(path.join(B, 'services/certapp/cuentas'));
    const pn = (s) => { const r = partirNombre(s); return `${r.nombre}|${r.apellidos}`; };
    ok(pn('María José García López') === 'María José|García López' && pn('Ana Pérez') === 'Ana|Pérez' && pn('Laura Gómez Prieto') === 'Laura|Gómez Prieto',
        'alta: el nombre completo se parte en nombre y apellidos (los dos últimos)');
    ok(pn('Juan de la Fuente Pérez') === 'Juan|de la Fuente Pérez' && pn('  Ana  ') === 'Ana|null' && pn('') === 'null|null',
        'alta: las partículas (de, la…) van con su apellido; una palabra, sin apellidos');
    const te = tokens.firmarCuenta('e', '11111111-1111-4111-8111-111111111111', 'n1');
    const de = tokens.leerCuenta(te);
    ok(de?.tipo === 'e' && tokens.verificarCuenta(de, 'n1').ok && !tokens.verificarCuenta(de, 'n2').ok,
        'enlace para entrar (`e`): vale con el nonce de la cuenta y deja de valer al rotarlo');
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
