# Brokergy — Brand Kit

Kit de marca extraído de la app.brokergy (CRM interno de rehabilitación energética).
No incluye componentes React funcionales — es una base de **logos, color y tipografía**
para que las pantallas generadas se vean coherentes con la marca real.

## Uso

- **Colores**: importa `styles.css`. Usa `var(--brand-primary)` (#FFA000) como acento
  principal, `var(--bkg-*)` para superficies (oscuro por defecto), y añade la clase
  `.theme-light` en el elemento raíz para el tema claro.
- **Tipografía**: `Inter` (Google Fonts) con fallback a system-ui. Ver `components/Brand/Typography`.
- **Logos**: en `logos/` — usa el logo blanco (`logo-white.png`) sobre fondo oscuro y el
  oscuro (`logo-dark.png`) sobre fondo claro. `logo-circular.png` es el isotipo para
  favicons/avatares.

## Estilo visual de referencia

El CRM real usa fondo oscuro por defecto, tarjetas con bordes sutiles translúcidos,
esquinas redondeadas (10–14px), sombras suaves y el naranja de marca como único acento
de color sobre una base neutra oscura (grises azulados, casi negros).
