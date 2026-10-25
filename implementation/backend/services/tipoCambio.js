// ─── tipoCambio.js ───────────────────────────────────────────────────────────
// El CAMBIO de una factura en otra moneda (las suscripciones en dólares: ChatGPT,
// Claude…), como manda la Ley del IVA (art. 79.Once LIVA): «el tipo de cambio
// vendedor, fijado por el Banco de España, que esté vigente en el momento del
// devengo». Los cambios oficiales del euro que publica el Banco de España son los
// de referencia del BCE (Ley 46/1998), así que se usan esos, de la API de datos
// del BCE: el último publicado EN o ANTES de la fecha de la factura (un sábado
// vale el del viernes).
//
// Sin red no se inventa nada: `cambio()` devuelve null y el gasto sale con su
// aviso. Lo traído se recuerda en memoria por meses enteros (un cambio publicado
// no cambia); el mes en curso se vuelve a pedir pasadas unas horas.
//
// Ver docs/conocimiento/facturacion/trimestres-y-contabilidad.md.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://data-api.ecb.europa.eu/service/data/EXR';
const ESPERA_MS = 8000;
const MAX_HUECO_DIAS = 10;          // festivos y fines de semana; más, es que no hay dato

const MES_EN_CURSO_MS = 6 * 3600 * 1000;

const obs = new Map();              // moneda → Map(fecha → unidades de moneda por 1 €)
const meses = new Map();            // `${moneda}:${aaaa-mm}` → cuándo se trajo (Infinity: mes cerrado)

const iso = (d) => d.toISOString().slice(0, 10);
const mesDe = (fecha) => fecha.slice(0, 7);
function mesAnterior(m) {
    const [a, n] = m.split('-').map(Number);
    return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, '0')}`;
}
function finDeMes(m) {
    const [a, n] = m.split('-').map(Number);
    return iso(new Date(Date.UTC(a, n, 0)));
}

async function traerMes(moneda, m) {
    const url = `${API}/D.${moneda}.EUR.SP00.A?startPeriod=${m}-01&endPeriod=${finDeMes(m)}&format=csvdata`;
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS) });
    // Un mes sin publicar todavía (o una moneda sin cambio del BCE) llega vacío.
    if (r.status === 404) return;
    if (!r.ok) throw new Error(`BCE ${r.status}`);
    const [cab, ...filas] = (await r.text()).trim().split(/\r?\n/);
    const cols = cab.split(',');
    const iF = cols.indexOf('TIME_PERIOD');
    const iV = cols.indexOf('OBS_VALUE');
    const tabla = obs.get(moneda) || new Map();
    for (const f of filas) {
        const c = f.split(',');
        const v = Number(c[iV]);
        if (c[iF] && v > 0) tabla.set(c[iF], v);
    }
    obs.set(moneda, tabla);
}

/**
 * Trae los cambios que hacen falta para unas facturas: [{ moneda, fecha }].
 * Nunca lanza: devuelve los errores (sin red, el gasto avisa y no cuenta).
 */
async function precargar(pares) {
    const pend = new Set();
    for (const { moneda, fecha } of pares || []) {
        const mon = String(moneda || '').toUpperCase();
        if (!/^[A-Z]{3}$/.test(mon) || mon === 'EUR' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) continue;
        // El del mes anterior también: el día 1 puede caer en fin de semana.
        for (const m of [mesDe(fecha), mesAnterior(mesDe(fecha))]) {
            const t = meses.get(`${mon}:${m}`);
            if (t == null || (t !== Infinity && Date.now() - t > MES_EN_CURSO_MS)) pend.add(`${mon}:${m}`);
        }
    }
    const errores = [];
    const hoy = iso(new Date());
    await Promise.all([...pend].map(async (k) => {
        const [mon, m] = k.split(':');
        try { await traerMes(mon, m); meses.set(k, finDeMes(m) < hoy ? Infinity : Date.now()); }
        catch (e) { errores.push(`${k}: ${e.message}`); }
    }));
    return { errores };
}

/** { valor, fecha } del cambio vigente en `fecha` (unidades de `moneda` por 1 €), o null. */
function cambio(moneda, fecha) {
    const tabla = obs.get(String(moneda || '').toUpperCase());
    if (!tabla || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null;
    const d = new Date(`${fecha}T12:00:00Z`);
    for (let i = 0; i <= MAX_HUECO_DIAS; i++) {
        const f = iso(d);
        if (tabla.has(f)) return { valor: tabla.get(f), fecha: f };
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return null;
}

/** Solo para las pruebas: mete cambios a mano, sin red. */
function _sembrar(moneda, valores) {
    const tabla = obs.get(moneda) || new Map();
    for (const [f, v] of Object.entries(valores)) {
        tabla.set(f, v);
        for (const m of [mesDe(f), mesAnterior(mesDe(f))]) meses.set(`${moneda}:${m}`, Infinity);
    }
    obs.set(moneda, tabla);
}

module.exports = { precargar, cambio, _sembrar };
