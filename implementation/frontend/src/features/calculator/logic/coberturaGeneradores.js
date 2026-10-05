// ============================================================================
// coberturaGeneradores.js — QUÉ PARTE DE CADA DEMANDA CUBRE CADA GENERADOR del CEE
// ============================================================================
//
// El .xml del certificado da, por un lado, los GENERADORES declarados (con su
// vector y su rendimiento estacional) y, por otro, la ENERGÍA FINAL por vector y
// por servicio. Lo que no da en ningún sitio es el porcentaje de la demanda que
// cubre cada uno —ese % solo vive en el .cex—, pero se DEDUCE sin estimar nada:
//
//     demanda cubierta = energía final del vector × rendimiento estacional
//     %                = demanda cubierta ÷ demanda del servicio
//
// Y lo que NINGÚN generador declarado cubre lo pone CE3X con su SISTEMA POR
// DEFECTO (el «de sustitución» del CTE): para calefacción, una caldera estándar de
// GAS NATURAL al 92 %; para refrigeración, una máquina frigorífica ELÉCTRICA de
// rendimiento 2,0. Ese consumo está DENTRO de la energía final del certificado, así
// que cuenta para el ahorro, y hay que decirlo con su nombre: en el resumen por
// vector un gas natural sin caldera de gas parece un error.
//
// MEDIDO en 26RES080_78 (05/10/2026): estufa de pellets declarada al 40 % de la
// calefacción, η estacional 0,39 → 190,76 kWh/m² × 0,39 = 74,4 de 186,94 (40 %); el
// 60 % restante, 121,92 kWh/m² de gas natural × 0,92 = 112,2 (60 %). El MISMO .cex
// pasado a CE3X 3.1 escribe ese gas en el XML como «Caldera estándar (sistema
// ficticio)», GASNATURAL, 0,92, con las mismas cifras al céntimo, y la refrigeración
// sin equipo como «Máquina frigorífica (sistema ficticio)», ELECTRICIDAD, 2,00.
//
// Puro y sin DOM: lo usan también el backend (certificado RES080) y Node (pruebas).
// El XML guardado en BD está entero en MAYÚSCULAS: todo se compara normalizado.
// ============================================================================

import { esXmlCeeV30, leerXmlCeeV30 } from './xmlCeeV30.js';

// Los servicios, con el SISTEMA POR DEFECTO de CE3X cuando se conoce. El de ACS no
// se ha visto nunca (CE3X exige cubrir el ACS al 100 %), así que no se supone.
export const SERVICIOS_COBERTURA = [
    { key: 'cal', campo: 'calefaccion', etiqueta: 'Calefacción',
      porDefecto: { vector: 'Gas Natural', eta: 0.92, nombre: 'Caldera estándar de gas natural' } },
    { key: 'acs', campo: 'acs', etiqueta: 'ACS', porDefecto: null },
    { key: 'ref', campo: 'refrigeracion', etiqueta: 'Refrigeración',
      porDefecto: { vector: 'Electricidad peninsular', eta: 2.0, nombre: 'Máquina frigorífica' } },
];

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinTildes(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Cualquier forma de escribir un vector (nombre interno, etiqueta del v2.0 —con y sin
// la -e de «Pellete»—, nombre del v3.0, en mayúsculas o no) → su nombre en FACTORES_PASO.
const VECTORES = [
    ['Gas Natural', ['GASNATURAL']],
    ['Gasoleo Calefacción', ['GASOLEOC', 'GASOLEO', 'GASOLEOCALEFACCION', 'GASOIL', 'DIESEL']],
    ['GLP', ['GLP', 'BUTANO', 'PROPANO']],
    ['Carbón', ['CARBON']],
    ['Biomasa densificada (pelets)', ['BIOMASAPELLET', 'BIOMASAPELLETE', 'BIOMASADENSIFICADA', 'BIOMASADENSIFICADAPELETS', 'BIOMASADENS']],
    ['Biomasa no densificada', ['BIOMASAOTROS', 'BIOMASA', 'BIOMASANODENSIFICADA']],
    ['Biocarburante', ['BIOCARBURANTE']],
];
export function vectorCanonico(v) {
    const k = clave(v);
    if (!k) return null;
    if (k.startsWith('ELECTRICIDAD')) return 'Electricidad peninsular';
    for (const [nombre, claves] of VECTORES) if (claves.includes(k)) return nombre;
    return String(v).trim();
}
export const esVectorElectrico = (v) => vectorCanonico(v) === 'Electricidad peninsular';

// ─── Los generadores, leídos del texto del .xml ──────────────────────────────

const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bloques = (xml, tag) => {
    if (!xml) return [];
    const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*[^/>])?>([\\s\\S]*?)</${esc(tag)}\\s*>`, 'gi');
    const out = []; let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1]);
    return out;
};
const texto = (xml, tag) => {
    const b = bloques(xml, tag)[0];
    if (b === undefined) return null;
    const s = b.trim();
    return s === '' ? null : s;
};
// 99999999.99 es «no consta» en CE3X.
const numero = (xml, tag) => {
    const v = Number(String(texto(xml, tag) ?? '').replace(',', '.'));
    return Number.isFinite(v) && v > 0 && v < 99999999 ? v : null;
};

const SERVICIO_V30 = { CAL: 'cal', ACS: 'acs', REF: 'ref' };

/**
 * Los generadores de un CEE: `[{ servicios: ['cal'|'acs'|'ref'], nombre, tipo,
 * vector (nombre de FACTORES_PASO), eta (fracción: 0.39 = 39 %), ficticio }]`.
 * `ficticio` solo lo sabe el v3.0 (<EsFicticio/>); el v2.0 no escribía los de
 * sustitución, así que allí nunca sale true. Vacío si no hay .xml.
 */
export function leerGeneradoresDeTexto(xml) {
    if (!xml || typeof xml !== 'string') return [];
    if (esXmlCeeV30(xml)) {
        return leerXmlCeeV30(xml).generadores.map((g) => ({
            servicios: String(g.servicio || '').split(/\s+/).map((s) => SERVICIO_V30[s.toUpperCase()]).filter(Boolean),
            nombre: g.nombre,
            tipo: g.tipo,
            vector: vectorCanonico(g.vectorV20 || g.vector),
            eta: g.rendimientoEstacional > 0 && g.rendimientoEstacional < 99999999 ? g.rendimientoEstacional : null,
            ficticio: !!g.ficticio,
        })).filter((g) => g.servicios.length);
    }
    // v2.0: el PRIMER <InstalacionesTermicas> es el del edificio.
    const term = bloques(xml, 'InstalacionesTermicas')[0] || '';
    const de = (contenedor, item, servicio) => bloques(bloques(term, contenedor)[0] || '', item).map((g) => ({
        servicios: [servicio],
        nombre: texto(g, 'Nombre'),
        tipo: texto(g, 'Tipo'),
        vector: vectorCanonico(texto(g, 'VectorEnergetico')),
        eta: numero(g, 'RendimientoEstacional'),
        ficticio: false,
    }));
    return [
        ...de('GeneradoresDeCalefaccion', 'Generador', 'cal'),
        ...de('InstalacionesACS', 'Instalacion', 'acs'),
        ...de('GeneradoresDeRefrigeracion', 'Generador', 'ref'),
    ];
}

// ─── La cobertura ────────────────────────────────────────────────────────────

// Rótulo ÚNICO del sistema por defecto, igual en la 2.3 y en la 3.1 (que lo llama
// «Caldera estándar (sistema ficticio)»): «Sistema ficticio por defecto · Caldera
// estándar de gas natural». Lo fijó el usuario el 2026-10-05.
const NOMBRE_POR_DEFECTO = 'Sistema ficticio por defecto';
const sinFicticio = (n) => String(n || '').replace(/\s*\(\s*sistema ficticio\s*\)\s*/i, '').trim();

/**
 * Qué parte de la demanda de cada servicio cubre cada generador.
 *
 * @param vectores   `energiaFinalVectores` del CEE parseado (kWh/m²·año por vector y uso)
 * @param demanda    `{ cal, acs, ref }` en kWh/m²·año
 * @param generadores la lista de `leerGeneradoresDeTexto` (o la guardada en el CEE)
 * @returns `{ servicios: [{ key, etiqueta, demanda, filas, suma, cuadra }], hayPorDefecto }`
 *          o null si falta algo. Cada fila: `{ generador, porDefecto, vector, eta,
 *          energia, pct }` — `pct` en fracción (0.4 = 40 %), null si no se puede saber.
 */
export function coberturaPorGenerador({ vectores, demanda, generadores }) {
    const lista = Object.values(vectores || {});
    if (!lista.length || !Array.isArray(generadores)) return null;
    // Lo guardado pasó por normalizeData: servicios en MAYÚSCULAS y el vector escrito
    // como sea. Se normaliza aquí para que lo guardado y lo recién leído den lo mismo.
    const gens = generadores.map((g) => ({
        ...g,
        servicios: (g.servicios || []).map((s) => String(s).toLowerCase()),
        vector: vectorCanonico(g.vector),
        eta: Number(g.eta) > 0 ? Number(g.eta) : null,
        ficticio: g.ficticio === true || String(g.ficticio).toLowerCase() === 'true',
    }));

    const servicios = [];
    let hayPorDefecto = false;
    for (const s of SERVICIOS_COBERTURA) {
        const D = Number(demanda?.[s.key]);
        if (!(D > 0)) continue;
        const consumos = lista
            .map((v) => ({ vector: vectorCanonico(v.vectorXml || v.nombre), energia: Number(v[s.campo]) || 0 }))
            .filter((c) => c.energia > 0);
        if (!consumos.length) continue;

        const delServicio = gens.filter((g) => g.servicios.includes(s.key));
        const reales = delServicio.filter((g) => !g.ficticio);
        const ficticios = delServicio.filter((g) => g.ficticio);
        const filas = [];

        // 1) Lo que cubre un generador DECLARADO: su energía × su rendimiento.
        const sinGenerador = [];
        for (const c of consumos) {
            const rv = reales.filter((g) => g.vector === c.vector);
            if (!rv.length) { sinGenerador.push(c); continue; }
            // Varios generadores del mismo vector solo se separan si rinden lo mismo.
            const etas = [...new Set(rv.map((g) => g.eta).filter((e) => e > 0))];
            const eta = etas.length === 1 ? etas[0] : null;
            filas.push({
                generador: rv.map((g) => g.nombre).filter(Boolean).join(' + ') || null,
                porDefecto: false,
                vector: c.vector,
                eta,
                energia: c.energia,
                pct: eta ? (c.energia * eta) / D : null,
            });
        }

        // 2) Lo que no cubre ninguno: el sistema por defecto de CE3X. Con UN solo vector
        //    así, su parte es el RESTO (y su rendimiento sale de ahí, sin suponerlo); con
        //    varios, cada uno con el rendimiento que declara el v3.0 o el conocido.
        const conocido = filas.reduce((a, f) => a + (f.pct ?? 0), 0);
        const todosConPct = filas.every((f) => f.pct !== null);
        for (const c of sinGenerador) {
            const fv = ficticios.find((g) => g.vector === c.vector);
            const def = s.porDefecto && s.porDefecto.vector === c.vector ? s.porDefecto : null;
            let pct = null; let eta = fv?.eta ?? def?.eta ?? null;
            if (sinGenerador.length === 1 && todosConPct) {
                pct = Math.max(0, 1 - conocido);
                if (pct > 0) eta = (D * pct) / c.energia;
            } else if (eta) {
                pct = (c.energia * eta) / D;
            }
            hayPorDefecto = true;
            filas.push({
                generador: `${NOMBRE_POR_DEFECTO} · ${def?.nombre || sinFicticio(fv?.nombre) || 'sin generador declarado'}`,
                porDefecto: true,
                vector: c.vector,
                eta,
                energia: c.energia,
                pct,
            });
        }

        // 3) Un sistema por defecto que comparte vector con un generador declarado (p. ej.
        //    caldera de gas al 40 % + el gas por defecto): la fila «real» se queda con todo
        //    y la suma se pasa del 100 %. Se separan con los dos rendimientos.
        let suma = filas.reduce((a, f) => a + (f.pct ?? 0), 0);
        const ficticioCompartido = ficticios.find((g) => filas.some((f) => !f.porDefecto && f.vector === g.vector));
        const defCompartido = ficticioCompartido
            ? { vector: ficticioCompartido.vector, eta: ficticioCompartido.eta, nombre: ficticioCompartido.nombre }
            : (s.porDefecto && !sinGenerador.length && Math.abs(1 - suma) > 0.03
                && filas.some((f) => !f.porDefecto && f.vector === s.porDefecto.vector) ? s.porDefecto : null);
        if (defCompartido && defCompartido.eta) {
            const fr = filas.find((f) => !f.porDefecto && f.vector === defCompartido.vector);
            const resto = 1 - filas.filter((f) => f !== fr).reduce((a, f) => a + (f.pct ?? 0), 0);
            if (fr?.eta && fr.eta !== defCompartido.eta && resto > 0) {
                // E/D = p_r/η_r + (resto − p_r)/η_d  →  p_r
                const pr = (fr.energia / D - resto / defCompartido.eta) / (1 / fr.eta - 1 / defCompartido.eta);
                if (pr >= -0.01 && pr <= resto + 0.01) {
                    const prc = Math.min(Math.max(pr, 0), resto);
                    const pd = resto - prc;
                    const eReal = (D * prc) / fr.eta;
                    fr.pct = prc; fr.energia = eReal;
                    if (pd > 0.005) {
                        hayPorDefecto = true;
                        filas.push({
                            generador: `${NOMBRE_POR_DEFECTO} · ${defCompartido.nombre}`,
                            porDefecto: true, vector: defCompartido.vector, eta: defCompartido.eta,
                            energia: (D * pd) / defCompartido.eta, pct: pd,
                        });
                    }
                    suma = filas.reduce((a, f) => a + (f.pct ?? 0), 0);
                }
            }
        }

        servicios.push({
            key: s.key,
            etiqueta: s.etiqueta,
            demanda: D,
            filas,
            suma,
            // ±3 %: el rendimiento estacional va con dos decimales en el .xml.
            cuadra: filas.every((f) => f.pct !== null) ? Math.abs(1 - suma) <= 0.03 : null,
        });
    }
    return servicios.length ? { servicios, hayPorDefecto } : null;
}

/** % entero para pantalla y documentos (el .xml da el rendimiento con dos decimales). */
export const pctTexto = (p) => (p === null || p === undefined || !Number.isFinite(p) ? '—' : `${Math.round(p * 100)} %`);
