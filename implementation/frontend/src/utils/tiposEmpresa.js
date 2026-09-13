// ─── Cómo se LLAMA un partner en pantalla ─────────────────────────────────────
//
// `prescriptores.tipo_empresa` es un enum de BD (MAYÚSCULAS y con guion bajo) y
// se pinta en sitios donde lo lee una persona: la lista de partners y, sobre
// todo, el popup de envío de la propuesta.
//
// REGLA — el rótulo sale del TIPO de la ficha, nunca escrito a mano. En el popup
// de la propuesta la chapa decía literalmente "Distribuidor" para cualquier
// partner: medido el 13/09/2026, de las 202 oportunidades con prescriptor,
// **179 son de un INSTALADOR** y solo 20 de un distribuidor — o sea que el
// rótulo estaba mal el 89 % de las veces, y quien enviaba leía que le estaba
// escribiendo a otra empresa distinta de la que tenía delante.
//
// El mismo criterio ya lo aplicaba el co-branding de la propuesta ("llamar
// instalador a quien no lo es queda mal delante del cliente"), que sí mira
// `tipo_empresa`; solo los rótulos del popup se habían quedado atrás.

const ETIQUETAS = {
    INSTALADOR: 'Instalador',
    DISTRIBUIDOR: 'Distribuidor',
    CERTIFICADOR: 'Certificador',
    SUJETO_OBLIGADO: 'Sujeto obligado',
    VERIFICADOR: 'Verificador',
    // 'OTRO' es el cajón de la ficha (asesorías, colaboradores sueltos). En una
    // lista de destinatarios "Otro" no dice nada — y ahí ya existe una opción
    // llamada así para el contacto manual.
    OTRO: 'Colaborador',
};

/**
 * Etiqueta legible de un `tipo_empresa`.
 * @param {string} tipo   valor del enum, o null si la ficha no lo trae
 * @param {string} [fallback]  qué decir cuando no consta. "Partner" es genérico
 *   a propósito: es preferible a afirmar un tipo que no se ha comprobado.
 */
export function tipoEmpresaLabel(tipo, fallback = 'Partner') {
    const t = String(tipo || '').trim().toUpperCase();
    if (!t) return fallback;
    return ETIQUETAS[t] || t.replace(/_/g, ' ');
}

export { ETIQUETAS as TIPO_EMPRESA_ETIQUETAS };
