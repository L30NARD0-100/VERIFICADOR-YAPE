package pe.yapemonitor.agent.capture

import java.math.BigDecimal
import java.time.Instant
import java.util.Locale

const val YAPE_PACKAGE = "com.bcp.innovacxion.yapeapp"

data class NotificationSnapshot(
    val sourcePackage: String,
    val key: String,
    val postedAt: Long,
    val title: String?,
    val body: String?,
)

data class ParsedNotice(
    val sender: String?,
    val amount: String?,
    val currency: String?,
    val capturedAt: String,
)

object NotificationParser {
    private val inboundTitle = Regex(
        """^[¡!\s]*(?:te yapearon|yape recibido|pago recibido|recibiste un yape)[.!¡!\s]*$""",
        RegexOption.IGNORE_CASE,
    )
    private val inboundText = Regex("""^\s*[¡!]*recibiste\s+(?:un yape\b|un pago\b|(?:S/\.?|PEN|USD|US\$)\s*\d)""", RegexOption.IGNORE_CASE)
    private val senderBeforeVerb = Regex(
        """^\s*[¡!]*([\p{L}\p{M}][\p{L}\p{M} .'’\-]{0,159}?)\s+te\s+(?:yape[óo]|envi[óo])\b""",
        RegexOption.IGNORE_CASE,
    )
    private val receiptAfterVerb = Regex(
        """^\s*(?:(?:un yape|un pago)\s+de\s+)?(?:S/\.?|PEN|USD|US\$)\s*\d""",
        RegexOption.IGNORE_CASE,
    )
    private val senderAfterAmount = Regex(
        """\bde\s+([\p{L}\p{M}][\p{L}\p{M} .'’\-]{0,159}?)[.!¡!\s]*$""",
        RegexOption.IGNORE_CASE,
    )
    private val outgoing = Regex("""^\s*[¡!]*(?:enviaste\b|yapeaste\b|yape enviado\b|pago enviado\b)""", RegexOption.IGNORE_CASE)
    private val money = Regex("""(?<![\p{L}\p{N}])(?:(S/\.?|PEN|USD|US\$)\s*(\d[\d.,]{0,30})|(?<![\d.,])(\d[\d.,]{0,30})\s+(PEN|USD)\b)""", RegexOption.IGNORE_CASE)

    fun parse(notification: NotificationSnapshot): ParsedNotice? {
        if (notification.sourcePackage != YAPE_PACKAGE || notification.postedAt <= 0L) return null
        val title = notification.title.orEmpty().take(240).trim()
        val body = notification.body.orEmpty().take(1_000).trim()
        if (outgoing.containsMatchIn(title) || outgoing.containsMatchIn(body)) return null
        val senderInBody = senderBeforeVerb.find(body)
        val senderLine = if (senderInBody != null) body else title
        val senderMatch = senderInBody ?: senderBeforeVerb.find(title)
        val receiptBySender = senderMatch?.let { receiptAfterVerb.containsMatchIn(senderLine.substring(it.range.last + 1)) } == true
        val receiptTitle = inboundTitle.matches(title)
        val receiptText = inboundText.containsMatchIn(body) || inboundText.containsMatchIn(title)
        if (!receiptTitle && !receiptText && !receiptBySender) return null
        val amounts = listOf(title, body).flatMap { money.findAll(it).toList() }
            .map { match ->
                val marker = match.groups[1]?.value ?: match.groups[4]!!.value
                val value = match.groups[2]?.value ?: match.groups[3]!!.value
                val currency = when (marker.uppercase(Locale.ROOT)) {
                    "USD", "US$" -> "USD"
                    else -> "PEN"
                }
                currency to normalizeAmount(value.removeSuffix("."))
            }.distinct()
        val amount = amounts.singleOrNull()
        val sender = senderMatch?.groupValues?.get(1)
            ?: if (receiptText) senderAfterAmount.find(body)?.groupValues?.get(1) else null
        return ParsedNotice(
            sender = sender?.trim()?.takeIf { it.isNotEmpty() },
            amount = amount?.second,
            currency = amount?.first,
            capturedAt = Instant.ofEpochMilli(notification.postedAt).toString(),
        )
    }

    private fun normalizeAmount(value: String): String? {
        val normalized = when {
            value.matches(Regex("""\d+(?:[.,]\d{1,2})?""")) -> value.replace(',', '.')
            value.matches(Regex("""\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?""")) -> value.replace(",", "")
            value.matches(Regex("""\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?""")) ->
                value.replace(".", "").replace(',', '.')
            else -> return null
        }
        val number = normalized.toBigDecimalOrNull() ?: return null
        if (number <= BigDecimal.ZERO || number >= BigDecimal("1000000000000")) return null
        return number.setScale(2).toPlainString()
    }
}
