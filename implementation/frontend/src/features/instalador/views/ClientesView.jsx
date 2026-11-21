// ─── Clientes y un cliente (prototipos «Clientes» y «Cliente») ───────────────
// La lista es la de `GET /api/clientes`, que ya filtra lo del partner. El DNI
// nunca sale entero (`dniEnmascarado`); el IBAN ni se enseña. El alta y «Cambiar
// datos» abren los modales de siempre (features/clientes/components), que monta
// quien aloja la app.
import React, { useState } from 'react';
import { useVistaGuardada, useGuardarVista, useScrollLista } from '../../../utils/memoriaVista';
import {
    Icono, Buscador, Esqueleto, AvisoError, iniciales, nombrePropio, sinTildes,
    telHref, waHref, telefonoBonito, dniEnmascarado,
} from '../ui/piezas';
import { resumenObrasCliente } from '../logic/obras';
import { TarjetaObra } from './ObrasView';

export const nombreCliente = (c) => nombrePropio([c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' ')) || 'Sin nombre';
export const obrasDe = (cliente, obras) => (obras || []).filter((o) => o.cliente_id && o.cliente_id === cliente?.id_cliente);

function pasaBusqueda(c, q) {
    const t = sinTildes(q);
    if (!t) return true;
    const tlf = String(c.tlf || '').replace(/\D/g, '');
    const pajar = sinTildes([c.nombre_razon_social, c.apellidos, c.municipio].filter(Boolean).join(' '));
    const cifras = t.replace(/\D/g, '');
    return t.split(/\s+/).every((w) => pajar.includes(w)) || (cifras.length >= 3 && tlf.includes(cifras));
}

export function ClientesView({ clientes, obras, cargando, error, onReintentar, onAbrir, onNuevo }) {
    const memoria = useVistaGuardada('instalador-clientes');
    const [q, setQ] = useState(memoria.q ?? '');
    useGuardarVista('instalador-clientes', { q });
    const vistos = (clientes || []).filter((c) => pasaBusqueda(c, q));
    const lista = useScrollLista('instalador-clientes', false, !cargando && vistos.length > 0);

    return (
        <div ref={lista.ancla} className="ia-pagina estrecha">
            <div className="ia-titulo" style={{ paddingTop: 12 }}>
                <h1 className="ia-display">Clientes</h1>
                {onNuevo && (
                    <button type="button" className="ia-btn ia-btn-tinta ia-btn-peq" onClick={onNuevo}>
                        <Icono n="mas" size={20} grosor={2.4} /> Nuevo cliente
                    </button>
                )}
            </div>
            <Buscador valor={q} onCambio={setQ} placeholder="Busca por nombre o teléfono" etiqueta="Buscar cliente" />

            {cargando ? <Esqueleto alto={72} n={5} /> : error ? <AvisoError onReintentar={onReintentar} /> : !(clientes || []).length ? (
                <div className="ia-card"><div className="ia-vacio">
                    <b>Aún no tienes clientes</b>
                    <p>Cada vez que calcules la ayuda de una obra, su cliente aparecerá aquí.</p>
                </div></div>
            ) : vistos.length === 0 ? (
                <p className="ia-nada">No encuentro a nadie con eso. Prueba con el apellido o el teléfono.</p>
            ) : (
                <section className="ia-card lista" aria-label="Tus clientes">
                    {vistos.map((c, i) => {
                        const suyas = obrasDe(c, obras);
                        const toca = suyas.some((o) => o.quien === 'tu');
                        return (
                            <button key={c.id_cliente} type="button" className={`ia-fila${i === 0 ? ' primera' : ''}`} style={{ minHeight: 72 }}
                                onClick={() => { lista.recordar(); onAbrir(c); }}>
                                <span className="ia-baldosa nos" style={{ borderRadius: 999, fontWeight: 800, fontSize: 14, color: 'var(--tinta)' }} aria-hidden="true">
                                    {iniciales(nombreCliente(c))}
                                </span>
                                <span className="ia-fila-txt">
                                    <b>{nombreCliente(c)}</b>
                                    <span className="corta">{[c.municipio && nombrePropio(c.municipio), resumenObrasCliente(suyas)].filter(Boolean).join(' · ')}</span>
                                </span>
                                {toca && <span className="ia-chip tu">Te toca</span>}
                            </button>
                        );
                    })}
                </section>
            )}
        </div>
    );
}

export function ClienteView({ cliente: c, obras, onVolver, onCambiar, onAbrirObra, onNueva }) {
    const nombre = nombreCliente(c);
    const tel = telHref(c.tlf);
    const wa = waHref(c.tlf);
    const suyas = obrasDe(c, obras);
    const pila = nombre.split(' ')[0];
    const direccion = [c.direccion, [c.codigo_postal, c.municipio && nombrePropio(c.municipio)].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

    return (
        <div className="ia-pagina estrecha" style={{ paddingTop: 0 }}>
            <div className="ia-ficha-top" style={{ padding: '8px 0 0' }}>
                <button type="button" className="ia-volver" onClick={onVolver}><Icono n="atras" size={22} /> Clientes</button>
                {onCambiar && <button type="button" className="ia-link" onClick={() => onCambiar(c)}>Cambiar datos</button>}
            </div>
            <div className="ia-ficha-cab ia-entra">
                <h1 className="ia-display">{nombre}</h1>
                <p>{[c.es_empresa ? 'Empresa' : 'Particular', c.municipio && nombrePropio(c.municipio)].filter(Boolean).join(' · ')}</p>
                {(tel || wa) && (
                    <div className="ia-dos">
                        {tel && <a className="ia-btn ia-btn-sec" href={tel}><Icono n="telefono" size={20} /> Llamar</a>}
                        {wa && <a className="ia-btn ia-btn-sec" href={wa} target="_blank" rel="noopener noreferrer"><Icono n="whatsapp" size={20} /> WhatsApp</a>}
                    </div>
                )}
            </div>

            <section className="ia-card filas ia-entra" aria-labelledby="ia-sd-tit">
                <p id="ia-sd-tit" className="ia-eyebrow">Sus datos</p>
                <dl className="ia-dl" style={{ marginTop: 8 }}>
                    <div className="primera"><dt>Teléfono</dt><dd>{c.tlf ? telefonoBonito(c.tlf) : 'Falta'}</dd></div>
                    <div><dt>Correo</dt><dd>{c.email ? String(c.email).toLowerCase() : 'Falta'}</dd></div>
                    <div><dt>DNI</dt><dd className="mono">{c.dni ? dniEnmascarado(c.dni) : 'Falta'}</dd></div>
                    <div><dt>Dirección</dt><dd>{direccion || 'Falta'}</dd></div>
                </dl>
            </section>

            <h2 className="ia-eyebrow ia-sec-tit">Sus obras · {suyas.length}</h2>
            {suyas.length ? suyas.map((o) => <TarjetaObra key={o.id} obra={o} onClick={() => onAbrirObra(o)} />)
                : <p className="ia-nada" style={{ margin: '4px 8px' }}>Todavía no tiene ninguna obra contigo.</p>}

            <button type="button" className="ia-btn ia-btn-pri" onClick={onNueva}>
                <Icono n="mas" size={22} grosor={2.4} /> Otra obra para {pila}
            </button>
        </div>
    );
}
