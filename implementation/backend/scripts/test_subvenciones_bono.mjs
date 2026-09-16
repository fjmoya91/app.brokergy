/**
 * test_subvenciones_bono — Lo marcado en la pestaña SUBVENCIONES sobrevive y
 * llega al Anexo I.
 *
 *   node implementation/backend/scripts/test_subvenciones_bono.mjs
 *
 * El caso real: 26RES060_165. Se marcaba «Bono social eléctrico para
 * consumidores vulnerables», se cambiaba de pestaña y volvía sin marcar; y el
 * Anexo I imprimía «Ninguno de los anteriores».
 *
 * No era el guardado: el dato ESTABA en la BD. `normalizeData` normaliza
 * `documentacion` entera y lo dejaba como 'ELECTRICO_VULNERABLE', y
 * `leerSubvenciones` descartaba lo que no casara EXACTO con el enum en
 * minúscula. Dos capas de arreglo: la clave va a la BLACKLIST (lo nuevo se
 * guarda tal cual) y la lectura rescata lo ya escrito en MAYÚSCULAS.
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { createRequire } from 'module';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src', p)).href;

const sub = await import(front('features/expedientes/logic/subvenciones.js'));
const gen = await import(front('features/expedientes/utils/docGenerators.js'));
const { normalizeData } = require('../utils/normalization');

let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

const IDX_VULNERABLE = 0;   // orden oficial del apartado 4 del Anexo I
const IDX_NINGUNO = 5;

const expedienteCon = (subvenciones) => ({
    numero_expediente: '26RES060_165',
    documentacion: { subvenciones },
    instalacion: {}, cee: {}, clientes: {}, oportunidades: { datos_calculo: { inputs: {} } },
});

console.log('\n── Lo que se guarda YA NO se sube a MAYÚSCULAS ─────────────────');
const aGuardar = {
    bono_social: { percibe: true, tipos: ['electrico_vulnerable'] },
    solicitada: false,
    ayuda: { catalogo_id: '', estado: 'PENDIENTE', fondo_nacional: 'si' },
};
const normalizado = normalizeData({ documentacion: { subvenciones: aGuardar } });
const guardado = normalizado.documentacion.subvenciones;
ok(guardado.bono_social.tipos[0] === 'electrico_vulnerable',
   `el id del bono se guarda tal cual (${guardado.bono_social.tipos[0]})`);
ok(guardado.ayuda.fondo_nacional === 'si', 'y el enum de fondos nacionales también');

console.log('\n── Y lo guardado ANTES, en MAYÚSCULAS, se rescata ──────────────');
// Exactamente lo que hay hoy en la BD de 26RES060_165.
const enMayusculas = {
    bono_social: { percibe: true, tipos: ['ELECTRICO_VULNERABLE'] },
    solicitada: false,
    ayuda: { catalogo_id: '', estado: 'PENDIENTE', fondo_nacional: 'NO' },
};
const leido = sub.leerSubvenciones(expedienteCon(enMayusculas));
ok(leido.bono_social.tipos.includes('electrico_vulnerable'),
   `se lee como '${leido.bono_social.tipos[0]}' (antes se descartaba y quedaba vacío)`);
ok(leido.bono_social.percibe === true, 'y el expediente consta como perceptor');
ok(leido.ayuda.fondo_nacional === 'no', 'el enum de fondos vuelve a su forma canónica');

console.log('\n── El Anexo I marca SU casilla, no «Ninguno» ───────────────────');
const estados = sub.anexoIStates(expedienteCon(enMayusculas));
ok(estados.bonoSocial[IDX_VULNERABLE] === true, 'casilla «consumidores vulnerables» marcada');
ok(estados.bonoSocial[IDX_NINGUNO] === false, '«Ninguno de los anteriores» SIN marcar');

const d = gen.deriveAnexoI(expedienteCon(enMayusculas), {}, {}, {});
ok(d.bonoSocial[IDX_VULNERABLE] === true, 'y el documento que se genera y se envía lo lleva');

console.log('\n── Sin nada marcado sigue diciendo «Ninguno» ───────────────────');
const vacio = sub.anexoIStates(expedienteCon({ bono_social: { percibe: false, tipos: [] } }));
ok(vacio.bonoSocial[IDX_NINGUNO] === true, 'que es el valor por defecto del impreso');
ok(vacio.bonoSocial.slice(0, 5).every(v => v === false), 'y ninguna de las cinco anteriores');

console.log('\n── La solicitud al VERIFICADOR declara lo mismo ────────────────');
// `SE_fondo_nacional` se compara con === 'si': en MAYÚSCULAS se le declaraba
// 'no' al verificador teniendo 'SI' escrito en el expediente.
const conFondo = {
    bono_social: { percibe: false, tipos: [] },
    solicitada: true,
    ayuda: { catalogo_id: 'RD853_2021', estado: 'PENDIENTE', cuantia_eur: '18800', fondo_nacional: 'SI' },
};
const campos = sub.camposSolicitudVerificacion(expedienteCon(conFondo));
ok(campos.SE_fondo_nacional === 'si', `SE_fondo_nacional = ${campos.SE_fondo_nacional}`);
ok(campos.SE_apoyo_programa === 'si', 'y la ayuda sigue declarándose');

console.log(`\n${fallos ? `❌ ${fallos} FALLO(S)` : '✅ Todo correcto'}\n`);
process.exit(fallos ? 1 : 0);
