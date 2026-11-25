// ─── test_riteapp_payload.js — la memoria RITE SUELTA (app RITE) ──────────────
// Comprueba, sin BD ni red, que una memoria suelta pasa por las MISMAS reglas que
// la de una obra CAE y que el modo extendido (elementos de radiador) da la
// potencia por estancia. Con `--generar` llama además al generador
// (RITE_SERVICE_URL, por defecto http://localhost:8090) y guarda los ficheros.
//
//   node implementation/backend/scripts/test_riteapp_payload.js [--generar <carpeta>]
// ─────────────────────────────────────────────────────────────────────────────
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const P = require('../services/riteapp/payload');

let ok = 0;
const t = (nombre, fn) => { fn(); ok++; console.log(`  ✓ ${nombre}`); };

const cuenta = {
    id: '00000000-0000-0000-0000-000000000001',
    empresa: 'INSTALACIONES EJEMPLO SL', empresa_nif: 'B00000000',
    numero_empresa_rite: '130000000', municipio: 'TOLEDO',
    representante_nombre: 'ANA', representante_apellidos: 'PRUEBA PRUEBA', representante_nif: '00000000T',
    representante_cargo: 'ADMINISTRADORA',
};
const base = () => ({
    numero: '2026RIT_0',
    datos: {
        titular: { nombre: 'TITULAR', apellidos: 'DE PRUEBA', nif: '00000001R', sexo: 'H', misma_direccion: true },
        vivienda: {
            ref_catastral: '0000000VK0000A0001AA', direccion: 'CALLE EJEMPLO 1', municipio: 'TOLEDO',
            provincia: 'TOLEDO', codigo_postal: '45000', superficie: 90, plantas: 1, zona: 'C4',
        },
        instalacion: {
            tipo_emisor: 'radiadores_convencionales',
            aerotermia_cal: { marca: 'MARCA', modelo: 'MODELO 8 KW', numero_serie: 'SN-1', potencia: 8 },
            cambio_acs: false,
        },
        fechas: { pruebas: '2026-11-20' },
        estancias: {
            modo: 'extendido', w_elemento: 110,
            plantas: [{ planta: '0', locales: [
                { nombre: 'Salón-comedor', m2: 25, orientacion: 'S', elementos: 20 },
                { nombre: 'Dormitorio 1', m2: 12, orientacion: 'N', elementos: 8, w_elemento: 150 },
                { nombre: 'Cocina', m2: 10, orientacion: 'E' },
            ] }],
        },
    },
});

console.log('Memoria RITE suelta (app RITE)');

t('completa: no falta nada', () => {
    const r = P.comprobar({ memoria: base(), cuenta });
    assert.deepStrictEqual(r.faltan, []);
});

t('extendido: potencia = elementos × W por elemento; sin elementos, por superficie', () => {
    const { tabla } = P.comprobar({ memoria: base(), cuenta });
    assert.strictEqual(tabla.factor, 80); // zona C
    assert.deepStrictEqual(tabla.filas.map(f => f.potencia_w), [2200, 1200, 800]);
    assert.deepStrictEqual(tabla.filas.map(f => f.elementos), [20, 8, 8]);
    assert.strictEqual(tabla.total.carga_w, 47 * 80);
});

t('extendido: avisa de la estancia sin elementos', () => {
    const { avisos } = P.comprobar({ memoria: base(), cuenta });
    assert.ok(avisos.some(a => /1 estancia\(s\) sin elementos/.test(a)), avisos.join(' | '));
});

t('extendido: avisa si los radiadores superan la bomba', () => {
    const m = base(); m.datos.instalacion.aerotermia_cal.potencia = 3;
    assert.ok(P.comprobar({ memoria: m, cuenta }).avisos.some(a => /bomba de calor da 3\.0 kW/.test(a)));
});

t('rápido: los elementos tecleados NO se guardan', () => {
    const m = base(); m.datos.estancias.modo = 'rapido';
    const e = P.limpiarEstancias(m.datos.estancias);
    assert.ok(e.plantas[0].locales.every(l => l.elementos === undefined));
    assert.deepStrictEqual(P.tablaEstancias(e, { zona: 'C4' }).filas.map(f => f.potencia_w), [2000, 960, 800]);
});

t('suelo radiante: sin elementos', () => {
    const m = base(); m.datos.instalacion.tipo_emisor = 'suelo_radiante';
    const { tabla } = P.comprobar({ memoria: m, cuenta });
    assert.ok(tabla.filas.every(f => f.elementos === null));
});

t('fuera de Castilla-La Mancha: bloquea', () => {
    const m = base(); m.datos.vivienda.provincia = 'Madrid';
    assert.ok(P.comprobar({ memoria: m, cuenta }).faltan.some(f => /Castilla-La Mancha/.test(f)));
    assert.ok(P.esDeClm('Ciudad Real') && P.esDeClm('ALBACETE') && !P.esDeClm('Valencia'));
});

t('sin nº de empresa RITE: lo dice validateMemoriaRite, como en el CRM', () => {
    const faltan = P.comprobar({ memoria: base(), cuenta: { ...cuenta, numero_empresa_rite: '' } }).faltan;
    assert.ok(faltan.some(f => /no está habilitado en Industria/.test(f)), faltan.join(' | '));
    assert.ok(faltan.includes('Nº Empresa RITE (ficha Partner)'));
});

t('sin titular, sin serie y sin fecha de pruebas: faltan', () => {
    const m = base();
    m.datos.titular.nif = ''; m.datos.instalacion.aerotermia_cal.numero_serie = ''; m.datos.fechas = {};
    const f = P.comprobar({ memoria: m, cuenta }).faltan;
    for (const x of ['DNI / NIE Cliente', 'Nº Serie Aerotermia Calefacción (Instalación)', 'Fecha de Pruebas Cert. Instalación (Documentación)']) {
        assert.ok(f.includes(x), `falta «${x}» en: ${f.join(' | ')}`);
    }
});

t('el titular que vive en otro sitio: domicilio suyo, emplazamiento la vivienda', () => {
    const m = base();
    Object.assign(m.datos.titular, { misma_direccion: false, direccion: 'OTRA CALLE 2', municipio: 'MADRID', provincia: 'MADRID', codigo_postal: '28001' });
    const { expPayload } = P.payloadGenerador({ memoria: m, cuenta });
    assert.strictEqual(expPayload.cli_muni, 'MADRID');
    assert.strictEqual(expPayload.inst_muni, 'TOLEDO');
    assert.strictEqual(expPayload.inst_dir, 'CALLE EJEMPLO 1');
});

t('el payload lleva las estancias con sus elementos y la fecha manual', () => {
    const { expPayload, instaladorPayload, fechas } = P.payloadGenerador({ memoria: base(), cuenta });
    const rl = expPayload.documentacion.rite_locales;
    assert.strictEqual(rl.modo, 'extendido');
    assert.strictEqual(rl.w_elemento, 110);
    assert.strictEqual(rl.plantas[0].locales[0].elementos, 20);
    assert.strictEqual(rl.plantas[0].locales[0].nombre, 'SALÓN-COMEDOR');
    assert.strictEqual(fechas.pruebas, '2026-11-20');
    assert.strictEqual(instaladorPayload.numero_carnet_rite, '130000000');
    assert.strictEqual(expPayload.datos_calculo.inputs.zona, 'C4');
});

console.log(`\n${ok} pruebas OK`);

const i = process.argv.indexOf('--generar');
if (i > 0) {
    const salida = process.argv[i + 1] || '.';
    const { generarRiteFiles } = require('../services/riteGenerador');
    const { expPayload, instaladorPayload, fechas } = P.payloadGenerador({ memoria: base(), cuenta });
    generarRiteFiles(expPayload, instaladorPayload, fechas).then(files => {
        fs.mkdirSync(salida, { recursive: true });
        for (const f of files || []) fs.writeFileSync(path.join(salida, f.name), Buffer.from(f.base64, 'base64'));
        console.log(`Generados ${files?.length || 0} ficheros en ${salida}: ${(files || []).map(f => f.name).join(', ')}`);
    }).catch(e => { console.error('Generador:', e.response?.data || e.message); process.exit(1); });
}
