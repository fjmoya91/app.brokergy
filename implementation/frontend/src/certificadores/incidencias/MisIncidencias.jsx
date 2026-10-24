// ─── MisIncidencias — /incidencias: lo que el certificador nos ha contado ────
// GET /api/certapp/feedback → { incidencias } (SOLO las suyas; el backend filtra
// por su cuenta). Cada una con la fecha, el tipo, el texto, la obra si la hay, el
// estado en palabras llanas y la respuesta de BROKERGY. `?id=` (el enlace del
// email «te hemos respondido») lleva a esa y la resalta.
// Con la API caída se dice («no hemos podido cargar»), nunca «no tienes ninguna».
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, comoLista, useCarga } from '../api';
import { useRuta } from '../router';
import { ErrorRed, Esqueleto } from '../ui/piezas';
import { IcoMas } from '../ui/Iconos';
import { FormIncidencia, ItemIncidencia } from './Incidencias';
import { estadoInc } from './comun';

const FILTROS = [
    { id: 'todas', label: 'Todas', f: () => true },
    { id: 'abiertas', label: 'Abiertas', f: (x) => estadoInc(x.estado).abierta },
    { id: 'cerradas', label: 'Cerradas', f: (x) => !estadoInc(x.estado).abierta },   // Resuelta o Cerrada
];

export default function MisIncidencias() {
    const { query } = useRuta();
    const resaltar = query.get('id');
    const [filtro, setFiltro] = useState('todas');
    const [abierta, setAbierta] = useState(false);
    const { datos, error, cargando, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API}/feedback`);
        return comoLista(data, 'incidencias');
    }, []);

    const lista = useMemo(() => datos || [], [datos]);
    const visibles = useMemo(() => lista.filter((FILTROS.find(x => x.id === filtro) || FILTROS[0]).f), [lista, filtro]);

    // Desde el email: a la incidencia que se ha respondido.
    useEffect(() => {
        if (!resaltar || !datos) return;
        document.getElementById(`inc-${resaltar}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [resaltar, datos]);

    return (
        <div className="ca-col">
            <section className="ca-card ca-pad ca-in">
                <div className="ca-filete" />
                <p className="ca-eyebrow" style={{ margin: 0 }}>Mis incidencias</p>
                <h1 className="ca-display ca-h2" style={{ marginTop: 10 }}>Lo que nos has <span className="ca-mark">contado</span></h1>
                <p className="ca-txt">
                    Cada aviso que nos dejas, en qué punto está y lo que te hemos respondido. Cuando contestamos, te llega también un email.
                </p>
                <div className="ca-btns">
                    <button type="button" className="ca-btn ca-btn-pri" onClick={() => setAbierta(true)}><IcoMas /> Contarnos algo</button>
                </div>
                <p className="ca-peq" style={{ marginTop: 12 }}>Si es de un certificado concreto, mejor desde su obra: «¿Algo mal en este certificado?».</p>
            </section>

            {lista.length > 0 && (
                <div className="ca-tabs ca-in-2" role="tablist" aria-label="Filtrar incidencias" style={{ marginTop: 22 }}>
                    {FILTROS.map(x => {
                        const n = lista.filter(x.f).length;
                        return (
                            <button key={x.id} type="button" role="tab" aria-selected={filtro === x.id}
                                className={`ca-tab${filtro === x.id ? ' ca-tab-act' : ''}`} onClick={() => setFiltro(x.id)}>
                                {x.label}{x.id !== 'todas' && n > 0 ? <span className="ca-badge">{n}</span> : null}
                            </button>
                        );
                    })}
                </div>
            )}

            <div style={{ marginTop: 14 }}>
                {cargando && !datos ? (
                    <Esqueleto alto={120} n={3} />
                ) : error && !datos ? (
                    <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido cargar tus incidencias" />
                ) : !lista.length ? (
                    <section className="ca-card ca-pad ca-vacio">
                        <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Aún no nos has contado nada</h2>
                        <p className="ca-txt">Si algo no va, te sobra o lo echas de menos, cuéntanoslo: lo leemos todo y te contestamos aquí.</p>
                    </section>
                ) : !visibles.length ? (
                    <p className="ca-peq">No hay ninguna en «{FILTROS.find(x => x.id === filtro)?.label}».</p>
                ) : (
                    <div className="ca-inc-lista">
                        {visibles.map(f => <ItemIncidencia key={f.id} f={f} resaltada={f.id === resaltar} />)}
                    </div>
                )}
                {error && datos && (
                    <p className="ca-peq" style={{ marginTop: 10 }}>
                        No se ha podido actualizar la lista. <button type="button" className="ca-link" onClick={() => recargar({ silencioso: true })}>Reintentar</button>
                    </p>
                )}
            </div>

            <FormIncidencia abierta={abierta} onCerrar={() => setAbierta(false)} verLista={false}
                onEnviada={() => { setFiltro('todas'); recargar({ silencioso: true }); }} />
        </div>
    );
}
