import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { PlanoPlanta } from '../components/PlanoPlanta';
import { PanelPared } from '../components/PanelPared';
import { usePlanoEnvolvente } from '../logic/usePlanoEnvolvente';
import { claveInstalacion } from '../logic/fichaCe3x';
import { useDeshacer } from '../logic/useDeshacer';
import { MidiendoElEdificio } from '../components/MidiendoElEdificio';
import { VentanasViviendaModal } from '../components/VentanasViviendaModal';
import { resumenVentanas, ventanasContestadas } from '../logic/ventanasVivienda';
import { EscribiendoElCex, CexGenerado } from '../components/EscribiendoElCex';
import { PanelAdministrativos, PanelEconomico, PanelGenerales, PanelInstalaciones,
         PanelMedidas, Ventana } from '../components/PanelesFicha';

// ─────────────────────────────────────────────────────────────────────────────
// Envolvente térmica — la superficie del certificador.
//
// De la referencia catastral sale el plano de cada planta habitable con sus
// paredes ya clasificadas y medidas. Él señala por dónde se entra, dice qué
// ventanas y puertas hay en cada pared, y se lleva el .cex para abrirlo en
// CE3X con todo puesto.
//
// El reparto es el de siempre: la GEOMETRÍA la mide el motor (contenedor
// Python), y aquí no se calcula ni un metro — solo se enseña y se recoge lo
// que el motor no puede saber. Ver `backend/routes/ceeEnvolvente.js`.
// ─────────────────────────────────────────────────────────────────────────────

//: A qué negocio pertenece este expediente —CAE o CEE directo— y cómo se
//: compone cada URL con ello. Sale de la dirección de la ventana, no del
//: expediente cargado (ver `apiEnvolvente.js`).
import { api, esCeeDirecto as enCeeDirecto } from '../logic/apiEnvolvente';
//: Las dos peticiones LARGAS de esta ventana —medir el edificio y escribir el
//: `.cex`— pasan por aquí: repite sola la que no llegó a salir y devuelve el
//: fallo ya redactado, en vez de la misma frase para seis causas distintas.
import { postEnvolvente, soloLista } from '../logic/pedirEnvolvente';

export function EnvolventeView({ expediente, onAviso, onPestanas }) {
    const id = expediente?.id;
    // Quién puede CORREGIR los administrativos, que se escriben en su fuente
    // (`clientes` y `prescriptores`), no aquí. Se repite en el backend: esto
    // solo decide si se pinta el botón.
    //  · el TITULAR lo corrige el equipo interno: de él cuelgan el Anexo I y el
    //    convenio, y el certificador no tiene por qué tocarlos.
    //  · el TÉCNICO, el equipo interno y ÉL MISMO — son sus datos, y es él quien
    //    sabe su nº de colegiado.
    const { user } = useAuth();
    const { isStaff: esStaff } = getRoleFlags(user);
    const suFicha = !!user?.prescriptor_id
        && String(user.prescriptor_id) === String(expediente?.cee?.certificador_id || '');
    // La RC vive en distinto sitio segun el negocio. Mismo orden que usan los
    // anexos (AnexoIModal, AnexoCesionModal): lo que ya funciona, no se cambia.
    const rc = (expediente?.instalacion?.ref_catastral
        || expediente?.ref_catastral
        || expediente?.cliente?.referencia_catastral
        || expediente?.referencia_catastral
        || expediente?.oportunidad?.rc
        || '').trim();

    const [geo, setGeo] = useState(null);
    //: Con qué cuerpos fuera se pidió la geometría que hay en pantalla. Es un
    //: `ref` y no estado porque solo sirve para no volver a pedir lo mismo: con
    //: estado, cada medición dispararía un render que dispararía otra medición.
    const cuerposPedidos = useRef([]);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [generando, setGenerando] = useState(false);
    const [avisos, setAvisos] = useState(null);

    // Lo que ya se señaló en otra sesión, guardado en el expediente. Se pide
    // antes que nada: si llegara después de montar el plano, el trabajo viejo
    // pisaría lo que se acabara de hacer.
    // Lo que el certificador retoca a mano sobre lo derivado: por ahora las
    // transmitancias. Viaja con el trabajo, así que se guarda igual que los
    // huecos — un valor tecleado no puede perderse al cerrar la pestaña.
    const [ajustes, setAjustes] = useState({});
    //: El popup de «cómo son las ventanas». Se abre solo la primera vez (ver
    //: más abajo) y desde el botón de la cabecera. `false` NO significa «ya
    //: contestado»: eso lo dice `ventanasContestadas`.
    const [verVentanas, setVerVentanas] = useState(false);
    //: Se sube cuando cambia el EXPEDIENTE por debajo (leer la placa lo escribe),
    //: no lo que se teclea aquí: la ficha la compone el servidor desde él.
    const [refrescoFicha, setRefrescoFicha] = useState(0);
    const [trabajoPrevio, setTrabajoPrevio] = useState(undefined);
    const [estadoGuardado, setEstadoGuardado] = useState(null);
    const ultimo = useRef(null);

    // Si el expediente YA tiene trabajo, se trae la geometría sola: volver a la
    // pantalla de «traer la envolvente» es un paso de más cuando ya se estuvo
    // aquí. La geometría no se guarda —es el modelo entero, megas (regla 21)—
    // pero el motor la tiene en caché, así que no vuelve a preguntar a
    // Catastro: 1,6 s medidos.
    const yaTraido = useRef(false);
    useEffect(() => {
        if (!trabajoPrevio || geo || cargando || yaTraido.current || !rc) return;
        yaTraido.current = true;
        // Con los cuerpos que ya se habían dejado fuera: si no, al recargar el
        // aparcamiento volvería a la envolvente y nadie se enteraría.
        traerGeometria(trabajoPrevio.cuerpos_fuera || []);
    }, [trabajoPrevio, geo, cargando, rc]);   // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!id) return;
        let vivo = true;
        axios.get(api(id, 'trabajo'))
            .then(({ data }) => {
                if (!vivo) return;
                setTrabajoPrevio(data?.trabajo || null);
                if (data?.trabajo?.ajustes) setAjustes(data.trabajo.ajustes);
            })
            .catch(() => { if (vivo) setTrabajoPrevio(null); });
        return () => { vivo = false; };
    }, [id]);

    const plano = usePlanoEnvolvente(geo, id, trabajoPrevio);
    const { plantas, entrada, resumen, setEntrada } = plano;

    // Lo que se va a escribir alrededor de la envolvente (titular, zona
    // climática, transmitancias). Lo compone el BACKEND desde el expediente y
    // aquí solo se enseña: es lo que el certificador revisa antes de generar.
    const [ficha, setFicha] = useState(null);
    const [guardado, setGuardado] = useState(null);
    //: El popup del final del recorrido. Va aparte de `guardado` porque el
    //: recuadro verde de la ventana SE QUEDA —es el rastro de lo que se generó—
    //: y el popup se cierra: son dos cosas distintas y no pueden compartir
    //: estado, o cerrar el popup borraría el rastro.
    const [reciénGenerado, setReciénGenerado] = useState(null);
    // El encuadre es de las DOS plantas a la vez: verlas a distinta escala
    // sería justo lo que el lienzo común viene a evitar.
    const [entorno, setEntorno] = useState(false);

    //: PLANTA o AXONOMETRÍA. Son dos tareas distintas y la misma geometría: en
    //: planta se mide y se pulsa; en 3D se ve de un golpe qué pared va con qué
    //: planta y contra qué da, que es justo lo que hay que juzgar para
    //: clasificarla. El modo es de la PANTALLA y no de cada plano: en 3D se
    //: dibuja el edificio entero, así que las dos tarjetas se funden en una.
    const [modo, setModo] = useState('2d');

    //: QUÉ PLANTAS se ven a la vez. `null` es la vista dividida —todas, una al
    //: lado de otra—; un índice es ver esa sola a todo el ancho. Las dos hacen
    //: falta: para comparar la baja con la primera hay que tenerlas delante, y
    //: para poner las ventanas de una hace falta el plano grande.
    //:
    //: Con TRES o más, la dividida deja de serlo: la rejilla es de dos columnas,
    //: así que la tercera cae debajo y a media escala, y un plano de un cuarto
    //: de pantalla no sirve para nada. Por eso a partir de ahí se arranca en una
    //: sola — con dos se conserva lo de siempre.
    //:
    //: El valor por defecto se DERIVA en vez de sembrarse con un efecto: así no
    //: hay un fotograma con la vista que no es, y al traer otra geometría el
    //: defecto vuelve a valer sin que nadie tenga que acordarse de resetearlo.
    const [eleccionPlanta, setEleccionPlanta] = useState(undefined);
    const soloPlanta = eleccionPlanta !== undefined ? eleccionPlanta
        : (plantas.length > 2 ? 0 : null);

    const aLaVez = soloPlanta == null ? plantas
        : [plantas[Math.min(soloPlanta, plantas.length - 1)]].filter(Boolean);

    const cambiarModo = (m) => {
        setModo(m);
        // El entorno es un encuadre de la PLANTA; en axonometría la manzana ni
        // se proyecta, y dejarlo puesto hacía que al volver a 2D el plano
        // apareciera alejado sin haberlo pedido.
        if (m === '3d') setEntorno(false);
    };

    // ── La barra de apartados de CE3X ────────────────────────────────────────
    // Vive en la cabecera de la VENTANA, pero lo que dice cada pestaña y a dónde
    // lleva solo se sabe aquí: son la ficha y el plano. Se publica hacia arriba
    // en un solo objeto (`onPestanas`) en vez de repartir el estado, que es lo
    // que acaba con dos sitios diciendo cosas distintas del mismo expediente.
    const [activa, setActiva] = useState('envolvente');

    // Cada apartado es una VENTANA que sustituye a la anterior, como en CE3X, y
    // no un bloque al que se baja: con un scroll largo nunca se sabe si lo que
    // falta está más abajo. Se vuelve arriba porque la ventana nueva empieza
    // ahí, y quedarse a media altura de la anterior desorienta.
    const ir = useCallback((destino) => {
        setActiva(destino);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // Traer la geometría es CARO: son varias peticiones a Catastro en serie,
    // nunca en ráfaga. No se dispara sola al abrir la pestaña — la pide él.
    /**
     * ⚠ `cuerposFuera` es una LISTA de claves o no es nada.
     *
     * Estuvo declarado `= null` y el botón se enganchaba con
     * `onClick={onTraer}`, así que React le metía dentro su EVENTO: el cuerpo
     * del POST se iba con un `SyntheticEvent`, que lleva `view: window` y por
     * tanto no se puede serializar («Converting circular structure to JSON»).
     * axios ni llegaba a mandar la petición, y por eso no quedaba rastro de ella
     * en ningún log — el botón de «Traer la envolvente» llevaba roto desde el
     * 16/09/2026 (22:21), y solo funcionaba la retoma automática, que sí pasa
     * una lista.
     *
     * Por eso lo que no sea una lista se trata como «no me han dicho nada»: la
     * comprobación va AQUÍ y no en el sitio que llama, o el próximo que enganche
     * esta función a un `onClick` vuelve a romperlo sin enterarse.
     */
    async function traerGeometria(cuerposFuera = null) {
        if (!rc) { setError('Este expediente no tiene referencia catastral.'); return; }
        setCargando(true); setError(null);
        try {
            // Los CUERPOS que se dejan fuera viajan con la petición: el motor
            // vuelve a MEDIR el edificio sin ellos —la pared que separaba el
            // garaje de la casa aparece entonces como lo que es— en vez de
            // tachar sus paredes y dejar la casa abierta por ahí.
            const fuera = soloLista(cuerposFuera) ?? cuerposPedidos.current;
            cuerposPedidos.current = fuera || [];
            const data = await postEnvolvente(api(id, 'geometria'),
                { referencia_catastral: rc, cuerpos_excluidos: fuera || [] },
                // Repetible: medir NO escribe nada —lee Catastro, y el motor lo
                // tiene cacheado—, así que una petición que no ha llegado se
                // puede volver a mandar sin consecuencias.
                { haciendo: 'construir la envolvente', repetible: true });
            setGeo(data);
        } catch (e) {
            // Ya viene redactado: qué ha fallado y qué hacer con ello. El
            // respaldo es por si algo revienta antes de llegar a la petición.
            setError(e.mensaje || e.message || 'No se pudo construir la envolvente.');
        } finally {
            setCargando(false);
        }
    }

    /**
     * Volver a MEDIR conservando lo que se lleva hecho.
     *
     * ⚠ El plano se siembra desde `trabajoPrevio` —lo que se leyó al ABRIR la
     * ventana—, así que al llegar la geometría nueva se resembraba con aquello y
     * los huecos puestos desde entonces desaparecían. Se le pasa el trabajo
     * ACTUAL, que es lo que el certificador tiene delante.
     *
     * Lo que no se conserva es lo que ya no existe: si un cerramiento se va con
     * el cuerpo que se acaba de quitar, sus huecos se van con él — y eso es lo
     * correcto, porque esa pared ya no está en el edificio.
     */
    async function volverAMedir(cambios = {}) {
        // Mismo cuidado que en `traerGeometria`: lo que llegue aquí acaba dentro
        // del cuerpo de un POST, y un evento de React no se puede serializar.
        // Hoy nadie la engancha a un `onClick`; esto es para que el día que lo
        // hagan no se repita el fallo del 16/09/2026.
        const limpio = (cambios && !cambios.nativeEvent && !cambios.target) ? cambios : {};
        const actual = { ...(plano.trabajo || trabajoPrevio || {}), ...limpio };
        setTrabajoPrevio(actual);
        await traerGeometria(actual.cuerpos_fuera || []);
    }

    // ── La cartografía del Catastro DEBAJO del plano ─────────────────────────
    // Una medianera lo es por lo que hay AL OTRO LADO, y el plano ya dibuja los
    // colindantes; con la cartografía de verdad debajo deja de haber que fiarse
    // de cómo la clasificó Catastro. Encaja sin ajustar nada porque se le pide
    // al WMS el MISMO rectángulo en el que el motor dibujó (`geo.georef`).
    //
    // Se pide A MANO y se cachea en el backend por rectángulo: al otro lado
    // está el mismo WMS del que depende el buscador de la app.
    // Encendida POR DEFECTO: comprobar contra qué da cada pared es el trabajo,
    // no un extra. Se separa la INTENCIÓN (`quiereCatastro`) de los datos
    // (`catastro`) para que apagarla no la vuelva a pedir en bucle.
    const [quiereCatastro, setQuiereCatastro] = useState(true);
    const [catastro, setCatastro] = useState(null);
    const [trayendoCatastro, setTrayendoCatastro] = useState(false);
    const [falloCatastro, setFalloCatastro] = useState(null);

    const traerCatastro = useCallback(async (georef) => {
        setTrayendoCatastro(true);
        try {
            const { data } = await axios.post(api(id, 'cartografia'), { georef });
            if (data.aviso) { setFalloCatastro(data.aviso); return; }
            setCatastro({ ...data, en_el_lienzo: georef.en_el_lienzo });
            setFalloCatastro(null);
        } catch (e) {
            setFalloCatastro(e.response?.data?.error
                || 'No se ha podido traer la cartografía del Catastro.');
        } finally {
            setTrayendoCatastro(false);
        }
    }, [id]);

    // Se pide en cuanto hay plano. Un fallo NO se reintenta —quedaría pidiéndole
    // al mismo WMS una y otra vez— y NO se saca por el aviso de error de la
    // pantalla: el plano funciona igual sin fondo, y un error rojo por algo
    // accesorio tapa los que sí hay que leer.
    useEffect(() => {
        if (!quiereCatastro || catastro || trayendoCatastro || falloCatastro) return;
        if (!geo?.georef) return;
        traerCatastro(geo.georef);
    }, [quiereCatastro, catastro, trayendoCatastro, falloCatastro,
        geo?.georef, traerCatastro]);

    // Al volver a medir, la cartografía de antes es de OTRO rectángulo.
    useEffect(() => { setCatastro(null); setFalloCatastro(null); }, [geo?.georef]);

    function verCatastro(encender) {
        setQuiereCatastro(encender);
        if (encender) setFalloCatastro(null);   // volver a pulsar es reintentar
    }

    // ── Qué construcciones CUENTAN ───────────────────────────────────────────
    // Se marca al abrir la oportunidad, pero el error se ve con el PLANO
    // delante: la planta que consta como almacén y es vivienda. Se escribe en la
    // OPORTUNIDAD, que es la fuente — guardarlo aquí aparte dejaría dos sitios
    // contestando a la misma pregunta.
    const [guardandoConstrucciones, setGuardandoConstrucciones] = useState(false);

    /**
     * Marcar una construcción y VOLVER A MEDIR, en el mismo gesto.
     *
     * Antes se guardaba y salía un aviso de «ahora vuelve a medir»: marcar la
     * planta que faltaba y que el plano siguiera enseñando la de antes es
     * justo el estado en el que uno se cree que ya está hecho. Las medidas las
     * hace el motor, así que hay que pedírselas — pero eso es cosa nuestra, no
     * un paso que deba dar él.
     *
     * Cuesta poco: Catastro ya está en la caché del motor, así que volver a
     * medir no es otra consulta al WAF.
     */
    async function cambiarConstrucciones(elegidas) {
        const antes = geo?.construcciones || [];
        setGuardandoConstrucciones(true);
        // Se pinta ya: esperar a la red para mover una casilla se siente roto.
        setGeo(v => (v ? { ...v, construcciones: antes.map(
            c => ({ ...c, cuenta: elegidas.includes(c.codigo) })) } : v));
        try {
            await axios.put(api(id, 'construcciones'),
                { elegidas, construcciones: antes });
        } catch (e) {
            setError(e.response?.data?.error
                || 'No se ha podido guardar qué construcciones cuentan.');
            // Se devuelve lo que de verdad consta: dejar la casilla marcada
            // después de un fallo es enseñar un cambio que no existe.
            setGeo(v => (v ? { ...v, construcciones: antes } : v));
            setGuardandoConstrucciones(false);
            return;
        }
        setGuardandoConstrucciones(false);
        // Y se vuelve a medir con lo marcado puesto. El popup de «midiendo el
        // edificio» sale solo, que es lo que dice que esto tarda.
        await volverAMedir();
    }

    // Se guarda SOLO, con un freno: cada ventana que se pone es un cambio de
    // estado, y guardar a cada tecla sería una escritura por pulsación. El
    // botón de guardar sigue existiendo para quien quiera asegurarse — pero
    // que alguien se olvide de pulsarlo no puede costarle el trabajo.
    useEffect(() => {
        const t = plano.trabajo && { ...plano.trabajo, ajustes };
        if (!id || !t) return;
        const json = JSON.stringify(t);
        if (json === ultimo.current) return;
        const espera = setTimeout(() => {
            setEstadoGuardado('guardando');
            axios.put(api(id, 'trabajo'), { trabajo: t })
                .then(() => { ultimo.current = json; setEstadoGuardado('guardado'); })
                .catch(() => setEstadoGuardado('error'));
        }, 1200);
        return () => clearTimeout(espera);
    }, [plano.trabajo, ajustes, id]);

    // La otra cara del autoguardado: un error también se guarda solo. `restaurar`
    // vuelve a montar el plano desde la geometría con el trabajo de ese paso,
    // que es la MISMA función con la que se siembra al abrir — así no hay dos
    // formas de leer un trabajo.
    const deshacerCex = useDeshacer({
        trabajo: plano.trabajo, ajustes,
        onRestaurar: (t, aj) => { plano.restaurar(t); setAjustes(aj || {}); },
    });

    // Y si se cierra la pestaña con algo sin guardar, se avisa: es el único
    // momento en que el trabajo se puede perder de verdad.
    //
    // La pared SELECCIONADA no cuenta. Se guarda —es cómodo volver donde
    // estabas— pero no es trabajo: preguntando por ella, el navegador corta la
    // salida cada vez que se pulsa una pared y se cierra, y un aviso que salta
    // siempre se acaba respondiendo que sí sin leerlo, que es justo cuando se
    // pierde algo.
    useEffect(() => {
        const alSalir = (e) => {
            if (!plano.trabajo || !hayCambios(plano.trabajo, ajustes, ultimo.current)) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', alSalir);
        return () => window.removeEventListener('beforeunload', alSalir);
    }, [plano.trabajo, ajustes]);

    // La ficha se pide en cuanto hay geometría: se enseña ANTES de generar,
    // porque es donde se ve si el año o una transmitancia no son los que el
    // certificador daría por buenos.
    //
    // `ajustes` ENTRA en las dependencias: la ficha no es una foto fija de lo
    // derivado, es lo que el motor va a escribir. Cambiar el año de
    // construcción mueve la normativa y con ella las cuatro transmitancias, y
    // si no se volviera a pedir, el certificador vería su año nuevo con las U
    // del viejo — y generaría con esas. Va con freno de 500 ms porque se teclea
    // letra a letra; el eco inmediato de lo tecleado lo pone la propia vista.
    //: Qué fase se está PREVISUALIZANDO. La envolvente es la misma en las dos, así
    //: que lo único que cambia en la ficha es el generador — pero enseñar la
    //: caldera mientras se pulsa «generar el FINAL» sería la pantalla
    //: contradiciendo al botón.
    const [fichaFase, setFichaFase] = useState('inicial');

    //: Las MEDIDAS DE MEJORA que se van a escribir. `null` = las que marca la
    //: fase por defecto (la aerotermia en el inicial, el autoconsumo en el
    //: final); un array = lo que el certificador ha elegido a mano. Se suelta al
    //: cambiar de fase: lo que procede proponer en cada certificado es distinto,
    //: y arrastrar la elección del inicial al final propondría instalar un
    //: equipo que ya está puesto.
    const [medidasSel, setMedidasSel] = useState(null);
    const cambiarFicha = (f) => { setFichaFase(f); setMedidasSel(null); };

    useEffect(() => {
        if (!geo?.geometria || !id) return;
        let vivo = true;
        const t = setTimeout(() => {
            axios.post(api(id, 'ficha'), { geometria: geo.geometria, ajustes,
                                              fase: fichaFase, medidas: medidasSel })
                .then(({ data }) => { if (vivo) setFicha(data); })
                .catch(() => { /* se verá al generar, que es quien manda */ });
        }, 500);
        return () => { vivo = false; clearTimeout(t); };
    }, [geo, id, ajustes, refrescoFicha, fichaFase, medidasSel]);

    // ── Las IMÁGENES de portada ──────────────────────────────────────────────
    // La foto de fachada y el croquis de parcela que van DENTRO del .cex. Se
    // piden a demanda y NUNCA solas: son dos consultas a Catastro y esta
    // pantalla se abre muchas veces. El backend las cachea por referencia
    // catastral, así que mirarlas aquí no cuesta una petición más al generar.
    const [imagenes, setImagenes] = useState(null);
    const [trayendoImagenes, setTrayendoImagenes] = useState(false);

    const traerImagenes = useCallback(async () => {
        setTrayendoImagenes(true);
        try {
            const { data } = await axios.post(api(id, 'imagenes'),
                { geometria: geo?.geometria });
            setImagenes(data);
        } catch (e) {
            setImagenes({ avisos: [e.response?.data?.error
                || 'No se han podido traer las imágenes de Catastro.'] });
        } finally {
            setTrayendoImagenes(false);
        }
    // `geo.geometria` y no `geo`: el objeto entero cambia de identidad en cada
    // render del padre y el efecto que las pide se relanzaría en bucle.
    }, [id, geo?.geometria]);

    /**
     * Poner OTRA imagen en lugar de la de Catastro.
     *
     * Se vuelve a pedir el par entero en vez de parchear el estado: lo que se
     * enseña tiene que ser lo que el backend va a escribir de verdad en el
     * fichero, y eso solo lo sabe el backend.
     */
    async function sustituirImagen(cual, fichero) {
        const fd = new FormData();
        fd.append('file', fichero);
        try {
            await axios.post(api(id, `imagenes/${cual}`), fd);
            await traerImagenes();
        } catch (e) {
            setImagenes(v => ({ ...(v || {}), avisos: [
                e.response?.data?.error || 'No se ha podido subir la imagen.',
                ...((v?.avisos) || [])] }));
        }
    }

    async function quitarImagen(cual) {
        try {
            await axios.delete(api(id, `imagenes/${cual}`));
            await traerImagenes();
        } catch (e) {
            setImagenes(v => ({ ...(v || {}), avisos: [
                e.response?.data?.error || 'No se ha podido quitar la imagen.',
                ...((v?.avisos) || [])] }));
        }
    }

    // ── La PLACA de la caldera ───────────────────────────────────────────────
    // La potencia de la caldera existente está en su placa y en ningún campo del
    // expediente, así que sin esto la instalación no se escribe en el .cex y hay
    // que abrir la foto y teclearla. La foto ya está en Drive: la sube el
    // instalador al slot de la etiqueta, a resolución original justamente para
    // que ese número se lea.
    //
    // Dos tiempos: primero se LEE y se enseña lo leído con su línea literal, y
    // solo entonces se aplica. De esto sale un dato que acaba en un certificado.
    const [placa, setPlaca] = useState(null);
    const [leyendoPlaca, setLeyendoPlaca] = useState(false);

    async function leerPlaca(aplicar = false) {
        setLeyendoPlaca(true);
        try {
            const { data } = await axios.post(
                `/api/expedientes/${id}/placa-caldera/ocr`, { aplicar });
            setPlaca(data);
            if (aplicar) {
                // El expediente ha cambiado, así que la ficha derivada también:
                // sin esto, la instalación seguiría saliendo vacía en pantalla.
                setRefrescoFicha(n => n + 1);
                onAviso?.(data.escrito?.length
                    ? 'Placa leída: la caldera ya consta en la instalación.'
                    : 'Leída, pero no había ningún hueco que rellenar.');
            }
        } catch (e) {
            setPlaca({ error: e.response?.data?.error || 'No se ha podido leer la placa.',
                       avisos: e.response?.data?.avisos || [] });
        } finally {
            setLeyendoPlaca(false);
        }
    }

    // ── Corregir al TITULAR o al TÉCNICO sin salir de aquí ───────────────────
    // Se escribe en la ficha de Clientes / Prescriptores, que es la fuente, y
    // después se vuelve a pedir la ficha: la compone el servidor desde ellas, y
    // sin esto la pantalla seguiría enseñando lo anterior. El error se DEVUELVE
    // para que lo enseñe el propio recuadro, junto al campo que se estaba
    // tecleando, y no en la barra de arriba.
    const guardarFuente = (que, aviso) => async (campos) => {
        await axios.put(api(id, que), { campos });
        setRefrescoFicha(n => n + 1);
        onAviso?.(aviso);
    };

    //: Qué .cex se está generando. La ENVOLVENTE es la misma en las dos fases —la
    //: obra no la toca—: lo único que cambia es el generador (la caldera que sale
    //: o la aerotermia que entra) y la carpeta donde acaba. Por eso son dos
    //: botones sobre el MISMO plano y no dos pantallas.
    const [generandoFase, setGenerandoFase] = useState(null);
    //: La fase que espera a que se conteste el popup. Solo se abre si queda algo
    //: por contestar (`ficha.faltan`): en un expediente ya resuelto, el botón
    //: genera directamente.
    const [preguntando, setPreguntando] = useState(null);

    function pedirGenerar(fase) {
        // Solo se pregunta lo de la fase que se está previsualizando: `faltan` se
        // calcula con esos ajustes, y en el final no hay nada que preguntar
        // porque lo hereda del fichero que copia.
        const faltan = fase === fichaFase ? (ficha?.faltan || []) : [];
        if (faltan.length) setPreguntando({ fase, faltan });
        else generarCex(fase);
    }

    async function generarCex(fase = 'inicial', respuestas = null) {
        setPreguntando(null);
        // Lo contestado se guarda como AJUSTE del trabajo, que es lo que ya se
        // persiste en el expediente: se pregunta una vez, no en cada generación.
        const cfg = respuestas ? { ...ajustes, ...respuestas } : ajustes;
        if (respuestas) setAjustes(cfg);
        setGenerando(true); setGenerandoFase(fase);
        setError(null); setAvisos(null); setGuardado(null);
        try {
            const data = await postEnvolvente(api(id, 'cex'), {
                geometria: geo.geometria,
                envolvente: plano.loSenalado(cfg),
                // Lo marcado solo vale para la fase que se está previsualizando:
                // generar la OTRA con esa elección escribiría en un certificado
                // las medidas que se eligieron para el contrario.
                medidas: fase === fichaFase ? medidasSel : null,
                ajustes: cfg, fase,
            }, { haciendo: 'generar el .cex' });
            setGuardado(data);
            setAvisos(data.avisos || null);
            // El enlace de la carpeta es el FINAL del recorrido: es lo que se le
            // pasa al certificador. Sale solo, y no en una línea al pie de la
            // pantalla que hay que ir a buscar.
            setReciénGenerado(data);
            onAviso?.(`${data.nombre} guardado en la carpeta del expediente.`);
        } catch (e) {
            // 422 = el motor NO ha escrito el fichero a propósito. Es una
            // respuesta, no una caída: lleva dentro qué le falta.
            const d = e.datos || e.response?.data;
            setError(e.mensaje || d?.error || 'No se pudo generar el .cex.');
            if (d?.avisos?.length) setAvisos(d.avisos);
        } finally {
            setGenerando(false); setGenerandoFase(null);
        }
    }

    // Lo que dice cada pestaña de CE3X, con el expediente delante. Va aquí
    // abajo y no arriba porque necesita la ficha y las medidas elegidas, y es
    // un `useMemo`: se recalcula cuando cambia algo, no en cada tecla.
    const pestanas = useMemo(
        () => (geo ? construirPestanas({ ficha, resumen, entrada, medidas: medidasSel }) : []),
        [geo, ficha, resumen, entrada, medidasSel]);
    const barra = useMemo(() => ({ pestanas, activa, onIr: ir, deshacer: deshacerCex }),
                          [pestanas, activa, ir, deshacerCex]);
    useEffect(() => { onPestanas?.(barra); }, [barra, onPestanas]);

    //: La altura con la que se levantan los muros en la axonometría: la que
    //: DECLARA la ficha, que es la misma con la que el motor midió las fachadas.
    const alturaPlanta = Number(ficha?.ficha?.generales?.altura_libre_planta?.valor) || null;

    // ── Los CUERPOS del edificio ─────────────────────────────────────────────
    // La envolvente de un certificado es la de la VIVIENDA: un aparcamiento
    // adosado no va dentro. Catastro dibuja el edificio en partes y dice de qué
    // es cada una, pero el plano se arma por NIVEL —la planta baja tiene
    // vivienda, luego se dibuja entera—, así que sus paredes entraban igual y
    // había que apartarlas una a una acertando con cuáles eran las suyas.
    //
    // ⚠ Estos dos hooks van AQUÍ, por encima del `return` de «todavía no hay
    // geometría». Estaban debajo, y entonces el primer render (sin `geo`) salía
    // antes de declararlos y el siguiente (ya con el plano medido) declaraba dos
    // más: React lo corta con el error #310, «se han renderizado más hooks que
    // en el render anterior», y la ventana entera se caía con el plano ya
    // traído. Ningún hook puede quedar por debajo de un `return` condicional.
    const [cuerpoSel, setCuerpoSel] = useState(null);
    const cuerpos = useMemo(() => (geo?.cuerpos || []).map(
        c => ({ ...c, fuera: plano.cuerposFuera.includes(c.id) })),
        [geo?.cuerpos, plano.cuerposFuera]);
    const cuerpoAbierto = cuerpos.find(c => c.id === cuerpoSel) || null;

    // Lo que Catastro dice que NO es vivienda y sigue dentro. Es lo que se
    // propone quitar: no se toca nada sin que lo pulse una persona, porque hay
    // garajes que forman parte de la vivienda y porches cerrados que son estar.
    const cuerposSospechosos = cuerpos.filter(c => c.habitable === false && !c.fuera);

    // ── CÓMO SON LAS VENTANAS ────────────────────────────────────────────────
    // Se pregunta al abrir un expediente que todavía no se ha modelado, y una
    // sola vez: de ahí salen la transmitancia de cada hueco y el puente térmico
    // de caja de persiana, que no estaban en ningún campo del expediente.
    //
    // ⚠️ SALE CON EL PLANO YA TRAÍDO, no en la pantalla de «traer la
    // envolvente». Ahí no hay `trabajo`, y el autoguardado solo escribe cuando
    // lo hay (`plano.trabajo && {...}`): lo contestado viviría en memoria hasta
    // el primer hueco y se perdería al cerrar la pestaña.
    const primeraVez = !ventanasContestadas(ajustes) && !ajustes.ventanas_luego
                       && !Object.keys(trabajoPrevio?.huecos || {}).length;
    const verVentanasAhora = verVentanas || (primeraVez && !preguntando && !generando);

    if (!geo) {
        // Mientras se mide, el popup: son entre veinte segundos y un minuto, y
        // una pantalla quieta durante ese rato se lee como que se ha colgado.
        // Con trabajo previo la geometría se pide sola, así que esto es lo
        // ÚNICO que se ve — la pantalla de «traer la envolvente» queda para
        // cuando hay que decidirlo, que es caro y no se dispara solo.
        if (cargando) {
            return <MidiendoElEdificio expediente={expediente?.numero_expediente} />;
        }
        return (
            // `onTraer` va ENVUELTO: sin el envoltorio, React le pasa su EVENTO
            // como primer argumento y acaba dentro del cuerpo del POST —que es
            // lo que rompió este botón del 16 al 18/09/2026—. `traerGeometria`
            // ya se defiende sola, pero aquí tampoco se le manda.
            <Arranque rc={rc} cargando={cargando} error={error}
                      onTraer={() => traerGeometria()}
                      retomando={!!trabajoPrevio && !error} />
        );
    }

    const cambiarAjuste = (clave, valor) => setAjustes(a => {
        const n = { ...a };
        if (valor === null || valor === '') delete n[clave]; else n[clave] = valor;
        return n;
    });
    //: El texto del conjunto de medidas, tal y como se va a volcar al `.cex`.
    //: Viaja con los ajustes, así que se guarda con el trabajo: lo que alguien
    //: se tomó el rato de reescribir no puede perderse al cerrar la pestaña.
    const cambiarTextoMedida = (id, campo, valor) => setAjustes(a => {
        const todos = { ...(a.medidas_texto || {}) };
        const suyo = { ...(todos[id] || {}) };
        if (valor === null || valor === '') delete suyo[campo]; else suyo[campo] = valor;
        if (Object.keys(suyo).length) todos[id] = suyo; else delete todos[id];
        const n = { ...a, medidas_texto: todos };
        if (!Object.keys(todos).length) delete n.medidas_texto;
        return n;
    });

    //: Lo que se teclea en Instalaciones. Manda sobre lo derivado y viaja con los
    //: ajustes, así que se guarda con el trabajo y el .cex lo escribe.
    //: POR FASE: la pestaña tiene dos caras («CEE inicial · caldera» y «CEE final
    //: · aerotermia») y lo tecleado para una no puede escribirse encima de la
    //: otra — el final salía con el generador llamado como la caldera.
    const cambiarInstalacion = (campo, valor) => setAjustes(a => {
        const clave = claveInstalacion(fichaFase);
        const inst = { ...(a[clave] || {}) };
        if (valor === null || valor === '') delete inst[campo]; else inst[campo] = valor;
        const n = { ...a, [clave]: inst };
        if (!Object.keys(inst).length) delete n[clave];
        return n;
    });

    //: Los equipos AÑADIDOS a mano — un termo para el ACS, un aire
    //: acondicionado—. Van en el mismo sitio que el resto de ajustes, así que se
    //: guardan con el trabajo y viajan al `.cex` igual que lo demás.
    const anadirEquipo = (slot) => setAjustes(a => ({
        ...a, equipos_extra: [...(a.equipos_extra || []), { slot }],
    }));
    const borrarEquipo = (i) => setAjustes(a => {
        const lista = (a.equipos_extra || []).filter((_, j) => j !== i);
        const n = { ...a, equipos_extra: lista };
        if (!lista.length) delete n.equipos_extra;
        return n;
    });
    const cambiarEquipoExtra = (i, campo, valor) => setAjustes(a => {
        const lista = [...(a.equipos_extra || [])];
        const eq = { ...(lista[i] || {}) };
        if (valor === null || valor === '') delete eq[campo]; else eq[campo] = valor;
        lista[i] = eq;
        return { ...a, equipos_extra: lista };
    });

    //: La superficie del edificio: es la que sirve de punto de partida a cada
    //: equipo, y la que se reparte cuando hay más de uno.
    const superficieDelEdificio =
        Number(ficha?.ficha?.generales?.superficie_util_habitable?.valor) || null;

    const cambiarU = (elemento, valor) => setAjustes(a => {
        const t = { ...(a.transmitancias || {}) };
        if (valor === null) delete t[elemento]; else t[elemento] = valor;
        return { ...a, transmitancias: t };
    });

    // Quitar o devolver un cuerpo obliga a volver a MEDIR: la pared que lo
    // separaba del resto aparece entonces como lo que es, y se van con él su
    // cubierta y su suelo. El trabajo del plano —los huecos, la entrada— se
    // reconstruye solo sobre la geometría nueva.
    async function cambiarCuerpo(id, fuera) {
        setCuerpoSel(null);
        plano.sacaCuerpo(id, fuera);
        const siguiente = fuera
            ? [...new Set([...plano.cuerposFuera, id])]
            : plano.cuerposFuera.filter(x => x !== id);
        await volverAMedir({ cuerpos_fuera: siguiente });
        onAviso?.(fuera
            ? 'Fuera de la envolvente: el edificio se ha vuelto a medir sin ese cuerpo.'
            : 'Vuelve a contar: el edificio se ha medido otra vez con él.');
    }

    // La otra salida: apartar sus paredes sin volver a medir. Instantáneo, pero
    // la pared que lo separaba del resto NO existe en el modelo, así que la casa
    // se queda abierta por ahí y hay que dibujarla.
    function apartarParedes(id) {
        setCuerpoSel(null);
        plano.apartaParedesDe(id, true);
        onAviso?.('Apartadas sus paredes. Si el cuerpo estaba pegado a la casa, '
                  + 'comprueba que no falte la pared que los separaba.');
    }

    // ¿Hay DOS fases que generar? En el CAE siempre: el CEE inicial lleva la
    // caldera y el final la aerotermia. En un CEE contratado de alcance ÚNICO no
    // hay un después —por eso su fichero se llama «CEE» a secas— y el «final»
    // acabaría con el MISMO nombre en la MISMA carpeta, archivando en OLD el
    // que se acaba de generar. Se comprueba también en el backend.
    const dosFases = !enCeeDirecto
        || String(expediente?.alcance || 'UNICO').toUpperCase() === 'DOBLE';
    const fase = { fase: fichaFase, onFase: cambiarFicha, dosFases };

    return (
        <div className="flex flex-col gap-5">
            {error && <Franja tono="red">{error}</Franja>}

            {/* La ENVOLVENTE no se desmonta al cambiar de ventana, solo se
                esconde: sobre el plano se pasa un rato largo —las ventanas se
                ponen una a una— y volver de mirar un dato no puede costar el
                encuadre, el zoom y la pared que se estaba mirando. Las demas
                ventanas son formularios y se montan a demanda. */}
            <div className={activa === 'envolvente' ? 'flex flex-col gap-4' : 'hidden'}>
                <Cabecera resumen={resumen} entrada={entrada}
                          onCambiarEntrada={() => setEntrada(null)}
                          estadoGuardado={estadoGuardado}
                          ventanas={resumenVentanas(ajustes.ventanas)}
                          onVentanas={() => setVerVentanas(true)} />

                {!entrada && <PasoEntrada />}

                {/* Lo que Catastro dice que no es vivienda y sigue contando. Se
                    PROPONE con el botón al lado: en un certificado la envolvente
                    es la de la vivienda, pero quién decide es quien ha estado
                    delante del edificio. */}
                {!!cuerposSospechosos.length && (
                    <AvisoCuerpos cuerpos={cuerposSospechosos}
                                  onQuitar={(id) => cambiarCuerpo(id, true)}
                                  ocupado={cargando} />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
                <div className="flex flex-col gap-3">
                    <BarraVista plantas={plantas} sel={soloPlanta}
                                onSel={setEleccionPlanta}
                                modo={modo} onModo={cambiarModo} />
                    {/* En 3D es UN dibujo, se enseñe una planta o las dos: dos
                        axonometrías del mismo edificio una al lado de la otra
                        son el mismo dibujo dos veces. Y por eso la rejilla se
                        parte por las TARJETAS que hay, no por las plantas —
                        partida en dos con una sola tarjeta, el 3D se quedaba
                        encajonado en media pantalla con el otro medio vacío. */}
                    <div className={`grid gap-3 ${modo !== '3d' && aLaVez.length > 1
                            ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                        {modo === '3d' ? (
                            <PlanoPlanta planta={aLaVez[0] || plantas[0]} plano={plano}
                                         capas={aLaVez}
                                         entorno={false} onEntorno={setEntorno}
                                         modo="3d" altura={alturaPlanta} />
                        ) : aLaVez.map(p => (
                            <PlanoPlanta key={p.id || p.nombre} planta={p} plano={plano}
                                         cuerpos={cuerpos} onCuerpo={setCuerpoSel}
                                         entorno={entorno} onEntorno={setEntorno}
                                         modo="2d" altura={alturaPlanta}
                                         catastro={quiereCatastro ? catastro : null}
                                         quiereCatastro={quiereCatastro}
                                         onCatastro={verCatastro}
                                         trayendoCatastro={trayendoCatastro}
                                         falloCatastro={falloCatastro} />
                        ))}
                    </div>
                </div>
                    <PanelPared plano={plano} transmitancias={ficha?.ficha?.termicas}
                                ventanasVivienda={ajustes.ventanas} expedienteId={id} />
                </div>
            </div>

            {verVentanasAhora && (
                <VentanasViviendaModal
                    ventanas={ajustes.ventanas} muros={plano.muros}
                    primeraVez={primeraVez}
                    onGuardar={v => { cambiarAjuste('ventanas', v); setVerVentanas(false); }}
                    // Cerrar sin contestar NO puede volver a abrirlo en el
                    // render siguiente: se sella «no lo he contestado, y ya lo
                    // sé» para que el popup no se convierta en una pared.
                    onCerrar={() => { setVerVentanas(false);
                                      if (primeraVez) cambiarAjuste('ventanas_luego', true); }} />
            )}

            {cuerpoAbierto && (
                <CuerpoModal cuerpo={cuerpoAbierto} ocupado={cargando}
                             onCerrar={() => setCuerpoSel(null)}
                             onQuitar={() => cambiarCuerpo(cuerpoAbierto.id, true)}
                             onDevolver={() => cambiarCuerpo(cuerpoAbierto.id, false)}
                             onApartarParedes={() => apartarParedes(cuerpoAbierto.id)} />
            )}

            {activa === 'administrativos' && (
                ficha
                    ? <PanelAdministrativos
                          datos={ficha} fuente={ficha.fuente}
                          puedeCliente={esStaff} puedeTecnico={esStaff || suFicha}
                          onGuardarCliente={guardarFuente(
                              'cliente', 'Ficha del cliente actualizada.')}
                          onGuardarTecnico={guardarFuente(
                              'tecnico', 'Datos del técnico actualizados.')} />
                    : <Cargando />)}

            {activa === 'generales' && (
                ficha
                    ? <PanelGenerales datos={ficha} puestos={ajustes}
                                      retocadas={ajustes.transmitancias || {}}
                                      onCambiarDato={cambiarAjuste} onCambiarU={cambiarU}
                                      construcciones={geo?.construcciones}
                                      onCambiarConstrucciones={cambiarConstrucciones}
                                      guardandoConstrucciones={guardandoConstrucciones || cargando}
                                      imagenes={imagenes} traendoImagenes={trayendoImagenes}
                                      onTraerImagenes={traerImagenes}
                                      onSustituirImagen={sustituirImagen}
                                      onQuitarImagen={quitarImagen} />
                    : <Cargando />)}

            {activa === 'instalaciones' && (
                <PanelInstalaciones {...fase} equipo={ficha?.ficha?.instalaciones?.[0]}
                                    superficie={superficieDelEdificio}
                                    ajustes={ajustes[claveInstalacion(fichaFase)] || {}}
                                    onAjuste={cambiarInstalacion}
                                    extras={ajustes.equipos_extra || []}
                                    onExtra={cambiarEquipoExtra}
                                    onAnadir={anadirEquipo} onBorrar={borrarEquipo}>
                    {/* `puedeLeerPlaca`: en un CEE directo no hay `instalacion`
                        donde escribir lo leído —ese es justo el motivo de que sea
                        otra tabla—, así que el equipo se teclea. Un botón que da
                        404 es peor que no tenerlo. */}
                    <Instalacion equipo={ficha?.ficha?.instalaciones?.[0]} placa={placa}
                                 fase={fichaFase} leyendo={leyendoPlaca} onLeer={leerPlaca}
                                 puedeLeerPlaca={!enCeeDirecto} />
                </PanelInstalaciones>)}

            {activa === 'medidas' && (
                <PanelMedidas catalogo={ficha?.medidas} elegidas={medidasSel}
                              onElegir={setMedidasSel} {...fase}
                              textos={ajustes.medidas_texto || {}}
                              onTexto={cambiarTextoMedida} />)}

            {activa === 'economico' && <PanelEconomico />}

            {activa === 'cex' && (
                <Ventana titulo="Generar el .cex">
                    {/* El FINAL no se levanta de cero: se COPIA el inicial y se le
                        cambia el generador, que es como se hace a mano. Verificado
                        sobre 26RES060_186 contra el .cex que guardó el certificador
                        desde CE3X: de los 15 pickles solo cambia el de
                        instalaciones, y sus 10 campos salen idénticos. */}
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => pedirGenerar('inicial')}
                            disabled={!entrada || generando}
                            className="rounded-xl bg-brand px-5 py-3 text-xs font-black uppercase
                                       tracking-widest text-black disabled:opacity-40
                                       disabled:cursor-not-allowed hover:brightness-110">
                            {generandoFase === 'inicial' ? 'Generando…'
                                : guardado?.fase === 'inicial' ? '↻ Volver a generar el INICIAL'
                                : '⚡ Generar el .cex INICIAL'}
                        </button>
                        {dosFases && (
                        <button
                            onClick={() => pedirGenerar('final')}
                            disabled={!entrada || generando}
                            className="rounded-xl border border-brand/50 px-5 py-3 text-xs font-black
                                       uppercase tracking-widest text-brand disabled:opacity-40
                                       disabled:cursor-not-allowed hover:bg-brand/10">
                            {generandoFase === 'final' ? 'Generando…'
                                : guardado?.fase === 'final' ? '↻ Volver a generar el FINAL'
                                : '⚡ Generar el .cex FINAL'}
                        </button>
                        )}
                        <span className="max-w-[26rem] text-[11px] leading-snug text-white/40">
                            {!entrada ? 'Señala primero por dónde se entra.'
                                : !dosFases
                                    ? 'Este encargo es de UN solo certificado: el .cex va a su '
                                      + 'carpeta «1. CEE» como «… - CEE_REVISAR.cex», para abrirlo '
                                      + 'en CE3X y comprobarlo.'
                                    : 'El INICIAL lleva la caldera que se sustituye y va a 1. CEE / CEE '
                                      + 'INICIAL. El FINAL se hace SOBRE ÉL —se copia y se le cambia el '
                                      + 'generador por la aerotermia— y va a CEE FINAL.'}
                        </span>
                    </div>

                    {guardado && <Guardado g={guardado} />}
                    {/* Lo que hay que mirar ANTES de generar se mira AQUÍ, en la
                        ventana del botón: los de la última generación si los hay,
                        y si no los de la ficha, que dicen lo que va a salir. */}
                    {avisos?.length > 0
                        ? <Avisos lista={avisos} />
                        : ficha?.avisos?.length > 0 && (
                            <Avisos lista={ficha.avisos}
                                    titulo="Lo que hay que mirar antes de generar" />)}
                </Ventana>)}

            {preguntando && (
                <PreguntasPrevias
                    preguntas={preguntando.faltan}
                    onCerrar={() => setPreguntando(null)}
                    onGenerar={(resp) => generarCex(preguntando.fase, resp)} />
            )}

            {/* Generar tarda —la ficha, dos imágenes del Catastro, quince
                pickles y la subida a Drive— y una espera larga delante de una
                pantalla quieta se lee como que se ha colgado. */}
            {generando && (
                <EscribiendoElCex key={generandoFase || 'inicial'}
                                  expediente={expediente?.numero_expediente}
                                  fase={generandoFase || 'inicial'} />
            )}

            {reciénGenerado && (
                <CexGenerado g={reciénGenerado} avisos={avisos || []}
                             onCerrar={() => setReciénGenerado(null)}
                             onVerAvisos={() => ir('cex')} />
            )}
        </div>
    );
}

// ─── Trozos de pantalla ──────────────────────────────────────────────────────

function Arranque({ rc, cargando, error, onTraer, retomando }) {
    return (
        <div className="flex flex-col items-start gap-4 py-6">
            <div>
                <h3 className="text-lg font-black tracking-tight">
                    {retomando ? 'Retomando donde lo dejaste…' : 'Envolvente térmica'}
                </h3>
                <p className="mt-1 max-w-xl text-sm text-white/50">
                    De la referencia catastral sale el plano de cada planta con sus
                    fachadas, medianeras y particiones ya medidas y orientadas. Tú
                    pones las ventanas y te llevas el <code>.cex</code> para CE3X.
                </p>
            </div>
            {rc
                ? <code className="rounded-md border border-white/10 bg-white/[0.03]
                                    px-2 py-1 text-[11px] text-white/70">{rc}</code>
                : <Franja tono="amber">
                      Este expediente no tiene referencia catastral. Ponla en la ficha
                      y vuelve.
                  </Franja>}
            {error && <Franja tono="red">{error}</Franja>}
            <button
                onClick={onTraer}
                disabled={!rc || cargando}
                className="rounded-xl bg-brand px-5 py-3 text-xs font-black
                           uppercase tracking-widest text-black disabled:opacity-40
                           hover:brightness-110">
                {cargando ? 'Midiendo el edificio…' : 'Traer la envolvente'}
            </button>
            {cargando && (
                <p className="text-[11px] text-white/40">
                    Son varias consultas a Catastro, en serie y con pausa. Tarda
                    entre veinte segundos y un minuto.
                </p>
            )}
        </div>
    );
}

//: Sin botón de Guardar, el acuse es la ÚNICA señal de que lo señalado ha
//: llegado: un autoguardado mudo no se distingue de no guardar.
const GUARDADO = {
    guardando: { texto: 'Guardando…', color: 'text-white/40' },
    guardado: { texto: '✓ Guardado en el expediente', color: 'text-emerald-400' },
    error: { texto: '⚠ No se ha podido guardar — no cierres la pestaña', color: 'text-red-300' },
};

/**
 * Una línea, no cuatro cajas.
 *
 * Los contadores (medidos · dudosos · sin tocar · m² de hueco) ocupaban la
 * primera fila entera y eran lo primero que se veía, cuando al entrar la única
 * tarea es señalar la entrada y luego ir pared por pared. Lo que de verdad hace
 * falta a mano —por dónde se entra, si está guardado y cuánto queda— cabe en un
 * renglón, y el estado de cada pared ya se ve en el plano por su color.
 */
function Cabecera({ resumen, entrada, onCambiarEntrada, estadoGuardado,
                   ventanas, onVentanas }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-white/45">
            {entrada ? (
                <button onClick={onCambiarEntrada}
                        className="text-white/60 hover:text-white">
                    ◆ se entra por <b className="text-brand">{entrada}</b> · cambiar
                </button>
            ) : (
                <span className="font-bold text-brand">◆ señala por dónde se entra</span>
            )}

            {resumen.sinTocar > 0 && (
                <span>
                    {resumen.sinTocar === 1 ? 'queda ' : 'quedan '}
                    <b className="text-white/70 tabular-nums">{resumen.sinTocar}</b>
                    {resumen.sinTocar === 1 ? ' pared' : ' paredes'} por mirar
                </span>
            )}
            {resumen.dudosos > 0 && (
                <span className="text-amber-400/80">
                    <b className="tabular-nums">{resumen.dudosos}</b> con medida por confirmar
                </span>
            )}
            {/* Lo APARTADO se dice aquí: en el plano son cuatro trazos finos, y
                una pared que alguien sacó de la envolvente hace un mes no puede
                depender de que hoy te fijes en ellos. */}
            {resumen.fuera > 0 && (
                <span>
                    <b className="text-white/70 tabular-nums">{resumen.fuera}</b>
                    {resumen.fuera === 1 ? ' apartada' : ' apartadas'} de la envolvente
                </span>
            )}

            {/* Como son las ventanas de la vivienda. Va aqui y no escondido en
                un menu porque es lo que se acaba de contestar al entrar: hay
                que poder comprobar de un vistazo que lo que se esta poniendo en
                cada hueco es lo que se dijo. */}
            <button onClick={onVentanas}
                    className={ventanas
                        ? 'text-white/55 hover:text-white'
                        : 'font-bold text-amber-400/90 hover:text-amber-300'}>
                ▤ {ventanas || 'di cómo son las ventanas'}
            </button>

            {estadoGuardado && (
                <span className={`ml-auto ${GUARDADO[estadoGuardado].color}`}>
                    {GUARDADO[estadoGuardado].texto}
                </span>
            )}
        </div>
    );
}

/**
 * Lo que Catastro dice que NO es vivienda y sigue contando en la envolvente.
 *
 * POR QUE EXISTE: la envolvente de un certificado es la de la VIVIENDA, y un
 * aparcamiento adosado no va dentro. Catastro ya lo dice —su `lcons` lo declara
 * APARCAMIENTO y no habitable— pero el plano se arma por NIVEL, asi que sus
 * paredes entraban igual y no lo avisaba nadie.
 *
 * REGLA — se AVISA y se ofrece el boton; no se quita solo. Hay garajes que
 * forman parte de la vivienda y porches cerrados que son un estar, y quien lo
 * sabe es quien ha estado delante del edificio.
 */
function AvisoCuerpos({ cuerpos, onQuitar, ocupado }) {
    return (
        <Franja tono="amber">
            <b>
                {cuerpos.length === 1
                    ? 'Hay un cuerpo que Catastro no cuenta como vivienda.'
                    : `Hay ${cuerpos.length} cuerpos que Catastro no cuenta como vivienda.`}
            </b>{' '}
            En un certificado la envolvente es la de la vivienda: lo normal es dejarlos fuera.
            <div className="mt-2 flex flex-wrap gap-2">
                {cuerpos.map(c => (
                    <button key={c.id} onClick={() => onQuitar(c.id)} disabled={ocupado}
                            className="rounded-lg border border-amber-400/40 bg-amber-400/10
                                       px-3 py-1.5 text-[11px] font-black uppercase
                                       tracking-widest text-amber-200 disabled:opacity-40
                                       hover:bg-amber-400/20">
                        Quitar {c.construccion?.uso || 'el cuerpo'} · {fmtM2(c.superficie)}
                    </button>
                ))}
            </div>
            <span className="mt-1 block text-[11px] text-white/45">
                Se vuelve a medir el edificio sin el, y con el se van su cubierta y su
                suelo. Se puede devolver pulsandolo en el plano.
            </span>
        </Franja>
    );
}

/**
 * Un CUERPO del edificio, y que hacer con el.
 *
 * Las dos salidas no son lo mismo y por eso se dicen enteras:
 *  · QUITARLO vuelve a medir el edificio sin el, y entonces la pared que lo
 *    separaba de la casa aparece como lo que es (fachada o medianera).
 *  · APARTAR SUS PAREDES es instantaneo y no mide nada, pero esa pared no
 *    existe en el modelo —Catastro une los dos cuerpos y la linea queda
 *    dentro—, asi que la casa se queda abierta por ahi.
 */
function CuerpoModal({ cuerpo, onCerrar, onQuitar, onDevolver, onApartarParedes, ocupado }) {
    const c = cuerpo.construccion;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
             onClick={onCerrar}>
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-bkg-surface p-5"
                 onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    Cuerpo del edificio
                </p>
                <h3 className="mt-1 text-lg font-black">
                    {c?.uso || 'Sin identificar'}
                    <span className="ml-2 text-sm font-bold text-white/50">
                        {fmtM2(cuerpo.superficie)}
                    </span>
                </h3>

                <p className="mt-2 text-[12px] leading-relaxed text-white/60">
                    {c ? (
                        <>
                            Catastro declara aqui <b className="text-white/85">{c.uso}</b> de{' '}
                            {fmtM2(c.superficie)}
                            {c.habitable === false
                                ? <>, y <b className="text-amber-300">no lo cuenta como vivienda</b>.</>
                                : <>, de uso habitable.</>}{' '}
                            <span className="text-white/40">
                                (se reconoce por la superficie: se parecen al{' '}
                                {Math.round((c.parecido || 0) * 100)} %)
                            </span>
                        </>
                    ) : (
                        <>
                            Catastro no dice qué hay en este cuerpo: solo lo dibuja. Su
                            superficie no casa con ninguna de las construcciones que declara
                            — sus partes no se corresponden una a una con ellas.
                        </>
                    )}
                </p>

                {/* Lo que Catastro declara en ESTAS plantas. Cuando el cuerpo no
                    casa con ninguna construccion es lo unico que queda para
                    decidir, y aun casando dice si en esa planta hay mas almacen
                    que vivienda. */}
                {!!cuerpo.usos_nivel?.length && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                            En {cuerpo.niveles?.length > 1 ? 'estas plantas' : 'esta planta'},
                            Catastro declara
                        </p>
                        <ul className="mt-1.5 flex flex-col gap-1">
                            {cuerpo.usos_nivel.map((u, i) => (
                                <li key={i} className="flex items-baseline gap-2 text-[11.5px]">
                                    <span className={u.habitable === false
                                            ? 'text-amber-300/90' : 'text-white/75'}>
                                        {u.uso}
                                    </span>
                                    <span className="text-white/40">{fmtM2(u.superficie)}</span>
                                    {u.habitable === false && (
                                        <span className="text-[10px] font-bold uppercase
                                                         tracking-widest text-amber-300/60">
                                            no vivienda
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {cuerpo.fuera ? (
                    <>
                        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03]
                                      px-3 py-2 text-[11.5px] text-white/60">
                            Ahora mismo esta FUERA de la envolvente: sus paredes no se miden
                            ni se escriben en el .cex.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button onClick={onDevolver} disabled={ocupado}
                                    className="rounded-xl bg-brand px-4 py-2.5 text-[11px]
                                               font-black uppercase tracking-widest text-black
                                               disabled:opacity-40 hover:brightness-110">
                                {ocupado ? 'Midiendo…' : 'Volver a contarlo'}
                            </button>
                            <button onClick={onCerrar}
                                    className="ml-auto text-[11px] font-bold uppercase
                                               tracking-widest text-white/40 hover:text-white">
                                Cerrar
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="mt-4 flex flex-col gap-2">
                            <button onClick={onQuitar} disabled={ocupado}
                                    className="rounded-xl bg-brand px-4 py-3 text-left
                                               disabled:opacity-40 hover:brightness-110">
                                <span className="block text-[11px] font-black uppercase
                                                 tracking-widest text-black">
                                    {ocupado ? 'Midiendo…' : 'Quitarlo y volver a medir'}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-black/70">
                                    El edificio se mide otra vez sin el: la pared que lo separaba
                                    de la casa sale como lo que es, y se van con el su cubierta
                                    y su suelo.
                                </span>
                            </button>
                            <button onClick={onApartarParedes} disabled={ocupado}
                                    className="rounded-xl border border-white/10 px-4 py-3
                                               text-left disabled:opacity-40
                                               hover:border-white/30">
                                <span className="block text-[11px] font-black uppercase
                                                 tracking-widest text-white/70">
                                    Solo apartar sus paredes
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                                    Sin volver a medir. Si el cuerpo estaba pegado a la casa, la
                                    pared que los separaba no existe en el modelo y habra que
                                    dibujarla.
                                </span>
                            </button>
                        </div>
                        <button onClick={onCerrar}
                                className="mt-3 text-[11px] font-bold uppercase tracking-widest
                                           text-white/40 hover:text-white">
                            Cancelar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

//: Una superficie en metros cuadrados, redondeada: aqui nadie decide nada por
//: dos decimales y el rotulo va dentro del plano.
const fmtM2 = (v) => `${Math.round(Number(v) || 0).toLocaleString('es-ES')} m²`;

function PasoEntrada() {
    return (
        <Franja tono="amber">
            <b>¿Por dónde se entra a la casa?</b> Pulsa la pared de la puerta. Las
            <b className="text-brand"> naranjas</b> son las que dan a la calle,
            que es lo corriente — pero <b>vale cualquiera</b>.
            <span className="mt-1 block text-[11px] text-white/45">
                Catastro dice el nombre de la calle pero no qué pared da a ella, y el
                punto que devuelve es el centro de la parcela, no el portal. Y una
                puerta metida en un retranqueo sale como patio. Por eso se señala.
            </span>
        </Franja>
    );
}

/**
 * QUÉ SE VE: qué plantas y en planta o en 3D.
 *
 * Las dos preguntas van juntas y en la misma barra porque son la misma: qué
 * tengo delante. El conmutador 2D/3D estaba dentro de cada tarjeta y ahí
 * sobraba dos veces — se repetía en cada planta, como si se pudiera tener una
 * en planta y otra en axonometría, y en 3D quedaba dentro del único dibujo que
 * ya era el edificio entero.
 *
 * Lo de las plantas son dos trabajos distintos sobre el mismo dibujo.
 * COMPARARLAS —¿esta pared sigue hacia arriba? ¿la primera vuela sobre el
 * porche?— pide tenerlas una al lado de la otra. PONER LAS VENTANAS de una pide
 * el plano lo más grande posible: se hace hueco a hueco y a media pantalla no
 * se distinguen dos ventanas de 1,30 m separadas por un pilar.
 *
 * Es UN control y no un modo más otro selector: «Las dos» es una opción más de
 * la misma fila, así que se lee de un vistazo qué se está viendo. Y vale
 * IGUAL EN 3D: con dos forjados uno encima de otro el de abajo se lee mal, así
 * que hay que poder quedarse con uno sin salir de la axonometría.
 *
 * El grupo de plantas solo aparece con más de una: con una no hay qué elegir.
 */
function BarraVista({ plantas, sel, onSel, modo, onModo }) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border
                        border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/30">
                Ver
            </span>
            {plantas.length > 1 && (
                <div className="flex flex-wrap items-center gap-0.5 rounded-lg border
                                border-white/10 bg-white/[0.04] p-0.5">
                    <Pastilla activa={sel == null} onClick={() => onSel(null)}
                              title={modo === '3d'
                                  ? 'El edificio entero, con sus plantas despiezadas'
                                  : 'Las plantas una al lado de otra, a la misma escala'}>
                        {plantas.length === 2 ? 'Las dos' : 'Todas'}
                    </Pastilla>
                    {plantas.map((p, i) => (
                        <Pastilla key={p.id || p.nombre} activa={sel === i}
                                  onClick={() => onSel(i)}
                                  title={`Solo ${p.nombre}, a todo el ancho`}>
                            {p.nombre}
                        </Pastilla>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-0.5 rounded-lg border border-white/10
                            bg-white/[0.04] p-0.5">
                <Pastilla activa={modo !== '3d'} onClick={() => onModo('2d')}
                          title="Planta, para medir y pulsar paredes">2D</Pastilla>
                <Pastilla activa={modo === '3d'} onClick={() => onModo('3d')}
                          title="Axonometría, para ver contra qué da cada pared">3D</Pastilla>
            </div>
            {sel != null && plantas.length > 1 && (
                <span className="text-[11px] text-white/30">
                    las demás siguen medidas y se guardan igual
                </span>
            )}
        </div>
    );
}

function Pastilla({ activa, onClick, title, children }) {
    return (
        <button type="button" onClick={onClick} title={title}
                className={`h-7 rounded-md px-2.5 text-[10px] font-black uppercase
                            tracking-widest transition-colors
                    ${activa ? 'bg-brand text-black'
                             : 'text-white/45 hover:text-white/80'}`}>
            {children}
        </button>
    );
}

/** Dónde ha quedado el fichero. El certificador lo abre desde ahí con CE3X. */
function Guardado({ g }) {
    return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                Guardado en el expediente
            </p>
            <p className="mt-1 text-[13px] text-white/80">
                <code className="text-white">{g.nombre}</code>
                <span className="text-white/40"> · {g.carpeta}</span>
                {g.reemplazado && (
                    <span className="text-white/40"> · el anterior se ha archivado en OLD</span>
                )}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                Ábrelo con CE3X, compruébalo y guarda desde el propio CE3X el certificado
                definitivo. El <b>_REVISAR</b> del nombre es a propósito: esto lo ha escrito
                la app, todavía no es el CEE.
            </p>
            {g.link && (
                <a href={g.link} target="_blank" rel="noreferrer"
                   className="mt-2 inline-block rounded-lg border border-white/15 px-3 py-1.5
                              text-[11px] font-bold text-white/70 hover:border-white/35 hover:text-white">
                    Abrir en Drive ↗
                </a>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que hace falta y no está en el expediente, preguntado al generar.
//
// Son datos que se miden en la visita —el depósito de acumulación, los litros
// de ACS— y que hasta ahora salían con un valor por defecto que había que
// corregir dentro de CE3X. Se preguntan aquí porque es el momento en que se
// tiene el edificio en la cabeza, y lo contestado se GUARDA en el expediente:
// se pregunta una vez y el CEE final lo hereda del fichero.
//
// REGLA — nada de esto BLOQUEA. «No lo sé» sale del popup y genera igual, con
// el mismo aviso de siempre. Y solo aparece si queda algo por contestar: un
// popup que sale en cada generación se responde sin leer.
// ─────────────────────────────────────────────────────────────────────────────
function PreguntasPrevias({ preguntas, onGenerar, onCerrar }) {
    const [resp, setResp] = useState({});
    const pon = (k, v) => setResp(r => ({ ...r, [k]: v }));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4
                        backdrop-blur-sm" onClick={onCerrar}>
            <div onClick={e => e.stopPropagation()}
                 className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141414] p-5
                            shadow-2xl">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/80">
                    Antes de generar
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">
                    Esto no está en el expediente y se mide en la visita. Lo que contestes se
                    guarda: no se vuelve a preguntar, y el CEE final lo hereda.
                </p>

                <div className="mt-4 space-y-4">
                    {preguntas.map(p => (
                        <div key={p.clave} className="rounded-xl border border-white/[0.07]
                                                      bg-white/[0.02] px-4 py-3">
                            <p className="text-[13px] font-semibold text-white/85">{p.titulo}</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">
                                {p.ayuda}
                            </p>
                            {p.tipo === 'sino_numero' ? (
                                <SiNoNumero p={p} valor={resp[p.clave]} onPon={v => pon(p.clave, v)} />
                            ) : (
                                <Numero p={p} valor={resp[p.clave]} onPon={v => pon(p.clave, v)} />
                            )}
                        </div>
                    ))}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    {/* Salir sin contestar es una respuesta: el .cex sale como hasta
                        ahora y con su aviso. Se vuelve a preguntar la próxima vez,
                        porque nada se ha guardado. */}
                    <button onClick={() => onGenerar(null)}
                            className="rounded-lg px-4 py-2 text-[11px] font-bold uppercase
                                       tracking-wider text-white/40 hover:text-white/70">
                        No lo sé — generar igual
                    </button>
                    <button onClick={() => onGenerar(resp)}
                            className="rounded-xl bg-brand px-5 py-2.5 text-[11px] font-black
                                       uppercase tracking-widest text-black hover:brightness-110">
                        Guardar y generar
                    </button>
                </div>
            </div>
        </div>
    );
}

/** «¿Tiene? Sí/No» y, si sí, cuántos. El 0 ES una respuesta: "no tiene". */
function SiNoNumero({ p, valor, onPon }) {
    const si = valor > 0;
    const no = valor === 0;
    return (
        <div className="mt-2.5">
            <div className="flex gap-2">
                <Opcion puesta={si} onClick={() => onPon(p.propuesto)}>Sí</Opcion>
                <Opcion puesta={no} onClick={() => onPon(0)}>No</Opcion>
            </div>
            {si && (
                <label className="mt-2.5 flex items-center gap-2">
                    <span className="text-[11px] text-white/45">¿Cuántos?</span>
                    <input type="number" min="1" value={valor}
                           onChange={e => onPon(Number(e.target.value) || 0)}
                           className="w-24 rounded-lg border border-white/10 bg-white/[0.04]
                                      px-2 py-1 text-right text-[13px] text-white/85" />
                    <span className="text-[11px] text-white/35">{p.unidad}</span>
                </label>
            )}
            {no && (
                <p className="mt-2 text-[10.5px] text-white/35">{p.siNo}</p>
            )}
        </div>
    );
}

function Numero({ p, valor, onPon }) {
    return (
        <label className="mt-2.5 flex items-center gap-2">
            <input type="number" min="0"
                   value={valor === undefined ? p.propuesto : valor}
                   onChange={e => onPon(Number(e.target.value) || 0)}
                   className="w-28 rounded-lg border border-white/10 bg-white/[0.04]
                              px-2 py-1 text-right text-[13px] text-white/85" />
            <span className="text-[11px] text-white/35">{p.unidad}</span>
        </label>
    );
}

function Opcion({ puesta, onClick, children }) {
    return (
        <button onClick={onClick}
                className={`rounded-lg border px-4 py-1.5 text-[12px] font-bold ${
                    puesta ? 'border-brand/50 bg-brand/15 text-white/90'
                           : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80'}`}>
            {children}
        </button>
    );
}


// ─────────────────────────────────────────────────────────────────────────────
// La CALDERA EXISTENTE, y el botón que la lee de su placa.
//
// Es el único bloque de la ficha que puede salir VACÍO por falta de un dato que
// no está en ningún campo del expediente: la potencia. Está en la placa, y su
// foto ya está en Drive desde que el instalador la subió.
//
// El botón se pinta SIEMPRE, también con el equipo ya resuelto: la marca y el
// modelo que hay puestos pueden venir de lo que alguien tecleó al dar de alta la
// oportunidad, y contrastarlos con la etiqueta es justo lo que se hace en la
// visita. Lo que cambia es el tono — con el equipo resuelto no urge.
// ─────────────────────────────────────────────────────────────────────────────
function Instalacion({ equipo, placa, leyendo, onLeer, fase = 'inicial',
                       puedeLeerPlaca = true }) {
    const l = placa?.leido;
    //: En el CEE FINAL el generador es la AEROTERMIA, y la placa que se lee con
    //: IA es la de la caldera VIEJA: ahí ese botón no pinta nada — el equipo
    //: nuevo sale del catálogo, con su SCOP ensayado.
    const esFinal = fase === 'final';
    return (
        <div>
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    {esFinal ? 'Aerotermia nueva' : 'Caldera existente'}
                </span>
                {equipo ? (
                    <span className="text-[12px] font-bold text-white/85">
                        {equipo.nombre}
                        <span className="ml-2 font-normal text-white/45">
                            {equipo.combustible} · {equipo.rend_combustion} % · {enKw(equipo.potencia)}
                        </span>
                    </span>
                ) : (
                    <span className="text-[12px] text-amber-300/90">
                        No se va a escribir: falta algún dato
                    </span>
                )}

                {!esFinal && puedeLeerPlaca && (
                    <button
                        onClick={() => onLeer?.(false)}
                        disabled={leyendo}
                        className={`ml-auto rounded-lg border px-3 py-1.5 text-[10px] font-black
                                    uppercase tracking-widest disabled:opacity-40
                            ${equipo
                                ? 'border-white/10 text-white/45 hover:border-white/30 hover:text-white'
                                : 'border-brand/50 text-brand hover:bg-brand/10'}`}>
                        {leyendo ? 'Leyendo la foto…' : '📷 Leer la placa'}
                    </button>
                )}
            </div>

            {!esFinal && !puedeLeerPlaca && !equipo && (
                <p className="mt-2 text-[11.5px] text-white/45">
                    Teclea marca, modelo, combustible, rendimiento y potencia aquí debajo:
                    en un CEE suelto no hay expediente de obra del que sacarlos.
                </p>
            )}

            {!esFinal && placa?.error && (
                <p className="mt-2 text-[11.5px] text-red-300">{placa.error}</p>
            )}

            {!esFinal && l && (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
                        <Leido rotulo="Marca" v={l.marca} />
                        <Leido rotulo="Modelo" v={l.modelo} />
                        <Leido rotulo="Nº de serie" v={l.numero_serie} />
                        <Leido rotulo="Potencia" v={enKw(placa.potencia_kw)} />
                    </dl>

                    {/* La LÍNEA LITERAL de la placa. Es la evidencia: con ella se
                        comprueba el número sin abrir la foto, y es lo que separa
                        «lo pone la placa» de «lo ha dicho una máquina». */}
                    {l.potencia_texto && (
                        <p className="mt-1.5 font-mono text-[11px] text-white/40">
                            «{l.potencia_texto}»
                            {placa.potencia_candidatos?.length > 1 && (
                                <span className="ml-2 not-italic">
                                    → se toma {enKw(placa.potencia_kw) || 'la que elijas'}
                                    {placa.potencia_base === 'util' ? ' (potencia útil)' : ''}
                                </span>
                            )}
                        </p>
                    )}
                    <p className="mt-1 text-[10.5px] text-white/30">
                        Leído de: {(placa.fotos || []).map(f => f.name).join(' · ') || '—'}
                    </p>

                    {placa.conflictos?.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-[11.5px] text-amber-200/85">
                            {placa.conflictos.map(c => (
                                <li key={c.campo}>
                                    · {c.etiqueta}: en el expediente «{c.actual}», en la placa
                                    «{c.leido}». No se toca lo escrito — corrígelo en Instalación
                                    si la placa tiene razón.
                                </li>
                            ))}
                        </ul>
                    )}
                    {placa.avisos?.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-[11.5px] text-amber-200/85">
                            {placa.avisos.map((a, i) => <li key={i}>· {a}</li>)}
                        </ul>
                    )}

                    <div className="mt-2 flex items-center gap-3">
                        {placa.propuesta?.length > 0 && !placa.escrito?.length && (
                            <button
                                onClick={() => onLeer?.(true)}
                                disabled={leyendo}
                                className="rounded-lg bg-brand px-3 py-1.5 text-[10px] font-black
                                           uppercase tracking-widest text-black disabled:opacity-40
                                           hover:brightness-110">
                                Escribirlo en el expediente ({placa.propuesta.length})
                            </button>
                        )}
                        {placa.escrito?.length > 0 && (
                            <span className="text-[11.5px] text-emerald-300">
                                ✓ Escrito en la instalación del expediente
                            </span>
                        )}
                        {!placa.propuesta?.length && !placa.escrito?.length && (
                            <span className="text-[11.5px] text-white/40">
                                Nada que rellenar: el expediente ya lo tiene todo.
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

//: En castellano el decimal es una COMA. El número que viaja al `.cex` conserva
//: el punto, que es lo que escribe el propio CE3X en sus ficheros (`V24.0`).
const enKw = (v) => (v ? `${String(v).replace('.', ',')} kW` : null);

function Leido({ rotulo, v }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <dt className="text-white/35">{rotulo}</dt>
            <dd className={v ? 'font-bold text-white/85' : 'text-white/25'}>{v || 'no se lee'}</dd>
        </div>
    );
}

/** Medio segundo en blanco se lee como que el apartado está vacío. */
function Cargando() {
    return (
        <Ventana titulo="Un momento">
            <p className="animate-pulse text-[12.5px] text-white/40">
                Componiendo lo que se va a escribir en el <code>.cex</code>…
            </p>
        </Ventana>
    );
}

//: El título NO es el mismo en los dos casos: «lo que no es una medida» es lo
//: que contesta el motor DESPUÉS de escribir el fichero, y antes de generar lo
//: que hay es la ficha diciendo qué va a salir. Con el mismo rótulo, uno de los
//: dos miente.
function Avisos({ lista, titulo = 'Lo que no es una medida' }) {
    return (
        <details className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] px-4 py-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-amber-300">
                {titulo} ({lista.length})
            </summary>
            <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-amber-100/80">
                {lista.map((a, i) => <li key={i}>· {a}</li>)}
            </ul>
        </details>
    );
}

function Franja({ tono, children }) {
    const estilo = {
        red: 'border-red-500/30 bg-red-500/[0.07] text-red-300',
        amber: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200',
    }[tono];
    return (
        <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${estilo}`}>
            {children}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que dice cada apartado de CE3X, con ESTE expediente delante.
//
// Los rótulos son los de CE3X y su orden también: quien usa esta pantalla lleva
// años con esas seis pestañas en la cabeza. Lo que cambia es la SEGUNDA línea,
// que dice en qué estado está cada una — una barra en la que todo pone siempre
// lo mismo se deja de leer a la segunda vez.
//
// REGLA — se dice lo que el expediente ya sabe, nunca un rótulo fijo. Sale de la
// ficha (que la compone el backend) y del plano; si aquí se calculara otra vez,
// la barra y la pantalla acabarían diciendo cosas distintas de lo mismo.
//
// REGLA — `! falta X` solo cuando BLOQUEA de verdad. Lo que se puede corregir
// dentro de CE3X va como aviso, no como falta: un rojo que no significa nada se
// ignora al tercer día.
// ─────────────────────────────────────────────────────────────────────────────
function construirPestanas({ ficha, resumen, entrada, medidas }) {
    const f = ficha?.ficha;
    const catalogo = ficha?.medidas || [];
    const marcadas = medidas || catalogo.filter(m => m.porDefecto && m.disponible).map(m => m.id);

    // La ficha tarda medio segundo en volver del servidor: hasta entonces no se
    // afirma nada de lo que ella sabe.
    const esperando = { estado: '…', tono: 'apagado' };
    const sinRellenar = (obj, omitir = []) => Object.entries(obj || {})
        .filter(([k]) => !omitir.includes(k))
        .filter(([, v]) => v?.valor === null || v?.valor === undefined || v?.valor === '')
        .length;

    const administrativos = !f ? esperando
        : !f.tecnico ? { estado: '! falta el técnico', tono: 'aviso' }
        : sinRellenar(f.administrativos)
            ? { estado: `${sinRellenar(f.administrativos)} sin rellenar`, tono: 'aviso' }
            : { estado: '✓ completo', tono: 'ok' };

    // Las dos imágenes de portada no cuentan: el .cex es válido sin ellas y el
    // certificador las pone en CE3X si Catastro no las tiene.
    const nGenerales = f ? sinRellenar(f.generales, ['foto_edificio', 'plano_situacion']) : 0;
    const generales = !f ? esperando
        : nGenerales ? { estado: `${nGenerales} sin rellenar`, tono: 'aviso' }
        : { estado: '✓ completo', tono: 'ok' };

    // Una fachada sin rumbo PARA el `.cex`, así que va por delante de lo que
    // solo está por confirmar. Sin esto solo se veía pulsando esa pared.
    const envolvente = !entrada ? { estado: '! falta la entrada', tono: 'aviso' }
        : resumen.sinRumbo
            ? { estado: resumen.sinRumbo === 1 ? '! una fachada sin rumbo'
                                               : `! ${resumen.sinRumbo} fachadas sin rumbo`,
                tono: 'aviso' }
        : resumen.dudosos ? { estado: `${resumen.dudosos} por confirmar`, tono: 'aviso' }
        : resumen.sinTocar ? { estado: `${resumen.sinTocar} sin mirar`, tono: 'aviso' }
        : { estado: '✓ completo', tono: 'ok' };

    // QUÉ falta viene en ESTRUCTURA desde la ficha (`instalaciones_falta`), no
    // de leer el aviso: eso se rompe la primera vez que alguien lo redacte mejor.
    const instalaciones = !f ? esperando
        : f.instalaciones?.[0] ? { estado: '✓ completo', tono: 'ok' }
        : { estado: `! ${f.instalaciones_falta || 'falta un dato'}`, tono: 'aviso' };

    const mejora = !catalogo.length ? esperando
        : { estado: marcadas.length === 0 ? 'ninguna'
            : marcadas.length === 1 ? '1 elegida' : `${marcadas.length} elegidas`,
            tono: 'apagado' };

    return [
        { id: 'administrativos', etiqueta: 'Datos administrativos', ...administrativos,
          ayuda: 'El titular, la dirección y el técnico que firma' },
        { id: 'generales', etiqueta: 'Datos generales', ...generales,
          ayuda: 'Año, normativa, zona climática, superficie y transmitancias' },
        { id: 'envolvente', etiqueta: 'Envolvente térmica', ...envolvente,
          ayuda: 'El plano: por dónde se entra, qué es cada pared y sus huecos' },
        { id: 'instalaciones', etiqueta: 'Instalaciones', ...instalaciones,
          ayuda: 'El generador que se escribe en esta fase' },
        { id: 'medidas', etiqueta: 'Medidas de mejora', ...mejora,
          ayuda: 'Lo que el .cex propone; su ahorro lo calcula CE3X' },
        { id: 'economico', etiqueta: 'Análisis económico', estado: 'lo pone CE3X',
          tono: 'apagado', ayuda: 'No se escribe aquí: lo calcula CE3X' },
    ];
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** ¿Queda algo sin guardar que IMPORTE? `sel` no: es dónde se está mirando. */
function hayCambios(trabajo, ajustes, guardadoJson) {
    if (!guardadoJson) return true;
    // `sel` se descarta copiando el resto: desestructurarlo para tirarlo deja
    // una variable sin usar que el linter marca con razón.
    const sinSel = (t) => Object.fromEntries(
        Object.entries(t || {}).filter(([k]) => k !== 'sel'));
    try {
        return JSON.stringify(sinSel({ ...trabajo, ajustes }))
            !== JSON.stringify(sinSel(JSON.parse(guardadoJson)));
    } catch { return true; }
}





export default EnvolventeView;
