# Calculadora CAE · Ficha RES060FC (prototipo)

Herramienta **standalone (un solo `index.html`, sin build ni dependencias)** para estimar los
**CAEs máximos** de una actuación de sustitución de caldera por bomba de calor según la
**propuesta de ficha RES060FC** (BdC eléctrica con factor de corrección), y compararlos con el
cálculo de la **ficha RES060 actual (V1.1)**.

> Estado: **prototipo funcional**. Pensado para integrarse a futuro en la app Brokergy
> (React) como módulo de simulación / captación. Se puede abrir con doble clic en cualquier
> navegador (funciona offline).

---

## 1. Qué hace

- **Calculadora RES060FC**: dado provincia, año, tipología, superficie, caldera (η), SCOPs,
  D_ACS, CEF y f_C → calcula `AE_TOTAL = Mín(AES ; 0,70·CEF) × f_C` (kWh/año = CAEs) y su
  valor en €.
- **Badge de límite**: indica si manda el **techo técnico** (AES) o el **tope 70%·CEF**.
- **Comparativa RES060 actual vs RES060FC** (toggle): mismo caso con las dos fichas, con
  barras, ratio × y diferencia. Al activarlo aparece el campo "Demanda calefacción del CEE".
- **Carga de XML del CEE (drag & drop en toda la pantalla)**: autocompleta provincia, año,
  tipología, superficie, demanda calefacción, D_ACS y CEF desde el certificado (CE3X).
- **D_ACS por Anexo III**: opción de introducir litros/día de ACS a 60° y calcular la demanda
  con las temperaturas de agua de red mensuales por provincia (tabla IDAE / Anejo G DB-HE-4).
- **Popup "Desglose energético RES080"**: compara un **CEE inicial vs final** por servicio
  (ACS/Calefacción/Refrigeración) y combustible, con emisiones, factores de paso (3 dec.) y el
  **ahorro de energía final (MWh/año)**. Funciona también con un solo CEE cargado.

---

## 2. Fórmulas implementadas

### RES060FC (propuesta)
```
AE_TOTAL = Mínimo( AES ; 0,70 · CEF ) × f_C

AES = (D_CAL · S) · (1/η_i − 1/SCOP_bdc)  +  [ D_ACS · (1/η_i − 1/SCOP_dhw) ] · f_C
```
- El `f_C` multiplica **solo al término de ACS** dentro de AES (según cómo está escrito el
  borrador) **y** de nuevo a todo el `Mín(...)`. Es una particularidad/errata del borrador que
  se respeta a propósito. Ver "Dudas" abajo.
- `D_CAL` = valor del **Anexo IV** (kWh/m²·año, por provincia y año de construcción) → se
  multiplica por S.
- `η_i` = rendimiento de la caldera sustituida (**Anexo II**, por combustible/antigüedad/tipo).
- `f_C` = 2 (unifamiliar) / 2,5 (piso) / 3 (bloque colectivo), ×1,5 si consumidor vulnerable severo.
- Tope: `0,70 · CEF` (CEF = consumo de energía final previo).

### RES060 actual (V1.1)
```
AE_TOTAL = FP · [ (D_CAL · S)·(1/η_i − 1/SCOP_bdc) + D_ACS·(1/η_i − 1/SCOP_dhw) ]
```
- `FP = 1`, **sin tope y sin f_C**. En la comparativa usa el **mismo η y SCOP** que el cálculo
  nuevo (a petición), y `D_CAL` del certificado (no del Anexo IV).

### RES080 (desglose inicial vs final)
Por servicio: `Energía final` (kWh/m²) del vector, `Emisiones = Σ consumo_vector × factor_paso`,
`Factor efectivo = emisiones/consumo`. `Ahorro (MWh/año) = (CEF_ini − CEF_fin) × S / 1000`.

---

## 3. Fuentes de datos (todas embebidas en `index.html`)

| Dato | Fuente |
|---|---|
| Anexo IV — demanda calefacción kWh/m²·año | Propuesta ficha RES060FC (tablas Unifamiliar / Plurifamiliar 1-3 / ≥4) |
| Anexo II — rendimiento caldera sustituida | Propuesta ficha RES060FC |
| f_C (2 / 2,5 / 3 · ×1,5) | Ficha RES060FC |
| Temperatura agua de red mensual por provincia | Tabla IDAE / Anejo G DB-HE-4 (52 capitales). Ver nota. |
| Factores de paso a emisiones/primaria | Vienen en el propio XML del CEE (`FactoresdePaso`) |

**Nota tabla Te**: son valores por **capital de provincia** (el DB-HE aplica además corrección
por altitud si el municipio no es la capital; el prototipo trabaja a nivel capital, como CE3X).
Se corrigieron a mano un par de erratas OCR de la fuente. Conviene validar contra CE3X antes de
producción.

---

## 4. Mapeo del XML del CEE (CE3X)

| Campo XML | Uso |
|---|---|
| `IdentificacionEdificio/Provincia` | Provincia (matching robusto por palabras/acentos) |
| `AnoConstruccion` | Intervalo de año del Anexo IV |
| `TipoDeEdificio` | `ViviendaUnifamiliar`→Unifamiliar · `ViviendaIndividualEnBloque`→Piso · `Bloque…`→Bloque |
| `SuperficieHabitable` | Superficie S |
| `Demanda/EdificioObjeto/Calefaccion` | Demanda calefacción CEE (kWh/m²) |
| `Demanda/EdificioObjeto/ACS` | D_ACS = valor × m² |
| `EnergiaFinalVectores/*/Global` (Σ) × m² | CEF |
| `EnergiaFinalVectores/*/{Calefaccion,ACS,Refrigeracion}` | Desglose RES080 por servicio y combustible |
| `FactoresdePaso/FinalAEmisiones/*` | Factor de paso a emisiones por combustible |
| `DemandaDiariaACS` | Litros/día (modo Anexo III) |

Se ignoran valores basura tipo `99999999.99`.

---

## 5. Cómo usarlo / desarrollar

- **Abrir**: doble clic en `index.html` (o servir la carpeta). No necesita servidor ni internet
  (salvo el logo de la web, que degrada a texto si no hay red).
- **Editar**: todo está en un único `index.html` (HTML + CSS + JS vanilla). Paleta corporativa
  en el bloque `:root` (naranja `--orange`, verde lima `--lime`).
- Los datos grandes (Anexo IV, Anexo II, tabla Te) están como arrays JS al inicio del `<script>`.

---

## 6. Decisiones y dudas del borrador (a revisar cuando salga la versión definitiva)

- **Doble f_C**: el `f_C` aparece en el término de ACS de AES y otra vez en `AE_TOTAL`.
  Probable errata; se respeta el literal. Revisar en la ficha final.
- **D_CAL**: la tabla de variables lo define como "Anexo IV × S" pero con unidades kWh/m²·año y
  la fórmula vuelve a multiplicar por S. Se toma demanda = Anexo IV × S.
- **f_C piso**: 2 en el cuerpo de la Resolución vs 2,5 en la ficha. Se usa 2,5 (ficha).
- **Anexo IV vs CEE real** (ver `referencia/Comparativa_AnexoIV_vs_CEE_CiudadReal.xlsx`): en
  Ciudad Real, para construcción ≥1981 el Anexo IV infravalora la demanda real de los CEE →
  argumento para alegación en la consulta pública.

---

## 7. Roadmap / TODO (para continuar con Claude Code)

- [ ] **Integrar en la app Brokergy** (React, `implementation/frontend/src/features/…`) como
      módulo de simulación reutilizable; separar datos (Anexo IV/II/Te) a JSON.
- [ ] **Extracción desde PDF** (cuando no hay XML): backend con extracción de texto o visión-LLM
      (coste/privacidad a valorar). El XML sigue siendo la vía robusta.
- [ ] **Carga múltiple de XML** → tabla/CSV comparando una cartera de certificados.
- [ ] **Validar la tabla Te** contra CE3X y añadir corrección por altitud del municipio.
- [ ] **Modo cobertura de demanda** (rendimientos por generador) para desdoblar servicios
      multi-combustible por demanda además de por energía final.
- [ ] Tests de las fórmulas (casos verificados: por defecto Unifamiliar/Ciudad Real → 38.673 kWh/año).
- [ ] Exportar resultado a PDF/print con marca Brokergy.

---

## 8. Ficheros de referencia

- `referencia/Calculadora_RES060FC_vs_RES060.xlsx` — versión Excel (hojas: Calculadora, CAE
  rápido, comparativa, Anexos I-IV, Parámetros, Notas).
- `referencia/Comparativa_AnexoIV_vs_CEE_CiudadReal.xlsx` — media de demanda real de los CEE de
  Ciudad Real por intervalo de año vs Anexo IV.

Documentos normativos de origen (propuesta RES060FC, ficha RES060 actual) están en el Drive de
Brokergy: `01. RD 36-2023 (CAES)/00. NORMATIVA/.../03. CONSULTAS PÚBLICAS`.
