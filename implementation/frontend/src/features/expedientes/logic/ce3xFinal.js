// ============================================================================
// ce3xFinal.js — FUENTE ÚNICA de las instrucciones CE3X para el CEE FINAL.
// ----------------------------------------------------------------------------
// Hasta ahora el CEE final lo dejaba montado Brokergy y el certificador solo
// firmaba y registraba. A partir de 2026-08 lo teclea ÉL en CE3X, así que el
// encargo del CEE Final deja de ser un aviso genérico y pasa a llevar los
// valores exactos que tiene que meter: el equipo tal y como está elegido en la
// app, su rendimiento estacional en % (CE3X pide %, no SCOP) y la demanda
// cubierta.
//
// El objetivo es que NO tenga que pensar ni deducir nada: si un dato no está en
// el expediente, este módulo NO lo inventa — lo devuelve en `faltantes` para que
// la app lo pida antes de enviar (mismo patrón que el popup de potencias de la
// Memoria RITE).
//
// Módulo JS PURO (sin React, sin DOM, sin axios): lo consume el popup de
// "Notificar certificador" y puede consumirlo el backend por import() dinámico
// si algún día el aviso se manda solo.
//
// FORMATO: texto de WhatsApp. Los `*…*` son negrita en WhatsApp y se ven como
// asteriscos en el email — es el mismo compromiso que ya asumen el resto de
// plantillas de certMessages.js.
// ============================================================================
import { BOILER_EFFICIENCIES, calculateHybridization, resolveHybridInputs } from '../../calculator/logic/calculation.js';
import {
    getUnidades, countUnidades, modeloUnidad, formatSeries,
    tipoEquipoNuevo, esTermoElectrico, datosAcumulador, EQUIPO_NUEVO,
} from './aerotermiaUnits.js';

// Emisores que dan FRÍO: con ellos el equipo se declara en CE3X con
// refrigeración y hace falta el SEER. Con radiadores no hay modo frío en la
// instalación aunque el equipo sea reversible.
// ESPEJO de `EMISORES_CON_FRIO` en backend/utils/riteValidation.js (y de
// `_EMISORES_FRIO` en rite-generator/lib/supabase_client.py).
export const EMISORES_CON_FRIO = ['suelo_radiante', 'splits', 'conductos'];

export function emisorDaFrio(tipoEmisor) {
    return EMISORES_CON_FRIO.includes(String(tipoEmisor || '').trim().toLowerCase());
}

// Unidades terminales AIRE-AIRE (splits / conductos, típicas de RES080). Ni el
// nombre del equipo ni el tipo de generador de CE3X son los mismos que en una
// aerotermia aire-agua: un split se declara como "Bomba de Calor" a secas.
const EMISORES_AIRE = ['splits', 'conductos'];

function esAireAire(tipoEmisor) {
    return EMISORES_AIRE.includes(String(tipoEmisor || '').trim().toLowerCase());
}

// Tipos de dato que bloquean el mensaje. Los resuelve el popup previo al envío.
export const CE3X_FALTA = {
    SEER: 'seer',               // del MODELO → se guarda en el catálogo (aerotermia.seer)
    LITROS_ACS: 'litros_acs',   // de la OBRA → se guarda en el expediente
};

// ─── Helpers de formato ──────────────────────────────────────────────────────
const num2 = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
// CE3X pide el rendimiento medio estacional en % (SCOP 4,3 → 430).
const aPorcentaje = (v) => Math.round((Number(v) || 0) * 100);

/**
 * Nombre del equipo para la casilla "Nombre" de CE3X, agrupando unidades iguales.
 * Lleva delante la tecnología ("AEROTERMIA …") porque así es como se nombran los
 * equipos en los CEE que venimos presentando: el verificador y el técnico los
 * reconocen por ese formato.
 */
function nombreEquipo(aero, prefijo = 'AEROTERMIA ') {
    const grupos = [];
    for (const u of getUnidades(aero)) {
        const label = [
            u?.marca,
            u?.modelo,
            u?.modelo_ud_exterior ? `(${u.modelo_ud_exterior})` : '',
        ].filter(Boolean).join(' ').trim() || modeloUnidad(u);
        if (!label) continue;
        const g = grupos.find(x => x.label === label);
        if (g) g.n++;
        else grupos.push({ label, n: 1 });
    }
    if (!grupos.length) return '';
    return prefijo + grupos.map(g => (g.n > 1 ? `${g.label} (×${g.n})` : g.label)).join(' + ');
}

/**
 * SEER aplicado del bloque = el MENOR de las unidades (mismo criterio conservador
 * que el SCOP en cascada). `modelos` es el mapa id→fila del catálogo, porque el
 * SEER vive en la ficha del MODELO, no en el expediente.
 */
function seerBloque(aero, modelos) {
    const vals = getUnidades(aero)
        .map(u => parseFloat(u?.seer ?? modelos?.[u?.aerotermia_db_id]?.seer))
        .filter(v => v > 0);
    return vals.length ? Math.min(...vals) : null;
}

/** Unidades de calefacción cuyo MODELO no tiene SEER en el catálogo. */
function unidadesSinSeer(aero, modelos) {
    const vistos = new Set();
    const out = [];
    for (const u of getUnidades(aero)) {
        const id = u?.aerotermia_db_id;
        if (!id || vistos.has(id)) continue;
        vistos.add(id);
        const m = modelos?.[id] || {};
        if (parseFloat(u?.seer) > 0 || parseFloat(m.seer) > 0) continue;
        out.push({
            tipo: CE3X_FALTA.SEER,
            modeloId: id,
            marca: u?.marca || m.marca || '',
            modelo: u?.modelo || m.modelo_comercial || '',
            modelo_ud_exterior: u?.modelo_ud_exterior || m.modelo_ud_exterior || '',
            // Enlaces para mirarlo sin salir de la app: primero lo que guardó el
            // expediente, si no lo que tenga el catálogo.
            ficha: u?.url_ficha || m.ficha_tecnica || u?.url_eprel || m.eprel || m.url_keymark || null,
        });
    }
    return out;
}

/**
 * Litros de acumulación de ACS declarados. Con "misma aerotermia para ACS" el
 * nodo `aerotermia_acs` puede no existir: el depósito es el del propio equipo de
 * calefacción, así que el dato se busca también ahí.
 */
function litrosAcs(inst) {
    return parseFloat(inst?.aerotermia_acs?.litros)
        || (inst?.misma_aerotermia_acs ? parseFloat(inst?.aerotermia_cal?.litros) : 0)
        || 0;
}

/**
 * ¿La producción de ACS lleva depósito de acumulación? Acumulador y termo SIEMPRE
 * acumulan (son literalmente un depósito). Una BdC solo si el modelo lo trae — el
 * catálogo precarga `litros` al elegir el modelo, así que un valor > 0 es la señal.
 */
function llevaAcumulacionAcs(inst) {
    const acs = inst?.aerotermia_acs;
    const tipo = acs ? tipoEquipoNuevo(acs) : null;
    if (tipo === EQUIPO_NUEVO.ACUMULADOR || tipo === EQUIPO_NUEVO.TERMO) return true;
    return litrosAcs(inst) > 0;
}

/**
 * Etiqueta del desplegable "Tipo de equipo" de CE3X.
 * Criterio acordado: el ACS solo va en el mismo equipo cuando lo produce la BdC
 * de calefacción (mismo equipo o depósito calentado por ella); la refrigeración
 * entra siempre que el emisor dé frío.
 */
function tipoEquipoCe3x({ conAcs, conFrio }) {
    if (conAcs) {
        return conFrio
            ? 'EQUIPO MIXTO DE CALEFACCIÓN, REFRIGERACIÓN Y ACS'
            : 'EQUIPO MIXTO DE CALEFACCIÓN Y ACS';
    }
    return conFrio ? 'EQUIPO DE CALEFACCIÓN Y REFRIGERACIÓN' : 'EQUIPO DE SOLO CALEFACCIÓN';
}

/** Fichas en las que la actuación es sustituir el generador (la envolvente no se toca). */
function esSustitucionGenerador(numExp) {
    return /RES060|RES093|TER100/i.test(String(numExp || ''));
}

/**
 * Resuelve TODO lo que CE3X necesita saber del expediente: alcance, casillas del
 * programa, rendimientos y demanda. Es la capa de DATOS; el texto del encargo lo
 * monta `buildCe3xFinal` a partir de esto.
 *
 * Se extrajo aparte porque el popup "Datos del equipo" del expediente pide los
 * MISMOS valores para copiarlos a mano en CE3X: si cada uno los dedujera por su
 * cuenta, el certificador podría recibir por WhatsApp un criterio y ver otro en
 * pantalla.
 *
 * @param {object} exp        expediente completo (con clientes, oportunidades, cee, instalacion)
 * @param {object} [opts]
 * @param {object} [opts.modelos]  mapa { [aerotermia_db_id]: fila del catálogo } — aporta el SEER
 * @returns {object|null}  null si no hay equipo nuevo declarado (no se inventa nada).
 */
export function resolverCe3x(exp, { modelos = {} } = {}) {
    const inst = exp?.instalacion || {};
    const cee = exp?.cee || {};
    const opDatos = exp?.oportunidades?.datos_calculo || {};
    const cal = inst.aerotermia_cal;
    const faltantes = [];

    if (!countUnidades(cal)) return null;

    // ── Alcance ──────────────────────────────────────────────────────────────
    const conFrio = emisorDaFrio(inst.tipo_emisor);
    // Un split/conductos es una bomba de calor aire-aire: en CE3X no lleva el
    // matiz de "Caudal Ref. Variable" (eso es del aire-agua) ni se nombra
    // "AEROTERMIA".
    const aireAire = esAireAire(inst.tipo_emisor);
    const generadorBdc = aireAire ? 'Bomba de Calor' : 'Bomba de Calor - Caudal Ref. Variable';
    const prefijoNombre = aireAire ? 'BOMBA DE CALOR ' : 'AEROTERMIA ';
    const acsNode = inst.misma_aerotermia_acs ? cal : inst.aerotermia_acs;
    const acsTipo = inst.aerotermia_acs ? tipoEquipoNuevo(inst.aerotermia_acs) : null;
    // Con "misma aerotermia para ACS" puede no haber nodo propio de ACS: el equipo
    // de calefacción lo produce todo. Mismo criterio que `tieneAcs` en cifoDoc.js.
    const hayAcs = inst.cambio_acs !== false && (!!inst.misma_aerotermia_acs || !!inst.aerotermia_acs);
    // El ACS va en el MISMO equipo cuando lo produce la BdC de calefacción:
    // o es literalmente el mismo equipo, o es un depósito que ella calienta.
    const acsEnMismoEquipo = hayAcs && (!!inst.misma_aerotermia_acs || acsTipo === EQUIPO_NUEVO.ACUMULADOR);
    // ACS resuelto con un equipo distinto: otra BdC o un termo eléctrico.
    const acsAparte = hayAcs && !acsEnMismoEquipo;

    const scopCal = parseFloat(cal?.scop) || 0;
    const scopAcs = parseFloat(acsNode?.scop) || 0;
    const seer = conFrio ? seerBloque(cal, modelos) : null;
    if (conFrio) faltantes.push(...unidadesSinSeer(cal, modelos));

    // ── Litros de acumulación de ACS ─────────────────────────────────────────
    const litros = litrosAcs(inst);
    if (hayAcs && llevaAcumulacionAcs(inst) && !(litros > 0)) {
        faltantes.push({ tipo: CE3X_FALTA.LITROS_ACS });
    }

    // ── Superficie y demanda (del CEE INICIAL: es la referencia que no debe variar) ──
    const ceeIni = cee.cee_inicial || {};
    const superficie = parseFloat(ceeIni.superficieHabitable) || parseFloat(opDatos.surface) || 0;
    const demandaCal = parseFloat(ceeIni.demandaCalefaccion) || 0;

    // ── Hibridación (RES093): la caldera NO se retira, son DOS generadores ────
    const hib = !!inst.hibridacion;
    let coberturaBdc = null;
    if (hib) {
        const supHib = superficie || parseFloat(cee.cee_final?.superficieHabitable) || 0;
        const demandAnnual = (demandaCal * supHib) || parseFloat(opDatos.Q_net) || 0;
        const r = calculateHybridization({
            demandAnnual,
            zone: opDatos.zona || 'D3',
            ...resolveHybridInputs(inst, opDatos),
        });
        if (r?.coverage > 0) coberturaBdc = Math.round(r.coverage * 100);
    }
    // Un reparto solo se dicta si la app lo ha calculado Y deja algo a la caldera:
    // "caldera 0 %" en una hibridación es contradictorio —la caldera se queda
    // precisamente porque cubre parte de la demanda— y el certificador no sabría a
    // quién creer. Si no cuadra, se le dice que lo confirme en vez de darle un dato
    // que probablemente esté mal.
    const repartoValido = hib && coberturaBdc != null && coberturaBdc > 0 && coberturaBdc < 100;
    const pctCal = repartoValido ? coberturaBdc : 100;

    return {
        faltantes, hibridacion: hib,
        conFrio, aireAire, generadorBdc, prefijoNombre,
        hayAcs, acsEnMismoEquipo, acsAparte, acsTipo, acsNode,
        scopCal, scopAcs, seer, litros,
        superficie, demandaCal,
        coberturaBdc, repartoValido, pctCal,
        tipoEquipo: tipoEquipoCe3x({ conAcs: acsEnMismoEquipo, conFrio }),
        nombre: nombreEquipo(cal, prefijoNombre),
        series: formatSeries(cal, { dash: '', sep: ' / ' }),
        seriesAcs: formatSeries(inst.aerotermia_acs, { dash: '', sep: ' / ' }),
    };
}


/**
 * Construye el bloque de instrucciones CE3X del CEE Final.
 *
 * @returns {{ bloque: string, faltantes: Array, hibridacion: boolean }}
 *          `bloque` vacío si no hay equipo nuevo declarado.
 */
export function buildCe3xFinal(exp, { modelos = {} } = {}) {
    const d = resolverCe3x(exp, { modelos });
    if (!d) return { bloque: '', faltantes: [], hibridacion: false };
    const inst = exp?.instalacion || {};
    const cal = inst.aerotermia_cal;
    const {
        faltantes, conFrio, generadorBdc, prefijoNombre,
        acsEnMismoEquipo, acsAparte, acsTipo, scopCal, scopAcs, seer, litros,
        superficie, demandaCal, repartoValido, pctCal, hibridacion: hib,
    } = d;

    // ── Montaje del texto ────────────────────────────────────────────────────
    const L = [];
    L.push('📋 *DATOS PARA EL CEE FINAL (CE3X)*');
    L.push('Están sacados del expediente y de las fichas técnicas: se pueden copiar tal cual.');
    L.push('');

    // ── Equipo 1: la bomba de calor de calefacción ───────────────────────────
    L.push(`*1) ${tipoEquipoCe3x({ conAcs: acsEnMismoEquipo, conFrio })}*`);
    const sufijoAcs = acsEnMismoEquipo
        ? (acsTipo === EQUIPO_NUEVO.ACUMULADOR ? ' + ACUMULACIÓN DE ACS' : ' + ACS')
        : '';
    L.push(`• Nombre: ${nombreEquipo(cal, prefijoNombre)}${sufijoAcs}`);
    L.push(`• Tipo de generador: ${generadorBdc}`);
    L.push('• Tipo de combustible: Electricidad');
    L.push('• Rendimiento estacional: Conocido (Ensayado/justificado)');
    L.push(scopCal > 0
        ? `• Rendimiento CALEFACCIÓN: *${aPorcentaje(scopCal)} %*  (SCOP ${num2(scopCal)})`
        : '• Rendimiento CALEFACCIÓN: ⚠️ pendiente de confirmar');
    if (conFrio) {
        L.push(seer > 0
            ? `• Rendimiento REFRIGERACIÓN: *${aPorcentaje(seer)} %*  (SEER ${num2(seer)})`
            : '• Rendimiento REFRIGERACIÓN: ⚠️ pendiente (SEER de la ficha técnica)');
    }
    if (acsEnMismoEquipo) {
        L.push(scopAcs > 0
            ? `• Rendimiento ACS: *${aPorcentaje(scopAcs)} %*  (SCOP dhw ${num2(scopAcs)})`
            : '• Rendimiento ACS: ⚠️ pendiente de confirmar');
        if (litros > 0) L.push(`• Con acumulación: SÍ · ${litros} litros`);
    }
    if (superficie > 0) {
        L.push(`• Demanda cubierta → Superficie: ${num2(superficie)} m²  ·  Calefacción: ${pctCal} %${acsEnMismoEquipo ? '  ·  ACS: 100 %' : ''}`);
    }
    const series = formatSeries(cal, { dash: '', sep: ' / ' });
    if (series) L.push(`• Nº de serie: ${series}`);

    // ── Equipo 2: el ACS cuando lo resuelve otro equipo ──────────────────────
    if (acsAparte) {
        L.push('');
        if (acsTipo === EQUIPO_NUEVO.TERMO) {
            const termo = inst.aerotermia_acs;
            L.push('*2) EQUIPO DE SOLO ACS*');
            L.push(`• Nombre: TERMO ELÉCTRICO ${[termo?.marca, termo?.modelo].filter(Boolean).join(' ')}`.trim());
            L.push('• Tipo de generador: Efecto Joule');
            L.push('• Tipo de combustible: Electricidad');
            L.push('• Rendimiento ACS: *100 %*  (resistencia eléctrica — rendimiento 1 por definición)');
        } else {
            const acum = acsTipo === EQUIPO_NUEVO.ACUMULADOR ? datosAcumulador(inst.aerotermia_acs) : null;
            L.push('*2) EQUIPO DE SOLO ACS*');
            L.push(`• Nombre: ${acum ? [acum.marca, acum.modelo].filter(Boolean).join(' ') : nombreEquipo(inst.aerotermia_acs)}`);
            L.push('• Tipo de generador: Bomba de Calor - Caudal Ref. Variable');
            L.push('• Tipo de combustible: Electricidad');
            L.push('• Rendimiento estacional: Conocido (Ensayado/justificado)');
            L.push(scopAcs > 0
                ? `• Rendimiento ACS: *${aPorcentaje(scopAcs)} %*  (SCOP dhw ${num2(scopAcs)})`
                : '• Rendimiento ACS: ⚠️ pendiente de confirmar');
        }
        if (litros > 0) L.push(`• Con acumulación: SÍ · ${litros} litros`);
        const seriesAcs = formatSeries(inst.aerotermia_acs, { dash: '', sep: ' / ' });
        if (seriesAcs) L.push(`• Nº de serie: ${seriesAcs}`);
    }

    // ── Hibridación: la caldera sigue viva y hay que declararla ───────────────
    if (hib) {
        // 'default' no es un tipo de caldera: es el valor de reserva del cálculo.
        // Si el expediente no dice qué caldera hay, no se lo presentamos como dato.
        const eff = BOILER_EFFICIENCIES.find(b => b.id === inst.caldera_antigua_cal?.rendimiento_id);
        const effConocido = eff && eff.id !== 'default';
        const calderaMarca = [inst.caldera_antigua_cal?.marca, inst.caldera_antigua_cal?.modelo].filter(Boolean).join(' ');
        L.push('');
        L.push('🔥 *HIBRIDACIÓN — HAY QUE DECLARAR DOS GENERADORES*');
        L.push('La caldera NO se retira: sigue dando servicio junto a la bomba de calor, así que en el CE3X final tienen que aparecer los dos.');
        L.push(`• Generador 1 — Bomba de calor (la de arriba)${repartoValido ? ` → Demanda de calefacción cubierta: *${pctCal} %*` : ''}`);
        L.push(`• Generador 2 — Caldera existente${calderaMarca ? `: ${calderaMarca}` : ''}`);
        if (effConocido) {
            L.push(`   · Tipo / combustible: ${eff.label}`);
            L.push(`   · Rendimiento estacional: ${Math.round(eff.value * 100)} %`);
        } else {
            L.push('   · Tipo, combustible y rendimiento: los del CEE inicial (en el expediente no consta el modelo).');
        }
        if (repartoValido) {
            L.push(`   · Demanda de calefacción cubierta: *${100 - pctCal} %*`);
            L.push('   _El reparto sale de la cobertura de potencia de la bomba (Anexo III), que es la que se declaró en el expediente CAE._');
        } else {
            L.push('⚠️ El reparto de demanda entre los dos generadores NO se ha podido calcular en la app: mantén el mismo que llevaba el CEE inicial y avísanos si no cuadra.');
        }
    }

    // ── Recordatorio de la demanda: es el fallo que más nos ha costado ───────
    if (esSustitucionGenerador(exp?.numero_expediente)) {
        L.push('');
        L.push('⚠️ *LA DEMANDA DE CALEFACCIÓN NO PUEDE CAMBIAR*');
        L.push('La actuación es sustituir el generador: la envolvente no se toca, así que el CEE final tiene que salir con la MISMA demanda de calefacción que el inicial.');
        if (demandaCal > 0) {
            L.push(`Demanda del CEE inicial: *${num2(demandaCal)} kWh/m²·año*${superficie > 0 ? `  (superficie ${num2(superficie)} m²)` : ''}.`);
        }
        L.push('Si al cerrar te sale otra cifra, párate y avísanos antes de firmar: una demanda distinta rompe el ahorro declarado del expediente CAE.');
    }

    return { bloque: L.join('\n'), faltantes, hibridacion: hib };
}
