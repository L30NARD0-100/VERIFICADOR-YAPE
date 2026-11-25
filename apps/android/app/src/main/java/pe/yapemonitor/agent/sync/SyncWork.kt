package pe.yapemonitor.agent.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import pe.yapemonitor.agent.AgentApplication

object SyncWork {
    const val DELIVERY = "agent-delivery"
    const val MAINTENANCE = "agent-maintenance"
    private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun deliveryRequest() = OneTimeWorkRequestBuilder<AgentSyncWorker>()
        .setConstraints(network)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
        .build()

    fun maintenanceRequest() = PeriodicWorkRequestBuilder<AgentSyncWorker>(15, TimeUnit.MINUTES)
        .setConstraints(network)
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
        .build()

    fun enqueue(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(DELIVERY, ExistingWorkPolicy.APPEND_OR_REPLACE, deliveryRequest())
    }

    fun maintain(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(MAINTENANCE, ExistingPeriodicWorkPolicy.KEEP, maintenanceRequest())
    }
}

class AgentSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val repository = (applicationContext as AgentApplication).repository
        return try {
            when (repository.synchronize()) {
                WorkOutcome.COMPLETE -> Result.success()
                WorkOutcome.RETRY -> Result.retry()
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            repository.storageError()
            Result.retry()
        }
    }
}
