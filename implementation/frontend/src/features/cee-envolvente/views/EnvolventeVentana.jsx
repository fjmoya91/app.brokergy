import { useEffect, useState } from 'react';
import { ThemeToggle } from '../../../components/ThemeToggle';
import axios from 'axios';
import { EnvolventeView } from './EnvolventeView';
import { PestanasCe3x } from '../components/PestanasCe3x';
import { buildInstalacionAddress } from '../../expedientes/utils/docGenerators';
import { EnlacesInmueble } from '../../../components/EnlacesInmueble';

// ─────────────────────────────────────────────────────────────────────────────
// La envolvente en su PROPIA VENTANA (`/envolvente/:expedienteId`).
//
// POR QUÉ NO ES UN POPUP: sobre el plano se pasa un rato largo —las ventanas y
// las puertas se ponen una a una— y a mitad hace falta mirar otra cosa del
// expediente: qué dice la instalación, el teléfono del cliente, el CEE
// anterior. Con un modal, eso obliga a cerrar y perder el sitio. En una
// pestaña aparte se consulta la app al lado y aquí no se mueve nada.
//
// Es una ruta INTERNA, no pública: exige sesión igual que el expediente. Si se
// abre sin sesión, sale el login de siempre y al entrar se aterriza aquí.
// ─────────────────────────────────────────────────────────────────────────────

export function EnvolventeVentana({ expedienteId }) {
    const [expediente, setExpediente] = useState(null);
    const [error, setError] = useState(null);
    const [aviso, setAviso] = useState(null);
    // Los apartados de CE3X y a dónde lleva cada uno. Se pintan aquí —pegados a
    // la cabecera, como en CE3X— pero lo que dicen y lo que hacen solo se sabe
    // dentro de la vista: son la ficha y el plano.
    const [barra, setBarra] = useState(null);

    useEffect(() => {
        let vivo = true;
        axios.get(`/api/expedientes/${expedienteId}`)
            .then(({ data }) => { if (vivo) setExpediente(data); })
            .catch(e => {
                if (vivo) setError(e.response?.status === 404
                    ? 'Ese expediente no existe.'
                    : (e.response?.data?.error || 'No se ha podido abrir el expediente.'));
            });
        return () => { vivo = false; };
    }, [expedienteId]);

    // El título de la pestaña dice DE QUÉ expediente es: con dos o tres
    // abiertas, «BROKERGY» en todas no distingue ninguna.
    useEffect(() => {
        if (expediente?.numero_expediente) {
            document.title = `Envolvente · ${expediente.numero_expediente}`;
        }
        return () => { document.title = 'BROKERGY · Ingeniería Energética'; };
    }, [expediente]);

    // El icono de la pestaña, también el de CE3X: con el expediente abierto en
    // una pestaña y la envolvente en otra, el favicon es lo que las distingue
    // antes que el título, que se corta.
    useEffect(() => {
        const icono = document.querySelector("link[rel~='icon']");
        if (!icono) return;
        const antes = icono.getAttribute('href');
        icono.setAttribute('href', '/logo-ce3x.svg');
        return () => icono.setAttribute('href', antes);
    }, []);

    if (error) {
        return (
            <Centro>
                <p className="text-sm text-red-300">{error}</p>
            </Centro>
        );
    }
    if (!expediente) {
        return (
            <Centro>
                <p className="animate-pulse text-xs font-bold uppercase tracking-widest text-brand">
                    Cargando el expediente…
                </p>
            </Centro>
        );
    }

    // DÓNDE está el inmueble, con su referencia: de aquí salen el subtítulo y los
    // dos enlaces. Es la fuente única de la dirección de instalación, que NO es
    // el domicilio del cliente.
    const donde = buildInstalacionAddress(expediente) || {};

    return (
        <div className="min-h-screen bg-bkg-base text-white">
            {/* La cabecera y la barra de apartados van JUNTAS y pegadas arriba:
                así la barra no necesita saber lo que mide la cabecera, que es
                el número mágico que se descuadra en cuanto alguien cambia el
                logo. */}
            <div className="sticky top-0 z-10">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2
                                   border-b border-white/[0.07] bg-bkg-deep/95 px-5 py-3
                                   backdrop-blur">
                    <img src="/logo-ce3x.svg" alt="CE3X" className="h-9 w-9 shrink-0" />
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-black uppercase tracking-widest">
                            Envolvente térmica
                        </h1>
                        <p className="truncate text-[11px] text-white/40">
                            {subtitulo(expediente)}
                        </p>
                    </div>

                    {/* La referencia y sus dos enlaces, los mismos que la ficha
                        técnica de la oportunidad. Aquí se está midiendo ESTE
                        inmueble: comprobar en Catastro lo que Catastro dice de
                        él —y ver dónde cae— es parte del trabajo, y salir de la
                        ventana a buscarlo pierde el sitio del plano.

                        La referencia va seleccionable y solo en pantallas
                        anchas: en una estrecha empuja fuera los botones, que es
                        lo que de verdad se pulsa. */}
                    {/* La referencia y sus dos enlaces van en UN grupo, y el
                        `ml-auto` es del grupo y no de la referencia: ella se
                        esconde por debajo de 1536 px —en una pantalla estrecha
                        empuja fuera los botones, que es lo que de verdad se
                        pulsa— y con el margen puesto en ella, al ocultarse se
                        llevaba por delante el alineado a la derecha de TODA la
                        cabecera. */}
                    <div className="ml-auto flex items-center gap-2">
                        {donde.refCatastral && (
                            <code className="hidden shrink-0 select-all rounded-lg border
                                             border-white/10 bg-white/[0.04] px-2.5 py-2
                                             font-mono text-[11px] font-bold tracking-tight
                                             text-white/70 2xl:inline-block">
                                {donde.refCatastral}
                            </code>
                        )}
                        {/* ⚠️ `buildInstalacionAddress` devuelve un OBJETO y la
                            dirección entera es su campo `full`: pasándole el
                            objeto, Maps se abría buscando "[object Object]". */}
                        <EnlacesInmueble compacto rc={donde.refCatastral}
                                         direccion={donde.full} />
                    </div>

                    {aviso && (
                        <span className="truncate text-[11px] text-emerald-300">
                            {aviso}
                        </span>
                    )}
                    {/* El selector de tema. Esta ventana no es el
                        `DashboardLayout` —es propia—, así que no heredaba el del
                        sidebar: para ver la app en claro había que salir. Y es
                        justo aquí donde se mira el contraste, con el plano
                        delante. */}
                    <ThemeToggle collapsed className="!h-9 !w-9" />
                    <a href={`/?tab=expedientes&exp=${expedienteId}`}
                       className="shrink-0 rounded-lg border border-white/10
                                  px-3 py-2 text-[10px] font-black uppercase tracking-widest
                                  text-white/45 hover:border-white/30 hover:text-white">
                        Ver el expediente ↗
                    </a>
                </header>
                <PestanasCe3x {...(barra || {})} />
            </div>

            <main className="mx-auto max-w-[1400px] px-5 py-5">
                <EnvolventeView expediente={expediente} onAviso={setAviso}
                                onPestanas={setBarra} />
            </main>
        </div>
    );
}

/**
 * De qué obra es esta pantalla: el expediente, el titular y DÓNDE está.
 *
 * La dirección es la que hace falta en el sitio: con dos o tres ventanas
 * abiertas, «26RES060_186 · ISAAC PLIEGO» no dice cuál es la casa que se tiene
 * delante, y es lo primero que se comprueba al llegar a una visita.
 *
 * Sale de `buildInstalacionAddress`, que es la fuente única de la dirección de
 * INSTALACIÓN en toda la app —no la del cliente, que puede ser otra (regla del
 * CIFO y del Anexo Fotográfico)—.
 */
function subtitulo(expediente) {
    const cliente = expediente.cliente?.nombre_razon_social
        || expediente.clientes?.nombre_razon_social;
    const dir = buildInstalacionAddress(expediente) || {};
    const sitio = [dir.calle, dir.municipio].filter(Boolean).join(', ');
    return [expediente.numero_expediente, cliente, sitio].filter(Boolean).join(' · ');
}

function Centro({ children }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-bkg-base">{children}</div>
    );
}

export default EnvolventeVentana;
