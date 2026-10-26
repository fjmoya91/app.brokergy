// ─── La voz en off del vídeo con sonido (PromoVerticalVoz) ──────────────────
// Un segmento por pantalla. `texto` es lo que se le da al TTS, escrito como se
// dice («ce tres equis», no «.cex»). Se genera con
// `node scripts/voz.mjs` (Gemini TTS) y cada segmento queda en
// public/voz/<id>.wav. Dice solo lo que la app hace: sin cifras de tiempo.
export const VOZ = 'Achird';
export const MODELO_TTS = 'gemini-3.8-flash-tts';

/* El tono va como ETIQUETA entre corchetes delante de cada texto (la forma que
   entiende gemini-3.8-flash-tts). Como frase («Dilo en…:») o con notas largas, la
   lee en voz alta; las instrucciones de sistema no las admite. Sin etiqueta, el
   acento sale latino. */
export const ESTILO = '[castellano de España, acento peninsular, tono cercano y natural, como hablando con un compañero] ';

/* Uno por cada cambio de pantalla (las ventanas de `VENTANAS` en Promo.jsx). */
export const SEGMENTOS = [
    { id: '1-gancho', texto: '¿Te imaginas tener el archivo de CE tres equis hecho, sin pasarte horas de gabinete?' },
    { id: '2-posible', texto: 'Pues ya se puede.' },
    { id: '3-obra', texto: 'Primero metes los datos de la obra. Con la referencia catastral, sale el plano de la vivienda.' },
    { id: '4-preguntas', texto: 'Luego contestas unas preguntas, lo que la IA no ve en las fotos: la calefacción, las ventanas…' },
    { id: '5-fotos', texto: 'Y subes las fotos, cada una en su apartado.' },
    { id: '6-ia', texto: 'Se lo envías a la IA, y te avisamos por WhatsApp cuando está listo.' },
    { id: '7-firma', texto: 'Revisas el croquis y lo firmas desde la web. Con su archivo de CE tres equis, el XML y el PDF.' },
    { id: '8-llamada', texto: 'Tu primer certificado es gratis. Entra en ce, e, e, punto brokergy, punto es.' },
];
