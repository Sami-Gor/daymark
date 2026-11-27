/*
 * Minimal Rust -> JNI bridge for the Kokoro local-TTS proof of concept.
 *
 * Exposes native calls used by KokoroLocalTtsEngine:
 *   nativeInit(modelPath, voicesDir, defaultVoice) -> error string or null
 *   nativeSynth(text, lang, voiceName) -> FloatArray of 24 kHz mono PCM, or null
 *   nativeStreamStart(text, lang, voiceName) -> error string or null
 *   nativeStreamNext() -> next sentence FloatArray, or null when finished
 *   nativeStreamClear() -> drops the active stream
 *   nativeRelease() -> frees the engine
 *
 * Kokoro's KokoroTts::new() loads the model and every <voice>.bin in the
 * voices directory from files inside the app's files directory. English uses
 * the existing Misaki path; French and Spanish use piper-plus-g2p 0.5.3 and
 * the explicit PUA-to-Kokoro adapter. Everything runs offline. Logs use the
 * Rust `log` crate and are surfaced in logcat under DaymarkKokoroTts.
 */
use futures::StreamExt;
use jni::objects::{JClass, JString};
use jni::sys::{jfloatArray, jstring};
use jni::JNIEnv;
use kokoro_en::{KokoroTts, SynthSink, SynthStream, Voice};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tokio::runtime::Runtime;

pub mod piper_g2p;

use piper_g2p::{phonemize, PIPER_PLUS_G2P_VERSION};

const LOG_TAG: &str = "DaymarkKokoroTts";
const SAMPLE_RATE: usize = 24000;

#[derive(Clone, Copy)]
enum NarrationLang {
    English,
    French,
    Spanish,
}

impl NarrationLang {
    fn parse(lang: &str) -> Result<Self, String> {
        let base = lang.trim().to_lowercase();
        let base = base.split(['-', '_']).next().unwrap_or("");
        match base {
            "en" => Ok(Self::English),
            "fr" => Ok(Self::French),
            "es" => Ok(Self::Spanish),
            _ => Err(format!("unsupported narration language: {lang}")),
        }
    }

    fn is_english(self) -> bool {
        matches!(self, Self::English)
    }
}

struct Engine {
    runtime: Arc<Runtime>,
    tts: Arc<KokoroTts>,
    voice: String,
}

struct StreamSession {
    sink: Option<SynthSink<String>>,
    stream: SynthStream,
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
    voices_path: JString,
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
    let voices_dir = match env.get_string(&voices_path) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "voices path unavailable"),
    };
    let voice = match env.get_string(&voice_name) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "voice name unavailable"),
    };

    // The app ships no eSpeak binary and no eSpeak dependency. Disable the
    // dormant CLI fallback in the existing lean `kokoro-en` build so the
    // English path cannot invoke a system espeak-ng even if one exists.
    std::env::set_var("KOKORO_ESPEAK_NG", "0");
    std::env::set_var("KOKORO_G2P_SEGMENT_ESPEAK", "0");

    let runtime = match tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build() {
        Ok(value) => value,
        Err(error) => return to_jstring(&mut env, &format!("tokio runtime failed: {error}")),
    };

    log::info!(
        "initialize: piper-plus-g2p={} pua_compat={} voicesDir={}",
        PIPER_PLUS_G2P_VERSION,
        piper_g2p::PUA_COMPAT_VERSION,
        voices_dir
    );
    let tts = match runtime.block_on(KokoroTts::new(&model, &voices_dir)) {
        Ok(value) => value,
        Err(error) => {
            log::error!("model load failed: {error}");
            return to_jstring(&mut env, &format!("model load failed: {error}"));
        }
    };

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
    lang: JString,
    voice_name: JString,
) -> jfloatArray {
    let input = match env.get_string(&text) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return std::ptr::null_mut(),
    };
    let lang = match env.get_string(&lang) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return std::ptr::null_mut(),
    };
    let voice_name = match env.get_string(&voice_name) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return std::ptr::null_mut(),
    };
    let started = Instant::now();
    let Some((runtime, tts, _default_voice)) = engine_handles() else {
        return std::ptr::null_mut();
    };
    let language = match NarrationLang::parse(&lang) {
        Ok(value) => value,
        Err(error) => {
            log::error!("synthesis rejected: {error}");
            return std::ptr::null_mut();
        }
    };

    let result = if language.is_english() {
        runtime.block_on(tts.synth(input.as_str(), Voice::new(voice_name)))
    } else {
        match phonemize(&lang, &input) {
            Ok(ipa) => {
                log::info!("phonemized: lang={lang} ipa_chars={}", ipa.chars().count());
                runtime.block_on(tts.synth_phonemes(ipa, Voice::new(voice_name)))
            }
            Err(error) => {
                log::error!("phonemisation failed: lang={lang} error={error}");
                return std::ptr::null_mut();
            }
        }
    };

    match result {
        Ok((samples, took)) => {
            log::info!(
                "synthesis: lang={} generationMs={} wallMs={} samples={} audioMs={}",
                lang,
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
            log::error!("synthesis failed: lang={lang} error={error}");
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_io_github_sami_1gor_daymark_tts_KokoroLocalTtsEngine_nativeStreamStart(
    mut env: JNIEnv,
    _class: JClass,
    text: JString,
    lang: JString,
    voice_name: JString,
) -> jstring {
    let input = match env.get_string(&text) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "text unavailable"),
    };
    let lang = match env.get_string(&lang) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "language unavailable"),
    };
    let voice_name = match env.get_string(&voice_name) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return to_jstring(&mut env, "voice unavailable"),
    };
    let language = match NarrationLang::parse(&lang) {
        Ok(value) => value,
        Err(error) => return to_jstring(&mut env, &error),
    };
    if !language.is_english() {
        // French and Spanish are prephonemized in nativeSynth; the Java layer
        // deliberately falls back to monolithic synthesis for those locales.
        return to_jstring(&mut env, "prephonemized stream not available");
    }
    let Some((runtime, tts, _default_voice)) = engine_handles() else {
        return to_jstring(&mut env, "engine not initialized");
    };
    let result = runtime.block_on(async {
        let (mut sink, stream) = tts.stream::<String, _>(Voice::new(voice_name));
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
        session.sink.take();
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
    let next = {
        let mut slot = stream_slot().lock().unwrap();
        let Some(session) = slot.as_mut() else {
            return std::ptr::null_mut();
        };
        runtime.block_on(session.stream.next())
    };
    match next {
        Some((samples, _took)) => {
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
}
