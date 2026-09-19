// ─────────────────────────────────────────────────────────────────────────────
// Los documentos que firma el SUJETO OBLIGADO: que la ficha VIAJE y que la firme
// QUIEN TOCA. Sin BD, sin red y sin escribir nada.
//
//   node implementation/backend/scripts/test_firmante_so.mjs
//
// 1) `docParaEnvio` conserva el `formulario` — es lo que se perdía: desde que las
//    fichas RES se rellenan sobre el impreso oficial, el navegador serializaba los
//    campos a mano y dejaba fuera el único que llevaba el documento, así que la
//    ficha no se enviaba (medido en LOTE-2025-006: el correo salió con el Anexo I
//    solo y sin decir que faltaba).
// 2) `representantesSo` lista los apoderados del S.O., el principal primero.
// 3) La solicitud de emisión sale a nombre del apoderado SELLADO en el lote.
// ─────────────────────────────────────────────────────────────────────────────
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const front = (rel) => pathToFileURL(path.join(__dirname, '../../frontend/src', rel)).href;

const { docParaEnvio, docTieneContenido } = await import(front('features/lotes/logic/docEnvio.js'));
const { representantesSo, representanteElegido, nifNorm } = await import(front('features/lotes/logic/soContactos.js'));
const solicitudCae = require('../services/solicitudCaeService');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

// ── 1) El documento viaja entero ─────────────────────────────────────────────
console.log('\n1) docParaEnvio conserva las TRES formas de un documento');
{
    const ficha = docParaEnvio({
        formulario: { plantilla: 'FichaRES060.pdf', campos: { 'Representante del solicitante': 'JESÚS' } },
        fileName: '25RES060_76 - Ficha RES060', label: 'Ficha RES060', tipo: 'ficha_res',
        expediente_id: 'exp-1', anchor: ['fdo'], fixedBox: { page: 4 },
        repNombre: 'JESÚS ANTONIO ALMODÓVAR FUENTES', repNif: '06236833S',
    });
    ok(!!ficha.formulario, 'la ficha viaja con su `formulario` (era el fallo)');
    ok(ficha.formulario.campos['Representante del solicitante'] === 'JESÚS', 'y con sus campos dentro');
    ok(ficha.rep_nombre === 'JESÚS ANTONIO ALMODÓVAR FUENTES' && ficha.rep_nif === '06236833S',
        'y con el apoderado al que se le pide la firma');
    ok(docTieneContenido(ficha), 'un `formulario` cuenta como contenido');

    const anexo = docParaEnvio({ html: '<p>x</p>', key: 'anexo_i', fileName: 'Anexo I', label: 'Anexo I', tipo: 'anexo_i_listado' });
    ok(anexo.html === '<p>x</p>' && anexo.key === 'anexo_i', 'el Anexo I sigue viajando como HTML');

    const firmado = docParaEnvio({ pdfBase64: 'JVBERi0=', fileName: 'x', label: 'x', tipo: 'anexo_i_listado' });
    ok(firmado.pdfBase64 === 'JVBERi0=', 'un PDF ya firmado se conserva tal cual');

    ok(!docTieneContenido(docParaEnvio({ fileName: 'x', label: 'x' })),
        'un documento sin ninguna de las tres formas NO tiene contenido (el backend lo rechaza, no lo salta)');
}

// ── 2) Los apoderados del S.O. ───────────────────────────────────────────────
console.log('\n2) representantesSo: el principal primero, los demás detrás');
{
    const so = {
        nombre_responsable: 'PEDRO JOSÉ', apellidos_responsable: 'LÓPEZ MONTERO', nif_responsable: '06239730Z',
        representantes: [{ nombre: 'JESÚS ANTONIO', apellidos: 'ALMODÓVAR FUENTES', nif: '06236833S', cargo: 'DIRECTOR DE OPERACIONES' }],
    };
    const lista = representantesSo(so);
    ok(lista.length === 2, 'dos apoderados');
    ok(lista[0].id === 'principal' && lista[0].nombre === 'PEDRO JOSÉ LÓPEZ MONTERO', 'el de la ficha va primero');
    ok(lista[1].id === 'r0' && lista[1].nif === '06236833S', 'el adicional lleva su id estable');
    ok(representanteElegido(so, 'r0').nombre.includes('ALMODÓVAR'), 'se puede elegir al segundo');
    ok(representanteElegido(so, 'r9').id === 'principal',
        'una elección que ya no existe cae al principal, nunca a nada');

    // El principal NO se duplica aunque alguien lo teclee también en la lista.
    const dup = representantesSo({ ...so, representantes: [{ nombre: 'PEDRO JOSÉ', apellidos: 'LÓPEZ MONTERO', nif: '06239730-Z' }] });
    ok(dup.length === 1, 'el mismo NIF con guion no se ofrece dos veces');
    ok(nifNorm('06239730-Z') === '06239730Z', 'el NIF se compara sin separadores');

    // `representante_distinto` manda sobre la persona de contacto.
    const conDistinto = representantesSo({
        ...so, representante_distinto: true,
        representante_nombre: 'ANA', representante_apellidos: 'GIL', representante_dni: '11111111H',
    });
    ok(conDistinto[0].nombre === 'ANA GIL', 'si el representante es otra persona, es ella la principal');

    ok(representantesSo({}).length === 0, 'una ficha sin representante no inventa ninguno');
}

// ── 3) La solicitud de emisión la firma el apoderado del lote ────────────────
console.log('\n3) La solicitud de emisión CAE sale a nombre de quien firmó las fichas');
{
    const so = { razon_social: 'INTERNACIONAL DE ALCOHOLES, S.A.', cif: 'A13035266', municipio: 'TOMELLOSO',
        nombre_responsable: 'PEDRO JOSÉ', apellidos_responsable: 'LÓPEZ MONTERO', nif_responsable: '06239730Z' };
    const lote = { codigo: 'LOTE-2025-006', anio_actuacion: 2025, ccaa: 'Castilla-La Mancha' };
    const act = [{ numero_expediente: '25RES060_76', ficha: 'RES060', n_actuacion: 1, ahorro_kwh: '28.852' }];

    const sinSello = solicitudCae.datosDesdeLote(lote, act, so, null);
    ok(sinSello.representante === 'PEDRO JOSÉ LÓPEZ MONTERO', 'sin sello, el representante de la ficha');
    ok(sinSello.ahorro_total === '28852', 'el ahorro conserva su orden de magnitud (28.852, no 28,852)');

    const conSello = solicitudCae.datosDesdeLote(lote, act, so, { nombre: 'JESÚS ANTONIO ALMODÓVAR FUENTES', nif: '06236833S' });
    ok(conSello.representante === 'JESÚS ANTONIO ALMODÓVAR FUENTES' && conSello.representante_dni === '06236833S',
        'con sello, el apoderado que firmó las fichas de ese lote');
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallidas\n` : '\n✓ Todo correcto\n');
process.exit(fallos ? 1 : 0);
