package pe.yapemonitor.agent.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale
import pe.yapemonitor.agent.R
import pe.yapemonitor.agent.data.Connection
import pe.yapemonitor.agent.data.FAILED
import pe.yapemonitor.agent.data.LinkMode
import pe.yapemonitor.agent.data.QueuedEvent
import pe.yapemonitor.agent.data.SENT

private val colors = lightColorScheme(
    primary = Color(0xFF6D36C3),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEDE2FF),
    onPrimaryContainer = Color(0xFF381D5C),
    background = Color(0xFFF7F6FB),
    onBackground = Color(0xFF211831),
    surface = Color.White,
    onSurface = Color(0xFF211831),
    onSurfaceVariant = Color(0xFF5C5269),
    error = Color(0xFF9C2941),
)
private val peru = Locale.forLanguageTag("es-PE")
private val limaTime = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)
    .withLocale(peru).withZone(ZoneId.of("America/Lima"))
private val pairingCode = Regex("[A-Za-z0-9_-]{22}")

@Composable
fun AgentScreen(model: AgentViewModel, openSettings: () -> Unit) {
    val binding by model.binding.collectAsStateWithLifecycle()
    val connection by model.connection.collectAsStateWithLifecycle()
    val permission by model.permissionGranted.collectAsStateWithLifecycle()
    val network by model.connected.collectAsStateWithLifecycle()
    val counts by model.counts.collectAsStateWithLifecycle()
    val history by model.history.collectAsStateWithLifecycle()
    val action by model.action.collectAsStateWithLifecycle()
    var code by remember(binding?.localId) { mutableStateOf("") }
    var confirmUnlink by remember { mutableStateOf(false) }
    val link = binding
    val visibleHistory = history.filter { it.bindingId == link?.localId }
    val validEndpoint = model.matchesEndpoint()

    MaterialTheme(colorScheme = colors) {
        Scaffold(containerColor = MaterialTheme.colorScheme.background) { insets ->
            Box(modifier = Modifier.fillMaxSize().padding(insets), contentAlignment = Alignment.TopCenter) {
                LazyColumn(
                    modifier = Modifier.widthIn(max = 640.dp).fillMaxWidth().padding(horizontal = 18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 20.dp),
                ) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Image(painterResource(R.drawable.ic_agent), contentDescription = null, modifier = Modifier.size(42.dp))
                            Column {
                                Text("Yape Monitor", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                Text("Agente Android", color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                    if (!model.configured || !validEndpoint || model.storageFailed || action.error != null) {
                        item {
                            val error = when {
                                model.storageFailed -> "No se pudo leer la vinculación local. Revoca el acceso desde el panel antes de borrar los datos de la app."
                                !model.configured -> "Configura la URL HTTPS de la API en la compilación."
                                !validEndpoint -> "La vinculación corresponde a otra URL. Usa la compilación original para desvincular o revoca el acceso desde el panel."
                                else -> action.error.orEmpty()
                            }
                            StatusNote(error, failure = true)
                        }
                    }
                    item {
                        Section("Vinculación") {
                            if (link == null) {
                                Text("Genera un código de vinculación para este equipo desde el panel web.", style = MaterialTheme.typography.bodyMedium)
                                OutlinedTextField(
                                    value = code,
                                    onValueChange = { code = it.take(64) },
                                    label = { Text("Código de vinculación") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, keyboardType = KeyboardType.Ascii),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                                Button(
                                    onClick = { model.pair(code) },
                                    enabled = model.configured && !model.storageFailed && !action.busy && network && pairingCode.matches(code.trim()),
                                ) { Text(if (action.busy) "Vinculando…" else "Vincular dispositivo") }
                            } else {
                                Text(link.companyName ?: link.companyId, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text(link.deviceName ?: link.deviceId, style = MaterialTheme.typography.bodyMedium)
                                StatusNote(
                                    when (link.mode) {
                                        LinkMode.ACTIVE -> "Vinculación activa"
                                        LinkMode.REJECTED -> "El servidor rechazó el acceso de este dispositivo."
                                        LinkMode.UNLINKING -> "Desvinculación pendiente. La captura y el envío de avisos están pausados."
                                    },
                                    failure = link.mode == LinkMode.REJECTED,
                                )
                                if (link.mode != LinkMode.UNLINKING) {
                                    TextButton(onClick = { confirmUnlink = true }, enabled = !action.busy && validEndpoint) {
                                        Text("Desvincular dispositivo")
                                    }
                                }
                            }
                        }
                    }
                    item {
                        Section("Acceso a notificaciones") {
                            Text("Android permite dar este acceso manualmente. El agente solo procesa avisos entrantes de Yape.", style = MaterialTheme.typography.bodyMedium)
                            Text(if (permission) "Permiso de Android habilitado" else "Permiso de Android pendiente",
                                fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            OutlinedButton(onClick = openSettings) { Text("Abrir ajustes de Android") }
                            if (link?.mode == LinkMode.ACTIVE && validEndpoint) {
                                val capturing = link.captureFrom != null
                                Text(if (capturing && permission) "Captura activa" else "Captura pausada", style = MaterialTheme.typography.bodyMedium)
                                Button(
                                    onClick = { model.toggleCapture(!capturing) },
                                    enabled = !action.busy && (permission || capturing),
                                ) { Text(if (capturing) "Pausar captura" else "Activar captura") }
                            }
                        }
                    }
                    item {
                        Section("Sincronización") {
                            val label = when {
                                !network -> "Sin conexión de red"
                                !validEndpoint -> "Backend pendiente de configuración"
                                else -> when (connection) {
                                    Connection.IDLE -> "Sin actividad reciente"
                                    Connection.CONNECTING -> "Conectando al backend"
                                    Connection.ONLINE -> "Último contacto exitoso"
                                    Connection.WAITING -> "En espera de reintento"
                                    Connection.REJECTED -> "Acceso rechazado por el backend"
                                    Connection.ERROR -> "No se pudo completar la operación"
                                }
                            }
                            StatusNote(label, failure = network && connection in setOf(Connection.REJECTED, Connection.ERROR))
                            Text("Última sincronización · " + (link?.lastSyncAt?.let(::formatTime) ?: "Sin registros"),
                                style = MaterialTheme.typography.bodyMedium)
                            if (link != null && validEndpoint) {
                                OutlinedButton(onClick = model::refresh, enabled = !action.busy) { Text("Sincronizar ahora") }
                            }
                            HorizontalDivider(color = Color(0xFFE8E2F0))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Counter("Enviados", counts.sent, Modifier.weight(1f))
                                Counter("Pendientes", counts.pending, Modifier.weight(1f))
                                Counter("Con error", counts.failed, Modifier.weight(1f))
                            }
                        }
                    }
                    item { StatusNote("Los avisos detectados requieren verificación del pago.") }
                    item {
                        Text("Historial de notificaciones", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        if (visibleHistory.isEmpty()) Text("Aún no hay notificaciones registradas en este equipo.",
                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(visibleHistory, key = { it.id }) { NoticeCard(it) }
                }
            }
        }

        if (confirmUnlink) {
            AlertDialog(
                onDismissRequest = { confirmUnlink = false },
                title = { Text("Desvincular dispositivo") },
                text = { Text("La captura se detendrá de inmediato. Cuando el servidor invalide el acceso, se borrará la cola y el historial local de esta vinculación.") },
                confirmButton = {
                    TextButton(onClick = { confirmUnlink = false; model.unlink() }) { Text("Desvincular") }
                },
                dismissButton = { TextButton(onClick = { confirmUnlink = false }) { Text("Cancelar") } },
            )
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun StatusNote(message: String, failure: Boolean = false) {
    Surface(
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        shape = RoundedCornerShape(10.dp),
        color = if (failure) Color(0xFFFFE9ED) else MaterialTheme.colorScheme.primaryContainer,
        contentColor = if (failure) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onPrimaryContainer,
    ) { Text(message, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium) }
}

@Composable
private fun Counter(label: String, value: Int, modifier: Modifier) {
    Column(modifier) {
        Text(NumberFormat.getIntegerInstance(peru).format(value), fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleLarge)
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun NoticeCard(event: QueuedEvent) {
    val status = when (event.state) {
        SENT -> when (event.backendStatus) {
            "needs_review" -> "Recibido · requiere revisión"
            "processed" -> "Procesado · pendiente de verificación"
            "rejected" -> "Rechazado por el servidor"
            "processing_error" -> "Error de procesamiento"
            else -> "Recibido por el backend"
        }
        FAILED -> "Error de envío" + (event.failureCode?.let { " · HTTP $it" } ?: "")
        else -> "Detectado · pendiente de envío"
    }
    Section(event.sender ?: "Remitente sin identificar") {
        val amount = event.amount?.let { value ->
            event.currency?.let { currency ->
                NumberFormat.getCurrencyInstance(peru).apply { this.currency = Currency.getInstance(currency) }
                    .format(value.toBigDecimal())
            } ?: value
        }
        Text(amount ?: "Importe no disponible", style = MaterialTheme.typography.titleMedium)
        Text(formatTime(event.capturedMillis) + " · hora de Lima", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        StatusNote(status, failure = event.state == FAILED || event.backendStatus in setOf("rejected", "processing_error"))
    }
}

private fun formatTime(epochMillis: Long) = limaTime.format(Instant.ofEpochMilli(epochMillis))
