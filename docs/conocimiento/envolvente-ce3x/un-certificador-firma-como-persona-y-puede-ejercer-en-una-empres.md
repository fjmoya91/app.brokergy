<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Un certificador FIRMA como persona, y puede ejercer en una empresa (2026-09-15)

CE3X pide las dos cosas a la vez en «Datos del técnico certificador»: **Nombre y
Apellidos + NIF** de quien firma, y **Razón social + CIF** de la empresa. La
ficha de Prescriptores no tenía dónde declarar la segunda, así que se colaba en
los campos de al lado: la de **FÉLIX PÉREZ SOBRINO** llevaba `razon_social` = su
nombre y `cif` = **B01799436**, que es el CIF de `FESSA SOLAR, SL`. Dos campos
diciendo cada uno algo distinto de lo que su nombre promete.

| Qué | Dónde |
|---|---|
| Columnas | `empresa_razon_social` · `empresa_cif` (`scripts/prescriptores_empresa_certificador.sql`) |
| Quién ocupa cada casilla del `.cex` | `tecnicoCe3x()` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Cómo se le llama en pantalla | `nombrePartner()` en [utils/tiposEmpresa.js](implementation/frontend/src/utils/tiposEmpresa.js) |
| Dónde se rellena | Bloque **Técnico Competente** de la ficha, y la pestaña de administrativos de `/envolvente/:id` |
| Prueba | `node implementation/backend/scripts/test_tecnico_ce3x.mjs` |

**REGLA — el nombre de una SOCIEDAD nunca desplaza al de quien firma.** La
titulación habilitante y el nº de colegiado son de la PERSONA: un certificado
suscrito por una razón social no identifica a nadie. La empresa ocupa su propia
casilla y, cuando no consta ninguna, la ocupa el nombre del técnico — que es lo
correcto en un autónomo y como se emitieron los certificados de Luis Alberto y
Raquel («Nombre y Apellidos: LUIS ALBERTO LANUZA PELAYO / Razón social: LUIS
ALBERTO LANUZA PELAYO / NIF 70590504P»).

**REGLA — `razon_social` sigue siendo la IDENTIDAD de la ficha.** De ella
cuelgan el listado, los lotes, la facturación del certificador y el histórico, y
en un certificador es el nombre de la persona (así están **6 de los 7**). La
empresa va APARTE en vez de mudarse ahí: cambiarle el significado a esa columna
movería a la vez cuatro sitios que no se han medido.

**REGLA — de quién es el `cif` lo dice `es_autonomo`, no la empresa.** En un
autónomo es su NIF personal —lo sigue siendo aunque ejerza dentro de una
sociedad— y en una empresa es el de ella. Por eso el NIF de quien firma solo cae
al `cif` en un autónomo: en los demás, sin `nif_responsable` la casilla sale
vacía **y se avisa**, antes que escribir el CIF de una sociedad donde CE3X pide
el documento de una persona.

**REGLA — es TEXTO, no un enlace a otra ficha.** La empresa de un certificador
no tiene por qué estar dada de alta como prescriptor —que FESSA SOLAR y
Soluciones Sostenibles lo estén como INSTALADOR es circunstancial—, y el `.cex`
no puede depender de una ficha ajena que alguien puede borrar o reclasificar.

**REGLA — a un CERTIFICADOR se le busca y se le nombra por su NOMBRE**
(`nombrePartner`), con la empresa debajo; a un INSTALADOR, por su acrónimo y su
razón social, como siempre. Es una profesión que se ejerce en persona: firma él
y el encargo se le hace a él. Una empresa certificadora **sin técnico
declarado** (CERTICALIA) sigue saliendo por su nombre comercial — la regla no
puede dejar una tarjeta sin título. El buscador mira las dos cosas: quien
escribe «fessa» está buscando a Félix.

⚠️ La TITULACIÓN se compone como en los certificados ya emitidos
(`GRADUADO EN INGENIERÍA INDUSTRIAL. COLEGIADO COGITI ALBACETE Nº 1779`) y esa
redacción **no se toca** (decisión de 2026-09-15): un mismo técnico no puede
tener dos según quién le prepare el `.cex`. Sin colegio o sin número se escribe
la titulación tal cual, sin inventar el resto.
