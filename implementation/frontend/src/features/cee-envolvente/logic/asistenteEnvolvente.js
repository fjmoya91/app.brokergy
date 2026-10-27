/**
 * El ASISTENTE de la envolvente — lo que hace el NAVEGADOR (puro, sin React).
 *
 * Tres pasos, y Claude solo está en el del medio:
 *
 *   1. `resumenCompacto` — el plano en pocas líneas, con los nombres que la
 *      persona ve en pantalla (FBE1, V3, Z1, los ids de las medidas). Es lo
 *      ÚNICO que viaja a Claude: el trabajo entero son cientos de miles de
 *      tokens; esto, uno o dos mil.
 *   2. El backend le pasa el resumen y lo dicho a Claude, que devuelve
 *      OPERACIONES (`services/asistenteEnvolvente.js`).
 *   3. `validarOperaciones` — casa cada nombre con su pared, hueco, zona o
 *      medida de VERDAD y escribe en palabras lo que va a cambiar («V3: FBE1 →
 *      FBE3 · marco Metálico sin RPT → PVC»). Lo que no casa NO se aplica: se
 *      dice. Con el «Sí», `transformarMuros` / `zonasAjustadas` /
 *      `medidasCambiadas` lo aplican con las mismas reglas que los botones
 *      (`mudarHueco`, la carpintería de `ponCarpinteria`, `reclasifica`…).
 *
 * Nada de aquí escribe: devuelve el estado nuevo y lo pone la ventana.
 */
import { MARCOS, VIDRIOS, carpinteriaDe, leerPorcMarco, rotuloMarco, rotuloVidrio } from './ventanasVivienda.js';
import { mudarHueco } from './huecosEnParedes.js';
import { direccionDominante } from './pizarra.js';
import { tipoDe, admiteHuecos, esFuera } from './tiposPared.js';
import { nombreDe, rumboDe, nuevoUid, inicialDe } from './senalado.js';
import { RUMBOS } from './geometriaPlano.js';
import { ETIQUETA_USO_ZONA } from './zonasFuera.js';

//: Lo que le falta a una zona hasta el borde por debajo de esto es el grosor del
//: trazo, no un trozo de planta.
const HOLGURA_RUIDO_M = 0.5;

const f1 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '?');
const f2 = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '?');
const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => sinTildes(s).toUpperCase().replace(/[\s_\-.]+/g, '');

//: Lo que se puede decir de una pared. «A un local» es la partición con espacio
//: no habitable (el garaje).
const TIPOS = { FACHADA: 'FACHADA', EXTERIOR: 'FACHADA', MEDIANERA: 'MEDIANERA', VECINO: 'MEDIANERA',
                PARTICION: 'PARTICION_VERTICAL', PARTICIONVERTICAL: 'PARTICION_VERTICAL',
                LOCAL: 'PARTICION_VERTICAL' };
const ROTULO_TIPO = { FACHADA: 'al exterior', MEDIANERA: 'al vecino', PARTICION_VERTICAL: 'a un local' };

//: Cómo se DICE un marco o un vidrio. El dictado escribe «PC» por PVC.
const ALIAS_MARCO = { PVC: 'PVC', PC: 'PVC', PCE: 'PVC', PEPEC: 'PVC', PECE: 'PVC', MADERA: 'Madera',
                      ALUMINIO: 'Metálico sin RPT', METALICO: 'Metálico sin RPT',
                      METALICOSINRPT: 'Metálico sin RPT', ALUMINIOSINRPT: 'Metálico sin RPT',
                      METALICOCONRPT: 'Metálico con RPT', ALUMINIOCONRPT: 'Metálico con RPT',
                      RPT: 'Metálico con RPT', ROTURA: 'Metálico con RPT' };
const ALIAS_VIDRIO = { SIMPLE: 'Simple', DOBLE: 'Doble', CLIMALIT: 'Doble',
                       DOBLEBAJOEMISIVO: 'Doble bajo emisivo', BAJOEMISIVO: 'Doble bajo emisivo' };

function marcoDe(x) {
    if (!x) return null;
    const n = norm(x);
    return MARCOS.find(m => norm(m.id) === n || norm(m.rotulo) === n)?.id || ALIAS_MARCO[n] || null;
}
function vidrioDe(x) {
    if (!x) return null;
    const n = norm(x);
    return VIDRIOS.find(v => norm(v.id) === n || norm(v.rotulo) === n)?.id || ALIAS_VIDRIO[n] || null;
}

// ─── 1. El RESUMEN ────────────────────────────────────────────────────────────

/** Las plantas del plano con su etiqueta corta (P0, P1…), de abajo arriba. */
export function etiquetasPlantas(plantas) {
    return [...(plantas || [])]
        .sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0))
        .map((p, i) => ({ id: p.id, nivel: p.nivel, nombre: p.nombre || `Planta ${p.nivel}`,
                          etiqueta: `P${i}`, muros: p.muros || [] }));
}

/**
 * El sistema de ejes del EDIFICIO en una planta (las casas van a escuadra) y lo
 * que ocupa: la caja de sus paredes en esos ejes. Cada lado de la caja lleva el
 * rumbo al que da (N, S, E, O), que es como lo dice una persona.
 */
function marcoDePlanta(murosPlanta) {
    const d = direccionDominante(murosPlanta);
    const c = Math.cos(d), s = Math.sin(d);
    const aU = (x, y) => x * c + y * s;
    const aV = (x, y) => -x * s + y * c;
    let caja = null;
    for (const m of murosPlanta || []) {
        for (const [x, y] of m.svg || []) caja = crece(caja, aU(x, y), aV(x, y));
    }
    // El lienzo va con la Y hacia ABAJO (sur): el norte es -y.
    const rumbo = (vx, vy) => {
        const az = ((Math.atan2(vx, -vy) * 180) / Math.PI + 360) % 360;
        return ['N', 'E', 'S', 'O'][Math.round(az / 90) % 4];
    };
    const lados = { umax: rumbo(c, s), umin: rumbo(-c, -s), vmax: rumbo(-s, c), vmin: rumbo(s, -c) };
    return { d, c, s, aU, aV, caja, lados,
             deUV: (u, v) => [u * c - v * s, u * s + v * c] };
}

function crece(caja, u, v) {
    if (!caja) return { umin: u, umax: u, vmin: v, vmax: v };
    return { umin: Math.min(caja.umin, u), umax: Math.max(caja.umax, u),
             vmin: Math.min(caja.vmin, v), vmax: Math.max(caja.vmax, v) };
}

/** Del mundo (EPSG:25830) al lienzo de ahora, y al revés. `t` = `lienzoAMundo(georef)`. */
const alLienzo = (t) => ([X, Y]) => [X - t.dx, t.y0 - Y];
const alMundo = (t) => ([x, y]) => [Math.round((x + t.dx) * 100) / 100, Math.round((t.y0 - y) * 100) / 100];

/** Lo que le FALTA a cada lado de una zona para llegar al borde de su planta, por rumbo. */
export function holgurasDeZona(zona, murosPlanta, t) {
    if (!t || !(zona?.poligono || []).length) return null;
    const mp = marcoDePlanta(murosPlanta);
    if (!mp.caja) return null;
    let cz = null;
    for (const p of zona.poligono.map(alLienzo(t))) cz = crece(cz, mp.aU(...p), mp.aV(...p));
    const falta = {
        [mp.lados.umax]: mp.caja.umax - cz.umax, [mp.lados.umin]: cz.umin - mp.caja.umin,
        [mp.lados.vmax]: mp.caja.vmax - cz.vmax, [mp.lados.vmin]: cz.vmin - mp.caja.vmin,
    };
    return { mp, cz, falta };
}

function textoHueco(h, defecto) {
    const c = carpinteriaDe(h, defecto);
    const partes = [c.marco];
    if (!c.opaca) partes.push(c.vidrio);
    if (c.persiana) partes.push('persiana');
    if (h.cambia) partes.push('CAMBIA');
    const medida = `${f2(h.ancho)}×${f2(h.alto)}${h.estado !== 'medido' ? '?' : ''}`;
    return `${h.nombre} ${h.tipo === 'puerta' ? 'puerta' : 'ventana'} ${medida} ${partes.join('/')}`
        + (c.porcPropio ? ` marco${c.porc_marco}%` : '');
}

/**
 * El plano en pocas líneas. `?` detrás de una medida = sin confirmar.
 *
 * `ctx`: { plantas (las de `usePlanoEnvolvente`), muros, zonas (`zonasFuera`),
 * t (`lienzoAMundo(georef)`), catalogo (`ficha.medidas`), elegidas, fase,
 * defecto (`huecosDefecto(ajustes)`) }.
 */
export function resumenCompacto(ctx) {
    const { plantas, muros = {}, zonas = [], t, catalogo = [], elegidas = null,
            fase = 'inicial', defecto } = ctx || {};
    const pls = etiquetasPlantas(plantas);
    const lineas = [];
    lineas.push(`PLANTAS: ${pls.map(p => `${p.etiqueta} «${p.nombre}»`).join(' · ') || '—'}`);
    lineas.push('PAREDES (nombre tipo rumbo largo planta: huecos; ? = medida sin confirmar)');
    for (const p of pls) {
        for (const base of p.muros) {
            const m = muros[base.id] || base;
            const huecos = (m.huecos || []).map(h => textoHueco(h, defecto));
            lineas.push(`${nombreDe(m)} ${tipoDe(m) || '?'} ${rumboDe(m) || '—'} ${f2(m.largo)}m ${p.etiqueta}`
                + `${esFuera(m) ? ' apartada' : ''}${m.cambia ? ' CAMBIA' : ''}`
                + `: ${huecos.length ? huecos.join('; ') : '—'}`);
        }
    }
    lineas.push('ZONAS (lo que no es vivienda dentro de una planta)');
    if (!zonas.length) lineas.push('— ninguna');
    zonas.forEach((z, i) => {
        const pl = pls.find(p => p.id === z.planta) || pls.find(p => p.nivel === z.nivel);
        const hz = holgurasDeZona(z, pl?.muros || [], t);
        // Menos de medio metro es el trazo, no un hueco: se dice 0 (si no,
        // «hasta el final» se pregunta por un lado al que le faltan 0,3 m).
        const falta = hz ? Object.entries(hz.falta).map(([k, v]) => `${k} ${f1(v < HOLGURA_RUIDO_M ? 0 : v)} m`).join(' · ') : '?';
        const caja = hz ? `${f1(hz.cz.umax - hz.cz.umin)}×${f1(hz.cz.vmax - hz.cz.vmin)}` : '?';
        lineas.push(`Z${i + 1} ${z.uso} ${pl?.etiqueta || `nivel ${z.nivel}`} ${f1(z.area_m2)}m² caja ${caja} m`
            + ` · le falta hasta el borde de la planta: ${falta}`);
    });
    lineas.push(`MEDIDAS DE MEJORA (fase ${fase}; [x] puesta, [ ] no)`);
    const marcadas = elegidas || catalogo.filter(m => m.porDefecto).map(m => m.id);
    for (const m of catalogo) {
        lineas.push(`${m.disponible === false ? '(no disponible)' : marcadas.includes(m.id) ? '[x]' : '[ ]'}`
            + ` ${m.id} «${m.titulo}»${m.disponible === false && m.motivo ? `: ${m.motivo}` : ''}`);
    }
    if (!catalogo.length) lineas.push('— sin catálogo todavía');
    lineas.push(`VALORES: marco = ${MARCOS.map(m => m.id).join(' | ')} · vidrio = ${VIDRIOS.map(v => v.id).join(' | ')}`
        + ` · rumbo = ${RUMBOS.join(' ')} · tipo de pared = FACHADA | MEDIANERA | PARTICION`);
    // La que tiene abierta: «esta pared», «aquí».
    if (ctx.sel && muros[ctx.sel]) lineas.push(`PARED SELECCIONADA: ${nombreDe(muros[ctx.sel])}`);
    return lineas.join('\n');
}

/**
 * Frases de EJEMPLO para el panel, hechas con los nombres de ESTE plano: quien
 * no sabe qué se le puede decir pulsa una, la retoca y le da a «Ver». Si hay una
 * pared abierta, hablan de ella.
 */
export function ejemplosPara(ctx) {
    const { muros = {}, zonas = [], sel, catalogo = [], elegidas = null } = ctx || {};
    const m = sel ? muros[sel] : null;
    const out = [];
    if (m) {
        const n = nombreDe(m);
        if ((m.huecos || []).some(h => h.tipo === 'ventana')) out.push(`Las ventanas de ${n} son de PVC con persiana`);
        else if (admiteHuecos(m) && Number(m.largo) >= 2) out.push(`En ${n} falta una ventana de 1,20 × 1,10`);
        out.push(tipoDe(m) === 'FACHADA' ? `${n} da al vecino: es medianera` : `${n} da a la cochera, sin calefacción`);
    } else {
        const con = Object.values(muros).find(x => (x.huecos || []).some(h => h.tipo === 'ventana'));
        const v = con?.huecos.find(h => h.tipo === 'ventana');
        const otra = Object.values(muros).find(x => x !== con && admiteHuecos(x));
        if (v && otra) out.push(`La ${v.nombre} no va en ${nombreDe(con)} sino en ${nombreDe(otra)}, y es de PVC`);
    }
    const z = zonas[0];
    out.push(z ? `El ${String(ETIQUETA_USO_ZONA[z.uso] || z.uso).toLowerCase()} llega hasta el fondo de la casa`
               : 'Hay un garaje en la planta baja, pegado al sur, de 5 m de fondo');
    const puestas = elegidas || catalogo.filter(x => x.porDefecto).map(x => x.id);
    const falta = catalogo.find(x => x.disponible !== false && !puestas.includes(x.id));
    if (falta) out.push(`Pon también la medida de ${String(falta.titulo).toLowerCase()}`);
    return out.slice(0, 4);
}

// ─── 2. VALIDAR: de nombres a cosas, y en palabras ────────────────────────────

/** Busca una pared por como la dicen. Exacto, o la única que encaja «FB3» ≈ FBE3. */
function buscaPared(muros, dicho) {
    const n = norm(dicho);
    if (!n) return { error: 'falta la pared' };
    const todos = Object.values(muros || {});
    const exacta = todos.filter(m => norm(nombreDe(m)) === n || norm(m.id) === n);
    if (exacta.length === 1) return { m: exacta[0] };
    // «FB3» → empieza por FB y acaba en 3 (FBE3, FBS3…).
    const r = /^([A-Z]+?)(\d+)$/.exec(n);
    if (r) {
        const parecidas = todos.filter((m) => {
            const k = norm(nombreDe(m));
            return k.startsWith(r[1]) && k.endsWith(r[2]) && /^[A-Z]+\d+$/.test(k)
                && k.replace(/\d+$/, '').length <= r[1].length + 1;
        });
        if (parecidas.length === 1) return { m: parecidas[0], aprox: true };
        if (parecidas.length > 1) {
            return { error: `«${dicho}» puede ser ${parecidas.map(nombreDe).join(' o ')}` };
        }
    }
    return { error: `no hay ninguna pared «${dicho}»` };
}

/**
 * Las paredes que la persona ha DICHO de forma que encajan con dos o más
 * («FB1» con FBE1 y FBO1). El modelo a veces elige una sin preguntar: aquí se
 * dice cuál ha elegido, para que se vea antes del «Sí». Lista de textos.
 */
export function paredesAmbiguas(texto, muros) {
    const avisos = [];
    const vistos = new Set();
    for (const t of String(texto || '').toUpperCase().match(/\b[A-Z]{1,4}\s?\d{1,2}\b/g) || []) {
        const dicho = t.replace(/\s/g, '');
        if (vistos.has(dicho) || /^[VPZ]\d/.test(dicho)) continue;   // huecos y zonas, no
        vistos.add(dicho);
        const r = buscaPared(muros, dicho);
        if (r.error && /puede ser/.test(r.error)) avisos.push(`Has dicho «${dicho}»: ${r.error.replace(/^«[^»]+» /, '')}. Mira que sea la que querías.`);
    }
    return avisos;
}

function buscaHueco(muros, dicho) {
    const n = norm(dicho);
    const hallados = [];
    for (const m of Object.values(muros || {})) {
        (m.huecos || []).forEach((h, i) => { if (norm(h.nombre) === n) hallados.push({ m, i, h }); });
    }
    if (hallados.length === 1) return hallados[0];
    if (hallados.length > 1) return { error: `hay ${hallados.length} huecos «${dicho}»` };
    return { error: `no hay ningún hueco «${dicho}»` };
}

const numero = (x, min, max) => (Number.isFinite(Number(x)) && Number(x) > min && Number(x) <= max ? Number(x) : null);

/**
 * Casa las operaciones con el plano. Devuelve
 *   { pasos: [{ op, texto, ... resuelto }], errores: [texto] }
 * Solo lo que casa entra en `pasos`; el resto va a `errores` y no se aplica.
 */
export function validarOperaciones(operaciones, ctx) {
    const { muros = {}, zonas = [], catalogo = [], elegidas = null, defecto, plantas } = ctx || {};
    const pasos = [];
    const errores = [];
    //: Lo que se aplica pero conviene mirar antes del «Sí».
    const avisos = [];
    // Se valida sobre una COPIA que va avanzando: «mueve la V3 a la FBE3 y ponle
    // PVC» son dos pasos sobre el mismo hueco, y el segundo lo busca donde lo
    // ha dejado el primero.
    let mapa = muros;
    const pls = etiquetasPlantas(plantas);
    const marcadas = new Set(elegidas || catalogo.filter(m => m.porDefecto).map(m => m.id));

    for (const op of operaciones || []) {
        switch (op.op) {
        case 'mover_hueco': {
            const h = buscaHueco(mapa, op.hueco);
            const d = buscaPared(mapa, op.pared);
            if (h.error || d.error) { errores.push(`Mover ${op.hueco || '?'}: ${h.error || d.error}.`); break; }
            if (h.m.id === d.m.id) { errores.push(`${h.h.nombre} ya está en ${nombreDe(d.m)}.`); break; }
            if (!admiteHuecos(d.m)) {
                errores.push(`${nombreDe(d.m)} no da al exterior (${ROTULO_TIPO[tipoDe(d.m)] || tipoDe(d.m)}): no admite ventanas.`);
                break;
            }
            pasos.push({ op: 'mover_hueco', origen: h.m.id, uid: h.h.uid, destino: d.m.id,
                         texto: `${h.h.nombre}: ${nombreDe(h.m)} → ${nombreDe(d.m)}${d.aprox ? ` (has dicho «${op.pared}»)` : ''}` });
            mapa = mudarHueco(mapa, h.m.id, h.i, d.m.id);
            noCabe(mapa, d.m.id, avisos);
            break;
        }
        case 'cambiar_hueco': {
            const h = buscaHueco(mapa, op.hueco);
            if (h.error) { errores.push(`Cambiar ${op.hueco || '?'}: ${h.error}.`); break; }
            const antes = carpinteriaDe(h.h, defecto);
            const cambios = {};
            const partes = [];
            if (op.marco) {
                const mc = marcoDe(op.marco);
                if (!mc) errores.push(`${h.h.nombre}: no conozco el marco «${op.marco}».`);
                else if (mc !== antes.marco) { cambios.marco = mc; partes.push(`marco ${rotuloMarco(antes.marco)} → ${rotuloMarco(mc)}`); }
            }
            if (op.vidrio) {
                const vd = vidrioDe(op.vidrio);
                if (!vd) errores.push(`${h.h.nombre}: no conozco el vidrio «${op.vidrio}».`);
                else if (vd !== antes.vidrio) { cambios.vidrio = vd; partes.push(`vidrio ${rotuloVidrio(antes.vidrio)} → ${rotuloVidrio(vd)}`); }
            }
            if (typeof op.persiana === 'boolean' && op.persiana !== antes.persiana) {
                cambios.persiana = op.persiana; partes.push(op.persiana ? 'con persiana' : 'sin persiana');
            }
            if (typeof op.cambia === 'boolean' && op.cambia !== !!h.h.cambia) {
                cambios.cambia = op.cambia; partes.push(op.cambia ? 'se sustituye (CAMBIA)' : 'no se sustituye');
            }
            const ancho = op.ancho !== undefined ? numero(op.ancho, 0, 20) : undefined;
            const alto = op.alto !== undefined ? numero(op.alto, 0, 10) : undefined;
            if (ancho === null || alto === null) errores.push(`${h.h.nombre}: la medida no es válida.`);
            if (ancho && ancho !== Number(h.h.ancho)) { cambios.ancho = ancho; partes.push(`ancho ${f2(h.h.ancho)} → ${f2(ancho)} m`); }
            if (alto && alto !== Number(h.h.alto)) { cambios.alto = alto; partes.push(`alto ${f2(h.h.alto)} → ${f2(alto)} m`); }
            if (op.porc_marco !== undefined) {
                const pm = leerPorcMarco(op.porc_marco);
                if (pm === null) errores.push(`${h.h.nombre}: el % de marco no es válido.`);
                else if (pm !== antes.porc_marco) { cambios.porc_marco = pm; partes.push(`marco ${antes.porc_marco} % → ${pm} %`); }
            }
            if (op.tipo && ['ventana', 'puerta'].includes(String(op.tipo).toLowerCase())
                && String(op.tipo).toLowerCase() !== h.h.tipo) {
                cambios.tipo = String(op.tipo).toLowerCase(); partes.push(`${h.h.tipo} → ${cambios.tipo}`);
            }
            if (!partes.length) { errores.push(`${h.h.nombre}: ya está así, no cambia nada.`); break; }
            pasos.push({ op: 'cambiar_hueco', pared: h.m.id, uid: h.h.uid, cambios,
                         texto: `${h.h.nombre} (${nombreDe(h.m)}): ${partes.join(' · ')}` });
            mapa = { ...mapa, [h.m.id]: { ...h.m, huecos: h.m.huecos.map(x => (x.uid === h.h.uid ? { ...x, ...cambios } : x)) } };
            if (cambios.ancho) noCabe(mapa, h.m.id, avisos);
            break;
        }
        case 'anadir_hueco': {
            const d = buscaPared(mapa, op.pared);
            if (d.error) { errores.push(`Añadir: ${d.error}.`); break; }
            if (!admiteHuecos(d.m)) { errores.push(`${nombreDe(d.m)} no da al exterior: no admite ventanas.`); break; }
            const tipo = String(op.tipo || 'ventana').toLowerCase() === 'puerta' ? 'puerta' : 'ventana';
            const ancho = numero(op.ancho, 0, 20);
            const alto = numero(op.alto, 0, 10);
            const marco = marcoDe(op.marco);
            const vidrio = vidrioDe(op.vidrio);
            const nombre = nombreLibre(mapa, tipo === 'puerta' ? 'P' : 'V');
            const hueco = {
                uid: nuevoUid(), nombre, tipo,
                ancho: ancho ?? (tipo === 'puerta' ? 0.9 : 1.3), alto: alto ?? (tipo === 'puerta' ? 2.1 : 1.3),
                estado: ancho && alto ? 'medido' : 'dudoso',
                por_que: ancho && alto ? 'dicho al asistente' : 'añadido por el asistente: falta la medida real',
                ...(marco ? { marco } : {}), ...(vidrio ? { vidrio } : {}),
                ...(typeof op.persiana === 'boolean' ? { persiana: op.persiana } : {}),
                ...(leerPorcMarco(op.porc_marco) !== null ? { porc_marco: leerPorcMarco(op.porc_marco) } : {}),
            };
            pasos.push({ op: 'anadir_hueco', pared: d.m.id, hueco,
                         texto: `Nueva ${tipo} ${nombre} en ${nombreDe(d.m)}: ${f2(hueco.ancho)}×${f2(hueco.alto)} m`
                             + `${hueco.estado === 'dudoso' ? ' (medida por confirmar)' : ''}`
                             + `${marco ? ` · ${rotuloMarco(marco)}` : ''}${vidrio ? ` · ${rotuloVidrio(vidrio)}` : ''}` });
            mapa = { ...mapa, [d.m.id]: { ...d.m, huecos: [...(d.m.huecos || []), hueco] } };
            noCabe(mapa, d.m.id, avisos);
            break;
        }
        case 'quitar_hueco': {
            const h = buscaHueco(mapa, op.hueco);
            if (h.error) { errores.push(`Quitar ${op.hueco || '?'}: ${h.error}.`); break; }
            pasos.push({ op: 'quitar_hueco', pared: h.m.id, uid: h.h.uid,
                         texto: `Quitar ${h.h.nombre} de ${nombreDe(h.m)}` });
            mapa = { ...mapa, [h.m.id]: { ...h.m, huecos: h.m.huecos.filter(x => x.uid !== h.h.uid) } };
            break;
        }
        case 'cambiar_pared': {
            const d = buscaPared(mapa, op.pared);
            if (d.error) { errores.push(`Pared: ${d.error}.`); break; }
            const m = d.m;
            const cambios = {};
            const partes = [];
            if (op.tipo) {
                const t = TIPOS[norm(op.tipo)];
                if (!t) errores.push(`${nombreDe(m)}: no sé qué es «${op.tipo}».`);
                else if (t !== tipoDe(m)) {
                    cambios.tipo = t; partes.push(`${ROTULO_TIPO[tipoDe(m)] || tipoDe(m)} → ${ROTULO_TIPO[t]}`);
                    if (t !== 'FACHADA' && (m.huecos || []).length) {
                        errores.push(`${nombreDe(m)} tiene ${m.huecos.length} hueco(s): al dejar de dar al exterior hay que moverlos o quitarlos.`);
                    }
                }
            }
            if (op.rumbo) {
                const r = norm(op.rumbo).replace(/^W/, 'O');
                if (!RUMBOS.includes(r)) errores.push(`${nombreDe(m)}: «${op.rumbo}» no es un rumbo.`);
                else if (r !== rumboDe(m)) { cambios.rumbo = r; partes.push(`da al ${r}`); }
            }
            if (typeof op.apartar === 'boolean' && op.apartar !== !!m.excluida) {
                cambios.apartar = op.apartar; partes.push(op.apartar ? 'se aparta de la envolvente' : 'vuelve a la envolvente');
            }
            if (op.u !== undefined) {
                const u = numero(op.u, 0, 10);
                if (u === null) errores.push(`${nombreDe(m)}: la U no es válida.`);
                else { cambios.u = u; partes.push(`U = ${f2(u)} W/m²K`); }
            }
            if (typeof op.cambia === 'boolean' && op.cambia !== !!m.cambia) {
                cambios.cambia = op.cambia; partes.push(op.cambia ? 'se reforma (CAMBIA)' : 'no se reforma');
            }
            if (!partes.length) break;
            const pasaAFachadaSinRumbo = cambios.tipo === 'FACHADA' && !rumboDe(m) && !cambios.rumbo;
            if (pasaAFachadaSinRumbo) errores.push(`${nombreDe(m)}: al pasarla al exterior hay que decir hacia dónde da.`);
            pasos.push({ op: 'cambiar_pared', pared: m.id, cambios, texto: `${nombreDe(m)}: ${partes.join(' · ')}` });
            break;
        }
        case 'ajustar_zona': {
            const k = Number(String(op.zona || '').replace(/\D/g, '')) - 1;
            const z = zonas[k];
            if (!z) { errores.push(`No hay ninguna zona «${op.zona}».`); break; }
            const pl = pls.find(p => p.id === z.planta) || pls.find(p => p.nivel === z.nivel);
            const hz = holgurasDeZona(z, pl?.muros || [], ctx.t);
            if (!hz) { errores.push(`Z${k + 1}: no se puede situar (falta la georreferencia del plano).`); break; }
            const lado = Object.entries(hz.mp.lados).find(([, r]) => r === op.lado)?.[0];
            if (!lado) { errores.push(`Z${k + 1}: «${op.lado}» no es un lado de la planta.`); break; }
            const caja = { ...hz.cz };
            const signo = lado.endsWith('max') ? 1 : -1;
            const eje = lado.slice(0, 1);
            if (op.hasta_borde) caja[lado] = hz.mp.caja[lado];
            else if (Number.isFinite(Number(op.metros)) && Number(op.metros) !== 0) caja[lado] += signo * Number(op.metros);
            else { errores.push(`Z${k + 1}: falta hasta dónde (hasta el borde o cuántos metros).`); break; }
            if (caja[`${eje}max`] - caja[`${eje}min`] < 0.5) { errores.push(`Z${k + 1}: se quedaría sin ancho.`); break; }
            const antes = (hz.cz.umax - hz.cz.umin) * (hz.cz.vmax - hz.cz.vmin);
            const despues = (caja.umax - caja.umin) * (caja.vmax - caja.vmin);
            // Una zona dibujada que no era un rectángulo se rehace como su caja.
            const eraRect = Math.abs(areaMundo(z.poligono) - antes) <= 0.03 * antes;
            const rect = [[caja.umin, caja.vmin], [caja.umax, caja.vmin], [caja.umax, caja.vmax], [caja.umin, caja.vmax]]
                .map(([u, v]) => alMundo(ctx.t)(hz.mp.deUV(u, v)));
            const tragadas = paredesDentro(pl?.muros || [], mapa, hz.mp, caja);
            if (tragadas.length) avisos.push(`Z${k + 1} quedaría encima de ${tragadas.join(', ')}: al volver a medir esos huecos se quedan sin pared.`);
            pasos.push({ op: 'ajustar_zona', indice: k,
                         zona: { ...z, poligono: rect, area_m2: Math.round(despues * 10) / 10 },
                         texto: `Z${k + 1} ${ETIQUETA_USO_ZONA[z.uso] || z.uso} (${pl?.nombre || ''}): por el ${op.lado} `
                             + (op.hasta_borde ? 'hasta el borde de la planta' : `${Number(op.metros) > 0 ? '+' : ''}${f1(op.metros)} m`)
                             + ` · caja ${f1(antes)} → ${f1(despues)} m² (los m² de verdad los pone el motor al volver a medir)`
                             + (eraRect ? '' : ' · se rehace como rectángulo') });
            break;
        }
        case 'nueva_zona': {
            const n = norm(op.planta);
            const pl = pls.find(p => norm(p.etiqueta) === n || norm(p.nombre) === n)
                || (pls.length === 1 ? pls[0] : null);
            if (!pl) { errores.push(`Nueva zona: no sé en qué planta («${op.planta || '?'}»).`); break; }
            const mp = marcoDePlanta(pl.muros);
            const lado = Object.entries(mp.lados).find(([, r]) => r === op.lado)?.[0];
            const fondo = numero(op.fondo, 0.5, 100);
            if (!mp.caja || !ctx.t) { errores.push('Nueva zona: falta la georreferencia del plano.'); break; }
            if (!lado) { errores.push(`Nueva zona: «${op.lado}» no es un lado de la planta.`); break; }
            if (!fondo) { errores.push('Nueva zona: falta el fondo en metros.'); break; }
            const caja = { ...mp.caja };
            const eje = lado.slice(0, 1);
            if (lado.endsWith('max')) caja[`${eje}min`] = caja[lado] - fondo;
            else caja[`${eje}max`] = caja[lado] + fondo;
            if (caja[`${eje}max`] - caja[`${eje}min`] >= mp.caja[`${eje}max`] - mp.caja[`${eje}min`] - 0.5) {
                errores.push(`Nueva zona: con ${f1(fondo)} m ocuparía la planta entera.`); break;
            }
            const uso = ['GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE', 'PORCHE'].includes(op.uso) ? op.uso : 'GARAJE';
            const area = (caja.umax - caja.umin) * (caja.vmax - caja.vmin);
            const rect = [[caja.umin, caja.vmin], [caja.umax, caja.vmin], [caja.umax, caja.vmax], [caja.umin, caja.vmax]]
                .map(([u, v]) => alMundo(ctx.t)(mp.deUV(u, v)));
            const tragadas = paredesDentro(pl.muros, mapa, mp, caja);
            if (tragadas.length) avisos.push(`La zona nueva quedaría encima de ${tragadas.join(', ')}: al volver a medir esos huecos se quedan sin pared.`);
            pasos.push({ op: 'nueva_zona', zona: { nivel: pl.nivel, planta: pl.id, uso, poligono: rect,
                                                   area_m2: Math.round(area * 10) / 10 },
                         texto: `${ETIQUETA_USO_ZONA[uso] || uso} nuevo en ${pl.nombre}: pegado al ${op.lado}, `
                             + `${f1(fondo)} m de fondo y todo el ancho (≈ ${f1(area)} m²; los m² los pone el motor)` });
            break;
        }
        case 'quitar_zona': {
            const k = Number(String(op.zona || '').replace(/\D/g, '')) - 1;
            const z = zonas[k];
            if (!z) { errores.push(`No hay ninguna zona «${op.zona}».`); break; }
            pasos.push({ op: 'quitar_zona', indice: k,
                         texto: `Quitar Z${k + 1} ${ETIQUETA_USO_ZONA[z.uso] || z.uso}: vuelve a contar como vivienda` });
            break;
        }
        case 'medidas': {
            const poner = (op.poner || []).filter(Boolean);
            const quitar = (op.quitar || []).filter(Boolean);
            const partes = [];
            const ids = new Set(marcadas);
            for (const id of poner) {
                const m = catalogo.find(x => x.id === id);
                if (!m) { errores.push(`No hay ninguna medida «${id}».`); continue; }
                if (m.disponible === false) { errores.push(`«${m.titulo}» no se puede poner: ${m.motivo || 'no procede'}.`); continue; }
                if (!ids.has(id)) { ids.add(id); partes.push(`+ ${m.titulo}`); }
            }
            for (const id of quitar) {
                const m = catalogo.find(x => x.id === id);
                if (!m) { errores.push(`No hay ninguna medida «${id}».`); continue; }
                if (ids.delete(id)) partes.push(`− ${m.titulo}`);
            }
            if (!partes.length) break;
            pasos.push({ op: 'medidas', fase: op.fase || ctx.fase || 'inicial', elegidas: [...ids],
                         texto: `Medidas de mejora (${op.fase || ctx.fase || 'inicial'}): ${partes.join(' · ')}` });
            marcadas.clear(); for (const id of ids) marcadas.add(id);
            break;
        }
        default:
            errores.push(`No sé hacer «${op.op}».`);
        }
    }
    return { pasos, errores, avisos };
}

/** Si los huecos de una pared ya no caben a lo largo de ella, se dice (no se impide: el largo puede estar mal). */
function noCabe(mapa, id, avisos) {
    const m = mapa[id];
    const largo = Number(m?.largo);
    if (!(largo > 0)) return;
    const suma = (m.huecos || []).reduce((a, h) => a + (Number(h.ancho) || 0) * (Number(h.multiplicador) || 1), 0);
    if (suma > largo + 0.05) avisos.push(`${nombreDe(m)} mide ${f2(largo)} m y sus huecos sumarían ${f2(suma)} m de ancho: no caben. Mira que sea esa pared.`);
}

/**
 * Las paredes CON HUECOS que quedarían dentro de una caja (u, v) de la planta, o
 * en su borde:
 * al volver a medir con la zona, el motor las quita y sus huecos se quedan sin
 * pared. Se dice antes del «Sí», no después.
 */
function paredesDentro(murosPlanta, mapa, mp, caja, tol = 0.3) {
    // Con el BORDE: una fachada sobre la que se apoya la zona pasa a ser suya.
    const dentro = (u, v) => u >= caja.umin - tol && u <= caja.umax + tol && v >= caja.vmin - tol && v <= caja.vmax + tol;
    return (murosPlanta || [])
        .filter(b => (b.svg || []).length && b.svg.every(([x, y]) => dentro(mp.aU(x, y), mp.aV(x, y))))
        .map(b => mapa[b.id] || b)
        .filter(m => (m.huecos || []).length)
        .map(m => `${nombreDe(m)} (${m.huecos.length} hueco${m.huecos.length > 1 ? 's' : ''})`);
}

function areaMundo(pts) {
    let a = 0;
    for (let i = 0; i < (pts || []).length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
}

function nombreLibre(muros, letra) {
    const usados = new Set(Object.values(muros || {}).flatMap(m => (m.huecos || []).map(h => h.nombre)));
    let n = 1;
    while (usados.has(`${letra}${n}`)) n++;
    return `${letra}${n}`;
}

// ─── 3. APLICAR (con el «Sí») ─────────────────────────────────────────────────

/**
 * El mapa de muros con los pasos de huecos y paredes aplicados, EN ORDEN. Se
 * busca cada hueco por su `uid`, nunca por el índice: un paso anterior lo puede
 * haber movido. Las mismas reglas que los botones: `mudarHueco` para mudar,
 * la carpintería como `ponCarpinteria` («no cambia» = sin la clave), tocar una
 * medida la CONFIRMA, y reclasificar no pisa un nombre puesto a mano.
 */
export function transformarMuros(muros, pasos) {
    let v = muros;
    for (const p of pasos || []) {
        if (p.op === 'mover_hueco') {
            const i = (v[p.origen]?.huecos || []).findIndex(h => h.uid === p.uid);
            if (i >= 0) v = mudarHueco(v, p.origen, i, p.destino);
            continue;
        }
        if (p.op === 'cambiar_hueco') {
            const m = Object.values(v).find(x => (x.huecos || []).some(h => h.uid === p.uid));
            if (!m) continue;
            v = { ...v, [m.id]: { ...m, huecos: m.huecos.map((h) => {
                if (h.uid !== p.uid) return h;
                const n = { ...h };
                for (const [k, x] of Object.entries(p.cambios)) {
                    if (k === 'cambia' && !x) delete n.cambia; else n[k] = x;
                }
                if ('ancho' in p.cambios || 'alto' in p.cambios) {
                    n.estado = 'medido'; n.por_que = 'dicho al asistente';
                }
                return n;
            }) } };
            continue;
        }
        if (p.op === 'anadir_hueco') {
            const m = v[p.pared];
            if (m) v = { ...v, [p.pared]: { ...m, huecos: [...(m.huecos || []), p.hueco] } };
            continue;
        }
        if (p.op === 'quitar_hueco') {
            const m = Object.values(v).find(x => (x.huecos || []).some(h => h.uid === p.uid));
            if (m) v = { ...v, [m.id]: { ...m, huecos: m.huecos.filter(h => h.uid !== p.uid) } };
            continue;
        }
        if (p.op === 'cambiar_pared') {
            const m = v[p.pared];
            if (!m) continue;
            const n = { ...m };
            const c = p.cambios;
            if (c.tipo) {
                // Como `reclasifica`: el nombre cambia de inicial (FBE1 → PBE1)
                // salvo que alguien le pusiera uno a mano.
                const tipoManual = c.tipo === m.tipo ? null : c.tipo;
                n.tipo_manual = tipoManual;
                const auto = inicialDe(m.id, tipoManual || m.tipo);
                const suyo = m.nombre_manual && m.nombre_manual !== inicialDe(m.id, tipoDe(m));
                n.nombre_manual = suyo ? m.nombre_manual : (auto === m.id ? null : auto);
            }
            if (c.rumbo) n.orientacion_manual = c.rumbo;
            if ('apartar' in c) n.excluida = !!c.apartar;
            if ('u' in c) n.u_manual = c.u;
            if ('cambia' in c) n.cambia = !!c.cambia;
            v = { ...v, [p.pared]: n };
        }
    }
    return v;
}

/** Las zonas con los ajustes puestos, o `null` si ningún paso toca zonas. */
export function zonasAjustadas(zonas, pasos) {
    const de = (pasos || []).filter(p => ['ajustar_zona', 'nueva_zona', 'quitar_zona'].includes(p.op));
    if (!de.length) return null;
    // Los índices son los de las zonas de ANTES: se quitan al final.
    const n = [...(zonas || [])];
    const fuera = new Set();
    for (const p of de) {
        if (p.op === 'ajustar_zona') n[p.indice] = p.zona;
        else if (p.op === 'quitar_zona') fuera.add(p.indice);
    }
    return [...n.filter((_, i) => !fuera.has(i)),
            ...de.filter(p => p.op === 'nueva_zona').map(p => p.zona)];
}

/** La elección de medidas de la última operación de medidas, o `null`. */
export function medidasCambiadas(pasos) {
    const de = (pasos || []).filter(p => p.op === 'medidas');
    return de.length ? de[de.length - 1] : null;
}

/** ¿Hay algo que aplicar en el plano (sin contar zonas ni medidas)? */
export const tocaMuros = (pasos) => (pasos || []).some(p => !['ajustar_zona', 'nueva_zona', 'quitar_zona', 'medidas'].includes(p.op));
