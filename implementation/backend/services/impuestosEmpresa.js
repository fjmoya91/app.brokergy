// ════════════════════════════════════════════════════════════════════════════
// IMPUESTOS DE LA EMPRESA en el cuadro de mando (sección «Impuestos»): el 303 y
// el 111 de cada trimestre, el Impuesto de Sociedades estimado, sus pagos a
// cuenta (202) y lo que hay que apartar para Hacienda. Doc:
// docs/conocimiento/cuadro-mando/los-impuestos-en-el-cuadro-de-mando.md
//
// De dónde sale cada cifra (de más a menos fiable):
//  1. CONFIRMADO: lo presentado o liquidado de verdad (el cargo del banco, la
//     carta de pago, la liquidación de la AEAT), anotado en `app_settings`
//     → clave `cuadro_impuestos`, que se edita desde el propio cuadro.
//  2. LIBRO: un trimestre CERRADO, del RESUMEN del libro maestro de la gestoría
//     (libroContable.js), la misma fuente que la estructura del EBITDA.
//  3. APP: el trimestre EN CURSO, de contabilidadService (lo facturado y los
//     gastos leídos de Drive), lo mismo que pinta Facturación → Trimestres.
//
// Lo que la app no puede saber —el régimen del Impuesto de Sociedades (empresa
// emergente, nueva creación…), el Impuesto de los años anteriores y lo ya
// pagado— va en esa fila de la BD, NUNCA en el código: el repositorio es público.
// Los tipos de la ley (DT 44.ª LIS, art. 40.2 LIS) sí van aquí: son públicos.
//
// Todo es una ESTIMACIÓN de gestión: los modelos los presenta la gestoría.
// Las funciones de cálculo son puras (se prueban sin BD); solo leerDatos y
// guardarDatos tocan Supabase.
// ════════════════════════════════════════════════════════════════════════════

const supabase = require('./supabaseClient');
const conta = require('./contabilidadService');

const CLAVE = 'cuadro_impuestos';
const PCT_202 = 18;                 // art. 40.2 LIS: 18 % de la cuota del último Impuesto
const MODELOS = ['303', '111', '202', '200'];
const TIPOS = ['STARTUP', 'NUEVA_CREACION', 'MICRO', 'ERD', 'GENERAL'];
const UMBRAL_MICRO = 1000000;       // cifra de negocios del año anterior (DT 44.ª LIS)
const UMBRAL_ERD = 10000000;        // art. 101 LIS

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v));

// ─── Los datos que la app no sabe (app_settings) ─────────────────────────────

// '2026-T4' → '4.º trimestre de 2026' (para los textos de los pagos y los avisos)
const trimTexto = (t) => { const m = /^(\d{4})-T([1-4])$/.exec(String(t || '')); return m ? `${m[2]}.º trimestre de ${m[1]}` : String(t || ''); };
const vacio = () => ({ regimen: [], is_anteriores: [], pagos: [], actualizado_at: null, actualizado_por: null });

/** Limpia lo que llega de la pantalla (puro). Lo que no se entiende se descarta. */
function normalizar(b = {}) {
    const anio = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null; };
    const imp = (v) => (fin(v) ? r2(v) : null);
    const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const anios = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/)).map(anio).filter(Boolean))].sort();
    const texto = (v) => String(v ?? '').trim().slice(0, 300) || null;
    const regimen = (Array.isArray(b.regimen) ? b.regimen : []).map(x => {
        const desde = anio(x?.desde);
        const hasta = anio(x?.hasta) ?? desde;
        return {
            desde, hasta: hasta && desde && hasta < desde ? desde : hasta,
            tipo: TIPOS.includes(x?.tipo) ? x.tipo : null,
            pct: imp(x?.pct), sin_202: anios(x?.sin_202), aplazable: anios(x?.aplazable), nota: texto(x?.nota),
        };
    }).filter(x => x.desde && x.tipo).sort((a, b2) => a.desde - b2.desde);
    const isAnt = (Array.isArray(b.is_anteriores) ? b.is_anteriores : []).map(x => ({
        anio: anio(x?.anio), base: imp(x?.base), cuota: imp(x?.cuota), ingresado: imp(x?.ingresado),
        cifra_negocios: imp(x?.cifra_negocios), fecha: fecha(x?.fecha), nota: texto(x?.nota),
    })).filter(x => x.anio).sort((a, b2) => a.anio - b2.anio);
    const periodoOk = (modelo, p) => (modelo === '202' ? /^[1-3]P$/ : modelo === '200' ? /^ANUAL$/ : /^T[1-4]$/).test(p);
    const pagos = (Array.isArray(b.pagos) ? b.pagos : []).map(x => {
        const modelo = MODELOS.includes(String(x?.modelo)) ? String(x.modelo) : null;
        return {
            anio: anio(x?.anio), modelo,
            contribuyente: x?.contribuyente === 'AUTONOMO' && modelo === '303' ? 'AUTONOMO' : 'SL',
            periodo: String(x?.periodo || '').toUpperCase().trim(), importe: imp(x?.importe), fecha: fecha(x?.fecha), nota: texto(x?.nota),
        };
    }).filter(x => x.anio && x.modelo && periodoOk(x.modelo, x.periodo) && x.importe != null)
        .sort((a, b2) => a.anio - b2.anio || a.modelo.localeCompare(b2.modelo) || a.periodo.localeCompare(b2.periodo));
    return { regimen, is_anteriores: isAnt, pagos };
}

async function leerDatos() {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', CLAVE).maybeSingle();
    // Un fallo de lectura NO puede contestar «no hay datos»: el Impuesto saldría al
    // tipo general y se leería como un dato. Sube.
    if (error) throw Object.assign(new Error(`No se pudieron leer los datos fiscales: ${error.message}`), { status: 503 });
    if (!data?.value) return vacio();
    try {
        const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return { ...normalizar(v), actualizado_at: v.actualizado_at || null, actualizado_por: v.actualizado_por || null };
    } catch { return vacio(); }
}

/** Guarda ENTEROS los datos fiscales (la pantalla edita la tabla que tiene delante). */
async function guardarDatos(body, quien = null) {
    const limpio = normalizar(body || {});
    const value = { ...limpio, actualizado_at: new Date().toISOString(), actualizado_por: quien || null };
    const { error } = await supabase.from('app_settings').upsert(
        { key: CLAVE, value: JSON.stringify(value), updated_at: value.actualizado_at },
        { onConflict: 'key' },
    );
    if (error) throw Object.assign(new Error(error.message), { status: 503 });
    return value;
}

// ─── El Impuesto de Sociedades (puro) ────────────────────────────────────────

const regimenDe = (anio, datos) => (datos?.regimen || []).find(x => anio >= x.desde && anio <= x.hasta) || null;
const isDe = (anio, datos) => (datos?.is_anteriores || []).find(x => x.anio === anio) || null;

/** Tipos de la DT 44.ª LIS (Ley 7/2024): microempresa y reducida dimensión, por año. */
function tramosLey(tipo, anio) {
    if (tipo === 'MICRO') {
        if (anio <= 2024) return [{ hasta: null, pct: 23 }];
        const [a, b] = anio === 2025 ? [21, 22] : anio === 2026 ? [19, 21] : [17, 20];
        return [{ hasta: 50000, pct: a }, { hasta: null, pct: b }];
    }
    if (tipo === 'ERD') return [{ hasta: null, pct: anio <= 2024 ? 25 : anio >= 2029 ? 20 : { 2025: 24, 2026: 23, 2027: 22, 2028: 21 }[anio] }];
    return [{ hasta: null, pct: 25 }];
}

/**
 * El tipo del Impuesto de un año: el régimen anotado (empresa emergente o nueva
 * creación, al 15 %) o, si no hay, el que toca por la cifra de negocios del año
 * ANTERIOR. Sin esa cifra, el de reducida dimensión (el prudente) y se dice.
 */
function tipoIS(anio, datos) {
    const reg = regimenDe(anio, datos);
    if (reg && ['STARTUP', 'NUEVA_CREACION'].includes(reg.tipo)) {
        const pct = reg.pct ?? 15;
        return {
            tipo: reg.tipo, tramos: [{ hasta: null, pct }], regimen: reg,
            etiqueta: reg.tipo === 'STARTUP' ? `${pct} % · empresa emergente (Ley 28/2022, art. 7)` : `${pct} % · entidad de nueva creación (art. 29.1 LIS)`,
        };
    }
    let tipo = reg?.tipo || null;
    let supuesto = false;
    if (!tipo) {
        const cifra = isDe(anio - 1, datos)?.cifra_negocios;
        if (cifra == null) { tipo = 'ERD'; supuesto = true; }
        else tipo = cifra < UMBRAL_MICRO ? 'MICRO' : cifra < UMBRAL_ERD ? 'ERD' : 'GENERAL';
    }
    const tramos = reg?.pct != null ? [{ hasta: null, pct: reg.pct }] : tramosLey(tipo, anio);
    const etiqueta = tipo === 'MICRO' && tramos.length > 1
        ? `${tramos[0].pct} % hasta 50.000 € y ${tramos[1].pct} % el resto · microempresa (DT 44.ª LIS)`
        : `${tramos[0].pct} % · ${tipo === 'MICRO' ? 'microempresa' : tipo === 'ERD' ? 'reducida dimensión' : 'tipo general'}${supuesto ? ' (sin la cifra de negocios del año anterior: se supone)' : ''}`;
    return { tipo, tramos, regimen: reg, etiqueta, supuesto };
}

function cuotaIS(base, t) {
    if (!(base > 0)) return 0;
    let resto = base, desde = 0, cuota = 0;
    for (const tr of t.tramos) {
        const tope = tr.hasta == null ? resto : Math.min(resto, tr.hasta - desde);
        cuota += tope * tr.pct / 100;
        resto -= tope; desde += tope;
        if (resto <= 0) break;
    }
    return r2(cuota);
}

// ─── Lo confirmado ───────────────────────────────────────────────────────────

const confirmado = (datos, anio, modelo, periodo, contribuyente = 'SL') =>
    (datos?.pagos || []).find(p => p.anio === anio && p.modelo === modelo && p.periodo === periodo && p.contribuyente === contribuyente) || null;

/**
 * Los pagos a cuenta (202) del año, por la modalidad de cuota (art. 40.2 LIS): el
 * 18 % de la cuota del último Impuesto cuyo plazo había acabado. En abril es el de
 * hace dos años (el del año anterior se presenta en julio); en octubre y
 * diciembre, el del año anterior. Lo confirmado manda sobre lo calculado.
 */
function pagos202(anio, datos, hoy) {
    const reg = regimenDe(anio, datos);
    if (reg?.sin_202?.includes(anio)) return { exento: true, filas: [], total: 0, nota: 'Este año no hay pagos fraccionados (empresa emergente: Ley 28/2022, art. 8).' };
    const per = [['1P', `${anio}-04-20`, anio - 2], ['2P', `${anio}-10-20`, anio - 1], ['3P', `${anio}-12-20`, anio - 1]];
    const filas = per.map(([periodo, vence, anioBase]) => {
        const c = confirmado(datos, anio, '202', periodo);
        const base = isDe(anioBase, datos);
        const calc = base?.cuota != null ? r2(Math.max(0, base.cuota) * PCT_202 / 100) : null;
        return {
            periodo, vence, pasado: vence < hoy, anioBase,
            importe: c ? c.importe : calc,
            fuente: c ? 'CONFIRMADO' : calc != null ? 'CALCULADO' : null,
            fecha: c?.fecha || null,
            nota: c?.nota || (calc != null ? `${PCT_202} % de la cuota del Impuesto de ${anioBase}` : `Falta la cuota del Impuesto de ${anioBase}`),
        };
    });
    return { exento: false, filas, total: r2(filas.reduce((a, f) => a + (f.importe || 0), 0)), nota: null };
}

// ─── Los trimestres (303 y 111) ──────────────────────────────────────────────

/**
 * El 303 y el 111 de cada trimestre del año, con su fuente y su estado. Un 303
 * negativo de la sociedad se COMPENSA en los siguientes (en T1–T3 no se devuelve):
 * lo que se paga es el resultado menos lo que quedaba por compensar.
 */
function trimestres({ anio, hoy, qEnCurso, libroFiscal = {}, libroTrimestres = new Set(), tri = null, datos }) {
    let arrastre = 0;
    const filas = [];
    for (let q = 1; q <= 4; q++) {
        const T = conta.parseTrimestre(`${anio}-T${q}`);
        const pl = conta.plazos(T);
        const cerrado = q < qEnCurso;
        const enCurso = q === qEnCurso;
        const L = cerrado && libroTrimestres.has(`T${q}`) ? (libroFiscal[`T${q}`] || {}) : null;
        const valor = (modelo, contrib, campoLibro, deLaApp) => {
            const c = confirmado(datos, anio, modelo, `T${q}`, contrib);
            if (c) return { importe: c.importe, fuente: 'CONFIRMADO', fecha: c.fecha, nota: c.nota };
            if (L && L[campoLibro] != null) return { importe: L[campoLibro], fuente: 'LIBRO' };
            if (enCurso && fin(deLaApp)) return { importe: r2(deLaApp), fuente: 'APP', parcial: !!tri?.parcial };
            return { importe: null, fuente: null };
        };
        const estado = q > qEnCurso ? 'FUTURO' : enCurso ? 'EN_CURSO' : hoy <= pl.m303 ? 'POR_PRESENTAR' : 'PASADO';

        const s = valor('303', 'SL', 'm303Sl', tri?.sl?.resultado_303);
        let aPagar = null, compensado = 0, aCompensar = 0;
        if (s.importe != null) {
            const r = s.importe;
            if (r <= 0) { aPagar = 0; aCompensar = r2(-r); arrastre = r2(arrastre - r); }
            else if (s.fuente === 'CONFIRMADO') { aPagar = r; arrastre = 0; }   // lo ingresado ya lleva la compensación
            else { compensado = r2(Math.min(arrastre, r)); aPagar = r2(r - compensado); arrastre = r2(arrastre - compensado); }
        }
        filas.push({
            t: T.t, n: q, etiqueta: T.etiqueta, estado, plazos: { m303: pl.m303, m111: pl.m111 },
            sl303: { ...s, aPagar, compensado, aCompensar },
            m111: valor('111', 'SL', 'm111', tri?.m111),
            aut303: valor('303', 'AUTONOMO', 'm303Aut', tri?.autonomo?.resultado_303),
        });
    }
    return { filas, porCompensar: r2(arrastre) };
}

// ─── El bloque entero (puro) ─────────────────────────────────────────────────

/**
 * @param o.anio, o.hoy, o.qEnCurso (5 = año pasado entero; 0 = año futuro)
 * @param o.libroFiscal   { T1: { m303Sl, m111, m303Aut } } del RESUMEN del libro
 * @param o.libroTrimestres Set de los trimestres que salen del libro (cerrados y con filas)
 * @param o.tri           contabilidadService.cuadro().trimestre (el en curso)
 * @param o.datos         leerDatos()
 * @param o.ebitda        el EBITDA del año (cuadro de mando)
 * @param o.margenPendiente lo que añade al resultado lo que se factura antes del 31/12
 * @param o.estructuraRestante la estructura de los meses que faltan del año
 */
function calcular(o) {
    const { anio, hoy, datos } = o;
    const anioHoy = Number(hoy.slice(0, 4));
    const esteAnio = anio === anioHoy;
    const { filas, porCompensar } = trimestres(o);
    const tipo = tipoIS(anio, datos);
    const p202 = pagos202(anio, datos, hoy);

    // ── Impuesto de Sociedades ──────────────────────────────────────────────
    // Base ≈ resultado de gestión (EBITDA): sin amortizaciones, resultado financiero
    // ni ajustes fiscales. Al cierre, + el margen de lo que se factura antes del
    // 31/12 (el cierre ESPERADO) − la estructura de los meses que faltan.
    const presentado = isDe(anio, datos);
    const baseHoy = r2(o.ebitda);
    const basePrevista = esteAnio ? r2(o.ebitda + (o.margenPendiente || 0) - (o.estructuraRestante || 0)) : baseHoy;
    const cuotaHoy = cuotaIS(baseHoy, tipo);
    const cuotaPrevista = presentado?.cuota != null ? presentado.cuota : cuotaIS(basePrevista, tipo);
    const aplazableIdx = tipo.regimen?.aplazable?.indexOf(anio) ?? -1;
    const aIngresar = presentado?.ingresado != null ? presentado.ingresado : r2(cuotaPrevista - p202.total);
    const sociedades = {
        tipo: { pct: tipo.tramos[0].pct, tramos: tipo.tramos, etiqueta: tipo.etiqueta, clase: tipo.tipo, supuesto: !!tipo.supuesto, nota: tipo.regimen?.nota || null },
        presentado: presentado ? { ...presentado } : null,
        baseHoy, cuotaHoy,
        basePrevista: presentado?.base != null ? presentado.base : basePrevista,
        cuotaPrevista,
        margenPendiente: r2(o.margenPendiente || 0), estructuraRestante: r2(o.estructuraRestante || 0),
        pagos202: p202,
        aIngresar: {
            importe: r2(aIngresar), vence: `${anio + 1}-07-25`, fuente: presentado?.ingresado != null ? 'CONFIRMADO' : 'ESTIMADO',
            aplazable: aplazableIdx >= 0 ? (aplazableIdx === 0 ? 12 : 6) : null,
        },
        neto: { hoy: r2(baseHoy - cuotaHoy), previsto: r2((presentado?.base ?? basePrevista) - cuotaPrevista) },
    };

    // ── Lo que hay que apartar para Hacienda (la SOCIEDAD) ─────────────────
    const proximos = [];
    for (const f of filas) {
        if (!['EN_CURSO', 'POR_PRESENTAR'].includes(f.estado)) continue;
        if (f.sl303.aPagar > 0) proximos.push({ fecha: f.plazos.m303, modelo: '303', t: f.t, concepto: `IVA del ${trimTexto(f.t)}`, importe: f.sl303.aPagar, fuente: f.sl303.fuente, estimado: f.sl303.fuente !== 'CONFIRMADO' });
        if (f.m111.importe > 0) proximos.push({ fecha: f.plazos.m111, modelo: '111', t: f.t, concepto: `Retenciones del ${trimTexto(f.t)}`, importe: f.m111.importe, fuente: f.m111.fuente, estimado: f.m111.fuente !== 'CONFIRMADO' });
    }
    for (const x of p202.filas) {
        if (!x.pasado && x.importe > 0) proximos.push({ fecha: x.vence, modelo: '202', concepto: `Pago a cuenta del Impuesto de Sociedades (${{ '1P': 'abril', '2P': 'octubre', '3P': 'diciembre' }[x.periodo] || x.periodo})`, importe: x.importe, fuente: x.fuente, estimado: x.fuente !== 'CONFIRMADO' });
    }
    if (sociedades.aIngresar.importe > 0 && sociedades.aIngresar.vence >= hoy && (esteAnio || anio === anioHoy - 1)) {
        proximos.push({
            fecha: sociedades.aIngresar.vence, modelo: '200', concepto: `Impuesto de Sociedades ${anio}`, importe: sociedades.aIngresar.importe,
            fuente: sociedades.aIngresar.fuente, estimado: sociedades.aIngresar.fuente !== 'CONFIRMADO', aplazable: sociedades.aIngresar.aplazable,
        });
    }
    proximos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const autonomo = filas.filter(f => ['EN_CURSO', 'POR_PRESENTAR'].includes(f.estado) && f.aut303.importe > 0)
        .map(f => ({ fecha: f.plazos.m303, modelo: '303', concepto: `IVA del autónomo, ${trimTexto(f.t)}`, importe: f.aut303.importe, fuente: f.aut303.fuente }));

    const suma = (xs, k) => r2(xs.reduce((a, x) => a + (Number(k(x)) || 0), 0));
    const pendientesTri = filas.filter(f => ['EN_CURSO', 'POR_PRESENTAR'].includes(f.estado));
    const avisos = [];
    const prox = proximos.find(x => x.fecha >= hoy);
    if (prox) {
        const dias = Math.round((Date.parse(`${prox.fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
        if (dias <= 20) avisos.push({
            tono: 'ambar', clave: 'plazo_fiscal', importe: prox.importe,
            texto: `Modelo ${prox.modelo} · ${prox.concepto}: vence en ${dias} día${dias === 1 ? '' : 's'} (${prox.fecha.slice(8, 10)}/${prox.fecha.slice(5, 7)}).`,
            link: prox.t ? `?tab=facturacion&sub=trimestres&t=${prox.t}` : null,
        });
    }
    for (const x of p202.filas) {
        if (x.pasado && x.fuente === 'CALCULADO' && x.vence >= `${anioHoy}-01-01`) avisos.push({ tono: 'gris', clave: `202_${x.periodo}`, importe: x.importe, texto: `El 202 de ${x.periodo === '2P' ? 'octubre' : x.periodo === '3P' ? 'diciembre' : 'abril'} no consta como pagado en la app: confírmalo con la gestoría y anótalo en Impuestos → Datos fiscales.` });
    }
    const sinDatos = !(datos?.regimen?.length) && !(datos?.is_anteriores?.length) && !(datos?.pagos?.length);
    if (sinDatos) avisos.push({ tono: 'gris', clave: 'datos_fiscales', texto: 'Faltan los datos fiscales (régimen del Impuesto de Sociedades e Impuesto del año anterior): el Impuesto sale al tipo de reducida dimensión y sin pagos a cuenta.' });

    return {
        anio, trimestres: filas, porCompensar,
        totales: {
            sl303: suma(filas, f => f.sl303.aPagar), m111: suma(filas, f => f.m111.importe), aut303: suma(filas, f => f.aut303.importe),
            // Lo pendiente de los trimestres (lo que resta el circulante).
            pendiente303: suma(pendientesTri, f => f.sl303.aPagar), pendiente111: suma(pendientesTri, f => f.m111.importe),
            pendientesTri: pendientesTri.map(f => f.t),
        },
        sociedades, proximos, apartar: suma(proximos, x => x.importe), autonomo,
        datos: { actualizado_at: datos?.actualizado_at || null, vacio: sinDatos },
        avisos,
        nota: 'Estimación de gestión: los modelos los presenta la gestoría. Las retenciones de las nóminas, si las hay, no están en la app.',
    };
}

module.exports = { CLAVE, leerDatos, guardarDatos, normalizar, tipoIS, cuotaIS, pagos202, trimestres, calcular, tramosLey, PCT_202 };
