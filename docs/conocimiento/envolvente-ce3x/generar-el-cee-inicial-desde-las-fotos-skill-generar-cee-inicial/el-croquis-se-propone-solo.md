<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### El croquis se PROPONE solo (2026-09-30)

El croquis ya ponía los m²; lo que quedaba por decir era DÓNDE. Muchas veces ni eso hace falta
preguntarlo: un garaje está contra la calle —por ahí entra el coche—, un porche abierto da a un patio o
a un espacio libre de la parcela y un almacén suele estar al fondo. Con eso y los m² que Catastro
declara, el motor propone el croquis al medir y el técnico solo lo corrige.

| Qué | Dónde |
|---|---|
| Dónde va cada uso (lados, anclas, semillas) | [gis/croquis_propuesta.py](implementation/cee-engine/src/gis/croquis_propuesta.py) |
| Qué plantas la necesitan, objetivos y ajuste | `proponer_croquis` en [pipeline.py](implementation/cee-engine/src/pipeline.py) |
| Respuesta del motor | `croquis_propuesto` en `POST /envolvente` (EPSG:25830, ya ajustado) |
| La pista de la foto | `pistasCroquis` en [paredFotoService.js](implementation/backend/services/paredFotoService.js) → `pistas_croquis` |
| Ordenador | «✨ Catastro declara … · Ver dónde» en la barra de la planta + notas con el motivo (`PanelZonas`) |
| Teléfono | «Ver la propuesta» en la pista (`CroquisMovilView`), con el motivo de cada mancha |
| Skill | `paredes` la lista con su `poligono`, lista para copiar al plan |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_croquis_propuesta.py` |

**REGLA — es una PROPUESTA y dice POR QUÉ.** Cada mancha lleva su ancla (las paredes a las que se
pega), el motivo y la confianza: **alta** si una FOTO lo dice (en la foto de esa fachada hay una
puerta de garaje), **media** si sale de la calle o del patio, **baja** si es lo que queda. Nunca se
aplica sola: «Ver dónde» la carga como un croquis más, que se corrige y se ajusta por el MISMO camino
(«Ajustar a Catastro»). Medido en OP246 contra el croquis que se hizo a mano: garaje IoU 0,86, porche
0,60.

**REGLA — se razona por LADOS, no por paredes.** Catastro trocea una fachada cada vez que cambia el
vecino de enfrente (el norte de OP246 son cuatro tramos: 1,25 · 3,01 · 10,09 · 0,06 m) y «la pared más
larga» elegiría un trozo. Un lado es el conjunto de fachadas con la misma orientación y a lo mismo.

**REGLA — solo se propone donde hace falta**: en plantas donde Catastro MEZCLA vivienda con otro uso en
el mismo cuerpo, sin zonas ni croquis ya puestos, y con al menos 4 m² del uso. Lo que es un cuerpo
aparte ya casado con su construcción (el aparcamiento adosado) se quita entero por su botón y no entra.

**La pista de la foto**: al sellar la lectura de una fachada se marca `garaje: true` si hay una
puerta de más de 2,2 m o que la IA describe como de garaje/cochera/portón (`esPuertaDeGaraje`), y la
ruta de geometría se la pasa al motor. Un fallo al leerla solo quita la pista, nunca la medición.

**La propuesta viaja al teléfono** con la sesión (`propuestaLimpia`: uso, puntos y un motivo de 200
caracteres como mucho) y **se retira al volver a medir**: la planta ya tiene sus zonas.

⚠️ El motor hay que REINICIARLO para que devuelva `croquis_propuesto` (Python importa una vez por
proceso; `/health` dice si el código cargado es el del disco).
