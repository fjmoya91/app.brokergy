<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La envolvente en TERCIARIO: pequeño y gran terciario (2026-09-28)

CE3X tiene tres programas en uno y lo pregunta lo primero, al crear un certificado:
**Residencial · Pequeño terciario · Gran terciario**. La ventana de la envolvente
hace lo mismo: al pulsar «Traer la envolvente» sin tipo elegido sale el popup
([TipoEdificioModal.jsx](implementation/frontend/src/features/cee-envolvente/components/TipoEdificioModal.jsx)),
con uno PROPUESTO (ficha TER100/TER173 o sector terciario → pequeño terciario; lo
demás, residencial). Si es terciario, en el mismo popup se contesta el **perfil de
uso** (intensidad + horas), si se certifica el **edificio completo o un local** y
la **actividad principal** de la iluminación. Se cambia después en Datos generales
y junto a los botones de generar.

**Medido sobre los 43 `.cex` de terciario del disco** (29 pequeño, 14 gran,
incluidos los ejemplos oficiales de CE3X) contra el residencial, lo que cambia es
MUY poco, y por eso es un módulo pequeño y no otro generador
([tools/terciario.py](implementation/cee-engine/tools/terciario.py)):

| Qué | Residencial | Terciario |
|---|---|---|
| Pickle 0 (cabecera) | `CEXv2.3 Residencial` | `CEXv2.3 PequeñoTerciario` (la ñ escapada, `\xf1`) · `CEXv2.3 GranTerciario` |
| Pickle 2 [1] | tipo de vivienda (`Unifamiliar`…) | **perfil de uso** (`Intensidad Baja - 24h`…, 12 cadenas) |
| Pickle 2 [20] | vacío (701 de 701) | `Edificio completo` / `Local` |
| Pickle 4 slot 7 | — | **iluminación**, una por zona |

La envolvente, los huecos, los puentes, las zonas, los equipos y las medidas de
mejora tienen **exactamente las mismas formas** (1.100 cerramientos de terciario
medidos, ninguna forma nueva). Pequeño o gran terciario **no cambia nada de lo que
escribe la app**: el gran terciario deja definir además bombas, ventiladores y
torres (instalaciones complejas), que pone el certificador.

**REGLA — la plantilla es UNA y la cabecera se escribe.** `montar(..., tipo)` pone
el pickle 0 del programa pedido; lo demás que se copia de la plantilla virgen es
idéntico en los tres programas. `/cex/instalaciones` (el FINAL) no toca la
cabecera: si el expediente dice ahora otro tipo del que tiene el inicial,
responde **422** y hay que regenerar el inicial.

**REGLA — en un TERCIARIO se miden los usos del terciario.** El motor medía solo
lo habitable, que era VIVIENDA y LOCAL, y Catastro llama a un hotel «HOTELERO», a
una parroquia «RELIGIOSO» y «ENSEÑANZA», a una residencia «SANIDAD»: medido sobre
los ejemplos, la parroquia de 25TER100_1 se habría medido solo por la vivienda de
su 2ª planta (302 de 1.272 m²) y la residencia de Socuéllamos, entera, almacén y
aparcamiento incluidos. Esos literales se normalizan a `TERCIARIO`
(`alphanumeric._USOS`), que **no es habitable por sí solo** —en un residencial el
bar de abajo no es la vivienda— y **cuenta cuando el edificio es terciario**
(`pipeline.aplicar_tipo_edificio`, antes de la selección de la oportunidad, que
sigue mandando). El tipo viaja en `POST /geometria` → `/envolvente`, y **cambiar de
residencial a terciario con el plano medido vuelve a medir**. Y el forjado entre
dos plantas acondicionadas de distinto uso (aulas bajo la vivienda del cura) **no
se escribe** (`elementos_horizontales(acondicionados=…)`). Medido con la
parroquia: 1.205 m² en 3 plantas como terciario; 302 m² en 1, como siempre, como
residencial.

**REGLA — la iluminación se ESTIMA como CE3X**: actividad del CTE HE-3, lámpara y
iluminancia, y la potencia sale `P = VEEI · S · E / 100` (comprobado en los 80
registros «Estimado» del corpus). La casilla **«Zona de representación» va con la
actividad** (87 de 87) y la iluminancia por defecto es la que propone CE3X (200 lux
un hotel, 500 un aula…). Solo se ofrecen actividades y lámparas VISTAS en el corpus,
y la lista de la pantalla y la del motor son la misma (lo comprueba un test que lee
el JS). ⚠️ La doble coma-espacio de «Habitaciones de hoteles,  hostales...» es de
CE3X. Una planta que sea otra cosa lleva su propia actividad (`ilum_por_nivel`, por
NIVEL: el nombre de la zona lo pone el motor). Solo se escribe si el slot está
vacío: el CEE final copia la del inicial.

**REGLA — la ACS de un terciario NO es el 140 de una vivienda.** Sale de lo
tecleado, de los litros del certificado o de la **D_ACS del expediente** (la del
CIFO) deshecha a litros/día a 60 °C (`litrosAcsDelExpediente`); en modo CTE —la
fórmula de UNA vivienda— no se deduce nada y se pregunta, **sin proponer** el 140.

**REGLA — la VENTILACIÓN de un terciario es 0,8 ren/h FIJA** (decisión del usuario,
2026-09-28, `VENTILACION_TERCIARIO`). La del residencial sale de la tabla por año
(`getVentanaYACHByYear`), que describe las infiltraciones de UNA VIVIENDA y no tiene
sentido en un hotel o una parroquia. Sigue siendo editable en Datos generales y lo
tecleado manda; el residencial no cambia.

| Qué | Dónde |
|---|---|
| Listas de CE3X, tipo propuesto, iluminación, ACS | [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) — `TIPOS_CE3X`, `tipoCe3xDe`, `iluminacionCe3x`, `litrosAcsDelExpediente` |
| Cabecera, datos generales e iluminación en el `.cex` | [tools/terciario.py](implementation/cee-engine/tools/terciario.py) + `montar` / `con_iluminacion` en `generar_cex.py` |
| Qué se mide de un terciario | `aplicar_tipo_edificio` en [pipeline.py](implementation/cee-engine/src/pipeline.py) |
| Popup del tipo | `TipoEdificioModal.jsx` |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_terciario.py` · `node implementation/backend/scripts/test_tipo_ce3x.mjs` |

⚠️ **Nada de esto se ha podido abrir en CE3X desde aquí**: lo verificado es que cada
pickle tiene la forma de los `.cex` reales de terciario. La primera vez, abrir el
fichero en CE3X y pulsar calcular.
