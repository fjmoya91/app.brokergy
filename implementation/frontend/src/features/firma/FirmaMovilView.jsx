import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SignaturePad from './SignaturePad';

/**
 * Lo que ve el TELÉFONO: firmar y devolver la firma al ordenador.
 *
 * Port de `ScannerApp/src/renderer/views/PhoneSign.tsx`. Aquí NO se ve el
 * documento, a propósito: el PDF no sale de la sesión del ordenador y solo sube
 * el PNG de la firma. De paso evita pedirle a nadie que busque el "Fdo." dando
 * pellizcos a una pantalla de seis pulgadas — eso ya lo ha leído en el PC, que
 * es donde el documento se ve entero.
 *
 * La hoja es el MISMO `SignaturePad` del ordenador, así que la tinta es idéntica
 * — y en un móvil sale ganando: un lápiz (Apple Pencil, S Pen) entrega PRESIÓN
 * de verdad, que un ratón no puede dar.
 */

/**
 * RELATIVA, también en desarrollo.
 *
 * El resto de vistas públicas apuntan a `http://localhost:3000` cuando se
 * trabaja en local, y les vale porque se abren en el mismo ordenador que corre
 * el backend. Esta se abre en el TELÉFONO, y ahí `localhost` es el propio
 * teléfono: la firma no llegaría a ninguna parte. En relativo la sirve el mismo
 * origen del que vino la página — el proxy de Vite en desarrollo, el propio
 * servidor en producción.
 */
const API_URL = '/api/public';

const Icono = ({ d, className = 'w-6 h-6', w = 2 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={w}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D_GIRAR = 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
const D_OK = 'M5 13l4 4L19 7';

const Pantalla = ({ children }) => (
    <div className="min-h-screen bg-bkg-deep flex flex-col items-center justify-center gap-5 p-8 text-center">
        {children}
    </div>
);

export function FirmaMovilView({ token }) {
    const [info, setInfo] = useState(null);
    const [paso, setPaso] = useState('cargando'); // cargando|firmando|enviando|hecho|error
    const [error, setError] = useState(null);
    const [vertical, setVertical] = useState(false);
    const [firmarIgual, setFirmarIgual] = useState(false);

    useEffect(() => {
        axios.get(`${API_URL}/firma-movil/${token}`)
            .then(r => {
                setInfo(r.data);
                setPaso(r.data.yaFirmada ? 'hecho' : 'firmando');
            })
            .catch(e => {
                setError(e.response?.data?.error || 'No se ha podido abrir el enlace.');
                setPaso('error');
            });
    }, [token]);

    /**
     * Se mira la FORMA de la pantalla, no la orientación del aparato: una tableta
     * de pie es más ancha que muchos móviles tumbados, y ahí no hay nada que
     * pedirle a nadie.
     */
    useEffect(() => {
        const mirar = () => setVertical(window.innerHeight > window.innerWidth);
        mirar();
        window.addEventListener('resize', mirar);
        window.addEventListener('orientationchange', mirar);
        return () => {
            window.removeEventListener('resize', mirar);
            window.removeEventListener('orientationchange', mirar);
        };
    }, []);

    const enviar = async (ink) => {
        setPaso('enviando');
        setError(null);
        try {
            await axios.post(`${API_URL}/firma-movil/${token}`, { dataUrl: ink.dataUrl });
            setPaso('hecho');
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo enviar la firma. Comprueba la conexión.');
            setPaso('firmando');
        }
    };

    if (paso === 'cargando') {
        return (
            <Pantalla>
                <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <p className="text-white/40 text-xs font-black uppercase tracking-widest">Abriendo la hoja de firma…</p>
            </Pantalla>
        );
    }

    if (paso === 'error') {
        return (
            <Pantalla>
                <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                    <Icono d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-8 h-8 text-red-400" />
                </div>
                <h1 className="text-lg font-black text-white uppercase tracking-widest">Enlace no válido</h1>
                <p className="text-white/45 text-sm max-w-xs leading-relaxed">{error}</p>
            </Pantalla>
        );
    }

    if (paso === 'hecho') {
        return (
            <Pantalla>
                <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <Icono d={D_OK} className="w-10 h-10 text-emerald-400" w={2.5} />
                </div>
                <h1 className="text-lg font-black text-white uppercase tracking-widest">Firma enviada</h1>
                <p className="text-white/45 text-sm max-w-xs leading-relaxed">
                    Ya puedes dejar el teléfono. <strong className="text-white">Sigue en el ordenador</strong>, que allí continúa el proceso.
                </p>
            </Pantalla>
        );
    }

    if (paso === 'enviando') {
        return (
            <Pantalla>
                <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <p className="text-white/40 text-xs font-black uppercase tracking-widest">Enviando la firma…</p>
            </Pantalla>
        );
    }

    return (
        <>
            {error && (
                <div className="fixed top-0 inset-x-0 z-[90] m-3 flex gap-2 bg-red-500/15 border border-red-500/30 text-red-200 rounded-2xl px-4 py-3 backdrop-blur">
                    <Icono d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 shrink-0" />
                    <p className="text-xs flex-1">{error}</p>
                </div>
            )}

            {/* La hoja se monta YA, aunque el teléfono esté de pie: así, al
                girarlo, aparece hecha y con su tamaño. El aviso va encima. */}
            <SignaturePad
                titulo={info?.etiqueta}
                textoAceptar="Enviar firma"
                onAccept={enviar}
            />

            {/* Portaleado, como el propio `SignaturePad`: la hoja se monta en
                `document.body` y esto vivía dentro de `#root`, que apila ANTES —
                así que el aviso quedaba DEBAJO de la hoja y no se veía, por mucho
                z-index que llevara. Medido en un teléfono de 375x812. */}
            {vertical && !firmarIgual && createPortal(
                <div className="fixed inset-0 z-[90] bg-bkg-deep text-white flex flex-col items-center justify-center gap-6 p-8 text-center">
                    <Icono d={D_GIRAR} className="w-16 h-16 text-brand animate-pulse" w={1.5} />
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-widest">Gira el teléfono</h2>
                        <p className="text-sm text-white/50 mt-2 max-w-xs leading-relaxed">
                            En horizontal tienes toda la pantalla para firmar, y la firma sale mucho mejor.
                        </p>
                    </div>
                    {/* Salida discreta: en una tableta grande, o con el bloqueo de
                        rotación puesto, firmar de pie es razonable y no hay que
                        dejar a nadie encerrado. */}
                    <button onClick={() => setFirmarIgual(true)} className="text-[11px] text-white/35 underline underline-offset-4 font-bold uppercase tracking-widest">
                        Firmar así igualmente
                    </button>
                </div>,
                document.body,
            )}
        </>
    );
}

export default FirmaMovilView;
