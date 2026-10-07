<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Módulo Documentación Fotográfica — Superficie unificada (2026-05-29)»; la introducción y el resto, en esta misma carpeta.

### Alcance documental — a cada expediente se le pide LO SUYO (2026-08-11)

El checklist ya no es la lista completa de apartados: es la lista de **este** expediente.
Fuente única: [docsAlcance.js](implementation/backend/services/docsAlcance.js), que lee el
expediente y lo inyecta como `datos_calculo.alcance` en `buildDocChecklist`.

**REGLA — manda el EXPEDIENTE; la oportunidad es el punto de partida.** `deriveSelectors`
resuelve en cascada `alcance` → `inputs` → `landing_funnel`. Un campo del alcance a `null`
(el expediente no lo ha declarado aún) **no es `false`**: solo entonces se cae al escalón
siguiente. Sin eso, un expediente recién creado apagaría apartados que la oportunidad sí pedía.

| Situación | Qué deja de pedirse |
|---|---|
| **CEE inicial REGISTRADO** | Fachada, patios, vídeo de la vivienda, planos, CEE anterior y **presupuesto** (`CEE_CAPTACION_SLOTS`) |
| **ACS fuera de alcance** (`cambio_acs === false` o termo eléctrico) | `FOTO_ACS_ANTES`, `FOTO_ACS_DEPOSITO` |
| **Ficha de sustitución de caldera** (RES060/093/TER100) | Ventanas, cubierta, fachada y suelo: la ficha no contempla obra de envolvente |
| **RES080** | Solo los elementos que declara `documentacion.envolvente`, no los de la simulación |
| **Emisor = radiadores** | `FOTO_EMISORES_ANTES` (ver abajo) |
| **Emisor = suelo radiante** | — se pide `FOTO_ARMARIO_SUELO_RADIANTE` |

**REGLA — el apartado que no procede DESAPARECE, no se queda "opcional".** Antes solo se le
quitaba el `required`, y la pantalla del móvil se llenaba de casillas muertas que escondían lo
que sí faltaba. **Nada se pierde**: lo ya subido a un apartado podado sigue en Drive y
`buildDocsView` lo enseña en el cajón `OTROS_EXISTENTES`, que lista la carpeta entera (regla 20).

**REGLA — los RADIADORES ya no se fotografían.** Lo que justifica la temperatura de impulsión —y
con ella el SCOP declarado— es `instalacion.tipo_emisor`, que ya viaja al CIFO; la foto no añadía
nada al expediente y sí una casilla más. `conceptsFromInstalacion` dejó de emitir el concepto
`emisores`. Sigue en `ADDABLE_CONCEPTS` por si un verificador la reclama.

**REGLA — el GENERADOR de calor actual se documenta SIEMPRE, arda o no.** `hayCaldera` preguntaba
"¿hay caldera de COMBUSTIÓN?" y, si no la había, el expediente se quedaba sin **ninguna** foto del
estado inicial. Medido en 26RES080_OP54 (radiadores eléctricos + termo): no se le pedía una sola
foto de lo que se iba a sustituir, que es justo lo que justifica el ahorro de un RES080. Ahora solo
se calla si la vivienda declara que NO tiene calefacción, y `calderaEsCombustion` decide **cómo se
llama**, no si se pide: con calefacción eléctrica el apartado es "Sistema de calefacción actual"
("Cómo calientas hoy la casa" para el cliente) y el del DESPUÉS, "Equipo antiguo retirado" — pedirle
"la caldera vieja ya quitada" a quien nunca tuvo caldera es pedirle una foto imposible.

**REGLA — el ACS inicial se pide según QUÉ APARATO calienta hoy el agua.** Lo dice el paso 5 del
funnel (`boiler_acs_type`): con **`misma_caldera` NO se pide foto** — la calienta la propia caldera y
esa foto ya está pedida más arriba; con `no_tengo` tampoco. Con **otro aparato** (termo · butano ·
solar · gas · gasóleo) sí, y **se le llama por su nombre**: "Tu termo eléctrico actual", no "Sistema
de ACS actual", que no significa nada fuera de una oficina (tabla `ACS_INICIAL_LABEL`). En altas por
CALCULADORA, sin funnel, se deduce de que `boilerAcsType` difiera de `boilerHeatingType`
(`tipoAcsDesdeInputs`).
⚠️ `instalacion.misma_caldera_acs` **solo cuenta cuando vale `false`**: `expedienteService` lo siembra
a `true` en todo expediente nuevo sin mirar lo que contestó el cliente, así que un `true` no es una
declaración y no puede apagar la foto — un `false` sí, porque alguien movió el toggle a propósito.

**REGLA — el ACS INICIAL no es lo mismo que "se cambia el ACS".** `changeAcs` dice si la ACTUACIÓN
toca el ACS; `acsInicial` dice si hay que documentar el que YA HABÍA. En un **RES080** el ahorro se
justifica comparando antes/después y el ACS entra en esa tabla de emisiones (en 26RES080_OP54:
7,91 → 7,59 kg CO₂/m²), así que el termo existente se fotografía aunque la obra no lo sustituya. En
una ficha de sustitución de caldera sigue mandando la regla 12.b: ACS fuera de alcance → no se pide.
El **depósito nuevo** (`FOTO_ACS_DEPOSITO`, fase DESPUÉS) solo se pide si `changeAcs`.

**REGLA — lo que define la ACTUACIÓN va PRIMERO; el contexto, detrás.** Fachada de la calle, patios,
vídeo, planos, CEE previo y presupuesto son material para que el certificador levante el CEE: van al
final. Iban delante, y en un RES080 de cubierta la foto del tejado caía en el **paso 7 de 8**, detrás
de cuatro cosas opcionales — parecía que no se pedía. El orden del `push` en `buildDocChecklist` ES
el orden de la pantalla (`byTier` solo reordena por estado y conserva el índice original).

**REGLA — un apartado de OTRO emisor se retira (`SLOT_EMISOR` / `emisorDesencaja`).** Cada familia
de emisor tiene su foto y son excluyentes: suelo radiante → armario de colectores; radiadores → ya
no se pide; aire-aire (splits/conductos de un RES080) → ninguna, porque esa foto ya es la de la
unidad interior. Pero `syncInstalacionConcepts` habilitaba estos apartados por override y el
override **queda persistido**: al cambiar el emisor después, el apartado seguía apareciendo.
Medido sobre 26RES080_63 (emisor `conductos`): pedía el armario del suelo radiante, que allí no
existe. Se retira solo si el expediente declara un emisor DISTINTO —uno sin declarar no decide
nada— y solo si está VACÍO: lo ya subido no se esconde nunca.

**REGLA — el checklist se pide SIEMPRE por `checklistForOportunidad(opp)`**, nunca por
`buildDocChecklist(datos_calculo)` a pelo, en cualquier ruta que **valide** un slot (subir,
borrar, unir en PDF). Si la vista poda un apartado y el POST no, subir a un slot que ya no existe
responde 200 y queda un destino vivo para quien conserve la URL antigua. Las cuatro superficies
—enlace del cliente, panel del admin, barrido de "qué falta" y `/anexo-photos`— comparten alcance.

**El RITE lo aporta el INSTALADOR**: `optionalAlways` + `aportaInstalador`. Nunca se le marca al
cliente como obligatorio (no puede emitirlo); se le ofrece por si lo tiene y se le dice que se lo
pedimos nosotros.
