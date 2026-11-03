# Entorno de pruebas en tu PC

Sirve para probar todo con datos reales **sin tocar producción**: una copia de las bases en tu MySQL local.

## Una sola vez
1. Ten MySQL 8 corriendo en tu PC (servicio `MySQL80`) y la clave de `root`.
2. Copia `.env.local.example` como `.env.local` y escribe tu clave en `DB_PASSWORD` y `LOCAL_DB_PASSWORD`.
3. Copia las bases (solo LEE el servidor real; escribe únicamente en `localhost`):
   ```
   node scripts/clonar_a_local.js
   ```
   Crea `azkell_master` y `azkell_tenant_marsisa` locales y dos usuarios de prueba (la clave aparece al final).
   - Otra empresa: `node scripts/clonar_a_local.js azkell_tenant_trahesa`
   - Volver a copiar: agrega `--reemplazar`. Con bitácoras y fotos pesadas: `--completo`.

## Cada vez que pruebes
En dos terminales:
```
npm start                       # servidor en http://localhost:3000
$env:DEV_TENANT='marsisa'; npm run dev:app    # pantalla nueva en http://localhost:5173/app
```
Entra a `http://localhost:5173/app` con `admin.local@prueba.test` (administrador) o `lectura.local@prueba.test` (solo lectura).
También sirven tus usuarios de siempre, con su clave de siempre (la copia los incluye).

## Qué queda apagado en local
WhatsApp, SUNAT, MarsisaSoft, webhooks, notificaciones y avisos push: sus datos no se copian o sus llaves van vacías en `.env.local`.
Las fotos y archivos siguen usando el almacenamiento S3 real.

## Antes de subir a producción
Prueba aquí, y solo entonces `git push origin main`. La base local es una copia: se puede borrar y volver a crear sin consecuencias.
