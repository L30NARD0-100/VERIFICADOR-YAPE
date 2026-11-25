# Base de datos

La etapa 3 define las migraciones de PostgreSQL 17 para un proyecto Supabase dedicado a Yape Monitor.

## Modelo

| Tablas | Responsabilidad |
| --- | --- |
| `companies`, `profiles`, `company_members` | Empresas, perfiles vinculados a Supabase Auth y roles por empresa. |
| `branches`, `member_branches`, `devices` | Sucursales, asignaciones de usuarios y dispositivos registrados. |
| `payment_methods`, `payments`, `payment_events` | Catálogo de métodos, pagos detectados y estados de procesamiento de eventos. Yape se instala mediante migración. |
| `audit_logs` | Auditoría empresarial o global. La cuenta del backend puede insertar y consultar registros. |
| `app_private.platform_admins`, `device_credentials`, `device_pairings`, `payment_event_payloads` | Administración global, hashes de tokens y códigos, datos diagnósticos y huella de idempotencia. Estas tablas quedan fuera de la API de datos y de Realtime. |

Las claves foráneas compuestas exigen que las referencias de negocio pertenezcan a la misma empresa. Cada evento y pago conserva la sucursal de origen aunque el dispositivo cambie de sucursal. El evento puede existir sin un pago asociado. Un pago asociado debe tener la misma empresa, sucursal y dispositivo.

`payment_events.captured_at` representa la captura del dispositivo y `payment_events.received_at` la recepción del backend. `payments.received_at` representa la captura para el historial de pagos. Los índices permiten paginar por fecha e ID en consultas por empresa, sucursal o dispositivo.

La unicidad de `(device_id, event_id)` bloquea reintentos duplicados. La API de la etapa 4 deberá comparar la huella guardada y persistir el resultado dentro de una transacción. Los importes son decimales positivos de hasta dos posiciones y los campos ausentes pueden ser nulos. Un pago empieza pendiente de verificación. PostgreSQL exige fuente, referencia y fecha para el estado verificado. La comprobación de la evidencia corresponde a una futura integración oficial autorizada.

## Auth y acceso

El alta de una identidad de Supabase Auth crea el perfil. Los cambios de correo se sincronizan y la migración incorpora identidades existentes. El alta pública está deshabilitada en la configuración local. Las invitaciones se gestionarán desde el backend.

| Rol | Lecturas permitidas |
| --- | --- |
| Anónimo | Sin acceso a tablas de negocio. |
| Cajero y gerente | Su perfil y membresías activas, y los datos operativos de sus sucursales activas asignadas. |
| Administrador de empresa | Operaciones, sucursales, membresías y auditoría de su empresa activa. |
| Administrador global | Listado de empresas y auditoría global. El acceso a pagos requiere una membresía empresarial autorizada. |

Las sesiones autenticadas tienen acceso directo de lectura sujeto a RLS. La consulta de perfiles ajenos para administración y las escrituras pasan por el backend autorizado. Las tablas privadas requieren operaciones acotadas y privilegiadas del servidor en la etapa 4. La API deberá verificar ámbito, identidad y permisos antes de cada operación privilegiada.

## Realtime

La publicación `supabase_realtime` incluye `payments` y `payment_events` y emite solo inserciones y actualizaciones. La configuración de operaciones se aplica a toda esa publicación. Las suscripciones de usuarios conservarán las políticas de lectura por empresa y sucursal. La recuperación tras desconexiones se implementará en el panel mediante consultas a datos persistidos.

## Verificación local

Desde la raíz, con Supabase CLI y Docker en ejecución:

```sh
supabase start
supabase db reset
supabase test db
```

`supabase db reset` reconstruye la base local. La suite pgTAP crea y revierte sus datos de prueba en una transacción. Simula sesiones con el rol PostgreSQL y los claims de Auth y valida permisos por matriz de roles, revocación, restricciones, índices, unicidad, auditoría y publicación.

## Soporte para la API

La etapa 4 agrega un índice de búsqueda por correo para asociar identidades de Auth y `app_private.api_rate_limits` para contar solicitudes por ventana de un minuto. La tabla de límites aplica RLS y permanece fuera de la API de datos y Realtime.

Hono consulta Auth con el cliente de Supabase y abre transacciones directas en PostgreSQL para las operaciones que requieren atomicidad. Las lecturas de usuarios se ejecutan con `SET LOCAL ROLE authenticated` y el identificador de la sesión validada. La vinculación, la revocación y la ingesta coordinan sus escrituras con bloqueos de filas. La transacción de ingesta guarda el evento, su huella, el pago pendiente cuando corresponde y la auditoría.
