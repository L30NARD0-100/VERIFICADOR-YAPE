package pe.yapemonitor.agent.ui

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import pe.yapemonitor.agent.AgentApplication
import pe.yapemonitor.agent.capture.hasListenerAccess
import pe.yapemonitor.agent.data.QueueCounts
import pe.yapemonitor.agent.sync.AgentActionError

data class UiAction(val busy: Boolean = false, val error: String? = null)

class AgentViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = (application as AgentApplication).repository
    private val uiAction = MutableStateFlow(UiAction())
    private val permission = MutableStateFlow(hasListenerAccess(application))
    private val network = application.getSystemService(ConnectivityManager::class.java)

    val action = uiAction.asStateFlow()
    val permissionGranted = permission.asStateFlow()
    val binding = repository.binding
    val connection = repository.connection
    val configured = repository.configured
    val storageFailed = repository.storageFailed
    val counts = repository.counts.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), QueueCounts())
    val history = repository.history.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val connected = callbackFlow {
        fun update() { trySend(hasNetwork()) }
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = update()
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = update()
            override fun onLost(network: Network) = update()
        }
        update()
        network.registerDefaultNetworkCallback(callback)
        awaitClose { network.unregisterNetworkCallback(callback) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), hasNetwork())

    fun onResume() { permission.value = hasListenerAccess(getApplication()) }
    fun refresh() = repository.refresh()
    fun matchesEndpoint() = binding.value?.let(repository::matchesEndpoint) ?: configured

    fun pair(code: String) = runAction { repository.pair(code) }
    fun unlink() = runAction { repository.requestUnlink() }
    fun toggleCapture(enable: Boolean) = runAction {
        onResume()
        if (enable && !permission.value) throw AgentActionError("Habilita el acceso a notificaciones desde los ajustes de Android.")
        repository.setCapture(enable)
    }

    private fun hasNetwork(): Boolean =
        network.getNetworkCapabilities(network.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

    private fun runAction(work: suspend () -> Unit) {
        if (uiAction.value.busy) return
        uiAction.value = UiAction(busy = true)
        viewModelScope.launch {
            try {
                work()
                uiAction.value = UiAction()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: AgentActionError) {
                uiAction.value = UiAction(error = error.message)
            } catch (_: Exception) {
                repository.storageError()
                uiAction.value = UiAction(error = "No se pudo guardar el cambio en el dispositivo.")
            }
        }
    }
}
