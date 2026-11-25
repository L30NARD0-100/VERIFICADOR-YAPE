# API HTTP

La API usa JSON UTF-8, excepto la exportación CSV. En producción, Render termina HTTPS y entrega el puerto mediante `PORT`. La ruta de salud conserva su ejecución independiente de los servicios de datos.

## Rutas

| Método y ruta | Credencial y alcance |
| --- | --- |
| `GET /api/health` | Público. Devuelve `{"status":"ok"}` cuando el proceso responde. |
| `GET /api/me` | Usuario. Perfil, indicador de administrador global y membresías activas visibles. |
| `GET /api/companies` · `GET /api/companies/:companyId` | Usuario. Empresas accesibles por membresía o rol global. |
| `POST /api/companies` | Administrador global. Campos `name`, `admin_profile_id` y opcionales `legal_name`, `tax_id`. El administrador inicial debe tener un perfil activo. |
| `PATCH /api/companies/:companyId` | Administrador empresarial. Modifica `name`, `legal_name` y `tax_id`. |
| `GET /api/companies/:companyId/branches` | Usuario. Sucursales visibles según RLS. |
| `POST /api/companies/:companyId/branches` · `PATCH /api/companies/:companyId/branches/:id` | Administrador. Campos `name`, `address` y `status` en edición. El gerente puede editar nombre y dirección de las sucursales que tiene asignadas. |
| `GET /api/companies/:companyId/users` | Administrador empresarial. Lista membresías, perfiles asociados y sucursales. |
| `POST /api/companies/:companyId/users` | Administrador empresarial. Campos `email`, `role`, `branch_ids` y `full_name` opcional para una identidad nueva. Envía invitación si el correo aún no tiene perfil. |
| `PATCH /api/companies/:companyId/users/:id` | Administrador empresarial. `:id` es el ID de la membresía. Acepta `role`, `status` y `branch_ids`. Conserva al menos un administrador activo. |
| `GET /api/companies/:companyId/devices` · `GET /api/companies/:companyId/devices/:id` | Usuario. Dispositivos visibles según RLS. |
| `POST /api/companies/:companyId/devices` | Administrador o gerente dentro de su alcance. Campos `name`, `branch_id` y `device_identifier`. |
| `POST /api/companies/:companyId/devices/:id/pairing` · `POST /api/companies/:companyId/devices/:id/revoke` | Administrador o gerente dentro de su alcance. Emite un código temporal o revoca la credencial actual. |
| `POST /api/devices/register` | Código de vinculación. Campos `pairing_code` y `app_version` opcional. Devuelve `device_id`, `company_id`, `branch_id` y `device_token` una sola vez. |
| `POST /api/devices/heartbeat` · `POST /api/devices/unlink` | Dispositivo. Heartbeat acepta `{}` o `app_version`. La desvinculación devuelve `204`. |
| `POST /api/payments/notifications` | Dispositivo. Registra una notificación de forma idempotente. |
| `GET /api/companies/:companyId/payments` · `GET /api/companies/:companyId/payments/:id` · `GET /api/companies/:companyId/payment-events` | Usuario. Historial, detalle y eventos en su empresa y sucursales autorizadas. |
| `GET /api/companies/:companyId/reports/daily` · `GET /api/companies/:companyId/reports/summary` | Usuario. Agregados sujetos a RLS. |
| `GET /api/companies/:companyId/reports/export.csv` | Administrador o gerente. Exporta hasta 10 000 filas del ámbito autorizado. |
| `GET /api/companies/:companyId/audit-logs` | Administrador empresarial. Actividad auditable de su empresa. |

Las rutas humanas validan `Authorization: Bearer <access_token>` con Supabase Auth. Las del agente usan `Authorization: Bearer <device_token>`. Las lecturas de negocio aplican RLS con el usuario autenticado. Las escrituras usan transacciones con autorización y auditoría. Para identidades existentes, el alta empresarial asigna una membresía conservando el perfil global. Si Auth creó la identidad y la transacción empresarial falló después, repite el alta para asociar la identidad existente.

## Ingesta de notificaciones

```json
{
  "event_id": "<UUID persistido por el dispositivo>",
  "device_id": "<UUID devuelto en la vinculación>",
  "event_type": "payment_notice",
  "sender_name": null,
  "amount": "15.50",
  "currency": "PEN",
  "received_at": "<fecha y hora de captura ISO 8601 con zona>",
  "source_notification_id": null,
  "metadata": {}
}
```

`sender_name`, `amount`, `currency` y `source_notification_id` son opcionales y admiten `null`. El único campo opcional admitido en `metadata` es `source_application`. El importe se envía como cadena decimal. La empresa y la sucursal se obtienen de la vinculación. El procesamiento registra un evento `needs_review` cuando faltan el importe o la moneda. Con ambos campos, crea un pago `pending_verification`.

El primer envío devuelve `201`. Un reintento con el mismo dispositivo, `event_id` y contenido normalizado devuelve `200` con el mismo identificador. El mismo `event_id` con otro contenido devuelve `409`. La respuesta tiene la forma `{ duplicate, event: { id, payment_id, processing_status } }`. Un `payment_id` nulo identifica un evento sin pago asociado. Los importes detectados y los verificados oficialmente se mantienen separados.

## Listados, reportes y errores

- Los listados devuelven `{ data, next_cursor }`. Usa `limit` de 1 a 100 (30 por defecto) y devuelve `cursor` con los mismos filtros y orden.
- Los pagos aceptan `branch_id`, `device_id`, `from`, `to`, `status`, búsqueda literal de remitente con `q` y orden temporal `asc` o `desc`. Los eventos aceptan los mismos filtros de alcance y fecha, y un `status` de procesamiento.
- El reporte diario admite `date`. El resumen acepta `from` y `to`; los dos reportes usan hoy en Lima por defecto. Las fechas tienen formato `YYYY-MM-DD` y son inclusivas en `America/Lima`. Los rangos cerrados abarcan como máximo 366 fechas. La exportación requiere ambas fechas y admite los filtros de pagos.
- Los reportes devuelven eventos por estado, totales por moneda y el número de dispositivos activos y conectados en el alcance consultado. Los dispositivos conectados son los activos con actividad en los últimos cinco minutos. El reporte diario también incluye el acumulado de notificaciones de todo el historial autorizado. El dinero y los conteos agregados se representan como cadenas. El CSV neutraliza celdas que podrían ejecutarse como fórmulas.
- La API devuelve `{ error: { code, message } }`, con `fields` en errores de esquema, y un `X-Request-ID` para correlación. Los cuerpos JSON se limitan a 16 KiB.
- El código de vinculación dura cinco minutos y se consume una sola vez. Los límites por minuto se comparten entre instancias en PostgreSQL. El registro tiene un límite global de 120; la ingesta, 120 por dispositivo; el heartbeat y la desvinculación, 30 por dispositivo y operación; el alta de usuarios, 20 por perfil. Un `429` incluye `Retry-After`.

## Ejecución y pruebas

Configura las variables de la API con los valores de un proyecto Supabase local y migrado. Para verificar la ruta de salud ejecuta `npm run dev:api` y consulta `http://localhost:3000/api/health`. Sin variables de servicios, el modo de desarrollo sirve la ruta de salud.

```sh
npm run build:api
npm run test:api
TEST_DATABASE_URL='<conexión a la base local de pruebas>' npm run test:api:integration
```

La integración crea y elimina sus datos en una base Supabase local migrada y usa un adaptador de Auth de prueba. Requiere una conexión de administración de esa base de pruebas. Para probar el servicio con Supabase Auth real, crea o invita una identidad local, inicia sesión y consulta `GET /api/me` con el token emitido.
