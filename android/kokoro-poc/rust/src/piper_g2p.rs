//! French and Latin American Spanish phonemisation for the local Kokoro POC.
//!
//! `piper-plus-g2p` returns Piper-specific PUA tokens for multi-character
//! phonemes. This adapter converts those tokens to the IPA vocabulary used by
//! the existing Kokoro tokenizer. Unknown PUA or Kokoro phonemes are errors;
//! they are never silently dropped.

use piper_plus_g2p::french::FrenchPhonemizer;
use piper_plus_g2p::phonemizer::Phonemizer;
use piper_plus_g2p::spanish::SpanishPhonemizer;
use piper_plus_g2p::token_map::pua_to_token;
use regex::Regex;
use std::sync::LazyLock;

pub(crate) const PIPER_PLUS_G2P_VERSION: &str = "0.5.3";
pub(crate) const PUA_COMPAT_VERSION: u32 = piper_plus_g2p::token_map::PUA_COMPAT_VERSION;

static WORD_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[\p{L}'-]+").expect("valid French word regex"));

/// Convert a candidate PUA token stream to the IPA string expected by Kokoro.
pub(crate) fn candidate_tokens_to_ipa(tokens: &[String]) -> Result<String, String> {
    let mut ipa = String::new();

    for token in tokens {
        for ch in token.chars() {
            if let Some(name) = pua_to_token(ch) {
                let mapped = match name {
                    // Piper-specific multi-character tokens; map explicitly
                    // to the closest Kokoro/IPA symbol.
                    "rr" => "r",
                    "tʃ" => "ʧ",
                    "dʒ" => "ʤ",
                    "y_vowel" => "y",
                    _ => name,
                };
                ipa.push_str(mapped);
            } else if (0xE000..=0xF8FF).contains(&(ch as u32)) {
                return Err(format!(
                    "unmapped piper-plus-g2p PUA character U+{:04X} in token {:?}",
                    ch as u32, token
                ));
            } else {
                ipa.push(ch);
            }
        }
    }

    let ipa = ipa.trim().to_owned();
    let unknown = kokoro_en::unknown_phonemes(&ipa, false);
    if !unknown.is_empty() {
        return Err(format!(
            "unmapped phonemes after piper-plus-g2p adapter: {:?}",
            unknown
        ));
    }
    Ok(ipa)
}

/// `piper-plus-g2p` 0.5.3 misreads final `g` in `vingt` and final `q` in
/// `cinq`, and does not know the pronounced `t` in 21–29. These are G2P
/// spelling hints only; the caller still receives the proper written words.
fn french_g2p_hints(text: &str) -> String {
    let words: Vec<&str> = WORD_RE.find_iter(text).map(|m| m.as_str()).collect();
    let mut out = String::with_capacity(text.len());
    let mut last = 0usize;
    let mut word_index = 0usize;

    for m in WORD_RE.find_iter(text) {
        out.push_str(&text[last..m.start()]);
        let word = m.as_str();
        let next = words.get(word_index + 1).copied();
        let next_next = words.get(word_index + 2).copied();
        let mut hinted = word.to_owned();

        if hinted.contains("quatre-vingt") {
            // 80–99: the final t of vingt is silent.
            hinted = hinted.replace("quatre-vingt", "quatre-vin");
        } else if hinted == "vingt" {
            // 21–29: vingt et un / vingt-cinq; 20 alone: vingt.
            let has_unit = next == Some("et") && next_next == Some("un")
                || next.is_some_and(is_single_digit_word);
            hinted = if has_unit { "vinte".to_owned() } else { "vin".to_owned() };
        } else if let Some(rest) = hinted.strip_prefix("vingt-") {
            hinted = if rest == "et-un" || is_single_digit_word(rest) {
                format!("vinte-{rest}")
            } else {
                format!("vin-{rest}")
            };
        }

        if hinted == "cinq" {
            hinted = "cinque".to_owned();
        } else if let Some(prefix) = hinted.strip_suffix("-cinq") {
            hinted = format!("{prefix}-cinque");
        }

        out.push_str(&hinted);
        last = m.end();
        word_index += 1;
    }

    out.push_str(&text[last..]);
    out
}

fn is_single_digit_word(word: &str) -> bool {
    matches!(
        word,
        "un" | "deux" | "trois" | "quatre" | "cinq" | "six" | "sept" | "huit" | "neuf"
    )
}

/// French or Latin American Spanish text to Kokoro-compatible IPA.
pub fn phonemize(lang: &str, text: &str) -> Result<String, String> {
    let base = lang.trim().to_lowercase();
    let base = base.split(['-', '_']).next().unwrap_or("");
    match base {
        "fr" => {
            let hinted = french_g2p_hints(text);
            let phonemizer = FrenchPhonemizer::new();
            let (tokens, _) = phonemizer
                .phonemize_with_prosody(&hinted)
                .map_err(|error| format!("French phonemisation failed: {error}"))?;
            candidate_tokens_to_ipa(&tokens)
        }
        "es" => {
            // SpanishPhonemizer uses Latin American seseo rules; do not
            // substitute a Castilian /θ/ path.
            let phonemizer = SpanishPhonemizer::new();
            let (tokens, _) = phonemizer
                .phonemize_with_prosody(text)
                .map_err(|error| format!("Spanish phonemisation failed: {error}"))?;
            candidate_tokens_to_ipa(&tokens)
        }
        _ => Err(format!("unsupported narration language: {lang}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kokoro_en::{MAX_PHONEME_CHARS, chunk_phonemes, get_token_ids, is_supported_phone};
    use piper_plus_g2p::token_map::FIXED_PUA_MAP;

    #[test]
    fn verifies_pinned_kokoro_chunk_boundary() {
        assert_eq!(MAX_PHONEME_CHARS, 510);
        let exact = "a".repeat(MAX_PHONEME_CHARS);
        let exact_chunks = chunk_phonemes(&exact, MAX_PHONEME_CHARS);
        assert_eq!(exact_chunks.len(), 1);
        assert_eq!(exact_chunks[0].chars().count(), MAX_PHONEME_CHARS);

        let over = "a".repeat(MAX_PHONEME_CHARS + 1);
        let over_chunks = chunk_phonemes(&over, MAX_PHONEME_CHARS);
        assert_eq!(over_chunks.len(), 2);
        assert_eq!(over_chunks.iter().map(|c| c.chars().count()).sum::<usize>(), MAX_PHONEME_CHARS + 1);
        assert!(over_chunks.iter().all(|c| c.chars().count() <= MAX_PHONEME_CHARS));
    }

    #[test]
    fn maps_piper_pua_for_spanish_trill_and_affricate() {
        let ipa = candidate_tokens_to_ipa(&["\u{e01d}".into(), "a".into(), " ".into(), "\u{e054}".into()])
            .expect("mapped");
        assert_eq!(ipa, "ra ʧ");
    }

    #[test]
    fn maps_french_nasals_and_y_vowel() {
        let ipa = candidate_tokens_to_ipa(&["\u{e056}".into(), "\u{e057}".into(), "\u{e058}".into(), "\u{e01e}".into()])
            .expect("mapped");
        assert_eq!(ipa, "ɛ̃ɑ̃ɔ̃y");
    }

    #[test]
    fn rejects_unknown_pua() {
        for code in ['\u{e0ff}', '\u{f000}'] {
            let error = candidate_tokens_to_ipa(&[code.to_string()]).expect_err("must reject");
            assert!(error.contains("unmapped piper-plus-g2p PUA"), "{error}");
        }
    }

    #[test]
    fn maps_dzh_to_kokoro_dzh() {
        let ipa = candidate_tokens_to_ipa(&["\u{e055}".into()]).expect("mapped");
        assert_eq!(ipa, "ʤ");
        assert_eq!(get_token_ids(&ipa, false), vec![0, 82, 0]);
    }

    #[test]
    fn exercises_every_documented_pua_mapping() {
        for (token, code) in FIXED_PUA_MAP.iter() {
            let pua = char::from_u32(*code).expect("valid PUA");
            match candidate_tokens_to_ipa(&[pua.to_string()]) {
                Ok(ipa) => assert!(!ipa.is_empty(), "empty mapping for {token}"),
                Err(error) => assert!(
                    error.contains("unmapped phonemes") || error.contains("PUA"),
                    "unexpected error for {token}: {error}"
                ),
            }
        }
    }

    #[test]
    fn every_supported_kokoro_phone_maps_to_a_token() {
        let mut supported = 0usize;
        for code in 0..=0x10ffff {
            let Some(ch) = char::from_u32(code) else { continue };
            if !is_supported_phone(ch, false) {
                continue;
            }
            supported += 1;
            let ids = get_token_ids(&ch.to_string(), false);
            assert_eq!(ids.len(), 3, "phone {ch:?} was silently skipped");
            assert!(ids[1] >= 1, "phone {ch:?} has no token");
        }
        assert!(supported > 100, "unexpectedly small Kokoro vocabulary");
    }

    #[test]
    fn unicode_nfd_and_nfc_are_equivalent() {
        let fr_nfc = phonemize("fr-FR", "é").expect("French NFC");
        let fr_nfd = phonemize("fr-FR", "e\u{301}").expect("French NFD");
        assert_eq!(fr_nfc, fr_nfd);
        let es_nfc = phonemize("es-419", "mañana").expect("Spanish NFC");
        let es_nfd = phonemize("es-419", "man\u{303}ana").expect("Spanish NFD");
        assert_eq!(es_nfc, es_nfd);
    }

    #[test]
    fn unknown_kokoro_phoneme_is_an_error() {
        let error = candidate_tokens_to_ipa(&["ɮ".into()]).expect_err("must reject");
        assert!(error.contains("unmapped phonemes"), "{error}");
    }

    #[test]
    fn french_vingt_cinq_hint_produces_t_and_k() {
        let hinted = french_g2p_hints("vingt-cinq");
        assert_eq!(hinted, "vinte-cinque");
        let ipa = phonemize("fr-FR", "vingt-cinq").expect("French");
        assert!(ipa.contains("vɛ̃t"), "IPA: {ipa}");
        assert!(ipa.contains("sɛ̃k"), "IPA: {ipa}");
    }

    #[test]
    fn french_twenty_and_eighty_do_not_gain_t() {
        assert_eq!(french_g2p_hints("vingt"), "vin");
        assert_eq!(french_g2p_hints("quatre-vingt"), "quatre-vin");
        let ipa = phonemize("fr-FR", "vingt").expect("French");
        assert!(!ipa.contains("vɛ̃t"), "IPA: {ipa}");
    }

    #[test]
    fn spanish_uses_seseo_not_castilian_theta() {
        let ipa = phonemize("es-ES", "doce grados y veinticinco por ciento").expect("Spanish");
        assert!(!ipa.contains('θ'), "IPA: {ipa}");
        assert!(ipa.contains('s'), "IPA: {ipa}");
    }

    #[test]
    fn unsupported_language_is_explicit() {
        assert!(phonemize("de-DE", "Guten Morgen").is_err());
    }
}
