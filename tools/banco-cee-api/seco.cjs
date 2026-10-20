// ============================================================================
// seco.cjs — se carga ANTES de `cee_inicial.js` (`node -r seco.cjs …`) cuando lo
// lanza el banco. Hace dos cosas, y las dos son la razón de ser del banco:
//
//  1. EN SECO DE VERDAD: cualquier escritura en Supabase (POST/PATCH/PUT/DELETE,
//     y TODA llamada a una RPC, que en este backend son de escritura) y en Drive
//     (subir, crear o mover carpetas, permisos, borrar) se CORTA con un error.
//     El script ya es seco sin `--escribir`; esto es el cinturón por si un fallo
//     o una orden se saltara ese guardián.
//  2. A CIEGAS: el agente no puede ver lo que queremos comparar. Se quita de lo
//     que devuelve la BD el CEE del técnico (`cee_inicial`, `xml_inicial`, el
//     final) y el trabajo de la envolvente que ya hiciera alguien (persona o
//     agente), y `leerTrabajo` devuelve null: se empieza de CERO, como si el
//     expediente acabara de llegar.
//
// Lo bloqueado se apunta en BANCO_LOG_SECO (una línea JSON por intento).
// ============================================================================
const fs = require('fs');
const path = require('path');

const BACK = path.resolve(__dirname, '..', '..', 'implementation', 'backend');
const LOG = process.env.BANCO_LOG_SECO || null;

// El .env del backend ANTES de cargar ningún servicio (crean sus clientes al
// requerirse) y las banderas de envío apagadas DESPUÉS, para que manden.
require(require.resolve('dotenv', { paths: [BACK] })).config({ path: path.join(BACK, '.env'), quiet: true });
for (const k of ['BOT_WHATSAPP_ENABLED', 'REVISION_ALERTA_ENABLED', 'CEE_ENTREGA_AUTO',
    'PROPUESTA_PROGRAMADA_ENABLED', 'WA_SYNC_INSTALADORES', 'RESENA_PROGRAMADA_ENABLED']) {
    process.env[k] = 'false';
}

function anota(o) {
    if (!LOG) return;
    try { fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); } catch { /* nada */ }
}

// ── 1. Supabase ──────────────────────────────────────────────────────────────
const CLAVES_CEE_FUERA = [
    'cee_inicial', 'xml_inicial', 'cee_final', 'xml_final',
    'envolvente', 'envolvente_fotos', 'envolvente_imagenes', 'envolvente_revision',
    'cex_sello', 'agente_ia',
];

/** Quita lo que el agente no debe ver, en filas y en alias de `cee->…`. */
function limpia(v, prof = 0) {
    if (!v || typeof v !== 'object' || prof > 4) return v;
    if (Array.isArray(v)) { v.forEach(x => limpia(x, prof + 1)); return v; }
    if (v.cee && typeof v.cee === 'object') for (const k of CLAVES_CEE_FUERA) delete v.cee[k];
    if (v.datos_calculo && typeof v.datos_calculo === 'object') delete v.datos_calculo.envolvente_cee;
    // `select('cee->envolvente')` y similares devuelven la clave suelta.
    if (prof <= 1) for (const k of CLAVES_CEE_FUERA) if (k in v) delete v[k];
    for (const k of ['oportunidades', 'expedientes', 'expediente', 'oportunidad']) {
        if (v[k] && typeof v[k] === 'object') limpia(v[k], prof + 1);
    }
    return v;
}

const pgPath = require.resolve('@supabase/postgrest-js', { paths: [BACK] });
const { PostgrestBuilder } = require(pgPath);
const thenOriginal = PostgrestBuilder.prototype.then;
PostgrestBuilder.prototype.then = function (alCumplir, alFallar) {
    const metodo = this.method;
    const url = String(this.url || '');
    const esRpc = url.includes('/rpc/');
    if (esRpc || !['GET', 'HEAD'].includes(metodo)) {
        const destino = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
        anota({ bloqueado: 'supabase', metodo, destino });
        const err = new Error(`BANCO EN SECO: escritura en la BD bloqueada (${metodo} ${destino})`);
        return Promise.resolve({ data: null, error: err, status: 403, statusText: 'BANCO EN SECO' })
            .then(alCumplir, alFallar);
    }
    return thenOriginal.call(this, (res) => {
        if (res && res.data) limpia(res.data);
        return alCumplir ? alCumplir(res) : res;
    }, alFallar);
};

// ── 2. Drive ─────────────────────────────────────────────────────────────────
const drive = require(path.join(BACK, 'services', 'driveService'));
const DRIVE_ESCRIBE = [
    'setupOpportunityFolder', 'archiveExistingToOld', 'moveFolder', 'renameFolder',
    'saveFileToFolder', 'createSubfolder', 'getOrCreateSubfolder', 'getOrCreateSubfolderNormalized',
    'setFolderPublic', 'grantPermissionToEmail', 'copyFile', 'deleteFile',
];
for (const f of DRIVE_ESCRIBE) {
    if (typeof drive[f] !== 'function') continue;
    drive[f] = async (...args) => {
        anota({ bloqueado: 'drive', funcion: f, args: args.slice(0, 2).map(a => String(a).slice(0, 80)) });
        throw new Error(`BANCO EN SECO: escritura en Drive bloqueada (${f})`);
    };
}

// ── 3. Empezar de CERO ───────────────────────────────────────────────────────
const cex = require(path.join(BACK, 'services', 'ceeEnvolventeCex'));
if (typeof cex.leerTrabajo === 'function') cex.leerTrabajo = async () => null;

// ── 4. Nada sale a terceros ──────────────────────────────────────────────────
if (process.argv.some(a => a === '--escribir' || a === '--enviar')) {
    anota({ bloqueado: 'argumento', argv: process.argv.slice(2) });
    console.error('BANCO EN SECO: --escribir / --enviar no están permitidos.');
    process.exit(3);
}
