<!-- conocimiento · área: calculo · las rutas de los enlaces son relativas a la raíz del repo -->

## El CEE «a ciegas» en la oportunidad: la cifra APARTE, solo para el equipo (2026-10-26)

> **Estado: FASE 1 CONSTRUIDA EN LOCAL, sin commit ni deploy** (26/10/2026). El barrido del PC está detrás
> de `CEE_CIEGO_ENABLED` (apagado). Fase 0 hecha el mismo día (120 expedientes). Lo pidió Fran el
> 26/10/2026 («v2 × coeficiente, superficie confirmada por una persona, calificación por la cola del PC»).
> Sale de lo medido en
> [cee-a-ciegas-prueba-con-18-expedientes.md](docs/conocimiento/calculo/cee-a-ciegas-prueba-con-18-expedientes.md).
> Regla 177.

**Objetivo.** Tener, al lado de la estimación de siempre, la cifra de un CEE hecho por programa (sin
IA, sin fotos, sin persona), para ver si se parece más a lo que da después el CEE real.

**Decisión de Fran (26/10/2026): NO sustituye al cálculo actual.** «Será una funcionalidad más hasta que
podamos validarlo». Se enseña al equipo junto a la estimación de la calculadora. La propuesta, el bono que
ve el cliente y todo lo que cuelga de `calculateDemand` siguen exactamente como están.

### 1. Cuándo entra (todas a la vez)

Fuente única: `motivoNoElegible` en
[estimacionCiega.js](implementation/frontend/src/features/calculator/logic/estimacionCiega.js).

- Ficha **RES060 o RES093** (no RES080: su ahorro sale de dos certificados; no terciario).
- Vivienda **unifamiliar** (pisos y adosados en hilera, fuera hasta medirlos).
- Con referencia catastral.
- **Sin CEE en la simulación** (`cee_previo` o `xmlDemandData`): el del cliente (comparativa) o el nuestro
  (regla 152) mandan siempre.
- **Captación viva** (LEAD · PTE ENVIAR · EN CURSO). Después no se recalcula (se conserva la que hubiera).
- La superficie sin confirmar **no impide calcularla**: sale «Sin validar: superficie sin confirmar».

### 2. Cómo se calcula (en el PC, cero tokens, ~1 min)

Fuente única: `calcularCiega` en [ceeCiego.js](implementation/backend/services/cee/ceeCiego.js).

1. `cargarExpediente(op, 'op')` y `/envolvente` del motor con la RC y las construcciones elegidas
   (primero sin conexión, con la caché; si no, Catastro en serie).
2. **v2**: segunda llamada con `cuerpos_excluidos` (los cuerpos que Catastro no da como vivienda) y el
   `croquis_propuesto` tal cual (`croquis_ajustar: false`). **Solo para esta estimación**: no se guarda en
   `envolvente_cee`; la regla 48.j de la ventana de la envolvente sigue igual.
3. 12 % de huecos en cada fachada al aire, carpintería por defecto.
4. `componerFicha` con la caldera de la oportunidad, el técnico por defecto, fechas de hoy y sin medidas
   de mejora. **Zona HE4 que falte → `III`** (no mueve la demanda de calefacción; 26RES060_OP324,
   Pontevedra, se paraba sin ella).
5. CE3X 3.2 lo califica (`cexAPdf.calificarCex`, sin medidas ni PDF). Del XML (`demandaDelXml`): la
   demanda de calefacción del EDIFICIO (`Indicadores/Demanda/Cal`, no la de la medida) y la superficie útil.
6. **Nada va a Drive**: ni `.cex` ni XML. Un `.cex` en «1. CEE» se tomaría por el del técnico (regla 48,
   `matchSlot`). Se queda en la carpeta temporal del PC (`brokergy-cee-ciego`) por si hay que mirarlo.
7. **Imagen NEUTRA**: CE3X no califica sin foto y plano. Va
   `implementation/backend/plantillas/cee-ciego/imagen-neutra.jpg` (gris, «CEE A CIEGAS»). Probado en
   26RES060_189 y _245: la demanda sale idéntica (271,6 y 215,8) que con las del Catastro, y se ahorran dos
   peticiones al WAF por oportunidad.
8. El bono a ciegas, con las MISMAS funciones (`computeFullCalculatorResult`) sobre una COPIA de los inputs
   (`inputsConDemandaCiega`: «Cálculo real» con esa demanda y superficie, sin CEE ni XML). El resultado de
   la oportunidad no se toca.

### 3. La superficie la confirma una persona

- Botón **«✓ Confirmo N m² (estas construcciones)»** dentro del bloque «CEE a ciegas» de Resultados,
  **solo equipo interno** (un partner no confirma su propia cifra). Ruta `POST
  /api/oportunidades/:id/superficie-confirmada` (`staffOnly`): solo vale si los m² y las construcciones que
  manda casan con lo GUARDADO (si no, 409 «guarda antes la simulación»). Escribe
  `inputs.superficie_confirmada = { m2, construcciones, por, at }` con `oportunidad_merge_inputs`.
- **Se cae sola** si cambian la superficie o `construcciones_elegidas`: lo decide el SERVIDOR al guardar
  (`conservarCiega`); la que manda el navegador se ignora.
- La validez se evalúa **en pantalla, con la confirmación de AHORA** (`motivoNoValida`): vale si está
  confirmada y los m² que midió el motor casan con ella (± 5 %). Lo que guarda el PC (`valida`) es la foto
  del día de la calificación.
- Antes de confirmar se avisa: «Míralo antes: más de 300 m² · Catastro tiene partes que no son vivienda».
  (26RES060_134: 1.037 m² estimados y 314 en el CEE.)
- `superficie_confirmada` no entra en ningún cálculo: el resultado de la calculadora sale IDÉNTICO con ella
  (lo prueba el test).

### 4. Qué se guarda y dónde se ve (APARTE de la cifra de siempre)

`datos_calculo.estimacion_ciega` —fuera de `inputs`, para que ningún cálculo la lea por accidente—,
**solo escalares**:

```
{ version: 'v2-2026-10', demanda_ciega, superficie, coef: 0.80, demanda_prudente, ahorro_kwh, bono,
  bono_prudente, ahorro_calculadora, bono_calculadora, ratio, q_ciega, q_calculadora, superficie_simulada,
  rc, huella, huecos, cuerpos_fuera, avisos, valida, motivo_no_valida, calificado_at, equipo }
```

- Se escribe releyendo `datos_calculo` y cambiando SOLO esa clave (`guardarEstimacion`).
- **Se enseña solo al equipo interno**, en Resultados
  ([EstimacionCiega.jsx](implementation/frontend/src/features/calculator/components/EstimacionCiega.jsx),
  `GET /api/oportunidades/:id/estimacion-ciega`, `staffOnly`): «CEE A CIEGAS · solo equipo · no se ofrece ·
  155,1 kWh/m²·año × 216 m² · bono 4.034 € · prudente (×0,80) 3.284 € — calculadora: 1.271 €». Nunca en
  la propuesta, en el enlace del cliente ni a un partner: el `GET /:id`, el `POST /` y los demás que
  devuelven la fila la quitan con `sinCiegaParaPartner`.
- **La SEÑAL, que es para lo que la Fase 0 dice que sirve**: ahorro a ciegas > 1,3 × el de la calculadora
  → «⚠ La propuesta probablemente se queda corta … Conviene hacer el CEE antes de enviarla» (Fase 0: 36
  de 37 aciertos). Es la regla 161 sin el umbral de los 3.000 €; la decisión sigue siendo de una persona.
- **Huella** (`huellaCiega`: versión, RC, construcciones, superficie, caldera, combustible, zona, año): si
  la de ahora no es la de la cifra, sale «desactualizada» y el PC la rehace. El presupuesto y el precio no
  entran: no mueven la demanda.
- **El guardado de la calculadora conserva SIEMPRE `estimacion_ciega` de la BD** (`conservarCiega`, como
  `envolvente_cee`): la copia del navegador no la trae al día y la borraría.
- No cambia `demandMode`, ni `xmlDemandData`, ni la comparativa «con tu CEE»: el expediente no hereda nada.
- **Sin línea en el historial** (cambio sobre el diseño): el historial lo ve el partner.

### 5. Quién la calcula: el PC, sin cola (cambio sobre el diseño)

- **No hay cola ni SQL nuevo**: en vez de encolar en `cee_ia_trabajos`, el PC BARRE. `pendientes()` lista
  las elegibles en captación viva cuya huella cambió o que no tienen cifra.
- `tools/banco-cee-api/banco.mjs atender`, **con `CEE_CIEGO_ENABLED=true`**, calcula UNA cuando no tiene
  otro trabajo, y espera 4 s. Lo que falla no se reintenta con los mismos datos en esa sesión.
- A mano: `node implementation/backend/scripts/cee_ciego.js calcular <op> [--escribir] [--forzar]` ·
  `pendientes` · `barrer [--escribir] [--max=5]` (en seco por defecto) · `contraste`.
- Sin PC atendiendo, la pantalla dice «Pendiente del PC» y la cifra ofrecida es la de siempre.

### 6. Guardarraíles y seguimiento

- Interruptor **`CEE_CIEGO_ENABLED`** (apagado por defecto y en el `.env` local). No hay modo «ofrecer»:
  que la cifra a ciegas sustituya a la de la calculadora será otra decisión, con lo validado delante.
- **Contraste**: `cee_ciego.js contraste` cruza los expedientes con CEE inicial real (demanda × superficie)
  con `q_ciega` y `q_calculadora`: es lo que dirá si la cifra a ciegas acierta más y con qué coeficiente
  sería prudente.
- La cifra que se ofrece no cambia: CEE real cargado (152) > calculadora (con su ×1,25, regla 174).

### 7. Primeros resultados, en seco (26/10/2026)

| Oportunidad | A ciegas | Calculadora | Ratio | Señal |
|---|---|---|---|---|
| 26RES060_OP329 | 303,6 × 174 m² · 7.848 € | 6.176 € | 1,27 | no |
| 26RES060_OP327 | 261,1 × 154 m² · 5.510 € | 5.181 € | 1,06 | no |
| 26RES060_OP207 | 170,5 × 107 m² · 2.675 € | 3.682 € | 0,73 | no |
| 26RES060_OP308 | 208,8 × 224 m² · 4.751 € | 2.993 € | 1,59 | sí |
| 26RES060_OP307 | 155,1 × 216 m² · 4.034 € | 1.271 € | 3,17 | sí |
| 26RES060_OP324 | (> 300 m²) | | 1,4 | sí |

Escritas en producción solo OP307 y OP327, para verlas en pantalla; su `inputs` y su `result` salen
idénticos (huella md5 antes y después).

### 8. Por fases

| Fase | Qué | Toca producción |
|---|---|---|
| 0 | Recalcular a ciegas los expedientes con CEE para fijar `k` y probar la imagen neutra | No (solo lee) |
| 1 | La funcionalidad: cifra a ciegas para el equipo, con la señal, y su contraste | Escribe `estimacion_ciega`; ninguna cifra ofrecida |
| — | Si algún día sustituye a la calculadora: decisión aparte de Fran, con el contraste de la fase 1 | — |

### 9. Ficheros

- Lógica compartida: `features/calculator/logic/estimacionCiega.js` (quién entra, huella, validez, señal).
- Servicio y CLI: `services/cee/ceeCiego.js`, `scripts/cee_ciego.js`; imagen `plantillas/cee-ciego/`.
- Rutas y guardado: `utils/estimacionCiega.js` (`conservarCiega`, `sinCiegaParaPartner`) y
  `routes/oportunidades.js` (las dos rutas `staffOnly`).
- Pantalla: `components/EstimacionCiega.jsx`, dentro de `ResultsPanel.jsx` (staff, no reforma).
- PC: `tools/banco-cee-api/banco.mjs` (`unaCiega`).
- Prueba: `node implementation/backend/scripts/test_cee_ciego.mjs` (sin BD ni motor).
