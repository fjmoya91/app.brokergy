<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## La RECETA del `.cex` y su SELLO: la ventana y la skill escriben el mismo fichero (2026-10-15)

**Caso: 26RES060_217.** La skill `generar-cee-inicial` dejó en Drive un CEE inicial con dos medidas
de mejora: aerotermia, y aerotermia + 6 kWp de placas. La ventana de la envolvente no enseñaba
ninguna, y Fran preguntó por qué. Si se hubiera pulsado «Generar» desde la ventana, el `.cex` habría
salido **sin medidas**. Pidió (decisión del usuario, 15/10/2026): «lo mismo que haya en el `.cex`
tiene que estar en la ventana, y si cambio algo allí, al generar solo cambia eso y el resto se queda
como si se lo pidiera a la skill».

**Por qué divergían.** Lo que decidía la skill vivía en su plan o en memoria, y la elección de la
pestaña vivía solo en la pantalla:

| Dato | Antes | Ahora (en `cee.envolvente.ajustes`) |
|---|---|---|
| Qué medidas van | `plan.medidas` / `useState` de la ventana | `medidas_elegidas: { inicial, final }` |
| La aerotermia de la simulación | `plan.aerotermia_generica` (en memoria) | `aerotermia_generica: true` |
| Placas de la 2.ª medida (consumo medido por CE3X, PVGIS, inversión 1.000 €/kWp) | en memoria (`segundaMedidaFv`) | `autoconsumo_consumo_medida`, `autoconsumo_pvgis`, `fv_segunda: { inversion, kwp }` |
| Quién firma (Fran por defecto) | `plan.tecnico` (en memoria) | `tecnico_cex` |
| Fechas de visita y emisión | `plan.fechas` (en memoria) | `fechas_informe` |
| Medidas libres | `plan.medidas_libres` | `medidas_libres` |

**REGLA — el trabajo guardado es la RECETA del `.cex`, y el `.cex` sale SIEMPRE de ella.** La ficha
lo lee todo de `ajustes` (`fichaCe3x`: `medidas_elegidas[fase]`, `aerotermia_generica`,
`fv_segunda`; el servicio: `conLaReceta` para el técnico y las fechas, y `ponerMedidasLibres`).
Una lista de medidas que llega por parámetro manda sobre la guardada (es la que se está eligiendo
en ese momento). Con eso, cambiar una ventana en la envolvente y volver a generar cambia solo eso.

**REGLA — las placas de la 2.ª medida NO son «la obra trae placas».** Su inversión va en
`fv_segunda.inversion` y no en `autoconsumo_inversion`: esta última dice que la OBRA trae placas y
cambia la medida por defecto a `aerotermia_fv` sola.

**La 2.ª medida se vuelve a MEDIR en el PC cada vez.** Con la pareja guardada
(`aerotermia` + `aerotermia_fv`), `aplicar` compone primero con la aerotermia sola, CE3X mide el
consumo y `segundaMedidaFv` guarda lo medido en la receta. Si no se puede medir (sin CE3X), sale
con lo de la última vez y queda POR CALIFICAR.

**REGLA — cada `.cex` escrito queda SELLADO** (`cee.cex_sello[fase]`): la HUELLA de la receta
(`huellaFicha`: sha1 de la ficha que recibe el motor, con las claves ordenadas y sin las dos
imágenes del Catastro), el md5 del fichero, quién (`ventana` · `skill` · `pc`) y cuándo, las
medidas con kWp, kWh e inversión, la calificación de CE3X si la hay y `por_calificar`. La ventana lo
enseña («El .cex de Drive», en Generar y en Medidas) con tres avisos distintos, porque se arreglan
distinto:
- **DESFASADO**: la huella de lo que se ve no es la del sello (se ha cambiado algo: volver a generar).
  Para poder compararla, la previsualización manda ya lo SEÑALADO, como al generar.
- **TOCADO**: el md5 del fichero de Drive no es el sellado (se guardó a mano en CE3X o lo subió
  otra persona). Generar responde 409 y la ventana pregunta «Generar igualmente».
- **POR CALIFICAR**: lo escribió el servidor, que no tiene CE3X.

**Lo que la ventana genera queda POR CALIFICAR, y lo termina el PC.** Sin XML ni PDF, sin el
recorte mes a mes del autoconsumo y con las placas medidas la última vez. Es la COLA:
`node scripts/cee_inicial.js calificar --cola --escribir`, o uno solo con `calificar <nº> [--fase final]`.
- El inicial se rehace desde la receta (`aplicar` con un plan vacío, `_calificar`: no estrena nada,
  no avisa al equipo ni da por rehecha una revisión), se vuelven a medir las placas y lo califica CE3X.
- El final se califica tal cual: se COPIA del inicial y no se rehace.
- La cola la enseña también `agente_ia.js cola`.

**La skill COMPRUEBA la receta.** Al terminar, compone como lo haría la ventana (el
expediente recién leído de la BD + la receta) y dice «✓ la ventana compondría el MISMO .cex» o
avisa con las dos huellas.

**Lo que NO cubre (todavía).**
- El PREVISTO de un RES080 (`plan.previsto`) sigue saliendo solo de la skill.
- Los `.cex` escritos por otros caminos (`cee_final_copiando.js`, «Poner la medida» de la revisión)
  no se sellan: la ventana los verá como «tocados» frente a su último sello.
- Lo que se cambie a mano dentro de CE3X, más allá de «Actualizar», no vuelve a la app.
- Los trabajos guardados antes del 15/10/2026 no tienen receta completa: se completa al volver a
  pasar la skill o al elegir en la ventana.

Medido en seco sobre 26RES060_217: receta `4ed47b96271f0fea`, dos medidas (6,12 kWp · 7.446
kWh/año · 16.120 €), CE3X G (160,65 / 616,14) y recorte de junio y septiembre (579 → 538 kWh), y
«la ventana compondría el MISMO .cex».

Fuentes: [ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js) (`conLaReceta`,
`huellaFicha`, `ponerMedidasLibres`, `sellar`, `estadoDelCex`, `porCalificar`),
[routes/ceeEnvolvente.js](implementation/backend/routes/ceeEnvolvente.js) (`/ficha` devuelve la
huella, `GET /:id/estado-cex`, `/cex` con `forzar`),
[fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) y
`SelloCex` en [PanelesFicha.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelesFicha.jsx).
`cex_sello` está protegido en los PUT de expedientes y CEE directos, igual que `agente_ia`.
Tras tocarlo: `node implementation/backend/scripts/test_receta_cex.mjs`.
