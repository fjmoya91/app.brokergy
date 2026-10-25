import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CondicionesAceptacionModal from '../components/CondicionesAceptacionModal';
import {
    CONDICIONES_OFERTA_CEE, CONDICIONES_OFERTA_CEE_VERSION, CONDICIONES_PRESUPUESTO, CONDICIONES_PRESUPUESTO_VERSION,
} from '../logic/condicionesOfertaCee';
import { parseCatastroAddressFull } from '../../../utils/direccionCatastral';
import { CALEFACCION, ACS, PLACAS, CUESTIONARIO_VACIO, faltanCuestionario } from '../../cee-directo/logic/cuestionarioCee';
import { traerDireccionCatastral, refCatastralValida, limpiarRefCatastral } from '../../../utils/traerDireccionCatastral';
import { DocsManager } from '../../docs/DocsManager';
import { API_DOCS_CEE_DIRECTO } from '../../docs/docsApi';

// ─────────────────────────────────────────────────────────────────────────────
// /aceptar-cee/:token — el cliente acepta la OFERTA de un CEE directo.
//
// Es la misma pantalla que /firma/:id de la propuesta CAE y pide LOS MISMOS
// datos (nombre, apellidos, DNI, email y teléfono), SIN la cuenta bancaria:
// aquí no hay bono que ingresarle, es él quien paga. Y termina de completar lo
// que falte: el INMUEBLE (con su referencia catastral, que puede sacar de su
// UBICACIÓN como en la captación de oportunidades) y su DOMICILIO.
//
// Al aceptar nace el expediente {AAAA}CEE_{n} y se le dice su número.
//
// Un presupuesto SIN certificado (`abre_cee: false`: una legalización, una
// memoria…) se acepta en la misma página, sin el cuestionario de climatización
// ni las fotos para el técnico, con el inmueble opcional y sus condiciones; no
// abre expediente: se avisa al equipo y se le confirma al cliente.
//
// La API se pide en RELATIVO (como FirmaMovilView): así funciona igual desde el
// móvil en la red local que en producción.
//
// Con el estilo «carta de pago» (regla 164, prefijo `.ac-`, 24/10/2026): papel
// crema, Antonio en los titulares, una acción naranja por tarjeta y los avisos
// en ámbar. Solo cambió el aspecto: qué se pide, qué se valida y qué se envía
// son lo de siempre. El gestor de fotos es el del CRM (oscuro): va dentro de
// `.theme-light`, que remapea sus clases al tema claro.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/public/oferta-cee';
const WHATSAPP = '34623926179';
const FALTA_CUESTIONARIO = 'falta-cuestionario';

// /aceptar-cee/demo (y ?sin-cee) — la página tal y como la ve el cliente, con
// datos de mentira. No llama a la API: ni se acepta nada ni sale ningún mensaje.
const DEMO_TOKEN = 'demo';
const demoOferta = (sinCee) => ({
    numero: 'P-2026-0042', fecha: new Date().toISOString(), estado: 'ENVIADA', alcance: sinCee ? null : 'INICIAL',
    abre_cee: !sinCee,
    concepto: sinCee ? 'la legalización de la instalación fotovoltaica' : 'el certificado de eficiencia energética',
    lineas: sinCee
        ? [
            { descripcion: 'Memoria técnica de diseño de la instalación fotovoltaica', detalle: 'Hasta 10 kWp, autoconsumo sin excedentes', uds: 1, suplido: false },
            { descripcion: 'Registro de la instalación en Industria', detalle: null, uds: 1, suplido: false },
            { descripcion: 'Tasa de Industria', detalle: null, uds: 1, suplido: true },
        ]
        : [{ descripcion: 'Certificado de eficiencia energética de vivienda', detalle: null, uds: 1, suplido: false }],
    total: sinCee ? 412.6 : 145.2,
    observaciones: sinCee
        ? 'El registro en Industria se tramita cuando la instalación esté terminada y tengamos el certificado del instalador.'
        : 'La visita se concierta contigo por teléfono. Ten a mano las facturas de luz y gas del último año.',
    cliente: { nombre_razon_social: 'María', apellidos: 'García López', dni_cif: '12345678Z', email: 'maria.garcia@ejemplo.es', telefono: '600 000 000', domicilio: {} },
    inmueble: sinCee ? {} : { direccion: 'CL MAYOR 12', codigo_postal: '13001', municipio: 'Ciudad Real', provincia: 'Ciudad Real', ref_catastral: '' },
});

const capital = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/**
 * Una propiedad del Catastro ({ rc, address, postalCode, municipality,
 * province }) repartida en los campos del formulario. La vía viene como la tiene
 * registrada el Catastro y sin piso: queda editable.
 */
function camposDePropiedad(p) {
    const t = parseCatastroAddressFull(p.address) || {};
    return {
        ref_catastral: p.rc || '',
        direccion: t.direccion || p.address || '',
        codigo_postal: p.postalCode || t.codigo_postal || '',
        municipio: capital(p.municipality || t.municipioHint || ''),
        provincia: capital(p.province || t.provincia || ''),
    };
}

/** Rótulo de un inmueble de un edificio: "Esc. 1 · Planta 02 · Puerta B · Vivienda · 90 m²". */
const rotuloInmueble = (d) => [
    d.block && `Esc. ${d.block}`, d.floor && `Planta ${d.floor}`, d.door && `Puerta ${d.door}`,
    d.use && capital(d.use), d.surface ? `${d.surface} m²` : null,
].filter(Boolean).join(' · ') || d.rc;
const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtFecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : '');

/* ── Estilos: el registro de la carta de pago ─────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.ac{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.ac *{box-sizing:border-box}
.ac ::selection{background:var(--lima);color:var(--tinta)}
.ac-filete-top{height:4px;background:var(--filete)}
.ac-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.ac-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.ac-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.ac-logo{height:26px;width:auto;display:block}
.ac-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.ac-hola{font-size:15px;color:var(--gris);margin:0 2px}
.ac-hola b{color:var(--tinta);font-weight:600}
.ac-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.ac-h1{font-size:42px;line-height:1.16;margin:6px 2px 0}
.ac-h2{font-size:28px;line-height:1.16;margin:0}
/* El fondo empieza un poco por debajo del alto de la letra: en un titular de
   dos líneas, un fondo entero tapaba los rasgos bajos de la de arriba. */
.ac-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.ac-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.ac-txt{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.ac-txt b{color:var(--tinta);font-weight:700}
.ac-stack{margin-top:22px}
.ac-stack > * + *{margin-top:14px}
.ac-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:22px 20px}
.ac-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.ac-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ac-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0}
.ac-eyebrow-gris{color:var(--gris)}
.ac-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;background:var(--crema);border:1px solid var(--linea);color:var(--gris)}
.ac-concepto{font-size:16px;line-height:1.45;color:#3b3e45;margin:12px 0 0}
.ac-concepto b{color:var(--tinta);font-weight:700}
.ac-lineas{margin:14px 0 0;padding:0;list-style:none}
.ac-lineas li{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--linea);font-size:14px;line-height:1.45;color:var(--tinta)}
.ac-lineas li:first-child{border-top:0;padding-top:4px}
.ac-lineas .ac-uds{flex:none;min-width:2.2ch;font-weight:700;color:var(--gris)}
.ac-lineas small{display:block;font-size:12.5px;color:var(--gris2);margin-top:2px}
.ac-tasa{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--crema);border:1px solid var(--linea);font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gris);vertical-align:1px}
.ac-donde{display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;font-size:13.5px;line-height:1.45;color:var(--gris)}
.ac-donde svg{flex:none;margin-top:1px}
.ac-obs{margin:14px 0 0;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea)}
.ac-obs p{margin:6px 0 0;font-size:14px;line-height:1.55;color:var(--tinta);white-space:pre-line;overflow-wrap:anywhere}
.ac-total{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid var(--linea)}
.ac-total-k{font-size:13px;color:var(--gris);line-height:1.4}
.ac-total-k b{display:block;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta);margin-bottom:2px}
.ac-importe{font-size:46px;line-height:.95;white-space:nowrap}
.ac-importe small{font-size:24px}
.ac-numero{font-size:40px;line-height:1;margin:10px 0 0;letter-spacing:.01em;word-break:break-all}
.ac-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.ac-aviso{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.ac-aviso p{margin:0}
.ac-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.ac-aviso-ambar .ac-ico-tile{background:#ffe9bd;color:#7a4b00}
.ac-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.ac-aviso-ok .ac-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.ac-mt{margin-top:14px}
.ac-demo{display:flex;gap:10px;align-items:center;margin:0 0 16px;padding:10px 14px;border-radius:14px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;font-size:12.5px;line-height:1.45;color:var(--gris)}
.ac-demo b{color:var(--tinta)}
/* botones */
.ac-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;text-align:center;transition:transform .12s ease,box-shadow .2s ease,filter .2s ease,border-color .2s ease}
.ac-btn:active{transform:scale(.98)}
.ac-btn:disabled{opacity:.55;cursor:default;transform:none}
.ac-btn:focus-visible,.ac-link:focus-visible,.ac-opc:focus-visible,.ac-elige:focus-visible,.ac-mini:focus-visible,.ac-casilla:focus-within{outline:3px solid var(--tinta);outline-offset:3px}
.ac-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.ac-btn-pri:hover:not(:disabled){filter:brightness(1.04)}
.ac-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.ac-btn-sec:hover:not(:disabled){border-color:rgba(20,17,17,.3)}
.ac-btns2{display:grid;gap:10px}
.ac-mini{appearance:none;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:54px;padding:0 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 14.5px 'Inter',sans-serif;white-space:nowrap}
.ac-mini:hover:not(:disabled){border-color:rgba(20,17,17,.3)}
.ac-mini:disabled{opacity:.45;cursor:default}
.ac-link{appearance:none;background:none;border:0;cursor:pointer;padding:0;font:inherit;font-weight:700;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.35);border-radius:6px}
.ac-o{display:flex;align-items:center;gap:12px;margin:14px 0;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris2)}
.ac-o::before,.ac-o::after{content:'';flex:1;height:1px;background:var(--linea)}
/* opciones */
.ac-preg{margin-top:22px}
.ac-preg-t{font-size:16px;font-weight:700;line-height:1.4;color:var(--tinta);margin:0}
.ac-preg-t i{font-style:normal;color:var(--naranja-txt)}
.ac-opcs{display:grid;gap:8px;margin-top:12px}
.ac-opc{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:flex-start;gap:12px;padding:14px;min-height:60px;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid rgba(20,17,17,.12);border-radius:16px;color:var(--tinta);font:inherit;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease,transform .12s ease}
.ac-opc:hover{border-color:rgba(20,17,17,.28)}
.ac-opc:active{transform:scale(.99)}
.ac-opc-sel,.ac-opc-sel:hover{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
.ac-opc-cuerpo{flex:1;min-width:0}
.ac-opc-label{display:block;font-size:15px;font-weight:700;line-height:1.35}
.ac-opc-sub{display:block;font-size:13px;line-height:1.45;color:var(--gris);margin-top:2px}
.ac-radio{flex:none;width:22px;height:22px;margin-top:1px;border-radius:999px;border:2px solid rgba(20,17,17,.22);display:grid;place-items:center;color:#08090c;transition:background-color .2s ease,border-color .2s ease}
.ac-opc-sel .ac-radio{background:var(--naranja);border-color:var(--naranja)}
.ac-elige-par{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.ac-elige{appearance:none;-webkit-tap-highlight-color:transparent;cursor:pointer;min-height:52px;padding:10px 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 15px/1.3 'Inter',sans-serif;text-align:center;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease}
.ac-elige:hover{border-color:rgba(20,17,17,.3)}
.ac-elige-sel,.ac-elige-sel:hover{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
.ac-subcaja{margin-top:12px;padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.ac-subcaja .ac-preg{margin-top:0}
/* campos */
.ac-k{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:0 2px 8px}
.ac-k i{font-style:normal;color:var(--naranja-txt)}
.ac-campos{display:grid;gap:16px;margin-top:16px}
.ac-dos{display:grid;gap:16px}
.ac-input{appearance:none;display:block;width:100%;height:54px;padding:0 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:500 16px/1 'Inter',sans-serif;transition:border-color .2s ease,box-shadow .2s ease}
.ac-input::placeholder{color:#a3a5aa;text-transform:none}
.ac-input:hover{border-color:rgba(20,17,17,.28)}
.ac-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.ac-input-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em}
.ac-input-corto{max-width:160px}
.ac-fila{display:flex;gap:8px}
.ac-fila .ac-input{flex:1;min-width:0}
.ac-ayuda{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:7px 2px 0}
/* edificio */
.ac-edif{margin-top:14px;padding:14px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.ac-edif p{margin:0 0 10px;font-size:14px;line-height:1.45;color:#3b3e45}
.ac-edif-lista{display:grid;gap:6px;max-height:248px;overflow-y:auto}
.ac-edif-lista button{appearance:none;cursor:pointer;width:100%;text-align:left;min-height:46px;padding:10px 12px;border-radius:12px;border:1.5px solid rgba(20,17,17,.12);background:#fff;color:var(--tinta);font:600 13.5px/1.35 'Inter',sans-serif}
.ac-edif-lista button:hover{border-color:var(--naranja)}
.ac-edif-lista .ac-edif-otro{color:var(--gris2);font-weight:500}
/* casilla */
.ac-casilla{display:flex;align-items:center;gap:14px;cursor:pointer;user-select:none;padding:4px 0;border-radius:12px}
.ac-casilla input{position:absolute;width:1px;height:1px;opacity:0}
.ac-caja{flex:none;width:28px;height:28px;border-radius:9px;border:2px solid rgba(20,17,17,.25);display:grid;place-items:center;color:transparent;background:#fff;transition:background-color .2s ease,border-color .2s ease}
.ac-casilla input:checked + .ac-caja{background:var(--naranja);border-color:var(--naranja);color:#08090c}
.ac-casilla b{display:block;font-size:15.5px;font-weight:700}
.ac-casilla span span{display:block;font-size:13px;color:var(--gris);margin-top:1px}
/* el gestor de fotos (del CRM, en tema claro) */
.ac-docs{margin:16px -4px 0}
/* hecho */
.ac-ok{display:flex;align-items:center;gap:16px}
.ac-check{flex:none;width:60px;height:60px}
.ac-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:100;stroke-dashoffset:100;animation:ac-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.ac-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:ac-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.ac-check svg{display:block;animation:ac-pop .45s cubic-bezier(.2,1.4,.4,1) .55s both}
.ac-hueco{margin-top:16px;padding:22px 16px;border-radius:18px;border:1.5px dashed rgba(20,17,17,.22);background:var(--crema);text-align:center;font-size:13.5px;line-height:1.5;color:var(--gris)}
.ac-nota{font-size:13px;color:var(--gris);text-align:center;margin:12px 4px 0;line-height:1.55}
/* firma */
.ac-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.ac-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.ac-firma b{display:block;font-size:15px;font-weight:700}
.ac-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.ac-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
/* esqueleto y entradas */
.ac-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:ac-shim 1.3s linear infinite;border-radius:24px}
.ac-spin{animation:ac-rot .8s linear infinite}
.ac-in{animation:ac-up .55s cubic-bezier(.2,.8,.2,1) both}
.ac-in-2{animation-delay:.08s}
.ac-in-3{animation-delay:.16s}
@keyframes ac-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes ac-draw{to{stroke-dashoffset:0}}
@keyframes ac-pop{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes ac-shim{to{background-position:-200% 0}}
@keyframes ac-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.ac-h1{font-size:36px}.ac-h2{font-size:25px}.ac-numero{font-size:34px}.ac-importe{font-size:40px}.ac-mini{padding:0 12px}}
@media (min-width:640px){.ac-dos,.ac-btns2{grid-template-columns:1fr 1fr}.ac-opcs-2{grid-template-columns:1fr 1fr}.ac-elige-par{max-width:320px}.ac-docs{margin:16px 0 0}}
@media (min-width:768px){.ac-col{max-width:600px;padding-top:40px}.ac-card{padding:26px}.ac-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){
  .ac-in,.ac-check svg,.ac-sk,.ac-spin{animation:none}
  .ac-check circle,.ac-check path{animation:none;stroke-dashoffset:0}
  .ac-btn,.ac-opc,.ac-elige{transition:none}
}
`;

/* ── Iconos (trazo, 24×24) ─────────────────────────────────────────────────── */

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoInfo = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Ico>;
const IcoDoc = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
const IcoPin = (p) => <Ico {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></Ico>;
const IcoLupa = (p) => <Ico {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Ico>;
const IcoChat = (p) => <Ico {...p}><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.4A8.4 8.4 0 1 1 20.5 11.6z" /></Ico>;
const IcoFlecha = (p) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;

const Spinner = ({ size = 18 }) => (
    <svg className="ac-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** El check que se DIBUJA: primero el círculo, luego la palomita. */
const CheckDibujado = () => (
    <div className="ac-check">
        <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
            <circle cx="30" cy="30" r="26.5" pathLength="100" />
            <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
        </svg>
    </div>
);

/** «412,60 €» con los céntimos pequeños. */
function Importe({ n }) {
    const [ent, dec] = fmtEur(n).replace(' €', '').split(',');
    return <span className="ac-display ac-importe">{ent}<small>,{dec} €</small></span>;
}

/* ── Piezas ────────────────────────────────────────────────────────────────── */

function Marco({ numero, children }) {
    return (
        <div className="ac">
            <style>{CSS}</style>
            <div className="ac-filete-top" />
            <div className="ac-halo" />
            <main className="ac-col">
                <header className="ac-head ac-in">
                    <img className="ac-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="ac-exp">{numero}</span>}
                </header>
                {children}
                <footer>
                    <div className="ac-firma">
                        <img className="ac-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                        <div>
                            <b>Fran Moya</b>
                            <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                        </div>
                    </div>
                    <p className="ac-pie">BROKERGY · Ingeniería Energética</p>
                </footer>
            </main>
        </div>
    );
}

function Aviso({ tono = 'ambar', icono, children, className = '', role }) {
    const Icono = icono || (tono === 'ok' ? IcoCheck : IcoAlerta);
    return (
        <div className={`ac-aviso ac-aviso-${tono} ${className}`} role={role}>
            <span className="ac-ico-tile"><Icono size={20} /></span>
            <div>{children}</div>
        </div>
    );
}

function BotonWhatsapp({ texto }) {
    return (
        <a className="ac-btn ac-btn-sec ac-mt" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">
            <IcoChat size={19} /> Escríbenos por WhatsApp
        </a>
    );
}

function Campo({ id, label, req, value, onChange, type = 'text', upper = false, placeholder, className = '' }) {
    return (
        <div className={className}>
            <label className="ac-k" htmlFor={id}>{label}{req && <i> *</i>}</label>
            <input id={id} name={id} type={type} required={req} value={value || ''} placeholder={placeholder}
                onChange={e => onChange(id, e.target.value)}
                className={`ac-input ${upper ? 'uppercase' : ''} ${type === 'email' ? 'no-uppercase' : ''}`} />
        </div>
    );
}

/** Pregunta de opciones: tarjetas pulsables, una respuesta. */
function Pregunta({ titulo, opciones, valor, onElegir, dosColumnas = true }) {
    return (
        <div className="ac-preg" role="radiogroup" aria-label={titulo}>
            <p className="ac-preg-t">{titulo} <i>*</i></p>
            <div className={`ac-opcs ${dosColumnas ? 'ac-opcs-2' : ''}`}>
                {opciones.map(o => (
                    <button key={o.value} type="button" role="radio" aria-checked={valor === o.value} onClick={() => onElegir(o.value)}
                        className={`ac-opc ${valor === o.value ? 'ac-opc-sel' : ''}`}>
                        <span className="ac-radio">{valor === o.value && <IcoCheck size={14} sw={3} />}</span>
                        <span className="ac-opc-cuerpo">
                            <span className="ac-opc-label">{o.label}</span>
                            {o.sub && <span className="ac-opc-sub">{o.sub}</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function SiNo({ titulo, valor, onElegir }) {
    return (
        <div className="ac-preg" role="radiogroup" aria-label={titulo}>
            <p className="ac-preg-t">{titulo} <i>*</i></p>
            <div className="ac-elige-par">
                {[[true, 'Sí'], [false, 'No']].map(([v, t]) => (
                    <button key={t} type="button" role="radio" aria-checked={valor === v} onClick={() => onElegir(v)}
                        className={`ac-elige ${valor === v ? 'ac-elige-sel' : ''}`}>
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function AceptarOfertaCeeView({ token }) {
    const esDemo = token === DEMO_TOKEN;
    const [loading, setLoading] = useState(true);
    const [oferta, setOferta] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [hecho, setHecho] = useState(null);          // { numeroExpediente, expedienteId, docsToken }
    // Tras aceptar: 'enviando' | { faltaban: [] } cuando ha pulsado terminar.
    const [terminado, setTerminado] = useState(null);
    const [verCondiciones, setVerCondiciones] = useState(false);
    const formRef = useRef(null);
    // Localizar el inmueble: 'gps' | 'catastro' | 'rc' mientras se busca.
    const [localizando, setLocalizando] = useState(null);
    const [avisoInmueble, setAvisoInmueble] = useState(null);       // { tono, texto }
    const [opcionesEdificio, setOpcionesEdificio] = useState(null); // inmuebles de un bloque
    // ¿Vive en el inmueble que se certifica? Es lo normal en un CEE suelto: por
    // defecto sí, y su domicilio no se le vuelve a pedir.
    const [viveAqui, setViveAqui] = useState(true);
    // Climatización: lo que el técnico necesita saber antes de la visita.
    const [cuest, setCuest] = useState(CUESTIONARIO_VACIO);
    const cambiaCuest = (k, v) => setCuest(c => ({ ...c, [k]: v }));
    const faltanC = faltanCuestionario(cuest);
    // Un backend anterior no manda `abre_cee`: entonces todo era un CEE.
    const abreCee = oferta?.abre_cee !== false;

    useEffect(() => {
        const cargar = (data) => {
            setOferta(data);
            const d = data.cliente?.domicilio || {};
            setForm({
                ...data.cliente, ...data.inmueble,
                dom_direccion: d.direccion || '', dom_codigo_postal: d.codigo_postal || '',
                dom_municipio: d.municipio || '', dom_provincia: d.provincia || '',
            });
            // Si ya consta un domicilio y NO es el del inmueble, se enseña.
            const norm = (x) => String(x || '').trim().toUpperCase();
            if (d.direccion && data.inmueble?.direccion && norm(d.direccion) !== norm(data.inmueble.direccion)) setViveAqui(false);
        };
        if (esDemo) {
            cargar(demoOferta(new URLSearchParams(window.location.search).has('sin-cee')));
            setLoading(false);
            return;
        }
        axios.get(`${API}/${token}`)
            .then(({ data }) => cargar(data))
            .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el presupuesto.'))
            .finally(() => setLoading(false));
    }, [token, esDemo]);

    const cambia = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const aplicarPropiedad = (p) => {
        setForm(f => ({ ...f, ...camposDePropiedad(p) }));
        setOpcionesEdificio(null);
        setAvisoInmueble({ tono: 'ok', texto: 'Hemos rellenado la dirección con los datos del Catastro. Compruébala y añade el piso y la puerta si faltan.' });
    };

    /**
     * "Usar mi ubicación": lo mismo que la captación de oportunidades — GPS del
     * móvil → referencia catastral. Si cae en un edificio de varias viviendas, se
     * le pregunta cuál es la suya: elegir por él sería certificar la del vecino.
     */
    const usarUbicacion = () => {
        setAvisoInmueble(null); setOpcionesEdificio(null);
        if (!navigator.geolocation) {
            setAvisoInmueble({ tono: 'error', texto: 'Tu navegador no permite usar la ubicación. Escribe la referencia catastral o la dirección.' });
            return;
        }
        setLocalizando('gps');
        navigator.geolocation.getCurrentPosition(async (pos) => {
            setLocalizando('catastro');
            try {
                const { data } = await axios.post('/api/catastro/reverse-geocode', {
                    lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'gps',
                });
                const lista = data?.isParcela ? (data.dwellings || []) : [];
                if (lista.length > 1) {
                    const orden = [...lista].sort((a, b) => Number(b.isResidential) - Number(a.isResidential));
                    setOpcionesEdificio({ base: data, lista: orden });
                } else if (lista.length === 1) {
                    aplicarPropiedad({ ...data, rc: lista[0].rc, address: lista[0].address || data.address });
                } else {
                    aplicarPropiedad(data);
                }
            } catch (err) {
                const st = err.response?.status;
                setAvisoInmueble({
                    tono: 'error',
                    texto: st === 404 ? 'No hemos encontrado ningún inmueble en tu ubicación. Si no estás en él, escribe la dirección.'
                        : st === 503 ? 'El Catastro está saturado ahora mismo. Inténtalo en unos minutos o escribe la dirección.'
                            : 'No hemos podido identificar el inmueble por tu ubicación. Escribe la dirección.',
                });
            } finally { setLocalizando(null); }
        }, (err) => {
            setLocalizando(null);
            setAvisoInmueble({
                tono: 'error',
                texto: err.code === 1
                    ? 'No has dado permiso para usar tu ubicación. Puedes activarlo en el navegador o escribir la dirección.'
                    : 'No hemos podido obtener tu ubicación. Comprueba que el GPS esté activo o escribe la dirección.',
            });
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };

    /** Con la referencia escrita, trae la dirección del Catastro. */
    const buscarReferencia = async () => {
        setAvisoInmueble(null); setOpcionesEdificio(null); setLocalizando('rc');
        try {
            const r = await traerDireccionCatastral(form.ref_catastral);
            const c = r.campos || {};
            setForm(f => ({
                ...f, ref_catastral: r.rc,
                direccion: c.direccion || r.direccion || f.direccion,
                codigo_postal: c.codigo_postal || f.codigo_postal,
                municipio: capital(r.municipioHint || f.municipio),
                provincia: capital(c.provincia || f.provincia),
            }));
            setAvisoInmueble({ tono: 'ok', texto: 'Dirección traída del Catastro. Compruébala y añade el piso y la puerta si faltan.' });
        } catch (err) {
            setAvisoInmueble({ tono: 'error', texto: err.message });
        } finally { setLocalizando(null); }
    };

    // Sin CEE el inmueble es opcional: si no se ha puesto, el domicilio (el de la
    // factura) se pide aparte.
    const domicilioEsInmueble = viveAqui && (abreCee || !!String(form.direccion || '').trim());

    const aceptar = async (e) => {
        e.preventDefault();
        // Lo que falta se pinta EN VIVO (ver `avisoError`): conforme contesta,
        // la lista se acorta y el aviso se va solo.
        if (abreCee && faltanC.length) { setError(FALTA_CUESTIONARIO); return; }
        setEnviando(true);
        setError(null);
        if (esDemo) {
            setTimeout(() => {
                setHecho({ numeroExpediente: abreCee ? '2026CEE_00' : null, sinExpediente: !abreCee, demo: true });
                setEnviando(false);
                window.scrollTo({ top: 0 });
            }, 700);
            return;
        }
        try {
            const { data } = await axios.post(`${API}/${token}/aceptar`, {
                ...form,
                ref_catastral: limpiarRefCatastral(form.ref_catastral),
                // Con "vivo aquí", su domicilio ES el inmueble.
                domicilio: domicilioEsInmueble
                    ? { direccion: form.direccion, codigo_postal: form.codigo_postal, municipio: form.municipio, provincia: form.provincia }
                    : { direccion: form.dom_direccion, codigo_postal: form.dom_codigo_postal, municipio: form.dom_municipio, provincia: form.dom_provincia },
                ...(abreCee ? { cuestionario: cuest } : {}),
                condiciones_version: abreCee ? CONDICIONES_OFERTA_CEE_VERSION : CONDICIONES_PRESUPUESTO_VERSION,
            });
            setHecho({ numeroExpediente: data.numeroExpediente, expedienteId: data.expedienteId, docsToken: data.docsToken, sinExpediente: !!data.sinExpediente });
            window.scrollTo({ top: 0 });
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar la aceptación. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    /**
     * "He terminado" / "Lo subo más tarde": dispara la confirmación de la
     * aceptación, que lleva el enlace si falta algo por adjuntar.
     */
    const terminar = async () => {
        setTerminado('enviando');
        if (esDemo) { setTimeout(() => setTerminado({ faltaban: [] }), 500); return; }
        try {
            const { data } = await axios.post(`${API}/${token}/terminar`, {});
            setTerminado({ faltaban: data.faltaban || [] });
        } catch {
            setTerminado({ faltaban: [] });
        }
    };

    if (loading) {
        return (
            <Marco>
                <div aria-busy="true" aria-label="Cargando presupuesto">
                    <div className="ac-sk" style={{ height: 22, width: '45%', borderRadius: 8 }} />
                    <div className="ac-sk" style={{ height: 88, marginTop: 12, borderRadius: 14 }} />
                    <div className="ac-sk" style={{ height: 260, marginTop: 22 }} />
                    <div className="ac-sk" style={{ height: 200, marginTop: 14 }} />
                </div>
            </Marco>
        );
    }

    if (!oferta) {
        return (
            <Marco>
                <h1 className="ac-display ac-h1 ac-in">Este enlace no <span className="ac-mark">funciona</span></h1>
                <p className="ac-sub ac-in ac-in-2">{error || 'Este presupuesto no existe.'}</p>
                <section className="ac-card ac-stack ac-in ac-in-3">
                    <p className="ac-txt" style={{ marginTop: 0 }}>Puede que el enlace esté incompleto o que el presupuesto se haya sustituido por otro. Escríbenos y te mandamos el bueno.</p>
                    <BotonWhatsapp texto="Hola, el enlace del presupuesto no me funciona." />
                </section>
            </Marco>
        );
    }

    const conTasas = Array.isArray(oferta.lineas) && oferta.lineas.some(l => l.suplido);
    const pila = String(oferta.cliente?.nombre_razon_social || '').trim().split(/\s+/)[0] || '';
    // Una empresa no se saluda por la primera palabra de su razón social.
    const nombre = oferta.cliente?.apellidos && pila
        ? pila.charAt(0).toLocaleUpperCase('es') + pila.slice(1).toLocaleLowerCase('es') : '';

    const resumen = (
        <section className="ac-card ac-in ac-in-2">
            <div className="ac-filete-fino" />
            <div className="ac-card-head">
                <p className="ac-eyebrow">Tu presupuesto</p>
                {oferta.fecha && <span className="ac-chip">{fmtFecha(oferta.fecha)}</span>}
            </div>
            <p className="ac-concepto">Contratas <b>{oferta.concepto}</b>.</p>
            {!abreCee && Array.isArray(oferta.lineas) && oferta.lineas.length > 0 && (
                <ul className="ac-lineas">
                    {oferta.lineas.map((l, i) => (
                        <li key={i}>
                            <span className="ac-uds">{String(l.uds ?? 1).replace('.', ',')}×</span>
                            <span>
                                {l.descripcion}{l.suplido && <span className="ac-tasa">Tasa</span>}
                                {l.detalle && <small>{l.detalle}</small>}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {oferta.inmueble?.direccion && (
                <p className="ac-donde"><IcoPin size={17} />{[oferta.inmueble.direccion, oferta.inmueble.municipio].filter(Boolean).join(', ')}</p>
            )}
            {oferta.observaciones && (
                <div className="ac-obs">
                    <p className="ac-eyebrow ac-eyebrow-gris">A tener en cuenta</p>
                    <p>{oferta.observaciones}</p>
                </div>
            )}
            <div className="ac-total">
                <span className="ac-total-k"><b>Total</b>{conTasas ? 'IVA y tasas incluidos' : 'IVA incluido'}</span>
                <Importe n={oferta.total} />
            </div>
            <a className="ac-btn ac-btn-sec ac-mt" href={esDemo ? undefined : `${API}/${token}/pdf`} target="_blank" rel="noreferrer">
                <IcoDoc size={19} /> Ver el presupuesto en PDF
            </a>
        </section>
    );

    const demoAviso = esDemo && (
        <div className="ac-demo">
            <IcoInfo size={18} />
            <span><b>Modo prueba</b> · así ve el cliente el presupuesto. No se acepta nada ni se envía ningún mensaje.</span>
        </div>
    );

    if (hecho || oferta.estado === 'ACEPTADA') {
        const num = hecho?.numeroExpediente || oferta.numero_expediente;
        const docs = hecho?.docsToken ? { expedienteId: hecho.expedienteId, token: hecho.docsToken } : oferta.docs;
        const conCee = abreCee && !hecho?.sinExpediente;
        return (
            <Marco numero={oferta.numero}>
                {demoAviso}
                <section className="ac-card ac-in">
                    <div className="ac-filete-fino" />
                    <div className="ac-ok">
                        <CheckDibujado />
                        <h1 className="ac-display ac-h2">{hecho ? <>Presupuesto <span className="ac-mark">aceptado</span></> : 'Este presupuesto ya está aceptado'}</h1>
                    </div>
                    {!hecho && oferta.aceptada_at && (
                        <p className="ac-txt">Lo aceptó <b>{oferta.aceptada_por || 'el cliente'}</b> el {fmtFecha(oferta.aceptada_at)}.</p>
                    )}
                    {num && (
                        <div style={{ marginTop: 18 }}>
                            <p className="ac-eyebrow ac-eyebrow-gris">Tu número de expediente</p>
                            <p className="ac-display ac-numero">{num}</p>
                        </div>
                    )}
                    <p className="ac-txt">
                        {conCee
                            ? 'En los próximos días el técnico certificador se pondrá en contacto contigo para concertar la visita.'
                            : 'Nos ponemos en marcha y te contamos los siguientes pasos. Te hemos enviado la confirmación.'}
                    </p>
                </section>

                {/* ── Las fotos para el certificado, en el mismo sitio ─────────
                    Es el MISMO gestor de documentación que el CAE. Se le pide
                    aquí, con el presupuesto recién aceptado, que es cuando las
                    hace; lo que no suba ahora le llega por enlace. */}
                {(docs || (esDemo && conCee)) && (
                    <section className="ac-card ac-stack ac-in ac-in-2">
                        <p className="ac-eyebrow">Ayúdanos a preparar tu certificado</p>
                        <p className="ac-txt">
                            Fotos de la fachada y de los patios interiores, y si puedes <b>un vídeo recorriendo la casa</b> o los planos.
                            Con ellas el técnico llega a la visita sabiendo lo que va a encontrar.
                        </p>
                        {docs ? (
                            <div className="theme-light ac-docs">
                                <DocsManager mode="token" idOrUuid={docs.expedienteId} token={docs.token} embedded api={API_DOCS_CEE_DIRECTO} />
                            </div>
                        ) : (
                            <div className="ac-hueco">Aquí el cliente sube las fotos y el vídeo: es el gestor de documentación del expediente, que en la prueba no se carga.</div>
                        )}
                        {hecho && !terminado && (
                            <div className="ac-btns2" style={{ marginTop: 18 }}>
                                <button type="button" className="ac-btn ac-btn-pri" onClick={terminar}>
                                    He terminado <IcoFlecha size={19} />
                                </button>
                                <button type="button" className="ac-btn ac-btn-sec" onClick={terminar}>
                                    Lo subo más tarde
                                </button>
                            </div>
                        )}
                        {terminado === 'enviando' && <p className="ac-nota" style={{ display: 'flex', justifyContent: 'center', gap: 8 }}><Spinner size={16} /> Un momento…</p>}
                        {terminado && terminado !== 'enviando' && (
                            <Aviso tono="ok" className="ac-mt" role="status">
                                <p>{terminado.faltaban?.length
                                    ? 'Te hemos enviado un enlace para que subas lo que falte cuando puedas.'
                                    : '¡Gracias! Ya tenemos lo necesario.'}</p>
                            </Aviso>
                        )}
                        {!hecho && (
                            <p className="ac-nota">Puedes volver a este enlace cuando quieras para añadir más.</p>
                        )}
                    </section>
                )}
            </Marco>
        );
    }

    if (oferta.estado === 'ANULADA' || oferta.estado === 'RECHAZADA') {
        return (
            <Marco numero={oferta.numero}>
                <h1 className="ac-display ac-h1 ac-in">Este presupuesto está <span className="ac-mark">cerrado</span></h1>
                <div className="ac-stack">
                    <Aviso className="ac-in">
                        <p>
                            {oferta.estado === 'ANULADA' ? 'Este presupuesto ha sido anulado.' : 'Este presupuesto está cerrado.'} Si sigues interesado, ponte en contacto con nosotros y te enviamos uno nuevo.
                        </p>
                    </Aviso>
                    {resumen}
                    <BotonWhatsapp texto={`Hola, me interesa el presupuesto ${oferta.numero || ''}, que aparece cerrado.`} />
                </div>
            </Marco>
        );
    }

    const conDireccion = !!String(form.direccion || '').trim();
    const avisoError = error === FALTA_CUESTIONARIO
        ? (faltanC.length ? `Falta por contestar: ${faltanC.join(', ')}.` : null)
        : error;

    return (
        <Marco numero={oferta.numero}>
            {demoAviso}
            {nombre && <p className="ac-hola ac-in">Hola, <b>{nombre}</b></p>}
            <h1 className="ac-display ac-h1 ac-in">
                {abreCee ? <>Tu certificado, a un <span className="ac-mark">paso</span></> : <>Tu presupuesto, a un <span className="ac-mark">paso</span></>}
            </h1>
            <p className="ac-sub ac-in ac-in-2">Revisa y completa tus datos para aceptar el presupuesto.</p>

            <div className="ac-stack">
                {resumen}

                <form ref={formRef} onSubmit={aceptar} className="ac-stack" style={{ marginTop: 14 }}>
                    {/* ── Tus datos ─────────────────────────────────────────── */}
                    <section className="ac-card ac-in ac-in-3">
                        <p className="ac-eyebrow">Tus datos</p>
                        <div className="ac-campos">
                            <div className="ac-dos">
                                <Campo id="nombre_razon_social" label="Nombre / Razón social" req value={form.nombre_razon_social} onChange={cambia} />
                                <Campo id="apellidos" label="Apellidos" value={form.apellidos} onChange={cambia} />
                            </div>
                            <Campo id="dni_cif" label="DNI / CIF" req upper value={form.dni_cif} onChange={cambia} />
                            <div className="ac-dos">
                                <Campo id="email" label="Email" req type="email" value={form.email} onChange={cambia} />
                                <Campo id="telefono" label="Teléfono" req type="tel" value={form.telefono} onChange={cambia} />
                            </div>
                        </div>
                    </section>

                    {/* ── El inmueble ─────────────────────────────────────────
                        Siempre a la vista y relleno con lo que ya tengamos: el
                        Catastro no da el piso ni la puerta, y quien mejor sabe cuál
                        es su vivienda es él. */}
                    <section className="ac-card">
                        <p className="ac-eyebrow">{abreCee ? 'El inmueble que se certifica' : 'El inmueble o la instalación'}</p>
                        <p className="ac-txt">{abreCee
                            ? 'La vivienda o local del certificado, que puede no ser tu domicilio.'
                            : 'Dónde se hace el trabajo, si es un inmueble concreto. Opcional.'}</p>

                        <div className="ac-campos">
                            <div>
                                <label className="ac-k" htmlFor="ref_catastral">Referencia catastral</label>
                                <div className="ac-fila">
                                    <input id="ref_catastral" value={form.ref_catastral || ''}
                                        onChange={e => cambia('ref_catastral', e.target.value.toUpperCase())}
                                        placeholder="Viene en el recibo del IBI"
                                        className="ac-input ac-input-mono uppercase" />
                                    <button type="button" className="ac-mini" onClick={buscarReferencia}
                                        disabled={!!localizando || !refCatastralValida(form.ref_catastral)}>
                                        {localizando === 'rc' ? <Spinner size={16} /> : <IcoLupa size={17} />}
                                        {localizando === 'rc' ? 'Buscando' : 'Buscar'}
                                    </button>
                                </div>
                                <p className="ac-ayuda">20 caracteres. Con ella traemos la dirección del Catastro.</p>
                            </div>
                        </div>

                        <p className="ac-o">o</p>
                        <button type="button" className="ac-btn ac-btn-sec" onClick={usarUbicacion} disabled={!!localizando}>
                            {localizando === 'gps' || localizando === 'catastro' ? <Spinner size={18} /> : <IcoPin size={19} />}
                            {localizando === 'gps' ? 'Obteniendo tu ubicación…'
                                : localizando === 'catastro' ? 'Buscando en el Catastro…'
                                    : 'Usar mi ubicación'}
                        </button>
                        <p className="ac-ayuda" style={{ textAlign: 'center' }}>Si estás ahora en el inmueble.</p>

                        {opcionesEdificio && (
                            <div className="ac-edif">
                                <p>Estás en un edificio con varios inmuebles. <b>¿Cuál es el tuyo?</b></p>
                                <div className="ac-edif-lista">
                                    {opcionesEdificio.lista.map(d => (
                                        <button key={d.rc} type="button" className={d.isResidential ? '' : 'ac-edif-otro'}
                                            onClick={() => aplicarPropiedad({ ...opcionesEdificio.base, rc: d.rc, address: d.address || opcionesEdificio.base.address })}>
                                            {rotuloInmueble(d)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {avisoInmueble && (
                            <Aviso tono={avisoInmueble.tono === 'error' ? 'ambar' : 'ok'} className="ac-mt" role="status">
                                <p>{avisoInmueble.texto}</p>
                            </Aviso>
                        )}

                        <div className="ac-campos" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--linea)' }}>
                            <Campo id="direccion" label="Dirección (calle, número, piso y puerta)" req={abreCee} value={form.direccion} onChange={cambia} />
                            <div className="ac-dos">
                                <Campo id="codigo_postal" label="Código postal" req={abreCee} value={form.codigo_postal} onChange={cambia} />
                                <Campo id="municipio" label="Municipio" req={abreCee} value={form.municipio} onChange={cambia} />
                            </div>
                            <Campo id="provincia" label="Provincia" value={form.provincia} onChange={cambia} />
                        </div>
                    </section>

                    {/* ── Climatización ───────────────────────────────────────
                        Lo que el técnico necesita saber antes de la visita, con
                        las mismas opciones que el formulario de captación. */}
                    {abreCee && (
                        <section className="ac-card">
                            <p className="ac-eyebrow">Calefacción y agua caliente</p>
                            <p className="ac-txt">Con esto el técnico llega a la visita sabiendo qué va a encontrar.</p>
                            <Pregunta titulo="¿Con qué se calienta la vivienda?" opciones={CALEFACCION} valor={cuest.calefaccion} onElegir={v => cambiaCuest('calefaccion', v)} />
                            <Pregunta titulo="¿Con qué se calienta el agua?" opciones={ACS} valor={cuest.acs}
                                onElegir={v => setCuest(c => ({ ...c, acs: v, termo_extra: v === 'misma_caldera' ? c.termo_extra : null }))} />
                            {cuest.acs === 'misma_caldera' && (
                                <div className="ac-subcaja">
                                    <SiNo titulo="Además de la caldera, ¿tienes un termo eléctrico para el agua caliente?" valor={cuest.termo_extra} onElegir={v => cambiaCuest('termo_extra', v)} />
                                </div>
                            )}
                            <SiNo titulo="¿Tienes aire acondicionado?" valor={cuest.aire_acondicionado}
                                onElegir={v => setCuest(c => ({ ...c, aire_acondicionado: v, num_aires: v ? c.num_aires : '' }))} />
                            {cuest.aire_acondicionado === true && (
                                <div className="ac-subcaja">
                                    <label className="ac-k" htmlFor="num_aires">¿Cuántos aparatos? <i>*</i></label>
                                    <input id="num_aires" type="number" inputMode="numeric" min="1" max="99" value={cuest.num_aires}
                                        onChange={e => cambiaCuest('num_aires', e.target.value)} className="ac-input ac-input-corto" placeholder="Ej. 2" />
                                </div>
                            )}
                            <Pregunta titulo="¿Tienes placas solares fotovoltaicas?" opciones={PLACAS} valor={cuest.placas} onElegir={v => cambiaCuest('placas', v)} dosColumnas={false} />
                        </section>
                    )}

                    {/* ── Su domicilio ────────────────────────────────────────── */}
                    <section className="ac-card">
                        {(abreCee || conDireccion) ? (
                            <label className="ac-casilla">
                                <input type="checkbox" checked={viveAqui} onChange={e => setViveAqui(e.target.checked)} />
                                <span className="ac-caja"><IcoCheck size={17} sw={3} /></span>
                                <span><b>Vivo en este inmueble</b><span>Es mi domicilio, el que irá en la factura.</span></span>
                            </label>
                        ) : (
                            <>
                                <p className="ac-eyebrow">Tu domicilio</p>
                                <p className="ac-txt">El que irá en la factura.</p>
                            </>
                        )}
                        {!domicilioEsInmueble && (
                            <div className="ac-campos" style={(abreCee || conDireccion) ? { marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--linea)' } : undefined}>
                                <Campo id="dom_direccion" label={(abreCee || conDireccion) ? 'Tu domicilio' : 'Dirección (calle, número, piso y puerta)'} req value={form.dom_direccion} onChange={cambia} />
                                <div className="ac-dos">
                                    <Campo id="dom_codigo_postal" label="Código postal" req value={form.dom_codigo_postal} onChange={cambia} />
                                    <Campo id="dom_municipio" label="Municipio" req value={form.dom_municipio} onChange={cambia} />
                                </div>
                                <Campo id="dom_provincia" label="Provincia" value={form.dom_provincia} onChange={cambia} />
                            </div>
                        )}
                    </section>

                    {/* ── Aceptar ─────────────────────────────────────────────── */}
                    <div>
                        {avisoError && <Aviso role="alert" className="ac-mt"><p>{avisoError}</p></Aviso>}
                        <button type="submit" className="ac-btn ac-btn-pri" disabled={enviando} style={{ marginTop: 16 }}>
                            {enviando ? <><Spinner /> Procesando…</> : <>Aceptar el presupuesto · {fmtEur(oferta.total)}</>}
                        </button>
                        <p className="ac-nota">
                            Al pulsar «Aceptar el presupuesto» aceptas las{' '}
                            <button type="button" className="ac-link" onClick={() => setVerCondiciones(true)}>
                                condiciones y autorizaciones
                            </button>
                            {abreCee
                                ? ' del presupuesto, incluidas la visita del técnico, la presentación del certificado en el registro y el tratamiento de tus datos personales.'
                                : ' del presupuesto, incluidos los trámites en tu nombre y el tratamiento de tus datos personales.'}
                        </p>
                    </div>
                </form>
            </div>

            <CondicionesAceptacionModal
                open={verCondiciones}
                onClose={() => setVerCondiciones(false)}
                enviando={enviando}
                condiciones={abreCee ? CONDICIONES_OFERTA_CEE : CONDICIONES_PRESUPUESTO}
                version={abreCee ? CONDICIONES_OFERTA_CEE_VERSION : CONDICIONES_PRESUPUESTO_VERSION}
                subtitulo="Lo que aceptas al confirmar el presupuesto"
                aceptarLabel="Aceptar el presupuesto"
                tema="carta"
                onAceptar={() => { setVerCondiciones(false); formRef.current?.requestSubmit(); }}
            />
        </Marco>
    );
}

export default AceptarOfertaCeeView;
