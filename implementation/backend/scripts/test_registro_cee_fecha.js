/**
 * Prueba la pieza DETERMINISTA del lector de la fecha de registro del CEE:
 * `fechaDesdeFrase`, que reextrae la fecha de la frase citada por el modelo y manda
 * sobre el campo que éste haya aislado.
 *
 *   node scripts/test_registro_cee_fecha.js
 *
 * Sin red y sin BD. La lectura contra un PDF real se prueba con
 * `scripts/probar_registro_cee_ocr.js`, que sí llama al modelo.
 *
 * Lo que se vigila aquí: que el "/2025" del NÚMERO de registro no se lea como fecha,
 * que las tres formas de escribirlo (barra, guion, punto) den lo mismo, y que una
 * frase sin fecha devuelva null en vez de inventarse una — el día que devuelva algo,
 * ese algo acaba en el expediente moviendo plazos y facturación.
 */
const { fechaDesdeFrase } = require('../services/registroCeeOcrService');

const CASOS = [
    // El caso real: el justificante del registro autonómico.
    ['Este es el número de registro 3014080/2025 solicitado el 19/07/2025 a las 09:35:54', '2025-07-19'],
    ['Este es el número de registro 1896238/2026 solicitado el 15/05/2026 a las 09:18:18', '2026-05-15'],
    // Otras redacciones vistas o previsibles en el resto de comunidades.
    ['Registrado el día 03/02/2024 con el número 12/2024', '2024-02-03'],
    ['Fecha de registro: 7-11-2025', '2025-11-07'],
    ['Presentado el 1.3.2026', '2026-03-01'],
    ['Documento con fecha 28/08/2026 de inscripción', '2026-08-28'],
    ['Fecha de entrada 12/12/2025', '2025-12-12'],
    // Sin fecha de registro: mejor null que una fecha adivinada.
    ['Certificado válido durante 10 años', null],
    ['Nº de expediente 3014080/2025', null],
    ['', null],
    [null, null],
];

let fallos = 0;
for (const [frase, esperado] of CASOS) {
    const obtenido = fechaDesdeFrase(frase);
    const ok = obtenido === esperado;
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${JSON.stringify(frase)?.slice(0, 70) || 'null'} → ${obtenido}${ok ? '' : `  (esperado ${esperado})`}`);
}

console.log(`\n${CASOS.length - fallos}/${CASOS.length} correctos`);
process.exit(fallos ? 1 : 0);
