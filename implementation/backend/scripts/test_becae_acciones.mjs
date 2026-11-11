// test_becae_acciones.mjs — qué paso toca en beCAE para un lote (logic/becae.js).
// Se cruzan los documentos que hay en beCAE con los del lote; sale SOLO lo que toca.
//   node scripts/test_becae_acciones.mjs
import { accionesBecae } from '../../frontend/src/features/lotes/logic/becae.js';

let fallos = 0;
const ok = (msg, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fallos++; };
const ids = (r) => r.map(a => a.id).join(',');
const becae = (tipos, extra = {}) => ({ num_solicitud: '0035-S22', documentos: tipos.map((t, i) => ({ id: `d${i}`, name: t, type: t })), ...extra });

console.log('\n── Recién creada por API ──');
ok('beCAE ofrece la solicitud y el lote no la tiene → traerla (y los ZIP)',
    ids(accionesBecae({ becae: becae(['solicitud']), p: {} })) === 'traer_solicitud,subir_zip');
ok('el lote tiene la de la APP → traer la de beCAE',
    ids(accionesBecae({ becae: becae(['solicitud']), p: { solicitud: { key: 'solicitud_verificacion' } }, solicitudApp: true })).startsWith('traer_solicitud'));
ok('el lote ya tiene la del verificador → no se trae otra vez',
    !ids(accionesBecae({ becae: becae(['solicitud']), p: { solicitud: { key: 'solicitud_verificacion' } } })).includes('traer_solicitud'));

console.log('\n── Firmada por el S.O. ──');
const pFirmada = { solicitud: { signed_link: 'x' } };
ok('firmada en el lote y no en beCAE → subirla',
    ids(accionesBecae({ becae: becae(['solicitud']), p: pFirmada })).includes('subir_solicitud'));
ok('la firmada de la APP no se sube nunca',
    !ids(accionesBecae({ becae: becae(['solicitud']), p: pFirmada, solicitudApp: true })).includes('subir_solicitud'));
ok('ya en beCAE → no se ofrece',
    !ids(accionesBecae({ becae: becae(['solicitud_firmada']), p: pFirmada })).includes('subir_solicitud'));

console.log('\n── Documentación y oferta ──');
ok('con adjuntos ya subidos no se ofrecen los ZIP',
    !ids(accionesBecae({ becae: becae(['solicitud_firmada', 'documento_adjunto']), p: pFirmada })).includes('subir_zip'));
ok('con oferta ya no se pueden subir ZIP',
    !ids(accionesBecae({ becae: becae(['solicitud_firmada', 'oferta']), p: pFirmada })).includes('subir_zip'));
ok('oferta en beCAE y no en el lote → traerla',
    ids(accionesBecae({ becae: becae(['solicitud_firmada', 'documento_adjunto', 'oferta']), p: pFirmada })) === 'traer_oferta');
ok('oferta firmada por el S.O. → aceptarla en beCAE',
    ids(accionesBecae({ becae: becae(['solicitud_firmada', 'documento_adjunto', 'oferta']), p: { ...pFirmada, oferta: {}, ofertaFirmada: true } })) === 'subir_oferta');
ok('aceptada (oferta_firmada en beCAE) → nada que hacer',
    ids(accionesBecae({ becae: becae(['solicitud_firmada', 'documento_adjunto', 'oferta', 'oferta_firmada']), p: { ...pFirmada, oferta: {}, ofertaFirmada: true } })) === '');

console.log('\n── Expediente ──');
const todo = ['solicitud_firmada', 'documento_adjunto', 'oferta', 'oferta_firmada'];
const pTodo = { ...pFirmada, oferta: {}, ofertaFirmada: true };
ok('En resolución → inexactitudes',
    ids(accionesBecae({ becae: becae(todo, { estado_expediente: 'En resolución' }), p: pTodo })) === 'inexactitudes');
ok('HDTED → inexactitudes',
    ids(accionesBecae({ becae: becae(todo, { estado_expediente: 'HDTED' }), p: pTodo })) === 'inexactitudes');
ok('En ejecución → nada (no se gastan consultas)',
    ids(accionesBecae({ becae: becae(todo, { estado_expediente: 'En ejecución' }), p: pTodo })) === '');
ok('sin consultar beCAE → nada', accionesBecae({ becae: null, p: pTodo }).length === 0);

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
process.exit(fallos ? 1 : 0);
