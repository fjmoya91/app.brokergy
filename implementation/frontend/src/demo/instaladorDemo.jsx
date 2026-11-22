// BANCO DE PRUEBAS de la app del INSTALADOR (fases 1 a 4). Solo en desarrollo: no
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
// Fase 3 («Tu página web»):
//   ?seccion=pagina → la página; con ?pagina=vacia|revision|publicada|novale|textos,
//                     cada estado (sin él, una mezcla); ?elegir=1 → «Elegir fotos»
//   ?cola=1         → la cola de revisión del equipo interno (la de la ficha del
//                     instalador en Partners); con ?lector=1, sin poder resolver
// Fase 4 (Catálogo con tarifas):
//   ?seccion=catalogo → el catálogo; ?catalogo=sinmarcas → un instalador sin marcas
//   ?equipo=<id>      → la ficha de un equipo: 101 con dos distribuidores, 102 sin tarifa,
//                       103 con tu precio y «se lo compro a», 104 sin ficha técnica (SCOP medio)
//   ?proveedores=0    → todavía no sabemos a quién le compra (ninguna tarifa)
//   ?pedido=seco      → «Mandar el pedido» contesta EN SECO (el interruptor apagado)
//   ?tarifa=1         → la carga del Excel del CRM (solo ADMIN), en sus dos pasos,
//                       contestada aquí (el fichero que elijas no sale del navegador);
//                       con ?fallo=1, «Guardar» da el 409 de «el plan ha cambiado»; al
//                       cerrarla, el bloque «Le compra a…» de la ficha del instalador
// Fase 5 (pulido, instalable, marca):
//   La pantalla y la ficha viajan en la dirección (las MISMAS claves que la app de
//   verdad: seccion, obra, accion, cliente, equipo): recargar y «atrás» se prueban aquí.
//   ?marca=1      → su logo y su color (azul); ?marca=claro → un amarillo (se oscurece a AA)
//   ?instalar=iphone|android → la invitación «Ponla en tu pantalla de inicio» en el PC
//   ?sinred=1     → sin conexión (navigator.onLine = false); `__volverRed()` en la
//                   consola la devuelve y la app vuelve a pedir todo sola
// Presupuestos que hace el instalador (22/11/2026):
//   ?seccion=presupuestos → la lista (con ?vacio=1, vacía)
//   ?presupuesto=nuevo    → el formulario (la vista previa es un PDF de mentira)
//   ?presupuesto=aaaaaaaa-0000-4000-8000-000000000040 → la ficha (…041 ligado a su obra, …039 anulado)
//   ?fallo=1  → guardar da el 409 del número repetido con su `sugerido`; la vista previa y
//               «Envíamelo por WhatsApp» (el 409 WHATSAPP_NO_DISPONIBLE) fallan
//   «Calcular el bono CAE» no abre el embudo: enseña lo que le llegaría y simula que se creó.
/* eslint-disable react-refresh/only-export-components -- es un punto de entrada, no un módulo */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import '../index.css';
import AppInstalador, { obraDeRespuesta } from '../features/instalador/AppInstalador';
import { TIPOS_OBRA, EXTRAS, COMBUSTIBLES, calcularPresupuesto, conceptosDe, resumenObra, siguienteNumero } from '../features/instalador/logic/presupuesto';
import { API_DOCS_INSTALADOR } from '../features/docs/docsApi';
import { RevisionEscaparate } from '../features/admin/components/RevisionEscaparate';
import { CargarTarifaModal } from '../features/aerotermia/components/CargarTarifaModal';
import { LeCompraA } from '../features/admin/components/LeCompraA';

const p = new URLSearchParams(window.location.search);
const VACIO = p.has('vacio');
const ERROR = p.has('error');
const FALLO = p.has('fallo');
let sinRedAhora = p.has('sinred');
if (sinRedAhora) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => !sinRedAhora });
    window.__volverRed = () => { sinRedAhora = false; window.dispatchEvent(new Event('online')); };
}
const MARCA = p.get('marca');
// Un logo de mentira (SVG en línea: nada sale del navegador).
const LOGO_DEMO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#1565c0"/><text x="48" y="60" font-family="Arial" font-weight="700" font-size="34" fill="#fff" text-anchor="middle">IP</text></svg>')}`;

// ── Nada sale del navegador ─────────────────────────────────────────────────
const corta = (que) => { console.warn(`[instalador-demo] BLOQUEADO ${que}`); };
const RE_DOCS = /\/api\/instalador-app\/docs\//;
axios.interceptors.request.use((cfg) => {
    if (RE_DOCS.test(cfg.url || '')) { cfg.adapter = adaptadorDocs; return cfg; }
    if (/^\/api\/escaparate-revision\//.test(cfg.url || '')) { cfg.adapter = adaptadorCola; return cfg; }
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
// «Todo lo de esta obra»: la MISMA lista que arma el servidor (`caminoDeObra` en
// backend/utils/appInstalador.js), rehecha aquí con los datos de mentira.
const milesD = (n) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
const filaObra = (key, nombre, estado, tono, accion = null) => ({ key, nombre, estado, tono, accion });
function camino(o, viejos = []) {
    const de = (k) => viejos.find((x) => x.key === k);
    const exp = !!o.con_expediente;
    const f = [];
    f.push(exp || o.paso >= 3 ? filaObra('propuesta', 'La propuesta', 'Aceptada por tu cliente', 'ok', 'propuesta')
        : o.paso === 2 && o.quien === 'tu' ? filaObra('propuesta', 'La propuesta', 'Te la hemos mandado: pásasela a tu cliente', 'tu', 'propuesta')
            : o.paso === 2 ? filaObra('propuesta', 'La propuesta', 'Enviada · falta que tu cliente la acepte', 'nos', 'propuesta')
                : filaObra('propuesta', 'La propuesta', 'La estamos preparando nosotros', 'nos', 'propuesta'));
    const imp = o.presupuesto?.importe;
    f.push(imp && !o.presupuesto.estimado ? filaObra('presupuesto', 'Tu presupuesto', milesD(imp), 'ok', 'presupuesto')
        : imp ? filaObra('presupuesto', 'Tu presupuesto', `${milesD(imp)} · estimado: sube el tuyo`, 'tu', 'presupuesto')
            : filaObra('presupuesto', 'Tu presupuesto', 'Falta: súbelo cuando lo tengas', 'tu', 'presupuesto'));
    f.push(exp ? { ...(de('cee_ini') || P.ceeIniNos), accion: null } : filaObra('cee_ini', 'Certificado energético inicial', 'Cuando tu cliente acepte', 'luego'));
    const fac = de('factura');
    f.push(!exp || !fac || fac.estado === 'Aún no toca' ? filaObra('factura', 'Tu factura', 'Se hace al terminar la obra', 'luego')
        : { ...fac, nombre: 'Tu factura', accion: 'factura' });
    f.push(exp ? { ...(de('cifo') || P.cifoNos), accion: 'cifo' } : filaObra('cifo', 'Certificado de la instalación', 'Al terminar la obra', 'luego'));
    const rite = de('rite') || P.riteNo;
    f.push(exp ? { ...rite, tono: rite.estado === 'Aún no toca' ? 'luego' : rite.tono, accion: 'rite' } : filaObra('rite', 'Legalización RITE', 'Al terminar la obra', 'luego'));
    f.push(filaObra('fotos', 'Fotos de la obra', 'Súbelas aquí y mira qué falta', 'info', 'docs'));
    const fin = de('cee_fin');
    f.push(exp && fin?.tono === 'ok' ? { ...fin, accion: null } : exp && o.paso >= 4 ? { ...P.ceeFinNos, accion: null } : filaObra('cee_fin', 'Certificado energético final', 'Al terminar la obra', 'luego'));
    const pagado = o.cobrado || o.paso === 5;
    f.push(filaObra('bono', 'El bono de tu cliente', pagado ? 'Cobrado' : o.paso >= 4 ? 'Lo estamos tramitando' : 'Cuando esté todo presentado', pagado ? 'ok' : o.paso >= 4 ? 'nos' : 'luego'));
    return f;
}
const cuentan = (papeles) => papeles.filter((x) => x.tono !== 'info');
const listos = (papeles) => cuentan(papeles).filter((x) => x.tono === 'ok').length;
const conPapeles = (o) => {
    const papeles = camino(o, o.papeles || []);
    const propuesta = o.propuesta || {
        estado: o.con_expediente || o.paso >= 3 ? 'aceptada' : o.paso === 2 ? 'enviada' : 'preparando',
        version: o.paso >= 2 || o.con_expediente ? 1 : null, fecha: o.paso >= 2 || o.con_expediente ? '2026-11-03T10:00:00Z' : null,
        aceptada_el: o.con_expediente ? '2026-11-06T18:20:00Z' : null, tiene_pdf: o.paso >= 2 || !!o.con_expediente,
        la_tiene: o.paso === 2 ? (o.quien === 'tu' ? 'instalador' : 'cliente') : null,
    };
    return { ...o, papeles, papeles_listos: listos(papeles), papeles_total: cuentan(papeles).length, propuesta, se_puede_corregir: !o.con_expediente && o.paso <= 2 };
};

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
    conPapeles({
        id: '26RES060_OP902', uuid: 'u-902', numero_expediente: null, con_expediente: false,
        cliente: 'Andrés Molina Ruiz', cliente_id: 'c-2', direccion: 'Avda. de la Constitución, 3', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 1850, paso: 1, fase: 'Simulada', quien: 'nos', tipo: 'Aerotermia · cambio de caldera', tareas: [],
        telefono: '600000002', direccion_completa: 'Avda. de la Constitución, 3 · 13000 Pozo Alto · (Ciudad Real)',
        cuentas: LINEAS(8200, 1850), presupuesto: { importe: 8200, estimado: true }, es_instaladora: false, factura_modo: 'plantilla',
        equipo: { titulo: 'Aerotermia 8 kW', marca: null, modelo: null, serie: null, acs: null, con_acs: true, previsto: true },
        caldera_retirada: { combustible: 'GASÓLEO', marca: null, tipo: 'Caldera', prevista: true },
    }),
    conPapeles({
        id: '26RES080_OP903', uuid: 'u-903', numero_expediente: '26RES080_903', con_expediente: true,
        cliente: 'Carmen Vidal Ortega', cliente_id: 'c-3', direccion: 'C/ Mayor, 52', municipio: 'Santa Olalla de Abajo', provincia: 'Toledo',
        bono: 4120, paso: 3, fase: 'Aceptada', quien: 'nos', tipo: 'Reforma con aerotermia', tareas: [],
        telefono: '600000003', cuentas: LINEAS(21500, 4120, 0, 2000), presupuesto: { importe: 21500, estimado: false },
        factura: { n: 0, validadas: 0 }, facturas: [], es_instaladora: true, factura_modo: 'plantilla',
        equipo: null, caldera_retirada: { combustible: 'GAS NATURAL', marca: '', tipo: 'Caldera' },
        papeles: [P.cifoNos, P.riteNo, P.facNo, P.ceeIniNos, P.ceeFinNos], cobrado: false,
    }),
    conPapeles({
        id: '26RES060_OP904', uuid: 'u-904', numero_expediente: null, con_expediente: false,
        cliente: 'José Antonio Serrano Gil', cliente_id: 'c-4', direccion: 'Pza. de España, 1', municipio: 'Fuentenueva', provincia: 'Albacete',
        bono: 2050, paso: 2, fase: 'Propuesta', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('propuesta', 'Pásale la propuesta a tu cliente', acc('propuesta'))],
        telefono: '600000004', direccion_completa: 'Pza. de España, 1 · 02000 Fuentenueva · (Albacete)',
        cuentas: LINEAS(9400, 2050, 390, 1500, 400), presupuesto: { importe: 9400, estimado: false }, es_instaladora: false, factura_modo: 'plantilla',
        equipo: { titulo: 'Aerotermia 10 kW', marca: 'MARCA A', modelo: 'Aire-agua Serie Dos 10 bibloc', serie: null, acs: null, con_acs: true, previsto: true },
        caldera_retirada: { combustible: 'GASÓLEO', marca: null, tipo: 'Caldera', prevista: true },
    }),
    conPapeles({
        id: '26RES060_OP909', uuid: 'u-909', numero_expediente: null, con_expediente: false,
        cliente: 'Pilar Rubio Sanz', cliente_id: null, direccion: 'C/ del Río, 9', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 1720, paso: 2, fase: 'Propuesta', quien: 'cli', tipo: 'Aerotermia · hibridación', tareas: [],
        telefono: '600000009', cuentas: LINEAS(7900, 1720), presupuesto: { importe: null, estimado: false }, es_instaladora: false, factura_modo: 'plantilla',
    }),
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
    if (papel) o.papeles = o.papeles.map((x) => (x.key === papel.key ? { ...x, estado: papel.estado, tono: papel.tono } : x));
    o.papeles_listos = listos(o.papeles || []);
    if (!o.tareas.length && o.quien === 'tu') o.quien = 'nos';
};
const resumen = (obras) => ({
    total: obras.length, en_marcha: obras.filter((o) => o.paso < 5).length,
    te_toca: obras.filter((o) => o.quien === 'tu').length, cobradas: obras.filter((o) => o.quien === 'fin').length,
    tareas: obras.reduce((s, o) => s + o.tareas.length, 0),
});
const espera = (v, ms = 350) => new Promise((ok, ko) => setTimeout(() => ((ERROR || sinRedAhora) ? ko(new Error('503')) : ok(v)), ms));
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

// ── Fase 4: el catálogo de mentira (marcas, modelos y distribuidores inventados) ──
// Desde el 22/11/2026: marcas con LOGO, la tarifa de CADA distribuidor al que compra,
// a quién se lo compra y el pedido (previa y envío contestados aquí: nada sale).
const DN = 'd0000000-0000-4000-8000-00000000000a', DS = 'd0000000-0000-4000-8000-00000000000b';
const PROVEEDORES = p.get('proveedores') === '0' ? [] : [{ id: DN, nombre: 'DISTRIBUIDOR NORTE' }, { id: DS, nombre: 'DISTRIBUIDOR SUR' }];
const NOMBRE_DIST = { [DN]: 'DISTRIBUIDOR NORTE', [DS]: 'DISTRIBUIDOR SUR' };
const COMERCIAL = { [DN]: { nombre: 'Ana Comercial', canales: ['WhatsApp', 'Email'] }, [DS]: { nombre: 'Luis Ventas', canales: ['WhatsApp'] } };
const logoSvg = (texto, fondo, tinta) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><rect width="200" height="80" rx="14" fill="${fondo}"/><text x="100" y="52" font-family="Arial Black,Arial,sans-serif" font-size="30" font-weight="900" fill="${tinta}" text-anchor="middle">${texto}</text></svg>`)}`;
const LOGOS = { 'MARCA A': logoSvg('marca·a', '#0b3d91', '#ffffff'), 'MARCA B': logoSvg('MARCA B', '#ffffff', '#c8102e') };
const tar = (dist, precio, desde) => ({ distribuidor_id: dist, distribuidor: NOMBRE_DIST[dist], precio, desde });
const eq = (id, marca, nombre, ref, kw, extra = {}) => ({
    id, marca, nombre, ref, referencias: { conjunto: null, exterior: ref, interior: null },
    uso: 'Calefacción y agua caliente', montaje: 'Monobloc: un solo aparato fuera', potencia_kw: kw, potencia_frio_kw: null,
    scop_suelo: 4.62, scop_radiadores: 3.41, clima_scop: 'calido', acs_corto: 'Sin depósito', acs: 'Con depósito aparte', refrigerante: 'R290',
    tarifas: [], compro_a: null, tu_precio: null, papeles: [{ id: 'ficha', nombre: 'Ficha técnica', incluye: ['la ficha de producto EPREL', 'la etiqueta energética'] }], ...extra,
});
const CATALOGO = [
    eq(101, 'MARCA A', 'Aire-agua Serie Uno 8', 'MA-U8-M1', 8, { tarifas: [tar(DS, 5740, '2026-11-10'), tar(DN, 5890, '2026-11-01')] }),
    eq(102, 'MARCA A', 'Aire-agua Serie Uno 12', 'MA-U12-M1', 12),
    eq(103, 'MARCA A', 'Aire-agua Serie Dos 10 bibloc', 'MA-D10-B2', 10, { montaje: 'Bibloc: un aparato fuera y otro dentro', acs_corto: 'Depósito 190 l', acs: 'Con depósito de 190 l dentro', tarifas: [tar(DN, 7240.5, '2026-11-01')], compro_a: DN, tu_precio: 6900 }),
    eq(104, 'MARCA B', 'Compacta 6', 'MB-C6', 6, { uso: 'Calefacción, frío y agua caliente', potencia_frio_kw: 5.8, scop_suelo: 4.1, scop_radiadores: 3.05, clima_scop: 'medio', refrigerante: 'R32', tarifas: [tar(DN, 4380, '2026-10-15'), tar(DS, 4410, '2026-10-01')], papeles: [] }),
    eq(105, 'MARCA B', 'Compacta 16 trifásica', 'MB-C16-T', 16, { tarifas: [tar(DS, 9875, '2026-10-15')] }),
];
// Lo mismo que hace `equipoParaInstalador` en el servidor con las tarifas y la elección.
const conTarifa = (e) => {
    const lista = (PROVEEDORES.length ? e.tarifas : []).slice().sort((a, b) => a.precio - b.precio);
    const elegida = lista.find((t) => t.distribuidor_id === e.compro_a) || null;
    const ref = elegida || lista[0] || null;
    return { ...e, tarifas: lista, compro_a: elegida ? elegida.distribuidor_id : e.compro_a, tarifa: ref ? { ...ref, elegida: !!elegida } : null };
};
const SIN_MARCAS = p.get('catalogo') === 'sinmarcas';
const catalogoDeMentira = () => {
    if (SIN_MARCAS) return { sin_marcas: true, marcas: [], proveedores: [], equipos: [] };
    const equipos = CATALOGO.map(conTarifa);
    const marcas = ['MARCA A', 'MARCA B', 'MARCA C'].map((m) => ({ nombre: m, logo: LOGOS[m] || null, equipos: equipos.filter((e) => e.marca === m).length }));
    return { sin_marcas: false, marcas, proveedores: copia(PROVEEDORES), equipos: copia(equipos) };
};
const equipoDe = (id) => CATALOGO.find((x) => String(x.id) === String(id));
const fechaEs = (iso) => { const [a, m, d] = String(iso || '').split('-'); return a ? `${d}/${m}/${a}` : ''; };
const eurEs = (n) => `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`;
// El texto, con la MISMA forma que `mensajePedido` del servidor (services/pedidoDistribuidor.js).
function pedidoDeMentira(id, body) {
    const e = equipoDe(id);
    if (!e) return Promise.reject(errorDemo(404, 'Ese equipo no está en tu catálogo.'));
    const dist = body.distribuidor_id;
    if (!NOMBRE_DIST[dist] || !PROVEEDORES.length) return Promise.reject(errorDemo(400, 'Ese distribuidor no está entre a los que compras.'));
    const c = COMERCIAL[dist];
    const t = e.tarifas.find((x) => x.distribuidor_id === dist);
    const mensaje = [
        `Hola ${c.nombre.split(' ')[0]}, *RCA* os hace este pedido a través de BROKERGY:`, '',
        `- Equipo: *${e.marca} ${e.nombre}* (ud. exterior ${e.ref})`,
        `- Cantidad: ${body.cantidad}`,
        body.obra ? `- Obra: ${body.obra}` : null,
        t ? `- Precio de vuestra tarifa: ${eurEs(t.precio)} sin IVA (desde el ${fechaEs(t.desde)})` : null,
        body.nota ? `- Nota: ${body.nota}` : null, '',
        'Para confirmar plazo y precio, contestad directamente a RCA en el 600 000 000.', '', 'BROKERGY',
    ].filter((l) => l !== null).join('\n');
    const borrador = { mensaje, distribuidor: NOMBRE_DIST[dist], comercial: c.nombre, canales_posibles: c.canales, copia_a_ti: true };
    if (body.previa) return espera({ previa: true, ...borrador }, 450);
    if (p.get('pedido') === 'seco') return espera({ en_seco: true, ...borrador }, 900);
    return envia(() => { corta(`pedido a ${NOMBRE_DIST[dist]} (en el banco no sale nada)`); }).then(() => ({ ok: true, enviado: true, canales: c.canales, ...borrador }));
}

// ── Los PRESUPUESTOS que hace en la app (22/11/2026), con la forma EXACTA del contrato ──
// Ids de ejemplo: ?presupuesto=aaaaaaaa-0000-4000-8000-000000000040 (emitido, sin obra),
// …041 (ligado a la obra 26RES060_OP902), …039 (anulado). Con ?fallo=1, guardar da el 409 del
// número repetido (con su `sugerido`) y la vista previa / WhatsApp, su error.
const ID_PR = (n) => `aaaaaaaa-0000-4000-8000-0000000000${n}`;
const OPCIONES_PR = { tipos: TIPOS_OBRA, extras: EXTRAS.map(({ texto, ...x }) => { void texto; return x; }), combustibles: COMBUSTIBLES };
const prDe = ({ id, numero, fecha, cliente_id = null, cliente, obra, conceptos, modo = 'total', total, con_iva = false, partidas = [], iva_pct = 21, estado = 'EMITIDO', id_oportunidad = null, simulacion = null, notas = 'El presupuesto no incluye la alimentación eléctrica.' }) => {
    const c = calcularPresupuesto({ conceptos, modo, total, partidas, iva_pct, con_iva });
    const entrada = { numero, fecha, ...(cliente_id ? { cliente_id } : { cliente }), obra, conceptos, modo, total, con_iva, partidas, iva_pct, notas, validez_dias: 30 };
    return {
        presupuesto: {
            id, numero, fecha, estado, origen: 'app', cliente_id,
            cliente: { nombre: [cliente.nombre, cliente.apellidos].filter(Boolean).join(' '), nif: cliente.dni || '', direccion: cliente.direccion || obra.direccion, codigo_postal: cliente.codigo_postal || obra.codigo_postal, municipio: cliente.municipio || obra.municipio, provincia: '', tlf: cliente.tlf || '' },
            obra: { ...obra, ref_catastral: null }, lineas: c.lineas, modo, notas, validez_dias: 30,
            base: c.base, iva_pct, iva: c.iva, total: c.total,
            oportunidad_id: id_oportunidad ? `uuid-${id_oportunidad}` : null, id_oportunidad, simulacion,
            created_at: `${fecha}T09:00:00Z`, updated_at: `${fecha}T09:00:00Z`,
        },
        entrada,
    };
};
const obraPr = (extra) => ({ tipo: 'aerotermia', direccion: 'C/ Las Eras, 14', codigo_postal: '13000', municipio: 'Villanueva del Campo', provincia: 'Ciudad Real', equipo: { aerotermia_id: 101, marca: 'MARCA A', modelo: 'MA-U8-M1', potencia_kw: 8 }, caldera: { combustible: 'gasoleo' }, acs: true, emisor: 'radiadores', extras: [{ clave: 'deposito_acs', litros: 200 }], descripcion: '', oportunidad: null, ...extra });
const PRS = VACIO ? [] : [
    (() => { const o = obraPr(); return prDe({ id: ID_PR(40), numero: '40/26', fecha: '2026-11-20', cliente_id: 'c-1', cliente: { nombre: 'Lucía', apellidos: 'Prado Torres', tlf: '600000001', dni: '00000000T', direccion: 'C/ Las Eras, 14', codigo_postal: '13000', municipio: 'Villanueva del Campo' }, obra: o, conceptos: conceptosDe(o), total: '9200' }); })(),
    (() => { const o = obraPr({ direccion: 'Avda. de la Constitución, 3', codigo_postal: '13100', municipio: 'Pozo Alto', acs: false, extras: [], oportunidad: '26RES060_OP902' }); return prDe({ id: ID_PR(41), numero: '41/26', fecha: '2026-11-21', cliente_id: 'c-2', cliente: { nombre: 'Andrés', apellidos: 'Molina Ruiz', tlf: '600000002' }, obra: o, conceptos: conceptosDe(o), total: '11132', con_iva: true, id_oportunidad: '26RES060_OP902', simulacion: { estado: 'CREADA', pedida_at: '2026-11-21T10:00:00Z', por: 'app' } }); })(),
    (() => { const o = obraPr({ tipo: 'aire', equipo: { aerotermia_id: null, marca: 'MARCA B', modelo: 'Split 3,5', potencia_kw: 3.5 }, caldera: { combustible: null }, acs: false, emisor: null, extras: [] }); return prDe({ id: ID_PR(39), numero: '39/26', fecha: '2026-11-10', cliente: { nombre: 'Pilar', apellidos: 'Rubio Sanz', tlf: '600000009', direccion: 'C/ del Río, 9', municipio: 'Pozo Alto' }, obra: o, conceptos: conceptosDe(o), total: '1450', estado: 'ANULADO' }); })(),
];
const filaPr = ({ presupuesto: x }) => ({ id: x.id, numero: x.numero, fecha: x.fecha, estado: x.estado, origen: x.origen, cliente: x.cliente.nombre, municipio: x.obra.municipio, resumen: resumenObra(x.obra), base: x.base, total: x.total, obra: x.id_oportunidad, simulacion: x.simulacion?.estado || null });
const prPorId = (id) => PRS.find((x) => x.presupuesto.id === id);
const numerosPr = () => PRS.filter((x) => x.presupuesto.estado !== 'ANULADO').map((x) => x.presupuesto.numero);
const sugeridoPr = () => siguienteNumero(PRS.map((x) => x.presupuesto.numero), '26');
// Lo que el servidor haría con la entrada: cliente resuelto (de la ficha o el tecleado) y cuentas.
const filaDeEntrada = (id, ent, previo = null) => {
    const ficha = ent.cliente_id ? CLIENTES.find((c) => c.id_cliente === ent.cliente_id) : null;
    const cliente = ficha ? { nombre: nombrePropioDemo(ficha.nombre_razon_social), apellidos: nombrePropioDemo(ficha.apellidos), tlf: ficha.tlf, dni: ficha.dni, direccion: ficha.direccion, codigo_postal: ficha.codigo_postal, municipio: nombrePropioDemo(ficha.municipio) } : (ent.cliente || {});
    const r = prDe({ ...ent, id, cliente, cliente_id: ent.cliente_id || null, estado: previo?.estado || 'EMITIDO', id_oportunidad: previo?.id_oportunidad || ent.obra?.oportunidad || null, simulacion: previo?.simulacion || null });
    return r;
};
const nombrePropioDemo = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const malPr = (status, data) => Promise.reject(Object.assign(new Error(String(status)), { response: { status, data } }));
function validarPr(ent) {
    const errores = [];
    if (!ent.numero) errores.push('Falta el número del presupuesto.');
    if (!ent.cliente_id && !String(ent.cliente?.nombre || '').trim()) errores.push('Falta el nombre del cliente.');
    const c = calcularPresupuesto(ent);
    errores.push(...(c.errores || []));
    return errores;
}
const apiPresupuestos = {
    presupuestos: () => espera({ presupuestos: PRS.map(filaPr).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))) }),
    presupuestoNuevo: ({ obra = null, cliente = null } = {}) => {
        const o = obra ? obraDe(obra) : null;
        const ficha = cliente ? CLIENTES.find((c) => c.id_cliente === cliente) : o?.cliente_id ? CLIENTES.find((c) => c.id_cliente === o.cliente_id) : null;
        const obraIni = { tipo: 'aerotermia', direccion: o?.direccion || '', codigo_postal: '', municipio: o?.municipio || '', provincia: o?.provincia || '', equipo: { aerotermia_id: null, marca: '', modelo: '', potencia_kw: null }, caldera: { combustible: 'gasoleo' }, acs: false, emisor: 'radiadores', extras: [], descripcion: '', oportunidad: o?.id || null };
        return espera({
            numero: sugeridoPr(), fecha: new Date().toISOString().slice(0, 10), iva_pct: 21, notas: 'El presupuesto no incluye la alimentación eléctrica.', validez_dias: 30, con_plantilla: true,
            emisor: { nombre: 'Instalaciones de Prueba, S.L.' }, cliente: ficha ? copia(ficha) : null, obra: obraIni, conceptos: conceptosDe(obraIni), ...copia(OPCIONES_PR),
        }, 300);
    },
    presupuestoVistaPrevia: (ent) => {
        if (FALLO) return malPr(500, { error: 'En el banco, con ?fallo=1, la vista previa falla.' });
        const c = calcularPresupuesto(ent);
        const nombre = ent.cliente_id ? nombrePropioDemo(CLIENTES.find((x) => x.id_cliente === ent.cliente_id)?.nombre_razon_social || '') : [ent.cliente?.nombre, ent.cliente?.apellidos].filter(Boolean).join(' ');
        const filas = [['Nº', ent.numero || '—'], ['Fecha', ent.fecha || '—'], ['Cliente', nombre || '—'], ...c.lineas.slice(0, 8).map((l) => [String(l.texto || '').slice(0, 48), l.importe != null ? milesD(l.importe) : '']), ['Importe', milesD(c.base || 0)], [`IVA ${ent.iva_pct} %`, milesD(c.iva || 0)], ['TOTAL PRESUPUESTO', milesD(c.total || 0)]];
        return espera({ pdf: pdfDeMentira('PRESUPUESTO', filas), desborda: (ent.conceptos || []).join('').length > 2200, numeroLargo: String(ent.numero || '').length > 12 }, 400);
    },
    crearPresupuesto: (ent) => {
        const errores = validarPr(ent);
        if (errores.length) return malPr(400, { error: errores[0], errores });
        if (FALLO || numerosPr().some((n) => n.toLowerCase() === String(ent.numero).toLowerCase())) {
            return malPr(409, { code: 'NUMERO_REPETIDO', error: `Ya tienes un presupuesto con el número ${ent.numero}.`, sugerido: sugeridoPr() });
        }
        const nuevo = filaDeEntrada(`aaaaaaaa-0000-4000-8000-${String(Date.now()).slice(-12)}`, ent);
        return envia(() => PRS.unshift(nuevo), 800).then(() => ({ presupuesto: copia(nuevo.presupuesto) }));
    },
    presupuestoHecho: (id) => (prPorId(id) ? espera(copia(prPorId(id)), 300) : espera(null, 200).then(() => malPr(404, { error: 'No existe' }))),
    guardarPresupuesto: (id, ent) => {
        const previo = prPorId(id);
        if (!previo) return malPr(404, { error: 'No existe' });
        const errores = validarPr(ent);
        if (errores.length) return malPr(400, { error: errores[0], errores });
        if (numerosPr().some((n) => n.toLowerCase() === String(ent.numero).toLowerCase() && n !== previo.presupuesto.numero)) {
            return malPr(409, { code: 'NUMERO_REPETIDO', error: `Ya tienes un presupuesto con el número ${ent.numero}.`, sugerido: sugeridoPr() });
        }
        const nuevo = filaDeEntrada(id, ent, previo.presupuesto);
        nuevo.presupuesto.updated_at = new Date().toISOString();
        return envia(() => { previo.presupuesto = nuevo.presupuesto; previo.entrada = nuevo.entrada; }, 700).then(() => ({ presupuesto: copia(nuevo.presupuesto) }));
    },
    anularPresupuesto: (id) => envia(() => { const x = prPorId(id); if (x) x.presupuesto.estado = 'ANULADO'; }, 600).then(() => ({ ok: true })),
    presupuestoHechoPdf: (id) => {
        const x = prPorId(id)?.presupuesto;
        return espera(pdfDeMentira(`PRESUPUESTO ${x?.numero || ''}`, [['Cliente', x?.cliente?.nombre || ''], ...(x?.lineas || []).slice(0, 8).map((l) => [String(l.texto || '').slice(0, 48), l.importe != null ? milesD(l.importe) : '']), ['TOTAL', milesD(x?.total || 0)]]));
    },
    presupuestoDescarga: (id) => apiPresupuestos.presupuestoHechoPdf(id).then((bytes) => {
        const x = prPorId(id)?.presupuesto;
        return { bytes, nombre: `Presupuesto ${String(x?.numero || '').replace(/\//g, '-')} - ${x?.cliente?.nombre || 'Cliente'}.pdf` };
    }),
    presupuestoWhatsapp: () => (FALLO
        ? new Promise((ok, ko) => setTimeout(() => ko(Object.assign(new Error('409'), { response: { status: 409, data: { code: 'WHATSAPP_NO_DISPONIBLE', error: 'Ahora mismo no podemos mandarte el WhatsApp. Descárgalo y pásaselo tú.' } } })), 700))
        : envia(null, 900).then(() => ({ ok: true, a: '···597' }))),
    vincularPresupuesto: (id, obra) => envia(() => {
        const x = prPorId(id);
        if (x) { x.presupuesto.id_oportunidad = obra; x.presupuesto.oportunidad_id = `uuid-${obra}`; x.presupuesto.simulacion = { estado: 'CREADA', pedida_at: new Date().toISOString(), por: 'app' }; }
    }, 400).then(() => ({ presupuesto: copia(prPorId(id)?.presupuesto || null) })),
};

const api = {
    ...apiPresupuestos,
    // ── Fase 4 ──
    catalogo: () => espera(catalogoDeMentira()),
    equipo: (id) => (equipoDe(id) ? espera({ ...copia(conTarifa(equipoDe(id))), proveedores: copia(PROVEEDORES) }, 250) : Promise.reject(new Error('404'))),
    fichaEquipo: (id) => espera(pdfDeMentira(`Ficha técnica · ${equipoDe(id)?.nombre || ''}`, [['Potencia', `${equipoDe(id)?.potencia_kw} kW`], ['SCOP 35 °C', '4,62'], ['SCOP 55 °C', '3,41']])),
    guardarPrecio: (id, precio) => envia(() => { const x = equipoDe(id); if (x) x.tu_precio = precio; }),
    quitarPrecio: (id) => envia(() => { const x = equipoDe(id); if (x) x.tu_precio = null; }),
    compra: (id, dist) => (NOMBRE_DIST[dist] ? espera((() => { const x = equipoDe(id); if (x) x.compro_a = dist; return { ok: true, compro_a: dist }; })(), 400) : Promise.reject(errorDemo(400, 'Ese distribuidor no está entre a los que compras.'))),
    pedido: (id, body) => pedidoDeMentira(id, body),
    obras: () => espera({ obras: copia(LISTA), resumen: resumen(LISTA) }),
    // Con la MISMA forma que el servidor ({ obra }) y el mismo desenvoltorio que la app real.
    obra: (id) => espera(obraDe(id) ? { obra: copia(obraDe(id)) } : Promise.reject(new Error('404')), 250).then(obraDeRespuesta),
    clientes: () => espera(VACIO ? [] : CLIENTES),
    propuestaPdf: (id) => espera(pdfDeMentira('Propuesta de ayuda CAE', [
        ['Cliente', obraDe(id)?.cliente || ''], ['Bono CAE', milesD(obraDe(id)?.bono || 0)], ['Presupuesto de la obra', obraDe(id)?.presupuesto?.importe ? milesD(obraDe(id).presupuesto.importe) : 'Estimado'],
    ])),
    propuestaPasada: (id) => envia(() => {
        const o = obraDe(id);
        o.tareas = o.tareas.filter((x) => x.key !== 'propuesta');
        o.quien = 'cli';
        o.propuesta = { ...o.propuesta, la_tiene: 'cliente' };
        o.papeles = o.papeles.map((x) => (x.key === 'propuesta' ? { ...x, estado: 'Enviada · falta que tu cliente la acepte', tono: 'nos' } : x));
    }, 500),
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
    // ── Fase 3 ──
    escaparate: () => espera(paginaDeMentira()),
    escaparateObras: (obraId) => espera({ obras: copia(OBRAS_FOTOS.filter((o) => !obraId || o.obra === obraId)) }),
    proponerFotos: ({ fotos }) => envia(() => {
        for (const f of fotos) {
            const o = OBRAS_FOTOS.find((x) => x.obra === f.obra);
            const it = o?.fotos.find((x) => x.driveId === f.driveId);
            if (it) it.en_pagina = 'revision';
            ESC.fotos.unshift({ id: `f-${Date.now()}-${f.driveId}`, origen: 'obra', estado: 'revision', motivo: null, fase: it?.fase || 'despues', municipio: o?.municipio || null, miniatura: `/api/instalador-app/escaparate/foto/${f.driveId}` });
        }
    }),
    subirFotos: (ficheros) => envia(() => {
        ficheros.forEach((file, i) => {
            const id = `suelta-${Date.now()}-${i}`;
            try { FOTOS_LOCALES.set(id, URL.createObjectURL(file)); } catch { /* */ }
            ESC.fotos.unshift({ id, origen: 'suelta', estado: 'revision', motivo: null, fase: 'despues', municipio: null, miniatura: `/api/instalador-app/escaparate/foto/${id}` });
        });
    }),
    retirarFoto: (id) => envia(() => { ESC.fotos = ESC.fotos.filter((f) => f.id !== id); }),
    guardarTextos: (cuerpo) => {
        const todo = `${cuerpo.presentacion || ''} ${cuerpo.pueblos || ''}`;
        // El mismo mensaje que el servidor (services/escaparateService.js), para ver el 400.
        const mal = /(?<!\d)[6789](?:[\s.\-/]?\d){8}(?!\d)/.test(todo) ? 'Hay un teléfono en tu texto. En tu página el cliente te contacta por BROKERGY: quítalo y vuelve a guardar.'
            : /\d[\d.,\s]*(?:€|euros?\b)|\bprecios?\b/i.test(todo) ? 'Hay un precio en tu texto. Los precios no salen en tu página: quítalo y vuelve a guardar.' : null;
        if (mal) return Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { error: mal } } }));
        return envia(() => {
            const pueblos = String(cuerpo.pueblos || '').split(',').map((x) => x.trim()).filter(Boolean);
            ESC.textos = { ...ESC.textos, en_revision: { presentacion: cuerpo.presentacion, especialidades: cuerpo.especialidades, pueblos, propuesto_at: new Date().toISOString() }, no_vale: null };
        });
    },
};

// ── Fase 3: la página web de mentira, en cada estado (?pagina=) ─────────────
const PAGINA = p.get('pagina') || '';
const fotoEsc = (id, estado, fase, municipio, extra = {}) => ({ id, origen: 'obra', estado, motivo: null, fase, municipio, miniatura: `/api/instalador-app/escaparate/foto/${id}`, ...extra });
const FOTOS_ESC = {
    '': [fotoEsc('e1', 'publicada', 'antes', 'Villanueva del Campo'), fotoEsc('e2', 'publicada', 'despues', 'Villanueva del Campo'), fotoEsc('e3', 'publicada', 'despues', 'Pozo Alto'),
        fotoEsc('e4', 'revision', 'despues', 'Fuentenueva'), fotoEsc('e5', 'revision', 'antes', null, { origen: 'suelta' }),
        fotoEsc('e6', 'no_vale', 'despues', 'Pozo Alto', { motivo: 'Se lee la matrícula del coche de la entrada.' })],
    vacia: [],
    revision: [fotoEsc('e4', 'revision', 'despues', 'Fuentenueva'), fotoEsc('e7', 'revision', 'antes', 'Fuentenueva'), fotoEsc('e5', 'revision', 'despues', null, { origen: 'suelta' })],
    publicada: [fotoEsc('e1', 'publicada', 'antes', 'Villanueva del Campo'), fotoEsc('e2', 'publicada', 'despues', 'Villanueva del Campo'), fotoEsc('e3', 'publicada', 'despues', 'Pozo Alto'), fotoEsc('e8', 'publicada', 'despues', 'Santa Olalla de Abajo')],
    novale: [fotoEsc('e6', 'no_vale', 'despues', 'Pozo Alto', { motivo: 'Se lee la matrícula del coche de la entrada.' }), fotoEsc('e9', 'no_vale', 'antes', 'Pozo Alto', { motivo: 'Sale la cara de una persona.' }), fotoEsc('e1', 'publicada', 'antes', 'Villanueva del Campo')],
    textos: [fotoEsc('e1', 'publicada', 'antes', 'Villanueva del Campo'), fotoEsc('e2', 'publicada', 'despues', 'Villanueva del Campo')],
};
const VIGENTES = { presentacion: 'Llevamos veinte años cambiando calderas por aerotermia en la comarca. Te lo dejamos funcionando y te ayudamos con los papeles.', especialidades: ['aerotermia', 'suelo_radiante'], pueblos: ['Villanueva del Campo', 'Pozo Alto'] };
const ESC = {
    fotos: copia(FOTOS_ESC[PAGINA] || FOTOS_ESC['']),
    textos: {
        vigentes: PAGINA === 'vacia' ? { presentacion: '', especialidades: [], pueblos: [] } : VIGENTES,
        en_revision: PAGINA === 'textos' ? { presentacion: 'Somos una empresa familiar de Villanueva del Campo. Instalamos aerotermia y suelo radiante desde 2005.', especialidades: ['aerotermia', 'suelo_radiante', 'fotovoltaica'], pueblos: ['Villanueva del Campo', 'Pozo Alto', 'Fuentenueva'], propuesto_at: '2026-11-20T09:00:00Z' } : null,
        no_vale: PAGINA === 'novale' ? { presentacion: 'Llámanos y te damos presupuesto sin compromiso.', especialidades: ['aerotermia'], pueblos: [], motivo: 'En tu página no pueden salir ofertas: cuenta qué hacéis y desde cuándo.' } : null,
    },
};
function paginaDeMentira() {
    const fotos = copia(ESC.fotos);
    const vacia = PAGINA === 'vacia';
    return {
        ficha: { nombre: 'Instalaciones de Prueba, S.L.', municipio: 'Villanueva del Campo', slug: 'instalaciones-de-prueba', sale_en_web: true, url: 'https://brokergy.es/encuentra-tu-instalador/instalaciones-de-prueba/' },
        fotos,
        resumen_fotos: { publicadas: fotos.filter((f) => f.estado === 'publicada').length, revision: fotos.filter((f) => f.estado === 'revision').length, no_vale: fotos.filter((f) => f.estado === 'no_vale').length },
        textos: copia(ESC.textos),
        sale_solo: vacia ? { obras: 2, ayuda_media: null, min_obras_media: 3, marcas: [] } : { obras: 14, ayuda_media: 2480, min_obras_media: 3, marcas: ['MARCA', 'OTRA MARCA'] },
        especialidades: [{ id: 'aerotermia', texto: 'Aerotermia' }, { id: 'suelo_radiante', texto: 'Suelo radiante' }, { id: 'fotovoltaica', texto: 'Placas solares' }, { id: 'aire_acondicionado', texto: 'Aire acondicionado' }, { id: 'calderas', texto: 'Calderas' }],
        limites: { presentacion: 300, pueblos: 15 },
    };
}
const thumb = (obra, d) => `/api/instalador-app/thumb/${obra}/${d}?llave=x&sz=400`;
const OBRAS_FOTOS = VACIO ? [] : [
    { obra: '26RES060_OP901', titulo: 'Aerotermia en Villanueva del Campo', municipio: 'Villanueva del Campo', cuando: '2026-11-12T10:00:00Z', fotos: [
        { slot: 'FOTO_CALDERA_ANTES', driveId: 'demo-901-a', fase: 'antes', en_pagina: 'publicada', miniatura: thumb('26RES060_OP901', 'demo-901-a') },
        { slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'demo-foto-ext-1', fase: 'despues', en_pagina: null, miniatura: thumb('26RES060_OP901', 'demo-foto-ext-1') },
        { slot: 'FOTO_UNIDAD_INTERIOR', driveId: 'demo-901-c', fase: 'despues', en_pagina: null, miniatura: thumb('26RES060_OP901', 'demo-901-c') },
    ] },
    { obra: '26RES060_OP906', titulo: 'Aerotermia en Pozo Alto', municipio: 'Pozo Alto', cuando: '2026-11-08T10:00:00Z', fotos: [
        { slot: 'FOTO_CALDERA_ANTES', driveId: 'demo-906-a', fase: 'antes', en_pagina: 'no_vale', miniatura: thumb('26RES060_OP906', 'demo-906-a') },
        { slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'demo-906-b', fase: 'despues', en_pagina: 'revision', miniatura: thumb('26RES060_OP906', 'demo-906-b') },
        { slot: 'FOTO_UNIDAD_INTERIOR', driveId: 'demo-906-c', fase: 'despues', en_pagina: null, miniatura: thumb('26RES060_OP906', 'demo-906-c') },
        { slot: 'FOTO_DEPOSITO', driveId: 'demo-906-d', fase: 'despues', en_pagina: null, miniatura: thumb('26RES060_OP906', 'demo-906-d') },
    ] },
    { obra: '25RES060_OP905', titulo: 'Aerotermia en Villanueva del Campo', municipio: 'Villanueva del Campo', cuando: '2025-09-20T10:00:00Z', fotos: [
        { slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'demo-905-a', fase: 'despues', en_pagina: null, miniatura: thumb('25RES060_OP905', 'demo-905-a') },
    ] },
];

// ── Fase 3: la cola de revisión (?cola=1), contestada aquí ──────────────────
const COLA = {
    fotos: [
        { id: '11111111-1111-4111-8111-111111111111', origen: 'OBRA', estado: 'PENDIENTE', fase: 'DESPUES', municipio: 'Fuentenueva', obra: '26RES060_907', permiso_cliente: true, propuesta_at: '2026-11-20T09:00:00Z', miniatura: '/api/instalador-app/escaparate/foto/c1' },
        { id: '22222222-2222-4222-8222-222222222222', origen: 'OBRA', estado: 'PENDIENTE', fase: 'ANTES', municipio: 'Fuentenueva', obra: '26RES060_907', permiso_cliente: true, propuesta_at: '2026-11-20T09:00:00Z', miniatura: '/api/instalador-app/escaparate/foto/c2' },
        { id: '33333333-3333-4333-8333-333333333333', origen: 'SUELTA', estado: 'PENDIENTE', fase: 'DESPUES', municipio: null, obra: null, permiso_cliente: true, propuesta_at: '2026-11-21T08:00:00Z', miniatura: '/api/instalador-app/escaparate/foto/c3' },
    ],
    textos: [{ id: '44444444-4444-4444-8444-444444444444', presentacion: 'Somos una empresa familiar de Villanueva del Campo. Instalamos aerotermia y suelo radiante desde 2005.', especialidades: ['aerotermia', 'suelo_radiante'], pueblos: ['Villanueva del Campo', 'Pozo Alto'], estado: 'PENDIENTE', propuesto_at: '2026-11-20T09:00:00Z' }],
};
async function adaptadorCola(cfg) {
    await new Promise((r) => setTimeout(r, 300));
    const resp = (data, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config: cfg, request: {} });
    if (FALLO && cfg.method !== 'get') return Promise.reject(Object.assign(new Error('500'), { response: resp({ error: 'En el banco, con ?fallo=1, todo falla.' }, 500) }));
    if (cfg.method === 'get') return resp({ fotos: copia(COLA.fotos), textos_pendientes: copia(COLA.textos.filter((x) => x.estado === 'PENDIENTE')), textos_ultimo: null, textos_vigentes: VIGENTES });
    const m = /\/(fotos|textos)\/([^/]+)\/(aprobar|rechazar)$/.exec(cfg.url);
    if (m) {
        const lista = m[1] === 'fotos' ? COLA.fotos : COLA.textos;
        const it = lista.find((x) => x.id === m[2]);
        if (it) it.estado = m[3] === 'aprobar' ? (m[1] === 'fotos' ? 'PUBLICADA' : 'APROBADO') : 'NO_VALE';
        if (m[1] === 'fotos') COLA.fotos = COLA.fotos.filter((x) => x.estado !== 'PUBLICADA');
    }
    return resp({ ok: true });
}
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

function Cola() {
    const [n, setN] = React.useState(null);
    return (
        <div style={{ minHeight: '100vh', background: '#0c0e12', color: '#fff', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ maxWidth: 760, margin: '0 auto' }} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 sm:px-5 py-4">
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-black text-white/45 mb-4">Pendiente de revisar {n ? `· ${n} por revisar` : ''}</h3>
                <RevisionEscaparate instaladorId="demo" puedeResolver={!p.has('lector')} onContador={setN} />
            </div>
        </div>
    );
}

// ── Fase 4: la carga del Excel, contestada aquí (?tarifa=1) ─────────────────
const fila = (n, marca, ref, precio, extra) => ({ fila: n, marca, ref, precio, precio_texto: String(precio ?? ''), ...extra });
function lecturaDeMentira(elecciones) {
    const elegido = Number(elecciones?.[6]) || 0;
    const amb = elegido
        ? fila(6, 'MARCA A', 'MA-U12', 6120, { estado: 'CASA', aerotermia_id: elegido, nombre: elegido === 102 ? 'Aire-agua Serie Uno 12' : 'Aire-agua Serie Uno 12 trifásica', elegida_a_mano: true, cambio: 'NUEVA', anterior: null })
        : fila(6, 'MARCA A', 'MA-U12', 6120, { estado: 'AMBIGUA', motivo: 'Casa con 2 modelos: elige cuál', candidatos: [{ id: 102, nombre: 'Aire-agua Serie Uno 12', exterior: 'MA-U12-M1' }, { id: 106, nombre: 'Aire-agua Serie Uno 12 trifásica', exterior: 'MA-U12-T1' }] });
    const filas = [
        fila(2, 'Marca A', 'ma u8 m1', 5990, { estado: 'CASA', aerotermia_id: 101, nombre: 'Aire-agua Serie Uno 8', cambio: 'SUBE', anterior: 5890 }),
        fila(3, 'MARCA A', 'MA-D10-B2', 7240.5, { estado: 'CASA', aerotermia_id: 103, nombre: 'Aire-agua Serie Dos 10 bibloc', cambio: 'IGUAL', anterior: 7240.5 }),
        fila(4, 'MARCA B', 'MB C6', 4290, { estado: 'CASA', aerotermia_id: 104, nombre: 'Compacta 6', cambio: 'BAJA', anterior: 4380 }),
        fila(5, 'MARCA B', 'MB-C16-T', 9875, { estado: 'CASA', aerotermia_id: 105, nombre: 'Compacta 16 trifásica', cambio: 'IGUAL', anterior: 9875 }),
        amb,
        fila(7, 'MARCA C', 'MC-200', 3100, { estado: 'SIN_PAREJA', motivo: 'Esa marca no está en el catálogo' }),
        fila(8, 'MARCA A', 'MA-X99', 8800, { estado: 'SIN_PAREJA', motivo: 'Ningún modelo de esa marca tiene esa referencia' }),
        fila(9, 'MARCA B', 'MB-C10', null, { precio_texto: 'consultar', estado: 'ERROR', motivo: 'El precio no es un número válido' }),
    ];
    const casa = filas.filter((f) => f.estado === 'CASA');
    const guardar = casa.filter((f) => f.cambio !== 'IGUAL');
    return {
        en_seco: true, fichero: 'tarifa-noviembre.xlsx', sha256: 'a'.repeat(64), firma: `firma-${guardar.length}`,
        resumen: {
            leidas: filas.length, casan: casa.length, nuevas: casa.filter((f) => f.cambio === 'NUEVA').length,
            cambian: casa.filter((f) => ['SUBE', 'BAJA'].includes(f.cambio)).length, iguales: casa.filter((f) => f.cambio === 'IGUAL').length,
            ambiguas: filas.filter((f) => f.estado === 'AMBIGUA').length, sin_pareja: 2, errores: 1, duplicadas: 0, repetidas: 0, a_guardar: guardar.length,
        },
        filas,
    };
}
const errorDemo = (status, error) => Object.assign(new Error(String(status)), { response: { status, data: { error } } });
let proveedoresDemo = [DN];
const apiProveedoresDemo = {
    distribuidores: () => apiTarifasDemo.distribuidores(),
    leer: () => espera([...proveedoresDemo], 300),
    guardar: (_id, lista) => (FALLO ? Promise.reject(errorDemo(503, 'No se ha podido guardar a quién compra. Vuelve a intentarlo.')) : espera((proveedoresDemo = [...lista], { ok: true, distribuidores: lista }), 500)),
};
const apiTarifasDemo = {
    distribuidores: () => espera([{ id: DN, nombre: 'DISTRIBUIDOR NORTE', razon_social: 'Distribuidor Norte SL' }, { id: DS, nombre: 'DISTRIBUIDOR SUR', razon_social: 'Distribuidor Sur SL' }], 300),
    plantilla: () => { corta('plantilla (en el banco no se descarga)'); return Promise.reject(errorDemo(400, 'En el banco de pruebas la plantilla no se descarga.')); },
    leer: (form) => espera(lecturaDeMentira(JSON.parse(form.get('elecciones') || '{}')), 700),
    confirmar: (form) => new Promise((ok, ko) => setTimeout(() => {
        if (FALLO) { ko(errorDemo(409, 'El Excel, el catálogo o las tarifas han cambiado desde que lo leíste. Vuelve a leerlo antes de guardar.')); return; }
        ok({ ok: true, guardadas: lecturaDeMentira(JSON.parse(form.get('elecciones') || '{}')).resumen.a_guardar });
    }, 900)),
};
function Tarifa() {
    const [abierto, setAbierto] = React.useState(true);
    return (
        <div style={{ minHeight: '100vh', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }} className="bg-bkg-deep text-white">
            <p className="text-white/50 text-sm">Pantalla Aerotermia del CRM (solo ADMIN) · banco de pruebas</p>
            {!abierto && <button type="button" className="mt-4 px-5 py-3 rounded-2xl border border-white/10 text-sky-300 text-xs font-black uppercase tracking-widest" onClick={() => setAbierto(true)}>Cargar tarifa (Excel)</button>}
            {!abierto && (
                <div className="mt-6 max-w-xl rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-white/60 mb-3">Ficha del instalador · Le compra a…</p>
                    <LeCompraA instaladorId="demo" api={apiProveedoresDemo} />
                </div>
            )}
            {abierto && <CargarTarifaModal api={apiTarifasDemo} onClose={() => setAbierto(false)} />}
        </div>
    );
}

function Demo() {
    const [externo, setExterno] = React.useState(null);
    const aviso = (txt) => () => window.alert(`Banco de pruebas: ${txt}. En la app de verdad se abre lo de siempre.`);
    return (
        <AppInstalador
            api={api}
            saludo="RCA"
            empresa="Instalaciones de Prueba, S.L."
            paginaVista={p.has('elegir') ? 'elegir' : 'pagina'}
            logo={MARCA ? LOGO_DEMO : null}
            colorMarca={MARCA === 'claro' ? '#ffd400' : MARCA ? '#1565c0' : null}
            instalarComo={['iphone', 'android'].includes(p.get('instalar')) ? p.get('instalar') : null}
            onNueva={(o) => {
                if (o?.presupuesto) {
                    const { alCrear, ...lo } = o.presupuesto;
                    window.alert(`Banco de pruebas: «Nueva simulación» desde el presupuesto ${lo.numero}.\n\nCliente: ${[lo.cliente.nombre, lo.cliente.apellidos].join(' ')} · ${lo.cliente.tlf || 'sin teléfono'}\nBuscador (dirección): ${lo.direccion}\nEquipo: ${[lo.equipo.marca, lo.equipo.modelo].filter(Boolean).join(' ') || '—'} (catálogo ${lo.equipo.aerotermia_id ?? 'no'})\nPresupuesto con IVA: ${lo.total_con_iva} €\n\nAl aceptar, se simula que se creó la oportunidad 26RES060_OP999 y se liga.`);
                    alCrear?.({ id_oportunidad: '26RES060_OP999' });
                    return;
                }
                window.alert(o?.equipo
                    ? `Banco de pruebas: «Nueva simulación» con ${o.equipo.marca} ${o.equipo.nombre} y ${o.equipo.precio_sin_iva ?? 'sin'} € sin IVA (${o.equipo.origen || 'sin precio'}) como presupuesto de la aerotermia.`
                    : 'Banco de pruebas: «Nueva simulación». En la app de verdad se abre lo de siempre.');
            }}
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
contenedor.__raiz.render(p.has('cola') ? <Cola /> : p.has('tarifa') ? <Tarifa /> : <Demo />);
