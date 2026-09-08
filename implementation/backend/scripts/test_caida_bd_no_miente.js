/**
 * Con la base de datos caída, la app NO puede inventarse una respuesta tranquila.
 *
 * El 08/09/2026 Postgres se cayó y arrancó en recuperación; Cloudflare sirvió
 * "521 Web server is down" delante de Supabase. La app respondió a todo con 200:
 *   · /api/usuarios/me devolvió un perfil con rol, empresa y logo a null (y lo
 *     cacheó 5 min), así que el partner salía como "USUARIO / LOGO PARTNER".
 *   · /api/oportunidades devolvió [] — cartera a cero, 0,00 € de bono.
 * Un distribuidor con 19 oportunidades lo leyó como que había perdido su trabajo.
 *
 * Esta prueba clava ese comportamiento: con la BD caída se responde 503, y con la
 * BD sana no cambia nada de lo que ya funcionaba.
 *
 *   node implementation/backend/scripts/test_caida_bd_no_miente.js
 */
const path = require('path');
const express = require('express');

// ─── Supabase simulado, enchufado ANTES de cargar nada que lo use ─────────────
const CAIDA = { message: 'FetchError: request failed, 521 Web server is down' };
const estado = { bdCaida: false };

const USUARIO = {
    id_usuario: 'u-1', id_rol: 2, auth_user_id: 'auth-1', activo: true,
    nombre: 'JUAN MANUEL', roles: { nombre_rol: 'DISTRIBUIDOR' }
};
const EMPRESA = {
    id_empresa: 'emp-1', razon_social: 'LOS SIETE HERMANOS DEL BONILLO, SL',
    acronimo: 'SH', logo_empresa: 'https://logo', marca_referencia: null
};
const OPORTUNIDADES = Array.from({ length: 19 }, (_, i) => ({
    id: `op-${i}`, id_oportunidad: `26RES060_OP${i}`, prescriptor_id: 'emp-1',
    creador_id: 'u-1', datos_calculo: { estado: 'ENVIADA' }
}));

const tabla = (nombre) => {
    const q = {
        select: () => q, order: () => q, eq: () => q, or: () => q, in: () => q,
        maybeSingle: async () => {
            if (estado.bdCaida) return { data: null, error: CAIDA };
            return { data: nombre === 'usuarios' ? USUARIO : EMPRESA, error: null };
        },
        then: (resolve) => resolve(
            estado.bdCaida ? { data: null, error: CAIDA } : { data: OPORTUNIDADES, error: null }
        ),
    };
    return q;
};

const stub = {
    from: (nombre) => tabla(nombre),
    auth: {
        // El servicio de Auth es OTRO proceso: en el incidente real siguió en pie
        // mientras PostgREST estaba caído. Por eso el token valida y la sesión es
        // buena — lo que falta es el perfil.
        getUser: async () => ({ data: { user: { id: 'auth-1', email: 'juanmanuel@sietehermanos.com' } }, error: null }),
    },
};

const rutaCliente = require.resolve('../services/supabaseClient');
require.cache[rutaCliente] = { id: rutaCliente, filename: rutaCliente, loaded: true, exports: stub };

// ─── App de prueba ────────────────────────────────────────────────────────────
const app = express();
app.use('/api/usuarios', require('../routes/usuarios'));
app.use('/api/oportunidades', require('../routes/oportunidades'));

// El token importa: la caché de auth (5 min) va por token, así que para probar
// una petición EN FRÍO —que es el caso del partner que entra durante la caída—
// hay que pedir con uno que no se haya visto antes.
const pedir = (servidor, ruta, token) => new Promise((resolve, reject) => {
    require('http').get({
        port: servidor.address().port, path: ruta,
        headers: { authorization: `Bearer ${token}` }
    }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body || 'null') }); } catch (e) { reject(e); } });
    }).on('error', reject);
});

let fallos = 0;
const comprobar = (ok, texto, detalle) => {
    console.log(`${ok ? '  ✅' : '  ❌'} ${texto}${ok ? '' : `\n       → ${detalle}`}`);
    if (!ok) fallos++;
};

(async () => {
    const servidor = app.listen(0);
    await new Promise(r => servidor.once('listening', r));

    console.log('\n── BD SANA (no puede haber cambiado nada) ───────────────────');
    estado.bdCaida = false;
    let me = await pedir(servidor, '/api/usuarios/me', 'token-sano');
    comprobar(me.status === 200 && me.body.rol_nombre === 'DISTRIBUIDOR' && me.body.prescriptor_id === 'emp-1',
        'el perfil llega completo (rol + empresa)', `status=${me.status} body=${JSON.stringify(me.body)}`);
    comprobar(me.body.acronimo === 'SH', 'llega el acrónimo "SH", no "USUARIO"', `acronimo=${me.body.acronimo}`);

    let ops = await pedir(servidor, '/api/oportunidades', 'token-sano');
    comprobar(ops.status === 200 && ops.body.length === 19,
        'llegan sus 19 oportunidades', `status=${ops.status} n=${ops.body?.length}`);

    console.log('\n── BD CAÍDA (521) ───────────────────────────────────────────');
    estado.bdCaida = true;

    // Token nuevo: con el anterior contestaría la caché, que es el comportamiento
    // deseado (a quien ya tiene perfil bueno no se le echa por un parpadeo) pero
    // no es lo que se prueba aquí.
    me = await pedir(servidor, '/api/usuarios/me', 'token-frio');
    comprobar(me.status === 503, 'el perfil responde 503, no un 200 en blanco',
        `status=${me.status} body=${JSON.stringify(me.body)}`);
    comprobar(!(me.status === 200 && me.body && me.body.rol_nombre === null),
        'NUNCA se sirve una identidad vacía con 200', JSON.stringify(me.body));

    ops = await pedir(servidor, '/api/oportunidades', 'token-frio');
    comprobar(ops.status === 503, 'las oportunidades responden 503, no una lista vacía',
        `status=${ops.status} body=${JSON.stringify(ops.body)}`);
    comprobar(!(ops.status === 200 && Array.isArray(ops.body) && ops.body.length === 0),
        'NUNCA se sirve la cartera a cero con 200', JSON.stringify(ops.body));

    // Con el perfil ya en caché, el middleware deja pasar y quien se encuentra la
    // BD caída es la propia ruta. Es el camino que servía `200 []`: hay que verlo
    // fallar aquí también, o el arreglo solo cubriría la sesión recién abierta.
    console.log('\n── BD CAÍDA con el perfil YA cacheado (falla la ruta) ───────');
    ops = await pedir(servidor, '/api/oportunidades', 'token-sano');
    comprobar(ops.status === 503 && ops.body?.code === 'OPORTUNIDADES_UNAVAILABLE',
        'la ruta responde 503 aunque la sesión sea válida',
        `status=${ops.status} body=${JSON.stringify(ops.body)}`);

    console.log('\n── LA BD VUELVE (el susto no puede sobrevivir en caché) ─────');
    estado.bdCaida = false;
    me = await pedir(servidor, '/api/usuarios/me', 'token-frio');
    comprobar(me.status === 200 && me.body.acronimo === 'SH',
        'al volver la BD, el perfil bueno llega ya (no hay fantasma cacheado 5 min)',
        `status=${me.status} body=${JSON.stringify(me.body)}`);

    console.log(fallos === 0 ? '\n✅ Todo correcto.\n' : `\n❌ ${fallos} comprobación(es) fallida(s).\n`);
    process.exit(fallos === 0 ? 0 : 1);
})();
