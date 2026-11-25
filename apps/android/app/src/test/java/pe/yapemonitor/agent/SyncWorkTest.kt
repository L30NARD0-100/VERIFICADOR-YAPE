package pe.yapemonitor.agent

import android.app.Application
import androidx.work.Configuration
import androidx.work.NetworkType
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import pe.yapemonitor.agent.sync.SyncWork

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class SyncWorkTest {
    @Test
    fun deliveryAndMaintenanceStayEnqueuedUntilNetworkIsAvailable() {
        val context = RuntimeEnvironment.getApplication()
        val configuration = Configuration.Builder().setExecutor(SynchronousExecutor()).build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, configuration)
        SyncWork.enqueue(context)
        SyncWork.maintain(context)

        val manager = WorkManager.getInstance(context)
        val delivery = manager.getWorkInfosForUniqueWork(SyncWork.DELIVERY).get(5, TimeUnit.SECONDS).single()
        val maintenance = manager.getWorkInfosForUniqueWork(SyncWork.MAINTENANCE).get(5, TimeUnit.SECONDS).single()
        for (work in listOf(delivery, maintenance)) {
            assertEquals(WorkInfo.State.ENQUEUED, work.state)
            assertEquals(NetworkType.CONNECTED, work.constraints.requiredNetworkType)
        }
        assertEquals(15 * 60_000L, maintenance.periodicityInfo?.repeatIntervalMillis)
    }
}
