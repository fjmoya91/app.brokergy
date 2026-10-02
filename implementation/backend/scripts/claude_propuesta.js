// La LLAVE DE CLAUDE: enviar una propuesta como si se pulsara el botón, sin que
// nadie tenga que iniciar sesión.
//
//   node scripts/claude_propuesta.js alta                          crea la cuenta del robot (una vez)
//   node scripts/claude_propuesta.js enviar 26RES060_OP217 --a cliente,instalador
//                                                                   EN SECO: abre el popup, elige y enseña
//   node scripts/claude_propuesta.js enviar 26RES060_OP217 --a cliente,instalador --enviar
//                                                                   pulsa ENVIAR de verdad
//   node scripts/claude_propuesta.js baja                          la desactiva (deja de poder entrar)
//
// CÓMO FUNCIONA. La propuesta (el PDF y los mensajes) la compone el NAVEGADOR al
// abrir el popup: React la dibuja y la ajusta midiendo la página, así que el
// servidor no puede rehacerla sin divergir de la que ve una persona. El robot
// abre un Chrome sin pantalla en ESTE PC, entra en https://app.brokergy.es con la
// cuenta de Claude y pulsa los mismos botones que una persona: «Generar PDF» →
// ENVIAR → destinatarios → Enviar. Todo lo demás (versión, PDF en Drive, email,
// WhatsApp, estado e historial) lo hace la app como siempre.
//
// SEGURIDAD.
// - La cuenta (rol ADMIN, para que la propuesta salga idéntica a la tuya) NO TIENE
//   CONTRASEÑA: se crea con una aleatoria que no se guarda en ningún sitio, y su
//   email es de un dominio sin buzón. No se puede entrar con ella desde la
//   pantalla de acceso.
// - La sesión la abre ESTE script con la clave de servicio del `.env` (la que ya
//   tiene el PC), dura lo que dura el envío y se CIERRA al terminar.
// - Se reconoce por `app_metadata.robot`, que solo puede escribir el servidor, y
//   el historial firma lo que hace como «CLAUDE».
// - `baja` la desactiva: el backend rechaza sus sesiones (en ≤ 5 min, la caché).
// - Lo que puede hacer es lo que hace este script: hoy, enviar una propuesta.
// - Por defecto va EN SECO: enseña a quién, por dónde y con qué texto. Solo con
//   `--enviar` pulsa el botón.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const APP = process.env.CLAUDE_ROBOT_APP_URL || 'https://app.brokergy.es';
const EMAIL = 'robot.claude@app.brokergy.es';   // app.brokergy.es no tiene buzón
const ROL_ADMIN = 1;
const URL_SB = process.env.SUPABASE_URL;
const sb = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const REF = new URL(URL_SB).hostname.split('.')[0];
const CLAVE_SESION = `sb-${REF}-auth-token`;
const MODOS = { cliente: 'CLIENTE', partner: 'PARTNER', instalador: 'INSTALADOR' };
const SALIDA = path.join(__dirname, '../scratch/claude_propuesta');

const args = process.argv.slice(2);
const orden = args[0];
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const bandera = (n) => args.includes(n);

async function buscarCuenta() {
    const { data: u } = await sb.from('usuarios').select('id_usuario, auth_user_id, activo').eq('email', EMAIL).maybeSingle();
    return u || null;
}

async function alta() {
    const ya = await buscarCuenta();
    if (ya) {
        if (ya.activo === false) await sb.from('usuarios').update({ activo: true }).eq('id_usuario', ya.id_usuario);
        console.log(`La cuenta de Claude ya existe (${EMAIL})${ya.activo === false ? ' — reactivada' : ''}.`);
        return;
    }
    const { data, error } = await sb.auth.admin.createUser({
        email: EMAIL,
        email_confirm: true,
        password: crypto.randomBytes(48).toString('base64'),   // nadie la conoce: no se guarda
        app_metadata: { robot: true },
    });
    if (error) throw new Error(`No se pudo crear la cuenta: ${error.message}`);
    const { error: e2 } = await sb.from('usuarios').insert([{
        auth_user_id: data.user.id, id_rol: ROL_ADMIN, nombre: 'CLAUDE', apellidos: '(robot)', email: EMAIL, activo: true,
    }]);
    if (e2) {
        await sb.auth.admin.deleteUser(data.user.id);
        throw new Error(`No se pudo crear el perfil: ${e2.message}`);
    }
    console.log(`✓ Cuenta de Claude creada (${EMAIL}), rol ADMIN, sin contraseña utilizable.`);
}

async function baja() {
    const u = await buscarCuenta();
    if (!u) { console.log('No hay cuenta de Claude.'); return; }
    await sb.from('usuarios').update({ activo: false }).eq('id_usuario', u.id_usuario);
    console.log('✓ Cuenta de Claude DESACTIVADA. Para volver a usarla: `alta`.');
}

// Abre una sesión SIN contraseña: el servidor genera el enlace mágico y lo
// canjea él mismo. No se envía ningún email.
async function abrirSesion() {
    const u = await buscarCuenta();
    if (!u) throw new Error('No existe la cuenta de Claude: ejecuta primero `alta`.');
    if (u.activo === false) throw new Error('La cuenta de Claude está desactivada (`alta` la reactiva).');
    const { data: link, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    if (error) throw new Error(`No se pudo abrir la sesión: ${error.message}`);
    const anon = createClient(URL_SB, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } });
    const { data: ses, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
    if (e2 || !ses?.session) throw new Error(`No se pudo abrir la sesión: ${e2?.message || 'sin sesión'}`);
    return ses.session;
}

async function cerrarSesion(sesion) {
    if (!sesion?.access_token) return;
    try { await sb.auth.admin.signOut(sesion.access_token, 'global'); } catch { /* ya caducada */ }
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function enviar() {
    const op = args[1];
    if (!op || !/^\d\dRES|^\d\dTER/.test(op)) throw new Error('Falta el nº de oportunidad (p. ej. 26RES060_OP217).');
    const pedidos = (opcion('--a') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!pedidos.length || pedidos.some(p => !MODOS[p])) throw new Error('Indica a quién: --a cliente,instalador (también: partner).');
    const quiero = new Set(pedidos.map(p => MODOS[p]));
    const deVerdad = bandera('--enviar');
    fs.mkdirSync(SALIDA, { recursive: true });
    const foto = async (page, n) => { const f = path.join(SALIDA, `${op}-${n}.png`); await page.screenshot({ path: f }); return f; };

    const sesion = await abrirSesion();
    const puppeteer = require(path.join(__dirname, '../node_modules/puppeteer'));
    const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1440, height: 950 } });
    try {
        const page = await browser.newPage();
        const host = new URL(APP).hostname;
        await page.evaluateOnNewDocument((h, k, v) => {
            if (location.hostname === h && !localStorage.getItem(k)) localStorage.setItem(k, v);
        }, host, CLAVE_SESION, JSON.stringify(sesion));
        const errores = [];
        page.on('pageerror', e => errores.push(e.message));

        console.log(`→ Abriendo ${op} en ${APP} como CLAUDE…`);
        await page.goto(`${APP}/?op=${encodeURIComponent(op)}`, { waitUntil: 'networkidle2', timeout: 90000 });
        await page.waitForSelector('[data-robot="abrir-propuesta"]', { timeout: 90000 })
            .catch(async () => { throw new Error(`No se abrió la oportunidad (captura: ${await foto(page, '0-error')}).`); });
        await espera(1500);

        await page.click('[data-robot="abrir-propuesta"]');
        await espera(1500);
        if (await page.$('[data-robot="aviso-sin-guardar"]')) {
            if (!bandera('--sin-guardar')) {
                throw new Error('La simulación tiene cambios SIN GUARDAR respecto a lo guardado (al recalcularla sale otra cifra). '
                    + 'No envío nada: revísala en la app, o repite con --sin-guardar para enviar la propuesta tal y como sale ahora '
                    + `(captura: ${await foto(page, '1-sin-guardar')}).`);
            }
            const [boton] = await page.$$('xpath/.//button[contains(., "Continuar sin guardar")]');
            if (!boton) throw new Error('No encuentro «Continuar sin guardar».');
            await boton.click();
        }
        await page.waitForSelector('[data-robot="abrir-envio"]', { timeout: 90000 })
            .catch(async () => { throw new Error(`No se abrió la propuesta (captura: ${await foto(page, '2-error')}).`); });
        await espera(4000);   // la portada se ajusta midiendo: que termine
        await page.click('[data-robot="abrir-envio"]');
        await page.waitForSelector('[data-robot^="modo-"]', { timeout: 60000 });
        await espera(2500);   // carga de versiones y estado de WhatsApp

        // Destinatarios: marcar los pedidos y desmarcar el resto.
        const estadoModos = () => page.$$eval('[data-robot^="modo-"]', els => els.map(e => ({
            modo: e.getAttribute('data-robot').slice(5), on: e.getAttribute('data-robot-on') === '1', texto: e.innerText.replace(/\s+/g, ' ').trim(),
        })));
        // En una oportunidad DIRECTA con instalador asociado, la app lo pone en la
        // fila de PARTNER (rotulada con su tipo, «Instalador») y oculta la de
        // INSTALADOR para no repetir a la misma empresa. Pedir «instalador» es
        // entonces esa fila — y se dice.
        const disponibles = await estadoModos();
        if (quiero.has('INSTALADOR') && !disponibles.some(m => m.modo === 'INSTALADOR')) {
            const p = disponibles.find(m => m.modo === 'PARTNER' && /instalador/i.test(m.texto));
            if (p) { quiero.delete('INSTALADOR'); quiero.add('PARTNER'); console.log(`  (el instalador va en la fila de partner: ${p.texto})`); }
        }
        for (const m of disponibles) {
            if (m.on !== quiero.has(m.modo)) { await page.click(`[data-robot="modo-${m.modo}"]`); await espera(700); }
        }
        const modos = await estadoModos();
        const faltan = [...quiero].filter(q => !modos.some(m => m.modo === q && m.on));
        if (faltan.length) throw new Error(`En el popup no hay destinatario ${faltan.join(', ')} (hay: ${modos.map(m => m.modo).join(', ') || 'ninguno'}).`);
        await espera(1200);

        const canales = await page.$$eval('[data-robot^="canal-"]', els => els.map(e => ({
            canal: e.getAttribute('data-robot').slice(6), on: e.getAttribute('data-robot-on') === '1', texto: e.innerText.replace(/\s+/g, ' ').trim(),
        })));
        const mensaje = await page.$eval('[data-robot="mensaje"]', e => e.value);
        const avisos = await page.evaluate(() => {
            const caja = document.querySelector('[data-robot="mensaje"]')?.closest('.fixed, [role="dialog"]') || document.body;
            return [...caja.querySelectorAll('p, div')].map(e => e.innerText?.trim()).filter(t => t && /versi[oó]n|anula|ya se envi|programad|acept/i.test(t) && t.length < 400)
                .filter((t, i, a) => a.indexOf(t) === i).slice(0, 6);
        });
        const captura = await foto(page, '3-popup');

        console.log('\n══ Lo que se va a enviar ══');
        for (const m of modos.filter(x => x.on)) console.log(`  ✓ ${m.texto}`);
        console.log(`  Canales: ${canales.map(c => `${c.on ? '✓' : '·'} ${c.texto}`).join('   ')}`);
        if (avisos.length) { console.log('  Avisos del popup:'); for (const a of avisos) console.log(`    · ${a.replace(/\s+/g, ' ')}`); }
        console.log('\n── Mensaje ──\n' + mensaje + '\n─────────────');
        console.log(`  Captura: ${captura}`);
        if (errores.length) console.log(`  ⚠ Errores en la página: ${errores.slice(0, 3).join(' | ')}`);
        if (!canales.some(c => c.on)) throw new Error('Ningún canal disponible: no se puede enviar.');

        if (!deVerdad) {
            console.log('\nEN SECO: no se ha enviado nada. Repite con --enviar para pulsar ENVIAR.');
            return;
        }

        console.log('\n→ Pulsando ENVIAR…');
        await page.click('[data-robot="enviar"]');
        await page.waitForSelector('[data-robot="envio-resultado"][data-robot-fase="done"]', { timeout: 300000 })
            .catch(async () => { throw new Error(`El envío no terminó en 5 min (captura: ${await foto(page, '4-error')}). Compruébalo en la app antes de repetir.`); });
        await espera(800);
        const res = await page.$eval('[data-robot="envio-resultado"]', e => ({ ok: e.getAttribute('data-robot-ok'), texto: e.innerText.replace(/\n{2,}/g, '\n').trim() }));
        const final = await foto(page, '5-resultado');
        console.log(`\n══ Resultado: ${res.ok === '1' ? 'ENVIADO' : res.ok === 'parcial' ? 'ENVIADO A MEDIAS' : 'NO ENVIADO'} ══\n${res.texto}\n  Captura: ${final}`);
        if (res.ok !== '1') process.exitCode = 1;
    } finally {
        await browser.close().catch(() => {});
        await cerrarSesion(sesion);
    }
}

(async () => {
    try {
        if (orden === 'alta') await alta();
        else if (orden === 'baja') await baja();
        else if (orden === 'enviar') await enviar();
        else {
            console.log('Uso: alta | baja | enviar <nº oportunidad> --a cliente,instalador [--enviar] [--sin-guardar]');
            process.exitCode = 2;
        }
    } catch (e) {
        console.error(`✗ ${e.message}`);
        process.exitCode = 1;
    }
})();
