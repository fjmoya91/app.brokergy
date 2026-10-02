// ============================================================================
// croquisCee.js — el CROQUIS de lo que se ha escrito en un `.cex`, en PDF.
//
// Para REVISAR un borrador sin abrir CE3X ni la ventana de la envolvente: un
// plano por planta (paredes con su tipo y su medida, huecos con su cota, lo
// que no cuenta como vivienda) y las tablas de lo que hay DENTRO del `.cex`.
//
// REGLAS
//   · Las TABLAS salen del propio `.cex` (la radiografía del motor), no de lo
//     que se le pidió: lo que se revisa es exactamente lo que va al fichero.
//   · El DIBUJO sale de la geometría del motor con el TRABAJO puesto encima
//     por la MISMA siembra que la ventana (`estadoDeTrabajo`): la misma pared,
//     el mismo tipo efectivo y los mismos huecos que se ven allí.
//   · ÁMBAR = POR CONFIRMAR, igual que en la ventana: es lo que leyó una
//     máquina de una foto y nadie ha comprobado todavía.
//   · Es COSMÉTICO dónde cae un hueco a lo largo del muro (como en la ventana):
//     CE3X no coloca los huecos, quiere su superficie y su cerramiento.
//   · Puro: compone HTML. Rasterizarlo y subirlo es de quien lo llama.
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');

const FRONT = path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'features');
const esm = (rel) => import(pathToFileURL(path.join(FRONT, rel)).href);

//: Los colores de la ventana de la envolvente (leyenda del plano).
const COLOR = {
    FACHADA: '#E07A1F', MEDIANERA: '#2F6FD6', PARTICION_VERTICAL: '#C2378F',
    FUERA: '#9AA3AE', VENTANA: '#2A8FD8', PUERTA: '#8A5A2B', AMBAR: '#E8A400',
    ZONA: '#8E6BBF',
};
const NOMBRE_TIPO = {
    FACHADA: 'Fachada', MEDIANERA: 'Medianera', PARTICION_VERTICAL: 'Partición',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 2) => (v == null || v === '' || !Number.isFinite(Number(v)))
    ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const sinCambia = (s) => String(s || '').replace(/\s*-\s*CAMBIA$/i, '').trim();
const idDeNombre = (s) => String(s || '').trim().split(/\s+/)[0];

// ─── El dibujo de una planta ────────────────────────────────────────────────

function bbox(puntos) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of puntos) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/**
 * Un plano en SVG, norte arriba y en METROS (el lienzo del motor ya lo es:
 * el mundo trasladado con la Y del revés).
 */
function planoPlanta(G, { planta, muros, zonas, entrada, contexto, anchoPx = 720, altoMaxPx = 520 }) {
    const pts = [];
    for (const m of muros) pts.push(...(m.svg || []));
    for (const z of zonas) pts.push(...z.puntos);
    const caja = bbox(pts);
    if (!caja) return '<p class="nota">Sin paredes que dibujar en esta planta.</p>';
    const margen = Math.max(2.2, 0.12 * Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0));
    const vb = { x: caja.x0 - margen, y: caja.y0 - margen,
                 w: caja.x1 - caja.x0 + 2 * margen, h: caja.y1 - caja.y0 + 2 * margen };
    const ppm = Math.min(anchoPx / vb.w, altoMaxPx / vb.h);
    const px = (p) => p / ppm;                       // píxeles de papel → metros
    const W = vb.w * ppm, H = vb.h * ppm;
    const fs = px(9.5), fsSub = px(8);
    const grosor = Math.max(0.3, px(4.5));
    const halo = `stroke="#fff" stroke-width="${px(3)}" paint-order="stroke" stroke-linejoin="round"`;
    const linea = (p) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

    // Hacia dónde está "fuera" de cada pared: lejos del centro de la planta.
    const cs = muros.map(m => G.centro(m.svg));
    const cx = cs.reduce((s, c) => s + c[0], 0) / (cs.length || 1);
    const cy = cs.reduce((s, c) => s + c[1], 0) / (cs.length || 1);
    const haciaFuera = (m) => {
        const p = m.svg || [];
        const [mx, my] = G.centro(p);
        const a = p[0], b = p[p.length - 1];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
        if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
        return { mx, my, nx, ny };
    };

    const capas = [];
    // Contexto: vecinos y linde de la parcela, muy apagados.
    for (const v of contexto?.vecinos || []) {
        capas.push(`<polygon points="${linea(v)}" fill="#EEF0F3" stroke="#C9CED6" stroke-width="${px(0.8)}"/>`);
    }
    for (const p of contexto?.parcela || []) {
        capas.push(`<polygon points="${linea(p)}" fill="none" stroke="#B9BFC8" stroke-width="${px(1)}" stroke-dasharray="${px(5)} ${px(3)}"/>`);
    }
    // Lo que NO cuenta como vivienda en esta planta.
    for (const z of zonas) {
        const [zx, zy] = G.centroide(z.puntos);
        capas.push(`<polygon points="${linea(z.puntos)}" fill="url(#rayado)" stroke="${COLOR.ZONA}" stroke-width="${px(1.2)}"/>`);
        capas.push(`<text x="${zx}" y="${zy}" font-size="${fs}" text-anchor="middle" fill="${COLOR.ZONA}" font-weight="700" ${halo}>${esc(z.uso)}</text>`);
        capas.push(`<text x="${zx}" y="${zy + fs * 1.2}" font-size="${fsSub}" text-anchor="middle" fill="${COLOR.ZONA}" ${halo}>${num(z.area_m2, 1)} m² · no cuenta</text>`);
    }
    // Las paredes.
    for (const m of muros) {
        const tipo = G.tipoDe(m);
        const fuera = G.esFuera(m);
        const col = fuera ? COLOR.FUERA : (COLOR[tipo] || COLOR.FUERA);
        capas.push(`<polyline points="${linea(m.svg)}" fill="none" stroke="${col}" stroke-width="${grosor}" stroke-linecap="square"${fuera ? ` stroke-dasharray="${px(4)} ${px(3)}" opacity="0.8"` : ''}/>`);
    }
    // Los huecos, encima de su pared.
    for (const m of muros) {
        if (G.esFuera(m) || !(m.huecos || []).length) continue;
        const L = G.largo(m.svg);
        const { nx, ny } = haciaFuera(m);
        for (const { hueco: h, pos } of G.reparto(m.huecos)) {
            const ancho = Math.min(Number(h.ancho) || 0.8, L);
            const c = G.at(m.svg, pos * L);
            const r = (c.ang * Math.PI) / 180;
            const dx = Math.cos(r) * ancho / 2, dy = Math.sin(r) * ancho / 2;
            const dudoso = h.estado !== 'medido';
            const col = h.tipo === 'puerta' ? COLOR.PUERTA : COLOR.VENTANA;
            const seg = `x1="${c.x - dx}" y1="${c.y - dy}" x2="${c.x + dx}" y2="${c.y + dy}"`;
            capas.push(`<line ${seg} stroke="#fff" stroke-width="${grosor * 1.05}"/>`);
            capas.push(`<line ${seg} stroke="${col}" stroke-width="${grosor * 0.7}"/>`);
            if (dudoso) {
                capas.push(`<line ${seg} stroke="${COLOR.AMBAR}" stroke-width="${grosor * 1.6}" stroke-opacity="0.45"/>`);
            }
            // La cota del hueco, hacia DENTRO (fuera va la de la pared).
            const tx = c.x - nx * px(15), ty = c.y - ny * px(15);
            capas.push(`<text x="${tx}" y="${ty}" font-size="${fsSub}" text-anchor="middle" dominant-baseline="middle" font-weight="700" fill="${dudoso ? '#9A6A00' : col}" ${halo}>${esc(G.nombreHueco ? G.nombreHueco(h) : h.nombre)} ${num(h.ancho)}×${num(h.alto)}${dudoso ? ' ?' : ''}</text>`);
        }
    }
    // El rótulo de cada pared, por fuera.
    for (const m of muros) {
        const tipo = G.tipoDe(m);
        const fuera = G.esFuera(m);
        const { mx, my, nx, ny } = haciaFuera(m);
        const d = px(14);
        const x = mx + nx * d, y = my + ny * d;
        const col = fuera ? '#6B7380' : (COLOR[tipo] || '#6B7380');
        const nombre = G.nombreDe(m) || m.id;
        const L = G.largo(m.svg);
        // Una pared muy corta (un quiebro de 20 cm) solo lleva su nombre, y más
        // pequeño: su medida está en la tabla y aquí taparía a las de al lado.
        if (L < 0.8) {
            capas.push(`<text x="${x}" y="${y}" font-size="${fsSub}" text-anchor="middle" dominant-baseline="middle" fill="${col}" ${halo}>${esc(nombre)}</text>`);
            continue;
        }
        capas.push(`<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" font-weight="700" fill="${col}" ${halo}>${esc(nombre)} · ${num(L)} m</text>`);
        const sub = fuera ? 'NO CUENTA'
            : `${NOMBRE_TIPO[tipo] || tipo}${G.rumboDe(m) ? ` ${G.rumboDe(m)}` : ''}${m.id === entrada ? ' · ENTRADA' : ''}`;
        capas.push(`<text x="${x}" y="${y + fs * 1.15}" font-size="${fsSub}" text-anchor="middle" dominant-baseline="middle" fill="${col}" ${halo}>${esc(sub)}</text>`);
    }
    // Norte y escala.
    const nX = vb.x + vb.w - px(26), nY = vb.y + px(30);
    capas.push(`<g><polygon points="${nX},${nY - px(18)} ${nX - px(7)},${nY + px(4)} ${nX},${nY - px(1)} ${nX + px(7)},${nY + px(4)}" fill="#222"/>`
        + `<text x="${nX}" y="${nY + px(16)}" font-size="${fs}" text-anchor="middle" font-weight="700" fill="#222">N</text></g>`);
    const esc_m = [1, 2, 5, 10].find(s => s * ppm >= 70) || 10;
    const sX = vb.x + px(14), sY = vb.y + vb.h - px(16);
    capas.push(`<g><line x1="${sX}" y1="${sY}" x2="${sX + esc_m}" y2="${sY}" stroke="#222" stroke-width="${px(2)}"/>`
        + `<line x1="${sX}" y1="${sY - px(4)}" x2="${sX}" y2="${sY + px(4)}" stroke="#222" stroke-width="${px(1.5)}"/>`
        + `<line x1="${sX + esc_m}" y1="${sY - px(4)}" x2="${sX + esc_m}" y2="${sY + px(4)}" stroke="#222" stroke-width="${px(1.5)}"/>`
        + `<text x="${sX + esc_m / 2}" y="${sY - px(6)}" font-size="${fsSub}" text-anchor="middle" fill="#222">${esc_m} m</text></g>`);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" font-family="Arial, Helvetica, sans-serif">
<defs><pattern id="rayado" patternUnits="userSpaceOnUse" width="${px(7)}" height="${px(7)}" patternTransform="rotate(45)">
<rect width="${px(7)}" height="${px(7)}" fill="${COLOR.ZONA}" fill-opacity="0.08"/><line x1="0" y1="0" x2="0" y2="${px(7)}" stroke="${COLOR.ZONA}" stroke-opacity="0.45" stroke-width="${px(1.2)}"/></pattern></defs>
${capas.join('\n')}
</svg>`;
}

// ─── Las tablas (de lo que hay DENTRO del .cex) ─────────────────────────────

function tabla(cabeceras, filas, { clase = '' } = {}) {
    if (!filas.length) return '<p class="nota">— nada —</p>';
    return `<table class="${clase}"><thead><tr>${cabeceras.map(c => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${filas.join('\n')}</tbody></table>`;
}

/**
 * El HTML del croquis.
 *
 * @param {object} p
 * @param {object} p.cabecera  { numero, cliente, direccion, rc, fase, fichero, version, fecha }
 * @param {object} p.geo       la respuesta de /envolvente (plantas, contexto, georef…)
 * @param {object} p.trabajo   el trabajo guardado de la ventana
 * @param {object|null} p.rx   la radiografía del `.cex` (/cex/radiografia)
 * @param {string[]} [p.avisos]
 */
async function componerCroquisHtml({ cabecera = {}, geo, trabajo, rx = null, avisos = [], decisiones = null }) {
    const geom = await esm('cee-envolvente/logic/geometriaPlano.js');
    const tp = await esm('cee-envolvente/logic/tiposPared.js');
    const sen = await esm('cee-envolvente/logic/senalado.js');
    const ref = await esm('cee-envolvente/logic/reforma.js').catch(() => ({}));
    const G = { ...geom, ...tp, ...sen, nombreHueco: ref.nombreHueco };

    const st = sen.estadoDeTrabajo(geo, trabajo || null);
    const muros = Object.values(st.muros || {});
    const lam = st.lienzoAMundo;
    const zonasLienzo = (trabajo?.zonas_fuera || [])
        .filter(z => Array.isArray(z.poligono) && z.poligono.length >= 3 && lam)
        .map(z => ({ ...z, puntos: z.poligono.map(([X, Y]) => [X - lam.dx, lam.y0 - Y]) }));

    const plantas = sen.plantasDe(geo);
    const bloquesPlanos = plantas.map((p) => {
        const ms = muros.filter(m => (m.planta || null) === p.id);
        const zs = zonasLienzo.filter(z => Number(z.nivel) === Number(p.nivel));
        const svg = planoPlanta(G, { planta: p, muros: ms, zonas: zs, entrada: st.entrada,
                                     contexto: geo.contexto });
        const nH = ms.reduce((s, m) => s + (G.esFuera(m) ? 0 : (m.huecos || []).length), 0);
        const titulo = /^planta/i.test(p.nombre || '') ? p.nombre : `Planta ${p.nombre || p.id}`;
        return `<section class="planta"><h2>${esc(titulo)} <small>· nivel ${p.nivel}`
            + `${p.superficie ? ` · ${num(p.superficie, 1)} m² de huella` : ''} · ${ms.length} paredes · ${nH} huecos</small></h2>${svg}</section>`;
    }).join('\n');

    // Huecos del TRABAJO, para saber qué está por confirmar y por qué.
    const huecosTrabajo = [];
    for (const m of muros) {
        for (const h of m.huecos || []) huecosTrabajo.push({ pared: m.id, nombre: G.nombreDe(m), h });
    }
    // Los lucernarios no cuelgan de una pared: van en la cubierta de su planta.
    for (const [planta, lista] of Object.entries(trabajo?.lucernarios || {})) {
        for (const h of lista || []) huecosTrabajo.push({ pared: null, nombre: `cubierta ${planta}`, lucernario: true, h });
    }
    const porConfirmar = huecosTrabajo.filter(x => x.h.estado !== 'medido');
    const delTrabajo = (cer, nombre) => huecosTrabajo.find(x =>
        (x.lucernario ? /^CU/i.test(idDeNombre(cer))
                      : (x.pared === idDeNombre(cer) || x.nombre === idDeNombre(cer)))
        && sinCambia(x.h.nombre) === sinCambia(nombre));

    // ── Lo que hay que revisar ──
    const revisar = [];
    for (const x of porConfirmar) {
        revisar.push(`<li><b>${esc(x.h.nombre)}</b> en ${esc(x.nombre)}: ${x.lucernario ? 'lucernario' : x.h.tipo === 'puerta' ? 'puerta' : 'ventana'} `
            + `${num(x.h.ancho)} × ${num(x.h.alto)} m — <i>${esc(x.h.por_que || 'leída de una foto')}</i></li>`);
    }
    for (const [id, t] of Object.entries(trabajo?.tipos || {})) {
        const m = st.muros?.[id];
        revisar.push(`<li><b>${esc(id)}</b> reclasificada a <b>${esc(NOMBRE_TIPO[t] || t)}</b>`
            + `${m ? ` (Catastro decía ${esc(NOMBRE_TIPO[tp.tipoDe({ tipo: m.tipo })] || m.tipo)})` : ''}</li>`);
    }
    for (const id of trabajo?.excluidas || []) revisar.push(`<li><b>${esc(id)}</b> apartada de la envolvente (no va al .cex)</li>`);
    for (const z of trabajo?.zonas_fuera || []) {
        revisar.push(`<li>Zona que no cuenta en ${esc(z.planta || `nivel ${z.nivel}`)}: <b>${esc(z.uso)}</b> ${num(z.area_m2, 1)} m²</li>`);
    }
    for (const a of avisos || []) revisar.push(`<li class="aviso">⚠ ${esc(a)}</li>`);

    // ── Datos generales ──
    const g = rx?.generales || {};
    const generales = rx ? `<table class="kv"><tbody>
<tr><th>Programa</th><td>${esc(rx.version_ce3x ? `CE3X ${rx.version_ce3x}` : rx.version || '—')}</td><th>Normativa</th><td>${esc(g.normativa || '—')}</td></tr>
<tr><th>Año de construcción</th><td>${num(g.anio, 0)}</td><th>Tipo</th><td>${esc(g.tipo_edificio || '—')}</td></tr>
<tr><th>Localidad</th><td>${esc(g.localidad || '—')} (${esc(g.provincia || '—')})</td><th>Zona HE1 / HE4</th><td>${esc(g.zona_he1 || '—')} / ${esc(g.zona_he4 || '—')}</td></tr>
<tr><th>Superficie útil habitable</th><td>${num(g.superficie)} m²</td><th>Plantas</th><td>${num(g.plantas, 0)}</td></tr>
<tr><th>Altura libre de planta</th><td>${num(g.altura_planta)} m</td><th>Ventilación</th><td>${num(g.ventilacion)} ren/h</td></tr>
<tr><th>Demanda de ACS</th><td>${num(g.demanda_acs_l_dia, 1)} l/día</td><th>Masa particiones</th><td>${esc(g.masa_particiones || '—')}</td></tr>
<tr><th>Foto de fachada</th><td>${g.tiene_foto ? 'sí' : 'no'}</td><th>Croquis de parcela</th><td>${g.tiene_plano ? 'sí' : 'no'}</td></tr>
</tbody></table>` : '<p class="nota">No se ha podido leer el .cex (el motor no responde): las tablas no salen.</p>';

    // ── Cerramientos ──
    const env = rx?.envolvente || {};
    const huecosRx = env.huecos || [];
    const supHuecos = (cer) => huecosRx.filter(h => h.cerramiento === cer)
        .reduce((s, h) => s + (Number(h.superficie) || 0) * (Number(h.multiplicador) || 1), 0);
    const filasCer = (env.cerramientos || []).map((c) => {
        const id = idDeNombre(c.nombre);
        const m = st.muros?.[id] || muros.find(x => G.nombreDe(x) === id);
        const sh = supHuecos(c.nombre);
        const tipoCol = c.tipo === 'Medianera' ? COLOR.MEDIANERA
            : /partici/i.test(c.tipo || '') ? COLOR.PARTICION_VERTICAL
            : c.tipo === 'Fachada' ? COLOR.FACHADA : '#555';
        return `<tr><td><b>${esc(c.nombre)}</b></td><td><span class="chip" style="border-color:${tipoCol};color:${tipoCol}">${esc(c.tipo || '—')}</span></td>`
            + `<td>${esc(m?.planta || '—')}</td><td>${esc(c.orientacion || '—')}</td>`
            + `<td class="n">${m ? `${num(G.largo(m.svg))} × ${num(m.alto)}` : '—'}</td>`
            + `<td class="n">${num(c.superficie)}</td><td class="n">${sh ? num(sh) : '—'}</td>`
            + `<td class="n">${c.tipo === 'Medianera' ? '—' : num(c.u)}</td><td>${esc(c.modo || '—')}</td></tr>`;
    });

    // ── Huecos ──
    const filasHue = huecosRx.map((h) => {
        const t = delTrabajo(h.cerramiento, h.nombre);
        const dudoso = t && t.h.estado !== 'medido';
        const estado = !t ? '—' : dudoso
            ? `<span class="amb">Por confirmar</span><div class="sub">${esc(t.h.por_que || '')}</div>`
            : 'Medido';
        return `<tr class="${dudoso ? 'fila-amb' : ''}"><td><b>${esc(h.nombre)}</b></td><td>${esc(h.cerramiento)}</td><td>${esc(h.orientacion || '—')}</td>`
            + `<td class="n">${num(h.ancho)} × ${num(h.alto)}</td><td class="n">${num((Number(h.superficie) || 0) * (Number(h.multiplicador) || 1))}</td>`
            + `<td>${esc(h.marco || '—')}</td><td>${esc(h.vidrio || '—')}</td><td class="n">${num(h.porc_marco, 0)} %</td>`
            + `<td>${h.proteccion_solar ? 'sí' : 'no'}</td><td>${estado}</td></tr>`;
    });

    // ── Puentes térmicos (agrupados) ──
    const pt = {};
    for (const p of env.puentes || []) {
        const k = `${p.tipo || '—'}|${p.psi ?? ''}`;
        (pt[k] ||= { tipo: p.tipo, psi: p.psi, n: 0, L: 0 });
        pt[k].n += 1; pt[k].L += Number(p.longitud) || 0;
    }
    const filasPt = Object.values(pt).map(p =>
        `<tr><td>${esc(p.tipo || '—')}</td><td class="n">${num(p.psi)}</td><td class="n">${p.n}</td><td class="n">${num(p.L)}</td></tr>`);

    // ── Instalaciones y medidas ──
    const filaEquipo = (e) => {
        const serv = Object.entries(e.servicios || {}).map(([k, v]) =>
            `${k === 'acs' ? 'ACS' : k === 'calefaccion' ? 'Cal.' : 'Ref.'} ${num(v.pct, 0)} %${v.superficie ? ` · ${num(v.superficie, 1)} m²` : ''}`).join('<br>');
        const rend = Object.entries(e.rend_estacional || {}).filter(([, v]) => v != null)
            .map(([k, v]) => `${k === 'acs' ? 'ACS' : k === 'calefaccion' ? 'Cal.' : 'Ref.'} ${num(v, 1)} %`).join('<br>');
        const extra = [
            e.caldera ? `${esc(e.caldera.aislamiento || '')} · η comb. ${num(e.caldera.rend_combustion, 1)} % · ${num(e.caldera.potencia_kw, 1)} kW` : '',
            e.acumulacion ? `Depósito ${num(e.acumulacion.volumen_l, 0)} l` : '',
        ].filter(Boolean).join('<br>');
        return `<tr><td><b>${esc(e.nombre || '—')}</b></td><td>${esc(e.slot || '—')}</td><td>${esc(e.generador || '—')}<div class="sub">${esc(e.combustible || '')} · ${esc(e.modo_rendimiento || '')}</div></td>`
            + `<td>${rend || '—'}</td><td>${serv || '—'}</td><td>${extra || '—'}</td></tr>`;
    };
    const cabEq = ['Equipo', 'Uso', 'Generador', 'Rendimiento estacional', 'Cubre', 'Detalle'];
    const medidas = (rx?.medidas || []).map(md => `<div class="medida"><h3>Medida: ${esc(md.nombre || '—')}`
        + ` <small>${md.calculada ? '· calculada' : '· <span class="amb">sin calcular — pulsar «Actualizar» en CE3X</span>'}</small></h3>`
        + (md.caracteristicas ? `<p class="sub">${esc(md.caracteristicas)}</p>` : '')
        + tabla(cabEq, (md.equipos || []).map(filaEquipo)) + '</div>').join('\n');

    const c = cabecera;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Croquis ${esc(c.numero)}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1D2430; font-size: 9.5px; background: #fff; }
.hoja { padding: 26px 34px 30px; }
header { border-bottom: 3px solid #E07A1F; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; gap: 14px; }
header h1 { margin: 0; font-size: 17px; }
header .meta { color: #4A5361; line-height: 1.5; }
header .sello { text-align: right; font-size: 9px; color: #6B7380; }
.banda { background: #FFF6E0; border: 1px solid #F2C14E; border-radius: 6px; padding: 7px 10px; margin: 8px 0 10px; }
.leyenda { display: flex; flex-wrap: wrap; gap: 12px; margin: 4px 0 8px; color: #4A5361; }
.leyenda i { display: inline-block; width: 18px; height: 5px; vertical-align: middle; margin-right: 4px; border-radius: 1px; }
h2 { font-size: 12.5px; margin: 14px 0 6px; } h2 small { font-weight: 400; color: #6B7380; }
h3 { font-size: 11px; margin: 10px 0 4px; } h3 small { font-weight: 400; color: #6B7380; }
.planta { page-break-inside: avoid; margin-bottom: 8px; }
.planta svg { display: block; margin: 0 auto; border: 1px solid #E3E6EB; border-radius: 6px; background: #fff; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border-bottom: 1px solid #E6E9EE; padding: 3px 5px; text-align: left; vertical-align: top; }
thead th { background: #F3F5F8; font-size: 8.5px; text-transform: uppercase; letter-spacing: .03em; color: #4A5361; }
td.n { text-align: right; white-space: nowrap; }
table.kv th { width: 22%; background: #F7F8FA; font-weight: 600; color: #4A5361; }
.chip { border: 1px solid; border-radius: 9px; padding: 0 6px; font-size: 8.5px; white-space: nowrap; }
.amb { color: #9A6A00; font-weight: 700; }
.fila-amb td { background: #FFF8E6; }
.sub { color: #6B7380; font-size: 8.5px; }
.nota { color: #6B7380; font-style: italic; }
ul.revisar { margin: 4px 0 0 16px; padding: 0; } ul.revisar li { margin: 2px 0; } ul.revisar li.aviso { color: #7A5200; }
.salto { page-break-before: always; }
</style></head><body><div class="hoja">
<header>
  <div><h1>Croquis del ${esc(c.fase || 'CEE INICIAL')} · ${esc(c.numero || '')}</h1>
  <div class="meta">${esc(c.cliente || '')}${c.direccion ? ` · ${esc(c.direccion)}` : ''}<br>
  Ref. catastral ${esc(c.rc || '—')} · Fichero <b>${esc(c.fichero || '—')}</b></div></div>
  <div class="sello">Generado ${esc(c.fecha || '')}<br>${esc(c.autor || 'Agente IA · BROKERGY')}<br>BORRADOR PARA REVISAR</div>
</header>
<div class="banda"><b>Cómo leerlo.</b> Es lo que se ha escrito en el <b>.cex</b>: las tablas salen del propio fichero. En
<b style="color:#9A6A00">ÁMBAR</b> lo que está <b>por confirmar</b> (medido a partir de una foto, nadie lo ha comprobado). Se corrige en la
ventana de la envolvente de la app y se vuelve a generar el .cex. La posición de cada hueco a lo largo de su pared es orientativa: CE3X solo usa su medida y su pared.</div>

${(decisiones || []).length ? `<h2>Cómo lo ha hecho el Agente IA <small>· ${decisiones.length} decisiones</small></h2>
<ul class="revisar">${decisiones.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}

<h2>Lo que hay que revisar <small>· ${porConfirmar.length} hueco(s) por confirmar · ${(avisos || []).length} aviso(s)</small></h2>
${revisar.length ? `<ul class="revisar">${revisar.join('\n')}</ul>` : '<p class="nota">Nada pendiente.</p>'}

<div class="leyenda">
  <span><i style="background:${COLOR.FACHADA}"></i>Fachada</span><span><i style="background:${COLOR.MEDIANERA}"></i>Medianera</span>
  <span><i style="background:${COLOR.PARTICION_VERTICAL}"></i>Partición</span><span><i style="background:${COLOR.FUERA}"></i>No cuenta</span>
  <span><i style="background:${COLOR.VENTANA}"></i>Ventana</span><span><i style="background:${COLOR.PUERTA}"></i>Puerta</span>
  <span><i style="background:${COLOR.AMBAR}"></i>Por confirmar ( ? )</span><span><i style="background:${COLOR.ZONA};opacity:.5"></i>Zona que no es vivienda</span>
</div>
${bloquesPlanos}

<h2 class="salto">Datos generales</h2>
${generales}
<h2>Cerramientos opacos <small>· ${(env.cerramientos || []).length}</small></h2>
${tabla(['Cerramiento', 'Tipo', 'Planta', 'Orientación / espacio', 'Largo × alto (m)', 'Sup. (m²)', 'Huecos (m²)', 'U (W/m²K)', 'Modo'], filasCer)}
<h2>Huecos <small>· ${huecosRx.length}</small></h2>
${tabla(['Hueco', 'Cerramiento', 'Orient.', 'Ancho × alto (m)', 'Sup. (m²)', 'Marco', 'Vidrio', '% marco', 'Persiana', 'Estado'], filasHue)}
<h2>Puentes térmicos <small>· ${(env.puentes || []).length}</small></h2>
${tabla(['Tipo', 'ψ (W/mK)', 'Nº', 'Longitud total (m)'], filasPt)}
<h2>Instalaciones (edificio actual)</h2>
${tabla(cabEq, (rx?.equipos || []).map(filaEquipo))}
${medidas ? `<h2>Medidas de mejora</h2>${medidas}` : ''}
</div></body></html>`;
}

/** El nombre del PDF, junto al `.cex` de la fase. No lleva sufijo de slot
 *  (`_fdo`/`_reg`/`_etq`): la rejilla del CEE no lo toma por una entrega. */
function nombreCroquis(numero, fase = 'inicial') {
    return `${numero || 'EXPEDIENTE'} - CEE ${String(fase).toLowerCase() === 'final' ? 'FINAL' : 'INICIAL'}_CROQUIS.pdf`;
}

//: ¿Es un croquis de estos? Vive con los "archivos del CEE", que lo apartan.
const { esCroquis } = require('../ceeUploadService');

/**
 * La radiografía del `.cex` (lo que hay DENTRO) pidiéndosela al motor.
 * `null` si el motor no responde: el croquis sale igual, sin las tablas.
 */
async function radiografiaDe(bytes, motor = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080') {
    try {
        const fd = new FormData();
        fd.append('fichero', new Blob([bytes]), 'x.cex');
        const r = await fetch(`${motor}/cex/radiografia`, { method: 'POST', body: fd,
                                                            signal: AbortSignal.timeout(60_000) });
        return r.ok ? await r.json() : null;
    } catch { return null; }
}

/**
 * La cabecera del croquis desde el contexto de `ceeEnvolventeCex.cargarExpediente`
 * (vale para los tres negocios: el CEE directo y la oportunidad llegan ya
 * adaptados con su `instalacion`). La dirección es la de INSTALACIÓN.
 */
async function cabeceraDe(ctx, { fase = 'inicial', ficheroCex = null, autor = null } = {}) {
    let direccion = null;
    try {
        const dg = await esm('expedientes/utils/docGenerators.js');
        direccion = dg.buildInstalacionAddress({ ...ctx.expediente, clientes: ctx.cliente })?.full || null;
    } catch { /* sin dirección: el croquis sale igual */ }
    const cliente = [ctx.cliente?.nombre_razon_social, ctx.cliente?.apellidos].filter(Boolean).join(' ');
    return {
        numero: ctx.expediente?.numero_expediente, cliente, direccion,
        rc: ctx.expediente?.instalacion?.ref_catastral || ctx.expediente?.ref_catastral || null,
        fase: fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL',
        fichero: ficheroCex, autor,
        fecha: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
    };
}

/**
 * Compone el croquis y lo rasteriza. Devuelve `{ pdf, html, rx }`.
 * No escribe nada.
 */
async function croquisPdf({ cabecera, geo, trabajo, cexBytes, avisos, decisiones = null }) {
    const rx = cexBytes ? await radiografiaDe(cexBytes) : null;
    const html = await componerCroquisHtml({ cabecera, geo, trabajo, rx, avisos, decisiones });
    const pdf = await require('../pdfService').htmlToPdf(html);
    return { pdf, html, rx };
}

/**
 * Lo deja JUNTO al `.cex`, en la carpeta de la fase (`1. CEE / CEE INICIAL`).
 * El anterior se archiva en OLD, como el `.cex`: puede ser el que alguien
 * estaba mirando.
 */
async function guardarCroquisEnDrive(ctx, buffer, fase = 'inicial') {
    const cex = require('../ceeEnvolventeCex');
    const driveService = require('../driveService');
    try {
        const { id: carpeta, link: carpetaLink } = await cex.carpetaFase(ctx, fase);
        if (!carpeta) throw new Error('no se ha podido resolver la carpeta de la fase');
        const nombre = nombreCroquis(ctx.expediente?.numero_expediente, fase);
        const previo = await driveService.findFileByName(carpeta, nombre);
        if (previo) await driveService.archiveExistingToOld(carpeta, previo, nombre);
        const g = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', buffer,
                                                      { throwOnError: true });
        if (!g?.id) throw new Error('Drive no ha devuelto el fichero');
        return { ok: true, nombre, link: g.link, driveId: g.id, carpeta_link: carpetaLink };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * Los avisos de la FICHA (lo que va por defecto o falta), sin pedir imágenes al
 * Catastro: es lo que se lista arriba del croquis cuando no lo genera la skill
 * (que ya trae los suyos). Nunca lanza.
 */
async function avisosDeFicha(ctx, { geo, trabajo, fase = 'inicial' }) {
    try {
        const cex = require('../ceeEnvolventeCex');
        const { estadoDeTrabajo, senaladoDe } = await esm('cee-envolvente/logic/senalado.js');
        const st = estadoDeTrabajo(geo, trabajo);
        const envolvente = senaladoDe(st, trabajo?.ajustes || {}, { lienzoAMundo: st.lienzoAMundo });
        const r = await cex.componerFicha(ctx, { geometria: geo.geometria, envolvente,
                                                 ajustes: trabajo?.ajustes || {}, conImagenes: false, fase });
        return r.avisos || [];
    } catch (e) {
        return [`(no se han podido componer los avisos de la ficha: ${e.message})`];
    }
}

/**
 * Del expediente al croquis en Drive, con la geometría YA pedida al motor (la
 * pide quien llama, con lo mismo que la ventana). Lo usan la ventana (botón y
 * tras «Generar .cex») y la skill: un solo camino.
 *
 * @returns {{ok, nombre?, link?, error?}}
 */
async function croquisDeExpediente(ctx, { geo, trabajo, fase = 'inicial', avisos = null, autor = null }) {
    const cex = require('../ceeEnvolventeCex');
    const leido = await cex.leerCexDeFase(ctx, fase).catch(() => null);
    const av = Array.isArray(avisos) ? avisos : await avisosDeFicha(ctx, { geo, trabajo, fase });
    if (!leido) av.unshift(`Todavía no hay .cex del ${fase === 'final' ? 'CEE final' : 'CEE inicial'} en la carpeta: el croquis sale sin las tablas del fichero.`);
    const { pdf } = await croquisPdf({
        cabecera: await cabeceraDe(ctx, { fase, ficheroCex: leido?.nombre || null, autor }),
        geo, trabajo, cexBytes: leido?.bytes || null, avisos: av,
        // Las decisiones del Agente IA, si este borrador es suyo (su sello).
        decisiones: ctx.expediente?.cee?.agente_ia?.[fase]?.decisiones || null,
    });
    return guardarCroquisEnDrive(ctx, pdf, fase);
}

module.exports = { componerCroquisHtml, nombreCroquis, esCroquis, planoPlanta,
                   radiografiaDe, croquisPdf, guardarCroquisEnDrive, cabeceraDe,
                   avisosDeFicha, croquisDeExpediente };
