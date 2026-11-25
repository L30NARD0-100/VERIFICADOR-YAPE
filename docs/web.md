# Panel web

## Desarrollo local

1. Desde la raíz ejecuta `npm ci` e inicia Supabase local. Aplica las migraciones en una base descartable con `supabase db reset`.
2. Configura `.env` a partir de `.env.example`. En `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` usa los valores públicos del mismo proyecto que utiliza la API. Configura `VITE_API_BASE_URL` con la URL base de Hono, sin el sufijo `/api`. En desarrollo, el origen predeterminado es `http://localhost:5173`. Configura `FRONTEND_URL` con ese origen para CORS.
3. Ejecuta `npm run dev:api` y `npm run dev:web` en terminales separadas. Abre la URL de Vite.
4. Inicia sesión con una identidad de Supabase Auth. El panel obtiene el rol y las empresas de `GET /api/me`. Para preparar al primer administrador y crear una empresa, consulta [Despliegue](deployment.md).

Los administradores y gerentes entran al resumen. Los cajeros entran al historial. El administrador global entra al listado de empresas. Las escrituras y exportaciones se autorizan también en el servidor. La recuperación de contraseña usa `/restablecer`, y los enlaces de invitación de Supabase permiten que la cuenta nueva establezca su contraseña.

## Vistas

- **Resumen** muestra por separado los importes detectados y oficialmente verificados, las notificaciones del día y el total histórico, y los dispositivos conectados. El contador considera conectado a un dispositivo activo que reportó en los últimos cinco minutos.
- **Pagos e historial** muestra filtros, orden temporal, paginación por cursor y detalle. La pestaña de notificaciones incluye eventos que requieren revisión aunque no tengan un pago asociado.
- **Reportes** ofrece períodos diarios, de siete y de treinta días, y fechas personalizadas. El cálculo usa hora de Lima, separa totales por moneda y permite exportar CSV a administradores y gerentes dentro de su ámbito.
- **Empresas, sucursales, usuarios, dispositivos y actividad** muestran las acciones y datos correspondientes al rol. La vinculación genera un código temporal para el agente. La revocación invalida su credencial en el servidor.

## Sincronización

La web se suscribe a `payments` y `payment_events` de la empresa activa con la sesión de Supabase. Los cambios invalidan las consultas del historial, el resumen y los reportes. El panel vuelve a consultar la API al conectarse, al regresar en línea o al recuperar foco. Cuando el canal está degradado, consulta la API cada 15 segundos mientras el panel está visible y el navegador tiene red. También hace una consulta periódica con el canal activo. Las consultas se separan por sesión y empresa, y la API y PostgreSQL conservan la autorización efectiva.

## Pruebas

```sh
npm run test:web
npm run build:web
```

La suite de componentes simula Auth, la API y Realtime para comprobar inicio y cierre de sesión, recuperación, permisos, administración, filtros, exportación y recuperación de datos al reconectar. Con los servicios locales activos, se puede verificar el circuito completo creando una empresa y un dispositivo, obteniendo una credencial con el contrato de [API](api.md) y enviando una notificación de prueba. El evento debe aparecer en el panel y el pago debe quedar pendiente de verificación.
