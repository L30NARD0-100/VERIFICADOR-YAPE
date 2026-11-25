package pe.yapemonitor.agent

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import pe.yapemonitor.agent.network.ApiResult
import pe.yapemonitor.agent.network.HttpsAgentApi

class AgentApiTest {
    private fun withTls(test: suspend (MockWebServer, HttpsAgentApi) -> Unit) {
        val certificate = HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("localhost").build()
        val serverCertificates = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val clientCertificates = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        MockWebServer().use { server ->
            server.useHttps(serverCertificates.sslSocketFactory(), false)
            server.start()
            val client = OkHttpClient.Builder()
                .sslSocketFactory(clientCertificates.sslSocketFactory(), clientCertificates.trustManager)
                .build()
            runBlocking { test(server, HttpsAgentApi(server.url("/").toString(), "0.2.0", client)) }
        }
    }

    @Test
    fun deviceEndpointsUseHttpsAndOnlyAuthenticatedRequestsSendBearer() = withTls { server, api ->
        server.enqueue(MockResponse().setResponseCode(201).setBody("""
            {"device_id":"d","company_id":"c","device_token":"example-token","company_name":"Tienda","device_name":"Caja"}
        """.trimIndent()))
        val result = api.pair("example-code") as ApiResult.Ok
        assertEquals("Caja", result.value.deviceName)
        val registration = checkNotNull(server.takeRequest(2, TimeUnit.SECONDS))
        assertEquals("/api/devices/register", registration.path)
        assertNull(registration.getHeader("Authorization"))
        assertEquals("""{"pairing_code":"example-code","app_version":"0.2.0"}""", registration.body.readUtf8())

        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"event":{"processing_status":"processed"}}"""))
        val response = api.send("example-token", """{"event_id":"stable"}""") as ApiResult.Ok
        assertEquals("processed", response.value.event.status)
        val notification = checkNotNull(server.takeRequest(2, TimeUnit.SECONDS))
        assertEquals("/api/payments/notifications", notification.path)
        assertEquals("Bearer example-token", notification.getHeader("Authorization"))
        assertEquals("""{"event_id":"stable"}""", notification.body.readUtf8())
    }

    @Test
    fun reportsHttpAndContractErrorsAndDoesNotFollowRedirect() = withTls { server, api ->
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "17"))
        assertEquals(ApiResult.Http(429, 17), api.heartbeat("example-token"))
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))
        assertEquals(ApiResult.InvalidResponse, api.send("example-token", "{}"))
        server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", server.url("/unexpected")))
        assertEquals(ApiResult.Http(307, null), api.unlink("example-token"))
        assertEquals(3, server.requestCount)
    }

    @Test
    fun rejectsCleartextAndEmbeddedCredentials() {
        assertThrows(IllegalArgumentException::class.java) { HttpsAgentApi("http://localhost", "0.2.0") }
        assertThrows(IllegalArgumentException::class.java) { HttpsAgentApi("https://secret@example.test", "0.2.0") }
    }
}
