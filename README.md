# Yape Monitor

Monorepo para monitorear avisos de pagos detectados en dispositivos Android autorizados. La verificación oficial de un pago requiere evidencia de una fuente autorizada.

## Estado del proyecto

El repositorio incluye un frontend React/Vite/Tailwind, una API Hono con una ruta de salud y un proyecto Kotlin/Compose independiente. Node.js gestiona los paquetes JavaScript con npm workspaces. Android usa su Gradle Wrapper.

## Requisitos

- Node.js 24 y npm.
- JDK 17 o compatible con el Android Gradle Plugin configurado.
- Android Studio o Android SDK con plataforma 35 y Build Tools 35.0.0.

## Ejecución local

Desde la raíz, instala las dependencias con `npm ci`. Para iniciar la API y la web en desarrollo, ejecuta en terminales separadas:

```sh
npm run dev:api
npm run dev:web
```

Abre la dirección que imprime Vite. Prueba el servidor con `curl -fsS http://localhost:3000/api/health`; la respuesta esperada es `{"status":"ok"}`.

Las bases web y API arrancan sin Supabase. Para personalizar el puerto, copia `.env.example` a `.env` y ajusta `PORT`. Guarda las credenciales futuras únicamente en los entornos correspondientes.

## Compilación y pruebas

```sh
npm ci
npm test
npm run build:web
npm run build:api
npm run start:api
```

La API usa `PORT` y escucha en `0.0.0.0`. Para Android:

```sh
cd apps/android
./gradlew assembleDebug lintDebug testDebugUnitTest
```

En Windows usa `gradlew.bat`. Configura el SDK mediante Android Studio o `ANDROID_HOME`. El APK de depuración se genera en `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Abre `apps/android` en Android Studio para ejecutar la pantalla inicial en un dispositivo o emulador API 26 o superior.

## Base de datos local

La etapa 3 incorpora las migraciones, las políticas RLS, el enlace de perfiles con Auth y la publicación para Realtime. Requiere Supabase CLI y Docker:

```sh
supabase start
supabase db reset
supabase test db
```

El reinicio reconstruye la base local. La web y la API de configuración inicial siguen arrancando sin ella. Consulta [Base de datos](docs/database.md) para el alcance de las pruebas.

## Documentación

- [Arquitectura y alcance](docs/architecture.md)
- [Base de datos](docs/database.md)
- [API](docs/api.md)
- [Android](docs/android.md)
- [Despliegue](docs/deployment.md)
