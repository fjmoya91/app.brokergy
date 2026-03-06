# Guía de Despliegue en Vercel - Calculadora Brokergy

Esta guía te llevará paso a paso para desplegar tu aplicación en Vercel.
Hemos preparado tu código para que el despliegue sea lo más sencillo posible, integrando tanto el Frontend (React) como el Backend (API Catastro) en un mismo despliegue.

## 1. Preparación de GitHub

Necesitamos subir tu código a GitHub para que Vercel pueda acceder a él.

1.  Ve a [github.com](https://github.com) e inicia sesión (o crea una cuenta).
2.  Crea un **Nuevo Repositorio** (botón "+" arriba a la derecha -> New repository).
3.  Ponle un nombre, por ejemplo: `calculadora-brokergy`.
4.  Déjalo como **Público** o **Privado** (Privado recomendado para código de cliente).
5.  **NO** inicialices con README, .gitignore ni licencia (ya los tenemos).
6.  Dale a "Create repository".

Una vez creado, verás una pantalla con instrucciones. Copia la URL del repositorio (hhtps://github.com/tu-usuario/calculadora-brokergy.git).

## 2. Subir el Código

Abre tu terminal en la carpeta del proyecto (`c:\Proyectos\catastro-integration-specs\implementation`) y ejecuta los siguientes comandos reeemplazando `URL_DE_TU_REPO` por la que acabas de copiar:

```bash
git remote add origin URL_DE_TU_REPO
git branch -M main
git push -u origin main
```

Si te pide credenciales, introdúcelas.

## 3. Despliegue en Vercel

1.  Ve a [vercel.com](https://vercel.com) e inicia sesión (puedes usar tu cuenta de GitHub).
2.  En el Dashboard, haz clic en **"Add New..."** -> **"Project"**.
3.  Verás una lista de tus repositorios de GitHub. Importa `calculadora-brokergy`.
4.  **Configuración del Proyecto**:
    *   **Framework Preset**: Vite (se detectará automáticamente o selecciona Vite).
    *   **Root Directory**: Déjalo en `./` (la raíz).
    *   **Build Command**: Vercel detectará el comando del `package.json` raíz (`cd frontend && npm install && npm run build`). Si no, escríbelo.
    *   **Output Directory**: `frontend/dist` (Esto ya está configurado en `vercel.json`, pero si Vercel pregunta, confírmalo).
5.  **Variables de Entorno (Environment Variables)**:
    *   Despliega la sección "Environment Variables".
    *   Añade las siguientes variables (puedes ver sus valores en `implementation/backend/.env`):
        *   `GOOGLE_MAPS_KEY`: `AIzaSyAgyvK64sZQ3zOIJLQZCMfmEHUtHy0MSbs`
        *   `CATASTRO_API_URL`: `http://ovc.catastro.meh.es/ovcservweb/OVCSWLocalLAN.asmx`
        *   *No hace falta poner PORT*.
6.  Haz clic en **"Deploy"**.

## 4. Resultado

Vercel construirá tu proyecto. Verás logs de "Building".
Si todo va bien, en unos minutos te dará una URL (ej: `calculadora-brokergy.vercel.app`).

Esa URL es pública y puedes compartirla en tu reunión. ¡Funciona tanto en PC como en móvil!

## Solución de Problemas Comunes

*   **Error de Build**: Si falla al instalar dependencias, verifica que `package.json` en la raíz está correcto.
*   **API Falla (Error 404 o 500)**: Verifica los logs en Vercel (Pestaña "Logs"). Asegúrate de que las variables de entorno estén bien puestas.

---
**Nota Técnica**:
Hemos creado una estructura especial para este despliegue:
*   `api/index.js`: Conecta Vercel Serverless con tu servidor Express.
*   `vercel.json`: Instruye a Vercel sobre cómo enrutar el tráfico (API vs Frontend).
*   `package.json`: Orquesta la instalación de dependencias.
