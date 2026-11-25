package pe.yapemonitor.agent.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class LinkMode { ACTIVE, REJECTED, UNLINKING }
enum class Connection { IDLE, CONNECTING, ONLINE, WAITING, REJECTED, ERROR }

data class Binding(
    val localId: String,
    val deviceId: String,
    val companyId: String,
    val deviceName: String?,
    val companyName: String?,
    val token: String,
    val linkedAt: Long,
    val apiEndpoint: String,
    val captureFrom: Long? = null,
    val lastSyncAt: Long? = null,
    val retryAt: Long? = null,
    val mode: LinkMode = LinkMode.ACTIVE,
) {
    override fun toString(): String = "Binding(deviceId=$deviceId, mode=$mode)"
}

@Serializable
data class PairResult(
    @SerialName("device_id") val deviceId: String,
    @SerialName("company_id") val companyId: String,
    @SerialName("device_token") val token: String,
    @SerialName("device_name") val deviceName: String? = null,
    @SerialName("company_name") val companyName: String? = null,
) {
    override fun toString(): String = "PairResult(deviceId=$deviceId)"
}

@Serializable
data class NoticeRequest(
    @SerialName("event_id") val eventId: String,
    @SerialName("device_id") val deviceId: String,
    @SerialName("event_type") val eventType: String = "payment_notice",
    @SerialName("sender_name") val sender: String?,
    val amount: String?,
    val currency: String?,
    @SerialName("received_at") val capturedAt: String,
    @SerialName("source_notification_id") val sourceNotificationId: String,
    val metadata: Metadata,
)

@Serializable
data class Metadata(@SerialName("source_application") val sourceApplication: String)

@Serializable
data class NoticeResponse(val event: ProcessedEvent)

@Serializable
data class ProcessedEvent(@SerialName("processing_status") val status: String)
