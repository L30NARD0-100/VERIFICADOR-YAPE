# Despliegue

Configuración prevista para la etapa 8. Ambos servicios usarán la raíz del repositorio y Node.js 24.

| Configuración | Render Static Site | Render Web Service |
| --- | --- | --- |
| Build | `npm ci && npm run build:web` | `npm ci && npm run build:api` |
| Publicación o inicio | `apps/web/dist` | `npm run start:api` |
| Ruta de salud | | `/api/health` |

Configura en el sitio únicamente variables públicas `VITE_*`. Las credenciales de Supabase con privilegios corresponden al entorno del servicio backend. El servicio usa el puerto que proporciona Render. Supabase alojará la información persistente.

## Base de datos

Usa un proyecto Supabase dedicado. Las migraciones versionadas esperan PostgreSQL 17, los roles y el esquema de Auth de Supabase, y la publicación estándar `supabase_realtime`. La migración de Realtime configura inserciones y actualizaciones para toda esa publicación. Antes de migrar el proyecto alojado en la etapa 8, valida las migraciones localmente y confirma que las opciones de Auth alojadas reflejen la política de invitaciones, la confirmación de correo y las URLs reales del frontend. `supabase/config.toml` contiene URLs de desarrollo.

La API de la etapa 4 requiere `DATABASE_URL` además de la URL y las claves de Supabase. En Render configura una conexión PostgreSQL con TLS y validación de certificado. La conexión del backend necesita acceso al esquema privado, a las tablas de negocio y la capacidad de asumir el rol `authenticated`. En desarrollo, la conexión de administración provista por Supabase CLI cumple estos requisitos. Mantén `DATABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el servidor. En producción, `FRONTEND_URL` y `SUPABASE_URL` requieren HTTPS.

Para el primer alta empresarial local, crea las identidades del administrador global y del administrador inicial en Supabase Auth. Registra el UUID del administrador global en `app_private.platform_admins` desde una conexión administrativa y usa su sesión para llamar `POST /api/companies` con el UUID del administrador inicial. Define la configuración de correo del proyecto antes de enviar invitaciones.

## Rutas y recuperación del panel web

En Render Static Site, configura una regla **Rewrite** de `/*` a `/index.html` para que las rutas internas abran directamente. Usa la URL pública de Hono, sin `/api`, en `VITE_API_BASE_URL`; el origen público de la web debe coincidir con `FRONTEND_URL` en la API. En Supabase Auth, configura la URL pública de la web como **Site URL** y autoriza la misma URL con la ruta `/restablecer` para los enlaces de recuperación. El proyecto local ya autoriza `http://localhost:5173/restablecer`.
