<!-- conocimiento · área: general · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## ⚠️ Regla de oro de desarrollo

**SIEMPRE trabajamos contra `localhost` primero.** Solo cuando el cambio está validado en local se hace `git push` y luego deploy al VPS. Prohibido pushear "a ver si funciona en producción". El ciclo correcto:

1. Cambio en local.
2. Probar en `localhost` (frontend `npm run dev` + backend `npm start`).
3. Si OK → `git push origin main`.
4. SSH al VPS (`ssh root@187.77.93.213`) → `cd /opt/brokergy && bash scripts/deploy.sh`.
5. Verificar en `https://app.brokergy.es`.

Si el usuario dice "no veo el cambio", lo primero a comprobar es: **¿hemos hecho el deploy al VPS?** Vercel/Railway NO aplican aquí.

**Un deploy cada vez (2026-11-22).** Dos sesiones desplegaron a la vez a las 18:11 y se pisaron al recrear los
contenedores («The container name "/brokergy-rite" is already in use»): la app se quedó PARADA, con todos los
contenedores en «Created», hasta un `docker compose up -d` a mano. `deploy.sh` toma ahora un candado
(`flock` sobre `/var/lock/brokergy-deploy.lock`): el segundo espera a que acabe el primero (máximo 20 min) y después
hace su propio `git pull`, así que sale lo último de los dos. Si un deploy acaba con contenedores en «Created», lo
primero es `docker compose up -d` en `/opt/brokergy`, y después comprobar «Cliente listo» en los logs del backend.
