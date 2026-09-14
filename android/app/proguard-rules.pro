# R8 must not rename or strip the Kokoro JNI surface: the Rust library exports
# Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_native* symbols that
# are resolved by exact class and method name at runtime.
-keep class io.github.sami_gor.daymark.tts.KokoroLocalTtsEngine { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}
