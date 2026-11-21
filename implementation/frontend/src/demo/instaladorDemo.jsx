// BANCO DE PRUEBAS de la app del INSTALADOR (fases 1 y 2). Solo en desarrollo: no
// entra en el build. Abre `/instalador-demo.html` con `npm run dev`.
// Pinta AppInstalador SIN SESIÓN y SIN API: todo son datos de mentira de este
// fichero (nombres inventados). Local = datos de PRODUCCIÓN, así que:
//   · cualquier petición a /api por axios o fetch se CORTA en el navegador;
//   · las del gestor de fotos (`/api/instalador-app/docs/…`) las contesta aquí un
//     adaptador de mentira que nunca sale del navegador;
//   · una <img> que apunte a /api se cambia por un dibujo (las miniaturas).
// Lo que se «envía» (presupuesto, factura, firma, RITE, fotos) cambia el estado de
// mentira de esta página: la tarea sale de «Te toca a ti», como en la app de verdad.
//   ?vacio=1   → un instalador sin obras ni clientes (estados vacíos)
//   ?error=1   → la BD no contesta (el aviso de «ahora mismo no podemos»)
//   ?fallo=1   → los envíos fallan (el popup en su versión de error)
//   ?seccion=obras|clientes → entra directamente en esa sección
//   ?obra=<id>&accion=presupuesto|factura|cifo|rite|docs → abre esa acción
/* eslint-disable react-refresh/only-export-components -- es un punto de entrada, no un módulo */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import '../index.css';
import AppInstalador from '../features/instalador/AppInstalador';
import { API_DOCS_INSTALADOR } from '../features/docs/docsApi';

const p = new URLSearchParams(window.location.search);
const VACIO = p.has('vacio');
const ERROR = p.has('error');
const FALLO = p.has('fallo');

// ── Nada sale del navegador ─────────────────────────────────────────────────
const corta = (que) => { console.warn(`[instalador-demo] BLOQUEADO ${que}`); };
const RE_DOCS = /\/api\/instalador-app\/docs\//;
axios.interceptors.request.use((cfg) => {
    if (RE_DOCS.test(cfg.url || '')) { cfg.adapter = adaptadorDocs; return cfg; }
    corta(`${cfg.method} ${cfg.url}`);
    return Promise.reject(new Error('Banco de pruebas: sin API'));
});
const fetchOriginal = window.fetch.bind(window);
window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/api\//.test(url)) { corta(`fetch ${url}`); return Promise.reject(new Error('Banco de pruebas: sin API')); }
    return fetchOriginal(input, init);
};
// Las miniaturas: una foto subida aquí se enseña con su objectURL; las de mentira, con un dibujo.
const FOTOS_LOCALES = new Map();
// Un blob y no un data: — con un data: la imagen ya está completa antes de que React
// cuelgue su onLoad y el gestor se queda en «cargando…» (le pasa solo al banco).
const DIBUJO = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 160 120"><rect width="160" height="120" fill="#e9e6df"/><rect x="38" y="30" width="84" height="60" rx="6" fill="#fff" stroke="#b5b0a6" stroke-width="3"/><circle cx="80" cy="60" r="16" fill="none" stroke="#b5b0a6" stroke-width="3"/><path d="M58 30v-6h44v6" stroke="#b5b0a6" stroke-width="3" fill="none"/></svg>'], { type: 'image/svg+xml' }));
const cambiaSrc = (v) => {
    const s = String(v || '');
    if (!/\/api\//.test(s)) return v;
    const id = [...FOTOS_LOCALES.keys()].find((k) => s.includes(k));
    return id ? FOTOS_LOCALES.get(id) : DIBUJO;
};
const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, get() { return srcDesc.get.call(this); }, set(v) { srcDesc.set.call(this, cambiaSrc(v)); } });
const setAttr = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (k, v) { return setAttr.call(this, k, this.tagName === 'IMG' && k === 'src' ? cambiaSrc(v) : v); };

// ── Datos de mentira ────────────────────────────────────────────────────────
const t = (key, que, destino) => ({ key, que, destino });
const acc = (accion, modo) => ({ tipo: 'accion', accion, ...(modo ? { modo } : {}) });
const LINEAS = (obra, bono, irpfBono, irpf, gestion) => {
    const l = [{ k: 'obra', texto: 'Presupuesto de la obra', eur: obra }, { k: 'bono', texto: 'Bono CAE', eur: -bono }];
    if (irpfBono) l.push({ k: 'irpfbono', texto: 'IRPF a pagar por el bono', eur: irpfBono });
    if (irpf) l.push({ k: 'irpf', texto: 'Deducción en la Renta, hasta', eur: -irpf });
    if (gestion) l.push({ k: 'gestion', texto: 'Gestión del expediente', eur: gestion });
    return { obra, lineas: l, total: Math.max(0, l.reduce((s, x) => s + x.eur, 0)) };
};
const P = {
    cifoFirma: { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Falta tu firma', tono: 'tu' },
    cifoOk: { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Firmado', tono: 'ok' },
    cifoCorr: { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Lo estamos corrigiendo', tono: 'nos' },
    cifoNos: { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Lo preparamos nosotros', tono: 'nos' },
    riteOk: { key: 'rite', nombre: 'Legalización RITE', estado: 'Recibida', tono: 'ok' },
    riteFalta: { key: 'rite', nombre: 'Legalización RITE', estado: 'Falta que la subas', tono: 'tu' },
    riteNo: { key: 'rite', nombre: 'Legalización RITE', estado: 'Aún no toca', tono: 'nos' },
    facFalta: { key: 'factura', nombre: 'Factura de la obra', estado: 'Todavía no está hecha', tono: 'tu' },
    facRev: { key: 'factura', nombre: 'Factura de la obra', estado: 'Subida · la estamos revisando', tono: 'nos' },
    facOk: { key: 'factura', nombre: 'Factura de la obra', estado: 'Revisada', tono: 'ok' },
    facNo: { key: 'factura', nombre: 'Factura de la obra', estado: 'Aún no toca', tono: 'nos' },
    ceeIniOk: { key: 'cee_ini', nombre: 'Certificado energético inicial', estado: 'Registrado', tono: 'ok' },
    ceeIniNos: { key: 'cee_ini', nombre: 'Certificado energético inicial', estado: 'Lo hacemos nosotros', tono: 'nos' },
    ceeFinOk: { key: 'cee_fin', nombre: 'Certificado energético final', estado: 'Registrado', tono: 'ok' },
    ceeFinNos: { key: 'cee_fin', nombre: 'Certificado energético final', estado: 'Lo hacemos nosotros', tono: 'nos' },
};
const listos = (papeles) => papeles.filter((x) => x.tono === 'ok').length;
const conPapeles = (o) => ({ ...o, papeles_listos: listos(o.papeles || []) });

const OBRAS = [
    conPapeles({
        id: '26RES060_OP901', uuid: 'u-901', numero_expediente: '26RES060_901', con_expediente: true,
        cliente: 'Lucía Prado Torres', cliente_id: 'c-1', direccion: 'C/ Las Eras, 14', municipio: 'Villanueva del Campo', provincia: 'Ciudad Real',
        bono: 2300, paso: 4, fase: 'Trámite', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('cifo', 'Firma el certificado de la instalación', acc('cifo')), t('factura', 'Haz la factura de la obra', acc('factura', 'plantilla'))],
        telefono: '600000001', direccion_completa: 'C/ Las Eras, 14 · 13000 Villanueva del Campo · (Ciudad Real)',
        cuentas: LINEAS(9800, 2300, 437, 1597, 400),
        presupuesto: { importe: 9800, estimado: false }, factura: { n: 0, validadas: 0, hecha_en_app: false }, facturas: [],
        es_instaladora: true, factura_modo: 'plantilla',
        equipo: { titulo: 'Aerotermia 8 kW', marca: 'MARCA', modelo: 'MONOBLOC 8', serie: 'SN-0000-1234', acs: null, con_acs: true },
        caldera_retirada: { combustible: 'GASÓLEO', marca: 'OTRA', modelo: '', tipo: 'Caldera' },
        papeles: [P.cifoFirma, P.riteOk, P.facFalta, P.ceeIniOk, P.ceeFinNos], cobrado: false,
    }),
    {
        id: '26RES060_OP902', uuid: 'u-902', numero_expediente: null, con_expediente: false,
        cliente: 'Andrés Molina Ruiz', cliente_id: 'c-2', direccion: 'Avda. de la Constitución, 3', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 1850, paso: 1, fase: 'Simulada', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('propuesta', 'Envía la propuesta al cliente', { tipo: 'oportunidad', id: '26RES060_OP902' })],
        telefono: '600000002', cuentas: LINEAS(8200, 1850), presupuesto: { importe: 8200, estimado: true },
    },
    conPapeles({
        id: '26RES080_OP903', uuid: 'u-903', numero_expediente: '26RES080_903', con_expediente: true,
        cliente: 'Carmen Vidal Ortega', cliente_id: 'c-3', direccion: 'C/ Mayor, 52', municipio: 'Santa Olalla de Abajo', provincia: 'Toledo',
        bono: 4120, paso: 3, fase: 'Aceptada', quien: 'nos', tipo: 'Reforma con aerotermia', tareas: [],
        telefono: '600000003', cuentas: LINEAS(21500, 4120, 0, 2000), presupuesto: { importe: 21500, estimado: false },
        factura: { n: 0, validadas: 0 }, facturas: [], es_instaladora: true, factura_modo: 'subir',
        equipo: null, caldera_retirada: { combustible: 'GAS NATURAL', marca: '', tipo: 'Caldera' },
        papeles: [P.cifoNos, P.riteNo, P.facNo, P.ceeIniNos, P.ceeFinNos], cobrado: false,
    }),
    {
        id: '26RES060_OP904', uuid: 'u-904', numero_expediente: null, con_expediente: false,
        cliente: 'José Antonio Serrano Gil', cliente_id: 'c-4', direccion: 'Pza. de España, 1', municipio: 'Fuentenueva', provincia: 'Albacete',
        bono: 2050, paso: 2, fase: 'Propuesta', quien: 'cli', tipo: 'Aerotermia · hibridación', tareas: [],
    },
    conPapeles({
        id: '25RES060_OP905', uuid: 'u-905', numero_expediente: '25RES060_905', con_expediente: true,
        cliente: 'Lucía Prado Torres', cliente_id: 'c-1', direccion: 'C/ Real, 8 (casa del pueblo)', municipio: 'Villanueva del Campo', provincia: 'Ciudad Real',
        bono: 1980, paso: 5, fase: 'Cobro', quien: 'fin', tipo: 'Aerotermia · cambio de caldera', tareas: [],
        cuentas: LINEAS(7600, 1980, 376, 1200), presupuesto: { importe: 7600 }, es_instaladora: true, factura_modo: 'plantilla',
        factura: { n: 1, validadas: 1, hecha_en_app: true },
        facturas: [{ ref: 'aaaaaaaaa905', numero: '31/25', fecha: '2025-10-02', total: 7600, revisada: true, hecha_en_app: true }],
        papeles: [P.cifoOk, P.riteOk, P.facOk, P.ceeIniOk, P.ceeFinOk], cobrado: true,
    }),
    conPapeles({
        id: '26RES060_OP906', uuid: 'u-906', numero_expediente: '26RES060_906', con_expediente: true,
        cliente: 'Hermanos Calvo, S.L.', cliente_id: 'c-5', direccion: 'Polígono Los Llanos, nave 7', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 3400, paso: 4, fase: 'Trámite', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('rite', 'Sube la legalización RITE', acc('rite'))],
        cuentas: LINEAS(14200, 3400, 0, 0, 400), presupuesto: { importe: 14000, estimado: true }, es_instaladora: true, factura_modo: 'subir',
        factura: { n: 1, validadas: 0 },
        facturas: [{ ref: 'bbbbbbbbb906', numero: 'F-2026-118', fecha: '2026-11-14', total: 14200, revisada: false, hecha_en_app: false }],
        papeles: [P.cifoOk, P.riteFalta, P.facRev, P.ceeIniOk, P.ceeFinNos], cobrado: false,
    }),
    conPapeles({
        id: '26RES060_OP907', uuid: 'u-907', numero_expediente: '26RES060_907', con_expediente: true,
        cliente: 'Rosario Núñez Campos', cliente_id: 'c-6', direccion: 'C/ Cervantes, 21', municipio: 'Fuentenueva', provincia: 'Albacete',
        bono: 2650, paso: 4, fase: 'Trámite', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('cifo', 'Firma de nuevo el certificado de la instalación', acc('cifo'))],
        cuentas: LINEAS(10400, 2650, 504, 1700, 400), presupuesto: { importe: null, estimado: false }, es_instaladora: true, factura_modo: 'plantilla',
        factura: { n: 1, validadas: 1, hecha_en_app: true },
        facturas: [{ ref: 'ccccccccc907', numero: '52/26', fecha: '2026-11-10', total: 10400, revisada: true, hecha_en_app: true }],
        papeles: [P.cifoFirma, P.riteOk, P.facOk, P.ceeIniOk, P.ceeFinNos], cobrado: false,
    }),
    conPapeles({
        id: '26RES060_OP908', uuid: 'u-908', numero_expediente: '26RES060_908', con_expediente: true,
        cliente: 'Tomás Herrera Lago', cliente_id: 'c-7', direccion: 'Ctra. del Molino, 4', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 2210, paso: 4, fase: 'Trámite', quien: 'nos', tipo: 'Aerotermia · cambio de caldera', tareas: [],
        cuentas: LINEAS(9100, 2210, 420, 1500), presupuesto: { importe: 9100, estimado: false }, es_instaladora: true, factura_modo: 'plantilla',
        factura: { n: 1, validadas: 0, hecha_en_app: true },
        facturas: [{ ref: 'ddddddddd908', numero: '49/26', fecha: '2026-11-05', total: 9100, revisada: false, hecha_en_app: true }],
        papeles: [P.cifoCorr, P.riteNo, P.facRev, P.ceeIniOk, P.ceeFinNos], cobrado: false,
    }),
];

const CLIENTES = [
    { id_cliente: 'c-1', nombre_razon_social: 'LUCÍA', apellidos: 'PRADO TORRES', tlf: '600000001', email: 'LUCIA@EJEMPLO.ES', dni: '00000000T', municipio: 'VILLANUEVA DEL CAMPO', direccion: 'C/ Las Eras, 14', codigo_postal: '13000' },
    { id_cliente: 'c-2', nombre_razon_social: 'ANDRÉS', apellidos: 'MOLINA RUIZ', tlf: '600000002', email: '', dni: '', municipio: 'POZO ALTO' },
    { id_cliente: 'c-3', nombre_razon_social: 'CARMEN', apellidos: 'VIDAL ORTEGA', tlf: '600000003', email: 'carmen@ejemplo.es', dni: '00000001R', municipio: 'SANTA OLALLA DE ABAJO', direccion: 'C/ Mayor, 52', codigo_postal: '45000' },
    { id_cliente: 'c-4', nombre_razon_social: 'JOSÉ ANTONIO', apellidos: 'SERRANO GIL', tlf: '600000004', municipio: 'FUENTENUEVA' },
    { id_cliente: 'c-5', nombre_razon_social: 'HERMANOS CALVO, S.L.', apellidos: '', es_empresa: true, tlf: '600000005', municipio: 'POZO ALTO', dni: 'B00000000' },
    { id_cliente: 'c-6', nombre_razon_social: 'ROSARIO', apellidos: 'NÚÑEZ CAMPOS', tlf: '600000006', municipio: 'FUENTENUEVA' },
    { id_cliente: 'c-7', nombre_razon_social: 'TOMÁS', apellidos: 'HERRERA LAGO', tlf: '600000007', municipio: 'POZO ALTO' },
];

// Lo que devuelve /instalador/:id (las tareas del CIFO, el RITE y el FM) de cada obra.
const TRAMITES = {
    '26RES060_OP901': [{ key: 'cifo', hecho: false }, { key: 'rite', hecho: true, pide_memoria: false }],
    '25RES060_OP905': [{ key: 'cifo', hecho: true }, { key: 'rite', hecho: true }],
    '26RES060_OP906': [{ key: 'cifo', hecho: true }, { key: 'rite', hecho: false, pide_memoria: true, memoria_subida: false, certificado_subido: false }],
    '26RES060_OP907': [{ key: 'cifo', hecho: false, refirma: true }, { key: 'rite', hecho: true }],
    '26RES060_OP908': [{ key: 'cifo', hecho: false, bloqueado: true, rechazo: { motivo: 'la fecha de fin de obra no coincide con la de la factura' } }, { key: 'rite', hecho: false, pide_memoria: false }],
    '26RES080_OP903': [],
};
// El presupuesto de cada obra: subido (con su PDF), estimado o falta.
const PRESUS = {
    '26RES060_OP901': { estado: 'subido', importe: 9800, ficheros: [{ id: 'presu-901-aaaaaaaa', nombre: 'PRESUPUESTO DE LA INSTALACIÓN.pdf', fecha: '2026-10-02' }] },
    '26RES060_OP906': { estado: 'estimado', importe: 14000, ficheros: [] },
    '26RES060_OP907': { estado: 'falta', importe: null, ficheros: [] },
};

// ── El estado de mentira, y cómo cambia al «enviar» ─────────────────────────
const LISTA = VACIO ? [] : OBRAS;
const obraDe = (id) => LISTA.find((o) => o.id === id);
const quitarTarea = (id, key, papel) => {
    const o = obraDe(id);
    if (!o) return;
    o.tareas = o.tareas.filter((x) => x.key !== key);
    if (papel) o.papeles = o.papeles.map((x) => (x.key === papel.key ? papel : x));
    o.papeles_listos = listos(o.papeles || []);
    if (!o.tareas.length && o.quien === 'tu') o.quien = 'nos';
};
const resumen = (obras) => ({
    total: obras.length, en_marcha: obras.filter((o) => o.paso < 5).length,
    te_toca: obras.filter((o) => o.quien === 'tu').length, cobradas: obras.filter((o) => o.quien === 'fin').length,
    tareas: obras.reduce((s, o) => s + o.tareas.length, 0),
});
const espera = (v, ms = 350) => new Promise((ok, ko) => setTimeout(() => (ERROR ? ko(new Error('503')) : ok(v)), ms));
const envia = (efecto, ms = 900) => new Promise((ok, ko) => setTimeout(() => {
    if (FALLO) { const e = new Error('500'); e.response = { data: { error: 'En el banco de pruebas, con ?fallo=1, todos los envíos fallan.' } }; ko(e); return; }
    efecto?.(); ok({ data: { ok: true } });
}, ms));
const copia = (x) => JSON.parse(JSON.stringify(x));

function pdfDeMentira(titulo, filas) {
    const d = new jsPDF({ unit: 'mm', format: 'a4' });
    d.setFillColor(255, 160, 0); d.rect(0, 0, 210, 4, 'F');
    d.setFontSize(20); d.text(titulo, 20, 30);
    d.setFontSize(11); d.setTextColor(90);
    d.text('Banco de pruebas · documento de mentira', 20, 38);
    d.setTextColor(20);
    filas.forEach(([k, v], i) => { d.text(k, 20, 56 + i * 9); d.text(v, 190, 56 + i * 9, { align: 'right' }); });
    return d.output('arraybuffer');
}

const api = {
    obras: () => espera({ obras: copia(LISTA), resumen: resumen(LISTA) }),
    obra: (id) => espera(obraDe(id) ? copia(obraDe(id)) : Promise.reject(new Error('404')), 250),
    clientes: () => espera(VACIO ? [] : CLIENTES),
    presupuesto: (id) => espera(copia(PRESUS[id] || { estado: 'falta', importe: null, ficheros: [] })),
    presupuestoPdf: () => espera(pdfDeMentira('Presupuesto de la instalación', [
        ['Bomba de calor aire-agua 8 kW', '7.450,00 €'], ['Desmontaje de la caldera', '350,00 €'], ['Material y puesta en marcha', '300,00 €'], ['Total con IVA', '9.800,00 €'],
    ])),
    subirPresupuesto: (id, cuerpo) => envia(() => {
        PRESUS[id] = { estado: 'subido', importe: PRESUS[id]?.importe || null, ficheros: [{ id: `presu-${Date.now()}`, nombre: 'PRESUPUESTO DE LA INSTALACIÓN.pdf', fecha: new Date().toISOString() }] };
        void cuerpo;
    }),
    // La plantilla de la factura, en su `demo` (FacturaObraView no llama a la API);
    // al «guardarla», la obra la apunta como si la hubiera recibido el servidor.
    facturaProps: (id) => ({
        expedienteId: 'demo',
        onHecha: (r) => {
            const o = obraDe(id);
            o.facturas = [...(o.facturas || []), { ref: `f${Date.now()}`.slice(0, 12), numero: r?.numero || '44/26', fecha: new Date().toISOString(), total: r?.total || null, revisada: false, hecha_en_app: true }];
            o.factura = { n: o.facturas.length, validadas: o.facturas.filter((f) => f.revisada).length, hecha_en_app: true };
            quitarTarea(id, 'factura', P.facRev);
        },
    }),
    subirFactura: (id, file) => envia(() => {
        const o = obraDe(id);
        o.facturas = [...(o.facturas || []), { ref: `e${Date.now()}`.slice(0, 12), numero: file?.name?.replace(/\.[a-z]+$/i, '') || null, fecha: new Date().toISOString(), total: null, revisada: false, hecha_en_app: false }];
        o.factura = { n: o.facturas.length, validadas: o.facturas.filter((f) => f.revisada).length };
        quitarTarea(id, 'factura', P.facRev);
    }),
    facturaFichero: (id, ref) => espera(pdfDeMentira('Factura', [['Referencia', ref], ['Obra', id], ['Total', '—']])),
    instalador: (id) => {
        const o = obraDe(id);
        return espera({ numero_expediente: o?.numero_expediente, cliente: o?.cliente, direccion: o?.direccion_completa || o?.direccion, instalador: 'Instalaciones de Prueba, S.L.', tareas: copia(TRAMITES[id] || []) });
    },
    rutas: (id, tarea) => ({
        // En el banco no hay Autofirma: «firmar ahora» falla con su aviso; subir el PDF firmado, sí.
        pdf: () => Promise.reject(Object.assign(new Error('demo'), { response: { data: { error: 'En el banco de pruebas no se abre Autofirma. Prueba con «subir el PDF ya firmado».' } } })),
        subir: () => envia(() => {
            const tr = (TRAMITES[id] || []).find((x) => x.key === tarea);
            if (tr) { tr.hecho = true; tr.refirma = false; }
            quitarTarea(id, tarea, tarea === 'cifo' ? P.cifoOk : tarea === 'rite' ? P.riteOk : null);
        }),
    }),
    docs: API_DOCS_INSTALADOR,
};
// ── El gestor de fotos, contestado aquí ─────────────────────────────────────
const SLOTS = () => ([
    { key: 'FOTO_UNIDAD_EXTERIOR', fase: 'DESPUES', required: true, multiple: true, accept: 'image/*', label: 'Unidad exterior nueva (instalada)', help: 'La máquina nueva que va fuera, ya colocada.' },
    { key: 'FOTO_UNIDAD_EXTERIOR_PLACA', fase: 'DESPUES', required: true, multiple: true, accept: 'image/*', label: 'Placa de la unidad exterior', help: 'La etiqueta de datos de la máquina de fuera, que se lea.' },
    { key: 'FOTO_UNIDAD_INTERIOR', fase: 'DESPUES', required: false, multiple: true, accept: 'image/*', label: 'Unidad interior / ACS', help: 'La unidad de dentro (hidrokit o depósito) ya instalada.' },
    { key: 'FOTO_UNIDAD_INTERIOR_PLACA', fase: 'DESPUES', required: false, multiple: true, accept: 'image/*', label: 'Placa de la unidad interior', help: 'La etiqueta de la unidad de dentro.' },
]);
const DOCS = {};
const vistaDocs = (id) => {
    if (!DOCS[id]) {
        DOCS[id] = SLOTS().map((s) => ({ ...s, baseRequired: s.required, waived: false, items: [] }));
        DOCS[id][0].items = [{ name: 'FOTO_UNIDAD_EXTERIOR.jpg', driveId: 'demo-foto-ext-1', mimeType: 'image/jpeg', estado: 'validada', at: '2026-11-12T10:00:00Z' }];
        if (id === '26RES060_OP906') DOCS[id][1].items = [{ name: 'FOTO_UNIDAD_EXTERIOR_PLACA.jpg', driveId: 'demo-foto-placa-1', mimeType: 'image/jpeg', estado: 'rechazada', motivo: 'No se lee el número de serie: hazla más de cerca y sin reflejos.' }];
    }
    const o = obraDe(id);
    const slots = DOCS[id].map((s) => ({ ...s, estado: !s.items.length ? 'pendiente' : s.items.some((i) => i.estado === 'rechazada') ? 'rechazada' : s.items.every((i) => i.estado === 'validada') ? 'validada' : 'subida' }));
    return { id_oportunidad: id, numero_expediente: o?.numero_expediente || null, cliente: o?.cliente || '', aceptada: true, fin_obra: null, alcance: { ficha: 'RES060', acs: false, emisor: 'RADIADORES' }, slots, addableConcepts: [], llave: 'llave-de-mentira' };
};
async function adaptadorDocs(cfg) {
    await new Promise((r) => setTimeout(r, 300));
    const resp = (data, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config: cfg, request: {} });
    if (FALLO && cfg.method !== 'get') return Promise.reject(Object.assign(new Error('500'), { response: resp({ error: 'En el banco, con ?fallo=1, todos los envíos fallan.' }, 500) }));
    const m = /\/api\/instalador-app\/docs\/([^/?]+)(?:\/([^/?]+))?(?:\/([^/?]+))?/.exec(cfg.url);
    const [, id, slot, extra] = m || [];
    if (cfg.method === 'get') return resp(vistaDocs(id));
    if (cfg.method === 'post' && slot && slot !== 'fin-obra') {
        const s = DOCS[id]?.find((x) => x.key === slot);
        const ficheros = cfg.data instanceof FormData ? [...cfg.data.getAll(extra === 'batch' ? 'files' : 'file'), ...cfg.data.getAll('files')] : [];
        const nuevos = [...new Set(ficheros)].filter((f) => f instanceof Blob).map((f, i) => {
            const driveId = `demo-local-${Date.now()}-${i}`;
            try { FOTOS_LOCALES.set(driveId, URL.createObjectURL(f)); } catch { /* */ }
            return { name: `${slot}_${(s?.items.length || 0) + i + 1}.jpg`, driveId, mimeType: f.type || 'image/jpeg', estado: 'subida', at: new Date().toISOString() };
        });
        if (s) s.items.push(...nuevos);
        return resp({ ok: true, items: nuevos, fallidas: [] });
    }
    if (cfg.method === 'delete' && slot) {
        const s = DOCS[id]?.find((x) => x.key === slot);
        if (s) s.items = s.items.filter((it) => it.driveId !== cfg.params?.driveId);
        return resp({ ok: true });
    }
    return resp({ ok: true });
}

function Demo() {
    const [externo, setExterno] = React.useState(null);
    const aviso = (txt) => () => window.alert(`Banco de pruebas: ${txt}. En la app de verdad se abre lo de siempre.`);
    return (
        <AppInstalador
            api={api}
            saludo="RCA"
            empresa="Instalaciones de Prueba, S.L."
            seccionInicial={['obras', 'clientes'].includes(p.get('seccion')) ? p.get('seccion') : 'inicio'}
            abrirAlEmpezar={p.get('obra') ? { obra: p.get('obra'), accion: p.get('accion') } : null}
            onNueva={aviso('«Nueva simulación»')}
            onAbrirOportunidad={(id) => setExterno(
                <div style={{ padding: 32, textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 700 }}>Aquí va la página de la oportunidad {id}</p>
                    <p style={{ opacity: 0.6 }}>(la calculadora de siempre, dentro de la cáscara nueva)</p>
                </div>,
            )}
            externo={externo}
            onCerrarExterno={() => setExterno(null)}
            onPerfil={aviso('«Mi perfil»')}
            onNuevoCliente={aviso('«Nuevo cliente»')}
            onCambiarCliente={aviso('«Cambiar datos»')}
        />
    );
}

// Al editar un módulo sin componentes (el CSS de estilo.js), Vite vuelve a ejecutar
// esta entrada: se reutiliza la raíz para no llamar dos veces a createRoot.
const contenedor = document.getElementById('root');
contenedor.__raiz = contenedor.__raiz || ReactDOM.createRoot(contenedor);
contenedor.__raiz.render(<Demo />);
