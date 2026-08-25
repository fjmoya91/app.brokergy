#!/usr/bin/env node
// ─── importar_cee_directos.js ────────────────────────────────────────────────
// Trae a la app los CEE que se han llevado a mano en Drive desde 2024.
//
//   node scripts/importar_cee_directos.js            (simulación — no escribe)
//   node scripts/importar_cee_directos.js --execute  (escribe en Supabase)
//
// QUÉ IMPORTA Y QUÉ NO
// --------------------
// Importa lo que la carpeta DEMUESTRA: número, año, nombre, enlace de Drive y,
// cuando se puede leer del contenido, el alcance (un CEE o dos) y si el
// certificado llegó a registrarse. NO inventa cliente, ni certificador, ni
// fechas: esos quedan vacíos, y `origen='HISTORICO'` es lo que permite luego
// distinguir "no consta" de "está pendiente". Un histórico con un cliente
// inventado sería peor que uno vacío: parecería un dato.
//
// Es IDEMPOTENTE: se puede volver a lanzar. Actualiza lo que detecte de nuevo en
// las filas ya importadas (p. ej. una carpeta que desde la última vez ya tiene su
// justificante de registro) y nunca duplica.

require('dotenv').config();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const folders = require('../services/ceeDirectoFolders');
const estados = require('../utils/ceeDirectoEstados');

const EXECUTE = process.argv.includes('--execute');

// `2024CEE_01 - C HIPOLITO 9` · `2025CEE_13 C ALARCON 10` · `2026CEE_46 - LIDIA…`
// El separador entre número y nombre es a veces " - " y a veces solo un espacio.
const RE_CARPETA = /^(\d{4})CEE[_\s-]*(\d+)\s*[-–]?\s*(.*)$/i;

/**
 * Prescriptor citado entre paréntesis al final del nombre: "JULIÁN PRADO (INERSOS)".
 * Se resuelve contra `prescriptores` por acrónimo o por razón social; si no casa,
 * se deja a null y el paréntesis se conserva en el nombre. Adivinar el
 * prescriptor de un expediente ajeno es peor que no ponerlo.
 */
function extraerAlias(nombre) {
    const m = String(nombre).match(/\(([^)]+)\)\s*$/);
    return m ? m[1].trim() : null;
}

const norm = (s) => String(s || '')
    .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');

/**
 * Lee la carpeta y deduce lo que se puede demostrar.
 *  · alcance DOBLE  → hay una subcarpeta o un fichero que nombra el CEE FINAL.
 *  · REGISTRADO     → hay justificante de registro (`_REG.pdf`, "REGISTRO",
 *                     "INSCRIPCION" o "Resolucion_de_Inscripcion").
 *  · PRESENTADO     → hay .cex o .xml pero no consta el registro.
 * Mira un nivel de subcarpetas: la estructura histórica es irregular y hay
 * expedientes con todo suelto en la raíz y otros con `1. CEE INICIAL` dentro.
 */
async function inspeccionar(folderId) {
    const out = { doble: false, iniRegistrado: false, finRegistrado: false, iniPresentado: false, finPresentado: false, ficheros: 0 };

    const clasifica = (nombre, contexto) => {
        const n = norm(nombre);
        out.ficheros++;
        const esFinal = contexto === 'final' || /CEEFINAL|FINAL/.test(n);
        const registro = /_REG|REGISTRO|INSCRIPCION|RESOLUCIONDEINSCRIPCION|JUSTIFICANTEDEPAGO/.test(n);
        const entregado = /\.CEX$|\.XML$|CEX$|XML$/.test(n) || /_FDO/.test(n);
        if (esFinal) {
            out.doble = true;
            if (registro) out.finRegistrado = true;
            if (entregado) out.finPresentado = true;
        } else {
            if (registro) out.iniRegistrado = true;
            if (entregado) out.iniPresentado = true;
        }
    };

    let hijos = [];
    try { hijos = await driveService.listFiles(folderId); } catch { return out; }

    for (const f of hijos) {
        const esCarpeta = f.mimeType === 'application/vnd.google-apps.folder';
        if (!esCarpeta) { clasifica(f.name, null); continue; }

        const n = norm(f.name);
        if (n === 'OLD') continue;
        const contexto = /FINAL/.test(n) ? 'final' : /INICIAL|^1CEE$|^CEE$/.test(n) ? 'inicial' : null;
        if (contexto === 'final') out.doble = true;

        try {
            const nietos = await driveService.listFiles(f.id);
            for (const g of nietos) {
                if (g.mimeType === 'application/vnd.google-apps.folder') continue;
                clasifica(g.name, contexto);
            }
        } catch { /* carpeta ilegible: se ignora, no se inventa nada */ }
    }
    return out;
}

/**
 * Subestado que se puede DEMOSTRAR con lo que hay en la carpeta.
 *
 * Solo se afirma REGISTRADO, y solo con justificante delante. La primera versión
 * deducía también PRESENTADO de que hubiera un .cex, y el resultado era que doce
 * expedientes de 2024 y 2025 entraban en la app como "PENDIENTE REVISIÓN": una
 * cola de trabajo inventada sobre encargos cerrados hace año y medio. Un .cex en
 * la carpeta prueba que el certificado existe, no que esté esperando a nadie.
 *
 * Lo que no consta se queda en PTE_ENVIO_CERT, que junto a `origen='HISTORICO'`
 * se lee como lo que es: "esto viene del Drive antiguo y no lo hemos clasificado".
 */
function subestadoDe({ registrado }) {
    return registrado ? 'REGISTRADO' : 'PTE_ENVIO_CERT';
}

async function main() {
    console.log(EXECUTE ? '⚠️  MODO ESCRITURA\n' : '🔍 SIMULACIÓN (nada se escribe). Añade --execute para aplicar.\n');

    const raiz = folders.PRODUCCION_FOLDER_ID;
    const hijos = await driveService.listFiles(raiz);
    const carpetas = hijos.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    console.log(`📁 ${carpetas.length} carpetas en "1. PRODUCCION"\n`);

    const [{ data: existentes }, { data: prescriptores }] = await Promise.all([
        supabase.from('cee_directos').select('id, numero_expediente, nombre, seguimiento, alcance, drive_folder_id, origen'),
        supabase.from('prescriptores').select('id_empresa, razon_social, acronimo')
    ]);
    const porNumero = new Map();
    for (const e of existentes || []) {
        // El histórico tiene un número repetido (2025CEE_18): se indexa por
        // número + carpeta para no confundir uno con el otro.
        porNumero.set(`${e.numero_expediente}::${e.drive_folder_id || ''}`, e);
    }
    const vistos = new Set();

    const resumen = { nuevos: 0, actualizados: 0, sinCambios: 0, ignorados: 0, duplicados: 0 };
    const filas = [];

    for (const carpeta of carpetas.sort((a, b) => a.name.localeCompare(b.name))) {
        const m = carpeta.name.match(RE_CARPETA);
        if (!m) {
            console.log(`   ⏭️  Ignorada (no cuadra con AAAACEE_N): "${carpeta.name}"`);
            resumen.ignorados++;
            continue;
        }
        const anio = parseInt(m[1], 10);
        const correlativo = parseInt(m[2], 10);
        // El número se conserva TAL CUAL lo escribe la carpeta: los doce primeros
        // llevan cero a la izquierda (`2024CEE_01`) y los demás no. Normalizarlo a
        // `2024CEE_1` dejaría el expediente de la app llamándose distinto que su
        // carpeta, que es el único sitio donde vive el trabajo de verdad.
        const numero = `${anio}CEE_${m[2]}`;
        const nombre = (m[3] || '').trim() || carpeta.name;

        // Duplicado heredado: el segundo con el mismo número se marca, y así el
        // índice único sigue protegiendo todo lo demás sin renumerar a nadie.
        const duplicado = vistos.has(numero);
        if (duplicado) resumen.duplicados++;
        vistos.add(numero);

        const info = await inspeccionar(carpeta.id);
        const alcance = info.doble ? 'DOBLE' : 'UNICO';
        const seguimiento = {
            cee_inicial: subestadoDe({ registrado: info.iniRegistrado })
        };
        if (info.doble) {
            seguimiento.cee_final = subestadoDe({ registrado: info.finRegistrado });
        }

        const alias = extraerAlias(nombre);
        let prescriptor_id = null;
        if (alias) {
            const a = norm(alias);
            const hit = (prescriptores || []).find(p => norm(p.acronimo) === a || norm(p.razon_social).includes(a));
            prescriptor_id = hit?.id_empresa || null;
        }

        const fila = {
            numero_expediente: numero, anio, correlativo,
            duplicado_historico: duplicado,
            nombre, alcance, prescriptor_id,
            seguimiento,
            estado: estados.deriveEstado({ alcance, seguimiento }),
            drive_folder_id: carpeta.id,
            drive_folder_link: carpeta.webViewLink || `https://drive.google.com/drive/folders/${carpeta.id}`,
            origen: 'HISTORICO'
        };

        const previo = porNumero.get(`${numero}::${carpeta.id}`);
        if (!previo) {
            resumen.nuevos++;
            filas.push({ accion: 'ALTA', fila });
        } else {
            const cambia = previo.alcance !== alcance
                || JSON.stringify(previo.seguimiento || {}) !== JSON.stringify(seguimiento);
            if (cambia) { resumen.actualizados++; filas.push({ accion: 'ACTUALIZA', id: previo.id, fila }); }
            else resumen.sinCambios++;
        }

        const marca = duplicado ? ' ⚠️ DUPLICADO' : '';
        console.log(`   ${previo ? '↻' : '+'} ${numero.padEnd(12)} ${alcance.padEnd(6)} ${fila.estado.padEnd(30)} ${nombre}${marca}`);
    }

    console.log(`\n📊 Altas ${resumen.nuevos} · Actualizaciones ${resumen.actualizados} · Sin cambios ${resumen.sinCambios} · Ignoradas ${resumen.ignorados} · Números repetidos ${resumen.duplicados}`);

    if (!EXECUTE) {
        console.log('\n🔍 Simulación terminada. Vuelve a lanzarlo con --execute para aplicar.');
        return;
    }

    for (const item of filas) {
        if (item.accion === 'ALTA') {
            const { error } = await supabase.from('cee_directos').insert(item.fila);
            if (error) console.error(`   ❌ ${item.fila.numero_expediente}: ${error.message}`);
        } else {
            // De una fila ya existente solo se refresca lo que se deduce de Drive.
            // Nombre, prescriptor y cliente pueden haberse corregido A MANO en la
            // app, y un reimport no puede pisar ese trabajo.
            const { error } = await supabase.from('cee_directos').update({
                alcance: item.fila.alcance,
                seguimiento: item.fila.seguimiento,
                estado: item.fila.estado,
                drive_folder_link: item.fila.drive_folder_link,
                updated_at: new Date().toISOString()
            }).eq('id', item.id);
            if (error) console.error(`   ❌ ${item.fila.numero_expediente}: ${error.message}`);
        }
    }
    console.log('\n✅ Importación aplicada.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
