import { useEffect, useMemo, useState } from 'react';
import { largo as largoDe } from './geometriaPlano';

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
const POR_DEFECTO = { puerta: [0.90, 2.10], ventana: [1.30, 1.30] };

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

    // Al llegar la geometría se monta el estado, y encima se vuelve a poner lo
    // que ya hubiera guardado: reabrir la pestaña no puede borrar su trabajo.
    useEffect(() => {
        if (!geo) return;
        const nuevo = {};
        for (const p of plantasDe(geo)) {
            for (const m of p.muros) nuevo[m.id] = { ...m, huecos: [] };
        }
        try {
            // Manda lo guardado en el EXPEDIENTE; el localStorage es el
            // respaldo de lo que aún no se ha llegado a guardar (o de un
            // guardado que falló).
            const local = JSON.parse(localStorage.getItem(clave) || 'null');
            const g = guardado || local;
            if (g) {
                setEntrada(g.entrada ?? null);
                setSel(g.sel ?? null);
                for (const [k, v] of Object.entries(g.huecos || {})) {
                    if (nuevo[k]) nuevo[k].huecos = (v || []).map(rescatarHueco);
                }
                for (const k of g.particiones || []) {
                    if (nuevo[k]) nuevo[k].como_particion = true;
                }
                for (const k of g.excluidas || []) {
                    if (nuevo[k]) nuevo[k].excluida = true;
                }
                for (const [k, t] of Object.entries(g.tipos || {})) {
                    if (nuevo[k]) nuevo[k].tipo_manual = t;
                }
                for (const [k, n] of Object.entries(g.nombres || {})) {
                    if (nuevo[k]) nuevo[k].nombre_manual = n;
                }
                for (const [k, u] of Object.entries(g.us || {})) {
                    if (nuevo[k]) nuevo[k].u_manual = u;
                }
                // Las paredes movidas y las dibujadas. Las dibujadas ENTRAN en
                // el mapa de muros: para la vista son una pared más —se pulsan,
                // llevan huecos y se reclasifican— y lo único que las separa es
                // que las puso una persona.
                const geoGuardada = { movidas: { ...(g.paredes?.movidas || {}) },
                                      dibujadas: [] };
                for (const d of g.paredes?.dibujadas || []) {
                    if (!d?.id || nuevo[d.id]) continue;
                    geoGuardada.dibujadas.push(d);
                    nuevo[d.id] = paredDibujada(d, g.huecos?.[d.id]);
                }
                for (const [k, pts] of Object.entries(geoGuardada.movidas)) {
                    if (!nuevo[k]) { delete geoGuardada.movidas[k]; continue; }
                    // La marca y la medida de Catastro se rehacen AQUÍ, no solo
                    // al arrastrar: si no, al recargar la pared aparecía movida
                    // pero sin decirlo, que es justo lo que no puede pasar con
                    // una superficie que va al certificado.
                    Object.assign(nuevo[k], {
                        movida: true, svg: pts,
                        largo_catastro: nuevo[k].largo,
                        superficie_catastro: nuevo[k].superficie,
                    }, medirPared(pts, nuevo[k].alto));
                }
                setGeometria(geoGuardada);
            }
        } catch { /* almacenamiento bloqueado: se empieza limpio */ }
        setMuros(nuevo);
    }, [geo, clave, guardado]);

    const trabajo = useMemo(() => (Object.keys(muros).length ? {
        entrada, sel,
        huecos: Object.fromEntries(
            Object.entries(muros).map(([k, m]) => [k, m.huecos])),
        particiones: Object.values(muros)
            .filter(m => m.como_particion).map(m => m.id),
        excluidas: Object.values(muros)
            .filter(m => m.excluida).map(m => m.id),
        tipos: Object.fromEntries(Object.values(muros)
            .filter(m => m.tipo_manual).map(m => [m.id, m.tipo_manual])),
        nombres: Object.fromEntries(Object.values(muros)
            .filter(m => m.nombre_manual).map(m => [m.id, m.nombre_manual])),
        us: Object.fromEntries(Object.values(muros)
            .filter(m => Number.isFinite(m.u_manual)).map(m => [m.id, m.u_manual])),
        // La geometría corregida. Se guarda con el trabajo porque es TRABAJO:
        // volver a colocar un tabique y perderlo al recargar sería peor que no
        // poder moverlo.
        paredes: geometria,
    } : null), [muros, entrada, sel, geometria]);

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
                tipos: Object.fromEntries(Object.values(muros)
                    .filter(m => m.tipo_manual).map(m => [m.id, m.tipo_manual])),
                nombres: Object.fromEntries(Object.values(muros)
                    .filter(m => m.nombre_manual).map(m => [m.id, m.nombre_manual])),
                us: Object.fromEntries(Object.values(muros)
                    .filter(m => Number.isFinite(m.u_manual)).map(m => [m.id, m.u_manual])),
                paredes: geometria,
            }));
        } catch { /* idem */ }
    }, [muros, entrada, sel, clave, geometria]);

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
        for (const m of lista) {
            for (const h of m.huecos || []) {
                if (h.estado === 'medido') medidos++; else dudosos++;
                m2 += (Number(h.ancho) || 0) * (Number(h.alto) || 0);
            }
        }
        const sinTocar = lista.filter(
            m => !esMedianera(m) && !(m.huecos || []).length).length;
        const fuera = Object.values(muros).filter(m => esFuera(m)).length;
        return { medidos, dudosos, sinTocar, fuera,
                 m2Hueco: m2.toFixed(1).replace('.', ',') };
    }, [muros]);

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

    function quitaHueco(id, i) {
        setMuros(v => {
            const huecos = [...(v[id].huecos || [])];
            huecos.splice(i, 1);
            return { ...v, [id]: { ...v[id], huecos } };
        });
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
        if (largoDe(pts) < LARGO_MINIMO) return null;
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
        const limpio = String(nombre || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
        setMuros(v => ({ ...v, [id]: { ...v[id], nombre_manual: limpio || null } }));
    }

    /**
     * Lo que se señala AQUÍ y el motor no puede saber: los huecos, por dónde
     * se entra y qué medianeras dan a un espacio no habitable.
     *
     * El resto de la ficha —titular, zona climática, transmitancias— NO se
     * compone aquí: lo hace el backend desde el expediente (`fichaCe3x.js`).
     * Que el navegador mandase las U sería dejar que el certificado se
     * escribiera con las que quisiera quien tenga la sesión abierta.
     */
    function loSenalado() {
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
                    id: h.nombre, cerramiento: nombreDe(m),
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
                    // Una puerta de entrada es casi toda opaca: 90% de marco,
                    // no el 20% de una ventana.
                    ...(esPuerta ? { porc_marco: '90', marco: 'Madera' } : {}),
                    de: h.estado === 'medido'
                        ? 'SEÑALADO EN LA VISTA DEL CERTIFICADOR'
                        : 'SEÑALADO EN LA VISTA, medida POR CONFIRMAR',
                });
            }
        }
        const reclasificar = {};
        const renombrar = {};
        const u_por_cerramiento = {};
        for (const m of Object.values(muros)) {
            if (m.tipo_manual && m.tipo_manual !== m.tipo) reclasificar[m.id] = m.tipo_manual;
            if (m.nombre_manual && m.nombre_manual !== m.id) renombrar[m.id] = m.nombre_manual;
            if (Number.isFinite(m.u_manual)) u_por_cerramiento[m.id] = m.u_manual;
        }
        // Las paredes movidas y las dibujadas, con sus dos extremos TAL CUAL se
        // han soltado sobre el plano. Aquí NO se manda ni un largo ni una
        // superficie: eso lo mide el motor (`aplicar_paredes`), que es donde se
        // miden todas las demás. Las coordenadas son las del lienzo, y un metro
        // del lienzo es un metro del edificio — es el mundo trasladado y con la
        // Y del revés, y eso conserva las distancias.
        const paredes = {
            movidas: Object.fromEntries(Object.entries(geometria.movidas)
                .filter(([k]) => muros[k] && !esFuera(muros[k]))
                .map(([k, pts]) => [k, { lienzo: pts }])),
            nuevas: geometria.dibujadas
                .filter(d => muros[d.id] && !esFuera(muros[d.id]))
                .map(d => ({
                    id: nombreDe(muros[d.id]), planta: d.planta, nivel: d.nivel,
                    tipo: tipoDe(muros[d.id]), lienzo: d.svg,
                })),
        };
        return {
            huecos,
            paredes,
            entrada: { valor: entrada, de: 'SEÑALADO POR EL CERTIFICADOR' },
            medianeras_como_particion: Object.values(muros)
                .filter(m => esMedianera(m) && m.como_particion).map(m => m.id),
            // Las que el certificador ha apartado. El motor ya sabe saltárselas
            // (`excluir_ids` en `generar_cex.py`): aquí solo hay que decírselo.
            excluir_ids: {
                ids: Object.values(muros).filter(m => esFuera(m)).map(m => m.id),
                de: 'APARTADAS POR EL CERTIFICADOR: no son del espacio habitable',
            },
            reclasificar, renombrar, u_por_cerramiento,
        };
    }

    return {
        plantas, lienzo, contexto, entorno, muros, entrada, sel, resumen, trabajo,
        setEntrada, setSel,
        elegir, ponHuecos, cambiaHueco, duplicaHueco, quitaHueco, mueveHueco,
        confirmaHueco, confirmaPared,
        muevePared, dibujaPared, borraPared, esDibujada,
        marcaComoParticion,
        apartaDeLaEnvolvente, reclasifica, renombra, ponU,
        loSenalado,
        esCandidata, esMedianera, esParticion, esFuera, tipoDe, nombreDe, estadoDe,
    };
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

//: Las tres cosas que puede ser una pared, y lo que significa cada una en el
//: cálculo. El rótulo dice CONTRA QUÉ da, no cómo se llama en la norma: es lo
//: que el certificador está mirando en el plano.
//:
//: Vive AQUÍ, con `tipoDe`, porque lo leen tres sitios —el panel, el tooltip del
//: plano y su leyenda— y tres copias acabarían llamando a lo mismo de tres
//: maneras dentro de la misma pantalla.
export const TIPOS_PARED = [
    { id: 'FACHADA', etiqueta: 'Al exterior',
      ayuda: 'Da a la calle o a un patio: pierde calor al aire' },
    { id: 'MEDIANERA', etiqueta: 'Al vecino',
      ayuda: 'Da contra otra vivienda a la misma temperatura: no pierde calor' },
    { id: 'PARTICION_VERTICAL', etiqueta: 'A un local',
      ayuda: 'Da a un garaje, trastero o local sin calefactar: sí pierde calor' },
];

/** El tipo con el que se va a escribir: manda el certificador sobre Catastro. */
export function tipoDe(m) { return m?.tipo_manual || m?.tipo; }

/** Cómo se va a llamar en CE3X. */
export function nombreDe(m) { return m?.nombre_manual || m?.id; }

//: La inicial que le corresponde a cada tipo. La nomenclatura del motor ya la
//: usa: `F` fachada, `M` medianera; `P` es la de las particiones del .cex real
//: de un certificador (`PH01`, `PV01`).
const INICIAL = { FACHADA: 'F', MEDIANERA: 'M', PARTICION_VERTICAL: 'P' };

function inicialDe(id, tipo) {
    const letra = INICIAL[tipo];
    return letra && id ? letra + String(id).slice(1) : id;
}

export function esMedianera(m) { return tipoDe(m) === 'MEDIANERA'; }

export function esParticion(m) { return tipoDe(m) === 'PARTICION_VERTICAL'; }

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
export function esFuera(m) { return !!(m?.fuera || m?.excluida); }

export function estadoDe(m) {
    if (esFuera(m)) return 'fuera';
    // Una medianera no lleva huecos: da contra el edificio de al lado. No está
    // "sin tocar", está resuelta.
    if (esMedianera(m) || esParticion(m)) return 'medido';
    if (!(m.huecos || []).length) return 'falta';
    if (m.huecos.some(h => h.estado !== 'medido')) return 'dudoso';
    return 'medido';
}

// ─── Interno ─────────────────────────────────────────────────────────────────

function plantasDe(geo) {
    return geo?.plantas || geo?.geometria?.plantas || [];
}

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

/** El nombre del hueco es lo que CE3X enseña y lo que enlaza sus puentes
 *  térmicos: tiene que ser único en todo el edificio. */
/**
 * Un hueco guardado, devuelto a minúsculas.
 *
 * `normalizeData` subía `cee` entera a MAYÚSCULAS cuando el detalle del
 * expediente autoguardaba, y con `tipo: 'VENTANA'` duplicar un hueco tumbaba la
 * pantalla —`POR_DEFECTO['VENTANA']` es undefined—. La clave ya está protegida
 * en el backend, pero lo que se guardó así sigue en la BD y tiene que poder
 * abrirse: esto lo rescata al leer, sin tocar nada más.
 */
function rescatarHueco(h) {
    const baja = (x) => (typeof x === 'string' ? x.toLowerCase() : x);
    return { ...h, tipo: baja(h?.tipo), estado: baja(h?.estado) };
}

/** Menos de esto no es una pared: es un resbalón del ratón. */
const LARGO_MINIMO = 0.2;

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
function paredDibujada(d, huecos) {
    return {
        id: d.id, planta: d.planta, nivel: d.nivel ?? null,
        tipo: d.tipo || 'PARTICION_VERTICAL', subtipo: 'DIBUJADA',
        orientacion: '—', alto: d.alto ?? null, svg: d.svg,
        dibujada: true, huecos: (huecos || []).map(rescatarHueco),
        ...medirPared(d.svg, d.alto),
    };
}

export function esDibujada(m) { return !!m?.dibujada; }

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
        nombre: letra + n, tipo, ancho: a, alto: b, estado: 'dudoso',
        por_que: `medida por defecto (${fmt(a)} × ${fmt(b)} m): confírmala`,
    };
}

const fmt = n => n.toFixed(2).replace('.', ',');
