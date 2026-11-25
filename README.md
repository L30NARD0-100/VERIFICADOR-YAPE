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

El esqueleto web y la ruta de salud arrancan sin Supabase. Para usar la API de negocio, inicia Supabase local, carga las migraciones, copia `.env.example` a `.env` y configura sus variables de servidor con los valores de tu proyecto. Ajusta `PORT` si lo necesitas. Guarda las credenciales privadas en el entorno del backend.

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

El reinicio reconstruye la base local. La API de negocio requiere la base migrada. Consulta [Base de datos](docs/database.md) para el alcance de las pruebas.

## API de negocio

La etapa 4 implementa autenticación, empresas, sucursales, usuarios, dispositivos, ingesta idempotente, reportes y auditoría. Con una base local de pruebas ya migrada, ejecuta:

```sh
TEST_DATABASE_URL='<conexión a la base local de pruebas>' npm run test:api:integration
```

Usa una base descartable para la suite. Para configurar el primer administrador y consultar los contratos HTTP, revisa [API](docs/api.md) y [Despliegue](docs/deployment.md).

## Documentación

- [Arquitectura y alcance](docs/architecture.md)
- [Base de datos](docs/database.md)
- [API](docs/api.md)
- [Android](docs/android.md)
- [Despliegue](docs/deployment.md)
