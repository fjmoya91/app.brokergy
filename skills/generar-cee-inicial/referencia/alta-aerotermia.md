# Dar de alta una aerotermia en el catálogo

> **El procedimiento completo está en la skill `alta-aerotermia`** (buscar ficha del fabricante,
> EPREL y Keymark; orden `keymark`; `--anexo` para cualquier documento que justifique un dato;
> `--actualizar <id>` para completar una fila a medias; `--originales`). Lo de abajo es el resumen.

Cuando `placas` dice **«NO ESTÁ»**. Sin el equipo en el catálogo el SCOP sale de la simulación
(genérico) y el certificado no tiene ficha con qué justificarlo.

## Qué hace falta, y de dónde sale

| Dato | Documento | Dónde buscarlo |
|---|---|---|
| SCOP / η de clima **cálido** a 35 y 55 °C | Ficha del fabricante (Technical Data Manual, «ErP» / «Energy efficiency») o EPREL | El que justifica una zona A-D. **Obligatorio** |
| SCOP / η de clima **medio** a 35 y 55 °C | Ficha del fabricante o EPREL | Zona E y el Anexo III |
| Potencia de calefacción (kW) | Placa / ficha | |
| Refrigerante, tipo (MONOBLOCK / BIBLOC / CONJUNTO) | Placa / ficha | |
| SEER | Ficha (tabla de refrigeración) | Solo cuenta con emisores que dan frío |
| COP A7/W55 | Ficha (tabla de rendimiento, EN 14511) o Keymark | Justifica el SCOP_dhw por el Anexo VI |
| Depósito de ACS integrado, litros, SCOP_dhw / η_wh | Ficha | Solo si el equipo es un CONJUNTO con depósito |
| Ficha EPREL + etiqueta | `node scripts/cee_inicial.js eprel <modelo>` | Si hay varios registros del mismo modelo, el que publique los **tres climas** (a menudo solo lo trae el importador oficial) |
| Keymark | keymark.eu / dincertco / HP KEYMARK database | Opcional. Si no aparece, `url_keymark: null` y se dice |

**REGLA — ningún valor deducido.** Cada número tiene que estar ESCRITO en un documento que se guarda
con la ficha. SCOP = 2,5·(η+3)/100 (Rgto. 813/2013): si el SCOP y el η declarados no cuadran (±0,05),
uno de los dos está mal copiado — el script lo avisa.

**REGLA — un SEER es un cociente (4,16), no un % (416)**, y un η es un % (183,7), no un tanto por uno.
`buildPayload` (el MISMO de la pantalla del catálogo) normaliza los dos.

## El comando

```bash
node scripts/cee_inicial.js alta-aerotermia --json datos.json \
     --ficha "TDM.pdf:1,3-4,17,23" --eprel-fiche eprel_fiche_NNN_ES.pdf --eprel-label eprel_label_NNN.pdf
# revisa lo que imprime, y después lo mismo con --escribir
```

`datos.json` lleva las columnas de `aerotermia` (`marca`, `modelo_comercial`, `tipo`,
`potencia_calefaccion`, `modelo_conjunto`, `modelo_ud_exterior`, `modelo_ud_interior`,
`scop_cal_calido_35/55`, `scop_cal_medio_35/55`, `eta_calida_35/55`, `eta_media_35/55`, `seer`,
`cop_a7_55`, `refrigerante`, `potencia_frigorifica`, `deposito_acs_incluido`, `litros_acs`,
`scop_dhw_*`, `eta_acs_*`, `eprel` (URL de la ficha pública), `url_keymark`, `is_validated: false`).

- `--ficha fichero:páginas` recorta la ficha del fabricante a las páginas que justifican los datos
  (una TDM de 33 páginas se queda en 5): es lo que acaba anexado al certificado.
- La ficha unida (fabricante + EPREL + etiqueta) va a la carpeta del catálogo de Drive como
  `{marca} {modelo} - FT.pdf` con `ficha_tecnica_partes` —la misma forma que `fichaConsolidada`—, así
  que el gestor de anexos la pinta como «Conjunto de 3 documentos».
- **Antes de escribir se comprueba que NO esté ya** (misma casación que el lector de placas): nunca
  se duplica un modelo.

Caso real: **MIDEA MHC-V12WD2N7-E30** (26RES060_OP246) → id 565. EPREL tiene dos registros del mismo
modelo: 1848680 (Midea Europe, con los tres climas: cálido 232 %/174 %) y 2146706 (otro importador,
solo clima medio). Se usó el primero; los valores con decimales salen de la TDM MD23IU-049D-EN.
