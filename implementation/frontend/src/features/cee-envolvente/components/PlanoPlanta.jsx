import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { areaPoligono, at, caja, centro, centroide, cota, CAMARA_ISO, ESCALA_AXO, fmt,
         claveEncuadre, largo, LARGO_MINIMO_PARED, pegarAPared, proyector,
         recorrido, reparto,
         tamanosDeDibujo, TOPE_ALT }
    from '../logic/geometriaPlano';
import { TIPOS_PARED, nombreHueco } from '../logic/usePlanoEnvolvente';
import { cuerposDeLaPlanta } from '../logic/cuerposEnvolvente';
import { CubiertaControl } from './PanelCubierta';

// ─────────────────────────────────────────────────────────────────────────────
// El plano del certificador. Cada pared se pulsa.
//
// Está dibujado como un PLANO DE OBRA y no como un esquema de líneas, porque
// quien lo mira lleva veinte años mirando planos de obra: muros con su grosor y
// su trama a 45°, huecos abiertos sobre el muro, cotas fuera y retícula de un
// metro. Lo que se gana no es estética — es que se lee de un vistazo por dónde
// se entra, qué pared tiene ventanas y cuál sigue sin mirar.
//
// LO QUE SE APRENDIÓ A BASE DE FALLAR, y que hay que respetar:
//
// 1. El SVG está EN METROS. Un `viewBox` de 21 × 20 son 21 × 20 METROS, así que
//    `strokeWidth: 6` dibuja muros de seis metros de grosor. Los trazos que
//    quieren un grosor de PANTALLA (contexto, retícula) llevan
//    `vectorEffect="non-scaling-stroke"`; los MUROS no lo llevan a propósito,
//    porque su grosor es una MEDIDA —0,34 m— y tiene que crecer con el zoom.
// 2. Las etiquetas SE PISAN cuando cuatro paredes se juntan en una esquina. Se
//    colocan evitando colisiones, la más larga primero, y la seleccionada y la
//    entrada se rotulan siempre aunque no quepan.
// 3. El sótano NO se dibuja: lo filtra `usePlanoEnvolvente`.
// 4. Los COLORES van por token de tema, nunca `rgba(255,255,255,…)`. Con el
//    blanco cableado, en tema claro las paredes sin tocar quedaban a 1,03:1 de
//    contraste: invisibles. Y no era un detalle estético — el plano parecía
//    tener tres paredes en vez de catorce.
// 5. El lienzo es del EDIFICIO (`plano.lienzo`), no de esta planta: las plantas
//    se comparan una con otra y tienen que estar a la misma escala.
// 6. Los `id` de los `<pattern>` llevan SUFIJO ÚNICO por instancia. Hay dos
//    planos en pantalla a la vez y en SVG los ids son globales: con el mismo
//    id, la segunda planta pinta con la trama de la primera.
//
// Aquí NO se mide nada: la geometría la trae el motor ya colocada, y lo que
// hace falta para pintarla (dónde cae un hueco, por qué lado sale la cota) es
// puro y vive en `logic/geometriaPlano.js`.
// ─────────────────────────────────────────────────────────────────────────────

//: El COLOR dice QUÉ ES la pared; el trazo, en qué estado está. Antes el color
//: decía el estado y el tipo no se veía — que es justo lo que el certificador
//: tiene que juzgar mirando el plano.
//:
//: La PARTICIÓN va en ROSA, y no es decoración: es el único tipo de cerramiento
//: que no se distingue mirando. Una fachada da a la calle y una medianera al
//: vecino —los dos se ven en el contexto—, pero una partición da a un local o a
//: un espacio no habitable, que es una DECISIÓN del certificador. Va en literal
//: y no en token porque el tema no tiene un rosa: se elige uno que contraste en
//: los dos modos (4,6:1 sobre el fondo claro, 5,1:1 sobre el oscuro) y que no se
//: confunda con el ámbar de «por confirmar» ni con el rojo de error.
const COLOR_TIPO = {
    FACHADA: 'var(--brand-primary)',
    MEDIANERA: 'var(--info)',
    PARTICION_VERTICAL: '#e0559b',
};

//: Los HUECOS tienen su propio color, y la puerta va en MARRÓN.
//:
//: Iba en el naranja de la fachada, o sea del MISMO color que el muro sobre el
//: que se dibuja: en 2D se distinguía por el barrido de la hoja, pero en 3D es
//: un paño naranja sobre una pared naranja y no se ve. El marrón es además el
//: color con el que se lee una puerta sin tener que explicarlo. Contrastado a
//: mano en los dos temas (no es texto: el listón son 3:1).
//:
//: La ventana se queda en el azul, que es el del vidrio.
//: EXPORTADO: el visor de la foto pinta la marca de cada hueco con el MISMO
//: color con el que aparece en el plano. Dos lenguajes de color para lo mismo
//: obligarian a traducir mentalmente entre las dos pantallas.
export const COLOR_HUECO = { puerta: '#b5763a', ventana: 'var(--info)' };
const colorHueco = h => COLOR_HUECO[h?.tipo === 'puerta' ? 'puerta' : 'ventana'];

// ─────────────────────────────────────────────────────────────────────────────
// LOS TAMAÑOS DE LO QUE SE AGARRA van en PANTALLA, no en metros.
//
// Esto lo dijo una certificadora que ya había hecho tres expedientes con la
// app: «lo único que me entorpece a veces es dibujar muros nuevos pequeños,
// como que el puntero que sale en los extremos son gordos».
//
// La causa: el SVG está en METROS y los tiradores, las asas y el imán estaban
// fijos en metros. Un tirador de 0,30 m de radio son 0,60 m de diámetro, así
// que sobre un tabique de 0,80 m los dos extremos se tocan y tapan la pared
// entera — y hacer ZOOM no ayudaba, porque el tirador crecía con el dibujo.
//
// Ahora se miden en múltiplos de `tam`, que ya es un tamaño de pantalla (sale
// del encuadre, así que encoge en metros al ampliar). Resultado: al hacer zoom
// para dibujar fino, el tirador se queda del mismo tamaño en la pantalla y el
// muro crece — que es lo que hace cualquier programa de dibujo.
//
// Lo que NO cambia: el grosor del muro y el de los huecos siguen en metros,
// porque son MEDIDAS del edificio (regla 1 de la cabecera).
// ─────────────────────────────────────────────────────────────────────────────

//: El TIRADOR de una pared solo sale en la SELECCIONADA: si cualquier pared se
//: pudiera arrastrar sin más, mover el plano con el puntero encima de una la
//: movería sin querer — y eso cambia una superficie que va al certificado.
//:
//: Cuánto miden el tirador, el asa de un hueco y el imán lo decide
//: `tamanosDeDibujo` (en `geometriaPlano.js`, que es puro y se puede probar
//: desde Node). Aquí solo se usan.

//: Lo que se dibuja mientras se traza una pared nueva: el punto de cada
//: extremo y el grosor de la línea de puntos.
const TRAZO = { punto: 0.42, linea: 0.42, guion: 0.95 };


//: Una pared sin tocar es lo que MÁS hay al abrir, y tiene que verse: es el
//: trabajo pendiente. Va al color del texto secundario, que el tema ya resuelve
//: en los dos modos.
const GRIS = 'var(--text-secondary)';
const APAGADO = 'var(--text-muted)';

//: El PAPEL. Es el mismo color con el que se rellena el hueco, y por eso el
//: hueco «abre» el muro en vez de pintarse encima: en un plano de obra, una
//: ventana es el muro interrumpido.
const PAPEL = 'rgb(var(--bkg-deep))';

//: El grosor del muro, en METROS. Dos medidas y no una: en un plano de obra el
//: grosor es lo que distingue de un vistazo el cerramiento del tabique. Lo
//: decide el SUBTIPO —el hecho geométrico que trae Catastro— y no el tipo, que
//: el certificador puede reclasificar: una fachada que resulta dar a un local
//: sigue siendo el muro de cerramiento, y no adelgaza por haberla reclasificado.
const GROSOR = { perimetral: 0.34, interior: 0.24 };
const SUBTIPOS_INTERIORES = new Set(['PATIO', 'ESPACIO_NO_HABITABLE']);

//: Lo que asoma de color a cada lado de la trama: la orla que hace que el muro
//: se lea como doble línea y no como una mancha.
const ORLA = 0.10;

//: Altura de planta para la axonometría. La buena viene de la ficha
//: (`altura_libre_planta`); este respaldo es el MISMO que el del motor
//: (`Opciones.floor_height`), con el que se midieron las fachadas.
const ALTURA_POR_DEFECTO = 2.8;

//: Lo que se separan las plantas en el 3D. Es una vista DESPIEZADA a propósito:
//: pegadas una encima de otra, la planta baja queda tapada por la primera justo
//: donde están sus paredes.
const SEPARACION = 3.7;

//: Cuántos grados gira un píxel de arrastre. Medido a ojo sobre el edificio de
//: 26RES060_186: con estos, media pantalla da la vuelta entera al edificio y un
//: gesto corto lo mueve lo justo para ver la esquina de al lado.
const GIRO = { az: 0.45, alt: 0.30 };

//: El contexto se dibuja apagado a propósito: es para SITUAR, no para pulsar.
//: El relleno de los vecinos imita al visor de Catastro (masa sólida suave) y
//: la parcela va a trazos, como su linde.
const CONTEXTO = {
    vecinoRelleno: 'color-mix(in srgb, var(--text-secondary) 22%, transparent)',
    vecinoBorde: 'color-mix(in srgb, var(--text-secondary) 55%, transparent)',
    lindeVecina: 'color-mix(in srgb, var(--text-secondary) 32%, transparent)',
    parcela: 'color-mix(in srgb, var(--text-secondary) 60%, transparent)',
    casa: 'color-mix(in srgb, var(--text-secondary) 10%, transparent)',
};

const ZOOM = { paso: 1.14, boton: 1.25, min: 0.18, max: 2.4 };

//: El color de cada trama: el MISMO que el del borde. La orla de 0,05 m que
//: queda a cada lado es lo único que los separa, y es lo que hace que el muro se
//: lea como un muro y no como una raya gorda.
const COLOR_TRAMA = {
    fachada: COLOR_TIPO.FACHADA,
    medianera: COLOR_TIPO.MEDIANERA,
    particion: COLOR_TIPO.PARTICION_VERTICAL,
    gris: GRIS,
    fuera: APAGADO,
};

const etiquetaTipo = (id) => (TIPOS_PARED.find(t => t.id === id) || {}).etiqueta || '—';

//: El mismo color, pero en CLASE de Tailwind, para el TEXTO del globo. Un
//: `style={{color:'#FFA000'}}` no lo toca el tema, y en claro ese naranja sobre
//: blanco se queda en 2,1:1 — ilegible a 10 px. Las clases sí las remapea
//: `index.css` (`text-brand` → #B45309, `text-sky-*` → #0284C7…).
const CLASE_TIPO = {
    FACHADA: 'text-brand',
    MEDIANERA: 'text-sky-400',
    PARTICION_VERTICAL: 'text-pink-400',
};

export function PlanoPlanta({ planta, plano, capas: capasPedidas, entorno, onEntorno,
                              modo = '2d', altura,
                              //: La CUBIERTA de esta planta que se reforma (entera o
                              //: por polígono), el modo de DIBUJARLA y a quién se le
                              //: entrega el polígono cerrado (o `null` al cancelar).
                              //: El mando vive AQUÍ, bajo la barra de este plano: la
                              //: cubierta se marca dibujándola encima, así que el
                              //: control tiene que estar donde se dibuja.
                              cubierta = null, dibujarCubierta = false, onCubierta = null,
                              onCubiertaModo = null, onCubiertaEntera = null,
                              onCubiertaQuitar = null,
                              catastro, quiereCatastro, onCatastro,
                              trayendoCatastro, falloCatastro,
                              // Los CUERPOS del edificio (la casa, el garaje
                              // adosado, el porche) y qué pasa al pulsar uno.
                              cuerpos = [], onCuerpo = null }) {
    const { muros, entrada, sel, elegir, esCandidata, esMedianera, mueveHueco,
            muevePared, dibujaPared, estadoDe, nombreDe, tipoDe } = plano;


    // Los ids de los `<pattern>` tienen que ser únicos: con dos plantas en
    // pantalla, el navegador resuelve `url(#hatch-fachada)` al primero que
    // encuentre y la segunda sale pintada con la trama de la primera.
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    //: El cuerpo que tiene el ratón encima. Es estado de PANTALLA y por eso vive
    //: aquí: no se guarda ni viaja a ninguna parte.
    const [cuerpoSobre, setCuerpoSobre] = useState(null);
    const es3d = modo === '3d';
    const svgRef = useRef(null);
    const cajaRef = useRef(null);

    //: Lo que va a SALIR como partición en el `.cex`, que es lo que hay que
    //: distinguir. Son dos caminos y acaban en lo mismo: una pared reclasificada
    //: a «da a un local», y una MEDIANERA marcada como partición (la que da a un
    //: espacio no habitable del vecino). Pintar solo la primera dejaría la mitad
    //: de las particiones con el color de otra cosa.
    const tipoEfectivo = m => (esMedianera(m) && m.como_particion
        ? 'PARTICION_VERTICAL' : tipoDe(m));

    const colorDe = (m) => {
        const estado = estadoDe(m);
        if (estado === 'fuera') return APAGADO;
        if (estado === 'falta') return GRIS;
        return COLOR_TIPO[tipoEfectivo(m)] || GRIS;
    };
    const tramaDe = (m) => {
        const estado = estadoDe(m);
        if (estado === 'fuera') return 'fuera';
        if (estado === 'falta') return 'gris';
        return { FACHADA: 'fachada', MEDIANERA: 'medianera',
                 PARTICION_VERTICAL: 'particion' }[tipoEfectivo(m)] || 'gris';
    };
    const grosorDe = m => (SUBTIPOS_INTERIORES.has(m.subtipo)
        ? GROSOR.interior : GROSOR.perimetral);
    const esInterior = m => SUBTIPOS_INTERIORES.has(m.subtipo);

    // QUÉ plantas entran en la axonometría lo decide quien llama, con el mismo
    // selector que parte el 2D: lo normal es el edificio entero —es lo que se
    // viene a ver, contra qué da cada pared y de qué planta es— pero con tres
    // forjados encima el de abajo se lee mal, y entonces hace falta poder
    // quedarse con uno. Sin que se lo digan, el edificio entero.
    const capas = es3d ? (capasPedidas?.length ? capasPedidas : (plano.plantas || []))
                       : [planta];
    // El estado del trabajo vive en `muros` (los huecos, lo reclasificado) y la
    // geometría en la planta: se juntan aquí, y manda siempre el `svg` del motor.
    const murosDe = p => (p?.muros || [])
        .map(b => ({ ...(muros[b.id] || b), svg: b.svg }))
        .filter(m => (m.svg || []).length >= 2);

    const { ancho, alto } = plano.lienzo || {};
    const alturaPlanta = Number(altura) > 0 ? Number(altura) : ALTURA_POR_DEFECTO;

    //: Desde dónde se mira el edificio en 3D. Arranca en la isométrica de
    //: siempre, así que la vista de partida no se ha movido ni un píxel.
    const [camara, setCamara] = useState(CAMARA_ISO);

    // El edificio como un BULTO: su centro y su radio. De él salen las dos
    // cosas que hacen que girar no sea un salto —el punto sobre el que gira y
    // el encuadre que lo contiene mire por donde se mire— y por eso se calcula
    // una vez y NO depende de la cámara.
    const modelo3d = useMemo(() => {
        const pts = [];
        // Las capas que SE DIBUJAN, no las del edificio: con una sola planta a
        // la vista, el centro y el radio del edificio entero la dejarían
        // descentrada y en un encuadre que le queda grande.
        (es3d ? capas : []).forEach((p, i) => {
            const z = i * (alturaPlanta + SEPARACION);
            murosDe(p).forEach(m => (m.svg || []).forEach(([x, y]) => {
                pts.push([x, y, z]); pts.push([x, y, z + alturaPlanta]);
            }));
        });
        if (!pts.length) return { pivote: [0, 0, 0], radio: 1 };
        const medio = k => {
            const v = pts.map(q => q[k]);
            return (Math.min(...v) + Math.max(...v)) / 2;
        };
        const pivote = [medio(0), medio(1), medio(2)];
        const radio = Math.max(1, ...pts.map(
            q => Math.hypot(q[0] - pivote[0], q[1] - pivote[1], q[2] - pivote[2])));
        return { pivote, radio };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [es3d, capasPedidas, plano.plantas, muros, alturaPlanta]);

    // La proyección de ESTE fotograma. En 2D no se usa para nada: la planta
    // viene del motor ya colocada sobre el lienzo.
    const proy = useMemo(
        () => proyector({ ...camara, pivote: modelo3d.pivote }),
        [camara, modelo3d]);

    // Dos encuadres sobre las MISMAS coordenadas: el de trabajo (la casa
    // grande, para pulsar paredes) y el del entorno (la manzana, para ver qué
    // hay al otro lado). Cambiar de uno a otro es cambiar el `viewBox`. En 3D
    // hay un tercero, que sale del bulto del edificio.
    const base = useMemo(() => {
        if (es3d) {
            // Una ESFERA y no la caja ajustada de lo proyectado: esa caja
            // cambia con cada grado de giro, así que el encuadre se
            // recalcularía en cada fotograma y tiraría por tierra el zoom del
            // usuario a mitad de arrastre. Con el radio sobra sitio siempre, y
            // el edificio se queda centrado porque la proyección gira sobre él.
            const r = modelo3d.radio * ESCALA_AXO * 1.06;
            return { x: -r, y: -r, ancho: r * 2, alto: r * 2 };
        }
        if (entorno && plano.entorno) {
            const e = plano.entorno;
            return { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto };
        }
        return { x: 0, y: 0, ancho, alto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [es3d, entorno, plano.entorno, modelo3d, planta, ancho, alto]);

    // El zoom es del USUARIO y el encuadre es del MOTOR: se guardan aparte, y
    // así «Encuadrar» es soltar el suyo sin recalcular nada.
    const [vb, setVb] = useState(null);

    // ⚠️ EL ZOOM SE PERDÍA AL DIBUJAR: el reinicio colgaba de la IDENTIDAD de
    // `base`, que se recalcula con cada cambio de `muros` o de `planta`. Ahora
    // cuelga de sus NÚMEROS — ver `claveEncuadre`, donde está contado entero.
    const claveBase = claveEncuadre(es3d, entorno, base);
    useEffect(() => { setVb(null); }, [claveBase]);
    const vista = vb || base;

    // La letra del plano y los tamaños de lo que se agarra, todos derivados
    // del ENCUADRE: así son constantes en pantalla y ampliar da precisión de
    // verdad. Va aquí arriba porque `pegar` necesita el radio del imán.
    const { tam, tirador, asa, iman } = tamanosDeDibujo(vista);

    // ── zoom y paneo ─────────────────────────────────────────────────────────
    // De coordenadas de PANTALLA a coordenadas del dibujo. Hay que deshacer el
    // `preserveAspectRatio` por defecto (xMidYMid meet): el SVG escala por el
    // lado que peor encaja y centra el resto, así que sin esto el zoom se va
    // hacia un lado en cuanto la caja no tiene la proporción del hueco.
    const aDibujo = (clientX, clientY, v = vista) => {
        const r = svgRef.current?.getBoundingClientRect();
        if (!r || !r.width || !r.height) return { x: 0, y: 0 };
        const s = Math.max(v.ancho / r.width, v.alto / r.height);
        return {
            x: v.x + v.ancho / 2 + (clientX - r.left - r.width / 2) * s,
            y: v.y + v.alto / 2 + (clientY - r.top - r.height / 2) * s,
        };
    };

    const escalar = (f, cx, cy) => {
        const v = vista;
        const w = Math.min(base.ancho * ZOOM.max,
                           Math.max(base.ancho * ZOOM.min, v.ancho * f));
        const h = v.alto * w / v.ancho;
        const px = cx === undefined ? v.x + v.ancho / 2 : cx;
        const py = cy === undefined ? v.y + v.alto / 2 : cy;
        const nuevo = { x: px - (px - v.x) * w / v.ancho,
                        y: py - (py - v.y) * h / v.alto, ancho: w, alto: h };
        setVb(nuevo);
        return nuevo;
    };

    // La rueda se engancha A MANO y no con `onWheel`: React registra ese
    // listener como PASIVO, y con él `preventDefault()` no hace nada — al hacer
    // zoom sobre el plano se scrollearía la página entera. Sin lista de
    // dependencias a propósito: el handler lee el encuadre de este render.
    useEffect(() => {
        const el = svgRef.current;
        if (!el) return undefined;
        const rueda = (e) => {
            e.preventDefault();
            const p = aDibujo(e.clientX, e.clientY);
            const nuevo = escalar(e.deltaY < 0 ? 1 / ZOOM.paso : ZOOM.paso, p.x, p.y);
            // Si se está arrastrando algo (un trazo, un tirador, un hueco), el
            // gesto lleva GUARDADO el encuadre con el que empezó: es lo que
            // convierte píxeles en metros. Al hacer zoom a media faena ese
            // encuadre se queda viejo y la conversión empieza a mentir, así
            // que el trazo se iba a otro sitio. Se vuelve a anclar aquí.
            const d = arrastre.current;
            if (d && nuevo) d.vb = nuevo;
        };
        el.addEventListener('wheel', rueda, { passive: false });
        return () => el.removeEventListener('wheel', rueda);
    });

    // Qué pared tiene el FOCO del teclado. Hace falta guardarlo porque el
    // `outline` del navegador aquí NO se puede usar: sobre un elemento de un SVG
    // escalado, Chrome lo dibuja en unidades de USUARIO, y como aquí la unidad
    // es el METRO, la regla global de la app (`outline: auto 5px`) sale como una
    // mancha naranja de CINCO METROS encima del plano. Se apaga y se marca el
    // foco con el mismo halo que la selección, que sí está en metros a propósito.
    const [foco, setFoco] = useState(null);
    //: La barra espaciadora, para mover el plano sin salir del modo de dibujo.
    //: Va por `ref` y no por estado: se consulta dentro del `pointerdown` y no
    //: tiene que repintar nada. `pulsada` sí es estado, solo para el cursor y
    //: para decirlo en la pista de abajo.
    const espacio = useRef(false);
    const [espacioPulsado, setEspacioPulsado] = useState(false);
    //: Dibujando una pared nueva. Es un MODO y no un gesto suelto a propósito:
    //: arrastrar sobre el plano ya significa moverlo, y no puede significar dos
    //: cosas según dónde se empiece.
    const [dibujando, setDibujando] = useState(false);
    const [trazo, setTrazo] = useState(null);
    //: El último trazo se quedó en nada (demasiado corto). Se dice en la barra
    //: en vez de dejar que desaparezca sin más.
    const [corto, setCorto] = useState(false);

    //: La barra espaciadora solo se escucha mientras se está DIBUJANDO: fuera
    //: de ese modo, arrastrar ya mueve el plano y robarle el espacio a la
    //: página no tendría sentido.
    useEffect(() => {
        if (!dibujando && !dibujarCubierta) { espacio.current = false; setEspacioPulsado(false); return undefined; }
        const abajo = (e) => {
            if (e.code !== 'Space' || e.repeat) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            e.preventDefault();
            espacio.current = true; setEspacioPulsado(true);
        };
        const arriba = (e) => {
            if (e.code !== 'Space') return;
            espacio.current = false; setEspacioPulsado(false);
        };
        window.addEventListener('keydown', abajo);
        window.addEventListener('keyup', arriba);
        return () => { window.removeEventListener('keydown', abajo);
                       window.removeEventListener('keyup', arriba); };
    }, [dibujando, dibujarCubierta]);
    //: El polígono de la CUBIERTA que se está dibujando: sus vértices, y dónde
    //: está el ratón para la goma elástica hasta el siguiente. Es un MODO igual
    //: que la pared nueva —un clic sobre el plano no puede significar dos
    //: cosas—, pero aquí el gesto es PULSAR vértice a vértice, no arrastrar:
    //: arrastrar sigue moviendo el plano, que hace falta para llegar a la otra
    //: esquina del tejado.
    const [vertices, setVertices] = useState([]);
    const [cursor, setCursor] = useState(null);
    // Salir del modo (desde el panel, o al cerrar) tira lo que hubiera a
    // medias, y Esc cancela desde el teclado: es lo que uno prueba primero.
    useEffect(() => {
        if (dibujarCubierta) return undefined;
        setVertices([]); setCursor(null);
        return undefined;
    }, [dibujarCubierta]);
    useEffect(() => {
        if (!dibujarCubierta) return undefined;
        const esc = (e) => { if (e.key === 'Escape') { setVertices([]); onCubierta?.(null); } };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [dibujarCubierta, onCubierta]);

    /** Cerrar el polígono y entregarlo. Un vértice repetido al final —el
     *  segundo clic de un doble clic— no es un vértice. */
    const cerrarCubierta = () => {
        const limpio = [];
        for (const q of vertices) {
            const u = limpio[limpio.length - 1];
            if (!u || Math.hypot(q[0] - u[0], q[1] - u[1]) > 0.2) limpio.push(q);
        }
        if (limpio.length < 3) return;
        setVertices([]);
        onCubierta?.(limpio);
    };
    const arrastre = useRef(null);
    // El asa de hueco que acaba de recibir el `pointerdown`. Va por `ref` y no
    // por estado porque el `pointerdown` del asa y el del SVG son el MISMO
    // evento: el hijo lo ve primero y lo deja aquí, y el padre —que es quien
    // lleva el arrastre— lo recoge en la misma vuelta.
    const asaPulsada = useRef(null);

    //: El IMÁN, sobre las paredes de ESTA planta. Un extremo suelto en medio de
    //: la nada deja un plano que no cierra, y una pared que no llega a ninguna
    //: parte no es una pared: es una raya.
    /**
     * El IMÁN. `desde` es el otro extremo del muro que se está dibujando: si
     * pegar dejaría la pared por debajo del mínimo, NO se pega y el punto se
     * queda donde se ha soltado.
     *
     * Sin eso, un tabique corto contra una pared larga era imposible: los dos
     * extremos se pegaban al mismo sitio y el trazo se descartaba en silencio.
     */
    const pegar = (x, y, salvo, desde = null) => {
        const q = pegarAPared(murosDe(planta), x, y, iman, salvo);
        if (!q) return { x, y, id: null };
        if (desde && Math.hypot(q.x - desde.x, q.y - desde.y) < LARGO_MINIMO_PARED * 1.6) {
            return { x, y, id: null };
        }
        return q;
    };
    // Un arrastre NO es una pulsación: sin esto, mover el plano cambia de pared
    // cada vez que el ratón se suelta encima de una.
    const arrastrado = useRef(false);
    const [tip, setTip] = useState(null);

    const hacia = useMemo(
        () => centroide(capas.flatMap(p => murosDe(p).flatMap(m => m.svg || []))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [capas, muros]);

    //: Los gestos son los de un programa de arquitectura, porque quien mira esto
    //: los tiene ya en los dedos. AutoCAD, Revit y Blender coinciden en el botón
    //: CENTRAL para mover y en MAYÚS + central para girar, así que eso se
    //: respeta tal cual. En lo que no coinciden es en el botón izquierdo, y aquí
    //: GIRA: en 3D lo que se viene a hacer es mirar el edificio por el otro
    //: lado, no moverlo de sitio. En 2D sigue moviendo, como hasta ahora.
    const gestoDe = (e) => {
        if (!es3d) return 'mover';
        return (e.button === 1) === !!e.shiftKey ? 'girar' : 'mover';
    };

    const girar = (d, e) => setCamara({
        // Se gira agarrando el edificio: lo que está debajo del ratón sigue al
        // ratón. Arrastrando a la derecha, la esquina de delante se va a la
        // derecha —y por eso el acimut BAJA—; arrastrando hacia abajo, esa
        // esquina cae y aparece la cubierta.
        az: d.cam.az - (e.clientX - d.x0) * GIRO.az,
        alt: Math.min(TOPE_ALT.max, Math.max(TOPE_ALT.min,
             d.cam.alt + (e.clientY - d.y0) * GIRO.alt)),
    });

    /** Arrastrar un hueco es moverlo A LO LARGO de su pared: se proyecta lo que
     *  ha avanzado el ratón sobre el eje del muro y sale el tanto por uno. */
    const moverHueco = (d, e) => {
        const p = aDibujo(e.clientX, e.clientY, d.vb);
        const t = ((p.x - d.x) * d.ejeX + (p.y - d.y) * d.ejeY) / d.len2;
        // Un hueco no puede salirse de su pared: el tope es su propio medio
        // ancho, o el muro quedaría con media ventana en el aire.
        const margen = Math.min(0.48, (d.ancho / 2 + 0.1) / (d.L || 1));
        mueveHueco(d.id, d.i,
                   Math.max(margen, Math.min(1 - margen, d.pos + t)));
    };

    /** Arrastrar un TIRADOR: un extremo se lleva solo ese punto; el del medio,
     *  la pared entera. Los extremos se pegan a la pared más cercana. */
    const moverPared = (d, e) => {
        const p = aDibujo(e.clientX, e.clientY, d.vb);
        const dx = p.x - d.x, dy = p.y - d.y;
        const pts = d.pts.map((q, i) => {
            if (d.punto != null && i !== d.punto) return [q[0], q[1]];
            const q2 = pegar(q[0] + dx, q[1] + dy, d.id);
            return [q2.x, q2.y];
        });
        muevePared(d.id, pts);
    };

    const onDown = (e) => {
        const asa = asaPulsada.current;
        asaPulsada.current = null;
        // Dibujar la parte de la CUBIERTA que se reforma: un clic (sin
        // arrastrar) pone un vértice; arrastrar sigue moviendo el plano.
        if (dibujarCubierta && !es3d && e.button === 0) {
            arrastre.current = { gesto: 'vertice', cam: camara,
                                 ...aDibujo(e.clientX, e.clientY), vb: vista,
                                 x0: e.clientX, y0: e.clientY, movido: false };
            return;
        }
        // Con la BARRA ESPACIADORA pulsada, el plano se mueve aunque se esté
        // dibujando: en modo dibujo el botón izquierdo traza, así que sin esto
        // la única forma de llegar a otra parte del plano era alejarse con la
        // rueda y volver — que es justo lo que hace que dibujar «cueste».
        if ((dibujando || dibujarCubierta) && espacio.current && e.button === 0) {
            arrastre.current = { gesto: 'mover', cam: camara,
                                 ...aDibujo(e.clientX, e.clientY), vb: vista,
                                 x0: e.clientX, y0: e.clientY, movido: false };
            return;
        }
        // Dibujar una pared nueva: se empieza donde se pulse, pegado a la pared
        // más cercana — «de pared a pared» es lo que la hace medible.
        if (dibujando && e.button === 0) {
            const p = aDibujo(e.clientX, e.clientY);
            const a0 = pegar(p.x, p.y, null);
            arrastre.current = { gesto: 'nueva', a: a0, vb: vista,
                                 x0: e.clientX, y0: e.clientY, movido: false };
            setTrazo({ a: a0, b: a0 });
            svgRef.current?.setPointerCapture?.(e.pointerId);
            return;
        }
        if (e.button !== undefined && e.button !== 0 && e.button !== 1) return;
        // El botón central abre el desplazamiento automático de Windows y deja
        // una diana pegada al puntero encima del plano.
        if (e.button === 1) e.preventDefault();
        if (asa && e.button === 0 && asa.tipo === 'pared') {
            arrastre.current = { gesto: 'pared', ...asa,
                                 ...aDibujo(e.clientX, e.clientY), vb: vista,
                                 x0: e.clientX, y0: e.clientY, movido: false };
            return;
        }
        if (asa && e.button === 0) {
            arrastre.current = { gesto: 'hueco', ...asa,
                                 ...aDibujo(e.clientX, e.clientY), vb: vista,
                                 x0: e.clientX, y0: e.clientY, movido: false };
            return;
        }
        arrastre.current = { gesto: gestoDe(e), cam: camara,
                             ...aDibujo(e.clientX, e.clientY), vb: vista,
                             x0: e.clientX, y0: e.clientY, movido: false };
    };
    const onMove = (e) => {
        if (dibujarCubierta && !es3d) setCursor(aDibujo(e.clientX, e.clientY));
        const d = arrastre.current;
        if (!d) return;
        // El puntero se CAPTURA al empezar a mover de verdad, nunca al pulsar:
        // con la captura puesta, el navegador dispara el `click` sobre el
        // elemento que captura —el SVG— y no sobre la pared, así que pulsar una
        // pared dejaba de seleccionarla. Capturando solo al arrastrar, se
        // conserva el paneo aunque el ratón se salga del plano.
        if (!d.movido && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) {
            d.movido = true;
            svgRef.current?.setPointerCapture?.(e.pointerId);
        }
        if (d.gesto === 'nueva') {
            const p = aDibujo(e.clientX, e.clientY, d.vb);
            setTrazo({ a: d.a, b: pegar(p.x, p.y, null, d.a) });
            return;
        }
        if (d.gesto === 'pared') { moverPared(d, e); return; }
        if (d.gesto === 'hueco') { moverHueco(d, e); return; }
        if (d.gesto === 'girar') { girar(d, e); return; }
        // `vertice` sin soltar es un arrastre: mueve el plano como siempre.
        const p = aDibujo(e.clientX, e.clientY, d.vb);
        setVb({ x: d.vb.x - (p.x - d.x), y: d.vb.y - (p.y - d.y),
                ancho: d.vb.ancho, alto: d.vb.alto });
    };
    const onUp = (e) => {
        if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
            svgRef.current.releasePointerCapture(e.pointerId);
        }
        const d = arrastre.current;
        arrastre.current = null;
        if (d?.gesto === 'vertice') {
            if (d.movido) {
                arrastrado.current = true;
                setTimeout(() => { arrastrado.current = false; }, 0);
                return;
            }
            const p = aDibujo(e.clientX, e.clientY);
            const primero = vertices[0];
            // Pulsar el PRIMER vértice cierra el polígono: es el gesto de
            // cualquier programa de dibujo, y no hace falta explicarlo.
            if (primero && vertices.length >= 3
                && Math.hypot(p.x - primero[0], p.y - primero[1]) < 0.6) {
                cerrarCubierta();
            } else {
                setVertices(v => [...v, [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]]);
            }
            arrastrado.current = true;
            setTimeout(() => { arrastrado.current = false; }, 0);
            return;
        }
        if (d?.gesto === 'nueva') {
            const t = trazo;
            setTrazo(null);
            // Una pared de dos centímetros es un resbalón, no una pared: lo
            // decide `dibujaPared`, que es quien la da de alta. Si no ha salido,
            // NO se sale del modo y se dice por qué: antes el trazo desaparecía
            // sin explicación y había que volver a pulsar «Pared nueva» a
            // ciegas — que es justo lo que hace que dibujar «cueste».
            const id = t ? dibujaPared(planta.id, [t.a.x, t.a.y], [t.b.x, t.b.y]) : null;
            if (id) { setDibujando(false); setCorto(false); } else setCorto(true);
            arrastrado.current = true;
            setTimeout(() => { arrastrado.current = false; }, 0);
            return;
        }
        // El `click` llega DESPUÉS del `pointerup`, así que la marca se suelta
        // en el siguiente tick — si no, no habría dónde consultarla.
        if (d?.movido) {
            arrastrado.current = true;
            setTimeout(() => { arrastrado.current = false; }, 0);
        }
    };
    const pulsar = (id) => { if (!arrastrado.current) elegir(id); };
    /** Lo que hay bajo el ratón: una pared, o un hueco de esa pared. */
    const enPared = (m, hueco = null) => (e) => {
        const r = cajaRef.current?.getBoundingClientRect();
        if (!r) return;
        // La caja viaja con la posición porque el globo tiene que poder
        // VOLTEARSE: el plano lleva `overflow:hidden`, así que pegado al borde
        // de abajo se corta justo por la línea que dice lo que falta.
        setTip({ id: m.id, h: hueco, x: e.clientX - r.left, y: e.clientY - r.top,
                 ancho: r.width, alto: r.height });
    };

    //: Los cuerpos que hay en ESTA planta. Un cuerpo de Catastro es un prisma:
    //: su contorno es el mismo en todas sus plantas, y `niveles` dice en cuáles
    //: está (el garaje de una planta no se pinta sobre la primera).
    //
    //: ⚠ Va ARRIBA, por encima del `return` de «esta planta no tiene plano».
    //: Debajo, una planta que llega sin medidas y las recibe después cambia el
    //: número de hooks entre dos renders, y React corta con el error #310 — la
    //: ventana entera en blanco. Ningún hook por debajo de un `return`.
    //: Y si CUENTA o no se decide TAMBIÉN por planta: `niveles_fuera` dice en
    //: cuáles sobra. Un garaje con vivienda encima sale de la baja y en la
    //: primera sigue siendo la casa — pintarlo ahí como «NO CUENTA» es lo que
    //: llevó a apartar una fachada de verdad.
    const cuerposAqui = useMemo(
        () => (es3d ? [] : cuerposDeLaPlanta(cuerpos, planta?.nivel)),
        [cuerpos, planta?.nivel, es3d]);

    // ── lo que se dibuja ─────────────────────────────────────────────────────
    if (!es3d && (!(ancho > 0) || !(alto > 0))) return <SinPlano planta={planta} />;

    const capa2d = es3d ? [] : murosDe(planta);

    const rotulos = es3d ? [] : colocarRotulos(capa2d, { sel, entrada, tam, entorno, nombreDe });
    const caras = es3d
        ? construirCaras({ capas, murosDe, alturaPlanta, sel, colorDe, estadoDe, proy })
        : [];

    //: «Encuadrar» es volver a la vista de partida, y en 3D eso incluye el
    //: giro: tras dar tres vueltas al edificio, lo que se busca al pulsarlo es
    //: la isométrica de siempre, no el mismo revoltijo pero centrado.
    const encuadrar = () => { setVb(null); setCamara(CAMARA_ISO); };
    const puedeAlejar = !!plano.entorno && !es3d;
    const hover = tip ? muros[tip.id] : null;

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <Controles
                titulo={es3d && capas.length > 1
                    ? `EDIFICIO · ${capas.length} PLANTAS`
                    : planta.nombre}
                subtitulo={es3d && capas.length > 1
                    ? capas.map(p => p.nombre).join(' · ')
                    : (planta.superficie ? `${fmt(planta.superficie)} m²`
                                         : 'fuera de la envolvente')}
                es3d={es3d}
                dibujando={dibujando}
                onDibujar={d => { setDibujando(d); setTrazo(null); setCorto(false); }}
                corto={corto}
                onGirar={g => setCamara(c => ({ ...c, az: c.az + g }))}
                onZoom={f => escalar(f)} onEncuadrar={encuadrar}
                puedeAlejar={puedeAlejar} entorno={entorno} onEntorno={onEntorno}
                catastro={quiereCatastro} onCatastro={onCatastro}
                trayendoCatastro={trayendoCatastro} falloCatastro={falloCatastro} />

            {/* LA CUBIERTA de esta planta. Va aquí —bajo la barra de SU plano y
                encima del dibujo— porque se marca dibujándola: el mando tiene
                que estar donde está el gesto. En 3D no: ahí no se dibuja. */}
            {!es3d && onCubiertaModo && (
                <CubiertaControl reforma={cubierta} dibujando={dibujarCubierta}
                                 vertices={vertices}
                                 onDibujar={() => onCubiertaModo(true)}
                                 onEntera={onCubiertaEntera} onQuitar={onCubiertaQuitar}
                                 onCerrar={cerrarCubierta}
                                 onCancelar={() => { setVertices([]); onCubierta?.(null); }} />
            )}

            {/* `position:relative` porque el globo del ratón va colgado del
                contenedor y no del SVG: dentro del SVG habría que colocarlo en
                metros y se deformaría con el zoom. */}
            <div ref={cajaRef}
                 className="relative overflow-hidden rounded-xl border border-white/[0.05]"
                 style={{ background: PAPEL }}>
                {/* `select-none`: sin él, arrastrar sobre el plano selecciona
                    los rótulos de las paredes y el dibujo se queda con media
                    planta en azul de selección. */}
                <svg ref={svgRef}
                     viewBox={`${vista.x} ${vista.y} ${vista.ancho} ${vista.alto}`}
                     className={`block w-full select-none
                                 ${espacioPulsado ? 'cursor-grab'
                                   : es3d ? 'cursor-grab' : 'cursor-crosshair'}`}
                     style={{ touchAction: 'none', height: 'clamp(360px, 68vh, 900px)' }}
                     onPointerDown={onDown} onPointerMove={onMove}
                     onPointerUp={onUp} onPointerCancel={onUp}
                     onDoubleClick={() => { if (dibujarCubierta) cerrarCubierta(); }}
                     onPointerLeave={() => { arrastre.current = null; setTip(null); setCursor(null); }}>
                    <defs>
                        {/* La trama de lo que SE REFORMA: ámbar y más abierta que
                            la de los muros, para que se lea como una marca sobre
                            el tejado y no como un cerramiento más. */}
                        <pattern id={`hatch-cambia-${uid}`} width="0.7" height="0.7"
                                 patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                            <line x1="0" y1="0" x2="0" y2="0.7" stroke="var(--warning)"
                                  strokeWidth="0.12" opacity="0.55" />
                        </pattern>
                        <pattern id={`grid-${uid}`} width="1" height="1"
                                 patternUnits="userSpaceOnUse">
                            <path d="M 1 0 L 0 0 0 1" fill="none"
                                  stroke="var(--border-subtle)" strokeWidth="0.03" />
                        </pattern>
                        {Object.entries(COLOR_TRAMA).map(([clave, color]) => (
                            <pattern key={clave} id={`hatch-${clave}-${uid}`}
                                     width="0.5" height="0.5"
                                     patternUnits="userSpaceOnUse"
                                     patternTransform="rotate(45)">
                                <line x1="0" y1="0" x2="0" y2="0.5" stroke={color}
                                      strokeWidth="0.1" opacity="0.5" />
                            </pattern>
                        ))}
                    </defs>

                    {/* La cartografía del Catastro, DEBAJO de todo y en su sitio
                        exacto: el motor dice en qué rectángulo del mundo dibujó
                        y al WMS se le pide ese mismo, así que encaja sin ajustar
                        nada. Es lo que convierte «esta pared da al vecino, me
                        fío de Catastro» en «lo estoy viendo».

                        En 3D no: ahí el suelo no es el plano de la parcela.

                        El filtro es el truco de siempre con los mapas claros
                        sobre fondo oscuro —invertir y girar el tono 180°— para
                        que el papel blanco se vuelva negro sin que los colores
                        de Catastro se vuelvan sus complementarios. En tema claro
                        no hace falta, y por eso vive en `index.css` y no aquí:
                        mirando la clase del tema en JS se calcula UNA vez y al
                        cambiar de tema el plano se quedaba invertido sobre papel
                        blanco. */}
                    {!es3d && catastro?.imagen && (
                        <image href={`data:${catastro.tipo || 'image/png'};base64,${catastro.imagen}`}
                               x={catastro.en_el_lienzo.x} y={catastro.en_el_lienzo.y}
                               width={catastro.en_el_lienzo.ancho}
                               height={catastro.en_el_lienzo.alto}
                               preserveAspectRatio="none" opacity={0.38}
                               className="plano-catastro"
                               style={{ pointerEvents: 'none' }} />
                    )}

                    {/* La retícula de un metro: da la escala sin tener que
                        acotar cada pared. Se pinta tres veces el encuadre para
                        que siga ahí al arrastrar. */}
                    <rect x={vista.x - vista.ancho} y={vista.y - vista.alto}
                          width={vista.ancho * 3} height={vista.alto * 3}
                          fill={`url(#grid-${uid})`} />

                    {!es3d && <Contexto contexto={plano.contexto} />}

                    {/* Los CUERPOS del edificio, DEBAJO de los muros: se pinta
                        primero porque en un SVG manda el último, y las paredes
                        tienen que seguir siendo lo que se pulsa. Aquí solo se
                        recoge lo que pasa POR DENTRO del cuerpo, que hoy no
                        hacía nada.

                        No en 3D: allí el volumen ya son las caras, y un relleno
                        más encima solo taparía las paredes del fondo. */}
                    {!es3d && !dibujando && (
                        <Cuerpos cuerpos={cuerposAqui} sobre={cuerpoSobre} tam={tam}
                                 onSobre={setCuerpoSobre}
                                 onPulsar={(id) => { if (!arrastrado.current) onCuerpo?.(id); }} />
                    )}

                    {es3d ? (
                        <>
                            <Suelo contexto={plano.contexto} proy={proy} />
                            {caras.map(f => (
                                <path key={f.key} d={f.d} fill={f.fill} stroke={f.stroke}
                                      strokeWidth={0.05} strokeLinejoin="round"
                                      opacity={f.op}
                                      className={f.asa ? 'cursor-grab' : 'cursor-pointer'}
                                      onClick={() => pulsar(f.id)}
                                      onPointerDown={f.asa
                                          ? () => { asaPulsada.current = f.asa; }
                                          : undefined}
                                      onPointerMove={enPared(muros[f.id] || { id: f.id },
                                                             f.asa ? f.asa.i : null)} />
                            ))}
                            {etiquetasPlanta(capas, murosDe, alturaPlanta, proy).map(r => (
                                <text key={r.texto} x={r.x} y={r.y} fontSize={tam * 0.9}
                                      fontWeight={800} fill="var(--text-secondary)"
                                      style={{ pointerEvents: 'none', letterSpacing: '0.06em' }}>
                                    {r.texto}
                                </text>
                            ))}
                        </>
                    ) : (
                        <>
                            {capa2d.map(m => (
                                <Muro key={m.id} m={m} uid={uid}
                                      grosor={grosorDe(m)} color={colorDe(m)}
                                      trama={tramaDe(m)} estado={estadoDe(m)}
                                      seleccionada={m.id === sel}
                                      candidata={!entrada && esCandidata(m)}
                                      enfocada={m.id === foco}
                                      entrada={m.id === entrada}
                                      cambia={!!m.cambia} />
                            ))}

                            {/* Los HUECOS, encima del muro: la ventana lo abre. */}
                            <g style={{ pointerEvents: 'none' }}>
                                {capa2d.flatMap(m => dibujaHuecos(m, grosorDe(m)))}
                            </g>

                            <Cotas muros={capa2d} sel={sel} hacia={hacia} tam={tam}
                                   interior={esInterior} entorno={entorno}
                                   fuera={m => estadoDe(m) === 'fuera'} />

                            {/* La parte de la CUBIERTA que se reforma: la ya
                                dibujada, con su trama y su m², y la que se está
                                dibujando con la goma elástica hasta el ratón. */}
                            <Cubierta reforma={cubierta} vertices={vertices}
                                      cursor={dibujarCubierta ? cursor : null}
                                      uid={uid} tam={tam} />

                            {rotulos.map(r => (
                                <g key={r.id} style={{ pointerEvents: 'none' }}>
                                    {/* El papel se ajusta al TEXTO. Era ancho fijo
                                        (3,4 em, o sea cuatro caracteres) y un
                                        nombre puesto a mano se salía por los dos
                                        lados y se montaba sobre el de al lado. */}
                                    <rect x={r.x - r.ancho / 2} y={r.y - tam * 0.96}
                                          width={r.ancho} height={tam * 1.32}
                                          rx={tam * 0.18} fill={PAPEL} opacity={0.88} />
                                    <text x={r.x} y={r.y} fontSize={tam} fontWeight={800}
                                          textAnchor="middle"
                                          fill={r.destacado ? 'var(--text-primary)'
                                                            : 'var(--text-secondary)'}>
                                        {r.texto}
                                    </text>
                                    {/* Una raya del color del TIPO bajo el nombre:
                                        con la cartografía debajo, el trazo del
                                        muro se pierde y el rótulo era lo único
                                        que se leía — y no decía qué era. */}
                                    <rect x={r.x - r.ancho / 2 + tam * 0.18} y={r.y + tam * 0.16}
                                          width={r.ancho - tam * 0.36} height={tam * 0.12}
                                          rx={tam * 0.06}
                                          fill={muros[r.id] ? colorDe(muros[r.id]) : GRIS}
                                          opacity={0.95} />
                                </g>
                            ))}

                            {/* La ZONA DE PULSACIÓN va la ÚLTIMA y es ancha
                                (0,9 m): con el dedo en una tablet, apuntar a un
                                trazo de 0,34 m es imposible. */}
                            <g>
                                {capa2d.map(m => (
                                    <polyline
                                        key={m.id} points={recorrido(m.svg)} fill="none"
                                        stroke="transparent" strokeWidth={0.9}
                                        strokeLinecap="round" strokeLinejoin="round"
                                        className="cursor-pointer"
                                        style={{ outline: 'none' }}
                                        role="button" tabIndex={0}
                                        onFocus={() => setFoco(m.id)}
                                        onBlur={() => setFoco(null)}
                                        aria-label={`${nombreDe(m)}, ${etiquetaTipo(tipoEfectivo(m))}`
                                                    + `, ${m.orientacion}, ${fmt(m.largo)} metros`}
                                        onClick={() => pulsar(m.id)}
                                        onPointerMove={enPared(m)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault(); elegir(m.id);
                                            }
                                        }} />
                                ))}
                            </g>

                            {/* Las ASAS de los huecos, encima de la zona de
                                pulsación del muro: si fueran debajo, el
                                arrastre se lo quedaría el plano y la ventana no
                                se movería. Son más altas que el muro porque hay
                                que poder cogerlas con el dedo. */}
                            <g>
                                {capa2d.flatMap(m => colocaHuecos(m).map(c => (
                                    <rect key={`${m.id}-asa${c.i}`}
                                          transform={`translate(${c.p.x} ${c.p.y})`
                                                     + ` rotate(${c.p.ang})`}
                                          x={-c.ancho / 2} y={-asa / 2}
                                          width={c.ancho} height={asa}
                                          fill="transparent" className="cursor-grab"
                                          onPointerDown={() => {
                                              asaPulsada.current = {
                                                  id: m.id, i: c.i, pos: c.pos,
                                                  ancho: c.ancho, L: c.L,
                                                  ...ejeProyectado(m.svg, 0, null),
                                              };
                                          }}
                                          onPointerMove={enPared(m, c.i)}
                                          onClick={() => pulsar(m.id)} />
                                )))}
                            </g>

                            {/* Los TIRADORES de la pared seleccionada, y solo
                                de ella: si cualquier pared se arrastrara sin
                                más, mover el plano con el puntero encima de una
                                la movería sin querer — y eso cambia una
                                superficie que acaba en el certificado. */}
                            <Tiradores muro={capa2d.find(m => m.id === sel)} r={tirador}
                                       onCoger={(a) => { asaPulsada.current = a; }} />

                            {/* La pared que se está dibujando, con su medida a
                                la vista: sin el número, dibujar a ojo es lo
                                mismo que teclear a ojo. */}
                            {trazo && <Trazo trazo={trazo} tam={tam} />}
                        </>
                    )}
                </svg>

                {es3d && (
                    <Brujula proy={proy}
                             onNorte={() => setCamara(c => ({ ...c, az: 0 }))} />
                )}

                {/* Bajo el ratón puede haber una pared o un HUECO de esa
                    pared, y lo que se pregunta no es lo mismo: de la pared, qué
                    es y si le queda algo; del hueco, cuál es y cuánto mide —
                    más que se puede arrastrar, que si no nadie lo prueba. */}
                {hover && (tip.h != null && (hover.huecos || [])[tip.h] ? (
                    <GloboHueco h={hover.huecos[tip.h]} pared={nombreDe(hover)} tip={tip} />
                ) : (
                    <Globo m={hover} tip={tip}
                           clase={estadoDe(hover) === 'falta' ? 'text-white/45'
                               : CLASE_TIPO[tipoEfectivo(hover)] || 'text-white/45'}
                           tipo={etiquetaTipo(tipoEfectivo(hover))}
                           estado={estadoDe(hover)} />
                ))}
            </div>

            <Leyenda es3d={es3d} dibujando={dibujando} dibujandoCubierta={dibujarCubierta && !es3d} />
        </div>
    );
}

/** La cabecera del plano: qué se está viendo, y los mandos para verlo. */
function Controles({ titulo, subtitulo, es3d, onGirar, dibujando, onDibujar, corto,
                     onZoom, onEncuadrar, puedeAlejar, entorno, onEntorno,
                     catastro, onCatastro, trayendoCatastro, falloCatastro }) {
    return (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <b className="text-[13px] font-black tracking-wide">{titulo}</b>
            <span className="text-[11px] tabular-nums text-white/35">{subtitulo}</span>

            {/* El conmutador 2D/3D NO está aquí: es de la PANTALLA, no de esta
                tarjeta —en 3D se funden en un solo dibujo— y repetido en cada
                planta parecía que se podía tener una en planta y otra en
                axonometría. Vive en la barra de arriba, junto al selector de
                plantas, que es la otra mitad de la misma pregunta: qué se ve. */}
            <div className="ml-auto flex items-center gap-1.5">
                {/* Girar de 45 en 45: son las cuatro esquinas del edificio, que
                    es como se mira un modelo cuando no se quiere apuntar con el
                    ratón — y en una tablet es la única forma de girarlo sin
                    perder la pared que se estaba mirando. */}
                {/* Dibujar una pared es un MODO: arrastrar sobre el plano ya
                    significa moverlo, y no puede significar dos cosas según
                    dónde se empiece. Solo en planta — una pared se coloca
                    sobre la cartografía, que es lo que dice dónde está de
                    verdad, y eso es un plano. */}
                {!es3d && onDibujar && (
                    <Boton onClick={() => onDibujar(!dibujando)} activo={dibujando}
                           title="Dibujar una pared nueva: arrastra de una pared a otra.
                                  Para una pared corta, amplía antes con la rueda: los
                                  tiradores no crecen con el zoom.">
                        {dibujando ? (corto ? '✎ Muy corta · vuelve a intentarlo'
                                            : '✎ Suelta de pared a pared')
                                   : '✎ Pared nueva'}
                    </Boton>
                )}
                {es3d && onGirar && (
                    <>
                        <Boton onClick={() => onGirar(45)}
                               title="Girar el edificio a la izquierda (45°)" cuadrado>⟲</Boton>
                        <Boton onClick={() => onGirar(-45)}
                               title="Girar el edificio a la derecha (45°)" cuadrado>⟳</Boton>
                    </>
                )}
                <Boton onClick={() => onZoom(ZOOM.boton)} title="Alejar" cuadrado>−</Boton>
                <Boton onClick={() => onZoom(1 / ZOOM.boton)} title="Acercar" cuadrado>+</Boton>
                <Boton onClick={onEncuadrar}
                       title={es3d ? 'Volver a la vista de partida: encuadre y giro'
                                   : 'Volver al encuadre del motor'}>
                    Encuadrar
                </Boton>
                {puedeAlejar && (
                    <Boton onClick={() => onEntorno?.(!entorno)} activo={entorno}
                           title="Ver los edificios de al lado, para comprobar contra qué da cada pared">
                        {entorno ? '⊙ Acercar' : '⊕ Ver el entorno'}
                    </Boton>
                )}
                {onCatastro && (
                    <Boton onClick={() => onCatastro(!catastro)} activo={catastro}
                           title={falloCatastro
                               || 'La cartografía del Catastro debajo del plano, en su sitio exacto'}>
                        {trayendoCatastro ? 'Trayendo…' : falloCatastro ? '▦ Catastro ⚠' : '▦ Catastro'}
                    </Boton>
                )}
            </div>
        </div>
    );
}

function Boton({ onClick, title, activo, cuadrado, children }) {
    return (
        <button onClick={onClick} title={title}
                className={`h-7 rounded-lg border transition-colors
                            ${cuadrado
                                ? 'w-7 text-[15px] font-bold'
                                : 'px-2.5 text-[10px] font-bold uppercase tracking-wider'}
                    ${activo ? 'border-brand/50 bg-brand/15 text-brand'
                             : 'border-white/10 text-white/45 hover:border-white/30 hover:text-white/80'}`}>
            {children}
        </button>
    );
}

/**
 * Un muro, en tres capas sobre la MISMA polilínea.
 *
 * 1. el halo de la seleccionada, por fuera;
 * 2. el borde, del color de su tipo, con el grosor real del muro;
 * 3. la trama a 45°, un pelo más estrecha — y esos 0,05 m que quedan a cada
 *    lado son la orla que hace que se lea como un muro de doble línea.
 *
 * Y encima, si la medida está por confirmar, la línea de puntos ámbar por el
 * eje: el color ya dice QUÉ es la pared, así que el estado necesitaba su propia
 * señal.
 */
function Muro({ m, uid, grosor, color, trama, estado, seleccionada, candidata,
                entrada, enfocada, cambia }) {
    const pts = recorrido(m.svg);
    return (
        <g style={{ pointerEvents: 'none' }}
           className={candidata ? 'animate-pulse' : undefined}>
            {/* Una pared que SE REFORMA lleva una orla ámbar a trazos por
                fuera: en el .cex sale con «- CAMBIA», y eso tiene que verse en
                el plano sin pulsar cada una. */}
            {cambia && estado !== 'fuera' && (
                <polyline points={pts} fill="none" stroke="var(--warning)"
                          strokeWidth={grosor + 0.32} strokeDasharray="0.45 0.3"
                          strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
            )}
            {(seleccionada || candidata || entrada || enfocada) && (
                <polyline points={pts} fill="none" stroke="var(--brand-primary)"
                          strokeWidth={grosor + 0.55}
                          opacity={seleccionada ? 0.3 : enfocada ? 0.45 : 0.22}
                          strokeLinecap="round" strokeLinejoin="round" />
            )}
            {/* Una pared APARTADA se dibuja a trazos y sin trama: sigue ahí
                —hay que poder encontrarla y devolverla— pero no es un muro de
                la envolvente, y un muro macizo dice que sí lo es. */}
            <polyline points={pts} fill="none" stroke={color} strokeWidth={grosor}
                      strokeLinejoin="round"
                      strokeDasharray={estado === 'fuera' ? '0.55 0.4' : undefined}
                      opacity={estado === 'fuera' ? 0.55 : 1} />
            {/* El PAPEL por dentro. Sin esta capa el muro sale macizo: la trama
                se pinta con el mismo color del borde y los huecos del patrón
                dejan ver ese mismo color, así que no se nota. Con ella quedan
                los 0,05 m de orla a cada lado y el muro se lee como la doble
                línea de un plano — y, de paso, la línea de puntos de «medida
                por confirmar» pasa a verse sobre una fachada, que también es
                ámbar. */}
            <polyline points={pts} fill="none" stroke={PAPEL}
                      strokeWidth={Math.max(0.04, grosor - ORLA)} strokeLinejoin="round" />
            {estado !== 'fuera' && (
                <polyline points={pts} fill="none" stroke={`url(#hatch-${trama}-${uid})`}
                          strokeWidth={Math.max(0.04, grosor - ORLA)}
                          strokeLinejoin="round" />
            )}
            {estado === 'dudoso' && (
                <polyline points={pts} fill="none" stroke="var(--warning)"
                          strokeWidth={0.09} strokeDasharray="0.3 0.26" opacity={0.9} />
            )}
        </g>
    );
}

/**
 * Los huecos de un muro, dibujados SOBRE él.
 *
 * El rectángulo del color del papel interrumpe el muro —que es lo que es un
 * hueco en un plano— y encima va el vidrio, o la hoja y su barrido si es puerta.
 *
 * DÓNDE cae cada uno es COSMÉTICO y no viaja al `.cex`: ver `reparto`.
 */
function dibujaHuecos(m, grosor) {
    return colocaHuecos(m).map(({ h, i, p, ancho: a }) => {
        const esPuerta = h.tipo === 'puerta';
        const color = colorHueco(h);
        return (
            <g key={`${m.id}-${i}`} transform={`translate(${p.x} ${p.y}) rotate(${p.ang})`}>
                <rect x={-a / 2} y={-(grosor + 0.06) / 2} width={a} height={grosor + 0.06}
                      fill={PAPEL} />
                {/* Un hueco que SE CAMBIA va recuadrado en ámbar: es el que
                    saldrá como «V1 - CAMBIA». */}
                {h.cambia && (
                    <rect x={-a / 2 - 0.08} y={-(grosor + 0.06) / 2 - 0.08}
                          width={a + 0.16} height={grosor + 0.22} fill="none"
                          stroke="var(--warning)" strokeWidth={0.06} rx={0.05} />
                )}
                <rect x={-a / 2} y={-0.04} width={a} height={0.08} fill={color} />
                {esPuerta && (
                    <path d={`M ${-a / 2} 0 L ${-a / 2} ${-a}`
                             + ` M ${-a / 2} ${-a} A ${a} ${a} 0 0 1 ${a / 2} 0`}
                          fill="none" stroke={color} strokeWidth={0.055} opacity={0.75} />
                )}
            </g>
        );
    });
}

/**
 * Dónde cae cada hueco de un muro: el punto, su ancho y su sitio.
 *
 * Lo comparten el DIBUJO y el ASA que se arrastra, que es lo que garantiza que
 * se agarre exactamente lo que se ve. Un ancho mayor que la pared se recorta:
 * un hueco de cuatro metros en un paño de tres saldría fuera del muro.
 */
function colocaHuecos(m) {
    const L = largo(m.svg);
    if (!L) return [];
    return reparto(m.huecos).map(({ hueco: h, pos, i }) => ({
        h, i, pos, L,
        p: at(m.svg, L * pos),
        ancho: Math.min(Number(h.ancho) || 0.9, L * 0.9),
    }));
}

/**
 * Las cotas de los muros exteriores.
 *
 * Solo los RECTOS: un muro quebrado tiene dos medidas y una sola cota mentiría.
 * Y solo los que pasan de dos metros, más el seleccionado SIEMPRE: en una casa
 * con retranqueos, acotar paños de medio metro llena el plano de números que se
 * pisan y tapan los que se venían a leer.
 */
function Cotas({ muros, sel, hacia, tam, interior, entorno, fuera }) {
    const lista = muros
        .filter(m => (m.svg || []).length === 2)
        // Lo APARTADO no se acota: su medida no va a ninguna parte.
        .filter(m => m.id === sel || !fuera(m))
        // Con el entorno a la vista la casa ocupa un tercio del dibujo y las
        // cotas se le meten dentro: ahí se viene a mirar CONTRA QUÉ da cada
        // pared, no cuánto mide. Se queda la de la seleccionada, que es la que
        // se está trabajando — mismo criterio que los rótulos.
        .filter(m => m.id === sel || (!entorno && !interior(m) && largo(m.svg) >= 2))
        .map(m => ({ id: m.id, c: cota(m.svg, { hacia, apartar: interior(m) ? 0.95 : 1.35 }) }))
        .filter(x => x.c);

    return (
        <g style={{ pointerEvents: 'none' }}>
            {lista.map(({ id, c }) => (
                <g key={id}>
                    <path d={c.d} fill="none" stroke="var(--text-muted)" strokeWidth={0.045} />
                    {/* Papel detrás de la cifra: sobre la cartografía del
                        Catastro, «13,30 m» caía encima de los números de las
                        parcelas y no se leía ninguno de los dos. */}
                    <rect transform={c.tr}
                          x={-(String(c.texto).length * 0.5 * tam * 0.8) / 2 - tam * 0.12}
                          y={-tam * 0.72}
                          width={String(c.texto).length * 0.5 * tam * 0.8 + tam * 0.24}
                          height={tam * 0.92} rx={tam * 0.12}
                          fill={PAPEL} opacity={0.8} />
                    <text transform={c.tr} fontSize={tam * 0.8} fontWeight={600}
                          textAnchor="middle" fill="var(--text-secondary)">
                        {c.texto}
                    </text>
                </g>
            ))}
        </g>
    );
}

/**
 * Lo que hay alrededor: los edificios colindantes y la linde de la parcela.
 *
 * POR QUÉ ESTÁ: una medianera lo es por lo que hay AL OTRO LADO. Sin ver el
 * edificio de al lado, el certificador no puede comprobar lo único que la
 * vista le pregunta —si esa pared da a la calle, a un patio o al vecino— y
 * tiene que fiarse de cómo lo haya clasificado Catastro.
 *
 * Se dibuja DEBAJO de las paredes y sin eventos: es para situar, no para
 * pulsar. Lo que se salga del lienzo lo recorta el SVG, igual que el visor de
 * Catastro recorta la manzana.
 */
/**
 * Los CUERPOS del edificio: la casa, el garaje adosado, el porche.
 *
 * POR QUÉ EXISTE: la envolvente de un certificado es la de la VIVIENDA. Catastro
 * dibuja el edificio en partes y dice de qué es cada una, pero el plano se arma
 * por NIVEL —la planta baja tiene vivienda, luego se dibuja entera—, así que las
 * paredes del aparcamiento entraban igual y había que apartarlas una a una,
 * acertando con cuáles eran las suyas.
 *
 * REGLA — el cuerpo se SOMBREA al pasar por encima y no antes. Un relleno
 * permanente sobre un plano que ya lleva la cartografía del Catastro debajo,
 * los colindantes y la trama de cada muro es una capa más de ruido justo donde
 * hay que leer paredes. Lo que sí se marca siempre es lo EXCEPCIONAL: el cuerpo
 * que ya está fuera (para poder volver a meterlo) y el que Catastro dice que no
 * es vivienda (para poder sacarlo).
 */
//: El centro de la CAJA de un contorno, que es donde va su rótulo. `centro()`
//: —el que ya está importado— es el punto medio del RECORRIDO de una polilínea,
//: y en un contorno cerrado eso cae pegado a un lado.
const medio = (pts) => {
    const c = caja(pts, 0);
    return { x: c.x + c.ancho / 2, y: c.y + c.alto / 2 };
};

function Cuerpos({ cuerpos, sobre, onSobre, onPulsar, tam }) {
    return (
        <g>
            {cuerpos.map((c) => {
                const activo = sobre === c.id;
                //: Catastro dice que ahí no se vive: un aparcamiento, un porche,
                //: un almacén. Se marca a trazos para que se vea sin pulsar
                //: nada, que es lo que convierte esto en una propuesta.
                //:
                //: Las dos marcas son DE ESTA PLANTA (`fueraAqui`,
                //: `sospechosoAqui`): el mismo cuerpo puede sobrar abajo y ser
                //: la vivienda arriba.
                const fuera = c.fueraAqui;
                const sospechoso = c.sospechosoAqui;
                const color = fuera ? 'var(--text-secondary)'
                    : sospechoso ? 'var(--warning)' : 'var(--brand-primary)';
                return (
                    <g key={c.id} className="cursor-pointer"
                       onPointerEnter={() => onSobre?.(c.id)}
                       onPointerLeave={() => onSobre?.(s => (s === c.id ? null : s))}
                       onClick={() => onPulsar?.(c.id)}>
                        {c.contornos.map((pts, i) => (
                            <polygon key={i}
                                     points={pts.map(p => p.join(',')).join(' ')}
                                     fill={color}
                                     fillOpacity={activo ? 0.16 : (fuera ? 0.07 : 0.001)}
                                     stroke={(activo || fuera || sospechoso) ? color : 'none'}
                                     strokeWidth={activo ? 0.14 : 0.09}
                                     strokeDasharray={fuera || sospechoso ? '0.5 0.35' : undefined}
                                     strokeLinejoin="round" />
                        ))}
                        {(fuera || activo) && (
                            <text x={medio(c.contornos[0]).x} y={medio(c.contornos[0]).y}
                                  fontSize={tam * 0.85} fontWeight={900} fill={color}
                                  textAnchor="middle" style={{ pointerEvents: 'none' }}>
                                {fuera ? 'NO CUENTA'
                                    : `${c.construccion?.uso || 'CUERPO'} · ${fmt(c.superficie)} m²`}
                            </text>
                        )}
                    </g>
                );
            })}
        </g>
    );
}

function Contexto({ contexto }) {
    if (!contexto) return null;
    const { vecinos = [], parcelas_vecinas: lindes = [], parcela = [],
            edificio = [] } = contexto;
    return (
        <g style={{ pointerEvents: 'none' }}>
            {lindes.map((anillo, i) => (
                <polygon key={`l${i}`} points={recorrido(anillo)} fill="none"
                         stroke={CONTEXTO.lindeVecina} strokeWidth={1}
                         vectorEffect="non-scaling-stroke" />
            ))}
            {vecinos.map((anillo, i) => (
                <polygon key={`v${i}`} points={recorrido(anillo)}
                         fill={CONTEXTO.vecinoRelleno}
                         stroke={CONTEXTO.vecinoBorde} strokeWidth={1}
                         vectorEffect="non-scaling-stroke" />
            ))}
            {/* La huella de la CASA, apenas insinuada: es lo que hace que las
                paredes se lean como el contorno de algo y no como rayas sueltas. */}
            {edificio.map((anillo, i) => (
                <polygon key={`e${i}`} points={recorrido(anillo)}
                         fill={CONTEXTO.casa} stroke="none" />
            ))}
            {parcela.map((anillo, i) => (
                <polygon key={`p${i}`} points={recorrido(anillo)}
                         fill="none" stroke={CONTEXTO.parcela} strokeWidth={1.5}
                         strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            ))}
        </g>
    );
}

/**
 * El forjado de la planta BAJA en la axonometría.
 *
 * Solo el de la baja: la huella que trae Catastro es la del edificio a ras de
 * suelo, y repetirla debajo de la planta primera declararía una planta que no
 * es la que hay. Las de arriba se leen por sus propios muros.
 */
function Suelo({ contexto, proy }) {
    const anillos = contexto?.edificio || [];
    if (!anillos.length) return null;
    // Un solo `path` con `evenodd`: así los patios salen como agujeros y no
    // como islas rellenas encima del hueco que son.
    const d = anillos
        .map(a => `M ${a.map(([x, y]) => proy(x, y, 0).join(' ')).join(' L ')} Z`)
        .join(' ');
    return <path d={d} fillRule="evenodd" fill={CONTEXTO.vecinoRelleno}
                 stroke={CONTEXTO.vecinoBorde} strokeWidth={0.06}
                 style={{ pointerEvents: 'none' }} />;
}

/**
 * Las caras del 3D, ya ordenadas de atrás hacia delante.
 *
 * Es el algoritmo del pintor: sin profundidad real, lo único que coloca bien
 * las caras es dibujar primero las que están más lejos. Se ordena DENTRO de
 * cada planta y las plantas van de abajo arriba, que es como se apilan.
 *
 * ⚠️ La lejanía NO es `x + y`: eso solo vale para la isométrica de partida, y
 * al girar el edificio las paredes de atrás se pintarían encima de las de
 * delante. Es la profundidad de la CÁMARA — cuánto avanza el punto en la
 * dirección hacia la que se mira—, que es `v` en la proyección: lo mismo que la
 * pantalla usa para bajar el punto, y por eso se saca proyectándolo con la
 * altura a cero.
 */
function construirCaras({ capas, murosDe, alturaPlanta, sel, colorDe, estadoDe, proy }) {
    const salida = [];
    capas.forEach((p, iPlanta) => {
        const z = iPlanta * (alturaPlanta + SEPARACION);
        const lista = [];
        murosDe(p).forEach(m => {
            const color = colorDe(m);
            const estado = estadoDe(m);
            const pts = m.svg || [];
            // Por dónde va cada tramo y a qué distancia: de aquí sale la
            // lejanía de sus huecos (ver abajo).
            const tramos = [];
            let acumulado = 0;
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const prof = (proy(a[0], a[1], 0)[1] + proy(b[0], b[1], 0)[1]) / 2;
                acumulado += Math.hypot(b[0] - a[0], b[1] - a[1]);
                tramos.push({ hasta: acumulado, prof });
                lista.push({
                    key: `${p.id || iPlanta}-${m.id}-${i}`, id: m.id,
                    prof,
                    d: `M ${proy(a[0], a[1], z).join(' ')} L ${proy(b[0], b[1], z).join(' ')}`
                       + ` L ${proy(b[0], b[1], z + alturaPlanta).join(' ')}`
                       + ` L ${proy(a[0], a[1], z + alturaPlanta).join(' ')} Z`,
                    fill: color, stroke: color,
                    op: m.id === sel ? 0.92 : estado === 'falta' ? 0.3 : 0.55,
                });
            }
            // Los huecos, como paños sobre el muro: la ventana a 0,95 m del
            // suelo y la puerta desde el suelo. Es lo que hace reconocible la
            // fachada de un vistazo, y por dónde se entra.
            const L = largo(pts);
            if (!L) return;
            // El eje del muro YA PROYECTADO: es contra lo que se mide el
            // arrastre de un hueco, y sale de aquí porque aquí ya se sabe en
            // qué planta está (su `z`).
            const eje = ejeProyectado(pts, z, proy);
            colocaHuecos(m).forEach(({ h, i, pos, ancho }) => {
                const a = at(pts, Math.max(0, L * pos - ancho / 2));
                const b = at(pts, Math.min(L, L * pos + ancho / 2));
                const esPuerta = h.tipo === 'puerta';
                const z0 = z + (esPuerta ? 0.02 : 0.95);
                const z1 = z + (esPuerta ? 2.1 : 0.95 + (Number(h.alto) || 1.2));
                const color = colorHueco(h);
                // ⚠️ La lejanía de un hueco es la DE SU TRAMO DE MURO, no la
                // suya: un hueco es ese muro abierto, así que tiene que
                // pintarse justo después de él pase lo que pase. Con su propia
                // lejanía, en una pared que se aleja de la pantalla los huecos
                // de la punta lejana salían POR DEBAJO de su propio muro y
                // desaparecían — medido sobre una fachada sur en isométrica:
                // dos de sus tres huecos tapados, y con ellos su asa.
                const tramo = tramos.find(t => L * pos <= t.hasta + 1e-9)
                              || tramos[tramos.length - 1];
                lista.push({
                    key: `${p.id || iPlanta}-${m.id}-h${i}`, id: m.id,
                    prof: (tramo?.prof ?? 0) + 0.01,
                    d: `M ${proy(a.x, a.y, z0).join(' ')} L ${proy(b.x, b.y, z0).join(' ')}`
                       + ` L ${proy(b.x, b.y, z1).join(' ')} L ${proy(a.x, a.y, z1).join(' ')} Z`,
                    fill: color, stroke: color, op: 0.85,
                    asa: { id: m.id, i, pos, ancho, L, ...eje },
                });
            });
        });
        lista.sort((a, b) => a.prof - b.prof).forEach(f => salida.push(f));
    });
    return salida;
}

/**
 * Los tiradores de una pared: uno en cada punta y uno en el medio.
 *
 * Las puntas mueven SU extremo; el del medio, la pared entera. Es como se mueve
 * un tabique en cualquier programa de arquitectura, y sobre todo es EXPLÍCITO:
 * hay que seleccionar la pared antes, así que no se puede mover sin querer
 * mientras se arrastra el plano.
 *
 * Una pared APARTADA no lleva tiradores: no cuenta, así que colocarla bien no
 * cambia nada y sería trabajo tirado.
 */
function Tiradores({ muro, onCoger, r = 0.3 }) {
    if (!muro || muro.fuera || muro.excluida) return null;
    const pts = muro.svg || [];
    if (pts.length < 2) return null;
    const medio = centro(pts);
    // Tres tiradores tienen que CABER en la pared. Son tres círculos, así que
    // hacen falta SEIS radios de largo: en un tabique corto, los del tamaño de
    // pantalla se montan unos sobre otros y no hay forma de coger el que se
    // quiere. Ahí mandan los metros de la pared — y al ampliar, ese tope crece
    // en pantalla con ella hasta recuperar el tamaño cómodo.
    const L = largo(pts) || 0;
    const radio = Math.max(0.05, Math.min(r, L / 6.2));
    // ⚠️ NADA de `stopPropagation`: el arrastre lo lleva el SVG, y el tirador
    // solo deja dicho qué se ha cogido. Cortando la propagación, el `pointerdown`
    // no llegaba al padre y la pared no se movía — se veía el tirador, se
    // arrastraba, y no pasaba nada.
    const agarre = (punto) => () => {
        onCoger({ tipo: 'pared', id: muro.id, pts, punto });
    };
    return (
        <g>
            {[0, pts.length - 1].map(i => (
                <circle key={i} cx={pts[i][0]} cy={pts[i][1]} r={radio}
                        fill={PAPEL} stroke="var(--brand-primary)"
                        strokeWidth={radio * 0.3}
                        className="cursor-move" onPointerDown={agarre(i)}>
                    <title>Arrastra este extremo</title>
                </circle>
            ))}
            <circle cx={medio[0]} cy={medio[1]} r={radio * 0.8}
                    fill="var(--brand-primary)" opacity={0.85}
                    className="cursor-move" onPointerDown={agarre(null)}>
                <title>Arrastra la pared entera</title>
            </circle>
        </g>
    );
}

/**
 * La pared que se está dibujando, con su medida a la vista.
 *
 * El número mientras se arrastra no es un adorno: dibujar a ojo sin verlo es lo
 * mismo que teclear a ojo. Y el punto de llegada se pinta lleno cuando ha
 * PEGADO a una pared, que es lo que dice que la pared nueva va a llegar a algún
 * sitio.
 */
function Trazo({ trazo, tam }) {
    const { a, b } = trazo;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const corta = L < LARGO_MINIMO_PARED;
    const color = corta ? 'var(--warning)' : COLOR_TIPO.PARTICION_VERTICAL;
    // El rótulo va APARTADO del trazo, por su perpendicular: encima del muro
    // tapaba justo lo que se está dibujando, y en una pared corta lo tapaba
    // entero. Se aparta lo que mide el propio rótulo.
    const ux = L ? (b.x - a.x) / L : 1, uy = L ? (b.y - a.y) / L : 0;
    const cx = (a.x + b.x) / 2 - uy * tam * 1.3;
    const cy = (a.y + b.y) / 2 + ux * tam * 1.3;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color} strokeWidth={tam * TRAZO.linea}
                  strokeDasharray={`${tam * TRAZO.guion} ${tam * TRAZO.guion * 0.6}`}
                  strokeLinecap="round" />
            {/* Los puntos van en tamaño de PANTALLA: en metros, sobre un
                tabique de 80 cm se tocaban y tapaban la pared entera. */}
            {[a, b].map((q, i) => (
                <circle key={i} cx={q.x} cy={q.y} r={tam * TRAZO.punto}
                        fill={q.id ? color : PAPEL}
                        stroke={color} strokeWidth={tam * 0.15} />
            ))}
            <rect x={cx - tam * 1.6} y={cy - tam * 0.95}
                  width={tam * 3.2} height={tam * 1.25} rx={tam * 0.18}
                  fill={PAPEL} opacity={0.88} />
            <text x={cx} y={cy} fontSize={tam} fontWeight={800} textAnchor="middle"
                  fill={corta ? 'var(--warning)' : 'var(--text-primary)'}>
                {fmt(L)} m
            </text>
        </g>
    );
}

/**
 * El eje de un muro EN COORDENADAS DE DIBUJO, para medir un arrastre contra él.
 *
 * Un hueco se mueve A LO LARGO de su pared, así que lo que hay que saber es
 * cuánto avanza el ratón EN ESA DIRECCIÓN: se proyecta el desplazamiento sobre
 * este eje y se divide por su largo al cuadrado, y sale directamente el tanto
 * por uno que se ha movido. Funciona igual en planta y en 3D porque la
 * proyección es lineal: una fracción del muro es la misma fracción de su
 * sombra en pantalla.
 *
 * ⚠️ Se toma la CUERDA (del primer punto al último), no el recorrido. En un
 * muro quebrado el arrastre queda aproximado — pero sigue siendo monótono, que
 * es lo único que hace falta para arrastrar con el ratón.
 */
function ejeProyectado(pts, z, proy) {
    const a = pts[0], b = pts[pts.length - 1];
    const [ax, ay] = proy ? proy(a[0], a[1], z) : a;
    const [bx, by] = proy ? proy(b[0], b[1], z) : b;
    const ejeX = bx - ax, ejeY = by - ay;
    return { ejeX, ejeY, len2: ejeX * ejeX + ejeY * ejeY || 1 };
}

/**
 * El nombre de cada planta.
 *
 * La ÚLTIMA se rotula por ARRIBA y las demás por abajo: en una vista despiezada
 * las plantas se solapan en pantalla, así que el hueco libre de la de arriba
 * está encima y el de la de abajo, debajo. Rotulándolas todas igual, el nombre
 * de la primera cae justo sobre las paredes de la baja.
 */
function etiquetasPlanta(capas, murosDe, alturaPlanta, proy) {
    return capas.map((p, i) => {
        const z = i * (alturaPlanta + SEPARACION);
        const pts = murosDe(p).flatMap(m => (m.svg || []).map(([x, y]) => proy(x, y, z)));
        if (!pts.length) return null;
        const c = caja(pts, 0);
        const arriba = i === capas.length - 1 && capas.length > 1;
        return { texto: p.nombre, x: c.x, y: arriba ? c.y - 0.6 : c.y + c.alto + 1.1 };
    }).filter(Boolean);
}

/**
 * Lo que dice una pared al pasar por encima.
 *
 * Contesta lo que se pregunta ANTES de pulsar: qué es, cuánto mide y si le
 * queda algo por hacer. Sin eventos de puntero: el globo no puede robarle el
 * ratón a la pared que lo ha abierto.
 */
//: Lo que mide el globo, aproximado. Es para saber si CABE hacia abajo y hacia
//: la derecha; medirlo de verdad obligaría a pintarlo primero en el sitio malo.
const GLOBO = { ancho: 178, alto: 76 };

function Globo({ m, tip, clase, tipo, estado }) {
    const n = (m.huecos || []).length;
    const huecos = n === 1 ? '1 hueco' : `${n} huecos`;
    const left = tip.x + 14 + GLOBO.ancho > (tip.ancho || 0)
        ? Math.max(4, tip.x - 14 - GLOBO.ancho) : tip.x + 14;
    const top = tip.y + 12 + GLOBO.alto > (tip.alto || 0)
        ? Math.max(4, tip.y - 12 - GLOBO.alto) : tip.y + 12;
    return (
        <div className="pointer-events-none absolute z-10 min-w-[152px] rounded-xl border
                        border-white/15 bg-bkg-surface px-3 py-2 shadow-2xl"
             style={{ left, top }}>
            <div className="flex items-baseline gap-2">
                <b className="text-[12px] font-black tracking-wide">{m.nombre_manual || m.id}</b>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${clase}`}>
                    {tipo}
                </span>
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-white/45">
                {m.orientacion} · {fmt(m.largo)} m · {fmt(m.superficie)} m²
            </div>
            <div className={`mt-0.5 text-[11px] ${estado === 'dudoso'
                    ? 'text-amber-400/90' : 'text-white/30'}`}>
                {estado === 'fuera' ? 'fuera de la envolvente'
                    : estado === 'dudoso' ? `${huecos} · medida por confirmar`
                    : n ? `${huecos} · medidos`
                    : estado === 'medido' ? 'no lleva huecos'
                    : 'sin mirar'}
            </div>
        </div>
    );
}

/**
 * La BRÚJULA del 3D.
 *
 * En planta el norte es arriba y no hace falta decirlo; en cuanto el edificio
 * se puede girar, deja de saberse —y la orientación no es un adorno: de ella
 * cuelga a qué da cada fachada, que es lo que se está clasificando—.
 *
 * No es un icono girado: es el MISMO círculo horizontal del suelo pasado por la
 * MISMA proyección que el edificio, así que se achata igual que él al bajar la
 * cámara y la aguja apunta exactamente a donde apunta el norte del dibujo. Un
 * dibujo aparte se desincronizaría el día que se toque la proyección.
 *
 * Se pulsa para poner el norte arriba, que es lo que hace la brújula de
 * cualquier programa de arquitectura.
 */
function Brujula({ proy, onNorte }) {
    const R = 20;
    // `rumbo` viene a la escala de la proyección; dividiendo por ella, un rumbo
    // cae justo sobre la elipse de radio R — que es el círculo del suelo visto
    // desde donde esté la cámara.
    const dir = (ex, ey, k = 1) => {
        const [x, y] = proy.rumbo(ex, ey);
        return [(R * k * x) / proy.escala, (R * k * y) / proy.escala];
    };
    const [nx, ny] = dir(0, -1);
    const [sx, sy] = dir(0, 1);
    const [ex, ey] = dir(1, 0, 0.17);          // el ancho de la aguja
    const aguja = (px, py) => `${px},${py} ${ex},${ey} ${-ex},${-ey}`;
    const [lx, ly] = dir(0, -1, 1.40);         // dónde va la letra

    return (
        <button type="button" onClick={onNorte} title="Poner el norte arriba"
                className="absolute bottom-2 left-2 rounded-full border border-white/10
                           bg-bkg-surface/80 p-1 backdrop-blur transition-colors
                           hover:border-white/30">
            {/* El lienzo va más holgado que el círculo: la «N» se sale de él a
                propósito —es lo que la hace legible— y con la caja justa se
                recortaba por la mitad al girar. */}
            <svg width="58" height="58" viewBox="-34 -34 68 68" className="block">
                <ellipse cx="0" cy="0" rx={R} ry={Math.max(1.2, R * proy.aplanado)}
                         fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
                <polygon points={aguja(sx, sy)} fill={APAGADO} opacity={0.7} />
                <polygon points={aguja(nx, ny)} fill="var(--brand-primary)" />
                <text x={lx} y={ly} fontSize="11" fontWeight="900" textAnchor="middle"
                      dominantBaseline="central" fill="var(--brand-primary)">N</text>
            </svg>
        </button>
    );
}

/**
 * Lo que dice un HUECO al pasar por encima.
 *
 * Contesta cuál es (el nombre que va al `.cex` y enlaza sus puentes térmicos),
 * cuánto mide y de qué pared es — y dice que se puede ARRASTRAR, porque un
 * gesto que no se anuncia no lo prueba nadie.
 */
function GloboHueco({ h, pared, tip }) {
    const left = tip.x + 14 + GLOBO.ancho > (tip.ancho || 0)
        ? Math.max(4, tip.x - 14 - GLOBO.ancho) : tip.x + 14;
    const top = tip.y + 12 + GLOBO.alto > (tip.alto || 0)
        ? Math.max(4, tip.y - 12 - GLOBO.alto) : tip.y + 12;
    const esPuerta = h.tipo === 'puerta';
    return (
        <div className="pointer-events-none absolute z-10 min-w-[152px] rounded-xl border
                        border-white/15 bg-bkg-surface px-3 py-2 shadow-2xl"
             style={{ left, top }}>
            <div className="flex items-baseline gap-2">
                <b className="text-[12px] font-black tracking-wide">{nombreHueco(h)}</b>
                <span className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: colorHueco(h) }}>
                    {esPuerta ? 'Puerta' : 'Ventana'}
                </span>
            </div>
            <div className="mt-0.5 text-[11px] tabular-nums text-white/45">
                {fmt(h.ancho)} × {fmt(h.alto)} m · en {pared}
            </div>
            <div className={`mt-0.5 text-[11px] ${h.estado === 'dudoso'
                    ? 'text-amber-400/90' : 'text-white/30'}`}>
                {h.estado === 'dudoso' ? 'medida por confirmar · arrástrala para moverla'
                                       : 'arrástrala a lo largo de la pared'}
            </div>
        </div>
    );
}

/**
 * La parte de la CUBIERTA que se reforma, sobre el plano.
 *
 * Dos cosas: el polígono YA dibujado —con trama ámbar y su m² aproximado— y el
 * que se está dibujando, con la goma elástica desde el último vértice hasta el
 * ratón y el primer vértice marcado en grande, que es donde se cierra. El m²
 * es el del polígono en el lienzo, para VERLO mientras se dibuja: el que va al
 * .cex lo mide el motor intersecando con el tejado real.
 */
function Cubierta({ reforma, vertices, cursor, uid, tam }) {
    const puntos = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');
    const rotulo = (pts, texto) => {
        const c = caja(pts, 0);
        const x = c.x + c.ancho / 2, y = c.y + c.alto / 2;
        const ancho = Math.max(tam * 4, tam * (0.62 * texto.length + 0.8));
        return (
            <g>
                <rect x={x - ancho / 2} y={y - tam * 0.95} width={ancho} height={tam * 1.25}
                      rx={tam * 0.18} fill={PAPEL} opacity={0.85} />
                <text x={x} y={y} fontSize={tam} fontWeight={800} textAnchor="middle"
                      fill="var(--warning)">{texto}</text>
            </g>
        );
    };
    const poli = reforma?.poligono;
    return (
        <g style={{ pointerEvents: 'none' }}>
            {poli?.length >= 3 && (
                <>
                    <polygon points={puntos(poli)} fill={`url(#hatch-cambia-${uid})`}
                             stroke="var(--warning)" strokeWidth={0.12} strokeLinejoin="round" />
                    {rotulo(poli, `CUBIERTA · CAMBIA · ≈${fmt(areaPoligono(poli))} m²`)}
                </>
            )}
            {vertices.length > 0 && (
                <>
                    <polyline points={puntos(cursor ? [...vertices, [cursor.x, cursor.y]] : vertices)}
                              fill={vertices.length >= 2 ? `url(#hatch-cambia-${uid})` : 'none'}
                              stroke="var(--warning)" strokeWidth={0.1}
                              strokeDasharray="0.35 0.25" strokeLinejoin="round" />
                    {vertices.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r={i === 0 ? 0.32 : 0.16}
                                fill={i === 0 ? 'var(--warning)' : PAPEL}
                                stroke="var(--warning)" strokeWidth={0.08} />
                    ))}
                    {vertices.length >= 3 && rotulo(vertices, `≈${fmt(areaPoligono(vertices))} m²`)}
                </>
            )}
        </g>
    );
}

/** El código de color, que es lo que hace legible el plano de un vistazo. */
function Leyenda({ es3d, dibujando, dibujandoCubierta }) {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border
                        border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/30">
                Cerramientos
            </span>
            <Marca color={COLOR_TIPO.FACHADA}>Fachada</Marca>
            <Marca color={COLOR_TIPO.MEDIANERA}>Medianera</Marca>
            <Marca color={COLOR_TIPO.PARTICION_VERTICAL}>Partición a local</Marca>
            <Marca color={GRIS}>Sin mirar</Marca>
            <span className="h-3.5 w-px bg-white/10" />
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/30">
                Huecos
            </span>
            <Marca color={COLOR_HUECO.puerta}>Puerta</Marca>
            <Marca color={COLOR_HUECO.ventana}>Ventana</Marca>
            <span className="h-3.5 w-px bg-white/10" />
            <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                <i className="inline-block w-4 border-t-2 border-dashed"
                   style={{ borderColor: APAGADO }} />
                No cuenta
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                <i className="inline-block w-4 border-t-2 border-dashed"
                   style={{ borderColor: 'var(--warning)' }} />
                Medida por confirmar
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-white/45">
                <i className="inline-block h-[7px] w-4 rounded-sm border"
                   style={{ borderColor: 'var(--warning)',
                            background: 'repeating-linear-gradient(-45deg, var(--warning) 0 1px, transparent 1px 4px)' }} />
                Se reforma (CAMBIA)
            </span>
            <span className="ml-auto text-[11px] text-white/30">
                {dibujandoCubierta
                    ? 'pulsa cada esquina · cierra en el primer punto o con doble clic · espacio para mover el plano · Esc cancela'
                    : dibujando
                    ? 'arrastra de una pared a otra · amplía con la rueda para una pared corta · espacio (o botón central) para mover el plano'
                    : es3d
                        ? 'arrastra para girar · Mayús o botón central para mover · rueda para el zoom'
                        : 'rueda para el zoom · arrastra para mover'}
            </span>
        </div>
    );
}

function Marca({ color, children }) {
    return (
        <span className="flex items-center gap-1.5 text-[11px] text-white/45">
            <i className="inline-block h-[7px] w-4 rounded-sm" style={{ background: color }} />
            {children}
        </span>
    );
}

/**
 * Rótulos sin solaparse: primero las paredes largas —que son las que el
 * certificador busca— y la seleccionada y la entrada SIEMPRE, quepan o no.
 */
function colocarRotulos(lista, { sel, entrada, tam, entorno, nombreDe }) {
    const puestos = [];
    const salida = [];
    const orden = [...(lista || [])].sort((x, y) =>
        (y.id === sel) - (x.id === sel) ||
        (y.id === entrada) - (x.id === entrada) ||
        (y.largo || 0) - (x.largo || 0));

    for (const m of orden) {
        const c = centro(m.svg);
        const x = c[0];
        const y = c[1] + tam * 0.35;
        const texto = (nombreDe ? nombreDe(m) : m.id) + (m.cambia ? ' · CAMBIA' : '');
        const ancho = anchoRotulo(texto, tam);
        const forzado = m.id === sel || m.id === entrada;
        if (entorno && !forzado) continue;
        // Chocan si se solapan SUS RECUADROS. Con un umbral fijo, un nombre
        // puesto a mano se pintaba encima del vecino en vez de esconderlo.
        const choca = puestos.some(p =>
            Math.abs(p.x - x) < (p.ancho + ancho) / 2 * 0.78
            && Math.abs(p.y - y) < tam * 1.1);
        if (choca && !forzado) continue;
        puestos.push({ x, y, ancho });
        salida.push({ id: m.id, texto, x, y, ancho, destacado: forzado });
    }
    return salida;
}

//: Lo que ocupa un rótulo, en unidades del plano (metros).
//:
//: En un SVG no se puede medir el texto sin pintarlo, así que se estima por
//: caracteres: ~0,62 em en mayúsculas y peso 800. El SUELO de 3,4 em es el ancho
//: fijo que tenía antes, para que un `FBN1` de siempre se siga viendo igual.
function anchoRotulo(texto, tam) {
    return Math.max(tam * 3.4, tam * (0.62 * String(texto || '').length + 0.7));
}

/** Un muro sin encuadre no se puede dibujar, y eso SE DICE: un hueco en
 *  blanco donde debería haber un plano se lee como que no hay paredes. */
function SinPlano({ planta }) {
    return (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
            <b className="text-[13px] font-black tracking-wide">{planta?.nombre}</b>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                El motor no ha devuelto el encuadre del edificio, así que el plano
                no se puede dibujar. Las paredes están medidas: vuelve a traer la
                envolvente.
            </p>
        </div>
    );
}

export default PlanoPlanta;
