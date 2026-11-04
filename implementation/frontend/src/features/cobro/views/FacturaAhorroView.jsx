/**
 * FacturaAhorroView — /factura-ahorro/:expedienteId?token=
 *
 * La página de la AUTOFACTURA de un cliente EMPRESA (04/11/2026, Fran). Una
 * empresa nos VENDE el ahorro y el pago lo justifica su factura; para no
 * pedirle que la haga, la expedimos nosotros en su nombre («facturación por el
 * destinatario», art. 5 RD 1619/2012), como hace Iberdrola con nosotros. Aquí:
 *   1. Acepta el ACUERDO de facturación (nombre y DNI de quien firma). En ese
 *      momento —y no antes— se expide la factura con su número.
 *   2. Revisa la factura y la ACEPTA, o dice qué está mal.
 *   3. Aceptada: le diremos cuando salga la transferencia (sin fecha: depende
 *      de nosotros, pero no se promete).
 *
 * DISEÑO: el estilo «carta de pago» (regla 164): crema, tarjetas blancas,
 * Antonio + Inter, UNA cifra protagonista, UNA acción naranja por tarjeta,
 * móvil primero. CSS propio con prefijo `.fa-`.
 *
 * La API se pide en RELATIVO (se abre desde un WhatsApp en el móvil).
 * /factura-ahorro/demo — con datos de MENTIRA, sin llamar a la API.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { eurEs } from '../logic/cobroForm';

const API = '/api/public';
const DEMO = 'demo';

const vistaDemo = (paso = 0) => ({
    numero_expediente: '26RES080_000',
    razon_social: 'EMPRESA DE EJEMPLO SL',
    cif: 'B00000000',
    firmante: { nombre: 'María Ejemplo Ejemplo', dni: '00000000T' },
    acuerdo: [
        'María Ejemplo Ejemplo (DNI 00000000T), en nombre y representación de EMPRESA DE EJEMPLO SL (B00000000), en adelante el PROVEEDOR, y SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL (B19350222), en adelante el DESTINATARIO, acuerdan:',
        '1. Que las facturas por la venta al DESTINATARIO de los ahorros energéticos … las expida materialmente el DESTINATARIO, en nombre y por cuenta del PROVEEDOR.',
        '2. Que esas facturas se numeren en una serie específica («AF») y lleven la mención «Facturación por el destinatario».',
    ],
    acuerdo_aceptado: paso > 0 ? { at: new Date().toISOString(), nombre: 'María Ejemplo Ejemplo' } : null,
    factura: {
        numero: paso > 0 ? 'AF-2026-001' : null, fecha: '2026-11-04',
        lineas: [{ descripcion: 'Venta de Ahorros Energéticos para la emisión de Certificados de Ahorro Energético (CAE)', detalle: 'Expediente 26RES080_000\nAhorro verificado: 81.157 kWh × 0,100 €/kWh = 8.115,70 €', importe: 8115.7 }],
        neto: 8115.7, iva: 1704.3, iva_pct: 21, total: 9820, pdf: false,
    },
    estado: paso === 0 ? 'PEDIDA' : paso === 1 ? 'PENDIENTE_ACEPTACION' : 'ACEPTADA',
    aceptada: paso === 2 ? { at: new Date().toISOString(), nombre: 'María Ejemplo Ejemplo' } : null,
    rechazo: null,
    pagada: false,
});

const CSS = `
@font-face{font-family:'Antonio';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Antonio-700-latin.woff2') format('woff2')}
.fa{--crema:#faf9f7;--tinta:#141111;--gris:#55585f;--gris2:#6b6e76;--linea:rgba(20,17,17,.08);--naranja:#ffa000;--naranja-txt:#b33a0a;--verde:#b1d13e;--verde-txt:#4d6b0f;--lima:#c7f601;
  --filete:linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%);
  color-scheme:light;min-height:100vh;min-height:100dvh;background:var(--crema);color:var(--tinta);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.fa *{box-sizing:border-box}
.fa-filete-top{height:4px;background:var(--filete)}
.fa-col{position:relative;max-width:440px;margin:0 auto;padding:18px 16px calc(36px + env(safe-area-inset-bottom))}
.fa-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 22px}
.fa-logo{height:26px;width:auto;display:block}
.fa-exp{font:600 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gris);background:#fff;border:1px solid var(--linea);border-radius:999px;padding:7px 10px}
.fa-stack > * + *{margin-top:14px}
.fa-card{background:#fff;border:1px solid var(--linea);border-radius:24px;box-shadow:0 1px 2px rgba(20,17,17,.04),0 8px 24px -12px rgba(20,17,17,.10);overflow:hidden}
.fa-pad{padding:22px 20px}
.fa-eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--naranja-txt)}
.fa-display{font-family:'Antonio','Inter',Impact,sans-serif;font-weight:700;color:var(--tinta)}
.fa-importe{font-size:64px;line-height:.95;margin:12px 0 0;white-space:nowrap}
.fa-meta{margin:10px 0 0;font-size:14px;color:var(--gris);line-height:1.5}
.fa-meta b{color:var(--tinta);font-weight:600}
.fa-filete{height:6px;background:var(--filete)}
.fa-h2{font-size:28px;line-height:1.08;margin:0}
.fa-mark{background:var(--lima);padding:.04em .1em 0;border-radius:5px}
.fa-sub{font-size:15px;line-height:1.55;color:var(--gris);margin:10px 0 0}
.fa-acuerdo{margin:14px 0 0;padding:14px;border-radius:16px;background:var(--crema);border:1px solid var(--linea);font-size:13.5px;line-height:1.55;color:#3b3e45;max-height:240px;overflow:auto}
.fa-acuerdo p{margin:0 0 8px}
.fa-campo{display:block;margin-top:12px}
.fa-campo span{display:block;font-size:12.5px;font-weight:600;color:var(--gris);margin-bottom:6px}
.fa-campo input,.fa-campo textarea{width:100%;min-height:50px;padding:12px 14px;border-radius:14px;border:1.5px solid rgba(20,17,17,.14);font:500 16px 'Inter',sans-serif;color:var(--tinta);background:#fff;outline:none}
.fa-campo input:focus,.fa-campo textarea:focus{border-color:var(--tinta)}
.fa-check{display:flex;gap:12px;align-items:flex-start;margin-top:14px;font-size:14.5px;line-height:1.45;color:#3b3e45;cursor:pointer}
.fa-check input{width:22px;height:22px;flex:none;margin-top:1px;accent-color:#141111}
.fa-filas{margin:14px 0 0;border-top:1px solid var(--linea)}
.fa-fila{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--linea);font-size:14px}
.fa-fila:last-child{border-bottom:0}
.fa-fila dt{color:var(--gris)}
.fa-fila dd{margin:0;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}
.fa-linea{font-size:14px;line-height:1.45;margin:14px 0 0}
.fa-linea small{display:block;color:var(--gris2);font-size:12.5px;white-space:pre-line;margin-top:4px}
.fa-btns{display:grid;gap:10px;margin-top:18px}
.fa-btn{appearance:none;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 20px;border-radius:16px;border:0;cursor:pointer;font:700 16.5px/1.2 'Inter',sans-serif;text-decoration:none}
.fa-btn:disabled{opacity:.5;cursor:default}
.fa-btn:focus-visible{outline:3px solid var(--tinta);outline-offset:3px}
.fa-btn-pri{background:var(--naranja);color:#08090c;box-shadow:0 10px 22px -10px rgba(255,160,0,.75)}
.fa-btn-sec{background:#fff;color:var(--tinta);border:1.5px solid rgba(20,17,17,.14);min-height:52px;font-size:15.5px}
.fa-link{appearance:none;background:none;border:0;cursor:pointer;min-height:44px;font:600 14.5px 'Inter',sans-serif;color:var(--tinta);text-decoration:underline;text-underline-offset:3px}
.fa-ok{display:flex;align-items:center;gap:14px}
.fa-ok-ico{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:rgba(177,209,62,.2);color:var(--verde-txt)}
.fa-ambar{padding:16px;border-radius:18px;background:#fff7e6;border:1px solid #f6dca4;color:#5c4100;font-size:14.5px;line-height:1.55}
.fa-ambar b{color:#3d2a00}
.fa-error{margin:12px 0 0;font-size:14px;color:#8a3a00}
.fa-nota{font-size:13px;color:var(--gris2);text-align:center;margin:12px 0 0;line-height:1.5}
.fa-firma{font-size:14px;color:var(--gris);margin:18px 2px 0;line-height:1.5}
`;

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export function FacturaAhorroView({ expedienteId, token }) {
    const demo = expedienteId === DEMO;
    const [v, setV] = useState(null);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [dni, setDni] = useState('');
    const [leido, setLeido] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [errorAccion, setErrorAccion] = useState('');
    const [verError, setVerError] = useState(false);
    const [motivo, setMotivo] = useState('');

    const q = `token=${encodeURIComponent(token || '')}`;

    useEffect(() => {
        if (demo) { setV(vistaDemo(0)); setCargando(false); return; }
        axios.get(`${API}/factura-ahorro/${expedienteId}?${q}`)
            .then(({ data }) => setV(data))
            .catch(e => setError(e.response?.data?.error || 'No hemos podido abrir la factura.'))
            .finally(() => setCargando(false));
    }, [expedienteId, q, demo]);

    useEffect(() => {
        if (!v) return;
        setNombre(n => n || v.firmante?.nombre || '');
        setDni(d => d || v.firmante?.dni || '');
    }, [v]);

    const accion = async (ruta, body, demoPaso) => {
        setErrorAccion('');
        if (demo) { setV(vistaDemo(demoPaso)); return; }
        setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/factura-ahorro/${expedienteId}/${ruta}`, { token, ...body });
            setV(data);
            setVerError(false);
        } catch (e) {
            setErrorAccion(e.response?.data?.error || 'No se ha podido guardar. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const firmanteOk = nombre.trim().length >= 5 && /^[A-Z0-9]{8,10}$/i.test(dni.replace(/[\s.-]/g, ''));
    const fac = v?.factura || {};
    const pdfUrl = `${API}/factura-ahorro/${expedienteId}/pdf?${q}`;

    return (
        <div className="fa">
            <style>{CSS}</style>
            <div className="fa-filete-top" />
            <div className="fa-col">
                <div className="fa-head">
                    <img className="fa-logo" src="/logo_brokergy_dark.png" alt="BROKERGY · Ingeniería Energética" width="130" height="26" />
                    {v?.numero_expediente && <span className="fa-exp">{v.numero_expediente}</span>}
                </div>

                {cargando && <p className="fa-nota">Abriendo la factura…</p>}
                {error && <div className="fa-ambar">{error}</div>}

                {v && (
                    <div className="fa-stack">
                        <div className="fa-card">
                            <div className="fa-pad">
                                <div className="fa-eyebrow">Venta del ahorro energético</div>
                                <div className="fa-display fa-importe">{eurEs(fac.total)}</div>
                                <p className="fa-meta">
                                    <b>{v.razon_social}</b> · {v.cif}<br />
                                    {eurEs(fac.neto)}{Number(fac.iva_pct) > 0 ? ` + ${eurEs(fac.iva)} de IVA (${fac.iva_pct} %)` : ' (operación no sujeta a IVA)'}
                                </p>
                            </div>
                            <div className="fa-filete" />
                        </div>

                        {/* 1 · El ACUERDO (antes de expedir nada) */}
                        {!v.acuerdo_aceptado && (
                            <div className="fa-card"><div className="fa-pad">
                                <h1 className="fa-display fa-h2">Os hacemos la <span className="fa-mark">factura</span></h1>
                                <p className="fa-sub">Como sois una empresa, la ayuda se cobra vendiéndonos el ahorro con una factura. Para que no tengáis que hacerla, la expedimos nosotros en vuestro nombre. Para eso la ley pide este acuerdo previo:</p>
                                <div className="fa-acuerdo">{(v.acuerdo || []).map((p, i) => <p key={i}>{p}</p>)}</div>
                                <label className="fa-campo"><span>Nombre y apellidos de quien acepta</span>
                                    <input className="no-uppercase" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" /></label>
                                <label className="fa-campo"><span>DNI</span>
                                    <input value={dni} onChange={e => setDni(e.target.value.toUpperCase())} autoComplete="off" /></label>
                                <label className="fa-check">
                                    <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} />
                                    <span>He leído el acuerdo y lo acepto en nombre de <b>{v.razon_social}</b>.</span>
                                </label>
                                {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                <div className="fa-btns">
                                    <button type="button" className="fa-btn fa-btn-pri" disabled={!leido || !firmanteOk || enviando}
                                        onClick={() => accion('acuerdo', { nombre: nombre.trim(), dni: dni.trim() }, 1)}>
                                        {enviando ? 'Preparando la factura…' : 'Aceptar y ver la factura'}
                                    </button>
                                </div>
                            </div></div>
                        )}

                        {/* 2 · La FACTURA expedida, para aceptarla */}
                        {v.acuerdo_aceptado && fac.numero && (
                            <div className="fa-card"><div className="fa-pad">
                                {v.estado === 'ACEPTADA' ? (
                                    <div className="fa-ok">
                                        <div className="fa-ok-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" pathLength="100" /></svg></div>
                                        <div>
                                            <h1 className="fa-display fa-h2">Factura <span className="fa-mark">aceptada</span></h1>
                                            <p className="fa-sub" style={{ marginTop: 6 }}>{v.pagada ? 'Ya os hemos hecho la transferencia.' : 'Os avisaremos en cuanto salga la transferencia.'}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h1 className="fa-display fa-h2">Revisa tu <span className="fa-mark">factura</span></h1>
                                        <p className="fa-sub">La hemos expedido en vuestro nombre. Si está bien, acéptala: es lo que nos permite pagaros.</p>
                                    </>
                                )}
                                <dl className="fa-filas">
                                    <div className="fa-fila"><dt>Factura</dt><dd>{fac.numero}</dd></div>
                                    <div className="fa-fila"><dt>Fecha</dt><dd>{fac.fecha ? fac.fecha.split('-').reverse().join('/') : ''}</dd></div>
                                    <div className="fa-fila"><dt>Base</dt><dd>{eurEs(fac.neto)}</dd></div>
                                    <div className="fa-fila"><dt>IVA ({fac.iva_pct} %)</dt><dd>{eurEs(fac.iva)}</dd></div>
                                    <div className="fa-fila"><dt><b>Total</b></dt><dd>{eurEs(fac.total)}</dd></div>
                                </dl>
                                {(fac.lineas || []).map((l, i) => <p key={i} className="fa-linea">{l.descripcion}{l.detalle && <small>{l.detalle}</small>}</p>)}
                                <div className="fa-btns">
                                    {!demo && <a className="fa-btn fa-btn-sec" href={pdfUrl} target="_blank" rel="noreferrer">Ver la factura en PDF</a>}
                                    {v.estado === 'PENDIENTE_ACEPTACION' && !verError && (
                                        <>
                                            <label className="fa-campo"><span>Acepta, en nombre de {v.razon_social}</span>
                                                <input className="no-uppercase" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" />
                                            </label>
                                            <label className="fa-campo"><span>DNI</span>
                                                <input value={dni} onChange={e => setDni(e.target.value.toUpperCase())} autoComplete="off" />
                                            </label>
                                            {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                            <button type="button" className="fa-btn fa-btn-pri" disabled={!firmanteOk || enviando}
                                                onClick={() => accion('responder', { accion: 'aceptar', nombre: nombre.trim(), dni: dni.trim() }, 2)}>
                                                {enviando ? 'Guardando…' : 'Acepto la factura'}
                                            </button>
                                            <button type="button" className="fa-link" onClick={() => setVerError(true)}>Hay algo que no está bien</button>
                                        </>
                                    )}
                                    {v.estado === 'PENDIENTE_ACEPTACION' && verError && (
                                        <>
                                            <label className="fa-campo"><span>¿Qué hay que corregir?</span>
                                                <textarea className="no-uppercase" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por ejemplo: la dirección fiscal es otra" />
                                            </label>
                                            {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                            <button type="button" className="fa-btn fa-btn-pri" disabled={motivo.trim().length < 5 || enviando}
                                                onClick={() => accion('responder', { accion: 'rechazar', nombre: nombre.trim(), motivo: motivo.trim() }, 1)}>
                                                {enviando ? 'Enviando…' : 'Enviar la corrección'}
                                            </button>
                                            <button type="button" className="fa-link" onClick={() => setVerError(false)}>Volver</button>
                                        </>
                                    )}
                                </div>
                            </div></div>
                        )}

                        {v.estado === 'RECHAZADA' && v.rechazo && (
                            <div className="fa-ambar">
                                <b>Nos has dicho:</b> «{v.rechazo.motivo}». Lo revisamos y te mandamos la factura corregida por aquí mismo.
                            </div>
                        )}

                        {v.acuerdo_aceptado && (
                            <p className="fa-nota">Acuerdo de facturación aceptado el {fechaCorta(v.acuerdo_aceptado.at)} por {v.acuerdo_aceptado.nombre}.</p>
                        )}
                        <p className="fa-firma">Cualquier duda, contesta al WhatsApp.<br />Un saludo, <b>Fran Moya</b> · BROKERGY</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default FacturaAhorroView;
