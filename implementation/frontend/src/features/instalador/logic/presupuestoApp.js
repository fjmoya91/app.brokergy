// ─── presupuestoApp.js — lo que la PANTALLA del presupuesto necesita, sin React ──────────
// El texto predefinido y las cuentas son de `presupuesto.js` (lo comparte el servidor y no
// se toca desde aquí). Esto es solo la app: pasar del formulario al cuerpo de la API
// (`entrada`, la forma del contrato), volver de lo guardado al formulario, poner cada error
// del servidor junto a su campo y preparar la «Nueva simulación» con lo del presupuesto.
// Puro y sin dependencias: lo prueba `test_navegacion_instalador.mjs`.
import { conceptosDe, extrasPorDefecto, tipoDe, extrasDe } from './presupuesto.js';

const txt = (v) => (v === null || v === undefined ? '' : String(v));
const recorta = (v) => txt(v).trim();

export const CLIENTE_VACIO = { nombre: '', apellidos: '', dni: '', tlf: '', email: '', direccion: '', codigo_postal: '', municipio: '', provincia: '' };
export const DIR_VACIA = { direccion: '', codigo_postal: '', municipio: '', provincia: '' };

/** Una ficha de cliente (la del CRM, `GET /api/clientes`, o la que devuelva el servidor) → lo que se imprime. */
export function clienteDeFicha(c) {
    if (!c || typeof c !== 'object') return null;
    return {
        id: c.id_cliente ?? c.id ?? null,
        nombre: txt(c.nombre_razon_social ?? c.nombre),
        apellidos: txt(c.apellidos),
        dni: txt(c.dni ?? c.nif),
        tlf: txt(c.tlf ?? c.telefono),
        email: txt(c.email),
        direccion: txt(c.direccion),
        codigo_postal: txt(c.codigo_postal),
        municipio: txt(c.municipio),
        provincia: txt(c.provincia),
    };
}

/** ¿La ficha trae una dirección con la que se pueda imprimir la obra? */
export const tieneDireccion = (c) => !!(recorta(c?.direccion) && (recorta(c?.municipio) || recorta(c?.codigo_postal)));

const obraVacia = () => ({
    tipo: 'aerotermia', acs: false, emisor: 'radiadores', caldera: { combustible: 'gasoleo' },
    equipo: { aerotermia_id: null, marca: '', modelo: '', potencia_kw: '', litros: '' },
    extras: null, descripcion: '', oportunidad: null,
});

function obraDeEntrada(o = {}) {
    const base = obraVacia();
    const tipo = tipoDe(o);
    const obra = {
        ...base,
        tipo,
        acs: o.acs === true || txt(o.tipo).toLowerCase() === 'aerotermia_acs',
        emisor: o.emisor || base.emisor,
        caldera: { combustible: o.caldera?.combustible || base.caldera.combustible },
        equipo: {
            aerotermia_id: o.equipo?.aerotermia_id ?? null,
            marca: txt(o.equipo?.marca), modelo: txt(o.equipo?.modelo),
            potencia_kw: o.equipo?.potencia_kw ?? '', litros: o.equipo?.litros ?? '',
        },
        descripcion: txt(o.descripcion),
        oportunidad: o.oportunidad ?? null,
    };
    obra.extras = Array.isArray(o.extras) ? o.extras.map((x) => ({ ...x })) : extrasPorDefecto(obra);
    return obra;
}

/**
 * El estado del formulario. `opciones` es lo de `GET /presupuestos/nuevo` y `entrada`, lo de un
 * presupuesto guardado (al cambiarlo o al hacer otro igual). `cliente` = la ficha desde la que se entra.
 */
export function estadoInicial({ opciones = {}, entrada = null, cliente = null } = {}) {
    const src = entrada || {};
    const ficha = clienteDeFicha(cliente) || clienteDeFicha(opciones.cliente);
    const conId = src.cliente_id || ficha?.id || null;
    const datos = src.cliente ? { ...CLIENTE_VACIO, ...clienteDeFicha(src.cliente), id: undefined } : ficha ? { ...CLIENTE_VACIO, ...ficha } : { ...CLIENTE_VACIO };
    delete datos.id;
    const obraSrc = src.obra || opciones.obra || {};
    const obra = obraDeEntrada(obraSrc);
    const dirObra = { direccion: txt(obraSrc.direccion), codigo_postal: txt(obraSrc.codigo_postal), municipio: txt(obraSrc.municipio), provincia: txt(obraSrc.provincia) };
    // «La obra es en la misma dirección»: lo normal. Si la obra trae otra, se respeta.
    const misma = !recorta(dirObra.direccion) || (recorta(dirObra.direccion).toLowerCase() === recorta(datos.direccion).toLowerCase());
    const auto = conceptosDe(obra);
    const guardados = Array.isArray(src.conceptos) ? src.conceptos.map(txt) : null;
    const aMano = guardados && JSON.stringify(guardados) !== JSON.stringify(auto) ? guardados : null;
    const partidas = Array.isArray(src.partidas) ? src.partidas.map((p) => ({ cantidad: txt(p?.cantidad ?? ''), precio: txt(p?.precio ?? '') })) : [];
    return {
        numero: txt(src.numero ?? opciones.numero),
        fecha: txt(src.fecha ?? opciones.fecha) || hoyIso(),
        validez_dias: src.validez_dias ?? opciones.validez_dias ?? 30,
        notas: txt(src.notas ?? opciones.notas),
        iva_pct: Number(src.iva_pct ?? opciones.iva_pct ?? 21) === 10 ? 10 : 21,
        clienteModo: conId ? 'elegido' : (src.cliente && recorta(src.cliente.nombre)) ? 'nuevo' : 'buscar',
        cliente_id: conId,
        cliente: datos,
        obra,
        misma,
        dir: misma ? { ...DIR_VACIA } : dirObra,
        conceptosMano: aMano,
        autoAlEditar: aMano ? auto : null,
        extrasTocados: Array.isArray(obraSrc.extras),
        modo: src.modo === 'partidas' ? 'partidas' : 'total',
        total: txt(src.total ?? ''),
        con_iva: src.con_iva === true,
        partidas,
    };
}

export function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Las líneas que se ven: las tocadas a mano o, si no, las recomendadas para esa obra. */
export const conceptosVisibles = (f) => f.conceptosMano || conceptosDe(f.obra);

/** Al cambiar de tipo de obra, los extras que ya no tocan se quitan (y si no se tocaron, los de por defecto). */
export function extrasAlCambiarObra(obra, tocados) {
    const tipo = tipoDe(obra);
    if (!tocados) return extrasPorDefecto(obra);
    const validas = new Set(extrasDe(tipo).map((x) => x.clave));
    return (obra.extras || []).filter((x) => validas.has(x.clave) || !x.clave);
}

const limpiaObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

/** El formulario → el cuerpo de crear / vista previa / actualizar (la forma del contrato, sección 4). */
export function entradaDe(f) {
    const cli = limpiaObj(f.cliente || CLIENTE_VACIO);
    const dir = f.misma
        ? { direccion: cli.direccion, codigo_postal: cli.codigo_postal, municipio: cli.municipio, provincia: cli.provincia }
        : limpiaObj(f.dir || DIR_VACIA);
    const o = f.obra;
    const tipo = tipoDe(o);
    const conceptos = conceptosVisibles(f).map((t) => txt(t).trim());
    const pot = recorta(o.equipo?.potencia_kw);
    const litros = recorta(o.equipo?.litros);
    return {
        numero: recorta(f.numero),
        fecha: f.fecha,
        ...(f.cliente_id && f.clienteModo === 'elegido' ? { cliente_id: f.cliente_id } : { cliente: cli }),
        obra: {
            tipo,
            ...dir,
            equipo: {
                aerotermia_id: o.equipo?.aerotermia_id ?? null,
                marca: recorta(o.equipo?.marca),
                modelo: recorta(o.equipo?.modelo),
                potencia_kw: pot ? pot.replace(',', '.') : null,
                ...(tipo === 'acs' && litros ? { litros: Number(litros) || null } : {}),
            },
            caldera: { combustible: tipo === 'aerotermia' ? o.caldera?.combustible || null : null },
            acs: tipo === 'aerotermia' ? !!o.acs : tipo === 'acs',
            emisor: tipo === 'aerotermia' ? o.emisor || 'radiadores' : null,
            extras: (o.extras || []).map((x) => ({ ...x })),
            descripcion: tipo === 'otro' ? recorta(o.descripcion) : '',
            oportunidad: o.oportunidad || null,
        },
        conceptos,
        modo: f.modo,
        total: f.modo === 'total' ? recorta(f.total) : null,
        con_iva: !!f.con_iva,
        partidas: f.modo === 'partidas' ? conceptos.map((_, i) => ({ cantidad: recorta(f.partidas[i]?.cantidad) || 1, precio: recorta(f.partidas[i]?.precio) })) : [],
        iva_pct: f.iva_pct,
        notas: recorta(f.notas),
        validez_dias: Number(f.validez_dias) || null,
    };
}

// ── Los errores del servidor, cada uno junto a su campo ───────────────────────────────
const CAMPO = [
    [/n[uú]mero|numeraci/i, 'numero'],
    [/fecha/i, 'fecha'],
    [/cliente|nombre|dni|nif|tel[eé]fono|apellid/i, 'cliente'],
    [/direcci[oó]n|municipio|c[oó]digo postal|\bcp\b/i, 'direccion'],
    [/precio|importe|iva|cantidad/i, 'precio'],
    [/l[ií]nea|texto|concepto|incluye/i, 'conceptos'],
];
export const campoDeMensaje = (m) => (CAMPO.find(([re]) => re.test(String(m || ''))) || [null, 'general'])[1];

/** `{ general:[], numero, fecha, cliente, direccion, precio, conceptos, sugerido }` de un error de axios. */
export function erroresPorCampo(err) {
    const out = { general: [] };
    const pon = (campo, m) => {
        if (!m) return;
        if (campo === 'general') out.general.push(m);
        else out[campo] = out[campo] ? `${out[campo]} ${m}` : m;
    };
    const st = err?.response?.status;
    const d = err?.response?.data;
    const datos = d && typeof d === 'object' && !(d instanceof ArrayBuffer) ? d : {};
    const codigo = datos.code || datos.codigo;
    if (!err?.response) { pon('general', 'Sin conexión: no se ha guardado. Cuando vuelva la cobertura, pulsa otra vez.'); return out; }
    if (st === 409 && codigo === 'NUMERO_REPETIDO') {
        pon('numero', datos.error || 'Ese número ya lo has usado en otro presupuesto.');
        if (datos.sugerido) out.sugerido = String(datos.sugerido);
        return out;
    }
    if (st === 503) { pon('general', 'Ahora mismo no podemos guardarlo. No se ha perdido nada: vuelve a pulsar en un momento.'); return out; }
    const errores = datos.errores;
    if (Array.isArray(errores)) errores.forEach((m) => pon(campoDeMensaje(m), String(m)));
    else if (errores && typeof errores === 'object') Object.entries(errores).forEach(([k, m]) => pon(CAMPO.some(([, c]) => c === k) ? k : campoDeMensaje(`${k} ${m}`), String(m)));
    if (!Array.isArray(errores) && !(errores && typeof errores === 'object')) pon(st === 409 ? campoDeMensaje(datos.error) : 'general', datos.error || 'No se ha podido guardar. Inténtalo en un momento.');
    return out;
}

// ── La «Nueva simulación» con lo del presupuesto ──────────────────────────────────────
/** Lo que necesita el embudo (LandingFunnelView `presupuestoInicial`). Sin funciones: el `alCrear` lo pone quien lo abre. */
export function simulacionDesde({ presupuesto: p, entrada } = {}) {
    if (!p) return null;
    // Lo IMPRESO (la foto del presupuesto) manda; lo que se tecleó rellena lo que falte.
    const mezcla = (a, b) => { const o = { ...(b || {}) }; Object.entries(a || {}).forEach(([k, v]) => { if (v != null && v !== '') o[k] = v; }); return o; };
    const cli = mezcla(p.cliente && typeof p.cliente === 'object' ? p.cliente : null, entrada?.cliente);
    const ob = mezcla(p.obra && typeof p.obra === 'object' ? p.obra : null, entrada?.obra);
    ob.equipo = mezcla(p.obra?.equipo, entrada?.obra?.equipo);
    const total = Number(p.total);
    const lugar = [recorta(ob.codigo_postal), recorta(ob.municipio)].filter(Boolean).join(' ');
    const direccion = [recorta(ob.direccion), lugar].filter(Boolean).join(', ');
    return {
        id: p.id,
        numero: p.numero || null,
        fecha: p.fecha || null,
        total_con_iva: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0,
        base: Number(p.base) || null,
        iva_pct: Number(p.iva_pct) || 21,
        cliente: {
            nombre: recorta(cli.nombre ?? cli.nombre_razon_social),
            apellidos: recorta(cli.apellidos),
            tlf: recorta(cli.tlf ?? cli.telefono),
            email: recorta(cli.email),
            dni: recorta(cli.dni ?? cli.nif),
        },
        direccion,
        equipo: {
            aerotermia_id: ob.equipo?.aerotermia_id ?? null,
            marca: recorta(ob.equipo?.marca),
            modelo: recorta(ob.equipo?.modelo),
        },
    };
}

/**
 * La obra (`id_oportunidad`, el id de las obras de la app) a la que ya está ligado: `obra` en el listado;
 * en la ficha, `id_oportunidad` (`oportunidad_id` es el uuid de la tabla: solo dice SI está ligado).
 */
export const obraDelPresupuesto = (p) => (typeof p?.obra === 'string' ? p.obra : null) || p?.id_oportunidad || p?.obra?.oportunidad || null;
export const estaLigado = (p) => !!(obraDelPresupuesto(p) || p?.oportunidad_id);
