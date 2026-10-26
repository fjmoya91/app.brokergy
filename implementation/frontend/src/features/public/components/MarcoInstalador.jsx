import React, { useState, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// El marco de las páginas del INSTALADOR (/instalador, /subir-cifo, /subir-rite)
// en el estilo «carta de pago» (regla 164), y las piezas que comparten con sus
// tarjetas (FirmarCifoCard, SubirRiteCard). Prefijo `.in-`: las tres páginas y
// las dos tarjetas son una misma superficie, así que comparten un solo CSS.
// ─────────────────────────────────────────────────────────────────────────────

export const CSS_INSTALADOR = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.in{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.in *{box-sizing:border-box}
.in ::selection{background:var(--lima);color:var(--tinta)}
.in-filete-top{height:4px;background:var(--filete)}
.in-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.in-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.in-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.in-logo{height:26px;width:auto;display:block}
.in-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px;letter-spacing:.02em;white-space:nowrap}
.in-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.in-h1{font-size:42px;line-height:1.16;margin:6px 2px 0}
.in-h2{font-size:26px;line-height:1.16;margin:8px 0 0}
.in-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.in-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.in-sub b{color:var(--tinta);font-weight:700}
.in-txt{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.in-txt b{color:var(--tinta);font-weight:700}
.in-stack{margin-top:22px}
.in-stack > * + *{margin-top:14px}
.in-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);position:relative;overflow:hidden;padding:22px 20px}
.in-filete-fino{position:absolute;top:0;left:0;right:0;height:4px;background:var(--filete)}
.in-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0}
.in-eyebrow-gris{color:var(--gris)}
.in-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;background:var(--lima);color:var(--tinta)}
.in-ico-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center}
/* datos de la obra */
.in-dl{margin:12px 0 0}
.in-dl div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid var(--linea);font-size:14px;line-height:1.4}
.in-dl div:first-child{border-top:0;padding-top:2px}
.in-dl dt{color:var(--gris);flex:none}
.in-dl dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
/* avisos */
.in-aviso{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;font-size:14.5px;line-height:1.5}
.in-aviso p{margin:0}
.in-aviso p + p{margin-top:6px}
.in-aviso b{font-weight:700}
.in-aviso-ambar{background:#fff7e6;border:1px solid #f6dca4;color:#5c4100}
.in-aviso-ambar .in-ico-tile{background:#ffe9bd;color:#7a4b00}
.in-aviso-ok{background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409}
.in-aviso-ok .in-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt)}
.in-aviso-t{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
.in-aviso-nota{font-size:13px;opacity:.85}
.in-mt{margin-top:14px}
.in-demo{margin:0 0 16px;padding:10px 14px;border-radius:14px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;font-size:12.5px;line-height:1.45;color:var(--gris)}
.in-demo b{color:var(--tinta)}
/* botones */
.in-btn{appearance:none;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;
  font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none;text-align:center;transition:transform .12s ease,box-shadow .2s ease,filter .2s ease,border-color .2s ease}
.in-btn:active{transform:scale(.98)}
.in-btn:disabled{opacity:.5;cursor:default;transform:none}
.in-btn:focus-visible,.in-link:focus-visible,.in-tarea-cab:focus-visible,.in-drop:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.in-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 10px 22px -10px rgba(255,160,0,.75)}
.in-btn-pri:hover:not(:disabled){filter:brightness(1.04)}
.in-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.in-btn-sec:hover:not(:disabled){border-color:rgba(20,17,17,.3)}
.in-btns{display:grid;gap:10px;margin-top:16px}
.in-link{appearance:none;background:none;border:0;cursor:pointer;padding:0;min-height:44px;font:inherit;font-size:14.5px;font-weight:700;color:var(--tinta);text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(20,17,17,.35);border-radius:6px}
.in-o{display:flex;align-items:center;gap:12px;margin:22px 0 18px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--gris2)}
.in-o::before,.in-o::after{content:'';flex:1;height:1px;background:var(--linea)}
.in-nota{font-size:12.5px;color:var(--gris2);line-height:1.45;margin:10px 2px 0;text-align:center}
.in-spin{animation:in-rot .8s linear infinite}
/* tareas de /instalador */
.in-tarea{padding:0}
.in-tarea-cab{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:center;gap:14px;padding:18px 20px;background:none;border:0;cursor:pointer;text-align:left;color:var(--tinta);font:inherit;border-radius:24px}
.in-tarea .in-ico-tile{background:var(--crema);color:var(--tinta);border:1px solid var(--linea)}
.in-tarea-abierta .in-ico-tile{background:rgba(255,160,0,.18);color:#8a4b00;border-color:transparent}
.in-tarea-cuerpo{flex:1;min-width:0}
.in-tarea-n{display:block;font-size:10.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.in-tarea-t{display:block;font-size:16.5px;font-weight:700;line-height:1.3;margin-top:2px}
.in-tarea-r{display:block;font-size:13.5px;line-height:1.45;color:var(--gris);margin-top:3px}
.in-chev{flex:none;color:var(--gris2);transition:transform .2s ease}
.in-tarea-abierta .in-chev{transform:rotate(180deg)}
.in-tarea-dentro{padding:2px 20px 22px;border-top:1px solid var(--linea)}
.in-hecha{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;background:rgba(177,209,62,.12);border:1px solid rgba(177,209,62,.35);color:#3c5409;font-size:14px;font-weight:600}
.in-hecha .in-ico-tile{width:32px;height:32px;border-radius:10px;background:rgba(177,209,62,.25);color:var(--verde-txt)}
/* zona de subir */
.in-subidas{display:grid;gap:16px;margin-top:16px}
.in-drop-t{display:block;font-size:14.5px;font-weight:700;line-height:1.35;margin:0 2px}
.in-drop-d{display:block;font-size:13px;line-height:1.45;color:var(--gris);margin:2px 2px 8px}
.in-drop{appearance:none;-webkit-tap-highlight-color:transparent;width:100%;display:flex;align-items:center;gap:12px;min-height:64px;padding:12px 14px;border-radius:16px;cursor:pointer;text-align:left;
  border:1.5px dashed rgba(20,17,17,.2);background:var(--crema);color:var(--tinta);font:inherit;transition:border-color .2s ease,background-color .2s ease,transform .12s ease}
.in-drop:hover{border-color:rgba(20,17,17,.4)}
.in-drop:active{transform:scale(.99)}
.in-drop .in-ico-tile{background:#fff;color:var(--gris);border:1px solid var(--linea)}
.in-drop-arr{border-color:var(--naranja);background:#fffaf0}
.in-drop-sel{border-style:solid;border-color:var(--naranja);background:#fffaf0}
.in-drop-sel .in-ico-tile{background:rgba(255,160,0,.18);color:#8a4b00;border-color:transparent}
.in-drop-ok{border-style:solid;border-color:rgba(177,209,62,.55);background:rgba(177,209,62,.08)}
.in-drop-ok .in-ico-tile{background:rgba(177,209,62,.25);color:var(--verde-txt);border-color:transparent}
.in-drop-main{flex:1;min-width:0}
.in-drop-main b{display:block;font-size:14.5px;font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.in-drop-main span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px}
/* hecho */
.in-check{width:76px;height:76px;display:block}
.in-check circle{fill:rgba(177,209,62,.16);stroke:var(--verde);stroke-width:3;stroke-dasharray:102;stroke-dashoffset:102;animation:in-draw .6s cubic-bezier(.65,0,.45,1) .1s forwards;transform:rotate(-90deg);transform-origin:center}
.in-check path{fill:none;stroke:var(--verde-txt);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:in-draw .38s cubic-bezier(.65,0,.45,1) .62s forwards}
/* firma */
.in-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.in-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.in-firma b{display:block;font-size:15px;font-weight:700}
.in-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.in-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.in-espera{min-height:60vh;display:flex;align-items:center;justify-content:center;gap:12px;font-size:15px;font-weight:600;color:var(--gris)}
.in-espera .in-spin{color:var(--naranja)}
.in-in{animation:in-up .55s cubic-bezier(.2,.8,.2,1) both}
.in-in-2{animation-delay:.08s}
@keyframes in-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes in-draw{to{stroke-dashoffset:0}}
@keyframes in-rot{to{transform:rotate(360deg)}}
@media (max-width:360px){.in-h1{font-size:36px}.in-card{padding:20px 16px}.in-tarea-cab{padding:16px}.in-tarea-dentro{padding:2px 16px 20px}}
@media (min-width:768px){.in-col{padding-top:40px}.in-card{padding:26px}.in-tarea{padding:0}}
@media (prefers-reduced-motion:reduce){.in-in,.in-spin{animation:none}.in-check circle,.in-check path{animation:none;stroke-dashoffset:0}}
`;

const Ico = ({ size = 22, sw = 2, children }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);
export const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
export const IcoOk = (p) => <Ico {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Ico>;
export const IcoSubir = (p) => <Ico {...p}><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Ico>;
export const IcoPapel = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
export const IcoPluma = (p) => <Ico {...p}><path d="M14.5 4.5l5 5L11 18H6v-5l8.5-8.5z" /><path d="M4 21h16" /></Ico>;
export const IcoChev = (p) => <Ico {...p}><path d="M6 9l6 6 6-6" /></Ico>;
export const IcoReloj = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Ico>;

export const Spinner = ({ size = 20 }) => (
    <svg className="in-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

export const CheckDibujado = () => (
    <svg className="in-check" viewBox="0 0 60 60" width="76" height="76" aria-hidden="true">
        <circle cx="30" cy="30" r="26.5" pathLength="100" />
        <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
    </svg>
);

export const Aviso = ({ tono = 'ambar', titulo, children }) => (
    <div className={`in-aviso in-aviso-${tono}`} role={tono === 'ambar' ? 'alert' : undefined}>
        <span className="in-ico-tile">{tono === 'ok' ? <IcoOk size={20} /> : <IcoAlerta size={20} />}</span>
        <div>
            {titulo && <span className="in-aviso-t">{titulo}</span>}
            {children}
        </div>
    </div>
);

/** Elegir o arrastrar un PDF, con su estado: vacía, elegido o "ya lo tenemos". */
export function ZonaArchivo({ title, desc, file, onPick, alreadyUploaded, accept = 'application/pdf', vacio = 'Elegir el PDF' }) {
    const ref = useRef();
    const [dragging, setDragging] = useState(false);
    const replaced = alreadyUploaded && !file;
    const estado = dragging ? 'in-drop-arr' : file ? 'in-drop-sel' : replaced ? 'in-drop-ok' : '';
    return (
        <div>
            {title && <span className="in-drop-t">{title}</span>}
            {desc && <span className="in-drop-d">{desc}</span>}
            <input ref={ref} type="file" accept={accept} hidden onChange={e => onPick(e.target.files?.[0])} />
            <button type="button" className={`in-drop ${estado}`}
                onClick={() => ref.current?.click()}
                onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}>
                <span className="in-ico-tile">{file ? <IcoPapel /> : replaced ? <IcoOk /> : <IcoSubir />}</span>
                <span className="in-drop-main">
                    {dragging ? (
                        <><b>Suéltalo aquí</b><span>Solo PDF</span></>
                    ) : file ? (
                        <><b>{file.name}</b><span>{(file.size / 1024).toFixed(0)} KB · pulsa para cambiarlo</span></>
                    ) : replaced ? (
                        <><b>Ya lo tenemos</b><span>Pulsa si quieres reemplazarlo</span></>
                    ) : (
                        <><b>{vacio}</b><span>Pulsa o arrastra el archivo aquí</span></>
                    )}
                </span>
            </button>
        </div>
    );
}

/** El papel crema: logo y nº de expediente arriba, la firma de Fran abajo. */
export const MarcoInstalador = ({ numero, demo = false, children }) => (
    <div className="in">
        <style>{CSS_INSTALADOR}</style>
        <div className="in-filete-top" />
        <div className="in-halo" />
        <main className="in-col">
            <header className="in-head in-in">
                <img className="in-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                {numero && <span className="in-exp">{numero}</span>}
            </header>
            {demo && <p className="in-demo in-in"><b>Prueba</b> · datos de mentira: no se guarda ni se envía nada.</p>}
            {children}
            <footer>
                <div className="in-firma">
                    <img className="in-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                    <div>
                        <b>Fran Moya</b>
                        <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                    </div>
                </div>
                <p className="in-pie">BROKERGY · Ingeniería Energética</p>
            </footer>
        </main>
    </div>
);

/** Cargando y enlace no válido: lo mismo en las tres páginas. */
export const CargandoInstalador = () => (
    <MarcoInstalador>
        <div className="in-espera"><Spinner size={24} /> Abriendo el expediente…</div>
    </MarcoInstalador>
);
export const EnlaceNoValido = ({ texto }) => (
    <MarcoInstalador>
        <div className="in-stack in-in">
            <div className="in-card">
                <span className="in-ico-tile" style={{ background: '#ffe9bd', color: '#7a4b00', width: 48, height: 48, borderRadius: 14 }}><IcoAlerta size={24} /></span>
                <h1 className="in-display in-h2" style={{ marginTop: 14 }}>Este enlace no <span className="in-mark">funciona</span></h1>
                <p className="in-txt">{texto} Si crees que es un error, contesta al mensaje en el que te llegó y te mandamos uno nuevo.</p>
            </div>
        </div>
    </MarcoInstalador>
);

/** Los datos de la obra, en filas. */
export const DatosObra = ({ filas }) => (
    <div className="in-card">
        <p className="in-eyebrow in-eyebrow-gris">La obra</p>
        <dl className="in-dl">
            {filas.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
        </dl>
    </div>
);
