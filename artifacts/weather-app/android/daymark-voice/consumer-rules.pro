# R8 must not rename or strip the Kokoro JNI surface: the Rust library exports
# Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_native* symbols that
# are resolved by exact class and method name at runtime.
-keep class io.github.sami_gor.daymark.tts.KokoroLocalTtsEngine { *; }
-keepclasseswithmembernames class * {
    native <methods>;
}

# sherpa-onnx resolves its JNI classes by exact Java name. The published AAR
# has an empty proguard.txt, so without this keep rule a minified release build
# throws at recogniser construction while debug builds work.
-keep class com.k2fsa.sherpa.onnx.** { *; }

# Capacitor resolves plugin methods by name through reflection.
-keep class io.github.sami_gor.daymark.voice.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}

# Capacitor dispatches permission results through a named @PermissionCallback
# method. R8 must keep the callback's name and runtime annotation, or the
# launcher lookup throws a NullPointerException when the permission is denied.
-keepattributes *Annotation*
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}
