package pe.yapemonitor.agent.sync

import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import pe.yapemonitor.agent.capture.NotificationParser
import pe.yapemonitor.agent.capture.NotificationSnapshot
import pe.yapemonitor.agent.capture.YAPE_PACKAGE
import pe.yapemonitor.agent.data.Binding
import pe.yapemonitor.agent.data.BindingStore
import pe.yapemonitor.agent.data.Connection
import pe.yapemonitor.agent.data.EventQueue
import pe.yapemonitor.agent.data.FAILED
import pe.yapemonitor.agent.data.LinkMode
import pe.yapemonitor.agent.data.Metadata
import pe.yapemonitor.agent.data.NoticeRequest
import pe.yapemonitor.agent.data.QueueCounts
import pe.yapemonitor.agent.data.QueuedEvent
import pe.yapemonitor.agent.data.SENT
import pe.yapemonitor.agent.network.AgentApi
import pe.yapemonitor.agent.network.ApiResult
import pe.yapemonitor.agent.network.payloadJson

class AgentActionError(message: String) : Exception(message)

enum class WorkOutcome { COMPLETE, RETRY }

@OptIn(ExperimentalCoroutinesApi::class)
class AgentRepository(
    private val store: BindingStore,
    private val queue: EventQueue,
    private val api: AgentApi?,
    private val schedule: () -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val boot = runCatching { store.load() }
    private val current = MutableStateFlow(boot.getOrNull())
    private val status = MutableStateFlow(
        when {
            boot.isFailure -> Connection.ERROR
            boot.getOrNull()?.mode == LinkMode.REJECTED -> Connection.REJECTED
            else -> Connection.IDLE
        },
    )
    private val stateLock = Mutex()
    private val networkLock = Mutex()

    val binding = current.asStateFlow()
    val connection = status.asStateFlow()
    val storageFailed = boot.isFailure
    val configured = api != null
    private val scope = current.map { it?.localId }.distinctUntilChanged()
    val history = scope.flatMapLatest { id -> id?.let(queue::history) ?: flowOf(emptyList()) }
    val counts = scope.flatMapLatest { id -> id?.let(queue::counts) ?: flowOf(QueueCounts()) }

    fun matchesEndpoint(link: Binding) = link.apiEndpoint == api?.endpoint

    fun canCapture(postedAt: Long): Boolean {
        val link = current.value ?: return false
        val captureFrom = link.captureFrom ?: return false
        return link.mode == LinkMode.ACTIVE && matchesEndpoint(link) && postedAt >= maxOf(captureFrom, link.linkedAt)
    }

    fun refresh() {
        if (configured && current.value != null) schedule()
    }

    suspend fun pair(code: String) = withContext(Dispatchers.IO + NonCancellable) {
        val client = api ?: throw AgentActionError("Configura la URL HTTPS del backend.")
        val normalized = code.trim()
        if (!normalized.matches(Regex("[A-Za-z0-9_-]{22}"))) throw AgentActionError("Ingresa el código de 22 caracteres.")
        if (storageFailed) throw AgentActionError("No se pudo abrir el almacenamiento de credenciales.")
        networkLock.withLock {
            if (current.value != null) throw AgentActionError("Desvincula el dispositivo antes de usar otro código.")
            status.value = Connection.CONNECTING
            when (val result = client.pair(normalized)) {
                is ApiResult.Ok -> {
                    val data = result.value
                    if (!validId(data.deviceId) || !validId(data.companyId) ||
                        !data.token.matches(Regex(Regex.escape(data.deviceId) + "\\.[A-Za-z0-9_-]{43}"))
                    ) {
                        status.value = Connection.ERROR
                        throw AgentActionError("El backend devolvió una credencial inesperada. Revoca el dispositivo si figura activo.")
                    }
                    val time = now()
                    stateLock.withLock {
                        persist(
                            Binding(
                                localId = UUID.randomUUID().toString(),
                                deviceId = data.deviceId,
                                companyId = data.companyId,
                                deviceName = data.deviceName,
                                companyName = data.companyName,
                                token = data.token,
                                linkedAt = time,
                                apiEndpoint = client.endpoint,
                                lastSyncAt = time,
                            ),
                        )
                    }
                    status.value = Connection.ONLINE
                }
                is ApiResult.Http -> {
                    status.value = Connection.ERROR
                    throw AgentActionError(
                        when (result.code) {
                            401 -> "El código caducó o ya fue usado. Solicita otro en el panel."
                            429 -> "Demasiados intentos. Espera antes de reintentar."
                            else -> "El backend no completó la vinculación."
                        },
                    )
                }
                ApiResult.Network -> {
                    status.value = Connection.WAITING
                    throw AgentActionError("No se pudo confirmar la vinculación. Comprueba el estado en el panel.")
                }
                ApiResult.InvalidResponse -> {
                    status.value = Connection.ERROR
                    throw AgentActionError("La respuesta de vinculación está incompleta. Comprueba el estado en el panel.")
                }
            }
        }
    }

    suspend fun setCapture(enabled: Boolean) = withContext(Dispatchers.IO) {
        stateLock.withLock {
            val link = current.value ?: return@withLock
            if (enabled && (link.mode != LinkMode.ACTIVE || !matchesEndpoint(link))) {
                throw AgentActionError("Una vinculación activa es necesaria para capturar avisos.")
            }
            persist(link.copy(captureFrom = if (enabled) now() else null))
        }
    }

    suspend fun capture(snapshot: NotificationSnapshot) {
        val parsed = NotificationParser.parse(snapshot) ?: return
        val inserted = stateLock.withLock {
            val link = current.value ?: return@withLock false
            if (!canCapture(snapshot.postedAt)) return@withLock false
            val fingerprint = notificationFingerprint(snapshot)
            val eventId = UUID.randomUUID().toString()
            val request = NoticeRequest(
                eventId = eventId,
                deviceId = link.deviceId,
                sender = parsed.sender,
                amount = parsed.amount,
                currency = parsed.currency,
                capturedAt = parsed.capturedAt,
                sourceNotificationId = fingerprint,
                metadata = Metadata(YAPE_PACKAGE),
            )
            queue.insert(
                QueuedEvent(
                    id = eventId,
                    bindingId = link.localId,
                    fingerprint = fingerprint,
                    capturedMillis = snapshot.postedAt,
                    requestJson = payloadJson.encodeToString(request),
                    sender = parsed.sender,
                    amount = parsed.amount,
                    currency = parsed.currency,
                ),
            ) != -1L
        }
        if (inserted) schedule()
    }

    suspend fun requestUnlink() = withContext(Dispatchers.IO) {
        stateLock.withLock {
            val link = current.value ?: return@withLock
            if (link.mode != LinkMode.UNLINKING) {
                persist(link.copy(mode = LinkMode.UNLINKING, captureFrom = null, retryAt = null))
                status.value = Connection.WAITING
            }
        }
        refresh()
    }

    suspend fun synchronize(): WorkOutcome = networkLock.withLock {
        val client = api ?: return@withLock WorkOutcome.COMPLETE
        val starting = current.value ?: return@withLock WorkOutcome.COMPLETE
        if (!matchesEndpoint(starting)) {
            status.value = Connection.ERROR
            return@withLock WorkOutcome.COMPLETE
        }
        if ((starting.retryAt ?: 0) > now()) return@withLock WorkOutcome.RETRY

        if (starting.mode == LinkMode.UNLINKING) return@withLock sendUnlink(client, starting)
        val events = queue.pending(starting.localId, 40)
        if (starting.mode == LinkMode.REJECTED || (events.isEmpty() && now() - (starting.lastSyncAt ?: 0) >= 120_000)) {
            status.value = Connection.CONNECTING
            when (val response = client.heartbeat(starting.token)) {
                is ApiResult.Ok -> contact(starting)
                else -> return@withLock fail(starting, response)
            }
        }
        val started = System.nanoTime()
        for (event in events) {
            if (System.nanoTime() - started > 240_000_000_000L) return@withLock WorkOutcome.RETRY
            if (!isOperational(starting.localId)) return@withLock WorkOutcome.COMPLETE
            when (val response = client.send(starting.token, event.requestJson)) {
                is ApiResult.Ok -> {
                    stateLock.withLock {
                        if (isOperational(starting.localId)) {
                            queue.settle(starting.localId, event.id, SENT, response.value.event.status, null)
                        }
                    }
                    contact(starting)
                }
                is ApiResult.Http -> {
                    if (response.code == 401 || response.code == 403 || response.retryable) {
                        return@withLock fail(starting, response)
                    }
                    stateLock.withLock {
                        if (isOperational(starting.localId)) {
                            queue.settle(starting.localId, event.id, FAILED, null, response.code)
                        }
                    }
                    contact(starting)
                }
                else -> return@withLock fail(starting, response)
            }
        }
        if (events.size == 40) WorkOutcome.RETRY else WorkOutcome.COMPLETE
    }

    private suspend fun sendUnlink(client: AgentApi, link: Binding): WorkOutcome {
        status.value = Connection.CONNECTING
        val response = client.unlink(link.token)
        if (response is ApiResult.Ok || (response is ApiResult.Http && response.code == 401)) {
            stateLock.withLock {
                if (current.value?.localId == link.localId) {
                    queue.purge(link.localId)
                    store.clear()
                    current.value = null
                    status.value = Connection.IDLE
                }
            }
            return WorkOutcome.COMPLETE
        }
        return fail(link, response)
    }

    private fun isOperational(id: String) = current.value?.let { it.localId == id && it.mode == LinkMode.ACTIVE } == true

    private suspend fun contact(old: Binding) {
        stateLock.withLock {
            val link = current.value ?: return@withLock
            if (link.localId != old.localId || link.mode == LinkMode.UNLINKING) return@withLock
            persist(link.copy(mode = LinkMode.ACTIVE, lastSyncAt = now(), retryAt = null))
            status.value = Connection.ONLINE
        }
    }

    private suspend fun fail(old: Binding, result: ApiResult<*>): WorkOutcome = stateLock.withLock {
        val link = current.value ?: return@withLock WorkOutcome.COMPLETE
        if (link.localId != old.localId || link.mode == LinkMode.UNLINKING && old.mode != LinkMode.UNLINKING) {
            return@withLock WorkOutcome.COMPLETE
        }
        if (result is ApiResult.Http && result.code in setOf(401, 403) && link.mode != LinkMode.UNLINKING) {
            persist(link.copy(mode = LinkMode.REJECTED))
            status.value = Connection.REJECTED
            return@withLock WorkOutcome.COMPLETE
        }
        if (result is ApiResult.Http && !result.retryable) {
            status.value = Connection.ERROR
            return@withLock WorkOutcome.COMPLETE
        }
        val waitSeconds = (result as? ApiResult.Http)?.retryAfterSeconds?.coerceIn(0, 900)
        if (waitSeconds != null && waitSeconds > 0) persist(link.copy(retryAt = now() + waitSeconds * 1000))
        status.value = Connection.WAITING
        WorkOutcome.RETRY
    }

    fun storageError() {
        status.value = Connection.ERROR
    }

    private fun persist(binding: Binding) {
        store.save(binding)
        current.value = binding
    }

    private fun validId(value: String) = runCatching { UUID.fromString(value).toString() == value }.getOrDefault(false)

    private fun notificationFingerprint(snapshot: NotificationSnapshot): String {
        val identity = listOf(snapshot.sourcePackage, snapshot.key, snapshot.postedAt.toString()).joinToString("\u0000")
        return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
