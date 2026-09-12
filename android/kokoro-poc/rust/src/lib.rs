/*
 * Minimal Rust -> JNI bridge for the Kokoro local-TTS proof of concept.
 *
 * Exposes exactly three calls used by KokoroLocalTtsEngine:
 *   nativeInit(modelPath, voicePath, ortLibPath) -> error string or null
 *   nativeSynth(text) -> FloatArray of 24 kHz mono PCM, or null on failure
 *   nativeRelease() -> frees the engine
 *
 * Kokoro's KokoroTts::new() loads the model from a file and the voice from a
 * single <voice>.bin file; both are copies inside the app's files directory.
 * Everything runs offline. Logs use the Rust `log` crate and are surfaced in
 * logcat under the tag DaymarkKokoroTts via android_logger.
 */
use jni::objects::{JClass, JString};
use jni::sys::{jfloatArray, jstring};
use jni::JNIEnv;
use kokoro_en::{KokoroTts, Voice};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tokio::runtime::Runtime;

const LOG_TAG: &str = "DaymarkKokoroTts";

struct Engine {
    runtime: Runtime,
    tts: KokoroTts,
    voice: String,
}

static ENGINE: OnceLock<Mutex<Option<Engine>>> = OnceLock::new();

fn engine_slot() -> &'static Mutex<Option<Engine>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

fn to_jstring(env: &mut JNIEnv, value: &str) -> jstring {
    match env.new_string(value) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeInit(
    mut env: JNIEnv,
    _class: JClass,
    model_path: JString,
    voice_path: JString,
    voice_name: JString,
) -> jstring {
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Info)
            .with_tag(LOG_TAG),
    );

    let model = match env.get_string(&model_path) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "model path unavailable"),
    };
    let voice_file = match env.get_string(&voice_path) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "voice path unavailable"),
    };
    let voice = match env.get_string(&voice_name) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "voice name unavailable"),
    };

    let started = Instant::now();

    let runtime = match tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build() {
        Ok(value) => value,
        Err(error) => return to_jstring(&mut env, &format!("tokio runtime failed: {error}")),
    };

    let tts = match runtime.block_on(KokoroTts::new(&model, &voice_file)) {
        Ok(value) => value,
        Err(error) => {
            log::error!("model load failed: {error}");
            return to_jstring(&mut env, &format!("model load failed: {error}"));
        }
    };

    log::info!(
        "initialize: model loaded in {}ms (model={}, voice={})",
        started.elapsed().as_millis(),
        model,
        voice
    );
    let mut slot = engine_slot().lock().unwrap();
    *slot = Some(Engine { runtime, tts, voice });
    std::ptr::null_mut()
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeSynth(
    mut env: JNIEnv,
    _class: JClass,
    text: JString,
) -> jfloatArray {
    let input = match env.get_string(&text) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return std::ptr::null_mut(),
    };
    let started = Instant::now();
    let slot = engine_slot().lock().unwrap();
    let Some(engine) = slot.as_ref() else {
        return std::ptr::null_mut();
    };
    let voice = Voice::new(engine.voice.clone());
    match engine.runtime.block_on(engine.tts.synth(input.as_str(), voice)) {
        Ok((samples, took)) => {
            log::info!(
                "synthesis: generationMs={} wallMs={} samples={} audioMs={}",
                took.as_millis(),
                started.elapsed().as_millis(),
                samples.len(),
                if samples.is_empty() { 0 } else { samples.len() * 1000 / 24000 }
            );
            match env.new_float_array(samples.len() as i32) {
                Ok(array) => {
                    if env.set_float_array_region(&array, 0, &samples).is_err() {
                        return std::ptr::null_mut();
                    }
                    array.into_raw()
                }
                Err(_) => std::ptr::null_mut(),
            }
        }
        Err(error) => {
            log::error!("synthesis failed: {error}");
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeRelease(
    _env: JNIEnv,
    _class: JClass,
) {
    let mut slot = engine_slot().lock().unwrap();
    *slot = None;
    log::info!("engine released");
}
