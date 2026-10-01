// ─── El AGENTE IA, un certificador más ───────────────────────────────────────
// Es una ficha de `prescriptores` (tipo CERTIFICADOR) con la marca
// `es_agente_ia`: sale en el selector de técnico y se le «encarga» el CEE como a
// cualquiera, pero NO trabaja solo (hay que pedírselo a Claude con las skills
// generar-cee-inicial / generar-cee-final), no se le escribe (no tiene email ni
// teléfono) y no firma. Al terminar avisa él y la fase pasa a «pendiente de
// revisión». Ver services/agenteIa.js y «El AGENTE IA» en CLAUDE.md.
//
// Se reconoce por la MARCA, nunca por el nombre: un nombre se edita desde
// Prescriptores y una comprobación por texto dejaría de reconocerlo.

export const esAgenteIa = (c) => c?.es_agente_ia === true;

/** La frase que se le dice a Claude para que se ponga con ese CEE. */
export const fraseParaClaude = (numero, fase = 'inicial') =>
    `Genera el CEE ${fase === 'final' ? 'final' : 'inicial'} de ${numero || 'este expediente'}`;
