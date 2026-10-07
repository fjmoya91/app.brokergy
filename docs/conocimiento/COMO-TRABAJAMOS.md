# Cómo trabajamos: peticiones, audios, subagentes y tokens

> El resumen está en el `CLAUDE.md` (se carga siempre). Esto es el detalle, con ejemplos.

## 1. Cómo pedir las cosas

Se pide como se habla, sin plantilla. De cada petición Claude saca cinco cosas:

| Qué | Ejemplo |
|---|---|
| **Sobre qué** — la obra, el expediente o el área | `26RES060_187`, «la envolvente», «los lotes» |
| **Qué resultado** — lo que tiene que quedar, no cómo | «que el CIFO salga con la fecha del RITE» |
| **Hasta dónde** — mirar, proponer, hacer, subir, desplegar, enviar | «solo mírame», «déjalo hecho», «súbelo» |
| **Qué no se toca** | «sin cambiar el texto del convenio» |
| **Qué tareas son independientes** | «y aparte, revisa el lote 5» |

Si falta algo que **cambia el resultado** (casi siempre el «hasta dónde» de algo irreversible, o qué
expediente es), Claude pregunta **una vez**, con opciones. Lo demás lo resuelve con los valores por
defecto y lo dice en una línea al empezar («Entiendo: … Lo hago en local y te lo enseño»).

### Plantilla, solo si quieres precisión

```
Obra / área:   26RES060_187   (o «la envolvente»)
Quiero:        …
Hasta dónde:   mirar | proponer | hacer en local | commit | desplegar | enviar
No tocar:      …
En paralelo:   sí / no
```

## 2. Hasta dónde llega Claude si no se dice

| Si no se dice nada | Claude hace |
|---|---|
| Cambiar código | Lo cambia **en local**, lo verifica (pruebas, vista previa) y lo enseña. **Sin** commit, push ni deploy |
| Un script que escribe en la BD o en Drive | Primero **en seco**. Local escribe en la Supabase y el Drive de **producción** |
| Mensajes a terceros (cliente, instalador, S.O.) | Prepara el borrador y lo enseña. **No sale nada** sin un «sí» para ESE envío |
| Algo que no se puede deshacer (borrar, firmar, presentar) | Pregunta antes, siempre |

Palabras que cambian el alcance:

| Si dices… | Claude… |
|---|---|
| «mira», «analiza», «revisa», «en seco» | Solo lee y cuenta lo que ve |
| «propón», «¿cómo lo harías?» | Diseña y argumenta, sin tocar |
| «hazlo», «arréglalo», «déjalo hecho» | Cambio en local, verificado |
| «súbelo», «haz commit» | Commit (y push si se dice) |
| «despliega», «a producción» | Push + `deploy.sh` en el VPS, y comprueba `app.brokergy.es` |
| «mándalo», «envíaselo» | Envía, tras enseñar el borrador |

## 3. Cuando el mensaje es un audio

Un dictado llega con errores de transcripción, muletillas y correcciones sobre la marcha. Claude
interpreta la **intención**, no la letra, con estas reglas:

- **Los identificadores se normalizan y se comprueban contra la BD antes de actuar.**

  | Dictado | Se entiende |
  |---|---|
  | «veintiséis RES cero sesenta, ciento ochenta y siete» | `26RES060_187` |
  | «el ochenta y cinco de reforma», «el RES080 85» | `26RES080_85` (año en curso si no se dice) |
  | «la OP doscientos cincuenta» | la oportunidad `…_OP250` (se busca cuál existe) |
  | «el CEE sesenta», «dos mil veintiséis CEE sesenta» | `2026CEE_60` |
  | «el lote cuatro de este año» | `LOTE-2026-004` |
  | «el de Tomelloso», «el de Isaac» | se busca por municipio o cliente; si hay varios, se pregunta con la lista |

- **Para leer**, Claude busca y dice cuál ha encontrado («Miro 26RES060_187, MARÍA TERESA RAMOS»).
  **Para escribir o enviar**, lo confirma si hay la menor duda.
- **Si el audio se corrige** («no, perdón, el 188»; «bueno, mejor no lo envíes»), manda lo último.
- Las muletillas («eh», «o sea», «vale») y las repeticiones se ignoran; una petición larga se reordena en
  una lista numerada al empezar, para que se vea qué se ha entendido.
- Una palabra técnica mal transcrita se interpreta por contexto (p. ej. «el cex» → `.cex`, «sí cop» →
  SCOP, «el cifo» → CIFO) y, si cambia el resultado, se pregunta.

### Ejemplos

> **Audio:** «Eh, mírame el veintiséis RES cero sesenta ciento ochenta y siete, que dice el instalador que
> no le deja firmar el CIFO, y si es lo de la fecha arréglalo pero no lo subas todavía.»
>
> **Claude entiende:** `26RES060_187` · resultado: que el instalador pueda firmar el CIFO · hasta dónde:
> diagnosticar y, si es la fecha, arreglar en local, sin commit · nada en paralelo.

> **Audio:** «Tres cosas: revisa el CEE inicial que ha subido Raquel del ochenta y cinco, prepara el
> paquete del lote cinco, y aparte mira por qué tarda tanto la lista de expedientes.»
>
> **Claude entiende:** tres tareas independientes → tres subagentes en paralelo (revisión del CEE de
> `26RES080_85`, comprobación EN SECO del paquete de `LOTE-2026-005`, diagnóstico del listado), y un
> resumen al final. Nada se envía ni se sube.

## 4. Varias tareas a la vez: subagentes

| Sí | No |
|---|---|
| Buscar en muchos ficheros (Explore: no carga instrucciones, solo busca y lee) | Algo que se resuelve con dos lecturas |
| Tareas independientes en paralelo (general-purpose) | Tareas que dependen unas de otras: van en orden |
| Revisar un cambio con ojos frescos | Enviar mensajes, firmar o desplegar: lo hace la sesión principal, con el «sí» |

El encargo de un subagente lleva siempre:

1. **Objetivo** y cómo se sabe que está hecho.
2. **Qué leer primero**: los documentos de `docs/conocimiento/<área>/` del tema (rutas concretas).
3. **Qué puede tocar y qué no**: por defecto, nada de escrituras en producción ni envíos.
4. **Qué comprobaciones pasar** (los «Tras tocarlo» de la regla del área).
5. **Qué devolver**: conclusiones, ficheros cambiados y lo que no se ha podido hacer, en pocas líneas;
   nunca volcados de ficheros.

Dos subagentes no editan los mismos ficheros a la vez; si hay riesgo, cada uno en su worktree
(`isolation: "worktree"`). Cada subagente gasta sus propios tokens: para trabajos largos que no caben
en una conversación, mejor sesiones separadas.

## 5. Gastar menos tokens sin perder calidad

- **Una sesión por obra o por tema**, titulada «{nº} - {CLIENTE}». Al cambiar de tema, sesión nueva:
  ahora arrancar cuesta ~3.000 tokens de instrucciones, no 490.000.
- Claude lee **por rangos y con grep**, no ficheros enteros; los documentos de `docs/conocimiento`, solo
  el del tema.
- Las exploraciones amplias, en un subagente: su lectura no llena la conversación principal.
- Si una sesión se alarga mucho, compactarla antes de cambiar de fase de trabajo (el `CLAUDE.md` y las
  reglas de área vuelven solas después).
- Plugins que no se usan (ventas, marketing, legal, RR. HH., Shopify…) suman unos miles de tokens en
  cada sesión por sus descripciones; desactivarlos es opcional y no afecta a la app.

## 6. Qué entrega Claude al terminar

Qué ha hecho, qué ha comprobado (y el resultado real, también si falla), qué queda pendiente y qué ha
documentado. Si algo no se ha podido verificar, lo dice con esas palabras.
