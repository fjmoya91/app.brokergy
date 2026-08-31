import { useState, useRef, useEffect } from 'react';
import { useIsMobile } from '../../../utils/useIsMobile';

// ─────────────────────────────────────────────────────────────────────────────
// La cinta de datos del expediente.
//
// La ficha de un CEE trata de UNA cosa: el certificado. El cliente, el partner y
// la dirección son datos de referencia — se consultan de vez en cuando y se
// escriben una vez—, pero en formulario abierto se comían media pantalla y
// empujaban el módulo CEE, que es a lo que se entra, por debajo del pliegue.
//
// Aquí se resumen en una línea de pastillas: cada una dice lo justo para saber
// si está bien, y se despliega si quieres el detalle. Editar abre el formulario
// en un modal.
//
// REGLA — lo que FALTA se ve sin desplegar nada. Una pastilla en ámbar diciendo
// "Falta la dirección" es la mitad del valor de esta cinta: es lo que impide
// encargarle el CEE al técnico, y esconderlo detrás de un clic sería cambiar
// espacio por despistes.
// ─────────────────────────────────────────────────────────────────────────────

const Icono = ({ d }) => (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
);

const ICONOS = {
    cliente: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    partner: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    lugar: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
    lapiz: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
};

/**
 * Pastilla con desplegable. En escritorio el detalle cuelga de la pastilla; en
 * móvil sube desde abajo a lo ancho — un popover anclado de 280 px en una
 * pantalla de 375 se sale o queda ilegible.
 */
function Pastilla({ icono, texto, detalle, alerta = false, onClick, children }) {
    const [abierto, setAbierto] = useState(false);
    const raiz = useRef(null);
    const esMovil = useIsMobile();

    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
        const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
    }, [abierto]);

    const desplegable = !!children;

    return (
        <div ref={raiz} className="relative">
            <button
                type="button"
                onClick={() => (desplegable ? setAbierto(v => !v) : onClick?.())}
                title={detalle || texto}
                className={`inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border text-[11px] font-bold transition-colors max-w-full ${
                    alerta
                        ? 'bg-amber-500/[0.08] border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
                        : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white hover:border-white/25'
                }`}
            >
                <Icono d={icono} />
                <span className="truncate">{texto}</span>
                {desplegable && (
                    <svg className={`w-3 h-3 shrink-0 opacity-40 transition-transform ${abierto ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {abierto && desplegable && (
                esMovil ? (
                    <>
                        <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => setAbierto(false)} />
                        <div className="fixed inset-x-0 bottom-0 z-[71] rounded-t-2xl border-t border-white/10 bg-bkg-surface p-5"
                            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                            {children}
                        </div>
                    </>
                ) : (
                    <div className="absolute left-0 top-full mt-2 z-50 w-[320px] max-w-[90vw] rounded-xl border border-white/10 bg-bkg-surface shadow-2xl p-4">
                        {children}
                    </div>
                )
            )}
        </div>
    );
}

const Dato = ({ etiqueta, valor, href }) => {
    if (!valor) return null;
    return (
        <div className="flex items-baseline gap-2 py-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/25 w-16 shrink-0">{etiqueta}</span>
            {href
                ? <a href={href} className="text-[12px] text-brand hover:underline break-all">{valor}</a>
                : <span className="text-[12px] text-white/70 break-all">{valor}</span>}
        </div>
    );
};

/**
 * `esEquipo` — quién está mirando. Para el TÉCNICO cambian dos cosas:
 *  · no ve la pastilla del partner (no tiene por qué saber quién nos contrata), y
 *  · al cliente se le llama **titular de la vivienda**, que es lo que significa
 *    para su trabajo: el nombre que va en el certificado.
 */
export function ResumenDatos({ expediente, prescriptor, onEditar, onAbrirCliente, onAbrirPartner, puedeEditar = true, esEquipo = true }) {
    const cliente = expediente.cliente;
    const nombreCliente = cliente
        ? `${cliente.nombre_razon_social || ''} ${cliente.apellidos || ''}`.trim()
        : null;
    const tlf = cliente?.tlf || cliente?.telefono || null;

    const lugar = [expediente.direccion, expediente.municipio].filter(Boolean).join(', ');
    const nombrePartner = prescriptor?.razon_social || prescriptor?.acronimo || null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* CLIENTE — el primero: es quien va en el certificado y sin él no se
                le puede encargar nada al técnico. */}
            {nombreCliente ? (
                <Pastilla icono={ICONOS.cliente} texto={nombreCliente}
                    detalle={`${esEquipo ? 'Cliente' : 'Titular de la vivienda'}: ${nombreCliente}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">
                        {esEquipo ? 'Cliente' : 'Titular de la vivienda'}
                    </div>
                    <div className="text-sm font-bold text-white mb-2">{nombreCliente}</div>
                    <Dato etiqueta="DNI" valor={cliente.dni} />
                    <Dato etiqueta="Teléfono" valor={tlf} href={tlf ? `tel:${String(tlf).replace(/\s/g, '')}` : null} />
                    <Dato etiqueta="Email" valor={cliente.email} href={cliente.email ? `mailto:${cliente.email}` : null} />
                    <Dato etiqueta="Domicilio" valor={[cliente.direccion, cliente.municipio, cliente.provincia].filter(Boolean).join(', ')} />
                    {onAbrirCliente && (
                        <button onClick={onAbrirCliente}
                            className="mt-3 w-full min-h-[40px] rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-brand/40 transition-colors">
                            Abrir su ficha
                        </button>
                    )}
                </Pastilla>
            ) : (
                <Pastilla icono={ICONOS.cliente} texto="Falta el cliente" alerta
                    detalle="Sin cliente no se puede encargar el CEE ni entregarlo"
                    onClick={puedeEditar ? onEditar : undefined} />
            )}

            {/* PARTNER — quién nos lo trae. Solo para el EQUIPO: al técnico ni se
                le pinta ni le llega del servidor. */}
            {esEquipo && (nombrePartner ? (
                <Pastilla icono={ICONOS.partner} texto={prescriptor.acronimo || nombrePartner} detalle={nombrePartner}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Nos lo trae</div>
                    <div className="text-sm font-bold text-white mb-2">{nombrePartner}</div>
                    <Dato etiqueta="CIF" valor={prescriptor.cif} />
                    <Dato etiqueta="Teléfono" valor={prescriptor.tlf} href={prescriptor.tlf ? `tel:${String(prescriptor.tlf).replace(/\s/g, '')}` : null} />
                    <Dato etiqueta="Email" valor={prescriptor.email} href={prescriptor.email ? `mailto:${prescriptor.email}` : null} />
                    <Dato etiqueta="Dónde" valor={[prescriptor.municipio, prescriptor.provincia].filter(Boolean).join(', ')} />
                    {onAbrirPartner && (
                        <button onClick={onAbrirPartner}
                            className="mt-3 w-full min-h-[40px] rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-brand/40 transition-colors">
                            Abrir su ficha
                        </button>
                    )}
                </Pastilla>
            ) : (
                <Pastilla icono={ICONOS.partner} texto="Directo" detalle="Nadie nos lo trae: es un encargo directo"
                    onClick={puedeEditar ? onEditar : undefined} />
            ))}

            {/* DÓNDE ESTÁ — el técnico no puede visitar sin dirección, así que su
                ausencia se anuncia en ámbar en vez de callarse. */}
            {lugar ? (
                <Pastilla icono={ICONOS.lugar} texto={lugar} detalle={lugar}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">El inmueble</div>
                    <Dato etiqueta="Calle" valor={expediente.direccion} />
                    <Dato etiqueta="Municipio" valor={expediente.municipio} />
                    <Dato etiqueta="Provincia" valor={expediente.provincia} />
                    <Dato etiqueta="C.P." valor={expediente.codigo_postal} />
                    <Dato etiqueta="Catastro" valor={expediente.ref_catastral} />
                    {/* La zona climática NO se teclea: la deriva el servidor del
                        municipio. Se enseña con la altitud al lado porque es lo que
                        la justifica — un "C3" a secas hay que creérselo; con los
                        388 m se comprueba contra la tabla del CTE. */}
                    <Dato etiqueta="Zona CTE"
                        valor={expediente.zona_climatica
                            ? `${expediente.zona_climatica}${expediente.altitud ? ` · ${expediente.altitud} m` : ''}`
                            : null} />
                    {puedeEditar && (
                        <button onClick={onEditar}
                            className="mt-3 w-full min-h-[40px] rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-brand/40 transition-colors">
                            Editar los datos
                        </button>
                    )}
                </Pastilla>
            ) : (
                <Pastilla icono={ICONOS.lugar} texto="Falta la dirección" alerta
                    detalle="El certificador no puede visitar sin dirección"
                    onClick={puedeEditar ? onEditar : undefined} />
            )}

            {puedeEditar && (
                <button onClick={onEditar}
                    title="Editar los datos del expediente"
                    className="inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg border border-white/10 text-[11px] font-bold text-white/45 hover:text-white hover:border-white/25 transition-colors">
                    <Icono d={ICONOS.lapiz} />
                    <span className="max-md:hidden">Datos</span>
                </button>
            )}
        </div>
    );
}

export default ResumenDatos;
