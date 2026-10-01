# ESPECIFICACIÓN — Tool MCP `generar_cifo` (backend app.brokergy)

Endpoint del MCP de BROKERGY que genera el CIFO de un expediente en servidor, con el mismo patrón que
`generar_anexo_fotografico`. La skill `generar-anexo-cifo` deja el expediente preparado (datos en
Supabase validados) y llama a este tool; el backend imprime, descarga EPREL, guarda en Drive y enlaza.

## 1. Firma del tool

```
generar_cifo(numero: string) →
{
  ok: boolean,
  expediente: string,
  link: string,            // cert_cifo_drive_link del PDF generado
  numPaginas: number,
  tipologia: "RES060" | "RES080" | "RES093",
  anexos: [                // FT y EPREL incorporados
    { tipo: "ft_cal" | "ft_acs" | "eprel_fiche" | "eprel_label" | "res080_marco" | "res080_cristal" | "res080_aislamiento",
      fileName: string, driveId: string, link: string,
      origen: "drive" | "descarga_url" | "eprel_api",
      fusionado_en_pdf: boolean }
  ],
  warnings: string[],      // p.ej. "EPREL no descargable, adjuntar a mano"
  message: string
}
```

Opcional pero recomendado: `estado_cifo(numero)` → `{ datos_ok: [...], datos_faltan: [...], puede_generar: boolean }`
espejo del checklist del §3, para que la skill lea qué falta sin duplicar lógica.

## 2. Comportamiento

1. **Cargar datos** del expediente desde Supabase (`expedientes` + `oportunidades` + `clientes` +
   `prescriptores` + `aerotermia`). NO recalcular nada nuevo: el PDF **imprime lo que hay en la app**
   (la validación previa es de la skill). Si falta un dato imprescindible → `ok:false` con la lista
   `datos_faltan` (no generar un PDF a medias).
2. **Componer el PDF** con la plantilla oficial según tipología (ver §4).
3. **Anexar las FT**: fusionar al final del PDF la FT de calefacción (`ft_aerotermia_cal_link`) y, si
   `cambio_acs`, la de ACS (`ft_aerotermia_acs_link`). Si el slot apunta a URL externa (fabricante),
   descargarla, subirla a `3. FICHAS TÉCNICAS Y CERTIFICACIONES` y actualizar el slot al Drive propio.
4. **EPREL** (si `instalacion.aerotermia_cal.metodo_scop == 'eprel'`, ídem ACS):
   - Extraer `<grupo>/<id>` de `url_eprel` (p.ej. `spaceheaters/673327`).
   - Descargar:
     - Fiche: `GET https://eprel.ec.europa.eu/api/products/{grupo}/{id}/fiches?language=ES` → `Fiche_{id}_ES.pdf`
     - Label: `GET https://eprel.ec.europa.eu/api/products/{grupo}/{id}/labels?format=PDF` → `Label_{id}.pdf`
     (Son los mismos ficheros que descarga el navegador desde la ficha pública; si EPREL exige
     `x-api-key`, usar la clave pública del frontal de eprel.ec.europa.eu.)
   - Subirlos a `3. FICHAS TÉCNICAS Y CERTIFICACIONES` del expediente (idempotente por nombre).
   - Registrarlos en `documentacion.cifo_extra_annexes[]` como
     `{link, label: fileName, driveId, fileName}` (esquema ya en producción, ver 25RES060_63).
   - Fusionar la Fiche al final del PDF del CIFO (como hace la app hoy; ver 25RES060_66).
   - Si la descarga falla → generar igualmente, `warnings += "EPREL <id> no descargable"`.
5. **Guardar** el PDF como `"<numExpte> - Certificado CIFO.pdf"` en `6. ANEXOS CAE` (sustituyendo el
   borrador anterior si existe) y **enlazar** `documentacion.cert_cifo_drive_link`. NO tocar
   `cert_cifo_signed_link` (lo escribe el flujo de firma con el `_fdo`).
6. **Historial**: añadir evento a `documentacion.historial[]` (`tipo: 'CIFO_GENERADO'`, usuario, fecha).

## 3. Datos que imprime (checklist mínimo por tipología)

**Comunes:** nº expediente; nombre+código ficha; CCAA; dirección postal; ref. catastral; coordenadas
UTM; nº de facturas asociadas (`documentacion.facturas[].numero_factura`, todas separadas por comas);
propietario (nombre, NIF, domicilio, tlf, email de `clientes`); fechas inicio/fin
(`fecha_inicio_cifo/fecha_fin_cifo`, formato DD/MM/AAAA); comparativa calefacción EXISTENTE/NUEVA
(tipo, marca, modelo, fuente de energía, nº serie, ηi↔SCOPbdc); comparativa ACS (o "no aplica"/"Se
mantiene la instalación existente" si `cambio_acs=false`); empresa instaladora (razón social, CIF,
domicilio, cargo firmante "Representante legal") — en RES080 firma además el director redactor de
BROKERGY.

**Tabla de variables:**
- RES060: `FP=1 · DCAL · S · DACS · ηi · SCOPbdc · SCOPdhw · AETOTAL · Di=15`
- RES093: añade `Cb` (entre SCOPdhw y AETOTAL)
- RES080: `AETOTAL = FP·(EFi−EFf)` con el desglose EFi/EFf por servicio (tabla de factores de paso y
  consumos de los XML inicial/final)

**Anexo I — justificación (RES060/RES093):** FP=1 por ficha; DCAL y S del CEE; DACS según el método
marcado (XML: "calculada según el archivo .xml ... <valor kWh/m²·año> × S = <DACS>"; CTE: tabla del
Anejo F con habitaciones/personas/l·p/d/Ce/365/ΔT); ηi con el literal del criterio 24/11.03 y el tramo
aplicado; SCOPbdc según `metodo_scop`:
- `eprel` → bloque Anexo IV: `SCOP = CC · (ηs,h + F(1) + F(2))` con CC=2,5, ηs,h de EPREL (clima
  cálido, Tª de impulsión según emisor), F(1)=3 % aerotérmica, F(2)=0 %; imprimir el cálculo completo.
- `ficha`/`catalogo` → "Según la ficha técnica aportada por el fabricante que se entregará como anexo".
SCOPdhw: ídem (Anexo IV conjunto / Anexo VI independiente con `COP_A7/55 × Fc(zona)` / FT).

**RES093 — bloque Cb (Anexo III):** 4 pasos impresos: th por zona (tabla RES220/230, Res. 3/7/2024;
D3=3503 h/año), `Pdiseño=(DCAL·S)/th`, `% cobertura=P_bdc/Pdiseño`, tabla Cb aplicada. La instalación
existente SE MANTIENE (bivalencia paralelo).

**RES080 — plantilla "Certificado Final de Obra CAE"** (ver 26RES080_51 como patrón): portada con
AETOTAL y firma del director redactor; descripción actuación instalación térmica + comparativas;
bloque ventanas (huecos antes/después con U/g/permeabilidad, marco/vidrio marca-modelo-Uf-Ug-g) desde
`documentacion.envolvente`; tabla justificación EFi/EFf desde los XML; anexo SCOP (mismo formato
Anexo IV); anexos: FT aerotermia + FT vidrio (Calumen) + CE/DoP ventanas + FT aislamiento según
`res080_attachments[]`.

## 4. Plantillas de referencia (PDFs reales generados por la app)
- RES060: `25RES060_66 - Certificado_CIFO_fdo.pdf` (Drive id `1h0Sl2QKr-Wyg3zlSHf1iQzjAuY9Ap9jq`)
- RES060 con EPREL extra: `25RES060_63` (`cifo_extra_annexes` con Fiche+Label de 673321)
- RES093: `26RES093_3 - Certificado CIFO.pdf` (Drive id `1hLqRf5rD3_txji7xD5h6rmsbEqs0aShT`)
- RES080: `26RES080_51 - Certificado Final de Obra_fdo.pdf` (Drive id `1cp1DqNuIOJ4uLhL6j0GyOjFKEmo0yfbO`)

## 5. Reglas
- Imprimir EXACTAMENTE los valores de la app (sin redondeos nuevos: SCOP 2 decimales coma decimal,
  importes formato es-ES).
- Idempotente por `numero_expediente`: regenerar sustituye el borrador y actualiza el slot.
- No tocar `cert_cifo_signed_link` ni `datos_calculo.result`.
- Ficheros EPREL idempotentes por nombre (`Fiche_<id>_ES.pdf`).
- Errores parciales (EPREL caído, FT externa no descargable) NO bloquean: generar + `warnings[]`.
- Falta de datos imprescindibles SÍ bloquea: `ok:false` + `datos_faltan[]`.
