// ─────────────────────────────────────────────────────────────────────────────
// El teléfono y el correo del cliente, con su PERSONA DE CONTACTO de respaldo.
//
// POR QUÉ EXISTE: el 14/09/2026 la pestaña de administrativos decía «no consta»
// del teléfono y del correo de un cliente que tenía los dos escritos en su
// ficha, dos líneas más abajo (26RES060_187: MARIA TERESA sin `tlf` ni `email`,
// y JUAN ANTONIO con 629679131 y su correo, marcado «Notif. aquí»).
//
// No es raro: en muchas obras quien lleva el trato es un hijo, la pareja o el
// instalador, y su número es el único que tenemos. La ficha preguntaba solo por
// `tlf` y `email`, así que ese dato no llegaba nunca al .cex.
//
// Lo que se vigila aquí es la CASCADA y, sobre todo, que se DIGA de quién es el
// número: el del titular manda cuando existe —en el certificado el cliente es
// él— y cuando sale del contacto sale dicho con su nombre.
//
//     node implementation/backend/scripts/test_contacto_cliente_ce3x.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { fichaCe3x } from '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js';

let fallos = 0;
const ok = (cond, que) => {
    if (!cond) { fallos++; console.log('  ✗ ' + que); } else console.log('  ✓ ' + que);
};

const geo = {
    geometria: {
        modelo: { catastro: { inmueble: {
            direccion: 'CL MIGUEL DE UNAMUNO 6, LOS YEBENES, TOLEDO',
            antiguedad: 1994,
        } } },
        parametros: { floor_height_m: 2.8 },
        plantas: [], elementos: [],
    },
};
const expediente = { numero_expediente: '26RES060_187', cee: { zona_climatica: 'D3' },
                     instalacion: {}, documentacion: {} };
const admin = (cliente) => fichaCe3x({ expediente, cliente, geo, envolvente: {}, ajustes: {} })
    .ficha.administrativos;

console.log('\n1. El caso que lo motivó: el titular no dio los suyos');
{
    const a = admin({
        nombre_razon_social: 'MARIA TERESA', apellidos: 'RAMOS FERNANDEZ MARCOTE',
        tlf: null, email: null,
        persona_contacto_nombre: 'JUAN ANTONIO',
        persona_contacto_tlf: '629679131',
        persona_contacto_email: 'juanantoniogaroz@gmail.com',
    });
    ok(a.cliente_telefono.valor === '629679131',
       `el teléfono sale (era «${a.cliente_telefono.valor}»)`);
    ok(a.cliente_email.valor === 'juanantoniogaroz@gmail.com', 'y el correo también');
    ok(/JUAN ANTONIO/.test(a.cliente_telefono.de),
       `y se dice de quién es: «${a.cliente_telefono.de}»`);
}

console.log('\n2. Si el TITULAR los tiene, mandan los suyos');
{
    const a = admin({
        tlf: '600111222', email: 'titular@correo.es',
        persona_contacto_nombre: 'JUAN ANTONIO',
        persona_contacto_tlf: '629679131',
        persona_contacto_email: 'juanantoniogaroz@gmail.com',
    });
    ok(a.cliente_telefono.valor === '600111222', 'el teléfono es el del titular');
    ok(a.cliente_email.valor === 'titular@correo.es', 'y el correo');
    ok(a.cliente_telefono.de === 'ficha del cliente',
       'y el `de:` no menciona a nadie más');
}

console.log('\n3. Se decide campo a campo, no en bloque');
{
    // El caso real de medio fichero: el titular dejó el móvil y no el correo.
    const a = admin({ tlf: '600111222', email: null,
                      persona_contacto_nombre: 'JUAN ANTONIO',
                      persona_contacto_tlf: '629679131',
                      persona_contacto_email: 'juanantoniogaroz@gmail.com' });
    ok(a.cliente_telefono.valor === '600111222', 'su teléfono se conserva');
    ok(a.cliente_email.valor === 'juanantoniogaroz@gmail.com',
       'y el correo cae al del contacto');
}

console.log('\n4. Sin nadie a quien caer, se dice que no consta');
{
    const a = admin({ nombre_razon_social: 'MARIA TERESA' });
    ok(a.cliente_telefono.valor === null, 'teléfono a null (la pantalla dice «no consta»)');
    ok(a.cliente_email.valor === null, 'correo a null');
    ok(a.cliente_telefono.de === 'ficha del cliente',
       'y se manda a la ficha del cliente, que es donde se arregla');
}

console.log('\n5. Un contacto SIN nombre no inventa uno');
{
    const a = admin({ persona_contacto_tlf: '629679131' });
    ok(a.cliente_telefono.valor === '629679131', 'el teléfono sale igual');
    ok(!/\(/.test(a.cliente_telefono.de),
       `el «de:» no lleva paréntesis vacíos: «${a.cliente_telefono.de}»`);
}

console.log('\n6. Sin cliente no revienta');
ok(admin(null).cliente_telefono.valor === null, 'sale ficha igual');

console.log(fallos ? `\n${fallos} fallo(s).` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
