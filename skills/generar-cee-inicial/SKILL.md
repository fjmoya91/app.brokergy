---
name: generar-cee-inicial
description: 'GENERA el CEE INICIAL (.cex de CE3X) de una oportunidad o de un expediente a partir de sus FOTOS: lee la placa de la caldera existente, la de la aerotermia que se va a poner, cuenta y mide las ventanas y puertas de cada fachada, las asigna a su pared en el plano del Catastro y escribe el .cex con la aerotermia como MEDIDA DE MEJORA. Si la aerotermia no está en el catálogo, la da de alta con todo lo que justifica su SCOP de clima cálido a 35 y 55 °C: ficha técnica del fabricante, ficha y etiqueta EPREL y Keymark si existe, unidas y guardadas en Drive. Úsalo cuando el usuario diga "genera el CEE inicial de NNN", "hazme el .cex de la oportunidad OP246", "prepara la envolvente de X con sus fotos", "mete esta aerotermia en el catálogo". Es el gemelo de `revisar-cee`: aquél revisa el .cex que entrega el certificador; éste se lo da ya hecho. Lo leído de una foto NACE DUDOSO y lo que no se puede afirmar no se inventa.'
---

# Generar el CEE inicial desde las fotos

Deja en **`1. CEE / CEE INICIAL`** el fichero `{nº} - CEE INICIAL_REVISAR.cex`, con la vivienda
dibujada por el Catastro, sus huecos señalados en cada fachada, la caldera actual con la potencia de
su placa y la aerotermia real como **medida de mejora** — y el mismo trabajo guardado en la ventana de
la envolvente (`/envolvente/:id`), donde el certificador lo abre y confirma lo que está en ámbar.

- **Todo sale por las MISMAS funciones que la ventana** (`ceeEnvolventeCex.componerFicha`,
  `senalado.js`, `paredFotoService`, los lectores de placas). El `.cex` de la skill y el del botón no
  pueden diferir.
- **El modelo solo LEE; lo decide el código y una persona.** Cada lectura se contrasta con la foto
  antes de entrar en el plan. Lo leído nace `dudoso` (ámbar en la ventana).
- **No se inventa**: ni el polígono de un garaje, ni un nº de serie manuscrito, ni una potencia que
  la placa no dice. Se deja en blanco y se DICE en el informe final.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Motor de envolvente (cee-engine) levantado
  en `CEE_ENGINE_URL` (local: `http://127.0.0.1:8090`; `npm` del backend no lo arranca).
- **El que hace el CEE es el «AGENTE IA», un certificador más.** Sale en la barra de certificadores
  del expediente: al EMPEZAR se marca (`agente_ia.js empezar`) y al ESCRIBIR el `.cex` la fase pasa
  a «pendiente de revisión» y llega un aviso por WhatsApp + email, igual que cuando un técnico sube
  su archivo. Así se sabe siempre si está hecho o no (ver «El agente» más abajo).
- **Dónde se ejecuta — Claude Code o Cowork:** los comandos son los MISMOS y van SIEMPRE en el PC
  (repo + `.env` + motor). En Code, por la shell; en **Cowork, por Desktop Commander, nunca en el
  sandbox**. Rutas, motor y qué hacer si no hay PC: [comun/entorno.md](comun/entorno.md).

## La herramienta

Todo pasa por `implementation/backend/scripts/cee_inicial.js` (desde `implementation/backend`):

| Orden | Qué hace | Escribe |
|---|---|---|
| `estado <clave>` | Lo que hay: RC, zona, caldera, ACS, aerotermia, construcciones, trabajo y `.cex` | nada |
| `placas <clave>` | Lee la placa de la caldera y la de la aerotermia y la casa con el catálogo | nada |
| `fotos <clave> [--out DIR]` | Baja todas las imágenes de «12. DOCUMENTOS PARA CEE» con su id de Drive | nada |
| `paredes <clave> [--out DIR]` | Mide el edificio, lista paredes/construcciones y dibuja `plano.png` (cartografía), `plano_satelite.png` (paredes sobre la foto aérea) y `satelite.png` (la foto aérea sola, con la fecha del vuelo) | nada |
| `leer-pared <clave> --pared ID --fotos id1,id2` | Inventaria los huecos de una fachada desde su foto (escala por la puerta) | nada |
| `eprel <modelo>` | Busca el modelo en EPREL y baja su ficha (ES) y su etiqueta | nada |
| `alta-aerotermia --json d.json [--ficha ft.pdf:1,3-4] [--eprel-fiche f.pdf] [--eprel-label l.pdf]` | Da de alta el equipo en el catálogo y guarda la ficha unida en Drive | con `--escribir` |
| `aplicar <clave> --plan plan.json` | Guarda el trabajo, pega las fotos, compone la ficha, escribe el `.cex`, lo guarda en Drive **y avisa** (`--sin-aviso` lo calla) | con `--escribir` |

Y el **agente** (`implementation/backend/scripts/agente_ia.js`):

| Orden | Qué hace |
|---|---|
| `cola` | Lo que tiene encargado el agente y no ha terminado, y lo que dejó hecho pendiente de revisar |
| `empezar <clave> [--fase final] [--reasignar]` | Pone «AGENTE IA» en la barra de certificadores y la fase «en trabajo» |
| `terminar <clave> [--fase final] [--sin-aviso]` | Solo si el `.cex` se dejó por otro camino: «pendiente de revisión» + aviso |
| `estado <clave>` | Quién es el certificador y qué consta del agente en ese CEE |

`<clave>`: `26RES060_OP246` (oportunidad), `26RES060_186` (expediente) o `2026CEE_55` (CEE directo);
el origen se deduce del formato (`--origen op|cae|cee` lo fuerza). **Sin `--escribir` no se toca
nada**: siempre primero en seco.

## El recorrido

0. **Márcalo: `node scripts/agente_ia.js empezar <clave>`** (en una oportunidad no hace nada: no tiene
   certificador). Si el expediente no tiene técnico, pone **«AGENTE IA»** en la barra y la fase pasa a
   «en trabajo». Si ya tiene un **técnico de verdad** asignado, NO se lo quita: lo dice y el agente le
   prepara el borrador. **Pregunta** entonces si se quiere poner a nombre del agente (`--reasignar`):
   puede que ese técnico sea quien tiene que firmarlo.
   - Si el usuario pregunta «¿qué tienes pendiente?» o «¿está hecho el CEE de X?»: `agente_ia.js cola`
     (o `estado <clave>`).
1. **`estado`**. Sin carpeta de Drive no hay dónde dejar el `.cex` (en una oportunidad: guardarla
   desde la calculadora). Si ya hay trabajo guardado, `aplicar` lo conserva y añade encima.
2. **`placas`**, y **abre las fotos de las placas** para contrastar marca, modelo, potencia y serie.
   - La CALDERA: la potencia que va al `.cex` es la **útil** (`Pn`, *Output*, *Puissance rendue*),
     no el consumo (`Qn`, *Input*). En una placa policombustible, la del combustible del expediente.
     «Caldaia / Chaudière / Boiler» es la palabra caldera, no la marca: la marca suele estar en el
     frontal (foto de la caldera entera).
   - Un nº de serie manuscrito o cortado **no se escribe**. En CE3X no hace falta.
   - La AEROTERMIA: el código de la placa de la unidad exterior es el que casa con el catálogo. Un
     número de 13 cifras bajo unas barras es el **EAN**, no el nº de serie.
3. **Si la aerotermia NO está en el catálogo**, se da de alta (ver `referencia/alta-aerotermia.md`):
   ficha técnica del fabricante (las páginas con el SCOP/η por clima y temperatura), `eprel <modelo>`,
   Keymark si existe. **Nada de valores deducidos**: el SCOP de clima **cálido** a 35 y 55 °C tiene
   que estar escrito en un documento, y SCOP = 2,5·(η+3)/100 tiene que cuadrar (el script lo
   comprueba). Primero en seco, luego `--escribir`. Nace `is_validated: false`.
4. **`fotos`** y **`paredes`**. Mira `plano.png` (norte arriba) junto a las fotos de fachada y patios
   y decide **qué foto es de qué pared**: la calle, el patio, la medianera. Cada planta es una pared
   distinta (`FBE1` planta baja, `F1E1` primera).
   - **Mira también la VISTA AÉREA**: `satelite.png` (la foto sola, para leer los tejados sin rayas
     encima) y `plano_satelite.png` (las paredes encima). Es la ortofoto del PNOA (IGN), la misma capa
     «◩ Satélite» de la ventana. De ella sale lo que la cartografía no dice:
     · **qué hay al otro lado** de cada pared: calle, patio, piscina, el adosado de al lado o un solar
       (medianera o fachada) — contrástalo con cómo la clasificó Catastro;
     · **dónde está el garaje**: la entrada de coches desde la calle, el vado, un coche aparcado dentro
       de la parcela; y el porche, que a menudo se ve como una cubierta de otro material pegada a la casa;
     · **lo construido que no consta** en Catastro (un cobertizo, una ampliación): dilo en el informe;
     · **la cubierta**: inclinada de teja o plana (azotea), y si lleva **placas** (fotovoltaicas o
       térmicas) — contrástalo con lo que el cliente dijo al aceptar (`confirmacion_cliente`).
   - ⚠️ **La foto NO es una «ortoimagen verdadera»** (lo dice el propio IGN): los tejados altos salen
     **desplazados** respecto a la huella —medido en 26RES060_208: ~2 m en una casa de dos plantas—.
     La foto dice QUÉ hay y DÓNDE aproximadamente; **no se mide con ella**. La geometría es la del
     Catastro y las superficies, las suyas.
   - ⚠️ **Mira la FECHA DEL VUELO** (va en la leyenda y la imprime `paredes`). Una foto anterior a la
     obra o a una ampliación enseña otra casa: si las fotos del cliente contradicen la aérea, mandan
     las del cliente, y se dice.
   - Si Catastro mezcla vivienda con garaje o porche en el MISMO cuerpo, `paredes` lo avisa (tabla de
     CONSTRUCCIONES por planta). Entonces **propón tú el CROQUIS** (`croquis` en el plan, ver
     `referencia/plan.md`): manchas aproximadas en fracciones de la huella (de oeste a este y de sur a
     norte) de DÓNDE está cada uso. **Los m² los pone Catastro**: el motor endereza las manchas, las
     ajusta a la superficie de cada uso en esa planta y alinea las paredes. Deduce el «dónde» de las
     fotos: en qué extremo de la fachada está la puerta del garaje (mirando la fachada desde la calle,
     derecha e izquierda dependen de hacia dónde mira: compruébalo con el plano), dónde está la
     entrada, qué hay bajo el porche; y de la vista aérea, por qué lado entra el coche. Lanza
     `aplicar` en seco y **mira `plano_plan.png` y `plano_plan_satelite.png`**: el garaje tiene que caer
     del lado de la entrada de coches.
   - `paredes` trae además una **PROPUESTA DE CROQUIS** del motor (garaje contra la calle o contra la
     fachada en cuya foto se vio una puerta de garaje, porche contra el patio, almacén al fondo), ya
     ajustada a los m² de Catastro, con su motivo, su confianza y el `poligono` listo para el plan.
     Es un PUNTO DE PARTIDA: **contrástala con las fotos y la cartografía** antes de copiarla; si no
     cuadra (confianza baja, o las fotos dicen otra cosa), dibuja la tuya en fracciones.
   - Si con las fotos no se puede saber dónde está cada uso, **PREGUNTA** con una frase concreta
     («¿el garaje está al norte o al sur?»), o pide al usuario que lo pinte en la ventana
     («✏️ Croquis»). Nunca se inventa la topología; las superficies nunca se inventan: son de Catastro.
5. **`leer-pared`** por cada fachada con foto. Es una **propuesta**: la IA confunde a veces una
   máquina exterior con una ventana o se deja un hueco de un balcón. **Cuenta tú los huecos en la
   foto** y usa lo leído solo como apoyo de las medidas (su escala sale de la puerta de 2,05 m, y en
   una foto escorzada es orientativa — lo dice el propio aviso).
6. Escribe el **plan** (`referencia/plan.md`) y lánzalo en seco: **`aplicar --plan`**. Revisa la
   ficha que imprime (superficie, plantas, instalaciones, medida) y los avisos. Luego `--escribir`.
   **Con `--escribir` avisa solo**: la fase queda «pendiente de revisión» (si el encargo es del agente)
   y sale el WhatsApp + email al equipo con el `.cex`, la carpeta y lo que queda por hacer. Si lo
   relanzas en la misma sesión para corregir algo menor, añade `--sin-aviso` (o el usuario recibirá
   otro aviso «actualizado»). Si el aviso falla, el `.cex` ya está guardado: dilo y reintenta con
   `agente_ia.js terminar <clave>`.
7. **Informe final**: el enlace del `.cex` y de la carpeta, y la lista de **lo que queda por hacer**
   (ver abajo). Nunca «listo» a secas: el `.cex` lleva `_REVISAR` porque hay que abrirlo en CE3X.

## Reglas que no se rompen

- **Una ventana con balcón es una BALCONERA**: `ventana` de ~2,10 m de alto, no `puerta` (una puerta
  sale de madera al 90 % de marco; una balconera es un hueco acristalado).
- **Una puerta de patio acristalada** va como `puerta` con `porc_marco` 30-40 y su marco y vidrio.
- **El garaje, un trastero o un porche NO son vivienda**: van al croquis (o a `zonas_fuera`) y sus
  huecos NO se ponen — la puerta del garaje, y también las ventanas que el reparto deje dentro del
  garaje. Un porche abierto es `PORCHE` (exterior), no un espacio no habitable.
- **Las superficies por planta tienen que casar con Catastro**: vivienda + garaje + porche de cada
  planta. Lo comprueba el propio `aplicar` («CROQUIS ajustado … (Catastro …)»).
- **El ACS que da otro aparato** (un termo): la caldera va `da_acs: false` y el termo en `acs_aparte`.
  Sin eso la caldera sale mixta y el termo no aparece. Lo dice el funnel (`boilerAcsType`).
- **En una OPORTUNIDAD, `aplicar` cambia la aerotermia de la simulación** (los mismos campos que
  «Leer la placa» de la calculadora): el SCOP pasa del genérico al del catálogo, así que el
  **resultado de la propuesta queda desfasado** hasta que alguien abra la calculadora y guarde. Se
  anota en el historial y se dice en el informe.
- **En un EXPEDIENTE, la aerotermia no se toca aquí**: se cambia desde Instalación («Leer placas»),
  que recalcula el SCOP y el ahorro. `aplicar` avisa si el plan dice otra.

## Lo que el informe final dice SIEMPRE

- Que el aviso **ha salido** (o por qué no) y en qué fase queda: «pendiente de revisión» si el
  encargo es del agente; si hay un técnico asignado, que sigue siendo suyo.

- Qué se ha leído de cada placa y qué **no** se ha escrito (y por qué).
- Cuántos huecos por pared y que están **por confirmar** (ámbar) en la ventana.
- Lo que **no se ha podido afirmar**: garaje/porche dentro de la planta, fachadas sin foto (sin
  huecos puestos), depósito del termo sin litros, pilares estimados.
- Lo que dice la **vista aérea** y no consta en otro sitio (construcciones sin declarar, placas en el
  tejado que el cliente no mencionó, tipo de cubierta), con la **fecha del vuelo**.
- Que el `.cex` va **sin técnico** si es una oportunidad, y que la medida de mejora va **sin calcular**
  (en CE3X: Medidas de mejora → Actualizar).

## Pruebas

```bash
node implementation/backend/scripts/test_agente_ia.js       # el agente: a quién se le queda, fases, aviso
node implementation/backend/scripts/test_senalado.mjs       # lo señalado, montado sin React
node implementation/backend/scripts/test_placa_ocr.js       # potencia útil vs consumo, Input/Output
node implementation/backend/scripts/test_placa_equipo.js    # casación con el catálogo, EAN ≠ serie
node implementation/backend/scripts/test_ortofoto.mjs       # rejilla de la ortofoto, fecha del vuelo
```

## Y después: el CEE final

Cuando el técnico entrega el inicial (con su medida calculada) y se le da el visto bueno, el CEE
final sale de esa medida: skill **`generar-cee-final`** (o el botón «Generar» de la fila del CEE final).
