// node scripts/banco_lote_lectura.js — banco de SOLO LECTURA para ver la ficha del lote
// (frontend/lote-demo.html, config «lote-demo-5193» de .claude/launch.json) sin iniciar
// sesión: las rutas de lotes y prescriptores con un usuario simulado (BANCO_ROL, ADMIN
// por defecto). TODA escritura se corta —local = producción— y también el GET /marwen,
// que sella el estado en el lote. Sin guardianes: escucha SOLO en 127.0.0.1 y nunca va
// al VPS. Ver docs/conocimiento/lotes/la-ficha-del-lote-en-crema.md.
const path = require('path');
const BE = path.resolve(__dirname, '..');
process.chdir(BE);
require(require.resolve('dotenv', { paths: [BE] })).config({ path: path.join(BE, '.env'), quiet: true });
const ROL = process.env.BANCO_ROL || 'ADMIN';
const authPath = require.resolve(path.join(BE, 'middleware/auth.js'));
const real = require(authPath);
const fake = (req, _res, next) => { req.user = { id_usuario: 'banco', rol_nombre: ROL, email: 'banco@local', perfilCompleto: { nombre: 'BANCO' } }; next(); };
require.cache[authPath].exports = { ...real, staffOnly: fake, adminOnly: fake, enforceAuth: fake, internalOnly: fake, requireAuth: fake,
    sesionOClaveInterna: fake, staffOClaveInterna: fake, adminOClaveInterna: fake };
const express = require(require.resolve('express', { paths: [BE] }));
const app = express();
app.use((req, res, next) => {
    if (req.method !== 'GET' || /\/marwen/.test(req.path)) {
        console.log('[banco] BLOQUEADO', req.method, req.originalUrl);
        return res.status(418).json({ error: 'Banco de pruebas: bloqueado (local = producción)' });
    }
    console.log('[banco]', req.method, req.originalUrl);
    next();
});
app.use(express.json());
app.use('/api/lotes', require(path.join(BE, 'routes/lotes.js')));
app.use('/api/prescriptores', require(path.join(BE, 'routes/prescriptores.js')));
app.use('/api', (req, res) => res.status(404).json({ error: 'No en el banco' }));
const PORT = Number(process.env.PORT || 3061);
app.listen(PORT, '127.0.0.1', () => console.log(`[banco] lotes de solo lectura en ${PORT} (${ROL})`));
