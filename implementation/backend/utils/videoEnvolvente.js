/**
 * videoEnvolvente — A QUÉ PARED da cada ventana que se ha visto en un vídeo.
 *
 * Lo determinista de la lectura de un vídeo de la vivienda (el modelo lo hace
 * `services/videoEnvolventeService.js`, que solo DESCRIBE). Aquí se decide, con
 * reglas que se pueden leer y reproducir:
 *
 *   1. `ladosDePlano`  — las fachadas del plano, agrupadas en LADOS: las de la
 *      misma orientación y la misma línea en distintas plantas son el mismo lado
 *      de la casa (FBN1 abajo y F1N1 arriba). Una ventana vista desde dentro no
 *      dice «FBN1»; dice «planta baja, da a la calle».
 *   2. `asignarHuecos` — cada hueco a su pared por PLANTA y por lo que hay AL
 *      OTRO LADO (`da_a` contra el subtipo que Catastro da a cada fachada:
 *      CALLE, PATIO, ESPACIO_LIBRE_PARCELA…). Si en esa planta solo hay UN lado
 *      que encaje, la pared es esa. Si hay varios, NO se elige: queda `dudoso`
 *      con sus candidatas — elegir por la persona es poner la ventana en la
 *      pared de otra habitación, y de ahí sale la superficie de huecos de cada
 *      orientación que va al certificado.
 *   3. `paredesAPedir` — los lados que el vídeo no deja resolver (no se ven, o
 *      tienen huecos dudosos): son las fotos que hay que pedirle al propietario.
 *
 * ── REGLA: lo que no se puede decidir se PREGUNTA, no se adivina ────────────
 * Un vídeo de dentro con las persianas bajadas no dice a qué da la ventana del
 * dormitorio. No pasa nada: se le pide al propietario la foto de esa pared desde
 * fuera (`cee_inicial.js pedir-fotos`), con su plano marcado en rojo.
 *
 * Sin dependencias: lo prueba `scripts/test_video_envolvente.js`.
 */

//: La normal EXTERIOR de cada rumbo, con el norte arriba (x este, y norte).
const R2 = Math.SQRT1_2;
const NORMAL = {
    N: [0, 1], NE: [R2, R2], E: [1, 0], SE: [R2, -R2],
    S: [0, -1], SO: [-R2, -R2], O: [-1, 0], NO: [-R2, R2],
};

//: Cómo se le llama a lo que hay al otro lado de cada SUBTIPO de fachada.
const CATEGORIA = {
    CALLE: 'calle',
    PATIO: 'patio',
    ESPACIO_LIBRE_PARCELA: 'jardin',
    SOBRE_CUBIERTA_INFERIOR: 'terraza',
    SOBRE_CUBIERTA_COLINDANTE: 'terraza',
};

//: Cuánto encaja lo que se ve por el hueco (`da_a`) con la categoría del lado.
//: 3 = es eso; 1-2 = puede serlo; 0 = no.
//:
//: ⚠️ PATIO y JARDÍN valen LO MISMO. Desde una ventana no se distingue un patio
//: de lo que Catastro llama «espacio libre de la parcela»: los dos son suelo de
//: la propia casa a cielo abierto, con una tapia o la casa de al lado al fondo.
//: Medido en 26RES060_197: «tejado, pared y algo de vegetación» se leyó como
//: patio y la ventana era del espacio libre; con un 3 frente a un 2 el código
//: elegía, y elegía mal. Lo que SÍ se distingue es la CALLE (acera, coches,
//: casas de enfrente), y esa es la frontera que decide.
const ENCAJE = {
    calle: { calle: 3, jardin: 1, patio: 0, terraza: 0 },
    patio: { patio: 3, jardin: 3, terraza: 2, calle: 0 },
    jardin: { jardin: 3, patio: 3, terraza: 2, calle: 1 },
    terraza: { terraza: 3, patio: 2, jardin: 2, calle: 0 },
};

//: Una habitación que NO es vivienda: lo que se ve desde ella no es un hueco de
//: la envolvente (la puerta del garaje al patio es del garaje). Mismo criterio
//: que la skill: «el garaje, un trastero o un porche no son vivienda».
const NO_VIVIENDA = /garaje|cochera|trastero|almac[eé]n|bodega|cuarto de calderas|leñera|cobertizo/i;

//: Una pared más corta que esto no recibe huecos: son los quiebros de pocos
//: centímetros con los que Catastro parte una fachada (F1N4: 0,06 m).
const LARGO_MINIMO = 0.5;
//: Una pared sin ver más corta que esto no se le pide al propietario: casi
//: nunca tiene una ventana, y pedirle quince fotos hace que no mande ninguna.
const LARGO_MINIMO_PEDIR = 1.5;
//: Tolerancias para decir que dos tramos de fachada están en la MISMA línea.
const TOL_LINEA = 0.8;
const TOL_HUECO = 0.6;

//: Medidas de por defecto: las MISMAS de la ventana de la envolvente
//: (`POR_DEFECTO` de usePlanoEnvolvente.js) y una balconera de 2,10.
const POR_DEFECTO = {
    ventana: [1.3, 1.3],
    balconera: [1.2, 2.1],
    puerta_entrada: [0.9, 2.1],
    puerta_patio: [0.9, 2.1],
    lucernario: [1.0, 1.0],
};

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const dos = (x) => Math.round(x * 100) / 100;
const esFachada = (m) => String(m?.tipo || '').toUpperCase() === 'FACHADA' && !m.fuera;

/** Los dos extremos de un muro en coordenadas de MUNDO (el lienzo tiene la Y del revés). */
function extremos(m) {
    const s = m?.svg;
    if (!Array.isArray(s) || s.length < 2) return null;
    const a = s[0], b = s[s.length - 1];
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    return [[Number(a[0]), -Number(a[1])], [Number(b[0]), -Number(b[1])]];
}

/**
 * Las fachadas agrupadas en LADOS de la casa.
 *
 * Dos tramos son el mismo lado si miran a la MISMA orientación, están en la
 * misma línea (a menos de 0,8 m) y se tocan o se solapan a lo largo de ella —en
 * la misma planta (los tramos en que Catastro parte una fachada) o en distintas
 * (las plantas apiladas).
 *
 * @param {Array} muros  los del plano (`geo.plantas[].muros`, con `nivel` y `planta`)
 * @returns {Array} [{ id, orientacion, categoria, subtipos, niveles, largo, muros }]
 */
function ladosDePlano(muros = []) {
    const tramos = [];
    for (const m of muros) {
        if (!esFachada(m)) continue;
        const n = NORMAL[m.orientacion];
        const e = extremos(m);
        if (!n || !e) continue;
        const t = [-n[1], n[0]];
        const d = (e[0][0] + e[1][0]) / 2 * n[0] + (e[0][1] + e[1][1]) / 2 * n[1];
        const s0 = e[0][0] * t[0] + e[0][1] * t[1];
        const s1 = e[1][0] * t[0] + e[1][1] * t[1];
        tramos.push({ m, n, d, a: Math.min(s0, s1), b: Math.max(s0, s1), e });
    }
    // Unión de los que encajan, por pares (son decenas como mucho).
    const padre = tramos.map((_, i) => i);
    const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    for (let i = 0; i < tramos.length; i++) {
        for (let j = i + 1; j < tramos.length; j++) {
            const p = tramos[i], q = tramos[j];
            if (p.m.orientacion !== q.m.orientacion) continue;
            if (Math.abs(p.d - q.d) > TOL_LINEA) continue;
            if (p.b + TOL_HUECO < q.a || q.b + TOL_HUECO < p.a) continue;
            padre[raiz(i)] = raiz(j);
        }
    }
    const grupos = new Map();
    tramos.forEach((t, i) => {
        const r = raiz(i);
        if (!grupos.has(r)) grupos.set(r, []);
        grupos.get(r).push(t);
    });

    const lados = [...grupos.values()].map((g) => {
        const subtipos = [...new Set(g.map((t) => t.m.subtipo).filter(Boolean))];
        const cats = [...new Set(subtipos.map((s) => CATEGORIA[s] || 'otro'))];
        const niveles = [...new Set(g.map((t) => Number(t.m.nivel ?? 0)))].sort((a, b) => a - b);
        const largoPorNivel = niveles.map((nv) => g.filter((t) => Number(t.m.nivel ?? 0) === nv)
            .reduce((s, t) => s + (num(t.m.largo) || 0), 0));
        return {
            orientacion: g[0].m.orientacion,
            // Si un lado mezcla subtipos (la planta baja da a la calle y la de
            // arriba «sobre la cubierta del vecino»), cuentan todos.
            categorias: cats,
            subtipos,
            niveles,
            largo: dos(Math.max(...largoPorNivel)),
            muros: g.map((t) => ({
                id: t.m.id, nivel: Number(t.m.nivel ?? 0), planta: t.m.planta || null,
                largo: num(t.m.largo), alto: num(t.m.alto), subtipo: t.m.subtipo || null,
            })).sort((a, b) => a.nivel - b.nivel || (b.largo || 0) - (a.largo || 0)),
            _d: g[0].d,
            _s: (Math.min(...g.map((t) => t.a)) + Math.max(...g.map((t) => t.b))) / 2,
        };
    });
    // Un orden estable: por orientación y, dentro, a lo largo de la línea.
    const ORDEN = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    lados.sort((x, y) => ORDEN.indexOf(x.orientacion) - ORDEN.indexOf(y.orientacion)
        || x._d - y._d || x._s - y._s);
    return lados.map((l, i) => {
        const { _d, _s, ...resto } = l;
        return { id: `L${i + 1}`, ...resto };
    });
}

/** El muro de un lado en ESA planta (el más largo si Catastro lo parte en tramos). */
function muroEnNivel(lado, nivel) {
    return (lado?.muros || [])
        .filter((m) => m.nivel === nivel && (m.largo || 0) >= LARGO_MINIMO)
        .sort((a, b) => (b.largo || 0) - (a.largo || 0))[0] || null;
}

/** Cuánto encaja lo que se ve por el hueco con ese lado (0-3; 1 si no se sabe qué se ve). */
function encaje(daA, lado) {
    if (!daA) return 1;
    const t = ENCAJE[daA];
    if (!t) return 1;
    return Math.max(0, ...(lado.categorias || []).map((c) => t[c] ?? 0));
}

const NOMBRE_DA_A = {
    calle: 'la calle', patio: 'un patio', jardin: 'el jardín o la parcela', terraza: 'una terraza',
};
const NOMBRE_CAT = {
    calle: 'calle', patio: 'patio', jardin: 'espacio libre de la parcela', terraza: 'sobre cubierta', otro: 'exterior',
};
const RUMBO = { N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste', NE: 'Noreste', NO: 'Noroeste', SE: 'Sureste', SO: 'Suroeste' };

/** Cómo se le llama a un lado en un informe: «L2 · al Norte · calle · FBN1 + F1N1». */
function rotuloLado(l) {
    return `${l.id} · al ${RUMBO[l.orientacion] || l.orientacion} · `
        + `${(l.categorias || []).map((c) => NOMBRE_CAT[c] || c).join('/')} · `
        + `${l.muros.map((m) => m.id).join(' + ')} (${String(l.largo).replace('.', ',')} m)`;
}

/**
 * Cada hueco leído del vídeo, a su pared.
 *
 * @param {Object} lectura  la del vídeo, normalizada (`videoEnvolventeService.normalizar`)
 * @param {Array}  lados    `ladosDePlano(...)`
 * @param {Object} opts     { niveles: [0,1], entrada: 'FBE1' (si ya se sabe), estancias (para
 *                          descartar lo que se ve desde el garaje), fachadas: { F1: 'L2' } }
 * @returns {{ huecos: Array, lucernarios: Array, descartados: Array, avisos: Array }}
 *   Cada hueco: { ...lo leído, estado: 'asignado'|'dudoso'|'sin_pared', pared, lado,
 *                 confianza, candidatas: [{ lado, pared, encaje }], motivo }
 */
function asignarHuecos(lectura, lados, { niveles = null, entrada = null, estancias = [], fachadas = null } = {}) {
    const avisos = [];
    const nivelesPlano = niveles || [...new Set(lados.flatMap((l) => l.niveles))].sort((a, b) => a - b);
    const unaPlanta = nivelesPlano.length === 1;
    const huecos = [];
    const lucernarios = [];
    const descartados = [];
    const nombreEst = Object.fromEntries((estancias || []).map((e) => [e.id, e.nombre || '']));

    // ¿Ve el vídeo plantas que el plano no tiene? Pasa con una escalera con
    // descansillo: medido en 26RES060_197, el vídeo contó 3 plantas y Catastro
    // declara 2 (y el recuento de huecos de la de arriba cuadraba al sumar sus
    // «plantas» 1 y 2). Una planta que no está en el plano se toma por la más
    // cercana que sí está, y TODO lo asignado baja a confianza «media»: si las
    // plantas no cuadran, ninguna asignación es firme.
    const vistas = [...new Set((lectura?.huecos || []).map((h) => h.planta)
        .filter((p) => p !== null && p !== undefined))].sort((a, b) => a - b);
    const sobran = vistas.filter((p) => !nivelesPlano.includes(p));
    if (sobran.length) {
        avisos.push(`el vídeo ve las plantas ${JSON.stringify(vistas)} y el plano tiene `
            + `${JSON.stringify(nivelesPlano)}: las que no están se toman por la más cercana `
            + '(revisa en el mosaico de qué planta es cada habitación).');
    }
    const cercana = (n) => nivelesPlano.reduce((m, x) => (Math.abs(x - n) < Math.abs(m - n) ? x : m), nivelesPlano[0]);

    for (const h of lectura?.huecos || []) {
        if (h.tipo === 'puerta_garaje') {
            descartados.push({ ...h, motivo: 'la puerta del garaje no es de la vivienda: no se pone' });
            continue;
        }
        const est = nombreEst[h.estancia] || '';
        if (h.desde !== 'exterior' && NO_VIVIENDA.test(est)) {
            descartados.push({ ...h, motivo: `se ve desde «${est}», que no es vivienda: no se pone` });
            continue;
        }
        let nivel = h.planta;
        if (nivel === null || nivel === undefined) nivel = unaPlanta ? nivelesPlano[0] : null;
        if (nivel !== null && !nivelesPlano.includes(nivel)) nivel = cercana(nivel);
        if (h.tipo === 'lucernario') {
            lucernarios.push({ ...h, nivel, motivo: 'lucernario: va a la cubierta de su planta' });
            continue;
        }
        if (nivel === null) {
            huecos.push({ ...h, nivel: null, estado: 'dudoso', candidatas: [],
                motivo: 'no se sabe en qué planta está' });
            continue;
        }

        // Un hueco visto DESDE FUERA en una fachada ya identificada es de esa
        // fachada, diga lo que diga su «da a»: la pared se ha reconocido entera.
        const ladoF = h.fachada && fachadas?.[h.fachada] ? lados.find((l) => l.id === fachadas[h.fachada]) : null;
        const paredF = ladoF ? muroEnNivel(ladoF, nivel) : null;
        if (paredF) {
            huecos.push({
                ...h, nivel, estado: 'asignado', lado: ladoF.id, pared: paredF.id,
                confianza: sobran.length ? 'media' : 'alta',
                candidatas: [{ lado: ladoF.id, pared: paredF.id, encaje: 3 }],
                motivo: `está en la fachada ${h.fachada}, que es la ${ladoF.id} del plano`,
            });
            continue;
        }

        // Una pared más estrecha que el propio hueco no puede ser la suya (con
        // su ancho estimado, o el de la ventana más pequeña que tiene sentido).
        const anchoMin = Number(h.ancho) > 0 ? Number(h.ancho) * 0.9 : 0.6;
        let cands = lados
            .map((l) => ({ lado: l, pared: muroEnNivel(l, nivel), encaje: encaje(h.da_a, l) }))
            .filter((c) => c.pared && (c.pared.largo || 0) >= anchoMin);
        // La PUERTA DE ENTRADA: si ya se sabe por dónde se entra, es esa pared.
        let porEntrada = false;
        if (h.tipo === 'puerta_entrada' && entrada) {
            const e = cands.find((c) => c.pared.id === entrada);
            if (e) { cands = [{ ...e, encaje: 3 }]; porEntrada = true; }
        }
        const mejor = Math.max(0, ...cands.map((c) => c.encaje));
        const top = cands.filter((c) => c.encaje === mejor && mejor > 0);
        const base = {
            ...h, nivel,
            candidatas: cands.filter((c) => c.encaje > 0)
                .sort((a, b) => b.encaje - a.encaje)
                .map((c) => ({ lado: c.lado.id, pared: c.pared.id, encaje: c.encaje })),
        };
        if (!cands.length) {
            huecos.push({ ...base, estado: 'sin_pared', motivo: `no hay ninguna fachada en la planta ${nivel}` });
        } else if (top.length === 1 && (h.da_a || cands.length === 1)) {
            const c = top[0];
            // «Alta» solo con las DOS lecturas de acuerdo —o lo visto y lo
            // dicho de acuerdo, o la entrada ya señalada— y las plantas
            // cuadrando con el plano. Lo que solo dice una fuente se pone,
            // pero para confirmar.
            const firme = porEntrada || (c.encaje >= 3 && daAFirme(h));
            huecos.push({
                ...base, estado: 'asignado', lado: c.lado.id, pared: c.pared.id,
                confianza: firme && !sobran.length ? 'alta' : 'media',
                motivo: porEntrada ? 'es la pared por la que se entra (señalada en la envolvente)'
                    : cands.length === 1
                        ? `es la única fachada de la planta ${nivel}`
                        : `es la única fachada de la planta ${nivel} que da a ${NOMBRE_DA_A[h.da_a] || 'eso'}`,
            });
        } else {
            huecos.push({
                ...base, estado: 'dudoso',
                motivo: h.da_a
                    ? `en la planta ${nivel} hay ${top.length} fachadas que pueden dar a ${NOMBRE_DA_A[h.da_a] || 'eso'}`
                    : `no se ve a qué da, y en la planta ${nivel} hay ${cands.length} fachadas`,
            });
        }
    }
    return { huecos, lucernarios, descartados, avisos };
}

// ── Lo que DICE quien graba (el audio, transcrito) ──────────────────────────

//: Lo que se dice cuenta para un hueco si se oye desde 6 s antes de su segundo
//: hasta 4 s después: se nombra lo que se va a enseñar («y este sería el patio
//: de luces…» y luego se gira hacia él) o mientras se enseña. Medido en
//: 26RES060_226: «patio de luces» a las 0:40, sus ventanas en el 0:45-0:47.
const DICHO_ANTES = 6;
const DICHO_DESPUES = 4;
//: «Patio» y «jardín» son lo MISMO para decidir (ver `ENCAJE`): desde una
//: ventana —y de palabra— no se distinguen del espacio libre de la parcela.
const GRUPO_DA_A = { patio: 'patio', jardin: 'patio', calle: 'calle', terraza: 'terraza' };

/** Las frases que se oyen alrededor del segundo `t` de un vídeo. */
function frasesCerca(frases, t, { video = 1, antes = DICHO_ANTES, despues = DICHO_DESPUES } = {}) {
    if (t === null || t === undefined) return [];
    return (frases || []).filter((f) => (f.video || 1) === (video || 1)
        && f.t <= t + despues && (f.t_fin ?? f.t) >= t - antes);
}

/**
 * Junta lo que se DICE con lo que se VE. Pura: la prueba el test.
 *
 * A cada hueco le pone `dice` (lo que se oye alrededor de su segundo) y, si lo
 * que se dice NOMBRA a qué da («el patio de luces», «lo que da a la calle»),
 * lo usa como una lectura más:
 * - el vídeo y el fotograma no lo dejan ver (persiana bajada, no se ve el
 *   exterior) → vale lo dicho (`'lo dice quien graba'`): confianza MEDIA;
 * - lo dicho COINCIDE con lo visto → `dicho_coincide`: dos fuentes que no
 *   dependen una de otra, cuenta como firme;
 * - lo dicho CONTRADICE lo visto → no se decide (`da_a` null) y se avisa;
 * - se nombran a la vez dos cosas distintas cerca del hueco («la calle… y el
 *   patio») → no se usa para decidir, solo se enseña.
 *
 * @param {Array} huecos  los reconciliados (`videoEnvolventeService.reconciliar`)
 * @param {Array} frases  la transcripción, cada una con su `video`
 * @returns {{ huecos: Array, avisos: Array }}
 */
function conLoDicho(huecos, frases) {
    const avisos = [];
    const out = (huecos || []).map((h) => {
        const cerca = frasesCerca(frases, h.t, { video: h.video });
        if (!cerca.length) return h;
        const base = { ...h, dice: cerca.map((f) => f.texto).join(' '), dice_t: cerca[0].t };
        const das = [...new Set(cerca.map((f) => f.menciona?.da_a).filter((d) => GRUPO_DA_A[d]))];
        const grupos = [...new Set(das.map((d) => GRUPO_DA_A[d]))];
        if (grupos.length > 1) {
            avisos.push(`${h.id}: cerca de su segundo se nombran a la vez ${das.join(' y ')}: `
                + 'lo dicho no se usa para decidir a qué da.');
            return base;
        }
        if (!grupos.length) return base;
        const dicho = das[0];
        if (!h.da_a) {
            return { ...base, da_a: dicho, da_a_dicho: dicho,
                     da_a_fuente: h.da_a_fuente === 'discrepan'
                         ? 'lo dice quien graba (las dos lecturas discrepaban)' : 'lo dice quien graba' };
        }
        if (GRUPO_DA_A[h.da_a] === grupos[0]) {
            return { ...base, da_a_dicho: dicho, dicho_coincide: true,
                     da_a_fuente: `${h.da_a_fuente || 'la lectura'} + lo dice quien graba` };
        }
        avisos.push(`${h.id}: se ve que da a «${h.da_a}» y quien graba dice «${dicho}»: queda sin decidir.`);
        return { ...base, da_a: null, da_a_dicho: dicho, da_a_fuente: 'discrepa con lo que dice quien graba' };
    });
    return { huecos: out, avisos };
}

/**
 * ¿«A qué da» está FIRME? Con las dos lecturas de acuerdo (o el fotograma, que
 * lo ve quieto), o con lo que se ve y lo que se dice de acuerdo.
 */
function daAFirme(h) {
    if (['las dos lecturas', 'el fotograma'].includes(h?.da_a_fuente)) return true;
    return h?.dicho_coincide === true;
}

/** Las medidas de un hueco: las estimadas si las hay, y si no, las de por defecto. */
function medidas(h) {
    if (num(h.ancho) > 0 && num(h.alto) > 0) {
        return { ancho: num(h.ancho), alto: num(h.alto), estimada: true };
    }
    const [a, b] = POR_DEFECTO[h.tipo] || POR_DEFECTO.ventana;
    return { ancho: a, alto: b, estimada: false };
}

/**
 * Lo que cabe en cada pared: los anchos de sus huecos no pueden sumar más que
 * ella. Si se pasan, algún hueco está en la pared equivocada (o repetido), y se
 * dice — la pared pasa a las que hay que comprobar.
 */
function capacidad(huecos, lados) {
    const largos = Object.fromEntries(lados.flatMap((l) => l.muros.map((m) => [m.id, m.largo || 0])));
    const suma = {};
    for (const h of huecos) {
        if (h.estado !== 'asignado') continue;
        suma[h.pared] = (suma[h.pared] || 0) + medidas(h).ancho;
    }
    return Object.entries(suma)
        .filter(([id, s]) => largos[id] > 0 && s > largos[id])
        .map(([id, s]) => ({ pared: id, suma: dos(s), largo: largos[id] }));
}

/**
 * El ESTADO de cada lado después de leer el vídeo, y cuáles hay que pedirle al
 * propietario.
 *
 * - `resuelto`: tiene huecos asignados con confianza alta y ninguno dudoso.
 * - `por_confirmar`: sus huecos están asignados, pero alguno solo con confianza
 *   media (lo dice uno solo de los dos modelos, o las plantas del vídeo no
 *   cuadran con el plano). No se pide sola: se enseña para que alguien decida.
 * - `dudoso`: hay huecos que podrían ser suyos y no se sabe.
 * - `sin_ver`: el vídeo no enseña nada de él. Puede no tener ventanas —es un
 *   dato bueno—, pero eso lo tiene que decir quien vive allí.
 * - `no_caben`: los huecos asignados suman más que la pared.
 *
 * @returns {{ lados: Array, pedir: Array, sinPedir: Array }}
 */
function estadoDeLados(lados, asignacion, { fachadasVistas = [] } = {}) {
    const exceso = new Set(capacidad(asignacion.huecos, lados).map((c) => c.pared));
    const out = lados.map((l) => {
        const ids = new Set(l.muros.map((m) => m.id));
        const suyos = asignacion.huecos.filter((h) => h.estado === 'asignado' && ids.has(h.pared));
        const dudosos = asignacion.huecos.filter((h) => h.estado === 'dudoso'
            && (h.candidatas || []).some((c) => c.lado === l.id));
        const vista = fachadasVistas.includes(l.id);
        let estado = 'sin_ver';
        if (l.muros.some((m) => exceso.has(m.id))) estado = 'no_caben';
        else if (dudosos.length) estado = 'dudoso';
        else if (suyos.some((h) => h.confianza !== 'alta')) estado = 'por_confirmar';
        else if (suyos.length || vista) estado = 'resuelto';
        return { ...l, estado, huecos: suyos.map((h) => h.id), dudosos: dudosos.map((h) => h.id) };
    });
    // Una pared de menos de 1,5 m no se le pide al propietario aunque esté en
    // duda: casi nunca tiene una ventana, y quince fotos pedidas hacen que no
    // llegue ninguna (26RES060_OP260 pedía una de 0,98 m). Se lista aparte.
    const pedir = out.filter((l) => ['dudoso', 'no_caben', 'sin_ver'].includes(l.estado)
        && l.largo >= LARGO_MINIMO_PEDIR);
    const confirmar = out.filter((l) => l.estado === 'por_confirmar');
    const sinPedir = out.filter((l) => ['dudoso', 'sin_ver'].includes(l.estado) && l.largo < LARGO_MINIMO_PEDIR);
    return { lados: out, pedir, confirmar, sinPedir };
}

/**
 * Lo que se le PIDE al propietario: UNA foto por LADO de la casa, no por planta.
 *
 * El plan de fotos del motor (`geo.plan_fotos`) va por planta —FBNO1 abajo y
 * F1NO1 arriba son dos tomas—, y eso es lo correcto para medir, pero para quien
 * está en la calle con el móvil es la MISMA pared: una foto con las dos plantas.
 * Medido en 26RES060_197: 4 lados salían como 7 peticiones, dos de ellas con el
 * mismo título («La fachada al espacio libre de tu parcela»). Aquí se pide por
 * lado, con su orientación para distinguirlos, y se reutiliza del plan de fotos
 * el PLANO con la pared en rojo (el de su tramo más largo) y el texto de la
 * fachada principal, que lleva la dirección.
 *
 * @returns {Array} [{ lado, muros, titulo, subtitulo, toma, plano_datos, slot }]
 */
function peticionesPorLado(ladosPedir, planFotos, { direccion = '' } = {}) {
    const tomas = planFotos?.tomas || [];
    const principal = tomas.find((t) => /desde la calle/i.test(t.titulo || ''));
    const entera = 'Que salga ENTERA: las dos esquinas y desde el suelo hasta el tejado, '
        + 'con todas sus ventanas y puertas.';
    return ladosPedir.map((l) => {
        const porLargo = [...l.muros].sort((a, b) => (b.largo || 0) - (a.largo || 0));
        const toma = porLargo.map((m) => tomas.find((t) => (t.muros || []).includes(m.id))).find(Boolean) || null;
        const esPrincipal = !!principal && l.muros.some((m) => (principal.muros || []).includes(m.id));
        const rumbo = RUMBO[l.orientacion] || l.orientacion;
        const cat = (l.categorias || [])[0] || 'otro';
        const largo = Math.max(1, Math.round(l.largo || 0));
        let titulo, sub;
        if (cat === 'calle' && esPrincipal) {
            titulo = 'Tu casa vista desde la calle';
            sub = `${direccion ? `Es la fachada de ${direccion}. ` : ''}Ponte en la acera de enfrente y apártate `
                + 'hasta que quepa entera: las dos esquinas y desde el suelo hasta el tejado, con todas sus ventanas. '
                + `Son unos ${largo} m de ancho.`;
        } else if (cat === 'calle') {
            titulo = `La pared de fuera que da a la calle, la que mira al ${rumbo}`;
            sub = `Mide unos ${largo} m. ${entera} Ponte lo más de frente que puedas.`;
        } else if (cat === 'patio') {
            titulo = `La pared que da al patio, la que mira al ${rumbo}`;
            sub = `Mide unos ${largo} m. Ponte dentro del patio, enfrente de ella, y apártate hasta el fondo. ${entera}`;
        } else if (cat === 'jardin') {
            titulo = `La pared que da a tu parcela (patio trasero, jardín o corral), la que mira al ${rumbo}`;
            sub = `Mide unos ${largo} m. ${entera} Ponte lo más de frente que puedas.`;
        } else if (cat === 'terraza') {
            titulo = `La pared que da a la terraza, la que mira al ${rumbo}`;
            sub = `Mide unos ${largo} m. ${entera} Ponte lo más de frente que puedas.`;
        } else {
            titulo = `La pared de fuera que mira al ${rumbo}`;
            sub = `Mide unos ${largo} m. ${entera}`;
        }
        if ((l.niveles || []).length > 1) sub += ` Tiene ${l.niveles.length} plantas: que salgan todas.`;
        return {
            lado: l.id, muros: l.muros.map((m) => m.id), titulo, subtitulo: sub,
            toma: toma?.id || null, plano_datos: toma?.plano_datos || null,
            slot: cat === 'calle' ? 'FOTO_FACHADA_PRINCIPAL' : 'FOTO_PATIOS_INTERIORES',
        };
    });
}

/**
 * Las TOMAS del plan de fotos del motor (`geo.plan_fotos.tomas`) que cubren las
 * paredes que hay que pedir. El motor ya redacta cada toma en lenguaje de
 * cliente («La pared de fuera que da al Norte · Mide unos 10 m…») y trae su
 * plano con la pared en rojo: aquí solo se eligen.
 */
function tomasParaParedes(planFotos, paredes) {
    const quiero = new Set(paredes);
    return (planFotos?.tomas || []).filter((t) => (t.muros || []).some((m) => quiero.has(m)));
}

/**
 * Los huecos ASIGNADOS, con la forma que espera el plan de `aplicar`
 * (`huecos[pared]`). Todo nace dudoso; el porqué dice de qué segundo del vídeo
 * sale y con qué se ha medido.
 */
function huecosParaPlan(asignacion, { varios = false } = {}) {
    const plan = {};
    for (const h of asignacion.huecos) {
        if (h.estado !== 'asignado') continue;
        const med = medidas(h);
        const tipo = ['puerta_entrada', 'puerta_patio'].includes(h.tipo) ? 'puerta' : 'ventana';
        const minuto = h.t !== null && h.t !== undefined
            ? `${Math.floor(h.t / 60)}:${String(Math.round(h.t % 60)).padStart(2, '0')}` : '?';
        const de = med.estimada
            ? `medida estimada (${h.medida_referencia || 'referencia de la imagen'})`
            : 'medida por defecto';
        (plan[h.pared] ||= []).push({
            tipo,
            ancho: med.ancho,
            alto: med.alto,
            ...(h.tipo === 'puerta_patio' ? { porc_marco: 35 } : {}),
            ...(h.persiana !== null && h.persiana !== undefined && tipo === 'ventana' ? { persiana: h.persiana } : {}),
            foto: `frame:${h.id}`,
            // Dónde está en su fotograma (lo da la segunda lectura): es la marca
            // que se pinta sobre la foto en la ventana de la envolvente.
            ...(h.box ? { box: h.box } : {}),
            por_que: (`${h.descripcion || h.tipo} — vídeo${varios ? ` ${h.video}` : ''} ${minuto} `
                + `(${h.motivo}; ${de})${h.dice ? ` · dice: «${h.dice.slice(0, 90)}»` : ''}`).slice(0, 280),
        });
    }
    return plan;
}

module.exports = {
    ladosDePlano,
    asignarHuecos,
    estadoDeLados,
    capacidad,
    medidas,
    huecosParaPlan,
    conLoDicho,
    frasesCerca,
    daAFirme,
    DICHO_ANTES,
    DICHO_DESPUES,
    tomasParaParedes,
    peticionesPorLado,
    muroEnNivel,
    rotuloLado,
    encaje,
    NORMAL,
    CATEGORIA,
    ENCAJE,
    NO_VIVIENDA,
    POR_DEFECTO,
    LARGO_MINIMO,
    LARGO_MINIMO_PEDIR,
};
