// Lista las rutas del backend que NO llevan un guardián que corte sin sesión.
//
//   node scripts/auditar_rutas_sin_guardian.js        (desde implementation/backend)
//
// `requireAuth` NO es un guardián: sin token pone req.user = null y deja pasar.
// El 02/10/2026 eso dejaba sin sesión el listado entero de oportunidades y los
// envíos de email y WhatsApp (ver la regla 102 de CLAUDE.md).
//
// Sale con código 1 si aparece una ruta sin guardián que no esté en la lista de
// ABIERTAS a propósito: una ruta nueva o se protege o se justifica aquí.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Middlewares que cortan una petición sin sesión (o sin la clave interna).
const GUARDIANES = new Set([
    'enforceAuth', 'staffOnly', 'adminOnly', 'internalOnly', 'requireAdmin',
    'sesionOClaveInterna', 'staffOClaveInterna', 'internalKeyOrAuth',
    'staffSiOportunidad', 'suyoSiCertificador', 'adminOInterno', 'staffOInterno',
    'requireBot', 'comprobarFirma',
]);

// Routers públicos POR DISEÑO: cada ruta valida su token, firma o enlace dentro.
const ROUTERS_PUBLICOS = new Set(['public', 'portal', 'publicMarketplace', 'landing', 'afirmaStorage', 'acciones']);

// Rutas sueltas abiertas a propósito, con el motivo.
const ABIERTAS = {
    'POST /api/auth/forgot-password': 'recuperar contraseña',
    'POST /api/auth/reset-password': 'recuperar contraseña',
    'GET /api/auth/verify-token': 'recuperar contraseña',
    'GET /api/catastro/status': 'datos públicos del Catastro (lo usa la landing)',
    'GET /api/catastro/dwellings/:rc14': 'datos públicos del Catastro (landing)',
    'GET /api/catastro/search': 'datos públicos del Catastro (landing)',
    'POST /api/catastro/reverse-geocode': 'datos públicos del Catastro (landing)',
    'GET /api/catastro/autocomplete': 'datos públicos (landing)',
    'GET /api/catastro/place-details': 'datos públicos (landing)',
    'GET /api/catastro/neighbors': 'datos públicos del Catastro (landing)',
    'GET /api/catastro/image/:rc': 'datos públicos del Catastro (landing)',
    'GET /api/catastro/parcel-image/:rc': 'datos públicos del Catastro (landing)',
    'GET /api/catastro/municipios': 'datos públicos (landing)',
    'GET /api/catastro/property-data': 'datos públicos del Catastro (landing)',
    'GET /api/geo/ccaa': 'listado público de CCAA',
    'GET /api/geo/provincias': 'listado público de provincias',
    'GET /api/geo/municipios': 'listado público de municipios',
    'GET /api/usuarios/me': 'devuelve el propio req.user (null sin sesión)',
    'GET /api/oportunidades/test-router': 'no devuelve datos',
    // expedientes.js: públicas declaradas en PUBLIC_EXPEDIENTE_ROUTES, cada una con su token
    'POST /api/expedientes/:id/cert-ack': 'token ack_token del encargo',
    'GET /api/expedientes/:id/notify-client': 'token notify_client_token_*',
    'GET /api/expedientes/:id/approve-cee-from-email': 'firma HMAC del email',
    'GET /api/expedientes/:id/open-local-folder': 'firma HMAC del email de revisión',
};

// expedientes.js aplica `internalOnly` a TODO el router con un router.use, salvo a
// lo que declara en PUBLIC_EXPEDIENTE_ROUTES: ahí no hace falta guardián en línea.
const CUBIERTAS_POR_ROUTER_USE = new Set([
    'GET /api/expedientes/:id/fichas-tecnicas/:type',
    'GET /api/expedientes/:id/anexos-cifo/:driveId/content',
]);

const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
const montaje = {};
for (const m of server.matchAll(/app\.use\('([^']+)',\s*(?:require\('\.\/routes\/(\w+)'\)|(\w+)Routes)/g)) {
    montaje[m[2] || m[3]] = m[1];
}

const sinGuardian = [];
let total = 0;
for (const f of fs.readdirSync(path.join(RAIZ, 'routes')).filter(x => x.endsWith('.js'))) {
    const nombre = f.replace(/\.js$/, '');
    const src = fs.readFileSync(path.join(RAIZ, 'routes', f), 'utf8');
    const re = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2\s*,([^\n]*)/g;
    let m;
    while ((m = re.exec(src))) {
        total++;
        const cadena = [];
        for (const trozo of m[4].split(',')) {
            const s = trozo.trim();
            if (/^(async|\(|function|req\b)/.test(s)) break;
            const id = s.match(/^([A-Za-z_]\w*)/);
            if (!id) break;
            cadena.push(id[1]);
        }
        if (cadena.some(c => GUARDIANES.has(c)) || ROUTERS_PUBLICOS.has(nombre)) continue;
        const clave = `${m[1].toUpperCase()} ${(montaje[nombre] || '?')}${m[3] === '/' ? '' : m[3]}`;
        if (ABIERTAS[clave] || CUBIERTAS_POR_ROUTER_USE.has(clave)) continue;
        sinGuardian.push(`${clave}   [${cadena.join(', ') || 'sin middleware'}]  routes/${f}`);
    }
}

const declaradas = (fs.readdirSync(path.join(RAIZ, 'routes'))
    .filter(x => x.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(RAIZ, 'routes', f), 'utf8').match(/router\.(get|post|put|patch|delete)\(/g) || [])
    .flat().length);

console.log(`Rutas leídas: ${total} de ${declaradas} declaradas.`);
if (total !== declaradas) console.log('⚠ Hay rutas declaradas en varias líneas que este script no lee: revísalas a mano.');
if (!sinGuardian.length) {
    console.log('✓ Ninguna ruta sin guardián fuera de las públicas a propósito.');
    process.exit(total === declaradas ? 0 : 1);
}
console.log(`✗ ${sinGuardian.length} ruta(s) sin guardián:`);
for (const s of sinGuardian) console.log('   ' + s);
process.exit(1);
