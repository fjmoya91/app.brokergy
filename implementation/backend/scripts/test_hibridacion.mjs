/**
 * La HIBRIDACIÓN en CE3X: la caldera NO se retira, son DOS generadores.
 *
 * En una hibridación la caldera NO se retira: en CE3X el edificio mejorado tiene
 * dos equipos repartiéndose la demanda, y la app se negaba a componer la medida
 * («hay que montarlo a mano»). El certificador la montó a mano para 26RES093_8 y
 * ese `.cex` es la referencia de esta prueba — sus cifras son las de aquí:
 *
 *   CALDERA DOMUSA CLIMA MIX 20 GE   21 %   25,83 m²
 *   AEROTERMIA PANASONIC AQUAREA     79 %   97,17 m²
 *
 * 79 es el COEFICIENTE DE BIVALENCIA C_b (78,54 %), no la cobertura de potencia
 * (48 %): lo que CE3X pide es la parte de la DEMANDA que cubre cada uno, y una
 * bomba dimensionada al 48 % de la potencia de diseño cubre el 78,5 % de la
 * energía del año. La app le decía 48 % al certificador.
 *
 * Y lo mismo vale para el CEE FINAL: allí la caldera que se queda es la del
 * propio fichero que se copia, así que la ficha solo declara CUÁNTO se queda
 * y el motor conserva su registro tal cual.
 *
 *   node implementation/backend/scripts/test_hibridacion.mjs
 */
import { medidasCe3x, instalacionNueva, equipoConAjustes, fichaCe3x, claveInstalacion }
    from '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js';
import { resolverCe3x } from '../../frontend/src/features/expedientes/logic/ce3xFinal.js';

let fallos = 0;
const ok = (cond, que) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${que}`);
    if (!cond) fallos++;
};
const casi = (a, b, tol = 0.01) => Math.abs(Number(a) - Number(b)) <= tol;

// ── El expediente de 26RES093_8, con lo que esto mira ────────────────────────
const SUPERFICIE = 123;

function expediente(extra = {}) {
    return {
        numero_expediente: '26RES093_8',
        instalacion: {
            hibridacion: true,
            hibridacion_metodo: 'demanda',
            potencia_bomba: 12,
            potencia_caldera: 27.8,
            tipo_emisor: 'radiadores_convencionales',
            cambio_acs: true,
            misma_aerotermia_acs: true,
            caldera_antigua_cal: {
                marca: 'DOMUSA', modelo: 'CLIMA MIX 20 GE',
                rendimiento_id: 'oil_pre85',
            },
            aerotermia_cal: {
                marca: 'PANASONIC', modelo: 'AQUAREA T-CAP R290 (WH-WXG12ME5)',
                scop: 4.34, scop_temporada: 'calido',
            },
            aerotermia_acs: { marca: 'PANASONIC', modelo: 'AQUAREA T-CAP R290 (WH-WXG12ME5)',
                              scop: 3.59 },
            ...(extra.instalacion || {}),
        },
        cee: {
            cee_inicial: { superficieHabitable: SUPERFICIE, demandaCalefaccion: 270.69 },
            ...(extra.cee || {}),
        },
        oportunidades: { datos_calculo: { zona: 'D3', inputs: { fuelType: 'gasoleo' } } },
    };
}

//: La caldera tal y como la escribe el CEE INICIAL de esa fase. Es lo que
//: `componerFicha` le pasa a la medida: se COPIA, no se vuelve a componer.
const CALDERA_INICIAL = {
    slot: 'mixto2',
    nombre: 'CALDERA DOMUSA CLIMA MIX 20 GE',
    generador: 'Caldera Estándar',
    combustible: 'Gasóleo-C',
    aislamiento: 'Sin aislamiento',
    rend_combustion: '79',
    potencia: '27.8',
    superficie_calefaccion: SUPERFICIE,
    superficie_acs: SUPERFICIE,
    acumulacion: { volumen: 100 },
};

const medida = (exp, existentes = [CALDERA_INICIAL]) =>
    medidasCe3x({ expediente: exp, superficie: SUPERFICIE, fase: 'inicial', existentes })
        .catalogo.find(m => m.id === 'aerotermia');

// ── 1. El reparto es el C_b, no la cobertura ────────────────────────────────
console.log('\n1. El reparto de demanda');
{
    const d = resolverCe3x(expediente());
    ok(d.coberturaBdc === 48, `la cobertura de POTENCIA es del 48 % (sale ${d.coberturaBdc})`);
    ok(d.cbPct === 79, `el C_b es del 79 % (sale ${d.cbPct})`);
    ok(d.pctCal === 79, 'el reparto que se dicta es el C_b, no la cobertura');
}

// ── 2. La medida se puede poner, y lleva los dos ────────────────────────────
console.log('\n2. La medida lleva los DOS generadores');
{
    const m = medida(expediente());
    ok(m.disponible, 'una hibridación YA se puede marcar como medida de mejora');
    const eq = m.datos?.instalaciones || [];
    ok(eq.length === 2, `son dos equipos (salen ${eq.length})`);
    const bomba = eq.find(e => /AEROTERMIA/.test(e.nombre));
    const caldera = eq.find(e => /CALDERA/.test(e.nombre));
    ok(!!bomba && !!caldera, 'la bomba y la caldera');
    ok(bomba?.pct_calefaccion === '79', `la bomba cubre el 79 % (sale ${bomba?.pct_calefaccion})`);
    ok(caldera?.pct_calefaccion === '21', `la caldera, el 21 % (sale ${caldera?.pct_calefaccion})`);
    ok(bomba?.pct_acs === '79' && caldera?.pct_acs === '21',
       'el ACS se reparte igual que la calefacción');
    ok(casi(bomba?.superficie_calefaccion, 97.17), `la bomba sirve 97,17 m² (sale ${bomba?.superficie_calefaccion})`);
    ok(casi(caldera?.superficie_calefaccion, 25.83), `la caldera, 25,83 m² (sale ${caldera?.superficie_calefaccion})`);
    ok(casi(Number(bomba?.superficie_calefaccion) + Number(caldera?.superficie_calefaccion),
            SUPERFICIE),
       'las dos superficies suman EXACTAMENTE el total');
}

// ── 3. La caldera se COPIA, no se vuelve a componer ─────────────────────────
console.log('\n3. La caldera es la del CEE de esta fase');
{
    // Lo que el certificador corrija en Instalaciones (aquí, los litros y la
    // potencia) tiene que llegar a la medida: si se recompusiera desde el
    // expediente, el mismo aparato saldría declarado de dos maneras.
    const propia = { ...CALDERA_INICIAL, potencia: '30', acumulacion: { volumen: 150 } };
    const m = medida(expediente(), [propia]);
    const caldera = m.datos.instalaciones.find(e => /CALDERA/.test(e.nombre));
    ok(caldera.potencia === '30', 'conserva la potencia tecleada a mano');
    ok(caldera.acumulacion?.volumen === 150, 'conserva su depósito');
    ok(caldera.rendimiento === undefined || caldera.rendimiento === 'estimado',
       'sigue siendo una caldera ESTIMADA, no un rendimiento conocido');
}

// ── 4. Lo que no se puede componer NO se inventa ────────────────────────────
console.log('\n4. Sin datos no se compone, y se dice por qué');
{
    const sinCaldera = medida(expediente(), []);
    ok(!sinCaldera.disponible, 'sin la caldera de la fase, la medida no se ofrece');
    ok(/no se compone/i.test(sinCaldera.motivo || ''), `y se dice: «${sinCaldera.motivo}»`);

    const sinPotencia = medida(expediente({ instalacion: { potencia_bomba: 0 } }));
    ok(!sinPotencia.disponible, 'sin potencia de bomba no hay reparto, y no se compone');
    ok(/reparto/i.test(sinPotencia.motivo || ''), `y se dice: «${sinPotencia.motivo}»`);
}

// ── 5. Una SUSTITUCIÓN no cambia ni un número ───────────────────────────────
console.log('\n5. Una sustitución normal sigue igual');
{
    const exp = expediente({ instalacion: { hibridacion: false } });
    const { equipo, extras } = instalacionNueva({ expediente: exp, superficie: SUPERFICIE,
                                                  existentes: [CALDERA_INICIAL] });
    ok(equipo.pct_calefaccion === '100', 'la bomba cubre el 100 %');
    ok(equipo.superficie_calefaccion === SUPERFICIE, 'y sirve toda la superficie');
    ok(!extras.some(e => /CALDERA/.test(e.nombre)), 'la caldera NO entra: se ha retirado');
}

//: Lo mínimo que `fichaCe3x` necesita para componer: la envolvente no pinta
//: nada aquí, lo que se mira es el bloque de instalaciones.
const GEO = {
    parametros: { floor_height_m: 2.8 }, elementos: [],
    inmueble: { direccion: 'CL X 1, PEDRO MUNOZ, CIUDAD REAL', antiguedad: 1994,
                referencia_catastral: '1234567VK0000S0001AA' },
};
const ficha = (fase, ajustes = {}) => fichaCe3x({
    expediente: expediente(), cliente: {}, geo: GEO, envolvente: {}, ajustes, fase,
}).ficha;

// -- 6. El CEE FINAL: la caldera se queda, y la conserva el motor ------------
console.log('\n6. El CEE FINAL de una hibridacion');
{
    // Sin `existentes`: en el final la caldera es la del .cex que se copia, y
    // aqui no se sabe cual es. Lo que viaja es CUANTO se queda.
    const r = instalacionNueva({ expediente: expediente(), superficie: SUPERFICIE,
                                 delFichero: true });
    ok(!!r.equipo, 'el CEE final YA se puede generar en una hibridacion');
    ok(r.equipo?.pct_calefaccion === '79', 'la bomba entra con el 79 %');
    ok(r.hibridacion?.pct_generador_previo === 21,
       `y se declara que la caldera se queda con el 21 % (sale ${r.hibridacion?.pct_generador_previo})`);
    ok(!(r.extras || []).some(e => /CALDERA/.test(e.nombre)),
       'la caldera NO viaja recompuesta: la conserva el motor de su propio fichero');

    const f = ficha('final');
    ok(f.hibridacion?.pct_generador_previo === 21, 'y llega hasta la ficha que va al motor');
    ok((f.instalaciones || []).length === 1, 'con UN solo equipo declarado: la bomba');
}

// -- 7. Lo tecleado para la caldera NO se escribe encima de la aerotermia ----
console.log('\n7. Los ajustes de Instalaciones no se filtran entre fases');
{
    ok(claveInstalacion('inicial') !== claveInstalacion('final'),
       'cada fase guarda lo suyo en su propia clave');

    // El peligro que lo justifica, por si alguien las vuelve a juntar:
    const aero = { slot: 'mixto2', nombre: 'AEROTERMIA PANASONIC', generador: 'Bomba de Calor',
                   combustible: 'Electricidad', rendimiento: 'conocido',
                   rend_calefaccion: '434', superficie_calefaccion: SUPERFICIE };
    const pisada = equipoConAjustes(aero, { nombre: 'CALDERA DOMUSA' },
                                    { superficie: SUPERFICIE }).equipo;
    ok(pisada.nombre === 'CALDERA DOMUSA',
       'lo tecleado MANDA sobre lo derivado — por eso no puede compartirse');

    const tecleado = { instalacion: { nombre: 'CALDERA DOMUSA CLIMA MIX 20 GE' } };
    const fin = ficha('final', tecleado);
    ok(fin.instalaciones?.[0]?.nombre !== 'CALDERA DOMUSA CLIMA MIX 20 GE',
       `el generador del CEE final NO se llama como la caldera (sale «${fin.instalaciones?.[0]?.nombre}»)`);
    const ini = ficha('inicial', tecleado);
    ok(ini.instalaciones?.[0]?.nombre === 'CALDERA DOMUSA CLIMA MIX 20 GE',
       'y en el inicial sigue mandando lo tecleado, como siempre');
}

console.log(fallos ? `\n✗ ${fallos} fallo(s)\n` : '\n✓ Todo correcto\n');
process.exit(fallos ? 1 : 0);
