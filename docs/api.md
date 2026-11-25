# API HTTP

`GET /api/health` devuelve HTTP 200 y el cuerpo `{"status":"ok"}`. La ruta verifica la disponibilidad del proceso y se ejecuta sin servicios externos. Las rutas desconocidas devuelven 404.

El servidor usa `PORT` o 3000 por defecto. Zod valida el puerto al arrancar. Ejecuta `npm run dev:api` en desarrollo y `npm run test:api` para probar ambos códigos de respuesta.

La autenticación, la autorización, la vinculación de dispositivos y la ingesta se incorporarán en la etapa 4.
