import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import AsistenteFirmaManuscrita from '../../firma/AsistenteFirmaManuscrita';
import { cajaConvenioCedente, anexoISignBoxCedente } from '../../expedientes/logic/signBoxes';

/**
 * RELATIVA, también en desarrollo.
 *
 * Esta pantalla la abre el CLIENTE, y el cliente entra con el móvil. Apuntando a
 * `http://localhost:3000` solo funciona abierta en el mismo ordenador que corre
 * el backend, así que en local no había forma de ver el recorrido tal y como lo
 * ve él —que es donde se decide si los documentos se leen bien en una pantalla
 * de seis pulgadas—. En relativo la sirve el mismo origen del que vino la
 * página: el proxy de Vite en desarrollo, el propio servidor en producción, y
 * funciona igual entrando por `localhost` que por la IP de la red local.
 */
const API_URL = '/api/public';

const PDF_AND_IMG = 'application/pdf,image/*';

// ── Demo sin API: /firmar-anexos/demo ─────────────────────────────────────────
// Con `?datos` (faltan datos), `?preparando` (datos recibidos, anexos en
// preparación), `?requerimiento`, `?rechazo` o `?varios` (dos cedentes).
const DEMO_ID = 'demo';
function infoDemo() {
    const q = new URLSearchParams(window.location.search);
    const datos = q.has('datos');
    const preparando = q.has('preparando');
    return {
        numero_expediente: '26RES060_241',
        cliente: 'MARÍA GARCÍA LÓPEZ',
        datos_cliente: {
            nombre_razon_social: 'MARÍA', apellidos: 'GARCÍA LÓPEZ',
            email: datos ? '' : 'maria@ejemplo.es', telefono: '600000000',
            dni: datos ? '' : '00000000T', iban: '',
            falta_email: datos, falta_dni: datos, falta_iban: datos, justificante_subido: false,
        },
        anexo_i_enviado: !datos && !preparando, anexo_cesion_enviado: !datos && !preparando,
        anexo_i_disponible: !datos && !preparando, anexo_cesion_disponible: !datos && !preparando && !q.has('requerimiento'),
        anexo_i_firmado: false, anexo_cesion_firmado: false, dni_subido: false,
        cedentes: q.has('varios') ? [{ nombre: 'MARÍA GARCÍA LÓPEZ' }, { nombre: 'JUAN PÉREZ RUIZ' }] : [{ nombre: 'MARÍA GARCÍA LÓPEZ' }],
        rechazos: q.has('rechazo') ? [{ doc: 'anexo_i', label: 'Anexo I', preparando: false, motivo: 'la fecha de la factura no era la buena' }] : [],
        requerimiento: q.has('requerimiento') ? { importe_anterior: 3400, importe_nuevo: 3100, fecha_limite: '2026-11-12' } : null,
    };
}

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.fa{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.fa *{box-sizing:border-box}
.fa ::selection{background:var(--lima);color:var(--tinta)}
.fa-filete-top{height:4px;background:var(--filete)}
.fa-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.fa-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.fa-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.fa-logo{height:26px;width:auto;display:block}
.fa-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.fa-hola{font-size:15px;color:var(--gris);margin:0 2px}
.fa-hola b{color:var(--tinta);font-weight:600}
.fa-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.fa-h1{font-size:42px;line-height:1.16;margin:6px 2px 0}
.fa-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.fa-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.fa-sub b{color:var(--tinta);font-weight:700}
.fa-txt{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.fa-txt b{color:var(--tinta);font-weight:700}
.fa-stack{margin-top:22px}
.fa-stack > * + *{margin-top:14px}
.fa-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:22px 20px}
.fa-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.fa-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0}
.fa-eyebrow-verde{color:var(--verde-txt)}
.fa-h2{font-size:28px;line-height:1.16;margin:8px 0 0}
.fa-paso{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;background:var(--naranja);color:#08090c;font-size:11.5px;font-weight:800;letter-spacing:0}
.fa-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
.fa-aviso{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.fa-aviso p{margin:0}
.fa-aviso p + p{margin-top:8px}
.fa-aviso b{font-weight:700}
.fa-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.fa-aviso-ambar .fa-ico-tile{background:#ffe9bd;color:#7a4b00}
.fa-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.fa-aviso-ok .fa-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.fa-aviso-t{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
.fa-aviso-nota{font-size:13px;opacity:.85}
.fa-mt{margin-top:14px}
.fa-demo{margin:0 0 16px;padding:10px 14px;border-radius:14px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;font-size:12.5px;line-height:1.45;color:var(--gris)}
.fa-demo b{color:var(--tinta)}
.fa-hueco{padding:36px 16px;border-radius:24px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;text-align:center;font-size:14px;line-height:1.5;color:var(--gris)}
/* botones */
.fa-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;text-align:center;transition:transform .12s ease,box-shadow .2s ease,filter .2s ease,border-color .2s ease}
.fa-btn:active{transform:scale(.98)}
.fa-btn:disabled{opacity:.5;cursor:default;transform:none}
.fa-btn:focus-visible,.fa-link:focus-visible,.fa-opc:focus-visible,.fa-elige:focus-visible,.fa-drop:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.fa-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.fa-btn-pri:hover:not(:disabled){filter:brightness(1.04)}
.fa-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.fa-btn-sec:hover:not(:disabled){border-color:rgba(20,17,17,.3)}
.fa-btns2{display:grid;gap:10px;margin-top:16px}
.fa-link{appearance:none;background:none;border:0;cursor:pointer;padding:0;min-height:44px;font:inherit;font-size:14.5px;font-weight:700;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.35);border-radius:6px}
.fa-volver{display:inline-flex;align-items:center;gap:6px;color:var(--gris);text-decoration:none}
.fa-centro{text-align:center}
.fa-nota{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:10px 2px 0;text-align:center}
.fa-spin{animation:fa-rot .8s linear infinite}
/* modos de firma */
.fa-opcs{display:grid;gap:10px;margin-top:16px}
.fa-opc{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:flex-start;gap:14px;padding:16px;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid rgba(20,17,17,.12);border-radius:18px;color:var(--tinta);font:inherit;transition:border-color .2s ease,box-shadow .2s ease,transform .12s ease}
.fa-opc:hover{border-color:rgba(20,17,17,.3)}
.fa-opc:active{transform:scale(.99)}
.fa-opc:disabled{opacity:.6;cursor:default}
.fa-opc-dest{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.14)}
.fa-opc-dest:hover{border-color:var(--naranja)}
.fa-opc .fa-ico-tile{background:var(--crema);color:var(--tinta)}
.fa-opc-dest .fa-ico-tile{background:rgba(255,160,0,.18);color:#8a4b00}
.fa-opc-cuerpo{flex:1;min-width:0}
.fa-opc-label{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:16px;font-weight:700;line-height:1.35}
.fa-opc-sub{display:block;font-size:13.5px;line-height:1.45;color:var(--gris);margin-top:3px}
.fa-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;background:var(--lima);color:var(--tinta)}
.fa-chip-gris{background:var(--crema);border:1px solid var(--linea);color:var(--gris)}
.fa-flecha{flex:none;align-self:center;color:var(--gris2)}
/* campos */
.fa-k{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:0 2px 8px}
.fa-k i{font-style:normal;color:var(--naranja-txt)}
.fa-campos{display:grid;gap:16px;margin-top:16px}
.fa-input{appearance:none;display:block;width:100%;height:54px;padding:0 16px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);
  font:500 16px/1 'Inter',sans-serif;transition:border-color .2s ease,box-shadow .2s ease}
.fa-input::placeholder{color:#a3a5aa;text-transform:none;letter-spacing:normal}
.fa-input:hover{border-color:rgba(20,17,17,.28)}
.fa-input:focus{outline:none;border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.fa-input-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.04em;font-size:15px}
/* zona de subir */
.fa-subidas{display:grid;gap:16px;margin-top:16px}
.fa-drop-t{display:block;font-size:14.5px;font-weight:700;line-height:1.35;margin:0 2px}
.fa-drop-t i{font-style:normal;color:var(--naranja-txt)}
.fa-drop-d{display:block;font-size:13px;line-height:1.45;color:var(--gris);margin:2px 2px 8px}
.fa-drop{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 14px;border-radius:16px;cursor:pointer;text-align:left;
  border:1.5px dashed rgba(20,17,17,.2);background:var(--crema);color:var(--tinta);font:inherit;transition:border-color .2s ease,background-color .2s ease,transform .12s ease}
.fa-drop:hover{border-color:rgba(20,17,17,.4)}
.fa-drop:active{transform:scale(.99)}
.fa-drop .fa-ico-tile{background:#fff;color:var(--gris);border:1px solid var(--linea)}
.fa-drop-arr{border-color:var(--naranja);background:#fffaf0}
.fa-drop-sel{border-style:solid;border-color:var(--naranja);background:#fffaf0}
.fa-drop-sel .fa-ico-tile{background:rgba(255,160,0,.18);color:#8a4b00;border-color:transparent}
.fa-drop-ok{border-style:solid;border-color:rgba(177,209,62,.55);background:rgba(177,209,62,.08)}
.fa-drop-ok .fa-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt);border-color:transparent}
.fa-drop-main{flex:1;min-width:0}
.fa-drop-main b{display:block;font-size:14.5px;font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fa-drop-main span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px}
.fa-dni-de{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris);margin:6px 2px 0}
.fa-elige-par{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.fa-elige{appearance:none;-webkit-tap-highlight-color:transparent;cursor:pointer;min-height:64px;padding:10px 12px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);background:#fff;color:var(--tinta);text-align:center;
  font:700 15px/1.3 'Inter',sans-serif;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease}
.fa-elige small{display:block;font-size:12px;font-weight:500;color:var(--gris);margin-top:2px}
.fa-elige:hover{border-color:rgba(20,17,17,.3)}
.fa-elige-sel,.fa-elige-sel:hover{border-color:var(--naranja);background:#fffaf0;box-shadow:0 0 0 3px rgba(255,160,0,.16)}
.fa-subcaja{margin-top:16px;padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fa-subcaja-t{font-size:15px;font-weight:700;margin:0}
/* descargas */
.fa-descargas{display:grid;gap:10px;margin-top:14px}
/* hecho */
.fa-check{width:76px;height:76px;display:block}
.fa-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:fa-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.fa-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:fa-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
/* firma */
.fa-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.fa-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.fa-firma b{display:block;font-size:15px;font-weight:700}
.fa-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.fa-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.fa-espera{min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:15px;font-weight:600;color:var(--gris)}
.fa-espera .fa-spin{color:var(--naranja)}
.fa-in{animation:fa-up .55s cubic-bezier(.2,.8,.2,1) both}
.fa-in-2{animation-delay:.08s}
.fa-in-3{animation-delay:.16s}
@keyframes fa-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes fa-draw{to{stroke-dashoffset:0}}
@keyframes fa-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.fa-h1{font-size:36px}.fa-h2{font-size:25px}.fa-card{padding:20px 16px}}
@media (min-width:768px){.fa-col{padding-top:40px}.fa-card{padding:26px}.fa-subidas-dos{grid-template-columns:1fr 1fr}.fa-descargas{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:reduce){.fa-in,.fa-spin{animation:none}.fa-check circle,.fa-check path{animation:none;stroke-dashoffset:0}}
`;

const Ico = ({ size = 22, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
const IcoEscudo = (p) => <Ico {...p}><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Ico>;
const IcoPluma = (p) => <Ico {...p}><path d="M4 20c3-1 5-1 7 0s4 1 6-1" /><path d="M14.5 4.5l5 5L11 18H6v-5l8.5-8.5z" /></Ico>;
const IcoPapel = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
const IcoSubir = (p) => <Ico {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Ico>;
const IcoBajar = (p) => <Ico {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></Ico>;
const IcoReloj = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Ico>;
const IcoOk = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
const IcoFlecha = (p) => <Ico {...p}><path d="M9 6l6 6-6 6" /></Ico>;
const IcoAtras = (p) => <Ico {...p}><path d="M15 6l-6 6 6 6" /></Ico>;
const IcoMano = (p) => <Ico {...p}><path d="M14 4.5l5.5 5.5M5 19l3.5-.8L19 7.7a1.9 1.9 0 0 0-2.7-2.7L5.8 15.5 5 19z" /></Ico>;

const Spinner = ({ size = 20 }) => (
    <svg className="fa-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

const CheckDibujado = () => (
    <svg className="fa-check" viewBox="0 0 60 60" width="76" height="76" aria-hidden="true">
        <circle cx="30" cy="30" r="26.5" pathLength="100" />
        <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
    </svg>
);

// Descarga un PDF (arraybuffer) y lo devuelve en base64 (sin prefijo data:).
async function fetchPdfBase64(url) {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
const b64ToBlob = (b64) => new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'application/pdf' });

// El nombre de pila en minúsculas con la inicial en mayúscula: en la ficha viene en MAYÚSCULAS.
const nombrePila = (s) => {
    const p = String(s || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

// Zona para elegir o arrastrar un fichero (PDF o imagen), con su estado: vacía,
// elegido, o "ya recibido" (se puede reemplazar).
function DropZone({ title, desc, file, onPick, alreadyUploaded, accept = PDF_AND_IMG, obligatorio = false }) {
    const ref = useRef();
    const [dragging, setDragging] = useState(false);
    const replaced = alreadyUploaded && !file;
    const estado = dragging ? 'fa-drop-arr' : file ? 'fa-drop-sel' : replaced ? 'fa-drop-ok' : '';
    return (
        <div>
            <span className="fa-drop-t">{title}{obligatorio && <i> *</i>}</span>
            {desc && <span className="fa-drop-d">{desc}</span>}
            <input ref={ref} type="file" accept={accept} hidden onChange={e => onPick(e.target.files?.[0])} />
            <button type="button" className={`fa-drop ${estado}`}
                onClick={() => ref.current?.click()}
                onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}>
                <span className="fa-ico-tile">{file ? <IcoPapel /> : replaced ? <IcoOk /> : <IcoSubir />}</span>
                <span className="fa-drop-main">
                    {dragging ? (
                        <><b>Suéltalo aquí</b><span>PDF o foto</span></>
                    ) : file ? (
                        <><b>{file.name}</b><span>{(file.size / 1024).toFixed(0)} KB · pulsa para cambiarlo</span></>
                    ) : replaced ? (
                        <><b>Ya lo tenemos</b><span>Pulsa si quieres reemplazarlo</span></>
                    ) : (
                        <><b>Elegir archivo</b><span>Foto con la cámara, de la galería o un PDF</span></>
                    )}
                </span>
            </button>
        </div>
    );
}

// Campo de texto reutilizable (a nivel de módulo para no remontar y perder foco).
function Campo({ label, value, onChange, type = 'text', placeholder, uppercase, mono, autoComplete }) {
    return (
        <label>
            <span className="fa-k">{label}<i> *</i></span>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
                className={`fa-input ${mono ? 'fa-input-mono' : ''} ${uppercase ? '' : 'no-uppercase'}`} />
        </label>
    );
}

const Aviso = ({ tono = 'ambar', titulo, children }) => (
    <div className={`fa-aviso fa-aviso-${tono}`} role={tono === 'ambar' ? 'alert' : undefined}>
        <span className="fa-ico-tile">{tono === 'ok' ? <IcoOk size={20} /> : <IcoAlerta size={20} />}</span>
        <div>
            {titulo && <span className="fa-aviso-t">{titulo}</span>}
            {children}
        </div>
    </div>
);

const Marco = ({ info, saludo, demo = false, children }) => (
    <div className="fa">
        <style>{CSS}</style>
        <div className="fa-filete-top" />
        <div className="fa-halo" />
        <main className="fa-col">
            <header className="fa-head fa-in">
                <img className="fa-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                {info?.numero_expediente && <span className="fa-exp">{info.numero_expediente}</span>}
            </header>
            {demo && <p className="fa-demo fa-in"><b>Prueba</b> · datos de mentira: no se guarda ni se envía nada.</p>}
            {saludo && <p className="fa-hola fa-in">Hola, <b>{saludo}</b></p>}
            {children}
            <footer>
                <div className="fa-firma">
                    <img className="fa-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                    <div>
                        <b>Fran Moya</b>
                        <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                    </div>
                </div>
                <p className="fa-pie">BROKERGY · Ingeniería Energética</p>
            </footer>
        </main>
    </div>
);

export function FirmarAnexosView({ expedienteId }) {
    const esDemo = expedienteId === DEMO_ID;
    const [info, setInfo] = useState(() => (esDemo ? infoDemo() : null));
    const [loadError, setLoadError] = useState(null);
    const [anexoI, setAnexoI] = useState(null);
    const [cesion, setCesion] = useState(null);
    const [cesionFirma, setCesionFirma] = useState('manuscrita'); // 'manuscrita' | 'electronica'
    const [dniFrontal, setDniFrontal] = useState(null);
    const [dniTrasero, setDniTrasero] = useState(null);
    // VARIOS CEDENTES: el DNI de cada uno de los demás (índice 1..n-1) → { frontal, trasero }.
    const [dnisExtra, setDnisExtra] = useState({});
    const ponDniExtra = (i, k) => (f) => setDnisExtra(prev => ({ ...prev, [i]: { ...(prev[i] || {}), [k]: f } }));
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    // ── Firma DIGITAL (Autofirma) de ambos anexos en secuencia ────────────────
    // null | 'digital' (Autofirma) | 'manual' (el asistente: se firma con el dedo
    // aquí mismo) | 'subir' (lo de siempre: descargar, firmar en papel y subirlo).
    const [modo, setModo] = useState(null);
    const [signQueue, setSignQueue] = useState([]);    // [{which,label,anchor}]
    const [signIndex, setSignIndex] = useState(0);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [signedFiles, setSignedFiles] = useState({}); // { anexo_i, cesion } base64 firmados
    const [prepError, setPrepError] = useState(null);
    const [preparing, setPreparing] = useState(false);

    // ── Sección "Completa tus datos" (email/DNI/IBAN + justificante bancario) ──
    const [datos, setDatos] = useState({ email: '', telefono: '', nombre_razon_social: '', apellidos: '', dni_cif: '', iban: '' });
    const [justificante, setJustificante] = useState(null);
    const [savingDatos, setSavingDatos] = useState(false);
    const [datosMsg, setDatosMsg] = useState(null); // { ok, text }

    const loadInfo = () => {
        if (esDemo) { setInfo(infoDemo()); return Promise.resolve(); }
        return axios.get(`${API_URL}/anexos-upload/${expedienteId}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));
    };

    useEffect(() => { if (!esDemo) loadInfo(); }, [expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Precarga los valores actuales del cliente cuando llega la info.
    useEffect(() => {
        const d = info?.datos_cliente;
        if (d) setDatos({ email: d.email || '', telefono: d.telefono || '', nombre_razon_social: d.nombre_razon_social || '', apellidos: d.apellidos || '', dni_cif: d.dni || '', iban: d.iban || '' });
    }, [info]);

    const pickFile = (f, setter) => {
        if (!f) return;
        const ok = f.type === 'application/pdf' || (f.type || '').startsWith('image/');
        if (!ok) { setUploadError('Solo se admiten archivos PDF o imágenes (foto/escaneo).'); return; }
        setUploadError(null);
        setter(f);
    };

    // ── Guardar datos del cliente (validación tipo propuesta) ──────────────────
    const dc = info?.datos_cliente || {};
    // El gate de fase mira solo los datos que ALIMENTAN los anexos (email/DNI/IBAN/tlf).
    // El justificante va junto con el IBAN (igual que la propuesta); no bloquea por sí solo.
    const faltanDatos = !!(dc.falta_email || dc.falta_dni || dc.falta_iban || !dc.telefono);
    const setDato = (k, v) => setDatos(prev => ({ ...prev, [k]: v }));
    // Fase 3 (firma): en cuanto los anexos se han ENVIADO al cliente (o generado en Drive).
    const anexosListos = !!(info?.anexo_i_enviado || info?.anexo_cesion_enviado || info?.anexo_i_disponible || info?.anexo_cesion_disponible);
    // Qué se firma AQUÍ: solo lo que sigue pendiente. Si reenviamos solo el Anexo I
    // (por un error suyo o un requerimiento), el Convenio ya firmado —y vigente— no
    // puede volver a pedirse: `anexo_*_firmado` ya descuenta la firma anulada por un
    // rechazo o una re-firma. Solo si no queda NADA pendiente (el cliente vuelve al
    // enlace con todo entregado) se ofrecen todos, para poder reemplazar uno.
    const pendI = !!(info?.anexo_i_disponible && !info?.anexo_i_firmado);
    const pendC = !!(info?.anexo_cesion_disponible && !info?.anexo_cesion_firmado);
    const hayPendiente = pendI || pendC;
    const firmarI = hayPendiente ? pendI : !!info?.anexo_i_disponible;
    const firmarC = hayPendiente ? pendC : !!info?.anexo_cesion_disponible;
    const nFirmar = (firmarI ? 1 : 0) + (firmarC ? 1 : 0);
    const nombresFirmar = [firmarI && 'Anexo I', firmarC && 'Anexo de Cesión'].filter(Boolean);
    // El asistente de firma a mano decide sus documentos por `*_disponible`.
    const infoFirma = info ? { ...info, anexo_i_disponible: firmarI, anexo_cesion_disponible: firmarC } : info;
    const hayDescarga = firmarI || firmarC;
    const descargarUrl = (which) => `${API_URL}/anexos-upload/${expedienteId}/descargar/${which}`;
    // Anexos que hemos rechazado. `preparando` = todavía no está la versión
    // corregida, así que ese anexo no se ofrece (ni descarga ni firma digital):
    // firmar otra vez el que tenía el error no arregla nada.
    const rechazos = info?.rechazos || [];
    // Requerimiento en curso: ya nos firmó estos anexos, pero la cifra sobre la que
    // firmó ha cambiado. Es lo PRIMERO que hay que contarle — si no, abre el enlace,
    // ve los mismos dos papeles y piensa que nos hemos equivocado de mensaje.
    const requerimiento = info?.requerimiento || null;
    const eurCli = (v) => (v == null ? null : `${Math.round(v).toLocaleString('es-ES')} €`);
    const fechaCli = (v) => {
        const d = new Date(v || '');
        return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const handleGuardarDatos = async () => {
        const errs = [];
        if (dc.falta_email) {
            if (!datos.email.trim()) errs.push('email');
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) errs.push('un email válido');
        }
        if (!dc.telefono && !datos.telefono.trim()) errs.push('teléfono');
        if (dc.falta_dni && !datos.dni_cif.trim()) errs.push('DNI/CIF');
        if (dc.falta_iban) {
            const c = datos.iban.replace(/\s+/g, '').toUpperCase();
            if (!c) errs.push('IBAN');
            else if (!/^ES\d{22}$/.test(c)) errs.push('un IBAN válido (ES + 22 dígitos)');
        }
        if (dc.falta_iban && !justificante && !dc.justificante_subido) errs.push('el justificante de titularidad bancaria');
        if (errs.length) { setDatosMsg({ ok: false, text: 'Falta o es incorrecto: ' + errs.join(', ') + '.' }); return; }

        setSavingDatos(true); setDatosMsg(null);
        if (esDemo) {
            setTimeout(() => {
                setInfo(prev => ({ ...prev, datos_cliente: { ...prev.datos_cliente, falta_email: false, falta_dni: false, falta_iban: false } }));
                setSavingDatos(false);
            }, 700);
            return;
        }
        try {
            const fd = new FormData();
            fd.append('email', datos.email);
            fd.append('telefono', datos.telefono);
            fd.append('nombre_razon_social', datos.nombre_razon_social);
            fd.append('apellidos', datos.apellidos);
            fd.append('dni_cif', datos.dni_cif);
            fd.append('iban', datos.iban);
            if (justificante) fd.append('justificante', justificante);
            const { data } = await axios.post(`${API_URL}/anexos-datos/${expedienteId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDatosMsg({ ok: true, text: '¡Datos guardados! Gracias.' });
            if (data?.datos_cliente) setInfo(prev => ({ ...prev, datos_cliente: data.datos_cliente }));
            setJustificante(null);
        } catch (e) {
            setDatosMsg({ ok: false, text: e.response?.data?.error || 'No se pudieron guardar los datos. Inténtalo de nuevo.' });
        } finally {
            setSavingDatos(false);
        }
    };

    // El DNI es obligatorio cuando la Cesión va firmada a mano (manuscrita), para anexarlo.
    const cesionManuscrita = !!cesion && cesionFirma === 'manuscrita';
    const dniRequerido = cesionManuscrita;
    const cedentesInfo = Array.isArray(info?.cedentes) && info.cedentes.length ? info.cedentes : [{ nombre: '' }];
    const extrasIdx = cedentesInfo.map((_, i) => i).slice(1);
    const faltaDniExtra = dniRequerido && extrasIdx.some(i => !dnisExtra[i]?.frontal || !dnisExtra[i]?.trasero);
    const faltaDni = dniRequerido && (!dniFrontal || !dniTrasero || faltaDniExtra);
    const algoQueSubir = anexoI || cesion || dniFrontal || dniTrasero;
    const puedeEnviar = algoQueSubir && !faltaDni && !uploading;

    const handleSubmit = async () => {
        if (!puedeEnviar) return;
        setUploading(true);
        setUploadError(null);
        if (esDemo) { setTimeout(() => { setUploading(false); setDone(true); }, 700); return; }
        try {
            const form = new FormData();
            if (anexoI) form.append('anexo_i', anexoI);
            if (cesion) { form.append('anexo_cesion', cesion); form.append('cesion_firma', cesionFirma); }
            if (dniFrontal) form.append('dni_frontal', dniFrontal);
            if (dniTrasero) form.append('dni_trasero', dniTrasero);
            for (const i of extrasIdx) {
                if (dnisExtra[i]?.frontal) form.append(`dni_frontal_${i}`, dnisExtra[i].frontal);
                if (dnisExtra[i]?.trasero) form.append(`dni_trasero_${i}`, dnisExtra[i].trasero);
            }
            await axios.post(`${API_URL}/anexos-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir los documentos. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    // ── FIRMA DIGITAL: firma Anexo I y Cesión con Autofirma, uno tras otro ─────
    const openSignAt = async (queue, idx, acumulado = null) => {
        setPrepError(null);
        setPreparing(true);
        try {
            const item = queue[idx];
            const previo = acumulado?.[item.which];
            const b64 = previo || await fetchPdfBase64(`${API_URL}/anexos-upload/${expedienteId}/descargar/${item.which}`);
            setSignPdfB64(b64);
            setSignIndex(idx);
            setSignOpen(true);
        } catch {
            setPrepError('No se pudo cargar el documento para firmar. Inténtalo de nuevo.');
        } finally {
            setPreparing(false);
        }
    };

    const startDigital = async () => {
        if (esDemo) { setPrepError('En la prueba no se abre Autofirma: aquí se abriría tu Anexo I para firmarlo con tu certificado.'); return; }
        // VARIOS CEDENTES (logic/cedentes.js): firman todos los que pagan la obra,
        // cada uno con SU certificado, en su casilla del convenio y en su propio
        // Anexo I. La cola es documento × cedente, y cada firma se pone sobre el PDF
        // que ya lleva las anteriores. Con uno solo, la cola de siempre.
        const ceds = Array.isArray(info?.cedentes) && info.cedentes.length ? info.cedentes : [{ nombre: '' }];
        const n = ceds.length;
        const quien = (i) => (n > 1 ? ` · firma de ${ceds[i].nombre}` : '');
        const q = [];
        for (let i = 0; i < n; i++) {
            if (firmarI) q.push({ which: 'anexo_i', label: `Anexo I${quien(i)}`, anchor: ['fdo.:^above', 'fdo.^above', 'firma del propietario'], fixedBox: anexoISignBoxCedente(i, n) });
            if (firmarC) q.push({ which: 'cesion', label: `Anexo de Cesión de Ahorros${quien(i)}`, anchor: ['el cedente@2', 'cedente@2', 'el cedente', 'cedente'], fixedBox: cajaConvenioCedente(i) });
        }
        if (!q.length) { setPrepError('No hay anexos disponibles para firmar todavía.'); return; }
        setSignedFiles({});
        setSignQueue(q);
        await openSignAt(q, 0);
    };

    // Recibe el PDF firmado (base64) del documento actual → siguiente o enviar.
    const handleAnexoSigned = async (signedB64) => {
        const item = signQueue[signIndex];
        const acc = { ...signedFiles, [item.which]: signedB64 };
        setSignedFiles(acc);
        setSignOpen(false);
        setSignPdfB64(null);
        if (signIndex + 1 < signQueue.length) {
            // Firmar el siguiente anexo (o el mismo, por el siguiente cedente).
            await openSignAt(signQueue, signIndex + 1, acc);
            return;
        }
        // Todos firmados → enviar.
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            if (acc.anexo_i) form.append('anexo_i', b64ToBlob(acc.anexo_i), `${info.numero_expediente} - Anexo I_fdo.pdf`);
            if (acc.cesion) { form.append('anexo_cesion', b64ToBlob(acc.cesion), `${info.numero_expediente} - Anexo Cesion_fdo.pdf`); form.append('cesion_firma', 'electronica'); }
            await axios.post(`${API_URL}/anexos-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Los anexos se firmaron pero no se pudieron enviar. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    if (!info && !loadError) {
        return (
            <Marco>
                <div className="fa-espera"><Spinner size={24} /> Abriendo tu expediente…</div>
            </Marco>
        );
    }

    if (loadError) {
        return (
            <Marco>
                <div className="fa-stack fa-in">
                    <div className="fa-card">
                        <span className="fa-ico-tile" style={{ background: '#ffe9bd', color: '#7a4b00', width: 48, height: 48, borderRadius: 14 }}><IcoAlerta size={24} /></span>
                        <h1 className="fa-display fa-h2" style={{ marginTop: 14 }}>Este enlace no <span className="fa-mark">funciona</span></h1>
                        <p className="fa-txt">{loadError} Si te lo hemos mandado nosotros, contesta al mensaje y te enviamos uno nuevo.</p>
                    </div>
                </div>
            </Marco>
        );
    }

    // Con apellidos es una persona: se la saluda por su nombre. A una empresa no se
    // la saluda por la primera palabra de su razón social.
    const saludo = dc.apellidos ? nombrePila(dc.nombre_razon_social) : '';
    const dosAnexos = nFirmar !== 1;

    let eyebrow, titulo, sub;
    if (done) {
        eyebrow = 'Todo recibido';
        titulo = <>Documentación <span className="fa-mark">recibida</span></>;
        sub = null;
    } else if (faltanDatos) {
        eyebrow = 'Antes de firmar';
        titulo = <>Completa tus <span className="fa-mark">datos</span></>;
        sub = <>Necesitamos un par de datos para preparar tus anexos. <b>En cuanto los recibamos, te los enviamos</b> para que los firmes desde este mismo enlace.</>;
    } else if (!anexosListos) {
        eyebrow = 'Datos recibidos';
        titulo = <>Preparando tus <span className="fa-mark">anexos</span></>;
        sub = <>Ya tenemos tus datos. <b>Te avisaremos en breve</b> para que los firmes desde este mismo enlace.</>;
    } else {
        eyebrow = 'Último paso de tu parte';
        titulo = dosAnexos ? <>Firma tus <span className="fa-mark">anexos</span></> : <>Firma tu <span className="fa-mark">anexo</span></>;
        sub = dosAnexos
            ? <>Son dos documentos: el <b>Anexo I</b> y el <b>Anexo de Cesión</b> de los ahorros. Con tu firma podemos tramitar tu ayuda.</>
            : <>Solo falta el <b>{nombresFirmar[0]}</b>. Con tu firma seguimos con la tramitación.</>;
    }

    return (
        <Marco info={info} saludo={saludo} demo={esDemo}>
            {done ? (
                <div className="fa-in" style={{ marginTop: 6 }}><CheckDibujado /></div>
            ) : (
                <p className={`fa-eyebrow fa-in ${!faltanDatos && !anexosListos ? 'fa-eyebrow-verde' : ''}`} style={{ margin: '18px 2px 0' }}>{eyebrow}</p>
            )}
            <h1 className="fa-display fa-h1 fa-in">{titulo}</h1>
            {sub && <p className="fa-sub fa-in fa-in-2">{sub}</p>}

            <div className="fa-stack fa-in fa-in-2">
                {/* Requerimiento: ya nos firmó, pero la cifra sobre la que firmó ha
                    cambiado. Mismo relato que el mensaje que se le envió (fuente del
                    tono: logic/requerimientoFirma). Quien entra aquí desde un WhatsApp
                    de hace días no tiene el correo delante: si la página solo dice que
                    la ayuda ha bajado, entiende que le hemos recortado algo, no que se
                    ha evitado perderlo. */}
                {!done && requerimiento && (
                    <Aviso titulo="Tu expediente sigue adelante">
                        <p>
                            El verificador revisa cada expediente antes de conceder la ayuda, y en el tuyo ha pedido aclarar algún punto: es un <b>requerimiento</b>, no un fallo tuyo. Lo hemos revisado punto por punto y hemos defendido tu actuación con toda la documentación del expediente
                            {requerimiento.importe_nuevo != null && requerimiento.importe_anterior != null && requerimiento.importe_nuevo < requerimiento.importe_anterior ? (
                                <>: en lugar de decaer por completo, <b>hemos conseguido ajustarlo y mantener tu ayuda en {eurCli(requerimiento.importe_nuevo)}</b> (frente a los {eurCli(requerimiento.importe_anterior)} previstos inicialmente).</>
                            ) : requerimiento.importe_nuevo != null ? (
                                <>: <b>el expediente sigue adelante</b>, con la ayuda en {eurCli(requerimiento.importe_nuevo)}.</>
                            ) : <>, y <b>el expediente sigue adelante</b>.</>}
                        </p>
                        <p>
                            Para cerrar la contestación necesitamos que nos <b>vuelvas a firmar</b> {nFirmar === 1 ? <>el <b>{nombresFirmar[0]}</b> actualizado: el que firmaste antes ya no es válido</> : <>los dos anexos actualizados: los que firmaste antes ya no son válidos</>}.
                            {requerimiento.fecha_limite && fechaCli(requerimiento.fecha_limite)
                                ? <> Tenemos plazo <b>hasta el {fechaCli(requerimiento.fecha_limite)}</b>.</>
                                : requerimiento.plazo_dias ? <> Tenemos un plazo de <b>{requerimiento.plazo_dias} días</b>.</> : null}
                        </p>
                        <p className="fa-aviso-nota">No has hecho nada mal: es un trámite del procedimiento. {nFirmar === 1 ? 'Con esta firma lo cerramos' : 'Con estas dos firmas lo cerramos'}; del resto nos ocupamos nosotros.</p>
                    </Aviso>
                )}
                {!done && rechazos.map(r => (
                    <Aviso key={r.doc} titulo={r.preparando ? `${r.label}: lo estamos corrigiendo` : `${r.label}: versión corregida`}>
                        <p>
                            {r.preparando ? (
                                <>Hemos revisado el <b>{r.label}</b> que firmaste y hemos detectado un error{r.motivo ? <> ({r.motivo})</> : ''}. <b>Estamos preparando la versión corregida</b> y te la enviaremos en cuanto esté. No hace falta que hagas nada todavía.</>
                            ) : (
                                <>Ya está corregido el <b>{r.label}</b>{r.motivo ? <> ({r.motivo})</> : ''}. <b>Firma la versión nueva</b> que encontrarás aquí abajo: la que firmaste antes no nos sirve.</>
                            )}
                        </p>
                    </Aviso>
                ))}

                {done ? (
                    <div className="fa-card">
                        <p className="fa-txt" style={{ marginTop: 0 }}>Gracias. Con esto seguimos con la tramitación de tu expediente <b>{info.numero_expediente}</b>. Te avisaremos cuando haya novedades.</p>
                        <div className="fa-btns2">
                            <button className="fa-btn fa-btn-sec" onClick={() => { setDone(false); setModo(null); setAnexoI(null); setCesion(null); setDniFrontal(null); setDniTrasero(null); loadInfo(); }}>
                                Subir o reemplazar otro documento
                            </button>
                        </div>
                    </div>
                ) : faltanDatos ? (
                    /* ── FASE 1: Completa tus datos (los anexos llegan después) ── */
                    <div className="fa-card">
                        <div className="fa-filete-fino" />
                        <p className="fa-eyebrow">Solo lo que falta</p>
                        <div className="fa-campos">
                            {dc.falta_email && <Campo label="Email" type="email" value={datos.email} onChange={v => setDato('email', v)} placeholder="tucorreo@email.com" autoComplete="email" />}
                            {!dc.telefono && <Campo label="Teléfono" type="tel" value={datos.telefono} onChange={v => setDato('telefono', v)} placeholder="600 000 000" autoComplete="tel" />}
                            {dc.falta_dni && <Campo label="DNI / CIF" value={datos.dni_cif} onChange={v => setDato('dni_cif', v)} placeholder="00000000A" uppercase />}
                            {dc.falta_iban && <Campo label="IBAN (nº de cuenta)" value={datos.iban} onChange={v => setDato('iban', v)} placeholder="ES00 0000 0000 0000 0000 0000" uppercase mono />}
                            {dc.falta_iban && (
                                <DropZone file={justificante} onPick={f => pickFile(f, setJustificante)} alreadyUploaded={dc.justificante_subido} accept="image/*,application/pdf" obligatorio
                                    title="Justificante de titularidad bancaria" desc="Un documento del banco donde se vea tu nombre y el IBAN (PDF o foto)." />
                            )}
                        </div>
                        {datosMsg && (
                            <div className="fa-mt"><Aviso tono={datosMsg.ok ? 'ok' : 'ambar'}><p>{datosMsg.text}</p></Aviso></div>
                        )}
                        {uploadError && <div className="fa-mt"><Aviso><p>{uploadError}</p></Aviso></div>}
                        <div className="fa-btns2">
                            <button className="fa-btn fa-btn-pri" onClick={handleGuardarDatos} disabled={savingDatos}>
                                {savingDatos ? <><Spinner /> Guardando…</> : 'Enviar mis datos'}
                            </button>
                        </div>
                    </div>
                ) : !anexosListos ? (
                    /* ── FASE 2: datos recibidos, preparando anexos ── */
                    <div className="fa-card">
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                            <span className="fa-ico-tile" style={{ background: 'rgba(177,209,62,.2)', color: 'var(--verde-txt)' }}><IcoReloj /></span>
                            <p className="fa-txt" style={{ marginTop: 0 }}>Estamos preparando tus anexos con los datos de tu obra. Cuando estén, te llegará un mensaje y podrás <b>firmarlos desde este mismo enlace</b>.</p>
                        </div>
                        <div className="fa-btns2">
                            <button className="fa-btn fa-btn-sec" onClick={() => loadInfo()}>Comprobar si ya están</button>
                        </div>
                    </div>
                ) : (
                    /* ── FASE 3: Firma de anexos — elegir modo ── */
                    <>
                        {modo === null && (
                            <div className="fa-card">
                                <p className="fa-eyebrow">¿Cómo quieres firmar?</p>
                                <div className="fa-opcs">
                                    <button className="fa-opc fa-opc-dest" onClick={() => { setModo('digital'); startDigital(); }} disabled={preparing}>
                                        <span className="fa-ico-tile"><IcoEscudo /></span>
                                        <span className="fa-opc-cuerpo">
                                            <span className="fa-opc-label">Con certificado digital <span className="fa-chip">Lo más rápido</span></span>
                                            <span className="fa-opc-sub">{preparing ? 'Preparando los documentos…' : 'Firma aquí mismo con Autofirma. Te marcamos dónde firmar, sin descargar nada.'}</span>
                                        </span>
                                        <span className="fa-flecha"><IcoFlecha size={20} /></span>
                                    </button>
                                    {/* Firmar con el dedo. Va la SEGUNDA y no la última:
                                        es la única que no pide ni certificado ni
                                        impresora, y para la mayoría es la que se acaba
                                        usando. */}
                                    <button className="fa-opc" onClick={() => setModo('manual')}>
                                        <span className="fa-ico-tile"><IcoMano /></span>
                                        <span className="fa-opc-cuerpo">
                                            <span className="fa-opc-label">Con el dedo, en la pantalla</span>
                                            <span className="fa-opc-sub">Lees los anexos y los firmas aquí. Sin impresora ni escáner: solo te pediremos la foto de tu DNI.</span>
                                        </span>
                                        <span className="fa-flecha"><IcoFlecha size={20} /></span>
                                    </button>
                                    <button className="fa-opc" onClick={() => setModo('subir')}>
                                        <span className="fa-ico-tile"><IcoPluma /></span>
                                        <span className="fa-opc-cuerpo">
                                            <span className="fa-opc-label">En papel <span className="fa-chip fa-chip-gris">Ya firmado</span></span>
                                            <span className="fa-opc-sub">Descárgalos o sube el escaneo que ya tienes, con la foto del DNI por las dos caras.</span>
                                        </span>
                                        <span className="fa-flecha"><IcoFlecha size={20} /></span>
                                    </button>
                                </div>
                                {prepError && <div className="fa-mt"><Aviso><p>{prepError}</p></Aviso></div>}
                            </div>
                        )}

                        {/* Modo DIGITAL: firma con Autofirma */}
                        {modo === 'digital' && (
                            <div className="fa-card">
                                <div className="fa-filete-fino" />
                                <p className="fa-eyebrow">Con certificado digital</p>
                                <p className="fa-txt">
                                    {nFirmar === 1 ? <>Se abrirá tu <b>{nombresFirmar[0]}</b>.</> : <>Se abrirán tu <b>Anexo I</b> y tu <b>Anexo de Cesión</b>, uno detrás de otro.</>} En cada uno te <b>marcamos con un destello dónde firmar</b>: pulsa <b>Firmar con Autofirma</b> y elige tu certificado. Necesitas tener Autofirma instalado.
                                </p>
                                {prepError && <div className="fa-mt"><Aviso><p>{prepError}</p></Aviso></div>}
                                {uploadError && <div className="fa-mt"><Aviso><p>{uploadError}</p></Aviso></div>}
                                <div className="fa-btns2">
                                    <button className="fa-btn fa-btn-pri" onClick={startDigital} disabled={preparing || uploading}>
                                        {(preparing || uploading) ? <><Spinner /> {uploading ? 'Enviando…' : 'Preparando…'}</> : 'Firmar ahora con Autofirma'}
                                    </button>
                                </div>
                                <p className="fa-centro" style={{ margin: '8px 0 0' }}>
                                    <button className="fa-link fa-volver" onClick={() => { setModo(null); setPrepError(null); }}><IcoAtras size={18} /> Otra forma de firmar</button>
                                </p>
                            </div>
                        )}

                        {/* Firma a mano EN PANTALLA: lee, firma con el dedo y
                            manda la foto del DNI. El documento sale rasterizado
                            (aspecto de escaneo) y el backend le anexa los DNI
                            igual que a un escaneo de papel. El asistente es una
                            pieza del CRM: en `.theme-light` se ve en claro sin
                            tocarlo, como el gestor de fotos en /subir-docs. */}
                        {modo === 'manual' && (
                            esDemo ? (
                                <>
                                    <div className="fa-hueco">Aquí va el asistente para leer los anexos y firmarlos con el dedo. En la prueba no se carga.</div>
                                    <p className="fa-centro" style={{ margin: '4px 0 0' }}>
                                        <button className="fa-link fa-volver" onClick={() => setModo(null)}><IcoAtras size={18} /> Otra forma de firmar</button>
                                    </p>
                                </>
                            ) : (
                                <div className="fa-card">
                                    <div className="theme-light">
                                        <AsistenteFirmaManuscrita
                                            expedienteId={expedienteId}
                                            info={infoFirma}
                                            apiUrl={API_URL}
                                            onHecho={() => setDone(true)}
                                            onSalir={() => setModo(null)}
                                        />
                                    </div>
                                </div>
                            )
                        )}

                        {modo === 'subir' && (
                            <>
                                <p style={{ margin: 0 }}>
                                    <button className="fa-link fa-volver" onClick={() => setModo(null)}><IcoAtras size={18} /> Otra forma de firmar</button>
                                </p>
                                {/* Paso 1 · Descargar para firmar */}
                                <div className="fa-card">
                                    <p className="fa-eyebrow"><span className="fa-paso">1</span> Firma tus anexos</p>
                                    <p className="fa-txt">
                                        {hayDescarga
                                            ? 'Descárgalos, fírmalos (con certificado o a mano) y vuelve aquí para subirlos.'
                                            : 'Firma el anexo que te enviamos por WhatsApp o email (con certificado o a mano) y súbelo aquí abajo.'}
                                    </p>
                                    {hayDescarga && (
                                        <div className="fa-descargas">
                                            {firmarI && <a className="fa-btn fa-btn-sec" href={descargarUrl('anexo_i')}><IcoBajar size={20} /> Anexo I</a>}
                                            {firmarC && <a className="fa-btn fa-btn-sec" href={descargarUrl('cesion')}><IcoBajar size={20} /> Anexo de Cesión</a>}
                                        </div>
                                    )}
                                </div>

                                {/* Paso 2 · Subir lo firmado y el DNI */}
                                <div className="fa-card">
                                    <p className="fa-eyebrow"><span className="fa-paso">2</span> Súbelos firmados</p>
                                    <p className="fa-txt">Con la foto de tu DNI por las dos caras. Vale el PDF firmado o una foto o escaneo nítido.</p>
                                    <div className="fa-subidas">
                                        {(firmarI || !info.anexo_i_disponible) && (
                                            <DropZone file={anexoI} onPick={f => pickFile(f, setAnexoI)} alreadyUploaded={info.anexo_i_firmado} title="Anexo I firmado" desc="La Declaración Responsable que te enviamos." />
                                        )}
                                        {(firmarC || !info.anexo_cesion_disponible) && (
                                            <DropZone file={cesion} onPick={f => pickFile(f, setCesion)} alreadyUploaded={info.anexo_cesion_firmado} title="Anexo de Cesión firmado" desc="El Convenio de Cesión de ahorros que te enviamos." />
                                        )}
                                    </div>

                                    {/* Tipo de firma de la Cesión */}
                                    {cesion && (
                                        <div className="fa-subcaja">
                                            <p className="fa-subcaja-t">¿Cómo has firmado la Cesión?</p>
                                            <div className="fa-elige-par">
                                                <button type="button" className={`fa-elige ${cesionFirma === 'electronica' ? 'fa-elige-sel' : ''}`} onClick={() => setCesionFirma('electronica')}>
                                                    Electrónica<small>Con certificado</small>
                                                </button>
                                                <button type="button" className={`fa-elige ${cesionFirma === 'manuscrita' ? 'fa-elige-sel' : ''}`} onClick={() => setCesionFirma('manuscrita')}>
                                                    A mano<small>Firmada y escaneada</small>
                                                </button>
                                            </div>
                                            {cesionManuscrita && (
                                                <p className="fa-txt" style={{ fontSize: 13.5 }}>Al ser firma a mano, necesitamos la foto del DNI por las dos caras: la adjuntamos nosotros al Anexo de Cesión.</p>
                                            )}
                                        </div>
                                    )}

                                    {/* DNI por ambas caras */}
                                    <div className="fa-subidas fa-subidas-dos">
                                        <DropZone file={dniFrontal} onPick={f => pickFile(f, setDniFrontal)} alreadyUploaded={info.dni_subido} accept="image/*,application/pdf" obligatorio={dniRequerido}
                                            title="DNI, por delante" />
                                        <DropZone file={dniTrasero} onPick={f => pickFile(f, setDniTrasero)} alreadyUploaded={info.dni_subido} accept="image/*,application/pdf" obligatorio={dniRequerido}
                                            title="DNI, por detrás" />
                                    </div>
                                    {/* VARIOS CEDENTES: el DNI de cada uno de los demás que firman. */}
                                    {extrasIdx.map(i => (
                                        <div key={i}>
                                            <p className="fa-dni-de" style={{ marginTop: 18 }}>DNI de {cedentesInfo[i].nombre}</p>
                                            <div className="fa-subidas fa-subidas-dos" style={{ marginTop: 10 }}>
                                                <DropZone file={dnisExtra[i]?.frontal || null} onPick={f => pickFile(f, ponDniExtra(i, 'frontal'))} accept="image/*,application/pdf" obligatorio={dniRequerido}
                                                    title="Por delante" />
                                                <DropZone file={dnisExtra[i]?.trasero || null} onPick={f => pickFile(f, ponDniExtra(i, 'trasero'))} accept="image/*,application/pdf" obligatorio={dniRequerido}
                                                    title="Por detrás" />
                                            </div>
                                        </div>
                                    ))}

                                    {faltaDni && (
                                        <div className="fa-mt">
                                            <Aviso><p>{extrasIdx.length
                                                ? 'Para la firma a mano de la Cesión, sube el DNI de todos los que firmáis, por delante y por detrás.'
                                                : 'Para la firma a mano de la Cesión, sube el DNI por delante y por detrás.'}</p></Aviso>
                                        </div>
                                    )}
                                    {uploadError && <div className="fa-mt"><Aviso><p>{uploadError}</p></Aviso></div>}

                                    <div className="fa-btns2">
                                        <button className="fa-btn fa-btn-pri" onClick={handleSubmit} disabled={!puedeEnviar}>
                                            {uploading ? <><Spinner /> Subiendo…</> : 'Enviar documentación'}
                                        </button>
                                    </div>
                                    <p className="fa-nota">Puedes subir lo que tengas ahora y volver después a este enlace.</p>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Modal de firma con Autofirma (destello en la zona de firma).
                Firma el CLIENTE con su certificado: sin rúbrica (el logo de Brokergy no
                pinta nada en la columna del Cedente y no tenemos imagen suya), así que el
                recuadro lo rellena el texto del propio certificado — "Firmado por <titular>"
                y la fecha, que es lo que compone `layer2Text` en el modal. */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar ${signQueue[signIndex]?.label || 'documento'}${signQueue.length > 1 ? ` (${signIndex + 1}/${signQueue.length})` : ''} · ${info.numero_expediente}`}
                    rubricImageUrl={null}
                    signatureAnchor={signQueue[signIndex]?.anchor}
                    fixedBox={signQueue[signIndex]?.fixedBox}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleAnexoSigned}
                />
            )}
        </Marco>
    );
}

export default FirmarAnexosView;
