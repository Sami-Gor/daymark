/*
 * Minimal Rust -> JNI bridge for the Kokoro local-TTS proof of concept.
 *
 * Exposes six calls used by KokoroLocalTtsEngine:
 *   nativeInit(modelPath, voicePath, voiceName) -> error string or null
 *   nativeSynth(text) -> FloatArray of 24 kHz mono PCM, or null on failure
 *   nativeStreamStart(text) -> error string or null; starts sentence streaming
 *   nativeStreamNext() -> next sentence FloatArray, or null when finished
 *   nativeStreamClear() -> drops the active stream
 *   nativeRelease() -> frees the engine
 *
 * Kokoro's KokoroTts::new() loads the model from a file and the voice from a
 * single <voice>.bin file; both are copies inside the app's files directory.
 * Everything runs offline. Logs use the Rust `log` crate and are surfaced in
 * logcat under the tag DaymarkKokoroTts via android_logger.
 */
use futures::StreamExt;
use jni::objects::{JClass, JString};
use jni::sys::{jfloatArray, jstring};
use jni::JNIEnv;
use kokoro_en::{KokoroTts, SynthSink, SynthStream, Voice};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tokio::runtime::Runtime;

const LOG_TAG: &str = "DaymarkKokoroTts";
const SAMPLE_RATE: usize = 24000;

struct Engine {
    runtime: Arc<Runtime>,
    tts: Arc<KokoroTts>,
    voice: String,
}

struct StreamSession {
    sink: Option<SynthSink<String>>,
    stream: SynthStream,
}

fn silence_ms(samples: &[f32], from_start: bool) -> usize {
    let threshold = 0.004f32;
    let mut count = 0usize;
    if from_start {
        for sample in samples {
            if sample.abs() >= threshold {
                break;
            }
            count += 1;
        }
    } else {
        for sample in samples.iter().rev() {
            if sample.abs() >= threshold {
                break;
            }
            count += 1;
        }
    }
    count * 1000 / SAMPLE_RATE
}

static ENGINE: OnceLock<Mutex<Option<Engine>>> = OnceLock::new();
static STREAM: OnceLock<Mutex<Option<StreamSession>>> = OnceLock::new();

fn engine_slot() -> &'static Mutex<Option<Engine>> {
    ENGINE.get_or_init(|| Mutex::new(None))
}

fn stream_slot() -> &'static Mutex<Option<StreamSession>> {
    STREAM.get_or_init(|| Mutex::new(None))
}

fn engine_handles() -> Option<(Arc<Runtime>, Arc<KokoroTts>, String)> {
    let slot = engine_slot().lock().unwrap();
    slot.as_ref()
        .map(|engine| (engine.runtime.clone(), engine.tts.clone(), engine.voice.clone()))
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
    *slot = Some(Engine {
        runtime: Arc::new(runtime),
        tts: Arc::new(tts),
        voice,
    });
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
    let Some((runtime, tts, voice)) = engine_handles() else {
        return std::ptr::null_mut();
    };
    let voice = Voice::new(voice);
    match runtime.block_on(tts.synth(input.as_str(), voice)) {
        Ok((samples, took)) => {
            log::info!(
                "synthesis: generationMs={} wallMs={} samples={} audioMs={}",
                took.as_millis(),
                started.elapsed().as_millis(),
                samples.len(),
                if samples.is_empty() { 0 } else { samples.len() * 1000 / SAMPLE_RATE }
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
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamStart(
    mut env: JNIEnv,
    _class: JClass,
    text: JString,
) -> jstring {
    let input = match env.get_string(&text) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "text unavailable"),
    };
    let Some((runtime, tts, voice)) = engine_handles() else {
        return to_jstring(&mut env, "engine not initialized");
    };
    let started = Instant::now();
    let result = runtime.block_on(async {
        let (mut sink, stream) = tts.stream::<String, _>(Voice::new(voice));
        sink.synth(input).await?;
        Ok::<_, kokoro_en::KokoroError>((sink, stream))
    });
    match result {
        Ok((sink, stream)) => {
            let mut slot = stream_slot().lock().unwrap();
            *slot = Some(StreamSession {
                sink: Some(sink),
                stream,
            });
            log::info!("stream: started in {}ms", started.elapsed().as_millis());
            std::ptr::null_mut()
        }
        Err(error) => {
            log::error!("stream start failed: {error}");
            to_jstring(&mut env, &format!("stream start failed: {error}"))
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamPush(
    mut env: JNIEnv,
    _class: JClass,
    text: JString,
) {
    let input = match env.get_string(&text) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => {
            log::error!("stream push: text unavailable");
            return;
        }
    };
    let Some((runtime, _tts, _voice)) = engine_handles() else {
        return;
    };
    let mut slot = stream_slot().lock().unwrap();
    let Some(session) = slot.as_mut() else {
        log::error!("stream push: no active stream");
        return;
    };
    let Some(sink) = session.sink.as_mut() else {
        log::error!("stream push: input already closed");
        return;
    };
    if let Err(error) = runtime.block_on(sink.synth(input)) {
        log::error!("stream push failed: {error}");
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamFinish(
    _env: JNIEnv,
    _class: JClass,
) {
    let mut slot = stream_slot().lock().unwrap();
    if let Some(session) = slot.as_mut() {
        if session.sink.take().is_some() {
            log::info!("stream: input closed");
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamNext(
    env: JNIEnv,
    _class: JClass,
) -> jfloatArray {
    let Some((runtime, _tts, _voice)) = engine_handles() else {
        return std::ptr::null_mut();
    };
    let started = Instant::now();
    let next = {
        let mut slot = stream_slot().lock().unwrap();
        let Some(session) = slot.as_mut() else {
            return std::ptr::null_mut();
        };
        runtime.block_on(session.stream.next())
    };
    match next {
        Some((samples, took)) => {
            log::info!(
                "stream: chunk generationMs={} waitMs={} samples={} audioMs={} leadSilenceMs={} tailSilenceMs={}",
                took.as_millis(),
                started.elapsed().as_millis(),
                samples.len(),
                if samples.is_empty() { 0 } else { samples.len() * 1000 / SAMPLE_RATE },
                silence_ms(&samples, true),
                silence_ms(&samples, false)
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
        None => {
            log::info!("stream: completed waitMs={}", started.elapsed().as_millis());
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamClear(
    _env: JNIEnv,
    _class: JClass,
) {
    let mut slot = stream_slot().lock().unwrap();
    if slot.is_some() {
        *slot = None;
        log::info!("stream: cleared");
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeRelease(
    _env: JNIEnv,
    _class: JClass,
) {
    *stream_slot().lock().unwrap() = None;
    let mut slot = engine_slot().lock().unwrap();
    *slot = None;
    log::info!("engine released");
}
