# El montaje: que AutoFirma firme sin que nadie pulse (una vez por PC)

## Por qué hace falta

La sede de la JCCM firma DOS veces con AutoFirma: al identificarse y al enviar. AutoFirma 1.9 enseña
**siempre** su ventana de «Diálogo de seguridad del almacén …» para elegir certificado —solo la evita
el parámetro `headless` que pone la propia web, y la JCCM no lo pone— y esa ventana es de Java, fuera
del navegador: Claude en Chrome no la puede pulsar.

Lo que sí trae AutoFirma (código: `ProtocolInvocationLauncherSign.java`, preferencias
`defaultKeystore` + `useDefaultStoreInBrowserCalls`) es usar **otro almacén** en las llamadas desde el
navegador. Si ese almacén tiene **un solo** certificado, AutoFirma pinta un `JOptionPane` normal con el
foco en «Aceptar» (`CertificateSelectionDialog.java`: `certs.length > 1 ? new CertOptionPane(…) : new
JOptionPane()`), y un Intro basta: es lo que hace `vigilante_autofirma.ps1`.

Un **perfil de Chrome aparte NO sirve**: todos los perfiles, y AutoFirma, leen el mismo almacén de
Windows. En el de este PC hay certificados de varias personas (clientes y representantes): con él, un
Intro a ciegas podría firmar con el de otro. Por eso el vigilante solo pulsa si el título dice
**NSS** (el almacén de Firefox) y nunca si dice Windows.

## Pasos (los hace el usuario; son su certificado y su clave)

1. **Instalar Firefox.** No se usa para navegar: es el almacén aparte que AutoFirma sabe leer. Abrirlo
   una vez para que cree su perfil.
2. **Exportar el certificado PERSONAL** de quien presenta desde Windows (Opciones de Internet →
   Contenido → Certificados → Exportar):
   - «Exportar la clave privada» ✅ (sin ella no se puede firmar).
   - PKCS #12 (.PFX) · «Incluir todos los certificados de la ruta» ✅ · **«Eliminar la clave privada si
     la exportación es correcta» ❌** (si se marca, deja de funcionar en Windows) · «Habilitar
     privacidad de certificado» ❌ (algunos programas no importan ese .pfx).
   - Contraseña, y cifrado AES256-SHA256.
3. **Importarlo en Firefox**: Ajustes → Privacidad & Seguridad → Certificados → Ver certificados →
   «Sus certificados» → Importar. **Sin contraseña principal** en Firefox: si la tiene, AutoFirma la
   pediría en cada firma. Después, el `.pfx` a un sitio seguro o borrado (no en Descargas).
4. **AutoFirma** → Herramientas → Preferencias → **Almacenes de claves**:
   - «Almacén por defecto» = **Mozilla Firefox** («Mozilla / Firefox (unificado)»; NO el «junto a
     almacén de SO»).
   - ✅ «Usar también en las llamadas a Autofirma desde el navegador».
5. La primera vez que Chrome pregunte «¿Abrir Autofirma?», marcar «Permitir siempre».

## Comprobarlo

```powershell
powershell -ExecutionPolicy Bypass -File implementation\backend\scripts\presentar_cee\comprobar_montaje.ps1 -Titular <APELLIDO1_APELLIDO2>
```

Lee las preferencias de AutoFirma del registro (`HKCU\Software\JavaSoft\Prefs\es\gob\afirma\…`, con
las mayúsculas codificadas como `/X`) y pregunta a la propia AutoFirma qué ve:
`AutofirmaCommandLine.exe listaliases -store mozilla` tiene que devolver **un** alias, el de quien
presenta.

⚠️ El administrador de certificados de Firefox enseña TAMBIÉN los de Windows («OS Client Cert Token»,
que Firefox carga solo). No es un fallo: AutoFirma no los carga. Lo que manda es `listaliases`.

## Lo que cambia para lo demás

Cualquier web que firme con AutoFirma en este PC ofrecerá solo ese certificado. Para firmar con otro
(el de representante de la empresa, o el de otra persona), en la ventana de AutoFirma: «Cambiar
almacén» → Windows. Un clic más esas veces.
