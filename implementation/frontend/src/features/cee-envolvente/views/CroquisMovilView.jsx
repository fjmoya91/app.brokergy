import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_CROQUIS, ETIQUETA_USO_ZONA, USOS_ZONA, textoCatastro, usoDeLinea } from '../logic/zonasFuera';
import { areaPoligono, simplificarTrazo } from '../logic/geometriaPlano';
import { EtiquetaMancha } from '../components/EtiquetaMancha';
import { IconoCamara, IconoDeshacer, IconoEncuadrar, IconoLapiz, IconoMas, IconoMenos, IconoPapelera,
         IconoSinRed, IconoSubiendo } from '../components/IconosCroquis';
import { FotosParedMovil } from '../components/FotosParedMovil';
import { mitadDePared, paredEnPunto } from '../logic/fotoMovil';
import { claveDeToken, fotosEnCola, guardarRescate, guardarTrabajo, haceCuanto, leerPoner, leerRescate,
         leerTrabajo, nuevoIdLocal, pedir, recordarClave, recuperarTrazos, repartirLocal,
         textoPendiente } from '../logic/bandejaMovil';
import { prepararSinCobertura } from '../logic/swCroquisMovil';

// ============================================================================
// El CROQUIS pintado con el DEDO — lo que abre el teléfono al escanear el QR.
//
// Es la planta del edificio (las paredes que midió el motor, sobre la
// cartografía del Catastro) y se rodea con el dedo lo que NO es vivienda: el
// garaje, el porche… Cada trazo —también el que va a medias— viaja al
// ordenador, que lo pinta en su plano según se dibuja (ver
// `services/croquisMovil.js` y `logic/useCroquisMovil.js`).
//
// El AJUSTE a Catastro lo hace el ORDENADOR: aquí se pide y se espera la
// respuesta, que se enseña con los m² que han salido.
//
// REGLA — un dedo PINTA, dos dedos MUEVEN y AMPLÍAN. Es lo que hace cualquier
// app de dibujo del móvil, y así no hace falta un modo «mover» que se olvide
// puesto. Si entra un segundo dedo a mitad de un trazo, el trazo se descarta:
// era el principio de un pellizco, no un croquis.
//
// La API se pide en RELATIVO (`/api/public`), como la firma con el móvil: en
// local se entra por la IP de la red y `localhost` en el teléfono es el propio
// teléfono.
//
// Y un segundo modo, FOTOS (2026-09-30): tocar una pared la elige, se le hace la
// foto y en una fachada se cuentan sus huecos (ver `FotosParedMovil`). Ahí un
// dedo MUEVE el plano en vez de pintar: no hay nada que dibujar.
//
// Y SIN COBERTURA (2026-09-30), que es lo normal en un sótano o en un pueblo:
// REGLA — lo pintado se apunta en el TELÉFONO antes de mandarlo, y se manda solo
// al volver la red (ver `logic/bandejaMovil.js`). La consulta del estado, cada
// 2,5 s, es la sonda: en cuanto contesta, sale lo pendiente. El ajuste pedido
// sin señal espera también en el teléfono. Y si el enlace caducó con cosas sin
// mandar, el siguiente QR de ESTA planta, abierto en este teléfono, las recupera.
// La página abre aunque no haya red gracias a un service worker que solo
// controla esta ruta (`public/sw-croquis.js`).
// ============================================================================

const API = '/api/public/croquis-movil';
const POLL_ESTADO_MS = 2500;
const CADENCIA_ENVIO_MS = 120;
const PAPEL = '#f8fafc';
const TINTA = '#0f172a';
const TINTA_SUAVE = '#475569';
//: Cuánto tarda en deshacerse la confirmación de «borrar todo».
const CONFIRMA_MS = 3000;
//: El tamaño BASE del dibujo en píxeles de pantalla (líneas, rótulos, puntos).
//: Se fija en píxeles y no en una fracción del ancho: en una tablet en
//: horizontal el plano mide 900 px y con «ancho/28» las líneas salían el doble
//: de gruesas y los rótulos enormes.
const TAM_PX = 14;

const colorDe = (uso) => COLOR_CROQUIS[uso] || COLOR_CROQUIS['ESPACIO NO HABITABLE'];
const puntos = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');
const fmt = (n) => (Number(n) || 0).toFixed(0);

function trazoMuro(tipo) {
    const t = String(tipo || '').toUpperCase();
    if (t.includes('MEDIANERA')) return { stroke: '#2563eb', dash: true };
    if (t.includes('PARTICION')) return { stroke: '#db2777', dash: false };
    return { stroke: '#1e293b', dash: false };
}

//: La barra de ESCALA: la longitud redonda más cercana a un quinto del ancho.
//: El móvil no tiene retícula, y sin escala no se sabe si lo pintado son 20 o
//: 120 m².
const ESCALAS = [1, 2, 5, 10, 20, 50, 100, 200];
function escalaDe(vb) {
    const objetivo = vb.w / 5;
    return ESCALAS.reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
}

/**
 * El encuadre de la planta con la proporción de la pantalla (sin bandas).
 *
 * Entran las paredes Y las zonas ya restadas: si la planta ya tiene un garaje
 * quitado, sus paredes son solo las de la vivienda, y el croquis se pinta
 * sobre la planta ENTERA (la sustituye).
 */
function encuadre(plano, aspecto) {
    const pts = [...(plano?.muros || []).flatMap(m => m.svg || []),
                 ...(plano?.zonas || []).flatMap(z => z.lienzo || [])];
    if (!pts.length) return { x: 0, y: 0, w: 20, h: 20 };
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const margen = 3;
    let x = Math.min(...xs) - margen, y = Math.min(...ys) - margen;
    let w = Math.max(...xs) - Math.min(...xs) + 2 * margen;
    let h = Math.max(...ys) - Math.min(...ys) + 2 * margen;
    const a = aspecto > 0 ? aspecto : 1;
    if (w / h > a) { const h2 = w / a; y -= (h2 - h) / 2; h = h2; }
    else { const w2 = h * a; x -= (w2 - w) / 2; w = w2; }
    return { x, y, w, h };
}

/**
 * El encuadre cuando la caja del dibujo cambia de tamaño.
 *
 * Si se ha GIRADO la pantalla (la proporción cambia mucho), que siga viéndose
 * todo lo que se veía. Si es un cambio pequeño —la barra del navegador que
 * aparece y se va—, misma escala y mismo centro: ajustar «para que quepa»
 * también ahí alejaría el plano un poco en cada vaivén.
 */
function alCambiarDeTamano(v, antes, ahora) {
    if (!v || !antes || !ahora) return v;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const a0 = antes.w / antes.h, a1 = ahora.w / ahora.h;
    let w, h;
    if (Math.abs(Math.log(a1 / a0)) > Math.log(1.3)) {
        w = v.w; h = v.h;
        if (w / h > a1) h = w / a1; else w = h * a1;
    } else {
        const k = v.w / antes.w;
        w = ahora.w * k; h = ahora.h * k;
    }
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function centroDe(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export default function CroquisMovilView({ token }) {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [trazos, setTrazos] = useState([]);
    const [enCurso, setEnCurso] = useState(null);
    const [uso, setUso] = useState('GARAJE');
    const [vb, setVb] = useState(null);
    //: El ancho REAL de la caja del dibujo, en píxeles (ver TAM_PX).
    const [anchoPx, setAnchoPx] = useState(0);
    const tamanoCaja = useRef(null);
    //: 'pintando' | 'ajustando' | 'hecho'
    const [fase, setFase] = useState('pintando');
    const [resultado, setResultado] = useState(null);
    const [cerrada, setCerrada] = useState(false);
    const [aviso, setAviso] = useState(null);
    //: El ordenador ha dejado de recoger lo que se pinta (ventana cerrada, red).
    const [sinOrdenador, setSinOrdenador] = useState(false);
    //: «Borrar todo» pide un segundo toque: pegado al deshacer, uno sin querer
    //: salía caro (deshacer solo quita la última mancha, no recupera todo).
    const [confirmaBorrar, setConfirmaBorrar] = useState(false);
    //: 'croquis' (pintar lo que no es vivienda) · 'fotos' (la foto de cada pared)
    const [modo, setModo] = useState('croquis');
    const [selPared, setSelPared] = useState(null);
    const [fotosPorPared, setFotosPorPared] = useState({});
    const [resultadoHuecos, setResultadoHuecos] = useState(null);
    const paredesVistas = useRef(0);
    //: Por qué va cada mancha de la PROPUESTA, mientras se está usando.
    const [notasPropuesta, setNotasPropuesta] = useState(null);
    // ── Sin cobertura ─────────────────────────────────────────────────────
    const [sinRed, setSinRed] = useState(false);
    const sinRedRef = useRef(false);
    //: Sube cada vez que VUELVE la red: lo pendiente sale solo.
    const [pulso, setPulso] = useState(0);
    //: Lo pintado que el servidor aún no ha confirmado.
    const [sinEnviar, setSinEnviar] = useState(false);
    const cambios = useRef({ hecho: 0, confirmado: 0, lista: null });
    //: El ajuste pedido que aún no ha llegado: { id, ajustar }.
    const [ajusteEnCola, setAjusteEnCola] = useState(null);
    const ajusteRef = useRef(null);
    //: Lo que la pestaña de fotos tiene por mandar, y cómo está cada pared.
    const [pendFotos, setPendFotos] = useState({ fotos: 0, huecos: 0, lecturas: 0, errores: 0 });
    const [estadoParedes, setEstadoParedes] = useState({});
    //: Lo pintado con un enlace ANTERIOR de esta planta, sin mandar.
    const [rescate, setRescate] = useState(null);
    //: La planta no ha podido abrirse (sin red y sin copia): se reintenta sola.
    const [sinCargar, setSinCargar] = useState(false);
    //: Al cerrarse el enlace: lo que queda guardado en este teléfono.
    const [quedaAqui, setQuedaAqui] = useState(null);
    //: «✓ Enviado lo pendiente», un momento, tras un corte que pilló algo sin mandar.
    const [enviadoTodo, setEnviadoTodo] = useState(false);
    const [corteConPendiente, setCorteConPendiente] = useState(false);
    const claveRef = useRef(null);

    /** Lo que dice la red: `ok` si una petición ha llegado, `false` si no. */
    const red = useCallback((ok) => {
        if (ok === !sinRedRef.current) return;
        sinRedRef.current = !ok;
        setSinRed(!ok);
        if (ok) setPulso(p => p + 1);
    }, []);
    useEffect(() => {
        if (!confirmaBorrar) return undefined;
        const t = setTimeout(() => setConfirmaBorrar(false), CONFIRMA_MS);
        return () => clearTimeout(t);
    }, [confirmaBorrar]);

    const svgRef = useRef(null);
    const cajaRef = useRef(null);
    const punteros = useRef(new Map());
    const gesto = useRef(null);
    const vistoSerial = useRef(0);
    // Lo que hay que mandar: SIEMPRE el estado entero y el más reciente.
    const envio = useRef({ ocupado: false, pendiente: false, ultimo: null, hora: 0 });
    const trazosRef = useRef([]);
    useEffect(() => { trazosRef.current = trazos; }, [trazos]);

    // ── Cargar la planta ──────────────────────────────────────────────────
    // Sin red, se reintenta sola cada pocos segundos: pedir que se recargue a
    // mano a quien está en un sótano es pedirle que no lo consiga.
    useEffect(() => {
        let vivo = true;
        let t = null;
        const cargar = async () => {
            try {
                const r = await pedir(`${API}/${token}`, {}, { plazo: 15_000 });
                const d = await r.json().catch(() => ({}));
                if (!vivo) return;
                if (!r.ok) { setError(d.error || 'Este enlace ya no vale. Pide otro QR desde el ordenador.'); return; }
                red(true);
                setSinCargar(false);
                montar(d);
            } catch {
                if (!vivo) return;
                red(false);
                setSinCargar(true);
                t = setTimeout(cargar, 4000);
            }
        };
        // Lo que se ha pintado aquí y no ha llegado: se sigue con ello (si es de
        // este enlace) o se aparta para ofrecer recuperarlo (si es de otro).
        const montar = (d) => {
            const clave = d.clave || null;
            claveRef.current = clave;
            if (clave) recordarClave(token, clave);
            const { propio, rescate: viejo } = repartirLocal(leerTrabajo(clave), token);
            if (viejo) {
                guardarRescate(clave, viejo);
                guardarTrabajo(clave, null);
            }
            const guardado = leerRescate(clave);
            if (guardado?.trazos?.length) setRescate(guardado);
            let lista = d.trazos || [];
            if (propio?.sinEnviar && Array.isArray(propio.trazos)) lista = propio.trazos;
            setDatos(d);
            setTrazos(lista);
            trazosRef.current = lista;
            vistoSerial.current = d.resultado?.serial || 0;
            if (propio?.sinEnviar) {
                // Lo que se quedó sin mandar (la página se recargó, o se cortó la red).
                cambios.current = { hecho: 1, confirmado: 0, lista };
                setSinEnviar(true);
                envio.current.ultimo = { trazos: lista, enCurso: null };
            }
            if (propio?.ajuste) {
                ajusteRef.current = propio.ajuste;
                setAjusteEnCola(propio.ajuste);
                setFase('ajustando');
            }
            if (propio?.sinEnviar || propio?.ajuste) setPulso(p => p + 1);
        };
        cargar();
        return () => { vivo = false; clearTimeout(t); };
    }, [token, red]);

    // Que la página abra aunque no haya cobertura (solo en la app construida).
    useEffect(() => { if (datos) prepararSinCobertura(token); }, [datos ? 1 : 0, token]); // eslint-disable-line react-hooks/exhaustive-deps

    // Lo pintado, en el teléfono: si se corta la red o se recarga la página, sigue ahí.
    useEffect(() => {
        const clave = claveRef.current;
        if (!clave || !datos) return;
        guardarTrabajo(clave, { token, marco: datos.marco || null, trazos, sinEnviar, ajuste: ajusteEnCola });
    }, [trazos, sinEnviar, ajusteEnCola, datos, token]);

    // Con el enlace cerrado: ¿queda algo guardado en este teléfono? Se dice, con
    // cómo recuperarlo — no es lo mismo que haberlo perdido.
    useEffect(() => {
        if (!(error || cerrada)) return undefined;
        let vivo = true;
        (async () => {
            const clave = claveRef.current || claveDeToken(token);
            if (!clave) return;
            const t = leerTrabajo(clave);
            const fotos = (await fotosEnCola(clave)).length;
            const huecos = leerPoner(clave).length;
            const zonas = t?.sinEnviar ? (t.trazos || []).length : 0;
            if (vivo && (zonas || fotos || huecos)) setQuedaAqui({ zonas, fotos, huecos });
        })();
        return () => { vivo = false; };
    }, [error, cerrada, token]);

    // El encuadre sale del tamaño REAL de la caja del dibujo: con la misma
    // proporción, pasar de dedo a metros es una regla de tres.
    useEffect(() => {
        if (!datos || vb) return;
        const el = cajaRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setAnchoPx(r.width);
        setVb(encuadre(datos.plano, r.width / Math.max(1, r.height)));
    }, [datos, vb]);

    // Si la caja cambia de tamaño (se gira el teléfono o la tablet, o aparece
    // la barra del navegador), el encuadre se rehace con la proporción nueva:
    // con otra proporción el plano se estiraría y el dedo dejaría de caer
    // donde se ve. Ver `alCambiarDeTamano`.
    useEffect(() => {
        const el = cajaRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return;
            const antes = tamanoCaja.current;
            const ahora = { w: r.width, h: r.height };
            tamanoCaja.current = ahora;
            setAnchoPx(r.width);
            if (antes && (antes.w !== ahora.w || antes.h !== ahora.h)) {
                setVb(v => alCambiarDeTamano(v, antes, ahora));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [datos]);

    // ── Las fotos de cada pared ───────────────────────────────────────────
    const cargarFotos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/${token}/fotos`);
            const d = await r.json().catch(() => ({}));
            if (r.ok) setFotosPorPared(d.fotos || {});
            else if (r.status === 410) setCerrada(true);
        } catch { /* se queda lo que había */ }
    }, [token]);

    // ── Mandar al ordenador ───────────────────────────────────────────────
    // Siempre el estado ENTERO: un envío perdido lo corrige el siguiente. Lo
    // que no llega se queda apuntado (`cambios`) y sale al volver la red.
    const mandar = useCallback(async () => {
        const e = envio.current;
        if (e.ocupado) { e.pendiente = true; return; }
        e.ocupado = true;
        try {
            do {
                e.pendiente = false;
                const cuerpo = e.ultimo;
                const n = cambios.current.hecho;
                e.hora = Date.now();
                const r = await pedir(`${API}/${token}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cuerpo),
                }, { plazo: 12_000 });
                if (r.status === 410) { setCerrada(true); return; }
                red(true);
                if (r.ok) cambios.current.confirmado = Math.max(cambios.current.confirmado, n);
            } while (e.pendiente);
            setSinEnviar(cambios.current.confirmado < cambios.current.hecho);
        } catch {
            // Sin red: queda apuntado en el teléfono y sale al volver.
            red(false);
        } finally {
            e.ocupado = false;
        }
    }, [token, red]);

    const sincronizar = useCallback((lista, curso, { ya = false } = {}) => {
        // Una lista NUEVA de manchas terminadas es un cambio que hay que hacer
        // llegar; el trazo a medias no (si se pierde, da igual).
        if (lista !== cambios.current.lista) {
            cambios.current.lista = lista;
            cambios.current.hecho += 1;
            setSinEnviar(true);
        }
        envio.current.ultimo = { trazos: lista, enCurso: curso };
        if (!ya && Date.now() - envio.current.hora < CADENCIA_ENVIO_MS) {
            // Demasiado seguido: se queda apuntado y sale con el siguiente.
            if (!envio.current.temporizador) {
                envio.current.temporizador = setTimeout(() => {
                    envio.current.temporizador = null;
                    mandar();
                }, CADENCIA_ENVIO_MS);
            }
            return;
        }
        mandar();
    }, [mandar]);

    // ── Lo que dice el ordenador (resultado del ajuste, o que ha cerrado) ──
    // Es también la SONDA de la red: si contesta, hay cobertura y sale lo pendiente.
    const consultando = useRef(false);
    useEffect(() => {
        if (!datos || cerrada) return undefined;
        const id = setInterval(async () => {
            // Con poca señal una consulta puede tardar: no se apilan.
            if (consultando.current) return;
            consultando.current = true;
            try {
                let r;
                try { r = await pedir(`${API}/${token}/estado`, {}, { plazo: 8000 }); }
                catch { red(false); return; }
                red(true);
                const d = await r.json();
                if (d.estado === 'cerrada') { setCerrada(true); return; }
                setSinOrdenador(!!d.ordenadorAusente);
                // Los huecos que el ordenador acaba de poner (o no).
                if (d.resultadoHuecos) {
                    setResultadoHuecos(prev => (prev?.serial === d.resultadoHuecos.serial ? prev : d.resultadoHuecos));
                }
                // Las paredes han cambiado en el ordenador (sus huecos, un nombre,
                // una reclasificación): se pide lo ligero y se funde.
                if (d.paredesV && d.paredesV !== paredesVistas.current) {
                    paredesVistas.current = d.paredesV;
                    try {
                        const r3 = await fetch(`${API}/${token}/paredes`);
                        const d3 = await r3.json().catch(() => ({}));
                        if (r3.ok && d3.paredes) {
                            setDatos(dd => dd && ({ ...dd, plano: { ...dd.plano,
                                muros: dd.plano.muros.map(m => (m.id && d3.paredes[m.id]
                                    ? { ...m, ...d3.paredes[m.id], svg: m.svg } : m)) } }));
                        }
                    } catch { /* al siguiente tic */ }
                }
                const res = d.resultado;
                if (res && res.serial > vistoSerial.current) {
                    vistoSerial.current = res.serial;
                    setResultado(res);
                    setFase('hecho');
                    if (res.ok) setTrazos([]);
                    if (res.remedido) {
                        // El ordenador ha VUELTO A MEDIR: se pide la planta de
                        // ahora —paredes y zonas—. Con las paredes de antes, las
                        // zonas nuevas se pintaban sobre una planta que ya no es.
                        try {
                            const r2 = await fetch(`${API}/${token}`);
                            const d2 = await r2.json().catch(() => ({}));
                            if (r2.ok && d2.plano) setDatos(dd => dd && ({ ...dd, plano: d2.plano }));
                        } catch { /* se queda la de antes */ }
                    } else if (res.ok && res.zonas?.length) {
                        // Lo que ha salido se ve encima de la planta: es sobre
                        // lo que se corrige si hace falta.
                        setDatos(dd => dd && ({ ...dd, plano: { ...dd.plano, zonas: res.zonas } }));
                    }
                }
            } catch { /* se reintenta al siguiente tic */ }
            finally { consultando.current = false; }
        }, POLL_ESTADO_MS);
        return () => clearInterval(id);
    }, [datos, cerrada, token, red]);

    // ── Vuelve la red: sale lo pendiente ──────────────────────────────────
    const mandarAjuste = useCallback(async () => {
        const pet = ajusteRef.current;
        if (!pet) return;
        try {
            const r = await pedir(`${API}/${token}/ajustar`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ajustar: pet.ajustar, trazos: trazosRef.current, id_local: pet.id }),
            }, { plazo: 15_000 });
            if (r.status === 410) { setCerrada(true); return; }
            red(true);
            if (ajusteRef.current?.id !== pet.id) return;    // se canceló mientras iba
            ajusteRef.current = null;
            setAjusteEnCola(null);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setAviso(d.error || 'No se ha podido pedir el ajuste.');
                setFase('pintando');
                return;
            }
            // El ajuste lleva lo pintado: ya está en el servidor.
            cambios.current.confirmado = cambios.current.hecho;
            setSinEnviar(false);
        } catch {
            red(false);   // se queda en el teléfono: sale al volver la red
        }
    }, [token, red]);

    useEffect(() => {
        if (!pulso || !datos || cerrada) return;
        (async () => {
            if (cambios.current.confirmado < cambios.current.hecho) {
                envio.current.ultimo = { trazos: trazosRef.current, enCurso: null };
                await mandar();
            }
            if (ajusteRef.current) await mandarAjuste();
        })();
    }, [pulso]); // eslint-disable-line react-hooks/exhaustive-deps

    // Tras un corte, cuando ya no queda nada por mandar: se dice, un momento.
    const hayPendiente = sinEnviar || !!ajusteEnCola || pendFotos.fotos > 0 || pendFotos.huecos > 0
        || pendFotos.lecturas > 0;
    useEffect(() => {
        if (sinRed) { if (hayPendiente) setCorteConPendiente(true); return; }
        if (hayPendiente || !corteConPendiente) return;
        setCorteConPendiente(false);
        setEnviadoTodo(true);
    }, [sinRed, hayPendiente, corteConPendiente]);
    useEffect(() => {
        if (!enviadoTodo) return undefined;
        const t = setTimeout(() => setEnviadoTodo(false), 3500);
        return () => clearTimeout(t);
    }, [enviadoTodo]);

    // ── El dedo ───────────────────────────────────────────────────────────
    const aDibujo = (cx, cy) => {
        const r = svgRef.current.getBoundingClientRect();
        return [vb.x + (cx - r.left) * vb.w / r.width, vb.y + (cy - r.top) * vb.h / r.height];
    };

    const onDown = (e) => {
        if (!vb || (modo === 'croquis' && fase !== 'pintando')) return;
        e.preventDefault();
        // Capturar el dedo: si sale del dibujo a mitad de trazo, se sigue
        // recibiendo. Algún navegador lo rechaza para ciertos punteros, y eso
        // no puede impedir pintar.
        try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
        punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
        if (punteros.current.size === 1) {
            gesto.current = modo === 'fotos'
                // En FOTOS un dedo no pinta: TOCA una pared (la elige) o, si se
                // arrastra, mueve el plano.
                ? { tipo: 'toque', id: e.pointerId, x0: e.clientX, y0: e.clientY, vb0: vb, movido: false }
                : { tipo: 'trazo', id: e.pointerId, pts: [aDibujo(e.clientX, e.clientY)] };
        } else if (punteros.current.size === 2) {
            // Un segundo dedo: era un pellizco, no un trazo.
            if (gesto.current?.tipo === 'trazo') {
                setEnCurso(null);
                sincronizar(trazosRef.current, null, { ya: true });
            }
            const [a, b] = [...punteros.current.values()];
            const r = svgRef.current.getBoundingClientRect();
            const medio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            gesto.current = {
                tipo: 'pinza', vb0: vb, d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
                ancla: [vb.x + (medio[0] - r.left) * vb.w / r.width, vb.y + (medio[1] - r.top) * vb.h / r.height],
            };
        }
    };

    const onMove = (e) => {
        if (!punteros.current.has(e.pointerId) || !vb) return;
        punteros.current.set(e.pointerId, [e.clientX, e.clientY]);
        const g = gesto.current;
        if (!g) return;
        if (g.tipo === 'toque' && g.id === e.pointerId) {
            const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
            if (!g.movido && Math.hypot(dx, dy) < 8) return;
            g.movido = true;
            const r = svgRef.current.getBoundingClientRect();
            setVb({ ...g.vb0, x: g.vb0.x - dx * g.vb0.w / r.width, y: g.vb0.y - dy * g.vb0.h / r.height });
        } else if (g.tipo === 'trazo' && g.id === e.pointerId) {
            const p = aDibujo(e.clientX, e.clientY);
            const u = g.pts[g.pts.length - 1];
            // Un punto cada ~12 cm de plano, o cada poco más si se está lejos.
            if (Math.hypot(p[0] - u[0], p[1] - u[1]) > Math.max(0.12, vb.w / 300)) {
                g.pts.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
                const curso = { uso, pts: [...g.pts] };
                setEnCurso(curso);
                sincronizar(trazosRef.current, curso);
            }
        } else if (g.tipo === 'pinza' && punteros.current.size >= 2) {
            const [a, b] = [...punteros.current.values()];
            const r = svgRef.current.getBoundingClientRect();
            const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
            const k = Math.min(8, Math.max(0.15, g.d0 / d));
            const w = g.vb0.w * k, h = g.vb0.h * k;
            const medio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            // El punto del plano que estaba bajo los dedos sigue bajo los dedos.
            setVb({ x: g.ancla[0] - (medio[0] - r.left) * w / r.width,
                    y: g.ancla[1] - (medio[1] - r.top) * h / r.height, w, h });
        }
    };

    const onUp = (e) => {
        punteros.current.delete(e.pointerId);
        const g = gesto.current;
        if (g?.tipo === 'trazo' && g.id === e.pointerId) {
            gesto.current = null;
            setEnCurso(null);
            const pts = simplificarTrazo(g.pts);
            // Una mancha de menos de 1 m² es un toque, no un croquis.
            if (pts.length >= 3 && areaPoligono(pts) > 1) {
                const lista = [...trazosRef.current, { uso, pts }];
                setTrazos(lista);
                sincronizar(lista, null, { ya: true });
            } else {
                sincronizar(trazosRef.current, null, { ya: true });
            }
        } else if (g?.tipo === 'toque' && g.id === e.pointerId) {
            gesto.current = null;
            if (!g.movido) {
                // Un TOQUE: la pared más cercana bajo el dedo, con un radio de
                // dedo (26 px), nunca una lejana. Tocar el vacío la suelta.
                const radio = 26 * vb.w / Math.max(1, anchoPx || svgRef.current.getBoundingClientRect().width);
                setSelPared(paredEnPunto(datos?.plano?.muros, aDibujo(e.clientX, e.clientY), radio));
            }
        } else if (g?.tipo === 'pinza' && punteros.current.size < 2) {
            gesto.current = null;
        }
    };

    const zoom = (k) => setVb(v => v && ({ x: v.x + v.w * (1 - k) / 2, y: v.y + v.h * (1 - k) / 2, w: v.w * k, h: v.h * k }));
    const reencuadrar = () => {
        const r = cajaRef.current?.getBoundingClientRect();
        if (r && datos) setVb(encuadre(datos.plano, r.width / Math.max(1, r.height)));
    };

    const deshacer = () => {
        const lista = trazos.slice(0, -1);
        setTrazos(lista);
        sincronizar(lista, null, { ya: true });
    };
    const borrar = () => {
        if (!confirmaBorrar) { setConfirmaBorrar(true); return; }
        setConfirmaBorrar(false);
        setTrazos([]);
        setNotasPropuesta(null);
        sincronizar([], null, { ya: true });
    };
    // Lo ya marcado en la planta, como manchas que se pueden rehacer: el croquis
    // SUSTITUYE las zonas de la planta, así que para corregir solo el garaje
    // hay que volver a llevar también el porche.
    // La PROPUESTA del motor como manchas: se corrige y se ajusta igual que un
    // croquis pintado a mano.
    const partirDePropuesta = () => {
        const lista = (datos?.propuesta || []).map(t => ({ uso: t.uso, pts: t.pts }));
        if (!lista.length) return;
        setTrazos(lista);
        setNotasPropuesta(datos.propuesta);
        sincronizar(lista, null, { ya: true });
    };
    const partirDeLoMarcado = () => {
        const lista = (datos?.plano?.zonas || []).filter(z => z.lienzo?.length >= 3)
            .map(z => ({ uso: z.uso, pts: z.lienzo }));
        if (!lista.length) return;
        setTrazos(lista);
        sincronizar(lista, null, { ya: true });
    };

    // El ajuste se APUNTA antes de pedirlo: sin cobertura se queda en el
    // teléfono y sale solo al volver la señal (con su id, para no pedirlo dos veces).
    const ajustar = async (conCatastro) => {
        if (!trazos.length) return;
        setAviso(null);
        setFase('ajustando');
        const pet = { id: nuevoIdLocal('aj'), ajustar: conCatastro };
        ajusteRef.current = pet;
        setAjusteEnCola(pet);
        await mandarAjuste();
    };
    // Pedido sin cobertura, se puede dejar de esperar y seguir pintando.
    const cancelarAjuste = () => {
        ajusteRef.current = null;
        setAjusteEnCola(null);
        setFase('pintando');
    };
    // Lo pintado con el enlace anterior, a ESTE lienzo, junto a lo de ahora.
    const recuperar = () => {
        if (!rescate) return;
        const vieja = recuperarTrazos(rescate.trazos, rescate.marco, datos?.marco);
        const lista = [...trazosRef.current, ...vieja].slice(0, 20);
        setTrazos(lista);
        sincronizar(lista, null, { ya: true });
        guardarRescate(claveRef.current, null);
        setRescate(null);
    };
    const descartarRescate = () => {
        guardarRescate(claveRef.current, null);
        setRescate(null);
    };

    // ── Pantallas que no son el dibujo ────────────────────────────────────
    if (error || cerrada) {
        const queda = quedaAqui && textoPendiente({ zonas: quedaAqui.zonas, fotos: quedaAqui.fotos,
                                                    huecos: quedaAqui.huecos });
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bkg-deep p-8 text-center">
                <div className="text-4xl">📱</div>
                <p className="max-w-xs text-[15px] font-bold text-white">
                    {cerrada ? 'El ordenador ha cerrado el croquis.' : error}
                </p>
                {queda ? (
                    <p className="max-w-xs rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px]
                                  leading-snug text-amber-100">
                        En este teléfono queda guardado <b>{queda}</b> sin enviar. Pide otro QR de esta planta
                        desde el ordenador y ábrelo <b>aquí, en este mismo teléfono</b>: se recupera.
                    </p>
                ) : (
                    <p className="max-w-xs text-[13px] text-white/70">
                        {cerrada ? 'Si necesitas seguir pintando, pide otro QR desde la ventana de la envolvente.'
                                 : 'Ya puedes cerrar esta página.'}
                    </p>
                )}
            </div>
        );
    }
    if (!datos) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bkg-deep p-8 text-center">
                {sinCargar ? (
                    <>
                        <IconoSinRed size={36} className="text-amber-300" />
                        <p className="max-w-xs text-[15px] font-bold text-white">Sin cobertura</p>
                        <p className="max-w-xs text-[13px] leading-snug text-white/75">
                            La planta se abrirá sola en cuanto vuelva la señal. Lo que ya hubieras pintado o
                            fotografiado sigue guardado en el teléfono.
                        </p>
                    </>
                ) : (
                    <p className="text-[12px] font-black uppercase tracking-widest text-white/70">Abriendo la planta…</p>
                )}
            </div>
        );
    }

    const muros = datos.plano?.muros || [];
    const carto = datos.plano?.cartografia;
    const tam = vb ? (anchoPx > 0 ? vb.w * TAM_PX / anchoPx : vb.w / 28) : 0.5;
    const catastroTxt = textoCatastro(datos.catastro);
    const usos = datos.usos || USOS_ZONA;
    const zonasHechas = (datos.plano?.zonas || []).filter(z => z.lienzo?.length >= 3);
    // Mientras se pinta, lo ya marcado se ve en fantasma: lo que se pinte ahora
    // lo va a SUSTITUIR.
    const repintando = trazos.length > 0 || !!enCurso;
    const ajustando = fase === 'ajustando';
    const enFotos = modo === 'fotos';
    const pista = !enFotos && fase === 'pintando' && !repintando && !sinOrdenador && !sinRed;
    const pistaFotos = enFotos && !selPared && !sinOrdenador && !sinRed;
    const pendienteTxt = textoPendiente({ zonas: sinEnviar ? Math.max(1, trazos.length) : 0, fotos: pendFotos.fotos,
                                          huecos: pendFotos.huecos, lecturas: pendFotos.lecturas,
                                          ajuste: !!ajusteEnCola });
    const paredesConId = muros.filter(m => m.id);
    const tieneFoto = (id) => (fotosPorPared[id] || []).some(f => !f.roto);
    const cambiaModo = (m) => {
        setModo(m);
        if (m === 'fotos') cargarFotos();
        else setSelPared(null);
    };
    const m2Dibujados = trazos.reduce((a, t) => a + areaPoligono(t.pts), 0);
    const rescateAqui = rescate ? recuperarTrazos(rescate.trazos, rescate.marco, datos.marco) : [];
    const etiqueta = (u) => (ETIQUETA_USO_ZONA[u] || u).toUpperCase();
    const esc = vb ? escalaDe(vb) : null;
    const hayQueBorrar = trazos.length > 0 && fase === 'pintando';

    return (
        // En HORIZONTAL (tablet o móvil girado) los mandos van en una columna a
        // la derecha: debajo le quitarían al plano la poca altura que hay.
        <div className="flex h-[100dvh] flex-col bg-bkg-deep text-white landscape:flex-row">
            {/* La cabecera, en una línea: cada píxel que se le quita va al plano. */}
            <header className="flex shrink-0 items-baseline justify-between gap-3 px-4 pb-2
                               pt-[max(0.7rem,env(safe-area-inset-top))] landscape:hidden">
                <h1 className="truncate text-[17px] font-black leading-tight">{datos.planta?.nombre || 'Planta'}</h1>
                <p className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
                    Croquis · Brokergy
                </p>
            </header>

            <div ref={cajaRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden" style={{ background: PAPEL }}>
                {vb && (
                    <svg ref={svgRef} className="absolute inset-0 h-full w-full select-none"
                         viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none"
                         style={{ touchAction: 'none' }}
                         onPointerDown={onDown} onPointerMove={onMove}
                         onPointerUp={onUp} onPointerCancel={onUp}>
                        <defs>
                            {/* La cartografía, de fondo: casi sin color, para que sus
                                rosas y verdes no se confundan con los de los usos. */}
                            <filter id="mapa-base"><feColorMatrix type="saturate" values="0.2" /></filter>
                            {/* El rayado de lo YA marcado: resultado, no borrador. */}
                            {usos.map((u, i) => (
                                <pattern key={u} id={`rayado-${i}`} width={tam * 0.45} height={tam * 0.45}
                                         patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                    <line x1={0} y1={0} x2={0} y2={tam * 0.45} stroke={colorDe(u)}
                                          strokeWidth={tam * 0.07} strokeOpacity={0.55} />
                                </pattern>
                            ))}
                        </defs>
                        {carto?.imagen && (
                            <image href={`data:${carto.tipo || 'image/png'};base64,${carto.imagen}`}
                                   x={carto.en_el_lienzo.x} y={carto.en_el_lienzo.y}
                                   width={carto.en_el_lienzo.ancho} height={carto.en_el_lienzo.alto}
                                   preserveAspectRatio="none" opacity={0.5} filter="url(#mapa-base)" />
                        )}

                        {/* 1 · Lo ya marcado (rayado) y los rellenos de lo pintado:
                            DEBAJO de las paredes, que son por donde hay que rodear. */}
                        {/* En FOTOS lo que se mira son las paredes: las zonas, atenuadas. */}
                        <g opacity={repintando ? 0.35 : enFotos ? 0.5 : 1}>
                            {zonasHechas.map((z, i) => {
                                const k = Math.max(0, usos.indexOf(z.uso));
                                return (
                                    <g key={`z${i}`}>
                                        <polygon points={puntos(z.lienzo)} fill={colorDe(z.uso)} fillOpacity={0.1} />
                                        <polygon points={puntos(z.lienzo)} fill={`url(#rayado-${k})`}
                                                 stroke={colorDe(z.uso)} strokeWidth={tam * 0.14} strokeLinejoin="round" />
                                    </g>
                                );
                            })}
                        </g>
                        {trazos.map((t, i) => (
                            <polygon key={`f${i}`} points={puntos(t.pts)} fill={colorDe(t.uso)} fillOpacity={0.18} />
                        ))}
                        {rescate && !enFotos && rescateAqui.map((t, i) => (
                            <polygon key={`rs${i}`} points={puntos(t.pts)} fill="#f59e0b" fillOpacity={0.12}
                                     stroke="#d97706" strokeWidth={tam * 0.16} strokeLinejoin="round"
                                     strokeDasharray={`${tam * 0.45} ${tam * 0.3}`} />
                        ))}

                        {/* La pared ELEGIDA para su foto: un halo debajo de todo. */}
                        {enFotos && selPared && (() => {
                            const m = muros.find(x => x.id === selPared);
                            return m ? (
                                <polyline points={puntos(m.svg)} fill="none" stroke="#7c3aed" strokeOpacity={0.35}
                                          strokeWidth={tam * 1.1} strokeLinecap="round" strokeLinejoin="round" />
                            ) : null;
                        })()}

                        {/* 2 · Las paredes: con un contorno blanco debajo, que es lo
                            que hace que una línea se lea sobre un mapa cargado. El
                            grosor va con el encuadre, así que no engorda al ampliar. */}
                        {muros.map((m, i) => (
                            <polyline key={`h${i}`} points={puntos(m.svg)} fill="none" stroke="#fff"
                                      strokeOpacity={0.9} strokeWidth={tam * 0.46}
                                      strokeLinecap="round" strokeLinejoin="round" />
                        ))}
                        {muros.map((m, i) => {
                            const t = trazoMuro(m.tipo);
                            return (
                                <polyline key={i} points={puntos(m.svg)} fill="none" stroke={t.stroke}
                                          strokeWidth={tam * 0.22} strokeLinecap="round" strokeLinejoin="round"
                                          strokeDasharray={t.dash ? `${tam * 0.7} ${tam * 0.45}` : undefined} />
                            );
                        })}

                        {/* 3 · Los contornos de lo pintado; mientras se ajusta, en
                            movimiento, para que se vea que se están procesando. */}
                        {trazos.map((t, i) => (
                            <polygon key={`c${i}`} points={puntos(t.pts)} fill="none" stroke={colorDe(t.uso)}
                                     strokeWidth={tam * 0.2} strokeLinejoin="round" strokeLinecap="round"
                                     strokeDasharray={ajustando ? `${tam * 0.5} ${tam * 0.35}` : undefined}>
                                {ajustando && (
                                    <animate attributeName="stroke-dashoffset" from={0} to={-tam * 1.7}
                                             dur="0.8s" repeatCount="indefinite" />
                                )}
                            </polygon>
                        ))}

                        {/* 4 · El trazo en curso, como un lazo: dónde empezó y por
                            dónde se va a cerrar. */}
                        {enCurso?.pts?.length > 1 && (() => {
                            const c = colorDe(enCurso.uso);
                            const p0 = enCurso.pts[0];
                            const pn = enCurso.pts[enCurso.pts.length - 1];
                            return (
                                <g>
                                    <polygon points={puntos(enCurso.pts)} fill={c} fillOpacity={0.12} />
                                    <line x1={pn[0]} y1={pn[1]} x2={p0[0]} y2={p0[1]} stroke={c}
                                          strokeWidth={tam * 0.1} strokeDasharray={`${tam * 0.4} ${tam * 0.3}`}
                                          strokeOpacity={0.8} />
                                    <polyline points={puntos(enCurso.pts)} fill="none" stroke="#fff"
                                              strokeOpacity={0.8} strokeWidth={tam * 0.46}
                                              strokeLinejoin="round" strokeLinecap="round" />
                                    <polyline points={puntos(enCurso.pts)} fill="none" stroke={c}
                                              strokeWidth={tam * 0.26} strokeLinejoin="round" strokeLinecap="round" />
                                    <circle cx={p0[0]} cy={p0[1]} r={tam * 0.32} fill={PAPEL}
                                            stroke={c} strokeWidth={tam * 0.12} />
                                </g>
                            );
                        })()}

                        {/* 5 · Los rótulos, lo último: encima de todo lo demás. */}
                        {!repintando && !enFotos && zonasHechas.map((z, i) => {
                            const c = centroDe(z.lienzo);
                            return (
                                <EtiquetaMancha key={`rz${i}`} cx={c[0]} cy={c[1]} tam={tam}
                                                titulo={etiqueta(z.uso)} sub={`${fmt(areaPoligono(z.lienzo))} m²`}
                                                color={colorDe(z.uso)} papel={PAPEL} tinta={TINTA} tintaSub={TINTA_SUAVE} />
                            );
                        })}
                        {trazos.map((t, i) => {
                            const c = centroDe(t.pts);
                            return (
                                <EtiquetaMancha key={`rt${i}`} cx={c[0]} cy={c[1]} tam={tam}
                                                titulo={etiqueta(t.uso)} sub={`≈${fmt(areaPoligono(t.pts))} m²`}
                                                color={colorDe(t.uso)} papel={PAPEL} tinta={TINTA} tintaSub={TINTA_SUAVE} />
                            );
                        })}

                        {/* En FOTOS, cada fachada dice si ya tiene su foto: el hueco
                            que queda por hacer se ve de un vistazo. */}
                        {/* …y si tiene algo esperando en el teléfono (↑), lo leído por
                            revisar (!) o una foto que no se ha podido subir. */}
                        {enFotos && paredesConId.filter(m => m.admite || tieneFoto(m.id) || estadoParedes[m.id]).map((m) => {
                            const [cx, cy] = mitadDePared(m.svg);
                            const ok = tieneFoto(m.id);
                            const est = estadoParedes[m.id];
                            const sel = m.id === selPared;
                            const r = tam * (sel ? 0.62 : 0.5);
                            const marca = est === 'revisar' ? { fondo: '#7c3aed', borde: '#fff', texto: '#fff', glifo: '!' }
                                : est === 'error' ? { fondo: '#e11d48', borde: '#fff', texto: '#fff', glifo: '!' }
                                : est === 'cola' ? { fondo: '#d97706', borde: '#fff', texto: '#fff', glifo: '↑' }
                                : ok ? { fondo: '#059669', borde: '#fff', texto: '#fff', glifo: '✓' }
                                : { fondo: PAPEL, borde: '#7c3aed', texto: '#7c3aed', glifo: '+', trazos: true };
                            return (
                                <g key={`b${m.id}`} style={{ pointerEvents: 'none' }}>
                                    <circle cx={cx} cy={cy} r={r} fill={marca.fondo}
                                            stroke={marca.borde} strokeWidth={tam * 0.1}
                                            strokeDasharray={marca.trazos ? `${tam * 0.22} ${tam * 0.14}` : undefined} />
                                    <text x={cx} y={cy + r * 0.36} fontSize={r * 1.05} fontWeight={900}
                                          textAnchor="middle" fill={marca.texto}>
                                        {marca.glifo}
                                    </text>
                                </g>
                            );
                        })}
                        {enFotos && selPared && (() => {
                            const m = muros.find(x => x.id === selPared);
                            if (!m) return null;
                            const [cx, cy] = mitadDePared(m.svg);
                            return (
                                <EtiquetaMancha cx={cx} cy={cy - tam * 1.9} tam={tam}
                                                titulo={m.nombre || m.id}
                                                sub={m.largo ? `${Number(m.largo).toFixed(1).replace(".", ",")} m` : null}
                                                color="#7c3aed" papel={PAPEL} tinta={TINTA} tintaSub={TINTA_SUAVE} />
                            );
                        })()}

                        {esc && (
                            <g style={{ pointerEvents: 'none' }}>
                                <line x1={vb.x + tam * 0.8} y1={vb.y + vb.h - tam * 1.1}
                                      x2={vb.x + tam * 0.8 + esc} y2={vb.y + vb.h - tam * 1.1}
                                      stroke="#fff" strokeWidth={tam * 0.42} strokeLinecap="round" strokeOpacity={0.9} />
                                <line x1={vb.x + tam * 0.8} y1={vb.y + vb.h - tam * 1.1}
                                      x2={vb.x + tam * 0.8 + esc} y2={vb.y + vb.h - tam * 1.1}
                                      stroke={TINTA} strokeWidth={tam * 0.14} />
                                {[0, esc].map(d => (
                                    <line key={d} x1={vb.x + tam * 0.8 + d} y1={vb.y + vb.h - tam * 1.45}
                                          x2={vb.x + tam * 0.8 + d} y2={vb.y + vb.h - tam * 0.75}
                                          stroke={TINTA} strokeWidth={tam * 0.12} />
                                ))}
                                <text x={vb.x + tam * 0.8} y={vb.y + vb.h - tam * 1.75} fontSize={tam * 0.72}
                                      fontWeight={800} fill={TINTA} stroke="#fff" strokeWidth={tam * 0.18}
                                      paintOrder="stroke">{esc} m</text>
                            </g>
                        )}
                    </svg>
                )}

                {/* Los avisos, arriba y APILADOS: con dos a la vez no pueden taparse. */}
                <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col gap-1.5">
                {/* SIN COBERTURA, o mandando lo que quedó pendiente: lo primero que
                    se ve. Sin esto no se distingue «guardado» de «perdido». */}
                {(sinRed || (hayPendiente && corteConPendiente) || enviadoTodo) && (
                    <div role="status"
                         className={`flex items-start gap-2 rounded-xl border px-3 py-1.5
                                     text-[12px] leading-snug shadow-lg
                                     ${sinRed ? 'border-amber-500/60 bg-amber-50 text-amber-900'
                                         : enviadoTodo && !hayPendiente ? 'border-emerald-500/60 bg-emerald-50 text-emerald-900'
                                             : 'border-violet-400/60 bg-violet-50 text-violet-900'}`}>
                        <span className="mt-0.5 shrink-0">
                            {sinRed ? <IconoSinRed size={16} /> : enviadoTodo && !hayPendiente ? '✓' : <IconoSubiendo size={16} />}
                        </span>
                        <span className="min-w-0">
                            {sinRed ? (
                                <>
                                    <b>Sin cobertura</b> · se enviará solo al volver la señal
                                    <span className="block">
                                        {pendienteTxt ? <>Guardado en el teléfono: <b>{pendienteTxt}</b></>
                                                      : 'Sigue trabajando: lo que hagas se guarda en el teléfono'}
                                    </span>
                                </>
                            ) : enviadoTodo && !hayPendiente ? (
                                <b>Enviado todo lo que estaba pendiente.</b>
                            ) : (
                                <><b>Enviando lo pendiente…</b>{pendienteTxt && <span className="block">{pendienteTxt}</span>}</>
                            )}
                        </span>
                    </div>
                )}

                {/* La instrucción, SOBRE el plano y solo mientras no hay nada
                    pintado: al primer trazo ya no hace falta y quita sitio. */}
                {pista && (
                    <div className="croquis-chip rounded-xl px-3 py-2 text-[12.5px] leading-snug shadow-lg"
                         style={{ background: 'rgba(15, 23, 42, 0.86)' }}>
                        Rodea con el dedo lo que <strong>NO es vivienda</strong>
                        <span className="opacity-75"> · Dos dedos: mover y ampliar</span>
                        {datos.propuesta?.length > 0 && (
                            <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
                                <span className="opacity-85">✨ Hay una <strong>propuesta</strong> de dónde está.</span>
                                <button onClick={partirDePropuesta}
                                        className="pointer-events-auto min-h-[36px] shrink-0 rounded-lg border
                                                   border-white/40 px-2.5 text-[12px] font-bold">
                                    Ver la propuesta
                                </button>
                            </span>
                        )}
                        {zonasHechas.length > 0 && (
                            <span className="mt-1.5 flex items-center justify-between gap-2 text-[12px]">
                                <span className="opacity-85">Lo que pintes <strong>sustituye</strong> a lo ya marcado.</span>
                                <button onClick={partirDeLoMarcado}
                                        className="pointer-events-auto min-h-[36px] shrink-0 rounded-lg border
                                                   border-white/40 px-2.5 text-[12px] font-bold">
                                    Partir de ahí
                                </button>
                            </span>
                        )}
                    </div>
                )}

                {pistaFotos && (
                    <div className="croquis-chip rounded-xl px-3 py-2 text-[12.5px] leading-snug shadow-lg"
                         style={{ background: 'rgba(15, 23, 42, 0.86)' }}>
                        <strong>Toca una pared</strong> para hacerle la foto
                        <span className="opacity-75"> · Un dedo mueve, dos amplían</span>
                    </div>
                )}

                {sinOrdenador && !sinRed && (
                    <div className="rounded-xl border border-amber-500/60 bg-amber-50
                                    px-3 py-2 text-[12.5px] font-bold text-amber-900 shadow">
                        El ordenador no está recogiendo el croquis. Vuelve a abrir allí la ventana de la
                        envolvente: lo pintado se conserva y aparecerá en cuanto se abra.
                    </div>
                )}
                </div>

                {/* Los mandos del encuadre, abajo: al alcance del pulgar. */}
                <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
                    {[['Ampliar', <IconoMas key="m" />, () => zoom(0.7)],
                      ['Alejar', <IconoMenos key="n" />, () => zoom(1 / 0.7)],
                      ['Encuadrar la planta', <IconoEncuadrar key="e" />, reencuadrar]].map(([t, ic, fn]) => (
                        <button key={t} onClick={fn} aria-label={t} title={t}
                                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300
                                           bg-white/95 text-slate-700 shadow-md active:bg-slate-100">
                            {ic}
                        </button>
                    ))}
                </div>

                {ajustando && !enFotos && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/40 px-8">
                        {ajusteEnCola && sinRed ? (
                            // Pedido sin cobertura: está a salvo en el teléfono, no trabajando.
                            <div className="flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-amber-400/40
                                            bg-bkg-surface/95 px-5 py-4 text-center shadow-2xl">
                                <IconoSinRed size={30} className="text-amber-300" />
                                <p className="text-[14px] font-bold text-white">Sin cobertura</p>
                                <p className="text-[12px] leading-snug text-white/75">
                                    El ajuste se pedirá solo en cuanto vuelva la señal. Lo pintado está guardado en
                                    el teléfono.
                                </p>
                                <button onClick={cancelarAjuste}
                                        className="mt-1 min-h-[44px] rounded-xl border border-white/20 bg-white/[0.06] px-4
                                                   text-[13px] font-bold text-white">
                                    Seguir pintando
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10
                                            bg-bkg-surface/95 px-5 py-4 text-center shadow-2xl">
                                <svg className="h-8 w-8 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <p className="text-[14px] font-bold text-white">Ajustando en el ordenador…</p>
                                <p className="text-[12px] text-white/75">Se endereza y se lleva a los m² de Catastro.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* En vertical el panel no puede crecer sin tope: con la propuesta de
                una foto (la imagen y su lista) se comería el plano entero. */}
            <aside className="flex shrink-0 flex-col border-t border-white/10
                              portrait:max-h-[58dvh] portrait:overflow-y-auto
                              landscape:w-[min(340px,42vw)] landscape:overflow-y-auto landscape:border-l
                              landscape:border-t-0 landscape:pr-[env(safe-area-inset-right)]">
                <div className="hidden shrink-0 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:block">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Croquis · Brokergy</p>
                    <p className="truncate text-[17px] font-black leading-tight">{datos.planta?.nombre || 'Planta'}</p>
                </div>
                {/* Qué se hace: pintar lo que no es vivienda, o la foto de cada pared. */}
                <div className="mx-auto w-full max-w-xl shrink-0 px-3 pt-2.5">
                    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                        {[['croquis', <IconoLapiz key="l" />, 'Croquis'],
                          ['fotos', <IconoCamara key="c" />, 'Fotos de paredes']].map(([m, ic, t]) => (
                            <button key={m} role="tab" aria-selected={modo === m} onClick={() => cambiaModo(m)}
                                    className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg text-[12.5px]
                                                font-bold transition
                                        ${modo === m ? 'bg-violet-600 text-white shadow' : 'text-white/75'}`}>
                                {ic} {t}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Lo pintado con un enlace ANTERIOR de esta planta, que se quedó sin mandar. */}
                {rescate && !enFotos && (
                    <div className="mx-auto mt-2.5 w-full max-w-xl px-3">
                        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
                            <p className="text-[12.5px] leading-snug text-amber-100">
                                En este teléfono hay <b>{rescate.trazos.length === 1 ? '1 zona pintada'
                                    : `${rescate.trazos.length} zonas pintadas`}</b> sin enviar de un enlace anterior
                                ({haceCuanto(rescate.at)}), en naranja en el plano.
                            </p>
                            <div className="mt-2 flex gap-2">
                                <button onClick={recuperar}
                                        className="min-h-[44px] flex-1 rounded-lg bg-amber-500 text-[13px] font-black"
                                        style={{ color: '#451a03' }}>
                                    {rescate.trazos.length === 1 ? 'Recuperarla' : 'Recuperarlas'}
                                </button>
                                <button onClick={descartarRescate}
                                        className="min-h-[44px] rounded-lg border border-white/20 px-3 text-[13px] font-bold text-white/80">
                                    Descartar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* FOTOS no se desmonta al pasar al croquis: lo que tiene por mandar o
                    por revisar sigue ahí, y se sigue mandando solo. */}
                <div className={`mx-auto w-full max-w-xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5
                                 landscape:flex-1 ${enFotos ? '' : 'hidden'}`}>
                    <FotosParedMovil token={token} apiBase={API} clave={datos.clave || null} paredes={paredesConId}
                                     fotosPorPared={fotosPorPared} selId={selPared} onElegir={setSelPared}
                                     onFotosCambian={cargarFotos} resultadoHuecos={resultadoHuecos}
                                     sinOrdenador={sinOrdenador} sinRed={sinRed} pulso={pulso} onRed={red}
                                     onPendientes={setPendFotos} onEstadoParedes={setEstadoParedes} />
                </div>
                {enFotos ? null : fase === 'hecho' && resultado ? (
                    <div className="mx-auto w-full max-w-xl shrink-0 space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                        <p className={`text-[14px] font-black ${resultado.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
                            {resultado.ok ? '✓ Hecho' : 'No ha salido'}
                        </p>
                        {resultado.lineas?.length > 0 ? (
                            <ul className="space-y-1 text-[13px] text-white/85">
                                {resultado.lineas.map((l, i) => {
                                    const u = usoDeLinea(l);
                                    return (
                                        <li key={i} className="flex items-center gap-2">
                                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                                  style={{ background: u ? colorDe(u) : '#94a3b8' }} />
                                            {l}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : resultado.texto && <p className="text-[13px] text-white/85">{resultado.texto}</p>}
                        {resultado.ok && <p className="text-[12px] text-white/70">Lo demás es vivienda. Ya puedes cerrar esta página.</p>}
                        <button onClick={() => { setFase('pintando'); setResultado(null); }}
                                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-white/[0.05] text-[13px]
                                           font-bold text-white">
                            {resultado.ok ? 'Volver a pintar esta planta' : 'Volver a pintar'}
                        </button>
                    </div>
                ) : (
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
                                    pt-2.5 landscape:flex-1">
                        {catastroTxt && (
                            <p className="px-1 text-[11.5px] leading-snug text-white/70">
                                Catastro: <span className="font-bold text-white">{catastroTxt}</span>
                            </p>
                        )}
                        {notasPropuesta?.length > 0 && trazos.length > 0 && (
                            <ul className="space-y-0.5 rounded-lg border border-violet-400/25 bg-violet-400/[0.06] px-2.5
                                           py-1.5 text-[11.5px] leading-snug text-white/75">
                                {notasPropuesta.map((n, i) => (
                                    <li key={i}>
                                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                              style={{ background: colorDe(n.uso) }} />
                                        <b className="text-white">{ETIQUETA_USO_ZONA[n.uso] || n.uso}:</b> {n.por_que}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {/* La paleta, abajo: el uso se cambia sin soltar el móvil. */}
                        <div className="grid grid-cols-4 gap-1.5 landscape:grid-cols-2">
                            {usos.map(u => {
                                const sel = u === uso;
                                return (
                                    <button key={u} onClick={() => setUso(u)} aria-pressed={sel}
                                            style={sel ? { borderColor: colorDe(u), background: `${colorDe(u)}2e`,
                                                           boxShadow: `0 0 0 1px ${colorDe(u)}` } : undefined}
                                            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl
                                                        border px-1 text-center text-[11.5px] font-bold leading-tight transition
                                                        ${sel ? 'text-white' : 'border-white/15 bg-white/[0.04] text-white/75'}`}>
                                        <span className={`inline-block h-3.5 w-3.5 rounded-full ${sel ? 'ring-2 ring-white/90' : ''}`}
                                              style={{ background: colorDe(u) }} />
                                        {ETIQUETA_USO_ZONA[u] || u}
                                    </button>
                                );
                            })}
                        </div>
                        {aviso && <p className="px-1 text-[12.5px] text-amber-200">{aviso}</p>}
                        <div className="flex flex-col gap-2 landscape:mt-auto">
                            <div className="flex items-center gap-2">
                                <button onClick={borrar} disabled={!hayQueBorrar}
                                        aria-label={confirmaBorrar ? 'Confirmar: borrar todo' : 'Borrar todo'}
                                        className={`flex h-12 shrink-0 items-center justify-center rounded-xl border text-[12.5px]
                                                    font-bold disabled:opacity-40
                                                    ${confirmaBorrar ? 'border-rose-400/70 bg-rose-500/20 px-3 text-rose-200'
                                                                     : 'w-12 border-white/15 bg-white/[0.05] text-white/80'}`}>
                                    {confirmaBorrar ? '¿Borrar todo?' : <IconoPapelera />}
                                </button>
                                <button onClick={deshacer} disabled={!hayQueBorrar}
                                        aria-label="Deshacer la última mancha"
                                        className="ml-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border
                                                   border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-40">
                                    <IconoDeshacer />
                                </button>
                                <button onClick={() => ajustar(true)} disabled={!hayQueBorrar}
                                        className="h-12 flex-1 rounded-xl bg-violet-600 text-[15px] font-black text-white
                                                   shadow-lg shadow-violet-950/40 transition active:bg-violet-700
                                                   disabled:opacity-40 disabled:shadow-none">
                                    ✓ Ajustar a Catastro
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 pl-1 text-[12px] text-white/70">
                                <span>
                                    {trazos.length
                                        ? `${trazos.length} ${trazos.length === 1 ? 'zona' : 'zonas'} · ≈${fmt(m2Dibujados)} m² dibujados`
                                        : 'Rodea primero con el dedo lo que no es vivienda'}
                                </span>
                                <button onClick={() => ajustar(false)} disabled={!hayQueBorrar}
                                        title="Endereza los bordes pero respeta lo dibujado (cuando Catastro está desfasado)"
                                        className="min-h-[44px] shrink-0 rounded-lg px-3 font-bold text-white/85 underline
                                                   decoration-white/30 disabled:opacity-40">
                                    Solo enderezar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
