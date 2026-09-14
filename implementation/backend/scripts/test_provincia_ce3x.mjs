// ─────────────────────────────────────────────────────────────────────────────
// La PROVINCIA del .cex va capitalizada, siempre.
//
// POR QUÉ EXISTE: el 14/09/2026 CE3X dio «Error al abrir el fichero» y sacó
// media ficha en blanco con un .cex recién generado. La causa era UN campo: la
// provincia del CLIENTE salía `CIUDAD REAL` en vez de `Ciudad Real`.
//
// No es cosmético. En CE3X la provincia es un DESPLEGABLE: una que no case letra
// a letra deja el campo vacío, y de la provincia cuelga la zona climática, que
// es de donde sale media ficha. Llega en mayúsculas porque la BD guarda todo así
// (`normalizeData`), y ese campo era el único de los tres que no pasaba por la
// función que los capitaliza.
//
//     node implementation/backend/scripts/test_provincia_ce3x.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { fichaCe3x } from '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js';

let fallos = 0;
const ok = (cond, que) => {
    if (!cond) { fallos++; console.log('  ✗ ' + que); } else console.log('  ✓ ' + que);
};

// Lo mínimo para que salga una ficha: la dirección tal cual la escribe Catastro
// —en MAYÚSCULAS y separada por comas— y un cliente sacado de la BD.
const geo = {
    geometria: {
        modelo: { catastro: { inmueble: {
            direccion: 'CL MEJICO 4, PEDRO MUÑOZ, CIUDAD REAL',
            antiguedad: 1994,
        } } },
        parametros: { floor_height_m: 2.8 },
        plantas: [], elementos: [],
    },
};
const expediente = { numero_expediente: '26RES060_186', cee: { zona_climatica: 'D3' },
                     instalacion: {}, documentacion: {} };

const conCliente = (cliente) => fichaCe3x({ expediente, cliente, geo,
                                            envolvente: {}, ajustes: {} });

console.log('\n1. Lo que viene de la BD, en MAYÚSCULAS');
{
    const f = conCliente({ provincia: 'CIUDAD REAL', municipio: 'PEDRO MUÑOZ' });
    const a = f.ficha.administrativos;
    ok(a.cliente_provincia.valor === 'Ciudad Real',
       `la del cliente se capitaliza (salió ${JSON.stringify(a.cliente_provincia.valor)})`);
    ok(a.provincia.valor === 'Ciudad Real',
       `la del edificio también (salió ${JSON.stringify(a.provincia.valor)})`);
}

console.log('\n2. Y si ya viene bien, no se estropea');
{
    const f = conCliente({ provincia: 'Ciudad Real' });
    ok(f.ficha.administrativos.cliente_provincia.valor === 'Ciudad Real',
       'idempotente');
}

console.log('\n3. Sin provincia en la ficha del cliente, la del edificio');
{
    const f = conCliente({ provincia: null });
    ok(f.ficha.administrativos.cliente_provincia.valor === 'Ciudad Real',
       'cae a la de Catastro, y capitalizada');
}

console.log('\n4. Sin cliente no revienta');
{
    const f = conCliente(null);
    ok(!!f.ficha, 'sale ficha igual');
    ok(f.ficha.administrativos.provincia.valor === 'Ciudad Real', 'con su provincia');
}

console.log('\n5. Las que Catastro escribe sin tilde se reponen');
{
    const geoCoruna = { geometria: { ...geo.geometria, modelo: { catastro: { inmueble: {
        direccion: 'RUA REAL 1, A CORUÑA, A CORUÑA', antiguedad: 1994 } } } } };
    const f = fichaCe3x({ expediente, cliente: { provincia: 'JAEN' }, geo: geoCoruna,
                          envolvente: {}, ajustes: {} });
    ok(f.ficha.administrativos.cliente_provincia.valor === 'Jaén',
       `JAEN → Jaén (salió ${JSON.stringify(f.ficha.administrativos.cliente_provincia.valor)})`);
}

console.log(fallos ? `\n${fallos} FALLOS\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
