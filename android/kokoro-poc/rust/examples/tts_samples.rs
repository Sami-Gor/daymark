use std::{
    error::Error,
    fs,
    io::Write,
    path::Path,
};
#[path = "../src/piper_g2p.rs"]
mod piper_g2p;
use piper_g2p::phonemize;
use kokoro_en::{KokoroTts, Voice, get_token_ids, unknown_phonemes};

const SAMPLE_RATE: u32 = 24_000;
const ROOT: &str = env!("CARGO_MANIFEST_DIR");

fn wav(path: &Path, samples: &[f32]) -> Result<(), Box<dyn Error>> {
    let mut data = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * 32767.0).round() as i16;
        data.extend_from_slice(&v.to_le_bytes());
    }
    let mut f = fs::File::create(path)?;
    let n = data.len() as u32;
    f.write_all(b"RIFF")?;
    f.write_all(&(36 + n).to_le_bytes())?;
    f.write_all(b"WAVEfmt ")?;
    f.write_all(&16u32.to_le_bytes())?;
    f.write_all(&1u16.to_le_bytes())?;
    f.write_all(&1u16.to_le_bytes())?;
    f.write_all(&SAMPLE_RATE.to_le_bytes())?;
    f.write_all(&(SAMPLE_RATE * 2).to_le_bytes())?;
    f.write_all(&2u16.to_le_bytes())?;
    f.write_all(&16u16.to_le_bytes())?;
    f.write_all(b"data")?;
    f.write_all(&n.to_le_bytes())?;
    f.write_all(&data)?;
    Ok(())
}

async fn synth(tts: &KokoroTts, label: &str, lang: &str, text: &str, voice: &str) -> Result<(), Box<dyn Error>> {
    let samples = if lang.starts_with("en") {
        tts.synth(text, Voice::new(voice)).await?.0
    } else {
        let ipa = phonemize(lang, text)?;
        let unknown = unknown_phonemes(&ipa, false);
        let tokens = get_token_ids(&ipa, false);
        println!("{label}: ipa={ipa:?}");
        println!("{label}: tokens={tokens:?} token_count={} unknown={unknown:?}", tokens.len());
        tts.synth_phonemes(ipa, Voice::new(voice)).await?.0
    };
    let path = Path::new(ROOT).join("../../../test-audio").join(format!("{label}.wav"));
    fs::create_dir_all(path.parent().unwrap())?;
    wav(&path, &samples)?;
    println!("{label}: {} samples -> {}", samples.len(), path.display());
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    tokio::runtime::Runtime::new()?.block_on(run())
}

async fn run() -> Result<(), Box<dyn Error>> {
    std::env::set_var("KOKORO_G2P_SEGMENT_ESPEAK", "0");
    let model = Path::new(ROOT).join("../../../artifacts/weather-app/android/daymark-voice/src/main/assets/kokoro/model_quantized.onnx");
    let release_voices = Path::new(ROOT).join("../../../artifacts/weather-app/android/daymark-voice/src/main/assets/kokoro");
    let debug_voices = Path::new(ROOT).join("../../../artifacts/weather-app/android/daymark-voice/src/debug/assets/kokoro");
    let voices = if debug_voices.is_dir() { debug_voices } else { release_voices };
    let tts = KokoroTts::new(&model, &voices).await?;
    let fr = [
        ("fr-12", "Il fait douze degrés."),
        ("fr-minus3", "Il fait moins trois degrés."),
        ("fr-25", "Le vent souffle à vingt-cinq kilomètres par heure."),
        ("fr-70", "L’humidité est de soixante-dix pour cent."),
        ("fr-decimal", "Il fait douze virgule cinq degrés."),
    ];
    for (label, text) in fr {
        synth(&tts, label, "fr-FR", text, "ff_siwis").await?;
    }
    let es = [
        ("es-12", "Hace doce grados."),
        ("es-minus3", "Hace menos tres grados."),
        ("es-25", "El viento sopla a veinticinco kilómetros por hora."),
        ("es-70", "La humedad es del setenta por ciento."),
        ("es-decimal", "Hace doce coma cinco grados."),
    ];
    for (label, text) in es {
        synth(&tts, label, "es-ES", text, "em_alex").await?;
    }
    synth(&tts, "en-control", "en-GB", "Good morning. It will be cold and rainy tomorrow.", "bm_fable").await?;
    Ok(())
}
