package pe.yapemonitor.agent.network

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import pe.yapemonitor.agent.data.NoticeResponse
import pe.yapemonitor.agent.data.PairResult

sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Http(val code: Int, val retryAfterSeconds: Long?) : ApiResult<Nothing> {
        val retryable: Boolean get() = code in setOf(408, 425, 429) || code >= 500
    }
    data object Network : ApiResult<Nothing>
    data object InvalidResponse : ApiResult<Nothing>
}

interface AgentApi {
    val endpoint: String
    suspend fun pair(code: String): ApiResult<PairResult>
    suspend fun heartbeat(token: String): ApiResult<Unit>
    suspend fun send(token: String, payload: String): ApiResult<NoticeResponse>
    suspend fun unlink(token: String): ApiResult<Unit>
}

val payloadJson = Json {
    encodeDefaults = true
    ignoreUnknownKeys = true
}

class HttpsAgentApi(
    baseUrl: String,
    private val appVersion: String,
    transport: OkHttpClient = OkHttpClient(),
) : AgentApi {
    private val base = requireNotNull(baseUrl.toHttpUrlOrNull()).also {
        require(it.isHttps && it.username.isEmpty() && it.password.isEmpty() && it.query == null && it.fragment == null)
    }
    override val endpoint: String = base.toString().trimEnd('/')
    private val client = transport.newBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    override suspend fun pair(code: String): ApiResult<PairResult> =
        post("devices/register", payloadJson.encodeToString(PairRequest(code, appVersion))) {
            payloadJson.decodeFromString<PairResult>(it)
        }

    override suspend fun heartbeat(token: String): ApiResult<Unit> =
        post("devices/heartbeat", payloadJson.encodeToString(HeartbeatRequest(appVersion)), token) { Unit }

    override suspend fun send(token: String, payload: String): ApiResult<NoticeResponse> =
        post("payments/notifications", payload, token) { payloadJson.decodeFromString<NoticeResponse>(it) }

    override suspend fun unlink(token: String): ApiResult<Unit> =
        post("devices/unlink", "{}", token) { Unit }

    private suspend fun <T> post(
        path: String,
        body: String,
        token: String? = null,
        decode: (String) -> T,
    ): ApiResult<T> = withContext(Dispatchers.IO) {
        val url = base.newBuilder().addPathSegments("api/$path").build()
        val request = Request.Builder().url(url)
            .post(body.toRequestBody("application/json".toMediaType()))
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext ApiResult.Http(response.code, response.header("Retry-After")?.toLongOrNull())
                }
                val bytes = response.peekBody(65_537).bytes()
                if (bytes.size > 65_536) return@withContext ApiResult.InvalidResponse
                ApiResult.Ok(decode(bytes.toString(Charsets.UTF_8)))
            }
        } catch (_: IOException) {
            ApiResult.Network
        } catch (_: SerializationException) {
            ApiResult.InvalidResponse
        }
    }

    @Serializable
    private data class PairRequest(@SerialName("pairing_code") val code: String, @SerialName("app_version") val version: String)

    @Serializable
    private data class HeartbeatRequest(@SerialName("app_version") val version: String)
}
