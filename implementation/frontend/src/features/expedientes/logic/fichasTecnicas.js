// ============================================================================
// fichasTecnicas.js — QUÉ fichas técnicas lleva el CIFO, y cuántas.
// ----------------------------------------------------------------------------
// Hasta 2026-08 el certificado tenía exactamente DOS huecos de ficha técnica:
// `aerotermia_cal` y `aerotermia_acs`. Eso se rompía por los dos extremos:
//
//   · POR DEFECTO (instalación EN CASCADA): el hueco de calefacción resolvía la
//     ficha de la UNIDAD 1 y las demás quedaban sin justificar. Si las bombas de
//     calor son de modelos distintos, el SCOP de cada una sale de SU ficha: el
//     verificador no puede comprobar el equipo del que no ve la ficha.
//
//   · POR EXCESO (equipo CONJUNTO calefacción + ACS, que es lo habitual): el
//     hueco de ACS resolvía el MISMO modelo que el de calefacción, así que el
//     CIFO llevaba dos veces el mismo PDF — a veces treinta páginas repetidas.
//
// La regla es una sola y vale para los dos casos: **una ficha por MODELO
// distinto**, no por hueco. Un modelo que cubre calefacción y ACS aparece una
// vez y se anuncia como lo que es ("calefacción y ACS"); tres bombas iguales en
// cascada llevan una ficha; dos modelos distintos llevan dos.
//
// La identidad del modelo es `aerotermia_db_id` cuando el equipo está elegido
// del catálogo, y marca+modelo normalizados cuando se tecleó a mano.
//
// NOMENCLATURA (sin migración de esquema). El primer hueco de cada bloque
// conserva sus claves de siempre —`cal`/`acs`, `ft_aerotermia_cal_link`,
// "… - FT AEROTERMIA CALEFACCION.pdf"—, así que los expedientes ya generados se
// leen igual. Los adicionales son `cal2`, `cal3`… (`ft_aerotermia_cal2_link`,
// "… - FT AEROTERMIA CALEFACCION 2.pdf").
//
// Módulo ESM PURO (sin React ni Node): lo importan los modales del frontend y,
// por import() dinámico, `cifoService.js` y `routes/expedientes.js` en el
// backend. Una sola decisión para la app, para el asistente y para las rutas.
// ============================================================================
import { getUnidades, modeloUnidad, tipoEquipoNuevo, EQUIPO_NUEVO } from './aerotermiaUnits.js';

const norm = (v) => String(v ?? '').trim().toUpperCase();

/**
 * Identidad del MODELO de una unidad: dos unidades con la misma clave comparten
 * ficha técnica y por tanto un solo anexo.
 *
 * `aerotermia_db_id` manda cuando existe (es el modelo del catálogo, del que
 * sale la ficha). Sin él se compara el texto tecleado, en MAYÚSCULAS porque
 * `normalizeData` sube todos los strings antes de persistir y en BD conviven
 * las dos formas.
 */
export function modeloKey(u) {
    if (!u) return null;
    if (u.aerotermia_db_id) return `db:${u.aerotermia_db_id}`;
    const txt = [u.marca, u.modelo, u.modelo_ud_exterior, u.modelo_conjunto]
        .map(norm).filter(Boolean).join('|');
    return txt ? `txt:${txt}` : null;
}

/** 'cal' → { bloque:'cal', idx:0 } · 'cal2' → { bloque:'cal', idx:1 }. null si no es válido. */
export function parseFtType(type) {
    const m = String(type ?? '').trim().toLowerCase().match(/^(cal|acs)(\d*)$/);
    if (!m) return null;
    const n = m[2] ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(n) || n < 1) return null;
    return { bloque: m[1], idx: n - 1 };
}

/** { 'cal', 0 } → 'cal' · { 'cal', 1 } → 'cal2'. */
export function ftTypeKey(bloque, idx) {
    return idx === 0 ? bloque : `${bloque}${idx + 1}`;
}

/** Clave de tipo → id del slot de anexo ('cal' → 'aerotermia_cal', 'cal2' → 'aerotermia_cal_2'). */
export function ftSlotId(type) {
    const p = parseFtType(type);
    if (!p) return null;
    return p.idx === 0 ? `aerotermia_${p.bloque}` : `aerotermia_${p.bloque}_${p.idx + 1}`;
}

/** Id del slot → clave de tipo. null si el slot no es una ficha técnica (anexo extra). */
export function ftTypeFromSlotId(slotId) {
    const m = String(slotId ?? '').match(/^aerotermia_(cal|acs)(?:_(\d+))?$/);
    if (!m) return null;
    const n = m[2] ? parseInt(m[2], 10) : 1;
    if (!Number.isFinite(n) || n < 1) return null;
    return ftTypeKey(m[1], n - 1);
}

/** Sufijo del nombre del fichero en Drive: 'CALEFACCION' · 'CALEFACCION 2' · 'ACS'. */
export function ftFileSuffix(type) {
    const p = parseFtType(type);
    if (!p) return null;
    const base = p.bloque === 'acs' ? 'ACS' : 'CALEFACCION';
    return p.idx === 0 ? base : `${base} ${p.idx + 1}`;
}

/**
 * Nombre CANÓNICO del fichero en "3. FICHAS TÉCNICAS Y CERTIFICACIONES".
 * Drive es la fuente de verdad (regla 20): la ficha se busca por este nombre, así
 * que lo tienen que construir igual la app, las rutas y la generación automática.
 */
export function ftFileName(numeroExpediente, type) {
    const suffix = ftFileSuffix(type);
    if (!suffix) return null;
    return `${numeroExpediente} - FT AEROTERMIA ${suffix}.pdf`;
}

/** Campos de `documentacion` donde se guarda el enlace/id de esa ficha. */
export function ftDocFields(type) {
    const p = parseFtType(type);
    if (!p) return null;
    const k = ftTypeKey(p.bloque, p.idx);
    return { link: `ft_aerotermia_${k}_link`, id: `ft_aerotermia_${k}_id` };
}

/** Etiqueta de las unidades que cubre un anexo: "Ud. 1 y Ud. 3", "ACS". */
function unidadesLabel(unidades, { variasAcs }) {
    const txt = unidades.map(u => (
        u.bloque === 'cal' ? `Ud. ${u.n}` : (variasAcs ? `ACS ud. ${u.n}` : 'ACS')
    ));
    if (txt.length === 0) return null;
    if (txt.length === 1) return txt[0];
    return `${txt.slice(0, -1).join(', ')} y ${txt[txt.length - 1]}`;
}

/**
 * Los anexos de ficha técnica que le corresponden a ESTE expediente: uno por
 * modelo distinto de bomba de calor, en el orden en que van al documento
 * (calefacción primero).
 *
 * @param {object} instalacion  `expedientes.instalacion`
 * @returns {Array<{
 *   id: string,            // id de slot de anexo ('aerotermia_cal', 'aerotermia_cal_2'…)
 *   type: string,          // clave de tipo para las rutas ('cal', 'cal2', 'acs'…)
 *   bloque: 'cal'|'acs',
 *   label: string,         // lo que se imprime en la hoja de anexos del CIFO
 *   detalle: string|null,  // "Ud. 1 y Ud. 3" — solo cuando hay más de un anexo del bloque
 *   modelId: any,          // aerotermia_db_id del modelo (null si se tecleó a mano)
 *   modeloLabel: string,
 *   unidad: object|null,   // la unidad de la que sale la ficha (métodos de SCOP, EPREL…)
 *   cubreCal: boolean,
 *   cubreAcs: boolean,
 *   required: true,
 * }>}
 */
export function resolveFichaSlots(instalacion) {
    const inst = instalacion || {};
    const cal = inst.aerotermia_cal;
    const mismaAcs = !!inst.misma_aerotermia_acs;
    const acsNode = mismaAcs ? cal : inst.aerotermia_acs;

    // El ACS solo aporta ficha si se actúa sobre él CON AEROTERMIA. Ni el termo
    // eléctrico (efecto Joule, rendimiento 1 por definición) ni el mero acumulador
    // tienen ficha propia que justifique un SCOP: pedirla dejaba el hueco en un
    // error permanente de "sin modelo".
    const acsConFicha = !!acsNode
        && inst.cambio_acs !== false
        && tipoEquipoNuevo(acsNode) === EQUIPO_NUEVO.BDC;

    const grupos = [];
    const push = (bloque, u, n) => {
        const key = modeloKey(u);
        let g = key ? grupos.find(x => x.key === key) : null;
        if (!g) {
            g = {
                key: key || `${bloque}:${n}`,
                bloque,
                unidad: u || null,
                modeloLabel: modeloUnidad(u),
                cubreCal: false,
                cubreAcs: false,
                unidades: [],
            };
            grupos.push(g);
        }
        if (bloque === 'cal') g.cubreCal = true; else g.cubreAcs = true;
        g.unidades.push({ bloque, n });
    };

    const udsCal = getUnidades(cal);
    if (udsCal.length === 0) {
        // Sin equipo declarado se conserva igualmente el hueco primario: es la
        // forma que tiene el modal de decir qué falta y de admitir una subida a mano.
        grupos.push({
            key: 'cal:1', bloque: 'cal', unidad: cal || null, modeloLabel: '',
            cubreCal: true, cubreAcs: false, unidades: [],
        });
    } else {
        udsCal.forEach((u, i) => push('cal', u, i + 1));
    }

    if (acsConFicha) {
        if (mismaAcs) {
            // El MISMO equipo resuelve calefacción y ACS: su ficha ya cubre las dos.
            // Este es el caso que duplicaba el PDF.
            grupos.forEach(g => { if (g.bloque === 'cal') g.cubreAcs = true; });
        } else {
            const udsAcs = getUnidades(inst.aerotermia_acs);
            if (udsAcs.length === 0) push('acs', inst.aerotermia_acs, 1);
            else udsAcs.forEach((u, i) => push('acs', u, i + 1));
        }
    }

    const nCal = grupos.filter(g => g.bloque === 'cal').length;
    const nAcs = grupos.length - nCal;
    const variasAcs = (inst.misma_aerotermia_acs ? [] : getUnidades(inst.aerotermia_acs)).length > 1;

    let iCal = 0, iAcs = 0;
    return grupos.map(g => {
        const idx = g.bloque === 'cal' ? iCal++ : iAcs++;
        const type = ftTypeKey(g.bloque, idx);
        const base = g.cubreCal && g.cubreAcs
            ? 'Ficha técnica aerotermia calefacción y ACS'
            : g.cubreCal
                ? 'Ficha técnica aerotermia calefacción'
                : 'Ficha técnica aerotermia ACS';
        // El modelo solo se añade a la etiqueta cuando hay MÁS DE UNA ficha del
        // mismo bloque: es lo único que distingue una de otra en la hoja de anexos.
        const varias = (g.bloque === 'cal' ? nCal : nAcs) > 1;
        return {
            id: ftSlotId(type),
            type,
            bloque: g.bloque,
            label: varias && g.modeloLabel ? `${base} · ${g.modeloLabel}` : base,
            detalle: varias ? unidadesLabel(g.unidades, { variasAcs }) : null,
            modelId: g.unidad?.aerotermia_db_id ?? null,
            modeloLabel: g.modeloLabel,
            unidad: g.unidad,
            cubreCal: g.cubreCal,
            cubreAcs: g.cubreAcs,
            required: true,
        };
    });
}

/** El slot de un tipo concreto ('cal2'), o null si este expediente no lo pide. */
export function findFichaSlot(instalacion, type) {
    const p = parseFtType(type);
    if (!p) return null;
    const key = ftTypeKey(p.bloque, p.idx);
    return resolveFichaSlots(instalacion).find(s => s.type === key) || null;
}

/**
 * Los mismos slots en la forma que consumen los modales como anexos
 * (`{ id, label, file, required }`), listos para fusionar con los extras.
 */
export function ftAttachmentSlots(instalacion) {
    return resolveFichaSlots(instalacion).map(s => ({
        id: s.id,
        type: s.type,
        label: s.label,
        detalle: s.detalle,
        file: null,
        required: true,
    }));
}
