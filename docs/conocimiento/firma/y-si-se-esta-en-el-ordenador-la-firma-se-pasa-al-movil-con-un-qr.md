<!-- conocimiento · área: firma · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «DESHACER en la envolvente, y quién puede leer la placa (2026-09-16)», en el CLAUDE.md antiguo.

### Y si se está en el ORDENADOR, la firma se pasa al MÓVIL con un QR

Una firma hecha con el ratón es una mala imitación de la de uno: el pulso va en la muñeca y
sale rígida, con el ancho constante de una polilínea. Así que **con un ratón delante no se
abre la hoja: se ofrece primero el QR** (`FirmarConMovil`), y solo debajo "Firmar aquí con el
ratón". Con un dedo delante se va derecho a la hoja — un QR en un móvil no tiene sentido.
Lo decide `matchMedia('(pointer: coarse)')`, el PUNTERO y no el ancho: un portátil táctil de
15" firma con el dedo perfectamente y un móvil enchufado a un monitor sigue siendo un móvil.

Es un port del planteamiento de `ScannerApp/src/main/signServer.ts` + `PhoneSignModal.tsx`,
con la diferencia de que aquí SÍ hay servidor: no hace falta levantar uno en el equipo.

| Qué | Dónde |
|---|---|
| Las sesiones (token, caducidad, IPs) | [firmaMovil.js](implementation/backend/services/firmaMovil.js) |
| Rutas | `POST /api/public/firma-movil` · `GET|POST /firma-movil/:token` · `GET /firma-movil/:token/esperar` |
| El QR en el ordenador | [FirmarConMovil.jsx](implementation/frontend/src/features/firma/FirmarConMovil.jsx) |
| Lo que ve el teléfono | [FirmaMovilView.jsx](implementation/frontend/src/features/firma/FirmaMovilView.jsx) → `/firma-movil/:token` |

**REGLA — al teléfono NO le viaja el documento; solo vuelve la firma.** Igual que en
ScannerApp: al móvil se le manda una hoja en blanco y el NOMBRE de lo que se firma, nada
más. Es lo que hace razonable abrir esto con una cámara — con el token en la mano, lo único
que se puede hacer es mandar un PNG. Y de paso evita pedirle a nadie que busque el "Fdo."
dando pellizcos a una pantalla de seis pulgadas: el documento ya se ha leído en el PC.

**REGLA — el token es de UN SOLO USO y dura 10 minutos**, y se marca como usado ANTES de
guardar la firma: si el móvil reintenta por un timeout de red, no puede colar una segunda
firma con el mismo enlace. Al recogerla, el PC cierra la sesión. Un segundo documento pide
un enlace NUEVO.

**REGLA — las sesiones viven en MEMORIA.** Duran minutos y con el usuario delante; una tabla
obligaría a limpiar filas muertas para siempre a cambio de sobrevivir a un reinicio que, si
ocurre, se resuelve pidiendo otro enlace. Es lo contrario que el bot de WhatsApp, donde un
reinicio nocturno sí se comería una pregunta.

**REGLA — el PC PREGUNTA cada 2 s; no hay websocket.** Dura un minuto, y así sobrevive a que
el ordenador recargue la página.

⚠️ **En LOCAL el enlace se compone con la IP de la RED LOCAL, no con `localhost`**: en el
teléfono, `localhost` es el propio teléfono. `direccionesLan()` copia los pesos de ScannerApp
(se penalizan VirtualBox, VMware, Docker, WSL, VPN) y CONSERVA el puerto del origen que pidió
el enlace, así que sale `http://192.168.1.x:5173/firma-movil/…` y se puede probar con el
móvil sin desplegar nada. Acertar con la IP siempre es imposible, así que "¿No conecta?"
ofrece las demás con su propio QR. En producción manda el origen real.

⚠️ **Dos cosas que solo se ven probando DESDE OTRA IP** y que costaron el diagnóstico:
- `FirmaMovilView` **y `FirmarAnexosView`** piden la API en **relativo** (`/api/public`).
  Las demás vistas públicas apuntan a `http://localhost:3000` en desarrollo y les vale
  porque se abren en el mismo ordenador que corre el backend; estas dos las abre el CLIENTE
  con el móvil, y en relativo se puede recorrer el proceso ENTERO desde el teléfono entrando
  por `http://<ip-lan>:5173/firmar-anexos/<id>` — que es donde se ve de verdad si los
  documentos se leen en una pantalla de seis pulgadas.
- El **CORS** del backend rechazaba el origen de la LAN (`esLanPrivada` en `server.js`). Solo
  se admite fuera de producción y solo en rangos privados: en el VPS `NODE_ENV=production` y
  la lista sigue siendo `FRONTEND_URL`.

⚠️ **`SignaturePad` y el aviso de "gira el teléfono" van PORTALEADOS a `document.body`**
(regla 29.b). La tarjeta de `/firmar-anexos` lleva `backdrop-blur-xl`, y un `position: fixed`
se ancla al ancestro más cercano con `backdrop-filter`: la "pantalla completa" se recortaba a
esa tarjeta y la hoja salía en una franja de 200 px con los botones amontonados. El aviso
necesita además su propio portal — vivía dentro de `#root`, que apila ANTES que el portal de
la hoja, así que quedaba DEBAJO de ella por mucho z-index que llevara.
