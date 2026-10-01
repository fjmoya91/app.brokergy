---
name: auditar-expediente
description: "Audita un expediente CAE de BROKERGY antes de enviarlo a verificación: matriz de cruces, patrones del verificador, firmas, Supabase y slots; registra incidencias y da veredicto APTO/NO APTO."
---

# Auditar expediente CAE (control de calidad antes de verificación)

Revisa una actuación CAE y devuelve un informe de incidencias clasificadas (ERROR/WARNING/OK/INFO/N/A)
con su acción correctiva, las registra en el MCP de incidencias, y dictamina si es apta para enviar.

**Referencias maestras:** `05. PRODUCCIÓN\00. AUDITOR CAE\MANUAL DE AUDITOR CAE - BROKERGY.md` (detalle) y `MAPA_DE_DATOS_CAE.md` (campo↔documento). Ante duda fina, consúltalas.
- Proyecto Supabase: `app.brokergy` → project_id `okfeopwetlxdffrsbfqw`.
- MCP de incidencias: `registrar_incidencia` (alta), `registrar_incidencias` (alta en bloque), `editar_incidencia` (reclasificar), `eliminar_incidencia` (borrar la que ya no aplica), `get_expediente` (estado/idempotencia), `list_pending`, `get_summary`.
- MCP Supabase (`execute_sql`) y Drive (`search_files`, `read_file_content`). El de Drive solo lee/copia; NO mueve ni borra → lo desordenado se reporta, no se "limpia".

## Principios
- **El CIFO es la fuente de la verdad** para equipos, SCOP, fechas y comparativa. El catálogo (`aerotermia_db_id`) no sustituye al CIFO.
- **Independencia**: cada actuación se audita sola (carpeta, ficha e informe propios; no se agregan datos entre actuaciones del mismo cliente).
- **No corregir**: auditar solo lee, clasifica y registra. Lo no verificable por falta de evidencia → INFO, no ERROR.
- **El punto de corte de la auditoría es el envío al Sujeto Obligado.** Lo que por diseño ocurre DESPUÉS de ese envío no es una incidencia grave, es el siguiente paso del flujo.

## Severidades (mapeo con el MCP)
- **ERROR → GRAVE**: inexactitud importante / incoherencia entre documentos / bloqueante.
- **WARNING → LEVE**: riesgo, mejora o tarea pendiente que no impide dar el expediente por válido.
- **OK / INFO / N/A**: correcto / no concluyente (falta evidencia) / no aplica.
- Cálculo y variables (AETOTAL, SCOP, SCOPdhw, Dcal, DACS, S, ηi) → coincidencia EXACTA **entre CIFO, Ficha RES060/080 y solicitud de verificación**, discrepancia = ERROR. Identificadores (catastral, nº serie, NIF, marca/modelo, importes, fechas) → idénticos o ERROR. Direcciones postales → WARNING. Equivalencias de formato (SCOP % vs decimal) → OK con nota.
- ⚠️ **El Anexo de Cesión NO entra en ese cruce al kWh.** Su ahorro es una ESTIMACIÓN comercial firmada antes de cerrar el cálculo (el propio documento dice "se ha estimado un ahorro de…") y los verificadores lo dan por bueno. Que no cuadre al kWh ni al céntimo con el CIFO **NO es incidencia**: ni GRAVE ni LEVE, y no se menciona en el informe. Solo se reporta si cambia el **titular/cedente, la referencia catastral, las UTM, el precio €/kWh pactado o la vida útil**, o si el ahorro estimado se desvía tanto que la contraprestación deja de tener sentido comercial (criterio: >10 %).

### Qué NO es GRAVE (no bloquea el veredicto)
GRAVE se reserva para lo que está **mal, incoherente o ausente cuando ya debería estar**. No para pasos posteriores del flujo ni para refuerzos opcionales:
- **Ficha RES060 / RES080 sin generar o sin firmar → LEVE, nunca GRAVE.** La ficha se genera **cuando el expediente ya está completo** y se remite al **Sujeto Obligado para su firma**: es el paso siguiente al visto bueno interno, no un requisito previo. `ficha_res060_signed_link = null` o `ficha_res_generada = false` **no impiden el APTO**. Lo que sí se audita es que, cuando se genere, cuadre con el CIFO (patrones 8, 9 y 10).
- Documentos de refuerzo probatorio que no exige la ficha ni el convenio (nota simple registral, certificación catastral, certificado de titularidad bancaria, fotos adicionales) → **LEVE**, aunque los recomiende un anexo propio.
- Literales, rótulos o nombres de plantilla mal puestos en documentos ya firmados (p. ej. un anexo fotográfico que rotula "ventanas" una puerta) → **LEVE** con acción de regenerar y volver a firmar. Solo sube a GRAVE si el literal contradice un DATO de cálculo o de identificación (importe, superficie, nº de serie, referencia catastral).
- **Ahorro del Anexo de Cesión distinto al del CIFO → NO es incidencia** (es una estimación firmada antes del cálculo definitivo). Ver el criterio completo en Severidades.
- Estados de la app desactualizados (`estado_relleno` en `revisar` sobre algo que ya está resuelto) → LEVE con la acción de ponerlo en `ok`.

## Entrada
Expediente por `numero_expediente` (ej. `25RES060_61`) o `drive_folder_id`. Si no se deduce, confirma RES060 (solo aerotermia) o RES080 (envolvente + instalaciones térmicas).

## Procedimiento

### 1. Comprobar salud del MCP de incidencias
Antes de empezar el alta, llama a `get_summary` (o `get_expediente`). Si responde "Session terminated"/"sesión expiró" → el MCP está caído: avisa de que hay que reconectarlo (claude.ai → Conectores → MCP BROKERGY → Desconectar → Conectar) y **no pierdas los hallazgos**: vuélcalos a `INCIDENCIAS_<num>_pendientes.md` en la carpeta del expediente para registrarlos cuando vuelva.

### 2. Resolver y leer estado
Lee el expediente en Supabase (cliente, instalador FK, equipos, `documentacion`, `seguimiento.estado_relleno`). Si hay campos en `pendiente`/`revisar`, **comprueba si siguen vigentes**: muchos quedan colgados de auditorías anteriores y ya están resueltos. Un `revisar` obsoleto se reporta como LEVE con la acción de actualizarlo; solo bloquea el APTO si el dato sigue realmente sin resolver.

### 3. Localizar documentos y leer el CIFO (versión correcta)
- **FUENTE CANÓNICA = la carpeta cuyo nombre TERMINA en "EXPEDIENTE CAE"** (sea `10. EXPEDIENTE CAE` o `<nº> - EXPEDIENTE CAE`): ahí debe estar todo completo y actualizado. Si hay varias, usa la que contenga la documentación real y más reciente; si está vacía/incompleta, cae a las subcarpetas numeradas.
- ⚠️ **Coge SIEMPRE la versión FIRMADA más reciente de cada documento, sobre todo el CIFO.** Si hay varias (`_pte`, `_fdo`, `_rev1`, `_rev2`…), elige la de **fecha de modificación más nueva entre las firmadas** (rev más alta, `_fdo` > `_pte`). **Auditar un CIFO viejo es un fallo**: arrastra SCOP/series/datos caducados. Nunca uses un `_pte` si existe una firmada.
- **Lee el CIFO completo** (Anexo I + FT). Aplica OCR a escaneados (Anexo cesión y Anexo I suelen serlo); nunca des un dato por "no encontrado" sin OCR.
- Aunque el CIFO sea el correcto, **puede traer un SCOP u otro dato mal**: contrasta SCOP/marca/modelo/serie con **fotos de placas** + **FT**, y comprueba que **estén TODAS las facturas**.

### 4. Matriz de Cruces (el 80% del valor)
- **Ref. catastral**: CIFO↔CEE↔cesión↔Anexo I↔catastro → ERROR
- **UTM**: cesión↔CIFO↔RITE↔catastro → ERROR. Excepción: diferencias < ~15 m sobre la MISMA parcela catastral (típico cuando el RITE trae las UTM de la JCCM y el CIFO las de Catastro) → WARNING con nota del origen del dato.
- **Marca/modelo aerotermia**: CIFO↔FT↔foto placa↔Anexo I → ERROR
- **Nº serie equipos**: CIFO↔informe fotográfico↔Anexo I → ERROR. ⚠️ **Serie ACS ≠ serie unidad exterior de calefacción** (el CIFO da las dos por separado, aunque sean misma marca/modelo).
  - **Assert duro:** `select numero_expediente from expedientes where id=:exp_id and instalacion->>'cambio_acs'='true' and instalacion->'aerotermia_acs'->>'numero_serie' = instalacion->'aerotermia_cal'->>'numero_serie';` debe dar **0 filas**. Si devuelve el expediente → la serie ACS está copiada de la de calefacción = ERROR/GRAVE (caso real 25RES060_57). Contrasta la serie ACS con la factura/placa del equipo o depósito ACS del informe fotográfico.
  - ⚠️ **ACS por la MISMA aerotermia + acumulador separado** (p.ej. SHP M PRO 010 + acumulador LAGO 100): NO es un termo independiente con modelo propio. `aerotermia_acs.aerotermia_db_id` apunta a la MISMA aerotermia de calefacción, `metodo_scop='independiente'` (Anexo VI/Caso 3) y SCOPdhw = COP_A7/55 × Fc. La serie del "equipo ACS" del CIFO es la del acumulador (distinta de la U. exterior). Caso real 25RES060_68.
- **SCOP calefacción**: CIFO↔Ficha↔CEE(%)↔FT (a Tª correcta: 35 suelo radiante / 55 radiadores) → ERROR
- **SCOPdhw**: CIFO↔Ficha↔Anexo IV/VI ficha RES060 → ERROR
- **Tª impulsión↔emisor** (35 suelo radiante / 55 radiadores, verificado con RITE/factura) → ERROR
- **Dcal**: CIFO↔CEE → ERROR · **DACS (+XML si el CIFO lo marca)**: CIFO↔Ficha↔solicitud = DACS del **CEE INICIAL** (↔XML inicial) → ERROR
- **DACS — criterio fijo (Fran, 17/09/2026):** la demanda de ACS (kWh/m²·año) tiene que ser la MISMA en el CEE inicial y en el CEE final (XML `Demanda/EdificioObjeto/ACS` de cada uno). Si difiere → **WARNING/LEVE** «DACS CEE inicial X ≠ CEE final Y → se usa la inicial», y la DACS del cálculo es SIEMPRE la del **CEE INICIAL** × S, sea mayor o menor que la final. CIFO, Ficha o solicitud con otra DACS (p. ej. la del CEE final) → **ERROR/GRAVE**: reemitir CIFO, ficha, listado de cesión y solicitud con el valor inicial. Si la DACS va por CTE Anejo F, la diferencia inicial/final sigue siendo WARNING de calidad del CEE. Sustituye al criterio antiguo de «tomar la final por ser más baja».
- **AETOTAL**: **Ficha↔CIFO↔solicitud de verificación → ERROR** (los tres, al kWh, patrón 10). El **Anexo de Cesión queda FUERA** de este cruce: su ahorro es estimado y no tiene que cuadrar al kWh (ver Severidades).
- **Inversión (Σ facturas s/IVA)**: facturas↔ficha↔solicitud → ERROR
- **Fechas inicio/fin** (regla: inicio = 1ª de {presupuesto, 1ª factura, pruebas RITE}; fin = última; coherente con RITE) → ERROR
- **Identidad cliente** (nombre+NIF): cesión↔CIFO↔Anexo I↔factura↔RITE↔titularidad. El titular = cedente (el contacto no es titular) → ERROR
- **No sobrefinanciación** (CAE + subvención ≤ inversión) → WARNING · **Dirección postal** → WARNING · **Vida útil 15 / CNAE** (RES060→4322, RES080→4121) → WARNING
- **S (superficie)**: usa SIEMPRE la `SuperficieHabitable` de los XML del CEE, no la de catastro. Comprueba que `consumo total (kWh/año) = consumo (kWh/m²·año) × S` en el CIFO.

### 5. Patrones de fallo del verificador (cazar siempre)
**Los 6 clásicos:** 1. Fecha inicio incoherente con pruebas RITE. 2. SCOPcal no justificado / falta Tª impulsión. 3. Inversión ≠ ficha/anexo/solicitud. 4. Falta XML demanda ACS si el CIFO lo exige. 5. SCOPcal de la FT sin condiciones de cálculo. 6. SCOPdhw no según Anexo IV/VI ficha RES060.

**Los 7 nuevos — lecciones del requerimiento Marwen CAE-1602 / LOTE-2026-004 (10/08/2026):**

7. **Placa de caldera ilegible o ausente → ERROR (no LEVE).** El ηi solo se sostiene con la placa de características. "Defecto de forma" = foto borrosa, cortada, sin marca/modelo/potencia legibles o con el modelo deducido. Abre la foto y **léela tú**: si tú no puedes, el verificador tampoco. Aplica también a la caldera que **se mantiene** en hibridación (RES09x). Sin placa: exige ficha técnica/homologación del fabricante + declaración responsable del titular.
8. **SCOPdhw ficha ≠ SCOPdhw CIFO → ERROR.** Cruza SIEMPRE los dos documentos campo a campo (no solo el CIFO). Y si `cambio_acs=false`, ambos deben decir "no aplica": copiar el SCOP de calefacción en el hueco de ACS es el fallo típico de plantilla (caso 26RES060_105: ficha 3,70 / CIFO 2,86).
9. **Fechas inicio y fin: ficha = CIFO = solicitud de verificación.** No basta con que la ficha y el CIFO cuadren entre sí — el trío tiene que ser idéntico (caso 26RES093_3: CIFO 29/04 vs ficha y solicitud 23/04).
10. **Inversión: cuadrar las TRES cifras** — Σ facturas s/IVA = importe de la ficha = importe de la solicitud de verificación del lote. El verificador las suma y las compara. Si hay partidas no elegibles, deja escrito qué se excluyó y por qué (caso 26RES080_53: 37.745,20 / 38.038,87 / 39.726,41 €).
11. **CEE inicial: no basta con estar "asignado" — hace falta el JUSTIFICANTE DE REGISTRO** en el órgano competente de la CCAA, del estado **previo** al inicio de la obra. En Supabase: `cee_ini_registro_ok=false` o `seguimiento_cee_inicial != 'REGISTRADO'` → **ERROR/GRAVE bloqueante en RES080**, no aviso. Y adjunta de serie los **.XML del CEE inicial y final** en `1. CEE` (el verificador los pide para validar los cálculos).
12. **Anexo de cesión / Anexo I sin firma o con firmante o beneficiario equivocado → ERROR.** Abre el PDF y comprueba que hay panel de firmas (o firma manuscrita + DNI de ambos), que el beneficiario/propietario inicial del ahorro es el titular real y que coincide con el Anexo I del listado de cesión del lote. Un anexo generado y no firmado que se cuela en el lote tumba la actuación entera.
13. **RES09x — `Cb` calculado con `th` de RES220/RES230 → ERROR AUTOMÁTICO.** Esa columna se titula *"Horas en calefacción anuales (th)"* y sus notas 3 y 4 dicen *"Solo a efecto informativo del dato utilizado para el cálculo de Dcal"*: es la duración de la temporada, no horas equivalentes. El método correcto es el **Reglamento (UE) 813/2013, Anexo III, punto 4.c)**: `Pdesignh = QH / HHE`, con **HHE = 2.066 h (clima medio) / 2.465 h (frío) / 1.336 h (cálido)** — usando el clima en que la FT declara el SCOP adoptado. **Asserts:** (a) `Pdesignh / S` entre 50 y 120 W/m² (S = la del CEE, la de la ficha); (b) `Cb` entre 0,70 y 0,90 — un Cb > 0,95 deja a la caldera < 5 % de la energía y eso no es una hibridación; (c) el clima del SCOP y el de las HHE deben ser el MISMO. Ver detalle en `generar-anexo-cifo`. *Caso 26RES093_3: 0,972 declarado → 0,812 corregido.*
14. **Clima del SCOP: contrasta la nota al pie de la ficha técnica.** El CIFO suele imprimir "Condiciones equivalentes en calefacción: Cálido" por plantilla, mientras la FT declara el SCOP en *"condiciones climáticas promedio"*. Discrepancia FT↔CIFO en el clima = ERROR: arrastra el SCOP y, en RES09x, también las horas equivalentes.
15. **Presupuestos anteriores al CEE inicial.** Si el presupuesto es anterior a la visita/registro del CEE inicial y NO lleva fecha ni firma de aceptación, **no lo trates como "presupuesto aceptado"** y **mantén la carpeta `0. PRESUPUESTO` FUERA de la carpeta "EXPEDIENTE CAE"**. Si se cuela en el lote, el verificador puede tomar esa fecha como inicio de obra y concluir que el CEE inicial se hizo con la obra empezada. → WARNING con la acción de no aportarlo (caso 26RES080_47: presupuestos 19-20/05 vs CEE inicial 18/06).
16. **Reparto de facturas entre cotitulares (proindiviso).** Cuando el instalador factura la actuación dividida entre varios cotitulares para que cada uno se deduzca su parte en el IRPF: carga **TODAS** las facturas como inversión, exige **autorización firmada por todos los cotitulares** designando perceptor único + copia de sus NIF, y añade al PDF de facturas una **nota explicativa** de que el reparto es solo fiscal y que ni la actuación ni el ahorro se fraccionan. La acreditación registral/catastral de la cotitularidad es **refuerzo (LEVE)**, no requisito. Comprueba la no sobrefinanciación contra la suma de las 8 (o N) facturas, no contra la parte del titular.
17. **DACS del CEE final en vez de la del CEE inicial → ERROR.** Marwen lo levanta como inexactitud importante (CAE-1712 nº7, CAE-1713 nº3 y nº6). Compara siempre la demanda de ACS de los dos CEE: si difieren, WARNING y la DACS buena es la del CEE inicial (criterio fijo, ver punto 4).

### 6. Firmas y subvenciones
Firmante correcto por documento (Ficha = rep. legal SO · Anexo I cesión = BROKERGY + rep. legal SO · Anexo cesión = BROKERGY + cliente · Informe fotográfico = BROKERGY · Anexo I actuación = CLIENTE · CIFO = rep. legal instalador · RITE = instalador). Firmante incorrecto = ERROR; PDF aplanado no validable = INFO. No sobrefinanciación; si el Anexo I marca subvención → exigir justificante de registro.
- **Excepción RES080 con dirección facultativa:** si el CIFO se emite como certificado final de obra del **técnico redactor de BROKERGY** y el propio documento identifica a la empresa instaladora y declara que es ella quien suscribe el certificado RITE, no es un ERROR automático → **LEVE**, con la acción de confirmar el criterio con el Sujeto Obligado antes de cerrar el lote.
- Firma manuscrita: exige foto del DNI de **ambos** firmantes dentro del mismo PDF. Si están → OK; si falta uno → LEVE.

### 7. Checklist de DATOS y SLOTS en Supabase (verificar siempre)
- **Slots de documentos enlazados** (o la app los da por no cargados): `anexo_i_signed_link`, `anexo_cesion_signed_link`, `cert_rite_signed_link`, `anexo_fotografico_signed_link`, `cert_cifo_signed_link`, `ft_aerotermia_cal_link`, `ft_aerotermia_acs_link`, `justificante_titularidad_link`, y **cada `facturas[].drive_link`**. Slot NULL con PDF existente → WARNING; sin documento → ERROR/pendiente.
- **`ficha_res060_signed_link` es la excepción:** NULL → **LEVE informativo, NO bloquea**. La ficha se genera al final y se manda a firmar al Sujeto Obligado.
- **Instalador en las FK reales**: `expedientes.instalador_asociado_id` Y `oportunidades.instalador_asociado_id` (no solo el JSON). NULL → ERROR. Verifica también `oportunidades.certificador_asociado_id`.
- **Bloque ACS vs CIFO**: modelo, `numero_serie` (≠ el de calefacción), SCOPdhw y `metodo_scop` (VI=independiente / IV=conjunto) coinciden con el CIFO/FT. Catálogo que no cuadra → ERROR (fila de catálogo mal).
- **Caldera antigua**: `rendimiento_id` coherente con la placa (combustible, año, **condensación/sin condensación**). Mal puesta → ERROR (cambia ηi y AETOTAL).
- **Facturas**: todas las que existan, archivadas y enlazadas. Falta de una existente → ERROR/GRAVE.
- **RES080**: transmitancias U (ventanas/muros/cubierta/suelo) CEE inicial↔final↔CIFO RES080 (ERROR si no cuadran); fotos antes/después; m² coherentes; FT del material con U declarada.

### 8. Registrar incidencias + veredicto
- **Antes del veredicto, corre los asserts duros** (mínimo: serie ACS ≠ serie calefacción del punto 4). Cualquier assert que falle = ERROR/GRAVE automático aunque el resto cuadre.
- **Limpia antes de registrar.** Llama a `listar_incidencias` y revisa las abiertas una a una: las que ya estén resueltas o hayan quedado obsoletas se **eliminan** (`eliminar_incidencia`) o se reformulan (`editar_incidencia`) — no se dejan acumulando ruido. Reclasifica con `editar_incidencia` en vez de borrar y volver a crear cuando solo cambie la severidad o el texto.
- Por cada hallazgo ERROR/WARNING → `registrar_incidencia` (o `registrar_incidencias` en bloque) con `numero`, `texto` (qué está mal + acción), `severidad` GRAVE/LEVE, `procedencia=AGENTE_IA`. **Idempotencia**: `get_expediente` antes para no duplicar abiertas; si `get_expediente` no responde, no registres a ciegas y deja el fichero de pendientes.
- **Veredicto — el corte es el envío al Sujeto Obligado:**
  - **APTO (listo para enviar al SO y a verificación)** si **0 GRAVE** y ningún dato del expediente queda sin resolver. **La Ficha RES060/080 pendiente de generar o de firma del SO NO impide el APTO.** Los LEVE se listan como tareas antes/durante el envío, pero no bloquean.
  - **NO APTO** si hay algún GRAVE. Lista priorizada, GRAVE primero, cada uno con su acción correctiva.
  - Di siempre explícitamente qué falta para el envío al SO y qué queda para después.
- **Revisión de la revisión**: tras subsanación, vuelve solo sobre lo marcado y confirma (la incidencia la cierra el usuario en la app).

### Salida: el registro vivo es la app (informe Excel/PDF = OPCIONAL, solo bajo petición)
La **fuente de verdad operativa** son las incidencias registradas en el MCP/app (se ven en rojo/ámbar y se cierran allí) + el veredicto en el chat. **NO generes** el informe Excel/PDF por defecto: duplica la información y puede quedar desactualizado respecto a la app.
- Genera el informe Excel+PDF **solo si el usuario lo pide explícitamente** (p.ej. "genérame el PDF/Excel del informe", "necesito el informe para enviar a X"). Casos típicos: handoff externo (verificador, Sujeto Obligado) o snapshot/archivo a una fecha.
- Cuando se pida: usa la plantilla `00. AUDITOR CAE\PLANTILLA_Informe_Auditoria_CAE.xlsx`, hojas **Checklist** [Cód./Categoría/Control/Doc./Estado/Detalle/Acción] + **Datos extraídos** + **Resumen** (conteo ERROR/WARNING/OK y veredicto), y un **PDF** resumen accionable con ERROR primero. Guárdalo en la carpeta del expediente (`01. BROKERGY-APP EXPEDIENTES\...\<expediente>`), sustituyendo el informe previo si lo hay, y avísalo.

## Reglas no negociables
- No corregir datos (eso es rellenar): solo leer, clasificar y registrar.
- Trabaja desde la carpeta que acaba en "EXPEDIENTE CAE" y audita SIEMPRE la versión FIRMADA más reciente del CIFO (rev más alta, `_fdo`>`_pte`, por fecha). Auditar una versión vieja = fallo.
- El CIFO manda sobre el catálogo. ACS ≠ calefacción (serie/modelo/SCOP propios). Condensación por el modelo real. Contrasta SCOP/modelos con fotos + FT y confirma que estén todas las facturas.
- **Lo que cuadra al kWh es CIFO = Ficha RES060/080 = solicitud de verificación.** El Anexo de Cesión lleva un ahorro ESTIMADO: no se cruza al kWh y su desviación no se reporta.
- **DACS = CEE INICIAL.** Demanda de ACS igual en CEE inicial y final; si difiere → WARNING y se usa la del inicial. Cualquier documento con otra DACS → ERROR.
- **APTO = 0 GRAVE.** Exige datos correctos y coherentes, slots enlazados, instalador en FK y facturas completas — **pero NO exige la Ficha RES060/080**, que se genera después y la firma el Sujeto Obligado. No inventes bloqueos con pasos que van después del envío al SO.
- Antes de dictaminar, **limpia las incidencias obsoletas** del expediente. Una lista de incidencias que no refleja la realidad vale menos que ninguna.
- ERROR→GRAVE, WARNING→LEVE. **Procedencia:** `AGENTE_IA` si el hallazgo es tuyo; `VERIFICACION` si trasladas un requerimiento del organismo verificador; `GESTOR_AUTONOMICO` si viene de la CCAA. Al trasladar un requerimiento externo: **una incidencia por punto** (nunca agrupes), encabezada con `[VERIFICACIÓN <organismo> · <cód. expte> · Inexactitud nº<n> (importante/no importante) · <fecha> · Act.<n>]`, y mapea *inexactitud importante → GRAVE* / *no importante → LEVE*. Usa `registrar_incidencias` (plural) para el alta en bloque. Si el informe afecta a varias actuaciones del mismo lote, **replica el punto en cada expediente afectado** (el nº de "actuación relacionada" del informe se resuelve con el Plan de Verificación).
- Comprobar salud del MCP antes de registrar; si está caído, volcar a fichero de pendientes.
- **Salida = app + chat.** El informe Excel/PDF NO es automático: solo se genera si el usuario lo pide. Las incidencias en la app son el registro único; el chat lleva el veredicto y la lista priorizada.
- CNAE: RES060→4322, RES080→4121. Intermediario: Soluciones Sostenibles para Eficiencia Energética, SL.