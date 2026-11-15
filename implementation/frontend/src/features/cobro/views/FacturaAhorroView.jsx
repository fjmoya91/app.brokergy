/**
 * FacturaAhorroView — /factura-ahorro/:expedienteId?token=
 *
 * La FACTURA DE VENTA DEL AHORRO de un cliente EMPRESA (regla 194). Una empresa
 * nos VENDE el ahorro y el pago lo justifica su factura. Dos caminos, que elige
 * ÉL (Fran, 05/11/2026: «se le dan dos opciones y se le explica bien»):
 *
 *   · AUTOFACTURA — la expedimos nosotros en su nombre («facturación por el
 *     destinatario», art. 5 RD 1619/2012), como hace Iberdrola con nosotros:
 *       1. Acepta el ACUERDO de facturación (nombre y DNI de quien firma). En ese
 *          momento —y no antes— se expide la factura con su número.
 *       2. Revisa la factura y la ACEPTA, o dice qué está mal.
 *   · LA EMITE ÉL — le damos los datos que tiene que poner y un modelo en PDF, y
 *     SUBE aquí su factura (PDF, número y total).
 *
 * Lo normal es que llegue ya con la opción elegida en el formulario de cobro; si
 * no, la elige aquí. Puede cambiarla mientras no haya nada expedido ni subido.
 *
 * DISEÑO: el estilo «carta de pago» (regla 164): crema, tarjetas blancas,
 * Antonio + Inter, UNA cifra protagonista, UNA acción naranja por tarjeta,
 * móvil primero. CSS propio con prefijo `.fa-`.
 *
 * La API se pide en RELATIVO (se abre desde un WhatsApp en el móvil).
 * /factura-ahorro/demo[?paso=elegir|cliente|recibida] — con datos de MENTIRA,
 * sin llamar a la API.
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { eurEs } from '../logic/cobroForm';
import { POR_QUE_FACTURA, PASOS_AUTOFACTURA, PASOS_CLIENTE, datosFacturaCliente, textoDatosFactura, leerImporte } from '../../lotes/logic/facturaVentaAhorro';

const API = '/api/public';
const DEMO = 'demo';

const pasoDemoInicial = () => {
    try { return new URLSearchParams(window.location.search).get('paso') || 'acuerdo'; } catch { return 'acuerdo'; }
};

// paso: 'elegir' · 'acuerdo' · 'factura' · 'aceptada' · 'cliente' · 'recibida'
const vistaDemo = (paso = 'acuerdo') => {
    const modo = paso === 'elegir' ? null : (['cliente', 'recibida'].includes(paso) ? 'cliente' : 'autofactura');
    const expedida = ['factura', 'aceptada'].includes(paso);
    return {
        numero_expediente: '26RES080_000',
        razon_social: 'EMPRESA DE EJEMPLO SL',
        cif: 'B00000000',
        modo,
        puede_elegir: !expedida && paso !== 'recibida',
        sin_importe: false,
        firmante: { nombre: 'María Ejemplo Ejemplo', dni: '00000000T' },
        acuerdo: [
            'María Ejemplo Ejemplo (DNI 00000000T), en nombre y representación de EMPRESA DE EJEMPLO SL (B00000000), en adelante el PROVEEDOR, y SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL (B19350222), en adelante el DESTINATARIO, acuerdan:',
            '1. Que las facturas por la venta al DESTINATARIO de los ahorros energéticos … las expida materialmente el DESTINATARIO, en nombre y por cuenta del PROVEEDOR.',
            '2. Que esas facturas se numeren en una serie específica («AF») y lleven la mención «Facturación por el destinatario».',
        ],
        acuerdo_aceptado: expedida ? { at: new Date().toISOString(), nombre: 'María Ejemplo Ejemplo' } : null,
        factura: {
            numero: expedida ? 'AF-2026-001' : null, fecha: '2026-11-05',
            lineas: [{ descripcion: 'Venta de Ahorros Energéticos para la emisión de Certificados de Ahorro Energético (CAE)', detalle: 'Expediente 26RES080_000\nAhorro verificado: 81.157 kWh × 0,100 €/kWh = 8.115,70 €', importe: 8115.7 }],
            neto: 8115.7, iva: 1704.3, iva_pct: 21, total: 9820, pdf: false,
        },
        datos: datosFacturaCliente({ base: 8115.7, ivaPct: 21, iva: 1704.3, total: 9820, kwh: 81157, expediente: '26RES080_000' }),
        recibida: paso === 'recibida' ? { at: new Date().toISOString(), numero: 'F-2026-118', total: 9820 } : null,
        estado: paso === 'elegir' ? null : paso === 'factura' ? 'PENDIENTE_ACEPTACION' : paso === 'aceptada' ? 'ACEPTADA' : paso === 'recibida' ? 'RECIBIDA' : 'PEDIDA',
        aceptada: paso === 'aceptada' ? { at: new Date().toISOString(), nombre: 'María Ejemplo Ejemplo' } : null,
        rechazo: null,
        pagada: false,
    };
};

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
/* elegir */
.fa-opc{appearance:none;display:block;width:100%;text-align:left;margin-top:12px;padding:16px;border-radius:18px;border:1.5px solid rgba(20,17,17,.14);background:#fff;cursor:pointer;font:inherit;color:inherit}
.fa-opc:focus-visible{outline:3px solid var(--tinta);outline-offset:2px}
.fa-opc-sel{border-color:var(--tinta);box-shadow:0 0 0 1px var(--tinta)}
.fa-opc b{display:block;font-size:16px;line-height:1.3}
.fa-opc span{display:block;font-size:14px;line-height:1.5;color:var(--gris);margin-top:4px}
.fa-chip{display:inline-block;margin-top:8px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:rgba(177,209,62,.22);color:var(--verde-txt)}
.fa-pasos{margin:14px 0 0;padding:16px;border-radius:18px;background:var(--crema);border:1px solid var(--linea)}
.fa-pasos h3{margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gris)}
.fa-pasos ol{margin:0;padding:0;list-style:none;counter-reset:p}
.fa-pasos li{counter-increment:p;position:relative;padding:0 0 12px 38px;font-size:14px;line-height:1.5;color:#3b3e45}
.fa-pasos li:last-child{padding-bottom:0}
.fa-pasos li::before{content:counter(p);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:#fff;border:1.5px solid var(--linea);display:grid;place-items:center;font-size:12.5px;font-weight:800;color:var(--tinta)}
.fa-pasos li b{display:block;color:var(--tinta);font-size:14.5px;margin-bottom:2px}
/* los datos de SU factura */
.fa-datos{margin:14px 0 0;padding:0}
.fa-datos > div{padding:10px 0;border-top:1px solid var(--linea)}
.fa-datos dt{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gris2)}
.fa-datos dd{margin:3px 0 0;font-size:14.5px;font-weight:600;line-height:1.45;color:var(--tinta)}
.fa-datos .fa-dato-fuerte dd{font-size:18px}
.fa-fichero{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;min-height:56px;padding:12px 16px;border-radius:16px;border:1.5px dashed rgba(20,17,17,.22);background:var(--crema);font:600 15px 'Inter',sans-serif;color:var(--tinta);cursor:pointer;text-align:center}
.fa-fichero input{position:absolute;width:1px;height:1px;opacity:0}
.fa-dos{display:grid;grid-template-columns:1fr 1fr;gap:10px}
`;

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const Pasos = ({ titulo, pasos }) => (
    <div className="fa-pasos">
        <h3>{titulo}</h3>
        <ol>{pasos.map((x, i) => <li key={i}><b>{x.titulo}</b>{x.texto}</li>)}</ol>
    </div>
);

const Check = () => (
    <div className="fa-ok-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" pathLength="100" /></svg></div>
);

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
    const [opcion, setOpcion] = useState('autofactura');   // la marcada en «elegir»
    const [fichero, setFichero] = useState(null);
    const [numFactura, setNumFactura] = useState('');
    const [totalFactura, setTotalFactura] = useState('');
    const [copiado, setCopiado] = useState(false);
    const fileRef = useRef(null);

    const q = `token=${encodeURIComponent(token || '')}`;

    useEffect(() => {
        if (demo) { setV(vistaDemo(pasoDemoInicial())); setCargando(false); return; }
        axios.get(`${API}/factura-ahorro/${expedienteId}?${q}`)
            .then(({ data }) => setV(data))
            .catch(e => setError(e.response?.data?.error || 'No hemos podido abrir la factura.'))
            .finally(() => setCargando(false));
    }, [expedienteId, q, demo]);

    useEffect(() => {
        if (!v) return;
        setNombre(n => n || v.firmante?.nombre || '');
        setDni(d => d || v.firmante?.dni || '');
        if (v.modo) setOpcion(v.modo);
    }, [v]);

    const accion = async (ruta, body, demoPaso) => {
        setErrorAccion('');
        if (demo) { setV(vistaDemo(demoPaso)); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setEnviando(true);
        try {
            const { data } = await axios.post(`${API}/factura-ahorro/${expedienteId}/${ruta}`, { token, ...body });
            setV(data);
            setVerError(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            setErrorAccion(e.response?.data?.error || 'No se ha podido guardar. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const subir = async () => {
        setErrorAccion('');
        if (demo) { setV(vistaDemo('recibida')); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('factura', fichero);
            fd.append('numero', numFactura.trim());
            fd.append('total', totalFactura.trim());
            const { data } = await axios.post(`${API}/factura-ahorro/${expedienteId}/subir?${q}`, fd);
            setV(data);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            setErrorAccion(e.response?.data?.error || 'No se ha podido subir la factura. Inténtalo de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const copiar = async () => {
        try { await navigator.clipboard.writeText(textoDatosFactura(v?.datos || [])); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sin portapapeles: los datos siguen a la vista */ }
    };

    const firmanteOk = nombre.trim().length >= 5 && /^[A-Z0-9]{8,10}$/i.test(dni.replace(/[\s.-]/g, ''));
    const totalOk = (leerImporte(totalFactura) || 0) > 0;
    const fac = v?.factura || {};
    const pdfUrl = `${API}/factura-ahorro/${expedienteId}/pdf?${q}`;
    const cambiar = (modo) => accion('elegir', { modo }, modo === 'cliente' ? 'cliente' : 'acuerdo');

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
                                {v.sin_importe ? (
                                    <p className="fa-sub"><b>{v.razon_social}</b> · {v.cif}<br />El importe lo cerramos en cuanto confirméis vuestra cuenta en el formulario de cobro.</p>
                                ) : (
                                    <>
                                        <div className="fa-display fa-importe">{eurEs(fac.total)}</div>
                                        <p className="fa-meta">
                                            <b>{v.razon_social}</b> · {v.cif}<br />
                                            {eurEs(fac.neto)}{Number(fac.iva_pct) > 0 ? ` + ${eurEs(fac.iva)} de IVA (${fac.iva_pct} %)` : ' (operación no sujeta a IVA)'}
                                        </p>
                                    </>
                                )}
                            </div>
                            <div className="fa-filete" />
                        </div>

                        {/* 0 · ELEGIR quién hace la factura (si no lo eligió en el formulario) */}
                        {!v.modo && v.puede_elegir && (
                            <div className="fa-card"><div className="fa-pad">
                                <h1 className="fa-display fa-h2">¿Quién hace la <span className="fa-mark">factura</span>?</h1>
                                <p className="fa-sub">{POR_QUE_FACTURA}</p>
                                <button type="button" className={`fa-opc ${opcion === 'autofactura' ? 'fa-opc-sel' : ''}`} onClick={() => setOpcion('autofactura')} aria-pressed={opcion === 'autofactura'}>
                                    <b>Hacédmela vosotros (autofactura)</b>
                                    <span>La preparamos nosotros en vuestro nombre. Solo tenéis que aceptar un acuerdo y revisar la factura: dos minutos y lo más rápido para cobrar.</span>
                                    <em className="fa-chip" style={{ fontStyle: 'normal' }}>Recomendada</em>
                                </button>
                                <button type="button" className={`fa-opc ${opcion === 'cliente' ? 'fa-opc-sel' : ''}`} onClick={() => setOpcion('cliente')} aria-pressed={opcion === 'cliente'}>
                                    <b>La emito yo</b>
                                    <span>Os damos los datos exactos y un modelo para que la hagáis con vuestro programa. La transferencia sale cuando nos llegue vuestra factura.</span>
                                </button>
                                <Pasos titulo={opcion === 'cliente' ? 'Si la emitís vosotros' : 'Cómo funciona la autofactura'} pasos={opcion === 'cliente' ? PASOS_CLIENTE : PASOS_AUTOFACTURA} />
                                {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                <div className="fa-btns">
                                    <button type="button" className="fa-btn fa-btn-pri" disabled={enviando} onClick={() => cambiar(opcion)}>
                                        {enviando ? 'Guardando…' : opcion === 'cliente' ? 'La emito yo: ver los datos' : 'Seguir con la autofactura'}
                                    </button>
                                </div>
                            </div></div>
                        )}

                        {/* A1 · AUTOFACTURA: el ACUERDO (antes de expedir nada) */}
                        {v.modo === 'autofactura' && !v.acuerdo_aceptado && (
                            <div className="fa-card"><div className="fa-pad">
                                <h1 className="fa-display fa-h2">Os hacemos la <span className="fa-mark">factura</span></h1>
                                <p className="fa-sub">{POR_QUE_FACTURA} Para que no tengáis que hacerla, la expedimos nosotros en vuestro nombre.</p>
                                <Pasos titulo="Cómo funciona" pasos={PASOS_AUTOFACTURA} />
                                <p className="fa-sub">La ley pide este acuerdo previo por escrito. Léelo antes de aceptarlo:</p>
                                <div className="fa-acuerdo">{(v.acuerdo || []).map((p, i) => <p key={i}>{p}</p>)}</div>
                                <label className="fa-campo"><span>Nombre y apellidos de quien acepta</span>
                                    <input className="no-uppercase" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" /></label>
                                <label className="fa-campo"><span>DNI</span>
                                    <input value={dni} onChange={e => setDni(e.target.value.toUpperCase())} autoComplete="off" /></label>
                                <label className="fa-check">
                                    <input type="checkbox" checked={leido} onChange={e => setLeido(e.target.checked)} />
                                    <span>He leído el acuerdo y lo acepto en nombre de <b>{v.razon_social}</b>.</span>
                                </label>
                                {v.sin_importe && <p className="fa-error">Aún no podemos expedir la factura: falta que confirméis vuestra cuenta en el formulario de cobro.</p>}
                                {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                <div className="fa-btns">
                                    <button type="button" className="fa-btn fa-btn-pri" disabled={!leido || !firmanteOk || enviando || v.sin_importe}
                                        onClick={() => accion('acuerdo', { nombre: nombre.trim(), dni: dni.trim() }, 'factura')}>
                                        {enviando ? 'Preparando la factura…' : 'Aceptar y ver la factura'}
                                    </button>
                                    {v.puede_elegir && <button type="button" className="fa-link" disabled={enviando} onClick={() => cambiar('cliente')}>Prefiero emitirla yo</button>}
                                </div>
                            </div></div>
                        )}

                        {/* A2 · AUTOFACTURA expedida, para aceptarla */}
                        {v.modo === 'autofactura' && v.acuerdo_aceptado && fac.numero && (
                            <div className="fa-card"><div className="fa-pad">
                                {v.estado === 'ACEPTADA' ? (
                                    <div className="fa-ok">
                                        <Check />
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
                                                onClick={() => accion('responder', { accion: 'aceptar', nombre: nombre.trim(), dni: dni.trim() }, 'aceptada')}>
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
                                                onClick={() => accion('responder', { accion: 'rechazar', nombre: nombre.trim(), motivo: motivo.trim() }, 'factura')}>
                                                {enviando ? 'Enviando…' : 'Enviar la corrección'}
                                            </button>
                                            <button type="button" className="fa-link" onClick={() => setVerError(false)}>Volver</button>
                                        </>
                                    )}
                                </div>
                                {v.estado === 'ACEPTADA' && (
                                    <p className="fa-nota">Es una factura emitida por vosotros: pasádsela a vuestra gestoría para que la registre en vuestro libro de facturas emitidas.</p>
                                )}
                            </div></div>
                        )}

                        {v.estado === 'RECHAZADA' && v.rechazo && (
                            <div className="fa-ambar">
                                <b>Nos has dicho:</b> «{v.rechazo.motivo}». Lo revisamos y te mandamos la factura corregida por aquí mismo.
                            </div>
                        )}

                        {/* B · LA EMITE ÉL: los datos, el modelo y subirla */}
                        {v.modo === 'cliente' && !v.recibida && (
                            <div className="fa-card"><div className="fa-pad">
                                <h1 className="fa-display fa-h2">Los datos de vuestra <span className="fa-mark">factura</span></h1>
                                <p className="fa-sub">Hacedla con vuestro programa, con vuestro número de factura y vuestra cuenta, y con estos datos:</p>
                                {v.datos ? (
                                    <dl className="fa-datos">
                                        {v.datos.map(f => <div key={f.campo} className={f.destacado ? 'fa-dato-fuerte' : ''}><dt>{f.campo}</dt><dd>{f.valor}</dd></div>)}
                                    </dl>
                                ) : (
                                    <p className="fa-error">El importe lo cerramos en cuanto confirméis vuestra cuenta en el formulario de cobro.</p>
                                )}
                                <div className="fa-btns">
                                    {v.datos && (
                                        <div className="fa-dos">
                                            <button type="button" className="fa-btn fa-btn-sec" onClick={copiar}>{copiado ? 'Copiados' : 'Copiar los datos'}</button>
                                            {demo ? <span className="fa-btn fa-btn-sec">Ver el modelo</span> : <a className="fa-btn fa-btn-sec" href={pdfUrl} target="_blank" rel="noreferrer">Ver el modelo</a>}
                                        </div>
                                    )}
                                </div>
                                <Pasos titulo="Y después" pasos={PASOS_CLIENTE.slice(1)} />
                            </div></div>
                        )}

                        {v.modo === 'cliente' && !v.recibida && v.datos && (
                            <div className="fa-card"><div className="fa-pad">
                                <h2 className="fa-display fa-h2" style={{ fontSize: 24 }}>Subid <span className="fa-mark">vuestra</span> factura</h2>
                                <p className="fa-sub">En PDF. En cuanto la recibamos y la comprobemos, os hacemos la transferencia.</p>
                                <label className="fa-fichero">
                                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={e => setFichero(e.target.files?.[0] || null)} />
                                    {fichero ? fichero.name : 'Elegir el PDF de la factura'}
                                </label>
                                <div className="fa-dos">
                                    <label className="fa-campo"><span>Nº de factura</span>
                                        <input className="no-uppercase" value={numFactura} onChange={e => setNumFactura(e.target.value)} placeholder="F-2026-118" /></label>
                                    <label className="fa-campo"><span>Total (IVA incl.)</span>
                                        <input className="no-uppercase" inputMode="decimal" value={totalFactura} onChange={e => setTotalFactura(e.target.value)} placeholder={eurEs(fac.total)} /></label>
                                </div>
                                {errorAccion && <p className="fa-error">{errorAccion}</p>}
                                <div className="fa-btns">
                                    <button type="button" className="fa-btn fa-btn-pri" disabled={(!fichero && !demo) || !numFactura.trim() || !totalOk || enviando} onClick={subir}>
                                        {enviando ? 'Subiendo…' : 'Enviar la factura'}
                                    </button>
                                    {v.puede_elegir && <button type="button" className="fa-link" disabled={enviando} onClick={() => cambiar('autofactura')}>Mejor hacédmela vosotros (autofactura)</button>}
                                </div>
                            </div></div>
                        )}

                        {v.modo === 'cliente' && v.recibida && (
                            <div className="fa-card"><div className="fa-pad">
                                <div className="fa-ok">
                                    <Check />
                                    <div>
                                        <h1 className="fa-display fa-h2">Factura <span className="fa-mark">recibida</span></h1>
                                        <p className="fa-sub" style={{ marginTop: 6 }}>{v.pagada ? 'Ya os hemos hecho la transferencia.' : 'La comprobamos y os avisamos en cuanto salga la transferencia.'}</p>
                                    </div>
                                </div>
                                <dl className="fa-filas">
                                    {v.recibida.numero && <div className="fa-fila"><dt>Vuestra factura</dt><dd>{v.recibida.numero}</dd></div>}
                                    {v.recibida.total != null && <div className="fa-fila"><dt>Total</dt><dd>{eurEs(v.recibida.total)}</dd></div>}
                                    {v.recibida.at && <div className="fa-fila"><dt>Recibida</dt><dd>{fechaCorta(v.recibida.at)}</dd></div>}
                                </dl>
                            </div></div>
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
