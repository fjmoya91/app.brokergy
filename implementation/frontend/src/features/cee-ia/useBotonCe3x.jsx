// El botón CE3X con «Generar con IA»: lo que pasa al pulsarlo y su popup.
//
// Mismo comportamiento en la calculadora y en el módulo CEE:
//   · la IA está trabajando → popup con su progreso;
//   · la IA ya lo hizo       → se abre la envolvente directamente (allí se ve
//                               lo que hizo); `abrirMenu` deja verlo o rehacerlo;
//   · si no                  → popup: con IA o a mano en la envolvente.
// Sin estado (no se ha podido preguntar) se abre el popup igual: la opción de
// la envolvente siempre está.
import React, { useState } from 'react';
import { useCeeIa } from './useCeeIa';
import { alPulsarCe3x, esVivo, lineaTrabajo } from './logic/ceeIa';
import { GenerarCeeIaModal } from './GenerarCeeIaModal';

/**
 * @param {{ negocio, id, activo?, abrirEnvolvente: () => void }} p
 * @returns {{ onClick, abrirMenu, modal, estado, trabajando, hechoPorIa, rotulo }}
 */
export function useBotonCe3x({ negocio, id, activo = true, abrirEnvolvente }) {
    const ia = useCeeIa({ negocio, id, activo });
    const [abierto, setAbierto] = useState(false);

    const onClick = async () => {
        const e = ia.estado || await ia.recargar();
        if (e && alPulsarCe3x(e) === 'abrir') { abrirEnvolvente(); return; }
        setAbierto(true);
    };
    const abrirMenu = async () => { if (!ia.estado) await ia.recargar(); setAbierto(true); };

    const modal = abierto ? (
        <GenerarCeeIaModal
            estado={ia.estado || { clave: id, ia: {}, trabajo: null, vigilante: null }}
            onAbrirEnvolvente={() => { setAbierto(false); abrirEnvolvente(); }}
            onPedir={ia.pedir}
            onCancelar={ia.cancelar}
            onCerrar={() => setAbierto(false)}
        />
    ) : null;

    const trabajo = ia.estado?.trabajo || null;
    return {
        onClick, abrirMenu, modal,
        estado: ia.estado,
        trabajando: esVivo(trabajo),
        hechoPorIa: !!ia.estado?.ia?.hecho,
        rotulo: esVivo(trabajo) ? lineaTrabajo(trabajo) : null,
    };
}

export default useBotonCe3x;
