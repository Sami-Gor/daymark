# Optional voice-pack production delivery

Status: **configuration mechanism implemented; production inputs not supplied.**
End-to-end HTTPS delivery with a real signed French pack is **NOT TESTED** — no staging
host and no approved signing key exist yet.

## What is implemented (at `b7c561f`)

| Component | Role | Evidence |
|---|---|---|
| `PackSourceConfig` | Immutable validated source: HTTPS-only base URL, pinned raw Ed25519 public anchor (64 hex), allowed voice IDs; empty configuration throws `packs-unconfigured` | `PackSourceConfigTest` |
| `VoicePackManager` | Builds URL per voice (`<base>/<packId>/<version>/…`), starts/cancels operations, emits `voicePackProgress`, calls `PackDownloader` → `PackInstaller` → `VoiceRegistrationFlow` | `VoicePackManagerTest` |
| `PackDownloader`/`PackTransport` | HTTPS GET, Range resume, 206/416/200 handling, redirect re-validation, size cap | `HttpUrlConnectionTransportTest` (URL/validation only) |
| `PackSignatureVerifier`/`PackTrustAnchor`/`Ed25519` | Detached Ed25519 over canonical manifest bytes, pinned anchor, RFC 8032 vector | `PackSignatureVerifierTest`, `Ed25519Test` |
| `PackInstaller` | Size+SHA-256 verification, `.part` staging, atomic activation, rollback, English protection | `PackInstallerTest`, `PackToRuntimeBoundaryTest` |
| Plugin API | `getVoicePackInfo`, `installVoicePack`, `cancelVoicePackInstall`; no URL/path accepted from JS | `DaymarkVoicePlugin` + manager tests |
| React UI | `/settings` French row: real size, licence (`ff_siwis` CC BY 4.0 / SIWIS DOI 10.7488/ds/1705), consent, progress, retry, selection gated on native READY | `NarrationSettings.test.tsx` (16 tests) |

## Build-time configuration (exact variables)

Debug defaults (development only):

```
-PdaymarkDebugPackBaseUrl=<https://dev-host/...>
-PdaymarkDebugPackTrustAnchor=<64 hex Ed25519 public key>
-PdaymarkDebugPackAllowedVoices=ff_siwis
```

Release (currently empty by design → runtime `packs-unconfigured`):

```
./gradlew :app:bundleRelease \
  -PdaymarkReleasePackBaseUrl=https://<approved-host>/<approved-path> \
  -PdaymarkReleasePackTrustAnchor=<64 hex Ed25519 public key> \
  -PdaymarkReleasePackAllowedVoices=ff_siwis
```

`em_alex` must not be added to the allowed list until written speaker/likeness rights exist; the
native `SPANISH_VOICE_DISTRIBUTION_APPROVED=false` gate in release independently blocks audio.

## Manifest contract (existing schema, no second format)

`<base>/<packId>/<version>/manifest.json` (+ `manifest.json.sig`, detached Ed25519 over canonical
bytes) must carry: voice ID, locale, pack version, payload path/URL, payload size, payload SHA-256,
and licence/attribution metadata (name, SPDX, URL, attribution text for `ff_siwis`).
The signed manifest is authoritative for size at install time; the settings row may show the catalog
size before download.

## Owner inputs still required

1. **Approved production HTTPS base URL** for immutable, versioned pack paths.
2. **Production Ed25519 public key** (64 hex); private key stays in owner-controlled custody, never in
   the repo or app.
3. **Publication identity/custody process** for signing packs and rotating the anchor.
4. **Rights decision for `em_alex`** (written speaker/likeness evidence) before Spanish distribution.
5. **Sign-off to publish** the French pack at the approved location.

## Verification still blocked

A real staging host + signed French pack are required to record: metadata fetch → consent → HTTPS
download → signature verify → SHA-256 verify → install → activate → native registration → loaded-voice
confirmation → READY, plus negative paths (bad signature, modified payload, unknown key, network
failure, insufficient storage, cancellation, shutdown, retry). JVM fixture-transport tests and fake
registrars prove the wiring, **not** the real delivery path.
