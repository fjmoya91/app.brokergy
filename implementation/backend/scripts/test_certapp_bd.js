// App de certificadores — contra la Supabase de VERDAD (la de producción).
//   node scripts/test_certapp_bd.js              cuentas, activación, beta, alta directa (email y
//                                                con sesión), enlace para entrar, Mis gastos, créditos
//   node scripts/test_certapp_bd.js --con-obra   además una obra (gasta un número {AAAA}EXT_n de la secuencia)
// Crea tres cuentas de prueba (usuarios de Auth incluidos) con emails @example.com
// y lo BORRA TODO al acabar, pase lo que pase. Sin Drive (CERTAPP_DRIVE_ROOT_ID
// vacío) y con los avisos en seco: no sale nada a nadie.
// Si el SQL (scripts/certapp_schema.sql) aún no está aplicado, dice PENDIENTE.
const path = require('path');
const B = path.join(__dirname, '..');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env'), quiet: true });
Object.assign(process.env, { CERTAPP_DRIVE_ROOT_ID: '', CERTAPP_AVISOS_ENABLED: 'false', CERTAPP_IA_AUTO: 'false', WHATSAPP_ENABLED: 'false' });

const supabase = require(path.join(B, 'services/supabaseClient'));
const { tablaPendiente } = require(path.join(B, 'services/certapp/comun'));
const CON_OBRA = process.argv.includes('--con-obra');

let fallos = 0;
let total = 0;
const ok = (cond, texto) => { total++; if (!cond) fallos++; console.log(`${cond ? '✓' : '✗'} ${texto}`); };

(async () => {
    // ── ¿Está el SQL aplicado? ──────────────────────────────────────────────
    const pendientes = [];
    for (const t of ['certapp_cuentas', 'certapp_beta_solicitudes', 'certapp_obras', 'certapp_eventos', 'certapp_feedback', 'certapp_asistente_uso', 'certapp_movimientos']) {
        const { error } = await supabase.from(t).select('id').limit(1);
        if (error && tablaPendiente(error)) pendientes.push(t);
        else if (error) { console.error(`✗ ${t}: ${error.message}`); process.exit(1); }
    }
    const { data: rpcSinObra, error: rpcErr } = await supabase.rpc('certapp_consumir_credito_obra', { p_obra_id: '00000000-0000-0000-0000-000000000000' });
    if (rpcErr && tablaPendiente(rpcErr)) pendientes.push('certapp_consumir_credito_obra()');
    const { error: colErr } = await supabase.from('certapp_obras').select('id, credito_consumido, revisiones, portal_token_at').limit(1);
    if (colErr && tablaPendiente(colErr)) pendientes.push('columnas nuevas de certapp_obras (credito_consumido, revisiones, portal_token_at)');
    const { error: colEv } = await supabase.from('certapp_eventos').select('id, por_detalle, nota_interna').limit(1);
    if (colEv && tablaPendiente(colEv)) pendientes.push('columnas nuevas de certapp_eventos (por_detalle, nota_interna)');
    if (pendientes.length) {
        console.log(`PENDIENTE — el SQL de la app no está aplicado en Supabase (faltan: ${pendientes.join(', ')}).`);
        console.log('Hay que pegar implementation/backend/scripts/certapp_schema.sql en el editor SQL del panel y volver a pasar esta prueba.');
        process.exit(0);
    }

    const cuentas = require(path.join(B, 'services/certapp/cuentas'));
    const tokens = require(path.join(B, 'services/certapp/tokens'));
    const beta = require(path.join(B, 'services/certapp/beta'));
    const asistente = require(path.join(B, 'services/certapp/asistente'));
    const ts = Date.now();
    const email = `certapp.prueba.${ts}@example.com`;
    const emailDirecta = `certapp.prueba.directa.${ts}@example.com`;   // alta desde el formulario, por email
    const emailSesion = `certapp.prueba.google.${ts}@example.com`;     // alta con sesión (como Google)
    const creado = { cuentaId: null, authId: null, obraId: null, cuentas: [], auths: [], betaEmails: [email, emailDirecta, emailSesion] };

    try {
        // ── Alta de la cuenta ───────────────────────────────────────────────
        const r = await cuentas.crearCuenta({ email, nombre: 'Prueba', apellidos: 'Certapp', creditos: 1 }, { por: 'test_certapp_bd' });
        creado.cuentaId = r.cuenta.id;
        const fila = await cuentas.cuentaPorId(r.cuenta.id);
        creado.authId = fila.auth_user_id;
        ok(fila.estado === 'PENDIENTE' && fila.creditos === 1 && fila.auth_user_id, 'alta: cuenta PENDIENTE con su usuario de Auth y los créditos');
        ok(!r.preexistente && /\/activar\?token=a\./.test(r.enlace), 'alta: devuelve el enlace /activar?token=');
        ok(r.email?.seco === true, 'alta: el email de invitación va en seco (avisos apagados)');
        const otra = await cuentas.crearCuenta({ email: email.toUpperCase() }, { por: 'test' });
        ok(otra.reinvitada === true && otra.cuenta.id === r.cuenta.id, 'invitar otra vez el mismo email (en mayúsculas): reinvita, no duplica');

        // ── Activar (un solo uso) ───────────────────────────────────────────
        const token = decodeURIComponent(r.enlace.split('token=')[1]);
        const info = await cuentas.infoActivacion(token);
        ok(info.email === email && info.tipo === 'activar', 'GET /activar/:token dice de quién es');
        try { await cuentas.activar(token, 'corta'); ok(false, 'contraseña corta: 400'); } catch (e) { ok(e.status === 400, 'contraseña corta: 400'); }
        const act = await cuentas.activar(token, `Prueba-${Date.now()}!`);
        ok(act.ok === true, 'POST /activar pone la contraseña');
        const trasActivar = await cuentas.cuentaPorId(r.cuenta.id);
        ok(trasActivar.estado === 'ACTIVA' && trasActivar.prefs?.activada_at, 'la cuenta pasa a ACTIVA');
        try { await cuentas.activar(token, 'OtraClave-123'); ok(false, 'el mismo enlace por segunda vez: no vale'); }
        catch (e) { ok(e.status === 400 && e.code === 'TOKEN_INVALIDO', 'el mismo enlace por segunda vez: no vale (un solo uso)'); }
        const rec = await cuentas.recuperar(email);
        ok(rec.ok === true, 'POST /recuperar responde { ok } (en seco)');
        const tokR = tokens.firmarCuenta('r', trasActivar.id, trasActivar.prefs.pwd_nonce);
        ok((await cuentas.infoActivacion(tokR)).tipo === 'recuperar', 'el enlace de recuperar se reconoce como tal');

        // ── Créditos: las RPC van por OBRA (las pruebas con obra, en --con-obra) ──
        ok(rpcSinObra === -2, `consumir el crédito de una obra que no existe: -2, sin tocar ninguna cuenta [${rpcSinObra}]`);

        // ── Perfil ──────────────────────────────────────────────────────────
        const perfil = await cuentas.actualizarPerfil(r.cuenta.id, { nif: '12.345.678-z', titulacion: 'Arquitecto técnico', creditos: 999, estado: 'BLOQUEADA' });
        ok(perfil.nif === '12345678Z' && perfil.creditos === 1 && perfil.estado === 'ACTIVA', 'PUT /me: guarda el perfil y NO deja tocar créditos ni estado');

        // ── Cupo del asistente ──────────────────────────────────────────────
        const cupo = await asistente.cupo(r.cuenta.id);
        ok(cupo.usados_hoy === 0 && cupo.max_dia > 0, 'cupo del asistente: se cuenta en certapp_asistente_uso');

        // ── Beta: mismo email = NO se pisa (certapp_beta_apuntar) ──────────────
        // El email ya tiene cuenta: con el alta directa, ni se crea otra ni se dice nada.
        const b1 = await beta.apuntar({ nombre: 'Prueba Beta', email, consentimiento: true, acepta_condiciones: true, perfil: 'autonomo', software: ['CE3X'], web: '', form_token: 'x' }, { ip: '127.0.0.1', userAgent: 'test' });
        // Sin cifras: el nombre se sanea (nombreSeguro) y «Prueba Beta 2» quedaría en «Prueba Beta».
        const b2 = await beta.apuntar({ nombre: 'Prueba Beta Dos', email: email.toUpperCase(), telefono: '600000000', consentimiento: true, acepta_condiciones: true, cee_mes: '6-15' }, { ip: '127.0.0.1', userAgent: 'test' });
        const { data: sols } = await supabase.from('certapp_beta_solicitudes').select('id, nombre, telefono, perfil, cee_mes, ip_hash, respuestas').eq('email', email);
        ok(JSON.stringify(b1) === '{"ok":true}' && JSON.stringify(b2) === '{"ok":true}' && sols?.length === 1, 'beta: la respuesta es siempre { ok: true } y el mismo email no duplica');
        const sol = sols?.[0] || {};
        ok(sol.nombre === 'Prueba Beta' && sol.cee_mes === '6-15' && sol.telefono === '600000000' && sol.perfil === 'AUTONOMO',
            'beta: la segunda vez NO pisa el nombre; solo rellena lo que estaba vacío (cee_mes, teléfono)');
        ok(Array.isArray(sol.respuestas?.revisiones) && sol.respuestas.revisiones.length === 1 && sol.respuestas.revisiones[0].nombre === 'Prueba Beta Dos',
            'beta: lo que llegó la segunda vez queda en respuestas.revisiones');
        ok(sol.ip_hash && sol.ip_hash !== '127.0.0.1' && !('web' in (sol.respuestas || {})) && !('form_token' in (sol.respuestas || {})), 'beta: guarda el crudo, la IP solo en hash y sin el honeypot ni el form_token');
        ok((await cuentas.cuentaPorEmail(email))?.id === r.cuenta.id, 'beta con un email que ya tiene cuenta: no crea otra');
        const { data: movAlta } = await supabase.from('certapp_movimientos').select('tipo, creditos, saldo_despues, por').eq('cuenta_id', r.cuenta.id);
        ok(movAlta?.length === 1 && movAlta[0].tipo === 'ALTA' && movAlta[0].creditos === 1 && movAlta[0].saldo_despues === 1, 'Mis gastos: la invitación apunta su ALTA con los créditos');

        // ── Alta directa por email (el formulario de la beta crea la cuenta) ──
        try { await beta.apuntar({ nombre: 'Sin Condiciones', email: emailDirecta, consentimiento: true }, { ip: '127.0.0.1', userAgent: 'test' }); ok(false, 'alta directa sin aceptar las condiciones: 400'); }
        catch (e) { ok(e.status === 400 && e.code === 'FALTA_CONDICIONES', 'alta directa sin aceptar las condiciones: 400 FALTA_CONDICIONES'); }
        ok(!(await cuentas.cuentaPorEmail(emailDirecta)), '…y no se crea nada');
        const bd = await beta.apuntar({ nombre: 'Prueba Directa', email: emailDirecta, telefono: '600111222', provincia: 'Toledo', consentimiento: true, acepta_condiciones: true,
            comunidades: ['CASTILLA-LA MANCHA'], software: ['CE3X'] }, { ip: '127.0.0.1', userAgent: 'test' });
        const cd = await cuentas.cuentaPorEmail(emailDirecta);
        creado.cuentas.push(cd?.id); creado.auths.push(cd?.auth_user_id);
        ok(JSON.stringify(bd) === '{"ok":true}' && cd?.estado === 'PENDIENTE' && cd.auth_user_id && cd.creditos === cuentas.creditosBeta(),
            `alta directa: cuenta PENDIENTE con su usuario de Auth y ${cuentas.creditosBeta()} crédito(s) de la beta`);
        ok(cd?.telefono === null && cd.prefs?.telefono_por_confirmar === '600111222', 'alta directa: el teléfono NO se copia; queda por confirmar en el perfil');
        ok(cd?.prefs?.condiciones?.version === cuentas.CONDICIONES_VERSION && cd.prefs.condiciones.at && cd.prefs.alta?.via === 'email', 'alta directa: guarda la versión y la fecha de las condiciones aceptadas');
        ok(cd?.prefs?.perfil?.comunidades?.[0] === 'CASTILLA-LA MANCHA' && cd.prefs.perfil.software?.[0] === 'CE3X', 'alta directa: comunidades y programas al perfil');
        ok(cd?.nombre === 'Prueba' && cd.apellidos === 'Directa', `alta directa: «Nombre y apellidos» partido en la cuenta [${cd?.nombre} | ${cd?.apellidos}]`);
        const { data: solD } = await supabase.from('certapp_beta_solicitudes').select('estado, cuenta_id').eq('email', emailDirecta).maybeSingle();
        ok(solD?.estado === 'INVITADA', 'alta directa: la solicitud queda INVITADA');
        const { data: movD } = await supabase.from('certapp_movimientos').select('tipo, creditos').eq('cuenta_id', cd?.id);
        ok(movD?.length === 1 && movD[0].tipo === 'ALTA' && movD[0].creditos === cuentas.creditosBeta(), 'alta directa: su ALTA en Mis gastos');
        const bdOtra = await beta.apuntar({ nombre: 'Prueba Directa', email: emailDirecta.toUpperCase(), consentimiento: true, acepta_condiciones: true }, { ip: '127.0.0.1', userAgent: 'test' });
        const { count: nCd } = await supabase.from('certapp_cuentas').select('id', { count: 'exact', head: true }).ilike('email', emailDirecta);
        ok(JSON.stringify(bdOtra) === '{"ok":true}' && nCd === 1, 'alta directa dos veces (en mayúsculas): la misma respuesta y una sola cuenta');

        // ── El enlace para entrar (`e`): un solo uso ────────────────────────
        const tokE = tokens.firmarCuenta('e', cd.id, cd.prefs.pwd_nonce);
        const can = await cuentas.canjearEnlace(tokE);
        ok(can.ok && can.email === emailDirecta && typeof can.token_hash === 'string' && can.token_hash.length > 20, 'POST /enlace/canjear: da el token_hash del enlace mágico de Supabase');
        try { await cuentas.canjearEnlace(tokE); ok(false, 'el mismo enlace otra vez: no vale'); }
        catch (e) { ok(e.status === 400 && e.code === 'TOKEN_INVALIDO', 'el mismo enlace otra vez: no vale (un solo uso)'); }
        try { await cuentas.activar(tokens.firmarCuenta('e', cd.id, (await cuentas.cuentaPorId(cd.id)).prefs.pwd_nonce), 'Clave-Larga-123'); ok(false, 'un enlace de entrar no sirve para poner contraseña'); }
        catch (e) { ok(e.status === 400, 'un enlace de entrar no sirve para poner contraseña'); }
        ok((await cuentas.mandarEnlaceEntrar(emailDirecta)).ok === true && (await cuentas.mandarEnlaceEntrar('nadie.nunca@example.com')).ok === true, 'POST /enlace: la misma respuesta haya cuenta o no (en seco)');

        // ── Alta con sesión (lo que hace «Continuar con Google») ───────────
        const { data: uG, error: uGErr } = await supabase.auth.admin.createUser({ email: emailSesion, email_confirm: true });
        if (uGErr) throw uGErr;
        creado.auths.push(uG.user.id);
        const sesion = { authId: uG.user.id, email: emailSesion };
        try { await beta.apuntar({ nombre: 'Prueba Google', consentimiento: true }, { ip: '127.0.0.1', userAgent: 'test', sesion }); ok(false, 'alta con sesión sin condiciones: 400'); }
        catch (e) { ok(e.status === 400 && e.code === 'FALTA_CONDICIONES', 'alta con sesión sin condiciones: 400'); }
        const bg = await beta.apuntar({ nombre: 'Prueba Google', email: 'otro.distinto@example.com', telefono: '600333444', consentimiento: true, acepta_condiciones: true },
            { ip: '127.0.0.1', userAgent: 'test', sesion });
        creado.cuentas.push(bg.cuenta?.id);
        ok(bg.ok && bg.nueva === true && bg.cuenta?.estado === 'ACTIVA' && bg.cuenta.email === emailSesion && bg.cuenta.auth_user_id === uG.user.id,
            'alta con sesión: cuenta ACTIVA con el email de la SESIÓN (no el del formulario), vinculada a su usuario');
        ok(bg.cuenta?.telefono === '600333444', 'alta con sesión: el teléfono se copia');
        const bg2 = await beta.apuntar({ nombre: 'Prueba Google', consentimiento: true, acepta_condiciones: true }, { ip: '127.0.0.1', userAgent: 'test', sesion });
        ok(bg2.nueva === false && bg2.cuenta?.id === bg.cuenta?.id, 'alta con sesión otra vez: devuelve la misma cuenta');
        try { await beta.apuntar({ nombre: 'Prueba Google', consentimiento: true, acepta_condiciones: true }, { ip: '127.0.0.1', userAgent: 'test', sesion: { authId: uG.user.id, email: emailDirecta } }); ok(false, 'sesión con un email que ya es de otra cuenta: 409'); }
        catch (e) { ok(e.status === 409 && e.code === 'CUENTA_YA_EXISTE', 'sesión con un email que ya es de otra cuenta: 409'); }

        // ── Obra (opcional: gasta un número de la secuencia) ────────────────
        if (CON_OBRA) {
            const obras = require(path.join(B, 'services/certapp/obras'));
            const docs = require(path.join(B, 'services/certapp/docs'));
            const { obra, drive } = await obras.crear(trasActivar, { ref_catastral: '1234567VK1234N0001AB', titular: { nombre: 'Titular Prueba' }, en_vivienda: true });
            creado.obraId = obra.id;
            ok(/^\d{4}EXT_\d+$/.test(obra.numero_expediente) && obra.portal_token && obra.portal_token_at && obra.estado === 'BORRADOR' && obra.credito_consumido === false && obra.revisiones === 0,
                `obra creada: ${obra.numero_expediente}, BORRADOR, con su enlace de cliente fechado, sin crédito gastado`);
            ok(drive.ok === false && drive.motivo === 'SIN_RAIZ', 'sin CERTAPP_DRIVE_ROOT_ID el alta no falla (sin carpeta)');
            const act2 = await obras.actualizar(obra, { proposito: 'COMPRAVENTA', municipio: 'TOLEDO', provincia: 'TOLEDO', cuestionario: { calefaccion: 'gas', inventado: 1 }, estado: 'LISTO', portal_token: 'x' });
            ok(act2.zona_climatica && act2.estado === 'BORRADOR' && act2.portal_token === obra.portal_token && !('inventado' in act2.cuestionario), `PUT: zona ${act2.zona_climatica} desde el municipio; estado y token intocables; cuestionario saneado`);
            const entry = { driveId: 'prueba-drive-id-0001', nombre: 'PLACA DE LA CALDERA 1.jpg', mime: 'image/jpeg', subido_at: new Date().toISOString(), por: 'test' };
            const ap = await supabase.rpc('certapp_docs_append', { p_id: obra.id, p_slot: 'FOTO_PLACA_CALDERA', p_entry: entry, p_multiple: false });
            ok(!ap.error, 'certapp_docs_append registra el fichero');
            const conDoc = await obras.cargar(obra.id);
            const vista = await docs.vista(conDoc);
            ok(vista.slots.FOTO_PLACA_CALDERA?.[0]?.thumb?.startsWith(`/api/public/certapp/thumb/${obra.id}/`), 'GET /docs: el fichero con su miniatura firmada');
            const br = await docs.borrar(conDoc, 'FOTO_PLACA_CALDERA', 'prueba-drive-id-0001');
            ok(br.quedan === 0, 'DELETE /docs: certapp_docs_replace_slot lo quita');

            // ── Créditos ligados a la obra (la cuenta tiene 1) ──────────────
            const c1 = await supabase.rpc('certapp_consumir_credito_obra', { p_obra_id: obra.id });
            const c2 = await supabase.rpc('certapp_consumir_credito_obra', { p_obra_id: obra.id });
            ok(c1.data === 0 && c2.data === -2, `consumir: 1 → 0; la misma obra otra vez no cobra (-2) [${c1.data}, ${c2.data}]`);
            const marcada = await obras.cargar(obra.id);
            ok(marcada.credito_consumido === true && marcada.credito_consumido_at, 'la obra queda marcada con su crédito');
            const d1 = await supabase.rpc('certapp_devolver_credito_obra', { p_obra_id: obra.id, p_por: 'BROKERGY', p_texto: 'Devuelto (prueba)', p_por_detalle: 'test', p_nota_interna: 'motivo interno' });
            const d2 = await supabase.rpc('certapp_devolver_credito_obra', { p_obra_id: obra.id });
            ok(d1.data === 1 && d2.data === -2, `devolver: vuelve a 1; la segunda devolución no hace nada (-2) [${d1.data}, ${d2.data}]`);
            const { data: evDev } = await supabase.from('certapp_eventos').select('tipo, por, por_detalle, nota_interna').eq('obra_id', obra.id).eq('tipo', 'CREDITO_DEVUELTO');
            ok(evDev?.length === 1 && evDev[0].por === 'BROKERGY' && evDev[0].nota_interna === 'motivo interno', 'devolver apunta UN evento CREDITO_DEVUELTO, con la nota interna aparte');
            const { data: movObra } = await supabase.from('certapp_movimientos').select('tipo, creditos, saldo_despues, concepto').eq('obra_id', obra.id).order('id');
            ok(movObra?.length === 2 && movObra[0].tipo === 'GASTO' && movObra[0].creditos === -1 && movObra[0].saldo_despues === 0
                && movObra[1].tipo === 'DEVOLUCION' && movObra[1].creditos === 1 && movObra[1].saldo_despues === 1 && !/interno/.test(movObra[1].concepto || ''),
                'Mis gastos: un GASTO y una DEVOLUCION (los -2 no apuntan nada) y la nota interna no va al concepto');
            const visibles = await obras.eventos(obra.id);
            ok(visibles.every(e => !('nota_interna' in e) && !('por_detalle' in e)), 'los eventos del certificador no traen ni la nota interna ni quién del equipo');
            await supabase.from('certapp_cuentas').update({ creditos: 0 }).eq('id', r.cuenta.id);
            const c3 = await supabase.rpc('certapp_consumir_credito_obra', { p_obra_id: obra.id });
            const sinMarca = await obras.cargar(obra.id);
            ok(c3.data === -1 && sinMarca.credito_consumido === false, `sin saldo: -1 y la obra sin marcar [${c3.data}]`);
        }
    } catch (e) {
        ok(false, `excepción: ${e.status || ''} ${e.code || ''} ${e.message}`);
        if (e.detalle) console.error(e.detalle);
    } finally {
        // ── Limpieza, pase lo que pase ──────────────────────────────────────
        const borrado = [];
        if (creado.obraId) { const { error } = await supabase.from('certapp_obras').delete().eq('id', creado.obraId); borrado.push(`obra ${error ? `✗ ${error.message}` : '✓'}`); }
        if (creado.cuentaId) {
            await supabase.from('certapp_asistente_uso').delete().eq('cuenta_id', creado.cuentaId);
            await supabase.from('certapp_beta_solicitudes').update({ cuenta_id: null }).eq('cuenta_id', creado.cuentaId);
            const { error } = await supabase.from('certapp_cuentas').delete().eq('id', creado.cuentaId);
            borrado.push(`cuenta ${error ? `✗ ${error.message}` : '✓'}`);
        }
        if (creado.authId) { const { error } = await supabase.auth.admin.deleteUser(creado.authId); borrado.push(`usuario de Auth ${error ? `✗ ${error.message}` : '✓'}`); }
        // Las del alta directa y con sesión (sus movimientos se van con la cuenta: on delete cascade).
        for (const id of [...new Set(creado.cuentas.filter(Boolean))]) {
            await supabase.from('certapp_beta_solicitudes').update({ cuenta_id: null }).eq('cuenta_id', id);
            const { error } = await supabase.from('certapp_cuentas').delete().eq('id', id);
            borrado.push(`cuenta ${error ? `✗ ${error.message}` : '✓'}`);
        }
        for (const id of [...new Set(creado.auths.filter(Boolean))]) {
            const { error } = await supabase.auth.admin.deleteUser(id);
            borrado.push(`usuario de Auth ${error ? `✗ ${error.message}` : '✓'}`);
        }
        { const { error } = await supabase.from('certapp_beta_solicitudes').delete().in('email', creado.betaEmails); borrado.push(`solicitudes de la beta ${error ? `✗ ${error.message}` : '✓'}`); }
        const { count: quedanMov } = await supabase.from('certapp_movimientos').select('id', { count: 'exact', head: true }).in('cuenta_id', [creado.cuentaId, ...creado.cuentas].filter(Boolean));
        borrado.push(`movimientos que quedan: ${quedanMov ?? '¿?'}`);
        console.log(`\nLimpieza (${email} y las otras dos): ${borrado.join(' · ')}`);
        console.log(`${total - fallos}/${total} correctas`);
        process.exit(fallos ? 1 : 0);
    }
})();
