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
