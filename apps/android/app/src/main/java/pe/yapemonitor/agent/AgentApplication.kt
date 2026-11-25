package pe.yapemonitor.agent

import android.app.Application
import androidx.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import pe.yapemonitor.agent.data.EventDatabase
import pe.yapemonitor.agent.data.KeystoreBindingStore
import pe.yapemonitor.agent.network.HttpsAgentApi
import pe.yapemonitor.agent.sync.AgentRepository
import pe.yapemonitor.agent.sync.SyncWork

class AgentApplication : Application() {
    val captureScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val repository by lazy {
        val db = Room.databaseBuilder(this, EventDatabase::class.java, "yape-monitor-events.db").build()
        val api = BuildConfig.API_BASE_URL.takeIf { it.isNotBlank() }?.let { HttpsAgentApi(it, BuildConfig.VERSION_NAME) }
        AgentRepository(KeystoreBindingStore(this), db.queue(), api, schedule = { SyncWork.enqueue(this) })
    }

    override fun onCreate() {
        super.onCreate()
        SyncWork.maintain(this)
    }
}
