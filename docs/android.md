# Android

Abre `apps/android` en Android Studio y sincroniza el proyecto con el Gradle Wrapper incluido. Usa un JDK compatible, el SDK 35 y Build Tools 35.0.0.

```sh
cd apps/android
./gradlew assembleDebug lintDebug testDebugUnitTest
```

En esta etapa el APK abre una pantalla inicial en Compose. `testDebugUnitTest` queda preparado para la suite que acompañará el agente. La etapa 6 incorporará el permiso manual, NotificationListenerService, el parser, Room y WorkManager.
