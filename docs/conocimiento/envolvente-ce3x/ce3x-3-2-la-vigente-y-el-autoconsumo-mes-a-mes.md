<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## CE3X 3.2 — la vigente desde el 08/10/2026, y el AUTOCONSUMO mes a mes

Desde el 08/10/2026 se certifica con **CE3X 3.2** (decisión del usuario: «a partir de ahora los
nuevos CEE serán con la v3.2, excepto cuando te diga que se haga con la v2.3»). La 3.1 se
desinstala del PC. Todo lo que se dijo de la 3.1 en «CE3X 2.3 y 3.1» sigue valiendo: la 3.2 es la
misma forma de fichero.

Fuente: el manual que trae la 3.2, `C:\Program Files (x86)\CE3Xv3.2\Manuales\Ampliación
Manual_usuario_CE3X.pdf` (7 páginas, octubre de 2026), y lo medido con el propio CE3X 3.2 (oráculo).

### Qué cambia de la 3.1 a la 3.2 (medido, no leído)

| Qué | Cómo se midió | Resultado |
|---|---|---|
| Forma del `.cex` | Los ejemplos oficiales que traen las dos, pickle a pickle | **La misma**: 29/26/4/14 campos, equipos del pickle 4 idénticos. Cambia la cabecera: `CE3Xv3.2 Residencial` (y los dos terciarios) |
| Cálculo | 2026CEE_58 (3.1) abierto con la 3.2 | El mismo: medida 32,6 / 14,5 / 52,8 en las dos |
| XML | Exportado con las dos | Mismo esquema **v3.0**; `<Procedimiento><Version>` es la fecha de compilación: **2026.08.20** la 3.1 y **2026.10.05** la 3.2 ([programaCee.js](implementation/frontend/src/features/cee/programaCee.js)) |
| Código | Cadenas de los `.pyd` de las dos instalaciones | Nuevos textos de ayuda (plantas «del edificio total», potencia pico «por lo general, la del inversor», «energía autoconsumida en servicios EPBD»), la pestaña de contribuciones rebautizada «Cogeneración y otras instalaciones no contempladas en… generación renovable eléctrica», y el XML escribe `CoberturaDemandaAcs`/termosolar y observaciones |
| Medidas de mejora | Manual, 8 | Ya NO hay PDF aparte de medidas: van en el **Anexo III** del certificado |
| Ficheros antiguos | Abrir con la 3.2 | Abre los de la 3.1 tal cual. Algunos `.cex` muy antiguos de la 2.3 NO los abre (`KeyError`/`EOFError` en `abreArchivoCEX`) |

**REGLA — la 3.1 y la 3.2 son las versiones «modernas»** (`es_moderna` en
[version_ce3x.py](implementation/cee-engine/tools/version_ce3x.py), `esModerna` en
[versionCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/versionCe3x.js) y en
[cexAPdf.js](implementation/backend/services/cee/cexAPdf.js)): todo lo que antes decía
`version === '3.1'` lo dice de las dos. **Pasar de una a otra es SOLO la cabecera**
(`convertir_cex.py`, test `test_de_la_3_1_a_la_3_2_solo_cambia_la_cabecera`). Por defecto, la 3.2
en el motor, la ventana, «Generar CEE final» y los scripts; la 2.3, solo si se pide.

### Datos generales: a QUÉ se refiere cada campo (manual, 6.2-6.6)

| Campo | Se refiere a | Cómo lo propone la app |
|---|---|---|
| Superficie útil (RD 390/2021) | Lo que se CERTIFICA (administrativa, no entra en el cálculo) | La útil habitable de Datos generales |
| Superficie de cálculo | Los recintos HABITABLES de lo que se certifica | La medida por el motor |
| Nº de viviendas o unidades de uso | Lo que se CERTIFICA: un piso de un bloque es **1** | 1 (un bloque, se pide) |
| Plantas habitables | Lo que se certifica (alimenta la longitud de puentes térmicos) | Las medidas |
| **Plantas sobre y bajo rasante** | El **EDIFICIO ENTERO**, de Catastro, aunque se certifique un piso | **`plantasDelEdificio`**: el máximo de `numberOfFloorsAbove/BelowGround` de los BuildingPart de la parcela; sin ellos, los niveles medidos |

El ejemplo oficial «2 Vivienda dentro de bloque» pasa de 1 a **8** plantas sobre rasante de la 3.1 a
la 3.2. Antes la app ponía las habitables (1). El rótulo de cada campo en la pantalla dice ya «de lo
que se certifica» / «del edificio entero». Fuente única de lo que se propone: `datosCe3x31`
(parámetro `edificio`) y, en el motor, `extra_31` (`generales.plantas_edificio`).

### La FOTOVOLTAICA va en «Generación renovable eléctrica», nunca en contribuciones (manual, 7.1)

**REGLA — en la 3.2 las placas van SIEMPRE como «Generación renovable eléctrica»** (potencia pico +
autoconsumo mes a mes); la pestaña «Contribuciones energéticas» «no debe utilizarse para este fin».
En la 3.1 el motor las dejaba como contribución anual si faltaban los doce meses (calcula igual); en
la 3.2 **no se escriben y se dice** (`separar_generadores` lanza `GeneracionError`: «consulta PVGIS y
vuelve a generar»). La revisión del CEE del técnico avisa (`fv_contribucion`) si una 3.2 trae placas
como contribución, y las placas existentes cuentan también si van como generador eléctrico.

### El AUTOCONSUMO de cada mes: lo menor entre lo que producen las placas y lo que se consume

**Lo que hace CE3X 3.2 (medido con el oráculo sobre la medida de 2026CEE_58, 5 kWp, D3):**

- **Solo usa el TOTAL anual.** Los mismos 8.170 kWh repartidos con la curva de PVGIS, planos, todo en
  invierno o todo en verano dan EXACTAMENTE la misma calificación; ×10 da emisiones negativas: no
  recorta nada.
- **Pero AVISA de cada mes que se pasa** del consumo eléctrico de calefacción + refrigeración + ACS de
  ese mes, con el consumo: «La energía eléctrica generada para autoconsumo supera la energía eléctrica
  consumida para cubrir los servicios de calefacción, refrigeración y ACS del edificio en los
  siguientes meses: - Junio: consumo de 109.34 kWh…» (`mensajeAviso` del edificio o de la medida). No
  bloquea: califica y escribe el XML.
- El manual (7.1): el autoconsumo que cuenta es el de los usos EPB (calefacción, refrigeración, ACS e
  iluminación fuera del residencial privado), CE3X **no lo calcula** y la responsabilidad es del técnico.

Con la curva de PVGIS que ponía la app, 2026CEE_58 dejaba **6 meses avisados** (junio: 777 kWh de
autoconsumo frente a 109 de consumo).

**REGLA — cada mes se declara lo MENOR entre la producción de PVGIS y el consumo de ese mes**
(decisión del usuario, 08/10/2026: «si la producción supera la de autoconsumo permitida se pone la de
autoconsumo, si no la producción PVGIS; la máxima se obtiene del XML»). En 2026CEE_58: 8.170 → 5.717
kWh y el ahorro de la medida de 52,8 % a 45,9 %. El 90 % del máximo declarable
(`AUTOCONSUMO_DECLARABLE`) sigue valiendo para DIMENSIONAR los kWp.

**El consumo del mes sale del XML**, repartido como lo reparte CE3X (medido con su código):

    consumo(mes) = S · (Cal · coefCal[mes] + Ref · coefRef[mes] + (ACS + Ilu) · días/365)

con `Cal`, `Ref`, `ACS`, `Ilu` el consumo ELÉCTRICO anual de cada servicio (kWh/m²·año,
`EnergiaFinalVectores`; en el v3.0 los servicios, no el `<Tot>`, que ya descuenta las placas) y `S`
la superficie de cálculo (`<AreaRef>` en el v3.0, `<SuperficieHabitable>` en el v2.0). `coefCal`/`coefRef`
son el reparto mensual de la demanda que calcula CE3X para ESE edificio; la app usa la **media por
zona climática** (`PERFILES`), medida con CE3X 3.2 sobre 14 viviendas reales de D3 (50 a 815 m²)
recalculadas en las doce zonas peninsulares ([perfil_mensual.py](implementation/cee-engine/tools/oraculo_ce3x/perfil_mensual.py)).
Validado: 11 viviendas reales de D2 dan el mismo reparto de calefacción que las de D3 pasadas a D2
(máx. 0,002); contra los consumos exactos de CE3X, el anual casa al 0,2 % y los meses de invierno al
8 %, pero los de paso se desvían hasta un ±40 % (junio de 2026CEE_58: 156 estimado frente a 109).

**REGLA — en el PC manda CE3X**: al calificar (`calificarCex`, por defecto `ajustarAutoconsumo`) el
oráculo `cex_a_xml.py` recalcula cada medida con placas (una medida ya calculada no se recalcula sola:
`incluirMedidas` + `calificacion` + `calcularAhorros`), lee los meses avisados con su consumo EXACTO,
los RECORTA a él (a prorrata si hay varios generadores, hacia abajo al céntimo), recalcula y GUARDA
el `.cex` con el propio CE3X (sale con cabecera 3.2). Ese `.cex` ajustado es el que se sube a Drive
(`guardarCalificadoEnDrive(…, { cex })`, el anterior a OLD) junto a su XML y su PDF, y el script lo
dice. Comprobado de punta a punta con 2026CEE_58: 6 meses recortados, 45,9 %, XML y PDF; recalificado
el ajustado, ningún aviso. `cex_a_pdf.js --sin-ajustar` solo avisa.

⚠️ CE3X 3.2 deja el XML junto al `.cex` que tiene abierto y con su nombre: tras guardar en otro
fichero hay que devolver `FRAME.filename` al de entrada o el XML no aparece donde se espera.

| Qué | Dónde |
|---|---|
| Perfiles por zona, consumo mensual y la regla del mínimo | [autoconsumoMensual.js](implementation/frontend/src/features/expedientes/logic/autoconsumoMensual.js) |
| El consumo eléctrico por servicio del XML, sin DOM (v2.0 y v3.0, también en MAYÚSCULAS) | `leerConsumoElectricoDeTexto` en [xmlCeeParser.js](implementation/frontend/src/features/calculator/logic/xmlCeeParser.js) |
| Qué CEE manda (el final si está; si no el inicial, y se dice) | `consumoMensualDelCee` en [ce3xTextos.js](implementation/frontend/src/features/expedientes/logic/ce3xTextos.js) |
| La medida de autoconsumo con los meses ya limitados | `medidasCe3x` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) (`kwh_declarado`) |
| La chuleta para teclear en CE3X | Ayudas CE3X → «Autoconsumo máximo de cada mes (kWh)» |
| El ajuste exacto en el PC | `cex_a_xml.py` (`AJUSTAR_AUTOCONSUMO`, `SALIDA_CEX`) + `cexAPdf.calificarCex` |
| Pruebas | `node implementation/backend/scripts/test_autoconsumo_mensual.mjs` · `python -m pytest implementation/cee-engine/tests/test_generador_electrico.py` |

### Lo de la máquina

- Instalación: `C:\Program Files (x86)\CE3Xv3.2\ce3xv3.2.exe`, con su `unins000.exe` y la entrada
  «CE3X v3.2» de Aplicaciones. Sus datos, en `C:\Users\Public\Documents\CE3X3.2` (`bbdd.dat` de
  serie); las librerías propias que se usaban con la 2.3 están en `Documents\CEX\bbdd.dat` y el
  manual (4) dice cómo pasarlas (cerrar CE3X, copia de seguridad, copiar el fichero).
- ⚠️ **El instalador de la 3.2 usa el MISMO identificador que el de la 3.1**: instalada encima,
  la 3.2 quedó sin desinstalador propio y la entrada de Aplicaciones «CE3X v3.2» apuntaba al
  `unins000.exe` de la 3.1, que tenía ANOTADOS también los ficheros de la 3.2. Al desinstalar la 3.1
  (08/10/2026) se llevó media 3.2 (de 627 a 177 MB, `xml2cert` incluido) y la asociación del `.cex`;
  se reinstaló con `setupCE3Xv3.2.exe` y ya tiene lo suyo. **Antes de desinstalar una versión de
  CE3X, mira a qué carpeta apunta su entrada de Aplicaciones**; y al buscar rutas en un
  `unins000.dat`, búscalas en UTF-16 desde las DOS alineaciones (en la par solo salían las de la 3.1).
- El oráculo (`run.sh`, `host.cs`) y `cexAPdf.js` apuntan a la 3.2 (`CE3X_DIR`/`CE3X_EXE` la cambian);
  hace falta un CE3X 3.2 ABIERTO, como con la 3.1.
- «Enviar a» del PC: «CE3X v3.2» (abrir un `.cex`) y «PDF del CEE (CE3X 3.2)» (el `.bat` que llama a
  `xml2cert` de la 3.2). Los de la 3.1 se quitaron.
- **CE3X lee el idioma de `HKEY_USERS\.DEFAULT\Software\CE3X3.2\idioma`** (`registro.leerIdioma`).
  Si falta, escribe «Exception en HKEY_USERS … WindowsError» en su salida de errores y, AL CERRAR, el
  py2exe intenta guardarla en `ce3xv3.2.exe.log` dentro de Program Files, sin permiso: sale «Errors
  occurred — The logfile … could not be opened: Permission denied». Tras la reinstalación del
  08/10/2026 faltaba (se creó a mano: `reg add "HKU\.DEFAULT\Software\CE3X3.2" /v idioma /t REG_SZ /d es /f`,
  como administrador). Con el valor puesto, el oráculo ya no lo registra.

```bash
python -m pytest implementation/cee-engine/tests/test_version_ce3x.py implementation/cee-engine/tests/test_generador_electrico.py
node implementation/backend/scripts/test_autoconsumo_mensual.mjs
node implementation/backend/scripts/test_version_ce3x_app.mjs
node implementation/backend/scripts/test_programa_cee.mjs
node implementation/backend/scripts/test_revision_cee_cex.js
node implementation/backend/scripts/cex_a_pdf.js "<.cex>" --en-seco     # califica con la 3.2 y dice si ajusta el autoconsumo
```
