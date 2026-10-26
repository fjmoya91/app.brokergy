import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FirmarCifoCard } from '../components/FirmarCifoCard';
import { SubirRiteCard } from '../components/SubirRiteCard';
import { MarcoInstalador, CargandoInstalador, EnlaceNoValido, DatosObra, CheckDibujado, IcoPluma, IcoPapel, IcoChev, IcoOk } from '../components/MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// /instalador/:id — TODO lo que el instalador tiene que hacer en esta obra, en
// un solo sitio: firmar el Certificado CIFO y devolvernos la legalización RITE.
//
// Antes eran dos enlaces (/subir-cifo y /subir-rite) enviados en dos mensajes
// distintos para dos tareas que se hacen del tirón. Un enlace por tarea es un
// enlace que se pierde: el instalador abre el primero, resuelve lo que ve, y de
// lo otro no se entera nadie hasta que alguien lo reclama por teléfono.
//
// REGLA — solo se enseña lo que QUEDA. Lo ya recibido baja a una línea con su
// ✓: es la prueba de que llegó (que es lo primero que se pregunta), pero no
// puede ocupar el sitio de lo que falta.
//
// REGLA — la superficie de cada tarea es la MISMA que la de su página suelta
// (FirmarCifoCard / SubirRiteCard). Si aquí se firmara distinto que allí, un
// CIFO rechazado se podría volver a firmar por el camino que no comprueba.
//
// Estilo «carta de pago» (regla 164), con el marco común de las páginas del
// instalador (MarcoInstalador). Demo sin API: /instalador/demo, con `?refirma`,
// `?bloqueado`, `?rite-hecho` o `?todo`.
// ─────────────────────────────────────────────────────────────────────────────

const TAREAS = {
    cifo: {
        titulo: 'Firmar el Certificado CIFO',
        resumen: 'Se firma aquí mismo con tu certificado electrónico.',
        hechoTexto: 'Certificado CIFO firmado: recibido',
        Icono: IcoPluma,
    },
    rite: {
        titulo: 'Registrar el RITE y enviarnos el certificado',
        resumen: 'Sube el certificado tramitado (y la memoria firmada).',
        hechoTexto: 'Legalización RITE: recibida',
        Icono: IcoPapel,
    },
};

const DEMO_ID = 'demo';
function infoDemo() {
    const q = new URLSearchParams(window.location.search);
    const todo = q.has('todo');
    return {
        numero_expediente: '26RES060_241', cliente: 'MARÍA GARCÍA LÓPEZ',
        direccion: 'CL MAYOR 12, 13001 CIUDAD REAL', instalador: 'INSTALACIONES EJEMPLO SL',
        tareas: [
            { key: 'cifo', hecho: todo, refirma: q.has('refirma'), bloqueado: q.has('bloqueado'), rechazo: q.has('bloqueado') ? { motivo: 'la fecha de fin de obra no coincide con la factura' } : null },
            { key: 'rite', hecho: todo || q.has('rite-hecho'), pide_memoria: true, memoria_subida: false, certificado_subido: false },
        ],
    };
}

const NUM = ['una', 'dos', 'tres'];

export function SubirInstaladorView({ expedienteId }) {
    const esDemo = expedienteId === DEMO_ID;
    const [info, setInfo] = useState(() => (esDemo ? infoDemo() : null));
    const [loadError, setLoadError] = useState(null);
    // Se abre sola la primera que quede pendiente: con una sola tarea, el
    // instalador no tiene que pulsar nada para empezar.
    const primeraPendiente = (data, prev) => {
        const pend = (data?.tareas || []).filter(t => !t.hecho);
        return (prev && pend.some(t => t.key === prev)) ? prev : (pend[0]?.key || null);
    };
    const [abierta, setAbierta] = useState(() => primeraPendiente(info, null));   // tarea desplegada

    const aplica = (data) => {
        setInfo(data);
        setAbierta(prev => primeraPendiente(data, prev));
    };

    const cargar = () => axios.get(`${API_URL}/instalador/${expedienteId}`)
        .then(r => aplica(r.data))
        .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));

    // Tras subir algo se vuelve a pedir el estado. En la prueba, lo enviado se da por recibido.
    const load = () => {
        if (!esDemo) return cargar();
        aplica({ ...info, tareas: info.tareas.map(t => (t.key === abierta ? { ...t, hecho: true } : t)) });
        return Promise.resolve();
    };

    useEffect(() => { if (!esDemo) cargar(); }, [expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!info && !loadError) return <CargandoInstalador />;
    if (loadError) return <EnlaceNoValido texto={loadError} />;

    const tareas = info.tareas || [];
    const pendientes = tareas.filter(t => !t.hecho);
    const hechas = tareas.filter(t => t.hecho);
    const todoHecho = tareas.length > 0 && pendientes.length === 0;

    const titulo = todoHecho
        ? <>Todo <span className="in-mark">recibido</span></>
        : !tareas.length
            ? <>Nada <span className="in-mark">pendiente</span></>
            : <>{pendientes.length > 1 ? 'Te quedan' : 'Te queda'} <span className="in-mark">{NUM[pendientes.length - 1] || pendientes.length} {pendientes.length > 1 ? 'cosas' : 'cosa'}</span></>;
    const sub = todoHecho
        ? <>Tenemos todo lo tuyo del expediente <b>{info.numero_expediente}</b>. Seguimos nosotros con la tramitación.</>
        : !tareas.length
            ? <>Ahora mismo no hay nada pendiente por tu parte en este expediente.</>
            : pendientes.length > 1
                ? <>Por tu parte en esta obra. <b>Las dos se resuelven aquí</b>, sin cambiar de enlace.</>
                : <>Por tu parte en esta obra, y se resuelve aquí mismo.</>;

    return (
        <MarcoInstalador numero={info.numero_expediente} demo={esDemo}>
            {todoHecho
                ? <div className="in-in" style={{ marginTop: 6 }}><CheckDibujado /></div>
                : <p className="in-eyebrow in-in" style={{ margin: '18px 2px 0' }}>Para el instalador</p>}
            <h1 className="in-display in-h1 in-in">{titulo}</h1>
            <p className="in-sub in-in in-in-2">{sub}</p>

            <div className="in-stack in-in in-in-2">
                {/* PENDIENTES — una tarjeta desplegable por tarea */}
                {pendientes.map((t, i) => {
                    const meta = TAREAS[t.key];
                    const open = abierta === t.key;
                    return (
                        <div key={t.key} className={`in-card in-tarea ${open ? 'in-tarea-abierta' : ''}`}>
                            {open && <div className="in-filete-fino" />}
                            <button type="button" className="in-tarea-cab" aria-expanded={open} onClick={() => setAbierta(open ? null : t.key)}>
                                <span className="in-ico-tile"><meta.Icono /></span>
                                <span className="in-tarea-cuerpo">
                                    <span className="in-tarea-n">{pendientes.length > 1 ? `Tarea ${i + 1} de ${pendientes.length}` : 'Pendiente'}</span>
                                    <span className="in-tarea-t">{t.refirma ? 'Firmar de nuevo el Certificado CIFO' : meta.titulo}</span>
                                    <span className="in-tarea-r">{t.bloqueado ? 'Lo estamos corrigiendo: de momento no tienes que hacer nada.' : (t.aviso || meta.resumen)}</span>
                                </span>
                                <span className="in-chev"><IcoChev size={20} /></span>
                            </button>
                            {open && (
                                <div className="in-tarea-dentro">
                                    {t.key === 'cifo'
                                        ? <FirmarCifoCard expedienteId={expedienteId} demo={esDemo} info={{ ...info, bloqueado: t.bloqueado, rechazo: t.rechazo, refirma: t.refirma }} onDone={load} />
                                        : <SubirRiteCard expedienteId={expedienteId} demo={esDemo} info={t} onDone={load} pideMemoria={!!t.pide_memoria} />}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* YA RECIBIDO — una línea, no una tarjeta */}
                {hechas.map(t => (
                    <div key={t.key} className="in-hecha">
                        <span className="in-ico-tile"><IcoOk size={18} /></span>
                        {TAREAS[t.key].hechoTexto}
                    </div>
                ))}

                <DatosObra filas={[['Cliente', info.cliente], ['Instalación', info.direccion], ['Instalador', info.instalador]]} />
            </div>
        </MarcoInstalador>
    );
}
