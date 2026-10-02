// ─── produccionFv.js ─────────────────────────────────────────────────────────
// Producción de una instalación FOTOVOLTAICA en un sitio concreto, sacada de
// PVGIS (JRC, Comisión Europea), y sus dos preguntas:
//
//   · DIRECTA — «con N kWp, ¿cuánto produce al año y mes a mes?»
//   · INVERSA — «para declarar X kWh/año de autoconsumo, ¿cuántos kWp hacen
//     falta aquí?»
//
// Las dos son la MISMA regla de tres. PVGIS se consulta UNA vez por sitio con
// 1 kWp —su producción es lineal en la potencia pico—, y de ahí sale la
// producción ESPECÍFICA (kWh por kWp): anual y por mes. Con ella:
//
//     producción (kWh/año) = kWp × específica_anual
//     kWp                  = kWh/año ÷ específica_anual
//
// REGLA — el reparto MENSUAL sigue la curva de PVGIS y SUMA EXACTO el total.
// Es lo que se teclea en la tabla «Autoconsumo mensual (kWh/mes)» de CE3X, y
// doce cifras redondeadas por separado no suman lo que se declara al año: se
// reparte por el método del resto mayor.
//
// Fuente única: lo usan la barra ⚡ del módulo CEE y la medida de autoconsumo
// de la envolvente (`medidasCe3x`, que el backend carga por import() ESM). Sin
// imports a propósito: se prueba desde Node.
// ─────────────────────────────────────────────────────────────────────────────

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

//: Pérdidas del sistema (cableado, inversor, suciedad…). El 14 % es el valor
//: por defecto de PVGIS, y el que usa su propia web.
export const PERDIDAS_POR_DEFECTO = 14;

//: Cómo van montados los módulos. PVGIS distingue «free» (sobre estructura,
//: ventilados por detrás) y «building» (integrados en la cubierta, más
//: calientes y por eso producen algo menos).
export const MONTAJES = [
    { id: 'free', etiqueta: 'Sobre estructura' },
    { id: 'building', etiqueta: 'Integrados en la cubierta' },
];

//: La orientación en el convenio de PVGIS: 0 = Sur, −90 = Este, 90 = Oeste.
export const ORIENTACIONES = [
    { valor: 0, etiqueta: 'Sur' },
    { valor: -45, etiqueta: 'Sureste' },
    { valor: 45, etiqueta: 'Suroeste' },
    { valor: -90, etiqueta: 'Este' },
    { valor: 90, etiqueta: 'Oeste' },
];

/** El nombre de una orientación PVGIS (grados desde el Sur), aproximada. */
export function nombreOrientacion(grados) {
    const g = Number(grados);
    if (!Number.isFinite(g)) return '';
    const puntos = [[-180, 'Norte'], [-135, 'Noreste'], [-90, 'Este'], [-45, 'Sureste'],
                    [0, 'Sur'], [45, 'Suroeste'], [90, 'Oeste'], [135, 'Noroeste'], [180, 'Norte']];
    let mejor = puntos[0];
    for (const p of puntos) if (Math.abs(p[0] - g) < Math.abs(mejor[0] - g)) mejor = p;
    return mejor[1];
}

/** ¿Trae una producción específica utilizable? */
export function especificaValida(e) {
    return !!e && Number(e.anual) > 0 && Array.isArray(e.mensual) && e.mensual.length === 12
        && e.mensual.every(v => Number.isFinite(Number(v)) && Number(v) >= 0);
}

/**
 * Reparte `total` entre `pesos` de forma que las partes SUMEN EXACTO `total`
 * (método del resto mayor), con `decimales` cifras.
 */
export function repartir(total, pesos, decimales = 0) {
    const f = 10 ** decimales;
    const T = Math.round(Number(total) * f);
    const ws = (pesos || []).map(p => Math.max(0, Number(p) || 0));
    const suma = ws.reduce((a, b) => a + b, 0);
    if (!(T > 0) || !(suma > 0)) return ws.map(() => 0);
    const exactos = ws.map(w => (T * w) / suma);
    const base = exactos.map(Math.floor);
    let resto = T - base.reduce((a, b) => a + b, 0);
    const orden = exactos.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0]);
    for (let k = 0; resto > 0 && k < orden.length; k++, resto--) base[orden[k][1]] += 1;
    return base.map(v => v / f);
}

/** Producción de `kwp` en ese sitio: `{ kwp, anual, mensual[12] }` en kWh. */
export function produccionDe(especifica, kwp) {
    const p = Number(kwp);
    if (!especificaValida(especifica) || !(p > 0)) return null;
    const anual = Math.round(p * Number(especifica.anual));
    return { kwp: p, anual, mensual: repartir(anual, especifica.mensual) };
}

/**
 * Los kWp que hacen falta para producir `kwhAnio` en ese sitio. Es una cifra
 * APROXIMADA (dos decimales): una instalación real va a módulos enteros.
 */
export function kwpPara(especifica, kwhAnio) {
    const kwh = Number(kwhAnio);
    if (!especificaValida(especifica) || !(kwh > 0)) return null;
    return Math.round((kwh / Number(especifica.anual)) * 100) / 100;
}

/** `kwhAnio` repartido por meses con la curva de PVGIS, sumando exacto. */
export function mensualDe(especifica, kwhAnio) {
    const kwh = Number(kwhAnio);
    if (!especificaValida(especifica) || !(kwh > 0)) return null;
    return repartir(Math.round(kwh), especifica.mensual);
}

/** Los doce meses separados por tabuladores, para pegarlos en una hoja. */
export const tsvMensual = (mensual) => (mensual || []).map(v => String(v)).join('\t');

/**
 * 2,88 · 1.674 — números en castellano. A mano y no con `toLocaleString('es-ES')`:
 * ése NO agrupa los números de cuatro cifras («4334»), que son justo los kWh/año
 * de una vivienda.
 */
export function fmtNum(n, dec = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    const [ent, frac] = Math.abs(v).toFixed(dec).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${v < 0 && Number(Math.abs(v).toFixed(dec)) !== 0 ? '−' : ''}${miles}${frac ? `,${frac}` : ''}`;
}

/**
 * Parámetros de la consulta a PVGIS en la forma en que se mandan al backend,
 * limpios: sin ángulos → PVGIS calcula los ÓPTIMOS para ese sitio.
 */
export function paramsPvgis({ inclinacion = null, orientacion = null,
                              perdidas = PERDIDAS_POR_DEFECTO, montaje = 'free' } = {}) {
    const out = {};
    const inc = Number(inclinacion);
    const ori = Number(orientacion);
    if (inclinacion !== null && inclinacion !== '' && Number.isFinite(inc)) {
        out.inclinacion = Math.min(90, Math.max(0, inc));
        out.orientacion = Number.isFinite(ori) ? Math.min(180, Math.max(-180, ori)) : 0;
    }
    const per = Number(perdidas);
    if (Number.isFinite(per) && per >= 0 && per < 100 && per !== PERDIDAS_POR_DEFECTO) out.perdidas = per;
    if (montaje && montaje !== 'free') out.montaje = montaje;
    return out;
}

/**
 * Dónde está la vivienda, con lo que tenga el expediente, para preguntárselo a
 * PVGIS: lat/lon si ya se tiene; si no, la UTM que sembró el Catastro al crear
 * el expediente (`instalacion.coord_x/coord_y`, ETRS89 huso 30); si no, la
 * referencia catastral, que el backend resuelve con el Catastro.
 */
export function ubicacionDeExpediente(expediente) {
    const inst = expediente?.instalacion || {};
    const x = Number(String(inst.coord_x ?? '').replace(',', '.'));
    const y = Number(String(inst.coord_y ?? '').replace(',', '.'));
    if (x > 100000 && y > 3000000) return { utm_x: x, utm_y: y };
    const rc = String(inst.ref_catastral || expediente?.ref_catastral || '')
        .replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (rc.length >= 14) return { rc };
    return null;
}

/** Clave estable de una consulta (para no repetirla en la misma sesión). */
export function claveConsulta(ubicacion, params = {}) {
    if (!ubicacion) return '';
    const u = ubicacion.lat != null
        ? `ll:${Number(ubicacion.lat).toFixed(4)},${Number(ubicacion.lon).toFixed(4)}`
        : ubicacion.utm_x != null ? `utm:${Math.round(ubicacion.utm_x)},${Math.round(ubicacion.utm_y)}`
        : `rc:${ubicacion.rc}`;
    return `${u}|${JSON.stringify(paramsPvgis(params))}`;
}
