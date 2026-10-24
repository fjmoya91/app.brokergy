/**
 * MiExpedienteView — home del portal del cliente.
 * URL: /mi-expediente/:uuid?token=
 *
 * Registro «carta de pago» (24/10/2026), el MISMO de «¿Te ha llegado?»
 * (RecibidoCobroView): fondo crema, tinta, tarjetas blancas, Antonio para cifras y
 * titulares, Inter para el cuerpo, naranja para la acción, verde para lo conseguido,
 * el filete degradado y UNA palabra en lima. Sin emojis: iconos SVG de trazo.
 *
 * Portada: el dinero (estimado, o COBRADO con el importe real), el estado, «Para tu
 * declaración de la Renta» —protagonista en cuanto el expediente está cobrado o con
 * la documentación completa— y cuatro accesos (documentos · subir fotos · dudas ·
 * WhatsApp) que abren cada sección en una ventana (bottom-sheet en el móvil).
 * Solo lectura + subida (reusa DocsManager mode="token", que es oscuro: su ventana
 * se queda oscura). Nunca recibe margen/precio SO: el backend sirve un DTO curado.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { DocsManager } from '../../docs/DocsManager';

// En RELATIVO, como las demás páginas del cliente: se abre con el MÓVIL desde un
// WhatsApp, y en desarrollo `localhost` sería el teléfono (lo resuelve el proxy de Vite).
const API = '/api/public/portal';
const WHATSAPP_CONTACTO = '34623926179'; // el de BROKERGY (carta de pago y email)

const HITOS = ['Certificado inicial', 'Obra y firmas', 'Certificado final', 'Preparación', 'Tramitación CAE', 'Cobro'];

/* ── Formato ───────────────────────────────────────────────────────────────── */

// `toLocaleString('es-ES')` NO agrupa los números de cuatro cifras («7768 €»).
const miles = (n, dec = 0) => {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    const [ent, frac] = Math.abs(Number(n)).toFixed(dec).split('.');
    const s = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${Number(n) < 0 ? '−' : ''}${s}${frac ? `,${frac}` : ''}`;
};
const NBSP = String.fromCharCode(160);   // «6.184 €» no se parte en dos líneas
const eur = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${miles(n)}${NBSP}€`);
const eur2 = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : `${miles(n, 2)}${NBSP}€`);
const fechaCorta = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : null;
};
/** Lo que se teclea en Renta Web: sin separador de miles y con coma decimal. */
const paraTeclear = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(2).replace('.', ','));

const FAQS = [
    {
        q: '¿Tengo que pagar impuestos por el bono del CAE?',
        a: 'Sí, es un ingreso que debes declarar. Según Hacienda (consultas vinculantes V0361-23 y V2137-25) es una ganancia patrimonial que va a la base del ahorro de tu IRPF y tributa por tramos (19 % hasta 6.000 €, 21 % de 6.000 a 50.000 €…). Como el bono suele ser de unos pocos miles de euros, lo habitual es tributar al 19 %. Importante: el bono no es una subvención, así que no reduce tu deducción por la reforma. Esta información es orientativa; confirma tu caso con tu asesor fiscal.',
    },
    {
        q: '¿Cuáles son las fases de mi expediente?',
        a: 'Cuando la documentación está completa (fotos, facturas y anexos firmados), tu actuación se agrupa con otras (normalmente en lotes de 5) y se envía a una entidad verificadora acreditada por ENAC. Si todo está bien, pasa al gestor autonómico y luego al coordinador nacional, que emite los CAE. A partir de ahí se tramita el pago.',
    },
    {
        q: '¿Puedo firmar un acuerdo con otra entidad?',
        a: 'No. Una vez firmado el acuerdo de cesión de ahorros existe el compromiso de no ceder esos ahorros a otra entidad.',
    },
    {
        q: '¿Cuándo y cómo cobro?',
        a: 'Cuando el CAE es favorable, el Sujeto Obligado abona el importe a Brokergy y Brokergy te lo transfiere a ti. Verás el estado avanzar a "Cobro" cuando el CAE esté emitido.',
    },
];

/* ── Documentos agrupados ──────────────────────────────────────────────────── */

// Cada CEE en sus TRES papeles, juntos: es lo que se pide en campaña de Renta.
const GRUPOS_DOC = [
    { id: 'cee_inicial', titulo: 'Certificado energético inicial', sub: 'Antes de la obra', icono: 'casa', compacto: true,
        claves: [['cee_inicial', 'Certificado'], ['cee_inicial_etiqueta', 'Etiqueta'], ['cee_inicial_registro', 'Registro']] },
    { id: 'cee_final', titulo: 'Certificado energético final', sub: 'Después de la obra', icono: 'hoja', compacto: true,
        claves: [['cee_final', 'Certificado'], ['cee_final_etiqueta', 'Etiqueta'], ['cee_final_registro', 'Registro']] },
    { id: 'facturas', titulo: 'Facturas de la obra', icono: 'recibo', prefijo: 'factura_' },
    { id: 'guia', titulo: 'Guía para la Renta', icono: 'guia', claves: [['guia_irpf', 'Guía completa (PDF)']] },
    { id: 'instalacion', titulo: 'Certificados de la instalación', icono: 'sello', claves: [['cifo', 'Certificado CIFO'], ['rite', 'Certificado RITE']] },
    { id: 'firmados', titulo: 'Documentos firmados', icono: 'firma', claves: [['anexo_i', 'Anexo I firmado'], ['cesion', 'Anexo de Cesión de Ahorros'], ['anexo_fotografico', 'Anexo Fotográfico']] },
];

/** [{ ...grupo, items: [{ key, label, bloqueado }] }] con lo que HAY, en su orden. */
function agruparDocs(documentos, bloqueados, { soloRenta = false, conGuia = false } = {}) {
    const libres = new Map(documentos.map(d => [d.key, d]));
    const cerrados = new Map(bloqueados.map(d => [d.key, d]));
    const grupos = [];
    for (const g of GRUPOS_DOC) {
        if (soloRenta && !['cee_inicial', 'cee_final', 'facturas', 'guia'].includes(g.id)) continue;
        let items = [];
        if (g.prefijo) {
            items = documentos.filter(d => d.key.startsWith(g.prefijo)).map(d => ({ key: d.key, label: d.label }));
        } else {
            for (const [key, corto] of g.claves) {
                if (libres.has(key)) items.push({ key, label: corto });
                else if (cerrados.has(key)) items.push({ key, label: corto, bloqueado: true });
                // La guía se genera al momento aunque nunca se le haya enviado.
                else if (key === 'guia_irpf' && conGuia) items.push({ key, label: corto });
            }
        }
        if (items.length) grupos.push({ ...g, items });
    }
    return grupos;
}

/* ── Estilos: el registro de la carta de pago ─────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.mx{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.mx *,.mx-capa *{box-sizing:border-box}
.mx-filete-top{height:4px;background:var(--filete)}
.mx-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.mx-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.mx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.mx-logo{height:26px;width:auto;display:block}
.mx-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em}
.mx-hola{font-size:15px;color:var(--gris);margin:0 2px}
.mx-hola b{color:var(--tinta);font-weight:600}
.mx-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.mx-h1{font-size:40px;line-height:1.14;margin:6px 2px 0}
.mx-h2{font-size:30px;line-height:1.05;margin:0}
.mx-h3{font-size:24px;line-height:1.08;margin:0}
.mx-mark{background:var(--lima);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.mx-sub{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 2px 0}
.mx-stack > * + *{margin-top:14px}
.mx-stack{margin-top:22px}
.mx-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden}
.mx-pad{padding:22px 20px}
.mx-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.mx-eyebrow-verde{color:var(--verde-txt)}
.mx-eyebrow-gris{color:var(--gris)}
.mx-fila-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mx-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.mx-chip-verde{background:rgba(177,209,62,.18);color:var(--verde-txt)}
.mx-chip-gris{background:var(--crema);color:var(--gris);border:1px solid var(--linea);padding:0 10px}
.mx-importe{font-size:72px;line-height:.95;margin:14px 0 0;display:flex;align-items:baseline;white-space:nowrap}
.mx-cent{font-size:34px;margin-left:2px}
.mx-meta{margin:12px 0 0;font-size:14px;color:var(--gris);line-height:1.5}
.mx-meta b{color:var(--tinta);font-weight:600}
.mx-meta-verde{color:var(--verde-txt);font-weight:600}
.mx-meta-verde b{color:var(--verde-txt)}
.mx-filete{height:6px;background:var(--filete)}
.mx-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.mx-extra{display:flex;gap:12px;align-items:flex-start;margin-top:18px;padding:14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:14px;line-height:1.5;color:#3b3e45}
.mx-extra b{color:var(--tinta);font-weight:700}
.mx-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.mx-tile-verde{background:rgba(177,209,62,.2);color:var(--verde-txt)}
.mx-tile-naranja{background:rgba(255,160,0,.16);color:#8a4b00}
.mx-tile-crema{background:var(--crema);border:1px solid var(--linea);color:var(--tinta)}
.mx-tile-tinta{background:var(--tinta);color:#fff}
/* botones */
.mx-btns{display:grid;gap:10px;margin-top:18px}
.mx-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16px/1.2 'Inter',sans-serif;text-decoration:none;transition:transform .12s ease,box-shadow .2s ease,background-color .2s ease,filter .2s ease,border-color .2s ease}
.mx-btn:active{transform:scale(.98)}
.mx-btn:disabled{opacity:.6;cursor:default;transform:none}
.mx-btn:focus-visible,.mx-link:focus-visible,.mx-tile:focus-visible,.mx-copy:focus-visible,.mx-cerrar:focus-visible,.mx-doc:focus-visible,.mx-faq-q:focus-visible,.mx-renta-fila:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.mx-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.mx-btn-pri:hover{filter:brightness(1.04)}
.mx-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.mx-btn-sec:hover{border-color:rgba(20,17,17,.3)}
.mx-btn-ok{background:rgba(177,209,62,.22);color:var(--verde-txt);box-shadow:none}
.mx-link{appearance:none;background:none;border:0;cursor:pointer;min-height:44px;padding:0 2px;font:700 14px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.3);border-radius:8px;display:inline-flex;align-items:center;gap:6px}
/* estado */
.mx-pasos{display:flex;gap:5px;margin:16px 0 0}
.mx-paso{flex:1;height:8px;border-radius:999px;background:#eeece8;overflow:hidden;position:relative}
.mx-paso i{position:absolute;inset:0;background:var(--filete);background-size:600% 100%}
.mx-paso-actual i{opacity:.55;animation:mx-latido 1.8s ease-in-out infinite}
.mx-hito{font-size:26px;line-height:1.08;margin:16px 0 0}
.mx-micro{font-size:14.5px;line-height:1.55;color:var(--gris);margin:6px 0 0}
.mx-sig{font-size:13px;color:var(--gris2);margin:10px 0 0}
.mx-sig b{color:var(--tinta);font-weight:600}
.mx-aviso{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.mx-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.mx-aviso-ambar .mx-ico-tile{background:#ffe9bd;color:#7a4b00}
.mx-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.mx-aviso-ok .mx-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.mx-aviso b{font-weight:700}
.mx-aviso ul{margin:6px 0 0;padding:0 0 0 18px}
.mx-aviso li{margin:2px 0}
/* renta (portada) */
.mx-renta-hero{padding:26px 20px 20px}
.mx-renta-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
.mx-renta-ico{width:48px;height:48px;border-radius:16px}
.mx-prev{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}
.mx-prev > div{background:var(--crema);border:1px solid var(--linea);border-radius:14px;padding:10px 10px 11px;min-width:0}
.mx-prev span{display:block;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.mx-prev b{display:flex;align-items:center;gap:4px;font-family:'Antonio','Inter',sans-serif;font-weight:700;font-size:24px;line-height:1.1;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-prev .mx-prev-peq{font-size:19px}
.mx-renta-fila{appearance:none;width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:14px;padding:16px 16px 16px 18px;min-height:72px;background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:0 1px 2px rgba(20,17,17,.04);color:var(--tinta);font:inherit}
.mx-renta-fila:hover{border-color:rgba(20,17,17,.18)}
.mx-renta-fila b{display:block;font-size:15.5px;font-weight:700}
.mx-renta-fila small{display:block;font-size:13px;color:var(--gris);margin-top:2px;line-height:1.4}
/* accesos */
.mx-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mx-tile{appearance:none;-webkit-tap-highlight-color:transparent;position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-height:118px;padding:16px;text-align:left;cursor:pointer;text-decoration:none;
  background:#fff;border:1px solid var(--linea);border-radius:20px;box-shadow:0 1px 2px rgba(20,17,17,.04);color:var(--tinta);font:inherit;transition:border-color .2s ease,transform .12s ease}
.mx-tile:hover{border-color:rgba(20,17,17,.2)}
.mx-tile:active{transform:scale(.98)}
.mx-tile b{display:block;font-size:15px;font-weight:700;line-height:1.25}
.mx-tile small{display:block;font-size:12.5px;color:var(--gris);margin-top:3px;line-height:1.35}
.mx-tile-alerta{border-color:rgba(255,160,0,.55);box-shadow:0 0 0 3px rgba(255,160,0,.12)}
.mx-badge{position:absolute;top:12px;right:12px;min-width:24px;height:24px;padding:0 7px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:800}
.mx-badge-naranja{background:var(--naranja);color:#08090c}
.mx-badge-gris{background:var(--crema);color:var(--gris);border:1px solid var(--linea)}
/* firma */
.mx-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.mx-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.mx-firma b{display:block;font-size:15px;font-weight:700}
.mx-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.mx-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
/* ventana */
.mx-capa{position:fixed;inset:0;z-index:100;background:rgba(20,17,17,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:mx-fade .2s ease both;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--tinta)}
.mx-sheet{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;outline:none;width:100%;max-height:92vh;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;background:var(--crema);color:var(--tinta);border-radius:24px 24px 0 0;box-shadow:0 -10px 40px -10px rgba(20,17,17,.25);animation:mx-sube .32s cubic-bezier(.2,.8,.2,1) both;padding-bottom:env(safe-area-inset-bottom)}
.mx-sheet.mx-sheet-oscura{color-scheme:dark;color:#fff;background:rgb(var(--bkg-surface))}
.mx-sheet-oscura .mx-sheet-head{background:rgb(var(--bkg-surface))}
.mx-sheet-head{position:sticky;top:0;z-index:2;background:var(--crema);padding:10px 16px 12px 20px;border-bottom:1px solid var(--linea)}
.mx-sheet-oscura .mx-sheet-head{border-bottom-color:rgba(255,255,255,.08)}
.mx-asa{width:40px;height:5px;border-radius:999px;background:rgba(20,17,17,.16);margin:0 auto 10px}
.mx-sheet-oscura .mx-asa{background:rgba(255,255,255,.2)}
.mx-sheet-tit{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mx-sheet-tit h2{font-size:26px;line-height:1.05;margin:0}
.mx-sheet-oscura .mx-sheet-tit h2{color:#fff}
.mx-cerrar{flex:none;appearance:none;width:44px;height:44px;border-radius:999px;border:1px solid var(--linea);background:#fff;color:var(--tinta);display:grid;place-items:center;cursor:pointer}
.mx-sheet-oscura .mx-cerrar{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12);color:#fff}
.mx-sheet-body{padding:18px 16px 28px}
.mx-sheet-body > * + *{margin-top:14px}
.mx-sec{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris);margin:26px 4px 10px}
.mx-sec:first-child{margin-top:4px}
/* documentos */
.mx-grupo{background:#fff;border:1px solid var(--linea);border-radius:20px;padding:14px;box-shadow:0 1px 2px rgba(20,17,17,.04)}
.mx-grupo + .mx-grupo{margin-top:10px}
.mx-grupo-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.mx-grupo-top b{display:block;font-size:15px;font-weight:700;line-height:1.25}
.mx-grupo-top small{display:block;font-size:12.5px;color:var(--gris);margin-top:1px}
.mx-trio{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mx-doc{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;gap:10px;min-height:52px;padding:0 14px;border-radius:14px;background:var(--crema);border:1px solid var(--linea);color:var(--tinta);text-decoration:none;font:600 14.5px/1.25 'Inter',sans-serif;cursor:pointer;transition:border-color .2s ease,background-color .2s ease}
.mx-doc:hover{border-color:rgba(20,17,17,.22);background:#fff}
.mx-doc + .mx-doc{margin-top:8px}
.mx-doc span{flex:1;min-width:0}
.mx-doc svg{flex:none}
.mx-doc-vert{flex-direction:column;justify-content:center;gap:6px;min-height:76px;padding:10px 6px;text-align:center;font-size:13.5px}
.mx-doc-vert + .mx-doc-vert{margin-top:0}
.mx-doc-vert span{flex:none}
.mx-doc-cerrado{cursor:default;background:#f4f2ee;color:var(--gris2);border-style:dashed}
.mx-doc-cerrado:hover{border-color:var(--linea);background:#f4f2ee}
.mx-nota-cerrado{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:12.5px;line-height:1.45;color:var(--gris)}
/* renta (ventana) */
.mx-ded{position:relative;overflow:hidden;background:#fff;border:1px solid var(--linea);border-radius:24px;padding:22px 20px 20px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10)}
.mx-ded-pct{font-size:76px;line-height:.95;margin:10px 0 0;display:flex;align-items:baseline;gap:6px}
.mx-ded-pct small{font-size:40px}
.mx-ded-nom{font-size:15px;font-weight:600;line-height:1.4;margin:10px 0 0}
.mx-ded-nota{font-size:13.5px;color:var(--gris);margin:4px 0 0;line-height:1.45}
.mx-ad{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:6px}
.mx-ad-card{background:#fff;border:1px solid var(--linea);border-radius:20px;padding:14px 12px 10px;min-width:0;box-shadow:0 1px 2px rgba(20,17,17,.04)}
.mx-ad-flecha{display:grid;place-items:center;color:var(--gris2)}
.mx-ad-k{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.mx-letra{width:72px;height:72px;border-radius:18px;display:grid;place-items:center;font-family:'Antonio','Inter',sans-serif;font-weight:700;font-size:50px;line-height:1;margin:10px 0 12px}
.mx-valor-grande{font-family:'Antonio','Inter',sans-serif;font-weight:700;font-size:34px;line-height:1.05;margin:10px 0 12px}
.mx-ad-dato{display:flex;align-items:center;justify-content:space-between;gap:4px;border-top:1px solid var(--linea);padding:6px 0 0;margin-top:6px}
.mx-ad-dato > div{min-width:0}
.mx-ad-dato small{display:block;font-size:11px;color:var(--gris);line-height:1.3}
.mx-ad-dato b{display:block;font-size:15.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.mx-rotulo{font-size:12.5px;color:var(--gris);line-height:1.45;margin:10px 4px 0}
.mx-ruta{list-style:none;margin:0;padding:6px 16px;background:#fff;border:1px solid var(--linea);border-radius:20px}
.mx-ruta li{position:relative;display:flex;gap:12px;align-items:flex-start;padding:10px 0;font-size:14.5px;line-height:1.45;color:#3b3e45}
.mx-ruta li + li{border-top:1px solid var(--linea)}
.mx-ruta-n{flex:none;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:var(--crema);border:1px solid var(--linea);font-size:12.5px;font-weight:800;color:var(--tinta);margin-top:-2px}
.mx-ruta-ult{color:var(--tinta)!important;font-weight:700}
.mx-ruta-ult .mx-ruta-n{background:var(--naranja);border-color:var(--naranja);color:#08090c}
.mx-datos{background:#fff;border:1px solid var(--linea);border-radius:20px;overflow:hidden}
.mx-dato{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;min-height:64px}
.mx-dato + .mx-dato{border-top:1px solid var(--linea)}
.mx-dato > div{flex:1;min-width:0}
.mx-dato small{display:block;font-size:12.5px;color:var(--gris);line-height:1.35}
.mx-dato b{display:block;font-size:15.5px;font-weight:700;line-height:1.35;margin-top:2px;overflow-wrap:anywhere}
.mx-dato .mx-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.01em}
.mx-dato .mx-hueco{color:#8a5a00;font-weight:600}
.mx-copy{appearance:none;-webkit-tap-highlight-color:transparent;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;height:44px;padding:0 12px;border-radius:12px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);font:700 13.5px 'Inter',sans-serif;cursor:pointer;transition:background-color .2s ease,border-color .2s ease,color .2s ease}
.mx-copy:hover{border-color:rgba(20,17,17,.3)}
.mx-copy-ico{padding:0;width:40px;min-width:40px;height:40px}
.mx-copy-ok{background:rgba(177,209,62,.22);border-color:rgba(177,209,62,.6);color:var(--verde-txt)}
.mx-letra-pie{font-size:12.5px;color:var(--gris);line-height:1.45;margin:12px 4px 0}
.mx-legal{font-size:12.5px;color:var(--gris2);line-height:1.5;margin:18px 4px 0}
/* dudas */
.mx-faq{background:#fff;border:1px solid var(--linea);border-radius:18px;overflow:hidden}
.mx-faq + .mx-faq{margin-top:10px}
.mx-faq-q{appearance:none;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:56px;padding:12px 14px 12px 16px;background:none;border:0;cursor:pointer;text-align:left;font:600 15px/1.35 'Inter',sans-serif;color:var(--tinta)}
.mx-faq-q svg{flex:none;transition:transform .2s ease;color:var(--gris)}
.mx-faq-abierta .mx-faq-q svg{transform:rotate(180deg)}
.mx-faq-a{padding:0 16px 16px;font-size:14.5px;line-height:1.6;color:#3b3e45}
/* aviso flotante */
.mx-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:120;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:12px 16px;border-radius:14px;background:var(--tinta,#141111);color:#fff;font:600 14px/1.35 'Inter',sans-serif;box-shadow:0 12px 30px -10px rgba(20,17,17,.5);animation:mx-toast .25s cubic-bezier(.2,.8,.2,1) both}
.mx-toast svg{flex:none;color:#c7f601}
.mx-toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* esqueleto y entradas */
.mx-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:mx-shim 1.3s linear infinite;border-radius:24px}
.mx-spin{animation:mx-rot .8s linear infinite}
.mx-in{animation:mx-up .55s cubic-bezier(.2,.8,.2,1) both}
.mx-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes mx-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes mx-sube{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes mx-fade{from{opacity:0}to{opacity:1}}
@keyframes mx-toast{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes mx-shim{to{background-position:-200% 0}}
@keyframes mx-rot{to{transform:rotate(360deg)}}
@keyframes mx-latido{0%,100%{opacity:.4}50%{opacity:.8}}
@media (max-width:360px){.mx-importe{font-size:60px}.mx-cent{font-size:28px}.mx-h1{font-size:34px}.mx-h2{font-size:27px}.mx-letra{width:60px;height:60px;font-size:42px}.mx-prev b{font-size:21px}}
@media (min-width:640px){
  .mx-capa{align-items:center;padding:24px}
  .mx-sheet{max-width:600px;border-radius:24px;max-height:88vh}
  .mx-sheet-body{padding:20px 24px 28px}
  .mx-sheet-head{padding:16px 18px 14px 24px}
  .mx-asa{display:none}
}
@media (min-width:768px){.mx-col{max-width:560px;padding-top:40px}.mx-pad{padding:26px 26px}.mx-renta-hero{padding:28px 26px 24px}.mx-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){
  .mx-in,.mx-sk,.mx-spin,.mx-sheet,.mx-capa,.mx-toast,.mx-paso-actual i{animation:none}
  .mx-btn,.mx-tile{transition:none}
}
`;

/* ── Iconos (trazo, 24×24) ─────────────────────────────────────────────────── */

const Ico = ({ d, size = 20, sw = 2, children, ...p }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
        {d ? <path d={d} /> : children}
    </svg>
);
const IcoCheck = (p) => <Ico d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
const IcoFlecha = (p) => <Ico d="M5 12h14M13 6l6 6-6 6" {...p} />;
const IcoChevron = (p) => <Ico d="M9 6l6 6-6 6" {...p} />;
const IcoAbajo = (p) => <Ico d="M6 9l6 6 6-6" {...p} />;
const IcoX = (p) => <Ico d="M6 6l12 12M18 6L6 18" {...p} />;
const IcoMas = (p) => <Ico d="M12 5v14M5 12h14" {...p} />;
const IcoDescarga = (p) => <Ico {...p}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Ico>;
const IcoCopiar = (p) => <Ico {...p}><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></Ico>;
const IcoCandado = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Ico>;
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoReloj = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>;
const IcoRecibo = (p) => <Ico {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Ico>;
const IcoCarpeta = (p) => <Ico {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><path d="M3 10h18" /></Ico>;
const IcoCamara = (p) => <Ico {...p}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.5" /></Ico>;
const IcoAyuda = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4" /><path d="M12 16.8v.01" /></Ico>;
const IcoChat = (p) => <Ico {...p}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" /><path d="M8.5 10.5h7M8.5 13.5h4.5" /></Ico>;
const IcoDoc = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Ico>;
const IcoCasa = (p) => <Ico {...p}><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Ico>;
const IcoHoja = (p) => <Ico {...p}><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></Ico>;
const IcoSello = (p) => <Ico {...p}><circle cx="12" cy="9" r="5.5" /><path d="M9 13.8L7.5 21l4.5-2.5 4.5 2.5-1.5-7.2" /></Ico>;
const IcoFirma = (p) => <Ico {...p}><path d="M4 18c2.5-3 4-8 6-8s0 6 2 6 2.5-3 4-3 1.5 2 4 2" /><path d="M4 21h16" /></Ico>;
const IcoGuia = (p) => <Ico {...p}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></Ico>;
const IcoArchivo = (p) => <Ico {...p}><rect x="3.5" y="4" width="17" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></Ico>;
const ICONOS_GRUPO = { casa: IcoCasa, hoja: IcoHoja, recibo: IcoRecibo, guia: IcoGuia, sello: IcoSello, firma: IcoFirma };

const Spinner = ({ size = 18 }) => (
    <svg className="mx-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/* ── Letra de la calificación ─────────────────────────────────────────────── */

// Colores de la etiqueta energética, oscurecidos lo justo para el contraste AA
// (texto grande): A–B y G con texto blanco; C–F con tinta.
const LETRAS = {
    A: ['#1e8a3a', '#fff'], B: ['#3d9a35', '#fff'], C: ['#9cc23a', '#141111'], D: ['#f2d81b', '#141111'],
    E: ['#f2b01e', '#141111'], F: ['#e8771f', '#141111'], G: ['#d7282f', '#fff'],
};
const Letra = ({ l, className = 'mx-letra', style }) => {
    const [bg, fg] = LETRAS[String(l || '').toUpperCase()] || ['#eeece8', '#55585f'];
    return <span className={className} style={{ background: bg, color: fg, ...style }} aria-label={`Letra ${l}`}>{l}</span>;
};

/* ── Copiar al portapapeles (con respaldo para http y navegadores viejos) ─── */

async function alPortapapeles(texto) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch { /* cae al respaldo */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, texto.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function BotonCopiar({ texto, id, copiado, onCopiar, soloIcono = false, etiqueta }) {
    if (!texto) return null;
    const ok = copiado === id;
    return (
        <button type="button" className={`mx-copy${soloIcono ? ' mx-copy-ico' : ''}${ok ? ' mx-copy-ok' : ''}`}
            onClick={() => onCopiar(texto, id)} aria-label={ok ? 'Copiado' : `Copiar ${etiqueta || texto}`}>
            {ok ? <IcoCheck size={17} sw={2.8} /> : <IcoCopiar size={17} />}
            {!soloIcono && <span>{ok ? 'Copiado' : 'Copiar'}</span>}
        </button>
    );
}

/* ── Piezas ────────────────────────────────────────────────────────────────── */

function Firma() {
    return (
        <footer>
            <div className="mx-firma">
                <img className="mx-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                <div>
                    <b>Fran Moya</b>
                    <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                </div>
            </div>
            <p className="mx-pie">BROKERGY · Ingeniería Energética</p>
        </footer>
    );
}

/** El ZIP con todo: se pide por fetch para poder decir «Preparando…» (tarda unos segundos). */
function BotonZip({ url, nombre, variante = 'pri', onAviso }) {
    const [estado, setEstado] = useState('libre');   // libre · preparando · hecho
    const bajar = async () => {
        if (estado === 'preparando') return;
        setEstado('preparando');
        try {
            const r = await fetch(url);
            if (!r.ok) {
                let msg = 'No hemos podido preparar el ZIP. Descarga los documentos uno a uno.';
                try { msg = (await r.json()).error || msg; } catch { /* sin cuerpo */ }
                throw new Error(msg);
            }
            const blob = await r.blob();
            const href = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = href;
            a.download = nombre;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 30000);
            setEstado('hecho');
            onAviso?.('ZIP descargado');
            setTimeout(() => setEstado('libre'), 3500);
        } catch (e) {
            setEstado('libre');
            onAviso?.(e.message || 'No hemos podido preparar el ZIP.');
        }
    };
    return (
        <button type="button" className={`mx-btn ${estado === 'hecho' ? 'mx-btn-pri mx-btn-ok' : variante === 'pri' ? 'mx-btn-pri' : 'mx-btn-sec'}`}
            onClick={bajar} disabled={estado === 'preparando'} aria-live="polite">
            {estado === 'preparando' ? <><Spinner />Preparando tu ZIP…</>
                : estado === 'hecho' ? <><IcoCheck size={19} sw={2.8} />Descargado</>
                : <><IcoArchivo size={19} />Descargar todo (ZIP)</>}
        </button>
    );
}

function GruposDocs({ grupos, docUrl }) {
    return grupos.map(g => {
        const Icono = ICONOS_GRUPO[g.icono] || IcoDoc;
        const cerrados = g.items.some(i => i.bloqueado);
        return (
            <div key={g.id} className="mx-grupo">
                <div className="mx-grupo-top">
                    <span className="mx-ico-tile mx-tile-crema"><Icono size={19} sw={1.9} /></span>
                    <div>
                        <b>{g.titulo}</b>
                        {g.sub && <small>{g.sub}</small>}
                    </div>
                </div>
                <div className={g.compacto ? 'mx-trio' : ''}>
                    {g.items.map(it => it.bloqueado ? (
                        <div key={it.key} className={`mx-doc mx-doc-cerrado${g.compacto ? ' mx-doc-vert' : ''}`} aria-label={`${it.label}: listo, se entrega al completar el expediente`}>
                            <IcoCandado size={17} />
                            <span>{it.label}</span>
                        </div>
                    ) : (
                        <a key={it.key} href={docUrl(it.key)} target="_blank" rel="noopener noreferrer" className={`mx-doc${g.compacto ? ' mx-doc-vert' : ''}`}>
                            {g.compacto ? <IcoDescarga size={18} /> : <IcoDoc size={18} />}
                            <span>{it.label}</span>
                            {!g.compacto && <IcoDescarga size={18} />}
                        </a>
                    ))}
                </div>
                {/* Sin enlace no es un botón desactivado: es que aún no se entrega. Y
                    se dice CUÁNDO, o el candado solo genera una llamada preguntando. */}
                {cerrados && (
                    <p className="mx-nota-cerrado"><IcoReloj size={15} />Ya está hecho. Te lo entregamos en cuanto tu expediente esté completo.</p>
                )}
            </div>
        );
    });
}

/* ── Página ────────────────────────────────────────────────────────────────── */

export function MiExpedienteView({ uuid, token }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [panel, setPanel] = useState(null);   // 'docs' | 'upload' | 'faq' | 'renta'
    const [openFaq, setOpenFaq] = useState(null);
    const [renta, setRenta] = useState(null);   // «Para tu Renta»: la guía de la deducción
    const [copiado, setCopiado] = useState(null);
    const [aviso, setAviso] = useState(null);
    const dialogoRef = useRef(null);
    const origenFoco = useRef(null);
    const temporizadores = useRef({});

    // La página es CLARA: el body de la app es oscuro y asomaría al estirar el scroll.
    useEffect(() => {
        const b = document.body.style;
        const prev = { bg: b.background, color: b.color, scheme: document.documentElement.style.colorScheme };
        const meta = document.querySelector('meta[name="theme-color"]');
        const prevMeta = meta?.getAttribute('content');
        b.background = '#faf9f7';
        b.color = '#141111';
        document.documentElement.style.colorScheme = 'light';
        meta?.setAttribute('content', '#faf9f7');
        return () => {
            b.background = prev.bg;
            b.color = prev.color;
            document.documentElement.style.colorScheme = prev.scheme;
            if (meta && prevMeta != null) meta.setAttribute('content', prevMeta);
        };
    }, []);

    useEffect(() => {
        axios.get(`${API}/expediente/${uuid}?token=${token}`)
            .then(r => setInfo(r.data))
            .catch(e => setError(e.response?.data?.error || 'No se encontró tu expediente. Vuelve a acceder desde el portal.'))
            .finally(() => setLoading(false));
    }, [uuid, token]);

    // La guía se compone leyendo los certificados: se pide al abrirla o, si ya se
    // puede abrir, en segundo plano tras pintar la portada (no la retrasa y da las
    // cifras del avance de la tarjeta).
    const rentaDisponible = !!info?.rentaDisponible;
    useEffect(() => {
        if (renta || !(panel === 'renta' || rentaDisponible)) return;
        let vivo = true;
        axios.get(`${API}/renta/${uuid}?token=${token}`)
            .then(r => { if (vivo) setRenta(r.data); })
            .catch(() => { if (vivo) setRenta({ disponible: false, motivo: 'Ahora mismo no podemos preparar tu guía. Escríbenos y te la mandamos.' }); });
        return () => { vivo = false; };
    }, [panel, renta, rentaDisponible, uuid, token]);

    // Ventana abierta: sin scroll detrás, Escape la cierra y el foco vuelve al botón.
    useEffect(() => {
        if (!panel) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => { if (e.key === 'Escape') setPanel(null); };
        window.addEventListener('keydown', onKey);
        const t = setTimeout(() => dialogoRef.current?.focus({ preventScroll: true }), 30);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', onKey);
            clearTimeout(t);
            origenFoco.current?.focus?.({ preventScroll: true });
        };
    }, [panel]);

    useEffect(() => () => Object.values(temporizadores.current).forEach(clearTimeout), []);

    const avisar = useCallback((texto) => {
        setAviso(texto);
        clearTimeout(temporizadores.current.aviso);
        temporizadores.current.aviso = setTimeout(() => setAviso(null), 2600);
    }, []);

    const copiar = useCallback(async (texto, id) => {
        const ok = await alPortapapeles(texto);
        if (ok) {
            setCopiado(id);
            clearTimeout(temporizadores.current.copia);
            temporizadores.current.copia = setTimeout(() => setCopiado(null), 1800);
            avisar(`Copiado: ${texto}`);
        } else {
            avisar('No se ha podido copiar. Mantén pulsado el dato para copiarlo.');
        }
    }, [avisar]);

    const abrir = (p) => (e) => { origenFoco.current = e?.currentTarget || null; setPanel(p); };

    const money = info?.dinero || {};
    const cobro = info?.cobro || {};
    const estado = info?.estado || {};
    const req = info?.requerimiento || {};
    const documentos = info?.documentos || [];
    // Certificados que YA existen pero aún no se entregan (hasta 'DOC. COMPLETA').
    // Se enseñan con candado: saber que su certificado está hecho es la mitad de lo
    // que el cliente viene a mirar.
    const documentosBloqueados = info?.documentosBloqueados || [];
    const queFalta = info?.queFalta || [];
    const hitoIndex = estado.hitoIndex || 1;
    // Expediente RECHAZADO: está cerrado y no es un paso de los seis, así que no
    // se pinta la barra de progreso (diría "paso 1 de 6").
    const cerrado = estado.subestado === 'cerrado';
    const pagado = !!cobro.pagado;
    // «Para tu Renta» manda en la portada cuando ya es lo que viene a buscar.
    const rentaProtagonista = !cerrado && (pagado || rentaDisponible);
    const numero = info?.identidad?.numeroExpediente;
    const docUrl = (k) => `${API}/doc/${uuid}/${k}?token=${token}`;
    const zipUrl = `${API}/zip/${uuid}?token=${token}`;
    const zipNombre = `${numero || 'Mi expediente'} - Documentos BROKERGY.zip`;
    const hayDescargas = documentos.length > 0 || rentaDisponible;

    const pendMsg = cerrado
        ? 'Tu expediente está cerrado.'
        : estado.subestado === 'finalizado'
            ? 'Tu expediente está finalizado.'
            : estado.responsable === 'CERTIFICADOR'
                ? 'El certificador está trabajando en tu certificado. No necesitas hacer nada ahora.'
                : 'No necesitas hacer nada por ahora. Te avisaremos cuando te toque a ti.';

    const titulo = cerrado ? <>Tu expediente</>
        : pagado ? <>Tu Bono CAE ya está <span className="mx-mark">en tu cuenta</span></>
            : rentaDisponible ? <>Tu documentación, <span className="mx-mark">lista</span> para la Renta</>
                : queFalta.length ? <>Tu expediente <span className="mx-mark">te necesita</span></>
                    : <>Tu reforma, <span className="mx-mark">en marcha</span></>;

    const resumen = renta?.disponible ? renta.resumen : null;
    const cantidadFila = resumen?.filas?.find(f => /^Cantidades satisfechas/.test(f.k));

    /* ── Tarjetas de la portada ── */

    const tarjetaDinero = (
        <section key="dinero" className="mx-card mx-in" style={{ animationDelay: '60ms' }} aria-labelledby="mx-dinero">
            <div className="mx-pad" style={{ paddingBottom: 20 }}>
                {pagado ? (
                    <>
                        <div className="mx-fila-top">
                            <span id="mx-dinero" className="mx-eyebrow mx-eyebrow-verde">Bono CAE cobrado</span>
                            <span className="mx-chip mx-chip-verde"><IcoCheck size={13} sw={3.2} />Transferido</span>
                        </div>
                        {cobro.importe != null ? (() => {
                            const t = eur2(cobro.importe);
                            const i = t.lastIndexOf(',');
                            return (
                                <div className="mx-display mx-importe" style={{ color: 'var(--verde-txt)' }} aria-label={t}>
                                    <span>{t.slice(0, i)}</span><span className="mx-cent">{t.slice(i)}</span>
                                </div>
                            );
                        })() : <div className="mx-display mx-importe">Cobrado</div>}
                        <p className="mx-meta mx-meta-verde">{fechaCorta(cobro.fecha) ? <>Transferido el <b>{fechaCorta(cobro.fecha)}</b></> : 'Transferido a tu cuenta'}</p>
                    </>
                ) : (
                    <>
                        <div className="mx-fila-top">
                            <span id="mx-dinero" className="mx-eyebrow">Bono CAE que cobrarás</span>
                            {money.bonoCae != null && <span className="mx-chip mx-chip-gris">Estimado</span>}
                        </div>
                        {money.bonoCae != null ? (
                            <>
                                <div className="mx-display mx-importe">{eur(money.bonoCae)}</div>
                                <p className="mx-meta">Te lo transferimos cuando se emita el CAE.</p>
                            </>
                        ) : (
                            <p className="mx-meta" style={{ fontSize: 15 }}>Estamos calculando tu bono. Te lo confirmaremos pronto.</p>
                        )}
                    </>
                )}

                {money.deduccionIrpf ? (
                    <div className="mx-extra">
                        <span className="mx-ico-tile mx-tile-verde" style={{ width: 34, height: 34, borderRadius: 10 }}><IcoMas size={18} sw={2.6} /></span>
                        <div>
                            <b>Y además, deducción en tu IRPF.</b> Si eres propietario de la vivienda y tienes retenciones, podrás deducirte hasta <b>{eur(money.deduccionIrpf)}</b> por la reforma en tu declaración.
                            {rentaDisponible && (
                                <div><button type="button" className="mx-link" onClick={abrir('renta')}>Cómo aplicarla<IcoFlecha size={15} /></button></div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
            {pagado && <div className="mx-filete" />}
        </section>
    );

    const tarjetaRenta = rentaProtagonista ? (
        <section key="renta" className="mx-card mx-in" style={{ animationDelay: '120ms' }} aria-labelledby="mx-renta">
            <div className="mx-filete-fino" />
            <div className="mx-renta-hero">
                <div className="mx-renta-top">
                    <span className="mx-ico-tile mx-tile-tinta mx-renta-ico"><IcoRecibo size={24} sw={1.8} /></span>
                    <span className="mx-chip mx-chip-verde"><IcoCheck size={13} sw={3.2} />Lista</span>
                </div>
                <h2 id="mx-renta" className="mx-display mx-h2">Para tu declaración de la Renta</h2>
                <p className="mx-sub" style={{ margin: '8px 0 0' }}>Tu deducción, dónde se marca en Renta Web y los datos exactos, listos para copiar. Con tus certificados y facturas.</p>
                {resumen?.puede && (
                    <div className="mx-prev" aria-label="Resumen de tu deducción">
                        <div><span>Deducción</span><b>{resumen.pct} %</b></div>
                        <div>
                            <span>Certificado</span>
                            {resumen.certificados?.anterior?.letra && resumen.certificados?.posterior?.letra ? (
                                <b aria-label={`De la ${resumen.certificados.anterior.letra} a la ${resumen.certificados.posterior.letra}`}>
                                    <Letra l={resumen.certificados.anterior.letra} className="" style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 18 }} />
                                    <IcoFlecha size={14} sw={2.4} />
                                    <Letra l={resumen.certificados.posterior.letra} className="" style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 18 }} />
                                </b>
                            ) : <b className="mx-prev-peq">Mejora</b>}
                        </div>
                        <div><span>Pagado</span><b className="mx-prev-peq">{cantidadFila?.copiar ? eur(Number(cantidadFila.copiar.replace(',', '.'))) : '—'}</b></div>
                    </div>
                )}
                <div className="mx-btns">
                    <button type="button" className="mx-btn mx-btn-pri" onClick={abrir('renta')}>
                        Abrir mi guía de la Renta<IcoFlecha size={19} />
                    </button>
                    {hayDescargas && <BotonZip url={zipUrl} nombre={zipNombre} variante="sec" onAviso={avisar} />}
                </div>
            </div>
        </section>
    ) : !cerrado ? (
        <button key="renta" type="button" className="mx-renta-fila mx-in" style={{ animationDelay: '180ms' }} onClick={abrir('renta')}>
            <span className="mx-ico-tile mx-tile-crema"><IcoRecibo size={20} sw={1.9} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <b>Para tu declaración de la Renta</b>
                <small>Tu guía estará aquí en cuanto la documentación de tu expediente esté completa.</small>
            </span>
            <IcoChevron size={20} />
        </button>
    ) : null;

    const tarjetaEstado = (
        <section key="estado" className="mx-card mx-pad mx-in" style={{ animationDelay: '120ms' }} aria-labelledby="mx-estado">
            <div className="mx-fila-top">
                <span id="mx-estado" className="mx-eyebrow mx-eyebrow-gris">Estado de tu expediente</span>
                {!cerrado && <span className="mx-chip mx-chip-gris">Paso {hitoIndex} de 6</span>}
            </div>
            {!cerrado && (
                <div className="mx-pasos" role="img" aria-label={`Paso ${hitoIndex} de 6: ${HITOS[hitoIndex - 1]}`}>
                    {HITOS.map((h, i) => (
                        <div key={h} className={`mx-paso${i + 1 === hitoIndex ? ' mx-paso-actual' : ''}`}>
                            {i + 1 <= hitoIndex && <i style={{ backgroundPosition: `${(i / 5) * 100}% 0` }} />}
                        </div>
                    ))}
                </div>
            )}
            <h2 className="mx-display mx-hito">{estado.hitoLabel}</h2>
            <p className="mx-micro">{estado.microcopy}</p>
            {!cerrado && hitoIndex < 6 && <p className="mx-sig">Después: <b>{HITOS[hitoIndex]}</b></p>}

            {req.activo && (
                <div className="mx-aviso mx-aviso-ambar" role="status">
                    <span className="mx-ico-tile"><IcoReloj size={19} /></span>
                    <div>{req.mensaje}</div>
                </div>
            )}

            {queFalta.length === 0 ? (
                <div className="mx-aviso mx-aviso-ok">
                    <span className="mx-ico-tile"><IcoCheck size={19} sw={2.6} /></span>
                    <div style={{ alignSelf: 'center' }}>{pendMsg}</div>
                </div>
            ) : (
                <div className="mx-aviso mx-aviso-ambar" style={{ display: 'block' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span className="mx-ico-tile"><IcoAlerta size={19} /></span>
                        <b>Te falta por aportar</b>
                    </div>
                    <ul>{queFalta.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    <div className="mx-btns" style={{ marginTop: 14 }}>
                        <button type="button" className="mx-btn mx-btn-pri" onClick={abrir('upload')}><IcoCamara size={19} />Subir ahora</button>
                    </div>
                </div>
            )}
        </section>
    );

    const orden = pagado ? [tarjetaDinero, tarjetaRenta, tarjetaEstado]
        : rentaProtagonista ? [tarjetaRenta, tarjetaDinero, tarjetaEstado]
            : [tarjetaDinero, tarjetaEstado, tarjetaRenta];

    const nDocs = documentos.length + documentosBloqueados.length;
    const panelTitle = panel === 'docs' ? 'Mis documentos' : panel === 'upload' ? 'Subir fotos y facturas' : panel === 'faq' ? 'Dudas frecuentes' : panel === 'renta' ? 'Para tu Renta' : '';

    return (
        <div className="mx">
            <style>{CSS}</style>
            <div className="mx-filete-top" />
            <div className="mx-halo" />
            <main className="mx-col">
                <header className="mx-head">
                    <img className="mx-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="mx-exp" aria-label={`Expediente ${numero}`}>{numero}</span>}
                </header>

                {loading && (
                    <div aria-busy="true" aria-label="Cargando">
                        <div className="mx-sk" style={{ height: 18, width: 140, borderRadius: 8 }} />
                        <div className="mx-sk" style={{ height: 44, width: '80%', borderRadius: 10, marginTop: 12 }} />
                        <div className="mx-sk" style={{ height: 230, marginTop: 22 }} />
                        <div className="mx-sk" style={{ height: 200, marginTop: 14 }} />
                    </div>
                )}

                {error && !loading && (
                    <div className="mx-card mx-pad mx-in" role="alert">
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <span className="mx-ico-tile" style={{ background: '#fde8e6', color: '#9b1c1c' }}><IcoAlerta size={20} /></span>
                            <div>
                                <h1 className="mx-display mx-h3">No hemos podido abrir tu expediente</h1>
                                <p className="mx-sub" style={{ margin: '6px 0 0' }}>{error}</p>
                            </div>
                        </div>
                        <div className="mx-btns">
                            <a className="mx-btn mx-btn-sec" href={`https://wa.me/${WHATSAPP_CONTACTO}`} target="_blank" rel="noopener noreferrer"><IcoChat size={19} />Escríbenos por WhatsApp</a>
                        </div>
                    </div>
                )}

                {info && !loading && (
                    <>
                        <p className="mx-hola mx-in">Hola{info.identidad?.saludo ? <>, <b>{info.identidad.saludo}</b></> : ''}</p>
                        <h1 className="mx-display mx-h1 mx-in">{titulo}</h1>

                        <div className="mx-stack">
                            {orden}

                            <nav className="mx-tiles mx-in" style={{ animationDelay: '240ms' }} aria-label="Accesos">
                                <button type="button" className="mx-tile" onClick={abrir('docs')}>
                                    <span className="mx-ico-tile mx-tile-crema"><IcoCarpeta size={20} sw={1.9} /></span>
                                    <span><b>Mis documentos</b><small>{nDocs ? `${nDocs} ${nDocs === 1 ? 'documento' : 'documentos'}` : 'Aparecerán aquí'}</small></span>
                                </button>
                                <button type="button" className={`mx-tile${queFalta.length ? ' mx-tile-alerta' : ''}`} onClick={abrir('upload')}>
                                    <span className={`mx-ico-tile ${queFalta.length ? 'mx-tile-naranja' : 'mx-tile-crema'}`}><IcoCamara size={20} sw={1.9} /></span>
                                    <span><b>Subir fotos</b><small>{queFalta.length ? `Te ${queFalta.length === 1 ? 'falta 1 cosa' : `faltan ${queFalta.length} cosas`}` : 'Fotos y facturas'}</small></span>
                                    {queFalta.length > 0 && <span className="mx-badge mx-badge-naranja" aria-hidden="true">{queFalta.length}</span>}
                                </button>
                                <button type="button" className="mx-tile" onClick={abrir('faq')}>
                                    <span className="mx-ico-tile mx-tile-crema"><IcoAyuda size={20} sw={1.9} /></span>
                                    <span><b>Dudas frecuentes</b><small>Impuestos, fases y cobro</small></span>
                                </button>
                                <a className="mx-tile" href={`https://wa.me/${WHATSAPP_CONTACTO}`} target="_blank" rel="noopener noreferrer">
                                    <span className="mx-ico-tile mx-tile-verde"><IcoChat size={20} sw={1.9} /></span>
                                    <span><b>Escríbenos</b><small>Por WhatsApp</small></span>
                                </a>
                            </nav>
                        </div>

                        <Firma />
                    </>
                )}
            </main>

            {/* VENTANA (bottom-sheet en el móvil, modal en escritorio) */}
            {panel && (
                <div className="mx-capa" onClick={() => setPanel(null)}>
                    <div className={`mx-sheet${panel === 'upload' ? ' mx-sheet-oscura' : ''}`} ref={dialogoRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mx-sheet-tit" onClick={e => e.stopPropagation()}>
                        <div className="mx-sheet-head">
                            <div className="mx-asa" aria-hidden="true" />
                            <div className="mx-sheet-tit">
                                <h2 id="mx-sheet-tit" className="mx-display">{panelTitle}</h2>
                                <button type="button" className="mx-cerrar" onClick={() => setPanel(null)} aria-label="Cerrar"><IcoX size={20} /></button>
                            </div>
                        </div>
                        <div className="mx-sheet-body">
                            {panel === 'docs' && (
                                nDocs === 0 && !rentaDisponible ? (
                                    <div className="mx-grupo" style={{ textAlign: 'center', padding: '28px 20px' }}>
                                        <span className="mx-ico-tile mx-tile-crema" style={{ margin: '0 auto 12px' }}><IcoCarpeta size={20} /></span>
                                        <p style={{ margin: 0, fontSize: 15, color: 'var(--gris)', lineHeight: 1.55 }}>Aún no hay documentos para descargar. Aparecerán aquí a medida que tu expediente avance.</p>
                                    </div>
                                ) : (
                                    <>
                                        {hayDescargas && <BotonZip url={zipUrl} nombre={zipNombre} onAviso={avisar} />}
                                        <div>
                                            <GruposDocs grupos={agruparDocs(documentos, documentosBloqueados, { conGuia: rentaDisponible })} docUrl={docUrl} />
                                        </div>
                                    </>
                                )
                            )}

                            {panel === 'renta' && (
                                <PanelRenta renta={renta} copiado={copiado} onCopiar={copiar}
                                    grupos={agruparDocs(documentos, documentosBloqueados, { soloRenta: true, conGuia: rentaDisponible })}
                                    docUrl={docUrl} zip={hayDescargas ? <BotonZip url={zipUrl} nombre={zipNombre} onAviso={avisar} /> : null} />
                            )}

                            {panel === 'upload' && (
                                <DocsManager mode="token" idOrUuid={uuid} token={token} />
                            )}

                            {panel === 'faq' && (
                                <div>
                                    {FAQS.map((f, i) => (
                                        <div key={i} className={`mx-faq${openFaq === i ? ' mx-faq-abierta' : ''}`}>
                                            <button type="button" className="mx-faq-q" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                                                {f.q}
                                                <IcoAbajo size={20} />
                                            </button>
                                            {openFaq === i && <div className="mx-faq-a">{f.a}</div>}
                                        </div>
                                    ))}
                                    <a className="mx-btn mx-btn-sec" style={{ marginTop: 16 }} href={`https://wa.me/${WHATSAPP_CONTACTO}`} target="_blank" rel="noopener noreferrer"><IcoChat size={19} />¿Otra duda? Escríbenos</a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {aviso && (
                <div className="mx-toast" role="status" aria-live="polite"><IcoCheck size={17} sw={2.8} /><span>{aviso}</span></div>
            )}
        </div>
    );
}

/**
 * «Para tu declaración de la Renta»: la MISMA guía que se le envía
 * (`resumenRentaCliente` en logic/guiaIrpf.js), en pantalla —qué deducción, dónde
 * se marca en Renta Web y los datos que pide, con sus rótulos LITERALES y un
 * «Copiar» en lo que se teclea—, la guía completa en PDF y sus papeles agrupados.
 */
function PanelRenta({ renta, copiado, onCopiar, grupos, docUrl, zip }) {
    const papeles = grupos.length ? (
        <>
            <h3 className="mx-sec">Tus documentos</h3>
            {zip}
            <div style={{ marginTop: zip ? 10 : 0 }}>
                <GruposDocs grupos={grupos} docUrl={docUrl} />
            </div>
        </>
    ) : null;

    if (!renta) {
        return (
            <div aria-busy="true" aria-label="Preparando tu guía">
                <div className="mx-sk" style={{ height: 190 }} />
                <div className="mx-sk" style={{ height: 210, marginTop: 14 }} />
                <div className="mx-sk" style={{ height: 260, marginTop: 14 }} />
            </div>
        );
    }
    const r = renta.resumen;
    if (!renta.disponible || !r?.puede) {
        return (
            <div>
                <div className="mx-grupo" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span className="mx-ico-tile mx-tile-crema"><IcoReloj size={19} /></span>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#3b3e45' }}>{renta.motivo || r?.motivo || 'Con tus certificados no hemos encontrado una deducción que aplicar. Si tienes dudas, escríbenos.'}</p>
                </div>
                {papeles}
            </div>
        );
    }
    const c = r.certificados;
    const porLetra = !!(c.anterior.letra || c.posterior.letra);
    const lado = (k, d, despues) => (
        <div className="mx-ad-card">
            <div className="mx-ad-k">{k}</div>
            {porLetra ? <Letra l={d.letra || '—'} /> : <div className="mx-valor-grande">{miles(d.valor, 2)}</div>}
            <div className="mx-ad-dato">
                <div><small>Fecha</small><b>{d.fecha || '—'}</b></div>
                <BotonCopiar texto={d.fecha} id={`fecha-${k}`} copiado={copiado} onCopiar={onCopiar} soloIcono etiqueta={`la fecha del certificado de ${despues ? 'después' : 'antes'}`} />
            </div>
            <div className="mx-ad-dato">
                <div><small>{porLetra ? 'Consumo' : 'Demanda'}</small><b>{miles(d.valor, 2)}</b></div>
                <BotonCopiar texto={paraTeclear(d.valor)} id={`valor-${k}`} copiado={copiado} onCopiar={onCopiar} soloIcono etiqueta={`el valor del certificado de ${despues ? 'después' : 'antes'}`} />
            </div>
        </div>
    );

    return (
        <div>
            <div className="mx-ded">
                <div className="mx-filete-fino" />
                <span className="mx-eyebrow mx-eyebrow-verde">Tu deducción</span>
                <div className="mx-display mx-ded-pct">{r.pct}<small>%</small></div>
                <p className="mx-ded-nom">{r.nombre}</p>
                <p className="mx-ded-nota">De lo que pagaste por la obra, IVA incluido.</p>
            </div>

            <h3 className="mx-sec">Tus certificados, antes y después</h3>
            <div className="mx-ad">
                {lado('Antes', c.anterior, false)}
                <div className="mx-ad-flecha" aria-hidden="true"><IcoFlecha size={18} sw={2.2} /></div>
                {lado('Después', c.posterior, true)}
            </div>
            <p className="mx-rotulo">{c.rotulo}. Renta Web te pide la fecha y {porLetra ? 'el consumo o la letra' : 'la demanda'} de cada certificado.</p>

            <h3 className="mx-sec">Dónde se marca en Renta Web</h3>
            <ol className="mx-ruta">
                {r.ruta.map((paso, i) => (
                    <li key={i} className={i === r.ruta.length - 1 ? 'mx-ruta-ult' : ''}>
                        <span className="mx-ruta-n">{i + 1}</span>
                        <span>{paso}</span>
                    </li>
                ))}
            </ol>

            <h3 className="mx-sec">Los datos que te va a pedir</h3>
            <dl className="mx-datos" style={{ margin: 0 }}>
                {r.filas.map((f, i) => (
                    <div key={i} className="mx-dato">
                        <div>
                            <dt><small>{f.k}</small></dt>
                            <dd style={{ margin: 0 }}>
                                {/* «NIF · empresa»: se copia el NIF, y se ve qué se copia. */}
                                {f.v && f.copiar && f.v.startsWith(`${f.copiar} · `) ? (
                                    <><b className="mx-mono">{f.copiar}</b><small style={{ marginTop: 1 }}>{f.v.slice(f.copiar.length + 3)}</small></>
                                ) : (
                                    <b className={`${f.mono ? 'mx-mono' : ''} ${f.v ? '' : 'mx-hueco'}`}>{f.v || 'Lo encontrarás en tus documentos'}</b>
                                )}
                            </dd>
                        </div>
                        <BotonCopiar texto={f.copiar} id={`fila-${i}`} copiado={copiado} onCopiar={onCopiar} etiqueta={f.k} />
                    </div>
                ))}
            </dl>

            {papeles}

            <p className="mx-legal">Es una guía orientativa con los datos de tus certificados y tus facturas. Si tienes un asesor fiscal, enséñasela: él confirma tu caso.</p>
        </div>
    );
}

export default MiExpedienteView;
