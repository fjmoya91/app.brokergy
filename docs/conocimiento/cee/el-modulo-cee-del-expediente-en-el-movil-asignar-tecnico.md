<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El módulo CEE del expediente, en el MÓVIL — asignar técnico (2026-08-21)

La pestaña CEE se abre desde el teléfono para hacer UNA cosa: ver cómo va el certificado y
**mandárselo a un técnico**. Medido a 390 px sobre el DOM (no a ojo): el módulo pedía **538 px**
de ancho, así que 148 px quedaban fuera de la pantalla —y el panel recorta con `overflow-hidden`,
o sea que ni siquiera se podían arrastrar—. Justo ahí vivía el **selector de certificador**
(x=334→538): asignar técnico desde el móvil era literalmente imposible.

**REGLA — el escritorio no cambia; todo lo móvil va en `max-md:`.** Comprobado con capturas a
1440 px antes y después: mismo hash MD5, y el selector conserva sus 204×33 px en la misma
posición. Cuando el cambio no se puede expresar en CSS (montar otro componente) se usa el hook
[useIsMobile](implementation/frontend/src/utils/useIsMobile.js), que corta en los mismos 767 px
que `max-md:` para que CSS y JavaScript nunca se contradigan.

### Asignar técnico — [TecnicoPicker.jsx](implementation/frontend/src/features/expedientes/components/TecnicoPicker.jsx)
Un control con dos caras. En escritorio, el desplegable compacto de siempre (el antiguo
`SearchableSelect` de `CeeModule`, movido tal cual). En móvil:
- **Sube a lo primero de la cabecera** (`max-md:order-first`) y ocupa el ancho entero: es la tarea
  por la que se entra, no un campo más de la fila del título.
- Se abre como **hoja inferior a pantalla completa** con buscador de 16px (por palabras y sin
  tildes, igual que `PrescriptorPicker`), filas de 56 px y área segura del iPhone.
- **El teléfono y el email van EN la fila de cada técnico**, y bajo la tarjeta salen los botones de
  llamar y escribir: se elige certificador por zona y por quién coge el teléfono, y desde el móvil
  lo siguiente que se hace es llamarle.

### Los dos popups del certificador (asignar/notificar y visto bueno)
Pasan a **hoja inferior** en móvil: cabecera fija con el nombre del técnico, un solo eje de scroll
y los botones **pegados abajo** con `env(safe-area-inset-bottom)`. Centrados, el teclado dejaba el
botón de enviar fuera de la pantalla. El mensaje viene **plegado**
([MensajeEditable](implementation/frontend/src/features/expedientes/components/MensajeEditable.jsx)):
nueve renglones a 16 px son media pantalla de un texto que casi nunca se edita. Y el **email y el
teléfono se leen dentro de la píldora del canal** — comprobarlos es lo que se hace justo antes de
pulsar lo único irreversible. Mismo criterio que la página de acciones del parte diario.

### La demanda simulada, detrás de una ⓘ (2026-08-27)

Junto al recuadro de "Demanda calefacción" hay un botón de información que cruza la demanda **y la
superficie** de esta fase con las que se usaron en la **simulación de la oportunidad**. Fuente
única del cálculo:
[demandaPropuesta.js](implementation/frontend/src/features/expedientes/logic/demandaPropuesta.js);
la superficie, [DemandaPropuestaInfo.jsx](implementation/frontend/src/features/expedientes/components/DemandaPropuestaInfo.jsx).

**REGLA — es un BOTÓN, no una banda.** La fila del CEE ya lleva cinco columnas, tres fechas y seis
slots: un recuadro permanente con dos cifras más la convierte en un muro y el expediente deja de
leerse de un vistazo. El dato solo hace falta cuando se compara.

**REGLA — la EXCEPCIÓN es el aviso.** Si la demanda **o** la superficie certificadas quedan por
debajo de las simuladas, el botón se pone **rojo y parpadea** (`animate-pulse`) sin tener que
pulsar nada: sobre esas cifras se le prometió el bono al cliente. Holgura del 2 %, la misma que se
aplica al comparar el CEE inicial con el final — por debajo de eso son redondeos del `.cex`.

**REGLA — en el CEE FINAL de un RES080 el criterio se INVIERTE.** Allí la actuación toca la
ENVOLVENTE, así que la demanda tiene que BAJAR: el ahorro de la ficha es la diferencia entre el
antes y el después. Una demanda que no baja no es "todo en orden", es la señal de que el
certificado no recoge la mejora —o de que es el anterior—, y con ella el RES080 se queda sin ahorro
que justificar; así que el aviso salta cuando NO baja (`esperaDemandaMenor`). El criterio de la
superficie no cambia: la obra no encoge la vivienda.
⚠️ **Salvo que la simulación PARTIERA ya de ese mismo CEE final**, en cuyo caso lo que se espera es
que coincida. No basta con `result.desdeCeeFinal` —solo se sella en modo 'real'—: medido en
26RES080_80, el certificado se cargó en modo 'manual' y el campo llega vacío aunque `q_net` sea
exactamente la demanda del final (94,7). Por eso se comprueba además que las dos cifras coincidan.

**REGLA — la demanda se compara SIN multiplicar por la superficie, y la superficie aparte.** Son
dos desvíos con causas distintas —uno habla de la envolvente y el otro de qué se midió— y
multiplicados se tapan el uno al otro: una demanda un 10 % más baja sobre una superficie un 10 %
mayor da un total idéntico y no delataría nada. El total anual sigue al pie, en gris, como cifra
de control (es la que acaba viajando al CIFO).

**REGLA — el panel se PORTALEA a `document.body`** y va `fixed`, con la posición calculada desde el
rect del botón (y volteado hacia arriba si no cabe abajo). La rejilla vive dentro de una tarjeta
`relative overflow-hidden`, que recortaría un popover absoluto justo en la fila del CEE final, que
es la última. Mismo motivo que `SendActionOverlay` (regla 29.b). En móvil es **hoja inferior**: 320
px colgando de un botón de 20 se salen de la pantalla.

**REGLA — el popup del `.xml` y el botón dicen LO MISMO.** Al soltar el certificado salta el aviso
con el MISMO componente (`DemandaPropuestaPanel`, con `cabecera={false}`) y el mismo criterio.
Antes ese popup comparaba solo **totales** y podía callarse en un certificado que el botón sí
marcaba en rojo: dos veredictos sobre el mismo hecho. El aviso se cruza en las DOS fases y en
todas las fichas; en la final, los avisos propios de la fase (ahorro RES080 por debajo del
simulado, demanda inicial ≠ final) tienen prioridad y éste se enseña solo si aquéllos no saltan.

El valor sale de `datos_calculo.result` (`q_net` por m², `Q_net` total y la superficie aplicada),
con respaldo en la raíz de `datos_calculo` y en la columna `oportunidades.demanda_calefaccion` para
los expedientes viejos. Sin oportunidad detrás —un CEE directo— no se pinta el botón. Existía ya el
aviso al soltar el `.xml`, pero **desaparecía al recargar**: el descuadre volvía a verse al generar
el CIFO, con el cliente ya comprometido.

⚠️ Los rótulos de columna van en una **cabecera única** y la plantilla `COLS` la comparten cabecera
y filas. Repetidos dentro de cada fila, "Oportunidad 200,00 · Certificado 170,00 −15 %" no cabe en
el popover de 320 px y las dos mitades se tocan.

### La rejilla de los dos CEE
Las cinco columnas (250+168+225+320+340 px) se apilan a ancho completo. Las **tres fechas pasan a
tres filas** con el rótulo a la izquierda: un `input[type=date]` a 16 px —obligatorio para que iOS
no amplíe la página— pide ~135 px y en tres columnas el navegador recortaba el formato a `mm/dd/`.
Los rótulos de 7 px suben a 10 px y todos los controles llegan a los 44 px de objetivo táctil
(medidos: 8 botones se quedaban entre 20 y 39 px).
