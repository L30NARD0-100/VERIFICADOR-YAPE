# Agente Android

El agente Android utiliza Kotlin con Compose, NotificationListenerService, Room, WorkManager y OkHttp. El aviso recibido queda pendiente de verificación del pago.

## Compilar y ejecutar

Abre `apps/android` en Android Studio o usa el Gradle Wrapper con JDK 17, SDK 35 y Build Tools 35.0.0. La aplicación se puede instalar desde Android 8.0 (API 26).

```sh
cd apps/android
YAPE_MONITOR_API_BASE_URL='<URL HTTPS de la API>' ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Configura la URL base de Hono sin el sufijo `/api`. También se admite la propiedad de Gradle `yapeMonitorApiBaseUrl`. Una compilación sin URL permite abrir la pantalla y ejecutar las pruebas, con la vinculación deshabilitada. El agente exige HTTPS y un certificado de confianza del sistema, incluidas las pruebas que se ejecuten en un teléfono.

## Vinculación y captura

1. En el panel web, registra el dispositivo en su sucursal. Desde **Dispositivos**, elige **Vincular** y genera el código temporal.
2. Introduce el código en el agente. La credencial del dispositivo se guarda con AES-GCM mediante una clave de Android Keystore. El vínculo pertenece a una URL de backend y a una identidad local concreta.
3. Pulsa **Abrir ajustes de Android**, autoriza el acceso a notificaciones para Yape Monitor y vuelve a la app. Pulsa **Activar captura**. Puedes pausarla desde el agente y revocar el permiso desde Ajustes.
4. Un aviso reconocido aparece en el historial local como pendiente de envío. Cuando el backend responde, se actualiza su estado. Una notificación incompleta puede quedar marcada como **Requiere revisión**.

El listener filtra por el identificador de paquete oficial `com.bcp.innovacxion.yapeapp` antes de leer el texto. Solo procesa avisos nuevos, excluye resúmenes agrupados y aplica reglas conservadoras para distinguir avisos entrantes de mensajes generales o salientes. Consulta el identificador de paquete en la [ficha de Yape en Google Play](https://play.google.com/store/apps/details?id=com.bcp.innovacxion.yapeapp).

El parser extrae únicamente los campos reconocidos. El texto y el título originales se usan en memoria. La cola guarda los campos normalizados, la hora registrada por Android, la aplicación y una huella del identificador de origen. Si faltan el remitente, el importe o la moneda, se representan como nulos. Los casos de prueba de formato son sintéticos. Los formatos reales deben validarse con notificaciones autorizadas del comercio.

## Envío, reintentos y desvinculación

- Room guarda el aviso con un UUID antes de programar el envío. La cola separa las vinculaciones y descarta callbacks repetidos de la misma instancia. Los reintentos comparten el UUID y el cuerpo persistido. El backend aplica su propia restricción de unicidad.
- WorkManager condiciona el trabajo a la disponibilidad de red y reintenta con espera progresiva ante fallas transitorias. La app conserva los datos pendientes si se reinicia o queda offline después de registrarlos en Room. Cuando se agota un lote, se continúa en una ejecución posterior.
- El agente consulta la API al abrirse, al pedir sincronización y periódicamente. En primer plano solicita una comprobación aproximadamente cada dos minutos. En segundo plano Android programa el mantenimiento de WorkManager cada quince minutos como mínimo y puede diferir la ejecución. El panel web considera al equipo conectado si reportó en los últimos cinco minutos.
- Un rechazo de la credencial pausa captura y envío. La desvinculación confirmada por el usuario también los pausa de inmediato y queda pendiente si no hay red. Al confirmarse la revocación o recibir un `401` al desvincular, se borra la vinculación y su historial local. Las solicitudes que ya salieron hacia el backend pueden terminar antes de que se confirme la revocación.
- Si una interrupción impide recibir o guardar la credencial tras consumir el código, revisa el estado del dispositivo en el panel. Si figura activo, revócalo y emite un código nuevo. Si cambia la URL del backend, revoca la vinculación anterior desde el panel correspondiente antes de volver a configurar el equipo.

## Verificación

```sh
cd apps/android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

La suite utiliza notificaciones sintéticas, Robolectric con Room y un servidor HTTPS de pruebas. Valida el permiso del listener, las reglas de extracción, el aislamiento y la persistencia de la cola, la deduplicación, la revocación y los reintentos.

En un teléfono autorizado, vincula el agente, habilita el permiso y la captura y observa un aviso real. Para comprobar la cola offline, mantén el teléfono conectado a Internet para que pueda recibir el aviso de Yape y bloquea temporalmente solo el acceso a la API de pruebas. Verifica que quede pendiente, restablece el acceso y comprueba que aparezca una sola vez en el panel. El flujo con una notificación real se valida en la etapa 7.

Para preparar una compilación firmada, usa **Generate Signed Bundle / APK** en Android Studio con la URL HTTPS de producción y una clave de firma administrada fuera del repositorio. La distribución de producción corresponde a la etapa 8.
