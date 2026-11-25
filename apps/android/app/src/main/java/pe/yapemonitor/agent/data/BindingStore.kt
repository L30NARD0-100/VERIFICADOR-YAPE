package pe.yapemonitor.agent.data

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface BindingStore {
    fun load(): Binding?
    fun save(binding: Binding)
    fun clear()
}

class KeystoreBindingStore(context: Context) : BindingStore {
    companion object {
        private const val KEY_ALIAS = "yape-monitor-device-token"
        private const val CIPHER = "AES/GCM/NoPadding"
    }

    private val preferences = context.getSharedPreferences("device_binding", Context.MODE_PRIVATE)

    override fun load(): Binding? {
        val localId = preferences.getString("localId", null) ?: return null
        val cipher = Cipher.getInstance(CIPHER)
        val iv = Base64.decode(required("iv"), Base64.NO_WRAP)
        val encrypted = Base64.decode(required("token"), Base64.NO_WRAP)
        cipher.init(Cipher.DECRYPT_MODE, key(create = false), GCMParameterSpec(128, iv))
        cipher.updateAAD(localId.toByteArray(Charsets.UTF_8))
        return Binding(
            localId = localId,
            deviceId = required("deviceId"),
            companyId = required("companyId"),
            token = cipher.doFinal(encrypted).toString(Charsets.UTF_8),
            deviceName = preferences.getString("deviceName", null),
            companyName = preferences.getString("companyName", null),
            linkedAt = preferences.getLong("linkedAt", 0),
            apiEndpoint = required("apiEndpoint"),
            captureFrom = optionalTime("captureFrom"),
            lastSyncAt = optionalTime("lastSyncAt"),
            retryAt = optionalTime("retryAt"),
            mode = LinkMode.valueOf(required("mode")),
        )
    }

    // El resultado de commit es parte de la confirmación de la vinculación.
    @SuppressLint("UseKtx")
    override fun save(binding: Binding) {
        val editor = preferences.edit()
            .putString("localId", binding.localId)
            .putString("deviceId", binding.deviceId)
            .putString("companyId", binding.companyId)
            .putString("deviceName", binding.deviceName)
            .putString("companyName", binding.companyName)
            .putLong("linkedAt", binding.linkedAt)
            .putString("apiEndpoint", binding.apiEndpoint)
            .putLong("captureFrom", binding.captureFrom ?: 0)
            .putLong("lastSyncAt", binding.lastSyncAt ?: 0)
            .putLong("retryAt", binding.retryAt ?: 0)
            .putString("mode", binding.mode.name)
        if (preferences.getString("localId", null) != binding.localId) {
            val cipher = Cipher.getInstance(CIPHER)
            cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
            cipher.updateAAD(binding.localId.toByteArray(Charsets.UTF_8))
            val encrypted = cipher.doFinal(binding.token.toByteArray(Charsets.UTF_8))
            editor.putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            editor.putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        }
        check(editor.commit()) { "No se pudo guardar la vinculación local." }
    }

    @SuppressLint("UseKtx")
    override fun clear() {
        check(preferences.edit().clear().commit()) { "No se pudo borrar la vinculación local." }
    }

    private fun required(name: String) = checkNotNull(preferences.getString(name, null))

    private fun optionalTime(name: String) = preferences.getLong(name, 0L).takeIf { it > 0L }

    private fun key(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        check(create) { "Falta la clave de la vinculación." }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setKeySize(256)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }
}
