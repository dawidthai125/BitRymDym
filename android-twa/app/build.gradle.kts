plugins {
    id("com.android.application")
}

android {
    namespace = "pl.bitrymdym.app"
    // Google Play: new apps and updates must target Android 16 (API 36) from 2026-08-31.
    compileSdk = 36

    defaultConfig {
        applicationId = "pl.bitrymdym.app"
        minSdk = 24 // androidbrowserhelper 2.7.4 requires 24
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
    }

    buildTypes {
        release {
            // No signingConfig on purpose: CI produces an UNSIGNED bundle that is
            // signed locally with the upload key (see README.md).
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
