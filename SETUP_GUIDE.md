# Guía de Configuración y Preguntas Frecuentes

## 1. API del Catastro
**¿Está operativa?**
Sí. La aplicación se conecta a la **Sede Electrónica del Catastro** (Ministerio de Hacienda).

**¿Qué puedo consultar?**
Puedes consultar datos de inmuebles en **todo el territorio de responsabilidad del Estado** (Península, Baleares, Canarias, Ceuta y Melilla).
*   *Nota:* País Vasco y Navarra tienen sus propios sistemas catastrales forales y esta integración estándar podría no devolver datos completos de esas zonas.

**¿Qué datos obtendré?**
Datos públicos (físicos y económicos):
*   Referencia Catastral (RC).
*   Localización (calle, número).
*   Superficie construida.
*   Año de construcción.
*   Uso principal (Residencial, Industrial, etc.).
*   Coordenadas.
*   **NO obtendrás:** Nombres de propietarios (Titularidad) ni valores catastrales en euros, ya que estos datos están protegidos por la Ley de Protección de Datos y requieren certificado digital personal.

---

## 2. Cómo conectar Google Maps (Paso a Paso)

Para que la búsqueda por dirección y el mapa funcionen al 100% (y no en modo simulación), necesitas una **API Key** de Google.

### Paso A: Obtener la Clave (Google Cloud)
1.  Entra en [Google Cloud Console](https://console.cloud.google.com/).
2.  Crea un nuevo Proyecto (o usa uno existente).
3.  En el menú, ve a **APIs y Servicios > Biblioteca**.
4.  Busca y habilita estas 2 APIs:
    *   **Geocoding API** (Para convertir direcciones en coordenadas).
    *   **Maps JavaScript API** (Para mostrar el mapa visual).
5.  Ve a **APIs y Servicios > Credenciales**.
6.  Dale a **+ CREAR CREDENCIALES** > **Clave de API**.
7.  Copia la clave que empieza por `AIza...`.

### Paso B: Ponerla en tu Proyecto
1.  Ve a la carpeta del backend: `C:\Proyectos\catastro-integration-specs\implementation\backend`.
2.  Abre el archivo llamado `.env` con el Bloc de Notas.
3.  Busca la línea:
    ```
    GOOGLE_MAPS_KEY=YOUR_GOOGLE_MAPS_KEY_HERE
    ```
4.  Borra `YOUR_GOOGLE_MAPS_KEY_HERE` y pega tu clave `AIza...`.
5.  Guarda el archivo.
6.  **Importante:** Reinicia el servidor (cierra la ventana negra del Backend y vuelve a ejecutar `start-app.bat`).

---

## 3. Costes y Facturación de Google (Dudas Frecuentes)

**¿Cobran por usar la API?**
Google Maps Platform usa un modelo "Freemium":
1.  **Crédito Gratis:** Google da **$200 USD mensuales** de crédito gratis a cada cuenta.
2.  **Consumo estimado:**
    *   Con $200 puedes hacer unas **40,000 geocodificaciones** (búsquedas de dirección) al mes.
    *   O unas **28,000 cargas de mapa** dinámico al mes.
    *   *Para uso personal o interno, es prácticamente gratis.*
3.  **¿Por qué piden tarjeta?** Es obligatorio para verificar identidad y por si te pasas del crédito. *No te cobrarán nada si no superas los límites.*

**Alternativa Gratis (OpenStreetMap):**
Si prefieres no poner tarjeta de crédito, podemos cambiar el sistema para usar **OpenStreetMap** (totalmente gratuito), pero la calidad de las imágenes satélite y la precisión de direcciones es algo inferior.

---

## 4. Solución de Problemas

*   **Error "Catastro no responde":** A veces los servidores del Ministerio están saturados o en mantenimiento (fines de semana).
*   **Error en Google:** Si ves "Request Denied" en la consola, revisa que hayas habilitado la facturación en Google Cloud (es obligatorio aunque te dan 200$ gratis al mes).
