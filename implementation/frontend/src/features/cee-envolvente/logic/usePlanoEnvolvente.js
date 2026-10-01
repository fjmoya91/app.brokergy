import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { largo as largoDe, LARGO_MINIMO_PARED, lienzoAMundo, rumbosDeLaPared } from './geometriaPlano';
import { traduccionDeIds } from './identidadParedes.js';
import { esFuera, esMedianera, esParticion, tipoDe } from './tiposPared.js';
import { mudarHueco, paredesParaHueco } from './huecosEnParedes.js';
import { aplicarTrabajo, deltaLienzo, trasladarMuros, trasladarTrabajo } from './trabajoGuardado.js';
// Lo que se manda al motor y lo que hace falta para montarlo vive en un módulo
// PURO (`senalado.js`): la skill `generar-cee-inicial` lo usa desde Node, y con
// una copia aquí el `.cex` del script y el del botón dejarían de coincidir.
import {
    senaladoDe, cubiertasDeGeometria, plantasDe,
    nuevoUid, rescatarHueco, medirPared, paredDibujada, esDibujada,
    nombreDe, esNombrePropio, inicialDe, rumboDe,
} from './senalado.js';
export { nuevoUid, medirPared, esDibujada, nombreDe, esNombrePropio, rumboDe };

import { SUFIJO_CAMBIA, nombreHueco } from './reforma.js';
export { SUFIJO_CAMBIA, nombreHueco };

// ─────────────────────────────────────────────────────────────────────────────
// El estado del plano: qué paredes hay, qué huecos les ha puesto el
// certificador y por dónde se entra.
//
// Aquí NO se mide nada. Las longitudes, las orientaciones y a qué da cada
// pared vienen del motor; esto solo las coloca en pantalla y recoge lo que el
// motor no puede saber: las ventanas, las puertas y la entrada.
// ─────────────────────────────────────────────────────────────────────────────

//: Medidas de partida al añadir un hueco a mano. NO son medidas: son el tamaño
//: corriente, para no arrancar en blanco. Salen en ámbar hasta que se confirmen.
//: Un lucernario de 1 × 1 m es la medida más repetida de los 19 del corpus.
const POR_DEFECTO = { puerta: [0.90, 2.10], ventana: [1.30, 1.30], lucernario: [1.00, 1.00] };

//: Menos de esto no cabe una puerta, así que no se sugiere como entrada.
const ANCHO_MINIMO_ENTRADA = 1.2;

export function usePlanoEnvolvente(geo, expedienteId, guardado) {
    const clave = `brokergy-envolvente-${expedienteId}`;

    const [muros, setMuros] = useState({});
    const [entrada, setEntrada] = useState(null);
    const [sel, setSel] = useState(null);

    //: La geometría que ha CORREGIDO el certificador: paredes que ha movido y
    //: paredes que ha dibujado. Va en su propio estado y NO dentro de `muros`
    //: por una razón muy concreta: de `plantas` cuelga el encuadre del plano, y
    //: si dependiera del estado de los huecos, poner una ventana devolvería el
    //: plano a su zoom de partida a media faena.
    const [geometria, setGeometria] = useState({ movidas: {}, dibujadas: [] });

    //: Los CUERPOS del edificio que el certificador deja FUERA: el aparcamiento
    //: adosado, el porche, el trastero del fondo. En un certificado la
    //: envolvente es la de la VIVIENDA, y Catastro dibuja el edificio en partes
    //: —la casa es una y el garaje otra— pero el plano se arma por NIVEL, así
    //: que sus paredes entraban igual.
    //:
    //: Va en su PROPIO estado, no derivado de `muros`: al quitar un cuerpo el
    //: edificio se vuelve a medir y sus paredes dejan de existir, así que no hay
    //: ningún muro del que leerlo después.
    const [cuerposFuera, setCuerposFuera] = useState([]);

    //: El CONTORNO DE LA VIVIENDA dibujado a mano, cuando la parcela es una
    //: comunidad de adosados y Catastro no dice dónde acaba cada casa. Va en
    //: coordenadas del MUNDO (EPSG:25830), no del lienzo: al recortar, el motor
    //: vuelve a encuadrar la casa y el lienzo cambia de origen. Como los
    //: cuerpos, se guarda porque hay que volver a PEDIR la geometría con él.
    const [recorte, setRecorte] = useState(null);

    //: La CUBIERTA que se reforma, por planta: entera, o la parte que encierra
    //: un polígono dibujado sobre el plano. Va en su propio estado porque la
    //: cubierta NO es un muro —no está en `muros`, es una superficie horizontal
    //: y el plano de paredes no la dibuja— y lo que se guarda son los vértices
    //: tal cual se soltaron: la superficie la mide el motor.
    const [cubiertas, setCubiertas] = useState({});

    //: Los LUCERNARIOS, por planta: los huecos de la CUBIERTA. La cubierta no es
    //: un muro (no está en `muros`), así que sus huecos tampoco pueden vivir en
    //: `muros[id].huecos`. Van aquí, con la misma forma que un hueco de fachada
    //: —nombre, medidas, estado, carpintería, «cambia»— y `tipo: 'lucernario'`.
    //: Al .cex salen colgados de la cubierta de su planta, y es el MOTOR quien
    //: los escribe como `Lucernario` con orientación «Techo» (así los guarda
    //: CE3X: 19 de 19 en los .cex de producción).
    const [lucernarios, setLucernarios] = useState({});

    //: Las ZONAS que NO son vivienda dentro de una planta: el garaje que hay en
    //: la planta baja de una casa de dos plantas, con la vivienda encima.
    //: Catastro no dibuja esa línea; se dibuja aquí y el motor la resta SOLO de
    //: su planta. Va en el MUNDO, como el contorno, y se guarda porque hay que
    //: volver a PEDIR la geometría con ellas.
    const [zonasFuera, setZonasFuera] = useState([]);

    //: Los huecos que se han quedado SIN PARED al volver a medir: estaban en un
    //: cerramiento que ya no existe (se fue con el cuerpo o la zona que se
    //: acaba de quitar). Antes desaparecían sin decir nada; ahora se enseñan y
    //: se pueden volver a poner en otra pared.
    const [huerfanos, setHuerfanos] = useState([]);

    //: En qué LIENZO está lo que hay en pantalla: la traslación al mundo que da
    //: el propio motor. Viaja con el trabajo (`lienzo_ref`) porque el motor
    //: vuelve a encuadrar al volver a medir, y todo lo guardado en coordenadas
    //: del lienzo hay que llevarlo al nuevo (ver `trasladarTrabajo`).
    const refLienzo = useMemo(() => lienzoAMundo(geo?.georef), [geo?.georef]);
    const refMurosRef = useRef(null);

    /**
     * Monta el estado del plano desde la geometría y le pone encima un TRABAJO.
     *
     * Vive aparte del efecto que la llama porque la usan dos: la siembra al
     * abrir (con lo guardado en el expediente) y DESHACER, que es lo mismo con
     * otro trabajo. Reconstruirlo desde `geo` en vez de guardar copias del mapa
     * de muros mantiene una sola forma de leer un trabajo: la del fichero.
     */
    //: Los muros que había ANTES de esta siembra. Va por `ref` y no por estado
    //: a propósito: `sembrar` no puede depender de `muros` —se re-dispararía a
    //: cada cambio y volvería a sembrar encima de lo que se acaba de hacer—,
    //: pero necesita saber qué pared era cada nombre para no mudarle el trabajo.
    const murosRef = useRef({});

    const sembrar = useCallback((guardadoAhora, { conLocal = true } = {}) => {
        if (!geo) return;
        const nuevo = {};
        for (const p of plantasDe(geo)) {
            // `svg_catastro` es el trazado TAL COMO LO MIDE el motor. Se guarda
            // aparte porque `svg` lo puede mover el certificador, y para saber
            // si dos paredes son la misma hay que comparar lo medido.
            for (const m of p.muros) nuevo[m.id] = { ...m, svg_catastro: m.svg, huecos: [] };
        }
        // Cómo se llama HOY cada pared que el trabajo guardado nombra de otra
        // forma. Al volver a medir con un cuerpo menos, el motor recicla los
        // nombres —`FBS1` pasaba de la pared de 6,90 m a una de 1,03— y con
        // ellos se mudaban las ventanas, las medidas confirmadas y la entrada.
        // Las de antes se llevan PRIMERO al lienzo de hoy: el motor lo
        // re-encuadra al volver a medir, y comparando en lienzos distintos no
        // casaba ninguna (26RES080_85).
        const viejos = trasladarMuros(murosRef.current,
                                      deltaLienzo(refMurosRef.current, refLienzo));
        const { traduce, perdidos } = traduccionDeIds(viejos, nuevo);
        const sinSitio = new Set(perdidos);
        const id = (k) => (sinSitio.has(k) ? null : (traduce[k] || k));
        try {
            // Manda lo guardado en el EXPEDIENTE; el localStorage es el
            // respaldo de lo que aún no se ha llegado a guardar (o de un
            // guardado que falló).
            const local = conLocal ? JSON.parse(localStorage.getItem(clave) || 'null') : null;
            const g0 = guardadoAhora || local;
            if (g0) {
                // Lo guardado, llevado al lienzo de hoy. Un trabajo de antes de
                // `lienzo_ref` se da por dibujado en ESTE lienzo, que es lo que
                // se hacía hasta ahora.
                const g = trasladarTrabajo(g0, deltaLienzo(g0.lienzo_ref || refLienzo, refLienzo));
                // Las dibujadas entran ANTES de aplicarles el trabajo: ver
                // `aplicarTrabajo` (se perdía su reclasificación al recargar).
                const r = aplicarTrabajo(nuevo, g, id,
                                         { paredDibujada, rescatarHueco, medirPared });
                setEntrada(r.entrada);
                setSel(r.sel);
                setGeometria(r.geometria);
                setCuerposFuera(r.cuerposFuera);
                setRecorte(r.recorte);
                setZonasFuera(r.zonasFuera);
                setCubiertas(r.cubiertas);
                setLucernarios(r.lucernarios || {});
                // Los huecos cuya pared ya no existe NO desaparecen en silencio:
                // se guardan aparte y la ventana los enseña para ponerlos en
                // otra pared (o descartarlos, que es decirlo).
                const nuevos = perdidos
                    .filter(k => (g.huecos?.[k] || []).length)
                    .map(k => ({ pared: nombreDe(viejos[k]) || k, planta: viejos[k]?.planta ?? null,
                                 huecos: g.huecos[k].map(rescatarHueco) }));
                const previos = Array.isArray(g.huecos_sin_pared) ? g.huecos_sin_pared : [];
                const vistos = new Set();
                setHuerfanos([...previos, ...nuevos].filter((o) => {
                    const clave2 = (o.huecos || []).map(h => h.uid).join(',');
                    if (!o.huecos?.length || vistos.has(clave2)) return false;
                    vistos.add(clave2);
                    return true;
                }));
            }
        } catch { /* almacenamiento bloqueado: se empieza limpio */ }
        murosRef.current = nuevo;
        refMurosRef.current = refLienzo;
        setMuros(nuevo);
    }, [geo, clave, refLienzo]);

    useEffect(() => { sembrar(guardado); }, [sembrar, guardado]);

    /**
     * Vuelve a un trabajo anterior. Lo usa DESHACER.
     *
     * Sin `localStorage`: ahí está lo ÚLTIMO, que es justo de lo que se quiere
     * volver. Si se leyera, deshacer no haría nada.
     */
    const restaurar = useCallback((t) => sembrar(t, { conLocal: false }), [sembrar]);

    const trabajo = useMemo(() => (Object.keys(muros).length ? {
        entrada, sel,
        huecos: Object.fromEntries(
            Object.entries(muros).map(([k, m]) => [k, m.huecos])),
        particiones: Object.values(muros)
            .filter(m => m.como_particion).map(m => m.id),
        excluidas: Object.values(muros)
            .filter(m => m.excluida).map(m => m.id),
        // Las que el certificador ha dado por REVISADAS. Se guardan con el
        // trabajo porque son trabajo: mirar una fachada ciega, comprobar que no
        // tiene ningún hueco y que al recargar vuelva a contar como pendiente
        // es pedir que se mire dos veces lo mismo.
        revisadas: Object.values(muros)
            .filter(m => m.revisada).map(m => m.id),
        // Las paredes que se REFORMAN (aislamiento): al .cex van con «- CAMBIA»
        // en el nombre. Los huecos llevan su marca dentro de cada uno.
        cambian: Object.values(muros)
            .filter(m => m.cambia).map(m => m.id),
        // Y la cubierta que se reforma, entera o por el polígono dibujado.
        cubierta_reforma: cubiertas,
        // Los lucernarios de cada cubierta. Solo si hay: un expediente sin
        // ninguno se guarda exactamente como antes.
        ...(Object.keys(lucernarios).length ? { lucernarios } : {}),
        tipos: Object.fromEntries(Object.values(muros)
            .filter(m => m.tipo_manual).map(m => [m.id, m.tipo_manual])),
        nombres: Object.fromEntries(Object.values(muros)
            .filter(m => m.nombre_manual).map(m => [m.id, m.nombre_manual])),
        us: Object.fromEntries(Object.values(muros)
            .filter(m => Number.isFinite(m.u_manual)).map(m => [m.id, m.u_manual])),
        orientaciones: Object.fromEntries(Object.values(muros)
            .filter(m => m.orientacion_manual).map(m => [m.id, m.orientacion_manual])),
        // Los pilares integrados que ha CONTADO el certificador. Se guardan
        // porque contarlos es trabajo: son los que ve en la fachada, y un 0 es
        // tan respuesta como un 5 — por eso la condición es «lo ha declarado»,
        // no «es distinto de cero».
        pilares: Object.fromEntries(Object.values(muros)
            .filter(m => Number.isFinite(m.pilares)).map(m => [m.id, m.pilares])),
        // La geometría corregida. Se guarda con el trabajo porque es TRABAJO:
        // volver a colocar un tabique y perderlo al recargar sería peor que no
        // poder moverlo.
        paredes: geometria,
        // Los cuerpos que se han dejado fuera. Se guardan porque hay que volver
        // a PEDIR la geometría con ellos: si no, al recargar el aparcamiento
        // volvería a la envolvente y nadie se enteraría.
        cuerpos_fuera: cuerposFuera,
        // El contorno de la vivienda (adosados). Mismo motivo que los cuerpos.
        recorte_vivienda: recorte,
        // Lo que no es vivienda dentro de una planta (el garaje). Idem.
        zonas_fuera: zonasFuera,
        // Los huecos que se quedaron sin pared al volver a medir, hasta que se
        // pongan en otra o se descarten: cerrar la ventana no puede perderlos.
        ...(huerfanos.length ? { huecos_sin_pared: huerfanos } : {}),
        // En qué lienzo están las coordenadas de arriba (paredes dibujadas y
        // movidas, cubierta): sin esto, al volver a medir se quedaban en otro
        // sitio del edificio.
        lienzo_ref: refLienzo,
    } : null), [muros, entrada, sel, geometria, cuerposFuera, cubiertas, lucernarios,
                recorte, zonasFuera, huerfanos, refLienzo]);

    useEffect(() => {
        if (!Object.keys(muros).length) return;
        try {
            localStorage.setItem(clave, JSON.stringify({
                entrada, sel,
                huecos: Object.fromEntries(
                    Object.entries(muros).map(([k, m]) => [k, m.huecos])),
                particiones: Object.values(muros)
                    .filter(m => m.como_particion).map(m => m.id),
                excluidas: Object.values(muros)
                    .filter(m => m.excluida).map(m => m.id),
                revisadas: Object.values(muros)
                    .filter(m => m.revisada).map(m => m.id),
                cambian: Object.values(muros)
                    .filter(m => m.cambia).map(m => m.id),
                cubierta_reforma: cubiertas,
                ...(Object.keys(lucernarios).length ? { lucernarios } : {}),
                tipos: Object.fromEntries(Object.values(muros)
                    .filter(m => m.tipo_manual).map(m => [m.id, m.tipo_manual])),
                nombres: Object.fromEntries(Object.values(muros)
                    .filter(m => m.nombre_manual).map(m => [m.id, m.nombre_manual])),
                us: Object.fromEntries(Object.values(muros)
                    .filter(m => Number.isFinite(m.u_manual)).map(m => [m.id, m.u_manual])),
                orientaciones: Object.fromEntries(Object.values(muros)
                    .filter(m => m.orientacion_manual).map(m => [m.id, m.orientacion_manual])),
                paredes: geometria,
                lienzo_ref: refLienzo,
            }));
        } catch { /* idem */ }
    }, [muros, entrada, sel, clave, geometria, cubiertas, lucernarios, refLienzo]);

    const plantas = useMemo(() => {
        if (!geo) return [];
        // El sótano no se dibuja: no es espacio habitable y no va a la envolvente.
        return plantasDe(geo).filter(p => p.habitable !== false).map(p => ({
            ...p,
            muros: [
                // Lo que midió Catastro, con la corrección puesta encima si la
                // hay: la pared se dibuja DONDE ESTÁ, no donde consta.
                ...(p.muros || []).map(m => {
                    const pts = geometria.movidas[m.id];
                    return pts ? { ...m, svg: pts, movida: true,
                                   ...medirPared(pts, m.alto) } : m;
                }),
                // Y las que ha dibujado el certificador, que Catastro no tiene.
                ...geometria.dibujadas.filter(d => d.planta === p.id)
                    .map(d => ({ ...paredDibujada(d), huecos: undefined })),
            ],
        }));
    }, [geo, geometria]);

    // El LIENZO en metros, y es COMÚN a todas las plantas a propósito: si cada
    // una se escalara a su tamaño, la planta primera —más pequeña— saldría
    // dibujada igual de grande que la baja y no coincidirían una encima de
    // otra. Lo encuadra el MOTOR, donde está la geometría (`viz/plano_svg.py`),
    // y viene en la RAÍZ de la respuesta, no dentro de cada planta.
    const lienzo = useMemo(() => medidaDelLienzo(geo, plantas), [geo, plantas]);

    // Los colindantes y la linde de la parcela, ya colocados por el motor sobre
    // ese mismo lienzo. Es lo que permite juzgar si una pared es medianera.
    const contexto = geo?.contexto || geo?.geometria?.contexto || null;
    // El encuadre amplio, en las MISMAS coordenadas: enseñar la manzana es
    // cambiar de `viewBox`, no recalcular nada.
    const entorno = geo?.entorno || null;

    const resumen = useMemo(() => {
        const lista = Object.values(muros).filter(m => !esFuera(m));
        let medidos = 0, dudosos = 0, m2 = 0;
        // Los lucernarios cuentan como cualquier otro hueco: una medida por
        // confirmar en el tejado es tan «por confirmar» como una en la fachada.
        const deLasCubiertas = Object.values(lucernarios || {}).flat();
        for (const h of [...lista.flatMap(m => m.huecos || []), ...deLasCubiertas]) {
            if (h.estado === 'medido') medidos++; else dudosos++;
            m2 += (Number(h.ancho) || 0) * (Number(h.alto) || 0);
        }
        // Una pared DADA POR REVISADA sale de la cuenta aunque no lleve huecos:
        // una fachada ciega no se puede resolver poniéndole una ventana que no
        // tiene, y sin esta salida se quedaba contando como pendiente para
        // siempre — un contador que nunca llega a cero se deja de mirar.
        const sinTocar = lista.filter(
            m => !esMedianera(m) && !m.revisada && !(m.huecos || []).length).length;
        // Cuántas hay que mirar EN TOTAL: es el denominador de la barra de
        // progreso de la cabecera. Las medianeras no cuentan — no se miran, no
        // llevan huecos.
        const paredes = lista.filter(m => !esMedianera(m)).length;
        const fuera = Object.values(muros).filter(m => esFuera(m)).length;
        // Una fachada SIN rumbo no se puede escribir, así que esto no es «algo
        // por confirmar»: es lo que va a parar el `.cex`. Se cuenta aquí para
        // que se vea en la barra de apartados sin tener que pulsar la pared.
        const sinRumbo = lista.filter(necesitaRumbo).length;
        // Lo marcado como que SE REFORMA: paredes, huecos y cubiertas. Es lo
        // que va a salir con «- CAMBIA» en el .cex, y se cuenta en la cabecera
        // para que se vea sin recorrer las paredes una a una.
        const cambian = lista.filter(m => m.cambia).length
            + lista.reduce((s, m) => s + (m.huecos || []).filter(h => h.cambia).length, 0)
            + Object.values(cubiertas || {}).filter(c => c && (c.entera || c.poligono)).length
            + deLasCubiertas.filter(h => h.cambia).length;
        return { medidos, dudosos, sinTocar, fuera, sinRumbo, cambian, paredes,
                 lucernarios: deLasCubiertas.length,
                 m2Hueco: m2.toFixed(1).replace('.', ',') };
    }, [muros, cubiertas, lucernarios]);

    //: Las cubiertas que hay en cada planta, por su id de Catastro (`CUB1`,
    //: `CU21`…) y su superficie. Un lucernario va en UNA de ellas: la que diga,
    //: o la mayor de su planta.
    //: En qué cubierta va cada lucernario lo decide `senalado.js`
    //: (`cubiertaDeLucernarioEn`) con esta misma lista.
    const cubiertasDePlanta = useMemo(() => cubiertasDeGeometria(geo), [geo]);

    //: Los lucernarios que se han quedado SIN CUBIERTA: su planta ya no tiene
    //: tejado en la geometría (se volvió a medir con otro cuerpo, o la planta
    //: ya no cuenta). No se mandan —un hueco en un cerramiento que no existe
    //: aborta el .cex entero— pero tampoco desaparecen en silencio.
    const lucernariosSinCubierta = useMemo(() => Object.entries(lucernarios)
        .filter(([p, hs]) => hs?.length && !(cubiertasDePlanta[p] || []).length)
        .map(([planta, huecos]) => ({ planta, huecos })),
    [lucernarios, cubiertasDePlanta]);

    // ── acciones ─────────────────────────────────────────────────────────────

    function elegir(id) {
        const m = muros[id];
        if (!m) return;
        // Una pared APARTADA se sigue pudiendo pulsar: es la única forma de
        // volver a meterla en la envolvente. Lo que no puede es convertirse en
        // la entrada — por una pared que no cuenta no se entra a la vivienda.
        if (!entrada && !esFuera(m)) {
            setEntrada(id);
            // Al señalar la entrada se colocan sola una puerta y dos ventanas:
            // esa pared SIEMPRE tiene puerta, y arrancar en blanco es peor.
            setMuros(v => ({ ...v, [id]: { ...v[id], huecos:
                (v[id].huecos || []).length ? v[id].huecos
                    : [nuevoHueco('puerta', v), nuevoHueco('ventana', v)] } }));
        }
        setSel(id);
    }

    function ponHuecos(id, tipo, cuantos) {
        setMuros(v => {
            const m = v[id];
            const otros = (m.huecos || []).filter(h => h.tipo !== tipo);
            const mios = (m.huecos || []).filter(h => h.tipo === tipo);
            const copia = { ...v };
            while (mios.length > cuantos) mios.pop();
            while (mios.length < cuantos) mios.push(nuevoHueco(tipo, copia));
            copia[id] = { ...m, huecos: [...otros, ...mios] };
            return copia;
        });
    }

    function cambiaHueco(id, i, campo, valor) {
        setMuros(v => {
            const huecos = [...(v[id].huecos || [])];
            const h = { ...huecos[i], [campo]: valor };
            // Tocar una medida es confirmarla: deja de ser el valor por defecto.
            if (campo === 'ancho' || campo === 'alto') {
                h.estado = 'medido';
                h.por_que = 'confirmado por el certificador';
            }
            huecos[i] = h;
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /**
     * Copia un hueco con SUS medidas, con nombre nuevo.
     *
     * Una fachada con tres ventanas iguales es lo normal, y volver a teclear
     * 1,40 × 1,10 en cada una es justo donde se cuela el error. La copia sale
     * ya CONFIRMADA (`medido`): sus medidas no son un valor por defecto, son
     * las que acaba de dar el certificador.
     */
    function duplicaHueco(id, i) {
        setMuros(v => {
            const huecos = [...(v[id].huecos || [])];
            const h = huecos[i];
            if (!h) return v;
            const copia = {
                ...h,
                // Identidad NUEVA: la copia es otro hueco. Con el `uid` del
                // original compartirían la foto, y despegársela a uno se la
                // quitaría al otro.
                uid: nuevoUid(),
                // El sitio NO se copia: la copia caería exactamente encima del
                // original y parecería que el botón no ha hecho nada. Se coloca
                // sola en su hueco del reparto y se arrastra a donde vaya.
                pos: undefined,
                nombre: nuevoHueco(h.tipo, v).nombre,
                estado: h.estado === 'medido' ? 'medido' : h.estado,
                por_que: h.estado === 'medido'
                    ? `copiado de ${h.nombre}, misma medida`
                    : h.por_que,
            };
            huecos.splice(i + 1, 0, copia);
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /**
     * Mueve un hueco A LO LARGO de su pared, en tanto por uno.
     *
     * Es COSMÉTICO —CE3X no coloca los huecos, de cada uno quiere su superficie
     * y su orientación— pero el plano se mira para pensar, y una fachada con la
     * puerta donde de verdad está se reconoce de un vistazo. Se guarda con el
     * trabajo: colocarlos a mano y perderlos al recargar sería peor que no
     * poder moverlos.
     */
    function mueveHueco(id, i, pos) {
        setMuros(v => {
            const huecos = [...(v[id]?.huecos || [])];
            if (!huecos[i]) return v;
            huecos[i] = { ...huecos[i], pos };
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /**
     * Da por buena la medida de un hueco.
     *
     * Las de por defecto salen en ámbar y el titular las cuenta («9 con medida
     * por confirmar»), pero hasta ahora la ÚNICA forma de quitarlas de esa
     * cuenta era teclear encima el mismo número que ya ponía. Cuando la medida
     * por defecto es la buena —que es lo corriente en una ventana de 1,30—,
     * decir que sí tiene que costar un clic.
     */
    function confirmaHueco(id, i) {
        setMuros(v => {
            const huecos = [...(v[id]?.huecos || [])];
            if (!huecos[i]) return v;
            huecos[i] = { ...huecos[i], estado: 'medido',
                          por_que: 'dada por buena por el certificador' };
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /** Todas las de una pared de una vez: se miran juntas, se confirman juntas. */
    function confirmaPared(id) {
        setMuros(v => {
            const m = v[id];
            if (!m) return v;
            return { ...v, [id]: { ...m, huecos: (m.huecos || []).map(h =>
                h.estado === 'medido' ? h
                    : { ...h, estado: 'medido',
                        por_que: 'dada por buena por el certificador' }) } };
        });
    }

    /**
     * Mueve un hueco a OTRA pared.
     *
     * Las ventanas se ponen mirando el plano, y con las dos plantas a la vista
     * es fácil meterla en la fachada de al lado. La única salida era quitarla y
     * volver a teclear sus medidas en la buena — y lo que se teclea dos veces se
     * teclea mal una. Se muda el hueco entero: mismas medidas, mismo nombre,
     * misma carpintería y lo que dijo su foto.
     */
    function mudaHueco(id, i, destino) {
        setMuros(v => mudarHueco(v, id, i, destino));
        setSel(destino);
    }

    /** A qué paredes se puede mudar un hueco que hoy está en `id`. */
    function destinosDeHueco(id) { return paredesParaHueco(muros, id); }

    /**
     * Pone en `destino` los huecos que se quedaron sin pared al volver a medir.
     *
     * Llegan enteros —medidas, carpintería, lo que dijo su foto— y con su
     * nombre salvo que ya lo tenga otro en el edificio. El sitio a lo largo del
     * muro NO viaja: era del muro que ya no existe.
     */
    function recuperaHuerfanos(destino) {
        if (!destino) return;
        setMuros(v => {
            if (!v[destino]) return v;
            const usados = new Set(Object.values(v).flatMap(m => (m.huecos || []).map(h => h.nombre)));
            const llegan = huerfanos.flatMap(o => o.huecos || []).map((h) => {
                const nombre = usados.has(h.nombre) ? nuevoHueco(h.tipo, v).nombre : h.nombre;
                usados.add(nombre);
                return { ...h, nombre, pos: undefined,
                         por_que: `${h.por_que ? `${h.por_que} · ` : ''}recuperado tras volver a medir` };
            });
            return { ...v, [destino]: { ...v[destino],
                                        huecos: [...(v[destino].huecos || []), ...llegan] } };
        });
        setHuerfanos([]);
        setSel(destino);
    }

    /** Dar por perdidos los huecos sin pared: es decirlo, no dejarlos flotando. */
    function descartaHuerfanos() { setHuerfanos([]); }

    function quitaHueco(id, i) {
        setMuros(v => {
            const huecos = [...(v[id].huecos || [])];
            huecos.splice(i, 1);
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /**
     * Mete en la pared los huecos que se han leído de su FOTO.
     *
     * REGLA — lo leído NACE DUDOSO. Ni la mejor lectura de una foto en
     * perspectiva es un metro: `dudoso` es el ámbar que la pantalla ya tiene, que
     * el titular ya cuenta («6 con medida por confirmar») y que ya se cierra con
     * un clic en «✓ OK». Entra por el estado que existe, no por uno nuevo.
     *
     * REGLA — no se PISA lo que ya hay. Los huecos que el certificador ya puso en
     * esa pared se quedan exactamente como estaban: si los midió, los midió con
     * el edificio delante. Lo leído se AÑADE detrás — y el popup, que es quien
     * sabe cuántos había, decide cuántos ofrece.
     *
     * REGLA — lo que la foto dice del hueco viaja con él (`lectura`) pero NO al
     * `.cex`: la carpintería y el acristalamiento no tienen hoy casilla en
     * `loSenalado`, y escribir en un certificado un dato cuyo camino no se ha
     * verificado es justo lo que la casa no hace. Se guarda, se enseña, y el día
     * que haya casilla ya está el dato.
     */
    function aplicaHuecosLeidos(id, leidos, { de = 'la foto', reemplaza = false } = {}) {
        setMuros(v => {
            const m0 = v[id];
            if (!m0 || !leidos?.length) return v;
            // Reemplazar es una decisión EXPLÍCITA de quien mira: la toma en el
            // popup, con las dos cifras delante («quitar los 2 y poner estos 5»).
            // Nunca es lo que pasa por defecto.
            const m = reemplaza ? { ...m0, huecos: [] } : m0;
            const copia = { ...v, [id]: m };
            const nuevos = [];
            for (const l of leidos) {
                const tipo = l.tipo === 'puerta' ? 'puerta' : 'ventana';
                const base = nuevoHueco(tipo, { ...copia, [id]: { ...m, huecos: [...(m.huecos || []), ...nuevos] } });
                const conMedida = Number(l.ancho) > 0 && Number(l.alto) > 0;
                nuevos.push({
                    ...base,
                    // Quien llama puede FIJAR el uid: lo necesita para atar la
                    // marca de la foto al hueco que se acaba de crear, y eso no
                    // se puede saber desde fuera si el uid nace aquí dentro.
                    ...(l.uid ? { uid: l.uid } : {}),
                    ...(conMedida ? { ancho: Number(l.ancho), alto: Number(l.alto) } : {}),
                    estado: 'dudoso',
                    por_que: conMedida
                        ? `estimado de ${de} (${fmt(l.ancho)} × ${fmt(l.alto)} m): mídelo o confírmalo`
                        : `contado en ${de}; la medida es la de por defecto: confírmala`,
                    // Lo que la foto dice de ESTE hueco. Metadatos, no cálculo.
                    lectura: recorta({
                        material_marco: l.material_marco, acristalamiento: l.acristalamiento,
                        persiana: l.persiana, descripcion: l.descripcion, planta: l.planta,
                    }),
                });
            }
            copia[id] = { ...m, huecos: [...(m.huecos || []), ...nuevos] };
            return copia;
        });
    }

    /** Lo que la foto de un PRIMER PLANO dice de un hueco concreto. */
    function anotaLecturaHueco(id, uid, lectura) {
        setMuros(v => {
            const m = v[id];
            if (!m) return v;
            return { ...v, [id]: { ...m, huecos: (m.huecos || []).map(h =>
                h.uid === uid ? { ...h, lectura: recorta(lectura) } : h) } };
        });
    }

    /**
     * Dar una pared por REVISADA.
     *
     * Es la pareja del «✓ OK» de un hueco, un escalón más arriba: ahí se da por
     * buena una medida y aquí, la pared entera. Existe porque el contador de
     * «paredes por mirar» solo se vaciaba poniendo huecos, y hay paredes que no
     * tienen ninguno —una fachada ciega, un paño corto de patio—: la única
     * forma de sacarlas de la cuenta era inventarles una ventana.
     *
     * NO viaja al `.cex` (`loSenalado` no lo manda) y no cambia ni una
     * superficie: es la marca de que una persona ya la ha mirado. Por eso se
     * puede quitar — decir «esta no la había mirado» tiene que costar lo mismo
     * que decir que sí.
     */
    function marcaRevisada(id, si) {
        setMuros(v => (v[id] ? { ...v, [id]: { ...v[id], revisada: !!si } } : v));
    }

    /**
     * La siguiente pared POR MIRAR, a partir de una. Es lo que hace útil «dar
     * por revisada»: en una casa de catorce paredes, marcar una y tener que ir
     * a buscar la siguiente con el ratón es lo que hace que se deje de marcar.
     * Recorre en el orden del plano (planta, id) y da la vuelta al llegar al
     * final. `null` si no queda ninguna.
     */
    function siguientePorMirar(desde) {
        const lista = Object.values(muros)
            .filter(m => !esFuera(m))
            .sort((a, b) => String(a.planta).localeCompare(String(b.planta))
                            || String(a.id).localeCompare(String(b.id)));
        if (!lista.length) return null;
        const pendiente = m => !esMedianera(m) && !m.revisada && !(m.huecos || []).length;
        const i = Math.max(0, lista.findIndex(m => m.id === desde));
        for (let k = 1; k <= lista.length; k++) {
            const m = lista[(i + k) % lista.length];
            if (m.id !== desde && pendiente(m)) return m.id;
        }
        return null;
    }

    /**
     * Marcar una PARED como que se reforma (se mejora su aislamiento).
     *
     * Al .cex va con «- CAMBIA» pegado al nombre y NADA MÁS: ni la U ni la
     * superficie se tocan. Es lo que le dice al certificador, en el árbol de
     * CE3X, sobre qué cerramientos montar la medida de mejora.
     */
    function marcaCambia(id, si) {
        setMuros(v => (v[id] ? { ...v, [id]: { ...v[id], cambia: !!si } } : v));
    }

    /** Lo mismo para UN hueco: «V1» pasa a escribirse «V1 - CAMBIA». */
    function marcaHuecoCambia(id, i, si) {
        setMuros(v => {
            const huecos = [...(v[id]?.huecos || [])];
            if (!huecos[i]) return v;
            huecos[i] = { ...huecos[i], cambia: !!si };
            return { ...v, [id]: { ...v[id], huecos } };
        });
    }

    /**
     * La carpintería (y la marca de CAMBIA) de VARIOS huecos de una vez.
     *
     * `objetivos` son `[{ pared, uid }]`; `valores` trae solo lo que se toca:
     * una clave ausente no cambia nada, `null` quita lo propio del hueco (vuelve
     * a heredar de la vivienda). Es lo que hace útil el popup de «cambiar en
     * bloque»: la cocina y el baño con PVC y el resto como estaban.
     */
    function ponCarpinteria(objetivos, valores) {
        const quiere = new Set((objetivos || []).map(o => `${o.pared}/${o.uid}`));
        if (!quiere.size || !valores) return;
        setMuros(v => {
            const copia = { ...v };
            for (const [k, m] of Object.entries(v)) {
                if (!(m.huecos || []).some(h => quiere.has(`${k}/${h.uid}`))) continue;
                copia[k] = { ...m, huecos: (m.huecos || []).map(h => {
                    if (!quiere.has(`${k}/${h.uid}`)) return h;
                    const n = { ...h };
                    for (const campo of ['vidrio', 'marco', 'persiana', 'cambia']) {
                        if (!(campo in valores)) continue;
                        const x = valores[campo];
                        // «No cambia» es la ausencia de la marca, no un `false`
                        // guardado en cada hueco.
                        if (x === null || x === undefined || (campo === 'cambia' && !x)) delete n[campo];
                        else n[campo] = x;
                    }
                    return n;
                }) };
            }
            return copia;
        });
    }

    /** Quita la carpintería PROPIA de todos los huecos: vuelven a heredar. */
    function quitaCarpinteriaPropia() {
        setMuros(v => Object.fromEntries(Object.entries(v).map(([k, m]) => [k, {
            ...m, huecos: (m.huecos || []).map(h => {
                // Las PUERTAS no entran: «cambiar en bloque» es de las ventanas
                // (el popup ni las lista), y el marco de una puerta —la de patio
                // de aluminio al 40 %— no es una excepción a las ventanas de la
                // casa: es la puerta.
                if (h.tipo === 'puerta') return h;
                if (!(h.vidrio || h.marco || typeof h.persiana === 'boolean')) return h;
                const n = { ...h };
                delete n.vidrio; delete n.marco; delete n.persiana;
                return n;
            }),
        }])));
    }

    /**
     * La cubierta de una planta que se REFORMA: entera, o la parte que encierra
     * el polígono dibujado (vértices del lienzo, tal cual se soltaron). La
     * superficie de cada parte la mide el MOTOR intersecando con el tejado real
     * (`partir_cubierta`); aquí no se calcula ni un m² que vaya al .cex.
     */
    function ponCubierta(plantaId, reforma) {
        if (!plantaId) return;
        setCubiertas(v => {
            const n = { ...v };
            const limpio = reforma && (reforma.entera || (reforma.poligono || []).length >= 3)
                ? (reforma.entera ? { entera: true }
                                  : { poligono: reforma.poligono.map(([x, y]) => [
                                        Math.round(Number(x) * 100) / 100,
                                        Math.round(Number(y) * 100) / 100]) })
                : null;
            if (limpio) n[plantaId] = limpio; else delete n[plantaId];
            return n;
        });
    }

    function quitaCubierta(plantaId) { ponCubierta(plantaId, null); }

    // ── LUCERNARIOS: los huecos de la cubierta ──────────────────────────────
    //
    // Mismas reglas que un hueco de fachada —nace con la medida por defecto en
    // ámbar, tocar una medida la confirma, la copia estrena `uid`— pero viven
    // por PLANTA y no en `muros`, porque la cubierta no es un muro.

    /** Los nombres de hueco que ya hay en el edificio, en fachadas y tejados. */
    function nombresUsados(extra = {}) {
        const usados = new Set();
        for (const m of Object.values(muros)) for (const h of m.huecos || []) usados.add(h.nombre);
        for (const hs of Object.values({ ...lucernarios, ...extra })) {
            for (const h of hs || []) usados.add(h.nombre);
        }
        return usados;
    }

    function nuevoLucernario(usados, cubierta) {
        let n = 1;
        while (usados.has(`L${n}`)) n++;
        const [a, b] = POR_DEFECTO.lucernario;
        return {
            uid: nuevoUid(), nombre: `L${n}`, tipo: 'lucernario',
            ancho: a, alto: b, estado: 'dudoso', ...(cubierta ? { cubierta } : {}),
            por_que: `medida por defecto (${fmt(a)} × ${fmt(b)} m): confírmala`,
        };
    }

    function anadeLucernario(planta) {
        if (!planta) return;
        const cub = (cubiertasDePlanta[planta] || [])[0]?.id || null;
        setLucernarios(v => ({ ...v, [planta]: [...(v[planta] || []),
                                               nuevoLucernario(nombresUsados(v), cub)] }));
    }

    function cambiaLucernario(planta, i, campo, valor) {
        setLucernarios(v => {
            const hs = [...(v[planta] || [])];
            if (!hs[i]) return v;
            const h = { ...hs[i] };
            // «No cambia» y «como el resto» son la AUSENCIA de la clave, no un
            // `false` ni un `undefined` guardados en cada hueco.
            if (valor === undefined || (campo === 'cambia' && !valor)) delete h[campo];
            else h[campo] = valor;
            if (campo === 'ancho' || campo === 'alto') {
                h.estado = 'medido';
                h.por_que = 'confirmado por el certificador';
            }
            hs[i] = h;
            return { ...v, [planta]: hs };
        });
    }

    function confirmaLucernario(planta, i) {
        setLucernarios(v => {
            const hs = [...(v[planta] || [])];
            if (!hs[i]) return v;
            hs[i] = { ...hs[i], estado: 'medido', por_que: 'dada por buena por el certificador' };
            return { ...v, [planta]: hs };
        });
    }

    function duplicaLucernario(planta, i) {
        setLucernarios(v => {
            const hs = [...(v[planta] || [])];
            const h = hs[i];
            if (!h) return v;
            const nombre = nuevoLucernario(nombresUsados(v)).nombre;
            hs.splice(i + 1, 0, {
                ...h, uid: nuevoUid(), nombre,
                por_que: h.estado === 'medido' ? `copiado de ${h.nombre}, misma medida` : h.por_que,
            });
            return { ...v, [planta]: hs };
        });
    }

    function quitaLucernario(planta, i) {
        setLucernarios(v => {
            const hs = [...(v[planta] || [])];
            hs.splice(i, 1);
            const n = { ...v };
            if (hs.length) n[planta] = hs; else delete n[planta];
            return n;
        });
    }

    /** Quita TODOS los lucernarios de una planta (los que se quedaron sin tejado). */
    function quitaLucernariosDe(planta) {
        setLucernarios(v => { const n = { ...v }; delete n[planta]; return n; });
    }

    /** Una medianera lo es por lo que hay AL OTRO LADO, no por tocar. */
    function marcaComoParticion(id, si) {
        setMuros(v => ({ ...v, [id]: { ...v[id], como_particion: si } }));
    }

    /**
     * Apartar una pared de la envolvente.
     *
     * Catastro dibuja el perímetro de lo CONSTRUIDO, y ahí dentro hay cosas que
     * no son la vivienda: el garaje, un trastero, un porche cerrado. Sus muros
     * salen medidos y clasificados como cualquier otro —los de fuera, además,
     * como fachada, porque geométricamente dan a la calle— pero NO forman parte
     * de la envolvente del espacio habitable: escribirlos infla la superficie de
     * pérdidas y con ella la demanda del certificado.
     *
     * No es un cuarto valor de «da contra»: eso dice QUÉ HAY al otro lado, y
     * esto dice si la pared cuenta. Una pared apartada se dibuja igual —para
     * poder encontrarla y devolverla— pero no viaja al `.cex`, ni ella ni sus
     * huecos.
     */
    function apartaDeLaEnvolvente(id, si) {
        setMuros(v => ({ ...v, [id]: { ...v[id], excluida: !!si } }));
    }

    /**
     * Deja FUERA de la envolvente un cuerpo entero del edificio, o lo devuelve.
     *
     * Es la decisión que antes costaba cuatro clics y acertar con qué paredes
     * eran del garaje. Cambiarlo obliga a volver a MEDIR —lo hace la vista—:
     * la pared que separaba el garaje de la casa aparece entonces como lo que
     * es, y se van con él su cubierta y su suelo.
     */
    function sacaCuerpo(id, fuera = true) {
        if (!id) return;
        setCuerposFuera(v => (fuera ? [...new Set([...v, id])] : v.filter(x => x !== id)));
    }

    /**
     * La otra salida: APARTAR sus paredes sin volver a medir.
     *
     * Es instantáneo y usa el mecanismo de siempre (`excluir_ids`), pero la
     * pared que separaba el cuerpo del resto NO existe en el modelo —Catastro
     * une los dos y esa línea queda dentro—, así que la casa se queda abierta
     * por ahí y hay que dibujarla. Por eso no es lo que se ofrece primero.
     *
     * REGLA — solo las paredes de las PLANTAS donde ese cuerpo no cuenta. Un
     * garaje con vivienda encima es un prisma de dos plantas: apartar las
     * suyas sin mirar el nivel se lleva por delante las fachadas reales de la
     * planta de arriba, que es vivienda. Sin `niveles` se aparta todo, que es
     * lo correcto para un cuerpo que sobra en todas sus plantas.
     */
    function apartaParedesDe(cuerpo, si = true, niveles = null) {
        if (!cuerpo) return;
        const aqui = (m) => !Array.isArray(niveles) || niveles.includes(m.nivel);
        setMuros(v => Object.fromEntries(Object.entries(v).map(([k, m]) => (
            m.cuerpo === cuerpo && aqui(m) ? [k, { ...m, excluida: !!si }] : [k, m]))));
    }

    /**
     * Reclasificar una pared: fachada · medianera · partición.
     *
     * Lo que Catastro dice de una pared es una deducción geométrica —hay
     * edificio pegado al otro lado, o no— y a veces se equivoca: un cobertizo
     * sin dar de alta convierte una medianera en fachada, y un patio compartido
     * al revés. Con los colindantes a la vista, esto es lo que deja corregirlo.
     * `null` devuelve la pared a lo que dice Catastro.
     */
    function reclasifica(id, tipo) {
        setMuros(v => {
            const m = v[id];
            const efectivo = tipo || m.tipo;
            // El nombre lleva la inicial de lo que ES: `FBE1` pasa a `PBE1` al
            // convertirse en partición. Es lo que se va a ver en CE3X y lo que
            // dice de un vistazo qué es cada cerramiento. Se PROPONE: si el
            // certificador ya le puso nombre a mano, no se le pisa.
            const auto = inicialDe(m.id, efectivo);
            const suyo = m.nombre_manual && m.nombre_manual !== inicialDe(m.id, tipoDe(m));
            return { ...v, [id]: { ...m, tipo_manual: tipo || null,
                nombre_manual: suyo ? m.nombre_manual : (auto === m.id ? null : auto) } };
        });
    }

    /**
     * Hacia dónde da esta pared. `null` la devuelve a lo que diga la geometría.
     *
     * Solo hace falta preguntarlo en las paredes que no traen rumbo: una
     * partición vertical y una pared dibujada nacen sin él —no salen de ningún
     * polígono, así que no hay normal exterior de la que sacarlo— y al pasarlas
     * a FACHADA nadie se lo preguntaba. Con el rumbo vacío, el motor moría en
     * un `KeyError(None)` que llegaba a la pantalla como un escueto «None».
     */
    function orienta(id, rumbo) {
        setMuros(v => ({ ...v, [id]: { ...v[id], orientacion_manual: rumbo || null } }));
    }

    /**
     * La U de UNA pared. `null` la devuelve a la de su época.
     *
     * La tabla vale para el edificio, pero una pared puede estar aislada y las
     * demás no —una fachada rehecha, un patio cerrado después— y escribirlas
     * todas iguales es declarar un edificio que no existe.
     */
    function ponU(id, u) {
        setMuros(v => ({ ...v, [id]: { ...v[id], u_manual: u === null ? null : Number(u) } }));
    }

    /**
     * Mueve una pared: sus dos extremos pasan a estar DONDE SE HAN SOLTADO.
     *
     * Lo que Catastro dibuja es el perímetro de lo construido y se equivoca —
     * un tabique que se ve perfectamente sobre la cartografía está medio metro
     * a un lado—. Con el plano y el Catastro debajo, el certificador lo ve.
     *
     * Se vuelve a medir en el mismo gesto y se marca: de aquí sale una
     * superficie que va al certificado, así que no puede cambiar en silencio.
     * `null` la devuelve a donde la puso Catastro.
     */
    function muevePared(id, pts) {
        const puntos = pts && pts.length >= 2 ? pts.map(q => [q[0], q[1]]) : null;
        setGeometria(g => {
            // Una pared DIBUJADA no tiene un sitio de Catastro al que volver:
            // los puntos que se acaban de soltar SON su geometría, así que se
            // escriben donde vive, no como una corrección encima. Con las dos
            // capas, moverla no hacía nada: `plantas` lee su trazado de
            // `dibujadas` y nunca miraba la corrección.
            if (g.dibujadas.some(d => d.id === id)) {
                return { ...g, dibujadas: g.dibujadas.map(
                    d => (d.id === id && puntos ? { ...d, svg: puntos } : d)) };
            }
            const movidas = { ...g.movidas };
            if (puntos) movidas[id] = puntos; else delete movidas[id];
            return { ...g, movidas };
        });
        setMuros(v => {
            const m = v[id];
            if (!m) return v;
            // La medida se calcula UNA vez y se escribe en los dos sitios que
            // la leen —el plano y el panel—, con la misma función.
            const medida = puntos ? medirPared(puntos, m.alto)
                : { largo: m.largo_catastro ?? m.largo,
                    superficie: m.superficie_catastro ?? m.superficie };
            return { ...v, [id]: {
                ...m,
                largo_catastro: m.largo_catastro ?? m.largo,
                superficie_catastro: m.superficie_catastro ?? m.superficie,
                // El trazado también, para que no queden dos versiones de la
                // misma pared según por dónde se mire.
                ...(puntos ? { svg: puntos } : {}),
                movida: !!puntos && !m.dibujada, ...medida,
            } };
        });
    }

    /**
     * Dibuja una pared nueva, de pared a pared.
     *
     * Nace como PARTICIÓN: es lo que se dibuja dentro de un edificio, y además
     * es el único tipo que no necesita orientación —la de una fachada es la de
     * su normal exterior y aquí no hay polígono del que sacarla—. Si de verdad
     * es otra cosa, se reclasifica con el mismo control que las demás.
     */
    function dibujaPared(planta, a, b) {
        const pts = [[a[0], a[1]], [b[0], b[1]]];
        if (largoDe(pts) < LARGO_MINIMO_PARED) return null;
        const hermanas = (plantas.find(p => p.id === planta)?.muros) || [];
        const alto = hermanas.map(m => Number(m.alto)).find(n => n > 0) || null;
        const id = nombreLibre(planta, muros);
        const nueva = { id, planta, nivel: hermanas[0]?.nivel ?? null,
                        tipo: 'PARTICION_VERTICAL', subtipo: 'DIBUJADA',
                        alto, svg: pts };
        setGeometria(g => ({ ...g, dibujadas: [...g.dibujadas, nueva] }));
        setMuros(v => ({ ...v, [id]: paredDibujada(nueva) }));
        setSel(id);
        return id;
    }

    /** Borra una pared DIBUJADA. Las de Catastro no se borran: se apartan. */
    function borraPared(id) {
        setGeometria(g => ({ ...g, dibujadas: g.dibujadas.filter(d => d.id !== id) }));
        setMuros(v => { const c = { ...v }; delete c[id]; return c; });
        setSel(s => (s === id ? null : s));
        setEntrada(e => (e === id ? null : e));
    }

    /** El nombre que se escribe en el .cex. `null` devuelve el de Catastro. */
    function renombra(id, nombre) {
        setMuros(v => ({ ...v, [id]: { ...v[id], nombre_manual: limpiaNombre(nombre) || null } }));
    }

    /**
     * Cuántos pilares tiene esta fachada por dentro.
     *
     * El motor PROPONE uno cada 3,5 m, que es la luz habitual de una vivienda y
     * la separación mediana de los 32 .cex del corpus que los llevan. Pero el
     * número real lo cuenta quien tiene la fachada delante, así que se puede
     * corregir — y poner 0 los quita.
     *
     * `null` devuelve la estimación: decir «no lo he contado» tiene que costar
     * lo mismo que contarlos.
     */
    function ponPilares(id, n) {
        const v = n === null || n === '' ? null : Math.max(0, Math.round(Number(n)));
        setMuros(m => (m[id]
            ? { ...m, [id]: { ...m[id], pilares: Number.isFinite(v) ? v : null } }
            : m));
    }

    /**
     * Lo que se señala AQUÍ y el motor no puede saber: los huecos, por dónde
     * se entra y qué medianeras dan a un espacio no habitable. La traducción
     * vive en `senalado.js` (pura), que es la que usa también la skill que
     * genera el CEE inicial desde Node.
     */
    function loSenalado(ajustes = null, { lienzoAMundo = null } = {}) {
        return senaladoDe({ muros, entrada, geometria, cubiertas, lucernarios, cubiertasDePlanta },
                          ajustes, { lienzoAMundo });
    }

    return {
        plantas, lienzo, contexto, entorno, muros, entrada, sel, resumen, trabajo,
        setEntrada, setSel,
        elegir, ponHuecos, cambiaHueco, duplicaHueco, quitaHueco, mueveHueco,
        confirmaHueco, confirmaPared,
        aplicaHuecosLeidos, anotaLecturaHueco, mudaHueco, destinosDeHueco,
        muevePared, dibujaPared, borraPared, esDibujada,
        marcaComoParticion, marcaRevisada, siguientePorMirar,
        marcaCambia, marcaHuecoCambia, ponCarpinteria, quitaCarpinteriaPropia,
        cubiertas, ponCubierta, quitaCubierta,
        lucernarios, cubiertasDePlanta, lucernariosSinCubierta,
        anadeLucernario, cambiaLucernario, confirmaLucernario, duplicaLucernario,
        quitaLucernario, quitaLucernariosDe,
        apartaDeLaEnvolvente, reclasifica, renombra, ponU, orienta, ponPilares,
        cuerposFuera, sacaCuerpo, apartaParedesDe,
        recorte, zonasFuera, setZonasFuera, refLienzo,
        huerfanos, recuperaHuerfanos, descartaHuerfanos,
        loSenalado, restaurar,
        esCandidata, esMedianera, esParticion, esFuera, tipoDe, nombreDe, estadoDe,
        rumboDe, necesitaRumbo, rumbosDe,
    };
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

//: Qué ES cada pared —y las tres cosas que puede ser (`TIPOS_PARED`)— vive en
//: `tiposPared.js`, que no importa React y por eso se puede comprobar desde
//: Node y usarlo la página del MÓVIL. Se reexporta para que quien ya lo
//: importaba de aquí siga igual.
export { TIPOS_PARED, tipoDe, esFuera, esMedianera, esParticion, admiteHuecos } from './tiposPared.js';

//: Lo que cabe en el nombre de un cerramiento de CE3X.
//:
//: **Los ESPACIOS valen**, y no es un detalle: los nombres que escribe el propio
//: motor los llevan (`FBS1 ESPACIO_LIBRE_PARCELA`, `SUB1 SUELO EN TERRENO`), así
//: que prohibirlos impedía escribir a mano lo mismo que la app escribe sola.
//: Medido en 26RES093_8, donde el certificador quería `FBX1 GARAJE ABIERTO` y la
//: casilla se lo dejaba en `FBX1GARAJEABIERTO`.
//:
//: El tope son 40: el más largo que compone la app son 26 caracteres, y un
//: nombre que no cabe en el árbol de CE3X no se lee mejor por ser más largo.
const NOMBRE_VALIDO = /[^A-ZÁÉÍÓÚÜÑ0-9 ._-]/g;
const NOMBRE_MAX = 40;

/** Deja el nombre como CE3X lo admite. NO recorta los extremos: con el espacio
 *  final comido no se puede teclear la segunda palabra. */
export function limpiaNombre(nombre) {
    return String(nombre || '').toUpperCase().replace(NOMBRE_VALIDO, '').slice(0, NOMBRE_MAX);
}

// `nombreDe`, `esNombrePropio` y `rumboDe` viven en `senalado.js` (puro).

/**
 * ¿Hay que preguntarle a dónde da?
 *
 * Solo una FACHADA necesita rumbo: de él cuelga la ganancia solar de sus
 * huecos, y CE3X lo exige. Una medianera es adiabática y una partición da a un
 * local, así que ninguna de las dos lo lleva —y por eso nacen sin él, que es
 * justo lo que hacía reventar al reclasificarlas—.
 */
export function necesitaRumbo(m) {
    return !esFuera(m) && tipoDe(m) === 'FACHADA' && !rumboDe(m);
}

/** Los dos rumbos posibles de una pared, de su propio trazo sobre el plano. */
export function rumbosDe(m) { return rumbosDeLaPared(m?.svg); }

/**
 * Lo MÁS PROBABLE, no lo único posible. Es una sugerencia.
 *
 * NUNCA se usa para filtrar lo que se puede pulsar: en Los Yébenes la puerta
 * estaba en un retranqueo, que Catastro clasifica como PATIO, y con este
 * filtro la respuesta correcta no salía.
 */
export function esCandidata(m) {
    return !esFuera(m) && m.subtipo === 'CALLE' && m.nivel === 0 &&
           (m.largo || 0) >= ANCHO_MINIMO_ENTRADA;
}

/**
 * ¿Está esta pared FUERA de la envolvente?
 *
 * Dos caminos y el mismo resultado: lo que el motor ya devuelve apartado
 * (`fuera`) y lo que aparta el certificador desde el panel (`excluida`).
 */

export function estadoDe(m) {
    if (esFuera(m)) return 'fuera';
    // Una medianera no lleva huecos: da contra el edificio de al lado. No está
    // "sin tocar", está resuelta.
    if (esMedianera(m) || esParticion(m)) return 'medido';
    // Sin huecos y REVISADA es una fachada ciega mirada y resuelta, no una
    // pared a medias: en el plano deja de pedir atención.
    if (!(m.huecos || []).length) return m.revisada ? 'medido' : 'falta';
    if (m.huecos.some(h => h.estado !== 'medido')) return 'dudoso';
    return 'medido';
}

// ─── Interno ─────────────────────────────────────────────────────────────────

/**
 * El tamaño del dibujo, en metros. Manda lo que diga el motor.
 *
 * El respaldo NO mide el edificio —eso es del motor y no se repite aquí—: lee
 * la caja de los puntos que YA vienen colocados, y solo existe para que un
 * motor sin este campo deje el plano pequeño en vez de dejarlo invisible. Un
 * `viewBox` con `undefined` no lo dibuja el navegador y no avisa de nada.
 */
function medidaDelLienzo(geo, plantas) {
    const ancho = Number(geo?.ancho) || 0;
    const alto = Number(geo?.alto) || 0;
    if (ancho > 0 && alto > 0) return { ancho, alto };

    const pts = plantas.flatMap(p => p.muros.flatMap(m => m.svg || []));
    if (!pts.length) return { ancho: 0, alto: 0 };
    const holgura = 1.1;   // los rótulos del borde se salen si se ajusta al ras
    return {
        ancho: Math.max(...pts.map(q => q[0])) * holgura,
        alto: Math.max(...pts.map(q => q[1])) * holgura,
    };
}

// `nuevoUid`, `rescatarHueco`, `medirPared`, `paredDibujada` y `esDibujada`
// viven en `senalado.js`: los usa también la siembra desde Node.

/**
 * El nombre de una pared dibujada.
 *
 * Misma forma que las del motor —inicial del tipo, letra de la planta y un
 * número— con una `X` donde iría la orientación: esa pared no tiene, porque no
 * sale de ningún polígono. Y así no puede chocar con ninguna de Catastro, que
 * llevan siempre una de las ocho (N, NE, E…).
 */
function nombreLibre(planta, muros) {
    const letra = planta === 'PB' ? 'B' : String(planta || '').replace(/^P/, '');
    const usados = new Set(Object.keys(muros || {}));
    let n = 1;
    while (usados.has(`P${letra}X${n}`)) n++;
    return `P${letra}X${n}`;
}

function nuevoHueco(tipo, muros) {
    const letra = tipo === 'puerta' ? 'P' : 'V';
    const usados = new Set();
    for (const m of Object.values(muros || {})) {
        for (const h of m.huecos || []) usados.add(h.nombre);
    }
    let n = 1;
    while (usados.has(letra + n)) n++;
    // Un tipo que no conocemos no puede tumbar la ventana: se cae a la ventana,
    // que es el caso común, y la medida se confirma como cualquier otra.
    const [a, b] = POR_DEFECTO[tipo] || POR_DEFECTO.ventana;
    return {
        uid: nuevoUid(),
        nombre: letra + n, tipo, ancho: a, alto: b, estado: 'dudoso',
        por_que: `medida por defecto (${fmt(a)} × ${fmt(b)} m): confírmala`,
    };
}

const fmt = n => Number(n).toFixed(2).replace('.', ',');

/**
 * Quita lo que está en blanco.
 *
 * El trabajo del plano se GUARDA en `expedientes.cee.envolvente` y son ~2 KB de
 * metadatos a propósito. Media docena de claves a `null` por hueco, en una casa
 * con veinte, es engordar la columna con nada — y esa columna ya tiene su
 * historia (regla 21). Un objeto que se queda vacío no se guarda.
 */
function recorta(o) {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) {
        if (v !== null && v !== undefined && v !== '') out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
}
