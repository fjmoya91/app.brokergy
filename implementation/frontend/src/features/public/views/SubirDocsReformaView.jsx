/**
 * SubirDocsReformaView — página pública del enlace único de documentación.
 * URL: /subir-docs/:uuid?token=...
 *
 * Envoltorio de página: aporta el chrome (fondo, logo, firma) y delega toda la
 * lógica en <DocsManager> en modo token (subir/ver/borrar, sin validación).
 *
 * Con el estilo «carta de pago» (regla 164, prefijo `.sd-`, 24/10/2026). El
 * gestor es el del CRM (oscuro): va dentro de `.theme-light`, que remapea sus
 * clases al tema claro sin tocar el componente. Demo: /subir-docs/demo?token=demo
 * (no llama a la API: enseña el marco con un hueco donde va el gestor).
 */

import React from 'react';
import { DocsManager } from '../../docs/DocsManager';

const DEMO_UUID = 'demo';

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.sd{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja-txt:#b33a0a;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  position:relative;overflow-x:hidden}
.sd *{box-sizing:border-box}
.sd ::selection{background:var(--lima);color:var(--tinta)}
.sd-filete-top{height:4px;background:var(--filete)}
.sd-halo{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;
  background:radial-gradient(60% 55% at 50% 0%,rgba(255,160,0,.10),transparent 70%),radial-gradient(40% 40% at 85% 10%,rgba(199,246,1,.10),transparent 70%)}
.sd-col{position:relative;max-width:480px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.sd-head{margin:6px 2px 22px}
.sd-logo{height:26px;width:auto;display:block}
.sd-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt);margin:0 2px}
.sd-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;letter-spacing:-.005em;color:var(--tinta)}
.sd-h1{font-size:42px;line-height:1.16;margin:8px 2px 0}
.sd-mark{background:linear-gradient(transparent 14%,var(--lima) 14%);padding:0 .14em;border-radius:5px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.sd-sub{font-size:15.5px;line-height:1.55;color:var(--gris);margin:12px 2px 0}
.sd-sub b{color:var(--tinta);font-weight:600}
.sd-docs{margin-top:22px}
.sd-extra{display:flex;gap:12px;align-items:flex-start;margin-top:16px;padding:14px;border-radius:16px;background:#fff;border:1px solid var(--linea);font-size:14px;line-height:1.5;color:#3b3e45}
.sd-extra p{margin:0}
.sd-tile{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(177,209,62,.2);color:var(--verde-txt)}
.sd-hueco{padding:40px 16px;border-radius:24px;border:1.5px dashed rgba(20,17,17,.22);background:#fff;text-align:center;font-size:14px;line-height:1.5;color:var(--gris)}
.sd-firma{display:flex;align-items:center;gap:14px;margin:28px 4px 0;padding-top:22px;border-top:1px solid var(--linea)}
.sd-sello{flex:none;width:52px;height:52px;border-radius:50%;box-shadow:0 2px 8px -2px rgba(20,17,17,.18);background:#fff}
.sd-firma b{display:block;font-size:15px;font-weight:700}
.sd-firma span{display:block;font-size:12.5px;color:var(--gris);margin-top:2px;line-height:1.4}
.sd-pie{text-align:center;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gris2);margin:22px 0 0;font-weight:700}
.sd-in{animation:sd-up .55s cubic-bezier(.2,.8,.2,1) both}
.sd-in-2{animation-delay:.08s}
@keyframes sd-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (max-width:360px){.sd-h1{font-size:36px}}
@media (min-width:768px){.sd-col{max-width:680px;padding-top:40px}.sd-h1{font-size:46px}}
@media (prefers-reduced-motion:reduce){.sd-in{animation:none}}
`;

const IcoOjo = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
);

// `api` / `intro`: la MISMA página sirve la documentación del CEE de un CEE
// DIRECTO (/subir-cee-docs/:id), con sus rutas y su explicación.
export function SubirDocsReformaView({ uuid, token, rol = null, need = null, api = undefined, intro = null }) {
    const esDemo = uuid === DEMO_UUID;
    const rolLabel = rol === 'cliente' ? 'Documentación del estado ANTES de la obra'
        : rol === 'instalador' ? 'Documentación de la instalación (facturas, RITE y fotos)'
        : null;
    const titulo = intro
        ? <>Fotos para tu <span className="sd-mark">certificado</span></>
        : rol === 'instalador'
            ? <>Sube la <span className="sd-mark">documentación</span></>
            : <>Sube tus <span className="sd-mark">fotos</span></>;
    return (
        <div className="sd">
            <style>{CSS}</style>
            <div className="sd-filete-top" />
            <div className="sd-halo" />
            <main className="sd-col">
                <header className="sd-head sd-in">
                    <img className="sd-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                </header>

                {(intro || rolLabel) && <p className="sd-eyebrow sd-in">{intro || rolLabel}</p>}
                <h1 className="sd-display sd-h1 sd-in">{titulo}</h1>
                <p className="sd-sub sd-in sd-in-2">
                    Desde el móvil: al pulsar podrás usar la <b>cámara</b> o elegir de la <b>galería</b>.
                </p>

                <div className="sd-docs sd-in sd-in-2">
                    {esDemo ? (
                        <div className="sd-hueco">Aquí va el gestor de documentación del expediente, con sus apartados. En la prueba no se carga.</div>
                    ) : (
                        <div className="theme-light">
                            {/* `embedded`: el titular ya lo pone esta página; el del
                                gestor («Documentación del expediente») salía repetido. */}
                            <DocsManager mode="token" idOrUuid={uuid} token={token} rol={rol} need={need} api={api} embedded />
                        </div>
                    )}
                </div>

                <div className="sd-extra">
                    <span className="sd-tile"><IcoOjo /></span>
                    <p>Puedes volver a este enlace cuando quieras. Un técnico de BROKERGY revisará cada foto: si alguna no se ve bien, te avisaremos para repetirla.</p>
                </div>

                <footer>
                    <div className="sd-firma">
                        <img className="sd-sello" src="/logo-brokergy-circular.png" alt="" width="52" height="52" />
                        <div>
                            <b>Fran Moya</b>
                            <span>CEO de BROKERGY · Ingeniero colegiado nº 1779 COGITI</span>
                        </div>
                    </div>
                    <p className="sd-pie">BROKERGY · Ingeniería Energética</p>
                </footer>
            </main>
        </div>
    );
}

export default SubirDocsReformaView;
