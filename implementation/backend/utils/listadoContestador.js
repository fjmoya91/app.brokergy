// El LISTADO de lo que ha hecho el contestador de WhatsApp (services/contestadorWhatsapp.js):
// una fila por turno, con lo que escribieron, qué se les dijo y por qué, para repasar cómo han
// sido las respuestas y mejorarlo (Fran, 21/11/2026: «que luego se pueda sacar un listado de las
// respuestas que se dan para analizar cómo han sido, mejorar el asistente»).
//
// Todo PURO salvo `aExcel`, que solo escribe en memoria. Lo usa la ruta
// GET /api/whatsapp/contestador/listado y la orden `contestador.js listado`.

const ZONA = 'Europe/Madrid';

// De menos a más preocupante: en este orden salen en la hoja «Resumen».
const RESULTADOS = [
    'Contestado',
    'Contestado tras revisarlo',
    'Contestado con lo que antes iba a Fran',
    'A Fran, con acuse al cliente',
    'A Fran, sin decirle nada',
    'No salió por un tope',
    'Solo copia a Fran',
    'Callado (no hacía falta)',
    'Descartado (ya atendido o no era nuestro)',
    'Error',
];

const NOMBRE_POR = {
    PRECIO: 'Precio, descuento o excepción',
    QUEJA: 'Queja o cancelación',
    PERSONA: 'Pide una persona o una llamada',
    FIRMA: 'Lo firma Fran',
    AJENO: 'Asunto de Fran, de fuera del chat',
    SIN_DATOS: 'No se podía saber',
};

const limpio = (s) => String(s ?? '').replace(/\r/g, '').trim();

/** Las 00:00 de ese día en Madrid, como Date (con su cambio de hora). `aaaammdd` = 'AAAA-MM-DD'. Pura. */
function inicioDiaMadrid(aaaammdd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(aaaammdd || '').trim());
    if (!m) return null;
    const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isFinite(utc)) return null;
    // Qué hora es en Madrid a las 00:00 UTC de ese día: 1 (invierno) o 2 (verano). Eso es el desfase.
    const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' }).format(new Date(utc)));
    return new Date(utc - hora * 3_600_000);
}

/**
 * De los parámetros de la petición al tramo de fechas. Pura.
 * `desde`/`hasta` (AAAA-MM-DD, días de Madrid, los dos incluidos) mandan sobre `dias` (por defecto 7, tope 90).
 * @returns {{ desde: Date, hasta: Date }}
 */
function tramo({ dias, desde, hasta } = {}, ahora = new Date()) {
    const fin = inicioDiaMadrid(hasta);
    const h = fin ? new Date(fin.getTime() + 24 * 3_600_000) : ahora;
    const ini = inicioDiaMadrid(desde);
    if (ini && ini < h) return { desde: ini, hasta: h };
    const n = Math.min(90, Math.max(1, Math.round(Number(dias)) || 7));
    return { desde: new Date(h.getTime() - n * 24 * 3_600_000), hasta: h };
}

const fechaMadrid = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '');
const horaMadrid = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) : '');

/** Qué pasó con ese turno, en una etiqueta de RESULTADOS. Pura. */
function resultadoDe(f) {
    if (f.estado === 'ERROR') return 'Error';
    if (f.estado === 'DESCARTADA') return 'Descartado (ya atendido o no era nuestro)';
    if (f.accion === 'CALLAR') return 'Callado (no hacía falta)';
    const enviado = !!f.enviado_at;
    if (f.accion === 'RESPONDER') {
        if (!enviado) return 'Solo copia a Fran';
        if (f.enviado_sin_fran === true || f.enviado_sin_fran === 'true') return 'Contestado con lo que antes iba a Fran';
        return /^investigador/i.test(String(f.cerebro || '')) ? 'Contestado tras revisarlo' : 'Contestado';
    }
    if (f.accion === 'ESCALAR') {
        if (/^(tope del d[ií]a|ya le he contestado \d+ veces)/i.test(String(f.motivo || ''))) return 'No salió por un tope';
        return enviado && f.acuse ? 'A Fran, con acuse al cliente' : 'A Fran, sin decirle nada';
    }
    return 'Descartado (ya atendido o no era nuestro)';
}

/** «directo (8 s)» / «revisando: 6 pasos, 31 s» / «respaldo». Pura. */
function comoSeDecidio(cerebro) {
    const c = String(cerebro || '');
    if (!c) return '';
    const inv = /^investigador[^(]*\([^,]*,\s*([\d.,]+)\s*s,\s*(\S+)\s*pasos\)/i.exec(c);
    if (inv) return `revisando: ${inv[2]} pasos, ${Math.round(Number(inv[1].replace(',', '.')))} s`;
    if (/respaldo/i.test(c)) return 'respaldo (Gemini)';
    const dir = /\(([^,]*),\s*([\d.,]+)\s*s/.exec(c);
    return dir ? `directo (${Math.round(Number(dir[2].replace(',', '.')))} s)` : 'directo';
}

/**
 * De las filas de `wa_contestador` (con sus subcampos de `detalle` ya sueltos, regla 22) a las
 * filas del listado. Pura. Lo SIGUIENTE que escribió en ese chat sale del turno siguiente: es la
 * mejor pista de si la respuesta le valió («Pero qué me quieres decir»).
 */
function filasListado(filas) {
    const orden = [...(filas || [])].sort((a, b) => Number(a.id) - Number(b.id));
    const siguiente = new Map();   // id → el turno siguiente del mismo chat
    const ultimoDe = new Map();
    for (const f of orden) {
        const ant = ultimoDe.get(f.chat_id);
        if (ant) siguiente.set(ant.id, f);
        ultimoDe.set(f.chat_id, f);
    }
    return orden.map((f) => {
        const resultado = resultadoDe(f);
        const enviado = !!f.enviado_at;
        const leDijimos = enviado ? (f.accion === 'RESPONDER' ? f.texto : f.acuse) : '';
        const sig = siguiente.get(f.id);
        const pend = (x) => (Array.isArray(x?.pendientes) ? x.pendientes.map(limpio).filter(Boolean).join('\n') : '');
        const minutos = enviado && f.ultimo_at ? Math.max(0, Math.round((new Date(f.enviado_at) - new Date(f.ultimo_at)) / 60_000)) : null;
        const por = String(f.por || '').toUpperCase();
        return {
            n: `C${f.id}`,
            fecha: fechaMadrid(f.ultimo_at || f.created_at),
            hora: horaMadrid(f.ultimo_at || f.created_at),
            quien: limpio(f.titulo || f.nombre || f.tel9),
            rol: limpio(f.rol),
            obra: limpio(f.obra),
            escribio: pend(f),
            resultado,
            le_dijimos: limpio(leDijimos),
            // Lo redactado que NO le llegó: el borrador para Fran, lo parado por un tope, lo de modo copia.
            sin_enviar: limpio(f.borrador || (!enviado && f.accion === 'RESPONDER' ? f.texto : '')),
            borrador_enviado: f.borrador_enviado_at ? 'sí («C…»)' : '',
            por_que: limpio(f.motivo || f.error),
            motivo_fran: NOMBRE_POR[por] || '',
            para_fran: limpio(f.aviso),
            como: comoSeDecidio(f.cerebro),
            miro: Array.isArray(f.fuentes) ? f.fuentes.map(limpio).filter(Boolean).join(' · ') : '',
            minutos,
            alta: f.alta_at ? 'sí' : '',
            despues: sig ? pend(sig) : '',
            modo: limpio(f.modo),
        };
    });
}

/** Los totales de la hoja «Resumen», contados sobre las propias filas. Pura. */
function resumenListado(filas) {
    const por = (clave) => {
        const m = new Map();
        for (const f of filas) { const k = f[clave] || ''; if (k) m.set(k, (m.get(k) || 0) + 1); }
        return m;
    };
    const res = por('resultado');
    const pedian = filas.filter(f => !/^(Callado|Descartado)/.test(f.resultado)).length;
    const contestadas = filas.filter(f => /^Contestado/.test(f.resultado)).length;
    return {
        total: filas.length,
        pedian_respuesta: pedian,
        contestadas,
        resultados: RESULTADOS.filter(r => res.has(r)).map(r => ({ resultado: r, n: res.get(r) })),
        motivos_fran: [...por('motivo_fran')].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
    };
}

const COLUMNAS = [
    ['n', 'Nº', 8], ['fecha', 'Fecha', 11], ['hora', 'Hora', 7], ['quien', 'Quién', 28], ['rol', 'Rol', 11], ['obra', 'Obra', 16],
    ['escribio', 'Escribió', 50], ['resultado', 'Qué se hizo', 28], ['le_dijimos', 'Le dijimos', 60],
    ['sin_enviar', 'Redactado sin enviar (borrador)', 50], ['borrador_enviado', 'Borrador enviado', 12],
    ['motivo_fran', 'Por qué se quedó en Fran', 24], ['para_fran', 'Aviso a Fran', 40], ['por_que', 'Motivo (interno)', 50],
    ['como', 'Cómo se decidió', 22], ['miro', 'Qué miró', 40], ['minutos', 'Min. hasta contestar', 10], ['alta', 'Alta encargada', 9],
    ['despues', 'Después escribió', 45],
    // Para repasarlo: se rellenan a mano y sirven para corregir el contestador.
    ['valoracion', 'VALORACIÓN (bien / regular / mal)', 16], ['yo_habria_dicho', 'QUÉ HABRÍA DICHO YO', 50],
];

/** El Excel, en memoria: hoja «Respuestas» (una fila por turno) y hoja «Resumen». */
async function aExcel(filas, { desde, hasta } = {}) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Respuestas', { views: [{ state: 'frozen', ySplit: 1, xSplit: 4 }] });
    ws.columns = COLUMNAS.map(([key, header, width]) => ({ key, header, width }));
    for (const f of filas) ws.addRow(f);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    ws.eachRow((row, i) => { if (i > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

    const r = resumenListado(filas);
    const wr = wb.addWorksheet('Resumen');
    wr.columns = [{ width: 46 }, { width: 12 }];
    const titulo = (t) => { const row = wr.addRow([t]); row.font = { bold: true }; };
    titulo(`Contestador de WhatsApp · del ${fechaMadrid(desde)} al ${fechaMadrid(new Date(new Date(hasta).getTime() - 1))}`);
    wr.addRow([]);
    wr.addRow(['Turnos en total', r.total]);
    wr.addRow(['Pedían respuesta (sin cortesías ni descartados)', r.pedian_respuesta]);
    wr.addRow(['Contestados', r.contestadas]);
    wr.addRow([]);
    titulo('Qué se hizo');
    for (const x of r.resultados) wr.addRow([x.resultado, x.n]);
    if (r.motivos_fran.length) {
        wr.addRow([]);
        titulo('Por qué se quedó en Fran');
        for (const x of r.motivos_fran) wr.addRow([x.motivo, x.n]);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { tramo, inicioDiaMadrid, filasListado, resumenListado, resultadoDe, comoSeDecidio, aExcel, COLUMNAS, RESULTADOS };
