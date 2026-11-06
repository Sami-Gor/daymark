use std::{
    env,
    error::Error,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};

#[path = "../src/piper_g2p.rs"]
mod piper_g2p;

use futures::StreamExt;
use kokoro_en::{
    KokoroTts, Voice, get_token_ids, g2p, unknown_phonemes, MAX_PHONEME_CHARS,
};
use piper_g2p::phonemize;

const SAMPLE_RATE: u32 = 24_000;
fn default_assets() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../artifacts/weather-app/android/daymark-voice/src/main/assets/kokoro")
}

/// French/Spanish voices are debug-POC material and are staged in the debug
/// source set, so release packaging cannot pick them up.
fn debug_voices() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../artifacts/weather-app/android/daymark-voice/src/debug/assets/kokoro")
}

#[derive(Debug)]
struct Args {
    lang: String,
    voice: String,
    mode: String,
    segments: PathBuf,
    repeats: usize,
    delay_ms: u64,
    wav: Option<PathBuf>,
}

fn parse_args() -> Result<Args, String> {
    let mut lang = None;
    let mut voice = None;
    let mut mode = None;
    let mut segments = None;
    let mut repeats = 1usize;
    let mut delay_ms = 0u64;
    let mut wav = None;
    let mut it = env::args().skip(1);
    while let Some(arg) = it.next() {
        let mut value = || it.next().ok_or_else(|| format!("missing value for {arg}"));
        match arg.as_str() {
            "--lang" => lang = Some(value()?),
            "--voice" => voice = Some(value()?),
            "--mode" => mode = Some(value()?),
            "--segments" => segments = Some(PathBuf::from(value()?)),
            "--repeats" => {
                repeats = value()?
                    .parse()
                    .map_err(|_| "invalid --repeats".to_owned())?
            }
            "--delay-ms" => {
                delay_ms = value()?
                    .parse()
                    .map_err(|_| "invalid --delay-ms".to_owned())?
            }
            "--wav" => wav = Some(PathBuf::from(value()?)),
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Args {
        lang: lang.ok_or("missing --lang")?,
        voice: voice.ok_or("missing --voice")?,
        mode: mode.ok_or("missing --mode")?,
        segments: segments.ok_or("missing --segments")?,
        repeats,
        delay_ms,
        wav,
    })
}

fn rss_kb() -> Option<u64> {
    let pid = std::process::id().to_string();
    let output = Command::new("ps")
        .args(["-o", "rss=", "-p", &pid])
        .output()
        .ok()?;
    String::from_utf8(output.stdout)
        .ok()?
        .trim()
        .parse()
        .ok()
}

fn write_wav(path: &Path, samples: &[f32]) -> Result<(), Box<dyn Error>> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut data = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        data.extend_from_slice(&value.to_le_bytes());
    }
    let mut file = fs::File::create(path)?;
    let n = data.len() as u32;
    file.write_all(b"RIFF")?;
    file.write_all(&(36 + n).to_le_bytes())?;
    file.write_all(b"WAVEfmt ")?;
    file.write_all(&16u32.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&SAMPLE_RATE.to_le_bytes())?;
    file.write_all(&(SAMPLE_RATE * 2).to_le_bytes())?;
    file.write_all(&2u16.to_le_bytes())?;
    file.write_all(&16u16.to_le_bytes())?;
    file.write_all(b"data")?;
    file.write_all(&n.to_le_bytes())?;
    file.write_all(&data)?;
    Ok(())
}

fn avg(values: &[f32]) -> f32 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().copied().sum::<f32>() / values.len() as f32
    }
}

fn peak(values: &[f32]) -> f32 {
    values.iter().fold(0.0f32, |a, v| a.max(v.abs()))
}

async fn run() -> Result<(), Box<dyn Error>> {
    env::set_var("KOKORO_ESPEAK_NG", "0");
    env::set_var("KOKORO_ORT_PROVIDER", "cpu");
    env::set_var("KOKORO_G2P_SEGMENT_ESPEAK", "0");
    let args = parse_args()?;
    let segments = fs::read_to_string(&args.segments)?
        .split('\0')
        .filter(|segment| !segment.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if segments.is_empty() {
        return Err("segment file contains no segments".into());
    }
    let assets = default_assets();
    let model = env::var_os("DAYMARK_KOKORO_MODEL")
        .map(PathBuf::from)
        .unwrap_or_else(|| assets.join("model_quantized.onnx"));
    let voices = env::var_os("DAYMARK_KOKORO_VOICES")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let multilingual = debug_voices();
            if multilingual.is_dir() {
                multilingual
            } else {
                assets
            }
        });

    println!("MAX_PHONEME_CHARS={MAX_PHONEME_CHARS}");
    let init_start = Instant::now();
    let tts = KokoroTts::new(&model, &voices).await?;
    let init_ms = init_start.elapsed().as_secs_f64() * 1000.0;
    println!(
        "INIT\t{}\t{}\t{}\t{}",
        init_ms,
        rss_kb().unwrap_or(0),
        args.mode,
        args.lang
    );

    let mut all_samples = Vec::new();
    let total_start = Instant::now();
    for run_index in 0..args.repeats {
        let run_start = Instant::now();
        let mut first_audio_ms: Option<f64> = None;
        let mut run_samples = Vec::new();
        let mut run_g2p_ms = 0.0;
        let mut run_token_ms = 0.0;
        let mut run_synth_ms = 0.0;
        let mut run_ipa_chars = 0usize;
        let mut run_token_count = 0usize;
        let mut run_unknown = 0usize;
        let mut last_samples = 0usize;

        if args.lang.starts_with("en") {
            if args.mode != "en-stream" {
                return Err("English benchmark requires --mode en-stream".into());
            }
            let (mut sink, mut stream) = tts.stream::<String, _>(Voice::new(args.voice.as_str()));
            for (index, segment) in segments.iter().enumerate() {
                // Component timing for the report. The actual synthesis below
                // uses the existing English stream path and repeats its own G2P.
                let component_start = Instant::now();
                let ipa = g2p(segment, false)?;
                let g2p_ms = component_start.elapsed().as_secs_f64() * 1000.0;
                let token_start = Instant::now();
                let tokens = get_token_ids(&ipa, false);
                let token_ms = token_start.elapsed().as_secs_f64() * 1000.0;
                let unknown = unknown_phonemes(&ipa, false);
                let synth_start = Instant::now();
                sink.synth(segment.clone()).await?;
                let (samples, _) = stream
                    .next()
                    .await
                    .ok_or_else(|| format!("English stream ended early at segment {index}"))?;
                let synth_ms = synth_start.elapsed().as_secs_f64() * 1000.0;
                run_g2p_ms += g2p_ms;
                run_token_ms += token_ms;
                run_synth_ms += synth_ms;
                run_ipa_chars += ipa.chars().count();
                run_token_count += tokens.len();
                run_unknown += unknown.len();
                last_samples = samples.len();
                if first_audio_ms.is_none() {
                    first_audio_ms = Some(run_start.elapsed().as_secs_f64() * 1000.0);
                }
                run_samples.extend_from_slice(&samples);
                println!(
                    "SEG\t{run_index}\t{index}\t{g2p_ms:.3}\t{token_ms:.3}\t{synth_ms:.3}\t{}\t{}\t{}\t{}\t{}",
                    samples.len(),
                    ipa.chars().count(),
                    tokens.len(),
                    unknown.len(),
                    unknown.len()
                );
                if args.delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(args.delay_ms));
                }
            }
        } else {
            if args.mode != "monolithic" {
                return Err("French/Spanish benchmark requires --mode monolithic".into());
            }
            for (index, segment) in segments.iter().enumerate() {
                let g2p_start = Instant::now();
                let ipa = phonemize(&args.lang, segment)?;
                let g2p_ms = g2p_start.elapsed().as_secs_f64() * 1000.0;
                let token_start = Instant::now();
                let tokens = get_token_ids(&ipa, false);
                let token_ms = token_start.elapsed().as_secs_f64() * 1000.0;
                let unknown = unknown_phonemes(&ipa, false);
                let synth_start = Instant::now();
                let (samples, _) = tts
                    .synth_phonemes(&ipa, Voice::new(args.voice.as_str()))
                    .await?;
                let synth_ms = synth_start.elapsed().as_secs_f64() * 1000.0;
                run_g2p_ms += g2p_ms;
                run_token_ms += token_ms;
                run_synth_ms += synth_ms;
                run_ipa_chars += ipa.chars().count();
                run_token_count += tokens.len();
                run_unknown += unknown.len();
                last_samples = samples.len();
                if first_audio_ms.is_none() {
                    first_audio_ms = Some(run_start.elapsed().as_secs_f64() * 1000.0);
                }
                run_samples.extend_from_slice(&samples);
                println!(
                    "SEG\t{run_index}\t{index}\t{g2p_ms:.3}\t{token_ms:.3}\t{synth_ms:.3}\t{}\t{}\t{}\t{}\t{}",
                    samples.len(),
                    ipa.chars().count(),
                    tokens.len(),
                    unknown.len(),
                    unknown.len()
                );
                if args.delay_ms > 0 {
                    std::thread::sleep(Duration::from_millis(args.delay_ms));
                }
            }
        }

        let finite = run_samples.iter().all(|s| s.is_finite());
        let run_ms = run_start.elapsed().as_secs_f64() * 1000.0;
        let duration = run_samples.len() as f64 / f64::from(SAMPLE_RATE);
        println!(
            "RUN\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
            run_index,
            run_samples.len(),
            duration,
            run_g2p_ms,
            run_token_ms,
            run_synth_ms,
            run_ipa_chars,
            run_token_count,
            run_unknown,
            run_ms,
            finite,
            peak(&run_samples),
            avg(&run_samples),
            last_samples,
            rss_kb().unwrap_or(0),
            first_audio_ms.unwrap_or(0.0)
        );
        all_samples = run_samples;
        if run_index == 0 {
            if let Some(wav) = &args.wav {
                write_wav(wav, &all_samples)?;
                println!("WAV\t{}", wav.display());
            }
        }
    }
    let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
    println!(
        "TOTAL\t{}\t{}\t{}\t{}",
        total_ms,
        all_samples.len() as f64 / f64::from(SAMPLE_RATE),
        rss_kb().unwrap_or(0),
        args.delay_ms
    );
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    tokio::runtime::Runtime::new()?.block_on(run())
}
