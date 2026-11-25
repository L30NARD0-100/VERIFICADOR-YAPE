package pe.yapemonitor.agent

import android.app.Application
import android.app.NotificationManager
import android.content.ComponentName
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import pe.yapemonitor.agent.capture.YapeNotificationListener
import pe.yapemonitor.agent.capture.hasListenerAccess

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class ListenerAccessTest {
    @Test
    fun onlyTheAndroidGrantEnablesListenerAndTheServiceRequiresSystemBinding() {
        val context = RuntimeEnvironment.getApplication()
        val listener = ComponentName(context, YapeNotificationListener::class.java)
        val manager = shadowOf(context.getSystemService(NotificationManager::class.java))
        val service = context.packageManager.getServiceInfo(listener, 0)
        assertEquals("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE", service.permission)
        assertFalse(service.exported)
        assertFalse(hasListenerAccess(context))
        manager.setNotificationListenerAccessGranted(listener, true)
        assertTrue(hasListenerAccess(context))
        manager.setNotificationListenerAccessGranted(listener, false)
        assertFalse(hasListenerAccess(context))
    }
}
