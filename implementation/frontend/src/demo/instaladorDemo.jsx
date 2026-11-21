// BANCO DE PRUEBAS de la app del INSTALADOR (fase 1). Solo en desarrollo: no entra
// en el build. Abre `/instalador-demo.html` con `npm run dev`.
// Pinta AppInstalador SIN SESIÓN y SIN API: todo son datos de mentira de este
// fichero (nombres inventados). Por si acaso, cualquier petición a /api se corta
// en el navegador (local = datos de PRODUCCIÓN).
//   ?vacio=1   → un instalador sin obras ni clientes (estados vacíos)
//   ?error=1   → la BD no contesta (el aviso de «ahora mismo no podemos»)
//   ?seccion=obras|clientes → entra directamente en esa sección
/* eslint-disable react-refresh/only-export-components -- es un punto de entrada, no un módulo */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '../index.css';
import AppInstalador from '../features/instalador/AppInstalador';

const corta = (que) => { console.warn(`[instalador-demo] BLOQUEADO ${que}`); };
axios.interceptors.request.use((cfg) => { corta(`${cfg.method} ${cfg.url}`); return Promise.reject(new Error('Banco de pruebas: sin API')); });
const fetchOriginal = window.fetch.bind(window);
window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/api\//.test(url)) { corta(`fetch ${url}`); return Promise.reject(new Error('Banco de pruebas: sin API')); }
    return fetchOriginal(input, init);
};

const p = new URLSearchParams(window.location.search);
const VACIO = p.has('vacio');
const ERROR = p.has('error');

const t = (key, que, destino) => ({ key, que, destino });
const enlace = (url) => ({ tipo: 'enlace', url: `#demo-${url}` });

const OBRAS = [
    {
        id: '26RES060_OP901', uuid: 'u-901', numero_expediente: '26RES060_901', con_expediente: true,
        cliente: 'Lucía Prado Torres', cliente_id: 'c-1', direccion: 'C/ Las Eras, 14', municipio: 'Villanueva del Campo', provincia: 'Ciudad Real',
        bono: 2300, paso: 4, fase: 'Trámite', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('cifo', 'Firma el certificado de la instalación', enlace('cifo')), t('factura', 'Haz la factura de la obra', enlace('factura'))],
        telefono: '600000001', direccion_completa: 'C/ Las Eras, 14 · 13000 Villanueva del Campo · (Ciudad Real)',
        cuentas: { obra: 9800, total: 6740, lineas: [
            { k: 'obra', texto: 'Presupuesto de la obra', eur: 9800 }, { k: 'bono', texto: 'Bono CAE', eur: -2300 },
            { k: 'irpfbono', texto: 'IRPF a pagar por el bono', eur: 437 }, { k: 'irpf', texto: 'Deducción en la Renta, hasta', eur: -1597 },
            { k: 'gestion', texto: 'Gestión del expediente', eur: 400 },
        ] },
        presupuesto: { importe: 9800, estimado: false }, factura: { n: 0, validadas: 0, hecha_en_app: false },
        equipo: { titulo: 'Aerotermia 8 kW', marca: 'MARCA', modelo: 'MONOBLOC 8', serie: 'SN-0000-1234', acs: null, con_acs: true },
        caldera_retirada: { combustible: 'GASÓLEO', marca: 'OTRA', modelo: '', tipo: 'Caldera' },
        papeles: [
            { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Falta tu firma', tono: 'tu' },
            { key: 'rite', nombre: 'Legalización RITE', estado: 'Recibida', tono: 'ok' },
            { key: 'factura', nombre: 'Factura de la obra', estado: 'Todavía no está hecha', tono: 'tu' },
            { key: 'cee_ini', nombre: 'Certificado energético inicial', estado: 'Registrado', tono: 'ok' },
            { key: 'cee_fin', nombre: 'Certificado energético final', estado: 'Lo hacemos nosotros', tono: 'nos' },
        ], papeles_listos: 2, cobrado: false,
    },
    {
        id: '26RES060_OP902', uuid: 'u-902', numero_expediente: null, con_expediente: false,
        cliente: 'Andrés Molina Ruiz', cliente_id: 'c-2', direccion: 'Avda. de la Constitución, 3', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 1850, paso: 1, fase: 'Simulada', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('propuesta', 'Envía la propuesta al cliente', { tipo: 'oportunidad', id: '26RES060_OP902' })],
        telefono: '600000002', cuentas: { obra: 8200, total: 6350, lineas: [
            { k: 'obra', texto: 'Presupuesto de la obra', eur: 8200 }, { k: 'bono', texto: 'Bono CAE', eur: -1850 },
        ] }, presupuesto: { importe: 8200, estimado: true },
    },
    {
        id: '26RES080_OP903', uuid: 'u-903', numero_expediente: '26RES080_903', con_expediente: true,
        cliente: 'Carmen Vidal Ortega', cliente_id: 'c-3', direccion: 'C/ Mayor, 52', municipio: 'Santa Olalla de Abajo', provincia: 'Toledo',
        bono: 4120, paso: 3, fase: 'Aceptada', quien: 'nos', tipo: 'Reforma con aerotermia', tareas: [],
        telefono: '600000003', cuentas: { obra: 21500, total: 15380, lineas: [
            { k: 'obra', texto: 'Presupuesto de la obra', eur: 21500 }, { k: 'bono', texto: 'Bono CAE', eur: -4120 },
            { k: 'irpf', texto: 'Deducción en la Renta, hasta', eur: -2000 },
        ] }, presupuesto: { importe: 21500, estimado: false }, factura: { n: 0, validadas: 0 },
        equipo: null, caldera_retirada: { combustible: 'GAS NATURAL', marca: '', tipo: 'Caldera' },
        papeles: [
            { key: 'cifo', nombre: 'Certificado de la instalación', estado: 'Lo preparamos nosotros', tono: 'nos' },
            { key: 'rite', nombre: 'Legalización RITE', estado: 'Aún no toca', tono: 'nos' },
            { key: 'factura', nombre: 'Factura de la obra', estado: 'Aún no toca', tono: 'nos' },
            { key: 'cee_ini', nombre: 'Certificado energético inicial', estado: 'Lo hacemos nosotros', tono: 'nos' },
            { key: 'cee_fin', nombre: 'Certificado energético final', estado: 'Lo hacemos nosotros', tono: 'nos' },
        ], papeles_listos: 0, cobrado: false,
    },
    {
        id: '26RES060_OP904', uuid: 'u-904', numero_expediente: null, con_expediente: false,
        cliente: 'José Antonio Serrano Gil', cliente_id: 'c-4', direccion: 'Pza. de España, 1', municipio: 'Fuentenueva', provincia: 'Albacete',
        bono: 2050, paso: 2, fase: 'Propuesta', quien: 'cli', tipo: 'Aerotermia · hibridación', tareas: [],
    },
    {
        id: '25RES060_OP905', uuid: 'u-905', numero_expediente: '25RES060_905', con_expediente: true,
        cliente: 'Lucía Prado Torres', cliente_id: 'c-1', direccion: 'C/ Real, 8 (casa del pueblo)', municipio: 'Villanueva del Campo', provincia: 'Ciudad Real',
        bono: 1980, paso: 5, fase: 'Cobro', quien: 'fin', tipo: 'Aerotermia · cambio de caldera', tareas: [],
        presupuesto: { importe: 7600 }, factura: { n: 1, validadas: 1 }, papeles: [
            { key: 'factura', nombre: 'Factura de la obra', estado: 'Revisada', tono: 'ok' },
            { key: 'cee_ini', nombre: 'Certificado energético inicial', estado: 'Registrado', tono: 'ok' },
            { key: 'cee_fin', nombre: 'Certificado energético final', estado: 'Registrado', tono: 'ok' },
        ], papeles_listos: 3, cobrado: true,
    },
    {
        id: '26RES060_OP906', uuid: 'u-906', numero_expediente: '26RES060_906', con_expediente: true,
        cliente: 'Hermanos Calvo, S.L.', cliente_id: 'c-5', direccion: 'Polígono Los Llanos, nave 7', municipio: 'Pozo Alto', provincia: 'Ciudad Real',
        bono: 3400, paso: 4, fase: 'Trámite', quien: 'tu', tipo: 'Aerotermia · cambio de caldera',
        tareas: [t('rite', 'Sube la legalización RITE', enlace('rite'))],
    },
];

const CLIENTES = [
    { id_cliente: 'c-1', nombre_razon_social: 'LUCÍA', apellidos: 'PRADO TORRES', tlf: '600000001', email: 'LUCIA@EJEMPLO.ES', dni: '00000000T', municipio: 'VILLANUEVA DEL CAMPO', direccion: 'C/ Las Eras, 14', codigo_postal: '13000' },
    { id_cliente: 'c-2', nombre_razon_social: 'ANDRÉS', apellidos: 'MOLINA RUIZ', tlf: '600000002', email: '', dni: '', municipio: 'POZO ALTO' },
    { id_cliente: 'c-3', nombre_razon_social: 'CARMEN', apellidos: 'VIDAL ORTEGA', tlf: '600000003', email: 'carmen@ejemplo.es', dni: '00000001R', municipio: 'SANTA OLALLA DE ABAJO', direccion: 'C/ Mayor, 52', codigo_postal: '45000' },
    { id_cliente: 'c-4', nombre_razon_social: 'JOSÉ ANTONIO', apellidos: 'SERRANO GIL', tlf: '600000004', municipio: 'FUENTENUEVA' },
    { id_cliente: 'c-5', nombre_razon_social: 'HERMANOS CALVO, S.L.', apellidos: '', es_empresa: true, tlf: '600000005', municipio: 'POZO ALTO', dni: 'B00000000' },
];

const resumen = (obras) => ({
    total: obras.length, en_marcha: obras.filter((o) => o.paso < 5).length,
    te_toca: obras.filter((o) => o.quien === 'tu').length, cobradas: obras.filter((o) => o.quien === 'fin').length,
    tareas: obras.reduce((s, o) => s + o.tareas.length, 0),
});
const espera = (v, ms = 350) => new Promise((ok, ko) => setTimeout(() => (ERROR ? ko(new Error('503')) : ok(v)), ms));
const LISTA = VACIO ? [] : OBRAS;
const api = {
    obras: () => espera({ obras: LISTA, resumen: resumen(LISTA) }),
    obra: (id) => espera(LISTA.find((o) => o.id === id) || Promise.reject(new Error('404')), 250),
    clientes: () => espera(VACIO ? [] : CLIENTES),
};

function Demo() {
    const [externo, setExterno] = React.useState(null);
    const aviso = (txt) => () => window.alert(`Banco de pruebas: ${txt}. En la app de verdad se abre lo de siempre.`);
    return (
        <AppInstalador
            api={api}
            saludo="RCA"
            empresa="Instalaciones de Prueba, S.L."
            seccionInicial={['obras', 'clientes'].includes(p.get('seccion')) ? p.get('seccion') : 'inicio'}
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

ReactDOM.createRoot(document.getElementById('root')).render(<Demo />);
