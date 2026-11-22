// ============================================================================
// GastoRapido.jsx — el ALTA RÁPIDA de un gasto desde el móvil (botón «Gasto»
// del cuadro de mando, 22/11/2026).
//
// Foto (o PDF) → se LEE y se propone todo → un toque en «Guardar en Drive».
//   elegir   : «Hacer foto» o «Subir PDF o foto» (en el móvil el ＋ de la barra de
//              abajo abre la cámara directamente y se salta este paso)
//   leyendo  : POST /api/facturacion/gastos/preparar (Gemini, ~10 s)
//   revisar  : las páginas ya escaneadas, proveedor, fecha, total, de quién es
//              (Sociedad / Autónomo), a qué carpeta va, con qué nombre y su IVA
//              deducible. Corregir un dato o cambiar de quién es lo recalcula el
//              servidor (POST /gastos/alta?seco=1): aquí no se hace ninguna
//              cuenta de dinero.
//   hecho    : guardado (POST /gastos/alta) y «Añadir otro».
//
// El escaneo (recorte al papel, sombra fuera, a grises y a PDF) es del navegador:
// logic/escaneoGasto.js. La carpeta y el nombre los decide el servidor:
// services/gastoRapido.js. Doc: docs/conocimiento/facturacion/alta-rapida-de-gastos-desde-el-movil.md
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AvisoFx, DialogoFx, Ico, eur, errorDeApi } from '../../facturacion/estilo';
import { base64DeFichero, escanearPagina, pdfDePaginas, prepararFoto } from '../logic/escaneoGasto';

export const ICO_CAMARA = '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10.5H4z"/><circle cx="12" cy="13.5" r="3.4"/>';
const MAX_PAGINAS = 6;
const MAX_PDF = 15 * 1024 * 1024;
const QUIEN = [{ id: 'SL', label: 'Sociedad' }, { id: 'AUTONOMO', label: 'Autónomo' }];
const NUMERICOS = ['total', 'base', 'cuota', 'iva_pct'];

const comoTexto = (v) => (v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v));
// Un importe leído (número) se enseña con sus dos decimales; lo tecleado, tal cual.
const comoImporte = (v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : comoTexto(v));
// «CAE - SERVICIOS CAE / FACTURAS GASTOS / 2026 / 11. NOVIEMBRE» → «CAE - SERVICIOS CAE / 2026 / 11. NOVIEMBRE»:
// la primera dice de quién es (CAE/ING sociedad, FML autónomo); las dos últimas, el mes.
const corta = (ruta) => { const p = String(ruta || '').split(' / '); return p.length > 3 ? [p[0], ...p.slice(-2)].join(' / ') : p.join(' / '); };
let idPagina = 0;

/**
 * @param inicial   ficheros con los que se abre (la cámara o el PDF del ＋ de la barra del móvil), o null
 * @param onClose   cerrar
 * @param onGuardado(r) tras subir uno: r = { nombre, carpeta, link, ya_estaba, … }
 */
export function GastoRapido({ inicial = null, onClose, onGuardado }) {
    const [fase, setFase] = useState(inicial?.length ? 'leyendo' : 'elegir');
    const [paginas, setPaginas] = useState([]);      // [{ id, foto: {lienzo,w,h,lectura}, caja, giro, scan: {url,w,h} }]
    const [pdf, setPdf] = useState(null);            // { b64, nombre, bytes } si se subió un PDF
    const [lectura, setLectura] = useState(null);    // la respuesta de /preparar
    const [datos, setDatos] = useState({});
    const [quien, setQuien] = useState('SL');
    const [sucio, setSucio] = useState(false);       // ¿ha tocado algo? Entonces el plan lo recalcula el servidor.
    const [plan, setPlan] = useState(null);
    const [recalculando, setRecalculando] = useState(false);
    const [error, setError] = useState(null);
    const [hecho, setHecho] = useState(null);
    const [arrastrando, setArrastrando] = useState(false);
    const camara = useRef(null);
    const fichero = useRef(null);
    const turno = useRef(0);
    const arrancado = useRef(false);
    const tocados = useRef(new Set());              // lo corregido a mano: al releer (otra página) se respeta
    const datosRef = useRef(datos);
    useEffect(() => { datosRef.current = datos; }, [datos]);

    const ocupado = fase === 'leyendo' || fase === 'guardando';

    // ── Leer: las fotos (o el PDF) al servidor; con lo que vuelve se recorta cada página.
    const leer = useCallback(async (pags, elPdf) => {
        setFase('leyendo');
        setError(null);
        setPaginas(pags);                            // mientras se lee, se ven las fotos tal cual
        try {
            const cuerpo = elPdf ? { pdf: elPdf.b64 } : { imagenes: pags.map(p => p.foto.lectura) };
            const { data } = await axios.post('/api/facturacion/gastos/preparar', cuerpo);
            const conCaja = pags.map((p, i) => {
                const caja = data.cajas?.[i] || null;
                return { ...p, caja, scan: escanearPagina(p.foto, caja, p.giro) };
            });
            setPaginas(conCaja);
            setLectura(data);
            const aMano = Object.fromEntries([...tocados.current].map(k => [k, datosRef.current[k]]));
            setDatos({ ...(data.datos || {}), ...aMano });
            setQuien(data.propuesta || 'SL');
            setPlan(data.opciones?.[data.propuesta || 'SL'] || null);
            setSucio(tocados.current.size > 0);
            setFase('revisar');
        } catch (e) {
            const err = errorDeApi(e);
            setError({ ...err, alLeer: true });
            // Sin lectura se puede seguir a mano: las páginas, escaneadas sin recorte.
            setPaginas(pags.map(p => ({ ...p, scan: p.scan || escanearPagina(p.foto, null, p.giro) })));
            setFase(pags.length || elPdf ? 'revisar' : 'elegir');
        }
    }, []);

    // ── Añadir ficheros (cámara, selector o arrastrar): fotos → páginas; un PDF → tal cual.
    const anadir = useCallback(async (lista) => {
        const files = Array.from(lista || []).filter(Boolean);
        if (!files.length) return;
        setError(null);
        const pdfs = files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        const fotos = files.filter(f => !pdfs.includes(f));
        if (pdfs.length) {
            if (pdfs.length > 1 || fotos.length || paginas.length) { setError({ texto: 'Un gasto es un PDF o unas fotos, no las dos cosas. Sube un solo PDF.' }); return; }
            if (pdfs[0].size > MAX_PDF) { setError({ texto: 'Ese PDF pesa más de 15 MB.' }); return; }
            const elPdf = { b64: await base64DeFichero(pdfs[0]), nombre: pdfs[0].name, bytes: pdfs[0].size };
            setPdf(elPdf);
            setPaginas([]);
            await leer([], elPdf);
            return;
        }
        if (pdf) { setError({ texto: 'Este gasto ya es un PDF: no se le pueden añadir fotos.' }); return; }
        if (paginas.length + fotos.length > MAX_PAGINAS) { setError({ texto: `Como mucho ${MAX_PAGINAS} páginas por gasto.` }); return; }
        setFase('leyendo');
        try {
            const nuevas = [];
            for (const f of fotos) nuevas.push({ id: ++idPagina, foto: await prepararFoto(f), caja: null, giro: 0, scan: null });
            await leer([...paginas, ...nuevas], null);
        } catch (e) {
            setError({ texto: e.message || 'No se pudo abrir la foto.' });
            setFase(paginas.length ? 'revisar' : 'elegir');
        }
    }, [leer, paginas, pdf]);

    // Abierto desde el ＋ de la barra del móvil: la foto (o el PDF) ya viene elegida.
    useEffect(() => {
        if (arrancado.current || !inicial?.length) return;
        arrancado.current = true;
        anadir(inicial);
    }, [inicial, anadir]);

    // ── El plan (carpeta, nombre, IVA) de quien toca. Sin tocar nada, el de /preparar;
    // con algo corregido, lo recalcula el servidor en seco.
    useEffect(() => {
        if (fase !== 'revisar') return undefined;
        if (!sucio && lectura?.opciones?.[quien]) { setPlan(lectura.opciones[quien]); return undefined; }
        if (!sucio && !lectura) return undefined;
        const mio = ++turno.current;
        setRecalculando(true);
        const t = setTimeout(async () => {
            try {
                const { data } = await axios.post('/api/facturacion/gastos/alta?seco=1', { contribuyente: quien, datos });
                if (mio === turno.current) { setPlan(data); setError(e => (e?.alRecalcular ? null : e)); }
            } catch (e) {
                if (mio === turno.current) setError({ ...errorDeApi(e), alRecalcular: true });
            } finally {
                if (mio === turno.current) setRecalculando(false);
            }
        }, 550);
        return () => clearTimeout(t);
    }, [fase, sucio, quien, datos, lectura]);

    const cambiar = (k, v) => { tocados.current.add(k); setDatos(d => ({ ...d, [k]: v })); setSucio(true); };
    const girar = (id) => setPaginas(ps => ps.map(p => (p.id === id ? { ...p, giro: (p.giro + 90) % 360, scan: escanearPagina(p.foto, p.caja, (p.giro + 90) % 360) } : p)));
    const quitar = (id) => setPaginas(ps => ps.filter(p => p.id !== id));

    const guardar = async () => {
        setFase('guardando');
        setError(null);
        try {
            const b64 = pdf ? pdf.b64 : pdfDePaginas(paginas.map(p => p.scan));
            const { data } = await axios.post('/api/facturacion/gastos/alta', { pdf: b64, contribuyente: quien, datos });
            setHecho(data);
            setFase('hecho');
            onGuardado?.(data);
        } catch (e) {
            setError(errorDeApi(e));
            setFase('revisar');
        }
    };

    const otro = () => {
        setPaginas([]); setPdf(null); setLectura(null); setDatos({}); setPlan(null); setSucio(false);
        setHecho(null); setError(null); setFase('elegir'); tocados.current = new Set();
        // Desde «Añadir otro» la cámara se abre ya (el toque cuenta como gesto).
        camara.current?.click();
    };

    const elegidos = (e) => { const fs = e.target.files; anadir(fs); e.target.value = ''; };
    const soltar = (e) => { e.preventDefault(); setArrastrando(false); anadir(e.dataTransfer?.files); };

    const entradas = (
        <>
            <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegidos} />
            <input ref={fichero} type="file" accept="application/pdf,image/*" multiple hidden onChange={elegidos} />
        </>
    );

    // ── Pantallas
    let cuerpo = null;
    let pie = null;
    const sinPaginas = !paginas.length && !pdf;

    if (fase === 'elegir' || (fase === 'leyendo' && sinPaginas)) {
        cuerpo = (
            <div className={`cm-g-elegir${arrastrando ? ' cm-g-soltar' : ''}`}
                onDragOver={e => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}>
                {fase === 'leyendo' ? (
                    <div className="cm-g-leyendo"><Ico n="reintentar" size={22} className="fx-spin" />Abriendo la foto…</div>
                ) : (<>
                    <button type="button" className="cm-g-gordo cm-g-gordo-pri" onClick={() => camara.current?.click()} data-autofoco>
                        <Ico d={ICO_CAMARA} size={30} /><span><b>Hacer foto</b><small>Al ticket o la factura en papel. Se escanea sola.</small></span>
                    </button>
                    <button type="button" className="cm-g-gordo" onClick={() => fichero.current?.click()}>
                        <Ico n="pdf" size={28} /><span><b>Subir PDF o foto</b><small>La factura que te han mandado por email.</small></span>
                    </button>
                    <p className="cm-g-nota">Se lee sola, se guarda en su carpeta de contabilidad de Drive y entra en el trimestre. La revisas en Facturación → Trimestres cuando quieras.</p>
                </>)}
                {error && <AvisoFx tono="ambar" role="alert">{error.texto}</AvisoFx>}
            </div>
        );
    } else if (fase === 'hecho' && hecho) {
        cuerpo = (
            <div className="cm-g-hecho" aria-live="polite">
                <span className="cm-g-ok"><Ico n="check" size={30} sw={2.4} /></span>
                <h3 className="fx-display">{hecho.ya_estaba ? 'Ya estaba en Drive' : 'Guardado en Drive'}</h3>
                <p>{hecho.ya_estaba ? 'Ese mismo PDF ya estaba en la carpeta: no se ha subido otra vez.' : <>En <b>{corta(hecho.carpeta)}</b>, ya leído. Cuenta en el {trimestreTexto(hecho.trimestre)}.</>}</p>
                <p className="fx-mono cm-g-fich">{hecho.nombre}</p>
                {hecho.link && <a className="fx-link" href={hecho.link} target="_blank" rel="noreferrer"><Ico n="enlace" size={16} />Abrir en Drive</a>}
            </div>
        );
        pie = (<>
            <button type="button" className="fx-btn fx-btn-sec" onClick={onClose}>Cerrar</button>
            <button type="button" className="fx-btn fx-btn-pri" onClick={otro}><Ico d={ICO_CAMARA} size={18} />Añadir otro</button>
        </>);
    } else {
        const f = plan?.fiscal;
        const noEsGasto = datos.documento === 'NO_ES_GASTO';
        const faltaImporte = datos.total == null || datos.total === '';
        cuerpo = (
            <div className="cm-g-rev">
                {/* Las páginas, ya escaneadas */}
                <div className="cm-g-pags" aria-label="Páginas del gasto">
                    {pdf ? (
                        <div className="cm-g-pdf"><Ico n="pdf" size={26} /><span className="fx-mono">{pdf.nombre}</span><small>{Math.round(pdf.bytes / 1024)} KB</small></div>
                    ) : paginas.map((p, i) => (
                        <figure key={p.id} className="cm-g-pag">
                            <img src={p.scan ? p.scan.url : `data:image/jpeg;base64,${p.foto.lectura}`} alt={`Página ${i + 1}${p.scan ? ', escaneada' : ''}`} />
                            <figcaption>
                                <button type="button" className="fx-ico-btn" aria-label={`Girar la página ${i + 1}`} onClick={() => girar(p.id)} disabled={ocupado}><Ico n="reintentar" size={16} /></button>
                                {paginas.length > 1 && <button type="button" className="fx-ico-btn" aria-label={`Quitar la página ${i + 1}`} onClick={() => quitar(p.id)} disabled={ocupado}><Ico n="x" size={16} /></button>}
                            </figcaption>
                        </figure>
                    ))}
                    {!pdf && paginas.length < MAX_PAGINAS && (
                        <button type="button" className="cm-g-mas" onClick={() => camara.current?.click()} disabled={ocupado}>
                            <Ico n="mas" size={22} /><span>Página</span>
                        </button>
                    )}
                </div>

                {fase === 'leyendo' && <div className="cm-g-leyendo"><Ico n="reintentar" size={20} className="fx-spin" />Leyendo el gasto…</div>}
                {error?.alLeer && <AvisoFx tono="ambar" role="alert"><b>No se ha podido leer.</b> {error.texto} Rellena los datos a mano o vuelve a intentarlo.</AvisoFx>}

                {fase !== 'leyendo' && (<>
                    <div className="cm-g-campos">
                        <label className="fx-campo cm-g-ancho"><span>Proveedor</span>
                            <input className="fx-input no-uppercase" value={comoTexto(datos.proveedor)} onChange={e => cambiar('proveedor', e.target.value)} autoComplete="off" />
                        </label>
                        <label className="fx-campo"><span>Fecha</span>
                            <input className="fx-input" type="date" value={datos.fecha || ''} onChange={e => cambiar('fecha', e.target.value)} />
                        </label>
                        <label className="fx-campo"><span>Total (€)</span>
                            <input className="fx-input fx-num no-uppercase" inputMode="decimal" value={comoImporte(datos.total)} onChange={e => cambiar('total', e.target.value)} />
                        </label>
                    </div>

                    <div className="cm-g-quien">
                        <div className="fx-seg" role="group" aria-label="De quién es el gasto">
                            {QUIEN.map(q => <button key={q.id} type="button" aria-pressed={quien === q.id} onClick={() => { setQuien(q.id); }}>{q.label}</button>)}
                        </div>
                        {lectura && <small>{quien === lectura.propuesta ? lectura.motivo : 'Cambiado a mano.'}</small>}
                    </div>

                    {plan && (
                        <div className={`cm-g-plan${recalculando ? ' fx-recargando' : ''}`}>
                            <div className="cm-g-plan-fila"><Ico n="carpeta" size={18} /><div><b>{corta(plan.carpeta)}</b>{plan.carpeta_nueva && <small> · carpeta nueva</small>}<small className="fx-mono">{plan.nombre}</small></div></div>
                            {f && (
                                <div className="cm-g-plan-fila"><Ico n="euro" size={18} /><div>
                                    <b>{f.tipo_texto}</b>
                                    <small>{f.cuota ? <>IVA {eur(f.cuota)} · deducible {eur(f.iva_deducible)}{f.deducible_pct != null && f.deducible_pct < 100 ? ` (${f.deducible_pct} %)` : ''}</> : 'Sin IVA'}{f.inversion ? ' · va a inversión (se amortiza)' : ''} · {trimestreTexto(plan.trimestre)}</small>
                                </div></div>
                            )}
                            {plan.motivo_mes && <small className="cm-g-plan-nota">{plan.motivo_mes}</small>}
                        </div>
                    )}
                    {(f?.avisos || []).length > 0 && (
                        <div className="cm-g-avisos">{f.avisos.map((a, i) => <AvisoFx key={i} tono="crema">{typeof a === 'string' ? a : a.texto}</AvisoFx>)}</div>
                    )}
                    {noEsGasto && <AvisoFx tono="ambar">Lo leído no parece un gasto (un presupuesto, un albarán…). Si lo es, guárdalo igual.</AvisoFx>}

                    <details className="cm-g-mas-datos">
                        <summary>Más datos{datos.numero ? ` · nº ${datos.numero}` : ''}</summary>
                        <div className="cm-g-campos">
                            <label className="fx-campo"><span>Nº de factura</span>
                                <input className="fx-input no-uppercase" value={comoTexto(datos.numero)} onChange={e => cambiar('numero', e.target.value)} autoComplete="off" />
                            </label>
                            <label className="fx-campo"><span>NIF del proveedor</span>
                                <input className="fx-input no-uppercase" value={comoTexto(datos.nif)} onChange={e => cambiar('nif', e.target.value)} autoComplete="off" />
                            </label>
                            <label className="fx-campo cm-g-ancho"><span>Concepto</span>
                                <input className="fx-input no-uppercase" value={comoTexto(datos.concepto)} onChange={e => cambiar('concepto', e.target.value)} autoComplete="off" />
                            </label>
                            {NUMERICOS.filter(k => k !== 'total').map(k => (
                                <label key={k} className="fx-campo"><span>{k === 'base' ? 'Base (€)' : k === 'cuota' ? 'IVA (€)' : '% IVA'}</span>
                                    <input className="fx-input fx-num no-uppercase" inputMode="decimal" value={k === 'iva_pct' ? comoTexto(datos[k]) : comoImporte(datos[k])} onChange={e => cambiar(k, e.target.value)} />
                                </label>
                            ))}
                        </div>
                    </details>

                    {error && !error.alLeer && <AvisoFx tono="ambar" role="alert"><b>{error.alRecalcular ? 'No se ha podido recalcular.' : 'No se ha guardado.'}</b> {error.texto}</AvisoFx>}
                </>)}
            </div>
        );
        const puede = fase === 'revisar' && !recalculando && !!plan && !!String(datos.proveedor || '').trim() && !faltaImporte && (pdf || paginas.length);
        pie = (<>
            <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cancelar</button>
            {error?.alLeer && fase === 'revisar' && !lectura ? (
                <button type="button" className="fx-btn fx-btn-pri" onClick={() => leer(paginas, pdf)}><Ico n="reintentar" size={18} />Leer otra vez</button>
            ) : (
                <button type="button" className="fx-btn fx-btn-pri" onClick={guardar} disabled={!puede}>
                    {fase === 'guardando' ? <><Ico n="reintentar" size={18} className="fx-spin" />Guardando…</> : <><Ico n="check" size={18} />Guardar en Drive</>}
                </button>
            )}
        </>);
    }

    return (
        <DialogoFx titulo={fase === 'hecho' ? 'Gasto guardado' : 'Añadir un gasto'} antetitulo="Contabilidad" onClose={onClose} ocupado={ocupado} pie={pie}>
            {entradas}
            {cuerpo}
        </DialogoFx>
    );
}

function trimestreTexto(t) {
    const m = /^(\d{4})-T([1-4])$/.exec(String(t || ''));
    return m ? `${m[2]}.º trimestre de ${m[1]}` : 'trimestre';
}

