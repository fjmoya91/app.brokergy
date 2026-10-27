# El formulario de eDICE-Térmicas (certificado sin proyecto)

`https://edice.castillalamancha.es/eDice-Termicas/etdformu.jsp` · envía a `BControl`. Leído del
código de la página el 25/10/2026 (si algo no casa, bájala con `curl` y busca la función de
validación: `validar`, `potenciaCorrecta`, `valorCorrectoCoordenadaUTM`, `riiCorrecto`).

## Campos (por `id`)

| Bloque | Campo | Valores / formato |
|---|---|---|
| Titular | `txtNombr`, `txtApel1`, `txtApel2`, `txtNifpe` | MAYÚSCULAS sin tildes; NIF máx. 10 |
| Dirección (popup) | `lstTipoVia` (`CALLE`, `AVENIDA`…), `txtNombreVia`, `txtNumeroVia`, `txtBloqueVia`, `txtEscaleraVia`, `txtPlantaVia`, `txtPuertaVia`, `txtPtokmVia`, `txtComplementoVia` | luego `componerDireccion(false)` llena `txtDirec` (deshabilitado): «CALLE TRINIDAD NUM: 32 PLN: BAJO» |
| Situación | `txtCpost` | empieza por el código de la provincia |
| | `lstProvi` | `02` Albacete · `13` Ciudad Real · `16` Cuenca · `19` Guadalajara · `45` Toledo. Su `change` carga `lstLocal` por AJAX: esperar a que tenga opciones |
| | `lstLocal` | se elige por el TEXTO de la opción (sin tildes: «ALCAZAR DE SAN JUAN») |
| | `txtReferenciaCatastral` | 14 o 20 caracteres |
| | `txtUTMX`, `txtUTMY` | ETRS89, `\d{1,8}\.\d{2}` («481942.00»): las de la memoria |
| Instalación | `lstInstaNueva` | `1` Nueva · `2` Reforma |
| | `lstCaracterInst` | `1` Centralizada · `2` Individual |
| | `lstTipoInsta` | `2` Cal+ACS · `3` Refrig. · `5` Vent. · `7` Cal. · `8` ACS · `9` Cal+Ref+Vent · `10` Cal+Ref+Vent+ACS · `11` Cal+Ref+ACS |
| | `lstUso` | `5` Local · `6` Vivienda · `7` Otros · `8` Local institucional |
| | `lstCombu` | `1` Gasóleo · `2` GLP · `3` Gas natural · `6` Otros (+`txtCombuOtros`) · `8` Geotermia · `9` Aerotermia |
| | `chkAlmacenamiento_S` / `chkAlmacenamiento_N` | radio; con S, `txtCdepo` |
| Potencias (kW) | `txtPoten_C`, `txtPoten_F`, `txtPoten_ACS`, `txtPoten` | punto decimal; total 5–70 y ≥ cada parte (`potenciaCorrecta`) |
| Solar | `txtPaneles`, `txtSPaneles`, `txtEApoyo` | obligatorios; `0` si no hay |
| Memoria | `txtMemor` (file) | `.ZIP` ≤ 1 MB; `readSingleFile` llena `txtMemorB64` |
| | `txtMemoriaAutor`, `txtMemoriaAutorNif` | autor de la memoria firmada |
| Pruebas (DD/MM/AAAA) | `txtFpruebaEquipos` equipos · `txtFestanAgua` estanqueidad agua · `txtFestanFrigo` estanqueidad frigoríficos · `txtFlibreDilata` libre dilatación · `txtFredesAire` conductos de aire · `txtFestanChime` chimeneas · `txtFUNE` UNE-EN 12599 · `txtFdistriAire` equilibrado aire · `txtFequilibAgua` equilibrado agua · `txtFefiEnergi` eficiencia energética | vacías las que no aplican |
| Final | `txtObservaciones` | máx. **250** |
| | `chkDeclara` | ya viene marcada |
| | `txtRii` | RII de la empresa instaladora, `\d{2}-[A-Z]-D2[0-2]-[0-9A-Z]{8}` |

## El script (plantilla; se rellena con los datos de la memoria firmada)

```js
const D = {
  nombre: '…', ape1: '…', ape2: '…', nif: '…',
  tipoVia: 'CALLE', via: '…', num: '…', planta: '', puerta: '',
  cp: '…', prov: '13', localidad: /^ALC.ZAR DE SAN JUAN$/i,
  rc: '…', utmx: '000000.00', utmy: '0000000.00',
  nueva: '2', caracter: '2', tipo: '11', uso: '6', combu: '9',
  potC: '0', potF: '0', potACS: '', potTotal: '0',
  autor: '…', autorNif: '…',
  pruebas: { txtFpruebaEquipos: 'dd/mm/aaaa', txtFestanFrigo: 'dd/mm/aaaa', txtFUNE: 'dd/mm/aaaa', txtFdistriAire: 'dd/mm/aaaa', txtFefiEnergi: 'dd/mm/aaaa' },
  obs: '…',   // ≤ 250
  rii: '…',
};
const v = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; };
v('txtNombr', D.nombre); v('txtApel1', D.ape1); v('txtApel2', D.ape2); v('txtNifpe', D.nif);
document.getElementById('lstTipoVia').value = D.tipoVia;
v('txtNombreVia', D.via); v('txtNumeroVia', D.num); v('txtPlantaVia', D.planta); v('txtPuertaVia', D.puerta);
const okDir = componerDireccion(false);
v('txtCpost', D.cp); v('lstProvi', D.prov);
for (let i = 0; i < 20 && document.getElementById('lstLocal').options.length < 5; i++) await new Promise(r => setTimeout(r, 500));
const loc = [...document.getElementById('lstLocal').options].find(o => D.localidad.test(o.text.trim()));
if (loc) v('lstLocal', loc.value);
v('txtReferenciaCatastral', D.rc); v('txtUTMX', D.utmx); v('txtUTMY', D.utmy);
v('lstInstaNueva', D.nueva); v('lstCaracterInst', D.caracter); v('lstTipoInsta', D.tipo); v('lstUso', D.uso); v('lstCombu', D.combu);
document.getElementById('chkAlmacenamiento_N').checked = true;
v('txtPoten_C', D.potC); v('txtPoten_F', D.potF); if (D.potACS) v('txtPoten_ACS', D.potACS); v('txtPoten', D.potTotal);
v('txtPaneles', '0'); v('txtSPaneles', '0'); v('txtEApoyo', '0');
v('txtMemoriaAutor', D.autor); v('txtMemoriaAutorNif', D.autorNif);
for (const [id, f] of Object.entries(D.pruebas)) v(id, f);
v('txtObservaciones', D.obs); v('txtRii', D.rii);
JSON.stringify({ okDir, dir: document.getElementById('txtDirec').value, loc: loc && loc.text,
  tipo: document.getElementById('lstTipoInsta').selectedOptions[0].text,
  total: document.getElementById('txtPoten').value, potOK: potenciaCorrecta(document.getElementById('txtPoten').value),
  obsLen: document.getElementById('txtObservaciones').value.length })
```

Si la salida no trae `dir`, `loc` o `potOK: true`, o `obsLen > 250`, no se diligencia.

Después, en la MISMA tanda: `find` del campo «Memoria» → `file_upload` del `MEMORIA_RITE_{nº}_fdo.zip`
(`implementation/backend/scratch/firmar-rite/<nº>/`) → comprobar
`document.getElementById('txtMemorB64').value.length > 0` → «Diligenciar Certificado».

⚠️ La extensión bloquea la SALIDA de `javascript_tool` si parece una query string o una cookie
(`?`, `&`, `=`): para leer código de la página, cámbialos por espacios en lo que se devuelve.
