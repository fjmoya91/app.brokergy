import { useState } from 'react';
import { aNumero, aTexto } from '../utils/numeroDecimal';

/**
 * Un número que se teclea: la coma y el punto valen igual.
 *
 * POR QUÉ NO ES UN `type="number"`: ese devuelve cadena vacía mientras lo
 * escrito no sea un número completo, y `Number('')` es 0 — así que escribir
 * «2.2» metía un 0 al pasar por «2.», y borrar el campo para reescribirlo lo
 * dejaba en 0. En una medida que va al certificado eso no es un detalle.
 * El porqué entero está en [numeroDecimal.js](../utils/numeroDecimal.js).
 *
 * REGLA — mientras se escribe manda el TEXTO, no el número. Un campo
 * controlado por el número se pelea con quien lo teclea: al escribir «2,» el
 * valor es 2, y si el componente reescribe «2» la coma desaparece debajo de
 * los dedos. Aquí el texto vive en el campo hasta que se sale de él.
 *
 * REGLA — lo que no es un número NO vale 0: no se avisa de nada. Se deja
 * escribir, no se guarda, y al salir el campo vuelve a enseñar el último valor
 * bueno. Un campo a medias no es un error, es alguien escribiendo.
 */
export function CampoDecimal({ valor, onCambio, className = '', permiteNegativo = false,
                              alVaciar, ...resto }) {
    //: `null` = no se está editando, así que manda el valor de fuera. En cuanto
    //: se teclea, manda lo tecleado hasta salir del campo.
    const [texto, setTexto] = useState(null);

    const escribir = (e) => {
        const t = e.target.value;
        setTexto(t);
        //: Dejar el campo en blanco significa algo en unos sitios —«vuelve a la
        //: U de su época»— y en otros no debe significar nada: una ventana
        //: siempre mide algo, y ahí el vacío no puede escribir un cero. Lo dice
        //: quien pone el campo.
        if (!t.trim()) { alVaciar?.(); return; }
        const n = aNumero(t);
        if (n != null && (permiteNegativo || n >= 0)) onCambio(n);
    };

    return (
        <input
            type="text" inputMode="decimal"
            value={texto ?? aTexto(valor)}
            onChange={escribir}
            // Al salir se suelta el texto: el campo vuelve a enseñar lo que de
            // verdad vale, con su coma. Si lo escrito no era un número, no se
            // ha guardado nada y aquí se ve.
            onBlur={() => setTexto(null)}
            className={className}
            {...resto} />
    );
}

export default CampoDecimal;
