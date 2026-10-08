<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «La medida de mejora de una HIBRIDACIÓN (2026-09-16)»; la introducción y el resto, en esta misma carpeta.

### El CEE FINAL desde la MEDIDA DE MEJORA del inicial del técnico (2026-09-30)

> ⚠️ **Desde el 08/10/2026 un RES060 NO se hace por aquí** (decisión del usuario): se COPIA el
> inicial con las instalaciones INSTALADAS y el autoconsumo máximo mes a mes — ver
> [el-cee-final-de-un-res060-copiando-el-inicial.md](el-cee-final-de-un-res060-copiando-el-inicial.md)
> (regla 127). Este camino queda para el RES093; `cee_final.js` manda los RES060 al otro script
> salvo `--desde-medida`. El botón «Generar» de la fila del CEE final todavía usa este camino
> también en un RES060 (pendiente de cambiar).

El otro camino al CEE final, y el que se usa cuando el técnico ya ha ENTREGADO el inicial con su
medida de mejora CALCULADA: el «edificio mejorado» de esa medida ES el certificado final. Botón
**«Generar»** en la fila del CEE final (solo ADMIN, solo RES060 y RES093) y skill
**`generar-cee-final`** (`scripts/cee_final.js`), las dos por la MISMA función.

| Qué | Dónde |
|---|---|
| Montar el final (lógica pura, probable sin servidor) | [tools/cee_final.py](implementation/cee-engine/tools/cee_final.py) → motor `POST /cex/final-desde-medida` |
| Buscar el `.cex` del técnico, catálogo de medidas, guardar en Drive | [services/cee/ceeFinalDesdeMedida.js](implementation/backend/services/cee/ceeFinalDesdeMedida.js) |
| Ruta | `POST /api/expedientes/:id/cee/final-desde-medida` (**staffOnly**; sin `escribir`, solo el análisis) |
| Popup | [CeeFinalDesdeMedidaModal.jsx](implementation/frontend/src/features/expedientes/components/CeeFinalDesdeMedidaModal.jsx) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_cee_final.py` |

**REGLA — la instalación del final es la de la medida del TÉCNICO, tal cual** (sus `sistemas*MM`,
equipo a equipo, con sus porcentajes y superficies). No se recompone desde el expediente, que es lo
que hace el camino de arriba (`/cex/instalaciones`): podría dar otro C_b, otro slot para la
aerotermia u otro reparto del frío, y el final dejaría de ser lo que se revisó. Solo cambian los
pickles 4, 5, 6 y 11; lo demás del fichero del técnico, byte a byte.

**REGLA — salvo la MÁQUINA: si el técnico declaró otro modelo u otro SCOP, manda el EXPEDIENTE**
(decisión del usuario, 2026-09-30). `equiposDelExpediente` ([fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js),
desde `resolverCe3x`) dice qué máquina y qué rendimiento lleva cada servicio, y `corregir_equipos`
(`cee_final.py`) cambia en el registro de la medida SOLO el nombre y las casillas [2]/[7] de ese
servicio, en equipos con el rendimiento CONOCIDO; slot, porcentajes, superficies y acumulación siguen
siendo del técnico, y la misma máquina con el mismo rendimiento no se toca. Con corrección, los
resultados esperados de la medida del inicial ya no valen y se dice. Medido en 26RES060_184/185
(placas leídas: SHP M PRO 012 y MANANTIAL110RPLUSV, no la 010 ni la 150RPLUSB de la medida).

**REGLA — el equipo que da el ACS en el final hereda el DEPÓSITO del inicial** (decisión del usuario,
2026-10-01): la D_ACS del final tiene que ser la del inicial (regla 12.f) y CE3X la calcula con las
pérdidas del depósito. `heredar_deposito` (`cee_final.py`) copia el bloque [8] tal cual (litros, UA,
temperaturas, multiplicador) al equipo del final que cubre ACS sin depósito; si alguno ya lo tiene, no
se añade otro. Medido en 26RES060_185: con los 150 l del inicial, D_ACS 22,04 en las dos fases.

**REGLA — en una HIBRIDACIÓN la medida del final es RETIRAR el generador en apoyo** (la bomba asume
el 100 % de lo que compartían). Se decide mirando el FICHERO, no la ficha: un equipo del inicial
cuya parte de un servicio BAJA en la medida es el que se quedó en apoyo; el equipo nuevo que
comparte ese servicio es la bomba. Una caldera MIXTA que sigue con el ACS se queda con la
calefacción a `['0.0','0']`. En una sustitución no hay nada que retirar y la medida por defecto es
el **autoconsumo** de `medidasCe3x` (importado) — salvo que el `.cex` ya declare placas.

**REGLA — lo que CE3X calculó para la medida del inicial es lo que debe dar el final**
(`datosNuevoEdificio.datosResultados`: emisiones, EPNR, demanda, con sus letras). Se enseña en el
popup y en el script: es la comprobación al calificarlo. Una medida sin calcular o DESFASADA
(`radiografia_cex`) se avisa y el final se genera igual con sus equipos.

**REGLA — las fechas del inicial NO pasan al final.** Se piden (el popup las trae con HOY, a la
vista); sin ellas quedan en blanco y se dice. Con varias medidas manda la que imprime el informe
(casilla 0 del pickle 11); si no casa ninguna, se pregunta. Una medida que toca la ENVOLVENTE
(RES080) no se genera: es la fase 2.

**Cuando el `.cex` del técnico NO trae la medida pero su `.xml` sí** (2026-10-08, 26RES060_178: guardó
el `.cex` a las 19:40 y calculó la medida y exportó el XML a las 19:45; tampoco trae el texto de las
pruebas del Anexo IV), el final no sale («no tiene medida de mejora»). Se le pone en seco la del
EXPEDIENTE con las funciones de `revisionCex.ponerMedida` (`radiografiaCex` + `medidasDelExpediente` +
motor `/cex/medida`, sin subirla) y el final parte de esa copia: `cee_final.js --base=<ruta>`
(`prepararFinal({ cexBase })`), que lo dice en los avisos. La medida va SIN calcular, así que no hay
«lo que debe dar»: la referencia es que las DEMANDAS del final sean las del `.xml` del técnico.

Sale como `{nº} - CEE FINAL_REVISAR.cex` por `guardarEnDrive(ctx, buf, 'final')` —el mismo nombre y
carpeta que el botón de la envolvente—, así que la rejilla no lo toma por la entrega del técnico
hasta que se calcule en CE3X y se suba como `– CEE FINAL`. Caso de referencia: **26RES093_11**,
idéntico byte a byte al montado a mano.

**Medidas de ENVOLVENTE en el final: aislamiento de cubierta y de fachada** (2026-09-30). Se
eligen en el mismo popup, con su **solución constructiva** (cubierta: lana mineral sobre el último
forjado · cubierta invertida con XPS · insuflado; fachada: SATE · insuflado en cámara · trasdosado
interior) y su espesor, y el texto de «Características» —profesional, con material, espesor,
conductividad y la U antes y después— sale de ahí: fuente única
[medidasAislamiento.js](implementation/frontend/src/features/cee-envolvente/logic/medidasAislamiento.js),
que usan el popup y el backend. Con la vivienda ya con placas (sin autoconsumo que proponer) la de
cubierta va marcada por defecto. El motor la escribe con `construir_medida_aislamiento`
(`generar_cex.py`) exactamente como el diálogo «Medida de mejora en el aislamiento térmico» de CE3X
—comprobado campo a campo contra la que guardó CE3X para 26RES093_11—:

| Campo del conjunto | Qué lleva |
|---|---|
| `medidasMejoraEnvolvente` | `[nombre, 'Adición de Aislamiento Térmico', 13 parámetros]` — `[fachada, cubierta, suelo, modo U, modo λ+e, partición, U, λ, e (m), '', por el exterior, 7 ψ, 4 × False]` (decodificados con 5 medidas reales) |
| `cerramientosMejorados` | los del edificio con la U NUEVA en `[3]` de los del tipo elegido; el bloque de «Conocidas» `[9]` NO cambia |
| `mejoras` | `[medidas de envolvente, ['', instalación ACTUAL, False]]` — `False` = la instalación no cambia |
| resumen (pickle 6) | una fila por medida con tipo `Adición de Aislamiento Térmico` |

Se escribe en modo **λ + espesor** (no con una U a secas): CE3X calcula la U de cada cerramiento
con `U' = 1/(1/U + e/λ)` (comprobado en el corpus: 1,4 → 0,4667 · 1,69 → 0,4694 · 1,26 → 0,3515) y
el texto puede decir qué material y qué espesor se ponen. **Una medianera no se aísla** (fachada
contra `edificio`). ⚠️ **El texto no puede llevar «λ» ni rayas largas**: el `.cex` es latin-1 y un
carácter fuera tumba el fichero entero — por eso dice «conductividad térmica de 0,035 W/m·K».
Tras tocarlo: `node implementation/backend/scripts/test_medidas_aislamiento.mjs`.
