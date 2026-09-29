// ─── IconosFunnel.jsx ────────────────────────────────────────────────────────
// Los dibujos de las tarjetas del formulario de captación (/reforma y la
// landing), ya con su TAMAÑO y su COLOR: `<IconoFunnel n="gas" />`. Un solo
// sitio: si cada paso eligiera el suyo, el mismo concepto saldría en dos
// colores según la pantalla.
//
// Los dibujos viven en components/IconosVivienda.jsx y son los MISMOS que usa
// la aceptación de la propuesta (/firma/:id): radiador, suelo radiante, placas
// y aire acondicionado se ven igual en las dos páginas.
//
// Color por familia (todos remapeados en .theme-light, index.css):
//   obra y proyecto · ámbar    calor y caldera · naranja   agua · azul
//   envolvente · esmeralda     papeles y fechas · blanco   "no / no sé" · gris
// ─────────────────────────────────────────────────────────────────────────────

import * as I from '../../../components/IconosVivienda';

const OBRA = 'text-amber-400';
const CALOR = 'text-orange-400';
const AGUA = 'text-sky-400';
const VERDE = 'text-emerald-400';
const PAPEL = 'text-white/80';
const NEUTRO = 'text-white/60';

/** nombre → [dibujo, color] */
const TABLA = {
    // Qué obra
    aerotermia: [I.IconAerotermia, AGUA],
    reformaIntegral: [I.IconReformaIntegral, OBRA],
    plano: [I.IconPlano, OBRA],
    obraMedias: [I.IconObraMedias, OBRA],
    obraHecha: [I.IconObraHecha, VERDE],
    obraNueva: [I.IconObraNueva, OBRA],

    // Fechas, facturas y papeles
    calendarioOk: [I.IconCalendarioOk, VERDE],
    calendarioNo: [I.IconCalendarioNo, 'text-rose-400'],
    calendarioReloj: [I.IconCalendarioReloj, PAPEL],
    factura: [I.IconFactura, PAPEL],
    facturaPendiente: [I.IconFacturaPendiente, NEUTRO],
    certificado: [I.IconCertificado, VERDE],
    documento: [I.IconDocumento, PAPEL],
    camara: [I.IconCamara, PAPEL],

    // Combustible de la caldera
    gas: [I.IconLlama, CALOR],
    gasoleo: [I.IconBidon, OBRA],
    electricidad: [I.IconRayo, OBRA],
    carbon: [I.IconCarbon, NEUTRO],
    biomasa: [I.IconLena, CALOR],

    // La caldera
    caldera: [I.IconCaldera, CALOR],
    calderaNueva: [I.IconCalderaNueva, CALOR],
    relojArena: [I.IconRelojArena, CALOR],
    calderaVieja: [I.IconCalderaVieja, CALOR],
    calderaHumos: [I.IconCalderaHumos, CALOR],
    calderaGota: [I.IconCalderaGota, AGUA],

    // Emisores
    radiador: [I.IconRadiador, CALOR],
    sueloRadiante: [I.IconSueloRadiante, CALOR],
    aire: [I.IconAire, AGUA],

    // Agua caliente
    termo: [I.IconTermo, AGUA],
    bombona: [I.IconBombona, CALOR],
    solarTermico: [I.IconSolarTermico, OBRA],
    ducha: [I.IconDucha, AGUA],

    // Placas fotovoltaicas
    placas: [I.IconPlacas, OBRA],
    placasFuturo: [I.IconPlacasFuturo, OBRA],
    sinPlacas: [I.IconSinPlacas, NEUTRO],

    // Envolvente
    ventana: [I.IconVentana, VERDE],
    cubierta: [I.IconCubierta, VERDE],
    fachada: [I.IconFachada, VERDE],
    sueloAislamiento: [I.IconSueloAislamiento, VERDE],

    // Presupuesto
    calculadora: [I.IconCalculadora, PAPEL],
    herramienta: [I.IconHerramienta, OBRA],

    // No / no sé
    ninguno: [I.IconNinguno, NEUTRO],
    noSe: [I.IconNoSe, NEUTRO],
};

/** El dibujo de una tarjeta del formulario, a su tamaño y en su color. */
export function IconoFunnel({ n, className = 'w-12 h-12 md:w-14 md:h-14' }) {
    const [Dibujo, tono] = TABLA[n] || TABLA.noSe;
    return <Dibujo className={`${className} ${tono}`} />;
}

export default IconoFunnel;
