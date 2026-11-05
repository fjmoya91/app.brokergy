<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Auditar los CEE de un RES060 frente a un RES080: qué cuenta y qué no (2026-11-01)

Fran, al auditar el LOTE-2026-015 [el 016 hasta el 03/11] (26RES060_156, _157, _176, _139, _142). La auditoría pedía «igualar
el CEE final» en varios RES060 y daba como GRAVE un CEE inicial **registrado** después del inicio de la
obra. Las dos cosas estaban mal planteadas.

### RES060: el CEE final no se corrige

**REGLA — en un RES060, el CEE final NO se cambia aunque no coincida con los cálculos del CIFO.** Ni
el SCOP, ni el nombre del modelo, ni las placas que declare, ni ningún otro parámetro de las instalaciones.
El ahorro sale de la fórmula de la ficha: `Dcal × S × (1/ηi − 1/SCOP)` más el ACS. Del CEE solo entran
estos datos:

- la **demanda de calefacción** (Dcal) y la **superficie** (S, la `SuperficieHabitable` del XML);
- los **litros/día** del ACS, solo si la demanda de ACS del XML inicial y la del final no coinciden. En ese
  caso la DACS va por L/D (`docs/conocimiento/calculo/la-d-acs-por-litros-dia-del-certificado.md`).

Lo demás del CEE final (rendimientos, equipos, placas) es calidad del certificado y no afecta a la
exactitud del ahorro: **no es incidencia**. Ni GRAVE ni LEVE, y no se le pide al certificador. Es distinto
en el **RES080**: allí el ahorro sale de la diferencia entre el CEE inicial y el final, así que el final
tiene que llevar exactamente lo instalado. Una discrepancia es **GRAVE**: hay que rehacer el `.cex`,
volver a registrarlo y regenerar el CIFO.

Casos de lo que ya no se pide: en 26RES060_176, placas en el CEE final; en 26RES060_139 y _142, el
modelo «VERSATI IV» escrito de otra forma.

**TER100 entra en el mismo criterio** (Fran, 2026-11-04, 25TER100_2). La TER100 es la RES060 en el
sector terciario: el ahorro sale de la fórmula de la ficha (`AE_C + AE_ACS + AE_CAP`, cada sumando con
su SCOP del CIFO), no de la diferencia entre CEE. En 25TER100_2 el CEE final registrado declaraba un
SCOP de 4,55 (arrastrado del CIFO del sistema antiguo) y el CIFO, con la ficha técnica, 4,30: **no es
incidencia** y el final no se vuelve a registrar. RES093 y TER173 siguen pendientes de decidir.

### El CEE inicial: cuenta la visita y la firma, no el registro

**REGLA — lo que tiene que ser anterior al inicio de la obra es la VISITA y la FIRMA del CEE inicial, no
su REGISTRO.** El certificado existe desde que el técnico lo firma. El registro es un trámite
posterior que se toma semanas. Es el mismo criterio que ya aplican `logic/cifoFechas.js` y
`services/facturaIncidencias.js` (la factura se compara con la FIRMA del CEE inicial).

- **RES060**: el registro **no limita**. Se puede presentar a verificación con el CEE final registrado y
  un CEE inicial **sin registrar**. Un registro posterior al inicio de la obra, o que no haya registro, no es
  incidencia. Sí es GRAVE que la visita o la firma del CEE inicial sean posteriores al inicio de la obra.
- **RES080** (corregido por Fran el 05/11/2026, 26RES080_44): manda también la **visita** (y la firma), no la
  fecha del registro. **Si la visita es anterior al inicio de la obra, el CEE inicial es válido y se
  defiende**, aunque el registro sea posterior al inicio. El RD 390/2021 da un mes desde la firma para
  presentarlo a registro, salvo que la comunidad fije otro plazo. Lo que sí hace falta en RES080 es el
  **justificante de registro** del CEE inicial: la ficha lo pide en su punto 7.
  - Sin justificante → **GRAVE**.
  - Registro posterior al inicio, pero dentro del mes desde la firma → **no es incidencia**. Se explica en
    el escrito aclaratorio del lote: visita y firma anteriores al inicio, y registro en plazo.
  - Registro a más de un mes de la firma y posterior al inicio → **LEVE**, decide Fran.
  - Caso: 26RES080_44, LOTE-2026-016. Visita y firma el 15/04/2026, inicio el 27/04 (entrega de ventanas),
    registro el 13/05: 28 días después de la firma. Va en el lote, defendido.
  - Antes la regla decía que en RES080 el CEE inicial tenía que estar **registrado** antes del inicio, y que
    si no, era GRAVE y bloqueaba el lote. Ya no vale.

Caso: 26RES060_156 (Nuño) se dio NO APTO por un registro del CEE inicial posterior al inicio de la obra.
Con la visita y la firma anteriores, es **APTO**.

Dónde se aplica: skill `auditar-expediente` (matriz de cruces punto 4 y patrones 11 y 15).

### La ficha RES060/080 pendiente no es incidencia, ni siquiera LEVE (2026-11-03)

Fran, al auditar 26RES060_158 (LOTE-2026-015 [el 016 hasta el 03/11]): la auditoría listaba «Ficha RES060 por generar y firmar»
como LEVE. **REGLA — que la ficha esté sin generar o sin firmar no es un defecto del expediente y no se
lista**: ni GRAVE ni LEVE, ni en el informe, ni en la tabla de «qué falta». La ficha se genera **después**
de auditar, cuando el expediente ya está completo y auditado, y la firma el Sujeto Obligado. Lo único que se
audita de ella es que, si ya existe, cuadre con el CIFO (patrones 8, 9 y 10). Skill `auditar-expediente`
(Qué NO es GRAVE, checklist de slots y veredicto).
