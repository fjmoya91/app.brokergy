// ─── AceptarPropuestaView.jsx ────────────────────────────────────────────────
// /firma/:id — el cliente acepta la propuesta: repasa sus datos (vienen
// rellenos), contesta tres preguntas de su vivienda (ConfirmarVivienda) y
// acepta. Con el estilo «carta de pago» (regla 164): papel crema, Antonio en
// los titulares, una acción naranja por tarjeta y los avisos en ámbar.
//
// El CSS es el de esta página (prefijo `.fp-`) y lo usan también sus piezas,
// que solo se pintan dentro de ella: ConfirmarVivienda y PropietariosAceptacion.
// El popup de condiciones va portaleado a body y trae su propio tema
// (`tema="carta"`), porque lo comparte la oferta de CEE directo.
//
// Solo cambió el aspecto (24/10/2026): qué se pide, qué se valida y qué se
// envía son lo de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import CondicionesAceptacionModal from '../components/CondicionesAceptacionModal';
import { CONDICIONES_VERSION } from '../logic/condicionesAceptacion';
import { ConfirmarVivienda } from '../components/ConfirmarVivienda';
import { PropietariosAceptacion } from '../components/PropietariosAceptacion';
import {
    propietariosDesdeServidor, propietariosParaEnviar, faltaEnPropietarios,
} from '../logic/propietariosAceptacion';
import {
    CONFIRMACION_VACIA, CONFIRMACION_VERSION, faltanConfirmacion, resumenConfirmacion,
} from '../../expedientes/logic/confirmacionCliente';

// En relativo: en local lo atiende el proxy de Vite, y así la página funciona
// también abierta desde el móvil por la red de casa.
const API_URL = '/api/public';

// /firma/demo — el formulario tal y como lo ve el cliente, con datos de mentira.
// No llama a la API: ni se acepta nada ni sale ningún mensaje. Sirve para
// enseñarlo y para revisarlo sin tocar una propuesta de verdad.
const DEMO_ID = 'demo';
const DEMO_DATOS = {
    nombre_razon_social: 'María',
    apellidos: 'García López',
    dni_cif: '12345678Z',
    email: 'maria.garcia@ejemplo.es',
    telefono: '600 000 000',
    iban: '',
};

// En Android, un fichero elegido desde Google Fotos o Drive es una referencia
// que caduca: con la página abierta un rato, Chrome ya no puede leerlo y la
// petición se corta en el móvil sin llegar al servidor (26RES060_OP323,
// 23/10/2026: «no me deja aceptar»). Se copia en memoria al elegirlo.
async function copiaEnMemoria(file) {
    if (!file) return null;
    const buf = await file.arrayBuffer();
    return new File([buf], file.name, { type: file.type, lastModified: file.lastModified });
}

// El envío no ha llegado al servidor: corte de conexión o un adjunto ilegible.
const MSG_SIN_CONEXION = 'Tu aceptación no ha llegado a enviarse: parece que se ha cortado la conexión. '
    + 'Comprueba que tienes cobertura o wifi y vuelve a pulsar «Confirmar y aceptar propuesta»; no hace falta rellenar nada otra vez.';
const MSG_ADJUNTO_ILEGIBLE = 'No hemos podido leer el justificante bancario que elegiste. '
    + 'Vuelve atrás y selecciónalo otra vez (o haz una foto), y después confirma de nuevo.';

const WHATSAPP = '34623926179';
const fechaLarga = (f) => new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

/* ── Estilos: el registro de la carta de pago ─────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.fp{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.fp *{box-sizing:border-box}
.fp ::selection{background:var(--lima);color:var(--tinta)}
.fp-filete-top{height:4px;background:var(--filete)}
.fp-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.fp-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.fp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.fp-logo{height:26px;width:auto;display:block}
.fp-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.fp-hola{font-size:15px;color:var(--gris);margin:0 2px}
.fp-hola b{color:var(--tinta);font-weight:600}
.fp-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.fp-h1{font-size:42px;line-height:1.16;margin:6px 2px 0}
.fp-h2{font-size:28px;line-height:1.16;margin:0}
.fp-h3{font-size:22px;line-height:1.18;margin:0}
/* El fondo empieza un poco por debajo del alto de la letra: cuando el titular
   ocupa dos líneas, un fondo entero tapaba los rasgos bajos de la de arriba. */
.fp-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.fp-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.fp-sub b{color:var(--tinta);font-weight:600}
.fp-txt{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.fp-txt b,.fp-txt strong{color:var(--tinta);font-weight:700}
.fp-stack{margin-top:22px}
.fp-stack > * + *{margin-top:14px}
.fp-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:22px 20px}
.fp-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.fp-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fp-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0}
.fp-eyebrow-verde{color:var(--verde-txt)}
.fp-eyebrow-gris{color:var(--gris)}
.fp-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.fp-chip-verde{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.fp-chip-ambar{background:#fff1d1;color:#7a4b00}
.fp-numero{font-size:40px;line-height:1;margin:10px 0 0;letter-spacing:.01em;word-break:break-all}
.fp-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.fp-tile-verde{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.fp-tile-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.fp-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.fp-extra{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:14px;line-height:1.5;color:#3b3e45}
.fp-extra b,.fp-extra strong{color:var(--tinta);font-weight:700}
.fp-extra p{margin:0}
.fp-extra p + p{margin-top:6px}
.fp-aviso{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.fp-aviso b,.fp-aviso strong{font-weight:700}
.fp-aviso p{margin:0}
.fp-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.fp-aviso-ambar .fp-ico-tile{background:#ffe9bd;color:#7a4b00}
.fp-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.fp-aviso-ok .fp-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.fp-mt{margin-top:16px}
.fp-demo{display:flex;gap:10px;align-items:center;margin:0 0 16px;padding:10px 14px;border-radius:14px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;font-size:12.5px;line-height:1.45;color:var(--gris)}
.fp-demo b{color:var(--tinta)}
/* botones */
.fp-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;text-align:center;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,filter .2s ease,border-color .2s ease}
.fp-btn:active{transform:scale(.98)}
.fp-btn:disabled{opacity:.55;cursor:default;transform:none}
.fp-btn:focus-visible,.fp-link:focus-visible,.fp-opc:focus-visible,.fp-elige:focus-visible,.fp-atras:focus-visible,.fp-mini:focus-visible,.fp-file:focus-within{outline:3px solid var(--tinta);outline-offset:3px}
.fp-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.fp-btn-pri:hover:not(:disabled){filter:brightness(1.04)}
.fp-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.fp-btn-sec:hover:not(:disabled){border-color:rgba(20,17,17,.3)}
.fp-btn-tinta{background:var(--tinta);color:#fff}
.fp-btns2{display:grid;gap:10px}
.fp-mini{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 13.5px 'Inter',sans-serif;white-space:nowrap}
.fp-mini:hover{border-color:rgba(20,17,17,.3)}
.fp-link{appearance:none;background:none;border:0;cursor:pointer;padding:0;font:inherit;font-weight:700;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.35);border-radius:6px}
.fp-atras{appearance:none;background:none;border:0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 6px 0 0;font:700 14px 'Inter',sans-serif;color:var(--gris);border-radius:8px}
.fp-atras:hover{color:var(--tinta)}
.fp-separa{display:flex;align-items:center;gap:12px;margin:18px 0 0;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris2)}
.fp-separa::before,.fp-separa::after{content:'';flex:1;height:1px;background:var(--linea)}
/* progreso */
.fp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-6px 0 10px}
.fp-paso-n{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris2);margin:0}
.fp-pasos{display:flex;gap:5px;margin:0 0 18px}
.fp-paso{flex:1;height:8px;border-radius:999px;background:#eeece8;overflow:hidden;position:relative}
.fp-paso i{position:absolute;inset:0;background:var(--filete);transform-origin:left;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
/* opciones grandes */
.fp-opcs{display:grid;gap:10px;margin-top:18px}
.fp-opc{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px 14px 14px;min-height:72px;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid rgba(20,17,17,.12);border-radius:18px;color:var(--tinta);font:inherit;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease,transform .12s ease}
.fp-opc:hover{border-color:rgba(20,17,17,.28)}
.fp-opc:active{transform:scale(.99)}
.fp-opc-sel,.fp-opc-sel:hover{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
.fp-opc-dib{flex:none;width:52px;height:52px;border-radius:14px;display:grid;place-items:center}
.fp-dib-calor{background:rgba(255,160,0,.13);color:#b35a00}
.fp-dib-sol{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.fp-dib-aire,.fp-dib-neutro{background:var(--crema);border:1px solid var(--linea);color:#3b3e45}
.fp-opc-sel .fp-opc-dib{background:rgba(255,160,0,.2);color:#8a4b00;border-color:transparent}
.fp-opc-cuerpo{flex:1;min-width:0}
.fp-opc-label{display:block;font-size:15.5px;font-weight:700;line-height:1.35}
.fp-opc-sub{display:block;font-size:13.5px;line-height:1.45;color:var(--gris);margin-top:3px}
.fp-radio{flex:none;width:24px;height:24px;border-radius:999px;border:2px solid rgba(20,17,17,.22);display:grid;place-items:center;color:#08090c;transition:background-color .2s ease,border-color .2s ease}
.fp-opc-sel .fp-radio{background:var(--naranja);border-color:var(--naranja)}
.fp-opc-sola{align-items:flex-start;min-height:64px;padding:16px}
.fp-opc-sola .fp-radio{margin-top:1px}
/* dos respuestas en línea (Sí / No) */
.fp-elige-par{display:grid;gap:8px;margin-top:12px}
.fp-elige{appearance:none;-webkit-tap-highlight-color:transparent;cursor:pointer;min-height:52px;padding:10px 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 15px/1.3 'Inter',sans-serif;text-align:center;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease}
.fp-elige:hover{border-color:rgba(20,17,17,.3)}
.fp-elige-sel,.fp-elige-sel:hover{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
/* sub-pregunta dentro de una pantalla */
.fp-subcaja{padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fp-contador{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px}
.fp-contador button{appearance:none;cursor:pointer;width:56px;height:56px;border-radius:16px;border:1.5px solid rgba(20,17,17,.16);background:#fff;color:var(--tinta);font:700 26px/1 'Inter',sans-serif}
.fp-contador button:hover{border-color:rgba(20,17,17,.32)}
.fp-contador span{min-width:3ch;text-align:center;font-size:48px;line-height:1;font-variant-numeric:tabular-nums}
/* campos */
.fp-k{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:0 2px 8px}
.fp-k i{font-style:normal;color:var(--naranja-txt)}
.fp-k em{font-style:normal;font-weight:600;letter-spacing:0;text-transform:none;color:var(--gris2)}
.fp-k-fila{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px}
.fp-k-fila .fp-k{margin:0}
.fp-campos{display:grid;gap:16px;margin-top:16px}
.fp-dos{display:grid;gap:16px}
.fp-sec{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris);margin:24px 2px 0;padding-top:20px;border-top:1px solid var(--linea)}
.fp-input{appearance:none;display:block;width:100%;height:54px;padding:0 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:500 16px/1 'Inter',sans-serif;transition:border-color .2s ease,box-shadow .2s ease}
.fp-input::placeholder{color:#a3a5aa}
.fp-input:hover{border-color:rgba(20,17,17,.28)}
.fp-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.fp-input:disabled{background:#f4f3f0;color:var(--gris2)}
.fp-input-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.02em}
.fp-input-grande{font-size:20px;font-weight:700}
.fp-ayuda{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:7px 2px 0}
.fp-ayuda-ambar{color:#7a4b00}
.fp-info{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--gris);font:700 12px 'Inter',sans-serif}
.fp-info[aria-expanded="true"]{background:var(--crema);color:var(--tinta)}
/* adjuntar */
.fp-file{position:relative;display:flex;align-items:center;gap:12px;min-height:60px;padding:12px 14px;border-radius:16px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;cursor:pointer;color:var(--gris);font-size:14px;line-height:1.35;transition:border-color .2s ease,background-color .2s ease}
.fp-file:hover{border-color:rgba(20,17,17,.4)}
.fp-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.fp-file b{display:block;color:var(--tinta);font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-file span{display:block;min-width:0}
.fp-file-ok{border-style:solid;border-color:rgba(177,209,62,.7);background:rgba(177,209,62,.12)}
.fp-file-ok b{color:var(--verde-txt)}
.fp-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:150px;padding:22px 16px;text-align:center}
.fp-drop b{white-space:normal}
.fp-lista{display:grid;gap:8px;margin:14px 0 0;padding:0;list-style:none}
.fp-lista li{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 6px 6px 10px;border-radius:14px;background:var(--crema);border:1px solid var(--linea);font-size:13.5px}
.fp-lista li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fp-quitar{appearance:none;cursor:pointer;flex:none;width:40px;height:40px;border-radius:10px;border:0;background:none;color:var(--gris);display:grid;place-items:center}
.fp-quitar:hover{background:#fff;color:var(--tinta)}
.fp-barra{height:10px;border-radius:999px;background:#eeece8;overflow:hidden;margin-top:14px}
.fp-barra i{display:block;height:100%;background:var(--filete);transition:width .3s ease}
.fp-pct{font-size:44px;line-height:1;margin:6px 0 0;text-align:center}
/* propietarios */
.fp-prop{padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fp-prop + .fp-prop{margin-top:12px}
.fp-prop .fp-input{background:#fff}
.fp-prop-q{font-size:15px;font-weight:700;color:var(--tinta);margin:18px 0 0}
.fp-quita-prop{appearance:none;cursor:pointer;background:none;border:0;min-height:40px;padding:0 4px;font:700 13px 'Inter',sans-serif;color:#7a4b00;text-decoration:underline;text-underline-offset:3px}
.fp-anadir{appearance:none;cursor:pointer;width:100%;min-height:52px;margin-top:12px;border-radius:16px;border:1.5px dashed rgba(20,17,17,.25);background:#fff;color:var(--tinta);font:700 14.5px 'Inter',sans-serif}
.fp-anadir:hover{border-color:rgba(20,17,17,.45)}
/* resumen y datos */
.fp-dl{margin:14px 0 0;padding:0}
.fp-dl > div{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:11px 0;border-top:1px solid var(--linea)}
.fp-dl dt{flex:none;font-size:13.5px;color:var(--gris)}
.fp-dl dd{margin:0;min-width:0;font-size:14.5px;font-weight:600;text-align:right;overflow-wrap:anywhere}
.fp-dl .fp-vacio{color:var(--gris2);font-weight:500;font-style:italic}
.fp-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.01em}
.fp-resumen{margin:18px 0 0;padding:0;list-style:none;border:1px solid var(--linea);border-radius:18px;overflow:hidden;background:#fff}
.fp-resumen li{display:flex;align-items:center;gap:12px;padding:12px 10px 12px 12px}
.fp-resumen li + li{border-top:1px solid var(--linea)}
.fp-resumen .fp-opc-dib{width:44px;height:44px;border-radius:12px}
.fp-resumen b{display:block;font-size:15px;line-height:1.35}
.fp-resumen small{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin-bottom:2px}
.fp-nota{font-size:13px;color:var(--gris);text-align:center;margin:12px 4px 0;line-height:1.55}
.fp-cops{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--linea)}
.fp-cops p{margin:8px 0 0;font-size:14px;line-height:1.45;color:var(--gris)}
.fp-cops p b{color:var(--tinta)}
/* hecho */
.fp-ok{display:flex;align-items:center;gap:16px}
.fp-check{flex:none;width:60px;height:60px}
.fp-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:fp-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.fp-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:fp-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
.fp-check svg{display:block;animation:fp-pop .45s cubic-bezier(.2,1.4,.4,1) .55s both}
/* firma */
.fp-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.fp-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.fp-firma b{display:block;font-size:15px;font-weight:700}
.fp-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.fp-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
/* esqueleto y entradas */
.fp-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:fp-shim 1.3s linear infinite;border-radius:24px}
.fp-spin{animation:fp-rot .8s linear infinite}
.fp-in{animation:fp-up .55s cubic-bezier(.2,.8,.2,1) both}
.fp-in-2{animation-delay:.08s}
.fp-in-3{animation-delay:.16s}
.fp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes fp-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fp-draw{to{stroke-dashoffset:0}}
@keyframes fp-pop{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes fp-shim{to{background-position:-200% 0}}
@keyframes fp-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.fp-h1{font-size:36px}.fp-h2{font-size:25px}.fp-numero{font-size:34px}.fp-opc-dib{width:46px;height:46px}}
@media (min-width:640px){.fp-dos{grid-template-columns:1fr 1fr}.fp-btns2,.fp-elige-par{grid-template-columns:1fr 1fr}}
@media (min-width:768px){.fp-col{max-width:560px;padding-top:40px}.fp-card{padding:26px}.fp-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){
  .fp-in,.fp-check svg,.fp-sk,.fp-spin{animation:none}
  .fp-check circle,.fp-check path{animation:none;stroke-dashoffset:0}
  .fp-btn,.fp-opc,.fp-elige,.fp-paso i,.fp-barra i{transition:none}
}
`;

/* ── Iconos (trazo, 24×24) ─────────────────────────────────────────────────── */

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoFlecha = (p) => <Ico {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>;
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoCandado = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Ico>;
const IcoInfo = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Ico>;
const IcoClip = (p) => <Ico {...p}><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L14.8 7" /></Ico>;
const IcoSubir = (p) => <Ico {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></Ico>;
const IcoFoto = (p) => <Ico {...p}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.6" /><path d="M21 15.5l-5-5-9 9" /></Ico>;
const IcoX = (p) => <Ico {...p}><path d="M6 6l12 12M18 6L6 18" /></Ico>;
const IcoChat = (p) => <Ico {...p}><path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.4A8.4 8.4 0 1 1 20.5 11.6z" /></Ico>;
const IcoMail = (p) => <Ico {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></Ico>;
const IcoCalendario = (p) => <Ico {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Ico>;
const IcoDoc = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
const IcoLapiz = (p) => <Ico {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Ico>;
const IcoLlave = (p) => <Ico {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></Ico>;

const Spinner = ({ size = 18 }) => (
    <svg className="fp-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/** El check que se DIBUJA: primero el círculo, luego la palomita. */
const CheckDibujado = () => (
    <div className="fp-check">
        <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
            <circle cx="30" cy="30" r="26.5" pathLength="100" />
            <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
        </svg>
    </div>
);

/* ── Piezas ────────────────────────────────────────────────────────────────── */

function Marco({ numero, children }) {
    return (
        <div className="fp">
            <style>{CSS}</style>
            <div className="fp-filete-top" />
            <div className="fp-halo" />
            <main className="fp-col">
                <header className="fp-head fp-in">
                    <img className="fp-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="fp-exp">{numero}</span>}
                </header>
                {children}
                <footer>
                    <div className="fp-firma">
                        <img className="fp-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                        <div>
                            <b>Fran Moya</b>
                            <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                        </div>
                    </div>
                    <p className="fp-pie">BROKERGY · Ingeniería Energética</p>
                </footer>
            </main>
        </div>
    );
}

function DemoAviso() {
    return (
        <div className="fp-demo">
            <IcoInfo size={18} />
            <span><b>Modo prueba</b> · así ve el cliente el formulario. No se acepta ninguna propuesta ni se envía nada.</span>
        </div>
    );
}

function Aviso({ tono = 'ambar', icono, children, className = '', role }) {
    const Icono = icono || IcoAlerta;
    return (
        <div className={`fp-aviso fp-aviso-${tono} ${className}`} role={role}>
            <span className="fp-ico-tile"><Icono size={20} /></span>
            <div>{children}</div>
        </div>
    );
}

function Campo({ id, label, obligatorio, opcional, ayuda, children }) {
    return (
        <div>
            <label className="fp-k" htmlFor={id}>
                {label}{obligatorio && <i> *</i>}{opcional && <em> (opcional)</em>}
            </label>
            {children}
            {ayuda && <p className="fp-ayuda">{ayuda}</p>}
        </div>
    );
}

/** En la prueba, lo que se habría guardado con la aceptación. */
function DemoResumen({ conf }) {
    const lineas = resumenConfirmacion({ ...conf, supuesto: { tipo_emisor: 'radiadores_convencionales', fotovoltaica: { estado: 'no' } } });
    return (
        <section className="fp-card fp-in fp-in-2">
            <p className="fp-eyebrow fp-eyebrow-gris">Lo que se guardaría en el expediente</p>
            <dl className="fp-dl">
                {lineas.map(l => (
                    <div key={l.tema}>
                        <dt>{l.tema}</dt>
                        <dd>
                            {l.valor}
                            {l.aviso && <p className="fp-ayuda fp-ayuda-ambar" style={{ textAlign: 'right' }}>{l.aviso}</p>}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="fp-ayuda">
                Los avisos comparan con una propuesta de ejemplo calculada con radiadores y sin placas: es lo que vería el equipo en el aviso de aceptación y en el expediente.
            </p>
        </section>
    );
}

/**
 * Componente interactivo para subir fotos/vídeos directamente a Drive
 */
function FileUploadSection({ idOportunidad, API_URL }) {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploaded, setUploaded] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        const newFiles = Array.from(e.target.files);
        setFiles(prev => [...prev, ...newFiles].slice(0, 50)); // Limite 50
        setError(null);
        e.target.value = '';
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;

        setUploading(true);
        setError(null);
        setProgress(0);

        const totalFiles = files.length;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('files', file);

                // Update progress based on which file we are uploading
                const baseProgress = (i / totalFiles) * 100;
                setProgress(Math.round(baseProgress));

                await axios.post(`${API_URL}/upload-docs/${idOportunidad}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                        const filePercent = (progressEvent.loaded / progressEvent.total) * (100 / totalFiles);
                        setProgress(Math.round(baseProgress + filePercent));
                    }
                });
            }

            setUploaded(true);
            setFiles([]);
            setProgress(100);
        } catch (err) {
            console.error("Error subiendo archivos:", err);
            const errorMsg = err.response?.data?.error || "Error al subir los archivos. Por favor, revisa el tamaño (máx 100MB por archivo) e inténtalo de nuevo.";
            setError(errorMsg);
        } finally {
            setUploading(false);
        }
    };

    return (
        <section className="fp-card fp-in fp-in-2">
            <div className="fp-filete-fino" />
            <p className="fp-eyebrow"><IcoFoto size={16} /> Fotos de la instalación</p>
            <h3 className="fp-display fp-h3" style={{ marginTop: 10 }}>Mándanos las fotos de lo que tienes hoy</h3>
            <p className="fp-txt">La caldera, su placa de características y los radiadores. Con ellas preparamos tu certificado energético.</p>

            {uploaded ? (
                <>
                    <Aviso tono="ok" icono={IcoCheck} className="fp-mt">
                        <p><b>¡Documentación enviada!</b> Tus archivos ya están en nuestra carpeta técnica.</p>
                    </Aviso>
                    <button type="button" className="fp-btn fp-btn-sec fp-mt" onClick={() => setUploaded(false)}>
                        Subir más archivos
                    </button>
                </>
            ) : uploading ? (
                <div className="fp-mt" aria-live="polite">
                    <p className="fp-display fp-pct">{progress}%</p>
                    <p className="fp-nota" style={{ marginTop: 6 }}>Enviando archivos…</p>
                    <div className="fp-barra"><i style={{ width: `${progress}%` }} /></div>
                </div>
            ) : (
                <>
                    <label className="fp-file fp-drop fp-mt">
                        <input type="file" multiple accept="image/*,video/*" onChange={handleFileChange} />
                        <span className="fp-ico-tile fp-tile-naranja"><IcoSubir size={20} /></span>
                        <b>{files.length ? 'Añadir más fotos o vídeos' : 'Elegir fotos o vídeos'}</b>
                        <span>Hasta 50 archivos, de 100 MB cada uno como mucho</span>
                    </label>

                    {files.length > 0 && (
                        <>
                            <ul className="fp-lista">
                                {files.map((file, i) => (
                                    <li key={i}>
                                        <IcoFoto size={18} />
                                        <span>{file.name}</span>
                                        <button type="button" className="fp-quitar" onClick={() => removeFile(i)} aria-label={`Quitar ${file.name}`}>
                                            <IcoX size={18} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <button type="button" className="fp-btn fp-btn-pri fp-mt" onClick={handleUpload}>
                                Enviar {files.length === 1 ? 'la foto' : `las ${files.length} fotos`} <IcoFlecha size={20} sw={2.4} />
                            </button>
                        </>
                    )}
                </>
            )}

            {error && (
                <Aviso className="fp-mt" role="alert"><p>{error}</p></Aviso>
            )}
        </section>
    );
}

// ─── Vista ───────────────────────────────────────────────────────────────────

export function AceptarPropuestaView({ idOportunidad }) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [verCondiciones, setVerCondiciones] = useState(false);
    const formRef = useRef(null);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [showIbanInfo, setShowIbanInfo] = useState(false);
    const [noInstaller, setNoInstaller] = useState(false);
    const [justificanteFile, setJustificanteFile] = useState(null);
    const [acceptanceInfo, setAcceptanceInfo] = useState(null); // { fecha, aceptado_por }
    const [editing, setEditing] = useState(false);
    const [editData, setEditData] = useState({});
    const [savingEdit, setSavingEdit] = useState(false);
    const [editSuccess, setEditSuccess] = useState(false);

    const [formData, setFormData] = useState({
        nombre_razon_social: '',
        apellidos: '',
        dni_cif: '',
        email: '',
        telefono: '',
        iban: '',
        // Fechas que le ha dado su instalador. OPCIONALES: no bloquean la aceptación.
        // La de inicio nos marca el plazo para registrar el CEE inicial, que tiene
        // que estar hecho antes de que la obra empiece.
        fecha_prevista_inicio: '',
        fecha_prevista_fin: '',
    });

    const [generatedExpediente, setGeneratedExpediente] = useState(null);
    const [displayId, setDisplayId] = useState(idOportunidad);
    // CEE aportado: si el cliente entregó un CEE inicial, la firma le deja elegir usarlo o hacer uno nuevo.
    const [ceeAportado, setCeeAportado] = useState(false);
    const [ceeChoice, setCeeChoice] = useState(''); // '' | 'aportado' | 'nuevo'
    // Qué versión de la propuesta sirve HOY este enlace, y cuál se firmó si ya
    // está aceptada. El enlace no cambia al reenviar una revisión: sin decirlo,
    // el cliente firma un documento distinto del que recibió en su día.
    const [versionProp, setVersionProp] = useState({ v: null, fecha: null, aceptada: null });
    // Lo que el cliente confirma de su vivienda: cómo le llega el calor y si tiene
    // placas. Se pregunta en NEUTRO, sin preseleccionar lo que se supuso al
    // simular — ver logic/confirmacionCliente.js.
    const [conf, setConf] = useState(CONFIRMACION_VACIA);
    // La aceptación va en dos tramos: los DATOS (un formulario, vienen rellenos
    // y solo se repasan) y la VIVIENDA (una pregunta por pantalla: el 90 % de
    // las aceptaciones se hacen con el móvil). Ver components/ConfirmarVivienda.
    const [fase, setFase] = useState('datos');
    // Otros propietarios de la vivienda (IRPF y, si cobran aparte, su cuenta).
    // `masPropietarios` en null = sin contestar: la pregunta va en neutro.
    const [masPropietarios, setMasPropietarios] = useState(null);
    const [copropietarios, setCopropietarios] = useState([]);
    // Varios propietarios SOLO si lo hemos habilitado desde la ficha del cliente
    // (o si la ficha ya los tiene). Sin eso, acepta una única persona: la
    // pregunta generaba demasiadas dudas al aceptar.
    const [permiteVarios, setPermiteVarios] = useState(false);
    const [justificantesCop, setJustificantesCop] = useState({});
    // Al editar los datos de una propuesta YA aceptada.
    const [editCops, setEditCops] = useState([]);
    const [editMas, setEditMas] = useState(null);
    const demo = String(idOportunidad || '').toLowerCase() === DEMO_ID;

    useEffect(() => {
        if (demo) {
            setFormData(prev => ({ ...prev, ...DEMO_DATOS }));
            // /firma/demo?varios — para ver cómo queda con varios propietarios habilitados.
            if (new URLSearchParams(window.location.search).has('varios')) setPermiteVarios(true);
            setDisplayId('DEMO');
            setLoading(false);
            return;
        }
        const fetchCliente = async () => {
            try {
                const res = await axios.get(`${API_URL}/cliente/${idOportunidad}`);
                // Los campos de VERSIÓN se sacan del `rest` a propósito: `rest`
                // alimenta `formData`, que es lo que se manda al aceptar, y no
                // pintan nada en ese formulario.
                const { estado, numero_expediente, id_oportunidad: readableId, tiene_instalador, fecha_aceptacion, aceptado_por, cee_aportado, cee_decision,
                        propuesta_version, propuesta_version_fecha, propuesta_version_aceptada, copropietarios: copsServidor, permite_varios_propietarios, ...rest } = res.data;

                setFormData(prev => ({ ...prev, ...rest }));
                // Si la ficha ya tiene otros propietarios, la pregunta viene contestada.
                const cops = propietariosDesdeServidor(copsServidor);
                setCopropietarios(cops);
                setPermiteVarios(!!permite_varios_propietarios || cops.length > 0);
                if (cops.length) setMasPropietarios(true);
                setVersionProp({ v: propuesta_version, fecha: propuesta_version_fecha, aceptada: propuesta_version_aceptada });
                setCeeAportado(!!cee_aportado);
                if (cee_decision) setCeeChoice(cee_decision === 'usar_cee_aportado' ? 'aportado' : 'nuevo');
                if (readableId) setDisplayId(readableId);

                if (estado === 'ACEPTADA') {
                    if (numero_expediente) setGeneratedExpediente(numero_expediente);
                    setAcceptanceInfo({ fecha: fecha_aceptacion, aceptado_por });
                }
            } catch (err) {
                console.error("No se pudo cargar info del cliente:", err);
                if (err.response && err.response.status === 404) {
                    setError("Esta propuesta ya no existe o el ID es incorrecto.");
                }
            } finally {
                setLoading(false);
            }
        };

        if (idOportunidad) fetchCliente();
    }, [idOportunidad, demo]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Datos repasados → a las preguntas de la vivienda. La validación nativa de
    // los campos `required` ya ha pasado cuando llega aquí.
    const handleSubmit = (e) => {
        e.preventDefault();
        if (ceeAportado && !ceeChoice) {
            setError('Por favor, indícanos si usamos tu CEE actual o hacemos uno nuevo.');
            return;
        }
        const faltaProp = permiteVarios ? faltaEnPropietarios(masPropietarios, copropietarios) : null;
        if (faltaProp) {
            setError(faltaProp);
            formRef.current?.scrollIntoView?.({ block: 'start' });
            return;
        }
        setError(null);
        setFase('vivienda');
    };

    const enviarAceptacion = async () => {
        // Las preguntas de la vivienda no se pueden saltar en las pantallas;
        // esto es la red por si algo llega a medias.
        const faltan = faltanConfirmacion(conf);
        if (faltan.length) {
            setError(`Falta por contestar: ${faltan.join(', ')}.`);
            return;
        }
        if (demo) {
            setGeneratedExpediente('26RES060_DEMO');
            setSuccess(true);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const fd = new FormData();
            Object.entries(formData).forEach(([k, v]) => fd.append(k, v || ''));
            if (justificanteFile) fd.append('justificante', justificanteFile);
            // Otros propietarios: la lista ENTERA (con "solo yo", vacía) y el
            // justificante de cada uno que cobre en su propia cuenta.
            if (permiteVarios && masPropietarios !== null) {
                const cops = masPropietarios ? copropietarios : [];
                fd.append('copropietarios', JSON.stringify(propietariosParaEnviar(cops)));
                for (const p of cops) {
                    if (p.cuenta_propia && justificantesCop[p.id]) fd.append(`justificante_cop_${p.id}`, justificantesCop[p.id]);
                }
            }
            if (ceeAportado && ceeChoice) fd.append('cee_choice', ceeChoice);
            // Qué texto de condiciones tenía delante al aceptar: se sella en el historial.
            fd.append('condiciones_version', CONDICIONES_VERSION);
            // Lo que confirma de su vivienda. Va como JSON: es un multipart.
            fd.append('confirmacion', JSON.stringify({ ...conf, version: CONFIRMACION_VERSION }));
            const res = await axios.post(`${API_URL}/aceptar/${idOportunidad}`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.numeroExpediente) setGeneratedExpediente(res.data.numeroExpediente);
            setSuccess(true);
        } catch (err) {
            let msg = err.response?.data?.error || "Ocurrió un error al procesar tu aceptación. Por favor, inténtalo de nuevo.";
            if (!err.response) {
                // Sin respuesta: la petición no salió del móvil. Si el adjunto ya
                // no se puede leer, es eso; si no, la conexión.
                const adjuntos = [justificanteFile, ...Object.values(justificantesCop || {})].filter(Boolean);
                const ilegible = (await Promise.all(adjuntos.map(f => f.slice(0, 1).arrayBuffer().then(() => false, () => true)))).some(Boolean);
                msg = ilegible ? MSG_ADJUNTO_ILEGIBLE : MSG_SIN_CONEXION;
            }
            setError(msg);
            if (err.response?.data?.code === 'INSTALLER_REQUIRED') setNoInstaller(true);
            setSubmitting(false);
        }
    };

    // Para el saludo: el nombre de pila tal y como se dice («MARÍA» → «María»).
    const pila = String(formData.nombre_razon_social || '').trim().split(/\s+/)[0] || '';
    const nombre = pila ? pila.charAt(0).toLocaleUpperCase('es') + pila.slice(1).toLocaleLowerCase('es') : '';

    if (loading) {
        return (
            <Marco>
                <div aria-busy="true" aria-label="Cargando tu propuesta">
                    <div className="fp-sk" style={{ height: 22, width: '45%', borderRadius: 8 }} />
                    <div className="fp-sk" style={{ height: 96, marginTop: 14, borderRadius: 14 }} />
                    <div className="fp-sk" style={{ height: 420, marginTop: 22 }} />
                </div>
            </Marco>
        );
    }

    if (noInstaller) {
        return (
            <Marco numero={displayId}>
                <h1 className="fp-display fp-h1 fp-in">Falta un paso <span className="fp-mark">nuestro</span></h1>
                <p className="fp-sub fp-in fp-in-2">Tu propuesta todavía no se puede aceptar, y no es por nada que hayas hecho tú.</p>
                <div className="fp-stack">
                    <section className="fp-card fp-in fp-in-2">
                        <Aviso icono={IcoLlave}>
                            <p>Antes de aceptarla tenemos que <b>asignarle el instalador</b> que hará la obra. Es un paso obligatorio que nos toca a nosotros.</p>
                        </Aviso>
                        <p className="fp-txt">Escríbenos y lo dejamos resuelto. Después podrás aceptar desde este mismo enlace.</p>
                        <a className="fp-btn fp-btn-pri fp-mt" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero aceptar la propuesta ${displayId} y me dice que falta el instalador.`)}`}>
                            <IcoChat size={20} /> Escribir por WhatsApp
                        </a>
                    </section>
                </div>
            </Marco>
        );
    }

    if (acceptanceInfo && !success) {
        const fechaFmt = acceptanceInfo.fecha ? fechaLarga(acceptanceInfo.fecha) : null;
        return (
            <Marco numero={generatedExpediente || displayId}>
                <p className="fp-hola fp-in">{nombre ? <>Hola, <b>{nombre}</b></> : 'Hola'}</p>
                <h1 className="fp-display fp-h1 fp-in">Tu propuesta ya está <span className="fp-mark">aceptada</span></h1>
                <div className="fp-stack">
                    <Aviso tono="ok" icono={IcoCheck} className="fp-in fp-in-2">
                        <p>
                            <b>{fechaFmt ? `La aceptaste el ${fechaFmt}` : 'La aceptaste anteriormente'}</b>
                            {acceptanceInfo.aceptado_por ? ` · ${acceptanceInfo.aceptado_por}` : ''}. No tienes que volver a hacerlo.
                        </p>
                    </Aviso>

                    {generatedExpediente && (
                        <section className="fp-card fp-in fp-in-2">
                            <div className="fp-filete-fino" />
                            <p className="fp-eyebrow fp-eyebrow-gris">Tu número de expediente</p>
                            <p className="fp-display fp-numero">{generatedExpediente}</p>
                            <p className="fp-txt">Tenlo a mano si nos escribes: con él te encontramos al momento.</p>
                        </section>
                    )}

                    {/* Datos cliente — lectura o edición */}
                    <section className="fp-card fp-in fp-in-3">
                        <div className="fp-card-head">
                            <p className="fp-eyebrow fp-eyebrow-gris">Tus datos</p>
                            {!editing && (
                                <button
                                    type="button"
                                    className="fp-mini"
                                    onClick={() => {
                                        setEditData({ ...formData });
                                        setEditCops(copropietarios.map(p => ({ ...p })));
                                        setEditMas(copropietarios.length > 0);
                                        setEditing(true); setEditSuccess(false);
                                    }}
                                >
                                    <IcoLapiz size={16} /> Editar
                                </button>
                            )}
                        </div>

                        {editSuccess && (
                            <Aviso tono="ok" icono={IcoCheck} className="fp-mt"><p>Datos actualizados correctamente.</p></Aviso>
                        )}

                        {editing ? (
                            <div>
                                <div className="fp-campos fp-dos">
                                    {[
                                        { name: 'nombre_razon_social', label: 'Nombre / Razón social' },
                                        { name: 'apellidos', label: 'Apellidos' },
                                        { name: 'dni_cif', label: 'DNI / CIF' },
                                        { name: 'email', label: 'Email', type: 'email' },
                                        { name: 'telefono', label: 'Teléfono', type: 'tel' },
                                        { name: 'iban', label: 'Cuenta (IBAN)', placeholder: 'ESXX XXXX ...', mono: true },
                                    ].map(({ name, label, type = 'text', placeholder, mono }) => (
                                        <Campo key={name} id={`fp-ed-${name}`} label={label}>
                                            <input
                                                id={`fp-ed-${name}`}
                                                type={type}
                                                value={editData[name] || ''}
                                                onChange={e => setEditData(prev => ({ ...prev, [name]: e.target.value }))}
                                                placeholder={placeholder || ''}
                                                className={`fp-input${mono ? ' fp-input-mono' : ''}`}
                                            />
                                        </Campo>
                                    ))}
                                </div>
                                {/* Sin subida de justificante aquí: este guardado es JSON.
                                    Si cambia la cuenta, el justificante se nos manda aparte. */}
                                {permiteVarios && (
                                    <PropietariosAceptacion
                                        mas={editMas}
                                        setMas={setEditMas}
                                        lista={editCops}
                                        setLista={setEditCops}
                                        conJustificante={false}
                                    />
                                )}
                                <div className="fp-btns2 fp-mt" style={{ marginTop: 22 }}>
                                    <button
                                        type="button"
                                        className="fp-btn fp-btn-sec"
                                        onClick={() => { setEditing(false); setEditSuccess(false); }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        className="fp-btn fp-btn-pri"
                                        disabled={savingEdit}
                                        onClick={async () => {
                                            const faltaProp = permiteVarios ? faltaEnPropietarios(editMas, editCops) : null;
                                            if (faltaProp) { alert(faltaProp); return; }
                                            setSavingEdit(true);
                                            try {
                                                const cops = editMas ? editCops : [];
                                                await axios.patch(`${API_URL}/datos/${idOportunidad}`, {
                                                    ...editData,
                                                    ...(permiteVarios ? { copropietarios: propietariosParaEnviar(cops) } : {}),
                                                });
                                                setFormData(prev => ({ ...prev, ...editData }));
                                                if (permiteVarios) setCopropietarios(cops);
                                                setEditing(false);
                                                setEditSuccess(true);
                                            } catch (e) {
                                                alert(e.response?.data?.error || 'Error al guardar');
                                            } finally {
                                                setSavingEdit(false);
                                            }
                                        }}
                                    >
                                        {savingEdit ? <><Spinner /> Guardando…</> : 'Guardar cambios'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <dl className="fp-dl">
                                    {[
                                        ['Nombre', formData.nombre_razon_social],
                                        ['Apellidos', formData.apellidos],
                                        ['DNI / CIF', formData.dni_cif, true],
                                        ['Email', formData.email],
                                        ['Teléfono', formData.telefono],
                                        ['Cuenta (IBAN)', formData.iban, true],
                                    ].map(([label, value, mono]) => (
                                        <div key={label}>
                                            <dt>{label}</dt>
                                            <dd className={value ? (mono ? 'fp-mono' : '') : 'fp-vacio'}>{value || 'Sin datos'}</dd>
                                        </div>
                                    ))}
                                </dl>
                                {copropietarios.length > 0 && (
                                    <div className="fp-cops">
                                        <p className="fp-k" style={{ margin: 0 }}>Otros propietarios</p>
                                        {copropietarios.map(p => (
                                            <p key={p.id}>
                                                <b>{[p.nombre, p.apellidos].filter(Boolean).join(' ').toUpperCase()}</b>
                                                {p.dni && <span className="fp-mono"> · {p.dni}</span>}
                                                <br />
                                                {p.cedente !== true
                                                    ? 'Propietario (no paga la obra)'
                                                    : `Paga la obra${p.cuota_pct ? ` (${p.cuota_pct} %)` : ''} · ${p.iban ? `cobra en su cuenta: ${p.iban}` : 'cobra en la cuenta del titular'}`}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </section>

                    {/* Subida de documentación */}
                    <FileUploadSection idOportunidad={idOportunidad} API_URL={API_URL} />
                </div>
            </Marco>
        );
    }

    if (success) {
        return (
            <Marco numero={generatedExpediente || displayId}>
                {demo && <DemoAviso />}
                <div className="fp-ok fp-in">
                    <CheckDibujado />
                    <p className="fp-eyebrow fp-eyebrow-verde">Propuesta aceptada</p>
                </div>
                <h1 className="fp-display fp-h1 fp-in fp-in-2" style={{ marginTop: 14 }}>
                    ¡Hecho{nombre ? `, ${nombre}` : ''}! Ya está <span className="fp-mark">en marcha</span>
                </h1>
                <p className="fp-sub fp-in fp-in-2">
                    Hemos recibido tu aceptación y <b>te llegará un email</b> con estas indicaciones. Ahora preparamos el <b>certificado energético inicial</b> de tu vivienda.
                </p>

                <div className="fp-stack">
                    {/* Expediente: lo que tiene que tener a mano a partir de hoy */}
                    <section className="fp-card fp-in fp-in-2">
                        <div className="fp-filete-fino" />
                        <p className="fp-eyebrow fp-eyebrow-gris">Tu número de expediente</p>
                        <p className="fp-display fp-numero">{generatedExpediente || 'Pendiente'}</p>
                        <p className="fp-txt">Tenlo a mano si nos escribes: con él te encontramos al momento.</p>
                    </section>

                    {/* En la prueba no hay carpeta a la que subir: se enseña en
                        su lugar lo que se habría guardado. */}
                    {demo ? (
                        <DemoResumen conf={conf} />
                    ) : (
                        <FileUploadSection idOportunidad={idOportunidad} API_URL={API_URL} />
                    )}

                    <section className="fp-card fp-in fp-in-3">
                        <p className="fp-eyebrow fp-eyebrow-gris">¿Prefieres mandarlas de otra forma?</p>
                        <div className="fp-btns2 fp-mt">
                            <a
                                className="fp-btn fp-btn-sec"
                                href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola, soy ${formData.nombre_razon_social || ''}. Os envío documentación del expediente ${generatedExpediente}.`)}`}
                            >
                                <IcoChat size={20} /> Por WhatsApp
                            </a>
                            <a
                                className="fp-btn fp-btn-sec"
                                href={`mailto:info@brokergy.es?subject=Documentación expediente ${generatedExpediente}&body=Hola, os envío documentación del expediente ${generatedExpediente}.`}
                            >
                                <IcoMail size={20} /> Por email
                            </a>
                        </div>
                        <Aviso icono={IcoCalendario} className="fp-mt">
                            <p>El certificado energético inicial tiene que estar hecho <b>antes de la última factura de la obra</b>.</p>
                        </Aviso>
                    </section>
                </div>
            </Marco>
        );
    }

    // Enlace que no lleva a ninguna propuesta.
    if (error && !formData.nombre_razon_social) {
        return (
            <Marco>
                <section className="fp-card fp-in">
                    <span className="fp-ico-tile fp-tile-crema"><IcoCandado size={20} /></span>
                    <h1 className="fp-display fp-h2" style={{ marginTop: 16 }}>Este enlace no funciona</h1>
                    <p className="fp-txt">{error}</p>
                    <p className="fp-txt">Si crees que es un error, escríbenos y te mandamos el bueno.</p>
                    <a className="fp-btn fp-btn-pri fp-mt" href={`https://wa.me/${WHATSAPP}`}>
                        <IcoChat size={20} /> Escribir por WhatsApp
                    </a>
                </section>
            </Marco>
        );
    }

    return (
        <Marco numero={displayId}>
            {demo && <DemoAviso />}
            {fase === 'vivienda' ? (
                <ConfirmarVivienda
                    conf={conf}
                    setConf={setConf}
                    onVolverDatos={() => { setError(null); setFase('datos'); }}
                    onAceptar={enviarAceptacion}
                    onVerCondiciones={() => setVerCondiciones(true)}
                    enviando={submitting}
                    error={error}
                />
            ) : (<>
                <p className="fp-hola fp-in">{nombre ? <>Hola, <b>{nombre}</b></> : 'Hola'}</p>
                <h1 className="fp-display fp-h1 fp-in">Acepta tu <span className="fp-mark">propuesta</span></h1>
                <p className="fp-sub fp-in fp-in-2">
                    Tus datos ya vienen rellenos: <b>solo comprueba que están bien</b>. Después, tres preguntas rápidas sobre tu vivienda y listo.
                </p>

                {/* Qué documento se está aceptando. Solo a partir de la
                    segunda: una propuesta que solo ha salido una vez no
                    tiene con qué confundirse, y decirlo sobra. */}
                {versionProp.v > 1 && (
                    <Aviso icono={IcoDoc} className="fp-mt fp-in fp-in-2">
                        <p>
                            Estás aceptando la <b>versión {versionProp.v}</b> de la propuesta
                            {versionProp.fecha ? `, del ${fechaLarga(versionProp.fecha)}` : ''}.
                        </p>
                        <p>Sustituye a las anteriores que te hayamos enviado.</p>
                    </Aviso>
                )}

                <form ref={formRef} onSubmit={handleSubmit} className="fp-stack" style={{ scrollMarginTop: 16 }}>
                    {error && (
                        <Aviso role="alert"><p>{error}</p></Aviso>
                    )}

                    <section className="fp-card fp-in fp-in-2">
                        <div className="fp-filete-fino" />
                        <div className="fp-top" style={{ margin: 0 }}>
                            <p className="fp-eyebrow">Paso 1 de 2 · Tus datos</p>
                        </div>
                        <div className="fp-campos fp-dos">
                            <Campo id="nombre_razon_social" label="Nombre / Razón social" obligatorio>
                                <input id="nombre_razon_social" name="nombre_razon_social" type="text" required autoComplete="given-name"
                                    value={formData.nombre_razon_social} onChange={handleChange} className="fp-input" />
                            </Campo>
                            <Campo id="apellidos" label="Apellidos">
                                <input id="apellidos" name="apellidos" type="text" autoComplete="family-name"
                                    value={formData.apellidos || ''} onChange={handleChange} className="fp-input" />
                            </Campo>
                            <Campo id="dni_cif" label="DNI / CIF" obligatorio>
                                <input id="dni_cif" name="dni_cif" type="text" required
                                    value={formData.dni_cif || ''} onChange={handleChange} className="fp-input fp-input-mono" />
                            </Campo>
                            <Campo id="telefono" label="Teléfono" obligatorio>
                                <input id="telefono" name="telefono" type="tel" required autoComplete="tel"
                                    value={formData.telefono || ''} onChange={handleChange} className="fp-input" />
                            </Campo>
                        </div>
                        <div className="fp-campos">
                            <Campo id="email" label="Email" obligatorio>
                                <input id="email" name="email" type="email" required autoComplete="email"
                                    value={formData.email || ''} onChange={handleChange} className="fp-input" />
                            </Campo>
                        </div>

                        <p className="fp-sec">Dónde se te ingresa la ayuda</p>
                        <div className="fp-campos">
                            <div>
                                <div className="fp-k-fila">
                                    <label className="fp-k" htmlFor="iban">Cuenta (IBAN)</label>
                                    <button type="button" className="fp-info" aria-expanded={showIbanInfo} aria-controls="fp-iban-info"
                                        onClick={() => setShowIbanInfo(!showIbanInfo)}>
                                        <IcoInfo size={14} /> ¿Por qué?
                                    </button>
                                </div>
                                <input id="iban" name="iban" type="text" placeholder="ESXX XXXX ..."
                                    value={formData.iban || ''} onChange={handleChange} className="fp-input fp-input-mono" />
                                {showIbanInfo && (
                                    <div className="fp-extra" id="fp-iban-info">
                                        <IcoInfo size={18} />
                                        <div>
                                            <p>Pedimos el <strong>IBAN</strong> porque es necesario para generar el anexo para acreditar ante el Ministerio que quien recibe el dinero es la persona que hace la inversión.</p>
                                            <p>Ten en cuenta que posteriormente nos tendrás que aportar el <strong>justificante de titularidad bancaria</strong> (no solo el número).</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Justificante de titularidad bancaria */}
                            <div>
                                <p className="fp-k">Justificante de titularidad bancaria <em>(opcional)</em></p>
                                <label className={`fp-file${justificanteFile ? ' fp-file-ok' : ''}`}>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,application/pdf"
                                        onChange={async e => {
                                            const f = e.target.files[0] || null;
                                            try {
                                                setJustificanteFile(await copiaEnMemoria(f));
                                            } catch {
                                                setJustificanteFile(null);
                                                setError(MSG_ADJUNTO_ILEGIBLE);
                                            }
                                        }}
                                    />
                                    <span className={`fp-ico-tile ${justificanteFile ? 'fp-tile-verde' : 'fp-tile-crema'}`}>
                                        {justificanteFile ? <IcoCheck size={20} /> : <IcoClip size={20} />}
                                    </span>
                                    {justificanteFile ? (
                                        <span>
                                            <b>{justificanteFile.name}</b>
                                            {(justificanteFile.size / 1024).toFixed(0)} KB · pulsa para cambiarlo
                                        </span>
                                    ) : (
                                        <span><b>Adjuntar justificante</b>JPG, PNG o PDF</span>
                                    )}
                                </label>
                                <p className="fp-ayuda">
                                    Puedes descargarlo desde la app de tu banco (Certificado de Titularidad) o hacer una foto a la primera página de tu cartilla bancaria.
                                </p>
                            </div>
                        </div>

                        {/* ¿Más de un propietario? — solo si lo hemos habilitado
                            desde la ficha del cliente. Si no, acepta una única persona. */}
                        {permiteVarios && (
                            <PropietariosAceptacion
                                mas={masPropietarios}
                                setMas={setMasPropietarios}
                                lista={copropietarios}
                                setLista={setCopropietarios}
                                justificantes={justificantesCop}
                                setJustificantes={setJustificantesCop}
                            />
                        )}
                    </section>

                    {/* Decisión sobre el CEE inicial (solo si el cliente aportó uno) */}
                    {ceeAportado && (
                        <section className="fp-card fp-in fp-in-3">
                            <p className="fp-eyebrow"><IcoDoc size={16} /> Tu certificado energético <span aria-hidden="true">*</span></p>
                            <p className="fp-txt">Nos has aportado un certificado energético (CEE). Indícanos qué prefieres para tu expediente:</p>
                            <div className="fp-opcs" role="radiogroup" aria-label="Certificado energético inicial">
                                {[
                                    { v: 'aportado', t: 'Usar el CEE que ya tengo', d: 'Usamos el certificado que nos has aportado.' },
                                    { v: 'nuevo', t: 'Que BROKERGY emita un CEE nuevo', d: 'Emitimos un CEE inicial nuevo antes de la obra (puede optimizar la ayuda).' },
                                ].map(opt => (
                                    <button key={opt.v} type="button" role="radio" aria-checked={ceeChoice === opt.v}
                                        className={`fp-opc fp-opc-sola${ceeChoice === opt.v ? ' fp-opc-sel' : ''}`}
                                        onClick={() => setCeeChoice(opt.v)}>
                                        <span className="fp-opc-cuerpo">
                                            <span className="fp-opc-label">{opt.t}</span>
                                            <span className="fp-opc-sub">{opt.d}</span>
                                        </span>
                                        <span className="fp-radio">{ceeChoice === opt.v && <IcoCheck size={14} sw={3} />}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Fechas de la obra. Opcionales: si el cliente no las
                        sabe, puede aceptar igualmente. Nos sirven para
                        priorizar el CEE inicial, que debe estar registrado
                        antes de que empiece la instalación. */}
                    <section className="fp-card fp-in fp-in-3">
                        <p className="fp-eyebrow fp-eyebrow-gris"><IcoCalendario size={16} /> Fechas de la obra · opcional</p>
                        <h3 className="fp-display fp-h3" style={{ marginTop: 10 }}>¿Qué fechas te ha dado tu instalador?</h3>
                        <p className="fp-txt">Nos ayuda a tener listo tu certificado energético a tiempo. Si aún no las sabes, déjalo en blanco.</p>
                        <div className="fp-campos fp-dos">
                            <Campo id="fecha_prevista_inicio" label="Inicio previsto">
                                <input id="fecha_prevista_inicio" type="date" name="fecha_prevista_inicio"
                                    value={formData.fecha_prevista_inicio} onChange={handleChange} className="fp-input" />
                            </Campo>
                            <Campo id="fecha_prevista_fin" label="Fin previsto">
                                <input id="fecha_prevista_fin" type="date" name="fecha_prevista_fin"
                                    value={formData.fecha_prevista_fin} min={formData.fecha_prevista_inicio || undefined}
                                    onChange={handleChange} className="fp-input" />
                            </Campo>
                        </div>
                        {formData.fecha_prevista_inicio && formData.fecha_prevista_fin
                            && formData.fecha_prevista_fin < formData.fecha_prevista_inicio && (
                            <p className="fp-ayuda fp-ayuda-ambar">El fin no puede ser anterior al inicio.</p>
                        )}
                    </section>

                    <div className="fp-in fp-in-3">
                        <button type="submit" className="fp-btn fp-btn-pri">
                            Continuar <IcoFlecha size={20} sw={2.4} />
                        </button>
                        <p className="fp-nota">Después te hacemos 3 preguntas rápidas sobre tu vivienda y aceptas la propuesta.</p>
                    </div>
                </form>
            </>)}
            <CondicionesAceptacionModal
                tema="carta"
                open={verCondiciones}
                onClose={() => setVerCondiciones(false)}
                enviando={submitting}
                onAceptar={() => { setVerCondiciones(false); enviarAceptacion(); }}
            />
        </Marco>
    );
}
