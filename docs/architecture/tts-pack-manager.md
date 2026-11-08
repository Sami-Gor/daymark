# Optional narration packs — manifest, transport and signing (Agent C)

Status: implemented on `feat/tts-pack-manager` (based on `3426bb4`).
Audience: the native voice plugin (Agent B), the Android app shell (Agent F), and
release engineering.

This document describes the pack manager that delivers the optional French
(`ff_siwis`) and Spanish (`em_alex`) Kokoro narration voices. English
(`bm_fable`) is built in and is never downloadable or removable.

## 1. Components

| Class | Responsibility |
|---|---|
| `packs.PackManifest` | Strict manifest parser, model and canonical bytes. |
| `packs.PackLicences` | Licence/attribution policy constants and validation. |
| `packs.PackTransport` | Transport boundary: HTTPS GET, Range/resume, progress, cancellation. |
| `packs.HttpUrlConnectionTransport` | `HttpURLConnection` implementation. No credentials. |
| `packs.PackStoragePreflight` | Peak-space check for download + voice copy + margin. |
| `packs.PackDownloader` | Fetch/verify, download/stage, install, publish voice, activate, remove. |
| `packs.PackInstaller` | Existing core: stage, SHA-256 verify, atomic activate/remove (extended with `installStaged`, `stagingPart`, `root`). |
| `packs.PackSignatureVerifier` | Detached Ed25519 verification over canonical manifest bytes. |
| `packs.PackTrustAnchor` | Pinned Ed25519 public key. |
| `packs.Ed25519` | RFC 8032 verification-only implementation for API 29 compatibility. |

Package: `artifacts/weather-app/android/daymark-voice/src/main/java/io/github/sami_gor/daymark/packs/`.

## 2. On-disk layout

```text
filesDir/
  kokoro/
    bm_fable.bin                 built-in English (never touched by removal)
    ff_siwis.bin                 installed French voice (published atomically)
    em_alex.bin                  installed Spanish voice
    .ff_siwis.bin.backup         transient rollback copy, ignored by VoiceRegistry
    .ff_siwis.bin.tmp            transient publish copy, ignored by VoiceRegistry
  packs/
    staging/
      fr-3.part                  resumable download (Range target)
    packs/
      fr/
        current                  active version, newline-terminated, atomic replace
        3/
          payload                verified voice payload
          .ready                 readiness marker
            1/ ...               previous version retained for rollback
```

`PackInstaller` already owned this layout. `PackDownloader` stages directly into
`<root>/staging/<packId>-<version>.part` and hands that file to
`PackInstaller.installStaged`, which re-checks size and SHA-256 before moving it
into `packs/<packId>/<version>/payload`. No unverified byte reaches the version
directory.

## 3. Manifest

### 3.1 Example (French, distribution-cleared)

```json
{
  "schemaVersion": 1,
  "packId": "fr",
  "version": 3,
  "voiceId": "ff_siwis",
  "minAppVersion": 21000,
  "licence": {
    "spdx": "CC-BY-4.0",
    "name": "Creative Commons Attribution 4.0 International",
    "url": "https://creativecommons.org/licenses/by/4.0/",
    "attribution": "Voice style: ff_siwis. Source corpus: The SIWIS French Speech Synthesis Database (2016), University of Edinburgh, School of Informatics, The Centre for Speech Technology Research, https://doi.org/10.7488/ds/1705 (DataShare record 10283/2353), licensed under CC BY 4.0.",
    "notice": "... full notice, including SIWIS, DOI 10.7488/ds/1705, CC BY 4.0 and the upstream conversion statement ...",
    "rights": "cleared",
    "developmentOnly": false
  },
  "files": [
    {
      "path": "ff_siwis.bin",
      "size": 522240,
      "sha256": "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861"
    }
  ]
}
```

### 3.2 Example (Spanish, current development-only status)

Spanish manifests set `rights: "unresolved"` and `developmentOnly: true` while
the per-voice speaker/training-data rights are unresolved. This makes
`Licence.isDistributable()` false and `PackDownloader` rejects the pack unless
the caller explicitly opts into development-only packs (debug builds/tests).
The notice must carry the Apache-2.0 text reference:

```json
{
  "spdx": "Apache-2.0",
  "name": "Apache License, Version 2.0",
  "url": "https://www.apache.org/licenses/LICENSE-2.0",
  "attribution": "... em_alex ... Apache License, Version 2.0 ...",
  "notice": "... full notice with Apache License, Version 2.0 and Kokoro-82M source ...",
  "rights": "unresolved",
  "developmentOnly": true
}
```

> Note: `docs/release/v2.1-em-alex-license-review.md` records an owner clearance
> for the exact `em_alex.bin` bytes. The pack policy is deliberately more
> conservative: a release manifest may only be marked distributable when it
> explicitly says `rights: "cleared"`. Until the release manifest makes that
> claim, Spanish packs remain development-only and cannot be distributed.

### 3.3 Validation rules

Parsing is strict:

- UTF-8 only, no BOM, no comments, no trailing content, maximum 64 KiB.
- Duplicate object keys, unknown keys, non-integer numbers and wrong types are
  rejected (`duplicate-field`, `unknown-field`, `invalid-field`, `invalid-json`).
- `schemaVersion` must be `1`; `packId` must be `fr` or `es` (never `en`);
  `voiceId` must match the pack (`fr` ↔ `ff_siwis`, `es` ↔ `em_alex`);
  `version` and `minAppVersion` must be positive.
- `files` currently contains exactly one voice payload. Its path must be
  `<voiceId>.bin`, a safe relative path, with a positive size and a 64-hex
  SHA-256. Combined ASR+TTS packs are out of scope for this change.
- `licence.rights` is required. An absent flag fails with `missing-rights` and
  is never treated as distributable. `unresolved` requires
  `developmentOnly: true` (`development-only-required`).
- Voice-specific licence checks:
  - `ff_siwis`: SPDX `CC-BY-4.0`, CC BY 4.0 URL, SIWIS + DOI `10.7488/ds/1705`
    and a CC BY 4.0 statement in attribution/notice.
  - `em_alex`: SPDX `Apache-2.0`, Apache-2.0 URL, Apache License text reference
    and Kokoro-82M source in attribution/notice.
- `Licence.isDistributable()` is computed, never read from the document:
  `rights == "cleared" && !developmentOnly`.

## 4. Canonical bytes and Ed25519 signatures

The signature is a detached 64-byte RFC 8032 Ed25519 signature over
`PackManifest.canonicalBytes()`:

```text
SHA-512 is used internally by Ed25519; the signed message is exactly
{"schemaVersion":...,"packId":"fr",...}
```

Canonical form is a deterministic UTF-8 JSON serialisation with fixed field
order, no insignificant whitespace, lower-case payload digest and normalised
integer fields. The signed bytes are **not** the pretty-printed download. A
signer must parse the manifest with `PackManifest.parse`, then sign
`canonicalBytes()`; this also normalises whitespace and digest case.

`PackSignatureVerifier` is bound to a `PackTrustAnchor`:

```java
PackTrustAnchor anchor = PackTrustAnchor.fromX509(releasePublicKeyBytes);
PackSignatureVerifier verifier = new PackSignatureVerifier(anchor);
verifier.verify(manifest, detachedSignature); // throws SignatureException
```

Trust-anchor rules:

- The anchor is pinned with the app (release configuration or a release-owned
  key store), never downloaded beside the manifest.
- The verifier accepts 44-byte Ed25519 `SubjectPublicKeyInfo` encodings via
  `fromX509`, and rejects malformed, non-canonical or small-order keys.
- Tests generate an ephemeral key pair per test and never embed a production or
  development key in main sources. A generated test key must never be shipped as
  the production anchor.
- The verifier is verification-only. Signing belongs to release tooling that
  controls the private key.

### Why a checksum is not authenticity

The manifest's payload SHA-256 protects against accidental corruption and
against a payload being swapped while keeping the manifest. It does **not**
prove who wrote the manifest: anyone who controls delivery could replace both
`manifest.json` and `ff_siwis.bin` and update the checksum. Trust requires the
signature over the manifest and a pinned public key that the attacker cannot
replace. `PackDownloader` verifies the signature **before** requesting payload
bytes, then `PackInstaller` re-hashes the payload bytes.

The verifier is dependency-free because Android exposes platform Ed25519 only
from API 33 (Conscrypt 2.6), while Daymark's minimum is API 29. The JVM suite
cross-checks the implementation against the JDK Ed25519 signer and RFC 8032 test
vector 1.

## 5. Transport

`HttpUrlConnectionTransport`:

- HTTPS only; manual redirect handling revalidates every hop, so a redirect
  cannot downgrade to `http`.
- Rejects URLs containing user-info; never sets `Authorization`, token or cookie
  headers. The app must not install an authenticated global `CookieHandler`.
- `Accept-Encoding: identity` keeps `Content-Length`/`Range` meaningful.
- Resume uses `Range: bytes=<offset>-`. A `206` must carry a matching
  `Content-Range`; a server that ignores the range (`200`) restarts the file. A
  `416` retries once from zero.
- Progress is reported as `(downloaded, total)`. Cancellation is cooperative and
  leaves the partial file in place for a later resume.
- The transport does not decide whether a payload is genuine; it only moves
  bytes. Size/SHA-256 checks remain in `PackInstaller`.

There is no network access in JVM tests. `PackDownloaderTest` uses
`PackTestSupport.MockTransport`; `HttpUrlConnectionTransportTest` exercises URL
validation only (no socket is opened).

## 6. Storage preflight

`PackStoragePreflight.requiredBytes(payloadSize, alreadyDownloaded)` computes:

```text
remaining download + one full payload copy (voice publish) + margin
margin = max(16 MiB, payloadSize * 3%)
```

The margin mirrors `ModelStoragePreflight`; it covers filesystem growth and the
in-flight temporary copy. The previous working pack is retained during an update
and is accounted for by the free-space measurement itself. `PackDownloader`
checks this before the first payload byte and fails with
`insufficient-storage`.

## 7. Install, update and rollback

```text
fetch manifest + .sig → verify signature → minAppVersion → rights
  → storage preflight
  → download/append to staging/<id>-<v>.part (progress, cancellation)
  → PackInstaller.installStaged: size + SHA-256 + move to packs/<id>/<v>
  → publish verified payload as kokoro/<voiceId>.bin (temp + atomic rename)
  → PackInstaller.activate: write current.tmp + atomic rename
  → caller: registerVoice({ voiceId })
```

- The previous version directory and `current` pointer are left untouched until
  the new version's payload has been verified and published.
- If voice publication or activation fails, the previous voice bytes are
  restored from `.backup`; the previous `current` pointer was never replaced, so
  the previous version remains active.
- A failed hash or size check removes the offending `.part` (hash) or keeps it
  for resume (truncation) and never activates the version.
- Updates keep the previous version directory on disk for rollback.
- Reinstall after removal downloads and installs the same version again.

## 8. Removal and Agent B coordination

`PackDownloader.remove(packId)`:

1. Rejects `en` with `builtin-pack` (English cannot be removed).
2. Calls `PackInstaller.remove`, which deletes `packs/<id>` (payload and
   `current` pointer) and any `<id>-*.part` staging files.
3. Deletes `filesDir/kokoro/<voiceId>.bin` and its hidden backup/temp files.

The caller must then invoke the runtime's `getInstalledVoices()`. A removed
voice cannot be selected: `NarrationVoicePolicy.voiceForLanguage(...)` requires
the voice to be present in the installed set, and `VoiceRegistry` requires the
file at the canonical path. There is no English fallback.

Installation is the mirror image: after `PackDownloader.install` succeeds, the
caller must invoke `registerVoice({ voiceId })`; only after that succeeds may the
app switch its selected language/voice. On registration failure the previous
voice remains usable and the UI must offer retry/removal.

## 9. Licence metadata summary

| Pack | Voice | Licence | Required text | Rights status |
|---|---|---|---|---|
| `fr` | `ff_siwis` | CC BY 4.0 | SIWIS, DOI `10.7488/ds/1705`, CC BY 4.0 | `cleared` in a release manifest |
| `es` | `em_alex` | Apache-2.0 | Apache License, Version 2.0, Kokoro-82M source | `unresolved` → `developmentOnly: true` |

Canonical notice strings live in `PackLicences` so the app can display the same
text that the signed manifest carries. A pack with no `rights` flag is invalid
and can never be distributable.

## 10. Out of scope / follow-ups

- Hosting, CDN, URL layout and release key custody are not selected here.
- Combined ASR+TTS pack composition is owned by the broader V2.1 pack work; this
  manager currently installs one voice payload per manifest.
- The downloader does not call the Capacitor plugin itself; the caller performs
  `registerVoice`/`getInstalledVoices` and maps `PackException.reason` to UI.
- Physical-device validation of download, resume, update, removal and
  registration remains required by the V2.1 release gate.
