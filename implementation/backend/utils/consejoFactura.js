// ============================================================================
// consejoFactura.js — el TEXTO RECOMENDADO para la factura de la obra que se le
// manda al INSTALADOR (Fran, 11/11/2026, caso 26RES060_194).
//
// Cuando se le pide al instalador la factura porque FALTA, se le manda además el
// concepto con el que la factura pasa la auditoría del CAE: a nombre de quién,
// quién la emite, las líneas (equipo con marca, modelo, serie y kW; la caldera que
// se sustituye o con la que se hibrida; el emisor existente) y las normas para que
// no la rechacen. Si la factura YA la tenemos no se manda, salvo que tenga una
// incidencia GRAVE de las que tumban la auditoría: entonces va diciendo qué hay que
// corregir.
//
// FUENTE ÚNICA de las tres cosas, para que el popup, la ruta de envío, la página
// pública y los avisos digan lo mismo:
//   · construirConsejoFactura — el texto (null en RES080: fuera de alcance).
//   · decidirConsejoFactura   — la regla de CUÁNDO se manda.
//   · textosWhatsapp / htmlEmailConsejo / textoConcepto — cómo se escribe en cada canal.
// `cargarConsejoFactura` lo monta desde la BD (solo LEE; el token de la página es el
// de subida de la oportunidad y, si no existe, solo se crea con `crearToken`).
//
// Tras tocarlo: node implementation/backend/scripts/test_consejo_factura.js
// ============================================================================

const { detectPrograma, esSustitucionCaldera, esHibridacion, esTerciario } = require('./fichas');
const { getUnidades, acsEsOtraMaquina, esTermoElectrico, esAcumuladorAcs } = require('./aerotermiaUnits');
const { fechaRegistroCee } = require('./ceeFechas');

const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';
const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Las GRAVES de facturaIncidencias.js que tumban la auditoría y que el instalador
// puede arreglar rehaciendo la factura. SOBREFINANCIACION y SUPERFICIE_EMISORES no
// están: la primera no se arregla con el papel y la segunda es de RES080.
const GRAVES_QUE_TUMBAN = ['TITULAR', 'EMISOR', 'UNIDADES_TERMINALES', 'ALCANCE', 'ALCANCE_SIN_EQUIPO', 'SERIE_DISTINTA', 'FECHA', 'DUPLICADA'];

const FRASE_EMAIL = 'Al final de este correo tienes el texto que te recomendamos para el concepto de la factura, listo para copiar.';
const PIE_LINEAS = 'Cada línea con su importe; base imponible e IVA desglosados.';
const AVISO_HIBRIDACION = '*Importante:* no pongas «sustitución» ni «desmontaje de la caldera». En una hibridación la caldera se queda.';

// ── Piezas ───────────────────────────────────────────────────────────────────

const fmtKw = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
};

const fmtFecha = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpio(iso));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** ¿Se actúa sobre el ACS? (`normalizeData` deja 'SI' en mayúsculas). */
function hayAcs(inst) {
    const v = inst?.cambio_acs;
    return v === true || limpio(v).toLowerCase() === 'si' || limpio(v).toLowerCase() === 'true';
}

/** El emisor EXISTENTE al que se conecta la máquina: «conectada a los radiadores existentes». */
function conectadaA(inst) {
    const t = limpio(inst?.tipo_emisor).toLowerCase();
    if (t === 'radiadores_convencionales') return 'conectada a los radiadores existentes';
    if (t.startsWith('radiadores_baja')) return 'conectada a los radiadores de baja temperatura existentes';
    if (t.startsWith('suelo_radiante')) return 'conectada al suelo radiante existente';
    if (t.startsWith('fancoil')) return 'conectada a los fancoils existentes';
    return 'conectada a los emisores existentes';
}

/** «marca X, modelo Y, nº de serie Z, de N kW» — lo que no se sepa, entre corchetes. */
function equipoTxt(u, potenciaRespaldo = null) {
    const marca = limpio(u?.marca) || '[MARCA]';
    const modelo = limpio(u?.modelo) || limpio(u?.modelo_conjunto) || limpio(u?.modelo_ud_exterior) || '[MODELO]';
    const serie = limpio(u?.numero_serie) || limpio(u?.n_serie_ext) || '[Nº DE SERIE]';
    const kw = fmtKw(u?.potencia) || fmtKw(potenciaRespaldo) || '[XX]';
    return `marca ${marca}, modelo ${modelo}, nº de serie ${serie}, de ${kw} kW`;
}

/** La caldera que se sustituye (o con la que se hibrida). */
function calderaTxt(inst) {
    const c = inst?.caldera_antigua_cal || {};
    const nombre = [limpio(c.marca), limpio(c.modelo)].filter(Boolean).join(' ') || '[MARCA Y MODELO DE LA CALDERA]';
    // El nº de serie de la caldera VIEJA no siempre se puede leer y no es el que se
    // coteja con la placa del equipo instalado: si no consta, no se pide.
    const serie = limpio(c.numero_serie);
    return `${nombre}${serie ? ` (nº de serie ${serie})` : ''}`;
}

// ── El texto ─────────────────────────────────────────────────────────────────

/**
 * El consejo de factura de un expediente, o null si no aplica (RES080: la reforma
 * la facturan varios gremios y su concepto no es este).
 * @param {object} p
 * @param {object} p.exp           expediente (numero_expediente, instalacion, documentacion, cee)
 * @param {object} [p.op]          oportunidad (para la ficha si el número no la dice)
 * @param {object} [p.cliente]     ficha del cliente (titular y NIF)
 * @param {string} [p.instalador]  razón social de quien la emite
 * @param {string} [p.direccionObra] dirección de la instalación ya resuelta
 */
function construirConsejoFactura({ exp, op = {}, cliente = null, instalador = null, direccionObra = null } = {}) {
    if (!exp) return null;
    const ficha = detectPrograma(exp, op || {});
    if (!esSustitucionCaldera(ficha)) return null;
    const inst = exp.instalacion || {};
    const hibridacion = esHibridacion(ficha) || inst.hibridacion === true;

    const unidades = getUnidades(inst.aerotermia_cal);
    const lista = unidades.length ? unidades : [{}];
    const respaldoKw = lista.length === 1 ? (inst.potencia_bomba || null) : null;
    const equipos = lista.length === 1
        ? `bomba de calor aire-agua (aerotermia) ${equipoTxt(lista[0], respaldoKw)}`
        : `${lista.length} bombas de calor aire-agua (aerotermia) en cascada: ${lista.map(u => equipoTxt(u)).join('; ')}`;
    const acs = hayAcs(inst);
    const servicio = acs ? 'para calefacción y ACS' : 'para calefacción';
    const donde = esTerciario(ficha) ? 'del edificio' : 'de la vivienda';
    const conectada = `${conectadaA(inst)} ${donde}`;
    const caldera = calderaTxt(inst);

    const principal = hibridacion
        ? `Suministro e instalación de ${equipos}, ${servicio}, en HIBRIDACIÓN con la caldera existente ${caldera}, que se mantiene como apoyo, ${conectada}.`
        : `Suministro e instalación de ${equipos}, ${servicio}, en sustitución de la caldera existente ${caldera}, ${conectada}.`;

    const lineas = [principal];
    // El ACS con OTRA máquina (no un conjunto): su propia línea, con su placa.
    const unidadesAcs = acs && acsEsOtraMaquina(inst) ? getUnidades(inst.aerotermia_acs) : [];
    for (const u of unidadesAcs) {
        const marca = limpio(u.marca) || '[MARCA]';
        const modelo = limpio(u.modelo) || '[MODELO]';
        const serie = limpio(u.numero_serie) || '[Nº DE SERIE]';
        // Un INTERACUMULADOR (depósito calentado por la bomba de calor) no es otra
        // máquina que produce ACS: lo dice el concepto, o el verificador lo leería
        // como un termo eléctrico fuera de la actuación (26RES060_283, 13/11/2026).
        if (esAcumuladorAcs(inst.aerotermia_acs)) {
            const litros = fmtKw(inst.aerotermia_acs?.litros);
            lineas.push(`Suministro e instalación de interacumulador de ACS${litros ? ` de ${litros} litros` : ''} marca ${marca}, modelo ${modelo}, nº de serie ${serie}, calentado por la bomba de calor.`);
        } else {
            lineas.push(`Suministro e instalación del equipo de producción de ACS marca ${marca}, modelo ${modelo}, nº de serie ${serie}.`);
        }
    }
    if (hibridacion) {
        lineas.push('Regulación y control para el funcionamiento conjunto de la bomba de calor y la caldera.');
        lineas.push('Material auxiliar, conexionado hidráulico y eléctrico a la instalación existente, puesta en marcha y pruebas.');
    } else {
        lineas.push('Desmontaje y retirada de la caldera existente.');
        lineas.push('Material auxiliar, conexionado hidráulico y eléctrico, puesta en marcha y pruebas.');
    }

    // Lo que va en la MISMA factura pero FUERA del CAE, en su línea y con su importe
    // (la regla «un termo u otra cosa, en líneas aparte»). Hoy: el termo eléctrico
    // nuevo que declara el expediente con el ACS fuera de la obra (26RES060_283).
    // No entra en `lineas` (el concepto que se copia) para no mezclarlo con la actuación.
    const aparte = [];
    if (!acs && !hibridacion && esTermoElectrico(inst.aerotermia_acs)) {
        const t = inst.aerotermia_acs || {};
        const litros = fmtKw(t.litros);
        const det = [
            limpio(t.marca) ? `marca ${limpio(t.marca)}` : null,
            limpio(t.modelo) ? `modelo ${limpio(t.modelo)}` : null,
            limpio(t.numero_serie) ? `nº de serie ${limpio(t.numero_serie)}` : null,
            litros ? `de ${litros} litros` : null,
        ].filter(Boolean).join(', ');
        aparte.push(`Suministro e instalación de termo eléctrico para ACS${det ? ` ${det}` : ''}.`);
    }

    const titular = [limpio(cliente?.nombre_razon_social), limpio(cliente?.apellidos)].filter(Boolean).join(' ') || '[TITULAR DEL EXPEDIENTE]';
    const nif = limpio(cliente?.dni) || '[NIF]';
    const emisor = limpio(instalador) || '[EMPRESA INSTALADORA]';
    const fechaCee = fmtFecha(fechaRegistroCee(exp, 'inicial'));

    const reglas = [
        `La emite *${emisor}*, la misma empresa que firma el certificado de la instalación${fechaCee ? `, con fecha posterior al ${fechaCee}` : ''}.`,
        'Marca, modelo y nº de serie, los de la placa del equipo instalado.',
        'Nada de radiadores, suelo radiante ni otros emisores nuevos: la ayuda es por el generador y no admite cambiar los emisores.',
        'Si en la misma factura van placas solares, un termo u otra cosa, en líneas aparte con su importe (o en otra factura).',
        'Si hubo anticipo o factura del material, con este mismo concepto.',
    ];

    return {
        numero_expediente: exp.numero_expediente || null,
        ficha,
        hibridacion,
        titular,
        nif,
        direccion: limpio(direccionObra) || '[DIRECCIÓN DE LA OBRA]',
        instalador: emisor,
        fechaCee,
        lineas,
        aparte,
        pie: PIE_LINEAS,
        aviso: hibridacion ? AVISO_HIBRIDACION : null,
        reglas,
        // ¿Queda algo por completar? Se le dice que lo rellene con la placa.
        conHuecos: lineas.some(l => /\[[^\]]+\]/.test(l)),
    };
}

/** El texto que se COPIA: las líneas del concepto, una por línea, sin numerar. */
function textoConcepto(consejo) {
    return consejo ? consejo.lineas.join('\n') : '';
}

// ── Cuándo se manda ──────────────────────────────────────────────────────────

const esGraveQueTumba = (i) => {
    if (!i) return false;
    const sev = limpio(i.severidad).toUpperCase();
    const estado = limpio(i.estado || 'ABIERTA').toUpperCase();
    const tipo = limpio(i.tipo).toUpperCase();
    const slot = limpio(i.slot).toLowerCase();
    return sev === 'GRAVE' && estado === 'ABIERTA'
        && GRAVES_QUE_TUMBAN.includes(tipo)
        && (!slot || slot === 'facturas');
};

/**
 * La REGLA de cuándo se manda el consejo (Fran, 11/11/2026):
 *   · falta la factura → SÍ;
 *   · la tenemos con una incidencia GRAVE abierta de las que tumban la auditoría
 *     (`GRAVES_QUE_TUMBAN`) → SÍ, diciendo qué hay que corregir;
 *   · si no → NO.
 * @returns {{ mandar: boolean, motivo: 'FALTA'|'GRAVE'|null, graves: Array<{codigo, factura}> }}
 */
function decidirConsejoFactura({ faltaFactura = false, incidencias = [] } = {}) {
    if (faltaFactura) return { mandar: true, motivo: 'FALTA', graves: [] };
    const graves = (Array.isArray(incidencias) ? incidencias : [])
        .filter(esGraveQueTumba)
        .map(i => ({ codigo: limpio(i.tipo).toUpperCase(), factura: limpio(i.ref_label) || null, ref: i.ref || null }));
    // Una incidencia por código y factura: la misma GRAVE registrada dos veces no
    // se le dice dos veces.
    const vistas = new Set();
    const unicas = graves.filter(g => { const k = `${g.codigo}|${g.ref || g.factura}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
    if (unicas.length) return { mandar: true, motivo: 'GRAVE', graves: unicas };
    return { mandar: false, motivo: null, graves: [] };
}

/** Qué hay que corregir, en palabras del instalador, por cada GRAVE. */
function correccion(codigo, consejo) {
    const c = consejo || {};
    switch (codigo) {
        case 'TITULAR': return `Tiene que ir a nombre de *${c.titular}*${c.nif && !/^\[/.test(c.nif) ? ` (NIF ${c.nif})` : ''}, el titular del expediente.`;
        case 'EMISOR': return `La tiene que emitir *${c.instalador}*, la empresa que firma el certificado de la instalación.`;
        case 'UNIDADES_TERMINALES': return 'Lleva emisores nuevos (radiadores, suelo radiante…): la ayuda es por el generador y no admite cambiar los emisores. Si solo se conectaron los que ya había, que lo diga así.';
        case 'ALCANCE': return 'Lleva algo que no es la bomba de calor (placas solares, un termo u otra cosa) sin su importe aparte: en líneas aparte con su importe, o en otra factura.';
        case 'ALCANCE_SIN_EQUIPO': return 'No aparece la bomba de calor: tiene que estar el suministro e instalación del equipo, con su marca, modelo y nº de serie.';
        case 'SERIE_DISTINTA': return 'El nº de serie no es el del equipo instalado: tiene que ser el de su placa.';
        case 'FECHA': return 'Tiene una fecha posterior a hoy: hay que corregir la fecha de emisión.';
        case 'DUPLICADA': return 'Nos ha llegado repetida: si hay otra factura de la obra, mándanos esa.';
        default: return null;
    }
}

/** Las correcciones agrupadas por factura: [{ factura, puntos: [..] }]. */
function correccionesPorFactura(decision, consejo) {
    const grupos = new Map();
    for (const g of decision?.graves || []) {
        const t = correccion(g.codigo, consejo);
        if (!t) continue;
        const k = g.factura || '';
        if (!grupos.has(k)) grupos.set(k, []);
        if (!grupos.get(k).includes(t)) grupos.get(k).push(t);
    }
    return [...grupos.entries()].map(([factura, puntos]) => ({ factura: factura || null, puntos }));
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Los DOS mensajes de WhatsApp que van justo después de la petición: el consejo y,
 * aparte, SOLO el concepto (mantener pulsado → Copiar copia exactamente eso). Sin
 * emojis y sin presentarse: sigue a un mensaje que ya dice de qué obra se habla.
 */
function textosWhatsapp(consejo, decision, { url = null } = {}) {
    if (!consejo) return [];
    const partes = [];
    if (decision?.motivo === 'GRAVE') {
        for (const g of correccionesPorFactura(decision, consejo)) {
            partes.push(`Sobre la factura${g.factura ? ` ${g.factura.replace(/^Factura\s+/i, '')}` : ''} que nos mandaste: tal como está no pasaría la auditoría del CAE. Hay que corregir:\n${g.puntos.map(p => `· ${p}`).join('\n')}`);
        }
        partes.push('Para rehacerla, te recomendamos este concepto (en el siguiente mensaje lo tienes solo, para copiarlo):');
    } else {
        partes.push('Para que la factura de la obra pase la auditoría del CAE, te recomendamos este concepto (en el siguiente mensaje lo tienes solo, para copiarlo):');
    }
    partes.push([
        `*A nombre de:* ${consejo.titular}`,
        `*NIF:* ${consejo.nif}`,
        `*Obra:* ${consejo.direccion}`,
        `*La emite:* ${consejo.instalador}`,
    ].join('\n'));
    partes.push(`*Concepto:*\n${consejo.lineas.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n${consejo.pie}`);
    if (consejo.aviso) partes.push(consejo.aviso);
    partes.push(`*Para que no la rechacen:*\n${consejo.reglas.map(r => `· ${r}`).join('\n')}`);
    if (consejo.conHuecos) partes.push('Lo que va entre corchetes, complétalo con los datos de la placa del equipo.');
    if (url) partes.push(`También lo tienes aquí, con un botón para copiarlo:\n${url}`);
    return [partes.join('\n\n'), textoConcepto(consejo)];
}

// ── Email ────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** *negrita* → <strong> (sobre texto ya escapado). */
const negritas = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
const MONO = "font-family:Consolas,'Courier New',monospace;";

/**
 * El bloque «Texto recomendado para la factura» que va al FINAL del email de la
 * petición, con el botón «Copiar el concepto» (un email no ejecuta JavaScript: el
 * botón abre la página pública, que sí copia).
 */
function htmlEmailConsejo(consejo, decision, { url = null } = {}) {
    if (!consejo) return '';
    const { emailP, emailBox, emailList, emailDataTable, emailButton, BRAND, FONT } = require('../services/emailService');
    const lineas = consejo.lineas.map((l, i) =>
        `<p style="margin:0 0 10px 0;${MONO}font-size:13px;line-height:20px;color:${BRAND.text};">${i + 1}. ${esc(l)}</p>`).join('');
    const copiar = emailBox(
        `<p style="margin:0 0 12px 0;${FONT}font-size:11px;line-height:15px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${BRAND.muted};">Concepto para copiar</p>${lineas}
         <p style="margin:6px 0 0 0;${MONO}font-size:13px;line-height:20px;color:${BRAND.muted};">${esc(consejo.pie)}</p>`,
        { bg: '#FFFFFF', border: '#CFCFCB', mb: url ? 14 : 22 });
    const boton = url
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr><td align="center">${emailButton(url, 'Copiar el concepto', BRAND.orange)}</td></tr></table>`
        : '';
    const corregir = decision?.motivo === 'GRAVE'
        ? correccionesPorFactura(decision, consejo).map(g => emailBox(
            emailP(`<strong>La factura${g.factura ? ` ${esc(g.factura.replace(/^Factura\s+/i, ''))}` : ''} que nos mandaste no pasaría la auditoría del CAE.</strong> Hay que corregir:`, { mb: 8 })
            + emailList(g.puntos.map(negritas), { mb: 0, color: BRAND.text }),
            { bg: BRAND.orangeTint, border: BRAND.orange, mb: 16 })).join('')
        : '';
    return `
      <p style="margin:26px 0 8px;${FONT}font-size:18px;line-height:24px;font-weight:700;color:${BRAND.text};">Texto recomendado para la factura</p>
      ${corregir}
      ${emailP(consejo.conHuecos ? 'Puedes copiarlo y completar lo que va entre corchetes con los datos de la placa del equipo.' : 'Puedes copiarlo tal cual.', { color: BRAND.muted, mb: 14 })}
      ${emailBox(emailDataTable([
          ['A nombre de', esc(consejo.titular)],
          ['NIF', esc(consejo.nif)],
          ['Obra', esc(consejo.direccion)],
          ['La emite', esc(consejo.instalador)],
      ]), { mb: 14 })}
      ${copiar}
      ${boton}
      ${consejo.aviso ? emailBox(emailP(negritas(consejo.aviso), { mb: 0, color: BRAND.text }), { bg: BRAND.orangeTint, border: BRAND.orange, mb: 16 }) : ''}
      ${emailP('<strong>Para que no la rechacen:</strong>', { mb: 8 })}
      ${emailList(consejo.reglas.map(negritas))}`;
}

/**
 * Mete la frase que anuncia el bloque en el TEXTO del correo: detrás del primer
 * párrafo de contenido (el que sigue al saludo), o al final si no hay donde.
 */
function anunciarEnTexto(mensaje) {
    const txt = String(mensaje || '');
    if (txt.includes(FRASE_EMAIL)) return txt;
    const parrafos = txt.split(/\n\s*\n/);
    if (parrafos.length >= 3) {
        parrafos.splice(2, 0, FRASE_EMAIL);
        return parrafos.join('\n\n');
    }
    return `${txt}\n\n${FRASE_EMAIL}`;
}

// ── El enlace de la página pública ───────────────────────────────────────────

/**
 * /consejo-factura/:expedienteId?token=  — el token es el de SUBIDA de la
 * oportunidad (`datos_calculo.upload_token`), el mismo que lleva el enlace de
 * subir la factura que se le manda al instalador. No se inventa otro.
 */
function enlaceConsejo(expedienteId, token) {
    return expedienteId && token ? `${FRONTEND()}/consejo-factura/${expedienteId}?token=${encodeURIComponent(token)}` : null;
}

// ── Montarlo desde la BD ─────────────────────────────────────────────────────

/** Nº de facturas aportadas: las registradas + las subidas por el enlace (dedup por driveId). */
function facturasAportadas(doc = {}, uploads = {}) {
    const set = new Set();
    (Array.isArray(doc?.facturas) ? doc.facturas : []).forEach(f => {
        if (f && (f.drive_id || f.drive_link)) set.add(f.drive_id || f.drive_link);
    });
    (Array.isArray(uploads?.DOC_FACTURAS) ? uploads.DOC_FACTURAS : []).forEach(u => {
        if (u && (u.driveId || u.link)) set.add(u.driveId || u.link);
    });
    return set.size;
}

/**
 * La dirección de la obra en UNA línea, sin repetir: en muchas fichas la calle ya
 * trae el CP, el municipio y la provincia («CL PINTOR YAÑEZ 55 13328 ALMEDINA
 * (CIUDAD REAL)») y añadirlos otra vez la duplicaba (26RES060_194, 11/11/2026).
 */
const _normDir = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function componerDireccion(calle, cp, municipio, provincia) {
    const base = String(calle || '').trim();
    const low = _normDir(base);
    const nuevo = (x) => x && String(x).trim() && !low.includes(_normDir(x));
    const loc = [cp, municipio].filter(nuevo).map(x => String(x).trim()).join(' ');
    // La provincia, solo si no está ya (ni es el propio municipio: «13000 Ciudad Real»).
    const prov = nuevo(provincia) && _normDir(provincia) !== _normDir(municipio) ? `(${String(provincia).trim().toUpperCase()})` : '';
    const resto = [loc, prov].filter(Boolean).join(' ');
    return [base, resto].filter(Boolean).join(', ') || null;
}

/** Quién emite la factura: el mismo criterio que la GRAVE `EMISOR` del OCR. */
function instaladorIdDe(exp, op) {
    const id = exp?.instalador_asociado_id || op?.instalador_asociado_id || op?.prescriptor_id || exp?.instalacion?.instalador_id || null;
    return id && String(id) !== '1' ? id : null;
}

/**
 * Carga lo necesario y devuelve { consejo, decision, url, copiar, whatsapp }.
 * Solo LEE: si la oportunidad no tiene token de subida, la página no lleva enlace,
 * salvo `crearToken: true` (las rutas que ya lo crean al pedir la factura).
 * `faltaFactura` se puede pasar si quien llama ya lo sabe (el checklist).
 */
async function cargarConsejoFactura(expOrId, { op = null, cliente = null, faltaFactura = null, crearToken = false } = {}) {
    const supabase = require('../services/supabaseClient');
    let exp = expOrId;
    if (!exp || typeof exp !== 'object') {
        const { data, error } = await supabase.from('expedientes')
            .select('id, numero_expediente, oportunidad_id, cliente_id, instalador_asociado_id, instalacion, documentacion, cee')
            .eq('id', expOrId).maybeSingle();
        if (error) throw new Error(error.message);
        exp = data;
    }
    if (!exp) return null;

    const [opR, cliR] = await Promise.all([
        // Campos CONCRETOS del JSONB (regla 22): `datos_calculo` entero trae fotos y XML.
        op || !exp.oportunidad_id ? Promise.resolve({ data: op })
            : supabase.from('oportunidades')
                .select('id, ficha, instalador_asociado_id, prescriptor_id, upload_token:datos_calculo->>upload_token, reforma_uploads:datos_calculo->reforma_uploads, inputs:datos_calculo->inputs')
                .eq('id', exp.oportunidad_id).maybeSingle()
                .then(r => ({ ...r, data: r.data ? { ...r.data, datos_calculo: { upload_token: r.data.upload_token, reforma_uploads: r.data.reforma_uploads, inputs: r.data.inputs } } : null })),
        cliente || !exp.cliente_id ? Promise.resolve({ data: cliente })
            : supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle(),
    ]);
    const opp = opR.data || {};
    const cli = cliR.data || null;

    const insId = instaladorIdDe(exp, opp);
    let instalador = null;
    if (insId) {
        const { data: p } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', insId).maybeSingle();
        instalador = p?.razon_social || null;
    }

    // La dirección de la OBRA, con la fuente única de la app (cliente si «misma
    // dirección», si no la de la instalación).
    let direccionObra = null;
    try {
        const path = require('path');
        const { pathToFileURL } = require('url');
        const { usaDireccionCliente, direccionDelCliente } = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/direccionInstalacion.js')).href);
        const inst = exp.instalacion || {};
        const dc = usaDireccionCliente(inst) ? direccionDelCliente(cli) : null;
        direccionObra = dc
            ? componerDireccion(dc.calle, dc.cp, dc.municipio, dc.provincia)
            : componerDireccion(inst.direccion, inst.codigo_postal, inst.municipio, inst.provincia);
        if (!direccionObra && cli) {
            direccionObra = componerDireccion(cli.direccion, cli.codigo_postal, cli.municipio, cli.provincia);
        }
    } catch (e) { console.warn('[consejoFactura] dirección:', e.message); }

    const consejo = construirConsejoFactura({ exp, op: opp, cliente: cli, instalador, direccionObra });
    if (!consejo) return { consejo: null, decision: { mandar: false, motivo: null, graves: [] }, url: null, token: opp?.datos_calculo?.upload_token || null, copiar: '', whatsapp: [] };

    const doc = exp.documentacion || {};
    const falta = typeof faltaFactura === 'boolean'
        ? faltaFactura
        : facturasAportadas(doc, opp?.datos_calculo?.reforma_uploads || {}) === 0;
    const decision = decidirConsejoFactura({ faltaFactura: falta, incidencias: doc.incidencias || [] });

    let token = opp?.datos_calculo?.upload_token || null;
    if (!token && crearToken && exp.oportunidad_id) {
        try { token = (await require('../services/reformaUploadService').attachUploadToken(exp.oportunidad_id)).token; }
        catch (e) { console.warn('[consejoFactura] token:', e.message); }
    }
    const url = enlaceConsejo(exp.id, token);
    // `token` es para que la ruta PÚBLICA lo compare; nunca se devuelve al navegador.
    return { consejo, decision, url, token, copiar: textoConcepto(consejo), whatsapp: textosWhatsapp(consejo, decision, { url }) };
}

module.exports = {
    GRAVES_QUE_TUMBAN,
    FRASE_EMAIL,
    PIE_LINEAS,
    construirConsejoFactura,
    textoConcepto,
    decidirConsejoFactura,
    correccionesPorFactura,
    textosWhatsapp,
    htmlEmailConsejo,
    anunciarEnTexto,
    enlaceConsejo,
    facturasAportadas,
    instaladorIdDe,
    componerDireccion,
    cargarConsejoFactura,
};
