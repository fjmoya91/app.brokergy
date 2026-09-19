#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El VISTO BUENO de un documento no lo puede borrar un autoguardado.
 *
 *   node scripts/test_validacion_no_se_pisa.mjs
 *
 * El detalle del expediente reenvía `documentacion` ENTERA en cada autoguardado,
 * desde la copia que hidrató al abrir la vista. `docs_validados` lo escribe solo
 * su ruta dedicada, así que esa copia nunca lo trae al día: sin protegerlo, se
 * validaba un documento, se guardaba cualquier otra cosa y el slot volvía a
 * ámbar — había que validarlo otra vez.
 *
 * Medido en 26RES060_101 el 18/09/2026: sobrevivieron el CIFO (13:59) y las
 * facturas (14:00), y el Anexo I no, porque después de él sí hubo un autoguardado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { mergeDocumentacion } = require('../utils/mergeDocumentacion.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

const ENLACE = 'https://drive.google.com/file/d/AAA/view';

console.log('\n── Un autoguardado NO borra lo que se acaba de validar ──');
{
    // En BD: el Anexo I ya validado por su ruta. En el navegador: la copia de
    // cuando se abrió la vista, que no lo lleva.
    const enBd = {
        anexo_i_signed_link: ENLACE,
        docs_validados: { anexo_i_signed_link: '2026-09-18T14:29:00.000Z' },
    };
    const delNavegador = {
        anexo_i_signed_link: ENLACE,
        docs_validados: {},                 // hidratado ANTES de validar
        fecha_inicio_cifo: '2026-09-01',    // lo que de verdad se está guardando
    };
    const r = mergeDocumentacion(enBd, delNavegador);
    ok(!!r.docs_validados?.anexo_i_signed_link, 'el visto bueno sigue puesto');
    ok(r.fecha_inicio_cifo === '2026-09-01', 'y lo que se guardaba sí se escribe');
}

console.log('\n── Tampoco borra un RECHAZO ──');
{
    const enBd = { docs_rechazados: { cert_cifo_signed_link: { at: '2026-09-18T10:00:00.000Z', motivo: 'nº de serie' } } };
    const r = mergeDocumentacion(enBd, { docs_rechazados: {} });
    ok(!!r.docs_rechazados?.cert_cifo_signed_link, 'el rechazo sigue puesto');
}

console.log('\n── Un fichero NUEVO sí retira el visto bueno ──');
{
    const enBd = {
        anexo_i_signed_link: ENLACE,
        docs_validados: { anexo_i_signed_link: '2026-09-18T14:29:00.000Z' },
    };
    const r = mergeDocumentacion(enBd, {
        anexo_i_signed_link: 'https://drive.google.com/file/d/BBB/view',
        docs_validados: { anexo_i_signed_link: '2026-09-18T14:29:00.000Z' },
    });
    ok(!r.docs_validados?.anexo_i_signed_link, 'vuelve a PENDIENTE DE REVISAR');
    ok((r.historial || []).some(h => h.tipo === 'doc_nueva_version'), 'y queda escrito en el historial');
}

console.log('\n── BORRAR el firmado también lo retira ──');
{
    const enBd = {
        anexo_i_signed_link: ENLACE,
        docs_validados: { anexo_i_signed_link: '2026-09-18T14:29:00.000Z' },
    };
    const r = mergeDocumentacion(enBd, { anexo_i_signed_link: null });
    ok(!r.docs_validados?.anexo_i_signed_link, 'un slot sin fichero no puede quedarse en verde');
}

console.log('\n── Validar OTRO documento no toca el primero ──');
{
    // La ruta de validar lee de BD y escribe el objeto entero: aquí se comprueba
    // que lo que llega por el PUT no deshace ninguno de los dos.
    const enBd = {
        anexo_i_signed_link: ENLACE,
        cert_cifo_signed_link: ENLACE,
        docs_validados: {
            anexo_i_signed_link: '2026-09-18T14:29:00.000Z',
            cert_cifo_signed_link: '2026-09-18T14:32:00.000Z',
        },
    };
    const r = mergeDocumentacion(enBd, { docs_validados: { anexo_i_signed_link: '2026-09-18T14:29:00.000Z' } });
    ok(Object.keys(r.docs_validados).length === 2, `los dos siguen validados (${Object.keys(r.docs_validados).length})`);
}

console.log('\n── Y lo de siempre sigue igual ──');
{
    const enBd = { incidencias: [{ id: 1 }], cifo_extra_annexes: [{ driveId: 'x' }] };
    const r = mergeDocumentacion(enBd, { incidencias: [], cifo_extra_annexes: [] });
    ok(r.incidencias.length === 1, 'las incidencias no se borran');
    ok(r.cifo_extra_annexes.length === 1, 'los anexos del CIFO tampoco');
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
