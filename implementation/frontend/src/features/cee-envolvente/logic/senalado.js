/**
 * LO SEÑALADO en el plano, tal y como viaja al motor — sin React.
 *
 * Vivía dentro de `usePlanoEnvolvente` (`loSenalado`), que importa React y por
 * tanto no se puede cargar desde Node. La skill `generar-cee-inicial` genera el
 * `.cex` desde un script, y tenía dos salidas: reescribir aquí la misma
 * traducción —y que el `.cex` del script y el del botón dejaran de coincidir el
 * día que se tocara una— o sacarla a un módulo puro. Es lo mismo que ya se hizo
 * con `trabajoGuardado.js` y `tiposPared.js`.
 *
 * El hook la llama con su estado; el script, con el estado que monta
 * `estadoDeTrabajo()` a partir de la geometría del motor y de un trabajo
 * guardado — la MISMA siembra que hace la ventana al abrirse.
 *
 * ⚠️ Los imports llevan la extensión `.js`: Vite no la exige y Node sí.
 */
import { largo as largoDe, lienzoAMundo as lienzoAMundoDe } from './geometriaPlano.js';
import { esFuera, esMedianera, tipoDe } from './tiposPared.js';
import { carpinteriaAlMotor, huecosDefecto } from './ventanasVivienda.js';
import { nombreHueco } from './reforma.js';
import { aplicarTrabajo, deltaLienzo, trasladarTrabajo } from './trabajoGuardado.js';

/**
 * Un identificador que NO cambia en toda la vida del hueco.
 *
 * El `nombre` (V1, PE) es editable y además se recoloca solo al añadir y quitar
 * huecos, y el ÍNDICE se mueve con cada `splice`. Ninguno de los dos sirve para
 * colgar de un hueco algo que tiene que seguirle: su FOTO. `uid` sí.
 */
export const nuevoUid = () => Math.random().toString(36).slice(2, 10);

/**
 * Un hueco guardado, listo para usarse. Los guardados antes de que existiera el
 * `uid` estrenan el suyo al abrirlos, y lo que `normalizeData` dejó en
 * MAYÚSCULAS se rescata (`VENTANA` → `ventana`): lo que hay en la BD tiene que
 * poder abrirse.
 */
export function rescatarHueco(h) {
    const baja = (x) => (typeof x === 'string' ? x.toLowerCase() : x);
    return { ...h, uid: h?.uid || nuevoUid(), tipo: baja(h?.tipo), estado: baja(h?.estado) };
}

/**
 * Lo que mide una pared por sus puntos.
 *
 * La MISMA cuenta que hace el motor (`aplicar_paredes` en `generar_cex.py`), y
 * por eso está en UNA función: la de aquí es para verlo mientras se arrastra;
 * la que acaba escrita en el `.cex` la hace el motor, que es donde se miden
 * todas las paredes. La altura es la que el motor usó para medir esa planta, no
 * una decisión nueva.
 */
export function medirPared(pts, alto) {
    const L = largoDe(pts);
    return { largo: L, superficie: L * (Number(alto) || 0) };
}

/** Una pared dibujada, con la forma que tienen las que trae el motor. */
export function paredDibujada(d, huecos) {
    return {
        id: d.id, planta: d.planta, nivel: d.nivel ?? null,
        tipo: d.tipo || 'PARTICION_VERTICAL', subtipo: 'DIBUJADA',
        orientacion: '—', alto: d.alto ?? null, svg: d.svg,
        dibujada: true, huecos: (huecos || []).map(rescatarHueco),
        ...medirPared(d.svg, d.alto),
    };
}

export function esDibujada(m) { return !!m?.dibujada; }

/** Cómo se va a llamar en CE3X. */
export function nombreDe(m) { return (m?.nombre_manual || m?.id || '').trim(); }

//: La inicial que le corresponde a cada tipo. La nomenclatura del motor ya la
//: usa: `F` fachada, `M` medianera; `P` es la de las particiones del .cex real
//: de un certificador (`PH01`, `PV01`).
const INICIAL = { FACHADA: 'F', MEDIANERA: 'M', PARTICION_VERTICAL: 'P' };

export function inicialDe(id, tipo) {
    const letra = INICIAL[tipo];
    return letra && id ? letra + String(id).slice(1) : id;
}

/**
 * ¿Lo ha ESCRITO una persona, o lo ha propuesto la app?
 *
 * Al reclasificar, la app propone el mismo id con otra inicial (`FBE1` → `PBE1`)
 * y eso sigue siendo su nombre automático: el motor le pega detrás lo que es la
 * pared («PBE1 PARTICION CON EL VECINO»), que es lo que se lee en el árbol de
 * CE3X. Un nombre tecleado ya dice lo que es, y ahí el sufijo sobra.
 */
export function esNombrePropio(m) {
    const suyo = nombreDe(m);
    return !!m?.nombre_manual && suyo !== m.id && suyo !== inicialDe(m.id, tipoDe(m));
}

//: Lo que el motor escribe cuando una pared no tiene rumbo (`plano_svg` lo
//: pinta así). No es un valor: es el hueco.
const SIN_RUMBO = '—';

/** Hacia dónde da: manda el certificador sobre la geometría. */
export function rumboDe(m) {
    const suyo = m?.orientacion_manual;
    if (suyo) return suyo;
    const geo = m?.orientacion;
    return geo && geo !== SIN_RUMBO ? geo : null;
}

/** Las plantas que trae el motor, venga la respuesta envuelta o no. */
export function plantasDe(geo) {
    return geo?.plantas || geo?.geometria?.plantas || [];
}

/**
 * Las cubiertas de cada planta, de mayor a menor. Es donde van los LUCERNARIOS
 * (un lucernario sin cubierta en su planta no se manda: el motor abortaría el
 * `.cex` entero).
 */
export function cubiertasDeGeometria(geo) {
    const out = {};
    for (const e of geo?.geometria?.elementos || []) {
        if (e?.tipo !== 'CUBIERTA' || !e.planta) continue;
        const sup = Number(e.superficie?.value ?? e.superficie ?? e.area_m2) || 0;
        (out[e.planta] ||= []).push({ id: e.id, superficie: sup });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => b.superficie - a.superficie);
    return out;
}

/** La cubierta en la que va un lucernario hoy, o `null` si ya no hay ninguna. */
export function cubiertaDeLucernarioEn(cubiertasDePlanta, planta, h) {
    const lista = cubiertasDePlanta?.[planta] || [];
    return lista.find(c => c.id === h?.cubierta)?.id || lista[0]?.id || null;
}

/**
 * Los muros de la geometría con un TRABAJO puesto encima, SIN React.
 *
 * Es la misma siembra que hace la ventana al abrirse (`sembrar` en el hook):
 * los muros del motor, el trabajo trasladado al lienzo de hoy y aplicado con
 * `aplicarTrabajo`. Lo que la ventana hace además —traducir los nombres de
 * pared que el motor recicla al volver a medir— aquí no hace falta: el trabajo
 * se compone sobre la MISMA geometría con la que se va a generar.
 *
 * Devuelve el estado que necesita `senaladoDe`.
 */
export function estadoDeTrabajo(geo, trabajo) {
    const muros = {};
    for (const p of plantasDe(geo)) {
        for (const m of p.muros || []) muros[m.id] = { ...m, svg_catastro: m.svg, huecos: [] };
    }
    const ref = lienzoAMundoDe(geo?.georef);
    const g = trabajo ? trasladarTrabajo(trabajo, deltaLienzo(trabajo.lienzo_ref || ref, ref)) : null;
    const r = g
        ? aplicarTrabajo(muros, g, (k) => k, { paredDibujada, rescatarHueco, medirPared })
        : { entrada: null, geometria: { movidas: {}, dibujadas: [] }, cubiertas: {}, lucernarios: {} };
    return {
        muros,
        entrada: r.entrada,
        geometria: r.geometria,
        cubiertas: r.cubiertas || {},
        lucernarios: r.lucernarios || {},
        cubiertasDePlanta: cubiertasDeGeometria(geo),
        lienzoAMundo: ref,
    };
}

/**
 * Lo que se señala en el plano y el motor no puede saber: los huecos, por dónde
 * se entra y qué medianeras dan a un espacio no habitable.
 *
 * El resto de la ficha —titular, zona climática, transmitancias— NO se compone
 * aquí: lo hace el backend desde el expediente (`fichaCe3x.js`). Que el
 * navegador mandase las U sería dejar que el certificado se escribiera con las
 * que quisiera quien tenga la sesión abierta.
 *
 * @param {object} estado  { muros, entrada, geometria, cubiertas, lucernarios, cubiertasDePlanta }
 * @param {object} ajustes los de la ficha (de ahí sale cómo son las ventanas)
 * @param {object} opts    { lienzoAMundo } la traslación del lienzo al mundo
 */
export function senaladoDe(estado, ajustes = null, { lienzoAMundo = null } = {}) {
    const muros = estado?.muros || {};
    const entrada = estado?.entrada || null;
    const geometria = estado?.geometria || { movidas: {}, dibujadas: [] };
    const cubiertas = estado?.cubiertas || {};
    const lucernarios = estado?.lucernarios || {};
    const cubiertaDeLucernario = (planta, h) =>
        cubiertaDeLucernarioEn(estado?.cubiertasDePlanta, planta, h);

    const huecos = [];
    for (const m of Object.values(muros)) {
        // Un hueco de una pared apartada NO se manda: el motor no escribe
        // ese cerramiento, y un hueco que apunta a un cerramiento que no
        // existe aborta la generación entera.
        if (esFuera(m)) continue;
        for (const h of m.huecos || []) {
            const esPuerta = h.tipo === 'puerta';
            huecos.push({
                // Al cerramiento por su nombre EFECTIVO: es como lo casa el
                // motor, y si se ha renombrado, el viejo ya no existe allí.
                // El del hueco lleva ya su «- CAMBIA» si se reforma: es lo
                // que CE3X enseña y por lo que enlaza sus puentes.
                id: nombreHueco(h), cerramiento: nombreDe(m),
                ancho: Number(h.ancho), alto: Number(h.alto),
                // ⚠️ SIEMPRE 'Hueco'. CE3X no distingue aquí la puerta de la
                // ventana: sus dos valores son `Hueco` y `Lucernario`, el
                // esquema del CTE lo declara como `pattern 'Hueco|Lucernario'`
                // y el visor oficial RECHAZA el XML con cualquier otro — y con
                // el XML rechazado el certificado no se puede registrar.
                // Mandábamos 'Ventana'/'Puerta' y por eso el registro de la
                // JCCM devolvía 20 errores de validación en 26RES060_186.
                // Lo que hace puerta a una puerta es su 90 % de marco, que va
                // aquí debajo; el nombre (PE, V1) ya dice cuál es cuál.
                tipo: 'Hueco',
                // Su carpintería y su % de MARCO: una puerta de entrada es
                // casi toda opaca (madera al 90 % si nadie dice otra cosa) y
                // una puerta de patio acristalada a medias, un 30-40 % de
                // marco metálico. Lo que no declare nada hereda el
                // `huecos_defecto` de abajo, que es lo normal. La cascada es
                // UNA (`carpinteriaAlMotor`): la misma que enseña el panel.
                ...carpinteriaAlMotor(h),
                // Una PUERTA no lleva persiana salvo que alguien lo diga: el
                // `huecos_defecto` de la vivienda es de las VENTANAS, y sin
                // esto la puerta de entrada heredaba su caja de persiana.
                ...(typeof h.persiana === 'boolean' ? { persiana: h.persiana }
                    : esPuerta ? { persiana: false } : {}),
                de: h.estado === 'medido'
                    ? 'SEÑALADO EN LA VISTA DEL CERTIFICADOR'
                    : 'SEÑALADO EN LA VISTA, medida POR CONFIRMAR',
            });
        }
    }
    // Los LUCERNARIOS, colgados de la cubierta de su planta por su id de
    // Catastro (`CUB1`): el motor lo casa con «CUB1 CUBIERTA» —o con la
    // parte que se conserva o la que se rehace, si la cubierta se parte— y
    // lo escribe como `Lucernario` con orientación «Techo». Sin persiana:
    // un lucernario no tiene caja.
    for (const [planta, hs] of Object.entries(lucernarios)) {
        for (const h of hs || []) {
            const cerramiento = cubiertaDeLucernario(planta, h);
            // Sin tejado en su planta no se manda: el motor abortaría el
            // .cex entero. La ventana lo enseña (`lucernariosSinCubierta`).
            if (!cerramiento) continue;
            huecos.push({
                id: nombreHueco(h), cerramiento,
                ancho: Number(h.ancho), alto: Number(h.alto),
                tipo: 'Lucernario',
                ...carpinteriaAlMotor(h),
                persiana: false,
                de: h.estado === 'medido'
                    ? 'LUCERNARIO SEÑALADO EN LA VISTA DEL CERTIFICADOR'
                    : 'LUCERNARIO SEÑALADO EN LA VISTA, medida POR CONFIRMAR',
            });
        }
    }
    const reclasificar = {};
    const renombrar = {};
    const u_por_cerramiento = {};
    const orientaciones = {};
    const nombres_propios = [];
    for (const m of Object.values(muros)) {
        if (m.tipo_manual && m.tipo_manual !== m.tipo) reclasificar[m.id] = m.tipo_manual;
        if (nombreDe(m) !== m.id) {
            renombrar[m.id] = nombreDe(m);
            // Y si lo ha ESCRITO una persona, el motor no le pega detrás lo
            // que es la pared («FBN1 CALLE»): ya lo ha dicho él. El cambio
            // de inicial al reclasificar (FBE1 → PBE1) lo propone la app, no
            // es un nombre suyo, y ahí el sufijo sigue haciendo falta.
            if (esNombrePropio(m)) nombres_propios.push(m.id);
        }
        if (Number.isFinite(m.u_manual)) u_por_cerramiento[m.id] = m.u_manual;
        // El rumbo de una pared DIBUJADA viaja con ella, unas líneas más
        // abajo: en el motor su elemento nace con el nombre EFECTIVO, así
        // que una entrada aquí —que va por el id de Catastro— no casaría
        // con nada. Es el mismo reparto que ya hacen `tipo` y `planta`.
        if (m.orientacion_manual && !esDibujada(m)) {
            orientaciones[m.id] = m.orientacion_manual;
        }
    }
    // Las paredes movidas y las dibujadas, con sus dos extremos TAL CUAL se
    // han soltado sobre el plano. Aquí NO se manda ni un largo ni una
    // superficie: eso lo mide el motor (`aplicar_paredes`), que es donde se
    // miden todas las demás. Las coordenadas son las del lienzo, y un metro
    // del lienzo es un metro del edificio — es el mundo trasladado y con la
    // Y del revés, y eso conserva las distancias.
    const paredes = {
        movidas: Object.fromEntries(Object.entries(geometria.movidas || {})
            .filter(([k]) => muros[k] && !esFuera(muros[k]))
            .map(([k, pts]) => [k, { lienzo: pts }])),
        nuevas: (geometria.dibujadas || [])
            .filter(d => muros[d.id] && !esFuera(muros[d.id]))
            .map(d => ({
                id: nombreDe(muros[d.id]), planta: d.planta, nivel: d.nivel,
                tipo: tipoDe(muros[d.id]), lienzo: d.svg,
                orientacion: rumboDe(muros[d.id]),
            })),
    };
    return {
        huecos,
        paredes,
        // Cómo son las ventanas de la vivienda: de aquí sale la
        // transmitancia de cada hueco y, con la persiana, su puente térmico
        // de cajón. Sin contestar sale lo de siempre («Doble + Metálico sin
        // RPT», sin persiana), así que un expediente que no haya pasado por
        // el popup se escribe exactamente igual que antes.
        huecos_defecto: huecosDefecto(ajustes),
        // Los pilares integrados que ha contado una persona, por el ID DE
        // CATASTRO: el nombre lo puede cambiar ella misma y entonces el
        // motor no casaría el override con su fachada.
        pilares: Object.fromEntries(Object.values(muros)
            .filter(m => !esFuera(m) && Number.isFinite(m.pilares))
            .map(m => [m.id, m.pilares])),
        entrada: { valor: entrada, de: 'SEÑALADO POR EL CERTIFICADOR' },
        medianeras_como_particion: Object.values(muros)
            .filter(m => esMedianera(m) && m.como_particion).map(m => m.id),
        // Las que el certificador ha apartado. El motor ya sabe saltárselas
        // (`excluir_ids` en `generar_cex.py`): aquí solo hay que decírselo.
        excluir_ids: {
            ids: Object.values(muros).filter(m => esFuera(m)).map(m => m.id),
            de: 'APARTADAS POR EL CERTIFICADOR: no son del espacio habitable',
        },
        reclasificar, renombrar, nombres_propios, u_por_cerramiento, orientaciones,
        // Lo que se REFORMA. Las paredes van por su id de Catastro y el
        // motor les pega «- CAMBIA» detrás de lo que son; la cubierta, por
        // planta, entera o con su polígono en coordenadas del LIENZO más la
        // traslación al mundo, para que el motor la interseque con el
        // tejado real. Los huecos ya van con el sufijo en su `id`.
        mejora: {
            cerramientos: Object.values(muros)
                .filter(m => !esFuera(m) && m.cambia).map(m => m.id),
            cubierta: cubiertas,
            ...(lienzoAMundo ? { lienzo_a_mundo: lienzoAMundo } : {}),
        },
    };
}
