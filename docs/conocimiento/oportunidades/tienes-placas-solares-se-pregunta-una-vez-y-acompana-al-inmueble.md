<!-- conocimiento · área: oportunidades · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## ¿Tienes placas solares? — se pregunta UNA vez y acompaña al inmueble (2026-09-07)

Pregunta nueva del formulario de captación `/reforma`, al cerrar el bloque de "cómo
está hoy la vivienda" (caldera → emisores → ACS → **generación propia**) y antes de
hablar de la obra: es un dato del INMUEBLE, no de la actuación.

```
funnel (`placas_estado` · `placas_kwp`)
   → oportunidad (`inputs.fotovoltaica`, visible y editable en la calculadora)
   → expediente (`instalacion.fotovoltaica`, editable en Instalación)
   → encargo del CEE al certificador (ce3xFinal · ce3xTextos)
```

Fuente única de los valores, la normalización y las etiquetas:
[logic/fotovoltaica.js](implementation/frontend/src/features/expedientes/logic/fotovoltaica.js).
El backend la carga por `import()` ESM (`expedienteService`), igual que `cifoService`
con `cifoDoc.js`.

**REGLA — las TRES respuestas valen, y cada una sirve para algo distinto.** *Sí* → hay
generación en la vivienda y el CEE tiene que declararla; *no, pero me interesa* →
cualifica al cliente para la venta cruzada del momento en que se le paga el bono (hoy,
el formulario de Tally de optimización); *no* → es una respuesta, no un hueco.

**REGLA — `estado: null` NO es `'no'`.** Uno es que nadie lo ha preguntado todavía y el
otro es que el cliente ha dicho que no. Los 240 expedientes anteriores a esto salen
"Sin declarar" (chapa ámbar en Instalación), que es lo que son: si se leyeran como "no
tiene placas", el CE3X les propondría poner las que quizá ya tienen.

**REGLA — a quien YA tiene placas no se le propone ponerlas.** `ce3xTextos` ofrecía
siempre el conjunto de medidas "AUTOCONSUMO FOTOVOLTAICO"; con placas declaradas esa
medida describe una vivienda que no es la suya, así que se sustituye por el aviso
contrario — **declararlo como instalación EXISTENTE** (contribuciones energéticas), con
su potencia. Sin el dato, el texto sigue saliendo y lo dice ("no consta si la vivienda
ya tiene placas"). El mismo aviso viaja en el encargo al certificador
(`buildCe3xFinal`), que es donde lee los datos que tiene que teclear.

**REGLA — se dice "FOTOVOLTAICAS" y se explica que son las de la electricidad.** Dos
pantallas antes, el funnel pregunta por las placas solares **térmicas** (las del agua
caliente, `boiler_acs_type: 'solar'`). Sin la aclaración, quien tiene las térmicas
contesta que sí y el certificado declara una generación eléctrica que no existe.

**REGLA — con placas, la potencia se contesta o se dice que no se sabe.** El botón
"No lo sé ahora mismo" existe para que quien no la sepa no teclee un número cualquiera
con tal de pasar de pantalla. Sin cifra, `potencia_desconocida: true` viaja hasta el
expediente y el encargo se lo dice al certificador — que no es lo mismo que no tener
placas.

**REGLA — el chip de la calculadora sale con el panel PLEGADO.** El bloque editable vive
dentro de "Datos del edificio", que nace cerrado; si el dato solo estuviera ahí, entre la
captación y la aceptación no lo vería nadie. Con placas declaradas, la cabecera plegada
enseña "☀️ FV 3,5 kWp" junto a la superficie y la zona.

⚠️ `fotovoltaica` está en la **BLACKLIST de `normalizeData`**: su `estado` es un enum en
minúscula ('si' | 'futuro' | 'no') que la app compara con `===`, y el PUT del expediente
normaliza `instalacion`. Aun así, `normalizarEstado` lee en minúsculas por si algún
expediente trae 'FUTURO' guardado (mismo gotcha que `cee_source` y `tipo_emisor`).

⚠️ No confundir con `reforma_elementos.placas` (del mismo funnel), que es "voy a instalar
placas EN ESTA OBRA" — el que solo da IRPF y nunca CAE. Son dos preguntas distintas y un
cliente puede contestar que sí a las dos.
