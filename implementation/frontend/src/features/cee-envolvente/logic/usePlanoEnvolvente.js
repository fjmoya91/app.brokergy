import { useEffect, useMemo, useState } from 'react';

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

export function usePlanoEnvolvente(geo, expedienteId) {
    const clave = `brokergy-envolvente-${expedienteId}`;

    const [muros, setMuros] = useState({});
    const [entrada, setEntrada] = useState(null);
    const [sel, setSel] = useState(null);

    // Al llegar la geometría se monta el estado, y encima se vuelve a poner lo
    // que ya hubiera guardado: reabrir la pestaña no puede borrar su trabajo.
    useEffect(() => {
        if (!geo) return;
        const nuevo = {};
        for (const p of plantasDe(geo)) {
            for (const m of p.muros) nuevo[m.id] = { ...m, huecos: [] };
        }
        try {
            const g = JSON.parse(localStorage.getItem(clave) || 'null');
            if (g) {
                setEntrada(g.entrada ?? null);
                setSel(g.sel ?? null);
                for (const [k, v] of Object.entries(g.huecos || {})) {
                    if (nuevo[k]) nuevo[k].huecos = v;
                }
                for (const k of g.particiones || []) {
                    if (nuevo[k]) nuevo[k].como_particion = true;
                }
            }
        } catch { /* almacenamiento bloqueado: se empieza limpio */ }
        setMuros(nuevo);
    }, [geo, clave]);

    useEffect(() => {
        if (!Object.keys(muros).length) return;
        try {
            localStorage.setItem(clave, JSON.stringify({
                entrada, sel,
                huecos: Object.fromEntries(
                    Object.entries(muros).map(([k, m]) => [k, m.huecos])),
                particiones: Object.values(muros)
                    .filter(m => m.como_particion).map(m => m.id),
            }));
        } catch { /* idem */ }
    }, [muros, entrada, sel, clave]);

    const plantas = useMemo(() => {
        if (!geo) return [];
        // El sótano no se dibuja: no es espacio habitable y no va a la envolvente.
        return plantasDe(geo).filter(p => p.habitable !== false);
    }, [geo]);

    const resumen = useMemo(() => {
        const lista = Object.values(muros).filter(m => !m.fuera);
        let medidos = 0, dudosos = 0, m2 = 0;
        for (const m of lista) {
            for (const h of m.huecos || []) {
                if (h.estado === 'medido') medidos++; else dudosos++;
                m2 += (Number(h.ancho) || 0) * (Number(h.alto) || 0);
            }
        }
        const sinTocar = lista.filter(
            m => !esMedianera(m) && !(m.huecos || []).length).length;
        return { medidos, dudosos, sinTocar, m2Hueco: m2.toFixed(1).replace('.', ',') };
    }, [muros]);

    // ── acciones ─────────────────────────────────────────────────────────────

    function elegir(id) {
        const m = muros[id];
        if (!m || m.fuera) return;
        if (!entrada) {
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

    /** Lo que se le manda al motor: solo lo que el motor no sabe. */
    function fichaParaElMotor(expediente) {
        const huecos = [];
        for (const m of Object.values(muros)) {
            if (m.fuera) continue;
            for (const h of m.huecos || []) {
                const esPuerta = h.tipo === 'puerta';
                huecos.push({
                    id: h.nombre, cerramiento: m.id,
                    ancho: Number(h.ancho), alto: Number(h.alto),
                    tipo: esPuerta ? 'Puerta' : 'Ventana',
                    // Una puerta de entrada es casi toda opaca: 90% de marco,
                    // no el 20% de una ventana.
                    ...(esPuerta ? { porc_marco: '90', marco: 'Madera' } : {}),
                    de: h.estado === 'medido'
                        ? 'SEÑALADO EN LA VISTA DEL CERTIFICADOR'
                        : 'SEÑALADO EN LA VISTA, medida POR CONFIRMAR',
                });
            }
        }
        return {
            ...(expediente?.ce3x_datos || {}),
            envolvente: {
                ...(expediente?.ce3x_datos?.envolvente || {}),
                espacio: 'auto',
                huecos,
                entrada: { valor: entrada, de: 'SEÑALADO POR EL CERTIFICADOR' },
                medianeras_como_particion: Object.values(muros)
                    .filter(m => esMedianera(m) && m.como_particion).map(m => m.id),
            },
        };
    }

    return {
        plantas, muros, entrada, sel, resumen,
        setEntrada, setSel,
        elegir, ponHuecos, cambiaHueco, quitaHueco, marcaComoParticion,
        fichaParaElMotor,
        esCandidata, esMedianera, estadoDe,
    };
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

export function esMedianera(m) { return m?.tipo === 'MEDIANERA'; }

/**
 * Lo MÁS PROBABLE, no lo único posible. Es una sugerencia.
 *
 * NUNCA se usa para filtrar lo que se puede pulsar: en Los Yébenes la puerta
 * estaba en un retranqueo, que Catastro clasifica como PATIO, y con este
 * filtro la respuesta correcta no salía.
 */
export function esCandidata(m) {
    return !m.fuera && m.subtipo === 'CALLE' && m.nivel === 0 &&
           (m.largo || 0) >= ANCHO_MINIMO_ENTRADA;
}

export function estadoDe(m) {
    if (m.fuera) return 'fuera';
    // Una medianera no lleva huecos: da contra el edificio de al lado. No está
    // "sin tocar", está resuelta.
    if (esMedianera(m)) return 'medido';
    if (!(m.huecos || []).length) return 'falta';
    if (m.huecos.some(h => h.estado !== 'medido')) return 'dudoso';
    return 'medido';
}

// ─── Interno ─────────────────────────────────────────────────────────────────

function plantasDe(geo) {
    return geo?.plantas || geo?.geometria?.plantas || [];
}

/** El nombre del hueco es lo que CE3X enseña y lo que enlaza sus puentes
 *  térmicos: tiene que ser único en todo el edificio. */
function nuevoHueco(tipo, muros) {
    const letra = tipo === 'puerta' ? 'P' : 'V';
    const usados = new Set();
    for (const m of Object.values(muros || {})) {
        for (const h of m.huecos || []) usados.add(h.nombre);
    }
    let n = 1;
    while (usados.has(letra + n)) n++;
    const [a, b] = POR_DEFECTO[tipo];
    return {
        nombre: letra + n, tipo, ancho: a, alto: b, estado: 'dudoso',
        por_que: `medida por defecto (${fmt(a)} × ${fmt(b)} m): confírmala`,
    };
}

const fmt = n => n.toFixed(2).replace('.', ',');
