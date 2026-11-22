/**
 * FacturaObraView — /factura-obra/:expedienteId?token=
 *
 * La FACTURA DE LA OBRA hecha en la app, en la plantilla del instalador, «como su
 * ERP» (Fran, 16/11/2026, beta con RCA INSTALACIONES, 26RES060_283). El instalador
 * ve su factura ya escrita (cliente, concepto con marca/modelo/serie, inmueble,
 * referencia catastral, observaciones del IRPF) y solo pone el nº, la fecha y la
 * cantidad y el precio de cada línea, o un PRECIO TOTAL sin partidas. Los conceptos
 * se pueden corregir, quitar o añadir (18/11/2026), y la factura nueva SUSTITUYE a
 * la que ya hizo aquí o, si lo elige, a una que subió. La vista previa es el PDF DE VERDAD (lo
 * compone el servidor con su plantilla) pintado con pdf.js. «Guardar la factura»
 * la deja en el apartado «Facturas» del expediente como si la hubiera subido él, y
 * le da el PDF para descargar.
 *
 * Backend: routes/facturaInstalador.js + services/facturaInstaladorService.js.
 * Token: el `upload_token` de la oportunidad (el del enlace de subida). Lleva el
 * NIF del titular: sin token, 403.
 *
 * DISEÑO: «carta de pago» (regla 164), prefijo `.fo-`, mobile first; en el PC la
 * vista previa va al lado y FIJA mientras se baja (sticky, cabe en la pantalla); en el
 * móvil, una píldora abajo con el total abre la factura en una hoja (18/11/2026).
 * /factura-obra/demo — datos de MENTIRA, sin API.
 *
 * EMBEBIDA en la app del instalador (fase 2, 21/11/2026): la MISMA pantalla, sin
 * rediseñar. `api` cambia la base (`/api/instalador-app/obras/:obra/factura`, con
 * sesión: el token lo pone el servidor y aquí no viaja ninguno), `embebida` quita
 * el logo, el halo y la firma (los pone la cáscara) y no toca el body, y
 * `onHecha(r)` avisa a la app cuando la factura queda guardada. `alEnviar(fn)`
 * envuelve el guardado con el popup de envío de la app (SendActionOverlay, 29.b).
 * Con `expedienteId="demo"` y `embebida`, el banco de la app lo simula entero.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

const API = '/api/public/factura-instalador';
const DEMO = 'demo';
const Embebida = createContext(false);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaCorta = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const fechaLarga = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
};
const hoyIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diaSiguiente = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/**
 * «6.000,5» / «6.000» / «6000,50» / «6000.50» → número (null si vacío, NaN si no lo es).
 * Con coma, la coma es el decimal y los puntos, miles. Sin coma, un punto seguido de
 * grupos de tres cifras («6.000», «12.500.000») es de miles, como se escribe aquí;
 * si no, es el decimal. Igual que `num()` de services/facturaInstaladorService.js.
 */
const leerNum = (s) => {
    const t = String(s ?? '').trim().replace(/\s|€/g, '');
    if (!t) return null;
    const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    const n = Number(norm);
    return Number.isFinite(n) ? n : NaN;
};
const eur = (n) => `${(Math.round((n || 0) * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €`;

const vistaDemo = () => ({
    numero_expediente: '26RES060_000',
    instalador: 'INSTALACIONES DEMO',
    cliente: { nombre: 'Antonio García López', domicilio: ['CL MAYOR 1', '13000 Ciudad Real (Ciudad Real)', 'NIF: 00000000T'] },
    inmueble: 'CL MAYOR 1, 13000 CIUDAD REAL (CIUDAD REAL)',
    refCatastral: '0000000AA0000A0001AA',
    observaciones: 'Observaciones: Obra de mejora de la eficiencia energética…',
    lineas: [
        { texto: 'SUMINISTRO E INSTALACIÓN DE BOMBA DE CALOR AIRE-AGUA (AEROTERMIA) MARCA HAIER, MODELO MONO GT 16KW, Nº DE SERIE AE1F58DEMO, DE 16 KW, PARA CALEFACCIÓN, EN SUSTITUCIÓN DE LA CALDERA EXISTENTE RIMA SF-05, CONECTADA A LOS RADIADORES EXISTENTES DE LA VIVIENDA' },
        { texto: 'DESMONTAJE Y RETIRADA DE LA CALDERA EXISTENTE' },
        { texto: 'MATERIAL AUXILIAR, CONEXIONADO HIDRÁULICO Y ELÉCTRICO, PUESTA EN MARCHA Y PRUEBAS' },
    ],
    ivaPct: 21, ejemploNumero: '44/26', fechaMinima: '2026-11-12', otrasFacturas: 1, anterior: null, maxLineas: 12,
    facturas: [{ ref: 'demo', numero: '44/26', fecha: '2026-11-17', base: 5250, total: 6352.5, validada: false }],
});
const MAX_CONCEPTO = 700;

/* ── Estilos ───────────────────────────────────────────────────────────────── */

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.fo{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden;overflow-x:clip}
.fo *{box-sizing:border-box}
.fo-filete-top{height:4px;background:var(--filete)}
.fo-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.fo-col{position:relative;max-width:460px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.fo-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.fo-logo{height:26px;width:auto;display:block}
.fo-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px}
.fo-stack > * + *{margin-top:14px}
.fo-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden}
.fo-pad{padding:22px 20px}
.fo-eyebrow{display:block;font-size:11px;line-height:1.45;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.fo-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;color:var(--tinta)}
.fo-h1{font-size:38px;line-height:1.08;margin:10px 0 0}
.fo-h3{font-size:22px;line-height:1.12;margin:6px 0 0}
.fo-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .1em;border-radius:5px}
.fo-sub{font-size:15px;line-height:1.58;color:var(--gris);margin:10px 0 0}
.fo-filete{height:6px;background:var(--filete)}
.fo-cliente{margin:14px 0 0;padding:12px 14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:14px;line-height:1.5}
.fo-cliente b{display:block;font-size:15px}
.fo-campos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.fo-campo label{display:block;font-size:12.5px;font-weight:700;color:var(--gris);margin:0 0 6px}
.fo-in{width:100%;min-height:50px;padding:0 14px;border-radius:14px;border:1.5px solid rgba(20,17,17,.16);background:#fff;color:var(--tinta);font:600 16px/1.2 'Inter',sans-serif;outline:none;-webkit-appearance:none;appearance:none}
.fo-in:focus{border-color:var(--naranja);box-shadow:0 0 0 3px rgba(255,160,0,.18)}
.fo-in.mal{border-color:#e0a12b;background:#fffaf0}
.fo-in.num{text-align:right;font-variant-numeric:tabular-nums}
.fo-ayuda{font-size:12.5px;color:var(--gris2);margin:6px 2px 0;line-height:1.4}
.fo-lineas{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:12px}
.fo-linea{padding:14px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fo-linea .t{display:flex;gap:10px;font:500 12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#2a2c31;word-break:break-word}
.fo-linea .n{flex:none;font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;font-size:20px;line-height:1;color:var(--naranja-txt);min-width:16px}
.fo-linea .p{display:grid;grid-template-columns:76px 1fr;gap:10px;margin-top:12px;align-items:end}
.fo-linea .imp{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-size:13px;color:var(--gris)}
.fo-linea .imp b{font:700 17px/1 'Inter',sans-serif;color:var(--tinta);font-variant-numeric:tabular-nums}
.fo-linea .sin{color:var(--gris2);font-style:italic}
.fo-tot{display:grid;gap:0;margin-top:6px}
.fo-tot div{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--linea);font-size:14.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.fo-tot div b{color:var(--tinta)}
.fo-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px}
.fo-total span{font-size:13px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.fo-total b{font-family:'Antonio','Inter',Impact,sans-serif;font-size:40px;line-height:1;font-variant-numeric:tabular-nums}
.fo-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;margin-top:16px;padding:0 18px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75);transition:transform .12s ease}
.fo-btn:active{transform:scale(.98)}
.fo-btn[disabled]{opacity:.55;cursor:default;transform:none}
.fo-btn.sec{background:#fff;border:1.5px solid rgba(20,17,17,.16);box-shadow:none;color:var(--tinta)}
.fo-btn.ok{background:var(--verde);box-shadow:none}
.fo-btn:focus-visible,.fo-in:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.fo-pnota{font-size:13px;color:var(--gris2);text-align:center;margin:10px 0 0;line-height:1.5}
.fo-ambar{padding:14px 16px;border-radius:18px;background:#fff7e6;border:1px solid #f6dca4;color:#5c4100;font-size:14px;line-height:1.55}
.fo-ambar b{color:#3d2a00}
.fo-ambar ul{margin:6px 0 0;padding:0 0 0 18px}
.fo-modo{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:14px;padding:4px;border-radius:14px;background:var(--crema);border:1px solid var(--linea)}
.fo-modo button{appearance:none;border:0;border-radius:11px;min-height:42px;font:700 14px/1.2 'Inter',sans-serif;color:var(--gris);background:transparent;cursor:pointer}
.fo-modo button[aria-pressed="true"]{background:#fff;color:var(--tinta);box-shadow:0 1px 2px rgba(20,17,17,.08),0 4px 12px -6px rgba(20,17,17,.18)}
.fo-txt{width:100%;min-height:96px;padding:10px 12px;border-radius:12px;border:1.5px solid rgba(20,17,17,.16);background:#fff;color:var(--tinta);font:500 13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical;outline:none}
.fo-txt:focus{border-color:var(--naranja);box-shadow:0 0 0 3px rgba(255,160,0,.18)}
.fo-acc{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px}
.fo-link{appearance:none;border:0;background:none;padding:4px 0;font:700 13px/1.3 'Inter',sans-serif;color:var(--naranja-txt);cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.fo-link.gris{color:var(--gris)}
.fo-add{appearance:none;width:100%;min-height:48px;margin-top:12px;border-radius:16px;border:1.5px dashed rgba(20,17,17,.22);background:transparent;font:700 14.5px/1.2 'Inter',sans-serif;color:var(--tinta);cursor:pointer}
.fo-opc{display:grid;gap:8px;margin-top:10px}
.fo-opc label{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:14px;background:#fff;border:1.5px solid rgba(20,17,17,.14);font-size:14px;line-height:1.45;cursor:pointer}
.fo-opc label.sel{border-color:var(--naranja);box-shadow:0 0 0 3px rgba(255,160,0,.15)}
.fo-opc input{margin-top:3px;accent-color:#ffa000}
.fo-previa{background:#fff;border:1px solid var(--linea);border-radius:18px;overflow:hidden;position:relative;min-height:200px}
.fo-previa canvas{display:block;width:100%;height:auto}
.fo-previa .cargando{position:absolute;top:10px;right:10px;font-size:11.5px;font-weight:700;color:var(--gris);background:rgba(255,255,255,.92);border:1px solid var(--linea);border-radius:999px;padding:5px 10px}
.fo-hecho{text-align:center}
.fo-hecho .ico{width:64px;height:64px;border-radius:50%;margin:4px auto 10px;display:grid;place-items:center;background:#f1f8dc;color:var(--verde-txt)}
.fo-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.fo-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.fo-firma b{display:block;font-size:15px}
.fo-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.fo-piepag{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.fo-sk{background:linear-gradient(90deg,#efede9 0%,#f7f5f2 50%,#efede9 100%);background-size:200% 100%;animation:fo-shim 1.3s linear infinite;border-radius:24px}
.fo-in-anim{animation:fo-up .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes fo-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fo-shim{to{background-position:-200% 0}}
.fo-dos{display:block}
.fo-lado{margin-top:14px}
/* Móvil: la píldora con el total que abre la factura en una hoja (en el PC no hace falta: va al lado, fija). */
.fo-pildora{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));z-index:40;display:inline-flex;align-items:center;gap:10px;
  min-height:48px;padding:0 18px 0 16px;border:0;border-radius:999px;background:var(--tinta);color:#fff;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;
  box-shadow:0 10px 28px -8px rgba(20,17,17,.45);white-space:nowrap}
.fo-pildora b{font-family:'Antonio',sans-serif;font-size:17px;letter-spacing:.01em;color:var(--lima)}
.fo-pildora:focus-visible{outline:3px solid var(--naranja);outline-offset:3px}
.fo-hoja{position:fixed;inset:0;z-index:10050;background:rgba(20,17,17,.55);display:flex;align-items:flex-end;justify-content:center}
.fo-hoja-caja{background:#faf9f7;color:#141111;width:100%;max-width:640px;max-height:92vh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;animation:fo-up .28s cubic-bezier(.2,.8,.2,1) both}
.fo-hoja-cab{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(20,17,17,.08)}
.fo-hoja-cab b{font-family:'Antonio',sans-serif;font-size:20px}
.fo-hoja-cab button{min-height:44px;padding:0 16px;border-radius:999px;border:1.5px solid rgba(20,17,17,.18);background:#fff;color:#141111;font:inherit;font-weight:700;cursor:pointer}
.fo-hoja-cuerpo{overflow:auto;padding:12px 12px calc(16px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
.fo-hoja .fo-previa{background:#fff;border:1px solid rgba(20,17,17,.08)}
@media (max-width:979px){.fo-col.ancha{padding-bottom:calc(96px + env(safe-area-inset-bottom))}}
/* Embebida en la app del instalador: el papel, el margen y la barra de abajo son de la cáscara. */
.fo.fo-embebida{min-height:0;background:transparent;overflow:visible}
.fo-embebida .fo-col,.fo-embebida .fo-col.ancha{padding:0;max-width:none;margin:0}
.fo-embebida .fo-pildora{bottom:calc(96px + env(safe-area-inset-bottom))}
.fo-embebida .fo-modo button{min-height:44px}
.fo-embebida .fo-link{min-height:44px;display:inline-flex;align-items:center}
@media (min-width:1024px){.fo-embebida .fo-pildora{bottom:calc(14px + env(safe-area-inset-bottom))}}
@media (max-width:360px){.fo-h1{font-size:32px}.fo-campos{grid-template-columns:1fr}}
@media (min-width:980px){
  .fo-col.ancha{max-width:1080px;padding-top:40px}
  .fo-dos{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:24px;align-items:start}
  /* FIJA mientras se rellena, y entera en la pantalla: la hoja se encoge a lo alto que haya. */
  .fo-lado{margin-top:0;position:sticky;top:16px}
  .fo-lado .fo-previa{display:flex;justify-content:center}
  .fo-lado .fo-previa canvas{width:auto;max-width:100%;max-height:calc(100vh - 64px)}
  .fo-pad{padding:26px}
  .fo-pildora{display:none}
}
/* Embebida: las dos columnas dependen del ANCHO QUE TIENE (lo mide el componente: \`.fo-dos.pc\`),
   no de la pantalla. En la app el PC pone al lado el menú, y con la regla de la pantalla la hoja
   quedaba en una columna de ~230 px (22/11/2026). Con poco sitio se apila como en el móvil: la
   hoja debajo y la píldora. (Un \`container\` de CSS no vale: haría de la caja el marco de la
   píldora, que es \`fixed\`.) */
@media (min-width:980px){
  .fo-embebida .fo-dos{display:block}
  .fo-embebida .fo-lado{margin-top:14px;position:static}
  .fo-embebida .fo-lado .fo-previa{display:block}
  .fo-embebida .fo-lado .fo-previa canvas{width:100%;max-height:none}
  .fo-embebida .fo-pildora{display:inline-flex}
  .fo-embebida .fo-pad{padding:22px 20px}
}
.fo-embebida .fo-dos:not(.pc){max-width:720px}
.fo-embebida .fo-dos.pc{display:grid;grid-template-columns:minmax(0,460px) minmax(0,1fr);gap:24px;align-items:start}
.fo-embebida .fo-dos.pc .fo-lado{margin-top:0;position:sticky;top:16px}
.fo-embebida .fo-dos.pc .fo-lado .fo-previa{display:flex;justify-content:center}
.fo-embebida .fo-dos.pc .fo-lado .fo-previa canvas{width:auto;max-width:100%;max-height:calc(100vh - 64px)}
.fo-embebida .fo-dos.pc .fo-pad{padding:26px}
@media (prefers-reduced-motion:reduce){.fo-in-anim,.fo-sk{animation:none}.fo-btn{transition:none}}
`;

/* ── Piezas ────────────────────────────────────────────────────────────────── */

const Ico = ({ size = 20, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoCheck = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoBajar = (p) => <Ico {...p}><path d="M12 4v11" /><path d="M7 10.5l5 5 5-5" /><path d="M5 20h14" /></Ico>;

function Marco({ children, numero, ancha }) {
    const embebida = useContext(Embebida);
    if (embebida) {
        return (
            <div className="fo fo-embebida">
                <style>{CSS}</style>
                <div className={`fo-col${ancha ? ' ancha' : ''}`}>{children}</div>
            </div>
        );
    }
    return (
        <div className="fo">
            <style>{CSS}</style>
            <div className="fo-filete-top" />
            <div className="fo-halo" />
            <main className={`fo-col${ancha ? ' ancha' : ''}`}>
                <header className="fo-head">
                    <img className="fo-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {numero && <span className="fo-exp" aria-label={`Expediente ${numero}`}>{numero}</span>}
                </header>
                {children}
            </main>
        </div>
    );
}

function Firma() {
    if (useContext(Embebida)) return null;
    return (
        <footer>
            <div className="fo-firma">
                <img className="fo-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                <div>
                    <b>Fran Moya</b>
                    <span>CEO de BROKERGY</span>
                    <span>Ingeniero colegiado nº 1779 · COGITI</span>
                </div>
            </div>
            <p className="fo-piepag">BROKERGY · Ingeniería Energética</p>
        </footer>
    );
}

/** La primera página del PDF, pintada con pdf.js (se carga solo aquí).
 *  La reutiliza el presupuesto de la app del instalador (PresupuestoForm), con su
 *  propio CSS `.fo-previa` dentro de `.ia-app`: la factura no cambia. */
export function VistaPrevia({ pdf, cargando, etiqueta = 'Vista previa de la factura' }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!pdf) return undefined;
        let vivo = true;
        let tarea = null;
        (async () => {
            const { pdfjs } = await import('../../../certificadores/obra/pdfjsCarga');
            const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.slice(0)) }).promise;
            const pg = await doc.getPage(1);
            const cv = ref.current;
            if (!vivo || !cv) return;
            const ancho = cv.parentElement?.clientWidth || 600;
            const escala = (ancho * Math.min(window.devicePixelRatio || 1, 2)) / pg.getViewport({ scale: 1 }).width;
            const vp = pg.getViewport({ scale: escala });
            const tmp = document.createElement('canvas');
            tmp.width = vp.width; tmp.height = vp.height;
            tarea = pg.render({ canvasContext: tmp.getContext('2d'), viewport: vp });
            await tarea.promise;
            if (!vivo) return;
            // Se copia de golpe: así no parpadea en blanco mientras se repinta.
            cv.width = tmp.width; cv.height = tmp.height;
            cv.getContext('2d').drawImage(tmp, 0, 0);
            doc.destroy();
        })().catch(() => { /* la vista previa es una ayuda: si falla, se sigue */ });
        return () => { vivo = false; try { tarea?.cancel(); } catch { /* ya terminó */ } };
    }, [pdf]);
    return (
        <div className="fo-previa" aria-label={etiqueta}>
            <canvas ref={ref} />
            {cargando && <span className="cargando">Actualizando…</span>}
        </div>
    );
}

/** Móvil: la factura en una HOJA que sube desde abajo (portaleada a body, regla 29.b). */
function HojaPrevia({ abierta, onCerrar, total, children }) {
    useEffect(() => {
        if (!abierta) return undefined;
        const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', tecla);
        return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', tecla); };
    }, [abierta, onCerrar]);
    if (!abierta) return null;
    return createPortal(
        <div className="fo-hoja" role="dialog" aria-modal="true" aria-label="Así queda la factura"
            onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.fondo = '1'; }}
            onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1') onCerrar(); e.currentTarget.dataset.fondo = ''; }}>
            <div className="fo-hoja-caja">
                <div className="fo-hoja-cab">
                    <div><span className="fo-eyebrow">Así queda</span><b>{total}</b></div>
                    <button type="button" onClick={onCerrar}>Seguir rellenando</button>
                </div>
                <div className="fo-hoja-cuerpo">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

export function FacturaObraView({ embebida = false, ...props }) {
    return (
        <Embebida.Provider value={!!embebida}>
            <FacturaObra {...props} embebida={!!embebida} />
        </Embebida.Provider>
    );
}

function FacturaObra({ expedienteId, token, api = null, embebida = false, onHecha = null, alEnviar = (fn) => fn() }) {
    const demo = expedienteId === DEMO;
    const BASE = api || `${API}/${expedienteId}`;
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const [numero, setNumero] = useState('');
    const [fecha, setFecha] = useState('');
    const [partidas, setPartidas] = useState([]);
    // Los conceptos, editables: arrancan con los del consejo (o con los que dejó la vez anterior).
    const [conceptos, setConceptos] = useState([]);
    const [editando, setEditando] = useState(() => new Set());
    // «Por partidas» o un PRECIO TOTAL de toda la obra (Fran, 18/11/2026).
    const [modo, setModo] = useState('partidas');
    const [totalTxt, setTotalTxt] = useState('');
    // Con facturas ya SUBIDAS: si esta sustituye a una (su `ref`) o es otra ('ninguna').
    const [sustituir, setSustituir] = useState('');
    const [desborda, setDesborda] = useState(false);
    const [numeroLargo, setNumeroLargo] = useState(false); // el nº no cabe en su casilla ni encogido
    const [previa, setPrevia] = useState(null);
    const [previaCargando, setPreviaCargando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [avisos, setAvisos] = useState([]);
    const [hecha, setHecha] = useState(null);
    const [verHoja, setVerHoja] = useState(false); // móvil: la factura en una hoja
    const cerrarHoja = React.useCallback(() => setVerHoja(false), []);
    // Embebida: dos columnas solo si de verdad caben (el ancho de la caja, no el de la pantalla).
    const [anchoDos, setAnchoDos] = useState(0);
    const obsDos = useRef(null);
    const medirDos = React.useCallback((el) => {
        obsDos.current?.disconnect();
        obsDos.current = null;
        if (!el || !embebida || typeof ResizeObserver === 'undefined') return;
        // Se mide el CONTENEDOR (apilada, la propia caja va topada a 720 px).
        const ro = new ResizeObserver(([e]) => setAnchoDos(Math.round(e.contentRect.width)));
        ro.observe(el.parentElement || el);
        obsDos.current = ro;
    }, [embebida]);
    useEffect(() => () => obsDos.current?.disconnect(), []);
    const dosPc = embebida && anchoDos >= 860;

    // La vista previa va FIJA (sticky) en el PC, y un `overflow-x: hidden` en un antepasado
    // (la envoltura de App.jsx) la convierte en un scroll propio y la anula: mientras esta
    // página está abierta, ese recorte pasa a `clip`, que corta igual y no rompe el sticky.
    // Embebida no: ahí quien hace scroll es la cáscara (`.ia-main`), que ya sostiene el sticky.
    useEffect(() => {
        if (embebida) return undefined;
        const tocados = [];
        let e = document.querySelector('.fo')?.parentElement;
        while (e && e !== document.body) {
            if (getComputedStyle(e).overflowX === 'hidden') {
                tocados.push([e, e.style.overflowX, e.style.overflowY]);
                e.style.overflowX = 'clip';
                e.style.overflowY = 'visible';
            }
            e = e.parentElement;
        }
        return () => tocados.forEach(([el, x, y]) => { el.style.overflowX = x; el.style.overflowY = y; });
    }, [info, embebida]);

    // La página es CLARA: el body de la app es oscuro y asomaría al estirar el scroll.
    useEffect(() => {
        if (embebida) return undefined;
        const b = document.body.style;
        const prev = { bg: b.background, color: b.color, scheme: document.documentElement.style.colorScheme };
        b.background = '#faf9f7';
        b.color = '#141111';
        document.documentElement.style.colorScheme = 'light';
        return () => { b.background = prev.bg; b.color = prev.color; document.documentElement.style.colorScheme = prev.scheme; };
    }, [embebida]);

    // Con `api` (la app, con sesión) no viaja ningún token: lo pone el servidor.
    const q = api ? '' : `?token=${encodeURIComponent(token || '')}`;

    useEffect(() => {
        const sembrar = (d) => {
            setInfo(d);
            const a = d.anterior;
            setNumero(a?.numero || '');
            setFecha(a?.fecha || '');
            const textos = Array.isArray(a?.conceptos) && a.conceptos.length ? a.conceptos : d.lineas.map(l => l.texto);
            setConceptos(textos);
            const total = a?.modo === 'total';
            setModo(total ? 'total' : 'partidas');
            setTotalTxt(total && a?.partidas?.[0]?.precio ? String(a.partidas[0].precio).replace('.', ',') : '');
            setPartidas(textos.map((_, i) => ({
                cantidad: !total && a?.partidas?.[i]?.cantidad ? String(a.partidas[i].cantidad).replace('.', ',') : '1',
                precio: !total && a?.partidas?.[i]?.precio ? String(a.partidas[i].precio).replace('.', ',') : '',
            })));
            setSustituir(d.facturas?.length ? '' : 'ninguna');
        };
        if (demo) { sembrar(vistaDemo()); return; }
        axios.get(`${BASE}${q}`)
            .then((r) => sembrar(r.data))
            .catch((e) => setError(e.response?.data?.error || 'No hemos podido abrir esta página. Escríbenos por WhatsApp y te lo pasamos.'));
    }, [demo, BASE, q]);

    // Los conceptos solo viajan si se han cambiado: si no, el servidor usa los del consejo.
    const conceptosCambiados = !!info && (conceptos.length !== info.lineas.length || conceptos.some((t, i) => t.trim() !== info.lineas[i]?.texto));
    const cuerpo = useMemo(() => ({
        numero: numero.trim(),
        fecha,
        modo,
        partidas: partidas.map(p => ({ cantidad: leerNum(p.cantidad), precio: leerNum(p.precio) })),
        total: modo === 'total' ? leerNum(totalTxt) : null,
        ...(conceptosCambiados ? { conceptos: conceptos.map(t => t.trim()) } : {}),
        ...(sustituir ? { sustituir } : {}),
    }), [numero, fecha, modo, partidas, totalTxt, conceptosCambiados, conceptos, sustituir]);

    const lineasCalc = useMemo(() => {
        if (modo === 'total') {
            const t = cuerpo.total;
            return conceptos.map((_, i) => ({ importe: i === 0 && Number.isFinite(t) && t > 0 ? Math.round(t * 100) / 100 : 0 }));
        }
        return cuerpo.partidas.map((p) => {
            const conPrecio = Number.isFinite(p.precio) && p.precio > 0;
            const cant = conPrecio ? (Number.isFinite(p.cantidad) && p.cantidad > 0 ? p.cantidad : 1) : 0;
            return { importe: conPrecio ? Math.round(cant * p.precio * 100) / 100 : 0 };
        });
    }, [cuerpo, modo, conceptos]);
    const ivaPct = info?.ivaPct ?? 21;
    const base = Math.round(lineasCalc.reduce((s, l) => s + l.importe, 0) * 100) / 100;
    const iva = Math.round(base * ivaPct) / 100;
    const total = Math.round((base + iva) * 100) / 100;

    // Vista previa: el PDF de verdad, pedido al servidor un rato después de teclear.
    useEffect(() => {
        if (!info || demo || hecha) return undefined;
        const t = setTimeout(() => {
            setPreviaCargando(true);
            axios.post(`${BASE}/vista-previa${q}`, cuerpo, { responseType: 'arraybuffer' })
                .then((r) => {
                    setPrevia(r.data);
                    setDesborda(r.headers?.['x-factura-desborda'] === '1');
                    setNumeroLargo(r.headers?.['x-factura-numero-largo'] === '1');
                })
                .catch(() => { /* sin vista previa se puede seguir */ })
                .finally(() => setPreviaCargando(false));
        }, 650);
        return () => clearTimeout(t);
    }, [info, demo, hecha, BASE, q, cuerpo]);

    const fechaMin = info?.fechaMinima ? diaSiguiente(info.fechaMinima) : '';
    const problemas = [];
    if (info) {
        if (!cuerpo.numero) problemas.push('el número de factura');
        if (!fecha) problemas.push('la fecha');
        if (!conceptos[0]?.trim()) problemas.push('el concepto de la línea 1');
        if (modo === 'total') { if (!(lineasCalc[0]?.importe > 0)) problemas.push('el precio total'); }
        else if (!(lineasCalc[0]?.importe > 0)) problemas.push('el precio de la bomba de calor (línea 1)');
        if (!sustituir) problemas.push('si sustituye a la factura que ya subiste');
    }
    const fechaMal = !!fecha && ((fechaMin && fecha < fechaMin) || fecha > hoyIso());
    const numMal = modo === 'total'
        ? Number.isNaN(cuerpo.total)
        : cuerpo.partidas.some(p => Number.isNaN(p.precio) || Number.isNaN(p.cantidad));
    const largo = conceptos.some(t => t.length > MAX_CONCEPTO);

    const guardar = async () => {
        setAvisos([]);
        if (demo && !embebida) { setHecha({ numero: cuerpo.numero || '44/26', total, pdf: null, sustituida: sustituir !== 'ninguna', sustituidas: sustituir !== 'ninguna' ? ['44/26'] : [] }); return; }
        setEnviando(true);
        try {
            // Embebida en la app, el envío va con el popup de la app (`alEnviar`); en
            // el banco de pruebas (`demo`) se simula sin tocar la API.
            const r = await alEnviar(() => (demo
                ? new Promise((ok) => setTimeout(() => ok({ data: { numero: cuerpo.numero || '44/26', total, pdf: null, sustituida: sustituir !== 'ninguna', sustituidas: sustituir !== 'ninguna' ? ['44/26'] : [] } }), 600))
                : axios.post(`${BASE}/generar${q}`, cuerpo)));
            setHecha(r.data);
            if (onHecha) onHecha(r.data);
            if (embebida) document.getElementById('ia-main')?.scrollTo?.({ top: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            const d = e.response?.data || {};
            setAvisos(d.errores || [d.error || 'No se ha podido guardar. Inténtalo en un momento.']);
        } finally {
            setEnviando(false);
        }
    };

    const descargar = () => {
        if (!hecha?.pdf) return;
        const bin = atob(hecha.pdf);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = hecha.fileName || `Factura ${String(hecha.numero).replace(/\//g, '-')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    if (error) {
        return (
            <Marco>
                <div className="fo-card fo-pad fo-in-anim" role="alert">
                    <h1 className="fo-display fo-h3">Algo no ha ido bien</h1>
                    <p className="fo-sub" style={{ marginTop: 6 }}>{error}</p>
                </div>
                <Firma />
            </Marco>
        );
    }

    if (!info) {
        return (
            <Marco>
                <div aria-busy="true" aria-label="Cargando">
                    <div className="fo-sk" style={{ height: 18, width: 120, borderRadius: 8, marginBottom: 14 }} />
                    <div className="fo-sk" style={{ height: 300 }} />
                    <div className="fo-sk" style={{ height: 420, marginTop: 14 }} />
                </div>
            </Marco>
        );
    }

    if (hecha) {
        return (
            <Marco numero={info.numero_expediente}>
                <section className="fo-card fo-in-anim">
                    <div className="fo-pad fo-hecho">
                        <div className="ico"><IcoCheck size={32} sw={2.6} /></div>
                        <span className="fo-eyebrow">Factura guardada</span>
                        <h1 className="fo-display fo-h1">Factura <span className="fo-mark">{hecha.numero}</span></h1>
                        <p className="fo-sub">
                            {hecha.sustituida
                                ? (hecha.sustituidas?.length ? `Sustituye a la factura ${hecha.sustituidas.join(' y a la ')}. ` : 'Ha sustituido a la que hiciste antes. ')
                                : ''}
                            Ya la tenemos en el expediente de {info.cliente.nombre}, por {eur(hecha.total)} IVA incluido. No hace falta que nos la mandes.
                        </p>
                        {hecha.pdf && (
                            <button type="button" className="fo-btn" onClick={descargar}><IcoBajar size={20} />Descargar el PDF</button>
                        )}
                        <p className="fo-pnota">Guárdala en tu contabilidad como cualquier otra factura tuya. Si hay que cambiar algo, vuelve a abrir este enlace.</p>
                    </div>
                    <div className="fo-filete" />
                </section>
                <Firma />
            </Marco>
        );
    }

    const set = (i, k, v) => setPartidas((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    const setConcepto = (i, v) => setConceptos((cs) => cs.map((t, j) => (j === i ? v : t)));
    const alternarEdicion = (i) => setEditando((e) => { const n = new Set(e); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    const quitar = (i) => {
        setConceptos((cs) => cs.filter((_, j) => j !== i));
        setPartidas((ps) => ps.filter((_, j) => j !== i));
        setEditando((e) => new Set([...e].filter(j => j !== i).map(j => (j > i ? j - 1 : j))));
    };
    const anadir = () => {
        const i = conceptos.length;
        setConceptos((cs) => [...cs, '']);
        setPartidas((ps) => [...ps, { cantidad: '1', precio: '' }]);
        setEditando((e) => new Set([...e, i]));
    };
    const restaurar = () => {
        setConceptos(info.lineas.map(l => l.texto));
        setPartidas((ps) => info.lineas.map((_, i) => ps[i] || { cantidad: '1', precio: '' }));
        setEditando(new Set());
    };
    // Al elegir la factura subida que se sustituye, se traen su nº, su fecha y, si aún no
    // hay precios, su importe como precio total (Fran: la de 283 iba así).
    const elegirSustituir = (ref) => {
        setSustituir(ref);
        const f = info.facturas?.find(x => x.ref === ref);
        if (!f) return;
        if (!numero.trim() && f.numero) setNumero(f.numero);
        if (!fecha && f.fecha) setFecha(f.fecha.slice(0, 10));
        const sinPrecios = !totalTxt.trim() && partidas.every(p => !String(p.precio).trim());
        if (sinPrecios && Number(f.base) > 0) { setModo('total'); setTotalTxt(String(f.base).replace('.', ',')); }
    };
    const maxLineas = info.maxLineas || 12;

    return (
        <Marco numero={info.numero_expediente} ancha>
            <div className={`fo-dos${dosPc ? ' pc' : ''}`} ref={medirDos}>
                <div className="fo-stack">
                    <section className="fo-card fo-in-anim">
                        <div className="fo-pad">
                            <span className="fo-eyebrow">Factura de la obra</span>
                            <h1 className="fo-display fo-h1">Tu factura, <span className="fo-mark">ya escrita</span></h1>
                            <p className="fo-sub">
                                La tienes en tu plantilla con el cliente y el concepto que pide la auditoría del CAE.
                                Solo pon el número, la fecha y los precios: el IVA y el total salen solos.
                            </p>
                            {info.anterior && (
                                <div className="fo-ambar" style={{ marginTop: 14 }}>
                                    Ya hiciste aquí la factura <b>{info.anterior.numero}</b>{info.anterior.fecha ? ` del ${fechaCorta(info.anterior.fecha)}` : ''}.
                                    {info.anterior.validada
                                        ? ' Ya la hemos revisado; si la corriges y la guardas, sustituye a la anterior y la volvemos a revisar.'
                                        : ' Si la cambias y la vuelves a guardar, sustituye a la anterior.'}
                                </div>
                            )}
                            {info.facturas?.length > 0 && (
                                <fieldset style={{ border: 0, margin: '16px 0 0', padding: 0 }}>
                                    <legend className="fo-campo" style={{ padding: 0 }}>
                                        <span style={{ fontSize: 14.5, fontWeight: 700 }}>
                                            Esta obra ya tiene {info.facturas.length === 1 ? 'una factura que subiste' : `${info.facturas.length} facturas que subiste`}. ¿Esta la sustituye?
                                        </span>
                                    </legend>
                                    <div className="fo-opc" role="radiogroup">
                                        {info.facturas.map((f) => (
                                            <label key={f.ref} className={sustituir === f.ref ? 'sel' : ''}>
                                                <input type="radio" name="fo-sust" checked={sustituir === f.ref} onChange={() => elegirSustituir(f.ref)} />
                                                <span>
                                                    <b>Sí, sustituye a la {f.numero ? `nº ${f.numero}` : 'que subí'}</b>
                                                    {f.fecha ? ` del ${fechaCorta(f.fecha)}` : ''}{Number(f.total) > 0 ? ` · ${eur(f.total)}` : ''}.
                                                    {' '}La de antes se retira del expediente{f.validada ? ' y la nueva se vuelve a revisar' : ''}.
                                                </span>
                                            </label>
                                        ))}
                                        <label className={sustituir === 'ninguna' ? 'sel' : ''}>
                                            <input type="radio" name="fo-sust" checked={sustituir === 'ninguna'} onChange={() => setSustituir('ninguna')} />
                                            <span><b>No, es otra factura distinta</b> (se añade a la que ya hay).</span>
                                        </label>
                                    </div>
                                </fieldset>
                            )}
                            <div className="fo-cliente">
                                <b>{info.cliente.nombre}</b>
                                {info.cliente.domicilio.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                            <div className="fo-campos">
                                <div className="fo-campo">
                                    <label htmlFor="fo-num">Nº de factura</label>
                                    <input id="fo-num" className={`fo-in${numeroLargo ? ' mal' : ''}`} value={numero} onChange={(e) => setNumero(e.target.value)}
                                        placeholder={info.ejemploNumero ? `p. ej. ${info.ejemploNumero}` : ''} autoComplete="off" maxLength={30} />
                                </div>
                                <div className="fo-campo">
                                    <label htmlFor="fo-fecha">Fecha</label>
                                    <input id="fo-fecha" type="date" className={`fo-in${fechaMal ? ' mal' : ''}`} value={fecha}
                                        onChange={(e) => setFecha(e.target.value)} min={fechaMin || undefined} max={hoyIso()} />
                                </div>
                            </div>
                            {numeroLargo && (
                                <div className="fo-ambar" role="alert" style={{ marginTop: 12 }}>
                                    El número no cabe en la casilla de tu factura. Acórtalo.
                                </div>
                            )}
                            <p className="fo-ayuda">
                                {fecha ? <>Saldrá: <b>{fechaLarga(fecha)}</b>. </> : null}
                                {info.fechaMinima ? `Posterior al ${fechaCorta(info.fechaMinima)}, cuando se registró el certificado energético inicial.` : ''}
                            </p>
                        </div>
                        <div className="fo-filete" />
                    </section>

                    <section className="fo-card fo-pad fo-in-anim" aria-labelledby="fo-lineas-t">
                        <span className="fo-eyebrow">Concepto y precios</span>
                        <h2 id="fo-lineas-t" className="fo-display fo-h3">{modo === 'total' ? 'Un precio para toda la obra' : 'Precio de cada línea'}, sin IVA</h2>
                        <div className="fo-modo" role="group" aria-label="Cómo pones el precio">
                            <button type="button" aria-pressed={modo === 'partidas'} onClick={() => setModo('partidas')}>Por partidas</button>
                            <button type="button" aria-pressed={modo === 'total'} onClick={() => setModo('total')}>Precio total</button>
                        </div>
                        {modo === 'total' && (
                            <div className="fo-campo" style={{ marginTop: 14 }}>
                                <label htmlFor="fo-total">Precio total de la obra (€, sin IVA)</label>
                                <input id="fo-total" className={`fo-in num${Number.isNaN(cuerpo.total) ? ' mal' : ''}`} inputMode="decimal"
                                    placeholder="obligatorio" value={totalTxt} onChange={(e) => setTotalTxt(e.target.value)} />
                                <p className="fo-ayuda">Sale en la primera línea, con cantidad 1; las demás van sin importe.</p>
                            </div>
                        )}
                        <p className="fo-ayuda" style={{ marginTop: 12 }}>
                            Si cambias un concepto, deja la marca, el modelo y el nº de serie tal cual: son los de las placas y es lo que mira la auditoría.
                            {modo === 'partidas' ? ' Una línea sin precio sale sin importe.' : ''}
                        </p>
                        <ol className="fo-lineas">
                            {conceptos.map((texto, i) => {
                                const abierta = editando.has(i) || !texto.trim();
                                const cambiada = !!info.lineas[i] && texto.trim() !== info.lineas[i].texto;
                                return (
                                    <li key={i} className="fo-linea">
                                        <div className="t">
                                            <span className="n">{i + 1}</span>
                                            {abierta
                                                ? <textarea className="fo-txt" aria-label={`Concepto de la línea ${i + 1}`} value={texto} maxLength={MAX_CONCEPTO}
                                                    placeholder="Escribe el concepto" onChange={(e) => setConcepto(i, e.target.value)} />
                                                : <span>{texto}</span>}
                                        </div>
                                        <div className="fo-acc">
                                            {texto.trim() && (
                                                <button type="button" className="fo-link" onClick={() => alternarEdicion(i)}>{abierta ? 'Listo' : 'Cambiar el texto'}</button>
                                            )}
                                            {i > 0 && <button type="button" className="fo-link gris" onClick={() => quitar(i)}>Quitar esta línea</button>}
                                            {cambiada && !abierta && <span className="fo-ayuda" style={{ margin: 0, padding: '4px 0' }}>Texto cambiado</span>}
                                        </div>
                                        {modo === 'partidas' && (
                                            <>
                                                <div className="p">
                                                    <div className="fo-campo">
                                                        <label htmlFor={`fo-c${i}`}>Cantidad</label>
                                                        <input id={`fo-c${i}`} className={`fo-in num${Number.isNaN(cuerpo.partidas[i]?.cantidad) ? ' mal' : ''}`} inputMode="decimal"
                                                            value={partidas[i]?.cantidad ?? ''} onChange={(e) => set(i, 'cantidad', e.target.value)} />
                                                    </div>
                                                    <div className="fo-campo">
                                                        <label htmlFor={`fo-p${i}`}>Precio (€)</label>
                                                        <input id={`fo-p${i}`} className={`fo-in num${Number.isNaN(cuerpo.partidas[i]?.precio) ? ' mal' : ''}`} inputMode="decimal"
                                                            placeholder={i === 0 ? 'obligatorio' : 'opcional'}
                                                            value={partidas[i]?.precio ?? ''} onChange={(e) => set(i, 'precio', e.target.value)} />
                                                    </div>
                                                </div>
                                                <div className="imp">
                                                    <span>Importe</span>
                                                    {lineasCalc[i]?.importe > 0 ? <b>{eur(lineasCalc[i].importe)}</b> : <span className="sin">sin importe</span>}
                                                </div>
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                        {conceptos.length < maxLineas && (
                            <button type="button" className="fo-add" onClick={anadir}>+ Añadir una línea</button>
                        )}
                        {conceptosCambiados && (
                            <div className="fo-acc" style={{ justifyContent: 'center' }}>
                                <button type="button" className="fo-link gris" onClick={restaurar}>Volver al texto recomendado</button>
                            </div>
                        )}
                        {desborda && (
                            <div className="fo-ambar" role="alert" style={{ marginTop: 14 }}>
                                El texto ya no cabe en una hoja de la factura. Acorta algún concepto o quita una línea.
                            </div>
                        )}
                    </section>

                    <section className="fo-card fo-pad fo-in-anim" aria-labelledby="fo-tot-t">
                        <span className="fo-eyebrow" id="fo-tot-t">Totales</span>
                        <div className="fo-tot">
                            <div><span>Importe factura</span><b>{eur(base)}</b></div>
                            <div><span>IVA {ivaPct} %</span><b>{eur(iva)}</b></div>
                        </div>
                        <div className="fo-total"><span>Total factura</span><b>{eur(total)}</b></div>
                        {avisos.length > 0 && (
                            <div className="fo-ambar" role="alert" style={{ marginTop: 14 }}>
                                {avisos.length === 1 ? avisos[0] : <ul>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                            </div>
                        )}
                        <button type="button" className="fo-btn" onClick={guardar}
                            disabled={enviando || problemas.length > 0 || fechaMal || numMal || largo || desborda || numeroLargo}>
                            {enviando ? 'Guardando…' : <><IcoCheck size={20} sw={2.6} />Guardar la factura</>}
                        </button>
                        <p className="fo-pnota" role="status" aria-live="polite">
                            {problemas.length
                                ? `Falta ${problemas.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
                                : fechaMal ? 'Revisa la fecha.'
                                    : numMal ? 'Revisa los precios: solo números.'
                                        : numeroLargo ? 'Acorta el número de factura: no cabe en su casilla.'
                                        : desborda ? 'Acorta algún concepto: no cabe en la hoja.'
                                            : sustituir && sustituir !== 'ninguna'
                                                ? 'Se guarda en el expediente en lugar de la que subiste, y te damos el PDF.'
                                                : 'Se guarda en el expediente y te damos el PDF para descargar.'}
                        </p>
                    </section>
                </div>

                <aside className="fo-lado" aria-label="Así queda">
                    <span className="fo-eyebrow" style={{ margin: '0 4px 8px' }}>Así queda</span>
                    {demo
                        ? <div className="fo-previa fo-pad"><p className="fo-sub">En la demo no hay vista previa: la compone el servidor con la plantilla de cada instalador.</p></div>
                        : <VistaPrevia pdf={previa} cargando={previaCargando} />}
                </aside>
            </div>
            {!demo && !dosPc && (
                <>
                    <button type="button" className="fo-pildora" onClick={() => setVerHoja(true)} aria-haspopup="dialog">
                        Ver la factura <b>{eur(total)}</b>
                    </button>
                    <HojaPrevia abierta={verHoja} onCerrar={cerrarHoja} total={eur(total)}>
                        <VistaPrevia pdf={previa} cargando={previaCargando} />
                    </HojaPrevia>
                </>
            )}
            <Firma />
        </Marco>
    );
}

export default FacturaObraView;
