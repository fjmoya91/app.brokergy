<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Sin la fase 5, el enlace corto, la fachada propuesta y la numeración desde el 1 (2026-10-26)

Fran, probando la 2026EXT_4 como certificador:

1. «Sigue poniendo EXT4, y quería empezar desde cero».
2. «La URL que se envía al cliente, que sea corta».
3. «La foto de la fachada, que la coja automática del Catastro o Street View, se la muestre al
   certificador y la pueda validar o subir otra».
4. «¿La fase 5, de lo que ha visto la IA, realmente qué hace? Si nos la podemos saltar, que vaya
   directamente a simular. Las skills deben ser capaces ya de sacar eso adelante».

### 1. La numeración: el mayor + 1, no la secuencia

El trigger `certapp_obras_numerar` ([certapp_schema.sql](implementation/backend/scripts/certapp_schema.sql))
tomaba `nextval('certapp_obras_correlativo_seq')`. Una secuencia no vuelve atrás al borrar las obras de
prueba, y bajarla pide SQL en el panel de Supabase (no hay ejecutor en el repo): por eso, tras borrar
la EXT_3, la siguiente fue la EXT_4.

**REGLA — `obras.crear` pone él el `correlativo`**: el mayor que hay + 1 (`siguienteCorrelativo`); el
trigger solo usa la secuencia si llega vacío. Dos altas a la vez chocan en el `unique` de
`numero_expediente` (23505) y se reintenta con el siguiente, hasta 5 veces. Consecuencia buscada: si se
borra la ÚLTIMA obra, su número se vuelve a usar.

La EXT_4 (ya pedida y calificada) se renumeró a **2026EXT_1** con `scratchpad/ext1/renumerar.js <id>
<DE> <A> [--escribir]` (fuera del repo, primero en seco): BD, el trabajo de IA y 13 nombres en Drive.
El «listo para revisar» que ya había salido al equipo dice 2026EXT_4.

### 2. El enlace corto del propietario

Antes: `https://cee.brokergy.es/subir/<uuid>?token=<32 hex>` (unos 110 caracteres). Ahora:
`https://cee.brokergy.es/s/<token>` (unos 40).

- El token nuevo: 12 caracteres [0-9A-Za-z] (`comun.tokenCorto`, ~71 bits, sin sesgo), al crear la
  obra y al rotar el enlace.
- `GET /api/public/certapp/s/:codigo` busca la obra por el token, comprueba que está vigente y
  devuelve solo `{ id }`; 30 por IP cada 10 min. La página (`SubirCliente` con `codigo`) sigue en
  `/subir/:id?token=` con `replace`, que lo vuelve a comprobar todo.
- nginx ya manda cualquier ruta a `certificadores.html`: no hay que tocarlo.
- Los enlaces largos que ya se mandaron siguen valiendo, y una obra con el token viejo (32 hex) da
  un `/s/<32 hex>` que también funciona. Para que sea corto: «Generar un enlace nuevo».

### 3. La fachada, propuesta del Catastro y de Street View

En «Fachada principal», mientras está vacía, la pantalla pide las dos fotos
(`GET /api/certapp/obras/:id/fachada-sugerida/catastro|streetview`, con la sesión, como blob) y las
enseña con **«Usar esta foto»**; si ninguna es la casa, el certificador hace o sube la suya con los
botones de siempre. Al usarla (`POST …/:fuente/usar`) se sube como cualquier foto suya (`docs.subir`,
`FACHADA_CATASTRO_{nº}.jpg` o `FACHADA_STREETVIEW_{nº}.jpg`).
Servicio: [fachada.js](implementation/backend/services/certapp/fachada.js).

**REGLA — se propone, no se guarda sola**: solo entra si el certificador la elige.

**REGLA — cada foto se pide una vez por obra y fuente**: se guarda en memoria 30 min (Street View se
paga por petición; el Catastro tiene WAF, regla 15). Un «no hay foto» solo 2 min: con la 2026EXT_1,
Street View contestó una vez vacío y a la siguiente dio la foto.

Medido con la 2026EXT_1 (CL Alhambra 15, Argamasilla de Alba): Catastro 358 KB en 0,6 s; Street View
56 KB en 0,4 s (panorama de febrero de 2026 a 8 m). Las dos, la casa.

### 4. Sin «Lo que ha visto la IA»

Lo que hacía: con las fotos subidas (o, sin ellas, Street View), Gemini proponía los datos del
cuestionario que el certificador no contesta (tipo de casa, cubierta, fachada, ventanas, equipos por
la placa), más lo que se deduce del Catastro y de su año, y el certificador lo confirmaba o lo
cambiaba antes de gastar el crédito. Con la 2026EXT_4 falló: «La lectura se cortó por el tope de
salida (el modelo entró en bucle)» (25 s, 6 fotos, `gemini-2.5-flash`), y se quedó en «No ha podido
mirar».

Ahora la ficha tiene **cinco fases** (`FASE_IDS` sin `visto_ia`). Al salir de las fotos se escribe lo
deducido del Catastro (`conDeducciones`, con su origen) y se pasa a «Pedir el certificado»; el resto
lo saca la IA del agente al hacer el `.cex`, con las fotos. Un `visto_ia` viejo en `fases_ok` se cae al
sanear. En «Pedir el certificado», lo que antes llevaba a la fase 5 (vivienda, entorno, ventanas) ya
no tiene enlace. La pantalla (`VistoIa.jsx`), su ruta y sus topes siguen en el código, sin usar.

Tras tocarlo: `test_certapp_unidad.js` (fases, token corto, URL `/s/`, fachada sin red) y
`test_certapp_rutas.js` (`/s/` válido, otro, raro y caducado; fachada sin sesión 401, ajena 404, sin
foto 404, fuente mala 400, entregada 409; el token rotado, de 12).
