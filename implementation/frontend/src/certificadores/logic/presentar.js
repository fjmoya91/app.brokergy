// ─── presentar.js — el borrador del Registro (CLM) para una obra de la app ────
// El borrador es el MISMO del CRM (features/expedientes/logic/borradorCee.js);
// aquí solo se le da la obra con la forma que espera y se dicen sus avisos con
// las pantallas de esta app. Lo usan el servidor (services/certapp/presentacion.js,
// por import()) y la demo (dev/demo.js), así que el borrador de la demo es el de
// verdad. PURO: ni React ni red. Las extensiones van explícitas (lo carga Node).
//
//   · 01 Solicitante: el titular de la obra (`obra.titular`). Sin su dirección, la
//     de la vivienda, y se dice. Una sociedad comparece por su representante.
//   · 02 Representante: el certificador, con SU perfil (es quien firma y presenta).
//   · 05 y 06: lo que dice el XML cargado (`obra.cee.cee_inicial`), y si no, la obra.
import { buildBorradorCee } from '../../features/expedientes/logic/borradorCee.js';

const limpio = (v) => String(v ?? '').trim();

/** La obra y su certificador con la forma que espera `buildBorradorCee`. */
export function ctxDeObra(obra = {}, cuenta = {}) {
    const t = obra.titular || {};
    const rep = limpio(t.representante);
    const dirTitular = limpio(t.direccion);
    const cliente = {
        es_empresa: !!rep,
        nombre_razon_social: rep ? [t.nombre, t.apellidos].map(limpio).filter(Boolean).join(' ') : limpio(t.nombre),
        apellidos: rep ? '' : limpio(t.apellidos),
        dni: limpio(t.nif),
        representante_nombre: rep,
        representante_apellidos: '',
        representante_dni: limpio(t.representante_nif),
        direccion: dirTitular || obra.direccion,
        municipio: dirTitular ? t.municipio : obra.municipio,
        provincia: dirTitular ? t.provincia : obra.provincia,
        codigo_postal: dirTitular ? t.codigo_postal : obra.codigo_postal,
        telefono: limpio(t.telefono),
        email: limpio(t.email),
    };
    const c = cuenta || {};
    const certificador = {
        nombre_responsable: limpio(c.nombre),
        apellidos_responsable: limpio(c.apellidos),
        razon_social: limpio(c.empresa),
        es_autonomo: true,
        nif_responsable: limpio(c.nif),
        direccion: c.direccion, municipio: c.municipio, provincia: c.provincia, codigo_postal: c.codigo_postal,
        tlf_responsable: limpio(c.telefono),
        email_responsable: limpio(c.email),
    };
    const expediente = {
        numero_expediente: obra.numero_expediente,
        cee: obra.cee || {},
        direccion: obra.direccion, municipio: obra.municipio, provincia: obra.provincia,
        codigo_postal: obra.codigo_postal, ref_catastral: obra.ref_catastral,
    };
    return { expediente, cliente, certificador, oportunidad: null };
}

/**
 * El borrador de la obra. Los `ficheros` salen con los nombres del CRM y sin
 * mirar la carpeta: quien lo sirve los cruza con «1. CEE».
 * @param {object} obra   fila de certapp_obras (con `titular` y `cee`)
 * @param {object} cuenta la del certificador
 * @param {{ hoy?: string }} [o]
 */
export function borradorDeObra(obra = {}, cuenta = {}, { hoy = null } = {}) {
    const b = buildBorradorCee(ctxDeObra(obra, cuenta), { fase: 'inicial', hoy });
    if (!b.aplica) return b;
    const t = obra.titular || {};
    const rep = limpio(t.representante);
    b.faseLabel = 'CEE';
    // Los avisos del CRM hablan de SUS pantallas (la ficha del cliente,
    // Prescriptores, la rejilla del CEE): aquí, con las de esta app.
    const avisos = [];
    if (!limpio(rep ? t.representante_nif : t.nif)) avisos.push(`Falta el NIF del ${rep ? 'representante del titular' : 'titular'}: sin él no se puede presentar.`);
    for (const a of b.avisos || []) {
        if (/Prescriptores/.test(a)) avisos.push('Falta tu NIF: ponlo en «Mi perfil» y vuelve a abrir el borrador.');
        else if (/rejilla del CEE/.test(a)) avisos.push('Falta alguna de las dos calificaciones: sube el XML definitivo en «Documentos» y se rellenan solas.');
        else avisos.push(a.replace('en la ficha del cliente', 'en los datos del titular de la obra'));
    }
    if (!limpio(t.direccion) && obra.direccion) avisos.push('No consta la dirección del titular: en el 01 va la de la vivienda. Cámbiala si vive en otro sitio.');
    if (rep) avisos.push('El representante del titular consta con el nombre entero: repártelo entre nombre y apellidos.');
    if (!limpio(cuenta?.direccion)) avisos.push('Tu dirección no está en «Mi perfil»: el apartado 02 la pide.');
    b.avisos = avisos;
    for (const ap of b.apartados || []) {
        if (ap.id === '01' && !rep) ap.nota = 'Los datos del titular, tal y como los diste al pedir el certificado.';
        if (ap.id === '02') ap.nota = 'Tú, el técnico que firma el certificado: tus datos de «Mi perfil».';
        if (ap.id === '06') ap.nota = 'Sale del propio XML del certificado.';
        for (const c of ap.campos || []) if (c.nota && /ficha del cliente/.test(c.nota)) delete c.nota;
    }
    return b;
}
