<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)»; cada subsección está en su propio fichero de esta carpeta.

## Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)

Catastro dice de qué es cada trozo construido y **se equivoca**: una planta
consta como ALMACEN y es vivienda —pasa con cualquier reforma sin declarar— o al
revés, un porche cerrado consta como vivienda y no lo calienta nadie. Al abrir la
oportunidad se marca en la ficha técnica cuáles cuentan (`CALC.` en el «Detalle
de Construcciones»), y de ahí salen la superficie y el nº de plantas con los que
se le presupuestó al cliente. **Esa misma marca tiene que llegar al `.cex`**, o
el certificado mide otro edificio que la propuesta que se firmó.

| Qué | Dónde |
|---|---|
| Cómo se identifica una construcción y qué se guarda | [utils/construcciones.js](implementation/frontend/src/utils/construcciones.js) — `desgloseConstrucciones` |
| El mismo código, en el motor | `UnidadConstructiva.codigo` en [alphanumeric.py](implementation/cee-engine/src/catastro/alphanumeric.py) |
| Aplicar la selección al modelo | `aplicar_seleccion` en [pipeline.py](implementation/cee-engine/src/pipeline.py) |
| Leerla de la oportunidad y pasarla al motor | `construccionesElegidas` en [ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js) + `POST /:id/geometria` |
| Enseñar el desglose | bloque «Qué se mide de este edificio» de `PanelGenerales` |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_construcciones.py` |

**REGLA — la selección se guarda por CÓDIGO, nunca por el índice de la fila.**
Se guardaba como `selectedConstructions: [0, 4, 5, 7]`, índices de una lista que
**no se guardaba en ninguna parte**: fuera de esa pantalla no había forma de
saber a qué apuntaban, y bastaba con que Catastro devolviera las filas en otro
orden para que señalaran a otra cosa. El código es `escalera/planta/puerta`
(`1/00/01`), que es lo que Catastro usa para distinguir dos filas de la misma
parcela. ⚠️ **La receta y sus valores por defecto están en DOS sitios**
(`${es||'01'}/${pt||'00'}/${pu||'001'}` en `catastroService.js` y
`UnidadConstructiva.codigo` en el motor): si uno cambia, la selección deja de
casar **en silencio**. Lo vigila `test_el_codigo_usa_los_mismos_valores_por_defecto_que_la_app`.

**REGLA — se aplica sobre `attrs["habitable"]`, que es la llave de la que ya
cuelga todo.** Qué plantas se dibujan y se miden (`plano_svg`), la superficie
útil y el nº de plantas del `.cex` (`fichaCe3x`) y de qué paredes se piden fotos
(`plan_fotos`) leen ese campo, así que no hay un camino paralelo que pueda
divergir. Se aplica **antes de `analizar`**. Medido en 26RES060_186: marcando el
almacén de la planta 1, la ficha pasa de **165 m² y 1 planta a 239 m² y 2**, y el
plano dibuja las dos.

**REGLA — sin selección guardada NO se toca nada.** El valor por defecto de la
ficha técnica es «todas las de uso VIVIENDA», que es exactamente lo que ya hacía
el motor con `habitable`: una oportunidad que nunca pasó por esa pantalla no
puede empezar a medir distinto. Solo 85 de las 385 oportunidades tienen selección
guardada (y la del funnel público **nunca llegaba**: `funnelToCalculatorInputs` es
una LISTA BLANCA y no la copiaba).

**REGLA — lo que se corrige se DICE, en los tres sitios.** Que un almacén cuente
como vivienda es una decisión de una persona y no puede ser invisible: el motor
lo saca como diagnóstico (`CONSTRUCCIONES_SELECCIONADAS`), la procedencia del
campo deja de decir «CATASTRO» y pasa a «lo marcado en la ficha técnica de la
oportunidad» (`deQuienSaleLoQueCuenta`), y el desglose lo avisa en ámbar. Lo que
decía Catastro se conserva en `attrs["habitable_catastro"]`: el fichero no puede
borrar el hecho de que su uso registrado es ALMACEN. Un código marcado que ya no
existe en Catastro también se dice — callarlo sería medir de menos.

**REGLA — el desglose también se MARCA desde la envolvente, y escribe en la
OPORTUNIDAD.** Se marca al abrir la oportunidad, pero el error se ve con el
PLANO delante: ahí es donde se nota que la planta que consta como almacén es
vivienda. Obligar a salir, abrir la ficha técnica y volver es el camino que nadie
recorre. `PUT /:id/construcciones` escribe en `inputs.construcciones_elegidas` de
la oportunidad —la fuente— con la RPC `set_oportunidad_construcciones`
(`jsonb_set` de esa clave: `datos_calculo` pesa 86 KB de media y un
read-modify-write se pisa, regla 19), y lo anota en el historial.

⚠️ **NO se tocan `superficie`, `plantas` ni `result` de la oportunidad.** Son las
cifras con las que se le presupuestó al cliente y pueden estar en una propuesta
firmada: moverlas desde aquí, sin recalcular el ahorro ni avisar a nadie,
cambiaría el bono de un expediente en marcha. Lo que cambia es lo que MIDE el
certificado, y la pantalla lo dice.

**Y se VUELVE A MEDIR en el mismo gesto.** Marcar una casilla no cambia por sí
sola lo medido —eso lo hace el motor—, y dejar un aviso de «ahora vuelve a medir»
es justo el estado en el que uno se cree que ya está hecho: el plano seguiría
enseñando la planta de antes. Se pide la geometría al guardar, y cuesta poco
porque Catastro ya está en la caché del motor. Mientras, la línea del bloque dice
«volviendo a medir…» y las casillas se bloquean.

⚠️ **`oportunidades` NO tiene columna `historial`**: vive dentro de
`datos_calculo`. Pedirla en un `select` hacía fallar la consulta ENTERA y la
pantalla decía «este expediente no tiene oportunidad detrás» de uno que sí la
tiene — el mismo gotcha que `prescriptores.telefono`. La escribe la RPC, en la
misma sentencia que la selección: un rastro sin su selección, o al revés, es peor
que no tener ninguno.

La fila que NO cuenta va atenuada pero **legible** (medido: 5,3:1 en tema claro —
con `/25` daba 2,6 y saber qué se dejó fuera es la mitad del valor del desglose).
