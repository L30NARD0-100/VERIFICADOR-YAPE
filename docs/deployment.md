# Despliegue

Configuración prevista para la etapa 8. Ambos servicios usarán la raíz del repositorio y Node.js 24.

| Configuración | Render Static Site | Render Web Service |
| --- | --- | --- |
| Build | `npm ci && npm run build:web` | `npm ci && npm run build:api` |
| Publicación o inicio | `apps/web/dist` | `npm run start:api` |
| Ruta de salud | | `/api/health` |

Configura en el sitio únicamente variables públicas `VITE_*`. Las credenciales de Supabase con privilegios corresponden al entorno del servicio backend. El servicio usa el puerto que proporciona Render. Supabase alojará la información persistente.
