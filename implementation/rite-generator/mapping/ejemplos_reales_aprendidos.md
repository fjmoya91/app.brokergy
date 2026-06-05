# Patrones de relleno aprendidos de memorias reales (RES060)

Analizadas 2 memorias reales de aerotermia firmadas por instalador, modelo
**RD 1027/2007 - Consejería de Economía, Empresas y Empleo (JCCM)**.

## Ejemplo A — Mª Carmen Cano (aerotermia PANASONIC + suelo radiante)
## Ejemplo B — Moreno Briones (aerotermia SIME + radiadores)

---

## 1. REGLAS GENERALES DE RELLENO

- Los checkbox marcados se rellenan con **"X"** (mayúscula), NO con FORMCHECKBOX activado.
- Los campos no aplicables se dejan literalmente vacíos.
- Texto en MAYÚSCULAS para nombres, direcciones, localidades, marcas y modelos.
- El NIF va con la letra pegada o con espacio según fuente (no crítico).

## 2. DATOS TITULAR / UBICACIÓN
- Si la ubicación coincide con el domicilio, se repite la dirección igualmente (no se deja en blanco).
- Provincia y localidad siempre en MAYÚSCULAS.

## 3. DESTINO / OBJETO / TIPO (checkbox con X)
- Destino: `X VIVIENDA`
- Objeto aerotermia típico: `X CALEFACCIÓN` + `X AGUA CALIENTE SANITARIA` (+ climatización si reversible)
- Tipo: `X INDIVIDUAL` y luego `X NUEVA` **o** `X REFORMA DE EXISTENTE`

## 4. FUENTE DE ENERGÍA (clave en aerotermia)
- Se marca `X ELECTRICIDAD`
- Y **adicionalmente** se escribe en el campo `OTRO:` el texto **AEROTERMIA**
  (la plantilla antigua no tiene casilla específica de aerotermia)

## 5. GENERADOR DE CALOR
- Se marca `X CALEFACCION-ACS` y `X BOMBA DE CALOR`
- MARCA / MODELO / Nº FABRICACIÓN en MAYÚSCULAS
- POTENCIA TÉRMICA CALEFACCIÓN en kW (ej. "12KW", "9")
- POTENCIA ACS y ACUMULACIÓN (L) cuando aplica (ej. ACS 9 kW, 185 L)
- UBICACIÓN: `X LOCAL ESPECIFICO` (o genérico/abierto). USO DEL LOCAL: ej. CUBIERTA

## 6. GENERADOR DE FRÍO (solo si es reversible)
- Tipo: `X PARTIDO` (lo habitual en aerotermia split)
- MARCA / MODELO
- POTENCIA FRIGORÍFICA (kW) y POTENCIA COMPRESORES (kW)
- CONDENSADO POR: `X AIRE`
- PRESTACIÓN ENERGÉTICA CLASE: ej. A+++
- Coeficiente EER: ej. 3.58
- Si NO hay frío, toda la sección se deja vacía.

## 7. AISLAMIENTO TÉRMICO
- Fila "EN TUBERÍAS Y ACCESORIOS": MATERIAL / CONDUCTIVIDAD W/(mK) / ESPESOR (mm) / ACABADO
- En los ejemplos esta sección venía a menudo vacía; cuando se rellena:
  MATERIAL=ELASTÓMERO, CONDUCTIVIDAD=0.034, ESPESOR=25, ACABADO=PVC

## 8. SISTEMAS DE DISTRIBUCIÓN
- Sistema: `X MONOTUBO` (o BITUBO / CONDUCTOS)
- TUBERÍAS material con x: ej. `x COBRE` `X POLIETILENO RETICULADO` o `X ACERO INOXIDABLE`
- DIÁMETRO MÁXIMO y MÍNIMO en mm (ej. máx 32 / mín 16; máx 40 / mín 12)

## 9. TERMINALES
- RADIADORES con x en tipo: ej. `X HIERRO FUNDIDO`
- SUELO RADIANTE: indicar material (ej. POLIETILENO / PEX)
- DIFUSORES / OTROS: ej. `x DIFUSORES`, `OTROS: FANCOILS`

## 10. REGULACIÓN Y CONTROL
- Columnas: CALEFACCIÓN / ACS / REFRIGERACIÓN
- En vez de "SI", a veces se indica el LOCAL: ej.
  - TERMOSTATO EN LOCAL CARACTERÍSTICO → "SALON"
  - VÁLVULAS TERMOSTÁTICAS → "DORMITORIOS"
- En el modelo nuevo JCCM se marca "SI" en cada columna que aplica.

## 11. CONDICIONES INTERIORES (IT 1.1) — valores estándar
- VERANO: Temp 23–25 ºC / Humedad 45–60 %
- INVIERNO: Temp 21–23 ºC / Humedad 40–50 %

## 12. TABLA DE CARGAS TÉRMICAS (lo más importante)
Columnas: PLANTA | TIPO DE LOCAL | Nº | SUPERFICIE m² | ORIENTACIÓN | CARGAS CÁLCULO | EMISOR | ELEMENTOS | POTENCIA INSTALADA

**Formato observado (Ejemplo B, muy completo):**
| PLANTA | TIPO LOCAL | Nº | SUP m² | ORIENT | CARGAS CÁLCULO | EMISOR | ELEM | POT (kW) |
|--------|-----------|-----|--------|--------|----------------|--------|------|----------|
| BAJA | CONSULTA | 1 | 9 | ESTE | 9X90 | RADIADOR | 9 | 0.81 |
| BAJA | SALÓN | 5 | 25 | ESTE | 25X90 | RADIADOR | 25 | 2.25 |

**Reglas clave de la tabla:**
- PLANTA: "0"/"1" o "BAJA"/"PRIMERA"
- CARGAS CÁLCULO: formato `superficie x factor` (ej. "25X90" = 25 m² × 90 W/m²)
  - Factor típico vivienda: 90 W/m² (calefacción radiadores)
- EMISOR: RADIADOR / RADIADOR/FANCOIL / SUELO RADIANTE
- ELEMENTOS: nº de elementos del radiador (para radiadores)
- POTENCIA INSTALADA: en kW (ej. 0.81), aunque en suelo radiante puede ir en W

**Para suelo radiante (caso Peláez):**
- EMISOR: SUELO RADIANTE
- ELEMENTOS: en blanco (no hay elementos como en radiadores)
- POTENCIA INSTALADA: en W directamente (1200, 1400, etc.)

## 13. FIRMA / INSTALADOR
- "D/Dña.: [NOMBRE] instalador con carné: [Nº]"
- O bien "colegiado nº: [Nº] del Colegio de [COLEGIO]"
- Lugar y fecha: "En [LOCALIDAD], a [FECHA]"
- Cierre: certifica conforme RITE RD 1027/2007

---

## CONCLUSIÓN PARA EL CASO PELÁEZ
La memoria de Peláez es **aerotermia THERMOR + suelo radiante PEX**, equivalente al
Ejemplo A (Mª Carmen). Diferencias a aplicar:
- Suelo radiante PEX (no radiadores) → EMISOR=SUELO RADIANTE, sin elementos
- Marcar `X ELECTRICIDAD` + escribir AEROTERMIA en OTRO
- Generador frío reversible: `X PARTIDO`, `X AIRE`, EER 4.38
- Potencias de cargas térmicas en W (ya están en la tabla aportada)
