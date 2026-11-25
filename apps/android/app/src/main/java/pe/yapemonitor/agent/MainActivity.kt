package pe.yapemonitor.agent

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import pe.yapemonitor.agent.ui.AgentScreen
import pe.yapemonitor.agent.ui.AgentViewModel

class MainActivity : ComponentActivity() {
    private val model by viewModels<AgentViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AgentScreen(model) { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    model.refresh()
                    delay(120_000)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        model.onResume()
    }
}
