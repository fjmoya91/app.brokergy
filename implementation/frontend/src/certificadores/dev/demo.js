// ─── demo.js — datos SIMULADOS para ver la app sin backend (solo desarrollo) ─
// Se carga con `?demo=1` (dev/flag.js) y SOLO en `vite` (import.meta.env.DEV):
// en el build de producción ni se importa. Sustituye el adaptador de axios para
// /api/certapp*, /api/certapp-admin*, /api/public/certapp* y las rutas públicas
// del Catastro que usa la app, con un estado en memoria (se pierde al recargar
// salvo las obras, que van a sessionStorage para poder recargar la ficha).
// Nada sale a ningún servidor: ni Supabase, ni el Catastro, ni Drive.
import axios from 'axios';
import { sanearCuestionario, barrido, SLOT_IDS } from '../logic/cuestionario';

// v2 (25/10/2026): las obras traen el Catastro (deducciones) y el «para qué» múltiple.
const CLAVE = 'certapp_demo_estado_v2';
const ahora = () => new Date().toISOString();
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `demo-${Math.random().toString(16).slice(2)}-${Date.now()}`);

// Una miniatura dibujada (SVG en data: — no pesa y no sale a la red).
const miniatura = (texto, color = '#e9e3d6') => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/><text x="100" y="108" font-family="Arial" font-size="22" text-anchor="middle" fill="#55585f">${texto}</text></svg>`,
)}`;

const CATASTRO_CASA = {
    rc: '1234567VJ1213S0001AB', uso: 'Residencial', tipo: 'Parcela construida sin división horizontal', plantas: 1,
    construcciones: [{ tipo: 'VIVIENDA', planta: '00', superficie: 118 }, { tipo: 'APARCAMIENTO', planta: '00', superficie: 28 }],
    participacion: '100,00', anio: 1978, superficie: 146, reforma: null,
};

// Municipios de la demo (GET /municipios): unos pocos por provincia.
const MUNICIPIOS = {
    13: ['Alcázar de San Juan', 'Argamasilla de Alba', 'Ciudad Real', 'Daimiel', 'Manzanares', 'Puertollano', 'Socuéllamos', 'Tomelloso', 'Valdepeñas'],
    '02': ['Albacete', 'Almansa', 'Hellín', 'La Roda', 'Villarrobledo'],
    45: ['Illescas', 'Seseña', 'Talavera de la Reina', 'Toledo'],
    28: ['Alcalá de Henares', 'Getafe', 'Madrid', 'Móstoles'],
};

function estadoInicial() {
    const cuenta = {
        id: 'demo-cuenta', email: 'tecnico.demo@example.com', nombre: 'Laura', apellidos: 'Gómez Prieto',
        nif: '', telefono: '600000000', empresa: null, empresa_nif: null, titulacion: '', num_colegiado: null,
        colegio: null, provincia: 'Ciudad Real', municipio: 'Tomelloso', direccion: null, codigo_postal: null,
        estado: 'ACTIVA', creditos: 4, creditos_usados: 2, ultimo_acceso_at: ahora(), created_at: hace(60 * 24 * 3),
        comunidades: ['CASTILLA-LA MANCHA'], software: ['CE3X'], condiciones: { version: '2026-10-24', at: hace(60 * 24 * 3) },
        telefono_por_confirmar: null,
    };
    const base = (o) => ({
        cuenta_id: cuenta.id, titular: {}, cuestionario: {}, documentacion: { reforma_uploads: {} },
        proposito: null, en_vivienda: null, zona_climatica: 'D3', uso: 'Residencial', ccaa: 'Castilla-La Mancha',
        provincia: 'Ciudad Real', created_at: hace(60), updated_at: hace(30), ...o,
    });
    const obras = [
        base({
            id: 'demo-obra-1', numero_expediente: '2026EXT_3', nombre: 'María López Ruiz', estado: 'BORRADOR',
            ref_catastral: '1234567VJ1213S0001AB', direccion: 'CALLE DON VÍCTOR PEÑASCO 12', municipio: 'Tomelloso',
            codigo_postal: '13700', superficie_catastro: 146, anio_construccion: 1978, proposito: 'COMPRAVENTA', en_vivienda: false,
            lat: 39.1577, lng: -3.0207,
            // Como lo guarda el servidor (services/certapp/catastro.js): casa sin división
            // horizontal, vivienda en planta baja y un garaje → dudas «qué casa» y «garaje pegado».
            catastro: CATASTRO_CASA,
            titular: { nombre: 'María', apellidos: 'López Ruiz', telefono: '611111111' },
            cuestionario: { calefaccion: 'gasoleo', propositos: ['COMPRAVENTA'], fases_ok: ['inmueble', 'titular'] },
            documentacion: { reforma_uploads: { FOTO_FACHADA_PRINCIPAL: [{ driveId: 'demo-f1', nombre: 'fachada.jpg', mime: 'image/jpeg', subido_at: hace(40), por: 'certificador' }] } },
        }),
        base({
            id: 'demo-obra-2', numero_expediente: '2026EXT_2', nombre: 'Antonio Ruiz', estado: 'EN_PREPARACION',
            ref_catastral: '9876543VJ1293N0012XY', direccion: 'AVENIDA ANTONIO HUERTAS 41 3º B', municipio: 'Tomelloso',
            codigo_postal: '13700', superficie_catastro: 86, anio_construccion: 1995, proposito: 'ALQUILER', en_vivienda: true,
            titular: { nombre: 'Antonio', apellidos: 'Ruiz' }, pedido_at: hace(50),
            cuestionario: { tipo_edificio: 'PISO', posicion_piso: 'INTERMEDIO', colinda_no_calefactado: false, calefaccion: 'gas', acs: 'misma_caldera', termo_extra: false, aire_acondicionado: false, placas_fv: 'NO' },
        }),
        base({
            id: 'demo-obra-3', numero_expediente: '2026EXT_1', nombre: 'Carmen Díaz', estado: 'LISTO',
            ref_catastral: '5554443VJ1253S0001ZZ', direccion: 'CALLE SOCUÉLLAMOS 7', municipio: 'Tomelloso',
            codigo_postal: '13700', superficie_catastro: 142, anio_construccion: 1968, proposito: 'IRPF_AEROTERMIA', en_vivienda: false,
            titular: { nombre: 'Carmen', apellidos: 'Díaz' }, pedido_at: hace(60 * 26), entregado_at: hace(60 * 3),
            cuestionario: { tipo_edificio: 'UNIFAMILIAR_AISLADA', cubierta: 'INCLINADA', colinda_no_calefactado: true, colindantes: ['GARAJE'], calefaccion: 'gasoleo', acs: 'misma_caldera' },
        }),
    ];
    const eventos = {
        'demo-obra-2': [
            { id: 'e1', created_at: hace(50), tipo: 'GENERAR', texto: 'Certificado pedido (quedan 4 créditos)', por: 'certificador' },
            { id: 'e0', created_at: hace(70), tipo: 'CATASTRO', texto: 'Datos del Catastro (9876543VJ1293N0012XY)', por: 'certificador' },
        ],
        'demo-obra-3': [
            { id: 'e5', created_at: hace(60 * 3), tipo: 'ENTREGA', texto: 'Certificado entregado; carpeta compartida con el certificador', por: 'BROKERGY' },
            { id: 'e4', created_at: hace(60 * 26), tipo: 'GENERAR', texto: 'Certificado pedido (quedan 5 créditos)', por: 'certificador' },
        ],
    };
    const beta = [
        { id: 'demo-b1', created_at: hace(90), nombre: 'Javier Martín', email: 'javier.demo@example.com', telefono: '622222222', provincia: 'Toledo', perfil: 'AUTONOMO', empresa: null, cee_mes: '6-15', minutos_cee: '60-120', minutos_presentar: '10-20', interes_ia_presentar: 'SI', software: ['CE3X'], comunidades: ['Castilla-La Mancha'], comentarios: 'Medir y dibujar la envolvente.', acepta_comunicaciones: true, origen: 'landing', estado: 'NUEVA' },
        { id: 'demo-b2', created_at: hace(60 * 30), nombre: 'Certifica Sur SL', email: 'info.demo@example.com', telefono: '633333333', provincia: 'Sevilla', perfil: 'EMPRESA_SUBCONTRATA', empresa: 'Certifica Sur', cee_mes: '40+', minutos_cee: '30-60', minutos_presentar: '<10', interes_ia_presentar: 'QUIZA', coste_subcontrata_eur: 45, software: ['CE3X', 'CYPETHERM'], comunidades: ['Andalucía'], comentarios: '', acepta_comunicaciones: false, origen: 'compartido', estado: 'NUEVA' },
    ];
    const delCertificador = { nombre: 'Laura', apellidos: 'Gómez Prieto', email: cuenta.email };
    const feedback = [
        { id: 'demo-fb1', created_at: hace(20), tipo: 'MEJORA', texto: 'Estaría bien poder dictar las notas por voz.', pantalla: '/panel · Mis obras', estado: 'NUEVA', cuenta: delCertificador, obra_id: null },
        { id: 'demo-fb2', created_at: hace(60 * 2), tipo: 'ERROR', texto: 'En el certificado la fachada trasera sale orientada al norte y da al sur.', pantalla: '/obra/demo-obra-3 · Obra', estado: 'HECHA', cuenta: delCertificador, obra_id: 'demo-obra-3',
            respuesta: 'Tenías razón: la orientación venía mal del plano. Lo hemos corregido y regenerado; ya tienes el certificado nuevo en la obra.', respuesta_at: hace(60), respuesta_por: 'fran@brokergy.es' },
        { id: 'demo-fb3', created_at: hace(60 * 30), tipo: 'SUGERENCIA', texto: 'Que el PDF del croquis salga también en A3.', pantalla: '/obra/demo-obra-3 · Obra', estado: 'VISTA', cuenta: delCertificador, obra_id: null,
            respuesta: 'Lo apuntamos para la próxima versión. Te avisamos cuando esté.', respuesta_at: hace(60 * 26), respuesta_por: 'fran@brokergy.es' },
    ];
    return { cuenta, obras, eventos, beta, feedback, movimientos: movimientosIniciales(cuenta), asistenteUsos: 0 };
}

// «Mis gastos»: 5 de regalo al darse de alta, 1 más a mano y los 2 certificados
// pedidos (los de demo-obra-3 y demo-obra-2) → quedan 4, como la cuenta.
function movimientosIniciales(cuenta) {
    return [
        { id: 4, created_at: hace(50), cuenta_id: cuenta.id, obra_id: 'demo-obra-2', tipo: 'GASTO', creditos: -1, saldo_despues: 4, importe_eur: null, concepto: 'Certificado pedido' },
        { id: 3, created_at: hace(60 * 26), cuenta_id: cuenta.id, obra_id: 'demo-obra-3', tipo: 'GASTO', creditos: -1, saldo_despues: 5, importe_eur: null, concepto: 'Certificado pedido' },
        { id: 2, created_at: hace(60 * 24 * 2), cuenta_id: cuenta.id, obra_id: null, tipo: 'AJUSTE', creditos: 1, saldo_despues: 6, importe_eur: null, concepto: 'BROKERGY te ha dado 1 certificado' },
        { id: 1, created_at: hace(60 * 24 * 3), cuenta_id: cuenta.id, obra_id: null, tipo: 'ALTA', creditos: 5, saldo_despues: 5, importe_eur: null, concepto: 'Certificados de regalo de la beta' },
    ];
}

let S = null;
function cargarEstado() {
    try {
        const j = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
        if (j?.obras) { j.movimientos ||= movimientosIniciales(j.cuenta); return j; }
    } catch { /* nuevo */ }
    return estadoInicial();
}
/** Un movimiento de «Mis gastos», como lo apuntan las RPC del crédito y el admin. */
const apuntarMov = (tipo, creditos, concepto, obraId = null) => {
    const id = Math.max(0, ...S.movimientos.map(m => Number(m.id) || 0)) + 1;
    S.movimientos.unshift({ id, created_at: ahora(), cuenta_id: S.cuenta.id, obra_id: obraId, tipo, creditos, saldo_despues: S.cuenta.creditos, importe_eur: null, concepto });
};
/** GET /api/certapp/movimientos, como el servidor (services/certapp/movimientos.js): sin `por`. */
const misGastos = () => {
    const obra = (id) => { const o = S.obras.find(x => x.id === id); return o ? { id: o.id, numero_expediente: o.numero_expediente, direccion: o.direccion, municipio: o.municipio } : null; };
    const compras = S.movimientos.filter(m => m.tipo === 'COMPRA');
    const comprados = compras.reduce((s, m) => s + m.creditos, 0);
    return {
        resumen: {
            disponibles: S.cuenta.creditos, usados: S.cuenta.creditos_usados, comprados,
            recibidos_gratis: Math.max(S.cuenta.creditos + S.cuenta.creditos_usados - comprados, 0),
            gastado_eur: compras.reduce((s, m) => s + (Number(m.importe_eur) || 0), 0), compras_abiertas: false,
        },
        movimientos: [...S.movimientos].sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : b.id - a.id))
            .map(m => ({ id: m.id, created_at: m.created_at, tipo: m.tipo, creditos: m.creditos, saldo_despues: m.saldo_despues, importe_eur: m.importe_eur, concepto: m.concepto, factura_id: null, obra: m.obra_id ? obra(m.obra_id) : null })),
    };
};
const guardarEstado = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify(S)); } catch { /* lleno */ } };

class ErrorDemo extends Error {
    constructor(status, data) { super(data?.error || `HTTP ${status}`); this.status = status; this.data = data; }
}
const fallo = (status, error, code, extra = {}) => { throw new ErrorDemo(status, { error, code, ...extra }); };

const obraDe = (id) => S.obras.find(o => o.id === id) || fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
const vista = (o) => {
    const up = o.documentacion?.reforma_uploads || {};
    const slots = {};
    for (const id of SLOT_IDS) {
        slots[id] = (up[id] || []).map(e => ({ ...e, link: e.thumb || miniatura(e.nombre || id), thumb: /^(image|video)\//.test(e.mime || '') ? miniatura(e.nombre || id) : null }));
    }
    return { slots };
};
const sinAltaGoogle = (cfg) => !S.altaGoogle && /demo-google/.test(String(cfg?.headers?.Authorization || cfg?.headers?.authorization || ''));
const paraCertificador = (o) => {
    const { portal_token, cuenta_id, ...resto } = o; // eslint-disable-line no-unused-vars
    return resto;
};
const enlaces = (o) => (['LISTO', 'VALIDADO'].includes(o.estado) ? {
    pdf: miniatura('CEE PDF', '#fff'), firmado: o.firmado ? miniatura('CEE FIRMADO', '#fff') : null, cex: null, xml: miniatura('XML', '#fff'), croquis: null,
    carpeta: 'https://drive.google.com/', envolvente: `/obra/${o.id}/envolvente?origen=ext`,
} : null);
// Como firma.resumenParaCertificador: la calificación y la firma, sin enlaces.
const ceeDe = (o) => (['LISTO', 'VALIDADO'].includes(o.estado) ? {
    calificacion: { consumo: 'E', emisiones: 'D' }, firma: o.firmado || null,
} : null);
// Un PDF de una página con el rótulo de CE3X, para ver el modal de firma colocado.
const pdfDemo = () => {
    const txt = 'BT /F1 16 Tf 60 770 Td (CERTIFICADO DE EFICIENCIA ENERGETICA - DEMO) Tj ET BT /F1 10 Tf 330 170 Td (Firma del tecnico certificador:) Tj ET';
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${txt.length} >>\nstream\n${txt}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let out = '%PDF-1.4\n';
    const offs = objs.map((ob, i) => { const n = out.length; out += `${i + 1} 0 obj\n${ob}\nendobj\n`; return n; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`
        + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return btoa(out);
};
const listaObra = (o) => ({
    id: o.id, numero_expediente: o.numero_expediente, nombre: o.nombre, direccion: o.direccion, municipio: o.municipio,
    provincia: o.provincia, ref_catastral: o.ref_catastral, estado: o.estado, proposito: o.proposito, en_vivienda: o.en_vivienda,
    created_at: o.created_at, updated_at: o.updated_at, pedido_at: o.pedido_at || null, entregado_at: o.entregado_at || null,
});
const evento = (obraId, tipo, texto, por = 'certificador') => {
    (S.eventos[obraId] ||= []).unshift({ id: uuid(), created_at: ahora(), tipo, texto, por });
};
// Una incidencia como la ve el certificador (services/certapp/incidencias.js → paraCertificador).
const incidencia = (f) => ({
    id: f.id, created_at: f.created_at, tipo: f.tipo, texto: f.texto, obra_id: f.obra_id || null,
    numero_expediente: S.obras.find(o => o.id === f.obra_id)?.numero_expediente || null,
    estado: f.estado, respuesta: f.respuesta || null, respuesta_at: f.respuesta_at || null,
});
// Y como la ve el admin (con la obra embebida, como el select del servidor).
const incidenciaAdmin = (f) => ({ ...f, obra: f.obra_id ? { numero_expediente: S.obras.find(o => o.id === f.obra_id)?.numero_expediente || null } : null });
/** PUT/PATCH del admin: como el servidor (respuesta nueva → respuesta_at/por, NUEVA → VISTA, email en seco). */
const guardarIncidencia = (b, [, id]) => {
    const f = S.feedback.find(x => x.id === id) || fallo(404, 'No encuentro esa incidencia.', 'NO_ENCONTRADO');
    let nueva = false;
    if ('estado' in b) f.estado = String(b.estado).toUpperCase();
    if ('respuesta' in b) {
        const r = String(b.respuesta || '').trim() || null;
        if (r !== (f.respuesta || null)) { f.respuesta = r; f.respuesta_at = r ? ahora() : null; f.respuesta_por = r ? 'demo@brokergy.es' : null; nueva = !!r; }
    }
    if (nueva && !('estado' in b) && f.estado === 'NUEVA') f.estado = 'VISTA';
    return { feedback: incidenciaAdmin(f), aviso: nueva && b.avisar !== false ? { seco: true, canales: [] } : null };
};

// ── Las rutas simuladas ──────────────────────────────────────────────────────
const RUTAS = [
    // Perfil
    // La sesión de «Continuar con Google» de la demo (token demo-google) no tiene cuenta hasta el alta.
    ['GET', /^\/api\/certapp\/me$/, (b, m, cfg) => {
        if (sinAltaGoogle(cfg)) fallo(403, 'Esta cuenta no tiene acceso a la app de certificadores.', 'CERTAPP_SIN_CUENTA');
        return { cuenta: S.cuenta, esAdmin: true };
    }],
    ['POST', /^\/api\/certapp\/alta$/, (b) => {
        if (!b.acepta_condiciones) fallo(400, 'Para crear tu cuenta tienes que aceptar las condiciones de uso.', 'FALTA_CONDICIONES');
        S.altaGoogle = true;
        // Como cuentas.altaConSesion: el email de la sesión, el teléfono copiado y las condiciones con su fecha.
        const [nombre, ...ap] = String(b.nombre || '').trim().split(/\s+/);
        Object.assign(S.cuenta, {
            email: 'tecnica.google@ejemplo.es', nombre: nombre || S.cuenta.nombre, apellidos: ap.join(' ') || S.cuenta.apellidos,
            telefono: b.telefono || S.cuenta.telefono, provincia: b.provincia || S.cuenta.provincia,
            comunidades: Array.isArray(b.comunidades) ? b.comunidades : [], software: Array.isArray(b.software) ? b.software : [],
            condiciones: { version: '2026-10-24', at: ahora() },
        });
        return { __status: 201, ok: true, nueva: true, cuenta: S.cuenta };
    }],
    ['PUT', /^\/api\/certapp\/me$/, (b) => { Object.assign(S.cuenta, b); return { cuenta: S.cuenta }; }],
    // Obras
    ['GET', /^\/api\/certapp\/obras$/, () => ({ obras: S.obras.filter(o => o.estado !== 'ARCHIVADA').map(listaObra) })],
    ['POST', /^\/api\/certapp\/obras$/, (b) => {
        const n = S.obras.length + 1;
        const o = {
            id: uuid(), cuenta_id: S.cuenta.id, numero_expediente: `2026EXT_${n + 1}`, nombre: b.ref_catastral || null, estado: 'BORRADOR',
            ref_catastral: b.ref_catastral || null, titular: {}, cuestionario: {}, documentacion: { reforma_uploads: {} },
            created_at: ahora(), updated_at: ahora(),
        };
        S.obras.unshift(o);
        return { __status: 201, obra: paraCertificador(o), drive: { ok: true } };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/catastro$/, (b, [, id]) => {
        const o = obraDe(id);
        const rc = String(b.rc || o.ref_catastral || '').toUpperCase();
        if (rc.length === 14) {
            fallo(409, 'Esa referencia es de un edificio con varias viviendas: elige cuál.', 'PARCELA', {
                parcela: { rc, direccion: 'AV ANTONIO HUERTAS 41 TOMELLOSO (CIUDAD REAL)' },
                viviendas: ['1º A', '1º B', '2º A', '2º B'].map((pp, i) => ({ rc: `${rc}000${i + 1}XY`, direccion: `AV ANTONIO HUERTAS 41 Es:1 Pl:0${(i >> 1) + 1} Pt:${pp}`, escalera: '1', planta: pp.slice(0, 2), puerta: pp.slice(-1), uso: 'Residencial', superficie: 80 + i * 4, anio: 1995, vivienda: true }))
                    .concat([{ rc: `${rc}0009ZZ`, direccion: 'AV ANTONIO HUERTAS 41 Es:1 Pl:-1 Pt:12', escalera: '1', planta: '-1', puerta: '12', uso: 'Almacén-Estacionamiento', superficie: 24, anio: 1995, vivienda: false }]),
            });
        }
        if (rc.startsWith('0000')) fallo(404, 'El Catastro no encuentra esa referencia.', 'RC_NO_EXISTE');
        Object.assign(o, {
            ref_catastral: rc, direccion: 'CALLE DOCTOR FLEMING 23', municipio: 'Tomelloso', provincia: 'Ciudad Real', codigo_postal: '13700',
            superficie_catastro: 104, anio_construccion: 1982, zona_climatica: 'D3', uso: 'Residencial', updated_at: ahora(),
            lat: 39.16, lng: -3.02, catastro: { ...CATASTRO_CASA, rc, anio: 1982, superficie: 104, construcciones: [{ tipo: 'VIVIENDA', planta: '00', superficie: 104 }] },
        });
        evento(o.id, 'CATASTRO', `Datos del Catastro (${rc})`);
        return { obra: paraCertificador(o) };
    }],
    ['GET', /^\/api\/certapp\/obras\/([^/]+)$/, (b, [, id]) => {
        const o = obraDe(id);
        return { obra: paraCertificador(o), barrido: barrido(o, S.cuenta), eventos: S.eventos[id] || [], enlaces: enlaces(o), cee: ceeDe(o) };
    }],
    // Firma y definitivo (services/certapp/firma.js). AutoFirma no corre en la
    // demo: el modal se abre con el recuadro colocado, pero no firma.
    ['GET', /^\/api\/certapp\/obras\/([^/]+)\/cee\/para-firmar$/, (b, [, id]) => {
        const o = obraDe(id);
        if (!['LISTO', 'VALIDADO'].includes(o.estado)) fallo(409, 'Aún no está listo.', 'NO_ENTREGADA');
        return { nombre: `${o.numero_expediente} - CEE.pdf`, base64: pdfDemo() };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/cee\/firmado$/, (b, [, id]) => {
        const o = obraDe(id);
        o.firmado = { at: ahora(), firmante: `${S.cuenta.nombre || 'Certificador'} ${S.cuenta.apellidos || ''}`.trim(), via: 'autofirma' };
        if (o.estado === 'LISTO') o.estado = 'VALIDADO';
        evento(o.id, 'FIRMA', 'El certificador ha firmado el certificado con AutoFirma');
        return { ok: true, estado: o.estado, firma: o.firmado, avisos: [] };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/cee\/definitivo$/, (b, [, id]) => {
        const o = obraDe(id);
        const f = b instanceof FormData ? b.get('fichero') : null;
        const nombre = String(f?.name || '').toLowerCase();
        if (nombre.endsWith('.cex')) fallo(415, 'El .cex no se sube: guárdalo tú. Para el registro cuentan el XML y el PDF.', 'CEX_NO');
        if (!/\.(xml|pdf)$/.test(nombre)) fallo(415, 'Sube el XML del certificado (de CE3X) o el PDF.', 'TIPO_NO_VALE');
        const tipo = nombre.endsWith('.xml') ? 'xml' : 'pdf';
        evento(o.id, 'DEFINITIVO', `El certificador ha subido el ${tipo.toUpperCase()} definitivo`);
        return { ok: true, tipo, fichero: `${o.numero_expediente} - CEE.${tipo}`, estado: o.estado, __espera: 900 };
    }],
    ['PUT', /^\/api\/certapp\/obras\/([^/]+)$/, (b, [, id]) => {
        const o = obraDe(id);
        if (o.estado !== 'BORRADOR') fallo(409, 'El certificado ya está pedido: los datos de la obra ya no se cambian.', 'OBRA_CERRADA');
        const patch = { ...b };
        if ('cuestionario' in patch) {
            patch.cuestionario = sanearCuestionario(patch.cuestionario || {});
            // Como obras.actualizar: el primer «para qué» va también en la columna.
            if (patch.cuestionario.propositos?.length) patch.proposito = patch.cuestionario.propositos[0];
        }
        if (patch.titular) {
            patch.titular = Object.fromEntries(Object.entries(patch.titular).filter(([, v]) => v));
            const n = [patch.titular.nombre, patch.titular.apellidos].filter(Boolean).join(' ');
            if (n) patch.nombre = n;
        }
        Object.assign(o, patch, { updated_at: ahora() });
        return { obra: paraCertificador(o) };
    }],
    ['GET', /^\/api\/certapp\/obras\/([^/]+)\/docs$/, (b, [, id]) => vista(obraDe(id))],
    // «Lo que ha visto la IA», como services/certapp/vistoIa.js: PROPONE, no escribe.
    // Con fotos de fachada mira «las fotos»; sin ellas, «Street View».
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/visto-ia$/, (b, [, id]) => {
        const o = obraDe(id);
        if (o.estado !== 'BORRADOR') fallo(409, 'El certificado ya está pedido: los datos de la obra ya no se cambian.', 'OBRA_CERRADA');
        const up = o.documentacion?.reforma_uploads || {};
        const fachada = (up.FOTO_FACHADA_PRINCIPAL || [])[0] || (up.FOTO_FACHADAS || [])[0];
        const placa = (up.FOTO_PLACA_CALDERA || [])[0];
        const ori = fachada ? 'FOTO' : 'STREETVIEW';
        const valores = { plantas: '1', cubierta: 'INCLINADA', fachada: 'ENFOSCADO', persianas: true, aislamiento_fachada: 'NO' };
        const origen = Object.fromEntries(Object.keys(valores).map(k => [k, ori]));
        const notas = { cubierta: 'tejado de teja con su pendiente', fachada: 'fachada pintada, sin ladrillo visto', persianas: 'persianas enrollables en las ventanas', plantas: 'una sola planta sobre la calle' };
        const fotos = fachada ? Object.fromEntries(Object.keys(valores).map(k => [k, fachada.driveId])) : {};
        if (fachada) { valores.marco = 'METALICO'; origen.marco = 'FOTO'; notas.marco = 'perfiles de aluminio finos, sin rotura'; fotos.marco = fachada.driveId; }
        if (placa) {
            Object.assign(valores, { tipo_caldera: 'ESTANDAR', marca_modelo_calefaccion: 'ROCA LAIA 25 GTF', potencia_kw: '25' });
            for (const k of ['tipo_caldera', 'marca_modelo_calefaccion', 'potencia_kw']) { origen[k] = 'PLACA'; fotos[k] = placa.driveId; }
            notas.marca_modelo_calefaccion = 'leído en la placa de la caldera';
        }
        evento(o.id, 'VISTO_IA', `La IA ha mirado ${fachada ? 'las fotos' : 'Street View'}`, 'IA');
        return {
            at: ahora(), propuesta: { valores, origen, notas, fotos },
            dudas: [{
                id: 'ia_vidrio', k: 'vidrio', pregunta: '¿Las ventanas son de doble vidrio?', por_que: 'Por el reflejo parece doble, pero no se ve bien de lejos.',
                foto: fachada?.driveId || null,
                opciones: [{ label: 'Doble vidrio', valores: { vidrio: 'DOBLE' } }, { label: 'Vidrio simple', valores: { vidrio: 'SIMPLE' } }],
            }],
            fuentes: { fotos: fachada ? 1 + (placa ? 1 : 0) : 0, streetview: !fachada, placa: !!placa },
            uso: { hoy: 1, max_dia: 15 }, __espera: 2200,
        };
    }],
    ['GET', /^\/api\/certapp\/municipios$/, (b, m, cfg) => {
        const cod = String(cfg.params?.prov || '').padStart(2, '0');
        return { municipios: MUNICIPIOS[cod] || MUNICIPIOS[Number(cod)] || [] };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/docs\/([^/]+)$/, (b, [, id, slot]) => {
        const o = obraDe(id);
        const files = b instanceof FormData ? b.getAll('files') : [];
        const up = (o.documentacion.reforma_uploads ||= {});
        const nuevos = files.map(f => ({ driveId: uuid(), nombre: f.name, mime: f.type || 'image/jpeg', subido_at: ahora(), por: 'certificador' }));
        up[slot] = [...(up[slot] || []), ...nuevos];
        return { ok: true, subidos: nuevos, rechazados: [], errores: [], slots: vista(o).slots, __espera: 900 };
    }],
    ['DELETE', /^\/api\/certapp\/obras\/([^/]+)\/docs\/([^/]+)\/([^/]+)$/, (b, [, id, slot, driveId]) => {
        const o = obraDe(id);
        const up = o.documentacion.reforma_uploads || {};
        up[slot] = (up[slot] || []).filter(e => e.driveId !== decodeURIComponent(driveId));
        return { ok: true, ...vista(o) };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/enlace-cliente$/, (b, [, id]) => {
        const o = obraDe(id);
        o.portal_token ||= 'demotoken';
        return { url: `${window.location.origin}/subir/${o.id}?token=${o.portal_token}` };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/enlace-cliente\/rotar$/, (b, [, id]) => {
        const o = obraDe(id);
        o.portal_token = `demo${Math.random().toString(36).slice(2, 10)}`;
        evento(o.id, 'PORTAL', 'Enlace del propietario regenerado');
        return { ok: true, url: `${window.location.origin}/subir/${o.id}?token=${o.portal_token}`, __espera: 500 };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/generar$/, (b, [, id]) => {
        const o = obraDe(id);
        if (o.estado !== 'BORRADOR') fallo(409, 'Este certificado ya está pedido.', 'YA_PEDIDO');
        const r = barrido(o, S.cuenta);
        if (!r.listo) fallo(422, 'Falta algo para poder pedir el certificado.', 'BARRIDO', { barrido: r });
        if (S.cuenta.creditos <= 0) fallo(402, 'No te quedan certificados.', 'SIN_CREDITOS');
        S.cuenta.creditos -= 1; S.cuenta.creditos_usados += 1;
        apuntarMov('GASTO', -1, 'Certificado pedido', o.id);
        Object.assign(o, { estado: 'EN_PREPARACION', pedido_at: ahora() });
        evento(o.id, 'GENERAR', `Certificado pedido (quedan ${S.cuenta.creditos} créditos)`);
        return { ok: true, obra: paraCertificador(o), creditos: S.cuenta.creditos, ia: { auto: false, ok: null }, __espera: 1400 };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/validar$/, (b, [, id]) => {
        const o = obraDe(id); o.estado = 'VALIDADO'; evento(o.id, 'VALIDADO', 'El certificador da el certificado por bueno');
        return { ok: true, obra: paraCertificador(o) };
    }],
    ['POST', /^\/api\/certapp\/obras\/([^/]+)\/revisar-de-nuevo$/, (b, [, id]) => {
        const o = obraDe(id);
        // Tope de regeneraciones (como el servidor): en la demo, una por obra.
        if ((o.revisiones || 0) >= 1) fallo(409, 'Ya has pedido las regeneraciones que incluye este certificado.', 'SIN_REVISIONES');
        o.revisiones = (o.revisiones || 0) + 1;
        o.estado = 'EN_PREPARACION'; evento(o.id, 'REVISAR', b?.nota ? `Pide revisar de nuevo: ${b.nota}` : 'Pide revisar de nuevo');
        return { ok: true, obra: paraCertificador(o) };
    }],
    ['POST', /^\/api\/certapp\/feedback$/, (b) => {
        if (!String(b.texto || '').trim()) fallo(400, 'Cuéntanos qué pasa.', 'FALTA_TEXTO');
        if (b.obra_id) obraDe(b.obra_id);
        const f = { id: uuid(), created_at: ahora(), estado: 'NUEVA', cuenta: S.cuenta, tipo: String(b.tipo || 'SUGERENCIA').toUpperCase(), texto: String(b.texto).trim(), pantalla: b.pantalla || null, obra_id: b.obra_id || null, respuesta: null, respuesta_at: null };
        S.feedback.unshift(f);
        return { __status: 201, ok: true, id: f.id, incidencia: incidencia(f) };
    }],
    // Solo las del certificador (en la demo, todas lo son); una obra que no existe → 404, como el servidor.
    ['GET', /^\/api\/certapp\/feedback$/, (b, m, cfg) => {
        const obraId = cfg.params?.obra_id;
        if (obraId) obraDe(obraId);
        return { incidencias: S.feedback.filter(f => !obraId || f.obra_id === obraId).map(incidencia) };
    }],
    ['GET', /^\/api\/certapp\/movimientos$/, () => misGastos()],
    ['GET', /^\/api\/certapp\/asistente\/cupo$/, () => ({ disponible: true, usados_hoy: S.asistenteUsos, max_dia: 20, restantes: 20 - S.asistenteUsos })],
    ['POST', /^\/api\/certapp\/asistente$/, (b) => {
        S.asistenteUsos += 1;
        const donde = { menu: 'en el menú', obra: 'en la ficha de la obra', envolvente: 'en la envolvente' }[b.pantalla] || 'en la app';
        return { texto: `(Demo · estás ${donde}) Para un muro de fachada de antes de 1980, CE3X 3.2 pone por defecto U = 2,38 W/m²K (168 kg/m²), sin distinguir zona.`, cupo: { disponible: true, usados_hoy: S.asistenteUsos, max_dia: 20, restantes: 20 - S.asistenteUsos }, __espera: 900 };
    }],

    // Públicas
    ['GET', /^\/api\/public\/certapp\/beta\/token$/, () => ({ token: `demo.${Date.now()}` })],
    ['POST', /^\/api\/public\/certapp\/beta$/, (b) => {
        // Como el servidor: sin token, o con menos de 3 s, 400 FORM_TOKEN.
        const t = Number(String(b?.form_token || '').split('.')[1]);
        if (!t || Date.now() - t < 3000) fallo(400, 'El formulario ha caducado. Vuelve a enviarlo.', 'FORM_TOKEN');
        return { ok: true, __espera: 700 };
    }],
    ['GET', /^\/api\/public\/certapp\/activar\/(.+)$/, (b, [, token]) => (token === 'caducado'
        ? fallo(410, 'El enlace ha caducado. Pide otro.', 'TOKEN_CADUCADO')
        : { ok: true, tipo: 'activar', email: S.cuenta.email, nombre: S.cuenta.nombre, preexistente: token === 'crm' })],
    ['POST', /^\/api\/public\/certapp\/activar$/, () => ({ ok: true, email: S.cuenta.email })],
    ['POST', /^\/api\/public\/certapp\/recuperar$/, () => ({ ok: true })],
    ['POST', /^\/api\/public\/certapp\/enlace$/, () => ({ ok: true })],
    ['POST', /^\/api\/public\/certapp\/enlace\/canjear$/, (b) => (b.token === 'caducado'
        ? fallo(410, 'El enlace ha caducado. Pide otro.', 'TOKEN_CADUCADO')
        : { ok: true, email: S.cuenta.email, token_hash: 'demo' })],
    ['GET', /^\/api\/public\/certapp\/subir\/([^/]+)$/, (b, [, id], cfg) => {
        const o = S.obras.find(x => x.id === id);
        if (cfg.params?.token === 'caducado') fallo(410, 'Este enlace ha caducado.', 'ENLACE_CADUCADO');
        if (!o || (cfg.params?.token || '') !== (o.portal_token || 'demotoken')) fallo(404, 'Este enlace no es válido.', 'ENLACE_INVALIDO');
        return vistaCliente(o);
    }],
    ['POST', /^\/api\/public\/certapp\/subir\/([^/]+)\/([^/]+)$/, (b, [, id, slot]) => {
        const o = obraDe(id);
        const files = b instanceof FormData ? b.getAll('files') : [];
        const up = (o.documentacion.reforma_uploads ||= {});
        up[slot] = [...(up[slot] || []), ...files.map(f => ({ driveId: uuid(), nombre: f.name, mime: f.type || 'image/jpeg', subido_at: ahora(), por: 'cliente' }))];
        return { ok: true, subidos: files.length, rechazados: [], errores: [], ...vistaCliente(o), __espera: 900 };
    }],

    // Admin
    ['GET', /^\/api\/certapp-admin\/resumen$/, () => ({
        beta: { NUEVA: S.beta.filter(x => x.estado === 'NUEVA').length, CONTACTADA: 0, INVITADA: S.beta.filter(x => x.estado === 'INVITADA').length, DESCARTADA: 0 },
        cuentas: { PENDIENTE: 0, ACTIVA: 1, BLOQUEADA: 0 },
        obras: Object.fromEntries(['BORRADOR', 'EN_PREPARACION', 'LISTO', 'VALIDADO', 'ARCHIVADA'].map(e => [e, S.obras.filter(o => o.estado === e).length])),
        feedback_nuevo: S.feedback.filter(f => f.estado === 'NUEVA').length,
        creditos: { disponibles: S.cuenta.creditos, usados: S.cuenta.creditos_usados },
        asistente: { gastado_mes_usd: 0.42, tope_mes_usd: 20, encendido: true },
        drive: { raiz_configurada: true, raiz_link: 'https://drive.google.com/drive/folders/demo' }, config: { avisos: false, ia_auto: false, entrega_auto: false, url: 'http://cee.localhost:5181' },
    })],
    ['GET', /^\/api\/certapp-admin\/beta$/, (b, m, cfg) => ({ solicitudes: S.beta.filter(x => !cfg.params?.estado || x.estado === cfg.params.estado) })],
    ['GET', /^\/api\/certapp-admin\/beta\/([^/]+)$/, (b, [, id]) => ({ solicitud: S.beta.find(x => x.id === id) || fallo(404, 'No encuentro esa solicitud.', 'NO_ENCONTRADO') })],
    ['PATCH', /^\/api\/certapp-admin\/beta\/([^/]+)$/, (b, [, id]) => { const s = S.beta.find(x => x.id === id); Object.assign(s, b); return { solicitud: s }; }],
    ['POST', /^\/api\/certapp-admin\/beta\/([^/]+)\/invitar$/, (b, [, id]) => {
        const s = S.beta.find(x => x.id === id); s.estado = 'INVITADA';
        return { ok: true, cuenta: { id: uuid(), email: s.email, nombre: s.nombre, creditos: b.creditos }, enlace: `${window.location.origin}/activar?token=demo`, preexistente: false, reinvitada: false, email: { seco: true, canales: [] }, drive: null };
    }],
    ['GET', /^\/api\/certapp-admin\/cuentas$/, () => ({ cuentas: [S.cuenta] })],
    ['POST', /^\/api\/certapp-admin\/cuentas$/, (b) => ({ __status: 201, ok: true, cuenta: { id: uuid(), ...b }, enlace: `${window.location.origin}/activar?token=demo`, preexistente: false, reinvitada: false, email: { seco: true, canales: [] } })],
    ['PATCH', /^\/api\/certapp-admin\/cuentas\/([^/]+)$/, (b) => {
        const antes = S.cuenta.creditos;
        Object.assign(S.cuenta, b);
        const dif = S.cuenta.creditos - antes;
        if (dif) apuntarMov('AJUSTE', dif, b.concepto || (dif > 0 ? `BROKERGY te ha dado ${dif} ${dif === 1 ? 'certificado' : 'certificados'}` : `Ajuste de BROKERGY: ${-dif} ${dif === -1 ? 'certificado' : 'certificados'} menos`));
        return { cuenta: S.cuenta, movimiento: dif ? { creditos: dif } : null };
    }],
    ['GET', /^\/api\/certapp-admin\/obras$/, (b, m, cfg) => ({ obras: S.obras.filter(o => !cfg.params?.estado || o.estado === cfg.params.estado).map(o => ({ ...listaObra(o), cuenta: S.cuenta })) })],
    ['GET', /^\/api\/certapp-admin\/obras\/([^/]+)$/, (b, [, id]) => {
        const o = obraDe(id);
        return { obra: o, cuenta: S.cuenta, barrido: barrido(o, S.cuenta), eventos: S.eventos[id] || [], enlaces: { ...(enlaces(o) || {}), ficheros: {} }, docs: vista(o), enlace_cliente: o.portal_token ? `${window.location.origin}/subir/${o.id}?token=${o.portal_token}` : null };
    }],
    ['POST', /^\/api\/certapp-admin\/obras\/([^/]+)\/pedir-ia$/, () => ({ ok: true, trabajo: { id: 'demo' } })],
    ['POST', /^\/api\/certapp-admin\/obras\/([^/]+)\/entregar$/, (b, [, id]) => {
        const o = obraDe(id); o.estado = 'LISTO'; o.entregado_at = ahora(); evento(o.id, 'ENTREGA', 'Certificado entregado (demo)', 'ADMIN');
        return { ok: true, obra: o, enlaces: enlaces(o), compartida: { ok: true }, aviso: { seco: true } };
    }],
    ['POST', /^\/api\/certapp-admin\/obras\/([^/]+)\/devolver-credito$/, (b, [, id]) => {
        const o = obraDe(id); S.cuenta.creditos += 1; S.cuenta.creditos_usados = Math.max(S.cuenta.creditos_usados - 1, 0);
        if (o.estado === 'EN_PREPARACION') o.estado = 'BORRADOR';
        apuntarMov('DEVOLUCION', 1, 'Te hemos devuelto el crédito de esta obra', o.id);
        evento(o.id, 'CREDITO_DEVUELTO', b?.motivo || 'Crédito devuelto', 'ADMIN');
        return { ok: true, creditos: S.cuenta.creditos, obra: o };
    }],
    ['GET', /^\/api\/certapp-admin\/feedback$/, (b, m, cfg) => ({ feedback: S.feedback.filter(f => !cfg.params?.estado || f.estado === cfg.params.estado).map(incidenciaAdmin) })],
    ['PUT', /^\/api\/certapp-admin\/feedback\/([^/]+)$/, guardarIncidencia],
    ['PATCH', /^\/api\/certapp-admin\/feedback\/([^/]+)$/, guardarIncidencia],

    // Catastro (públicas, usadas por «Nueva obra»): simuladas para no consultar al Catastro.
    ['GET', /^\/api\/catastro\/autocomplete$/, (b, m, cfg) => ([
        { place_id: 'demo-p1', description: `${cfg.params?.input || 'Calle'} 12, Tomelloso, Ciudad Real` },
        { place_id: 'demo-p2', description: `${cfg.params?.input || 'Calle'} 14, Tomelloso, Ciudad Real` },
    ])],
    ['GET', /^\/api\/catastro\/place-details$/, () => ({ lat: 39.1577, lng: -3.0207 })],
    ['POST', /^\/api\/catastro\/reverse-geocode$/, () => ({
        rc: '1234567VJ1213S', address: 'AV ANTONIO HUERTAS 41 TOMELLOSO', isParcela: true,
        dwellings: [
            { rc: '1234567VJ1213S0001AB', address: 'AV ANTONIO HUERTAS 41 Pl:01 Pt:A', floor: '01', door: 'A', use: 'Residencial', surface: 82, isResidential: true },
            { rc: '1234567VJ1213S0002BC', address: 'AV ANTONIO HUERTAS 41 Pl:01 Pt:B', floor: '01', door: 'B', use: 'Residencial', surface: 86, isResidential: true },
        ],
        __espera: 800,
    })],
    ['GET', /^\/api\/catastro\/property-data$/, (b, m, cfg) => ({ rc: cfg.params?.rc, address: 'AV ANTONIO HUERTAS 41', isParcela: false })],
];

function vistaCliente(o) {
    const { slots } = vista(o);
    // Mismos apartados que el servidor (slotsAplicables): aquí, los de una casa normal.
    const ids = ['FOTO_FACHADA_PRINCIPAL', 'FOTO_FACHADAS', 'VIDEO_VIVIENDA', 'FOTO_CALDERA', 'FOTO_PLACA_CALDERA', 'FOTO_VENTANAS', 'DOC_PLANOS'];
    const label = { FOTO_FACHADA_PRINCIPAL: 'Fachada principal', FOTO_FACHADAS: 'Resto de fachadas', VIDEO_VIVIENDA: 'Vídeo de la vivienda', FOTO_CALDERA: 'Caldera', FOTO_PLACA_CALDERA: 'Placa de la caldera', FOTO_VENTANAS: 'Ventanas por dentro', DOC_PLANOS: 'Planos o croquis' };
    return {
        obra: { id: o.id, numero_expediente: o.numero_expediente, direccion: o.direccion, municipio: o.municipio, titular: o.titular?.nombre || null, cerrada: ['LISTO', 'VALIDADO'].includes(o.estado) },
        apartados: ids.map(id => ({
            id, label: label[id], ayuda: id === 'FOTO_PLACA_CALDERA' ? 'La pegatina con marca, modelo y potencia, que se lea.' : null,
            multiple: id !== 'FOTO_CALDERA' && id !== 'FOTO_PLACA_CALDERA', video: id === 'VIDEO_VIVIENDA', documento: id === 'DOC_PLANOS', placa: id === 'FOTO_PLACA_CALDERA',
            ficheros: slots[id] || [],
        })),
    };
}

export function instalarDemo() {
    S = cargarEstado();
    window.__CERTAPP_DEMO__ = true;
    const original = axios.getAdapter(axios.defaults.adapter);
    axios.defaults.adapter = async (config) => {
        const url = new URL(config.url, window.location.origin);
        const metodo = String(config.method || 'get').toUpperCase();
        const ruta = RUTAS.find(([m, re]) => m === metodo && re.test(url.pathname));
        if (!ruta) {
            if (/^\/api\//.test(url.pathname)) {
                // Cualquier otra /api en la demo: como si el servidor no estuviera.
                return Promise.reject(Object.assign(new axios.AxiosError('Demo: ruta no simulada', 'ERR_BAD_RESPONSE', config, null, {
                    status: 503, statusText: 'Demo', headers: {}, config, data: { error: 'En la demo esto no está simulado.', code: 'DEMO' },
                }), {}));
            }
            return original(config);
        }
        const params = { ...Object.fromEntries(url.searchParams), ...(config.params || {}) };
        let body = config.data;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* tal cual */ } }
        const m = url.pathname.match(ruta[1]);
        let status = 200;
        let data;
        try {
            data = ruta[2](body || {}, m, { ...config, params });
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                if (data.__status) { status = data.__status; delete data.__status; }
                if (data.__espera) {
                    const ms = data.__espera; delete data.__espera;
                    if (config.onUploadProgress) {
                        for (let i = 1; i <= 4; i++) { await new Promise(r => setTimeout(r, ms / 5)); config.onUploadProgress({ loaded: i, total: 4 }); }
                    } else await new Promise(r => setTimeout(r, ms));
                } else await new Promise(r => setTimeout(r, 160));
            }
            guardarEstado();
        } catch (e) {
            if (!(e instanceof ErrorDemo)) throw e;
            await new Promise(r => setTimeout(r, 200));
            const response = { status: e.status, statusText: 'Demo', headers: {}, config, data: e.data };
            throw new axios.AxiosError(e.message, 'ERR_BAD_REQUEST', config, null, response);
        }
        return { data: JSON.parse(JSON.stringify(data ?? null)), status, statusText: 'OK', headers: {}, config, request: null };
    };
    console.info('[certapp] DEMO activa: datos simulados, nada sale a ningún servidor. `?demo=0` para salir.');
}

export default instalarDemo;
