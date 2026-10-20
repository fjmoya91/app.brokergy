# Lo aprendido en pasadas anteriores (lo lee el agente en cada pasada)

Son correcciones del ARNÉS y de cómo trabaja el agente, sacadas de comparar sus pasadas con el CEE
del técnico o el del Agente IA de Claude Code. Las reglas de NEGOCIO no van aquí: van a la skill
(fuente única), y solo con el visto bueno de Fran. Cada lección dice de qué pasada sale.

1. **Sin equipo no se abandona.** Si la aerotermia no está en el catálogo y ningún presupuesto
   nombra la máquina, el plan lleva `"aerotermia_generica": true` y `"medidas": ["aerotermia"]`
   (punto 1 de «Lo que hay que poner SIEMPRE»). «parcial» es solo para lo que no depende de ti
   (motor, CE3X o Drive caídos). — 26RES060_194, Sonnet: terminó sin medida.
2. **Un solo `aplicar` bueno.** Antes del primero recorre la lista «Lo que hay que poner SIEMPRE»
   (aerotermia y de dónde sale, altura de planta, aires, fechas, ACS aparte con litros, medidas) y
   el presupuesto. Cada `aplicar` repetido es una vuelta más con todo el contexto encima.
   — 26RES060_194, Opus: dos `aplicar` por olvidar la aerotermia genérica.
3. **Toda foto de fachada o de patio acaba en una pared.** Pásale `leer-pared` y cuenta tú los
   huecos. Si dudas entre dos paredes, ponlos en la más probable (nacen dudosos) y di por qué en
   `decisiones`. Una foto de envolvente que no se usa se dice en `decisiones`, con el motivo.
   — 26RES060_194, Sonnet: no leyó la foto del patio.
4. **Un acristalamiento o un cerramiento pegado a la vivienda que Catastro no separa es VIVIENDA**
   mientras los m² de vivienda de Catastro no digan otra cosa: sus huecos van. Si crees que es
   garaje o porche, que salga de los m² (croquis o zonas), no solo de la foto.
   — 26RES060_194, Opus: dejó sin huecos el acristalado del patio; el técnico lo contó.
5. **Lanza a la vez lo que no depende entre sí**: `estado`, `placas`, `fotos`, `paredes` y
   `documentos_obra listar` en la primera vuelta. Menos vueltas = menos contexto releído.
6. **La máquina del presupuesto se busca en el catálogo aunque no traiga el código.** Con
   `catalogo_aerotermia` por marca y potencia («CARRIER MONOBLOC 12KW» → las Carrier de 12 kW). Si
   salen varias filas, la VALIDADA y con SCOP cálido; si siguen quedando varias (monofásica /
   trifásica), la monofásica en una vivienda, y se apunta en `preguntas`. La genérica solo si de
   verdad no hay ninguna fila de esa marca y potencia. — 26RES060_237: el agente puso la genérica
   sin poder buscar; la 30AWH 12M (id 421) estaba en el catálogo.
7. **Las fotos de «12.» pueden estar mal etiquetadas** (la fachada subida como placa, la placa en
   «OTROS»). Mira TODAS las imágenes en la hoja de contactos y decide por lo que se VE, no por el
   nombre del apartado. Si `placas` no lee nada, busca la placa en las demás fotos y léela tú.
   — 26RES060_237: la placa buena estaba en OTROS_ANTES; Opus lo vio, el lector no.
8. **Quitar un cuerpo o una zona RENUMERA las paredes.** Tras `cuerpos_fuera` / `zonas_fuera` /
   `croquis`, mira `plano_plan.png` (lo deja `aplicar`) y pon los huecos con los nombres NUEVOS. Para
   verlos sin huecos: un `aplicar` del plan sin `huecos` ni `entrada`. — 26RES060_237: «FBS2 no es
   ninguna pared» tras quitar la cochera.
9. **«GARAJE de 0,0 m²» en las decisiones no significa que no se haya aplicado**: mira
   `plano_plan.png`; si la zona sale dibujada y la superficie de la ficha cuadra con la vivienda de
   Catastro, está bien. — 26RES060_194 y _237.
10. **El ACS de la obra se contrasta con el presupuesto, partida a partida** (punto 18 de la
   skill): si el expediente trae un equipo de ACS y el presupuesto no (o al revés), no se inventa
   ninguno; se dice en `decisiones` y en `preguntas`. Un depósito de INERCIA no es de ACS. Sin NADA
   de ACS en el presupuesto, el ACS es un TERMO ELÉCTRICO en el inicial y en el final (regla de la
   skill, punto 18): `caldera.da_acs: false` + `acs_aparte`, y en `preguntas` que la Instalación
   tiene que pasar a «ACS — no se actúa» + termo.
   Si el presupuesto SÍ trae el ACS de la propia aerotermia (acumulador conectado a ella con válvula
   de 3 vías), NO es un termo: el ACS es la misma máquina con su depósito (litros del presupuesto) y
   su SCOP de ACS documentado. Si la Instalación no lo tiene, la medida sale con «___» y sin PDF: dilo
   en `preguntas` con la propuesta concreta y no lo inventes. — 26RES060_190 (Aerosun 200 l).
11. **Un `aplicar --escribir` es caro y deja rastro**: no lo lances hasta que el seco salga limpio de
   avisos que bloqueen el PDF («___», «certificado incompleto»). Si el problema es de la Instalación
   del expediente y no del plan, escribir no lo arregla: termina con la pregunta. — 26RES060_190:
   cinco `aplicar` (uno escribiendo) y los «___» seguían, porque venían de la Instalación.
12. **Si Gemini falla (402, sin crédito), los lectores con IA de la app no van** (`leer-pared`,
   `placas`, `video`): mide tú con la foto y la escala de la puerta, y dilo en el informe.
   — 26RES060_237: el expediente decía «bomba de calor para ACS» y el presupuesto, solo inercia.
13. **El acumulador de la propia aerotermia se arregla en la Instalación, como el botón «Acumulador»
   de la app**: `aerotermia_acs` con `tipo_equipo_nuevo: 'acumulador'`, `es_acumulador: true`,
   `metodo_scop: 'independiente'`, `litros` del presupuesto, `aerotermia_db_id: null` y la ficha de la
   bomba; SCOP_dhw = COP A7/W55 del catálogo × F_c de la zona (Anexo VI; D3 = 1,113). Propónlo así en
   `preguntas`, con la cifra ya hecha. Una vez corregida la Instalación, el CEE se rehace con
   `calificar <clave> --escribir` (receta guardada, sin volver a subir fotogramas ni avisar), no con
   otro `aplicar --escribir`. — 26RES060_190: 2,78 × 1,113 = 3,09; PDF sin «___».
