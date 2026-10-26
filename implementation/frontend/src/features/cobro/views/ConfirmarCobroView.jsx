/**
 * ConfirmarCobroView — /cobro/:expedienteId?token=
 *
 * Lo que ve el CLIENTE cuando su ayuda está concedida y vamos a ingresársela.
 * Confirma sus datos de cobro y, de paso, contesta tres preguntas de venta
 * cruzada. Sustituye al formulario externo de Tally.
 *
 * Registro «carta de pago» (24/10/2026), el MISMO de «¿Te ha llegado?»
 * (RecibidoCobroView), que es la pantalla que viene después: crema, tarjetas
 * blancas, Antonio para cifras y titulares, naranja para la acción, verde para lo
 * conseguido y UNA palabra en lima. Avisos en ámbar, nunca en rojo. Sin emojis:
 * iconos SVG de trazo. Prefijo `.cc-`. Solo cambió el aspecto: lo que se pregunta,
 * lo que se valida y lo que se envía es lo de antes.
 *
 * REGLA — la API se pide en RELATIVO. Esta pantalla la abre el cliente CON EL
 * MÓVIL desde un WhatsApp, así que tiene que funcionar entrando por la IP de la
 * LAN en desarrollo (en el teléfono, `localhost` es el teléfono). Mismo motivo
 * que FirmaMovilView y FirmarAnexosView.
 *
 * REGLA — los tres bloques comerciales son OPCIONALES y se puede pasar de largo.
 * El cliente ha venido a cobrar; convertir la venta cruzada en un peaje es la
 * forma de que abandone antes de confirmar el IBAN, que es lo que de verdad
 * necesitamos. Por eso van ANTES los opcionales y AL FINAL lo obligatorio: si se
 * pusieran al revés, cerraría la pestaña en cuanto acabara lo suyo.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { normalizarIban, ibanEnBloques, bloquesPara, bloquePago, textoEsfuerzo, eurEs } from '../logic/cobroForm';

const API = '/api/public';

// /cobro/demo — el formulario con datos de MENTIRA, para verlo como el cliente sin
// tocar ningún expediente (mismo criterio que /firma/demo). No llama a la API: ni
// lee ni guarda nada. Las preguntas salen de la MISMA fuente (`bloquesPara`).
const DEMO = 'demo';
const DEMO_BONO = 1840;
const vistaDemo = () => {
    const pago = bloquePago(250, DEMO_BONO);
    return {
    numero_expediente: '26RES060_000',
    saludo: 'María',
    bloques: bloquesPara({ clienteAsumeCoste: true, costeGestion: 250, solarPrevio: 'no', respuestas: {}, bono: DEMO_BONO }),
    importe: {
        bono: DEMO_BONO,
        honorarios_sin_iva: pago.importe_sin_iva, honorarios_total: pago.importe_total,
        recibe_descuento: pago.recibe_descuento, recibe_factura: pago.recibe_factura,
    },
    esfuerzo: textoEsfuerzo(2),
    cliente: {
        nombre_razon_social: 'María', apellidos: 'Ejemplo Demo', dni: '00000000T',
        email: 'maria@ejemplo.es', telefono: '600000000', iban: 'ES9121000418450200051332',
    },
    justificante_subido: false,
    requiere_justificante_sin_iban: false,
    completado_at: null,
    };
};

/** «3.030,62 €» → ['3.030', ',62 €']: los euros en grande y los céntimos más pequeños. */
const partesImporte = (n) => {
    const t = eurEs(n);
    const i = t.lastIndexOf(',');
    return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i)];
};

/* ── Estilos: el registro de la carta de pago ─────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.cc{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.cc *{box-sizing:border-box}
.cc-filete-top{height:4px;background:var(--filete)}
.cc-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.cc-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.cc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.cc-logo{height:26px;width:auto;display:block}
.cc-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.cc-hola{font-size:15px;color:var(--gris);margin:0 2px}
.cc-hola b{color:var(--tinta);font-weight:600}
.cc-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.cc-h1{font-size:42px;line-height:1.1;margin:6px 2px 0}
.cc-h2{font-size:28px;line-height:1.1;margin:0}
.cc-mark{background:var(--lima);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.cc-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.cc-sub b{color:var(--tinta);font-weight:600}
.cc-txt{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.cc-txt b,.cc-txt strong{color:var(--tinta);font-weight:700}
.cc-stack{margin-top:22px}
.cc-stack > * + *{margin-top:14px}
.cc-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:22px 20px}
.cc-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.cc-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0}
.cc-eyebrow-verde{color:var(--verde-txt)}
.cc-eyebrow-gris{color:var(--gris)}
.cc-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.cc-chip-verde{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.cc-chip-ambar{background:#fff1d1;color:#7a4b00}
.cc-importe{font-size:72px;line-height:.95;margin:14px 0 0;display:flex;align-items:baseline;white-space:nowrap}
.cc-cent{font-size:34px;margin-left:2px}
.cc-meta{margin:12px 0 0;font-size:14.5px;color:var(--gris);line-height:1.5}
.cc-meta b{color:var(--tinta);font-weight:700}
.cc-meta .cc-verde{color:var(--verde-txt)}
.cc-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.cc-tile-verde{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.cc-tile-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.cc-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.cc-extra{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding:14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:14px;line-height:1.5;color:#3b3e45}
.cc-extra b{color:var(--tinta);font-weight:700}
.cc-aviso{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.cc-aviso b{font-weight:700}
.cc-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.cc-aviso-ambar .cc-ico-tile{background:#ffe9bd;color:#7a4b00}
.cc-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.cc-aviso-ok .cc-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
/* botones */
.cc-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,filter .2s ease,border-color .2s ease}
.cc-btn:active{transform:scale(.98)}
.cc-btn:disabled{opacity:.7;cursor:default;transform:none}
.cc-btn:focus-visible,.cc-link:focus-visible,.cc-opc:focus-visible,.cc-atras:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.cc-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75);margin-top:20px}
.cc-btn-pri:hover{filter:brightness(1.04)}
.cc-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.cc-btn-sec:hover{border-color:rgba(20,17,17,.3)}
.cc-btn-si{background:rgba(177,209,62,.22);border-color:rgba(177,209,62,.7);color:var(--verde-txt)}
.cc-btn-otra{background:#fff7e6;border-color:#f0c56b;color:#7a4b00}
.cc-btns2{display:grid;gap:10px;margin-top:16px}
.cc-link{appearance:none;background:none;border:0;cursor:pointer;min-height:44px;padding:0 2px;font:700 14px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px;display:inline-flex;align-items:center;gap:6px}
.cc-link-centro{display:flex;margin:12px auto 0;color:var(--gris)}
.cc-atras{appearance:none;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 4px 0 0;margin:-6px 0 10px;font:700 13.5px 'Inter',sans-serif;color:var(--gris);border-radius:8px}
.cc-atras:hover{color:var(--tinta)}
/* progreso */
.cc-progreso{margin:0 2px 16px}
.cc-pasos{display:flex;gap:5px}
.cc-paso{flex:1;height:8px;border-radius:999px;background:#eeece8;overflow:hidden;position:relative}
.cc-paso i{position:absolute;inset:0;background:var(--filete);transform-origin:left;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.cc-paso-n{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris2);margin:8px 0 0;text-align:right}
/* opciones */
.cc-opcs{display:grid;gap:10px;margin-top:18px}
.cc-opc{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:flex-start;gap:14px;padding:16px;min-height:64px;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid rgba(20,17,17,.12);border-radius:18px;color:var(--tinta);font:inherit;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease,transform .12s ease}
.cc-opc:hover{border-color:rgba(20,17,17,.28)}
.cc-opc:active{transform:scale(.99)}
.cc-opc-sel{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
.cc-opc-sel:hover{border-color:var(--naranja)}
.cc-opc-des:not(.cc-opc-sel){background:#fcfbf9}
.cc-opc-cuerpo{flex:1;min-width:0}
.cc-opc-label{display:block;font-size:15.5px;font-weight:700;line-height:1.35}
.cc-opc-des .cc-opc-label{color:var(--gris)}
.cc-opc-sub{display:block;font-size:13.5px;line-height:1.45;color:var(--gris);margin-top:4px}
.cc-opc-des .cc-opc-sub{color:#7a4b00}
.cc-opc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cc-opc-chips:empty{display:none}
.cc-radio{flex:none;width:24px;height:24px;margin-top:1px;border-radius:999px;border:2px solid rgba(20,17,17,.22);display:grid;place-items:center;color:#08090c;transition:background-color .2s ease,border-color .2s ease}
.cc-opc-sel .cc-radio{background:var(--naranja);border-color:var(--naranja)}
/* cuenta y campos */
.cc-cuenta{margin-top:20px;padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.cc-k{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:0 2px 8px}
.cc-iban{font:700 18px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--tinta);letter-spacing:.01em;margin:0}
.cc-iban span{display:inline-block;margin-right:.45em;white-space:nowrap}
.cc-ayuda{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:7px 2px 0}
.cc-campos{display:grid;gap:16px;margin-top:16px}
.cc-dos{display:grid;gap:16px}
.cc-sec{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris);margin:26px 2px 0;padding-top:20px;border-top:1px solid var(--linea)}
.cc-input{appearance:none;display:block;width:100%;height:54px;padding:0 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:500 16px/1 'Inter',sans-serif;transition:border-color .2s ease,box-shadow .2s ease}
.cc-input::placeholder{color:#a3a5aa}
.cc-input:hover{border-color:rgba(20,17,17,.28)}
.cc-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.cc-input-err{border-color:#e0a63a}
.cc-input-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em}
.cc-just{margin-top:16px}
.cc-just .cc-btn{margin-top:12px;background:#fff}
.cc-file-ok{border-color:rgba(177,209,62,.7)!important;background:rgba(177,209,62,.14)!important;color:var(--verde-txt)!important}
.cc-file-ok span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-nota{font-size:12.5px;color:var(--gris2);text-align:center;margin:12px 0 0;line-height:1.5}
/* hecho */
.cc-ok{display:flex;align-items:center;gap:16px}
.cc-check{flex:none;width:60px;height:60px}
.cc-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:cc-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.cc-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:cc-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.cc-check svg{display:block;animation:cc-pop .45s cubic-bezier(.2,1.4,.4,1) .55s both}
.cc-dl{margin:16px 0 0;padding:0}
.cc-dl > div{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:11px 0;border-top:1px solid var(--linea)}
.cc-dl dt{font-size:13.5px;color:var(--gris)}
.cc-dl dd{margin:0;font-size:14.5px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
/* firma */
.cc-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.cc-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.cc-firma b{display:block;font-size:15px;font-weight:700}
.cc-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.cc-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
/* esqueleto y entradas */
.cc-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:cc-shim 1.3s linear infinite;border-radius:24px}
.cc-spin{animation:cc-rot .8s linear infinite}
.cc-in{animation:cc-up .55s cubic-bezier(.2,.8,.2,1) both}
.cc-in-2{animation-delay:.08s}
.cc-in-3{animation-delay:.16s}
.cc-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes cc-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes cc-draw{to{stroke-dashoffset:0}}
@keyframes cc-pop{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes cc-shim{to{background-position:-200% 0}}
@keyframes cc-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.cc-importe{font-size:60px}.cc-cent{font-size:28px}.cc-h1{font-size:36px}.cc-h2{font-size:25px}.cc-iban{font-size:16px}}
@media (min-width:640px){.cc-dos{grid-template-columns:1fr 1fr}.cc-btns2{grid-template-columns:1fr 1fr}}
@media (min-width:768px){.cc-col{max-width:560px;padding-top:40px}.cc-card{padding:26px}.cc-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){
  .cc-in,.cc-check svg,.cc-sk,.cc-spin{animation:none}
  .cc-check circle,.cc-check path{animation:none;stroke-dashoffset:0}
  .cc-btn,.cc-opc,.cc-paso i{transition:none}
}
`;

/* ── Iconos (trazo, 24×24) ─────────────────────────────────────────────────── */

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoFlecha = (p) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;
const IcoAtras = (p) => <Ico {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Ico>;
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoCandado = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Ico>;
const IcoEscudo = (p) => <Ico {...p}><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.2-4.4" /></Ico>;
const IcoRayo = (p) => <Ico {...p}><path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z" /></Ico>;
const IcoSol = (p) => <Ico {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" /></Ico>;
const IcoDoc = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
const IcoTarjeta = (p) => <Ico {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></Ico>;
const IcoBanco = (p) => <Ico {...p}><path d="M3 9.5L12 4l9 5.5" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20.5h17" /></Ico>;
const IcoClip = (p) => <Ico {...p}><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.8 7" /></Ico>;
const IcoRegalo = (p) => <Ico {...p}><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5C10.5 5 7 4.5 7 6.5s3 2 5 2zM12 8.5c1.5-3.5 5-4 5-2s-3 2-5 2z" /></Ico>;
const IcoRecibo = (p) => <Ico {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Ico>;
const IcoTijera = (p) => <Ico {...p}><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8l12 10M8 16L20 6" /></Ico>;
const IcoInfo = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Ico>;
const ICONO_BLOQUE = { tarifa: IcoRayo, solar: IcoSol, fiscalidad: IcoDoc, forma_pago: IcoTarjeta };

const Spinner = ({ size = 18 }) => (
    <svg className="cc-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** El check que se DIBUJA: primero el círculo, luego la palomita (CSS, sin librerías). */
const CheckDibujado = () => (
    <div className="cc-check">
        <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
            <circle cx="30" cy="30" r="26.5" pathLength="100" />
            <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
        </svg>
    </div>
);

/* ── Piezas ────────────────────────────────────────────────────────────────── */

function Marco({ numero, children }) {
    return (
        <div className="cc">
            <style>{CSS}</style>
            <div className="cc-filete-top" />
            <div className="cc-halo" />
            <main className="cc-col">
                <header className="cc-head cc-in">
                    <img className="cc-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="cc-exp">{numero}</span>}
                </header>
                {children}
                <Firma />
            </main>
        </div>
    );
}

function Firma() {
    return (
        <footer>
            <div className="cc-firma">
                <img className="cc-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                <div>
                    <b>Fran Moya</b>
                    <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                </div>
            </div>
            <p className="cc-pie">BROKERGY · Ingeniería Energética</p>
        </footer>
    );
}

/** El importe con los céntimos más pequeños, como en la carta de pago. */
function Importe({ valor, className = '' }) {
    const [euros, cent] = partesImporte(valor);
    return (
        <div className={`cc-display cc-importe ${className}`} aria-label={eurEs(valor)}>
            <span>{euros}</span><span className="cc-cent">{cent}</span>
        </div>
    );
}

function Iban({ valor }) {
    return (
        <p className="cc-iban">
            {ibanEnBloques(valor).split(' ').map((b, i) => <span key={i}>{b}</span>)}
        </p>
    );
}

/**
 * Opción grande y pulsable. Objetivo táctil holgado: esto se usa con el pulgar.
 *
 * `desaconsejada` no la bloquea —es una elección legítima del cliente— pero la
 * enseña como lo que es: se apaga, avisa de la consecuencia en la propia chapa y
 * el motivo va en ámbar. Dos opciones pintadas igual se leen como equivalentes, y
 * ésta le cuesta dinero y le retrasa el cobro.
 */
function Opcion({ label, sub, recomendada, desaconsejada, aviso, seleccionada, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={seleccionada}
            className={`cc-opc${seleccionada ? ' cc-opc-sel' : ''}${desaconsejada ? ' cc-opc-des' : ''}`}
        >
            <span className="cc-opc-cuerpo">
                <span className="cc-opc-label">{label}</span>
                {sub && <span className="cc-opc-sub">{sub}</span>}
                <span className="cc-opc-chips">
                    {recomendada && <span className="cc-chip cc-chip-verde"><IcoCheck size={13} sw={3} /> Recomendado</span>}
                    {aviso && <span className="cc-chip cc-chip-ambar"><IcoAlerta size={13} sw={2.4} /> {aviso}</span>}
                </span>
            </span>
            <span className="cc-radio">{seleccionada && <IcoCheck size={14} sw={3} />}</span>
        </button>
    );
}

function Campo({ label, value, onChange, type = 'text', placeholder, ayuda, error, autoComplete, mono = false }) {
    const id = `cc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
        <div>
            <label className="cc-k" htmlFor={id}>{label}</label>
            <input
                id={id}
                type={type}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                // 16px reales: por debajo, iOS amplía la página al enfocar el campo.
                className={`cc-input no-uppercase${mono ? ' cc-input-mono' : ''}${error ? ' cc-input-err' : ''}`}
            />
            {ayuda && <p className="cc-ayuda">{ayuda}</p>}
        </div>
    );
}

/** Barra de avance: quien ve cuánto queda, termina. */
function Progreso({ paso, total }) {
    return (
        <div className="cc-progreso cc-in">
            <div className="cc-pasos" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={paso}>
                {Array.from({ length: total }, (_, i) => (
                    <span key={i} className="cc-paso"><i style={{ transform: `scaleX(${i < paso ? 1 : 0})` }} /></span>
                ))}
            </div>
            <p className="cc-paso-n">Paso {paso} de {total}</p>
        </div>
    );
}

// ─── Vista ───────────────────────────────────────────────────────────────────

export function ConfirmarCobroView({ expedienteId, token }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [paso, setPaso] = useState(0);          // 0 = portada · 1..N bloques · N+1 datos
    const [respuestas, setRespuestas] = useState({});
    const [datos, setDatos] = useState(null);
    const [justificante, setJustificante] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [hecho, setHecho] = useState(false);
    // ¿La cuenta que tenemos es la buena? null = aún no lo ha dicho · 'si' · 'otra'.
    // Es la pregunta por la que se le ha escrito, así que se contesta EXPLÍCITAMENTE:
    // un campo relleno que se deja como está no es una confirmación, es un descuido
    // que no se distingue de ella.
    const [cuentaOk, setCuentaOk] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        const aplicar = (d) => {
            setInfo(d);
            setDatos(d.cliente);
            const previas = {};
            (d.bloques || []).forEach(b => { if (b.valor != null) previas[b.id] = b.valor; });
            setRespuestas(previas);
            if (d.completado_at) setHecho(true);
        };
        if (expedienteId === DEMO) { aplicar(vistaDemo()); return; }
        axios.get(`${API}/cobro/${expedienteId}`, { params: { token } })
            .then(r => aplicar(r.data))
            .catch(e => setLoadError(e.response?.data?.error || 'No hemos podido abrir tu enlace.'));
    }, [expedienteId, token]);

    const bloques = info?.bloques || [];
    const totalPasos = bloques.length + 1;

    // El IBAN se compara sin espacios: el cliente lo escribe como se lo enseña su
    // banco y el que consta viene de otro formulario. Cambiar el formato no es
    // cambiar de cuenta, y pedirle el justificante por eso sería absurdo.
    const ibanOriginal = normalizarIban(info?.cliente?.iban);
    const ibanCambiado = useMemo(
        () => !!ibanOriginal && normalizarIban(datos?.iban) !== ibanOriginal,
        [datos?.iban, ibanOriginal]
    );
    // REGLA — un justificante ANTERIOR no vale para una cuenta NUEVA. Acredita la
    // que ya teníamos, que es justo la que el cliente está cambiando: darlo por bueno
    // sería ingresar en una cuenta sin comprobar de quién es. (Y el backend lo
    // rechazaría igual, dejando al cliente ante un error que no puede entender.)
    // Y si NO teníamos ninguna cuenta y tampoco justificante, la que escriba hay que
    // acreditarla igual (convenio firmado sin IBAN).
    const sinCuentaPrevia = !ibanOriginal;
    const necesitaJustificante = ibanCambiado || (sinCuentaPrevia && !!info?.requiere_justificante_sin_iban);
    const formaPago = respuestas.forma_pago || null;
    const costePago = (info?.bloques || []).find(b => b.id === 'forma_pago') || null;
    const eur = eurEs;
    // Lo que se le ingresa: la ayuda VERIFICADA (la manda el servidor; sin ella no
    // se enseña ninguna cifra) menos los honorarios si elige descontarlos.
    const importe = info?.importe || null;
    const recibes = importe
        ? (formaPago === 'factura' ? importe.recibe_factura
            : formaPago === 'descuento' ? importe.recibe_descuento
                : (importe.honorarios_sin_iva == null ? importe.bono : null))
        : null;

    const responder = (bloqueId, valor) => {
        setRespuestas(p => ({ ...p, [bloqueId]: valor }));
        // Auto-avance, como en el formulario que sustituye: al elegir ya está
        // contestado y un "siguiente" de más es una pulsación que no aporta.
        setTimeout(() => { setPaso(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 220);
    };

    const avanzar = (n) => { setPaso(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    const enviar = async () => {
        setError(null);
        const falta = ['nombre_razon_social', 'dni', 'email', 'telefono'].find(k => !String(datos?.[k] || '').trim());
        if (falta) return setError('Faltan datos por rellenar.');
        if (ibanOriginal && !cuentaOk) return setError('Dinos si la cuenta que tenemos es la correcta.');
        if (normalizarIban(datos?.iban).length < 20) return setError('El número de cuenta no parece completo.');
        if (necesitaJustificante && !justificante) {
            return setError('Como has cambiado el número de cuenta, necesitamos el justificante de titularidad.');
        }
        if (expedienteId === DEMO) {
            setHecho(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setEnviando(true);
        try {
            const fd = new FormData();
            Object.entries(datos).forEach(([k, v]) => fd.append(k, v ?? ''));
            fd.append('respuestas', JSON.stringify(respuestas));
            if (justificante) fd.append('justificante', justificante);
            await axios.post(`${API}/cobro/${expedienteId}`, fd, { params: { token } });
            setHecho(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            setError(e.response?.data?.error || 'No hemos podido guardar tus datos. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    // ── Estados de carga / error ────────────────────────────────────────────
    if (loadError) {
        return (
            <Marco>
                <div className="cc-card cc-in">
                    <div className="cc-ok">
                        <span className="cc-ico-tile cc-tile-naranja" style={{ width: 48, height: 48, borderRadius: 16 }}><IcoCandado size={22} /></span>
                        <h1 className="cc-display cc-h2">Este enlace no funciona</h1>
                    </div>
                    <p className="cc-txt">{loadError}</p>
                    <div className="cc-extra">
                        <span className="cc-ico-tile cc-tile-crema"><IcoInfo /></span>
                        <div>Escríbenos y te mandamos uno nuevo.</div>
                    </div>
                </div>
            </Marco>
        );
    }
    if (!info) {
        return (
            <Marco>
                <div aria-busy="true">
                    <div className="cc-sk" style={{ height: 120 }} />
                    <div className="cc-sk" style={{ height: 300, marginTop: 14 }} />
                    <span className="cc-sr">Cargando…</span>
                </div>
            </Marco>
        );
    }

    const numero = info.numero_expediente || null;

    if (hecho) {
        return (
            <Marco numero={numero}>
                <div className="cc-card cc-in">
                    <div className="cc-filete-fino" />
                    <div className="cc-ok">
                        <CheckDibujado />
                        <div>
                            <p className="cc-eyebrow cc-eyebrow-verde">Datos confirmados</p>
                            <h1 className="cc-display cc-h2" style={{ marginTop: 6 }}>¡Listo, <span className="cc-mark">gracias</span>!</h1>
                        </div>
                    </div>
                    <p className="cc-txt">
                        Ya tenemos tus datos confirmados. Prepararemos el ingreso y te avisaremos en cuanto salga.
                    </p>
                    {recibes != null && (
                        <>
                            <p className="cc-eyebrow cc-eyebrow-verde" style={{ marginTop: 22 }}>Vas a recibir</p>
                            <Importe valor={recibes} />
                        </>
                    )}
                    {/* REGLA — no se promete fecha de ingreso: depende del pago del
                        Sujeto Obligado. Una fecha inventada aquí es una reclamación
                        dentro de dos semanas. */}
                    <dl className="cc-dl">
                        <div>
                            <dt>Cuenta de ingreso</dt>
                            <dd><Iban valor={datos?.iban} /></dd>
                        </div>
                    </dl>
                    {ibanCambiado && (
                        <div className="cc-aviso cc-aviso-ambar">
                            <span className="cc-ico-tile"><IcoAlerta /></span>
                            <div>Has cambiado la cuenta respecto a la que teníamos. La comprobaremos con el justificante antes de hacer la transferencia.</div>
                        </div>
                    )}
                    {/* Qué pasa ahora con la gestión: la factura retrasa el ingreso, y
                        si no se le dice aquí espera el dinero sin saber que falta un
                        paso suyo. */}
                    {formaPago === 'factura' && costePago && (
                        <div className="cc-aviso cc-aviso-ambar">
                            <span className="cc-ico-tile"><IcoRecibo /></span>
                            <div>
                                Te enviaremos la factura de nuestros honorarios (<b>{eur(costePago.importe_total)}</b>, IVA incluido).
                                En cuanto esté abonada haremos el ingreso de tu ayuda{importe ? <> (<b>{eur(importe.recibe_factura)}</b>)</> : ''}.
                            </div>
                        </div>
                    )}
                    {formaPago === 'descuento' && costePago && (
                        <div className="cc-aviso cc-aviso-ok">
                            <span className="cc-ico-tile"><IcoTijera /></span>
                            <div>
                                Te ingresaremos tu ayuda con nuestros honorarios (<b>{eur(costePago.importe_sin_iva)}</b>) ya descontados. No tienes que hacer nada más.
                            </div>
                        </div>
                    )}
                </div>
            </Marco>
        );
    }

    // ── Portada ─────────────────────────────────────────────────────────────
    if (paso === 0) {
        return (
            <Marco numero={numero}>
                <div className="cc-in">
                    {info.saludo && <p className="cc-hola">Hola, <b>{info.saludo}</b></p>}
                    <h1 className="cc-display cc-h1">Por fin <span className="cc-mark">lo tenemos</span></h1>
                    {/* El esfuerzo, con lo que DE VERDAD pasó en su expediente (lo
                        cuenta el servidor: requerimientos contestados, o el proceso). */}
                    {info.esfuerzo && (
                        <p className="cc-sub">{info.esfuerzo}: el pago de tu ayuda ya nos ha llegado.</p>
                    )}
                </div>

                <div className="cc-stack">
                    {importe && (
                        <div className="cc-card cc-in cc-in-2">
                            <div className="cc-filete-fino" />
                            <p className="cc-eyebrow cc-eyebrow-verde">Tu ayuda</p>
                            <Importe valor={importe.bono} />
                            {importe.honorarios_sin_iva != null && (
                                <p className="cc-meta">
                                    Descontando nuestros honorarios ({eur(importe.honorarios_sin_iva)}) te ingresamos
                                    {' '}<b className="cc-verde">{eur(importe.recibe_descuento)}</b>.
                                    {' '}También puedes pagarlos aparte con factura: lo eliges dentro.
                                </p>
                            )}
                            {importe.honorarios_bonificados != null && (
                                <div className="cc-extra">
                                    <span className="cc-ico-tile cc-tile-verde"><IcoRegalo /></span>
                                    <div>
                                        <b>Un detalle por nuestra parte:</b> no te cobramos nuestros honorarios de
                                        gestión ({eur(importe.honorarios_bonificados)}). Te la ingresamos <b>íntegra</b>.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="cc-card cc-in cc-in-3">
                        <div className="cc-ok" style={{ alignItems: 'flex-start' }}>
                            <span className="cc-ico-tile cc-tile-crema"><IcoEscudo /></span>
                            <p className="cc-txt" style={{ margin: 0 }}>
                                <b>Por seguridad</b>, antes de hacer cualquier transferencia
                                confirmamos contigo que el <b>número de cuenta</b> que tenemos es el correcto.
                            </p>
                        </div>
                        <button type="button" className="cc-btn cc-btn-pri" onClick={() => avanzar(1)}>
                            Empezar <IcoFlecha />
                        </button>
                        <p className="cc-nota">Te llevará menos de un minuto: ya lo tienes casi todo relleno.</p>
                    </div>
                </div>
            </Marco>
        );
    }

    // ── Bloques comerciales ─────────────────────────────────────────────────
    if (paso <= bloques.length) {
        const b = bloques[paso - 1];
        const IcoB = ICONO_BLOQUE[b.id] || IcoInfo;
        return (
            <Marco numero={numero}>
                <Progreso paso={paso} total={totalPasos} />
                <div className="cc-card cc-in" key={b.id}>
                    <button type="button" className="cc-atras" onClick={() => avanzar(paso - 1)}>
                        <IcoAtras size={16} /> Atrás
                    </button>
                    <p className="cc-eyebrow"><IcoB size={15} sw={2.2} /> {b.titulo}</p>
                    <h1 className="cc-display cc-h2" style={{ marginTop: 8 }}>{b.pregunta}</h1>
                    <p className="cc-txt">{b.ayuda}</p>
                    {b.destacado && (
                        <div className="cc-aviso cc-aviso-ok">
                            <span className="cc-ico-tile"><IcoCheck /></span>
                            <div><b>{b.destacado}</b></div>
                        </div>
                    )}

                    {/* Lo que ya nos dijo en la captación viene marcado y se dice: sin
                        avisarlo, parece que el formulario ha elegido por él. */}
                    {b.heredado && respuestas[b.id] && (
                        <div className="cc-extra">
                            <span className="cc-ico-tile cc-tile-crema"><IcoInfo /></span>
                            <div>Esto es lo que nos dijiste cuando empezamos. Si ha cambiado, corrígelo.</div>
                        </div>
                    )}

                    <div className="cc-opcs">
                        {b.opciones.map(o => (
                            <Opcion
                                key={o.value}
                                label={o.label}
                                sub={o.sub}
                                recomendada={o.recomendada}
                                desaconsejada={o.desaconsejada}
                                aviso={o.aviso}
                                seleccionada={respuestas[b.id] === o.value}
                                onClick={() => responder(b.id, o.value)}
                            />
                        ))}
                    </div>

                    {/* La forma de pago SÍ hay que contestarla: de ella depende cómo se
                        liquida. Las tres preguntas comerciales no. */}
                    {b.id !== 'forma_pago' && (
                        <button type="button" className="cc-link cc-link-centro" onClick={() => avanzar(paso + 1)}>
                            Prefiero no contestar <IcoFlecha size={16} />
                        </button>
                    )}
                </div>
            </Marco>
        );
    }

    // ── Datos de cobro ──────────────────────────────────────────────────────
    return (
        <Marco numero={numero}>
            <Progreso paso={totalPasos} total={totalPasos} />
            <div className="cc-card cc-in">
                <button type="button" className="cc-atras" onClick={() => avanzar(paso - 1)}>
                    <IcoAtras size={16} /> Atrás
                </button>
                <p className="cc-eyebrow"><IcoBanco size={15} sw={2.2} /> Datos de cobro</p>
                <h1 className="cc-display cc-h2" style={{ marginTop: 8 }}>Confirma dónde te <span className="cc-mark">ingresamos</span></h1>
                <p className="cc-txt">
                    Son los datos que ya tenemos. Por seguridad, confírmanos la cuenta y corrige lo que haga falta.
                </p>

                {/* LA PREGUNTA por la que se le ha escrito: ¿es ésta tu cuenta?
                    Con cuenta en la ficha se le enseña ENTERA (aquí, detrás del
                    token; en el mensaje iba enmascarada) y se contesta con dos
                    botones. Solo si dice que es otra aparece el campo. */}
                {ibanOriginal ? (
                    <div className="cc-cuenta">
                        <span className="cc-k">La cuenta que tenemos</span>
                        <Iban valor={ibanOriginal} />
                        <p className="cc-ayuda">Es donde te haremos la transferencia. Compruébala con calma.</p>
                        <div className="cc-btns2">
                            <button type="button"
                                aria-pressed={cuentaOk === 'si'}
                                onClick={() => { setCuentaOk('si'); setDatos(d => ({ ...d, iban: ibanOriginal })); setJustificante(null); setError(null); }}
                                className={`cc-btn cc-btn-sec${cuentaOk === 'si' ? ' cc-btn-si' : ''}`}>
                                <IcoCheck size={18} sw={2.6} /> Sí, es correcta
                            </button>
                            <button type="button"
                                aria-pressed={cuentaOk === 'otra'}
                                onClick={() => { setCuentaOk('otra'); setDatos(d => ({ ...d, iban: '' })); setError(null); }}
                                className={`cc-btn cc-btn-sec${cuentaOk === 'otra' ? ' cc-btn-otra' : ''}`}>
                                No, es otra
                            </button>
                        </div>
                        {cuentaOk === 'otra' && (
                            <div style={{ marginTop: 16 }}>
                                <Campo
                                    label="La cuenta correcta (IBAN)"
                                    value={datos?.iban}
                                    onChange={v => setDatos(d => ({ ...d, iban: v }))}
                                    placeholder="ES91 2100 1234 5612 3456 7890"
                                    mono
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="cc-campos">
                        <Campo
                            label="Número de cuenta (IBAN)"
                            value={datos?.iban}
                            onChange={v => setDatos(d => ({ ...d, iban: v }))}
                            placeholder="ES91 2100 1234 5612 3456 7890"
                            ayuda="No tenemos ninguna cuenta tuya: es donde te haremos la transferencia. Compruébala con calma."
                            mono
                        />
                    </div>
                )}

                {/* REGLA — cambiar de cuenta exige justificante. El IBAN que consta
                    va impreso en el convenio que el cliente firmó; cambiarlo sin
                    acreditar la cuenta nueva es el error de ingreso que este
                    formulario viene a evitar. Si repite el que ya teníamos, no se
                    le pide nada. */}
                {necesitaJustificante && (
                    <div className="cc-aviso cc-aviso-ambar cc-just">
                        <span className="cc-ico-tile"><IcoAlerta /></span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <b>{ibanCambiado ? 'Has cambiado el número de cuenta' : 'Justificante de la cuenta'}</b>
                            <div style={{ marginTop: 4 }}>
                                {ibanCambiado && <>Antes teníamos <span style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', overflowWrap: 'anywhere' }}>{ibanEnBloques(ibanOriginal)}</span>.{' '}</>}
                                Para asegurarnos de que el dinero llega a tu cuenta necesitamos un
                                justificante de titularidad <b>{ibanCambiado ? 'de la cuenta nueva' : 'de esa cuenta'}</b>:
                                un recibo o una captura del banco donde se vea tu nombre junto al IBAN.
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*,application/pdf"
                                hidden
                                onChange={e => setJustificante(e.target.files?.[0] || null)}
                            />
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className={`cc-btn cc-btn-sec${justificante ? ' cc-file-ok' : ''}`}
                            >
                                {justificante
                                    ? <><IcoCheck size={18} sw={2.6} /> <span>{justificante.name}</span></>
                                    : <><IcoClip size={18} /> Adjuntar justificante</>}
                            </button>
                        </div>
                    </div>
                )}

                {/* Los datos de contacto van DETRÁS: la cuenta es la pregunta por la
                    que se le ha escrito, y con cinco campos delante quedaba al fondo
                    de la pantalla del móvil, donde no se ve. */}
                <p className="cc-sec">Tus datos</p>
                <div className="cc-campos">
                    <div className="cc-dos">
                        <Campo label="Nombre" value={datos?.nombre_razon_social}
                               onChange={v => setDatos(d => ({ ...d, nombre_razon_social: v }))} autoComplete="given-name" />
                        <Campo label="Apellidos" value={datos?.apellidos}
                               onChange={v => setDatos(d => ({ ...d, apellidos: v }))} autoComplete="family-name" />
                    </div>
                    <Campo label="DNI / NIE" value={datos?.dni}
                           onChange={v => setDatos(d => ({ ...d, dni: v }))} placeholder="12345678A" />
                    <Campo label="Email" type="email" value={datos?.email}
                           onChange={v => setDatos(d => ({ ...d, email: v }))} autoComplete="email" />
                    <Campo label="Teléfono" type="tel" value={datos?.telefono}
                           onChange={v => setDatos(d => ({ ...d, telefono: v }))} autoComplete="tel" />
                </div>

                {error && (
                    <div className="cc-aviso cc-aviso-ambar" role="alert">
                        <span className="cc-ico-tile"><IcoAlerta /></span>
                        <div><b>{error}</b></div>
                    </div>
                )}

                <button type="button" className="cc-btn cc-btn-pri" onClick={enviar} disabled={enviando}>
                    {enviando ? <><Spinner /> Guardando…</> : <>Confirmar mis datos <IcoFlecha /></>}
                </button>
                <p className="cc-nota">Solo usamos estos datos para hacerte el ingreso de tu ayuda.</p>
                <span className="cc-sr" aria-live="polite">{enviando ? 'Guardando' : ''}</span>
            </div>
        </Marco>
    );
}

export default ConfirmarCobroView;
