<!-- conocimiento · área: instalador-rite · las rutas de los enlaces son relativas a la raíz del repo -->

## Presentar nosotros la Memoria RITE en eDICE-Térmicas (2026-10-25)

Lo normal es que el instalador legalice su instalación térmica. A veces la Memoria RITE la hacemos y la
firmamos nosotros (Brokergy, B19350222) o la firmamos en nombre de otra empresa instaladora de la que
tenemos el certificado de representante, y la presentamos. Primera vez: **26RES080_90** (Laura Millán,
5 splits COOLWELL COOL-MAX 35 que sustituyen una caldera comunitaria de gasóleo), diligenciada el
25/10/2026, expediente eDICE 313009002605. El paso a paso vive en la skill
[presentar-rite](skills/presentar-rite/SKILL.md); aquí, lo decidido y por qué.

| Paso | Qué | Dónde |
|---|---|---|
| 1 | Firmar el PDF con el certificado de representante | [firmar_memoria_rite.js](implementation/backend/scripts/firmar_memoria_rite.js) |
| 2 | ZIP solo con la memoria firmada (≤ 1 MB) | el mismo script |
| 3 | Rellenar y diligenciar `etdformu.jsp` | Claude en Chrome + AutoFirma |
| 4 | Tasa: Tarifa 6.1, **11,97 €** (2026) | plataformapagos.jccm.es → Redsys |
| 5 | Guardar el certificado y el justificante | [guardar_certificado_rite.js](implementation/backend/scripts/guardar_certificado_rite.js) |

**REGLA — firma y diligencia el certificado de REPRESENTANTE de la empresa de la memoria, nunca el
personal.** eDICE comprueba que el firmante es la empresa instaladora habilitada (RII): con el
personal, el certificado sale a nombre de una persona sin empresa. En un PC con el montaje viejo de
`presentar-cee` (AutoFirma usa Firefox en el navegador) el diálogo sale con el personal y se cambia a
«Almacén de claves del sistema»; sin él sale ya el de Windows. Ahí se elige el `(R: <CIF>)` vigente,
con captura antes y después de cada clic (en ese almacén hay certificados de clientes y de otras
empresas). **No se lanza el vigilante** de `presentar-cee`: desde el 27/10/2026 cancela toda ventana
de certificado. Fran: «Debe ser con la firma de soluciones sostenibles, de representante».

**REGLA — el slot «Certificado RITE» lleva el PDF de la IMPRESORA de eDICE.** La página de resultado
no es el certificado: el icono de la impresora abre `diligimp.jsp` y su visor descarga
`GenerarPdf.pdf`, el impreso oficial sellado por la JCCM. La primera vez se subió la página web
impresa a PDF y Fran lo corrigió; quedó en OLD. `guardar_certificado_rite.js` sube por el mismo camino
que la fila «Certificado RITE» de Documentación (nombre canónico, `cert_rite_drive_link`, lectura de
la regla 27.b) y enlaza además la memoria firmada en `cert_rite_signed_link`.

**REGLA — lo declarado en eDICE sale de la memoria firmada.** Titular, emplazamiento, UTM, potencias
y fechas de pruebas son los del ZIP. Si algo no cuadra con el expediente, se corrige la memoria y se
vuelve a firmar.

**Decisiones de Fran (25/10/2026):**

- **Splits: las potencias se SUMAN** (5 × 3,52 = 17,6 kW calor; 5 × 3,50 = 17,5 kW frío) y el total es
  calor + frío (35,1 kW).
- **Tipo «Calefacción, Refrigeración y ACS»** para splits aire-aire sin ACS: eDICE no tiene
  «Calefacción y Refrigeración» sola. La potencia de ACS se deja vacía.
- Pruebas con splits: equipos, **estanqueidad de circuitos frigoríficos**, UNE-EN 12599, equilibrado
  de aire y eficiencia energética, con la fecha de la puesta en servicio.
- Firma en la página 4, bajo «Fecha y firma del/la Instalador/a»; el ZIP, solo la memoria firmada.

**Lo que costó:**

- Chrome **descarta la pestaña** en segundo plano y con ella la dirección compuesta y la localidad
  cargada por AJAX: todo se rellena en un solo script, justo antes de diligenciar.
- Observaciones: máximo 250 caracteres.
- El desplegable de tarjetas de Chrome en Redsys no responde al clic del ratón; sí al teclado
  (`{DOWN}` + `{ENTER}` con SendKeys, sin `escritorio.ps1 teclas`, que trae la ventana al frente y lo
  cierra). El CVV lo pone Chrome al hacer clic en su campo.
- Lo que devuelve eDICE además: tres ZIP de acuse (`aft_`, `amt_`, `mtt_`) con las firmas XML y la
  memoria registrada. La app no los usa.

**Por probar:** hacer aquí lo mismo que en `presentar-cee` desde el 27/10/2026 —`certificado.js`, que
añade a la llamada `filters=thumbprint:SHA1:<huella>` + `headless=true`— con la huella del de
representante `(R: <CIF>)`. Falta ver qué librería y qué función usa eDICE para llamar a AutoFirma.
