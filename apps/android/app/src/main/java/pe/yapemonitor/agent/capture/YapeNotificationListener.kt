package pe.yapemonitor.agent.capture

import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import pe.yapemonitor.agent.AgentApplication

fun hasListenerAccess(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
        return context.packageName in NotificationManagerCompat.getEnabledListenerPackages(context)
    }
    val component = ComponentName(context, YapeNotificationListener::class.java)
    return context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
}

class YapeNotificationListener : NotificationListenerService() {
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        if (hasListenerAccess(this)) requestRebind(ComponentName(this, YapeNotificationListener::class.java))
    }

    override fun onNotificationPosted(notification: StatusBarNotification) {
        if (notification.packageName != YAPE_PACKAGE || notification.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (!hasListenerAccess(this)) return
        val app = application as AgentApplication
        val repository = app.repository
        if (!repository.canCapture(notification.postTime)) return

        val snapshot = runCatching {
            val extras = notification.notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.take(240)?.toString()
            val body = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.takeIf { it.isNotBlank() }
                ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.take(1_000)?.toString()
            NotificationSnapshot(notification.packageName, notification.key, notification.postTime, title, body)
        }.getOrNull() ?: return

        app.captureScope.launch {
            try {
                // El permiso y el consentimiento se comprueban antes de tocar la cola.
                if (hasListenerAccess(this@YapeNotificationListener)) repository.capture(snapshot)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                repository.storageError()
            }
        }
    }
}
