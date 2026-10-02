// ============================================================================
// probar_cex_envolvente.js — el camino ENTERO del .cex de envolvente, con un
// expediente real: expediente → ficha del certificador → motor → Drive.
//
//   node implementation/backend/scripts/probar_cex_envolvente.js <expedienteId|nºexpte>
//   node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_186 --escribir
//   node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_186 --final
//   node implementation/backend/scripts/probar_cex_envolvente.js 2026CEE_55 --cee
//   node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_184 --version=2.3
//   node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_184 --final --base=ini.cex
//
// `--version=2.3|3.1` elige la versión de CE3X con la que se escribe (sin
// decirla, la de los ajustes guardados del expediente, y si no, la 3.1 vigente).
// `--base=<ruta>` hace el FINAL sobre un inicial que está EN DISCO, en vez del
// de la carpeta de Drive: así se prueba el final sin haber subido el inicial.
//
// `--cee` es un CEE contratado SUELTO (`cee_directos`). Es el mismo camino con
// otra tabla detrás y otra carpeta de Drive: si esto falla ahí y no en el CAE,
// el problema está en el adaptador (`logic/ceeDirecto.js`), no en el motor.
//
// EN SECO por defecto: lee, compone, genera el .cex y lo relee, pero NO toca
// Drive. Con `--escribir` lo deja en su carpeta como haría el botón.
//
// `--final` genera el CEE FINAL: la misma envolvente con la AEROTERMIA en vez
// de la caldera, que es lo único que cambia entre las dos fases.
//
// Necesita el motor levantado (CEE_ENGINE_URL, por defecto el del .env). Pide
// la envolvente con `offline:true`: si la RC está en la caché no toca Catastro,
// que es el mismo WAF del que depende el buscador en producción.
// ============================================================================
require('dotenv').config();
const cex = require('../services/ceeEnvolventeCex');
const ceeUploadService = require('../services/ceeUploadService');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://127.0.0.1:8090';
const ESCRIBIR = process.argv.includes('--escribir');
const FASE = process.argv.includes('--final') ? 'final' : 'inicial';
const ORIGEN = process.argv.includes('--cee') ? 'cee' : 'cae';
// `offline` evita tocar Catastro si la RC ya está en la caché del motor. Con
// `--online` se le deja preguntar: hace falta la primera vez que se prueba un
// inmueble, y es UNA petición, la misma que hace el botón.
const OFFLINE = !process.argv.includes('--online');
// `--cambia` marca lo que se REFORMA como lo haría el certificador en el plano:
// la ventana V1, la pared de la entrada y la MITAD OESTE de la cubierta de la
// planta baja por polígono. Es la prueba del sufijo «- CAMBIA» de punta a
// punta. `--guardar=<ruta>` deja el .cex en disco para mirarlo.
const CAMBIA = process.argv.includes('--cambia');
// `--lucernario` añade un LUCERNARIO de 1 × 1 m en la cubierta más alta y una
// PUERTA DE PATIO metálica acristalada al 40 % de marco: las dos cosas que la
// vista no sabía declarar hasta 2026-09-29. En CE3X tienen que salir como las
// guarda el propio programa (`Lucernario` · «Techo»; `porcMarco` 40).
const LUCERNARIO = process.argv.includes('--lucernario');
const GUARDAR = (process.argv.find(a => a.startsWith('--guardar=')) || '').slice(10);
const VERSION = (process.argv.find(a => a.startsWith('--version=')) || '').slice(10) || null;
const BASE = (process.argv.find(a => a.startsWith('--base=')) || '').slice(7) || null;
const CLAVE = process.argv[2];

async function main() {
    if (!CLAVE) throw new Error('Dime qué expediente: su id o su número.');

    // Python importa una vez por proceso: si el motor lleva levantado desde
    // antes del último cambio, lo que se prueba es el código de antes y el
    // resultado parece bueno. Se avisa en vez de descubrirlo tres pruebas
    // después.
    const salud = await (await fetch(`${MOTOR}/health`)).json();
    if (salud.codigo_en_disco_at && salud.codigo_at !== salud.codigo_en_disco_at) {
        console.warn('\n⚠ EL MOTOR ESTÁ DESACTUALIZADO: se levantó antes del último'
            + ' cambio en su código.\n  Reinícialo, o lo que pruebes será la'
            + ' versión anterior.\n');
    }

    // El MISMO cargador que usa la ruta: si aquí se cargara a mano, el script
    // podría dar por buena una ficha que el botón no puede componer.
    const ctx = await cex.cargarExpediente(CLAVE, ORIGEN);
    if (!ctx) throw new Error(`No encuentro el expediente ${CLAVE}`);
    const { expediente, cliente, driveFolderId } = ctx;

    console.log(`\n1. ${expediente.numero_expediente} · ${nombre(cliente) || 'sin cliente'}`);
    console.log(`   carpeta de Drive: ${driveFolderId || '— NO TIENE'}`);

    const rc = expediente.instalacion?.ref_catastral;
    if (!rc) throw new Error('El expediente no tiene referencia catastral.');
    const geo = await alMotor('/envolvente', { referencia_catastral: rc, offline: OFFLINE });
    console.log(`\n2. envolvente de ${rc}`);
    console.log(`   ${geo.plantas.length} planta(s) dibujable(s) · ${geo.geometria.elementos.length} elementos`
                + ` · lienzo ${geo.ancho} × ${geo.alto} m`);

    const { ficha, avisos } = await cex.componerFicha(ctx, {
        geometria: geo.geometria, envolvente: senaladoDeMentira(geo),
        conImagenes: true,   // lo mismo que hace el botón
        fase: FASE,
        // La versión pedida va con los AJUSTES, como desde la ventana.
        ...(VERSION ? { ajustes: { ...(ctx.trabajo?.ajustes || {}), version_ce3x: VERSION } } : {}),
    });
    const g = ficha.generales, t = ficha.termicas;
    console.log(`\n3. ficha del certificador · CEE ${FASE.toUpperCase()} · CE3X ${ficha.version_ce3x}`);
    if (ficha.ce3x31) console.log(`   lo que pide la 3.1: ${JSON.stringify(ficha.ce3x31)}`);
    console.log(`   ${g.ano_construccion.valor} · ${g.normativa.valor} · zona ${g.zona_climatica_he1.valor}`
                + ` · ${g.superficie_util_habitable.valor} m² · ${g.n_plantas_habitables.valor} planta(s)`);
    console.log(`   U fachada ${t.fachada.u} · cubierta ${t.cubierta.u} · suelo ${t.suelo_terreno.u}`
                + ` · particiones ${t.particion_superior.u}`);
    console.log(`   ${t._de}`);
    console.log(`   foto de fachada: ${kb(g.foto_edificio.valor)} · croquis de parcela: ${kb(g.plano_situacion.valor)}`);
    for (const e of ficha.instalaciones || []) {
        const pot = ['calefaccion', 'acs', 'refrigeracion']
            .filter(k => e[`potencia_${k}`]).map(k => `${k} ${e[`potencia_${k}`]} kW`);
        if (pot.length || e.tipo_bdc !== undefined) {
            console.log(`   potencia (3.1) de «${e.nombre}»: ${pot.join(' · ') || '—'}`
                        + `${e.tipo_bdc !== undefined ? ` · tipo de bomba ${e.tipo_bdc}` : ''}`);
        }
    }
    const eq = (ficha.instalaciones || [])[0];
    console.log(`   instalación: ${eq
        ? `[${eq.slot}] ${eq.nombre} · ${eq.generador} · ${eq.combustible}`
          + ` · ${eq.rendimiento === 'conocido'
                 ? `${eq.rend_calefaccion} %${eq.rend_acs ? ` / ${eq.rend_acs} % ACS` : ''}`
                 : `${eq.rend_combustion} % comb · ${eq.potencia} kW`}`
        : '— no se escribe ninguna'}`);
    for (const m of (ficha.medidas || [])) {
        const eq = (m.instalaciones || []).map(e => `${e.slot}: ${e.nombre}`).join(' · ');
        console.log(`   medida: «${m.nombre}» · ${m.inversion} EUR · ${m.vida_util} anos`);
        console.log(`      ${eq}`);
    }
    if (!(ficha.medidas || []).length) console.log('   medidas: - NINGUNA');
    console.log(`   informe: ${(ficha.informe?.pruebas || '').length} caracteres de pruebas`
                + ` · emision ${ficha.informe?.fecha_emision || '-'}`
                + ` · visita ${ficha.informe?.fecha_visita || '-'}`);
    if (avisos.length) console.log(`   ⚠ ${avisos.join('\n   ⚠ ')}`);

    // El FINAL no se levanta de cero: se COPIA el inicial de la carpeta y se le
    // cambia el generador — el mismo camino que la ruta, para que lo que prueba
    // el script sea lo que va a pasar de verdad.
    let r;
    if (FASE === 'final') {
        const partida = BASE
            ? { nombre: BASE, bytes: require('fs').readFileSync(BASE) }
            : await cex.leerCexDeFase(ctx, 'inicial');
        if (!partida) throw new Error('no hay ningún .cex inicial en la carpeta: genera antes ése.');
        console.log(`\n4. se copia «${partida.nombre}» (${partida.bytes.length} bytes) y se le`
                    + ' cambia el generador');
        const fd = new FormData();
        fd.append('fichero', new Blob([partida.bytes]), 'base.cex');
        fd.append('datos', JSON.stringify(ficha));
        r = await fetch(`${MOTOR}/cex/instalaciones`, { method: 'POST', body: fd });
    } else {
        r = await fetch(`${MOTOR}/cex`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometria: geo.geometria, datos: ficha }),
        });
    }
    if (!r.ok) throw new Error(`el motor no ha escrito el .cex: ${(await r.json()).detail}`);
    const fichero = Buffer.from(await r.arrayBuffer());
    const avMotor = JSON.parse(r.headers.get('X-Cee-Avisos') || '[]');
    if (GUARDAR) { require('fs').writeFileSync(GUARDAR, fichero); console.log(`   (guardado en ${GUARDAR})`); }
    console.log(`${FASE === 'final' ? '  ' : '\n4.'} .cex escrito · ${fichero.length} bytes`
                + ` · CE3X ${r.headers.get('X-Cee-Version') || '¿?'}`);
    // Los avisos del motor son "lo que NO es una medida": se leen antes de
    // firmar, así que el script los enseña en vez de contarlos.
    if (avMotor.length) console.log(`   ⚠ ${avMotor.join('\n   ⚠ ')}`);

    // Releerlo es lo único que prueba que CE3X podrá abrirlo entero.
    const fd = new FormData();
    fd.append('fichero', new Blob([fichero]), 'x.cex');
    const leido = await (await fetch(`${MOTOR}/leer-cex`, { method: 'POST', body: fd })).json();
    console.log(`5. releído · ${leido.version} · ${JSON.stringify(leido.resumen_envolvente)}`
                + ` · errores: ${leido.errores.length}`);

    const nombreCex = cex.nombreDelCex(expediente, FASE);
    if (!ESCRIBIR) {
        console.log(`\n6. EN SECO: iría a "${cex.faseDe(FASE).carpeta}" como «${nombreCex}»`);
        console.log(`   (pásale --escribir para dejarlo de verdad)`);
    } else {
        // El MISMO guardado que hace el botón, no una copia: así lo que prueba
        // el script es lo que va a pasar de verdad.
        const g = await cex.guardarEnDrive(ctx, fichero, FASE);
        if (!g.ok) throw new Error(`no se ha podido guardar en Drive: ${g.error}`);
        if (g.archivado) console.log(`\n6. el anterior se archiva en OLD como «${g.archivado}»`);
        console.log(`${g.archivado ? '  ' : '\n6.'} guardado · ${g.nombre} · ${g.bytes} bytes`);
        console.log(`   ${g.link}`);
    }

    // Y lo que no puede pasar: que la app lo tome por el .cex del técnico.
    console.log(`\n7. matchSlot('${nombreCex}') = ${ceeUploadService.matchSlot(nombreCex)}`
                + `  ${ceeUploadService.matchSlot(nombreCex) === null ? '✓ no ocupa el slot del técnico' : '✗ SE CONFUNDE'}`);
    if (driveFolderId) {
        const scan = await ceeUploadService.scanCeeSection(driveFolderId, 'inicial');
        const ocupados = Object.keys(scan);
        console.log(`   la rejilla del CEE inicial ve: ${ocupados.length ? ocupados.join(', ') : 'ningún slot ocupado'}`);
    }
}

/** Lo que el certificador señalaría en el plano: la entrada y algún hueco. */
function senaladoDeMentira(geo) {
    const muros = geo.plantas.flatMap(p => p.muros);
    const entrada = muros.find(m => m.subtipo === 'CALLE' && m.nivel === 0) || muros[0];
    const base = {
        huecos: [
            { id: 'P1', cerramiento: entrada.id, ancho: 0.9, alto: 2.1, tipo: 'Puerta',
              porc_marco: '90', marco: 'Madera', persiana: false, de: 'PRUEBA' },
            { id: CAMBIA ? 'V1 - CAMBIA' : 'V1', cerramiento: entrada.id, ancho: 1.3, alto: 1.3,
              tipo: 'Ventana', de: 'PRUEBA' },
        ],
        entrada: { valor: entrada.id, de: 'PRUEBA' },
        medianeras_como_particion: [],
    };
    if (LUCERNARIO) {
        const cubs = geo.geometria.elementos.filter(e => e.tipo === 'CUBIERTA');
        const alta = cubs.sort((x, y) => (y.nivel ?? 0) - (x.nivel ?? 0))[0];
        base.huecos.push(
            { id: 'PE2', cerramiento: entrada.id, ancho: 1.6, alto: 2.1, tipo: 'Hueco',
              porc_marco: '40', marco: 'Metálico sin RPT', vidrio: 'Doble', persiana: false,
              de: 'PRUEBA · puerta de patio' },
            ...(alta ? [{ id: 'L1', cerramiento: alta.id, ancho: 1, alto: 1, tipo: 'Lucernario',
                          persiana: false, de: 'PRUEBA · lucernario' }] : []));
        console.log(`   --lucernario: L1 en ${alta?.id || '— NO HAY CUBIERTA'} y PE2 al 40 % en ${entrada.id}`);
    }
    if (!CAMBIA) return base;
    // La mitad oeste de la planta baja, en coordenadas del LIENZO: la caja de
    // sus paredes, partida por la mitad. La traslación al mundo es la MISMA que
    // hace la vista (`lienzoAMundo` en geometriaPlano.js).
    const pb = geo.plantas.find(p => p.nivel === 0) || geo.plantas[0];
    const pts = pb.muros.flatMap(m => m.svg || []);
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const xm = (x0 + x1) / 2;
    const gr = geo.georef || {};
    const lienzo_a_mundo = gr.bbox && gr.en_el_lienzo
        ? { dx: gr.bbox[0] - gr.en_el_lienzo.x, y0: gr.bbox[3] + gr.en_el_lienzo.y } : null;
    console.log(`   --cambia: V1, la pared ${entrada.id} y la mitad oeste de la cubierta de`
                + ` ${pb.nombre} (x ${x0.toFixed(1)}…${xm.toFixed(1)} del lienzo)`);
    return {
        ...base,
        mejora: {
            cerramientos: [entrada.id],
            cubierta: { [pb.id]: { poligono: [[x0 - 1, y0 - 1], [xm, y0 - 1], [xm, y1 + 1], [x0 - 1, y1 + 1]] } },
            ...(lienzo_a_mundo ? { lienzo_a_mundo } : {}),
        },
    };
}

async function alMotor(ruta, cuerpo) {
    const r = await fetch(`${MOTOR}${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw new Error(`${ruta}: ${(await r.json().catch(() => ({}))).detail || r.status}`);
    return r.json();
}

const nombre = c => c && [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ');
const kb = b64 => (b64 ? `${Math.round(b64.length * 3 / 4 / 1024)} KB` : '— no hay');

main().then(() => process.exit(0))
      .catch(e => { console.error('\n✗', e.message); process.exit(1); });
