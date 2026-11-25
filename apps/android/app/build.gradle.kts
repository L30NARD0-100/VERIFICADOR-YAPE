import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

val backendUrl = providers.gradleProperty("yapeMonitorApiBaseUrl")
    .orElse(providers.environmentVariable("YAPE_MONITOR_API_BASE_URL"))
    .orElse("").get().trim()
if (backendUrl.isNotEmpty()) {
    val uri = URI(backendUrl)
    require(uri.scheme == "https" && uri.host != null && uri.userInfo == null &&
        uri.query == null && uri.fragment == null) {
        "La URL base del backend debe ser HTTPS y no debe incluir credenciales, consulta ni fragmento."
    }
}

android {
    namespace = "pe.yapemonitor.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "pe.yapemonitor.agent"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
        val literal = backendUrl.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "API_BASE_URL", "\"$literal\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

ksp { arg("room.schemaLocation", file("schemas").path) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.05.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.1")
    implementation("androidx.room:room-runtime:2.7.2")
    implementation("androidx.room:room-ktx:2.7.2")
    implementation("androidx.work:work-runtime-ktx:2.10.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    ksp("androidx.room:room-compiler:2.7.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("com.squareup.okhttp3:okhttp-tls:4.12.0")
    testImplementation("org.robolectric:robolectric:4.15.1")
    testImplementation("androidx.work:work-testing:2.10.2")
}
