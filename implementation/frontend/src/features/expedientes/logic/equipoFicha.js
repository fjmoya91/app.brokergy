// ============================================================================
// equipoFicha.js — FICHA DE DATOS DEL EQUIPO para teclear el CEE (CE3X).
// ----------------------------------------------------------------------------
// El certificado de eficiencia energética se teclea a mano en CE3X, y sus datos
// están repartidos por medio expediente: la marca y el modelo en Instalación, el
// SCOP en el bloque de rendimiento, el SEER solo en el catálogo del modelo, la
// superficie y la demanda en el CEE inicial. Ir a buscarlos uno a uno es donde se
// cometen los errores de transcripción.
//
// Este módulo los reúne en una ficha lista para COPIAR Y PEGAR, campo a campo.
//
// NO decide nada por su cuenta: las casillas de CE3X (tipo de equipo, tipo de
// generador, rendimientos en %) salen de `resolverCe3x`, la misma función que
// redacta el encargo que se le manda al certificador. Si aquí se dedujeran otra
// vez, el técnico podría leer un criterio en el WhatsApp y otro en pantalla.
//
// Módulo JS PURO (sin React ni axios): el modal solo lo pinta.
// ============================================================================
import { resolverCe3x, buildMedidaMejora } from './ce3xFinal.js';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation.js';
import {
    getUnidades, modeloUnidad, tipoEquipoNuevo, datosAcumulador, EQUIPO_NUEVO,
} from './aerotermiaUnits.js';

const num2 = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
const pct = (v) => `${Math.round((Number(v) || 0) * 100)} %`;
const kw = (v) => (Number(v) > 0 ? `${String(Number(v)).replace('.', ',')} kW` : null);

/** "el SCOP y el SEER" — para decir en una línea qué falta del párrafo. */
const enumerarFaltan = (arr) => (arr.length <= 1
    ? (arr[0] || '')
    : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`);

/** Campo de la ficha. `valor` a null = el expediente no lo tiene (se pinta como falta). */
const F = (label, valor, extra = {}) => ({ label, valor: valor || null, ...extra });

/**
 * Datos de UNA unidad (marca, modelo, serie, potencias, rendimientos) fusionando
 * lo que declara el expediente con la ficha del catálogo. Manda SIEMPRE el
 * expediente: el catálogo es lo que el modelo puede dar, el expediente es lo que
 * se instaló de verdad.
 */
function fichaUnidad(u, modelos, { conFrio, esAcs = false }) {
    const cat = modelos?.[u?.aerotermia_db_id] || {};
    const campos = [
        F('Marca', u?.marca || cat.marca),
        F('Modelo', u?.modelo || cat.modelo_comercial || modeloUnidad(u)),
        F('Ud. exterior', u?.modelo_ud_exterior || cat.modelo_ud_exterior, { mono: true }),
        F('Ud. interior', u?.modelo_ud_interior || cat.modelo_ud_interior, { mono: true }),
        F('Nº de serie', u?.numero_serie, { mono: true }),
        F(esAcs ? 'Potencia' : 'Potencia calefacción', kw(u?.potencia ?? cat.potencia_calefaccion)),
    ];
    if (conFrio) {
        campos.push(F('Potencia frigorífica', kw(u?.potencia_frio ?? cat.potencia_frigorifica)));
    }
    campos.push(F('Refrigerante', u?.refrigerante || cat.refrigerante, { mono: true }));

    const scop = parseFloat(u?.scop_propio ?? u?.scop) || 0;
    if (scop > 0) campos.push(F(esAcs ? 'SCOP dhw' : 'SCOP', num2(scop), { nota: `CE3X: ${pct(scop)}` }));
    const seer = parseFloat(u?.seer ?? cat.seer) || 0;
    if (conFrio) {
        // El SEER es del MODELO, no de la obra: si falta, se teclea AQUÍ y se guarda
        // en el catálogo (`editable`), de una vez para todos los expedientes que
        // lleven ese equipo. Sin esta salida había que salir del expediente, buscar
        // el modelo en el catálogo y volver — y por eso se quedaba sin rellenar.
        campos.push(seer > 0
            ? F('SEER', num2(seer), { nota: `CE3X: ${pct(seer)}` })
            : F('SEER', null, {
                nota: 'Búscalo en la ficha técnica del modelo y guárdalo: queda en el catálogo.',
                editable: u?.aerotermia_db_id
                    ? { campo: 'seer', modeloId: u.aerotermia_db_id, unidad: 'SEER' }
                    : null,
            }));
    }

    // Enlaces para comprobar cualquier dato sin salir de la app.
    const enlaces = [
        ['Ficha técnica', u?.url_ficha || cat.ficha_tecnica],
        ['EPREL', u?.url_eprel || cat.eprel],
        ['Keymark', cat.url_keymark],
    ].filter(([, url]) => !!url).map(([label, url]) => ({ label, url }));

    return { campos, enlaces };
}

/**
 * Ficha completa del equipo del expediente.
 *
 * @param {object} exp  expediente (con instalacion, cee y oportunidades)
 * @param {object} [opts.modelos]  mapa { [aerotermia_db_id]: fila del catálogo }
 * @returns {{ secciones: Array, ce3x: object|null }}  `secciones` vacío si no hay
 *          equipo nuevo declarado: no se inventa una ficha de la nada.
 */
export function buildEquipoFicha(exp, { modelos = {} } = {}) {
    const d = resolverCe3x(exp, { modelos });
    if (!d) return { secciones: [], ce3x: null };

    const inst = exp?.instalacion || {};
    const secciones = [];

    // ── 1. Las casillas de CE3X, que es a lo que se viene ────────────────────
    const ce3xCampos = [
        F('Tipo de equipo', d.tipoEquipo),
        F('Nombre', d.nombre),
        F('Tipo de generador', d.generadorBdc),
        F('Tipo de combustible', 'Electricidad'),
        F('Rendimiento estacional', 'Conocido (Ensayado/justificado)'),
        d.scopCal > 0
            ? F('Rendimiento calefacción', pct(d.scopCal), { nota: `SCOP ${num2(d.scopCal)}`, destacado: true })
            : F('Rendimiento calefacción', null),
    ];
    if (d.conFrio) {
        // El SEER declarado es el del BLOQUE (el menor de las unidades en cascada),
        // así que aquí no se edita: se rellena abajo, en la unidad que lo tenga en
        // blanco y junto al enlace a su ficha técnica, que es de donde se saca.
        ce3xCampos.push(d.seer > 0
            ? F('Rendimiento refrigeración', pct(d.seer), { nota: `SEER ${num2(d.seer)}`, destacado: true })
            : F('Rendimiento refrigeración', null, { nota: 'Falta el SEER — se rellena abajo, en el equipo de calefacción' }));
    }
    if (d.acsEnMismoEquipo) {
        ce3xCampos.push(d.scopAcs > 0
            ? F('Rendimiento ACS', pct(d.scopAcs), { nota: `SCOP dhw ${num2(d.scopAcs)}`, destacado: true })
            : F('Rendimiento ACS', null));
    }
    if (d.litros > 0) ce3xCampos.push(F('Acumulación ACS', `${d.litros} litros`));
    if (d.superficie > 0) {
        ce3xCampos.push(F('Superficie', `${num2(d.superficie)} m²`));
        ce3xCampos.push(F('Demanda cubierta — calefacción', `${d.pctCal} %`));
        if (d.acsEnMismoEquipo) ce3xCampos.push(F('Demanda cubierta — ACS', '100 %'));
    }
    secciones.push({
        id: 'ce3x',
        titulo: 'Casillas de CE3X',
        subtitulo: 'Lo que hay que escribir en el programa, tal cual.',
        campos: ce3xCampos,
    });

    // ── 1.b El párrafo del conjunto de medidas de mejora ─────────────────────
    // Es el único campo de CE3X que se REDACTA en vez de teclear un valor, y por
    // eso era donde se colaban la marca de otro expediente o un SCOP de más. Va
    // aquí, detrás de las casillas y delante de los equipos, porque se rellena en
    // esa misma pantalla del programa.
    const medida = buildMedidaMejora(exp, { modelos });
    if (medida) {
        secciones.push({
            id: 'medida',
            titulo: 'Conjunto de medidas de mejora',
            subtitulo: medida.aviso
                || 'El texto del campo "Características", redactado con los datos del expediente.',
            avisa: !!medida.aviso,
            full: true,
            campos: [F('Características', medida.texto, {
                parrafo: true,
                nota: medida.faltan.length
                    ? `⚠ Falta ${enumerarFaltan(medida.faltan)} en el expediente: donde va "___" hay que completarlo antes de pegarlo.`
                    : null,
            })],
        });
    }

    // ── 2. Equipos instalados, unidad a unidad ───────────────────────────────
    const unidadesCal = getUnidades(inst.aerotermia_cal);
    unidadesCal.forEach((u, i) => {
        const { campos, enlaces } = fichaUnidad(u, modelos, { conFrio: d.conFrio });
        secciones.push({
            id: `cal_${i}`,
            titulo: unidadesCal.length > 1
                ? `Calefacción · unidad ${i + 1} de ${unidadesCal.length}`
                : 'Equipo de calefacción',
            // En cascada el SCOP que se declara es el MENOR de todas las unidades:
            // conviene recordarlo aquí o se copia el de la unidad que se esté mirando.
            subtitulo: unidadesCal.length > 1
                ? 'En cascada, el rendimiento declarado es el MENOR de las unidades (arriba, en las casillas de CE3X).'
                : null,
            campos, enlaces,
        });
    });

    // ── 3. ACS, cuando lo resuelve otro equipo ───────────────────────────────
    if (d.acsAparte || (d.hayAcs && inst.aerotermia_acs && !inst.misma_aerotermia_acs)) {
        const acs = inst.aerotermia_acs;
        const tipo = tipoEquipoNuevo(acs);
        let campos;
        if (tipo === EQUIPO_NUEVO.TERMO) {
            campos = [
                F('Tipo', 'Termo eléctrico (efecto Joule)'),
                F('Marca', acs?.marca), F('Modelo', acs?.modelo),
                F('Nº de serie', d.seriesAcs, { mono: true }),
                F('Rendimiento ACS', '100 %', { nota: 'Resistencia eléctrica: rendimiento 1 por definición' }),
            ];
        } else if (tipo === EQUIPO_NUEVO.ACUMULADOR) {
            const a = datosAcumulador(acs) || {};
            campos = [
                F('Tipo', 'Depósito de acumulación (lo calienta la bomba de calor)'),
                F('Marca', a.marca), F('Modelo', a.modelo),
                F('Nº de serie', d.seriesAcs, { mono: true }),
                d.scopAcs > 0 ? F('SCOP dhw', num2(d.scopAcs), { nota: `CE3X: ${pct(d.scopAcs)}` }) : F('SCOP dhw', null),
            ];
        } else {
            campos = [
                F('Tipo de equipo', 'EQUIPO DE SOLO ACS'),
                F('Tipo de generador', 'Bomba de Calor - Caudal Ref. Variable'),
                F('Tipo de combustible', 'Electricidad'),
                ...fichaUnidad(getUnidades(acs)[0], modelos, { conFrio: false, esAcs: true }).campos,
            ];
        }
        if (d.litros > 0) campos.push(F('Litros de acumulación', `${d.litros} litros`));
        secciones.push({ id: 'acs', titulo: 'Equipo de ACS', campos });
    }

    // ── 4. Lo que había antes: el CEE final declara el estado inicial ────────
    const cald = inst.caldera_antigua_cal || {};
    const eff = BOILER_EFFICIENCIES.find(b => b.id === cald.rendimiento_id);
    if (cald.marca || cald.modelo || (eff && eff.id !== 'default')) {
        secciones.push({
            id: 'caldera',
            titulo: inst.hibridacion ? 'Caldera existente (NO se retira)' : 'Caldera sustituida',
            subtitulo: inst.hibridacion
                ? 'Hay hibridación: en el CEE final tienen que aparecer los DOS generadores.'
                : null,
            campos: [
                F('Marca', cald.marca), F('Modelo', cald.modelo),
                eff && eff.id !== 'default' ? F('Tipo / combustible', eff.label) : F('Tipo / combustible', null),
                eff && eff.id !== 'default' ? F('Rendimiento estacional', pct(eff.value)) : F('Rendimiento estacional', null),
                inst.hibridacion && d.repartoValido
                    ? F('Demanda cubierta', `${100 - d.pctCal} %`, { nota: `la bomba de calor cubre el ${d.pctCal} %` })
                    : null,
            ].filter(Boolean),
        });
    }

    // ── 5. Referencia del CEE inicial ────────────────────────────────────────
    const ceeIni = exp?.cee?.cee_inicial || {};
    const refCampos = [
        F('Superficie habitable', d.superficie > 0 ? `${num2(d.superficie)} m²` : null),
        F('Demanda calefacción', d.demandaCal > 0 ? `${num2(d.demandaCal)} kWh/m²·año` : null),
        F('Demanda ACS', parseFloat(ceeIni.demandaACS) > 0 ? `${num2(ceeIni.demandaACS)} kWh/m²·año` : null),
        F('Ref. catastral', exp?.ref_catastral || exp?.oportunidades?.ref_catastral, { mono: true }),
    ];
    secciones.push({
        id: 'referencia',
        titulo: 'Del CEE inicial',
        // Es el aviso que más nos ha costado: en una sustitución de generador la
        // envolvente no se toca, así que la demanda de calefacción no puede moverse.
        subtitulo: /RES060|RES093|TER100/i.test(String(exp?.numero_expediente || ''))
            ? 'La demanda de calefacción del CEE final tiene que salir IGUAL: la actuación no toca la envolvente.'
            : null,
        campos: refCampos,
    });

    return { secciones, ce3x: d };
}
