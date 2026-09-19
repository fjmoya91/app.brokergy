#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * El estado que se VE de una oportunidad ya aceptada.
 *
 *   node scripts/test_estado_oportunidad.mjs
 *
 * Lo que se comprueba, además de los casos sueltos, es que este estado NO pueda
 * divergir de la carpeta de Drive en la que está el expediente: las dos salen
 * del mismo hecho (¿tiene certificador? ¿ha terminado?) y si un día dijeran
 * cosas distintas, la lista y Drive contarían dos historias del mismo día.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { estadoDesdeExpediente, estadoVisible } = require('../utils/estadoOportunidad.js');
const { carpetaObjetivoExpediente, FOLDERS } = require('../services/driveFolders.js');
const { ORDEN_ESTADOS } = require('../utils/expedienteEstados.js');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

const conCert = (estado) => ({ estado, cee: { certificador_id: 'cert-1' } });
const sinCert = (estado) => ({ estado, cee: {} });

console.log('\n── Sin expediente manda la CAPTACIÓN ──');
{
    ok(estadoVisible('ENVIADA', null) === 'ENVIADA', 'una enviada sigue diciendo ENVIADA');
    ok(estadoVisible('PRE-ACEPTADO', null) === 'PRE-ACEPTADO', 'una pre-aceptada, PRE-ACEPTADO');
    ok(estadoVisible(null, null) === 'PTE ENVIAR', 'sin estado guardado, PTE ENVIAR');
}

console.log('\n── Con expediente manda el EXPEDIENTE ──');
{
    ok(estadoDesdeExpediente(sinCert('PTE. CEE INICIAL')) === 'ACEPTADA',
        'recién aceptada y sin encargar el CEE: ACEPTADA');
    ok(estadoDesdeExpediente(conCert('PTE. CEE INICIAL')) === 'EN CURSO',
        'en cuanto tiene certificador: EN CURSO');
    ok(estadoDesdeExpediente(sinCert('EN CERTIFICADOR CEE INICIAL')) === 'EN CURSO',
        'una fase más allá ya es EN CURSO aunque falte el id del técnico');
    ok(estadoDesdeExpediente(sinCert('DOC. COMPLETA')) === 'EN CURSO', 'documentación completa: EN CURSO');
    ok(estadoDesdeExpediente(sinCert('SUBIDO A MITECO')) === 'EN CURSO', 'subido a MITECO: EN CURSO');
    ok(estadoDesdeExpediente(sinCert('FINALIZADO')) === 'FINALIZADO', 'terminado: FINALIZADO');
    ok(estadoVisible('ACEPTADA', conCert('PTE. FIN OBRA')) === 'EN CURSO',
        'el estado de captación NO puede frenar al expediente');
}

console.log('\n── Lo que no se sabe NO se inventa ──');
{
    ok(estadoDesdeExpediente(sinCert('UN ESTADO QUE NO EXISTE')) === 'ACEPTADA',
        'un estado fuera de la lista canónica se queda en ACEPTADA');
    ok(estadoDesdeExpediente(null) === 'ACEPTADA', 'sin datos del expediente, ACEPTADA');
}

console.log('\n── No puede divergir de la carpeta de Drive ──');
{
    // Para CADA estado del ciclo, y con/sin certificador, la etiqueta y la
    // carpeta tienen que contar lo mismo en los tres casos que comparten.
    const ESPERADO_POR_CARPETA = {
        [FOLDERS.ACEPTADO]:    'ACEPTADA',
        [FOLDERS.FINALIZADOS]: 'FINALIZADO',
        [FOLDERS.EN_CURSO]:    'EN CURSO',
    };
    let comprobados = 0;
    const discrepan = [];
    for (const estado of ORDEN_ESTADOS) {
        for (const exp of [sinCert(estado), conCert(estado)]) {
            const carpeta = carpetaObjetivoExpediente(exp);
            const esperado = ESPERADO_POR_CARPETA[carpeta];
            if (!esperado) continue;           // carpetas sin etiqueta propia (verificación, pagos…)
            comprobados++;
            const dice = estadoDesdeExpediente(exp);
            if (dice !== esperado) discrepan.push(`${estado}${exp.cee.certificador_id ? ' (con cert)' : ''}: carpeta dice ${esperado}, etiqueta dice ${dice}`);
        }
    }
    ok(comprobados > 0, `hay ${comprobados} combinaciones que comparten criterio con Drive`);
    ok(discrepan.length === 0, discrepan.length ? `DISCREPAN: ${discrepan.join(' · ')}` : 'ninguna discrepa');
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
