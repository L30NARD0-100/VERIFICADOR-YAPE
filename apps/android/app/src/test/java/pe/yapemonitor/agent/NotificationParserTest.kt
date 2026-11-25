package pe.yapemonitor.agent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import pe.yapemonitor.agent.capture.NotificationParser
import pe.yapemonitor.agent.capture.NotificationSnapshot
import pe.yapemonitor.agent.capture.YAPE_PACKAGE

class NotificationParserTest {
    private val notice = NotificationSnapshot(
        sourcePackage = YAPE_PACKAGE,
        key = "android-key-01",
        postedAt = 1_700_000_000_000,
        title = "¡Te yapearon!",
        body = "María López te yapeó S/ 1.234,50",
    )

    @Test
    fun normalizesSeparatedAmountAndKeepsObservedTime() {
        val parsed = checkNotNull(NotificationParser.parse(notice))
        assertEquals("María López", parsed.sender)
        assertEquals("1234.50", parsed.amount)
        assertEquals("PEN", parsed.currency)
        assertEquals("2023-11-14T22:13:20Z", parsed.capturedAt)
    }

    @Test
    fun identifiesAnotherSupportedReceiptShapeAndCurrency() {
        val parsed = checkNotNull(NotificationParser.parse(notice.copy(
            title = null, body = "Recibiste US$ 12.50 de Ana del Río.",
        )))
        assertEquals("Ana del Río", parsed.sender)
        assertEquals("12.50", parsed.amount)
        assertEquals("USD", parsed.currency)
    }

    @Test
    fun ignoresOtherApplicationsOutgoingAndUnrecognizedNotices() {
        assertNull(NotificationParser.parse(notice.copy(sourcePackage = "example.other")))
        assertNull(NotificationParser.parse(notice.copy(title = "Yape enviado")))
        assertNull(NotificationParser.parse(notice.copy(title = "Novedades", body = "Tu premio de S/ 100")))
        assertNull(NotificationParser.parse(notice.copy(title = null, body = "Tu cuenta necesita atención.")))
        assertNull(NotificationParser.parse(notice.copy(title = "Solicitud", body = "Ana te envió una solicitud de S/ 10.00")))
    }

    @Test
    fun keepsMissingFieldsNullAndDiscardsAmbiguousAmounts() {
        val missing = checkNotNull(NotificationParser.parse(notice.copy(body = null)))
        assertNull(missing.sender)
        assertNull(missing.amount)
        assertNull(missing.currency)
        val ambiguous = checkNotNull(NotificationParser.parse(notice.copy(body = "Aviso: S/ 12.50 y S/ 13.50")))
        assertNull(ambiguous.amount)
        assertNull(ambiguous.currency)
    }

    @Test
    fun rejectsUnusableAmountsWithoutFabricatingZero() {
        val parsed = checkNotNull(NotificationParser.parse(notice.copy(body = "María te yapeó S/ 0.00")))
        assertEquals("María", parsed.sender)
        assertNull(parsed.amount)
        assertEquals("PEN", parsed.currency)
    }
}
