import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FirmarCeeCard } from '../components/FirmarCeeCard';
import { BorradorCeeModal } from '../../expedientes/components/BorradorCeeModal';

// RELATIVO también en desarrollo, como FirmaMovilView y FirmarAnexosView: esta
// página la abre el CERTIFICADOR desde su ordenador con un enlace nuestro, así
// que apuntar a `localhost:3000` solo sirve si el backend corre justo ahí — y
// deja de poder probarse con un segundo backend en otro puerto. Vite proxea /api.
const API_URL = '/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// PresentarCeeView — /presentar-cee/:expedienteId?token=&phase=
//
// Lo que le queda al certificador cuando Brokergy le da el visto bueno, en los
// dos pasos en que de verdad ocurre: FIRMAR el certificado y PRESENTARLO en el
// Registro. Hasta ahora las dos cosas pasaban fuera de la app y de ahí salían los
// dos fallos que esto corrige — la fecha de firma equivocada y el recuadro de la
// firma puesto a ojo.
//
// REGLA — los pasos van en ORDEN y se ve en cuál está. Presentar un certificado
// sin firmar es presentar un papel que no vale, así que el Paso 2 se enseña
// atenuado mientras el 1 no esté hecho. No se BLOQUEA: puede haberlo firmado por
// su cuenta y venir solo a presentarlo, y un candado ahí sería un callejón sin
// salida a las nueve de la noche.
//
// REGLA — el mismo TOKEN que /subir-cee. Es el mismo técnico, el mismo expediente
// y la misma fase: repartir dos secretos distintos para el mismo trabajo solo
// multiplica los enlaces que se pueden perder.
// ─────────────────────────────────────────────────────────────────────────────
export function PresentarCeeView({ expedienteId, token, fase = 'inicial' }) {
    const [info, setInfo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [borradorAbierto, setBorradorAbierto] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API_URL}/cee-firma/${expedienteId}`,
                { params: { token, phase: fase } });
            setInfo(data);
            setError(null);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo abrir el expediente.');
        } finally {
            setCargando(false);
        }
    }, [expedienteId, token, fase]);

    useEffect(() => { cargar(); }, [cargar]);

    if (cargando) {
        return <Marco><p className="text-[12px] text-white/40 normal-case">Abriendo el expediente…</p></Marco>;
    }
    if (error) {
        return (
            <Marco>
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-4 text-[12px] text-red-300 normal-case leading-snug">
                    {error}
                </div>
            </Marco>
        );
    }

    const firmado = info?.estado === 'firmado';

    return (
        <Marco titulo={`Presentar el ${info?.faseLabel || 'CEE'}`}
               subtitulo={[info?.numeroExpediente, info?.certificador?.nombre].filter(Boolean).join(' · ')}>

            {/* PASO 1 */}
            <Paso n={1} titulo="Firma el certificado" hecho={firmado}>
                <FirmarCeeCard
                    expedienteId={expedienteId} token={token} fase={fase} info={info}
                    onDone={() => cargar()}
                />
            </Paso>

            {/* PASO 2 */}
            <Paso n={2} titulo="Preséntalo en el Registro" atenuado={!firmado}>
                {!firmado && (
                    <p className="text-[11px] text-amber-400/80 normal-case leading-snug mb-3">
                        Todavía no consta firmado. Si ya lo firmaste por tu cuenta, puedes presentarlo igualmente.
                    </p>
                )}
                <p className="text-[12px] text-white/55 normal-case leading-snug mb-3">
                    Abre el borrador: lleva lo que va en cada casilla del formulario, los cuatro
                    documentos listos para descargar ya renombrados, y dónde subir el justificante
                    de registro y el recibo de la tasa cuando los tengas.
                </p>
                <button type="button" onClick={() => setBorradorAbierto(true)}
                        className="w-full px-4 py-3.5 rounded-xl border border-brand/50 bg-brand/15 text-[11px] font-black uppercase tracking-widest text-brand hover:bg-brand hover:text-black transition-colors">
                    📄 Abrir el borrador para presentar
                </button>
            </Paso>

            <BorradorCeeModal
                isOpen={borradorAbierto}
                onClose={() => setBorradorAbierto(false)}
                expedienteId={expedienteId}
                apiBase={`${API_URL}/cee-firma`}
                paramsExtra={{ token }}
                fases={[fase]}
            />
        </Marco>
    );
}

function Marco({ titulo, subtitulo, children }) {
    return (
        <div className="min-h-screen bg-bkg-deep flex items-start justify-center p-4 md:p-8">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-6">
                    <img src="/logo.png" alt="BROKERGY" className="h-9 mx-auto mb-4 opacity-90"
                         onError={e => { e.currentTarget.style.display = 'none'; }} />
                    {titulo && <h1 className="text-lg font-black text-white uppercase tracking-widest">{titulo}</h1>}
                    {subtitulo && <p className="text-[11px] text-white/40 normal-case mt-1">{subtitulo}</p>}
                </div>
                <div className="space-y-4">{children}</div>
            </div>
        </div>
    );
}

function Paso({ n, titulo, hecho = false, atenuado = false, children }) {
    return (
        <div className={`rounded-2xl border bg-white/[0.02] overflow-hidden transition-opacity ${
            hecho ? 'border-emerald-500/25' : 'border-white/[0.08]'
        } ${atenuado ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06]">
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${
                    hecho ? 'bg-emerald-500/20 text-emerald-400' : 'bg-brand/15 text-brand'
                }`}>{hecho ? '✓' : n}</span>
                <span className="text-[12px] font-black text-white uppercase tracking-widest">{titulo}</span>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

export default PresentarCeeView;
