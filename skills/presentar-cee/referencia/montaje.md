# El montaje: que AutoFirma firme sin que nadie pulse

## Por qué hace falta

La sede de la JCCM firma DOS veces con AutoFirma: al identificarse y al enviar. La sede llama a
AutoFirma (librería `miniapplet.js` 1.7) **sin** decirle con qué certificado, y AutoFirma enseña su
ventana «Diálogo de seguridad del almacén …» para elegirlo. Esa ventana es de Java, fuera del
navegador: Claude en Chrome no la puede pulsar. Y en el almacén de Windows de este PC hay certificados
de varias personas (clientes y representantes, y del mismo Fran el personal y el de representante):
un Intro o un clic a ojo podría firmar con el de otro.

## Cómo se resuelve: el certificado se fija por HUELLA (desde el 27/10/2026)

AutoFirma acepta en la llamada filtros de certificado y `headless=true`: si el filtro deja **un**
certificado, firma con él **sin enseñar la ventana**; si no deja ninguno, da error (nunca elige otro).
Es exactamente lo que hace la propia librería de la sede con su «firmante fijo»
(`addSignatoryCertificateToExtraParams`: `filters=encodedcert:…` + `headless=true`), y comprobado en
las clases de la AutoFirma 1.9 instalada (`CertFilterManager`: `headless` → `mandatoryCertificate`,
filtro `thumbprint:`).

- `presentar_cee.js preparar` busca en el almacén de Windows el certificado **personal** de quien
  presenta (`CN=` empieza por el titular —`CEE_PRESENTA_TITULAR`, por defecto `MOYA LOPEZ`—, sin
  «(R: …)», vigente, con clave privada; el que caduca más tarde) o el de `CEE_PRESENTA_HUELLA`, y deja
  `certificado.js` y `enviar.js`.
- `certificado.js` se pega en la página **antes de la firma de identificarse** (cada recarga lo borra):
  envuelve `MiniApplet.sign` y compañía para que lleven `filters=thumbprint:SHA1:<huella>` +
  `headless=true`.
- `enviar.js` sustituye al botón «Enviar»: la firma del envío la lanza la página que DEVUELVE la sede
  nada más cargarse, así que el formulario se manda a un marco de la misma página y un vigía de 1 ms
  pone el mismo filtro en la librería del marco antes de que firme (27/10/2026, 2026CEE_59).
- `vigilante_autofirma.ps1` es solo la red: si aun así sale la ventana, la **cancela** (Escape) y lo
  dice. Nunca pulsa Intro.

No hace falta Firefox ni tocar las preferencias de AutoFirma. Sirve en cualquier PC que tenga
AutoFirma, Chrome con «Abrir Autofirma» permitido y el certificado personal en Windows.

En un PC NUEVO, la primera firma puede fallar («No se ha podido iniciar la sesión» / «Este navegador no
soporta JAVA»): AutoFirma tarda en arrancar la primera vez y Chrome puede estar pidiendo el permiso
«¿Abrir Autofirma?» o el de acceso a la red local. Con el permiso dado, se cierra el `javaw` de AutoFirma
que quedó esperando y se repite (27/10/2026).

## Pasos en un PC nuevo

La skill sola no basta: corre los scripts del repo en ESE PC (`presentar_cee.js` lee Supabase, baja de
Drive y sube lo devuelto por el servidor con la clave interna).

1. **El repo y Node**: clonar en `C:\Proyectos\app.brokergy` (la ruta que usan las skills) y
   `npm install` en `implementation/backend` y en `implementation/frontend` (de ahí salen `pdfjs-dist`
   y la lógica del borrador).
2. **El `.env` del backend** (`implementation/backend/.env`), copiado del otro PC **a mano** (USB o
   similar; nunca por email, WhatsApp ni git: lleva la clave de Supabase, la de Drive y la interna).
   Con él vienen también los interruptores apagados de local.
3. **Claude en Chrome** (la extensión, con la sesión de Claude) y Chrome con la tarjeta guardada.
4. Instalar **AutoFirma** (1.8 o posterior).
5. El certificado personal de quien presenta, en el almacén de Windows **con su clave privada**
   (doble clic en el `.pfx` → Usuario actual). Después, el `.pfx` a un sitio seguro (no en Descargas).
6. La primera vez que Chrome pregunte «¿Abrir Autofirma?», marcar «Permitir siempre».
7. Opcional, **CE3X 3.2** en `C:\Program Files (x86)\CE3Xv3.2`: `preparar` valida con él el XML. Sin
   él lo avisa, y hay que abrir el PDF y mirar que no lleve la marca «certificado incompleto».

## Comprobarlo

```powershell
powershell -ExecutionPolicy Bypass -File implementation\backend\scripts\presentar_cee\comprobar_montaje.ps1 -Titular MOYA_LOPEZ
node implementation/backend/scripts/presentar_cee.js certificado
```

El primero tiene que acabar en **MONTAJE LISTO**; el segundo dice con qué certificado se firmará
(nombre, emisor y caducidad; el NIF no se enseña).

## El montaje viejo con Firefox (hasta el 27/10/2026)

Antes se aislaba el certificado poniéndolo SOLO en Firefox y diciéndole a AutoFirma que usara ese
almacén en las llamadas del navegador (`defaultKeystore` = Mozilla + `useDefaultStoreInBrowserCalls`);
con un certificado el foco quedaba en «Aceptar» y el vigilante pulsaba Intro si el título decía NSS.
Funcionaba, pero solo en un PC montado así, y obligaba a cambiar de almacén a mano para firmar con
otro certificado (el RITE con el de representante). Si un PC lo conserva, la huella vale igual porque
el certificado de Firefox es el mismo; para dejar de depender de él, en AutoFirma → Preferencias →
Almacenes de claves, desmarcar «Usar también en las llamadas a Autofirma desde el navegador».
