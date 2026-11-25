package pe.yapemonitor.agent

import android.app.Application
import androidx.room.Room
import java.util.ArrayDeque
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.SQLiteMode
import pe.yapemonitor.agent.capture.NotificationSnapshot
import pe.yapemonitor.agent.capture.YAPE_PACKAGE
import pe.yapemonitor.agent.data.Binding
import pe.yapemonitor.agent.data.BindingStore
import pe.yapemonitor.agent.data.EventDatabase
import pe.yapemonitor.agent.data.LinkMode
import pe.yapemonitor.agent.data.NoticeResponse
import pe.yapemonitor.agent.data.PairResult
import pe.yapemonitor.agent.data.ProcessedEvent
import pe.yapemonitor.agent.data.QueueCounts
import pe.yapemonitor.agent.network.AgentApi
import pe.yapemonitor.agent.network.ApiResult
import pe.yapemonitor.agent.sync.AgentRepository
import pe.yapemonitor.agent.sync.WorkOutcome

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
class AgentRepositoryTest {
    private val dbName = "queue-" + UUID.randomUUID()
    private lateinit var db: EventDatabase
    private lateinit var repository: AgentRepository
    private val store = MemoryBinding()
    private val api = FakeApi()
    private var millis = 1_700_000_000_000L
    private var scheduled = 0

    @Before
    fun initialize() { openRepository() }

    @After
    fun close() {
        db.close()
        RuntimeEnvironment.getApplication().deleteDatabase(dbName)
    }

    @Test
    fun consentAndSourceScopeTheLocalQueueAndIgnoreCallbackDuplicates() = runBlocking {
        repository.pair("C".repeat(22))
        repository.capture(snapshot())
        assertEquals(QueueCounts(), repository.counts.first())
        millis++
        repository.setCapture(true)
        repository.capture(snapshot(at = millis - 1))
        repository.capture(snapshot().copy(sourcePackage = "example.other"))
        repository.capture(snapshot())
        repository.capture(snapshot().copy(body = "legitimate update to the same callback"))
        repository.capture(snapshot(key = "different-android-key"))
        assertEquals(QueueCounts(pending = 2), repository.counts.first())
        assertEquals(2, scheduled)
        assertEquals(2, repository.history.first().map { it.id }.distinct().size)
    }

    @Test
    fun persistentQueueRetriesTheSamePayloadAfterRestart() = runBlocking {
        linkAndCapture()
        val first = repository.history.first().single()
        assertFalse(first.requestJson.contains("body"))
        api.sendResults.add(ApiResult.Network)
        assertEquals(WorkOutcome.RETRY, repository.synchronize())
        db.close()
        openRepository()
        assertEquals(first.id, repository.history.first().single().id)
        assertEquals(WorkOutcome.COMPLETE, repository.synchronize())
        assertEquals(QueueCounts(sent = 1), repository.counts.first())
        assertEquals(listOf(first.requestJson, first.requestJson), api.requests)
        assertEquals("processed", repository.history.first().single().backendStatus)
    }

    @Test
    fun respectsThrottleAndRecordsDefinitiveErrorWithoutBlockingTheNextEvent() = runBlocking {
        linkAndCapture()
        repository.capture(snapshot(key = "second"))
        api.sendResults.add(ApiResult.Http(429, 21))
        assertEquals(WorkOutcome.RETRY, repository.synchronize())
        assertEquals(WorkOutcome.RETRY, repository.synchronize())
        assertEquals(1, api.requests.size)
        millis += 21_000
        api.sendResults.add(ApiResult.Http(409, null))
        assertEquals(WorkOutcome.COMPLETE, repository.synchronize())
        assertEquals(QueueCounts(sent = 1, failed = 1), repository.counts.first())
        assertEquals(409, repository.history.first().single { it.failureCode != null }.failureCode)
    }

    @Test
    fun rejectsRevokedTokenAndOfflineUnlinkPreventsDeliveryAfterNewPairing() = runBlocking {
        linkAndCapture()
        val priorBinding = repository.binding.value!!.localId
        api.sendResults.add(ApiResult.Http(401, null))
        assertEquals(WorkOutcome.COMPLETE, repository.synchronize())
        assertEquals(LinkMode.REJECTED, repository.binding.value?.mode)
        assertEquals(QueueCounts(pending = 1), repository.counts.first())
        repository.capture(snapshot(key = "another"))
        assertEquals(QueueCounts(pending = 1), repository.counts.first())
        repository.requestUnlink()
        api.unlinkResult = ApiResult.Network
        assertEquals(WorkOutcome.RETRY, repository.synchronize())
        assertEquals(LinkMode.UNLINKING, repository.binding.value?.mode)
        db.close()
        openRepository()
        api.unlinkResult = ApiResult.Http(401, null)
        assertEquals(WorkOutcome.COMPLETE, repository.synchronize())
        assertNull(repository.binding.value)
        assertTrue(db.queue().history(priorBinding).first().isEmpty())
        repository.pair("D".repeat(22))
        assertNotEquals(priorBinding, repository.binding.value?.localId)
        assertEquals(QueueCounts(), repository.counts.first())
        assertEquals(1, api.requests.size)
    }

    @Test
    fun stopsNewSendsWhenUnlinkBeginsDuringARequest() = runBlocking {
        linkAndCapture()
        repository.capture(snapshot(key = "second"))
        val sent = CompletableDeferred<Unit>()
        val acknowledgement = CompletableDeferred<Unit>()
        api.beforeSend = { sent.complete(Unit); acknowledgement.await() }
        val work = async { repository.synchronize() }
        sent.await()
        repository.requestUnlink()
        acknowledgement.complete(Unit)
        assertEquals(WorkOutcome.COMPLETE, work.await())
        assertEquals(1, api.requests.size)
        assertEquals(LinkMode.UNLINKING, repository.binding.value?.mode)
    }

    @Test
    fun credentialsAreNeverReusedOnAnotherEndpoint() = runBlocking {
        linkAndCapture()
        db.close()
        openRepository(FakeApi(endpoint = "https://another.example.test"))
        assertEquals(WorkOutcome.COMPLETE, repository.synchronize())
        assertFalse(repository.canCapture(millis))
        assertEquals(1, repository.counts.first().pending)
    }

    private fun openRepository(client: FakeApi = api) {
        db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), EventDatabase::class.java, dbName).build()
        repository = AgentRepository(store, db.queue(), client, schedule = { scheduled++ }, now = { millis })
    }

    private suspend fun linkAndCapture() {
        repository.pair("C".repeat(22))
        repository.setCapture(true)
        repository.capture(snapshot())
    }

    private fun snapshot(key: String = "first", at: Long = millis) =
        NotificationSnapshot(YAPE_PACKAGE, key, at, "¡Te yapearon!", "María te yapeó S/ 15.50")

    private class MemoryBinding : BindingStore {
        private var saved: Binding? = null
        override fun load() = saved
        override fun save(binding: Binding) { saved = binding }
        override fun clear() { saved = null }
    }

    private class FakeApi(override val endpoint: String = "https://backend.example.test") : AgentApi {
        private val id = "8a4447cb-f281-4cbd-8875-3ad5155155ed"
        val sendResults = ArrayDeque<ApiResult<NoticeResponse>>()
        val requests = mutableListOf<String>()
        var unlinkResult: ApiResult<Unit> = ApiResult.Ok(Unit)
        var beforeSend: suspend () -> Unit = {}

        override suspend fun pair(code: String) = ApiResult.Ok(
            PairResult(id, "f88d3e3a-f8ec-4580-a7bf-ef101f343a80", id + "." + code.first().toString().repeat(43), "Caja", "Tienda"),
        )
        override suspend fun heartbeat(token: String) = ApiResult.Ok(Unit)
        override suspend fun send(token: String, payload: String): ApiResult<NoticeResponse> {
            requests += payload
            beforeSend()
            return sendResults.poll() ?: ApiResult.Ok(NoticeResponse(ProcessedEvent("processed")))
        }
        override suspend fun unlink(token: String) = unlinkResult
    }
}
