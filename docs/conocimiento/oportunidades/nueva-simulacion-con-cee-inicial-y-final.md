<!-- conocimiento · área: oportunidades · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Nueva simulación con CEE inicial y final (2026-08-10)

La puerta previa a "Nueva simulación" (solo ADMIN) ya no pregunta un sí/no: pregunta **qué
certificados hay** — *ninguno* · *solo el anterior* · *los dos, la obra ya está hecha* — y admite
cargarlos a la vez, cada uno en su zona de suelta.
[CeePrevioGate.jsx](implementation/frontend/src/features/cee/CeePrevioGate.jsx) solo orquesta: la
extracción es [ceeExtract.js](implementation/frontend/src/features/cee/ceeExtract.js) (`.xml`/`.cex`
exacto, PDF/fotos por OCR), compartida con `CeeUploadModal`.

### REGLA — con CEE FINAL manda la demanda de CALEFACCIÓN del FINAL

⚠️ Solo la de CALEFACCIÓN. La demanda de **ACS** va por el criterio contrario y manda la
del **INICIAL** (`baseAcs`, regla 12.f): es una propiedad del uso del edificio y la
actuación no la mueve, así que si los dos certificados no coinciden, el bueno es el de
partida. La simulación pasa los DOS certificados a `resolveDacs` para que aplique ahí la
misma regla que en el expediente — si no, la propuesta prometería un ahorro que el
expediente recalcularía distinto al aceptarla.

La demanda de calefacción es una propiedad de la **envolvente**, no del generador. Si existe
certificado posterior a la obra, la demanda que la bomba de calor cubre de verdad es la suya, así que
el ahorro se calcula con ella **aunque también tengamos el inicial**. Fuente única:
`demandaDeCalculo()` en [ceeAvisos.js](implementation/frontend/src/features/cee/ceeAvisos.js), aplicada
en `seedInputsFromCees` (ceeSeed.js), en las dos ramas de `CalculatorView.handleCalculate`
(`demandMode` `manual` y `real`) y en `ceeComparison`. No volver a decidirlo en una vista.

De ahí salen los dos avisos cruzados:
- **demanda inicial > final** → la envolvente mejoró: **eso es un RES080**, y para tramitarlo hacen
  falta FOTOS del antes/después y FACTURAS. Sin el aviso se prometería por RES060 un ahorro que la
  ficha no cubre.
- **demanda final > inicial** → aviso a secas (los certificados suelen estar intercambiados o ser de
  otra vivienda). No bloquea; el cálculo sigue usando el final.
- También se cruzan referencia catastral, fechas (el final debe ser posterior) y superficies.

`cee_final` en los inputs es lo que marca el ahorro como **MEDIDO** (`cee_ahorro_origen`): la columna
FINAL de la tabla de emisiones se rellena con el certificado real en vez de estimarse `demanda/SCOP`,
el estimador "¿Aún no tienes el CEE FINAL?" **se oculta** (pulsarlo sustituiría datos medidos por una
hipótesis) y `ResultsPanel` lo dice en verde.

### El funnel da por contestado lo que dice el certificado

Con certificados aportados, `ReformaSubFlow` arranca en **`cee_resumen`**. Con los **dos** CEE el
recorrido queda en **3-4 pantallas** (antes 8-9):

```
ficha de la vivienda → cee_resumen → [elementos, solo si RES080] → docs_obra → identificacion
```

**Lo que el certificado contesta** (y por eso deja de preguntarse): estado de la obra (existe CEE
posterior ⇒ está ejecutada), fecha, "¿tienes certificados?", combustible anterior
(`servicios.calefaccion.combustible`), y **RES060 vs RES080** — `esReformaSegunCee()`: la demanda solo
baja si se tocó la ENVOLVENTE, cambiar el generador no la mueve (margen del 2 % para el ruido del
certificador).

**Lo que ningún CEE contesta** y se pide *en la misma pantalla*, no en cuatro seguidas: el **emisor**
(fija la temperatura de impulsión y con ella el SCOP), si la **aerotermia asume el ACS** (es una
decisión, no un dato) y la **antigüedad de la caldera**.

**REGLA — el η del CEE ELIGE la casilla de la tabla, no la sustituye.** El certificado trae el
rendimiento medido de la caldera antigua, pero el expediente no guarda η: guarda `rendimiento_id` (el
`boilerId` de `boilerMapping`) y vuelve a leer de la tabla. Pisar `boilerEff` con el del certificado
daría un ahorro que el CIFO no puede reproducir, y esa discrepancia es lo primero que mira un
verificador. Por eso `sugerirEdadDesdeRendimiento()` preselecciona la casilla cuya η queda más cerca
de la medida, y si la distancia supera 8 puntos se dice en pantalla.

Salida siempre disponible: **"Prefiero responder a mano"** cae en el funnel de siempre. Con un solo
certificado (sin final) no se puede decidir la ficha ni el estado de la obra: el resumen solo confirma
datos y el recorrido sigue por el camino largo — ahí el bloque de emisor/ACS **no** se muestra, para no
preguntarlo dos veces.

### Los ficheros ya NO se pierden

Antes el `pdfBase64` del CEE se descartaba en `doSubmitInternal` y había que volver a subirlo a mano.
Ahora los `File` originales viajan con el CEE (`_files`) y `subirDocsPendientes()` los sube en cuanto
existe carpeta de Drive: CEE inicial → `DOC_CEE_EXISTENTE`, CEE final → `DOC_CEE_POSTERIOR`,
presupuesto → `DOC_PRESUPUESTO`, facturas → `DOC_FACTURAS` ("5. FACTURAS"). Los tres slots nuevos se
declaran en `buildDocChecklist` — **el POST de subida valida contra ese checklist**, no contra
`getReformaSlots`, y subir a un slot que solo existe allí da "Tipo de documento no válido".
Va SECUENCIAL: el índice de un slot múltiple se calcula contando Drive y en paralelo dos subidas
calculan el mismo.

### Presupuesto y facturas leídos en la toma de datos

Pantalla **`docs_obra`** ([StepDocsObra.jsx](implementation/frontend/src/features/landing/steps/StepDocsObra.jsx)),
solo flujo interno: sustituye a "¿tienes un presupuesto orientativo?" por soltar el PDF.
`POST /api/factura-ocr/extract` ([routes/facturaOcr.js](implementation/backend/routes/facturaOcr.js))
es el gemelo **sin expediente** del OCR de facturas: mismo `facturaOcrService`, pero no guarda en Drive
(aún no hay carpeta) ni levanta incidencias (no hay expediente contra el que cruzar). `staffOnly`:
lleva importes.

**REGLA — facturas y presupuesto no se suman.** Si hay facturas, la inversión son ellas; el presupuesto
solo manda mientras no haya factura. Sumar los dos duplica la inversión del Anexo y el tope de
sobrefinanciación.

**REGLA — el documento tiene DOS importes y cada uno va a lo suyo (2026-08-27).** El OCR lee la
**base imponible**, y ésa sigue siendo la del expediente: `documentacion.facturas[].importe_sin_iva`
es la inversión que declara el Anexo, porque el CAE se justifica sobre la base y no sobre los
impuestos. Pero lo que se vuelca a la ECONOMÍA de la oportunidad —`funnel.presupuesto_eur` →
`inputs.presupuesto`, de donde salen el coste final de la propuesta y la base de la deducción del
IRPF— es el **total CON IVA**: el titular casi siempre es un PARTICULAR y no se lo deduce nadie, así
que su inversión real lo incluye. Con la base a secas, la propuesta le prometía un coste ~21 % más
barato del que iba a pagar. Fuente única de la derivación:
`importesDocumento()` en [routes/facturaOcr.js](implementation/backend/routes/facturaOcr.js), que
devuelve las dos cifras y el tipo aplicado, por el camino más fiable que traiga el papel: base+total
declarados > cuota declarada > tipo declarado > **tipo por defecto (21 %)**. Este último es una
suposición, no un dato, y por eso viaja marcado `iva_estimado` y la pantalla lo dice: el campo es
editable, y ahí se corrige también el caso de titular EMPRESA, que sí se deduce el IVA.

`funnel.presupuesto_modo = 'documento'` (nuevo, junto a `'tengo'`) hace que `funnelToInputs` use esa
cifra.

### Aunque sea una oportunidad, se prepara el expediente

Lo leído se guarda en `datos_calculo.docs_ocr` (**solo metadatos y enlaces** — regla 21) y
`expedienteService` lo vuelca al aceptar:
- `documentacion.facturas[]` ← `docs_ocr.documentos` casado con `reforma_uploads.DOC_FACTURAS`.
  El emparejamiento es **secuencial consumiendo `files_count`**: una misma factura puede haber entrado
  como varias fotos, así que no hay correspondencia 1:1 entre documentos leídos y ficheros subidos.
- `cee.cee_inicial` / `cee.cee_final` ← `xmlDemandData` / `xmlDemandDataFinal`, que la puerta rellena
  con `ceeToXmlShape()`; el módulo CEE los pinta igual que si se hubieran subido los `.xml`.
- nº de serie de la bomba de calor ← `docs_ocr.equipos`, **solo para rellenar huecos**: nunca pisa la
  marca/modelo del catálogo, que es el dato bueno.
